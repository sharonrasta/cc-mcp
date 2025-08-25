// background.js — CDP-only robust capture
console.log(`[Background] Service worker alive ${new Date().toISOString()}`);

const DEBUGGER_PROTOCOL_VERSION = "1.3";
const REPORT_URLS = [
  "http://127.0.0.1:3201/report",
  "http://localhost:3201/report",
  "http://localhost:8082/report",
];

const attachedTabs = new Set();

// ---------- Delivery queue ----------
const queue = [];
let flushing = false;

async function sendToServer(payload) {
  queue.push(payload);
  flushQueue();
}
async function flushQueue() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  try {
    while (queue.length) {
      const body = JSON.stringify(queue[0]);
      let delivered = false;
      for (const url of REPORT_URLS) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
          if (res.ok) { delivered = true; break; }
        } catch { /* try next url */ }
      }
      if (!delivered) throw new Error("all endpoints failed");
      queue.shift();
    }
  } finally {
    flushing = false;
  }
}
setInterval(flushQueue, 2000);

// ---------- Helpers ----------
async function getTabUrl(tabId) {
  try { const t = await chrome.tabs.get(tabId); return t?.url || ""; }
  catch { return ""; }
}
async function canAttachTo(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const href = tab?.url || "";
    const proto = href.split(":", 1)[0];
    return proto === "http" || proto === "https";
  } catch {
    return false;
  }
}

// Serialize CDP RemoteObject to JSON/value
async function renderCDPArg(tabId, a) {
  if ("value" in a) return a.value;
  if (a.type === "undefined") return undefined;
  if (a.objectId) {
    try {
      // Stringify in-page with cycle handling
      const { result } = await chrome.debugger.sendCommand({ tabId }, "Runtime.callFunctionOn", {
        objectId: a.objectId,
        functionDeclaration:
          "function(){const seen=new WeakSet();" +
          "try{return JSON.stringify(this,function(k,v){if(typeof v==='object'&&v!==null){if(seen.has(v))return '[Circular]';seen.add(v);}return v;});}" +
          "catch(e){try{return this&&this.toString?this.toString():null;}catch(_){return null;}}}",
        returnByValue: true,
      });
      return result?.value ?? a.description ?? null;
    } catch {
      return a.description ?? null;
    }
  }
  return a.description ?? null;
}
async function renderCDPArgs(tabId, list) {
  const out = [];
  for (const a of (list || [])) out.push(await renderCDPArg(tabId, a));
  return out;
}

// ---------- CDP attach/detach ----------
async function attachDebugger(tabId) {
  if (attachedTabs.has(tabId)) return;
  if (!(await canAttachTo(tabId))) return;
  try {
    await chrome.debugger.attach({ tabId }, DEBUGGER_PROTOCOL_VERSION);
    attachedTabs.add(tabId);
    await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
    await chrome.debugger.sendCommand({ tabId }, "Log.enable");

    // Browser warnings/violations (optional tuning)
    try {
      await chrome.debugger.sendCommand({ tabId }, "Log.startViolationsReport", {
        config: [
          { name: "deprecation" },
          { name: "longTask", threshold: 50 },
        ],
      });
    } catch {}

    // If you want early Page events (not strictly needed):
    // await chrome.debugger.sendCommand({ tabId }, "Page.enable");

    console.log("[Background] CDP attached to tab", tabId);
  } catch (e) {
    console.error("[Background] debugger attach failed", e);
  }
}

function detachDebugger(tabId) {
  if (!attachedTabs.has(tabId)) return;
  try {
    chrome.debugger.detach({ tabId });
  } catch {}
  attachedTabs.delete(tabId);
  console.log("[Background] CDP detached from tab", tabId);
}

// One global event listener; we route by tabId
chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!attachedTabs.has(tabId)) return;

  (async () => {
    const url = await getTabUrl(tabId);

    if (method === "Runtime.consoleAPICalled") {
      const level = params.type || "log"; // log, debug, info, warning, error
      const rendered = await renderCDPArgs(tabId, params.args);
      await sendToServer({ method: level, args: rendered, url });
    } else if (method === "Runtime.exceptionThrown") {
      const d = params.exceptionDetails || {};
      const message = d.exception?.description || d.text || "Uncaught exception";
      const stack = d.stackTrace || null;

      await sendToServer({
        method: "error",
        args: [message, { stack }],
        url
      });
    } else if (method === "Log.entryAdded") {
      const entry = params.entry || {};
      await sendToServer({
        method: entry.level || "log", // verbose|info|warning|error
        args: [entry.text, { source: entry.source, url: entry.url || url }],
        url
      });
    }
  })();
});

// Clean up on detach / tab removal
chrome.debugger.onDetach.addListener((source, reason) => {
  attachedTabs.delete(source.tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  detachDebugger(tabId);
});

// ---------- Explicit control via popup menu ----------
// Remove all automatic attachment listeners
// The popup is now the single source of truth for attachments

// This listener handles messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'attach-debugger') {
    attachDebugger(request.tabId);
  } else if (request.action === 'detach-debugger') {
    detachDebugger(request.tabId);
  }
});