// injector.js
console.log('[Injector Script] Loaded.');

const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

Object.keys(originalConsole).forEach((method) => {
  console[method] = (...args) => {
    window.postMessage({
      source: 'mcp-injector-script',
      type: "CONSOLE_LOG",
      payload: {
        method: method,
        args: args.map(arg => {
          try {
            // A simple way to handle complex objects
            return JSON.parse(JSON.stringify(arg));
          } catch (e) {
            return `Unserializable Object: ${String(arg)}`;
          }
        }),
        url: window.location.href,
      }
    }, '*');
    originalConsole[method].apply(console, args);
  };
});

// Also forward console.debug, just in case
originalConsole.debug = console.debug;
console.debug = (...args) => {
  window.postMessage({
    source: 'mcp-injector-script',
    type: 'CONSOLE_LOG',
    payload: { method: 'debug', args: args.map(safe), url: location.href }
  }, '*');
  originalConsole.debug.apply(console, args);
};

// 1) Uncaught JS errors (syntax/runtime)
window.addEventListener('error', (e) => {
  window.postMessage({
    source: 'mcp-injector-script',
    type: 'CONSOLE_LOG',
    payload: {
      method: 'error',
      args: [{
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        stack: e.error && e.error.stack ? String(e.error.stack) : null
      }],
      url: location.href
    }
  }, '*');
});

// 2) Unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  let reason = e.reason;
  try { reason = JSON.parse(JSON.stringify(reason)); } catch {}
  window.postMessage({
    source: 'mcp-injector-script',
    type: 'CONSOLE_LOG',
    payload: { method: 'error', args: [{ unhandledRejection: reason }], url: location.href }
  }, '*');
});

// helper for JSON-safe args
function safe(arg) {
  try { return JSON.parse(JSON.stringify(arg)); } catch { return String(arg); }
}