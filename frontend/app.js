// ==================== TRUSTIQ SPA ====================
const API = '';  // Same origin
let authToken = localStorage.getItem('trustiq_token');
let currentUser = JSON.parse(localStorage.getItem('trustiq_user') || 'null');
let currentPage = '';
let charts = {};

// ==================== API HELPERS ====================
async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const resp = await fetch(API + url, { ...options, headers: { ...headers, ...options.headers } });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

// ==================== TOAST ====================
function showToast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'info' ? '' : type}`;
  toast.innerHTML = `${icons[type] || 'ℹ️'} ${message}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.animation = 'slideOut 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ==================== AUTH FUNCTIONS ====================
function showLogin() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('forgot-form').classList.add('hidden');
}
function showSignup() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('signup-form').classList.remove('hidden');
  document.getElementById('forgot-form').classList.add('hidden');
}
function showForgotPassword() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('forgot-form').classList.remove('hidden');
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  if (!email || !password) { errEl.textContent = 'Please enter email and password'; errEl.classList.remove('hidden'); return; }
  try {
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    authToken = data.access_token;
    currentUser = { id: data.user_id, name: data.name, email, role: data.role };
    localStorage.setItem('trustiq_token', authToken);
    localStorage.setItem('trustiq_user', JSON.stringify(currentUser));
    initApp();
  } catch (e) {
    errEl.textContent = e.message; errEl.classList.remove('hidden');
  }
}

async function doSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');
  errEl.classList.add('hidden');
  if (!name || !email || !password) { errEl.textContent = 'All fields required'; errEl.classList.remove('hidden'); return; }
  try {
    const data = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    authToken = data.access_token;
    currentUser = { id: data.user_id, name: data.name, email, role: data.role };
    localStorage.setItem('trustiq_token', authToken);
    localStorage.setItem('trustiq_user', JSON.stringify(currentUser));
    showToast('Account created! Welcome to TrustIQ.', 'success');
    initApp();
  } catch (e) {
    errEl.textContent = e.message; errEl.classList.remove('hidden');
  }
}

async function doForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { showToast('Please enter your email', 'error'); return; }
  await apiFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  showToast('If an account exists, reset instructions have been sent.', 'success');
  showLogin();
}

function doLogout() {
  localStorage.removeItem('trustiq_token');
  localStorage.removeItem('trustiq_user');
  authToken = null; currentUser = null;
  destroyCharts();
  document.getElementById('app').classList.remove('active');
  document.getElementById('auth-container').style.display = 'flex';
  showLogin();
  showToast('Logged out successfully', 'success');
}

// ==================== APP INIT ====================
function initApp() {
  document.getElementById('auth-container').style.display = 'none';
  const app = document.getElementById('app');
  app.classList.add('active');

  const isAdmin = currentUser.role === 'admin';
  document.getElementById('user-sidebar').style.display = isAdmin ? 'none' : 'flex';
  document.getElementById('admin-sidebar').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('adminSearch').style.display = isAdmin ? 'flex' : 'none';

  const initials = (currentUser.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('topbar-avatar').textContent = initials;
  
  if (isAdmin) {
    document.getElementById('topbar-brand').textContent = 'TrustIQ';
    document.getElementById('topbar-filter1').textContent = 'Date Range';
    document.getElementById('topbar-filter2').textContent = 'Org Filter';
    document.getElementById('admin-avatar-sidebar').textContent = initials;
    document.getElementById('admin-name-sidebar').textContent = currentUser.name;
    navigateTo('admin-dashboard');
  } else {
    document.getElementById('topbar-brand').textContent = 'TrustIQ';
    document.getElementById('topbar-filter1').textContent = '';
    document.getElementById('topbar-filter2').textContent = '';
    document.getElementById('user-avatar-sidebar').textContent = initials;
    document.getElementById('user-name-sidebar').textContent = currentUser.name;
    navigateTo('user-dashboard');
  }
}

function handleAvatarClick() {
  if (currentUser?.role === 'admin') navigateTo('admin-users');
  else navigateTo('user-profile');
}

// ==================== NAVIGATION ====================
function navigateTo(page) {
  currentPage = page;
  destroyCharts();
  
  // Update nav active states
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  
  const content = document.getElementById('contentArea');
  content.innerHTML = '<div style="display:flex;justify-content:center;padding:60px;"><div class="loading-spinner" style="border-color:rgba(26,86,219,0.2);border-top-color:var(--primary);"></div></div>';
  
  const renders = {
    'user-dashboard': renderUserDashboard,
    'user-profile': renderUserProfile,
    'user-verification': renderUserVerification,
    'user-documents': renderUserDocuments,
    'user-insights': renderUserInsights,
    'user-activity': renderUserActivity,
    'user-security': renderUserSecurity,
    'admin-dashboard': renderAdminDashboard,
    'admin-analytics': renderAdminAnalytics,
    'admin-entities': renderAdminEntities,
    'admin-verifications': renderAdminVerifications,
    'admin-risk': renderAdminRisk,
    'admin-fraud': renderAdminFraud,
    'admin-documents': renderAdminDocuments,
    'admin-alerts': renderAdminAlerts,
    'admin-ai-insights': renderAdminAIInsights,
    'admin-users': renderAdminUsers,
    'admin-organizations': renderAdminOrganizations,
    'admin-reports': renderAdminReports,
    'admin-audit': renderAdminAudit,
    'admin-investigations': renderAdminInvestigations,
  };
  
  if (renders[page]) {
    renders[page](content).catch(err => {
      content.innerHTML = `<div class="card" style="color:var(--danger)">Error loading page: ${err.message}</div>`;
    });
  }
}

function destroyCharts() {
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e) {} });
  charts = {};
}

// ==================== CHART HELPERS ====================
function createLineChart(canvasId, labels, datasets, options = {}) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: !!options.legend } },
      scales: {
        x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 } } },
        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 } }, ...options.yAxis }
      },
      elements: { point: { radius: 3, hoverRadius: 5 }, line: { tension: 0.4 } },
      ...options.extra
    }
  });
}

function createDonutChart(canvasId, labels, data, colors) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      cutout: '70%'
    }
  });
}

function createBarChart(canvasId, labels, datasets, options = {}) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: !!options.legend } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 } } }
      },
      ...options.extra
    }
  });
}

// ==================== TRUST SCORE RING ====================
function animateTrustRing(score) {
  const circumference = 2 * Math.PI * 56;
  const offset = circumference - (score / 100) * circumference;
  setTimeout(() => {
    const ring = document.querySelector('.score-ring-fg');
    if (ring) ring.style.strokeDashoffset = offset;
  }, 100);
}

