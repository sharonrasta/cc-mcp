// background.js (Definitive, Working Version)
console.log(`[Background Script] Listener is active at ${new Date().toISOString()}`);

chrome.runtime.onConnect.addListener((port) => {
  console.assert(port.name === "console--logging");
  console.log(`[Background Script] Connection established with ${port.sender.tab.url}`);

  port.onMessage.addListener((request) => {
    if (request.type === "CONSOLE_LOG") {
      console.log('[Background Script] Message received via port:', request);
      fetch("http://127.0.0.1:3201/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request.payload),
      })
      .then(response => {
          if (response.ok) {
              console.log(`[Background Script] Log successfully sent to server.`);
          } else {
              console.error(`[Background Script] Server responded with an error: ${response.status} ${response.statusText}`);
          }
      })
      .catch((error) =>
        console.error("[Background Script] FETCH FAILED:", error)
      );
    }
  });

  port.onDisconnect.addListener(() => {
    console.log(`[Background Script] Port disconnected from ${port.sender.tab.url}`);
  });
});