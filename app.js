/* ============================================================== */
/*  MARINE SECURE DASHBOARD — app.js                              */
/*  i will make sure to replace  API_BASE with  live Render URL before deploying   */
/* ============================================================== */

const API_BASE = 'https://secure-marine-api.onrender.com';
// const API_BASE = 'http://localhost:8000';  

/* ---- State ---------------------------------------------------- */
let state = {
  token: localStorage.getItem('token') || null,
  user:  JSON.parse(localStorage.getItem('user') || 'null'),
  currentPage: 1,
  totalDatasets: 0,
  pageSize: 12,
};

/* ============================================================== */
/*  THEME                                                          */
/* ============================================================== */
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

(function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();




/*  NAVIGATION                                                     */

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  const target = document.getElementById(name);
  if (!target) return;
  if (name === 'dashboard') target.style.display = 'flex';
  else if (name === 'landing') target.style.display = 'block';
  else target.style.display = 'flex';
}

function showTab(tabId, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tabId === 'tab-datasets') loadDatasets();
  if (tabId === 'tab-audit')    loadAuditLogs();
}



/*  API HELPER                                                     */
async function api(path, options = {}) {
    const headers = { ...options.headers };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
  }

  // Always attach token — must come AFTER Content-Type logic
  const token = state.token || localStorage.getItem('token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearAuth();
    showScreen('login');
    return null;
  }

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!res.ok) throw { status: res.status, detail: data.detail || 'An error occurred.' };
    return data;
  } catch (e) {
    if (e.status) throw e;
    return { _raw: text, _status: res.status };
  }
}


/*  AUTH  */

async function handleRegister(e) {
  e.preventDefault();
  const btn   = document.getElementById('reg-btn');
  const errEl = document.getElementById('reg-error');
  const okEl  = document.getElementById('reg-success');

  errEl.style.display = 'none';
  okEl.style.display  = 'none';
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email:          document.getElementById('reg-email').value.trim(),
        password:       document.getElementById('reg-password').value,
        full_name:      document.getElementById('reg-name').value.trim(),
        institution_id: document.getElementById('reg-institution').value.trim() || null,
      }),
    });

    okEl.textContent = 'Account created! Signing you in...';
    okEl.style.display = 'block';

    // Store credentials then auto-login
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    setTimeout(async () => {
      try {
        const data = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        if (!data) return;
        state.token = data.access_token;
        state.user  = data.user;
        localStorage.setItem('token', state.token);
        localStorage.setItem('user',  JSON.stringify(state.user));
        setupDashboard();
        showScreen('dashboard');
        // FIX 1: Go to datasets tab, not upload
        showTab('tab-datasets', document.querySelector('.nav-item'));
      } catch (err) {
        showScreen('login');
      }
    }, 1000);

  } catch (err) {
    errEl.textContent   = err.detail || 'Registration failed. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create account';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn   = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email:    document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value,
      }),
    });
    if (!data) return;

    state.token = data.access_token;
    state.user  = data.user;
    localStorage.setItem('token', state.token);
    localStorage.setItem('user',  JSON.stringify(state.user));

    setupDashboard();
    showScreen('dashboard');
    // FIX 1: Always land on datasets tab
    showTab('tab-datasets', document.querySelector('.nav-item'));

  } catch (err) {
    errEl.textContent   = err.detail || 'Sign in failed. Check your credentials.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

async function handleLogout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (_) {}
  clearAuth();
  showScreen('landing');
}

