/* main.js — FDREase
 * Manages UI interactions, role identities, submission lifecycle, review actions,
 * and data synchronization between Django REST Framework / PostgreSQL and offline demo mode.
 * Requires api.js to be loaded first.
 */

// ===== Utility: localStorage wrapper =====
const Storage = {
  get(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? JSON.parse(val) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

// ===== Theme =====
const Theme = {
  init() {
    const saved = Storage.get('fdrease-theme', 'light');
    this.apply(saved);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', () => this.toggle());
  },
  apply(mode) {
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(mode === 'dark' ? 'dark-theme' : 'light-theme');
    Storage.set('fdrease-theme', mode);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = mode === 'dark' ? '☀️ Light' : '🌙 Dark';
  },
  toggle() {
    this.apply(document.body.classList.contains('dark-theme') ? 'light' : 'dark');
  },
};

// ===== Mobile Nav =====
function initMobileNav() {
  const toggle = document.getElementById('nav-toggle');
  const links  = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => links.classList.remove('open'))
    );
  }
}

// ===== Dynamic Footer Year =====
function initFooterYear() {
  const currentYear = new Date().getFullYear();
  document.querySelectorAll('.current-year').forEach(el => {
    el.textContent = currentYear;
  });
}

// ===== Toast Notification =====
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  });
}

// ===== Demo Data (Fallback when disconnected / unauthenticated) =====
const DEMO_DATA = [
  { id: 1, institution_name: 'XYZ Institute',                 fdr_number: 'FDR-2025-001', amount: '2500000.00', maturity_date: '2026-03-15', status: 'Approved',            receipt_filename: 'xyz_fdr_receipt.pdf', receipt_file_url: null, notes: 'Approved for 2025-2026 academic year.' },
  { id: 2, institution_name: 'XYZ Institute',                 fdr_number: 'FDR-2025-003', amount: '3200000.00', maturity_date: '2026-12-01', status: 'Under Review',        receipt_filename: 'xyz_fdr_branch.pdf',  receipt_file_url: null, notes: 'Under physical verification by AICTE regional office.' },
  { id: 3, institution_name: 'Northstar Institute of Technology', fdr_number: 'FDR-2025-002', amount: '1800000.00', maturity_date: '2026-06-20', status: 'Submitted',       receipt_filename: 'northstar_deposit.pdf', receipt_file_url: null, notes: 'New course intake deposit.' },
  { id: 4, institution_name: 'Northstar Institute of Technology', fdr_number: 'FDR-2025-004', amount: '1500000.00', maturity_date: '2026-09-10', status: 'Correction Required', receipt_filename: 'northstar_fdr_scan.jpg', receipt_file_url: null, notes: 'Bank seal is faint; please upload clear scanned receipt.' },
  { id: 5, institution_name: 'Crescent Valley University',     fdr_number: 'FDR-2025-005', amount: '2000000.00', maturity_date: '2026-11-30', status: 'Submitted',           receipt_filename: 'crescent_fdr.pdf',    receipt_file_url: null, notes: 'New polytechnic wing security deposit.' },
  { id: 6, institution_name: 'Westbridge Institute of Science',  fdr_number: 'FDR-2025-006', amount: '5000000.00', maturity_date: '2027-01-25', status: 'Rejected',            receipt_filename: 'westbridge_deposit.pdf', receipt_file_url: null, notes: 'Joint FDR not drawn in favour of Member Secretary, AICTE.' },
  { id: 7, institution_name: 'Pinecrest Technical University',  fdr_number: 'FDR-2025-007', amount: '2800000.00', maturity_date: '2027-05-15', status: 'Approved',            receipt_filename: 'pinecrest_fdr.pdf',   receipt_file_url: null, notes: 'Approved for 2026-2027 academic intake.' },
];

// ===== Format Helpers =====
function statusClass(status) {
  if (!status) return 'draft';
  switch (status.trim().toLowerCase()) {
    case 'draft':                return 'draft';
    case 'submitted':            return 'submitted';
    case 'under review':         return 'review';
    case 'correction required':  return 'correction';
    case 'approved':             return 'approved';
    case 'rejected':             return 'rejected';
    default:                     return 'draft';
  }
}

function formatAmount(val) {
  const num = Number(val);
  if (isNaN(num)) return val || '—';
  return '₹' + num.toLocaleString('en-IN');
}

// Format date consistently as DD/MM/YYYY to prevent awkward wrapping
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const str = String(dateStr).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  const parts = str.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  const dt = new Date(str);
  if (!isNaN(dt.getTime())) {
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return str;
}

// ===== Active Backend Verification =====
let verifiedHealth = null;

async function checkBackendConnection() {
  if (typeof ApiHealth === 'undefined') {
    return { healthy: false, database: 'disconnected' };
  }
  try {
    verifiedHealth = await ApiHealth.check();
  } catch (err) {
    verifiedHealth = { healthy: false, database: 'disconnected', error: err.message };
  }
  return verifiedHealth;
}

// ===== Navbar User & Role Indicator =====
function updateNavAuth() {
  if (typeof Auth === 'undefined') return;
  const indicator = document.getElementById('nav-user');
  if (!indicator) return;

  if (Auth.isLoggedIn()) {
    const role = Auth.getRole();
    const user = Auth.getUsername();
    const roleLabel = role === 'official' ? 'AICTE Official' : 'Institution';
    const roleColor = role === 'official' ? '#3b82f6' : '#10b981';

    indicator.innerHTML = `
      <span style="font-weight:600;color:var(--text-primary);">👤 ${user}</span>
      <span style="display:inline-block;padding:0.15rem 0.5rem;font-size:0.75rem;border-radius:12px;background:${roleColor}22;color:${roleColor};font-weight:500;margin-left:4px;">${roleLabel}</span>
      <a href="#" id="nav-logout-btn" style="margin-left:8px;color:var(--text-muted);text-decoration:underline;cursor:pointer;font-size:0.8rem;">Logout</a>
    `;
    indicator.style.display = 'inline-flex';
    indicator.style.alignItems = 'center';

    const logoutBtn = document.getElementById('nav-logout-btn');
    if (logoutBtn) {
      logoutBtn.onclick = (e) => {
        e.preventDefault();
        Auth.logout();
        showToast('Logged out. Switched to demo mode.', 'info');
        setTimeout(() => window.location.reload(), 250);
      };
    }
  } else {
    indicator.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">Demo Mode (Guest)</span>`;
    indicator.style.display = 'inline-block';
  }
}

