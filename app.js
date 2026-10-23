/* ============================================================== */
/*  MARINE SECURE DASHBOARD — app.js                              */
/*  Replace API_BASE with your live Render URL before deploying   */
/* ============================================================== */

const API_BASE = 'https://secure-marine-api.onrender.com';
// const API_BASE = 'http://localhost:8000';  // uncomment for local dev

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
  html.setAttribute('data-theme', html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  localStorage.setItem('theme', html.getAttribute('data-theme'));
}

(function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

/* ============================================================== */
/*  NAVIGATION                                                     */
/* ============================================================== */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  const target = document.getElementById(name);
  if (!target) return;
  target.style.display = name === 'dashboard' ? 'flex' : (name === 'landing' ? 'block' : 'flex');
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

/* ============================================================== */
/*  API HELPER                                                     */
/* ============================================================== */
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  // Remove Content-Type for FormData (browser sets it with boundary)
  if (options.body instanceof FormData) delete headers['Content-Type'];

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token expired — log out
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
    // Binary response (file download)
    return { _raw: text, _status: res.status };
  }
}

/* ============================================================== */
/*  AUTH                                                           */
/* ============================================================== */
async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('reg-btn');
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

    // Auto-login after registration
    setTimeout(() => {
      document.getElementById('login-email').value = document.getElementById('reg-email').value;
      document.getElementById('login-password').value = document.getElementById('reg-password').value;
      showScreen('login');
      document.querySelector('#login form').dispatchEvent(new Event('submit'));
    }, 1000);

  } catch (err) {
    errEl.textContent = err.detail || 'Registration failed. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create account';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn    = document.getElementById('login-btn');
  const errEl  = document.getElementById('login-error');

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

    // Store auth state
    state.token = data.access_token;
    state.user  = data.user;
    localStorage.setItem('token', state.token);
    localStorage.setItem('user',  JSON.stringify(state.user));

    setupDashboard();
    showScreen('dashboard');
    showTab('tab-datasets', document.querySelector('.nav-item'));

  } catch (err) {
    errEl.textContent = err.detail || 'Sign in failed. Check your credentials.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

async function handleLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch (_) {}
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
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-role').textContent = state.user.role;
  document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();

  // Show audit logs tab for sys_admin
  if (state.user.role === 'sys_admin') {
    document.getElementById('nav-audit').style.display = 'flex';
  }
}

/* ============================================================== */
/*  DATASETS                                                       */
/* ============================================================== */
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

    state.totalDatasets = data.total;
    loading.style.display = 'none';

    if (data.datasets.length === 0) {
      empty.style.display = 'block';
      return;
    }

    grid.innerHTML = '';
    data.datasets.forEach(ds => {
      grid.innerHTML += renderDatasetCard(ds);
    });
    grid.style.display = 'grid';

    // Pagination
    if (data.total > state.pageSize) {
      const totalPages = Math.ceil(data.total / state.pageSize);
      document.getElementById('page-info').textContent =
        `Page ${state.currentPage} of ${totalPages} · ${data.total} datasets`;
      document.getElementById('prev-page').disabled = state.currentPage <= 1;
      document.getElementById('next-page').disabled = state.currentPage >= totalPages;
      pager.style.display = 'flex';
    }

  } catch (err) {
    loading.textContent = 'Failed to load datasets. ' + (err.detail || '');
  }
}

