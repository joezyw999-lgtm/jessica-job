// ===== Config =====
const DEFAULT_API = 'https://jessica-job.vercel.app';
let API_BASE = DEFAULT_API;
let deviceId = '';
let pasteMode = 'single'; // single | multi
let pendingFiles = []; // {file, previewUrl}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['apiUrl', 'deviceId']);
  API_BASE = stored.apiUrl || DEFAULT_API;

  // 初始化 deviceId：优先从主站网页同步，其次用本地存储的，最后生成新的
  deviceId = await resolveDeviceId(stored.deviceId);
  await chrome.storage.local.set({ deviceId });

  // 同步 deviceId 到所有已打开的主站标签页
  syncDeviceIdToWebsite();

  document.getElementById('apiUrl').value = API_BASE;
  document.getElementById('deviceIdInput').value = deviceId;
  loadRecords();
  setupPaste();

  // 检查是否有右键图片待识别
  const pending = await chrome.storage.local.get('pendingImageUrl');
  if (pending.pendingImageUrl) {
    await chrome.storage.local.remove('pendingImageUrl');
    recognizeFromUrl(pending.pendingImageUrl);
  }

  // Bind button events (Manifest V3 forbids inline onclick)
  document.getElementById('singleBtn').addEventListener('click', () => setMode('single'));
  document.getElementById('multiBtn').addEventListener('click', () => setMode('multi'));
  document.getElementById('settingsToggle').addEventListener('click', toggleSettings);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('syncDeviceBtn').addEventListener('click', async () => {
    const input = document.getElementById('deviceIdInput');
    const manualId = input.value.trim();
    if (manualId) {
      deviceId = manualId;
      await chrome.storage.local.set({ deviceId: manualId });
      syncDeviceIdToWebsite();
      loadRecords();
    }
  });
  document.getElementById('syncDeviceBtn').addEventListener('dblclick', async () => {
    // 双击同步按钮：从网页获取 deviceId
    const synced = await syncFromWebsite();
    if (synced) {
      document.getElementById('deviceIdInput').value = deviceId;
    }
  });
  document.getElementById('clearPendingBtn').addEventListener('click', clearPending);
  document.getElementById('submitBtn').addEventListener('click', submitPending);

  // Text extract
  document.getElementById('textExtractBtn').addEventListener('click', extractText);
});

/**
 * 解析 deviceId：
 * 1. 先从已打开的主站标签页读取 localStorage
 * 2. 如果没有，使用本地存储的
 * 3. 还没有就生成新的
 */
async function resolveDeviceId(localStoredId) {
  // 尝试从主站同步
  try {
    const tabs = await chrome.tabs.query({});
    const siteTabs = tabs.filter(t => t.url && t.url.includes('vercel.app'));
    for (const tab of siteTabs) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => localStorage.getItem('mianjing_device_id')
        });
        if (results && results[0] && results[0].result) {
          return results[0].result;
        }
      } catch (e) { /* skip tab */ }
    }
  } catch (e) { /* ignore */ }

  // 本地存储的
  if (localStoredId) return localStoredId;

  // 生成新的
  return generateDeviceId();
}

function generateDeviceId() {
  return 'ext_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ===== Settings =====
function toggleSettings() {
  document.getElementById('settingsPanel').classList.toggle('open');
}

async function saveSettings() {
  const url = document.getElementById('apiUrl').value.trim().replace(/\/$/, '');
  API_BASE = url || DEFAULT_API;
  await chrome.storage.local.set({ apiUrl: API_BASE });
  toggleSettings();
  loadRecords();
}

// ===== Mode =====
function setMode(mode) {
  pasteMode = mode;
  document.getElementById('singleBtn').classList.toggle('active', mode === 'single');
  document.getElementById('multiBtn').classList.toggle('active', mode === 'multi');
  const pendingArea = document.getElementById('pendingArea');
  pendingArea.style.display = mode === 'multi' ? 'block' : 'none';
  if (mode === 'single') {
    pendingFiles = [];
    renderPending();
  }
}

// ===== Paste =====
function setupPaste() {
  const area = document.getElementById('pasteArea');
  area.addEventListener('click', () => area.focus());
  area.setAttribute('tabindex', '0');

  document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // 检测图片
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      // 有图片 → 走图片识别流程
      e.preventDefault();
      area.classList.add('flash');
      setTimeout(() => area.classList.remove('flash'), 300);

      if (pasteMode === 'single') {
        for (const file of imageFiles) {
          await processSingleImage(file);
        }
      } else {
        for (const file of imageFiles) {
          const previewUrl = URL.createObjectURL(file);
          pendingFiles.push({ file, previewUrl });
        }
        renderPending();
      }
    } else {
      // 无图片 → 检测纯文字，自动填充到文字输入区
      const pastedText = e.clipboardData?.getData('text');
      if (pastedText && pastedText.trim().length > 0) {
        const activeEl = document.activeElement;
        const isTyping = activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement;
        if (!isTyping) {
          e.preventDefault();
          document.getElementById('textInput').value = pastedText;
        }
      }
    }
  });
}

