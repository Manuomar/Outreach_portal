/**
 * Auto-detects the backend API base URL:
 * 1. Explicit VITE_API_BASE environment variable (if set)
 * 2. Auto-detect production URL based on hostname + path
 * 3. Local dev fallback: '/api' (proxied by Vite to local XAMPP Apache backend)
 */
function resolveApiBase() {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE.replace(/\/+$/, '')
  }

  if (typeof window !== 'undefined') {
    const { hostname, origin, pathname } = window.location

    // Auto-detect production domain: vdsai.com
    if (hostname.includes('vdsai.com')) {
      // Primary production path: /outreach_portal/frontend -> backend at /outreach_portal/backend
      if (pathname.includes('outreach_portal')) {
        return 'https://vdsai.com/outreach_portal/backend/public/api'
      }
      // Fallback for previous paths
      if (pathname.includes('iti_ccims_outreach')) {
        return 'https://vdsai.com/iti_ccims_outreach/backend/public/api'
      }
      // Default to outreach_portal
      return 'https://vdsai.com/outreach_portal/backend/public/api'
    }

    // Auto-detect remote production hosts
    if (import.meta.env.PROD && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      if (pathname.includes('outreach_portal')) {
        return `${origin}/outreach_portal/backend/public/api`
      }
      if (pathname.includes('iti_ccims_outreach')) {
        return `${origin}/iti_ccims_outreach/backend/public/api`
      }
      if (pathname.includes('iti_ccims_pitch')) {
        return `${origin}/iti_ccims_pitch/public/api`
      }
      return `${origin}/outreach_portal/backend/public/api`
    }
  }

  return '/api'
}

function redirectToLogin() {
  if (typeof window !== 'undefined') {
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/'
    const loginPath = base.endsWith('/') ? `${base}login` : `${base}/login`
    window.location.href = loginPath
  }
}

const BASE = resolveApiBase()

export const auth = {
  get token() {
    return localStorage.getItem('ccims_token')
  },
  get refreshToken() {
    return localStorage.getItem('ccims_refresh_token')
  },
  get user() {
    try {
      const u = localStorage.getItem('ccims_user')
      return u ? JSON.parse(u) : null
    } catch (_) {
      return null
    }
  },
  set(t, u = null, refreshToken = null) {
    if (t) localStorage.setItem('ccims_token', t)
    if (refreshToken) localStorage.setItem('ccims_refresh_token', refreshToken)
    if (u) localStorage.setItem('ccims_user', JSON.stringify(u))
  },
  setUser(u) {
    localStorage.setItem('ccims_user', JSON.stringify(u))
  },
  clear() {
    localStorage.removeItem('ccims_token')
    localStorage.removeItem('ccims_refresh_token')
    localStorage.removeItem('ccims_user')
  },
}

let isRefreshing = false
let refreshSubscribers = []

function onRefreshed(token) {
  refreshSubscribers.forEach(cb => cb(token))
  refreshSubscribers = []
}

async function tryRefreshToken() {
  const refToken = auth.refreshToken
  if (!refToken) return null

  try {
    const res = await fetch(BASE + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refToken }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success && data.token) {
      auth.set(data.token, data.user, data.refresh_token)
      return data.token
    }
  } catch (_) {}
  return null
}

