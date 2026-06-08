// 微信公众号招聘信息导入书签脚本
// 使用方法：将此脚本的压缩版保存为浏览器书签，在公众号文章页面点击书签即可导入
(function() {
  'use strict';

  // 检测是否在微信公众号文章页面
  const isWechatArticle = !!document.getElementById('js_content');

  if (!isWechatArticle) {
    // 不在公众号文章页面，检查是否有选中文字可以作为手动粘贴
    alert('未识别到公众号文章正文。\n请确认当前页面为微信公众号文章，或复制正文后到招聘识别系统手动粘贴导入。');
    return;
  }

  // 采集页面数据
  const titleEl = document.getElementById('activity-name');
  const accountEl = document.getElementById('js_name');
  const publishTimeEl = document.getElementById('publish_time');
  const contentEl = document.getElementById('js_content');

  const title = titleEl ? titleEl.textContent?.trim() || '' : '';
  const accountName = accountEl ? accountEl.textContent?.trim() || '' : '';
  const publishTime = publishTimeEl ? publishTimeEl.textContent?.trim() || '' : '';
  const contentText = contentEl ? contentEl.textContent?.trim() || '' : '';
  const contentHtml = contentEl ? contentEl.innerHTML : '';

  // 采集图片 URL
  const images = contentEl ? contentEl.querySelectorAll('img') : [];
  const imageUrls: string[] = [];
  images.forEach((img: HTMLImageElement) => {
    const url = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src') || '';
    if (url && !url.startsWith('data:')) {
      // 过滤小图标、表情等
      const width = img.naturalWidth || img.width || 999;
      const height = img.naturalHeight || img.height || 999;
      if (width >= 100 || height >= 100) {
        imageUrls.push(url);
      }
    }
  });

  // 去重
  const uniqueImageUrls = [...new Set(imageUrls)];

  const data = {
    sourceUrl: window.location.href,
    title,
    accountName,
    publishTime,
    contentText,
    contentHtml,
    imageUrls: uniqueImageUrls,
    importMethod: 'bookmarklet',
    importedAt: new Date().toISOString()
  };

  // 确认导入
  const imageCount = uniqueImageUrls.length;
  const hasText = contentText.length > 50;
  const summary = `标题: ${title}\n公众号: ${accountName}\n正文长度: ${contentText.length}字\n图片数量: ${imageCount}张`;

  if (!confirm(`确认导入这篇公众号文章？\n\n${summary}\n\n${!hasText && imageCount > 0 ? '⚠️ 正文较短，将以图片OCR为主\n' : ''}点击"确定"开始识别`)) {
    return;
  }

  // 创建悬浮进度提示
  const overlay = document.createElement('div');
  overlay.id = 'recruit-import-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);z-index:99999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:12px;padding:32px;max-width:400px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
      <div style="width:40px;height:40px;border:3px solid #e5e2dd;border-top-color:#2D6A6A;border-radius:50%;margin:0 auto 16px;animation:recruit-spin 1s linear infinite;"></div>
      <div style="font-size:16px;color:#1a1a1a;font-weight:600;">正在识别招聘信息...</div>
      <div style="font-size:13px;color:#6B7280;margin-top:8px;" id="recruit-import-status">提交数据中</div>
    </div>
    <style>@keyframes recruit-spin{to{transform:rotate(360deg)}}</style>
  `;
  document.body.appendChild(overlay);

  function updateStatus(text: string) {
    const el = document.getElementById('recruit-import-status');
    if (el) el.textContent = text;
  }

  function closeOverlay() {
    const el = document.getElementById('recruit-import-overlay');
    if (el) el.remove();
  }

  // 发送到后端
  // 自动检测当前域名（支持 localhost、coze.site、vercel.app 等）
  const apiBase = '${API_BASE_PLACEHOLDER}';
  const apiUrl = `${apiBase}/api/wechat/import`;

  fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then(result => {
    closeOverlay();
    if (result.success) {
      const items = result.data?.items || result.data || [];
      const count = Array.isArray(items) ? items.length : 1;
      alert(`识别完成！\n\n识别到 ${count} 条招聘信息\n公司: ${Array.isArray(items) ? items.map((i: Record<string, unknown>) => i.companyName || '未知').join('、') : (items as Record<string, unknown>).companyName || '未知'}\n\n请到招聘识别系统查看结果`);
    } else {
      alert(`识别失败: ${result.error || '未知错误'}\n\n请稍后重试或手动导入`);
    }
  })
  .catch(err => {
    closeOverlay();
    alert(`导入失败: ${err.message}\n\n请确认招聘识别系统正在运行`);
  });
})();
