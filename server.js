// server.js (Definitive, Working Version)
const express = require("express");
const app = express();
const port = 3201;

app.use(express.json());

const consoleLogsStore = {};

// Normalization function
const normalizeUrl = (urlString) => {
    if (urlString && urlString.endsWith('/')) {
        return urlString.slice(0, -1);
    }
    return urlString;
};

// Put this just under normalizeUrl()
const parseKeys = (urlString) => {
  try {
    const u = new URL(urlString);
    const path = u.pathname.replace(/\/$/, '');
    return { full: `${u.origin}${path}`, origin: u.origin };
  } catch {
    const n = normalizeUrl(urlString);
    return { full: n, origin: n };
  }
};

// Replace your entire /report route with this:
app.post("/report", (req, res) => {
  const { url, method, args } = req.body || {};
  if (!url) return res.status(400).send("Missing url");

  const safeStringify = (v) => {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch { return String(v); }
  };

  const logString = `[${String(method || 'log').toUpperCase()}] ${
    Array.isArray(args) ? args.map(safeStringify).join(' ') : safeStringify(args)
  }`;

  const { full, origin } = parseKeys(url);

  if (!consoleLogsStore[full])   consoleLogsStore[full] = [];
  if (!consoleLogsStore[origin]) consoleLogsStore[origin] = [];

  consoleLogsStore[full].push(logString);
  consoleLogsStore[origin].push(logString);

  console.log(`[SERVER] Stored log for ${full}: ${logString}`);
  res.sendStatus(200);
});


// === MCP ROUTER ===
const mcpRouter = express.Router();

mcpRouter.post("/", (req, res) => {
    const { jsonrpc, method, id, params } = req.body;

    if (jsonrpc !== "2.0") {
        return res.status(400).json({ jsonrpc: "2.0", id: id, error: { code: -32600, message: "Invalid Request" } });
    }

    switch (method) {
        case "initialize":
            res.json({
                jsonrpc: "2.0",
                id: id,
                result: {
                    protocolVersion: "2025-06-18",
                    serverInfo: {
                        name: "live_browser_console_reader",
                        version: "1.0",
                        description: "A server for the live browser console reader extension."
                    },
                    capabilities: { prompts: { enabled: true }, tools: { enabled: true }, resources: { enabled: false } }
                }
            });
            break;
        case "notifications/initialized":
            res.sendStatus(204);
            break;
        case "prompts/list":
            res.json({ jsonrpc: "2.0", id: id, result: { prompts: [] } });
            break;
        case "tools/list":
            res.json({
                jsonrpc: "2.0",
                id: id,
                result: {
                    tools: [{
                        name: "readActiveConsole",
                        description: "Retrieves recently captured console output from a specific URL.",
                        inputSchema: {
                            type: "object",
                            properties: { url: { type: "string", description: "The full URL." } },
                            required: ["url"]
                        }
                    }]
                }
            });
            break;
case "tools/call": {
  const toolName = params.name;
  const args = params.arguments;

  if (toolName === "readActiveConsole") {
    const { full, origin } = parseKeys(args.url);

    const pick = (key) =>
      (consoleLogsStore[key] && consoleLogsStore[key].length)
        ? consoleLogsStore[key]
        : null;

    const logs = pick(full) || pick(origin) || [];

    const result = logs.length
      ? logs.join("\n")
      : `No console logs have been captured for ${args.url}. Make sure you have visited the page.`;

    // clear both buckets so subsequent calls only return new lines
    if (consoleLogsStore[full])   consoleLogsStore[full] = [];
    if (consoleLogsStore[origin]) consoleLogsStore[origin] = [];

    res.json({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: result }] }
    });
  } else {
    res.status(404).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" }
    });
  }
  break;
}

        default:
            res.status(404).json({ jsonrpc: "2.0", id: id, error: { code: -32601, message: "Method not found" } });
            break;
    }
});

app.use("/mcp", mcpRouter);

app.listen(port, () => {
    console.log(`MCP Server is running on http://localhost:${port}`);
});