// ===== Summary Counts Calculation =====
// Counts are derived directly from the loaded dataset displayed in the table.
// Definition: Pending Review = SUBMITTED + UNDER REVIEW.
// CORRECTION REQUIRED is counted separately. No double-counting.
function computeDatasetCounts(list) {
  const apps = list || [];
  let approved = 0;
  let pending = 0;
  let corrections = 0;
  let rejected = 0;

  apps.forEach(a => {
    const st = (a.status || '').trim().toLowerCase();
    if (st === 'approved') {
      approved++;
    } else if (st === 'submitted' || st === 'under review') {
      pending++;
    } else if (st === 'correction required') {
      corrections++;
    } else if (st === 'rejected') {
      rejected++;
    }
  });

  return {
    total: apps.length,
    approved,
    pending,
    corrections,
    rejected,
  };
}

function renderStatsEl(el, s) {
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card"><span class="stat-value">${s.total}</span><span class="stat-label">Total Submissions</span></div>
    <div class="stat-card"><span class="stat-value">${s.approved}</span><span class="stat-label">Approved</span></div>
    <div class="stat-card"><span class="stat-value">${s.pending}</span><span class="stat-label">Pending Review</span></div>
    <div class="stat-card"><span class="stat-value">${s.corrections}</span><span class="stat-label">Correction Required</span></div>
  `;
}

function renderStats(containerId, sourceApps = []) {
  const el = document.getElementById(containerId);
  if (!el) return;
  renderStatsEl(el, computeDatasetCounts(sourceApps));
}


// ==============================================================================
// INSTITUTION INTERFACE
// ==============================================================================
let institutionApplications = [];

const Institution = {
  async init() {
    await checkBackendConnection();
    await this.loadApplications();
    this.renderHistory();
    renderStats('inst-stats', institutionApplications);

    const form = document.getElementById('fdr-form');
    if (form) form.onsubmit = this.handleSubmit.bind(this);

    const fileInput = document.getElementById('doc-file');
    if (fileInput) fileInput.onchange = this.handleFileSelect.bind(this);

    this.updateModeIndicator();
    updateNavAuth();
  },

  updateModeIndicator() {
    const banner = document.querySelector('.demo-banner');
    if (!banner) return;

    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      const role = Auth.getRole();
      const username = Auth.getUsername();

      if (role === 'official') {
        banner.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <span>ℹ️ <strong>Official Account Active:</strong> Signed in as <code>${username}</code> (AICTE Official). You are viewing the applicant institution view.</span>
            <div style="display:flex;gap:6px;">
              <button id="btn-switch-to-inst" class="btn btn-sm" style="background:#0284c7;color:#fff;">⚡ Switch to Institution (xyz_institute)</button>
              <button id="btn-auth-disconnect-inst" class="btn btn-sm" style="background:#ef4444;color:#fff;">Logout</button>
            </div>
          </div>
        `;
        banner.style.backgroundColor = '#eff6ff';
        banner.style.borderColor = '#bfdbfe';
        banner.style.color = '#1e40af';

        const switchBtn = document.getElementById('btn-switch-to-inst');
        if (switchBtn) {
          switchBtn.onclick = async () => {
            try {
              switchBtn.disabled = true;
              switchBtn.textContent = 'Switching…';
              const res = await ApiAuth.login('xyz_institute', 'InstitutionPass123!');
              Auth.setToken(res.token);
              Auth.setUsername(res.username);
              Auth.setRole(res.role);
              if (res.institution && res.institution.name) {
                Auth.setInstitutionName(res.institution.name);
              } else {
                Auth.setInstitutionName('XYZ Institute');
              }
              showToast('Switched to XYZ Institute demo account!', 'success');
              await this.init();
            } catch (err) {
              showToast('Login failed: ' + err.message, 'error');
              switchBtn.disabled = false;
              switchBtn.textContent = '⚡ Switch to Institution (xyz_institute)';
            }
          };
        }
      } else {
        const instName = Auth.getInstitutionName();
        if (verifiedHealth && verifiedHealth.healthy) {
          banner.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <span>🟢 <strong>Backend Connected:</strong> Signed in as <code>${username}</code> (${instName}). Submissions are verified and stored in PostgreSQL.</span>
              <button id="btn-auth-disconnect-inst" class="btn btn-sm" style="background:#ef4444;color:#fff;">Disconnect</button>
            </div>
          `;
          banner.style.backgroundColor = '#d1fae5';
          banner.style.borderColor = '#6ee7b7';
          banner.style.color = '#065f46';
        } else {
          banner.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <span>🔴 <strong>Backend Offline / Unreachable:</strong> Signed in as <code>${username}</code> (${instName}), but Django/PostgreSQL is unreachable. Submissions stored locally.</span>
              <div style="display:flex;gap:6px;">
                <button id="btn-retry-inst-conn" class="btn btn-sm" style="background:#0284c7;color:#fff;">🔄 Retry</button>
                <button id="btn-auth-disconnect-inst" class="btn btn-sm" style="background:#ef4444;color:#fff;">Switch to Demo</button>
              </div>
            </div>
          `;
          banner.style.backgroundColor = '#fee2e2';
          banner.style.borderColor = '#fca5a5';
          banner.style.color = '#991b1b';

          const retryBtn = document.getElementById('btn-retry-inst-conn');
          if (retryBtn) retryBtn.onclick = () => this.init();
        }
      }

      const discBtn = document.getElementById('btn-auth-disconnect-inst');
      if (discBtn) {
        discBtn.onclick = () => {
          Auth.logout();
          showToast('Disconnected from backend. Switched to demo mode.', 'info');
          this.init();
        };
      }
    } else {
      banner.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>📌 <strong>Institution Demo Mode (XYZ Institute):</strong> Submissions are stored locally in your browser. Connect to Django backend to store records in PostgreSQL.</span>
          <button id="btn-quick-login-inst" class="btn btn-sm" style="background:#0284c7;color:#fff;">⚡ Connect Backend (Demo: xyz_institute)</button>
        </div>
      `;
      banner.style.backgroundColor = '#fffbeb';
      banner.style.borderColor = '#fde68a';
      banner.style.color = '#92400e';

      const connBtn = document.getElementById('btn-quick-login-inst');
      if (connBtn) {
        connBtn.onclick = async () => {
          try {
            connBtn.disabled = true;
            connBtn.textContent = 'Connecting…';
            const res = await ApiAuth.login('xyz_institute', 'InstitutionPass123!');
            Auth.setToken(res.token);
            Auth.setUsername(res.username);
            Auth.setRole(res.role);
            if (res.institution && res.institution.name) {
              Auth.setInstitutionName(res.institution.name);
            } else {
              Auth.setInstitutionName('XYZ Institute');
            }
            showToast('Connected to Django backend as xyz_institute (XYZ Institute)!', 'success');
            await this.init();
          } catch (err) {
            showToast('Backend connection failed: ' + err.message, 'error');
            connBtn.disabled = false;
            connBtn.textContent = '⚡ Connect Backend (Demo: xyz_institute)';
          }
        };
      }
    }
  },

  async loadApplications() {
    const instField = document.getElementById('inst-name');
    const currentInstName = (typeof Auth !== 'undefined' && Auth.isLoggedIn())
      ? Auth.getInstitutionName()
      : 'XYZ Institute';

    if (instField) {
      instField.value = currentInstName;
    }

    if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && typeof ApiSubmissions !== 'undefined' && verifiedHealth?.healthy) {
      try {
        const data = await ApiSubmissions.list();
        institutionApplications = data.results || data;
        return;
      } catch (err) {
        showToast('Could not fetch records from backend: ' + err.message, 'error');
      }
    }

    // Refresh localStorage if missing or if containing legacy universities
    const storedRaw = localStorage.getItem('fdrease-applications');
    if (!storedRaw || storedRaw.includes('MIT') || storedRaw.includes('VIT') || storedRaw.includes('BITS')) {
      Storage.set('fdrease-applications', DEMO_DATA);
    }
    const allDemo = Storage.get('fdrease-applications', DEMO_DATA);
    // Institution view shows only this institution's submissions
    institutionApplications = allDemo.filter(
      a => (a.institution_name || '').toLowerCase() === currentInstName.toLowerCase()
    );
  },

  handleFileSelect(e) {
    const file = e.target.files[0];
    const label = document.getElementById('file-label');
    if (!label) return;
    if (file) {
      const sizeKB = (file.size / 1024).toFixed(1);
      label.textContent = `Selected: ${file.name} (${sizeKB} KB)`;
      label.style.color = 'var(--success-green)';
    } else {
      label.textContent = 'No file selected';
      label.style.color = 'var(--text-muted)';
    }
  },

  validate(form) {
    const fdrInput = form['fdr-number'];
    const amountInput = form['amount'];
    const dateInput = form['maturity-date'];
    const fileInput = form['doc-file'];

    // 1. FDR number validation
    const fdrVal = (fdrInput?.value || '').trim();
    if (!fdrVal) {
      fdrInput?.classList.add('input-error');
      showToast('FDR number is required and cannot be empty.', 'error');
      fdrInput?.focus();
      return false;
    }
    fdrInput?.classList.remove('input-error');

    // Duplicate check within loaded institution submissions
    const isDup = institutionApplications.some(
      a => (a.fdr_number || '').trim().toLowerCase() === fdrVal.toLowerCase()
    );
    if (isDup) {
      fdrInput?.classList.add('input-error');
      showToast(`Duplicate FDR: Submission with FDR #${fdrVal} already exists for this institution.`, 'error');
      fdrInput?.focus();
      return false;
    }

    // 2. Amount validation
    const amtStr = (amountInput?.value || '').trim();
    const amtNum = Number(amtStr);
    if (!amtStr || isNaN(amtNum) || amtNum <= 0) {
      amountInput?.classList.add('input-error');
      showToast('Amount must be a valid number greater than zero.', 'error');
      amountInput?.focus();
      return false;
    }
    amountInput?.classList.remove('input-error');

    // 3. Maturity date validation
    const dateStr = dateInput?.value;
    if (!dateStr) {
      dateInput?.classList.add('input-error');
      showToast('A valid maturity date is required.', 'error');
      dateInput?.focus();
      return false;
    }
    const matDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(matDate.getTime()) || matDate < today) {
      dateInput?.classList.add('input-error');
      showToast('Maturity date cannot be in the past or expired.', 'error');
      dateInput?.focus();
      return false;
    }
    dateInput?.classList.remove('input-error');

    // 4. Mandatory Document validation
    const file = fileInput?.files?.[0];
    if (!file) {
      fileInput?.classList.add('input-error');
      showToast('An FDR receipt document (PDF, JPG, or PNG) is mandatory.', 'error');
      fileInput?.focus();
      return false;
    }
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
    const fileName = file.name.toLowerCase();
    const hasValidExt = allowedExtensions.some(ext => fileName.endsWith(ext));
    if (!hasValidExt) {
      fileInput?.classList.add('input-error');
      showToast('Invalid file format. Only PDF, JPG, and PNG documents are accepted.', 'error');
      return false;
    }
    const maxBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxBytes) {
      fileInput?.classList.add('input-error');
      showToast('File size exceeds the 10 MB limit. Please upload a smaller file.', 'error');
      return false;
    }
    fileInput?.classList.remove('input-error');

    return true;
  },

  async handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!this.validate(form)) {
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const fdrNumber = form['fdr-number'].value.trim();
      const amount = form['amount'].value.trim();
      const maturityDate = form['maturity-date'].value;
      const file = form['doc-file']?.files[0];
      const currentInstName = (typeof Auth !== 'undefined' && Auth.isLoggedIn())
        ? Auth.getInstitutionName()
        : 'XYZ Institute';

      if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && typeof ApiSubmissions !== 'undefined' && verifiedHealth?.healthy) {
        const fd = new FormData();
        fd.append('fdr_number',    fdrNumber);
        fd.append('amount',        amount);
        fd.append('maturity_date', maturityDate);
        const notes = form['notes']?.value?.trim();
        if (notes) fd.append('notes', notes);
        const bankName = form['bank-name']?.value?.trim();
        if (bankName) fd.append('bank_name', bankName);
        if (file) fd.append('receipt_file', file);

        const created = await ApiSubmissions.create(fd);
        institutionApplications.unshift(created);
        showToast(`FDR #${created.fdr_number} submitted to PostgreSQL successfully!`, 'success');
      } else {
        const data = {
          id: Date.now(),
          institution_name: currentInstName,
          fdr_number:   fdrNumber,
          amount:       Number(amount).toFixed(2),
          maturity_date: maturityDate,
          status:       'Submitted',
          receipt_filename: file ? file.name : '',
          receipt_file_url: null,
          notes: '',
        };
        institutionApplications.unshift(data);
        const allStored = Storage.get('fdrease-applications', DEMO_DATA);
        allStored.unshift(data);
        Storage.set('fdrease-applications', allStored);
        showToast('FDR saved in demo mode (local browser storage).', 'info');
      }

      this.renderHistory();
      renderStats('inst-stats', institutionApplications);
      form.reset();

      // Reset read-only field to authenticated institution name
      const instField = document.getElementById('inst-name');
      if (instField) instField.value = currentInstName;

      const fileLabel = document.getElementById('file-label');
      if (fileLabel) {
        fileLabel.textContent = 'No file selected';
        fileLabel.style.color = 'var(--text-muted)';
      }
    } catch (err) {
      showToast('Submission rejected: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit FDR';
    }
  },

  renderHistory() {
    const tbody = document.getElementById('history-table');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (institutionApplications.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No submissions yet. Use the form above to submit your first FDR.</td></tr>';
      return;
    }

    institutionApplications.forEach(app => {
      let docHtml = '';
      if (app.receipt_file_url) {
        docHtml = `<a href="${app.receipt_file_url}" target="_blank" rel="noopener noreferrer" class="btn btn-sm" style="display:inline-flex;align-items:center;gap:4px;text-decoration:none;background:#334155;color:#fff;">📄 View Document</a>`;
      } else if (app.receipt_filename) {
        docHtml = `<span style="font-size:0.8rem;color:var(--text-muted);">📄 ${app.receipt_filename}</span>`;
      } else {
        docHtml = `<span style="font-size:0.8rem;color:var(--error-red);font-weight:500;">⚠️ Missing Document</span>`;
      }

      let actionHtml = '—';
      const isCorrection = (app.status || '').toLowerCase() === 'correction required';
      if (isCorrection) {
        actionHtml = `
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div style="font-size:0.78rem;color:var(--warning-orange);background:#fef3c7;border:1px solid #fde68a;padding:4px 8px;border-radius:4px;">
              <strong>Remarks:</strong> ${app.notes || 'Please upload corrected document.'}
            </div>
            <button class="btn btn-sm btn-resubmit-inst" data-id="${app.id}" style="background:#0284c7;color:#fff;">✏️ Correct & Resubmit</button>
          </div>
        `;
      } else if (app.notes) {
        actionHtml = `<span style="font-size:0.82rem;color:var(--text-secondary);">${app.notes}</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${app.institution_name || app.institution || '—'}</td>
        <td><strong>${app.fdr_number}</strong></td>
        <td>${formatAmount(app.amount)}</td>
        <td class="date-cell maturity-col">${formatDate(app.maturity_date || app.maturity)}</td>
        <td>${docHtml}</td>
        <td><span class="status-badge status-${statusClass(app.status)}">${app.status}</span></td>
        <td>${actionHtml}</td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-resubmit-inst').forEach(btn => {
      btn.onclick = (e) => this.openResubmitModal(Number(e.target.dataset.id));
    });
  },

  openResubmitModal(id) {
    const app = institutionApplications.find(a => a.id === id);
    if (!app) return;

    const existing = document.getElementById('resubmit-modal');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'resubmit-modal';
    backdrop.className = 'fdr-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fdr-modal">
        <div class="fdr-modal-header">
          <h3>Correct & Resubmit FDR: ${app.fdr_number}</h3>
          <button class="fdr-modal-close" id="modal-close-btn">&times;</button>
        </div>
        <div class="fdr-modal-body">
          <div style="background:#fffbeb;border:1px solid #fde68a;padding:0.75rem 1rem;border-radius:8px;color:#92400e;font-size:0.88rem;">
            <strong>Official Reviewer's Feedback:</strong><br>
            ${app.notes || 'Please upload a clear copy of the FDR receipt with bank seal.'}
          </div>
          <form id="resubmit-form">
            <div class="form-group" style="margin-bottom:1rem;">
              <label style="display:block;font-size:0.85rem;margin-bottom:0.25rem;">Upload Corrected FDR Receipt (PDF/Image) *</label>
              <input type="file" id="resubmit-file" accept=".pdf,.png,.jpg,.jpeg" required style="width:100%;padding:0.5rem;border:1px solid var(--border-color);border-radius:6px;">
            </div>
            <div class="form-group" style="margin-bottom:1rem;">
              <label style="display:block;font-size:0.85rem;margin-bottom:0.25rem;">Institution Remarks / Notes</label>
              <input type="text" id="resubmit-notes" placeholder="e.g. Uploaded certified bank copy with seal." style="width:100%;padding:0.5rem;border:1px solid var(--border-color);border-radius:6px;">
            </div>
          </form>
        </div>
        <div class="fdr-modal-footer">
          <button class="btn" id="modal-cancel-btn" style="background:#64748b;color:#fff;">Cancel</button>
          <button class="btn" id="modal-submit-btn" style="background:#0284c7;color:#fff;">Resubmit for Official Review</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    document.getElementById('modal-close-btn').onclick = close;
    document.getElementById('modal-cancel-btn').onclick = close;

    document.getElementById('modal-submit-btn').onclick = async () => {
      const fileInput = document.getElementById('resubmit-file');
      const notesInput = document.getElementById('resubmit-notes');
      const file = fileInput?.files[0];

      if (!file) {
        showToast('Please select the corrected FDR document file.', 'error');
        return;
      }

      const submitBtn = document.getElementById('modal-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Resubmitting…';

      try {
        if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && typeof ApiSubmissions !== 'undefined' && verifiedHealth?.healthy) {
          const fd = new FormData();
          fd.append('receipt_file', file);
          if (notesInput?.value?.trim()) {
            fd.append('notes', notesInput.value.trim());
          }
          const updated = await ApiSubmissions.update(app.id, fd);
          const idx = institutionApplications.findIndex(a => a.id === app.id);
          if (idx !== -1) institutionApplications[idx] = updated;
          showToast(`FDR ${app.fdr_number} resubmitted for official review!`, 'success');
        } else {
          // Demo mode resubmit
          app.status = 'Submitted';
          app.receipt_filename = file.name;
          app.notes = notesInput?.value?.trim() || 'Corrected document uploaded by institution.';
          const stored = Storage.get('fdrease-applications', []);
          const idx = stored.findIndex(a => a.id === app.id);
          if (idx !== -1) {
            stored[idx] = { ...app };
            Storage.set('fdrease-applications', stored);
          }
          showToast(`FDR ${app.fdr_number} resubmitted (demo mode).`, 'success');
        }

        close();
        this.renderHistory();
        renderStats('inst-stats', institutionApplications);
      } catch (err) {
        showToast('Resubmission failed: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Resubmit for Official Review';
      }
    };
  },
};


// ==============================================================================
// AICTE OFFICIAL DASHBOARD
// ==============================================================================
let officialApplications = [];
let officialLoadError = null;

const Official = {
  async init() {
    await checkBackendConnection();
    await this.loadApplications();
    this.renderTable();
    renderStats('official-stats', officialApplications);

    const filter = document.getElementById('status-filter');
    if (filter) filter.onchange = () => this.renderTable();

    const search = document.getElementById('search-input');
    if (search) search.oninput = () => this.renderTable();

    this.updateModeIndicator();
    updateNavAuth();
  },

  updateModeIndicator() {
    const banner = document.querySelector('.demo-banner');
    if (!banner) return;

    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      const role = Auth.getRole();
      const username = Auth.getUsername();

      if (role !== 'official') {
        banner.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <span>⚠️ <strong>Access Restricted:</strong> You are signed in as <code>${username}</code> (${role}). The Official Dashboard is restricted to authorized AICTE Government Officials.</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button id="btn-switch-official" class="btn btn-sm" style="background:#0284c7;color:#fff;">⚡ Sign In as Official (Demo: official_admin)</button>
              <a href="../dashboard/index.html" class="btn btn-sm" style="background:#475569;color:#fff;text-decoration:none;display:inline-flex;align-items:center;">← Return to Institution Dashboard</a>
              <button id="btn-auth-disconnect-off" class="btn btn-sm" style="background:#ef4444;color:#fff;">Logout</button>
            </div>
          </div>
        `;
        banner.style.backgroundColor = '#fef3c7';
        banner.style.borderColor = '#f59e0b';
        banner.style.color = '#92400e';

        const switchBtn = document.getElementById('btn-switch-official');
        if (switchBtn) {
          switchBtn.onclick = async () => {
            try {
              switchBtn.disabled = true;
              switchBtn.textContent = 'Authenticating…';
              const res = await ApiAuth.login('official_admin', 'OfficialPassword123!');
              Auth.setToken(res.token);
              Auth.setUsername(res.username);
              Auth.setRole(res.role);
              showToast('Authenticated as AICTE Official!', 'success');
              await this.init();
            } catch (err) {
              showToast('Authentication failed: ' + err.message, 'error');
              switchBtn.disabled = false;
              switchBtn.textContent = '⚡ Sign In as Official (Demo: official_admin)';
            }
          };
        }
      } else {
        if (verifiedHealth && verifiedHealth.healthy) {
          const count = verifiedHealth.count ?? officialApplications.length;
          banner.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <span>🟢 <strong>AICTE Official Connected:</strong> Signed in as <code>${username}</code> (Government Reviewer). Verified connected to PostgreSQL (${count} total records in DB).</span>
              <button id="btn-auth-disconnect-off" class="btn btn-sm" style="background:#ef4444;color:#fff;">Disconnect</button>
            </div>
          `;
          banner.style.backgroundColor = '#d1fae5';
          banner.style.borderColor = '#6ee7b7';
          banner.style.color = '#065f46';
        } else {
          banner.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <span>🔴 <strong>Backend Offline / Unreachable:</strong> Signed in as <code>${username}</code>, but cannot reach Django/PostgreSQL. Displaying local demo data.</span>
              <div style="display:flex;gap:6px;">
                <button id="btn-retry-off-conn" class="btn btn-sm" style="background:#0284c7;color:#fff;">🔄 Retry Connection</button>
                <button id="btn-auth-disconnect-off" class="btn btn-sm" style="background:#ef4444;color:#fff;">Disconnect</button>
              </div>
            </div>
          `;
          banner.style.backgroundColor = '#fee2e2';
          banner.style.borderColor = '#fca5a5';
          banner.style.color = '#991b1b';

          const retryBtn = document.getElementById('btn-retry-off-conn');
          if (retryBtn) retryBtn.onclick = () => this.init();
        }
      }

      const discBtn = document.getElementById('btn-auth-disconnect-off');
      if (discBtn) {
        discBtn.onclick = () => {
          Auth.logout();
          showToast('Disconnected from backend. Switched to demo mode.', 'info');
          this.init();
        };
      }
    } else {
      banner.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>📌 <strong>Official Demo Mode (Simulated Data):</strong> Review actions update status locally in your browser. Connect to Django backend to persist official decisions in PostgreSQL.</span>
          <button id="btn-quick-login-off" class="btn btn-sm" style="background:#0284c7;color:#fff;">⚡ Connect Backend (Demo: official_admin)</button>
        </div>
      `;
      banner.style.backgroundColor = '#fffbeb';
      banner.style.borderColor = '#fde68a';
      banner.style.color = '#92400e';

      const connBtn = document.getElementById('btn-quick-login-off');
      if (connBtn) {
        connBtn.onclick = async () => {
          try {
            connBtn.disabled = true;
            connBtn.textContent = 'Connecting…';
            const res = await ApiAuth.login('official_admin', 'OfficialPassword123!');
            Auth.setToken(res.token);
            Auth.setUsername(res.username);
            Auth.setRole(res.role);
            showToast('Connected to Django backend as official_admin!', 'success');
            await this.init();
          } catch (err) {
            showToast('Backend connection failed: ' + err.message, 'error');
            connBtn.disabled = false;
            connBtn.textContent = '⚡ Connect Backend (Demo: official_admin)';
          }
        };
      }
    }
  },

  async loadApplications() {
    officialLoadError = null;

    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      const role = Auth.getRole();
      if (role !== 'official') {
        officialApplications = [];
        return;
      }

      if (typeof ApiSubmissions !== 'undefined' && verifiedHealth?.healthy) {
        try {
          const data = await ApiSubmissions.list();
          officialApplications = data.results || data;
          return;
        } catch (err) {
          officialLoadError = err.message;
          showToast('Could not load official records from backend: ' + err.message, 'error');
        }
      }
    }

    const storedRaw = localStorage.getItem('fdrease-applications');
    if (!storedRaw || storedRaw.includes('MIT') || storedRaw.includes('VIT') || storedRaw.includes('BITS')) {
      Storage.set('fdrease-applications', DEMO_DATA);
    }
    officialApplications = Storage.get('fdrease-applications', DEMO_DATA);
  },

  renderTable() {
    const tbody = document.getElementById('official-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && Auth.getRole() !== 'official') {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state" style="padding:2.5rem 1rem;">
            <div style="max-width:540px;margin:0 auto;text-align:center;">
              <div style="font-size:2rem;margin-bottom:0.5rem;">🔒</div>
              <h3 style="margin-bottom:0.4rem;color:var(--text-primary);">Official Privileges Required</h3>
              <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1.2rem;">
                You are currently signed in as <strong>${Auth.getUsername()}</strong> (${Auth.getRole()}).
                Only verified AICTE Government Officials may review submissions or view all registered institutions.
              </p>
              <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
                <button id="table-btn-switch-official" class="btn" style="background:#0284c7;color:#fff;">⚡ Switch to Official (Demo)</button>
                <a href="../dashboard/index.html" class="btn" style="background:#475569;color:#fff;text-decoration:none;">← Return to Institution View</a>
              </div>
            </div>
          </td>
        </tr>
      `;
      const tableSwitchBtn = document.getElementById('table-btn-switch-official');
      if (tableSwitchBtn) {
        tableSwitchBtn.onclick = async () => {
          try {
            const res = await ApiAuth.login('official_admin', 'OfficialPassword123!');
            Auth.setToken(res.token);
            Auth.setUsername(res.username);
            Auth.setRole(res.role);
            showToast('Switched to official_admin account!', 'success');
            await this.init();
          } catch (err) {
            showToast('Switch failed: ' + err.message, 'error');
          }
        };
      }
      return;
    }

    if (officialLoadError) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state" style="color:var(--error-red);">
            ⚠️ Failed to load records from backend server: ${officialLoadError}.
            <button id="btn-table-retry" class="btn btn-sm" style="margin-left:10px;">Retry</button>
          </td>
        </tr>
      `;
      const retryBtn = document.getElementById('btn-table-retry');
      if (retryBtn) retryBtn.onclick = () => this.init();
      return;
    }

    const filterVal = (document.getElementById('status-filter')?.value || 'All').trim();
    const searchVal = (document.getElementById('search-input')?.value || '').trim().toLowerCase();

    const filtered = officialApplications.filter(app => {
      const instName = (app.institution_name || app.institution || '').toLowerCase();
      const fdrNum   = (app.fdr_number || '').toLowerCase();
      const bankName = (app.bank_name || '').toLowerCase();

      if (filterVal !== 'All') {
        const appStatus = (app.status || '').toLowerCase();
        if (appStatus !== filterVal.toLowerCase()) return false;
      }

      if (searchVal) {
        const matches = instName.includes(searchVal) || fdrNum.includes(searchVal) || bankName.includes(searchVal);
        if (!matches) return false;
      }

      return true;
    });

    if (officialApplications.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No FDR submissions found in database.</td></tr>';
      return;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            No submissions match your search "${searchVal}" or selected status "${filterVal}".
            <button id="btn-reset-filters" class="btn btn-sm" style="margin-left:8px;">Reset Filters</button>
          </td>
        </tr>
      `;
      const resetBtn = document.getElementById('btn-reset-filters');
      if (resetBtn) {
        resetBtn.onclick = () => {
          const f = document.getElementById('status-filter');
          const s = document.getElementById('search-input');
          if (f) f.value = 'All';
          if (s) s.value = '';
          this.renderTable();
        };
      }
      return;
    }

    filtered.forEach(app => {
      const tr = document.createElement('tr');
      const hasRealDoc = !!app.receipt_file_url;
      const hasDocMeta = !!app.receipt_filename;

      let docHtml = '';
      if (hasRealDoc) {
        docHtml = `<a href="${app.receipt_file_url}" target="_blank" rel="noopener noreferrer" class="btn btn-sm" style="display:inline-flex;align-items:center;gap:4px;text-decoration:none;background:#334155;color:#fff;">📄 View Document</a>`;
      } else if (hasDocMeta) {
        docHtml = `<span style="font-size:0.8rem;color:var(--text-muted);">📄 ${app.receipt_filename}</span>`;
      } else {
        docHtml = `<span style="font-size:0.8rem;color:var(--error-red);font-weight:600;">⚠️ Missing Document</span>`;
      }

      const hasDocumentForApproval = hasRealDoc || hasDocMeta;
      const st = (app.status || '').toLowerCase();
      let actionButtons = '';

      if (st === 'submitted') {
        const approveBtn = hasDocumentForApproval
          ? `<button class="btn btn-approve action-btn" data-id="${app.id}" data-action="approve" title="Approve FDR">Approve</button>`
          : `<button class="btn action-btn disabled-btn" data-id="${app.id}" data-action="approve" disabled style="opacity:0.4;cursor:not-allowed;" title="Approval blocked: Missing required FDR document">Approve</button>`;

        actionButtons = `
          <button class="btn btn-review action-btn-review" data-id="${app.id}" title="Inspect full details and audit notes">Review</button>
          ${approveBtn}
          <button class="btn btn-correct action-btn" data-id="${app.id}" data-action="correction" title="Request Corrections">Correct</button>
          <button class="btn btn-reject action-btn"  data-id="${app.id}" data-action="reject" title="Reject FDR">Reject</button>
        `;
      } else if (st === 'under review') {
        const approveBtn = hasDocumentForApproval
          ? `<button class="btn btn-approve action-btn" data-id="${app.id}" data-action="approve" title="Approve FDR">Approve</button>`
          : `<button class="btn action-btn disabled-btn" data-id="${app.id}" data-action="approve" disabled style="opacity:0.4;cursor:not-allowed;" title="Approval blocked: Missing required FDR document">Approve</button>`;

        actionButtons = `
          <button class="btn btn-review action-btn-review" data-id="${app.id}" title="Inspect full details and audit notes">Review</button>
          ${approveBtn}
          <button class="btn btn-correct action-btn" data-id="${app.id}" data-action="correction" title="Request Corrections">Correct</button>
          <button class="btn btn-reject action-btn"  data-id="${app.id}" data-action="reject" title="Reject FDR">Reject</button>
        `;
      } else if (st === 'correction required') {
        actionButtons = `
          <button class="btn btn-review action-btn-review" data-id="${app.id}" title="Inspect details">Review</button>
          <span style="font-size:0.75rem;color:var(--warning-orange);display:block;margin:4px 0;">Awaiting Institution Resubmission</span>
          <button class="btn btn-reject action-btn"  data-id="${app.id}" data-action="reject" title="Reject FDR">Reject</button>
        `;
      } else if (st === 'approved') {
        actionButtons = `
          <button class="btn btn-review action-btn-review" data-id="${app.id}" title="Inspect audit notes">Details</button>
          <span style="color:var(--success-green);font-size:0.85rem;font-weight:600;margin-left:4px;">✓ Approved</span>
        `;
      } else if (st === 'rejected') {
        actionButtons = `
          <button class="btn btn-review action-btn-review" data-id="${app.id}" title="Inspect audit notes">Details</button>
          <span style="color:var(--error-red);font-size:0.85rem;font-weight:600;margin-left:4px;">✗ Rejected</span>
        `;
      } else {
        actionButtons = `<button class="btn btn-review action-btn-review" data-id="${app.id}">Details</button>`;
      }

      tr.innerHTML = `
        <td><strong>${app.institution_name || app.institution || '—'}</strong></td>
        <td><code>${app.fdr_number}</code></td>
        <td>${formatAmount(app.amount)}</td>
        <td class="date-cell maturity-col">${formatDate(app.maturity_date || app.maturity)}</td>
        <td>${docHtml}</td>
        <td><span class="status-badge status-${statusClass(app.status)}">${app.status}</span></td>
        <td><div class="action-group">${actionButtons}</div></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleAction(e));
    });

    tbody.querySelectorAll('.action-btn-review').forEach(btn => {
      btn.addEventListener('click', (e) => this.openReviewModal(Number(e.target.dataset.id)));
    });
  },

  openReviewModal(id) {
    const app = officialApplications.find(a => a.id === id);
    if (!app) return;

    const existing = document.getElementById('review-modal');
    if (existing) existing.remove();

    const hasRealDoc = !!app.receipt_file_url;
    const hasDocMeta = !!app.receipt_filename;
    const hasDocument = hasRealDoc || hasDocMeta;

    let docSection = '';
    if (hasRealDoc) {
      docSection = `
        <div style="display:flex;align-items:center;gap:12px;">
          <a href="${app.receipt_file_url}" target="_blank" rel="noopener noreferrer" class="btn" style="background:#0284c7;color:#fff;text-decoration:none;">📄 View / Download Document</a>
          <span style="font-size:0.85rem;color:var(--text-muted);">${app.receipt_filename}</span>
        </div>
      `;
    } else if (hasDocMeta) {
      docSection = `<span style="font-size:0.88rem;color:var(--text-secondary);">📄 ${app.receipt_filename} (Simulated Demo Document)</span>`;
    } else {
      docSection = `
        <div style="background:#fef2f2;border:1px solid #fecaca;padding:0.65rem 0.85rem;border-radius:6px;color:#991b1b;font-size:0.85rem;">
          ⚠️ <strong>Missing Document:</strong> No FDR receipt has been uploaded for this submission. Official approval is prohibited until a valid document is provided.
        </div>
      `;
    }

    let notesHtml = '';
    if (app.review_notes && app.review_notes.length > 0) {
      notesHtml = app.review_notes.map(n => `
        <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-color);">
          <div style="font-weight:600;font-size:0.82rem;color:var(--text-primary);">
            ${n.reviewed_by_username || 'Reviewer'}: ${n.from_status} → ${n.to_status}
            <span style="font-weight:normal;color:var(--text-muted);margin-left:6px;">${formatDate(n.created_at)}</span>
          </div>
          <div style="color:var(--text-secondary);font-size:0.85rem;margin-top:2px;">${n.comment || 'No comment provided.'}</div>
        </div>
      `).join('');
    } else if (app.notes) {
      notesHtml = `<div style="font-size:0.85rem;color:var(--text-secondary);">${app.notes}</div>`;
    } else {
      notesHtml = `<div style="font-size:0.85rem;color:var(--text-muted);font-style:italic;">No review notes recorded yet.</div>`;
    }

    const st = (app.status || '').toLowerCase();
    let modalActionButtons = '';

    if (st === 'submitted') {
      const approveBtn = hasDocument
        ? `<button class="btn btn-approve" id="modal-act-approve">Approve</button>`
        : `<button class="btn" disabled style="opacity:0.4;cursor:not-allowed;" title="Blocked: Missing Document">Approve (Blocked)</button>`;

      modalActionButtons = `
        <button class="btn btn-review" id="modal-act-under-review">Mark Under Review</button>
        ${approveBtn}
        <button class="btn btn-correct" id="modal-act-correct">Request Correction</button>
        <button class="btn btn-reject" id="modal-act-reject">Reject</button>
      `;
    } else if (st === 'under review') {
      const approveBtn = hasDocument
        ? `<button class="btn btn-approve" id="modal-act-approve">Approve</button>`
        : `<button class="btn" disabled style="opacity:0.4;cursor:not-allowed;" title="Blocked: Missing Document">Approve (Blocked)</button>`;

      modalActionButtons = `
        ${approveBtn}
        <button class="btn btn-correct" id="modal-act-correct">Request Correction</button>
        <button class="btn btn-reject" id="modal-act-reject">Reject</button>
      `;
    } else if (st === 'correction required') {
      modalActionButtons = `
        <span style="font-size:0.85rem;color:var(--warning-orange);margin-right:8px;">Awaiting Institution Resubmission</span>
        <button class="btn btn-reject" id="modal-act-reject">Reject</button>
      `;
    } else {
      modalActionButtons = `<span style="font-size:0.9rem;font-weight:600;">Status: ${app.status} (Decision Final)</span>`;
    }

    const backdrop = document.createElement('div');
    backdrop.id = 'review-modal';
    backdrop.className = 'fdr-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fdr-modal">
        <div class="fdr-modal-header">
          <h3>FDR Submission Details: <code>${app.fdr_number}</code></h3>
          <button class="fdr-modal-close" id="review-close-btn">&times;</button>
        </div>
        <div class="fdr-modal-body">
          <div class="modal-grid">
            <div>
              <div class="modal-field-label">Institution</div>
              <div class="modal-field-value">${app.institution_name || app.institution || '—'}</div>
            </div>
            <div>
              <div class="modal-field-label">Current Status</div>
              <div class="modal-field-value"><span class="status-badge status-${statusClass(app.status)}">${app.status}</span></div>
            </div>
            <div>
              <div class="modal-field-label">Amount (INR)</div>
              <div class="modal-field-value" style="font-size:1.1rem;font-weight:700;color:var(--accent-blue);">${formatAmount(app.amount)}</div>
            </div>
            <div>
              <div class="modal-field-label">Maturity Date</div>
              <div class="modal-field-value date-cell">${formatDate(app.maturity_date || app.maturity)}</div>
            </div>
            <div>
              <div class="modal-field-label">Bank Branch</div>
              <div class="modal-field-value">${app.bank_name || 'Not specified'}</div>
            </div>
            <div>
              <div class="modal-field-label">Submission Date</div>
              <div class="modal-field-value date-cell">${formatDate(app.created_at || '—')}</div>
            </div>
          </div>

          <div>
            <div class="modal-field-label">FDR Receipt Document</div>
            ${docSection}
          </div>

          <div>
            <div class="modal-field-label">Official Review Notes & Audit Trail</div>
            <div class="modal-audit-box">${notesHtml}</div>
          </div>
        </div>
        <div class="fdr-modal-footer">
          <button class="btn" id="review-modal-close" style="background:#64748b;color:#fff;">Close</button>
          ${modalActionButtons}
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    document.getElementById('review-close-btn').onclick = close;
    document.getElementById('review-modal-close').onclick = close;

    const performModalAction = async (action) => {
      close();
      await this.executeAction(app, action);
    };

    const underReviewBtn = document.getElementById('modal-act-under-review');
    if (underReviewBtn) underReviewBtn.onclick = () => performModalAction('review');

    const approveBtn = document.getElementById('modal-act-approve');
    if (approveBtn) approveBtn.onclick = () => performModalAction('approve');

    const correctBtn = document.getElementById('modal-act-correct');
    if (correctBtn) correctBtn.onclick = () => performModalAction('correction');

    const rejectBtn = document.getElementById('modal-act-reject');
    if (rejectBtn) rejectBtn.onclick = () => performModalAction('reject');
  },

  async handleAction(e) {
    const btn    = e.target;
    const id     = btn.dataset.id;
    const action = btn.dataset.action;
    const numId  = Number(id);

    const app = officialApplications.find(a => a.id === numId || a.id === id);
    if (!app) return;

    await this.executeAction(app, action);
  },

  async executeAction(app, action) {
    // 1. Mandatory Document validation on Approval
    const hasDocument = !!app.receipt_file_url || !!app.receipt_filename;
    if (action === 'approve' && !hasDocument) {
      showToast('Approval Blocked: An FDR document is mandatory. The institution must upload a document before approval.', 'error');
      alert(`Approval Blocked for FDR #${app.fdr_number}:\n\nAn official FDR receipt document is mandatory and has not been uploaded. You cannot approve this submission until the institution provides the required document.`);
      return;
    }

    // 2. Mandatory Reason validation for Correction
    let comment = '';
    if (action === 'correction') {
      const input = prompt(
        `Enter mandatory correction instructions for FDR #${app.fdr_number}:\n(Explain what the institution must correct or re-upload)`,
        'Please re-upload a clear copy of the FDR with the official bank branch seal visible.'
      );
      if (input === null) return; // user cancelled prompt
      if (!input.trim()) {
        showToast('A correction reason is required when returning a submission.', 'error');
        alert('Action Cancelled: A correction reason is mandatory.');
        return;
      }
      comment = input.trim();
    } else if (action === 'reject') {
      // 3. Mandatory Reason validation for Rejection
      const input = prompt(
        `Enter mandatory rejection reason for FDR #${app.fdr_number}:\n(Explain why this security deposit is being rejected)`,
        'FDR terms do not comply with AICTE Approval Process Handbook requirements.'
      );
      if (input === null) return; // user cancelled prompt
      if (!input.trim()) {
        showToast('A rejection reason is required when rejecting a submission.', 'error');
        alert('Action Cancelled: A rejection reason is mandatory.');
        return;
      }
      comment = input.trim();
    }

    const prev = app.status;

    try {
      if (typeof Auth !== 'undefined' && Auth.isLoggedIn() && Auth.getRole() === 'official' && typeof ApiSubmissions !== 'undefined' && verifiedHealth?.healthy) {
        const updated = await ApiSubmissions.review(app.id, action, comment);
        const idx = officialApplications.findIndex(a => a.id === app.id);
        if (idx !== -1) officialApplications[idx] = updated;
        showToast(`${updated.institution_name}: ${prev} → ${updated.status}`, 'success');
      } else {
        const statusMap = {
          approve:    'Approved',
          reject:     'Rejected',
          correction: 'Correction Required',
          review:     'Under Review',
        };
        app.status = statusMap[action] || app.status;
        if (comment) app.notes = comment;

        const stored = Storage.get('fdrease-applications', []);
        const idx = stored.findIndex(a => a.id === app.id);
        if (idx !== -1) {
          stored[idx].status = app.status;
          if (comment) stored[idx].notes = comment;
          Storage.set('fdrease-applications', stored);
        }
        showToast(`${app.institution_name || 'Institution'}: ${prev} → ${app.status}`, 'info');
      }
    } catch (err) {
      showToast('Action failed: ' + err.message, 'error');
    }

    this.renderTable();
    renderStats('official-stats', officialApplications);
  },
};


// ==============================================================================
// DOM Ready Page Dispatcher (Element-Based, URL-Agnostic)
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  initMobileNav();
  initFooterYear();

  const isOfficialPage = !!document.getElementById('official-table-body') || !!document.querySelector('.official-section');
  const isInstitutionPage = !!document.getElementById('history-table') || !!document.querySelector('.institution-section');

  if (isOfficialPage) {
    Official.init();
  } else if (isInstitutionPage) {
    Institution.init();
  }
});