// ===== Single Mode =====
async function processSingleImage(file) {
  const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const previewUrl = URL.createObjectURL(file);

  // Add extracting record
  const record = {
    id: tempId,
    company: '',
    position: '',
    industry: '',
    category: '国内',
    experienceType: '面经',
    country: '大陆',
    content: '',
    imageUrl: previewUrl,
    status: 'extracting',
  };
  addRecordToList(record, true);

  try {
    // Upload
    const uploadResult = await uploadImage(file);
    if (!uploadResult) {
      updateRecord(tempId, { status: 'error', content: '上传失败' });
      return;
    }
    // Extract
    const extractResult = await extractInfo([uploadResult.imageUrl]);
    if (extractResult) {
      updateRecord(tempId, {
        company: extractResult.company || '',
        position: extractResult.position || '',
        industry: extractResult.industry || '综合',
        category: extractResult.category || '国内',
        experienceType: extractResult.experienceType || extractResult.experience_type || '面经',
        country: extractResult.country || '大陆',
        content: extractResult.content || '',
        originalContent: extractResult.originalContent || extractResult.original_content || '',
        status: 'done',
      });
      const recordData = {
        image_url: uploadResult.imageUrl,
        image_urls: JSON.stringify([uploadResult.imageUrl]),
        image_file_key: uploadResult.fileKey,
        company: extractResult.company || '',
        position: extractResult.position || '',
        industry: extractResult.industry || '综合',
        category: extractResult.category || '国内',
        experience_type: extractResult.experienceType || extractResult.experience_type || '面经',
        country: extractResult.country || '大陆',
        content: extractResult.content || '',
        original_content: extractResult.originalContent || extractResult.original_content || '',
        status: 'done',
      };
      // 直接保存到数据库（统一入口）
      await saveRecord(recordData);
      // 通知网页端数据变化（网页端刷新列表）
      notifyWebsiteRefresh();
    } else {
      updateRecord(tempId, { status: 'error', content: '识别失败' });
    }
  } catch (err) {
    updateRecord(tempId, { status: 'error', content: err.message || '处理失败' });
  }
}

// ===== Multi Mode =====
function renderPending() {
  const grid = document.getElementById('pendingGrid');
  const area = document.getElementById('pendingArea');
  area.style.display = pendingFiles.length > 0 ? 'block' : 'none';
  grid.innerHTML = pendingFiles.map((f, i) => `
    <div class="pending-thumb">
      <img src="${f.previewUrl}" />
      <button class="pending-remove" data-index="${i}">×</button>
    </div>
  `).join('');
  grid.querySelectorAll('.pending-remove').forEach(btn => {
    btn.addEventListener('click', () => removePending(Number(btn.dataset.index)));
  });
  document.getElementById('submitBtn').disabled = pendingFiles.length === 0;
}

function removePending(index) {
  pendingFiles.splice(index, 1);
  renderPending();
}

function clearPending() {
  pendingFiles = [];
  renderPending();
}

