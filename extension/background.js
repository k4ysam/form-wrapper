// background.js — MV3 service worker
// Minimal: stores the server URL config in chrome.storage.local.
// Polling is handled by popup.js while the popup is open; run state
// is persisted in storage so it survives popup close/reopen.

const DEFAULT_SERVER_URL = "http://localhost:3000";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("serverUrl", (data) => {
    if (!data.serverUrl) {
      chrome.storage.local.set({ serverUrl: DEFAULT_SERVER_URL });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "getServerUrl") {
    chrome.storage.local.get("serverUrl", (data) => {
      sendResponse({ serverUrl: data.serverUrl || DEFAULT_SERVER_URL });
    });
    return true; // keep channel open for async sendResponse
  }

  if (msg.action === "setServerUrl") {
    chrome.storage.local.set({ serverUrl: msg.serverUrl }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});
