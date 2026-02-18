/**
 * Eurostat API client for accessing statistical data and metadata.
 *
 * Supports:
 * - Statistics API (JSON-stat 2.0)
 * - SDMX 2.1 API (structure queries, dataflows)
 * - Catalogue API (table of contents)
 */

const BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination";
const STATISTICS_URL = `${BASE_URL}/statistics/1.0/data`;
const SDMX_URL = `${BASE_URL}/sdmx/2.1`;
const CATALOGUE_URL = `${BASE_URL}/catalogue`;

// Rate limiting: simple token bucket
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 350; // ~3 req/s to be kind to Eurostat

async function rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url, {
    ...options,
    headers: {
      "Accept-Encoding": "gzip, deflate",
      "User-Agent": "Eurostat-MCP/1.0",
      ...(options?.headers || {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Table of Contents / Dataset Search
// ---------------------------------------------------------------------------

export interface TocEntry {
  code: string;
  title: string;
  type: string;
  lastUpdate?: string;
  dataStart?: string;
  dataEnd?: string;
  values?: string;
}

let cachedToc: TocEntry[] | null = null;
let tocCachedAt = 0;
const TOC_CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Downloads and parses the Eurostat Table of Contents (TXT format).
 */
async function fetchToc(lang: string = "en"): Promise<TocEntry[]> {
  const now = Date.now();
  if (cachedToc && now - tocCachedAt < TOC_CACHE_DURATION_MS) {
    return cachedToc;
  }

  const url = `${CATALOGUE_URL}/toc/txt?lang=${lang}`;
  const res = await rateLimitedFetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch TOC: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const lines = text.split("\n");
  const entries: TocEntry[] = [];

  // TSV format: title\tcode\ttype\tlastUpdate\tlastTableStructChange\tdataStart\tdataEnd\tvalues\t...
  // First line is header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length >= 2) {
      entries.push({
        title: parts[0] || "",
        code: parts[1] || "",
        type: parts[2] || "",
        lastUpdate: parts[3] || undefined,
        dataStart: parts[5] || undefined,
        dataEnd: parts[6] || undefined,
        values: parts[7] || undefined,
      });
    }
  }

  cachedToc = entries;
  tocCachedAt = now;
  return entries;
}

/**
 * Search the Eurostat Table of Contents for datasets matching a query.
 */
export async function searchDatasets(
  query: string,
  lang: string = "en",
  limit: number = 20
): Promise<TocEntry[]> {
  const toc = await fetchToc(lang);
  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(/\s+/).filter(Boolean);

  const scored = toc
    .map((entry) => {
      const searchable = `${entry.title} ${entry.code}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (searchable.includes(term)) score++;
      }
      // Exact code match gets highest priority
      if (entry.code.toLowerCase() === lowerQuery) score += 100;
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => s.entry);
}

// ---------------------------------------------------------------------------
// Dataset Structure (SDMX 2.1 - Dataflow + DSD)
// ---------------------------------------------------------------------------

export interface DatasetDimension {
  id: string;
  name: string;
  values: { id: string; name: string }[];
}

export interface DatasetStructure {
  datasetCode: string;
  title: string;
  dimensions: DatasetDimension[];
}

/**
 * Get the structure (dimensions and their codes) for a given dataset.
 * Uses SDMX 2.1 dataflow with references=descendants to get DSD + codelists.
 */
export async function getDatasetStructure(
  datasetCode: string,
  lang: string = "en"
): Promise<DatasetStructure> {
  // First get the dataflow with references to resolve DSD + codelists
  const url = `${SDMX_URL}/dataflow/ESTAT/${datasetCode.toUpperCase()}/1.0?references=descendants&detail=referencepartial&compressed=false`;
  const res = await rateLimitedFetch(url, {
    headers: { Accept: "application/vnd.sdmx.structure+xml;version=2.1" },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch dataset structure for ${datasetCode}: ${res.status} ${res.statusText}`
    );
  }

  const xml = await res.text();

  // Parse title
  const titleMatch = xml.match(
    /<c:Name xml:lang="en">([^<]+)<\/c:Name>/
  );
  const title = titleMatch ? titleMatch[1] : datasetCode;

  // Parse dimensions from DSD
  const dimensions: DatasetDimension[] = [];
  const dimRegex =
    /<s:Dimension id="([^"]+)"[^>]*>[\s\S]*?<s:LocalRepresentation>[\s\S]*?<Ref[^>]*id="([^"]+)"[^>]*\/>/g;
  let dimMatch;
  const dimCodelistMap: Map<string, string> = new Map();

  while ((dimMatch = dimRegex.exec(xml)) !== null) {
    const dimId = dimMatch[1];
    const codelistId = dimMatch[2];
    dimCodelistMap.set(dimId, codelistId);
  }

  // Also try TimeDimension
  const timeDimRegex =
    /<s:TimeDimension id="([^"]+)"/;
  const timeDimMatch = timeDimRegex.exec(xml);

  // Parse codelists
  const codelistMap: Map<string, { id: string; name: string }[]> = new Map();
  const clRegex =
    /<s:Codelist id="([^"]+)"[^>]*>([\s\S]*?)<\/s:Codelist>/g;
  let clMatch;

  while ((clMatch = clRegex.exec(xml)) !== null) {
    const clId = clMatch[1];
    const clContent = clMatch[2];
    const codes: { id: string; name: string }[] = [];
    const codeRegex =
      /<s:Code id="([^"]+)"[^>]*>[\s\S]*?<c:Name xml:lang="en">([^<]+)<\/c:Name>/g;
    let codeMatch;
    while ((codeMatch = codeRegex.exec(clContent)) !== null) {
      codes.push({ id: codeMatch[1], name: codeMatch[2] });
    }
    codelistMap.set(clId, codes);
  }

  // Build dimensions with resolved values
  for (const [dimId, clId] of dimCodelistMap) {
    const values = codelistMap.get(clId) || [];
    // Get dimension name from concept scheme
    const conceptRegex = new RegExp(
      `<s:Concept id="${dimId}"[^>]*>[\\s\\S]*?<c:Name xml:lang="en">([^<]+)</c:Name>`,
      "i"
    );
    const conceptMatch = conceptRegex.exec(xml);
    dimensions.push({
      id: dimId,
      name: conceptMatch ? conceptMatch[1] : dimId,
      values: values.slice(0, 200), // Limit to 200 values for readability
    });
  }

  // Add TIME_PERIOD as a dimension marker
  if (timeDimMatch) {
    dimensions.push({
      id: timeDimMatch[1],
      name: "Time period",
      values: [
        { id: "hint", name: "Use sinceTimePeriod/untilTimePeriod or specific years like 2020, 2021" },
      ],
    });
  }

  return { datasetCode: datasetCode.toUpperCase(), title, dimensions };
}