async function submitPending() {
  const btn = document.getElementById('submitBtn');
  // 立即取出待处理文件并清空暂存区，允许用户继续粘贴下一组
  const filesToProcess = [...pendingFiles];
  pendingFiles = [];
  renderPending();

  const tempId = 'temp_' + Date.now();
  addRecordToList({
    id: tempId,
    company: '',
    position: '',
    industry: '',
    category: '国内',
    experienceType: '面经',
    country: '大陆',
    content: '',
    imageUrl: filesToProcess[0]?.previewUrl || '',
    status: 'extracting',
  }, true);

  try {
    // Upload all images
    const uploadResults = [];
    for (const f of filesToProcess) {
      const result = await uploadImage(f.file);
      if (result) uploadResults.push(result);
    }
    if (uploadResults.length === 0) {
      updateRecord(tempId, { status: 'error', content: '上传失败' });
      return;
    }

    const imageUrls = uploadResults.map(r => r.imageUrl);
    const extractResult = await extractInfo(imageUrls);
    if (extractResult) {
      updateRecord(tempId, {
        company: extractResult.company || '',
        position: extractResult.position || '',
        industry: extractResult.industry || '综合',
        category: extractResult.category || '国内',
        experienceType: extractResult.experienceType || extractResult.experience_type || '面经',
        country: extractResult.country || '大陆',
        content: extractResult.content || '',
        originalContent: extractResult.originalContent || extractResult.original_content || '',
        status: 'done',
      });
      const recordData = {
        image_url: imageUrls[0],
        image_urls: JSON.stringify(imageUrls),
        image_file_key: uploadResults[0].fileKey,
        company: extractResult.company || '',
        position: extractResult.position || '',
        industry: extractResult.industry || '综合',
        category: extractResult.category || '国内',
        experience_type: extractResult.experienceType || extractResult.experience_type || '面经',
        country: extractResult.country || '大陆',
        content: extractResult.content || '',
        original_content: extractResult.originalContent || extractResult.original_content || '',
        status: 'done',
      };
      // 直接保存到数据库（统一入口）
      await saveRecord(recordData);
      // 通知网页端数据变化（网页端刷新列表）
      notifyWebsiteRefresh();
    } else {
      updateRecord(tempId, { status: 'error', content: '识别失败' });
    }
  } catch (err) {
    updateRecord(tempId, { status: 'error', content: err.message || '处理失败' });
  }
}

// ===== API Calls =====
async function uploadImage(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) return data.data;
    console.error('上传失败:', data.error);
    return null;
  } catch (e) {
    console.error('上传请求失败:', e);
    return null;
  }
}

async function extractInfo(imageUrls) {
  try {
    const body = imageUrls.length === 1
      ? { imageUrl: imageUrls[0] }
      : { imageUrls };
    const res = await fetch(`${API_BASE}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) return data.data;
    console.error('识别失败:', data.error);
    return null;
  } catch (e) {
    console.error('识别请求失败:', e);
    return null;
  }
}

async function saveRecord(record) {
  try {
    const res = await fetch(`${API_BASE}/api/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      body: JSON.stringify({ device_id: deviceId, ...record }),
    });
    const data = await res.json();
    if (!data.success) {
      console.error('保存记录失败:', data.error);
    }
    return data;
  } catch (e) {
    console.error('保存记录请求失败:', e);
    return null;
  }
}

async function loadRecords() {
  try {
    const res = await fetch(`${API_BASE}/api/records`, {
      headers: { 'x-device-id': deviceId },
    });
    const data = await res.json();
    if (data.success && data.data) {
      const list = document.getElementById('recordsList');
      list.innerHTML = '';
      const records = data.data.map(mapDbRecord);
      // Show today count
      const today = new Date().toDateString();
      const todayCount = records.filter(r => new Date(r.createdAt).toDateString() === today).length;
      document.getElementById('stats').textContent = `今日 ${todayCount} 条`;
      records.reverse().forEach(r => addRecordToList(r));
    }
  } catch (e) {
    console.error('Load records failed:', e);
  }
}

function mapDbRecord(row) {
  return {
    id: row.id,
    company: row.company || '',
    position: row.position || '',
    industry: row.industry || '',
    category: row.category || '国内',
    experienceType: row.experience_type || '面经',
    country: row.country || '大陆',
    content: row.content || '',
    originalContent: row.original_content || '',
    imageUrl: row.image_url || '',
    status: row.status || 'done',
    createdAt: row.created_at || '',
  };
}

// ===== Record List UI =====
let recordsData = [];

