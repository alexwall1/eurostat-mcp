# Migration Guide: SSE to HTTP Transport

## Problem Solved

**Previous error when connecting from ChatGPT:**
```
Expected response header Content-Type to contain 'text/event-stream', got 'application/json'
```

This occurred because the server only supported Server-Sent Events (SSE) transport, but ChatGPT and many other MCP clients prefer standard HTTP JSON-RPC.

## What Changed

### Before (v1.0.0)
- **Only SSE transport**: `GET /sse` + `POST /messages`
- Required persistent connection with `Content-Type: text/event-stream`
- Session management with `sessionId` parameters
- Not compatible with many MCP clients expecting simple HTTP

### After (v1.1.0)
- **Primary HTTP transport**: `POST /mcp` with JSON-RPC 2.0
- Standard request/response pattern
- No session management needed
- **Backward compatible**: SSE still works for legacy clients

## How to Migrate

### For ChatGPT Users

**Old configuration (doesn't work):**
```json
{
  "url": "https://eurostat-mcp.onrender.com/sse",
  "type": "sse"
}
```

**New configuration (works!):**
```json
{
  "url": "https://eurostat-mcp.onrender.com/mcp",
  "type": "http"
}
```

### For Claude.ai Users

Same change as ChatGPT:
- Change URL from `/sse` to `/mcp`
- Change type from `sse` to `http`

### For Claude Desktop / Claude Code Users

**No changes needed!** 
These use stdio transport locally, which is unaffected.

### For Custom MCP Client Developers

**If you were using SSE:**
```typescript
// Old way (still works)
const sseConnection = await fetch("https://server.com/sse");
// ... handle SSE stream
await fetch(`https://server.com/messages?sessionId=${id}`, {
  method: "POST",
  body: JSON.stringify(rpcMessage)
});
```

**New way (recommended):**
```typescript
// Simple HTTP POST with JSON-RPC
const response = await fetch("https://server.com/mcp", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/list",
    id: 1
  })
});
const result = await response.json();
```

## Technical Details

### Request Example (POST /mcp)

```json
POST /mcp HTTP/1.1
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

### Response Example

```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "search_datasets",
        "description": "Search the Eurostat database...",
        "inputSchema": { ... }
      }
    ]
  },
  "id": 1
}
```

## Verification

After migration, test your connection:

```bash
# Health check
curl https://eurostat-mcp.onrender.com/health

# Get server metadata
curl https://eurostat-mcp.onrender.com/mcp

# Test a tool call
curl -X POST https://eurostat-mcp.onrender.com/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

## Benefits of HTTP Transport

1. **Simpler implementation**: No persistent connections
2. **Better compatibility**: Works with more MCP clients
3. **Easier debugging**: Standard HTTP requests/responses
4. **No session management**: Each request is independent
5. **Load balancer friendly**: Stateless requests

## Need Help?

If you encounter issues:
1. Verify your URL ends with `/mcp` not `/sse`
2. Check that you're using `POST` method
3. Ensure `Content-Type: application/json` header
4. Test with the curl commands above

The SSE transport is still available if needed for backward compatibility.