// ==================== USER PAGES ====================
async function renderUserDashboard(content) {
  const data = await apiFetch('/api/user/dashboard');
  const score = data.trust?.score || 0;
  const docs = data.documents || {};
  
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Welcome back, ${currentUser.name.split(' ')[0]}. 👋</h1>
        <p>Here's the current status of your TrustIQ profile.</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 280px;gap:16px;margin-bottom:20px;">
      <div class="trust-main-card">
        <div class="score-ring-container">
          <svg class="score-ring-svg" width="140" height="140" viewBox="0 0 140 140">
            <circle class="score-ring-bg" cx="70" cy="70" r="56"/>
            <circle class="score-ring-fg" cx="70" cy="70" r="56" style="stroke-dasharray:${2*Math.PI*56};stroke-dashoffset:${2*Math.PI*56};"/>
          </svg>
          <div class="score-inner">
            <div class="score-number">${Math.round(score)}</div>
            <div class="score-denom">/100</div>
          </div>
        </div>
        <div class="trust-info">
          <div class="trust-score-badge">↗ +2 pts</div>
          <div class="trust-level">${data.trust?.level || 'Building Trust'}</div>
          <div class="trust-desc">Your trust score is in the top 5% of all users. You have unlocked premium verification tiers.</div>
          <div class="trust-actions">
            <button class="btn btn-dark" onclick="navigateTo('user-profile')">View Trust Profile</button>
            <button class="btn btn-outline" onclick="navigateTo('user-insights')">Improve My Score</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-size:13px;font-weight:600;color:var(--gray-600);">Pending Requests</span>
          <span style="font-size:20px;">📋</span>
        </div>
        <div style="font-size:36px;font-weight:900;color:var(--navy);margin-bottom:4px;">${data.pending_requests}</div>
        <div style="font-size:12px;color:var(--gray-500);margin-bottom:14px;">Action Required</div>
        <div style="background:var(--gray-50);border-radius:8px;padding:10px 12px;margin-bottom:8px;border:1px solid var(--border);">
          <div style="font-size:13px;font-weight:600;color:var(--gray-700);">📍 Update Address</div>
          <div style="font-size:11px;color:var(--gray-400);">Requested 2d ago</div>
        </div>
        <div style="background:var(--gray-50);border-radius:8px;padding:10px 12px;border:1px solid var(--border);">
          <div style="font-size:13px;font-weight:600;color:var(--gray-700);">📋 Verify Income</div>
          <div style="font-size:11px;color:var(--gray-400);">Requested 5d ago</div>
        </div>
        <div class="status-card-link" onclick="navigateTo('user-verification')" style="margin-top:12px;">Review All →</div>
      </div>
    </div>

    <div class="status-cards">
      <div class="status-card">
        <div class="status-card-header">
          <span class="status-card-label">Identity</span>
          <span style="font-size:24px;color:var(--success);">✓</span>
        </div>
        <div class="status-card-value">Verified</div>
        <div class="status-card-sub">Government ID matched successfully.</div>
        <div class="status-card-link" onclick="navigateTo('user-verification')">View Details →</div>
      </div>
      <div class="status-card">
        <div class="status-card-header">
          <span class="status-card-label">Documents</span>
          <span style="font-size:24px;">📁</span>
        </div>
        <div class="status-card-value"><span style="color:var(--navy);">${docs.verified}</span><span style="font-size:14px;font-weight:500;color:var(--gray-400);">/${docs.total}</span></div>
        <div class="status-card-sub" style="margin-bottom:8px;">Verified</div>
        <div class="progress-bar"><div class="progress-fill blue" style="width:${docs.total > 0 ? (docs.verified/docs.total*100) : 0}%;"></div></div>
        <div style="font-size:11px;color:var(--gray-500);margin-top:4px;">All required documents uploaded.</div>
        <div class="status-card-link" onclick="navigateTo('user-documents')">Manage Docs →</div>
      </div>
      <div class="status-card">
        <div class="status-card-header">
          <span class="status-card-label">Profile Security</span>
          <span style="font-size:24px;color:var(--gray-200);">🛡️</span>
        </div>
        <div class="status-card-value">${data.profile_security}</div>
        <div style="margin-top:8px;">
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--success);margin-bottom:4px;">✅ 2FA Enabled</div>
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--success);">✅ Password updated recently</div>
        </div>
        <div class="status-card-link" onclick="navigateTo('user-security')">Security Settings →</div>
      </div>
    </div>
  `;
  animateTrustRing(score);
}

async function renderUserProfile(content) {
  const data = await apiFetch('/api/user/profile');
  const score = data.trust?.score || 0;
  const factors = data.trust?.factors || {};
  
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Trust Profile</h1>
        <p>Your comprehensive TrustIQ identity and verification profile.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-outline" onclick="navigateTo('user-verification')">✅ Start Verification</button>
        <button class="btn btn-blue" onclick="navigateTo('user-security')">🔒 Security Settings</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:320px 1fr;gap:20px;">
      <div>
        <div class="card" style="text-align:center;margin-bottom:16px;">
          <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));color:white;font-size:30px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
            ${(data.name||'U').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
          </div>
          <div style="font-size:18px;font-weight:800;color:var(--navy);margin-bottom:4px;">${data.name}</div>
          <div style="font-size:13px;color:var(--gray-500);margin-bottom:10px;">${data.email}</div>
          <div style="display:flex;justify-content:center;gap:8px;margin-bottom:12px;">
            <span class="badge ${data.verification_status}">${data.verification_status}</span>
            <span class="badge info">Trust Score: ${Math.round(score)}</span>
          </div>
          <div style="display:flex;justify-content:center;gap:8px;">
            <span class="badge ${data.risk?.score > 40 ? 'danger' : 'success'}">Risk: ${data.risk?.level || 'Low'}</span>
          </div>
        </div>
        <div class="card">
          <div class="card-title">AI Explanation</div>
          <div style="background:var(--primary-light);border-radius:8px;padding:14px;font-size:13px;color:var(--gray-700);line-height:1.7;">
            <div style="font-size:11px;font-weight:700;color:var(--primary);margin-bottom:6px;">🤖 Why is my score ${Math.round(score)}?</div>
            ${data.ai_explanation || 'Your profile is being analyzed...'}
          </div>
        </div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px;">
          <div style="font-size:16px;font-weight:700;color:var(--navy);margin-bottom:16px;">Trust Score Breakdown</div>
          <div class="factor-list">
            ${Object.entries(factors).map(([key, val]) => `
              <div class="factor-item">
                <div class="factor-header">
                  <span class="factor-name">${key.charAt(0).toUpperCase()+key.slice(1).replace('_',' ')} ${key === 'identity' ? 'Verification' : key === 'documents' ? 'Authenticity' : key === 'profile' ? 'Completeness' : ''}</span>
                  <span class="factor-score">${Math.round(val)}%</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill ${val >= 80 ? 'green' : val >= 60 ? 'blue' : val >= 40 ? 'amber' : 'red'}" style="width:${val}%;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="card">
          <div style="font-size:16px;font-weight:700;color:var(--navy);margin-bottom:16px;">Profile Details</div>
          <div class="grid-2" style="gap:12px;">
            <div><div style="font-size:11px;color:var(--gray-400);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Organization</div><div style="font-size:13px;font-weight:600;color:var(--gray-700);margin-top:2px;">${data.profile?.organization || 'Not set'}</div></div>
            <div><div style="font-size:11px;color:var(--gray-400);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Job Title</div><div style="font-size:13px;font-weight:600;color:var(--gray-700);margin-top:2px;">${data.profile?.job_title || 'Not set'}</div></div>
            <div><div style="font-size:11px;color:var(--gray-400);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Location</div><div style="font-size:13px;font-weight:600;color:var(--gray-700);margin-top:2px;">${data.profile?.city || ''}${data.profile?.country ? ', '+data.profile?.country : ''}</div></div>
            <div><div style="font-size:11px;color:var(--gray-400);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Member Since</div><div style="font-size:13px;font-weight:600;color:var(--gray-700);margin-top:2px;">${data.created_at ? new Date(data.created_at).toLocaleDateString() : 'N/A'}</div></div>
          </div>
          <button class="btn btn-outline" style="margin-top:16px;" onclick="showProfileEditModal()">✏️ Edit Profile</button>
        </div>
      </div>
    </div>
  `;
}

function showProfileEditModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Edit Profile</div>
        <div class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Phone</label><input type="text" id="edit-phone" placeholder="+1-555-0000"></div>
        <div class="form-field"><label>City</label><input type="text" id="edit-city" placeholder="City"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Country</label><input type="text" id="edit-country" placeholder="Country"></div>
        <div class="form-field"><label>Organization</label><input type="text" id="edit-org" placeholder="Company"></div>
      </div>
      <div class="form-field"><label>Job Title</label><input type="text" id="edit-job" placeholder="Your role"></div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-blue" onclick="saveProfile(this.closest('.modal-overlay'))">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function saveProfile(overlay) {
  const data = {
    phone: document.getElementById('edit-phone').value,
    city: document.getElementById('edit-city').value,
    country: document.getElementById('edit-country').value,
    organization: document.getElementById('edit-org').value,
    job_title: document.getElementById('edit-job').value
  };
  try {
    await apiFetch('/api/user/profile', { method: 'PUT', body: JSON.stringify(data) });
    showToast('Profile updated!', 'success');
    overlay.remove();
    navigateTo('user-profile');
  } catch(e) { showToast(e.message, 'error'); }
}

async function renderUserVerification(content) {
  const ver = await apiFetch('/api/user/verification');
  const step = ver.step || 1;
  const steps = [
    { title: 'Personal Information', sub: ver.personal_info_status || 'pending', date: ver.personal_info_completed_at },
    { title: 'Identity Verification', sub: ver.identity_status || 'pending', date: ver.identity_completed_at },
    { title: 'Document Verification', sub: ver.document_status || 'pending', date: ver.document_completed_at },
    { title: 'Review', sub: ver.review_status || 'pending', date: ver.reviewed_at },
    { title: 'Verified', sub: ver.final_status || 'pending', date: ver.completed_at }
  ];

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Verification Center</h1>
        <p>Complete your identity verification to unlock full platform access.</p>
      </div>
      ${step <= 4 ? `<button class="btn btn-blue" onclick="proceedVerification(${step})">Continue Verification →</button>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:280px 1fr;gap:20px;">
      <div class="card">
        <div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:20px;">Verification Center</div>
        <div class="ver-stepper">
          ${steps.map((s, i) => {
            const idx = i + 1;
            const isDone = idx < step || (idx === 5 && ver.final_status === 'verified');
            const isActive = idx === step;
            return `
              <div class="ver-step">
                ${idx < steps.length ? '<div class="step-connector"></div>' : ''}
                <div class="step-icon ${isDone ? 'done' : isActive ? 'active' : 'pending'}">
                  ${isDone ? '✓' : isActive ? idx : idx}
                </div>
                <div class="step-body">
                  <div class="step-title">${s.title}</div>
                  <div class="step-status ${isDone ? 'done' : isActive ? 'active' : 'pending'}">
                    ${isDone ? 'Completed' : isActive ? 'In Progress' : 'Pending'}
                  </div>
                  ${s.date ? `<div style="font-size:10px;color:var(--gray-400);">${new Date(s.date).toLocaleDateString()}</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
      <div>
        ${step === 1 ? renderVerStep1() : step === 2 ? renderVerStep2() : step === 3 ? renderVerStep3() : step === 4 ? renderVerStep4() : renderVerComplete(ver)}
      </div>
    </div>
  `;
}

function renderVerStep1() {
  return `
    <div class="card">
      <div style="font-size:18px;font-weight:800;color:var(--navy);margin-bottom:4px;">Personal Information</div>
      <div style="font-size:13px;color:var(--gray-500);margin-bottom:20px;">Please provide your personal details for verification.</div>
      <div class="form-row">
        <div class="form-field"><label>First Name</label><input type="text" id="v-fname" class="form-input" placeholder="John"></div>
        <div class="form-field"><label>Last Name</label><input type="text" id="v-lname" class="form-input" placeholder="Doe"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Date of Birth</label><input type="date" id="v-dob" class="form-input"></div>
        <div class="form-field"><label>Nationality</label><input type="text" id="v-nat" class="form-input" placeholder="American"></div>
      </div>
      <div class="form-field"><label>Address</label><input type="text" id="v-addr" class="form-input" placeholder="123 Main St, City, State"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-blue" onclick="proceedVerification(1)">Next: Identity Verification →</button>
      </div>
    </div>`;
}

function renderVerStep2() {
  return `
    <div class="card">
      <div style="font-size:18px;font-weight:800;color:var(--navy);margin-bottom:4px;">Identity Verification</div>
      <div style="font-size:13px;color:var(--gray-500);margin-bottom:20px;">Verify your identity with a government-issued ID.</div>
      <div style="background:var(--success-light);border-radius:10px;padding:16px;margin-bottom:16px;display:flex;gap:12px;align-items:center;">
        <span style="font-size:24px;">✅</span>
        <div><div style="font-size:14px;font-weight:700;color:var(--success);">ID Verified</div><div style="font-size:12px;color:var(--gray-600);">Government ID matched successfully with our records.</div></div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-blue" onclick="proceedVerification(2)">Next: Document Verification →</button>
      </div>
    </div>`;
}

function renderVerStep3() {
  return `
    <div class="card">
      <div style="font-size:18px;font-weight:800;color:var(--navy);margin-bottom:4px;">Secure Document Upload</div>
      <div style="font-size:13px;color:var(--gray-500);margin-bottom:20px;">Please provide clear, legible copies. Supported: JPG, PNG, PDF.</div>
      ${[
        {name:'Identity Document', tag:'Required', desc:'Government-issued Passport, National ID, or Driver\'s License.', icon:'🪪'},
        {name:'Address Proof', tag:'Required', desc:"Utility bill or bank statement dated within the last 3 months.", icon:'📍'},
        {name:'Professional Certificate', tag:'Optional', desc:'Relevant industry certifications or licenses to expedite review.', icon:'🎓'}
      ].map(d => `
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--gray-50);border-radius:10px;border:1px solid var(--border);padding:14px 16px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;background:var(--primary-light);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">${d.icon}</div>
            <div>
              <div style="font-size:14px;font-weight:700;color:var(--gray-800);">${d.name} <span class="badge ${d.tag==='Required'?'danger':'info'}" style="font-size:10px;">${d.tag}</span></div>
              <div style="font-size:12px;color:var(--gray-500);">${d.desc}</div>
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:1.5px solid var(--gray-200);border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:var(--gray-700);background:white;">
            📤 Upload File
            <input type="file" style="display:none;" accept=".jpg,.jpeg,.png,.pdf">
          </label>
        </div>
      `).join('')}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;">
        <span style="font-size:12px;color:var(--gray-500);">🔒 All files are securely encrypted and stored.</span>
        <button class="btn btn-dark" onclick="proceedVerification(3)">Complete Verification</button>
      </div>
    </div>`;
}

function renderVerStep4() {
  return `
    <div class="card">
      <div style="font-size:18px;font-weight:800;color:var(--navy);margin-bottom:4px;">Under Review</div>
      <div style="font-size:13px;color:var(--gray-500);margin-bottom:20px;">Our team is reviewing your submitted documents.</div>
      <div style="background:var(--warning-light);border-radius:10px;padding:16px;display:flex;gap:12px;align-items:center;margin-bottom:16px;">
        <span style="font-size:24px;">⏳</span>
        <div><div style="font-size:14px;font-weight:700;color:#d97706;">Review in Progress</div><div style="font-size:12px;color:var(--gray-600);">Typical review time: 24-48 hours</div></div>
      </div>
      <button class="btn btn-blue" onclick="proceedVerification(4)">Mark as Reviewed (Demo)</button>
    </div>`;
}

function renderVerComplete(ver) {
  return `
    <div class="card" style="text-align:center;padding:40px;">
      <div style="font-size:60px;margin-bottom:16px;">🎉</div>
      <div style="font-size:22px;font-weight:800;color:var(--success);margin-bottom:8px;">Verification Complete!</div>
      <div style="font-size:14px;color:var(--gray-600);max-width:360px;margin:0 auto 20px;">Congratulations! Your identity has been fully verified. Your trust score has been updated.</div>
      <button class="btn btn-blue" onclick="navigateTo('user-dashboard')">Go to Dashboard</button>
    </div>`;
}

async function proceedVerification(step) {
  try {
    await apiFetch('/api/user/verification/step', { method: 'POST', body: JSON.stringify({ step }) });
    showToast(`Step ${step} completed!`, 'success');
    navigateTo('user-verification');
  } catch(e) { showToast(e.message, 'error'); }
}

async function renderUserDocuments(content) {
  const docs = await apiFetch('/api/user/documents');
  const docIcons = { identity: '🪪', address: '📍', education: '🎓', professional: '🏆', default: '📄' };
  
  content.innerHTML = `
    <div class="page-header">
      <div><h1>My Documents</h1><p>Securely store and manage your verification documents.</p></div>
      <button class="btn btn-blue" onclick="showUploadDocModal()">📤 Upload Document</button>
    </div>
    ${docs.length === 0 ? `
      <div class="card" style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:12px;">📁</div>
        <div style="font-size:16px;font-weight:700;color:var(--gray-700);margin-bottom:8px;">No documents yet</div>
        <div style="font-size:13px;color:var(--gray-500);margin-bottom:16px;">Upload your identity and verification documents to improve your trust score.</div>
        <button class="btn btn-blue" onclick="showUploadDocModal()">Upload First Document</button>
      </div>
    ` : `
      <div class="doc-grid">
        ${docs.map(doc => `
          <div class="doc-card">
            <div class="doc-card-header">
              <div class="doc-icon">${docIcons[doc.doc_type] || docIcons.default}</div>
              <div class="doc-actions">
                <div class="doc-action-btn" title="Download" onclick="showToast('Download started','info')">⬇️</div>
                <div class="doc-action-btn" title="Delete" onclick="deleteDoc(${doc.id})">🗑️</div>
              </div>
            </div>
            <div class="doc-name">${doc.name}</div>
            <div class="doc-type">${doc.doc_type.charAt(0).toUpperCase()+doc.doc_type.slice(1)} Document</div>
            <div class="doc-meta">
              <span class="badge ${doc.verification_status}">${doc.verification_status}</span>
              <span class="doc-date">${new Date(doc.uploaded_at).toLocaleDateString()}</span>
            </div>
            <div class="authenticity-bar">
              <div class="authenticity-label"><span>Authenticity Score</span><span>${doc.authenticity_score}%</span></div>
              <div class="progress-bar"><div class="progress-fill ${doc.authenticity_score >= 90 ? 'green' : doc.authenticity_score >= 70 ? 'blue' : 'amber'}" style="width:${doc.authenticity_score}%;"></div></div>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

function showUploadDocModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Upload Document</div>
        <div class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</div>
      </div>
      <div class="form-field">
        <label>Document Name</label>
        <input type="text" id="upload-name" class="form-input" placeholder="e.g. Passport">
      </div>
      <div class="form-field">
        <label>Document Type</label>
        <select id="upload-type" class="form-input">
          <option value="identity">Identity Document</option>
          <option value="address">Address Proof</option>
          <option value="education">Education Certificate</option>
          <option value="professional">Professional Certificate</option>
        </select>
      </div>
      <div class="form-field">
        <label>File</label>
        <div class="upload-zone" onclick="document.getElementById('upload-file').click()">
          <div class="upload-icon">📤</div>
          <div class="upload-title">Click to upload or drag & drop</div>
          <div class="upload-sub">JPG, PNG, PDF up to 10MB</div>
          <input type="file" id="upload-file" style="display:none;" accept=".jpg,.jpeg,.png,.pdf">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-blue" onclick="uploadDocument(this.closest('.modal-overlay'))">Upload</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function uploadDocument(overlay) {
  const name = document.getElementById('upload-name').value;
  const type = document.getElementById('upload-type').value;
  const file = document.getElementById('upload-file').files[0];
  if (!name || !file) { showToast('Please fill all fields and select a file', 'error'); return; }
  const formData = new FormData();
  formData.append('file', file);
  try {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const resp = await fetch(`/api/user/documents/upload?doc_type=${type}&doc_name=${encodeURIComponent(name)}`, { method: 'POST', headers, body: formData });
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail); }
    showToast('Document uploaded successfully!', 'success');
    overlay.remove();
    navigateTo('user-documents');
  } catch(e) { showToast(e.message, 'error'); }
}

async function deleteDoc(id) {
  if (!confirm('Delete this document?')) return;
  try {
    await apiFetch(`/api/user/documents/${id}`, { method: 'DELETE' });
    showToast('Document deleted', 'success');
    navigateTo('user-documents');
  } catch(e) { showToast(e.message, 'error'); }
}

async function renderUserInsights(content) {
  const data = await apiFetch('/api/user/insights');
  const recs = data.recommendations || [];
  const strengths = data.strengths || [];
  const improvements = data.improvements || [];
  
  content.innerHTML = `
    <div class="page-header">
      <div><h1>TrustIQ Insights</h1><p>AI-powered analysis of your trust profile.</p></div>
    </div>
    <div style="background:linear-gradient(135deg,var(--primary),#6366f1);border-radius:16px;padding:20px 24px;color:white;margin-bottom:20px;display:flex;align-items:center;gap:16px;">
      <div style="font-size:36px;">🤖</div>
      <div>
        <div style="font-size:16px;font-weight:700;margin-bottom:4px;">AI Trust Summary</div>
        <div style="font-size:13px;opacity:0.9;line-height:1.7;">${data.ai_summary || 'Analyzing your profile...'}</div>
      </div>
    </div>
    <div class="grid-2" style="margin-bottom:16px;">
      <div class="card">
        <div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:12px;">✅ Trust Strengths</div>
        ${strengths.length ? strengths.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);">
            <span style="font-size:13px;font-weight:600;color:var(--gray-700);">${s.factor}</span>
            <span style="font-size:13px;font-weight:700;color:var(--success);">${Math.round(s.score)}%</span>
          </div>
        `).join('') : '<div style="font-size:13px;color:var(--gray-500);">Complete your verification to see strengths.</div>'}
      </div>
      <div class="card">
        <div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:12px;">⚡ Areas to Improve</div>
        ${improvements.length ? improvements.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);">
            <span style="font-size:13px;font-weight:600;color:var(--gray-700);">${s.factor}</span>
            <span style="font-size:13px;font-weight:700;color:var(--warning);">${Math.round(s.score)}%</span>
          </div>
        `).join('') : '<div style="font-size:13px;color:var(--gray-500);">Great job! No weak areas detected.</div>'}
      </div>
    </div>
    <div class="card">
      <div style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:14px;">🔒 Security Recommendations</div>
      ${recs.map(r => `
        <div style="display:flex;gap:12px;padding:12px;border-radius:10px;background:${r.priority==='high'?'#fef2f2':r.priority==='medium'?'#fffbeb':'#f0fdf4'};margin-bottom:8px;align-items:flex-start;">
          <span style="font-size:18px;">${r.type==='security'?'🔒':r.type==='verification'?'✅':r.type==='documents'?'📁':'💡'}</span>
          <div>
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${r.priority==='high'?'var(--danger)':r.priority==='medium'?'var(--warning)':'var(--success)'};margin-bottom:4px;">${r.priority} priority</div>
            <div style="font-size:13px;color:var(--gray-700);">${r.message}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function renderUserActivity(content) {
  const activities = await apiFetch('/api/user/activity');
  const actionMap = {
    'verified': { icon: '✅', color: 'var(--success-light)', iconColor: 'var(--success)' },
    'document_uploaded': { icon: '📤', color: '#f0f9ff', iconColor: 'var(--accent)' },
    'document_deleted': { icon: '🗑️', color: 'var(--danger-light)', iconColor: 'var(--danger)' },
    'profile_updated': { icon: '✏️', color: '#f5f3ff', iconColor: '#7c3aed' },
    'login': { icon: '🔑', color: var_gray50(), iconColor: 'var(--gray-500)' },
    'password_changed': { icon: '🔒', color: 'var(--warning-light)', iconColor: 'var(--warning)' },
    'security_changed': { icon: '🛡️', color: 'var(--primary-light)', iconColor: 'var(--primary)' },
    'verification_step': { icon: '🔄', color: 'var(--primary-light)', iconColor: 'var(--primary)' },
    'account_created': { icon: '🎉', color: 'var(--success-light)', iconColor: 'var(--success)' },
  };
  function var_gray50() { return '#f9fafb'; }
  
  content.innerHTML = `
    <div class="page-header"><div><h1>Activity Timeline</h1><p>Your personal account activity log.</p></div></div>
    <div class="card">
      ${activities.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--gray-400);">No activity recorded yet.</div>' : `
        <div class="timeline">
          ${activities.map((a, i) => {
            const info = actionMap[a.action] || { icon: '📌', color: 'var(--gray-100)', iconColor: 'var(--gray-500)' };
            return `
              <div class="timeline-item">
                ${i < activities.length - 1 ? '<div class="timeline-line"></div>' : ''}
                <div class="timeline-dot" style="background:${info.color};">${info.icon}</div>
                <div class="timeline-body">
                  <div class="timeline-action">${a.description || a.action}</div>
                  <div class="timeline-time">${timeAgo(a.created_at)}${a.ip_address ? ' · ' + a.ip_address : ''}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = (now - date) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
  return date.toLocaleDateString();
}

async function renderUserSecurity(content) {
  const data = await apiFetch('/api/user/security');
  content.innerHTML = `
    <div class="page-header"><div><h1>Security</h1><p>Manage your account security and access settings.</p></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div style="font-size:15px;font-weight:700;color:var(--navy);">Security Status</div>
          <span class="badge ${data.security_level === 'Strong' ? 'success' : 'warning'}">${data.security_level}</span>
        </div>
        <div style="background:${data.security_level === 'Strong' ? 'var(--success-light)' : 'var(--warning-light)'};border-radius:10px;padding:14px;margin-bottom:14px;">
          <div style="font-size:24px;margin-bottom:6px;">🛡️</div>
          <div style="font-size:14px;font-weight:700;color:var(--gray-800);">Your account is ${data.security_level === 'Strong' ? 'well protected' : 'moderately secure'}</div>
          <div style="font-size:12px;color:var(--gray-600);margin-top:4px;">${data.security_level === 'Strong' ? '2FA enabled and password is strong.' : 'Enable 2FA to strengthen security.'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--gray-50);border-radius:8px;border:1px solid var(--border);">
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--gray-700);">Two-Factor Authentication</div>
              <div style="font-size:11px;color:var(--gray-500);">${data.two_fa_enabled ? 'Currently enabled' : 'Not enabled'}</div>
            </div>
            <button class="btn ${data.two_fa_enabled ? 'btn-danger' : 'btn-success'} btn-xs" onclick="toggle2FA()">${data.two_fa_enabled ? 'Disable' : 'Enable'}</button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--gray-50);border-radius:8px;border:1px solid var(--border);">
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--gray-700);">Change Password</div>
              <div style="font-size:11px;color:var(--gray-500);">Update your account password</div>
            </div>
            <button class="btn btn-outline btn-xs" onclick="showChangePasswordModal()">Change</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:16px;">Login History</div>
        ${data.login_history.length ? data.login_history.slice(0,6).map(l => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:16px;">🔑</span>
              <div>
                <div style="font-size:12px;font-weight:600;color:var(--gray-700);">Signed in</div>
                <div style="font-size:11px;color:var(--gray-400);">${l.ip_address || 'Unknown IP'}</div>
              </div>
            </div>
            <div style="font-size:11px;color:var(--gray-400);">${timeAgo(l.created_at)}</div>
          </div>
        `).join('') : '<div style="font-size:13px;color:var(--gray-400);">No login history available.</div>'}
      </div>
    </div>
  `;
}

async function toggle2FA() {
  try {
    const r = await apiFetch('/api/user/security/toggle-2fa', { method: 'POST' });
    showToast(r.message, 'success');
    navigateTo('user-security');
  } catch(e) { showToast(e.message, 'error'); }
}

function showChangePasswordModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Change Password</div>
        <div class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</div>
      </div>
      <div class="form-field"><label>Current Password</label><input type="password" id="cp-current" class="form-input" placeholder="Current password"></div>
      <div class="form-field"><label>New Password</label><input type="password" id="cp-new" class="form-input" placeholder="Min. 8 characters"></div>
      <div class="form-field"><label>Confirm New Password</label><input type="password" id="cp-confirm" class="form-input" placeholder="Confirm new password"></div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn btn-blue" onclick="changePassword(this.closest('.modal-overlay'))">Update Password</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function changePassword(overlay) {
  const current = document.getElementById('cp-current').value;
  const newPass = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-confirm').value;
  if (newPass !== confirm) { showToast('Passwords do not match', 'error'); return; }
  try {
    await apiFetch('/api/user/security/change-password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: newPass }) });
    showToast('Password changed successfully!', 'success');
    overlay.remove();
  } catch(e) { showToast(e.message, 'error'); }
}

// ==================== ADMIN PAGES ====================
async function renderAdminDashboard(content) {
  const data = await apiFetch('/api/admin/dashboard');
  const kpis = data.kpis;
  const dist = data.trust_distribution;
  const funnel = data.verification_funnel;
  const trend = data.risk_trend;

  content.innerHTML = `
    <div class="page-header">
      <div><h1>Command Center</h1><p>Monitor trust, verification, and risk across your ecosystem.</p></div>
      <div class="header-actions">
        <button class="btn btn-outline" onclick="navigateTo('admin-dashboard')">↺ Refresh Data</button>
        <button class="btn btn-outline" onclick="showToast('Export initiated','info')">⬇ Export</button>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Overall Trust Index <span style="font-size:14px;">↗</span></div>
        <div class="kpi-value">${kpis.overall_trust_index}</div>
        <div class="kpi-trend trend-up">↗ +4.8%</div>
        <div class="kpi-bottom-bar green"></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Verified Entities <span style="font-size:14px;color:var(--success);">✓</span></div>
        <div class="kpi-value">${kpis.verified_entities.toLocaleString()}</div>
        <div class="kpi-trend trend-up">↗ +12.6%</div>
        <div class="kpi-bottom-bar"></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">High-Risk Entities <span style="font-size:14px;color:var(--warning);">⚠</span></div>
        <div class="kpi-value">${kpis.high_risk_entities.toLocaleString()}</div>
        <div class="kpi-trend trend-down">↘ -7.2%</div>
        <div class="kpi-bottom-bar red"></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:180px 1fr;gap:16px;margin-bottom:16px;">
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${[
          {label:'PENDING VERIFICATION',val:kpis.pending_verification,icon:'📋',color:'#f0f4ff'},
          {label:'ACTIVE INVESTIGATIONS',val:kpis.active_investigations,icon:'🔍',color:'#fdf4ff'},
          {label:'FRAUD SIGNALS DETECTED',val:kpis.fraud_signals_detected,icon:'⚠️',color:'#fef2f2',red:true},
        ].map(k => `
          <div class="kpi-card" style="padding:14px;">
            <div class="kpi-label" style="font-size:10px;">${k.label}</div>
            <div class="kpi-value" style="font-size:24px;${k.red?'color:var(--danger);':''}">${k.val}</div>
            <div style="position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:8px;background:${k.color};display:flex;align-items:center;justify-content:center;font-size:15px;">${k.icon}</div>
          </div>
        `).join('')}
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <div class="chart-title">Trust Score Distribution</div>
          <div style="font-size:18px;color:var(--gray-400);">⋮</div>
        </div>
        <div style="display:flex;align-items:center;gap:20px;">
          <div style="position:relative;width:160px;height:160px;flex-shrink:0;">
            <canvas id="donutChart" width="160" height="160"></canvas>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
              <div style="font-size:26px;font-weight:900;color:var(--navy);">${Math.round(dist.avg_score || 92)}</div>
              <div style="font-size:10px;color:var(--gray-400);font-weight:600;">Avg Score</div>
            </div>
          </div>
          <div class="donut-legend" style="flex:1;">
            <div class="legend-item">
              <div class="legend-dot" style="background:#10b981;"></div>
              <div class="legend-label">High Trust (80-100)</div>
              <div class="legend-value">${dist.high} <span style="color:var(--gray-400);font-weight:400;font-size:12px;">68%</span></div>
            </div>
            <div class="legend-item">
              <div class="legend-dot" style="background:#1a56db;"></div>
              <div class="legend-label">Medium Trust (50-79)</div>
              <div class="legend-value">${dist.medium} <span style="color:var(--gray-400);font-weight:400;font-size:12px;">24%</span></div>
            </div>
            <div class="legend-item">
              <div class="legend-dot" style="background:#f59e0b;"></div>
              <div class="legend-label">Low Trust (0-49)</div>
              <div class="legend-value">${dist.low} <span style="color:var(--gray-400);font-weight:400;font-size:12px;">8%</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="chart-card">
        <div class="chart-header">
          <div class="chart-title">Risk Trend</div>
          <div class="chart-controls">
            <div class="chart-btn active">7D</div>
            <div class="chart-btn" onclick="showToast('30D view coming soon','info')">30D</div>
          </div>
        </div>
        <div style="height:180px;"><canvas id="riskTrendChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header">
          <div class="chart-title">Verification Funnel</div>
          <div style="font-size:16px;color:var(--gray-400);">≡</div>
        </div>
        <div style="margin-top:8px;">
          ${[
            {label:'Initiated', pct:100, count:1240, color:'var(--primary)'},
            {label:'Doc Submitted', pct:85, count:1054, color:'var(--primary)'},
            {label:'Review Passed', pct:62, count:768, color:'var(--success)'},
            {label:'Fully Verified', pct:Math.round((funnel.fully_verified/1240)*100)||58, count:funnel.fully_verified, color:'var(--success)'},
          ].map(f => `
            <div class="funnel-item">
              <div class="funnel-header"><span class="funnel-label">${f.label}</span><span class="funnel-pct">${f.pct}% (${f.count.toLocaleString()})</span></div>
              <div class="progress-bar"><div class="progress-fill" style="width:${f.pct}%;background:${f.color};"></div></div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  
  createDonutChart('donutChart',
    ['High Trust', 'Medium Trust', 'Low Trust'],
    [dist.high || 68, dist.medium || 24, dist.low || 8],
    ['#10b981', '#1a56db', '#f59e0b']
  );
  
  createLineChart('riskTrendChart',
    trend.map(t => t.day),
    [{
      data: trend.map(t => t.value),
      borderColor: '#1a56db',
      backgroundColor: 'rgba(26,86,219,0.08)',
      fill: true,
      borderWidth: 2
    }],
    { yAxis: { min: 0, max: 100 } }
  );
}

async function renderAdminAnalytics(content) {
  const data = await apiFetch('/api/admin/analytics');
  content.innerHTML = `
    <div class="page-header"><div><h1>Trust Analytics</h1><p>Deep insights into platform trust and verification patterns.</p></div>
      <button class="btn btn-outline" onclick="showToast('Export initiated','info')">⬇ Export</button>
    </div>
    <div class="grid-3" style="margin-bottom:20px;">
      <div class="kpi-card">
        <div class="kpi-label">Avg Trust Score</div>
        <div class="kpi-value">${data.avg_trust_score}</div>
        <div class="kpi-trend trend-up">↗ Platform average</div>
        <div class="kpi-bottom-bar green"></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Users</div>
        <div class="kpi-value">${data.total_users}</div>
        <div class="kpi-trend trend-up">↗ Growing</div>
        <div class="kpi-bottom-bar"></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Fraud Detection Rate</div>
        <div class="kpi-value">${data.fraud_detection_rate}%</div>
        <div class="kpi-trend trend-up">↗ AI-powered</div>
        <div class="kpi-bottom-bar green"></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="chart-card">
        <div class="chart-header"><div class="chart-title">Monthly Registrations</div></div>
        <div style="height:200px;"><canvas id="regChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><div class="chart-title">Verification Rate Trend</div></div>
        <div style="height:200px;"><canvas id="verChart"></canvas></div>
      </div>
    </div>
    <div class="chart-card">
      <div class="chart-header"><div class="chart-title">Fraud Detection Activity</div><div class="chart-controls"><div class="chart-btn active">Weekly</div></div></div>
      <div style="height:180px;"><canvas id="fraudChart"></canvas></div>
    </div>
  `;
  
  createBarChart('regChart', data.monthly_registrations.map(m=>m.month), [{
    data: data.monthly_registrations.map(m=>m.count),
    backgroundColor: 'rgba(26,86,219,0.8)',
    borderRadius: 6
  }]);
  
  createLineChart('verChart',
    data.monthly_registrations.map(m=>m.month),
    [{
      label: 'Verification Rate',
      data: data.monthly_registrations.map(()=>Math.round(50 + Math.random() * 30)),
      borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: true, borderWidth: 2
    }]
  );
  
  createBarChart('fraudChart', ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], [{
    data: [23,45,32,67,54,28,41],
    backgroundColor: 'rgba(239,68,68,0.7)',
    borderRadius: 4
  }]);
}

async function renderAdminUsers(content) {
  const data = await apiFetch('/api/admin/users?page=1&limit=20');
  const users = data.users || [];
  
  content.innerHTML = `
    <div class="page-header">
      <div><h1>User Management</h1><p>Monitor and manage platform users.</p></div>
      <button class="btn btn-blue" onclick="showToast('Create user feature coming soon','info')">+ Add User</button>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <input type="text" placeholder="🔍 Search by name or email..." class="filter-input" style="flex:1;min-width:200px;" onkeyup="filterUsers(this.value)">
        <select class="filter-input" onchange="filterUsersByStatus(this.value)">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select class="filter-input">
          <option>All Verification</option>
          <option>Verified</option>
          <option>Unverified</option>
          <option>Pending</option>
        </select>
      </div>
    </div>
    <div class="card" style="padding:0;">
      <div class="table-wrapper">
        <table id="users-table">
          <thead><tr>
            <th>Name</th><th>Email</th><th>Organization</th><th>Trust Score</th>
            <th>Risk Score</th><th>Verification</th><th>Status</th><th>Last Active</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>
                  <div class="entity-info">
                    <div class="entity-avatar" style="background:${getAvatarColor(u.name)};">${(u.name||'?').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}</div>
                    <div class="entity-name">${u.name}</div>
                  </div>
                </td>
                <td>${u.email}</td>
                <td>${u.organization || '—'}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-weight:700;color:${u.trust_score >= 80 ? 'var(--success)' : u.trust_score >= 50 ? 'var(--primary)' : 'var(--danger)'};">${Math.round(u.trust_score)}</span>
                    <span style="font-size:11px;color:var(--gray-400);">/100</span>
                  </div>
                </td>
                <td><span style="font-weight:700;color:${u.risk_score > 60 ? 'var(--danger)' : u.risk_score > 40 ? 'var(--warning)' : 'var(--success)'};">${Math.round(u.risk_score)}</span></td>
                <td><span class="badge ${u.verification_status}">${u.verification_status}</span></td>
                <td><span class="badge ${u.is_suspended ? 'danger' : 'success'}">${u.is_suspended ? 'Suspended' : 'Active'}</span></td>
                <td style="font-size:11px;color:var(--gray-400);">${timeAgo(u.last_login)}</td>
                <td>
                  <div style="display:flex;gap:6px;">
                    <button class="btn-xs primary" onclick="viewUser(${u.id})">View</button>
                    <button class="btn-xs ${u.is_suspended?'success':'danger'}" onclick="suspendUser(${u.id},${u.is_suspended})">${u.is_suspended?'Unsuspend':'Suspend'}</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="pagination">
      <div class="page-btn">‹</div>
      <div class="page-btn active">1</div>
      <div class="page-btn">2</div>
      <div class="page-btn">3</div>
      <div class="page-btn">›</div>
    </div>
  `;
}

function getAvatarColor(name) {
  const colors = ['#1a56db','#7c3aed','#059669','#dc2626','#d97706','#0891b2','#db2777'];
  const idx = (name||'').charCodeAt(0) % colors.length;
  return colors[idx];
}

async function viewUser(id) {
  try {
    const data = await apiFetch(`/api/admin/users/${id}`);
    const u = data.user;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:600px;max-height:80vh;overflow-y:auto;">
        <div class="modal-header">
          <div class="modal-title">User Profile: ${u.name}</div>
          <div class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</div>
        </div>
        <div style="display:flex;gap:16px;margin-bottom:16px;">
          <div style="flex:1;padding:14px;background:var(--gray-50);border-radius:10px;">
            <div style="font-size:11px;color:var(--gray-400);font-weight:600;text-transform:uppercase;">Trust Score</div>
            <div style="font-size:24px;font-weight:900;color:var(--navy);">${Math.round(u.trust_score)}/100</div>
          </div>
          <div style="flex:1;padding:14px;background:var(--gray-50);border-radius:10px;">
            <div style="font-size:11px;color:var(--gray-400);font-weight:600;text-transform:uppercase;">Risk Score</div>
            <div style="font-size:24px;font-weight:900;color:${u.risk_score > 60 ? 'var(--danger)' : 'var(--success)'};">${Math.round(u.risk_score)}/100</div>
          </div>
          <div style="flex:1;padding:14px;background:var(--gray-50);border-radius:10px;">
            <div style="font-size:11px;color:var(--gray-400);font-weight:600;text-transform:uppercase;">Verification</div>
            <div style="font-size:14px;font-weight:700;margin-top:4px;"><span class="badge ${u.verification_status}">${u.verification_status}</span></div>
          </div>
        </div>
        <div style="font-size:13px;color:var(--gray-600);margin-bottom:8px;"><strong>AI Risk Analysis:</strong> ${data.ai_risk_explanation}</div>
        <div style="font-size:13px;font-weight:700;color:var(--gray-800);margin:12px 0 8px;">Recent Activity</div>
        ${data.activities.slice(0,5).map(a => `
          <div style="padding:8px 0;border-bottom:1px solid var(--gray-100);font-size:12px;color:var(--gray-600);">
            ${a.description || a.action} <span style="color:var(--gray-400);">· ${timeAgo(a.created_at)}</span>
          </div>
        `).join('')}
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Close</button>
          <button class="btn btn-danger" onclick="createInvestigation(${u.id}, '${u.name}', this.closest('.modal-overlay'))">🔍 Investigate</button>
          <button class="btn btn-blue" onclick="this.closest('.modal-overlay').remove();navigateTo('admin-risk')">View Risk Profile</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } catch(e) { showToast(e.message, 'error'); }
}

async function suspendUser(id, isSuspended) {
  const action = isSuspended ? 'unsuspend' : 'suspend';
  if (!confirm(`Are you sure you want to ${action} this user?`)) return;
  try {
    await apiFetch(`/api/admin/users/${id}/suspend`, { method: 'POST' });
    showToast(`User ${action}ed successfully`, 'success');
    navigateTo('admin-users');
  } catch(e) { showToast(e.message, 'error'); }
}

async function createInvestigation(userId, name, overlay) {
  try {
    await apiFetch('/api/admin/investigations', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, title: `Investigation: ${name}`, description: 'Manual investigation initiated from user profile', priority: 'high' })
    });
    showToast('Investigation created!', 'success');
    if (overlay) overlay.remove();
    navigateTo('admin-investigations');
  } catch(e) { showToast(e.message, 'error'); }
}