async function req(method, path, body, isRetry = false) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth.token ? { Authorization: 'Bearer ' + auth.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  // Automatic token refresh on 401
  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/refresh' && !path.includes('test-connection') && !isRetry) {
    if (!isRefreshing) {
      isRefreshing = true
      const newToken = await tryRefreshToken()
      isRefreshing = false
      if (newToken) {
        onRefreshed(newToken)
        return req(method, path, body, true)
      } else {
        auth.clear()
        redirectToLogin()
        throw new Error('Session has expired. Please log in again.')
      }
    } else {
      // Queue concurrent requests while token is refreshing
      return new Promise((resolve, reject) => {
        refreshSubscribers.push((newToken) => {
          if (newToken) {
            resolve(req(method, path, body, true))
          } else {
            reject(new Error('Session expired'))
          }
        })
      })
    }
  }

  if (res.status === 401 && path !== '/auth/login' && !path.includes('test-connection')) {
    auth.clear()
    redirectToLogin()
    throw new Error('Session has expired. Please log in again.')
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Error ${res.status}`)
  }
  return data
}

export const api = {
  // Auth
  login: async (username, password) => {
    const data = await req('POST', '/auth/login', { username, password })
    if (data.token) {
      auth.set(data.token, data.user, data.refresh_token)
    }
    return data
  },
  refresh: () => tryRefreshToken(),
  logout: async () => {
    try {
      if (auth.refreshToken) {
        await req('POST', '/auth/logout', { refresh_token: auth.refreshToken })
      }
    } catch (_) {}
    auth.clear()
  },
  me: () => req('GET', '/auth/me'),

  // Users Management
  users: () => req('GET', '/users'),
  addUser: (b) => req('POST', '/users', b),
  updateUser: (id, b) => req('PUT', `/users/${id}`, b),
  deleteUser: (id) => req('DELETE', `/users/${id}`),

  // Leads & Numbers
  leads: (p = {}) => req('GET', '/leads?' + new URLSearchParams(p)),
  addLead: (b) => req('POST', '/leads', b),
  bulkLeads: (rows) => req('POST', '/leads/bulk', { rows }),
  updateLead: (id, b) => req('PUT', `/leads/${id}`, b),
  disableLead: (id) => req('POST', `/leads/${id}/disable`),
  enableLead: (id) => req('POST', `/leads/${id}/enable`),
  deleteLead: (id) => req('DELETE', `/leads/${id}`),

  // Calls
  calls: (p = {}) => req('GET', '/calls?' + new URLSearchParams(p)),
  call: (id) => req('GET', `/calls/${id}`),
  startCall: (lead_id, agent_id = null, from_phone_number = null) => {
    if (typeof lead_id === 'object' && lead_id !== null) {
      return req('POST', '/calls/start', lead_id)
    }
    return req('POST', '/calls/start', {
      lead_id,
      ...(agent_id ? { agent_id } : {}),
      ...(from_phone_number ? { from_phone_number } : {}),
    })
  },
  syncCall: (id) => req('POST', `/calls/${id}/sync`),
  hangup: (id) => req('POST', `/calls/${id}/hangup`),
  updateCall: (id, b) => req('PUT', `/calls/${id}`, b),

  // AI Agents
  agents: () => req('GET', '/agents'),
  inactiveAgents: () => req('GET', '/agents/inactive'),
  agent: (id) => req('GET', `/agents/${id}`),
  createAgent: (b) => req('POST', '/agents', b),
  importAgent: (b) => req('POST', '/agents/import', b),
  updateAgent: (id, b) => req('PUT', `/agents/${id}`, b),
  setDefaultAgent: (id) => req('POST', `/agents/${id}/default`),
  syncAgentExtractions: (id) => req('POST', `/agents/${id}/sync-extractions`),
  enableAgent: (id) => req('POST', `/agents/${id}/enable`),
  deleteAgent: (id) => req('DELETE', `/agents/${id}`),
  permanentDeleteAgent: (id) => req('POST', `/agents/${id}/permanent-delete`),

  // Knowledge Base (Bolna RAG API)
  knowledgebases: (accountId = null) => req('GET', `/knowledgebase${accountId ? `?bolna_account_id=${accountId}` : ''}`),
  uploadKnowledgebase: async (formData, accountId = null) => {
    const token = auth.token || localStorage.getItem('ccims_token')
    const url = `${BASE}/knowledgebase/upload${accountId ? `?bolna_account_id=${accountId}` : ''}`
    const r = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    if (r.status === 401) {
      auth.clear()
      redirectToLogin()
      throw new Error('Your session has expired. Please log in again.')
    }
    const data = await r.json().catch(() => ({}))
    if (!r.ok || data.success === false) {
      throw new Error(data.error || 'Failed to upload Knowledge Base')
    }
    return data
  },

  // Bolna Accounts (multi-account API key manager)
  bolnaAccounts: () => req('GET', '/bolna-accounts'),
  createBolnaAccount: (b) => req('POST', '/bolna-accounts', b),
  updateBolnaAccount: (id, b) => req('PUT', `/bolna-accounts/${id}`, b),
  setDefaultBolnaAccount: (id) => req('POST', `/bolna-accounts/${id}/default`),
  deleteBolnaAccount: (id) => req('DELETE', `/bolna-accounts/${id}`),
  testBolnaConnection: (b) => req('POST', '/bolna-accounts/test-connection', b),

  // Portal Settings (general key-value store)
  getSettings: () => req('GET', '/settings'),
  saveSetting: (key, value) => req('POST', '/settings', { key, value }),
  saveSettings: (settings) => req('POST', '/settings', { settings }),

  // Agent Templates (DB-stored prompt/KB templates)
  agentTemplates: () => req('GET', '/agent-templates'),
  agentTemplate: (slug) => req('GET', `/agent-templates/${slug}`),
  createAgentTemplate: (b) => req('POST', '/agent-templates', b),
  updateAgentTemplate: (id, b) => req('PUT', `/agent-templates/${id}`, b),

  // AI Prompt Generator & Gemini Keys
  generateFromDocument: async (formData) => {
    const token = auth.token || localStorage.getItem('ccims_token')
    const url = `${BASE}/generate-prompt`
    const r = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    if (r.status === 401) {
      auth.clear()
      redirectToLogin()
      throw new Error('Session expired. Please log in again.')
    }
    const data = await r.json().catch(() => ({}))
    if (!r.ok || data.success === false) {
      throw new Error(data.error || 'Failed to generate prompt')
    }
    return data
  },
  geminiKeys: () => req('GET', '/gemini-keys'),
  geminiAvailableModels: () => req('GET', '/gemini-available-models'),
  addGeminiKey: (api_key) => req('POST', '/gemini-keys', { api_key }),
  deleteGeminiKey: (index) => req('DELETE', '/gemini-keys', { index }),
  updateGeminiModels: (models) => req('POST', '/gemini-models', { models }),

  // Extraction Fields (global DB-stored extraction field definitions)
  extractionFields: () => req('GET', '/extraction-fields'),
  createExtractionField: (b) => req('POST', '/extraction-fields', b),
  updateExtractionField: (id, b) => req('PUT', `/extraction-fields/${id}`, b),
  deleteExtractionField: (id) => req('DELETE', `/extraction-fields/${id}`),

  // Dashboard & Meetings
  stats: () => req('GET', '/stats'),
  meetings: () => req('GET', '/meetings'),
}
