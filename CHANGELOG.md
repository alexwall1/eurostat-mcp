# Changelog

## [1.1.0] - 2025-02-11

### Added
- **Streamable HTTP transport** as primary connection method
  - New `POST /mcp` endpoint for JSON-RPC 2.0 requests
  - Direct HTTP request/response pattern (no persistent connections)
  - Better compatibility with ChatGPT, Claude.ai, and most MCP clients
  - Eliminates "Expected text/event-stream, got application/json" errors

### Changed
- Server-Sent Events (SSE) transport is now **legacy mode**
  - Still fully supported for backward compatibility
  - Recommended only for clients that specifically require SSE
- Updated server metadata endpoint (`GET /mcp`) with transport details
- Enhanced documentation with transport selection guidance

### Technical Details

#### What Changed
The server previously only supported SSE transport (`GET /sse` + `POST /messages`), which requires:
1. Client opens persistent connection via `GET /sse`
2. Server streams events with `Content-Type: text/event-stream`
3. Client sends messages via `POST /messages?sessionId=...`

Many MCP clients (especially ChatGPT) prefer simpler HTTP transport:
1. Client sends JSON-RPC request via `POST /mcp`
2. Server responds immediately with JSON
3. No persistent connections or session management

#### New Architecture
```
┌─────────────────────────────────────────────────┐
│  Eurostat MCP Server                            │
├─────────────────────────────────────────────────┤
│  PRIMARY: POST /mcp → streamable HTTP           │
│  - Standard JSON-RPC 2.0                        │
│  - No session management                        │
│  - Immediate request/response                   │
├─────────────────────────────────────────────────┤
│  LEGACY: GET /sse → Server-Sent Events          │
│  - Persistent connection                        │
│  - Session-based messages                       │
│  - Backward compatible                          │
└─────────────────────────────────────────────────┘
```

#### Migration Guide

**If you're connecting from ChatGPT or similar clients:**
- Change URL from `https://your-server.com/sse` 
- To: `https://your-server.com/mcp`
- Change transport type from `sse` to `http` or `streamable-http`

**If you're connecting from Claude Desktop or Claude Code:**
- No changes needed (uses stdio locally)

**If you have custom MCP clients using SSE:**
- No changes needed - SSE endpoints still work
- Consider migrating to HTTP transport for simpler implementation

### Dependencies
- Added `@modelcontextprotocol/streamable-http: ^1.0.2`

## [1.0.0] - 2025-01-21

### Initial Release
- Server-Sent Events transport
- 5 tools for Eurostat data access
- Docker support
- Render.com deployment configuration
