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

app.post("/report", (req, res) => {
    const { url, method, args } = req.body;
    if (!url) return res.sendStatus(400);

    const normalizedUrl = normalizeUrl(url); // NORMALIZE

    if (!consoleLogsStore[normalizedUrl]) {
        consoleLogsStore[normalizedUrl] = [];
    }

    const logString = `[${method.toUpperCase()}] ${Array.isArray(args) ? args.join(" ") : args}`;
    consoleLogsStore[normalizedUrl].push(logString);

    console.log(`[SERVER] Stored log for ${normalizedUrl}: ${logString}`);
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
        case "tools/call":
            const toolName = params.name;
            const args = params.arguments;

            if (toolName === "readActiveConsole") {
                const normalizedUrl = normalizeUrl(args.url); // NORMALIZE
                const logs = consoleLogsStore[normalizedUrl];
                const result = logs && logs.length > 0 ? logs.join("\n") : `No console logs have been captured for ${normalizedUrl}. Make sure you have visited the page.`;

                if (consoleLogsStore[normalizedUrl]) {
                    consoleLogsStore[normalizedUrl] = [];
                }

                res.json({
                    jsonrpc: "2.0",
                    id: id,
                    result: { content: [{ type: 'text', text: result }] }
                });
            } else {
                res.status(404).json({ jsonrpc: "2.0", id: id, error: { code: -32601, message: "Method not found" } });
            }
            break;
        default:
            res.status(404).json({ jsonrpc: "2.0", id: id, error: { code: -32601, message: "Method not found" } });
            break;
    }
});

app.use("/mcp", mcpRouter);

app.listen(port, () => {
    console.log(`MCP Server is running on http://localhost:${port}`);
});