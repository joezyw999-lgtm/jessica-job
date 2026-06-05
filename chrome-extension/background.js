// Context menu: right-click an image to send for recognition
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'mianjing-recognize',
    title: '识别面经',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'mianjing-recognize' && info.srcUrl) {
    // Open popup with the image URL
    chrome.action.openPopup();
  }
});