function addRecordToList(record, prepend = false) {
  recordsData = prepend ? [record, ...recordsData] : [...recordsData, record];
  renderRecords();
}

// 同步 deviceId 到主站网页
async function syncDeviceIdToWebsite() {
  try {
    const result = await chrome.storage.local.get('deviceId');
    const did = result.deviceId;
    if (!did) return;
    const tabs = await chrome.tabs.query({});
    const siteTabs = tabs.filter(t => t.url && t.url.includes('vercel.app'));
    for (const tab of siteTabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (key, value) => {
            localStorage.setItem(key, value);
            // 通知网页 deviceId 已变更
            window.dispatchEvent(new CustomEvent('mianjing-device-id-changed', { detail: value }));
          },
          args: ['mianjing_device_id', did],
        });
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* skip */ }
}

// 从主站网页同步 deviceId
async function syncFromWebsite() {
  try {
    const tabs = await chrome.tabs.query({});
    const siteTabs = tabs.filter(t => t.url && t.url.includes('vercel.app'));
    for (const tab of siteTabs) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (key) => localStorage.getItem(key),
          args: ['mianjing_device_id'],
        });
        if (results && results[0] && results[0].result) {
          const websiteDeviceId = results[0].result;
          if (websiteDeviceId) {
            deviceId = websiteDeviceId;
            await chrome.storage.local.set({ deviceId: websiteDeviceId });
            loadRecords();
            return true;
          }
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* skip */ }
  return false;
}

// 向网页端发送识别结果数据（由网页端保存到数据库，避免 CORS 问题）
async function sendRecordToWebsite(recordData) {
  try {
    const tabs = await chrome.tabs.query({});
    const siteTabs = tabs.filter(t => t.url && t.url.includes('vercel.app'));
    for (const tab of siteTabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (data) => {
            window.dispatchEvent(new CustomEvent('mianjing-new-record', { detail: data }));
          },
          args: [recordData],
        });
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* skip */ }
}

// 通知网页端刷新数据（通过在网页派发自定义事件）
async function notifyWebsiteRefresh() {
  try {
    const tabs = await chrome.tabs.query({});
    const siteTabs = tabs.filter(t => t.url && t.url.includes('vercel.app'));
    for (const tab of siteTabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => { window.dispatchEvent(new CustomEvent('mianjing-data-changed')); },
        });
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* skip */ }
}

function updateRecord(id, updates) {
  recordsData = recordsData.map(r => r.id === id ? { ...r, ...updates } : r);
  renderRecords();
}