function renderDatasetCard(ds) {
  const size = ds.file_size_bytes
    ? ds.file_size_bytes > 1048576
      ? (ds.file_size_bytes / 1048576).toFixed(1) + ' MB'
      : (ds.file_size_bytes / 1024).toFixed(0) + ' KB'
    : 'Unknown size';

  const date = new Date(ds.created_at).toLocaleDateString('en-IE', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  return `
    <div class="dataset-card" onclick="openDatasetModal(${JSON.stringify(ds).replace(/"/g, '&quot;')})">
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
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); downloadDataset('${ds.id}', '${escHtml(ds.original_filename)}')">⬇ Download</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); openDatasetModal(${JSON.stringify(ds).replace(/"/g, '&quot;')})">Details</button>
      </div>
    </div>`;
}

function changePage(dir) {
  const totalPages = Math.ceil(state.totalDatasets / state.pageSize);
  state.currentPage = Math.max(1, Math.min(totalPages, state.currentPage + dir));
  loadDatasets();
}

/* ============================================================== */
/*  UPLOAD                                                         */
/* ============================================================== */
function handleFileSelect(input) {
  const drop    = document.getElementById('file-drop');
  const content = document.getElementById('file-drop-content');
  if (input.files[0]) {
    const file = input.files[0];
    const size = file.size > 1048576
      ? (file.size / 1048576).toFixed(1) + ' MB'
      : (file.size / 1024).toFixed(0) + ' KB';
    content.innerHTML = `
      <div class="file-drop-icon">✅</div>
      <p style="font-weight:500;color:var(--success)">${escHtml(file.name)}</p>
      <p class="file-drop-hint">${size}</p>`;
    drop.classList.add('has-file');
  }
}

async function handleUpload(e) {
  e.preventDefault();
  const btn    = document.getElementById('upload-btn');
  const errEl  = document.getElementById('upload-error');
  const okEl   = document.getElementById('upload-success');
  const fileEl = document.getElementById('up-file');

  errEl.style.display = 'none';
  okEl.style.display  = 'none';

  if (!fileEl.files[0]) {
    errEl.textContent   = 'Please select a file to upload.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Uploading...';

  try {
    const form = new FormData();
    form.append('title',     document.getElementById('up-title').value);
    form.append('data_type', document.getElementById('up-type').value);
    form.append('region',    document.getElementById('up-region').value);
    form.append('description', document.getElementById('up-desc').value);
    form.append('tags',      document.getElementById('up-tags').value);
    form.append('is_public', document.getElementById('up-public').checked);
    form.append('file',      fileEl.files[0]);

    await api('/datasets/upload', { method: 'POST', body: form });

    okEl.textContent  = `Dataset uploaded successfully.`;
    okEl.style.display = 'block';

    // Reset form
    document.getElementById('upload-form').reset();
    document.getElementById('file-drop-content').innerHTML = `
      <div class="file-drop-icon">⬆</div>
      <p>Click to select file</p>
      <p class="file-drop-hint">CSV, JSON, NetCDF · max 50 MB</p>`;
    document.getElementById('file-drop').classList.remove('has-file');

    // Switch to datasets tab after short delay
    setTimeout(() => {
      state.currentPage = 1;
      showTab('tab-datasets', document.querySelector('.nav-item'));
    }, 1500);

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
    if (!res.ok) { alert('Download failed. You may not have access to this dataset.'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Download failed: ' + (err.message || 'Unknown error'));
  }
}

/* ============================================================== */
/*  DATASET MODAL                                                  */
/* ============================================================== */
function openDatasetModal(ds) {
  if (typeof ds === 'string') ds = JSON.parse(ds);
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
      <button class="btn btn-primary" onclick="downloadDataset('${ds.id}','${escHtml(ds.original_filename)}')">⬇ Download dataset</button>
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
    if (action)  url += `&action=${action}`;
    if (success !== '') url += `&success=${success}`;

    const data = await api(url);
    if (!data) return;

    const body = document.getElementById('audit-body');
    body.innerHTML = '';

    data.logs.forEach(log => {
      const time   = new Date(log.created_at).toLocaleString('en-IE');
      const ok     = log.success;
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
/*  HEALTH CHECK                                                   */
/* ============================================================== */
async function checkHealth() {
  const el = document.getElementById('stat-health');
  try {
    const data = await fetch(`${API_BASE}/health`).then(r => r.json());
    if (data.status === 'healthy') {
      el.textContent = 'Healthy';
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
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================== */
/*  INIT                                                           */
/* ============================================================== */
(function init() {
  // Check API health on landing page load
  checkHealth();

  // Restore session if token exists
  if (state.token && state.user) {
    setupDashboard();
    showScreen('dashboard');
    loadDatasets();
  } else {
    showScreen('landing');
  }
})();
