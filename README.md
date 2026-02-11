# 📊 Eurostat MCP Server

[![MCP Protocol](https://img.shields.io/badge/MCP-2025--03--26-green)](https://modelcontextprotocol.io/)

An MCP server that enables LLMs and AI chatbots to search, explore, and retrieve official statistical data from **Eurostat** — the statistical office of the European Union.

Covers **thousands of datasets** spanning economy & finance, population & demographics, environment, trade, transport, energy, education, health, and more across all EU member states.

---

## Overview

The Eurostat MCP server provides seamless integration with Eurostat's public APIs, enabling LLMs to access:

- **Economy & Finance**: GDP, inflation, government debt, national accounts, business statistics
- **Population & Demographics**: Population size, births, deaths, migration, life expectancy
- **Environment**: Greenhouse gas emissions, waste management, energy consumption, renewables
- **Labour Market**: Employment, unemployment rates, wages, working conditions
- **Trade**: Imports, exports, balance of payments, international trade in goods and services
- **Transport**: Passenger and freight transport, road safety
- **Education**: Student statistics, education spending, lifelong learning
- **Health**: Healthcare expenditure, causes of death, hospital resources

Data ranges from the 1950s to the present, with regular monthly, quarterly, and annual updates.

---

## Key Features

| Feature | Description |
|---|---|
| **Comprehensive Access** | Thousands of datasets covering all EU statistical domains |
| **Smart Search** | Full-text search across the Eurostat Table of Contents |
| **Structure Discovery** | Explore dataset dimensions, codes, and labels before querying |
| **Flexible Filtering** | Filter by geography, time, unit, and any dataset-specific dimension |
| **Geo Code Resolution** | Fuzzy matching for country/region names ("Osterreich" → AT) |
| **Preview Mode** | Quick-preview datasets before committing to large queries |
| **Rate-Limited** | Built-in rate limiting to respect Eurostat's API |
| **Multi-Language** | Labels in English, French, or German |

---

## 🚀 Quick Start

### Option 1: Remote URL (no installation)

Use the hosted server directly — works with all MCP-compatible clients.

The server now supports **two transport modes**:

#### **Recommended: Streamable HTTP (POST /mcp)**
Best compatibility with ChatGPT, Claude.ai, and most MCP clients:

```json
{
  "mcpServers": {
    "eurostat": {
      "type": "http",
      "url": "https://eurostat-mcp.onrender.com/mcp"
    }
  }
}
```

#### **Legacy: Server-Sent Events (GET /sse)**
For older MCP clients that require SSE:

```json
{
  "mcpServers": {
    "eurostat": {
      "type": "sse",
      "url": "https://eurostat-mcp.onrender.com/sse"
    }
  }
}
```

| Client | Recommended URL | Transport |
|---|---|---|
| **ChatGPT** | `https://eurostat-mcp.onrender.com/mcp` | HTTP (POST) |
| **Claude.ai** | `https://eurostat-mcp.onrender.com/mcp` | HTTP (POST) |
| **Claude Desktop** | Use stdio (see Option 2) | stdio |
| **Claude Code** | Use stdio (see Option 2) | stdio |
| **Custom clients** | `https://eurostat-mcp.onrender.com/mcp` | HTTP (POST) |

**No authentication required.** CORS is enabled for all origins.

---

### Option 2: Local Installation (Node.js)

For Claude Code, terminal clients, or self-hosting:

```bash
git clone https://github.com/your-username/eurostat-mcp.git
cd eurostat-mcp
npm install
npm run build
```

#### Claude Code (CLI)

```bash
claude mcp add eurostat-mcp -- node /path/to/eurostat-mcp/dist/index.js --stdio
```

#### MCP Configuration (stdio)

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "eurostat": {
      "command": "node",
      "args": ["/path/to/eurostat-mcp/dist/index.js", "--stdio"],
      "type": "stdio"
    }
  }
}
```

#### Run your own HTTP server

```bash
npm run start        # Starts on port 3000
# or
PORT=8080 npm run start
```

---

### Option 3: Docker

```bash
docker build -t eurostat-mcp .
docker run -p 3000:3000 eurostat-mcp
```

---

## Tools

### 1. `search_datasets`

Search the Eurostat database for datasets by keyword.

```
search_datasets(query: "GDP", lang: "en", limit: 10)
```

### 2. `get_dataset_structure`

Get the dimensions and possible values/codes for a dataset.

```
get_dataset_structure(datasetCode: "NAMA_10_GDP")
```

### 3. `get_dataset_data`

Fetch data with optional filters for any dimension.

```
get_dataset_data(
  datasetCode: "NAMA_10_GDP",
  filters: {
    "geo": "DE",
    "unit": "CP_MEUR",
    "na_item": "B1GQ",
    "sinceTimePeriod": "2018"
  }
)
```

### 4. `preview_data`

Quick preview — fetches only the latest time period.

```
preview_data(datasetCode: "NAMA_10_GDP")
```

### 5. `find_geo_code`

Resolve a country/region name to its Eurostat code.

```
find_geo_code(query: "Germany")
// Returns: DE — Germany (country)

