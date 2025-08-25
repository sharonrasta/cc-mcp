// background.js (Definitive, Working Version)
console.log(`[Background Script] Listener is active at ${new Date().toISOString()}`);

// ===== Queue & delivery =====
const REPORT_URL = "http://127.0.0.1:3201/report";
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
      const payload = queue[0];
      const res = await fetch(REPORT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      queue.shift();
    }
  } catch (_) {
    // server still down; try again later
  } finally {
    flushing = false;
  }
}
setInterval(flushQueue, 2000);

async function getTabUrl(tabId) {
  try { const t = await chrome.tabs.get(tabId); return t?.url || ""; }
  catch { return ""; }
}


// ---- CDP attach & events (optional advanced) ----
const DEBUGGER_PROTOCOL_VERSION = '1.3';
const attachedTabs = new Set();

// ===== CDP arg rendering =====
async function renderCDPArg(tabId, a) {
  // primitives (number, string, boolean, null) arrive as `value`
  if ("value" in a) return a.value;
  if (a.type === "undefined") return undefined;

  // Objects/functions have objectId; stringify safely in the page
  if (a.objectId) {
    try {
      const { result } = await chrome.debugger.sendCommand({ tabId }, "Runtime.callFunctionOn", {
        objectId: a.objectId,
        // stringify with cycles handled; fall back to toString()
        functionDeclaration:
          "function(){" +
          "  const seen=new WeakSet();" +
          "  try{return JSON.stringify(this,function(k,v){if(typeof v==='object'&&v!==null){if(seen.has(v))return '[Circular]';seen.add(v);}return v;});}" +
          "  catch(e){try{return this && this.toString ? this.toString() : null;}catch(_){return null;}}" +
          "}",
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


async function attachDebugger(tabId) {
  if (attachedTabs.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, DEBUGGER_PROTOCOL_VERSION);
    attachedTabs.add(tabId);

    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
    await chrome.debugger.sendCommand({ tabId }, 'Log.enable');

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!attachedTabs.has(tabId)) return;

  (async () => {
    const url = await getTabUrl(tabId);

    if (method === "Runtime.consoleAPICalled") {
      const level = params.type || "log";
      const rendered = await renderCDPArgs(tabId, params.args);
      await sendToServer({ method: level, args: rendered, url });
    } else if (method === "Runtime.exceptionThrown") {
      const d = params.exceptionDetails || {};
      await sendToServer({
        method: "error",
        args: [{ exception: d.text, stack: d.stackTrace || null }],
        url
      });
    } else if (method === "Log.entryAdded") {
      const entry = params.entry || {};
      // deprecations/violations/warnings/errors from the browser
      await sendToServer({
        method: entry.level || "log",
        args: [entry.text, { source: entry.source, url: entry.url || url }],
        url
      });
    }
  })();
});

  } catch (e) {
    console.error('[Background] debugger attach failed', e);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (attachedTabs.has(tabId)) {
    chrome.debugger.detach({ tabId });
    attachedTabs.delete(tabId);
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  attachedTabs.delete(source.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!('status' in changeInfo)) return;
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete') {
    try {
      const u = new URL(tab?.url || '');
      if (u.protocol === 'http:' || u.protocol === 'https:') attachDebugger(tabId);
    } catch {}
  }
});



chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "console--logging") return;
  const tabId = port.sender?.tab?.id;
  if (Number.isInteger(tabId)) attachDebugger(tabId); 
  console.assert(port.name === "console--logging");
  console.log(`[Background Script] Connection established with ${port.sender.tab.url}`);

  port.onMessage.addListener((request) => {
    if (request.type === 'PING') return;
if (request.type === 'PING') return;
if (request.type === "CONSOLE_LOG") {
  console.log('[Background Script] Message received via port:', request);
  sendToServer(request.payload); // <— use the queue you defined at the top
}

  });

  port.onDisconnect.addListener(() => {
    console.log(`[Background Script] Port disconnected from ${port.sender.tab.url}`);
  });
});

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const t of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: t.id, allFrames: true },
        files: ['content.js'],
      });
    } catch (e) { /* ignore non-permitted pages */ }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const t of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: t.id, allFrames: true },
        files: ['content.js'],
      });
    } catch (e) {}
  }
});