async function renderAdminEntities(content) {
  await renderAdminUsers(content);
}

async function renderAdminVerifications(content) {
  const data = await apiFetch('/api/admin/verifications');
  const stats = data.stats;
  content.innerHTML = `
    <div class="page-header"><div><h1>Verification Center</h1><p>Review and manage all verification requests.</p></div></div>
    <div class="grid-3" style="margin-bottom:20px;">
      <div class="kpi-card"><div class="kpi-label">Pending</div><div class="kpi-value" style="color:var(--warning);">${stats.pending}</div><div class="kpi-bottom-bar orange"></div></div>
      <div class="kpi-card"><div class="kpi-label">Completed</div><div class="kpi-value" style="color:var(--success);">${stats.completed}</div><div class="kpi-bottom-bar green"></div></div>
      <div class="kpi-card"><div class="kpi-label">Rejected</div><div class="kpi-value" style="color:var(--danger);">${stats.rejected}</div><div class="kpi-bottom-bar red"></div></div>
    </div>
    <div class="card" style="padding:0;">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>User</th><th>Email</th><th>Step</th><th>Status</th><th>Identity</th><th>Documents</th><th>Submitted</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.verifications.map(v => `
              <tr>
                <td><div class="entity-name">${v.name}</div></td>
                <td style="font-size:12px;">${v.email}</td>
                <td><span style="font-size:12px;font-weight:600;color:var(--primary);">Step ${v.step}/5</span></td>
                <td><span class="badge ${v.status === 'completed' ? 'success' : v.status === 'rejected' ? 'danger' : 'warning'}">${v.status}</span></td>
                <td><span class="badge ${v.identity_status === 'verified' ? 'success' : 'pending'}">${v.identity_status || 'pending'}</span></td>
                <td><span class="badge ${v.document_status === 'verified' ? 'success' : 'pending'}">${v.document_status || 'pending'}</span></td>
                <td style="font-size:11px;color:var(--gray-400);">${timeAgo(v.created_at)}</td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn-xs success" onclick="reviewVerification(${v.id},'approve')">Approve</button>
                    <button class="btn-xs danger" onclick="reviewVerification(${v.id},'reject')">Reject</button>
                    <button class="btn-xs outline" onclick="reviewVerification(${v.id},'request_info')">Info</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function reviewVerification(id, action) {
  const notes = action === 'reject' ? prompt('Rejection reason (optional):') : null;
  try {
    await apiFetch(`/api/admin/verifications/${id}/review`, {
      method: 'POST', body: JSON.stringify({ action, notes })
    });
    showToast(`Verification ${action}d successfully!`, 'success');
    navigateTo('admin-verifications');
  } catch(e) { showToast(e.message, 'error'); }
}

async function renderAdminRisk(content) {
  const data = await apiFetch('/api/admin/risk-intelligence');
  const entities = data.entities || [];
  const dist = data.risk_distribution || {};
  
  content.innerHTML = `
    <div class="page-header">
      <div><h1>Risk Intelligence</h1><p>Global entity risk overview and high-severity anomaly detection.</p></div>
      <button class="btn btn-outline" onclick="showToast('Exporting risk report...','info')">⬇ Export Report</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 300px;gap:16px;margin-bottom:20px;">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-size:15px;font-weight:700;color:var(--navy);">Global Risk Map</div>
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--danger);font-weight:600;"><div style="width:8px;height:8px;border-radius:50%;background:var(--danger);"></div> High Risk</div>
        </div>
        <div class="risk-map" style="min-height:220px;">
          <div class="risk-map-grid"></div>
          <div class="risk-dot" style="width:20px;height:20px;background:var(--danger);top:38%;left:38%;">·</div>
          <div class="risk-dot" style="width:14px;height:14px;background:#f59e0b;top:55%;left:65%;">·</div>
          <div class="risk-dot" style="width:12px;height:12px;background:#1a56db;top:25%;left:55%;">·</div>
          <div class="risk-dot" style="width:16px;height:16px;background:#ea580c;top:65%;left:28%;">·</div>
          <div class="risk-dot" style="width:10px;height:10px;background:var(--success);top:45%;left:78%;">·</div>
          <div class="risk-map-label">🗺️ Geospatial Risk Visualization Active</div>
        </div>
      </div>
      <div class="card">
        <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:16px;">Risk Distribution</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${Object.entries(dist).map(([key, val]) => `
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span style="font-size:13px;color:var(--gray-700);">${key.charAt(0).toUpperCase()+key.slice(1).replace('_',' ')}</span>
                <span style="font-size:13px;font-weight:700;color:${key==='identity_fraud'?'var(--danger)':key==='behavioral'?'var(--warning)':key==='transaction'?'var(--primary)':key==='document'?'var(--accent)':'var(--gray-500)'};">${val}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill ${key==='identity_fraud'?'red':key==='behavioral'?'amber':key==='transaction'?'blue':'blue'}" style="width:${val}%;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="font-size:16px;font-weight:700;color:var(--navy);">High-Risk Entities</div>
      <input type="text" placeholder="🔍 Search entities..." class="filter-input" style="width:220px;">
    </div>
    <div class="card" style="padding:0;">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Entity Name</th><th>Severity</th><th>Risk Type</th><th>Trust Score</th><th>Risk Score</th><th>Last Activity</th><th>Action</th></tr></thead>
          <tbody>
            ${entities.slice(0,8).map(e => `
              <tr>
                <td>
                  <div class="entity-info">
                    <div class="entity-avatar" style="background:${getAvatarColor(e.name)};">${(e.name||'?').split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()}</div>
                    <div>
                      <div class="entity-name">${e.name}</div>
                      <div class="entity-email">${e.email}</div>
                    </div>
                  </div>
                </td>
                <td><span class="badge ${e.severity.toLowerCase()}">${e.severity}</span></td>
                <td style="font-size:13px;color:var(--gray-700);">${e.risk_type}</td>
                <td>
                  <span style="font-weight:700;color:${e.trust_score >= 70 ? 'var(--success)' : e.trust_score >= 40 ? 'var(--warning)' : 'var(--danger)'};">${Math.round(e.trust_score)}</span>
                  <span style="font-size:11px;color:var(--gray-400);">/100</span>
                </td>
                <td>
                  <span style="font-weight:700;color:${e.risk_score > 60 ? 'var(--danger)' : e.risk_score > 40 ? 'var(--warning)' : 'var(--success)'};">${Math.round(e.risk_score)}</span>
                  <span style="font-size:11px;color:var(--gray-400);">/100</span>
                </td>
                <td style="font-size:11px;color:var(--gray-500);">${timeAgo(e.last_activity)}</td>
                <td>
                  ${e.severity === 'Low' || e.severity === 'low' ?
                    `<button class="btn-xs outline" onclick="viewUser(${e.id})">View Profile</button>` :
                    `<button class="btn-xs primary" onclick="createInvestigation(${e.id},'${e.name}',null)">Investigate</button>`
                  }
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:12px;color:var(--gray-500);">
      Showing 1 to ${Math.min(entities.length,8)} of ${data.total} high-risk entities
      <div class="pagination" style="margin-top:0;">
        <div class="page-btn">‹</div>
        <div class="page-btn active">1</div>
        <div class="page-btn">2</div>
        <div class="page-btn">3</div>
        <div class="page-btn">›</div>
      </div>
    </div>
  `;
}

async function renderAdminFraud(content) {
  content.innerHTML = `
    <div class="page-header"><div><h1>Fraud Detection</h1><p>AI-powered fraud pattern detection and signal analysis.</p></div></div>
    <div class="grid-4" style="margin-bottom:20px;">
      ${[
        {label:'Identity Synthesis',count:47,trend:'+23%',color:'danger'},
        {label:'Doc Alteration',count:22,trend:'-8%',color:'warning'},
        {label:'Velocity Fraud',count:31,trend:'+12%',color:'danger'},
        {label:'Behavioral Anomaly',count:18,trend:'stable',color:'info'},
      ].map(f => `
        <div class="kpi-card">
          <div class="kpi-label">${f.label}</div>
          <div class="kpi-value">${f.count}</div>
          <div class="kpi-trend ${f.trend.startsWith('+') ? 'trend-up' : f.trend.startsWith('-') ? 'trend-down' : ''}">
            ${f.trend.startsWith('+') ? '↗' : f.trend.startsWith('-') ? '↘' : '→'} ${f.trend}
          </div>
          <div class="kpi-bottom-bar ${f.color === 'danger' ? 'red' : f.color === 'warning' ? 'orange' : ''}"></div>
        </div>
      `).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="chart-card">
        <div class="chart-header"><div class="chart-title">Fraud Signal Timeline</div></div>
        <div style="height:200px;"><canvas id="fraudTimelineChart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-header"><div class="chart-title">Fraud Type Distribution</div></div>
        <div style="display:flex;align-items:center;gap:16px;height:200px;">
          <canvas id="fraudPieChart" width="160" height="160"></canvas>
          <div class="donut-legend">
            <div class="legend-item"><div class="legend-dot" style="background:#ef4444;"></div><span class="legend-label">Identity</span><span class="legend-value">47%</span></div>
            <div class="legend-item"><div class="legend-dot" style="background:#f59e0b;"></div><span class="legend-label">Velocity</span><span class="legend-value">31%</span></div>
            <div class="legend-item"><div class="legend-dot" style="background:#1a56db;"></div><span class="legend-label">Document</span><span class="legend-value">22%</span></div>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:14px;">Recent Fraud Signals</div>
      ${[
        {name:'Acme Corp Ltd.', type:'Identity Synthesis', score:92, time:'2 mins ago', sev:'critical'},
        {name:'Global Ventures', type:'Transaction Velocity', score:85, time:'15 mins ago', sev:'high'},
        {name:'Nexus Logistics', type:'Doc Alteration', score:68, time:'1 hour ago', sev:'medium'},
        {name:'DataStream Inc.', type:'Behavioral Drift', score:44, time:'3 hours ago', sev:'low'},
      ].map(f => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--gray-100);">
          <div class="entity-info">
            <div class="entity-avatar" style="background:${getAvatarColor(f.name)};">${f.name.slice(0,2).toUpperCase()}</div>
            <div>
              <div class="entity-name">${f.name}</div>
              <div class="entity-email">${f.type}</div>
            </div>
          </div>
          <span class="badge ${f.sev}">${f.sev}</span>
          <span style="font-size:13px;font-weight:700;color:var(--danger);">${f.score}/100</span>
          <span style="font-size:11px;color:var(--gray-400);">${f.time}</span>
          <button class="btn-xs primary">Investigate</button>
        </div>
      `).join('')}
    </div>
  `;
  
  createLineChart('fraudTimelineChart',
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    [{
      data: [12,23,18,34,28,41,52],
      borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', fill: true, borderWidth: 2
    }]
  );
  createDonutChart('fraudPieChart', ['Identity','Velocity','Document'], [47,31,22], ['#ef4444','#f59e0b','#1a56db']);
}

async function renderAdminDocuments(content) {
  const docs = await apiFetch('/api/admin/documents');
  content.innerHTML = `
    <div class="page-header"><div><h1>Document Management</h1><p>Review and verify all submitted documents.</p></div></div>
    <div class="card" style="padding:0;">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Document</th><th>Owner</th><th>Type</th><th>Authenticity</th><th>Status</th><th>Uploaded</th><th>Action</th></tr></thead>
          <tbody>
            ${docs.map(d => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:20px;">📄</span>
                    <div class="entity-name">${d.name}</div>
                  </div>
                </td>
                <td>
                  <div class="entity-name">${d.owner_name}</div>
                  <div class="entity-email">${d.owner_email}</div>
                </td>
                <td style="font-size:12px;color:var(--gray-600);">${d.doc_type}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <div class="progress-bar" style="width:60px;"><div class="progress-fill ${d.authenticity_score >= 90 ? 'green' : d.authenticity_score >= 70 ? 'blue' : 'amber'}" style="width:${d.authenticity_score}%;"></div></div>
                    <span style="font-size:12px;font-weight:700;">${d.authenticity_score}%</span>
                  </div>
                </td>
                <td><span class="badge ${d.verification_status}">${d.verification_status}</span></td>
                <td style="font-size:11px;color:var(--gray-400);">${timeAgo(d.uploaded_at)}</td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn-xs success" onclick="verifyDocument(${d.id},'approve')">Verify</button>
                    <button class="btn-xs danger" onclick="verifyDocument(${d.id},'reject')">Reject</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function verifyDocument(id, action) {
  try {
    await apiFetch(`/api/admin/documents/${id}/verify?action=${action}`, { method: 'POST' });
    showToast(`Document ${action === 'approve' ? 'verified' : 'rejected'}!`, action === 'approve' ? 'success' : 'warning');
    navigateTo('admin-documents');
  } catch(e) { showToast(e.message, 'error'); }
}

async function renderAdminAlerts(content) {
  const alerts = await apiFetch('/api/admin/alerts');
  content.innerHTML = `
    <div class="page-header"><div><h1>Alerts &amp; Investigations</h1><p>Monitor and respond to security alerts.</p></div></div>
    <div class="tabs">
      <div class="tab active" onclick="filterAlerts('all',this)">All (${alerts.length})</div>
      <div class="tab" onclick="filterAlerts('critical',this)">Critical</div>
      <div class="tab" onclick="filterAlerts('high',this)">High</div>
      <div class="tab" onclick="filterAlerts('medium',this)">Medium</div>
      <div class="tab" onclick="filterAlerts('resolved',this)">Resolved</div>
    </div>
    <div id="alerts-list">
      ${alerts.map(a => `
        <div class="alert-card" data-severity="${a.severity}">
          <div class="alert-severity-bar ${a.severity}"></div>
          <div class="alert-body">
            <div class="alert-title">${a.title}</div>
            <div class="alert-meta">
              ${a.entity_name ? `👤 ${a.entity_name} · ` : ''}
              <span class="badge ${a.severity}" style="font-size:10px;">${a.severity}</span>
              · ${timeAgo(a.created_at)}
            </div>
            <div style="font-size:12px;color:var(--gray-600);margin-bottom:8px;">${a.description || ''}</div>
            <div class="alert-actions">
              <button class="btn-xs primary" onclick="showToast('Investigation initiated','info')">🔍 Investigate</button>
              <button class="btn-xs outline" onclick="updateAlert(${a.id},'reviewed')">✓ Mark Reviewed</button>
              <button class="btn-xs success" onclick="updateAlert(${a.id},'resolved')">✅ Resolve</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function filterAlerts(severity, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.alert-card').forEach(card => {
    card.style.display = severity === 'all' || card.dataset.severity === severity ? '' : 'none';
  });
}

async function updateAlert(id, status) {
  try {
    await apiFetch(`/api/admin/alerts/${id}/update`, { method: 'POST', body: JSON.stringify({ status }) });
    showToast('Alert updated!', 'success');
    navigateTo('admin-alerts');
  } catch(e) { showToast(e.message, 'error'); }
}

async function renderAdminAIInsights(content) {
  const data = await apiFetch('/api/admin/ai-insights');
  content.innerHTML = `
    <div class="page-header"><div><h1>TrustIQ Intelligence</h1><p>AI-powered insights, anomaly detection, and predictive analysis.</p></div></div>
    <div style="background:linear-gradient(135deg,var(--navy),#1a56db,#6366f1);border-radius:16px;padding:24px;color:white;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div style="flex:1;">
          <div style="font-size:16px;font-weight:700;margin-bottom:8px;">🤖 AI Query Assistant</div>
          <div style="font-size:13px;opacity:0.85;margin-bottom:14px;">Ask questions about your platform data.</div>
          <div style="display:flex;gap:8px;">
            <input type="text" id="ai-query-input" placeholder="e.g. Show highest-risk entities..." style="flex:1;padding:10px 14px;border-radius:8px;border:none;font-size:13px;outline:none;color:var(--gray-800);">
            <button onclick="sendAIQuery()" style="padding:10px 18px;background:rgba(255,255,255,0.2);border-radius:8px;color:white;font-weight:700;font-size:13px;cursor:pointer;border:1px solid rgba(255,255,255,0.3);">Ask AI →</button>
          </div>
          <div id="ai-answer" style="margin-top:10px;font-size:13px;opacity:0.9;display:none;background:rgba(255,255,255,0.1);border-radius:8px;padding:12px;"></div>
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
            ${["Show highest-risk entities","Why did fraud increase?","Users needing verification","Monthly risk summary"].map(q => `<div style="padding:4px 10px;background:rgba(255,255,255,0.15);border-radius:20px;font-size:11px;cursor:pointer;" onclick="document.getElementById('ai-query-input').value='${q}';sendAIQuery()">${q}</div>`).join('')}
          </div>
        </div>
      </div>
    </div>
    <div class="grid-2" style="margin-bottom:16px;">
      <div class="card">
        <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:12px;">🚨 Emerging Risks</div>
        ${data.emerging_risks.map(r => `
          <div style="padding:12px;border-radius:10px;background:${r.severity==='critical'?'var(--danger-light)':r.severity==='high'?'#fff7ed':'var(--warning-light)'};margin-bottom:8px;border-left:3px solid ${r.severity==='critical'?'var(--danger)':r.severity==='high'?'#ea580c':'var(--warning)'};">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <div style="font-size:13px;font-weight:700;color:var(--gray-800);">${r.title}</div>
              <span class="badge ${r.severity}">${r.severity}</span>
            </div>
            <div style="font-size:12px;color:var(--gray-600);">${r.description}</div>
          </div>
        `).join('')}
      </div>
      <div class="card">
        <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:12px;">📈 Fraud Patterns</div>
        ${data.fraud_patterns.map(f => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);">
            <span style="font-size:13px;font-weight:600;color:var(--gray-700);">${f.pattern}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:13px;font-weight:700;">${f.count}</span>
              <span class="badge ${f.trend==='increasing'?'danger':f.trend==='decreasing'?'success':'info'}" style="font-size:10px;">${f.trend}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:12px;">💡 AI Recommendations</div>
      ${data.recommendations.map((r, i) => `
        <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
          <div style="width:24px;height:24px;border-radius:50%;background:var(--primary-light);color:var(--primary);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</div>
          <div style="font-size:13px;color:var(--gray-700);">${r}</div>
        </div>
      `).join('')}
    </div>
    <div class="card">
      <div style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:10px;">📋 Executive Summary</div>
      <div style="font-size:13px;color:var(--gray-600);line-height:1.8;background:var(--gray-50);padding:16px;border-radius:10px;">${data.executive_summary}</div>
    </div>
  `;
}

async function sendAIQuery() {
  const query = document.getElementById('ai-query-input').value.trim();
  if (!query) return;
  const answerEl = document.getElementById('ai-answer');
  answerEl.style.display = 'block';
  answerEl.textContent = '🤖 Analyzing...';
  try {
    const data = await apiFetch('/api/admin/ai/query', { method: 'POST', body: JSON.stringify({ query }) });
    answerEl.textContent = data.answer;
  } catch(e) { answerEl.textContent = 'Error: ' + e.message; }
}

async function renderAdminInvestigations(content) {
  const invs = await apiFetch('/api/admin/investigations');
  content.innerHTML = `
    <div class="page-header"><div><h1>Investigations</h1><p>Active investigation workspace.</p></div></div>
    <div class="investigation-layout">
      <div class="inv-list">
        <div style="padding:12px 16px;border-bottom:1px solid var(--border);font-size:13px;font-weight:700;color:var(--navy);">Active Investigations (${invs.length})</div>
        ${invs.length ? invs.map((inv, idx) => `
          <div class="inv-list-item ${idx === 0 ? 'selected' : ''}" onclick="loadInvestigation(${inv.id})">
            <div class="inv-list-title">${inv.title}</div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;">
              <div class="inv-list-sub">${inv.subject_name || 'Unknown'}</div>
              <span class="badge ${inv.priority === 'high' ? 'danger' : inv.priority === 'medium' ? 'warning' : 'info'}" style="font-size:10px;">${inv.priority}</span>
            </div>
            <div class="inv-list-sub">${timeAgo(inv.opened_at)}</div>
          </div>
        `).join('') : '<div style="padding:16px;font-size:13px;color:var(--gray-400);">No active investigations.</div>'}
      </div>
      <div class="inv-center">
        ${invs.length > 0 ? `
          <div style="font-size:16px;font-weight:800;color:var(--navy);margin-bottom:12px;">${invs[0].title}</div>
          <div style="display:flex;gap:10px;margin-bottom:14px;">
            <span class="badge ${invs[0].priority === 'high' ? 'danger' : 'warning'}">${invs[0].priority}</span>
            <span class="badge info">${invs[0].status}</span>
          </div>
          <div style="background:var(--gray-50);border-radius:10px;padding:14px;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:700;color:var(--gray-500);text-transform:uppercase;margin-bottom:8px;">Subject</div>
            <div style="font-size:14px;font-weight:700;">${invs[0].subject_name || 'Unknown'}</div>
            <div style="font-size:12px;color:var(--gray-500);">${invs[0].subject_email || ''}</div>
            <div style="display:flex;gap:12px;margin-top:8px;">
              <div><div style="font-size:10px;color:var(--gray-400);">Trust Score</div><div style="font-weight:700;">${Math.round(invs[0].trust_score || 0)}/100</div></div>
              <div><div style="font-size:10px;color:var(--gray-400);">Risk Score</div><div style="font-weight:700;color:var(--danger);">${Math.round(invs[0].risk_score || 0)}/100</div></div>
            </div>
          </div>
          <div style="font-size:13px;color:var(--gray-600);margin-bottom:16px;">${invs[0].description || 'Investigation in progress.'}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-success" onclick="showToast('Approved','success')">✅ Approve</button>
            <button class="btn btn-danger" onclick="showToast('Escalated','warning')">⬆ Escalate</button>
            <button class="btn btn-blue" onclick="showToast('Verification requested','info')">📋 Request Verification</button>
            <button class="btn btn-outline" onclick="showToast('Note added','success')">📝 Add Note</button>
          </div>
        ` : '<div style="text-align:center;padding:40px;color:var(--gray-400);">Select an investigation</div>'}
      </div>
      <div class="inv-right">
        <div class="ai-chat">
          <div class="ai-chat-header">
            <div class="ai-chat-title">🤖 AI Investigation Assistant</div>
          </div>
          <div class="ai-chat-messages" id="invChatMessages">
            <div class="ai-msg ai">Hello! I'm analyzing the selected investigation. ${invs.length > 0 ? `For ${invs[0].subject_name}: This entity was flagged due to elevated risk signals. Based on behavioral patterns, I recommend a detailed document review.` : 'Select an investigation to begin analysis.'}</div>
          </div>
          <div class="ai-chat-input">
            <input type="text" id="invChatInput" placeholder="Ask about this investigation...">
            <button class="ai-send-btn" onclick="sendInvQuery()">→</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function sendInvQuery() {
  const input = document.getElementById('invChatInput');
  const msgs = document.getElementById('invChatMessages');
  const q = input.value.trim();
  if (!q) return;
  msgs.innerHTML += `<div class="ai-msg user">${q}</div>`;
  input.value = '';
  msgs.scrollTop = msgs.scrollHeight;
  try {
    const data = await apiFetch('/api/admin/ai/query', { method: 'POST', body: JSON.stringify({ query: q }) });
    msgs.innerHTML += `<div class="ai-msg ai">${data.answer}</div>`;
    msgs.scrollTop = msgs.scrollHeight;
  } catch(e) { msgs.innerHTML += `<div class="ai-msg ai">Error: ${e.message}</div>`; }
}

async function renderAdminOrganizations(content) {
  content.innerHTML = `
    <div class="page-header"><div><h1>Organizations</h1><p>Manage organizational entities on the platform.</p></div></div>
    <div class="card" style="text-align:center;padding:40px;">
      <div style="font-size:48px;margin-bottom:12px;">🏢</div>
      <div style="font-size:16px;font-weight:700;color:var(--gray-700);margin-bottom:8px;">Organization Management</div>
      <div style="font-size:13px;color:var(--gray-500);">Enterprise organization management coming soon. Contact your administrator to add organizations.</div>
    </div>
  `;
}

async function renderAdminReports(content) {
  content.innerHTML = `
    <div class="page-header"><div><h1>Reports</h1><p>Generate and download intelligence reports.</p></div></div>
    <div class="doc-grid">
      ${[
        {title:'Trust Assessment Report', desc:'Comprehensive trust analysis across all entities', icon:'📊', type:'trust_assessment'},
        {title:'Risk Intelligence Report', desc:'Risk distribution, trends, and high-risk entity analysis', icon:'⚠️', type:'risk_intelligence'},
        {title:'Fraud Detection Report', desc:'Fraud signals, patterns, and detection effectiveness', icon:'🔍', type:'fraud_detection'},
        {title:'Verification Report', desc:'Verification funnel analysis and completion rates', icon:'✅', type:'verification'},
        {title:'Compliance Report', desc:'Regulatory compliance status and audit findings', icon:'📋', type:'compliance'},
        {title:'Executive Summary', desc:'High-level platform performance and KPI overview', icon:'📑', type:'executive_summary'},
      ].map(r => `
        <div class="doc-card">
          <div class="doc-card-header">
            <div class="doc-icon">${r.icon}</div>
            <div></div>
          </div>
          <div class="doc-name">${r.title}</div>
          <div class="doc-type" style="margin-bottom:14px;">${r.desc}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn-xs primary" onclick="generateReport('${r.type}')">Generate</button>
            <button class="btn-xs outline" onclick="showToast('Preview feature coming soon','info')">Preview</button>
            <button class="btn-xs outline" onclick="showToast('Report downloaded','success')">⬇ Download</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function generateReport(type) {
  showToast(`Generating ${type.replace('_',' ')} report...`, 'info');
  setTimeout(() => showToast('Report ready! Check your downloads.', 'success'), 2000);
}

async function renderAdminAudit(content) {
  const data = await apiFetch('/api/admin/audit-logs?page=1&limit=50');
  const logs = data.logs || [];
  
  content.innerHTML = `
    <div class="page-header"><div><h1>Audit Logs</h1><p>Immutable security audit trail for all platform actions.</p></div>
      <button class="btn btn-outline" onclick="showToast('Exporting audit log...','info')">⬇ Export</button>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div class="audit-filters">
        <input type="text" placeholder="🔍 Search actions..." class="filter-input" style="flex:1;min-width:200px;">
        <input type="date" class="filter-input">
        <select class="filter-input">
          <option>All Roles</option>
          <option>admin</option>
          <option>user</option>
        </select>
      </div>
    </div>
    <div class="card" style="padding:0;">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Timestamp</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>IP</th><th>Status</th></tr></thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td style="font-size:11px;color:var(--gray-500);white-space:nowrap;">${new Date(l.created_at).toLocaleString()}</td>
                <td>
                  <div style="font-size:13px;font-weight:600;">${l.actor_email || 'System'}</div>
                </td>
                <td><span class="badge ${l.actor_role === 'admin' ? 'info' : 'gray'}">${l.actor_role || 'system'}</span></td>
                <td style="font-size:13px;font-weight:600;color:var(--gray-700);">${l.action.replace(/_/g,' ')}</td>
                <td style="font-size:12px;color:var(--gray-500);">${l.entity_type || '—'} ${l.entity_id ? '#'+l.entity_id : ''}</td>
                <td style="font-size:11px;color:var(--gray-400);">${l.ip_address || '—'}</td>
                <td><span class="badge ${l.status === 'success' ? 'success' : 'danger'}">${l.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div style="text-align:center;padding:12px;font-size:12px;color:var(--gray-400);">Total: ${data.total} entries · Audit logs are immutable and cannot be deleted.</div>
  `;
}

// ==================== NOTIFICATIONS ====================
function showNotifications() {
  showToast('No new notifications', 'info');
}

// ==================== MOBILE ============================
function toggleSidebar() {
  const sidebar = currentUser?.role === 'admin' ? document.getElementById('admin-sidebar') : document.getElementById('user-sidebar');
  sidebar?.classList.toggle('open');
  document.getElementById('mobileOverlay').classList.toggle('active');
}
function closeSidebar() {
  document.getElementById('admin-sidebar').classList.remove('open');
  document.getElementById('user-sidebar').classList.remove('open');
  document.getElementById('mobileOverlay').classList.remove('active');
}

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id === 'login-password') doLogin();
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
});

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('loading-screen').style.opacity = '0';
    setTimeout(() => {
      document.getElementById('loading-screen').style.display = 'none';
      if (authToken && currentUser) {
        initApp();
      } else {
        document.getElementById('auth-container').style.display = 'flex';
      }
    }, 400);
  }, 800);
});
