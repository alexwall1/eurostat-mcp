import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import {
  searchDatasets,
  getDatasetStructure,
  getDatasetData,
  getDatasetUrl,
  previewData,
  resolveGeoCode,
} from "./eurostat-api.js";

// ---------------------------------------------------------------------------
// MCP Server definition
// ---------------------------------------------------------------------------

function createServer(): McpServer {
  const server = new McpServer({
    name: "eurostat-mcp",
    version: "1.0.0",
    description:
      "Access Eurostat's comprehensive European statistics database. Search datasets, explore dataset structures, fetch statistical data, and resolve geographic codes. Covers economy, population, environment, trade, and more across all EU member states.",
  });

  // ── Tool: search_datasets ────────────────────────────────────────────────
  server.tool(
    "search_datasets",
    "Search the Eurostat database for datasets matching a keyword or topic. Returns dataset codes, titles, types, and metadata. Use this tool first to discover relevant datasets before fetching their data.",
    {
      query: z
        .string()
        .min(2)
        .describe(
          "Search query — keywords describing the topic (e.g., 'GDP', 'population', 'unemployment', 'energy', 'CO2 emissions')"
        ),
      lang: z
        .enum(["en", "fr", "de"])
        .default("en")
        .describe("Language for dataset titles: 'en' (default), 'fr', or 'de'"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of results (default: 20)"),
    },
    async ({ query, lang, limit }) => {
      try {
        const results = await searchDatasets(query, lang, limit);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No datasets found for query "${query}". Try broader terms or different keywords. Common topics: population, GDP, employment, energy, trade, environment, transport, education, health.`,
              },
            ],
          };
        }

        const formatted = results
          .map(
            (r, i) =>
              `${i + 1}. **${r.code}** — ${r.title}\n   Type: ${r.type} | Last updated: ${r.lastUpdate || "N/A"} | Data: ${r.dataStart || "?"} – ${r.dataEnd || "?"} | Values: ${r.values || "N/A"}`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${results.length} dataset(s) matching "${query}":\n\n${formatted}\n\n💡 **Next steps**: Use \`get_dataset_structure\` with a dataset code to explore its dimensions, then \`get_dataset_data\` to fetch the actual data.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching datasets: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── Tool: get_dataset_structure ──────────────────────────────────────────
  server.tool(
    "get_dataset_structure",
    "Get the structure (dimensions, codes, and labels) of a specific Eurostat dataset. Returns dimension names and their possible values/codes. Essential before fetching data — you need to know the dimension codes to build proper filters.",
    {
      datasetCode: z
        .string()
        .min(2)
        .describe(
          "Eurostat dataset code (e.g., 'NAMA_10_GDP', 'DEMO_R_D3DENS', 'UNE_RT_M'). Use search_datasets to find codes."
        ),
    },
    async ({ datasetCode }) => {
      try {
        const structure = await getDatasetStructure(datasetCode);

        const dimDetails = structure.dimensions
          .map((d) => {
            const sampleValues = d.values
              .slice(0, 30)
              .map((v) => `${v.id} (${v.name})`)
              .join(", ");
            const more = d.values.length > 30 ? ` ... and ${d.values.length - 30} more` : "";
            return `**${d.id}** — ${d.name}\n   Values (${d.values.length}): ${sampleValues}${more}`;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `## Dataset: ${structure.title} (${structure.datasetCode})\n\n### Dimensions:\n\n${dimDetails}\n\n💡 **Usage**: Call \`get_dataset_data\` with filters like: \`{ "geo": "DE", "time": "2022" }\`.\nFor time ranges, use \`sinceTimePeriod\` or \`untilTimePeriod\` instead of \`time\`.\nFor geographic levels, use \`geoLevel\` = aggregate/country/nuts1/nuts2/nuts3.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching dataset structure: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── Tool: get_dataset_data ───────────────────────────────────────────────
  server.tool(
    "get_dataset_data",
    "Fetch statistical data from a Eurostat dataset with optional dimension filters. Returns data in a human-readable table format. Always use filters to limit data size — unfiltered requests on large datasets will fail or be very slow.",
    {
      datasetCode: z
        .string()
        .min(2)
        .describe(
          "Eurostat dataset code (e.g., 'NAMA_10_GDP'). Use search_datasets to find codes."
        ),
      filters: z
        .record(z.string(), z.union([z.string(), z.array(z.string())]))
        .default({})
        .describe(
          "Dimension filters as key-value pairs. Keys are dimension codes (e.g., 'geo', 'unit', 'na_item', 'time'). Values can be a single code or an array. Special time filters: 'sinceTimePeriod', 'untilTimePeriod', 'lastTimePeriod'. Geographic: 'geoLevel' = aggregate|country|nuts1|nuts2|nuts3. Example: { \"geo\": \"DE\", \"unit\": \"CP_MEUR\", \"sinceTimePeriod\": \"2018\" }"
        ),
      lang: z
        .enum(["EN", "FR", "DE"])
        .default("EN")
        .describe("Language for labels: 'EN' (default), 'FR', or 'DE'"),
    },
    async ({ datasetCode, filters, lang }) => {
      try {
        const result = await getDatasetData(datasetCode, filters, lang);

        const dimSummary = result.dimensions
          .map(
            (d) =>
              `${d.label}: ${d.categories.map((c) => c.label).join(", ")}`
          )
          .join("\n");

        const nonNullCount = result.values.filter((v) => v !== null).length;

        return {
          content: [
            {
              type: "text" as const,
              text: `## ${result.title}\n\nSource: ${result.source} | Last updated: ${result.updated}\nData points: ${nonNullCount} non-null values\n\n### Dimensions used:\n${dimSummary}\n\n### Data:\n\`\`\`\n${result.formattedData}\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching data: ${error instanceof Error ? error.message : String(error)}\n\n💡 **Tips**:\n- Use \`get_dataset_structure\` first to check valid dimension codes\n- Add filters to reduce data size (e.g., geo, time)\n- Use \`lastTimePeriod=5\` to get just the last 5 time periods\n- Use \`preview_data\` to quickly test a dataset`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── Tool: preview_data ───────────────────────────────────────────────────
  server.tool(
    "preview_data",
    "Quickly preview a dataset by fetching only the most recent time period. Useful for understanding a dataset's structure and values before building a more specific query.",
    {
      datasetCode: z
        .string()
        .min(2)
        .describe("Eurostat dataset code (e.g., 'NAMA_10_GDP')"),
      lang: z
        .enum(["EN", "FR", "DE"])
        .default("EN")
        .describe("Language for labels"),
    },
    async ({ datasetCode, lang }) => {
      try {
        const result = await previewData(datasetCode, lang);

        return {
          content: [
            {
              type: "text" as const,
              text: `## Preview: ${result.title}\n\nSource: ${result.source} | Updated: ${result.updated}\n\n### Dimensions:\n${result.dimensions.map((d) => `- **${d.id}** (${d.label}): ${d.categories.length} categories`).join("\n")}\n\n### Sample data (latest period):\n\`\`\`\n${result.formattedData}\n\`\`\`\n\n💡 Use \`get_dataset_data\` with specific filters for targeted queries.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error previewing data: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── Tool: find_geo_code ──────────────────────────────────────────────────
  server.tool(
    "find_geo_code",
    "Resolve a country or region name to its Eurostat GEO code. Supports fuzzy matching (e.g., 'Osterreich' → 'AT'). Returns code, name, and NUTS level. Useful when you know a place name but need the code for data queries.",
    {
      query: z
        .string()
        .min(1)
        .describe(
          "Country or region name to search for (e.g., 'Germany', 'DE', 'Bayern', 'EU27'). Supports partial matches and fuzzy matching for accented characters."
        ),
    },
    async ({ query }) => {
      try {
        const results = await resolveGeoCode(query);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No geographic codes found for "${query}". Try a different spelling or use the English name. Common codes: DE (Germany), FR (France), EU27_2020 (EU), EA20 (Euro Area).`,
              },
            ],
          };
        }

        const formatted = results
          .map(
            (r) => `**${r.code}** — ${r.name} (${r.level})`
          )
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Geographic codes matching "${query}":\n\n${formatted}\n\n💡 Use these codes in the \`geo\` filter when calling \`get_dataset_data\`.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error resolving geo code: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── Tool: get_dataset_url ────────────────────────────────────────────────
  server.tool(
    "get_dataset_url",
    "Generate a direct download URL for a Eurostat dataset in TSV format (tab-separated values). The URL can be opened directly in Excel via Data → From Web, or downloaded as a file. Accepts the same dataset code and filters as get_dataset_data.",
    {
      datasetCode: z
        .string()
        .min(2)
        .describe(
          "Eurostat dataset code (e.g., 'NAMA_10_GDP'). Use search_datasets to find codes."
        ),
      filters: z
        .record(z.string(), z.union([z.string(), z.array(z.string())]))
        .default({})
        .describe(
          "Dimension filters as key-value pairs. Keys are dimension codes (e.g., 'geo', 'unit', 'na_item', 'time'). Values can be a single code or an array. Special time filters: 'sinceTimePeriod', 'untilTimePeriod', 'lastTimePeriod'. Geographic: 'geoLevel' = aggregate|country|nuts1|nuts2|nuts3. Example: { \"geo\": \"DE\", \"unit\": \"CP_MEUR\", \"sinceTimePeriod\": \"2018\" }"
        ),
      lang: z
        .enum(["EN", "FR", "DE"])
        .default("EN")
        .describe("Language for labels: 'EN' (default), 'FR', or 'DE'"),
    },
    async ({ datasetCode, filters, lang }) => {
      try {
        const url = getDatasetUrl(datasetCode, filters, lang);
        return {
          content: [
            {
              type: "text" as const,
              text: `## Download URL for ${datasetCode.toUpperCase()} (TSV)\n\n${url}\n\n💡 **How to open in Excel**: Go to **Data → Get Data → From Web**, paste the URL above, and click OK. Excel will import the tab-separated data directly.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error generating dataset URL: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Transport: SSE (for remote hosting) or stdio (for local use)
// ---------------------------------------------------------------------------

async function main() {
  const port = parseInt(process.env.PORT || "3000", 10);
  const useStdio = process.argv.includes("--stdio");

  if (useStdio) {
    // stdio mode for local MCP clients (Claude Desktop, Claude Code, etc.)
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Eurostat MCP server running on stdio");
  } else {
    // HTTP mode for remote hosting (Render, etc.)
    // Supports both direct HTTP JSON-RPC (POST /mcp) and SSE (GET /sse) transports
    const app = express();

    // CORS — allow all origins
    app.use((_req: Request, res: Response, next: Function) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
      res.header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, Mcp-Session-Id");
      if (_req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      next();
    });

    app.use(express.json());

    // Health check
    app.get("/health", (_req: Request, res: Response) => {
      res.json({
        status: "ok",
        server: "eurostat-mcp",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // PRIMARY TRANSPORT: Direct HTTP JSON-RPC (POST /mcp)
    // ────────────────────────────────────────────────────────────────────────
    // This is the recommended transport for ChatGPT, Claude.ai, and most MCP clients
    // It handles standard HTTP requests/responses with JSON-RPC 2.0
    
    app.post("/mcp", async (req: Request, res: Response) => {
      try {
        console.log("HTTP JSON-RPC request received");
        const server = createServer();
        
        // Create a simple transport that captures responses
        let responseData: JSONRPCMessage | null = null;
        
        const simpleTransport = {
          start: async () => {},
          close: async () => {},
          send: async (message: JSONRPCMessage) => {
            responseData = message;
          },
        };
        
        // Connect the server with our simple transport
        await server.connect(simpleTransport as any);
        
        // Handle the incoming JSON-RPC message
        const message = req.body as JSONRPCMessage;
        
        // Process the message through the server
        await (server as any).handleMessage(message);
        
        // Wait a bit for async processing
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Send the response
        if (responseData) {
          res.json(responseData);
        } else {
          const messageId = "id" in message ? message.id : null;
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "No response generated",
            },
            id: messageId,
          });
        }
      } catch (error) {
        console.error("Error handling HTTP JSON-RPC request:", error);
        const messageId = req.body && "id" in req.body ? req.body.id : null;
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error",
            data: error instanceof Error ? error.message : String(error),
          },
          id: messageId,
        });
      }
    });

    // ────────────────────────────────────────────────────────────────────────
    // LEGACY TRANSPORT: SSE (GET /sse + POST /messages)
    // ────────────────────────────────────────────────────────────────────────
    // Kept for backward compatibility with older MCP clients
    
    const transports: { [sessionId: string]: SSEServerTransport } = {};

    // SSE endpoint — client connects here to open the event stream
    app.get("/sse", async (_req: Request, res: Response) => {
      console.log("New SSE connection");
      const server = createServer();
      const transport = new SSEServerTransport("/messages", res);
      transports[transport.sessionId] = transport;

      res.on("close", () => {
        console.log(`SSE connection closed: ${transport.sessionId}`);
        delete transports[transport.sessionId];
      });

      await server.connect(transport);
    });

    // Messages endpoint — client POSTs JSON-RPC messages here
    app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      const transport = transports[sessionId];
      if (!transport) {
        res.status(400).json({ error: "Invalid or expired session. Connect via /sse first." });
        return;
      }
      await transport.handlePostMessage(req, res, req.body);
    });

    // ────────────────────────────────────────────────────────────────────────
    // METADATA & DISCOVERY ENDPOINTS
    // ────────────────────────────────────────────────────────────────────────

    // MCP metadata endpoint — provides server info for discovery
    app.get("/mcp", (_req: Request, res: Response) => {
      res.json({
        protocol: "mcp",
        version: "1.0.0",
        name: "Eurostat Statistics Server",
        description:
          "European statistics data via MCP protocol — economy, population, environment, trade, and more across all EU member states.",
        authentication: "none",
        transports: {
          http: {
            method: "POST",
            endpoint: "/mcp",
            contentType: "application/json",
            format: "MCP JSON-RPC 2.0",
          },
          sse: {
            method: "GET",
            endpoint: "/sse",
            messagesEndpoint: "/messages",
            format: "Server-Sent Events",
          },
        },
        capabilities: {
          tools: true,
          resources: false,
          prompts: false,
        },
        tools: 6,
        resources: 0,
        prompts: 0,
        compatibility: {
          platforms: ["web", "desktop", "cli"],
          clients: [
            "Claude Code",
            "Claude Desktop",
            "ChatGPT",
            "Gemini",
            "Custom MCP clients",
          ],
        },
      });
    });

    // Root page
    app.get("/", (_req: Request, res: Response) => {
      res.json({
        name: "Eurostat MCP Server",
        version: "1.0.0",
        description:
          "MCP server providing access to Eurostat's European statistical database.",
        endpoints: {
          mcp: "/mcp (POST for JSON-RPC, GET for metadata)",
          sse: "/sse",
          messages: "/messages",
          health: "/health",
        },
        usage: {
          recommended: "POST to /mcp with JSON-RPC 2.0 requests",
          legacy: "GET /sse for Server-Sent Events transport",
        },
        documentation:
          "https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access",
      });
    });

    app.listen(port, () => {
      console.log(`Eurostat MCP server listening on port ${port}`);
      console.log(`  Health:     http://localhost:${port}/health`);
      console.log(`  MCP (HTTP): POST http://localhost:${port}/mcp`);
      console.log(`  MCP (info): GET  http://localhost:${port}/mcp`);
      console.log(`  SSE:        http://localhost:${port}/sse`);
      console.log(`  Messages:   http://localhost:${port}/messages`);
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
