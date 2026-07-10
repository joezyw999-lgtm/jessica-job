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

  // 尝试从主站 localStorage 同步 deviceId，确保数据互通
  deviceId = stored.deviceId || '';
  if (!deviceId) {
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.vercel.app/*' });
      if (tabs.length > 0) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => localStorage.getItem('mianjing_device_id')
        });
        if (results && results[0] && results[0].result) {
          deviceId = results[0].result;
        }
      }
    } catch (e) { /* ignore */ }
  }
  if (!deviceId) {
    deviceId = generateDeviceId();
  }
  await chrome.storage.local.set({ deviceId });
  // 同步 deviceId 到主站，确保数据互通
  syncDeviceIdToWebsite();
  document.getElementById('apiUrl').value = API_BASE;
  loadRecords();
  setupPaste();

  // Bind button events (Manifest V3 forbids inline onclick)
  document.getElementById('singleBtn').addEventListener('click', () => setMode('single'));
  document.getElementById('multiBtn').addEventListener('click', () => setMode('multi'));
  document.getElementById('settingsToggle').addEventListener('click', toggleSettings);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('clearPendingBtn').addEventListener('click', clearPending);
  document.getElementById('submitBtn').addEventListener('click', submitPending);
});

function generateDeviceId() {
  return 'ext_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// 同步 deviceId 到所有已打开的主站标签页
async function syncDeviceIdToWebsite() {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.vercel.app/*' });
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (id) => { localStorage.setItem('mianjing_device_id', id); },
          args: [deviceId]
        });
      } catch (e) { /* skip inaccessible tabs */ }
    }
  } catch (e) { /* ignore */ }
}

// 从主站 localStorage 同步 deviceId（如果主站已有则优先用主站的）
async function syncFromWebsite() {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.vercel.app/*' });
    if (tabs.length > 0) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => localStorage.getItem('mianjing_device_id')
      });
      if (results && results[0] && results[0].result) {
        deviceId = results[0].result;
        await chrome.storage.local.set({ deviceId });
        return true;
      }
    }
  } catch (e) { /* ignore */ }
  return false;
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
  document.getElementById('pendingArea').style.display = mode === 'multi' ? 'block' : 'none';
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
    e.preventDefault();
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length === 0) return;

    // Flash feedback
    area.classList.add('flash');
    setTimeout(() => area.classList.remove('flash'), 300);

    if (pasteMode === 'single') {
      // Single mode: process each image independently
      for (const file of imageFiles) {
        await processSingleImage(file);
      }
    } else {
      // Multi mode: add to pending
      for (const file of imageFiles) {
        const previewUrl = URL.createObjectURL(file);
        pendingFiles.push({ file, previewUrl });
      }
      renderPending();
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
      // Save to DB
      await saveRecord({
        image_url: uploadResult.imageUrl,
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
      });
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
  btn.disabled = true;
  btn.textContent = '识别中...';

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
    imageUrl: pendingFiles[0]?.previewUrl || '',
    status: 'extracting',
  }, true);

  try {
    // Upload all images
    const uploadResults = [];
    for (const f of pendingFiles) {
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
      await saveRecord({
        image_url: imageUrls[0],
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
      });
    } else {
      updateRecord(tempId, { status: 'error', content: '识别失败' });
    }
  } catch (err) {
    updateRecord(tempId, { status: 'error', content: err.message || '处理失败' });
  }

  pendingFiles = [];
  renderPending();
  btn.textContent = '提交识别';
  btn.disabled = false;
}

// ===== API Calls =====
async function uploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
  const data = await res.json();
  if (data.success) return data.data;
  return null;
}

async function extractInfo(imageUrls) {
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
  return null;
}

async function saveRecord(record) {
  await fetch(`${API_BASE}/api/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': deviceId,
    },
    body: JSON.stringify({ device_id: deviceId, ...record }),
  });
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

function updateRecord(id, updates) {
  recordsData = recordsData.map(r => r.id === id ? { ...r, ...updates } : r);
  renderRecords();
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
        <span class="record-company">${r.company || '未知公司'}</span>
        <div style="display:flex;gap:3px;align-items:center">
          ${r.industry ? `<span class="tag">${r.industry}</span>` : ''}
          ${r.experienceType && r.experienceType !== '面经' ? `<span class="tag orange">${r.experienceType}</span>` : ''}
          <span class="record-status ${statusClass}">${statusText}</span>
        </div>
      </div>
      ${r.position ? `<div class="record-position">${r.position}</div>` : ''}
      ${displayContent ? `<div class="record-content">${escapeHtml(displayContent)}</div>` : ''}
      ${r.status === 'extracting' ? '<div style="margin-top:4px"><span class="loading-spinner"></span>识别清洗中...</div>' : ''}
    </div>`;
  }).join('');
  list.querySelectorAll('.record-item.clickable').forEach(el => {
    el.addEventListener('click', () => showDetail(el.dataset.id));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Detail Modal =====
function showDetail(id) {
  const record = recordsData.find(r => r.id === id);
  if (!record) return;

  const container = document.getElementById('modalContainer');
  container.innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal" id="modalBox">
        <div class="modal-title">${record.company || '未知公司'}${record.position ? ' - ' + record.position : ''}</div>
        <div class="modal-tags">
          <span class="tag">${record.category || '国内'}</span>
          <span class="tag orange">${record.experienceType || '面经'}</span>
          <span class="tag">${record.country || '大陆'}</span>
          ${record.industry ? `<span class="tag">${record.industry}</span>` : ''}
        </div>
        <div class="modal-content">${escapeHtml(record.content || '')}</div>
        <button class="modal-close" id="modalCloseBtn">关闭</button>
      </div>
    </div>
  `;
  document.getElementById('modalOverlay').addEventListener('click', (e) => closeModal(e));
  document.getElementById('modalBox').addEventListener('click', (e) => e.stopPropagation());
  document.getElementById('modalCloseBtn').addEventListener('click', () => closeModal());
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modalContainer').innerHTML = '';
}