// ===== Text Extract =====
async function extractText() {
  const textarea = document.getElementById('textInput');
  const text = textarea.value.trim();
  if (!text) return;

  const extractBtn = document.getElementById('textExtractBtn');
  const origBtnText = extractBtn.textContent;
  extractBtn.disabled = true;
  extractBtn.textContent = '识别中...';

  try {
    const response = await fetch(`${API_BASE}/api/extract-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
      body: JSON.stringify({ text })
    });
    const data = await response.json();

    if (data.success && data.data) {
      const extracted = data.data;

      // Save to DB
      const recordData = {
        device_id: deviceId,
        image_url: '',
        image_urls: JSON.stringify([]),
        company: extracted.company || '未知公司',
        position: extracted.position || '未知岗位',
        industry: extracted.industry || '综合',
        category: extracted.category || '国内',
        experience_type: extracted.experienceType || '面经',
        country: extracted.country || '大陆',
        original_content: extracted.originalContent || text,
        content: extracted.content || text,
        status: 'done'
      };
      const saveData = await saveRecord(recordData);
      notifyWebsiteRefresh();

      // Add to local records
      if (saveData.success && saveData.data) {
        const newRecord = {
          id: saveData.data.id,
          imageUrl: '',
          company: extracted.company || '未知公司',
          position: extracted.position || '未知岗位',
          industry: extracted.industry || '综合',
          category: extracted.category || '国内',
          experienceType: extracted.experienceType || '面经',
          country: extracted.country || '大陆',
          content: extracted.content || text,
          originalContent: extracted.originalContent || text,
          status: 'done',
          createdAt: saveData.data.created_at || new Date().toISOString()
        };
        recordsData.unshift(newRecord);
        renderRecords();
      }

      textarea.value = '';
      syncDeviceIdToWebsite();
    } else {
      alert('识别失败：' + (data.error || '未知错误'));
    }
  } catch (err) {
    alert('请求失败：' + err.message);
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = origBtnText;
  }
}

function renderRecords() {
  const list = document.getElementById('recordsList');
  if (recordsData.length === 0) {
    list.innerHTML = '<div class="empty-state">暂无识别记录</div>';
    return;
  }
  list.innerHTML = recordsData.map(r => {
    const statusClass = r.status === 'done'
      ? (r.content === '无有效面试信息' ? 'status-failed' : 'status-done')
      : r.status === 'extracting' ? 'status-extracting' : 'status-failed';
    const statusText = r.status === 'done'
      ? (r.content === '无有效面试信息' ? '失败' : '完成')
      : r.status === 'extracting' ? '识别中' : '失败';
    const displayContent = r.status === 'extracting' ? '' : (r.content || '');
    const isFailed = statusClass === 'status-failed';

    return `<div class="record-item${!isFailed && r.content ? ' clickable' : ''}" data-id="${r.id}">
      <div class="record-header">
        <div style="display:flex;align-items:center;gap:4px;flex:1;min-width:0">
          <span class="record-company editable-field" data-id="${r.id}" data-field="company">${r.company || '未知公司'}</span>
          <span class="edit-hint" data-id="${r.id}" data-field="company" title="点击编辑">✎</span>
        </div>
        <div style="display:flex;gap:3px;align-items:center">
          ${r.industry ? `<span class="tag">${r.industry}</span>` : ''}
          ${r.experienceType && r.experienceType !== '面经' ? `<span class="tag orange">${r.experienceType}</span>` : ''}
          <span class="record-status ${statusClass}">${statusText}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <span class="record-position editable-field" data-id="${r.id}" data-field="position">${r.position || ''}</span>
        ${r.position ? `<span class="edit-hint" data-id="${r.id}" data-field="position" title="点击编辑">✎</span>` : ''}
      </div>
      ${displayContent ? `<div class="record-content">${escapeHtml(displayContent)}</div>` : ''}
      ${r.status === 'extracting' ? '<div style="margin-top:4px"><span class="loading-spinner"></span>识别清洗中...</div>' : ''}
    </div>`;
  }).join('');
  list.querySelectorAll('.record-item.clickable').forEach(el => {
    el.addEventListener('click', (e) => {
      if (!e.target.closest('.editable-field') && !e.target.closest('.edit-hint')) {
        showDetail(el.dataset.id);
      }
    });
  });
  list.querySelectorAll('.editable-field, .edit-hint').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      startInlineEdit(el.dataset.id, el.dataset.field);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Inline Edit =====
function startInlineEdit(id, field) {
  const record = recordsData.find(r => r.id === id);
  if (!record) return;
  const currentValue = record[field] || '';
  const el = document.querySelector(`.editable-field[data-id="${id}"][data-field="${field}"]`);
  if (!el) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue;
  input.className = 'inline-edit-input';
  input.placeholder = field === 'company' ? '输入公司名称' : '输入岗位名称';

  el.replaceWith(input);
  input.focus();
  input.select();

  const save = async () => {
    const newValue = input.value.trim();
    if (newValue && newValue !== currentValue) {
      updateRecord(id, { [field]: newValue });
      await saveRecordToServer(id, { [field]: newValue });
    }
    renderRecords();
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { input.blur(); }
    if (e.key === 'Escape') { renderRecords(); }
  });
}

async function saveRecordToServer(id, updates) {
  try {
    await fetch(`${API_BASE}/api/records/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
      body: JSON.stringify(updates),
    });
  } catch (e) { /* skip */ }
}

// ===== Detail Modal =====
function showDetail(id) {
  const record = recordsData.find(r => r.id === id);
  if (!record) return;

  renderDetailModal(record);
}

