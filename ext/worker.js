// =========================
// Background Worker
// =========================

// Background worker for Chrome Extension
// Currently empty - can be extended for background tasks if needed

const enableSidePanelOnActionClick = async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error('Failed to configure side panel behavior:', error);
  }
};

chrome.runtime.onInstalled.addListener(() => {
  console.log('Prompt DRIVE installed');
  enableSidePanelOnActionClick();
});

chrome.runtime.onStartup.addListener(() => {
  enableSidePanelOnActionClick();
});
