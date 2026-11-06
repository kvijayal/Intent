#!/usr/bin/env node
// Intent2Code custom MCP server.
// Default: stdio (JSON-RPC on stdin/stdout).
// HTTP mode: node index.js --http [--port=3999]  →  POST http://localhost:<port>/mcp
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { allTools } from "./tools/index.js";
import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
// Server version = mcp-server/package.json (synced from stack.json plugin.version by stack.mjs release)
const PKG_VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

function buildMcpServer() {
  const srv = new Server(
    { name: "intent2code", version: PKG_VERSION },
    { capabilities: { tools: {} } }
  );
  const byName = new Map(allTools.map((t) => [t.name, t]));
  srv.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
  }));
  srv.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName.get(req.params.name);
    if (!tool) return { content: [{ type: "text", text: "Unknown tool: " + req.params.name }], isError: true };
    try {
      return await tool.handler(req.params.arguments || {});
    } catch (e) {
      return { content: [{ type: "text", text: "Tool " + tool.name + " failed: " + (e?.stack || e) }], isError: true };
    }
  });
  return srv;
}

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const portFlag = args.find(a => a.startsWith("--port="));
const portIdx  = args.indexOf("--port");
const port = portFlag              ? parseInt(portFlag.split("=")[1], 10)
           : portIdx !== -1        ? parseInt(args[portIdx + 1], 10)
           : 3999;
const isHttp = args.includes("--http") || !!portFlag || portIdx !== -1;

// ── HTTP / Streamable-HTTP mode ──────────────────────────────────────────────
if (isHttp) {
  const sessions = new Map(); // sessionId → StreamableHTTPServerTransport

  // DNS-rebinding guard (MCP spec, Streamable HTTP "Security Warning"): the server listens on
  // 127.0.0.1 only, but a web page can still reach it through a rebound host name. Every request
  // must name this machine's own port in Host, and a browser Origin — if sent — must be local too.
  // No CORS headers are sent: MCP clients are not browsers, so cross-origin reads stay blocked.
  const allowedHosts = ["localhost:" + port, "127.0.0.1:" + port, "[::1]:" + port];
  const allowedOrigins = allowedHosts.map((h) => "http://" + h);
  const httpServer = createHttpServer(async (req, res) => {
    const host = String(req.headers.host || "").toLowerCase();
    const origin = req.headers.origin ? String(req.headers.origin).toLowerCase() : null;
    if (!allowedHosts.includes(host) || (origin !== null && !allowedOrigins.includes(origin))) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: intent2code MCP accepts local clients only");
      return;
    }
    const pathname = new URL(req.url || "/", "http://localhost:" + port).pathname;

    // Health / root
    if (pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("intent2code MCP — " + allTools.length + " tools — POST to /mcp");
      return;
    }

    if (pathname !== "/mcp") {
      res.writeHead(404); res.end("Not found"); return;
    }

    if (req.method === "OPTIONS") { res.writeHead(405); res.end(); return; }   // no CORS pre-flight support on purpose

    // Read body for POST
    let body;
    if (req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      try { if (raw) body = JSON.parse(raw); } catch {}
    }

    const sessionId = req.headers["mcp-session-id"];

    if (req.method === "POST" && !sessionId) {
      // New session — must be initialize
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableDnsRebindingProtection: true,   // second layer: the SDK re-checks Host / Origin
        allowedHosts,
        allowedOrigins
      });
      const srv = buildMcpServer();
      await srv.connect(transport);
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
        srv.close();
      };
      await transport.handleRequest(req, res, body);
      if (transport.sessionId) sessions.set(transport.sessionId, transport);

    } else if (sessionId) {
      const transport = sessions.get(sessionId);
      if (!transport) { res.writeHead(404); res.end("Session not found"); return; }
      await transport.handleRequest(req, res, body);
      if (req.method === "DELETE") sessions.delete(sessionId);

    } else if (req.method === "GET") {
      // Standalone SSE stream (no session) — client probing for server-push capability.
      // This server has no server-initiated notifications; hold the connection open with
      // a keepalive ping so the client doesn't treat it as an error.
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      res.write(":ok\n\n");
      const ping = setInterval(() => { if (!res.writableEnded) res.write(":ping\n\n"); }, 25000);
      req.on("close", () => { clearInterval(ping); if (!res.writableEnded) res.end(); });

    } else {
      res.writeHead(400); res.end("Bad request");
    }
  });

  httpServer.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error("[intent2code] Port " + port + " already in use — server is already running.");
      process.exit(0); // clean exit; existing instance is serving
    } else {
      console.error("[intent2code] HTTP server error: mcp-server/index.js: " + (err?.message || err));
      process.exit(1);
    }
  });

  httpServer.listen(port, "127.0.0.1", () => {
    console.error("[intent2code] HTTP MCP server ready — http://localhost:" + port + "/mcp — " + allTools.length + " tools");
  });

// ── stdio mode (default) ────────────────────────────────────────────────────
} else {
  const srv = buildMcpServer();
  const transport = new StdioServerTransport();
  await srv.connect(transport);
  // stdout is reserved for JSON-RPC; log to stderr only.
  console.error("[intent2code] MCP server ready — " + allTools.length + " tools: " + allTools.map((t) => t.name).join(", "));
}
