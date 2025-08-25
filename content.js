// content.js
console.log('[Content Script] Running...');

// 1. Inject the injector.js script
const s = document.createElement('script');
s.src = chrome.runtime.getURL('injector.js');
(document.head || document.documentElement).appendChild(s);
s.onload = () => s.remove();
console.log('[Content Script] Injected injector.js');

// 2. Establish a persistent connection to background.js
const port = chrome.runtime.connect({ name: "console--logging" });
port.onDisconnect.addListener(() => console.error("Background port disconnected."));
console.log('[Content Script] Port to background.js established.');

// 3. Listen for messages from injector.js and forward them
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data.source !== 'mcp-injector-script') {
    return;
  }
  console.log('[Content Script] Received message from injector, forwarding to background.');
  port.postMessage(event.data);
}, false);