// ---------------------------------------------------------------------------
// Data Retrieval (Statistics API - JSON-stat 2.0)
// ---------------------------------------------------------------------------

export interface EurostatDataResult {
  title: string;
  source: string;
  updated: string;
  dimensions: {
    id: string;
    label: string;
    categories: { id: string; label: string }[];
  }[];
  values: (number | null)[];
  formattedData: string;
}

/**
 * Fetch data from the Eurostat Statistics API in JSON-stat format.
 * @param datasetCode - The dataset code (e.g., "DEMO_R_D3DENS")
 * @param filters - Dimension filters as key-value pairs (e.g., { geo: "DE", time: "2022" })
 * @param lang - Language: "EN", "FR", or "DE"
 */
export async function getDatasetData(
  datasetCode: string,
  filters: Record<string, string | string[]> = {},
  lang: string = "EN"
): Promise<EurostatDataResult> {
  const params = new URLSearchParams();
  params.set("format", "JSON");
  params.set("lang", lang.toUpperCase());

  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(key, v);
      }
    } else {
      params.append(key, value);
    }
  }

  const url = `${STATISTICS_URL}/${datasetCode.toUpperCase()}?${params.toString()}`;
  const res = await rateLimitedFetch(url);

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    let errorMsg = `Eurostat API error ${res.status}`;
    try {
      const errorJson = JSON.parse(errorBody);
      if (errorJson.error?.label) errorMsg += `: ${errorJson.error.label}`;
      if (errorJson.warning?.label) errorMsg += `: ${errorJson.warning.label}`;
    } catch {
      if (errorBody) errorMsg += `: ${errorBody.substring(0, 500)}`;
    }
    throw new Error(errorMsg);
  }

  const json = await res.json();

  // Parse JSON-stat 2.0 response
  const title = json.label || datasetCode;
  const source = json.source || "Eurostat";
  const updated = json.updated || "";

  // Parse dimensions
  const dimIds: string[] = json.id || [];
  const dimSizes: number[] = json.size || [];
  const dimensionsData = json.dimension || {};

  const dimensions = dimIds.map((dimId: string, idx: number) => {
    const dim = dimensionsData[dimId] || {};
    const category = dim.category || {};
    const indexMap = category.index || {};
    const labelMap = category.label || {};

    const categories: { id: string; label: string }[] = [];
    const sortedEntries = Object.entries(indexMap).sort(
      (a, b) => (a[1] as number) - (b[1] as number)
    );
    for (const [catId] of sortedEntries) {
      categories.push({
        id: catId,
        label: labelMap[catId] || catId,
      });
    }

    return {
      id: dimId,
      label: dim.label || dimId,
      categories,
    };
  });

  // Parse values
  const rawValues = json.value || {};
  const totalSize = dimSizes.reduce((a: number, b: number) => a * b, 1);
  const values: (number | null)[] = [];
  for (let i = 0; i < totalSize; i++) {
    values.push(rawValues[String(i)] !== undefined ? rawValues[String(i)] : null);
  }

  // Format data as readable table (no truncation)
  const formatted = formatJsonStatData(dimensions, dimSizes, values);

  return {
    title,
    source,
    updated,
    dimensions,
    values,
    formattedData: formatted,
  };
}

