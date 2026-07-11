export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel directly.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
