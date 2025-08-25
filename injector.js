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