/**
 * Format JSON-stat data as a human-readable table string.
 */
function formatJsonStatData(
  dimensions: { id: string; label: string; categories: { id: string; label: string }[] }[],
  sizes: number[],
  values: (number | null)[]
): string {
  if (dimensions.length === 0 || values.length === 0) {
    return "No data available.";
  }

  const lines: string[] = [];

  // Build header from dimension labels
  const header = dimensions.map((d) => d.label).join(" | ") + " | Value";
  lines.push(header);
  lines.push("-".repeat(header.length));

  // Iterate through all value positions (no truncation)
  for (let i = 0; i < values.length; i++) {
    if (values[i] === null) continue;

    // Calculate indices for each dimension
    const indices: number[] = [];
    let remainder = i;
    for (let d = dimensions.length - 1; d >= 0; d--) {
      indices.unshift(remainder % sizes[d]);
      remainder = Math.floor(remainder / sizes[d]);
    }

    const labels = indices.map((idx, d) => {
      const cat = dimensions[d].categories[idx];
      return cat ? cat.label : `[${idx}]`;
    });

    lines.push(`${labels.join(" | ")} | ${values[i]}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Dataset URL (Excel-compatible TSV download link)
// ---------------------------------------------------------------------------

/**
 * Build a direct download URL for a Eurostat dataset in TSV format.
 * The returned URL can be opened directly in Excel via Data → From Web.
 */
export function getDatasetUrl(
  datasetCode: string,
  filters: Record<string, string | string[]> = {},
  lang: string = "EN"
): string {
  const params = new URLSearchParams();
  params.set("format", "TSV");
  params.set("lang", lang.toUpperCase());

  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(key, v);
      }
    } else {
      params.append(key, value);
    }
  }

  return `${STATISTICS_URL}/${datasetCode.toUpperCase()}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Preview Data (limited fetch)
// ---------------------------------------------------------------------------

/**
 * Preview a small sample of data from a dataset by adding restrictive filters.
 * Useful for testing and understanding the dataset before larger queries.
 */
export async function previewData(
  datasetCode: string,
  lang: string = "EN"
): Promise<EurostatDataResult> {
  // Fetch with lastTimePeriod=1 to limit data
  return getDatasetData(datasetCode, { lastTimePeriod: "1" }, lang);
}

// ---------------------------------------------------------------------------
// Geo Code Resolution
// ---------------------------------------------------------------------------

interface GeoCode {
  code: string;
  name: string;
  level: string;
}

let cachedGeoCodes: GeoCode[] | null = null;
let geoCodesCachedAt = 0;

/**
 * Resolve a geographic name or code to Eurostat GEO codes.
 * Uses the GEO codelist from SDMX.
 */
export async function resolveGeoCode(query: string): Promise<GeoCode[]> {
  // Fetch GEO codelist if not cached
  const now = Date.now();
  if (!cachedGeoCodes || now - geoCodesCachedAt > TOC_CACHE_DURATION_MS) {
    const url = `${SDMX_URL}/codelist/ESTAT/GEO/latest?compressed=false`;
    const res = await rateLimitedFetch(url, {
      headers: { Accept: "application/vnd.sdmx.structure+xml;version=2.1" },
    });

    if (res.ok) {
      const xml = await res.text();
      const codes: GeoCode[] = [];
      const codeRegex =
        /<s:Code id="([^"]+)"[^>]*>[\s\S]*?<c:Name xml:lang="en">([^<]+)<\/c:Name>/g;
      let match;
      while ((match = codeRegex.exec(xml)) !== null) {
        const code = match[1];
        const name = match[2];
        let level = "other";
        if (code.length === 2) level = "country";
        else if (code.length === 3) level = "nuts1";
        else if (code.length === 4) level = "nuts2";
        else if (code.length === 5) level = "nuts3";
        else if (code.startsWith("EU") || code.startsWith("EA")) level = "aggregate";
        codes.push({ code, name, level });
      }
      cachedGeoCodes = codes;
      geoCodesCachedAt = now;
    } else {
      throw new Error(`Failed to fetch GEO codelist: ${res.status}`);
    }
  }

  const lowerQuery = query.toLowerCase();
  const results = cachedGeoCodes!.filter((gc) => {
    return (
      gc.code.toLowerCase() === lowerQuery ||
      gc.name.toLowerCase().includes(lowerQuery) ||
      fuzzyMatch(gc.name, query)
    );
  });

  return results.slice(0, 20);
}

/**
 * Simple fuzzy matching to handle accented characters.
 * "Osterreich" matches "Österreich", etc.
 */
function fuzzyMatch(text: string, query: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  return normalize(text).includes(normalize(query));
}
