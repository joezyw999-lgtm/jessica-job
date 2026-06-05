// 点击扩展图标 → 打开侧边栏（常驻，不会因点击页面而关闭）
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// 右键图片 → 识别面经
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'mianjing-recognize',
    title: '识别面经',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'mianjing-recognize' && info.srcUrl && tab?.id) {
    // 打开侧边栏，并通过 storage 传递图片 URL
    await chrome.storage.local.set({ pendingImageUrl: info.srcUrl });
    chrome.sidePanel.open({ tabId: tab.id });
  }
});
