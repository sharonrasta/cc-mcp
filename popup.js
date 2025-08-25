// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const tabList = document.getElementById('tab-list');

  // Query for all tabs in the current window
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    tabs.forEach((tab) => {
      // Create a list item for each tab
      const listItem = document.createElement('li');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `tab-${tab.id}`;
      checkbox.checked = false; // Initial state

      // Check if the debugger is already attached to this tab
      // This part requires a way to track attached tabs, which we can add later
      // For now, assume it's unchecked by default.

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          // Send a message to the background script to attach the debugger
          chrome.runtime.sendMessage({ action: 'attach-debugger', tabId: tab.id });
        } else {
          // Send a message to the background script to detach the debugger
          chrome.runtime.sendMessage({ action: 'detach-debugger', tabId: tab.id });
        }
      });

      const label = document.createElement('label');
      label.htmlFor = `tab-${tab.id}`;
      label.textContent = `${tab.title} - ${tab.url}`;

      listItem.appendChild(checkbox);
      listItem.appendChild(label);
      tabList.appendChild(listItem);
    });
  });
});