function renderDetailModal(record) {
  const container = document.getElementById('modalContainer');
  container.innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal" id="modalBox">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div class="modal-title">${(record.company || '未知公司') + (record.position ? ' - ' + record.position : '')}</div>
          <button class="modal-close" id="modalCloseX" style="background:none;border:none;font-size:18px;color:#6B7280;cursor:pointer;padding:4px 8px">✕</button>
        </div>
        <div class="modal-tags">
          <span class="tag">${record.category || '国内'}</span>
          <span class="tag orange">${record.experienceType || '面经'}</span>
          <span class="tag">${record.country || '大陆'}</span>
          ${record.industry ? `<span class="tag">${record.industry}</span>` : ''}
        </div>
        <div class="edit-field">
          <label>公司名称</label>
          <input type="text" id="editCompany" value="${escapeHtml(record.company || '')}" placeholder="公司名称">
        </div>
        <div class="edit-field">
          <label>岗位名称</label>
          <input type="text" id="editPosition" value="${escapeHtml(record.position || '')}" placeholder="岗位名称">
        </div>
        <div class="edit-field">
          <label>面经内容</label>
          <textarea id="editContent" rows="8" placeholder="面经内容">${escapeHtml(record.content || '')}</textarea>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="modal-save-btn" id="modalSaveBtn">保存</button>
          <button class="modal-close" id="modalCloseBtn" style="background:#6B7280">关闭</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modalOverlay').addEventListener('click', () => closeModal());
  document.getElementById('modalBox').addEventListener('click', (e) => e.stopPropagation());

  const closeXBtn = document.getElementById('modalCloseX');
  if (closeXBtn) closeXBtn.addEventListener('click', () => closeModal());

  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal());

  const saveBtn = document.getElementById('modalSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const newCompany = document.getElementById('editCompany').value.trim();
      const newPosition = document.getElementById('editPosition').value.trim();
      const newContent = document.getElementById('editContent').value.trim();
      const updates = {};
      if (newCompany !== (record.company || '')) updates.company = newCompany;
      if (newPosition !== (record.position || '')) updates.position = newPosition;
      if (newContent !== (record.content || '')) updates.content = newContent;
      if (Object.keys(updates).length > 0) {
        const updatedRecord = { ...record, ...updates };
        updateRecord(record.id, updates);
        await saveRecordToServer(record.id, updates);
        closeModal();
        loadRecords();
      } else {
        closeModal();
      }
    });
  }
}

function closeModal() {
  document.getElementById('modalContainer').innerHTML = '';
}

// ===== 右键图片识别 =====
async function recognizeFromUrl(imageUrl) {
  const tempId = 'img_' + Date.now();
  const record = {
    id: tempId,
    imageUrl: imageUrl,
    fileName: '右键图片',
    company: '',
    position: '',
    industry: '',
    category: '国内',
    experienceType: '面经',
    country: '大陆',
    content: '',
    originalContent: '',
    status: 'extracting',
    createdAt: new Date().toISOString(),
  };
  recordsData.unshift(record);
  renderRecords();

  try {
    const res = await fetch(`${API_BASE}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
      body: JSON.stringify({ imageUrl }),
    });
    const data = await res.json();
    if (data.success && data.data) {
      const ext = data.data;
      const idx = recordsData.findIndex(r => r.id === tempId);
      if (idx >= 0) {
        recordsData[idx] = {
          ...recordsData[idx],
          company: ext.company || '',
          position: ext.position || '',
          industry: ext.industry || '',
          category: ext.category || '国内',
          experienceType: ext.experienceType || '面经',
          country: ext.country || '大陆',
          content: ext.content || '',
          originalContent: ext.originalContent || '',
          status: 'done',
        };
        // 保存到数据库
        await fetch(`${API_BASE}/api/records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
          body: JSON.stringify({
            device_id: deviceId,
            image_url: imageUrl,
            image_urls: JSON.stringify([imageUrl]),
            company: ext.company || '',
            position: ext.position || '',
            industry: ext.industry || '',
            category: ext.category || '国内',
            experience_type: ext.experienceType || '面经',
            country: ext.country || '大陆',
            content: ext.content || '',
            original_content: ext.originalContent || '',
            status: 'done',
          }),
        });
      }
    } else {
      const idx = recordsData.findIndex(r => r.id === tempId);
      if (idx >= 0) recordsData[idx].status = 'error';
    }
  } catch (err) {
    const idx = recordsData.findIndex(r => r.id === tempId);
    if (idx >= 0) recordsData[idx].status = 'error';
  }
  renderRecords();
}
