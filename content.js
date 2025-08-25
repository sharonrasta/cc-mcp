// content.js
console.log('[Content Script] Running...');

// 1. Inject the injector.js script
const s = document.createElement('script');
s.src = chrome.runtime.getURL('injector.js');
(document.head || document.documentElement).appendChild(s);
s.onload = () => s.remove();
console.log('[Content Script] Injected injector.js');

// 2. Establish a persistent connection to background.js (with auto-reconnect)
let port;
let reconnectDelay = 1000;

function connectPort() {
  try { port && port.disconnect && port.disconnect(); } catch {}
  port = chrome.runtime.connect({ name: "console--logging" });
  console.log('[Content Script] Port connected to background.');

  port.onDisconnect.addListener(() => {
    console.warn('[Content Script] Port disconnected. Retrying in', reconnectDelay, 'ms');
    setTimeout(connectPort, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000); // backoff to 30s max
  });

  // on successful (re)connect, reset backoff
  reconnectDelay = 1000;
}
connectPort();

// 3. Listen for messages from injector.js and forward them through *current* port
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data.source !== 'mcp-injector-script') return;
  try { port && port.postMessage(event.data); } catch {}
}, false);

// Keep the service worker alive (only works if the port is open)
setInterval(() => {
  try { port && port.postMessage({ type: 'PING' }); } catch {}
}, 25000);