find_geo_code(query: "Bayern")
// Returns: DE2 — Bayern (nuts1)
```

---

## Best Practices

| Issue | Solution |
|---|---|
| **Large dataset?** | Always use `preview_data` first to test |
| **Too much data?** | Use `lastTimePeriod=5` or `sinceTimePeriod`/`untilTimePeriod` |
| **Wrong codes?** | Call `get_dataset_structure` first — codes vary between datasets |
| **Don't know the dataset code?** | Use `search_datasets` with keywords |
| **Unsure about country code?** | Use `find_geo_code` with the country name |
| **Unsure about units?** | Check dimension values in `get_dataset_structure` |

---

## Examples

### GDP of Germany and France (2018–2023)

```
1. search_datasets(query: "GDP main components")
   → finds NAMA_10_GDP

2. get_dataset_structure(datasetCode: "NAMA_10_GDP")
   → reveals dimensions: freq, unit, na_item, geo, TIME_PERIOD

3. get_dataset_data(
     datasetCode: "NAMA_10_GDP",
     filters: {
       "geo": ["DE", "FR"],
       "unit": "CP_MEUR",
       "na_item": "B1GQ",
       "sinceTimePeriod": "2018",
       "untilTimePeriod": "2023"
     }
   )
```

### Unemployment rate in the EU

```
1. search_datasets(query: "unemployment rate monthly")
   → finds UNE_RT_M

2. get_dataset_data(
     datasetCode: "UNE_RT_M",
     filters: {
       "geo": "EU27_2020",
       "s_adj": "SA",
       "age": "TOTAL",
       "unit": "PC_ACT",
       "sex": "T",
       "lastTimePeriod": "12"
     }
   )
```

---

## Deployment on Render

This project includes a `render.yaml` for one-click deployment:

1. Push this repository to GitHub
2. Connect your GitHub repo to [Render](https://render.com)
3. Render will automatically detect `render.yaml` and deploy
4. Your MCP server will be available at:
   - **HTTP transport (recommended)**: `https://your-service.onrender.com/mcp`
   - **SSE transport (legacy)**: `https://your-service.onrender.com/sse`

### Available Endpoints

Once deployed, your server exposes:

| Endpoint | Method | Purpose |
|---|---|---|
| `/mcp` | POST | **Primary transport** - JSON-RPC 2.0 requests (recommended for ChatGPT, Claude.ai) |
| `/mcp` | GET | Server metadata and capabilities |
| `/sse` | GET | Legacy SSE transport (persistent connection) |
| `/messages` | POST | Legacy SSE message endpoint |
| `/health` | GET | Health check |
| `/` | GET | Server information |

### Connecting from ChatGPT

1. Go to ChatGPT Settings → Beta Features → Enable "Actions"
2. Add a new MCP server with URL: `https://your-service.onrender.com/mcp`
3. The server will auto-discover tools and capabilities

---

## API Reference

This server uses the following Eurostat APIs:

- **Statistics API** (JSON-stat 2.0) — for data retrieval
- **SDMX 2.1 API** — for dataset structure and metadata
- **Catalogue API** — for dataset discovery (Table of Contents)

For more information: [Eurostat API Documentation](https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access)

---

## Resources

- **Eurostat Database**: https://ec.europa.eu/eurostat/web/main/data/database
- **Data Browser**: https://ec.europa.eu/eurostat/databrowser/
- **API Documentation**: https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access
- **MCP Protocol**: https://modelcontextprotocol.io/

---
## Acknowledgement

Author Alexander Wall wall.alexander@gmail.com


## License

GNU General Public License v3.0