function clearAuth() {
  state.token = null;
  state.user  = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function setupDashboard() {
  if (!state.user) return;
  const name = state.user.full_name || state.user.email;
  document.getElementById('user-name').textContent    = name;
  document.getElementById('user-role').textContent    = state.user.role;
  document.getElementById('user-avatar').textContent  = name.charAt(0).toUpperCase();
  if (state.user.role === 'sys_admin') {
    document.getElementById('nav-audit').style.display = 'flex';
  }
}


/*  DATASETS                                                       */

async function loadDatasets() {
  const loading = document.getElementById('datasets-loading');
  const empty   = document.getElementById('datasets-empty');
  const grid    = document.getElementById('datasets-grid');
  const pager   = document.getElementById('datasets-pagination');

  loading.style.display = 'block';
  empty.style.display   = 'none';
  grid.style.display    = 'none';
  pager.style.display   = 'none';

  try {
    const typeFilter = document.getElementById('filter-type')?.value || '';
    let url = `/datasets/?page=${state.currentPage}&page_size=${state.pageSize}`;
    if (typeFilter) url += `&data_type=${typeFilter}`;

    const data = await api(url);
    if (!data) return;

    state.totalDatasets  = data.total;
    loading.style.display = 'none';

    if (data.datasets.length === 0) {
      empty.style.display = 'block';
      return;
    }

    grid.innerHTML = '';
    data.datasets.forEach(ds => { grid.innerHTML += renderDatasetCard(ds); });
    grid.style.display = 'grid';

    if (data.total > state.pageSize) {
      const totalPages = Math.ceil(data.total / state.pageSize);
      document.getElementById('page-info').textContent =
        `Page ${state.currentPage} of ${totalPages} · ${data.total} datasets`;
      document.getElementById('prev-page').disabled = state.currentPage <= 1;
      document.getElementById('next-page').disabled = state.currentPage >= totalPages;
      pager.style.display = 'flex';
    }
  } catch (err) {
    loading.textContent = 'Failed to load datasets. ' + (err.detail || 'Check your API connection.');
  }
}

function renderDatasetCard(ds) {
  const size = ds.file_size_bytes
    ? ds.file_size_bytes > 1048576
      ? (ds.file_size_bytes / 1048576).toFixed(1) + ' MB'
      : (ds.file_size_bytes / 1024).toFixed(0) + ' KB'
    : 'Unknown';

  const date = new Date(ds.created_at).toLocaleDateString('en-IE', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  const dsJson = escAttr(JSON.stringify(ds));

  return `
    <div class="dataset-card" onclick="openDatasetModal('${dsJson}')">
      <div class="dataset-card-top">
        <span class="dataset-type-badge">${ds.data_type.replace('_', ' ')}</span>
        ${ds.is_public ? '<span class="dataset-public-badge">public</span>' : ''}
      </div>
      <h3>${escHtml(ds.title)}</h3>
      <p>${ds.description ? escHtml(ds.description) : 'No description provided.'}</p>
      <div class="dataset-meta">
        ${ds.region ? `<span>📍 ${escHtml(ds.region)}</span>` : ''}
        <span>📁 ${escHtml(ds.original_filename)}</span>
        <span>${size}</span>
        <span>${date}</span>
      </div>
      <div class="dataset-actions">
        <button class="btn btn-ghost btn-sm"
          onclick="event.stopPropagation(); downloadDataset('${ds.id}','${escHtml(ds.original_filename)}')">
          ⬇ Download
        </button>
        <button class="btn btn-ghost btn-sm"
          onclick="event.stopPropagation(); openDatasetModal('${dsJson}')">
          Details
        </button>
      </div>
    </div>`;
}

function changePage(dir) {
  const totalPages = Math.ceil(state.totalDatasets / state.pageSize);
  state.currentPage = Math.max(1, Math.min(totalPages, state.currentPage + dir));
  loadDatasets();
}

/* ============================================================== */
/*  UPLOAD — FIX 2: proper file input trigger                     */
/* ============================================================== */
function triggerFileInput() {
  document.getElementById('up-file').click();
}

function handleFileSelect(input) {
  const drop    = document.getElementById('file-drop');
  const content = document.getElementById('file-drop-content');
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const size = file.size > 1048576
      ? (file.size / 1048576).toFixed(1) + ' MB'
      : (file.size / 1024).toFixed(0) + ' KB';
    content.innerHTML = `
      <div class="file-drop-icon">✅</div>
      <p style="font-weight:500;color:var(--success)">${escHtml(file.name)}</p>
      <p class="file-drop-hint">${size} · ready to upload</p>`;
    drop.classList.add('has-file');
  }
}

function resetFileDropZone() {
  const content = document.getElementById('file-drop-content');
  const drop    = document.getElementById('file-drop');
  content.innerHTML = `
    <div class="file-drop-icon">⬆</div>
    <p>Click to select file</p>
    <p class="file-drop-hint">CSV, JSON, NetCDF · max 50 MB</p>`;
  drop.classList.remove('has-file');
  document.getElementById('up-file').value = '';
}

async function handleUpload(e) {
  e.preventDefault();
  const btn    = document.getElementById('upload-btn');
  const errEl  = document.getElementById('upload-error');
  const okEl   = document.getElementById('upload-success');
  const fileEl = document.getElementById('up-file');

  errEl.style.display = 'none';
  okEl.style.display  = 'none';

  if (!fileEl.files || !fileEl.files[0]) {
    errEl.textContent   = 'Please select a file first by clicking the upload area.';
    errEl.style.display = 'block';
    return;
  }

  const title = document.getElementById('up-title').value.trim();
  const type  = document.getElementById('up-type').value;

  if (!title) {
    errEl.textContent   = 'Please enter a dataset title.';
    errEl.style.display = 'block';
    return;
  }
  if (!type) {
    errEl.textContent   = 'Please select a data type.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Uploading...';

  try {
    const form = new FormData();
    form.append('title',       title);
    form.append('data_type',   type);
    form.append('region',      document.getElementById('up-region').value);
    form.append('description', document.getElementById('up-desc').value);
    form.append('tags',        document.getElementById('up-tags').value);
    form.append('is_public',   document.getElementById('up-public').checked ? 'true' : 'false');
    form.append('file',        fileEl.files[0]);

    const token = state.token || localStorage.getItem('token');
    const uploadRes = await fetch(`${API_BASE}/datasets/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    });
    if (uploadRes.status === 401) {
      errEl.textContent = 'Session expired. Please sign in again.';
      errEl.style.display = 'block';
      clearAuth();
      showScreen('login');
      return;
    }
    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      throw { detail: err.detail || 'Upload failed.' };
    }
    const result = await uploadRes.json();
    if (!result) return;

    okEl.textContent   = `"${result.title}" uploaded successfully!`;
    okEl.style.display = 'block';

    // Reset form
    document.getElementById('upload-form').reset();
    resetFileDropZone();

    // Go to datasets tab after delay
    setTimeout(() => {
      state.currentPage = 1;
      showTab('tab-datasets', document.querySelector('.nav-item'));
    }, 1800);

  } catch (err) {
    errEl.textContent   = err.detail || 'Upload failed. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload dataset';
  }
}

/* ============================================================== */
/*  DOWNLOAD                                                       */
/* ============================================================== */
async function downloadDataset(id, filename) {
  try {
    const res = await fetch(`${API_BASE}/datasets/${id}/download`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (!res.ok) {
      alert('Download failed. You may not have access to this dataset.');
      return;
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Download failed: ' + (err.message || 'Unknown error'));
  }
}

/* ============================================================== */
/*  MODAL                                                          */
/* ============================================================== */
function openDatasetModal(dsOrStr) {
  let ds;
  try {
    ds = typeof dsOrStr === 'string' ? JSON.parse(dsOrStr) : dsOrStr;
  } catch (e) {
    return;
  }

  const size = ds.file_size_bytes
    ? ds.file_size_bytes > 1048576
      ? (ds.file_size_bytes / 1048576).toFixed(1) + ' MB'
      : (ds.file_size_bytes / 1024).toFixed(0) + ' KB'
    : '—';
  const date = new Date(ds.created_at).toLocaleString('en-IE');

  document.getElementById('modal-content').innerHTML = `
    <h3>${escHtml(ds.title)}</h3>
    <div class="modal-meta">
      <div class="modal-field"><label>Type</label><span>${ds.data_type.replace('_',' ')}</span></div>
      <div class="modal-field"><label>Region</label><span>${ds.region || '—'}</span></div>
      <div class="modal-field"><label>File</label><span>${escHtml(ds.original_filename)}</span></div>
      <div class="modal-field"><label>Size</label><span>${size}</span></div>
      <div class="modal-field"><label>Institution</label><span>${ds.institution_id || '—'}</span></div>
      <div class="modal-field"><label>Visibility</label><span>${ds.is_public ? 'Public' : 'Institution only'}</span></div>
      <div class="modal-field"><label>Uploaded</label><span>${date}</span></div>
      <div class="modal-field"><label>MIME type</label><span>${ds.mime_type || '—'}</span></div>
    </div>
    ${ds.description ? `<p style="font-size:0.875rem;color:var(--text-2);margin-bottom:1.5rem">${escHtml(ds.description)}</p>` : ''}
    ${ds.tags ? `<p style="font-size:0.8rem;color:var(--text-3);margin-bottom:1.5rem">Tags: ${escHtml(ds.tags)}</p>` : ''}
    <div class="modal-actions">
      <button class="btn btn-primary"
        onclick="downloadDataset('${ds.id}','${escHtml(ds.original_filename)}')">
        ⬇ Download dataset
      </button>
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>`;

  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').style.display = 'none';
}

/* ============================================================== */
/*  AUDIT LOGS                                                     */
/* ============================================================== */
async function loadAuditLogs() {
  const loading = document.getElementById('audit-loading');
  const table   = document.getElementById('audit-table-wrap');

  loading.style.display = 'block';
  table.style.display   = 'none';

  try {
    const action  = document.getElementById('filter-action')?.value || '';
    const success = document.getElementById('filter-success')?.value || '';
    let url = '/admin/audit-logs?page=1&page_size=50';
    if (action)         url += `&action=${action}`;
    if (success !== '') url += `&success=${success}`;

    const data = await api(url);
    if (!data) return;

    const body = document.getElementById('audit-body');
    body.innerHTML = '';
    data.logs.forEach(log => {
      const time = new Date(log.created_at).toLocaleString('en-IE');
      const ok   = log.success;
      body.innerHTML += `
        <tr>
          <td>${time}</td>
          <td><span class="action-badge">${log.action}</span></td>
          <td>${log.resource_id ? log.resource_id.slice(0,8) + '…' : '—'}</td>
          <td>${log.ip_address || '—'}</td>
          <td class="${ok ? 'outcome-success' : 'outcome-fail'}">${ok ? '✓ Success' : '✗ Failed'}</td>
        </tr>`;
    });

    loading.style.display = 'none';
    table.style.display   = 'block';
  } catch (err) {
    loading.textContent = 'Failed to load audit logs. ' + (err.detail || '');
  }
}

/* ============================================================== */
/*  HEALTH CHECK — FIX 3: show stat on landing                   */
/* ============================================================== */
async function checkHealth() {
  const el = document.getElementById('stat-health');
  if (!el) return;
  try {
    const res  = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.status === 'healthy') {
      el.textContent = 'Healthy ✓';
      el.style.color = 'var(--success)';
    } else {
      el.textContent = 'Degraded';
      el.style.color = 'var(--warning)';
    }
  } catch (_) {
    el.textContent = 'Offline';
    el.style.color = 'var(--danger)';
  }
}

/* ============================================================== */
/*  UTILITIES                                                      */
/* ============================================================== */
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function escAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

/* ============================================================== */
/*  INIT                                                           */
/* ============================================================== */
document.addEventListener('DOMContentLoaded', function () {

  // FIX 2: wire up file drop zone click properly
  const fileDrop = document.getElementById('file-drop');
  if (fileDrop) {
    fileDrop.addEventListener('click', function (e) {
      // prevent double-firing from child element clicks
      if (e.target.closest('#up-file')) return;
      document.getElementById('up-file').click();
    });
  }

  // Check API health on landing page
  checkHealth();

  // Restore session if token exists
  if (state.token && state.user) {
    setupDashboard();
    showScreen('dashboard');
    showTab('tab-datasets', document.querySelector('.nav-item'));
    loadDatasets();
  } else {
    showScreen('landing');
  }
});
