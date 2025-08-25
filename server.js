// server.js (Definitive, Working Version)
const express = require("express");
const app = express();
const port = 3201;


app.use(express.json({ limit: "50mb" }));

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
    // Add protocol if it's missing
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
        urlString = `http://${urlString}`;
    }
    const u = new URL(urlString);
    const path = u.pathname.replace(/\/$/, '');
    return { full: `${u.origin}${path}`, origin: u.origin };
  } catch (e) {
    console.error(`Failed to parse URL: ${urlString}`, e);
    const n = normalizeUrl(urlString);
    return { full: n, origin: n };
  }
};

// Replace your entire /report route with this:
const safeStringify = (v) => {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

// server.js (replace the app.post("/report") block)
app.post("/report", (req, res) => {
  const { url, method, args } = req.body || {};
  if (!url) return res.status(400).send("Missing url");

  const logString = Array.isArray(args) ? args.map(safeStringify).join(' ') : safeStringify(args);
  const finalLogString = `[${String(method || 'log').toUpperCase()}] ${logString}`;

  const { full, origin } = parseKeys(url);

  if (!consoleLogsStore[full]) consoleLogsStore[full] = [];
  if (!consoleLogsStore[origin]) consoleLogsStore[origin] = [];

  consoleLogsStore[full].push(finalLogString);
  consoleLogsStore[origin].push(finalLogString);

  console.log(`[SERVER] Stored log for ${full}: ${finalLogString}`);
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
            }, {
                name: "readErrorsOnly",
                description: "Retrieves only console errors and warnings from a specific URL.",
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
    const { url } = args;

    // A more flexible approach: iterate through all keys to find a match
    const matchingLogs = [];
    const normalizedTargetOrigin = url.startsWith('http') ? new URL(url).origin : `http://${url}`;

    for (const key in consoleLogsStore) {
        if (key.includes(normalizedTargetOrigin)) {
            matchingLogs.push(...consoleLogsStore[key]);
        }
    }

    const result = matchingLogs.length
      ? matchingLogs.join("\n")
      : `No console logs have been captured for ${url}. Make sure you have visited the page.`;

    // To prevent clearing the logs, comment out or remove these lines:
    // if (consoleLogsStore[full])   consoleLogsStore[full] = [];
    // if (consoleLogsStore[origin]) consoleLogsStore[origin] = [];

    res.json({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: result }] }
    });
  } else if (toolName === "readErrorsOnly") {
        const url = args.url.startsWith('http') ? args.url : `http://${args.url}`;
        const { full, origin } = parseKeys(url);

        const logs = [];
        if (consoleLogsStore[full]) {
            logs.push(...consoleLogsStore[full]);
        }
        if (consoleLogsStore[origin]) {
            logs.push(...consoleLogsStore[origin]);
        }

        const filteredLogs = logs.filter(log =>
            log.startsWith('[ERROR]') || log.startsWith('[WARNING]')
        );

        const result = filteredLogs.length
            ? filteredLogs.join("\n")
            : `No errors or warnings have been captured for ${args.url}.`;

        res.json({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: result }] }
        });
    }
  
  else {
    // ... (rest of the code is unchanged)
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