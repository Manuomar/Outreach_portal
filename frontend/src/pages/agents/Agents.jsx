import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot, Plus, RefreshCw, Search, CheckCircle2, Trash2, Eye,
  PhoneCall, Sparkles, Volume2, Check, AlertCircle, Copy,
  Layers, Settings, Key, Pencil, Wifi, BadgeCheck, Building2,
  Star, Zap, Database, CheckSquare, Square, Tag, Table,
  ToggleLeft, ToggleRight, Save, UploadCloud, Ban,
} from 'lucide-react'
import { api } from '../../api'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { Pagination } from '../../components/ui.jsx'

// ─── Constants ───────────────────────────────────────────────────────────────

import {
  VOICE_OPTIONS,
  LANGUAGE_OPTIONS,
  LLM_PROVIDERS,
  MODELS_BY_PROVIDER,
  ALL_MODEL_OPTIONS,
} from '../../data/agentConstants'

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }

// ─── Mini ExtractionFields for Edit Modal (compact) ─────────────────────────

function CompactExtractionPanel({ fields, setFields, dbFields }) {
  const catColors = {
    'Core':   { bg: '#f0f7ff', border: '#bfdbfe', check: '#2563eb', badge: '#dbeafe', badgeText: '#1e40af' },
    'Survey': { bg: '#fffbeb', border: '#fed7aa', check: '#d97706', badge: '#fef3c7', badgeText: '#92400e' },
    'Custom': { bg: '#f0fdf4', border: '#bbf7d0', check: '#16a34a', badge: '#dcfce7', badgeText: '#15803d' },
  }

  const grouped = useMemo(() => {
    const cats = {}
    fields.forEach(f => {
      const cat = f.category || 'Core'
      if (!cats[cat]) cats[cat] = []
      cats[cat].push(f)
    })
    return cats
  }, [fields])

  const toggle = (key) => setFields(prev => prev.map(f => f.key === key ? { ...f, enabled: !f.enabled } : f))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => setFields(p => p.map(f => ({ ...f, enabled: true })))}
          style={{ border: 'none', background: 'none', color: '#103778', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}>Select All</button>
        <span style={{ color: '#cbd5e1' }}>|</span>
        <button type="button" onClick={() => setFields(p => p.map(f => ({ ...f, enabled: false })))}
          style={{ border: 'none', background: 'none', color: '#64748b', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}>Deselect All</button>
        {dbFields.length > 0 && (
          <>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <button type="button" onClick={() => setFields(dbFields)}
              style={{ border: 'none', background: 'none', color: '#f26522', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}>Reset from DB</button>
          </>
        )}
      </div>

      {/* Per-category rows */}
      {Object.entries(grouped).map(([cat, catFields]) => {
        const colors = catColors[cat] || catColors['Custom']
        return (
          <div key={cat}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>
              {cat} Fields
              <span style={{ background: colors.badge, color: colors.badgeText, marginLeft: '6px', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', fontWeight: 700, fontFamily: 'monospace' }}>
                {cat === 'Core' ? 'pitch_calls' : 'pitch_call_answers'}
              </span>
            </div>
            {catFields.map(f => (
              <div key={f.key} onClick={() => toggle(f.key)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 8px', borderRadius: '6px', border: f.enabled ? `1px solid ${colors.border}` : '1px solid #e2e8f0', background: f.enabled ? colors.bg : '#fcfcfc', cursor: 'pointer', marginBottom: '4px' }}>
                <div style={{ color: f.enabled ? colors.check : '#94a3b8', flexShrink: 0 }}>
                  {f.enabled ? <CheckSquare size={13} /> : <Square size={13} />}
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: f.enabled ? '#0f172a' : '#64748b', flex: 1 }}>{f.label}</span>
                <code style={{ fontSize: '10px', background: f.enabled ? colors.badge : '#e2e8f0', color: f.enabled ? colors.badgeText : '#64748b', padding: '1px 4px', borderRadius: '3px' }}>{f.key}</code>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Agents() {
  const nav = useNavigate()
  const [activeView, setActiveView] = useState('agents')

  // Agents
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  // Inactive agents
  const [inactiveAgents, setInactiveAgents] = useState([])
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'active' | 'inactive'
  const [accountFilter, setAccountFilter] = useState('all')
  const [enablingId, setEnablingId] = useState(null)

  // Bolna accounts
  const [accounts, setAccounts] = useState([])
  const [accountsLoading, setAccountsLoading] = useState(false)

  // DB Templates + Extraction Fields
  const [dbTemplates, setDbTemplates] = useState([])       // [{slug, name, ...}]
  const [dbFields, setDbFields] = useState([])             // default extraction fields from DB
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Modals
  const [inspectAgent, setInspectAgent] = useState(null)
  const [editAgent, setEditAgent] = useState(null)
  const [activeTab, setActiveTab] = useState('prompt')
  const [copiedId, setCopiedId] = useState(null)

  // Edit form
  const [editName, setEditName] = useState('')
  const [editWelcome, setEditWelcome] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editKb, setEditKb] = useState('')
  const [editAccountId, setEditAccountId] = useState('')
  const [editExtractionFields, setEditExtractionFields] = useState([])
  const [showEditExtraction, setShowEditExtraction] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState(null)
  const [editSuccess, setEditSuccess] = useState(null)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [pdfUploadMsg, setPdfUploadMsg] = useState(null)
  const [editRagIds, setEditRagIds] = useState([])
  const [editRagKbs, setEditRagKbs] = useState([])
  const [loadingEditKbs, setLoadingEditKbs] = useState(false)

  // Template loading state (for edit modal)
  const [loadingTemplateSlug, setLoadingTemplateSlug] = useState(null)
  const [templateMsg, setTemplateMsg] = useState(null)

  // Sync
  const [syncingAgentId, setSyncingAgentId] = useState(null)
  const [syncStatusMsg, setSyncStatusMsg] = useState(null)

  // Add/Edit account modal
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [editAccountModal, setEditAccountModal] = useState(null)
  const [acctLabel, setAcctLabel] = useState('')
  const [acctKey, setAcctKey] = useState('')
  const [acctUrl, setAcctUrl] = useState('https://api.bolna.ai')
  const [acctSubmitting, setAcctSubmitting] = useState(false)
  const [acctError, setAcctError] = useState(null)
  const [acctSuccess, setAcctSuccess] = useState(null)
  const [showAcctKey, setShowAcctKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Import from Bolna modal
  const [showImport, setShowImport] = useState(false)
  const [importAgentId, setImportAgentId] = useState('')
  const [importAccountId, setImportAccountId] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importSuccess, setImportSuccess] = useState(null)

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadAgents = useCallback(() => {
    setLoading(true)
    api.agents()
      .then(r => setAgents(r.data || []))
      .catch(e => console.error('Failed to load agents:', e))
      .finally(() => setLoading(false))
  }, [])

  const loadInactiveAgents = useCallback(() => {
    api.inactiveAgents()
      .then(r => setInactiveAgents(r.data || []))
      .catch(() => setInactiveAgents([]))
  }, [])

  const loadAccounts = useCallback(() => {
    setAccountsLoading(true)
    api.bolnaAccounts()
      .then(r => setAccounts(r.data || []))
      .catch(e => console.error('Failed to load accounts:', e))
      .finally(() => setAccountsLoading(false))
  }, [])

  useEffect(() => {
    loadAgents()
    loadInactiveAgents()
    loadAccounts()

    // Load DB templates + extraction fields
    setLoadingTemplates(true)
    Promise.all([api.agentTemplates(), api.extractionFields()])
      .then(([tRes, fRes]) => {
        setDbTemplates(Array.isArray(tRes.data) ? tRes.data : [])
        setDbFields(Array.isArray(fRes.data) ? fRes.data : [])
      })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false))
  }, [])

  // ── Combined Active + Inactive Agents ───────────────────────────────────

  const allCombinedAgents = useMemo(() => {
    const act = agents.map(a => ({ ...a, status_flag: 'active' }))
    const inact = inactiveAgents.map(a => ({ ...a, status_flag: 'inactive' }))
    return [...act, ...inact]
  }, [agents, inactiveAgents])

  // ── Filtering ────────────────────────────────────────────────────────────

  const filteredAgents = useMemo(() => {
    return allCombinedAgents.filter(a => {
      // Status filter
      if (statusFilter === 'active' && a.status_flag !== 'active') return false
      if (statusFilter === 'inactive' && a.status_flag !== 'inactive') return false

      // Account filter
      if (accountFilter !== 'all' && String(a.bolna_account_id) !== String(accountFilter)) return false

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesName = (a.name || '').toLowerCase().includes(q)
        const matchesId = (a.bolna_agent_id || '').toLowerCase().includes(q)
        const matchesVoice = (a.voice_name || '').toLowerCase().includes(q)
        if (!matchesName && !matchesId && !matchesVoice) return false
      }

      return true
    })
  }, [allCombinedAgents, statusFilter, accountFilter, search])

  const paginatedAgents = useMemo(() => {
    const start = (page - 1) * limit
    return filteredAgents.slice(start, start + limit)
  }, [filteredAgents, page, limit])

  const accountOptions = useMemo(() =>
    accounts.map(a => ({ value: String(a.id), label: a.label + (Number(a.is_default) === 1 ? ' (Default)' : ''), subtitle: `${a.api_key} · ${a.agent_count} agent(s)` })),
    [accounts]
  )

  // ── Agent Handlers ───────────────────────────────────────────────────────

  const handleSetDefault = async (agent) => {
    try { await api.setDefaultAgent(agent.id); loadAgents() }
    catch (e) { alert('Failed to set default agent: ' + e.message) }
  }

  const handleDisable = async (agent) => {
    if (Number(agent.is_default) === 1) {
      alert('Cannot disable the default agent. Set another agent as default first.')
      return
    }
    if (window.confirm(`Disable agent "${agent.name}"?\n\nIt will be hidden from the active list. You can re-enable it anytime from the Inactive Agents panel.`)) {
      try {
        await api.deleteAgent(agent.id)
        loadAgents()
        loadInactiveAgents()
      } catch (e) {
        alert('Failed to disable agent: ' + e.message)
      }
    }
  }

  const handlePermanentDelete = async (agent) => {
    if (Number(agent.is_default) === 1) {
      alert('Cannot delete the default agent. Set another agent as default first.')
      return
    }
    if (window.confirm(`⚠️ PERMANENTLY DELETE agent "${agent.name}"?\n\nThis will remove it from both your database AND Bolna AI. This action CANNOT be undone.`)) {
      try {
        const result = await api.permanentDeleteAgent(agent.id)
        loadAgents()
        loadInactiveAgents()
        if (result.bolna_deleted) {
          alert('Agent permanently deleted from database and Bolna AI.')
        } else {
          alert('Agent deleted from database. (Bolna API cleanup may require manual removal.)')
        }
      } catch (e) {
        alert('Failed to delete agent: ' + e.message)
      }
    }
  }

  const handleEnable = async (agent) => {
    setEnablingId(agent.id)
    try { await api.enableAgent(agent.id); loadAgents(); loadInactiveAgents() }
    catch (e) { alert('Failed to enable agent: ' + e.message) }
    finally { setEnablingId(null) }
  }

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handlePdfUpload = async (file, accountId) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) { alert('Bolna only accepts PDF files.'); return }
    const fd = new FormData(); fd.append('file', file)
    setUploadingPdf(true); setPdfUploadMsg(null)
    try {
      const res = await api.uploadKnowledgebase(fd, accountId || null)
      const d = res.data || res
      setPdfUploadMsg({ type: 'success', text: `Uploaded ${d.file_name}! RAG ID: ${d.rag_id} (${d.status})` })
    } catch (err) {
      setPdfUploadMsg({ type: 'error', text: err.message || 'Upload failed' })
    } finally { setUploadingPdf(false) }
  }

  const handleFileUpload = (e, setter, accountId = null) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.name.toLowerCase().endsWith('.pdf')) { handlePdfUpload(file, accountId); e.target.value = ''; return }
    const reader = new FileReader()
    reader.onload = (ev) => { if (typeof ev.target?.result === 'string') setter(prev => prev ? `${prev}\n\n---\n\n${ev.target.result}` : ev.target.result) }
    reader.readAsText(file); e.target.value = ''
  }

  // ── Load template from DB into edit modal ────────────────────────────────

  const handleLoadTemplate = async (slug) => {
    setLoadingTemplateSlug(slug); setTemplateMsg(null)
    try {
      const r = await api.agentTemplate(slug)
      const t = r.data
      if (t.system_prompt) setEditPrompt(t.system_prompt)
      if (t.knowledge_base) setEditKb(t.knowledge_base)
      if (t.welcome_message) setEditWelcome(t.welcome_message)
      setTemplateMsg({ type: 'success', text: `Template "${t.name}" loaded!` })
      setTimeout(() => setTemplateMsg(null), 3000)
    } catch (e) {
      setTemplateMsg({ type: 'error', text: e.message || 'Failed to load template' })
    } finally { setLoadingTemplateSlug(null) }
  }

  // ── Open edit modal ──────────────────────────────────────────────────────

  const openEditModal = (agent) => {
    setEditAgent(agent)
    setEditName(agent.name || '')
    setEditWelcome(agent.welcome_message || '')
    setEditPrompt(agent.system_prompt || '')
    setEditKb(agent.knowledge_base || '')
    setEditAccountId(agent.bolna_account_id ? String(agent.bolna_account_id) : (accounts.find(a => a.is_default === 1)?.id?.toString() || ''))
    setTemplateMsg(null)
    setPdfUploadMsg(null)

    // RAG IDs
    let existingRags = []
    if (agent.rag_ids) {
      try { existingRags = typeof agent.rag_ids === 'string' ? JSON.parse(agent.rag_ids) : agent.rag_ids } catch (_) {}
    }
    setEditRagIds(Array.isArray(existingRags) ? existingRags : [])
    setEditRagKbs([])

    const acctId = agent.bolna_account_id || null
    setLoadingEditKbs(true)
    api.knowledgebases(acctId)
      .then(res => setEditRagKbs(Array.isArray(res.data) ? res.data : []))
      .catch(() => setEditRagKbs([]))
      .finally(() => setLoadingEditKbs(false))

    // Extraction fields — agent's saved config merged with DB defaults
    let parsedExt = dbFields.length > 0 ? dbFields : []
    if (agent.extraction_config) {
      try {
        const parsed = typeof agent.extraction_config === 'string'
          ? JSON.parse(agent.extraction_config) : agent.extraction_config
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge: agent saved state + any new DB fields not yet in agent config
          const savedKeys = new Set(parsed.map(f => f.key))
          const merged = [
            ...parsed,
            ...dbFields.filter(f => !savedKeys.has(f.key)),
          ]
          parsedExt = merged
        }
      } catch (_) {}
    }
    setEditExtractionFields(parsedExt)
    setShowEditExtraction(false)
    setEditError(null); setEditSuccess(null)
  }

  const handleEditAgent = async (e) => {
    e.preventDefault()
    setEditError(null); setEditSuccess(null)
    setEditSubmitting(true)
    try {
      await api.updateAgent(editAgent.id, {
        name: editName.trim(),
        welcome_message: editWelcome.trim(),
        system_prompt: editPrompt.trim(),
        knowledge_base: editKb.trim(),
        extraction_config: editExtractionFields,
        bolna_account_id: editAccountId ? Number(editAccountId) : null,
        rag_ids: editRagIds,
      })
      setEditSuccess('Agent updated and synced to Bolna AI.')
      loadAgents()
      setTimeout(() => { setEditAgent(null); setEditSuccess(null) }, 1500)
    } catch (err) { setEditError(err.message || 'Failed to update agent') }
    finally { setEditSubmitting(false) }
  }

  const handleSyncExtractions = async (agentId) => {
    setSyncingAgentId(agentId); setSyncStatusMsg(null)
    try {
      const res = await api.syncAgentExtractions(agentId)
      setSyncStatusMsg({ type: 'success', text: res.message || 'Successfully synchronized extractions to Bolna portal!' })
      loadAgents()
    } catch (err) {
      setSyncStatusMsg({ type: 'error', text: err.message || 'Failed to sync extractions' })
    } finally { setSyncingAgentId(null) }
  }

  // ── Account Handlers ─────────────────────────────────────────────────────

  const resetAcctForm = () => {
    setAcctLabel(''); setAcctKey(''); setAcctUrl('https://api.bolna.ai')
    setAcctError(null); setAcctSuccess(null); setTestResult(null); setShowAcctKey(false)
  }

  const openAddAccount = () => { resetAcctForm(); setShowAddAccount(true) }

  const openEditAccount = (acct) => {
    resetAcctForm()
    setEditAccountModal(acct)
    setAcctLabel(acct.label || '')
    setAcctKey('')
    setAcctUrl(acct.base_url || 'https://api.bolna.ai')
  }

  const handleTestConnection = async () => {
    setTestResult(null); setTesting(true)
    try {
      const res = await api.testBolnaConnection({ api_key: acctKey, base_url: acctUrl })
      setTestResult({ ok: true, msg: res.message })
    } catch (err) { setTestResult({ ok: false, msg: err.message }) }
    finally { setTesting(false) }
  }

  const handleSaveAccount = async (e) => {
    e.preventDefault()
    setAcctError(null); setAcctSuccess(null)
    if (!acctLabel.trim()) { setAcctError('Account label is required.'); return }
    setAcctSubmitting(true)
    try {
      if (editAccountModal) {
        const payload = { label: acctLabel.trim(), base_url: acctUrl.trim() }
        if (acctKey.trim()) payload.api_key = acctKey.trim()
        await api.updateBolnaAccount(editAccountModal.id, payload)
        setAcctSuccess('Account updated.')
      } else {
        if (!acctKey.trim() || !acctKey.startsWith('bn-')) { setAcctError('A valid Bolna API key starting with bn- is required.'); setAcctSubmitting(false); return }
        await api.createBolnaAccount({ label: acctLabel.trim(), api_key: acctKey.trim(), base_url: acctUrl.trim() })
        setAcctSuccess('Account added.')
      }
      loadAccounts()
      setTimeout(() => { setShowAddAccount(false); setEditAccountModal(null); resetAcctForm() }, 1200)
    } catch (err) { setAcctError(err.message || 'Save failed') }
    finally { setAcctSubmitting(false) }
  }

  const handleSetDefaultAccount = async (acct) => {
    try { await api.setDefaultBolnaAccount(acct.id); loadAccounts() }
    catch (e) { alert('Failed: ' + e.message) }
  }

  const handleDeleteAccount = async (acct) => {
    if (Number(acct.is_default) === 1) { alert('Cannot delete the default account.'); return }
    if (window.confirm(`Remove account "${acct.label}"?`)) {
      try { await api.deleteBolnaAccount(acct.id); loadAccounts() }
      catch (e) { alert(e.message) }
    }
  }

  const defaultAgent = agents.find(a => Number(a.is_default) === 1) || agents[0]

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ══ 1. TOP METRIC CARDS (CLICKABLE FILTERS) ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '12px' }}>
        {/* Card 1: All Configured Agents */}
        <div
          onClick={() => { setActiveView('agents'); setStatusFilter('all'); setPage(1) }}
          style={{
            background: '#fff',
            border: statusFilter === 'all' && activeView === 'agents' ? '2px solid #0284c7' : '1px solid #e2e8f0',
            borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
            cursor: 'pointer', transition: 'all 0.15s ease',
            boxShadow: statusFilter === 'all' && activeView === 'agents' ? '0 3px 10px rgba(2,132,199,0.15)' : 'none',
          }}
          title="Click to view all agents"
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#e0f2fe', color: '#0284c7', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Layers size={19} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{allCombinedAgents.length}</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: statusFilter === 'all' && activeView === 'agents' ? '#0284c7' : '#64748b' }}>
              All Agents {statusFilter === 'all' && activeView === 'agents' ? '✓' : ''}
            </div>
          </div>
        </div>

        {/* Card 2: Active Agents */}
        <div
          onClick={() => { setActiveView('agents'); setStatusFilter('active'); setPage(1) }}
          style={{
            background: '#fff',
            border: statusFilter === 'active' && activeView === 'agents' ? '2px solid #16a34a' : '1px solid #e2e8f0',
            borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
            cursor: 'pointer', transition: 'all 0.15s ease',
            boxShadow: statusFilter === 'active' && activeView === 'agents' ? '0 3px 10px rgba(22,163,74,0.15)' : 'none',
          }}
          title="Click to filter active agents"
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#dcfce7', color: '#16a34a', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Bot size={19} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{agents.length}</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: statusFilter === 'active' && activeView === 'agents' ? '#16a34a' : '#64748b' }}>
              Active Agents {statusFilter === 'active' && activeView === 'agents' ? '✓' : ''}
            </div>
          </div>
        </div>

        {/* Card 3: Inactive Agents */}
        <div
          onClick={() => { setActiveView('agents'); setStatusFilter('inactive'); setPage(1) }}
          style={{
            background: '#fff',
            border: statusFilter === 'inactive' && activeView === 'agents' ? '2px solid #d97706' : '1px solid #e2e8f0',
            borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
            cursor: 'pointer', transition: 'all 0.15s ease',
            boxShadow: statusFilter === 'inactive' && activeView === 'agents' ? '0 3px 10px rgba(217,119,6,0.15)' : 'none',
          }}
          title="Click to filter inactive agents"
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#fef3c7', color: '#d97706', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <ToggleLeft size={19} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{inactiveAgents.length}</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: statusFilter === 'inactive' && activeView === 'agents' ? '#d97706' : '#64748b' }}>
              Inactive Agents {statusFilter === 'inactive' && activeView === 'agents' ? '✓' : ''}
            </div>
          </div>
        </div>

        {/* Card 4: Primary Default Agent */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#dcfce7', color: '#16a34a', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <BadgeCheck size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {defaultAgent?.name || 'None'}
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b' }}>Default Agent</div>
          </div>
        </div>

        {/* Card 5: Total Calls */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#ffedd5', color: '#ea580c', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <PhoneCall size={19} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
              {agents.reduce((a, x) => a + Number(x.total_calls || 0), 0)}
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b' }}>Calls Dispatched</div>
          </div>
        </div>

        {/* Card 6: Bolna Accounts */}
        <div
          onClick={() => setActiveView('settings')}
          style={{
            background: '#fff',
            border: activeView === 'settings' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
            borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
            cursor: 'pointer', transition: 'all 0.15s ease',
          }}
          title="Click to manage Bolna Accounts"
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#f3e8ff', color: '#7c3aed', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Building2 size={19} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{accounts.length}</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: activeView === 'settings' ? '#7c3aed' : '#64748b' }}>
              Accounts {activeView === 'settings' ? '✓' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* ══ 2. AGENT HEADER CARD ══ */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#103778', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <Bot size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#103778' }}>AI Voice Outreach Agents</h2>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b' }}>Create, configure, and synchronize custom Bolna AI agents with your prompts and knowledge bases.</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
            {[['agents', Bot, 'Agents'], ['settings', Settings, 'Agent Settings']].map(([view, Icon, label]) => (
              <button key={view} type="button" onClick={() => setActiveView(view)} style={{
                padding: '6px 14px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                background: activeView === view ? '#fff' : 'transparent',
                color: activeView === view ? '#103778' : '#64748b',
                boxShadow: activeView === view ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}>
                <Icon size={13} />{label}
              </button>
            ))}
          </div>
          {activeView === 'agents' && (
            <>
              <button type="button" onClick={() => { loadAgents(); loadInactiveAgents() }} className="btn ghost" style={{ height: '38px', padding: '0 14px', fontSize: '13px' }}>
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
              <button type="button" onClick={() => { setImportAgentId(''); setImportAccountId(''); setImportError(null); setImportSuccess(null); setShowImport(true) }} className="btn ghost" style={{ height: '38px', padding: '0 14px', fontSize: '13px', borderColor: '#f26522', color: '#f26522' }}>
                <Database size={15} /> Import from Bolna
              </button>
              <button type="button" onClick={() => nav('/agents/create')} className="btn primary" style={{ height: '38px', padding: '0 18px', fontSize: '13px' }}>
                <Plus size={16} /> Create New Agent
              </button>
            </>
          )}
        </div>
      </div>

      {/* ══ AGENTS VIEW ══ */}
      {activeView === 'agents' && (
        <>
          {/* ══ 3. FILTERS BAR ══ */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            {/* Status Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginRight: '4px' }}>Filter:</span>
              {[
                { id: 'all', label: 'All', count: allCombinedAgents.length, color: '#0284c7', bg: '#e0f2fe' },
                { id: 'active', label: 'Active', count: agents.length, color: '#16a34a', bg: '#dcfce7' },
                { id: 'inactive', label: 'Inactive', count: inactiveAgents.length, color: '#d97706', bg: '#fef3c7' },
              ].map(tab => {
                const isSelected = statusFilter === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setStatusFilter(tab.id); setPage(1) }}
                    style={{
                      padding: '5px 12px', borderRadius: '6px',
                      border: isSelected ? `1.5px solid ${tab.color}` : '1px solid #e2e8f0',
                      background: isSelected ? tab.bg : '#fff',
                      color: isSelected ? tab.color : '#64748b',
                      fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{tab.label}</span>
                    <span style={{
                      background: isSelected ? tab.color : '#f1f5f9',
                      color: isSelected ? '#fff' : '#64748b',
                      padding: '1px 6px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 800,
                    }}>
                      {tab.count}
                    </span>
                  </button>
                )
              })}

              {/* Account filter dropdown if multiple accounts */}
              {accounts.length > 1 && (
                <select
                  value={accountFilter}
                  onChange={e => { setAccountFilter(e.target.value); setPage(1) }}
                  style={{
                    height: '32px', padding: '0 10px', borderRadius: '6px',
                    border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 600,
                    color: '#334155', background: '#fff', outline: 'none', marginLeft: '6px',
                  }}
                >
                  <option value="all">All Accounts ({accounts.length})</option>
                  {accounts.map(ac => (
                    <option key={ac.id} value={String(ac.id)}>{ac.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search agents by name, ID, voice…"
                style={{
                  paddingLeft: '32px', paddingRight: '12px', height: '34px',
                  borderRadius: '7px', border: '1px solid #cbd5e1', background: '#f8fafc',
                  color: '#0f172a', fontSize: '12px', outline: 'none', width: '230px',
                }}
              />
            </div>
          </div>

          {/* ══ 4. MAIN AGENTS TABLE ══ */}
          <div className="table-card">
            <div className="table-navy-header">
              <div className="title-group">
                <Bot size={18} style={{ color: '#fff' }} />
                <span className="title-text">Voice Agent Repository</span>
                <span className="counter-pill">
                  {statusFilter === 'inactive' ? 'Inactive' : statusFilter === 'active' ? 'Active' : 'All'}: {filteredAgents.length} Agents
                </span>
              </div>
            </div>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>Agent Name</th>
                    <th style={{ width: '18%' }}>Bolna Agent ID</th>
                    <th style={{ width: '14%' }}>Voice</th>
                    <th style={{ width: '12%' }}>Model</th>
                    <th style={{ width: '12%' }}>Account</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>Calls</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>Status</th>
                    <th style={{ width: '6%', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="empty"><RefreshCw size={16} className="animate-spin" style={{ display: 'inline', marginRight: 8 }} />Loading agents...</td></tr>
                  ) : paginatedAgents.length === 0 ? (
                    <tr><td colSpan={8} className="empty">
                      {search ? 'No agents match your search.' : `No ${statusFilter === 'inactive' ? 'inactive' : statusFilter === 'active' ? 'active' : ''} agents found.`}
                    </td></tr>
                  ) : paginatedAgents.map(agent => {
                    const isDefault = Number(agent.is_default) === 1
                    const isInactive = agent.status_flag === 'inactive'
                    return (
                      <tr key={agent.id} style={{ background: isInactive ? '#fafaf9' : '#fff' }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '8px',
                              background: isInactive ? '#f1f5f9' : isDefault ? '#103778' : '#e0f2fe',
                              color: isInactive ? '#94a3b8' : isDefault ? '#fff' : '#0369a1',
                              display: 'grid', placeItems: 'center', flexShrink: 0,
                            }}>
                              <Bot size={15} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: isInactive ? '#64748b' : '#0f172a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{agent.name}</span>
                                {isDefault && <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '999px' }}>DEFAULT</span>}
                                {isInactive && <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '999px' }}>INACTIVE</span>}
                              </div>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{agent.language === 'hi' ? '🇮🇳 Hindi' : '🇬🇧 English'}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <code style={{ fontSize: '10.5px', color: '#475569', background: '#f1f5f9', padding: '2px 5px', borderRadius: '4px' }}>
                              {agent.bolna_agent_id ? agent.bolna_agent_id.slice(0, 12) + '...' : '—'}
                            </code>
                            <button type="button" className="icon-btn" title="Copy Bolna ID" onClick={() => copyToClipboard(agent.bolna_agent_id, agent.id)}>
                              {copiedId === agent.id ? <Check size={12} style={{ color: '#16a34a' }} /> : <Copy size={12} />}
                            </button>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '12px', color: isInactive ? '#64748b' : '#334155' }}>
                            <div style={{ fontWeight: 600 }}>{agent.voice_name?.split(' - ')[0] || '—'}</div>
                            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>{agent.voice_provider || 'elevenlabs'}</div>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '11px' }}>
                            <div style={{ fontWeight: 600, color: isInactive ? '#64748b' : '#334155' }}>{agent.llm_model?.split('/')[1] || agent.llm_model || '—'}</div>
                            <div style={{ color: '#94a3b8', fontSize: '10.5px' }}>{agent.llm_provider || 'azure'}</div>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '11px', color: '#475569' }}>{agent.account_label || <span style={{ color: '#94a3b8' }}>Default</span>}</div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: isInactive ? '#64748b' : '#103778', fontSize: '13px' }}>{agent.total_calls || 0}</td>
                        <td style={{ textAlign: 'center' }}>
                          {isInactive ? (
                            <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', border: '1px solid #fde68a' }}>Inactive</span>
                          ) : (
                            <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', border: '1px solid #86efac' }}>Active</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                            <button type="button" className="icon-btn" title="Inspect" onClick={() => { setInspectAgent(agent); setActiveTab('prompt'); setSyncStatusMsg(null) }}><Eye size={14} /></button>
                            <button type="button" className="icon-btn" title="Edit (Full Page)" style={{ color: '#7c3aed' }} onClick={() => nav(`/agents/${agent.id}/edit`)}><Settings size={14} /></button>

                            {isInactive ? (
                              <>
                              <button
                                type="button"
                                onClick={() => handleEnable(agent)}
                                disabled={enablingId === agent.id}
                                style={{
                                  height: '28px', padding: '0 10px', fontSize: '11px', fontWeight: 700,
                                  background: '#16a34a', borderColor: '#16a34a', borderRadius: '6px',
                                  color: '#fff', border: 'none', cursor: enablingId === agent.id ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                }}
                              >
                                {enablingId === agent.id
                                  ? <><RefreshCw size={11} className="animate-spin" /> Enabling...</>
                                  : <><ToggleRight size={13} /> Enable</>}
                              </button>
                              <button type="button" className="icon-btn danger" title="Permanently Delete" style={{ color: '#dc2626' }} onClick={() => handlePermanentDelete(agent)}>
                                <Trash2 size={14} />
                              </button>
                              </>
                            ) : (
                              <>
                                {/* <button type="button" className="icon-btn" title="Quick Edit" style={{ color: '#2563eb' }} onClick={() => openEditModal(agent)}><Pencil size={14} /></button> */}
                                {isDefault ? (
                                  <span title="Primary Default Agent" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', color: '#16a34a' }}>
                                    <CheckCircle2 size={15} />
                                  </span>
                                ) : (
                                  <>
                                    <button type="button" className="icon-btn" title="Set as Default" style={{ color: '#64748b' }} onClick={() => handleSetDefault(agent)}>
                                      <CheckCircle2 size={14} />
                                    </button>
                                    <button type="button" className="icon-btn" title="Disable Agent" style={{ color: '#d97706' }} onClick={() => handleDisable(agent)}>
                                      <Ban size={14} />
                                    </button>
                                    <button type="button" className="icon-btn danger" title="Permanently Delete" style={{ color: '#dc2626' }} onClick={() => handlePermanentDelete(agent)}>
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination total={filteredAgents.length} page={page} limit={limit} onPageChange={setPage} onLimitChange={l => { setLimit(l); setPage(1) }} itemName="agents" />
          </div>
        </>
      )}

      {/* ══ SETTINGS VIEW ══ */}
      {activeView === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ background: '#103778', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Key size={18} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '15px' }}>Bolna AI Accounts</div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>Manage API keys for one or multiple Bolna accounts.</div>
                </div>
              </div>
              <button type="button" onClick={openAddAccount} className="btn" style={{ background: '#f26522', border: 'none', color: '#fff', height: '36px', padding: '0 16px', fontSize: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <Plus size={15} /> Add Account
              </button>
            </div>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>Account Label</th>
                    <th style={{ width: '32%' }}>API Key (Masked)</th>
                    <th style={{ width: '20%' }}>Base URL</th>
                    <th style={{ width: '10%', textAlign: 'center' }}>Agents</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>Status</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accountsLoading ? (
                    <tr><td colSpan={6} className="empty">Loading accounts...</td></tr>
                  ) : accounts.length === 0 ? (
                    <tr><td colSpan={6} className="empty">No Bolna accounts configured yet.</td></tr>
                  ) : accounts.map(acct => (
                    <tr key={acct.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: '#103778', fontSize: '13px' }}>{acct.label}</span>
                          {Number(acct.is_default) === 1 && <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px' }}>DEFAULT</span>}
                        </div>
                      </td>
                      <td><code style={{ fontSize: '12px', color: '#475569', background: '#f8fafc', padding: '2px 6px', borderRadius: '4px' }}>{acct.api_key}</code></td>
                      <td><span style={{ fontSize: '12px', color: '#64748b' }}>{acct.base_url}</span></td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: '#103778' }}>{acct.agent_count}</td>
                      <td style={{ textAlign: 'center' }}><span style={{ background: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>Active</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                          <button type="button" className="icon-btn" title="Edit Account" style={{ color: '#2563eb' }} onClick={() => openEditAccount(acct)}><Pencil size={14} /></button>
                          {Number(acct.is_default) !== 1 && <button type="button" className="icon-btn" title="Set as Default" onClick={() => handleSetDefaultAccount(acct)}><Star size={14} /></button>}
                          {Number(acct.is_default) !== 1 && <button type="button" className="icon-btn danger" title="Remove Account" onClick={() => handleDeleteAccount(acct)}><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '18px 20px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#0369a1', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={15} /> How Multi-Account API Management Works
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '12px', color: '#0c4a6e', lineHeight: '1.7' }}>
              <div><strong>1. Add Accounts</strong><br />Each Bolna account has its own API key and can host multiple agents.</div>
              <div><strong>2. Assign to Agents</strong><br />When creating or editing an agent, select which account's API key to use.</div>
              <div><strong>3. Default Account</strong><br />The default account is used when no specific account is assigned to an agent.</div>
              <div><strong>4. Priority Order</strong><br />ENV variable → Assigned account → Default account → config.json fallback.</div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODALS ══ */}

      {/* Inspect Agent Modal */}
      {inspectAgent && (
        <ModalOverlay onClose={() => setInspectAgent(null)}>
          <div style={{ width: '780px', maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#103778', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '15px' }}>{inspectAgent.name}</div>
                <div style={{ fontSize: '11px', opacity: 0.8, fontFamily: 'monospace' }}>Bolna ID: {inspectAgent.bolna_agent_id}</div>
              </div>
              <button type="button" onClick={() => setInspectAgent(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 20px', background: '#f8fafc' }}>
              {[['prompt', 'System Prompt'], ['kb', 'Knowledge Base'], ['greeting', 'Welcome Message'], ['extraction', 'Extraction Fields']].map(([tab, label]) => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{ padding: '11px 14px', border: 'none', borderBottom: activeTab === tab ? '2px solid #103778' : '2px solid transparent', background: 'none', fontWeight: 700, fontSize: '12px', cursor: 'pointer', color: activeTab === tab ? '#103778' : '#64748b' }}>{label}</button>
              ))}
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {activeTab === 'prompt' && <pre style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', fontSize: '12.5px', lineHeight: '1.6', whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#0f172a', margin: 0 }}>{inspectAgent.system_prompt || '(none)'}</pre>}
              {activeTab === 'kb' && <pre style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', fontSize: '12.5px', lineHeight: '1.6', whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#0f172a', margin: 0 }}>{inspectAgent.knowledge_base || '(none)'}</pre>}
              {activeTab === 'greeting' && <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '14px', fontSize: '14px', color: '#9a3412', fontWeight: 600 }}>&ldquo;{inspectAgent.welcome_message}&rdquo;</div>}
              {activeTab === 'extraction' && (() => {
                let list = []
                if (inspectAgent.extraction_config) {
                  try { list = typeof inspectAgent.extraction_config === 'string' ? JSON.parse(inspectAgent.extraction_config) : inspectAgent.extraction_config } catch (_) {}
                }
                // Fallback to DB fields if agent has no saved config
                if (!Array.isArray(list) || list.length === 0) list = dbFields
                const activeCount = list.filter(f => f.enabled).length

                // Group by category for inspect view
                const grouped = {}
                list.forEach(f => {
                  const cat = f.category || (f.isCore !== false ? 'Core' : 'Survey')
                  if (!grouped[cat]) grouped[cat] = []
                  grouped[cat].push(f)
                })

                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#103778' }}>Configured Call Extraction Fields</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>{activeCount} of {list.length} Enabled</span>
                        <button type="button" onClick={() => handleSyncExtractions(inspectAgent.id)} disabled={syncingAgentId === inspectAgent.id}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#f26522', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '11.5px', fontWeight: 700, cursor: syncingAgentId === inspectAgent.id ? 'not-allowed' : 'pointer' }}>
                          {syncingAgentId === inspectAgent.id ? <><RefreshCw size={12} className="animate-spin" /> Syncing...</> : <><Zap size={12} /> Sync to Bolna</>}
                        </button>
                      </div>
                    </div>
                    {syncStatusMsg && <div style={{ marginBottom: '12px' }}><Banner type={syncStatusMsg.type}>{syncStatusMsg.text}</Banner></div>}

                    {Object.entries(grouped).map(([cat, catFields]) => (
                      <div key={cat} style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                          {cat} Fields
                          <span style={{ marginLeft: '6px', background: cat === 'Core' ? '#dbeafe' : '#fef3c7', color: cat === 'Core' ? '#1e40af' : '#92400e', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>
                            {cat === 'Core' ? 'pitch_calls' : 'pitch_call_answers'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {catFields.map(f => (
                            <div key={f.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: f.enabled ? '#fff' : '#f8fafc', opacity: f.enabled ? 1 : 0.55 }}>
                              <div style={{ marginTop: '2px', color: f.enabled ? '#16a34a' : '#94a3b8' }}>
                                {f.enabled ? <CheckCircle2 size={15} /> : <span style={{ display: 'inline-block', width: 15, textAlign: 'center' }}>—</span>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>{f.label}</span>
                                  <code style={{ fontSize: '11px', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', color: '#334155' }}>{f.key}</code>
                                  {f.subcategory && <span style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>↳ {f.subcategory}</span>}
                                </div>
                                {f.description && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{f.description}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
              <button type="button" className="btn primary" onClick={() => setInspectAgent(null)} style={{ height: '36px', padding: '0 20px', fontSize: '13px' }}>Close</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Edit Agent Modal (inline quick-edit) */}
      {editAgent && (
        <ModalOverlay onClose={() => !editSubmitting && setEditAgent(null)}>
          <div style={{ width: '860px', maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#103778', color: '#fff', padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pencil size={16} style={{ color: '#f26522' }} />
                <span style={{ fontWeight: 800, fontSize: '15px' }}>Edit Agent — {editAgent.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button type="button" onClick={() => nav(`/agents/${editAgent.id}/edit`)}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Settings size={12} /> Full Edit Page
                </button>
                <button type="button" onClick={() => !editSubmitting && setEditAgent(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>✕</button>
              </div>
            </div>

            <form onSubmit={handleEditAgent} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {editError && <Banner type="error">{editError}</Banner>}
                {editSuccess && <Banner type="success">{editSuccess}</Banner>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={labelStyle}>Agent Name *</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Bolna Account</label>
                    <SearchableSelect options={accountOptions} value={editAccountId} onChange={setEditAccountId} placeholder="Select Bolna Account..." />
                  </div>
                </div>

                <div>
                  <label style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Welcome Message *</span>
                    <span style={{ fontSize: '11px', fontWeight: 400, color: '#94a3b8' }}>Variables: <code>{'{contact_name}'}</code>, <code>{'{organization}'}</code></span>
                  </label>
                  <input value={editWelcome} onChange={e => setEditWelcome(e.target.value)} style={inputStyle} required />
                </div>

                {/* System Prompt — with DB template loader */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                    <label style={{ ...labelStyle, margin: 0 }}>System Prompt *</label>
                    {dbTemplates.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Load:</span>
                        {dbTemplates.map(t => (
                          <button key={t.slug} type="button" disabled={!!loadingTemplateSlug}
                            onClick={() => handleLoadTemplate(t.slug)}
                            style={{ border: '1px solid #f26522', background: '#fff7ed', borderRadius: '5px', padding: '2px 8px', fontSize: '11px', fontWeight: 700, color: '#c2410c', cursor: loadingTemplateSlug ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            {loadingTemplateSlug === t.slug ? <RefreshCw size={9} className="animate-spin" /> : <Sparkles size={9} />}
                            {t.name.split('—')[0].trim()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {templateMsg && <div style={{ marginBottom: '6px' }}><Banner type={templateMsg.type}>{templateMsg.text}</Banner></div>}
                  <textarea rows={8} value={editPrompt} onChange={e => setEditPrompt(e.target.value)} required style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12.5px', resize: 'vertical' }} />
                </div>

                {/* Knowledge Base */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{ ...labelStyle, margin: 0 }}>Knowledge Base</label>
                      <span style={{ fontSize: '10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>Canvas Synced</span>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#103778', cursor: 'pointer' }}>
                      <UploadCloud size={12} /> {uploadingPdf ? 'Uploading...' : 'Upload (.pdf / .txt)'}
                      <input type="file" accept=".pdf,.txt,.md,.csv,.json" onChange={e => handleFileUpload(e, setEditKb, editAccountId)} style={{ display: 'none' }} />
                    </label>
                  </div>
                  {pdfUploadMsg && <div style={{ marginBottom: '6px' }}><Banner type={pdfUploadMsg.type}>{pdfUploadMsg.text}</Banner></div>}
                  <textarea rows={6} value={editKb} onChange={e => setEditKb(e.target.value)} placeholder="FAQs, objection handling, institutional data..." style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12.5px', resize: 'vertical' }} />
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{editKb.length} chars</div>
                </div>

                {/* RAG KBs */}
                {(loadingEditKbs || editRagKbs.length > 0) && (
                  <div style={{ background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '10px 12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>🗂️ Bolna RAG Knowledge Bases — select to attach</span>
                      {loadingEditKbs && <span style={{ fontSize: '10px', color: '#94a3b8' }}>Loading...</span>}
                    </div>
                    {!loadingEditKbs && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {editRagKbs.map((kb, idx) => {
                          const isSel = editRagIds.includes(kb.rag_id)
                          return (
                            <div key={kb.rag_id || idx} onClick={() => setEditRagIds(prev => isSel ? prev.filter(id => id !== kb.rag_id) : [...prev, kb.rag_id])}
                              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '6px', border: `1px solid ${isSel ? '#93c5fd' : '#e2e8f0'}`, background: isSel ? '#eff6ff' : '#fff', fontSize: '12px', transition: 'all 0.15s' }}>
                              <input type="checkbox" checked={isSel} readOnly style={{ accentColor: '#103778', pointerEvents: 'none' }} />
                              <span style={{ fontWeight: 700, color: '#1e293b' }}>📄 {kb.file_name}</span>
                              <code style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px' }}>{kb.rag_id?.slice(0, 8)}...</code>
                              <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: kb.status === 'processed' ? '#dcfce7' : '#fef9c3', color: kb.status === 'processed' ? '#15803d' : '#854d0e' }}>{kb.status || 'processing'}</span>
                            </div>
                          )
                        })}
                        {editRagIds.length > 0 && <div style={{ marginTop: '4px', fontSize: '11px', color: '#1d4ed8', fontWeight: 700 }}>✓ {editRagIds.length} RAG KB{editRagIds.length > 1 ? 's' : ''} attached</div>}
                      </div>
                    )}
                  </div>
                )}

                {/* Extraction Fields — collapsible, with category/subcategory */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <div onClick={() => setShowEditExtraction(!showEditExtraction)}
                    style={{ padding: '10px 14px', background: '#f8fafc', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={14} style={{ color: '#103778' }} />
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#103778' }}>Call Data Extraction Fields</span>
                      <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 7px', borderRadius: '10px', fontSize: '10.5px', fontWeight: 700 }}>
                        {editExtractionFields.filter(f => f.enabled).length} of {editExtractionFields.length} Enabled
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{showEditExtraction ? '▲ Hide' : '▼ Configure'}</span>
                  </div>

                  {showEditExtraction && (
                    <div style={{ padding: '14px', background: '#fff', maxHeight: '280px', overflowY: 'auto' }}>
                      <CompactExtractionPanel
                        fields={editExtractionFields}
                        setFields={setEditExtractionFields}
                        dbFields={dbFields}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#f8fafc' }}>
                <button type="button" className="btn ghost" disabled={editSubmitting} onClick={() => setEditAgent(null)} style={{ height: '38px', padding: '0 16px', fontSize: '13px' }}>Cancel</button>
                <button type="submit" className="btn primary" disabled={editSubmitting} style={{ height: '38px', padding: '0 20px', fontSize: '13px' }}>
                  {editSubmitting ? <><RefreshCw size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> Save Changes</>}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}


      {/* Import from Bolna Modal */}
      {showImport && (
        <ModalOverlay onClose={() => { if (!importLoading) setShowImport(false) }}>
          <div style={{ width: '500px', maxWidth: '100%', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            {/* Header */}
            <div style={{ background: '#103778', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={16} style={{ color: '#f26522' }} />
                <span style={{ fontWeight: 800, fontSize: '15px' }}>Import Agent from Bolna</span>
              </div>
              <button type="button" onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {importError && <Banner type="error">{importError}</Banner>}
              {importSuccess && <Banner type="success">{importSuccess}</Banner>}

              {!importSuccess && (
                <>
                  {/* Info box */}
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#0369a1', lineHeight: 1.5 }}>
                    <strong>Bolna pe already bana hua agent import karo.</strong><br />
                    Agent ID aur account select karo — agent ka sara data (prompt, voice, KB) automatically pull ho jayega.
                  </div>

                  {/* Account Select */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Bolna Account <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      value={importAccountId}
                      onChange={e => setImportAccountId(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#fff', color: importAccountId ? '#0f172a' : '#94a3b8' }}
                    >
                      <option value="">— Select Account —</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.label || `Account #${acc.id}`}
                          {acc.is_default ? ' ⭐ (Default)' : ''}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                      Woh account select karo jisme yeh agent bana hai.
                    </div>
                  </div>

                  {/* Agent ID Input */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Bolna Agent ID <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={importAgentId}
                      onChange={e => setImportAgentId(e.target.value.trim())}
                      placeholder="e.g. a30e5fea-db76-422d-b3c8-a7232f9cf9ed"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#fff', fontFamily: 'monospace' }}
                    />
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                      Bolna Studio → Agent → Agent ID (UUID format)
                    </div>
                  </div>
                </>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '4px', borderTop: '1px solid #f1f5f9', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={importLoading}
                  onClick={() => setShowImport(false)}
                  style={{ height: '38px', padding: '0 16px', fontSize: '13px' }}
                >
                  {importSuccess ? 'Close' : 'Cancel'}
                </button>
                {!importSuccess && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={importLoading || !importAgentId || !importAccountId}
                    onClick={async () => {
                      setImportLoading(true)
                      setImportError(null)
                      setImportSuccess(null)
                      try {
                        const res = await api.importAgent({
                          bolna_agent_id: importAgentId,
                          bolna_account_id: parseInt(importAccountId, 10),
                        })
                        if (res.success) {
                          setImportSuccess(`✅ "${res.name}" successfully imported! (Portal ID: #${res.id})`)
                          loadAgents()
                          loadInactiveAgents()
                        } else {
                          setImportError(res.error || 'Import failed. Please try again.')
                        }
                      } catch (err) {
                        const msg = err?.response?.data?.error || err?.message || 'Import failed. Check Agent ID and Account.'
                        setImportError(msg)
                      } finally {
                        setImportLoading(false)
                      }
                    }}
                    style={{ height: '38px', padding: '0 20px', fontSize: '13px' }}
                  >
                    {importLoading ? <><RefreshCw size={14} className="animate-spin" /> Importing...</> : <><Database size={14} /> Import Agent</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Add / Edit Bolna Account Modal */}
      {(showAddAccount || editAccountModal) && (
        <ModalOverlay onClose={() => { if (!acctSubmitting) { setShowAddAccount(false); setEditAccountModal(null); resetAcctForm() } }}>
          <div style={{ width: '520px', maxWidth: '100%', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#103778', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={16} style={{ color: '#f26522' }} />
                <span style={{ fontWeight: 800, fontSize: '15px' }}>{editAccountModal ? 'Edit Bolna Account' : 'Add Bolna Account'}</span>
              </div>
              <button type="button" onClick={() => { setShowAddAccount(false); setEditAccountModal(null); resetAcctForm() }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSaveAccount} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {acctError && <Banner type="error">{acctError}</Banner>}
              {acctSuccess && <Banner type="success">{acctSuccess}</Banner>}

              <div>
                <label style={labelStyle}>Account Label *</label>
                <input value={acctLabel} onChange={e => setAcctLabel(e.target.value)} placeholder="e.g. Primary Account, Client Demo Key" style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>{editAccountModal ? 'New API Key (leave blank to keep existing)' : 'Bolna API Key *'}</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type={showAcctKey ? 'text' : 'password'} value={acctKey} onChange={e => setAcctKey(e.target.value)}
                    placeholder={editAccountModal ? '(unchanged)' : 'bn-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }} required={!editAccountModal} />
                  <button type="button" onClick={() => setShowAcctKey(!showAcctKey)} style={{ padding: '0 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: '12px', color: '#475569', whiteSpace: 'nowrap' }}>
                    {showAcctKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  Get from <a href="https://app.bolna.ai/settings/api-keys" target="_blank" rel="noreferrer" style={{ color: '#103778' }}>app.bolna.ai → Settings → API Keys</a>. Starts with <code>bn-</code>.
                </div>
              </div>
              <div>
                <label style={labelStyle}>Base URL</label>
                <input value={acctUrl} onChange={e => setAcctUrl(e.target.value)} placeholder="https://api.bolna.ai" style={inputStyle} />
              </div>

              {acctKey && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button type="button" onClick={handleTestConnection} disabled={testing}
                      style={{ height: '34px', padding: '0 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {testing ? <><RefreshCw size={13} className="animate-spin" /> Testing...</> : <><Wifi size={13} /> Test Connection</>}
                    </button>
                    {testResult && (
                      <span style={{ fontSize: '12px', fontWeight: 600, color: testResult.ok ? '#15803d' : '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {testResult.ok ? <Check size={13} /> : <AlertCircle size={13} />}
                        {testResult.msg}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '4px', borderTop: '1px solid #f1f5f9', marginTop: '4px' }}>
                <button type="button" className="btn ghost" disabled={acctSubmitting} onClick={() => { setShowAddAccount(false); setEditAccountModal(null); resetAcctForm() }} style={{ height: '38px', padding: '0 16px', fontSize: '13px' }}>Cancel</button>
                <button type="submit" className="btn primary" disabled={acctSubmitting} style={{ height: '38px', padding: '0 20px', fontSize: '13px' }}>
                  {acctSubmitting ? <><RefreshCw size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> {editAccountModal ? 'Update Account' : 'Add Account'}</>}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {children}
    </div>
  )
}

function Banner({ type, children }) {
  const isError = type === 'error'
  return (
    <div style={{ background: isError ? '#fef2f2' : '#f0fdf4', border: `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`, color: isError ? '#b91c1c' : '#15803d', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      {isError ? <AlertCircle size={15} /> : <Check size={15} />} {children}
    </div>
  )
}
