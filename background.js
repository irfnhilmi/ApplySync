// Service worker - required for chrome.identity to work in Arc
chrome.runtime.onInstalled.addListener(() => {
  console.log('ApplySync installed');
});
