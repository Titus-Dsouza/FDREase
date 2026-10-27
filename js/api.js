/**
 * api.js — FDREase Phase 2 frontend API client
 * Handles auth token management and all fetch() calls to the Django backend.
 * The backend base URL is configured once below.
 */

const API_BASE = 'http://localhost:8000/api';

// ─── Token storage ────────────────────────────────────────────────────────────
const Auth = {
  getToken()          { return localStorage.getItem('fdrease-token'); },
  setToken(t)         { localStorage.setItem('fdrease-token', t); },
  getRole()           { return localStorage.getItem('fdrease-role'); },
  setRole(r)          { localStorage.setItem('fdrease-role', r); },
  getUsername()       { return localStorage.getItem('fdrease-username'); },
  setUsername(u)      { localStorage.setItem('fdrease-username', u); },
  getInstitutionName(){ return localStorage.getItem('fdrease-inst-name') || 'XYZ Institute'; },
  setInstitutionName(n){ if (n) localStorage.setItem('fdrease-inst-name', n); else localStorage.removeItem('fdrease-inst-name'); },
  isLoggedIn()        { return !!this.getToken(); },
  isOfficial()        { return this.getRole() === 'official'; },
  logout() {
    const token = this.getToken();
    if (token) {
      fetch(`${API_BASE}/auth/logout/`, {
        method: 'DELETE',
        headers: authHeaders(),
      }).catch(() => {});
    }
    localStorage.removeItem('fdrease-token');
    localStorage.removeItem('fdrease-role');
    localStorage.removeItem('fdrease-username');
    localStorage.removeItem('fdrease-inst-name');
  },
};

function authHeaders(extra = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (token) headers['Authorization'] = `Token ${token}`;
  return headers;
}

// ─── Generic request wrapper ──────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = options.headers || authHeaders();
  const res = await fetch(url, { ...options, headers });

  if (res.status === 204) return null;         // No Content
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Flatten DRF error format into a single readable string
    const msg = flattenErrors(data) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function flattenErrors(data) {
  if (!data || typeof data !== 'object') return String(data);
  // DRF field errors: { field: ["msg"], ... }
  return Object.values(data)
    .flat()
    .filter(v => typeof v === 'string')
    .join(' | ');
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────
const ApiAuth = {
  async register(username, email, password, institutionName) {
    return apiFetch('/auth/register/', {
      method: 'POST',
      body: JSON.stringify({
        username, email, password,
        institution_name: institutionName,
      }),
    });
  },

  async login(username, password) {
    return apiFetch('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async me() {
    return apiFetch('/auth/me/');
  },
};

// ─── Submissions endpoints ────────────────────────────────────────────────────
const ApiSubmissions = {
  async list(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/submissions/${qs ? '?' + qs : ''}`);
  },

  async get(id) {
    return apiFetch(`/submissions/${id}/`);
  },

  async create(formData) {
    // multipart/form-data for file upload — do NOT set Content-Type manually
    const token = Auth.getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Token ${token}`;
    const res = await fetch(`${API_BASE}/submissions/`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(flattenErrors(data) || `HTTP ${res.status}`);
    return data;
  },

  async update(id, formData) {
    // multipart/form-data for updating files / resubmissions
    const token = Auth.getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Token ${token}`;
    const res = await fetch(`${API_BASE}/submissions/${id}/`, {
      method: 'PATCH',
      headers,
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(flattenErrors(data) || `HTTP ${res.status}`);
    return data;
  },

  async review(id, action, comment = '') {
    return apiFetch(`/submissions/${id}/review/`, {
      method: 'POST',
      body: JSON.stringify({ action, comment }),
    });
  },
};

// ─── Stats endpoint ───────────────────────────────────────────────────────────
const ApiStats = {
  async get() {
    return apiFetch('/stats/');
  },
};

// ─── Health check ─────────────────────────────────────────────────────────────
const ApiHealth = {
  async check() {
    try {
      const res = await fetch(`${API_BASE}/health/`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) return { healthy: false, database: 'disconnected' };
      const data = await res.json().catch(() => ({}));
      return {
        healthy: data.status === 'healthy',
        database: data.database || 'disconnected',
        engine: data.engine || 'unknown',
        count: data.submissions_count ?? null,
      };
    } catch (err) {
      return { healthy: false, database: 'disconnected', error: err.message };
    }
  },
};

