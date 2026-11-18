import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Key,
  KeyRound,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Zap,
  Bot,
  Star,
  Copy,
  Check,
  ArrowUp,
  ArrowDown,
  Sliders,
  Pencil,
  Eye,
  EyeOff,
} from 'lucide-react'
import Pagination from '../../components/Pagination'
import { api } from '../../api'

const PRESET_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite Latest (Fastest · Stable)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
]

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
}

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 700,
  color: '#334155',
  marginBottom: '6px',
}

function ModalOverlay({ children, onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15,23,42,0.65)',
        backdropFilter: 'blur(3px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
}

function Banner({ type, children }) {
  const isError = type === 'error'
  return (
    <div
      style={{
        background: isError ? '#fef2f2' : '#f0fdf4',
        border: `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`,
        color: isError ? '#b91c1c' : '#15803d',
        padding: '10px 14px',
        borderRadius: '8px',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '14px',
      }}
    >
      {isError ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />} {children}
    </div>
  )
}

export default function ManageKeys() {
  const [activeTab, setActiveTab] = useState('gemini') // 'gemini' | 'bolna'

  // ── Gemini State ──────────────────────────────────────────────────────────
  const [geminiKeys, setGeminiKeys] = useState([])
  const [geminiModels, setGeminiModels] = useState([])
  const [loadingGemini, setLoadingGemini] = useState(false)
  const [newGeminiKey, setNewGeminiKey] = useState('')
  const [addingGemini, setAddingGemini] = useState(false)
  const [geminiMsg, setGeminiMsg] = useState(null)
  const [copiedKey, setCopiedKey] = useState(null)
  const [showAddGeminiModal, setShowAddGeminiModal] = useState(false)

  // ── Gemini Pagination ─────────────────────────────────────────────────────
  const [geminiPage, setGeminiPage] = useState(1)
  const [geminiLimit, setGeminiLimit] = useState(10)

  // ── Gemini Model Fallback State ───────────────────────────────────────────
  const [selectedModels, setSelectedModels] = useState([])
  const [savingModels, setSavingModels] = useState(false)
  const [modelMsg, setModelMsg] = useState(null)
  const [customModelInput, setCustomModelInput] = useState('')

  // ── Bolna State ───────────────────────────────────────────────────────────
  const [bolnaAccounts, setBolnaAccounts] = useState([])
  const [loadingBolna, setLoadingBolna] = useState(false)
  const [bolnaMsg, setBolnaMsg] = useState(null)
  const [showBolnaModal, setShowBolnaModal] = useState(false)
  const [editingBolnaId, setEditingBolnaId] = useState(null)
  const [bolnaLabel, setBolnaLabel] = useState('')
  const [bolnaKey, setBolnaKey] = useState('')
  const [bolnaUrl, setBolnaUrl] = useState('https://api.bolna.ai')
  const [showAcctKey, setShowAcctKey] = useState(false)
  const [savingBolna, setSavingBolna] = useState(false)
  const [testingBolna, setTestingBolna] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // ── Bolna Pagination ──────────────────────────────────────────────────────
  const [bolnaPage, setBolnaPage] = useState(1)
  const [bolnaLimit, setBolnaLimit] = useState(10)

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadGemini = useCallback(async () => {
    setLoadingGemini(true)
    try {
      const res = await api.geminiKeys()
      setGeminiKeys(res.keys || [])
      setGeminiModels(res.models || [])
      setSelectedModels(res.models || [])
    } catch (err) {
      setGeminiMsg({ type: 'error', text: err.message || 'Failed to load Gemini keys' })
    } finally {
      setLoadingGemini(false)
    }
  }, [])

  const loadBolna = useCallback(async () => {
    setLoadingBolna(true)
    try {
      const res = await api.bolnaAccounts()
      setBolnaAccounts(res.data || [])
    } catch (err) {
      setBolnaMsg({ type: 'error', text: err.message || 'Failed to load Bolna accounts' })
    } finally {
      setLoadingBolna(false)
    }
  }, [])

  useEffect(() => {
    loadGemini()
    loadBolna()
  }, [loadGemini, loadBolna])

  // ── Paged Data ────────────────────────────────────────────────────────────
  const pagedGeminiKeys = useMemo(() => {
    const start = (geminiPage - 1) * geminiLimit
    return geminiKeys.slice(start, start + geminiLimit)
  }, [geminiKeys, geminiPage, geminiLimit])

  const pagedBolnaAccounts = useMemo(() => {
    const start = (bolnaPage - 1) * bolnaLimit
    return bolnaAccounts.slice(start, start + bolnaLimit)
  }, [bolnaAccounts, bolnaPage, bolnaLimit])

  const defaultBolna = useMemo(() => {
    return bolnaAccounts.find(a => Number(a.is_default) === 1) || bolnaAccounts[0]
  }, [bolnaAccounts])

  // ── Gemini Handlers ───────────────────────────────────────────────────────
  const handleAddGeminiKey = async (e) => {
    e.preventDefault()
    const cleanKey = newGeminiKey.trim()
    if (!cleanKey) return
    setAddingGemini(true)
    setGeminiMsg(null)
    try {
      await api.addGeminiKey(cleanKey)
      setNewGeminiKey('')
      setShowAddGeminiModal(false)
      setGeminiMsg({ type: 'success', text: 'Gemini API key added successfully!' })
      loadGemini()
    } catch (err) {
      setGeminiMsg({ type: 'error', text: err.message || 'Failed to add Gemini key' })
    } finally {
      setAddingGemini(false)
    }
  }

  const handleDeleteGeminiKey = async (index) => {
    if (!window.confirm('Are you sure you want to delete this Gemini API key?')) return
    setGeminiMsg(null)
    try {
      await api.deleteGeminiKey(index)
      setGeminiMsg({ type: 'success', text: 'Gemini API key deleted successfully.' })
      loadGemini()
    } catch (err) {
      setGeminiMsg({ type: 'error', text: err.message || 'Failed to delete Gemini key' })
    }
  }

  const handleCopyKey = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // ── Gemini Model Fallback Handlers ─────────────────────────────────────────
  const handleToggleModel = (modelId) => {
    setSelectedModels(prev => {
      if (prev.includes(modelId)) {
        if (prev.length <= 1) {
          alert('You must keep at least one active model in the fallback chain.')
          return prev
        }
        return prev.filter(m => m !== modelId)
      } else {
        return [...prev, modelId]
      }
    })
  }

  const handleMoveModel = (index, direction) => {
    setSelectedModels(prev => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[nextIndex]
      copy[nextIndex] = temp
      return copy
    })
  }

  const handleAddCustomModel = (e) => {
    e.preventDefault()
    const clean = customModelInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!clean) return
    if (selectedModels.includes(clean)) {
      alert(`Model "${clean}" is already in the fallback chain!`)
      return
    }
    setSelectedModels(prev => [...prev, clean])
    setCustomModelInput('')
  }

  const handleSaveModels = async () => {
    if (selectedModels.length === 0) {
      alert('Please select at least one model for fallback.')
      return
    }
    const sanitized = Array.from(new Set(selectedModels.map(m => m.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean)))
    setSavingModels(true)
    setModelMsg(null)
    try {
      const res = await api.updateGeminiModels(sanitized)
      setSelectedModels(res.models || sanitized)
      setGeminiModels(res.models || sanitized)
      setModelMsg({ type: 'success', text: 'Model fallback chain updated and saved!' })
      setTimeout(() => setModelMsg(null), 4000)
    } catch (err) {
      setModelMsg({ type: 'error', text: err.message || 'Failed to update models' })
    } finally {
      setSavingModels(false)
    }
  }

  // ── Bolna Handlers ────────────────────────────────────────────────────────
  const openAddBolna = () => {
    setEditingBolnaId(null)
    setBolnaLabel('')
    setBolnaKey('')
    setBolnaUrl('https://api.bolna.ai')
    setTestResult(null)
    setShowBolnaModal(true)
  }

  const openEditBolna = (acct) => {
    setEditingBolnaId(acct.id)
    setBolnaLabel(acct.label || '')
    setBolnaKey('')
    setBolnaUrl(acct.base_url || 'https://api.bolna.ai')
    setTestResult(null)
    setShowBolnaModal(true)
  }

  const handleSaveBolnaAccount = async (e) => {
    e.preventDefault()
    if (!bolnaLabel.trim()) return
    if (!editingBolnaId && !bolnaKey.trim()) return

    setSavingBolna(true)
    setBolnaMsg(null)
    try {
      if (editingBolnaId) {
        const payload = {
          label: bolnaLabel.trim(),
          base_url: bolnaUrl.trim() || 'https://api.bolna.ai',
        }
        if (bolnaKey.trim()) payload.api_key = bolnaKey.trim()
        await api.updateBolnaAccount(editingBolnaId, payload)
        setBolnaMsg({ type: 'success', text: 'Bolna account updated successfully!' })
      } else {
        await api.createBolnaAccount({
          label: bolnaLabel.trim(),
          api_key: bolnaKey.trim(),
          base_url: bolnaUrl.trim() || 'https://api.bolna.ai',
        })
        setBolnaMsg({ type: 'success', text: 'Bolna account created successfully!' })
      }
      setShowBolnaModal(false)
      loadBolna()
    } catch (err) {
      setBolnaMsg({ type: 'error', text: err.message || 'Failed to save Bolna account' })
    } finally {
      setSavingBolna(false)
    }
  }

  const handleSetDefaultBolna = async (id) => {
    setBolnaMsg(null)
    try {
      await api.setDefaultBolnaAccount(id)
      setBolnaMsg({ type: 'success', text: 'Default Bolna account updated.' })
      loadBolna()
    } catch (err) {
      setBolnaMsg({ type: 'error', text: err.message || 'Failed to set default account' })
    }
  }

  const handleDeleteBolna = async (id) => {
    if (!window.confirm('Are you sure you want to delete this Bolna account?')) return
    setBolnaMsg(null)
    try {
      await api.deleteBolnaAccount(id)
      setBolnaMsg({ type: 'success', text: 'Bolna account removed.' })
      loadBolna()
    } catch (err) {
      setBolnaMsg({ type: 'error', text: err.message || 'Failed to delete Bolna account' })
    }
  }

  const handleTestBolna = async () => {
    if (!bolnaKey.trim()) {
      alert('Enter a Bolna API key to test first.')
      return
    }
    setTestingBolna(true)
    setTestResult(null)
    try {
      const res = await api.testBolnaConnection({
        api_key: bolnaKey.trim(),
        base_url: bolnaUrl.trim() || 'https://api.bolna.ai',
      })
      const isSuccess = res.success !== false && (res.connected || res.success || res.message)
      setTestResult({
        success: Boolean(isSuccess),
        message: res.message || (isSuccess ? 'Connection successful! API key is valid.' : (res.error || 'Connection failed')),
      })
    } catch (err) {
      setTestResult({ success: false, message: err.message || 'Test connection error' })
    } finally {
      setTestingBolna(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* ══ 1. TOP METRIC CARDS ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '12px' }}>
        {/* Card 1: Gemini Keys */}
        <div
          onClick={() => setActiveTab('gemini')}
          style={{
            background: '#fff',
            border: activeTab === 'gemini' ? '2px solid #103778' : '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: activeTab === 'gemini' ? '0 3px 10px rgba(16,55,120,0.12)' : 'none',
          }}
          title="Click to view Gemini keys"
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#e0f2fe', color: '#0284c7', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <KeyRound size={19} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{geminiKeys.length}</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: activeTab === 'gemini' ? '#103778' : '#64748b' }}>
              Gemini Keys {activeTab === 'gemini' ? '✓' : ''}
            </div>
          </div>
        </div>

        {/* Card 2: Active Models in Fallback */}
        <div
          onClick={() => setActiveTab('gemini')}
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
          }}
          title="Active fallback models"
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#dcfce7', color: '#16a34a', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Sliders size={19} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{selectedModels.length}</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b' }}>
              Active Models
            </div>
          </div>
        </div>

        {/* Card 3: Primary Model */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#fef3c7', color: '#d97706', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Sparkles size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedModels[0] || 'gemini-3.8-flash'}
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b' }}>
              Primary LLM
            </div>
          </div>
        </div>

        {/* Card 4: Bolna Accounts */}
        <div
          onClick={() => setActiveTab('bolna')}
          style={{
            background: '#fff',
            border: activeTab === 'bolna' ? '2px solid #f26522' : '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: activeTab === 'bolna' ? '0 3px 10px rgba(242,101,34,0.15)' : 'none',
          }}
          title="Click to view Bolna accounts"
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#ffedd5', color: '#ea580c', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Bot size={19} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{bolnaAccounts.length}</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: activeTab === 'bolna' ? '#f26522' : '#64748b' }}>
              Bolna Accounts {activeTab === 'bolna' ? '✓' : ''}
            </div>
          </div>
        </div>

        {/* Card 5: Default Account */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#dcfce7', color: '#15803d', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <CheckCircle2 size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {defaultBolna?.label || 'Primary'}
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b' }}>
              Default Account
            </div>
          </div>
        </div>
      </div>

      {/* ══ 2. SUBHEADER & VIEW TABS ══ */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#103778', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <KeyRound size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '15px', color: '#103778' }}>
              API Keys &amp; LLM Configuration
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              Configure and maintain credentials for Google Gemini LLM and Bolna AI Voice Platform.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('gemini')}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              border: activeTab === 'gemini' ? 'none' : '1px solid #cbd5e1',
              background: activeTab === 'gemini' ? '#103778' : '#fff',
              color: activeTab === 'gemini' ? '#fff' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <Sparkles size={14} style={{ color: activeTab === 'gemini' ? '#f26522' : '#94a3b8' }} />
            Google Gemini ({geminiKeys.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bolna')}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              border: activeTab === 'bolna' ? 'none' : '1px solid #cbd5e1',
              background: activeTab === 'bolna' ? '#103778' : '#fff',
              color: activeTab === 'bolna' ? '#fff' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <Bot size={14} style={{ color: activeTab === 'bolna' ? '#f26522' : '#94a3b8' }} />
            Bolna AI ({bolnaAccounts.length})
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: GOOGLE GEMINI                                                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'gemini' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {geminiMsg && <Banner type={geminiMsg.type}>{geminiMsg.text}</Banner>}

          {/* Section 1: Model Selection & Fallback Chain */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ background: '#103778', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sliders size={18} style={{ color: '#fff' }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '15px' }}>Model Selection &amp; Fallback Hierarchy</div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>
                    Primary model executes first. If token limit or HTTP 429 occurs, it automatically falls back sequentially.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '18px 20px' }}>
              {modelMsg && <div style={{ marginBottom: '12px' }}><Banner type={modelMsg.type}>{modelMsg.text}</Banner></div>}

              {/* Active Fallback Chain List */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.04em' }}>
                  Execution Priority Chain
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedModels.map((m, idx) => {
                    const preset = PRESET_MODELS.find(p => p.id === m)
                    return (
                      <div
                        key={m}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '9px 14px',
                          borderRadius: '8px',
                          border: idx === 0 ? '1.5px solid #bfdbfe' : '1px solid #e2e8f0',
                          background: idx === 0 ? '#f8fafc' : '#fff',
                          flexWrap: 'wrap',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              background: idx === 0 ? '#103778' : '#e2e8f0',
                              color: idx === 0 ? '#fff' : '#475569',
                              padding: '3px 8px',
                              borderRadius: '5px',
                              fontSize: '10.5px',
                              fontWeight: 800,
                            }}
                          >
                            #{idx + 1} {idx === 0 ? 'Primary' : 'Fallback'}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                            {preset?.label || m}
                          </span>
                          <code style={{ fontSize: '11px', color: '#64748b' }}>
                            ({m})
                          </code>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <button
                            type="button"
                            onClick={() => handleMoveModel(idx, -1)}
                            disabled={idx === 0}
                            title="Move up in priority"
                            style={{
                              border: '1px solid #cbd5e1',
                              background: '#fff',
                              borderRadius: '5px',
                              padding: '4px 7px',
                              fontSize: '11px',
                              cursor: idx === 0 ? 'not-allowed' : 'pointer',
                              opacity: idx === 0 ? 0.35 : 1,
                              color: '#103778',
                            }}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveModel(idx, 1)}
                            disabled={idx === selectedModels.length - 1}
                            title="Move down in priority"
                            style={{
                              border: '1px solid #cbd5e1',
                              background: '#fff',
                              borderRadius: '5px',
                              padding: '4px 7px',
                              fontSize: '11px',
                              cursor: idx === selectedModels.length - 1 ? 'not-allowed' : 'pointer',
                              opacity: idx === selectedModels.length - 1 ? 0.35 : 1,
                              color: '#103778',
                            }}
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleModel(m)}
                            disabled={selectedModels.length <= 1}
                            title="Remove from chain"
                            style={{
                              border: '1px solid #fecaca',
                              background: '#fef2f2',
                              borderRadius: '5px',
                              padding: '4px 7px',
                              fontSize: '11px',
                              color: '#dc2626',
                              cursor: selectedModels.length <= 1 ? 'not-allowed' : 'pointer',
                              opacity: selectedModels.length <= 1 ? 0.35 : 1,
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Add Custom / New Model Form */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', marginTop: '12px' }}>
                <form onSubmit={handleAddCustomModel} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    value={customModelInput}
                    onChange={e => setCustomModelInput(e.target.value)}
                    placeholder="Enter model identifier (e.g. gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-flash)..."
                    style={{ ...inputStyle, flex: 1, fontSize: '12px' }}
                  />
                  <button
                    type="submit"
                    disabled={!customModelInput.trim()}
                    style={{
                      background: !customModelInput.trim() ? '#94a3b8' : '#103778',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: !customModelInput.trim() ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + Add Model
                  </button>
                </form>
              </div>

              {/* Bottom Actions: Save Fallback Chain */}
              <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 700, color: '#334155' }}>Execution Sequence:</span>
                  <span>{selectedModels.map((m, i) => `#${i + 1} ${m}`).join('  →  ')}</span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveModels}
                  disabled={savingModels}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: 'none',
                    background: savingModels ? '#94a3b8' : '#f26522',
                    color: '#fff',
                    borderRadius: '7px',
                    padding: '8px 22px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: savingModels ? 'not-allowed' : 'pointer',
                    boxShadow: savingModels ? 'none' : '0 2px 6px rgba(242,101,34,0.35)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {savingModels ? <RefreshCw size={13} className="animate-spin" /> : <Check size={14} />}
                  {savingModels ? 'Saving Fallback Chain...' : 'Save Fallback Chain'}
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Gemini API Keys Table */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ background: '#103778', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Key size={18} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '15px' }}>Google Gemini API Keys</div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>Manage API keys for Gemini LLM system prompt &amp; knowledge base generation.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddGeminiModal(true)}
                className="btn"
                style={{ background: '#f26522', border: 'none', color: '#fff', height: '36px', padding: '0 16px', fontSize: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 700 }}
              >
                <Plus size={15} /> Add Gemini Key
              </button>
            </div>

            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: '25%' }}>Key Role / Label</th>
                    <th style={{ width: '42%' }}>API Key (Masked)</th>
                    <th style={{ width: '15%', textAlign: 'center' }}>Key Length</th>
                    <th style={{ width: '10%', textAlign: 'center' }}>Status</th>
                    <th style={{ width: '8%', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingGemini ? (
                    <tr><td colSpan={5} className="empty">Loading Gemini API keys...</td></tr>
                  ) : geminiKeys.length === 0 ? (
                    <tr><td colSpan={5} className="empty">No Gemini API keys configured yet. Click &quot;Add Gemini Key&quot; above.</td></tr>
                  ) : pagedGeminiKeys.map((k) => (
                    <tr key={k.index}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: '#103778', fontSize: '13px' }}>
                            {k.index === 0 ? 'Primary Key' : `Backup Key #${k.index}`}
                          </span>
                          {k.index === 0 && (
                            <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px' }}>
                              DEFAULT
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: '12px', color: '#475569', background: '#f8fafc', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                          {k.masked}
                        </code>
                      </td>
                      <td style={{ textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                        {k.length} chars
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>
                          Active
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Copy Key"
                            style={{ color: '#2563eb' }}
                            onClick={() => handleCopyKey(k.masked, k.index)}
                          >
                            {copiedKey === k.index ? <Check size={14} style={{ color: '#16a34a' }} /> : <Copy size={14} />}
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Remove Key"
                            style={{ color: '#dc2626' }}
                            onClick={() => handleDeleteGeminiKey(k.index)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Gemini Keys Pagination */}
            <Pagination
              currentPage={geminiPage}
              totalPages={Math.ceil(geminiKeys.length / geminiLimit) || 1}
              totalItems={geminiKeys.length}
              perPage={geminiLimit}
              onPageChange={setGeminiPage}
              onPerPageChange={(l) => { setGeminiLimit(l); setGeminiPage(1); }}
              itemLabel="keys"
            />
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: BOLNA AI ACCOUNTS                                            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'bolna' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {bolnaMsg && <Banner type={bolnaMsg.type}>{bolnaMsg.text}</Banner>}

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ background: '#103778', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Key size={18} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '15px' }}>Bolna AI Accounts</div>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>Manage API keys for one or multiple Bolna accounts.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={openAddBolna}
                className="btn"
                style={{ background: '#f26522', border: 'none', color: '#fff', height: '36px', padding: '0 16px', fontSize: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 700 }}
              >
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
                  {loadingBolna ? (
                    <tr><td colSpan={6} className="empty">Loading accounts...</td></tr>
                  ) : bolnaAccounts.length === 0 ? (
                    <tr><td colSpan={6} className="empty">No Bolna accounts configured yet.</td></tr>
                  ) : pagedBolnaAccounts.map(acct => (
                    <tr key={acct.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: '#103778', fontSize: '13px' }}>{acct.label}</span>
                          {Number(acct.is_default) === 1 && (
                            <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px' }}>
                              DEFAULT
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: '12px', color: '#475569', background: '#f8fafc', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                          {acct.api_key_masked || acct.api_key}
                        </code>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>{acct.base_url}</span>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: '#103778' }}>
                        {acct.agent_count || 0}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>
                          Active
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Edit Account"
                            style={{ color: '#2563eb' }}
                            onClick={() => openEditBolna(acct)}
                          >
                            <Pencil size={14} />
                          </button>
                          {Number(acct.is_default) !== 1 && (
                            <button
                              type="button"
                              className="icon-btn"
                              title="Set as Default"
                              onClick={() => handleSetDefaultBolna(acct.id)}
                            >
                              <Star size={14} />
                            </button>
                          )}
                          {Number(acct.is_default) !== 1 && (
                            <button
                              type="button"
                              className="icon-btn danger"
                              title="Remove Account"
                              style={{ color: '#dc2626' }}
                              onClick={() => handleDeleteBolna(acct.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bolna Accounts Pagination */}
            <Pagination
              currentPage={bolnaPage}
              totalPages={Math.ceil(bolnaAccounts.length / bolnaLimit) || 1}
              totalItems={bolnaAccounts.length}
              perPage={bolnaLimit}
              onPageChange={setBolnaPage}
              onPerPageChange={(l) => { setBolnaLimit(l); setBolnaPage(1); }}
              itemLabel="accounts"
            />
          </div>
        </div>
      )}

      {/* ══ MODALS ══ */}

      {/* 1. Add Gemini API Key Modal */}
      {showAddGeminiModal && (
        <ModalOverlay onClose={() => { if (!addingGemini) setShowAddGeminiModal(false) }}>
          <div style={{ width: '520px', maxWidth: '100%', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#103778', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={16} style={{ color: '#f26522' }} />
                <span style={{ fontWeight: 800, fontSize: '15px' }}>Add Google Gemini API Key</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddGeminiModal(false)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddGeminiKey} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Gemini API Key *</label>
                <input
                  type="password"
                  value={newGeminiKey}
                  onChange={e => setNewGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  required
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                />
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  Get from Google AI Studio. Starts with <code>AIzaSy</code>.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddGeminiModal(false)}
                  disabled={addingGemini}
                  style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingGemini || !newGeminiKey.trim()}
                  style={{
                    background: addingGemini || !newGeminiKey.trim() ? '#94a3b8' : '#f26522',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 20px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: addingGemini || !newGeminiKey.trim() ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {addingGemini ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={15} />}
                  Add Key
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* 2. Add / Edit Bolna Account Modal */}
      {showBolnaModal && (
        <ModalOverlay onClose={() => { if (!savingBolna) setShowBolnaModal(false) }}>
          <div style={{ width: '520px', maxWidth: '100%', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ background: '#103778', color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={16} style={{ color: '#f26522' }} />
                <span style={{ fontWeight: 800, fontSize: '15px' }}>
                  {editingBolnaId ? 'Edit Bolna Account' : 'Add Bolna Account'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowBolnaModal(false)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBolnaAccount} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {testResult && (
                <div
                  style={{
                    background: testResult.success ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
                    color: testResult.success ? '#15803d' : '#b91c1c',
                    padding: '9px 12px',
                    borderRadius: '7px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {testResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />} {testResult.message}
                </div>
              )}

              <div>
                <label style={labelStyle}>Account Label *</label>
                <input
                  value={bolnaLabel}
                  onChange={e => setBolnaLabel(e.target.value)}
                  placeholder="e.g. Primary Account, Client Demo Key"
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  {editingBolnaId ? 'New API Key (leave blank to keep existing)' : 'Bolna API Key *'}
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type={showAcctKey ? 'text' : 'password'}
                    value={bolnaKey}
                    onChange={e => setBolnaKey(e.target.value)}
                    placeholder={editingBolnaId ? '(unchanged)' : 'bn-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
                    required={!editingBolnaId}
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAcctKey(!showAcctKey)}
                    style={{ padding: '0 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: '12px', color: '#475569', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    {showAcctKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showAcctKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  Starts with <code>bn-</code>.
                </div>
              </div>

              <div>
                <label style={labelStyle}>Base URL</label>
                <input
                  value={bolnaUrl}
                  onChange={e => setBolnaUrl(e.target.value)}
                  placeholder="https://api.bolna.ai"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px' }}>
                <button
                  type="button"
                  onClick={handleTestBolna}
                  disabled={testingBolna || !bolnaKey.trim()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#103778',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: testingBolna || !bolnaKey.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Zap size={13} style={{ color: '#f26522' }} />
                  {testingBolna ? 'Testing...' : 'Test Connection'}
                </button>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowBolnaModal(false)}
                    disabled={savingBolna}
                    style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingBolna || !bolnaLabel.trim() || (!editingBolnaId && !bolnaKey.trim())}
                    style={{
                      background: savingBolna || !bolnaLabel.trim() || (!editingBolnaId && !bolnaKey.trim()) ? '#94a3b8' : '#f26522',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 20px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: savingBolna || !bolnaLabel.trim() || (!editingBolnaId && !bolnaKey.trim()) ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {savingBolna ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                    {editingBolnaId ? 'Save Changes' : 'Add Account'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
