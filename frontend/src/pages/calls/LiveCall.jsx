import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  PhoneCall,
  RefreshCw,
  ChevronDown,
  Eye,
  Download,
  Radio,
  Search,
  Filter,
  RotateCcw,
  Bot,
  Play,
  Square,
  ListChecks,
  Zap,
  Pencil,
  X,
  Check,
  FileSpreadsheet,
  FileText,
  FileDown,
  UserCheck,
  User,
  Users,
  PhoneOff,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PhoneForwarded,
  MessageSquare,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { api } from '../../api'
import { InterestBadge, StatusBadge, fmtDate, fmtTime, fmtDur, Pagination } from '../../components/ui.jsx'
import SearchableSelect from '../../components/ui/SearchableSelect'
import MetricCards from '../../components/MetricCards.jsx'
import {
  exportCallsToExcel,
  exportCallsToPDF,
  exportSingleCallToExcel,
  exportSingleCallToPDF,
} from '../../utils/callExport'

const ACTIVE = ['queued', 'ringing', 'in_progress']

const STATUS_TEXT_COLORS = {
  completed: '#15803d',
  in_progress: '#1d4ed8',
  ringing: '#d97706',
  queued: '#7c3aed',
  failed: '#dc2626',
  busy: '#ea580c',
  no_answer: '#64748b',
  incomplete: '#dc2626',
}

const INTEREST_TEXT_COLORS = {
  hot: '#b45309',
  warm: '#0369a1',
  interested: '#15803d',
  not_interested: '#dc2626',
  callback: '#7c3aed',
  callback_requested: '#7c3aed',
  maybe: '#d97706',
  not_reachable: '#64748b',
  unknown: '#64748b',
}

const formatStatusText = (val) => {
  if (!val) return '—'
  const map = {
    completed: 'Completed',
    in_progress: 'In Progress',
    ringing: 'Ringing',
    queued: 'Queued',
    failed: 'Failed',
    busy: 'Busy',
    no_answer: 'No Answer',
    incomplete: 'Incomplete',
  }
  return map[val] || String(val).replace(/_/g, ' ')
}

const formatInterestText = (val) => {
  if (!val) return '—'
  const map = {
    hot: 'Hot 🔥',
    warm: 'Warm',
    interested: 'Interested',
    not_interested: 'Not Interested',
    callback: 'Callback',
    callback_requested: 'Callback',
    maybe: 'Maybe',
    not_reachable: 'Not Reachable',
    unknown: 'Unknown',
  }
  return map[val] || String(val).replace(/_/g, ' ')
}

export function WhoAnsweredBadge({ who, answers = [] }) {
  const ansMap = useMemo(() => {
    const m = {}
    if (Array.isArray(answers)) {
      answers.forEach(a => {
        if (a.question_key) m[a.question_key.toLowerCase().trim()] = a.response_value
      })
    }
    return m
  }, [answers])

  const isWrongNumber = ansMap['is_wrong_number'] === 'Yes' || who === 'wrong_person' || who === 'wrong_number'

  if (isWrongNumber) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '12.5px',
        fontWeight: 700,
        color: '#dc2626',
      }}>
        <AlertTriangle size={13} /> Wrong Person
      </span>
    )
  }

  const normalized = (who || '').toLowerCase().replace(/[\s_-]+/g, '_')

  if (normalized === 'self' || normalized === 'target_official') {
    return (
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#15803d' }}>
        Target Official
      </span>
    )
  }

  if (normalized.includes('gatekeeper') || normalized.includes('pa') || normalized.includes('assistant')) {
    return (
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#d97706' }}>
        PA / Assistant
      </span>
    )
  }

  if (normalized === 'no_answer') {
    return (
      <span style={{ fontSize: '12.5px', fontWeight: 500, color: '#64748b' }}>
        No Answer
      </span>
    )
  }

  if (normalized === 'relative') {
    return (
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#9333ea' }}>
        Relative
      </span>
    )
  }

  if (who && who.trim()) {
    return (
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569', textTransform: 'capitalize' }}>
        {who.replace(/_/g, ' ')}
      </span>
    )
  }

  return <span className="muted sm">—</span>
}

export default function LiveCall() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [leads, setLeads] = useState([])
  const [calls, setCalls] = useState([])
  const [agents, setAgents] = useState([])
  const [agentId, setAgentId] = useState(null)
  const [stats, setStats] = useState(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [leadId, setLeadId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const callsRef = useRef([])

  // ── Bulk Auto-Call State ──────────────────────────────────────
  const [callMode, setCallMode] = useState('manual') // 'manual' | 'auto'
  const [autoLeads, setAutoLeads] = useState([])
  const [selectedLeads, setSelectedLeads] = useState(new Set())
  const [autoDelay, setAutoDelay] = useState(5)
  const [campaignRunning, setCampaignRunning] = useState(false)
  const [campaignProgress, setCampaignProgress] = useState(null) // { index, total, name }
  const [campaignLog, setCampaignLog] = useState([]) // [{ name, status, callId? }]
  const [campaignStopped, setCampaignStopped] = useState(false)
  const campaignStoppedRef = useRef(false)

  // ── Caller ID / Outbound Phone Number ─────────────────────────
  const [callerIdMode, setCallerIdMode] = useState('default') // 'default' | 'custom' | phone_number
  const [customCallerId, setCustomCallerId] = useState('')

  const availableCallerNumbers = useMemo(() => {
    const s = new Set()
    agents.forEach(a => {
      if (a.from_phone_number && a.from_phone_number.trim()) {
        s.add(a.from_phone_number.trim())
      }
    })
    return Array.from(s)
  }, [agents])

  const selectedAgent = useMemo(() => agents.find(a => a.id === agentId), [agents, agentId])

  useEffect(() => {
    if (selectedAgent && selectedAgent.from_phone_number) {
      setCallerIdMode(selectedAgent.from_phone_number)
    } else if (callerIdMode !== 'custom') {
      setCallerIdMode('default')
    }
  }, [selectedAgent])

  const effectiveCallerId = useMemo(() => {
    if (callerIdMode === 'custom') {
      return customCallerId.trim()
    }
    if (callerIdMode === 'default' || !callerIdMode) {
      return ''
    }
    return callerIdMode.trim()
  }, [callerIdMode, customCallerId])

  const leadOptions = useMemo(() => {
    return leads.map(l => ({
      value: l.id,
      label: `${l.contact_name} · ${l.phone}`,
      subtitle: `${l.organization || '—'}${l.designation ? ` · ${l.designation}` : ''}`
    }))
  }, [leads])

  const agentOptions = useMemo(() => {
    return agents.map(a => ({
      value: a.id,
      label: a.name,
      subtitle: `${a.voice_name ? a.voice_name.split(' - ')[0] : 'Viraj'} · ${Number(a.is_default) === 1 ? 'Default' : 'Active'}`
    }))
  }, [agents])

  // Search & Filter State
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [interestFilter, setInterestFilter] = useState('all')
  const [demoFilter, setDemoFilter] = useState('all')
  const [whoFilter, setWhoFilter] = useState('all')
  const [expandedCallId, setExpandedCallId] = useState(null)

  // Export & Extractions State
  const [extractionFields, setExtractionFields] = useState([])
  const [exportModalCall, setExportModalCall] = useState(null)
  const [exportModalLoading, setExportModalLoading] = useState(false)
  const [exportModalDetails, setExportModalDetails] = useState(null)

  const loadStats = useCallback(() => {
    api.stats().then(r => setStats(r)).catch(() => { })
  }, [])

  const loadLeads = useCallback(() => {
    // Only pending and new numbers (contacts that have NOT had a completed call)
    api.leads({ queue: 'pending', limit: 500 }).then(r => setLeads(r.data || [])).catch(() => { })
    api.leads({ queue: 'pending', limit: 200 }).then(r => setAutoLeads(r.data || [])).catch(() => { })
  }, [])

  const loadCalls = useCallback(() => {
    api.calls().then(r => {
      setCalls(r.data || [])
      callsRef.current = r.data || []
      if (r.extraction_fields) {
        setExtractionFields(r.extraction_fields)
      }
    }).catch(() => { })
    loadStats()
    loadLeads()
  }, [loadStats, loadLeads])

  useEffect(() => {
    loadLeads()

    // Load voice agents
    const queryAgent = searchParams.get('agentId')
    api.agents().then(r => {
      const list = r.data || []
      setAgents(list)
      if (queryAgent) {
        setAgentId(Number(queryAgent))
      } else {
        const def = list.find(a => Number(a.is_default) === 1) || list[0]
        if (def) setAgentId(def.id)
      }
    }).catch(() => { })

    loadCalls()
    loadStats()
  }, [loadLeads, loadCalls, loadStats, searchParams])

  // sync active & recently completed calls every 3 seconds
  useEffect(() => {
    const t = setInterval(async () => {
      const now = Date.now()
      const act = callsRef.current.filter(c => {
        if (ACTIVE.includes(c.call_status)) return true
        // Also sync recently completed calls (<45s) to capture post-call extracted fields & recording
        if (c.call_status === 'completed' && c.created_at) {
          const diffMs = now - new Date(c.created_at).getTime()
          if (diffMs < 45000) return true
        }
        return false
      })
      if (!act.length) return
      await Promise.all(act.map(c => api.syncCall(c.id).catch(() => { })))
      loadCalls()
    }, 3000)
    return () => clearInterval(t)
  }, [loadCalls])

  // Filtered Calls Array
  const filteredCalls = useMemo(() => {
    return calls.filter(c => {
      // Text search
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchName = (c.contact_name || '').toLowerCase().includes(q)
        const matchPhone = (c.phone || '').toLowerCase().includes(q)
        const matchOrg = (c.organization || '').toLowerCase().includes(q)
        const matchId = String(c.id).includes(q)
        if (!matchName && !matchPhone && !matchOrg && !matchId) return false
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'completed') {
          if (c.call_status !== 'completed' || !c.duration_sec || Number(c.duration_sec) < 10) return false
        } else if (statusFilter === 'busy') {
          const isBusy = ['busy', 'ringing', 'no_answer'].includes(c.call_status)
          const isShort = c.call_status === 'completed' && (!c.duration_sec || Number(c.duration_sec) < 10)
          if (!isBusy && !isShort) return false
        } else if (statusFilter === 'incomplete') {
          if (!['failed', 'incomplete'].includes(c.call_status)) return false
        } else if (statusFilter === 'pending_queue') {
          // calls that did not result in a completed call >= 10s
          if (c.call_status === 'completed' && Number(c.duration_sec) >= 10) return false
        } else {
          if (c.call_status !== statusFilter) return false
        }
      }

      // Interest filter
      if (interestFilter !== 'all') {
        if (c.interest_status !== interestFilter) return false
      }

      // IT Demo filter
      if (demoFilter !== 'all') {
        if (demoFilter === 'agreed' && c.it_head_call_agreed !== 1) return false
        if (demoFilter === 'declined' && c.it_head_call_agreed !== 0) return false
      }

      // Who Answered filter
      if (whoFilter !== 'all') {
        const ansMap = {}
        if (Array.isArray(c.answers)) {
          c.answers.forEach(a => {
            if (a.question_key) ansMap[a.question_key.toLowerCase().trim()] = a.response_value
          })
        }
        const isWrong = ansMap['is_wrong_number'] === 'Yes' || c.who_answered === 'wrong_person' || c.who_answered === 'wrong_number'
        if (whoFilter === 'wrong_person') {
          if (!isWrong) return false
        } else if (whoFilter === 'self') {
          if (c.who_answered !== 'self' && c.who_answered !== 'target_official') return false
        } else if (whoFilter === 'gatekeeper') {
          const w = (c.who_answered || '').toLowerCase()
          if (!w.includes('gatekeeper') && !w.includes('assistant') && !w.includes('pa')) return false
        } else if (whoFilter === 'no_answer') {
          if (c.who_answered !== 'no_answer' && c.call_status !== 'no_answer') return false
        } else if (whoFilter === 'relative') {
          if (c.who_answered !== 'relative') return false
        }
      }

      return true
    })
  }, [calls, search, statusFilter, interestFilter, demoFilter, whoFilter])

  const paginatedCalls = useMemo(() => {
    const start = (page - 1) * limit
    return filteredCalls.slice(start, start + limit)
  }, [filteredCalls, page, limit])

  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all' || interestFilter !== 'all' || demoFilter !== 'all' || whoFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setInterestFilter('all')
    setDemoFilter('all')
    setWhoFilter('all')
    setPage(1)
  }

  const handleCardClick = (cardId) => {
    setPage(1)
    if (cardId === 'all_leads') {
      setStatusFilter('all')
    } else {
      setStatusFilter(prev => prev === cardId ? 'all' : cardId)
    }
  }

  // ── Auto-Campaign Helpers ─────────────────────────────────────
  const toggleLead = (id) => {
    setSelectedLeads(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedLeads(new Set(autoLeads.map(l => l.id)))
  const deselectAll = () => setSelectedLeads(new Set())

  const startCampaign = async () => {
    if (!agentId || selectedLeads.size === 0) return
    const queue = autoLeads.filter(l => selectedLeads.has(l.id))
    campaignStoppedRef.current = false
    setCampaignStopped(false)
    setCampaignRunning(true)
    setCampaignLog([])
    setCampaignProgress({ index: 0, total: queue.length, name: '' })

    const fromNum = effectiveCallerId || null
    for (let i = 0; i < queue.length; i++) {
      if (campaignStoppedRef.current) break
      const lead = queue[i]
      setCampaignProgress({ index: i + 1, total: queue.length, name: lead.contact_name })
      try {
        const r = await api.startCall(lead.id, agentId, fromNum)
        setCampaignLog(prev => [...prev, { name: lead.contact_name, status: 'ok', callId: r.call_id }])
      } catch (e) {
        setCampaignLog(prev => [...prev, { name: lead.contact_name, status: 'err', err: e.message }])
      }
      if (i < queue.length - 1 && !campaignStoppedRef.current) {
        await new Promise(resolve => setTimeout(resolve, autoDelay * 1000))
      }
    }

    setCampaignRunning(false)
    setCampaignProgress(null)
    loadCalls()
  }

  const stopCampaign = () => {
    campaignStoppedRef.current = true
    setCampaignStopped(true)
  }

  const start = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const fromNum = effectiveCallerId || null
      const r = await api.startCall(leadId, agentId, fromNum)
      const agentObj = agents.find(a => a.id === agentId)
      const agentName = agentObj ? agentObj.name : 'AI Agent'
      const fromNotice = fromNum ? ` from ${fromNum}` : ''
      setMsg({ text: `Call initiated (#${r.call_id}) via ${agentName}${fromNotice}. Dialing now. Status will update live.` })
      setLeadId(null)
      loadCalls()
    } catch (e) {
      setMsg({ err: true, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const end = async (id) => {
    if (confirm('Are you sure you want to disconnect this call?')) {
      await api.hangup(id).catch(() => { })
      loadCalls()
    }
  }

  const downloadTranscriptFromTable = async (callItem) => {
    try {
      const full = await api.call(callItem.id)
      const c = full.call || callItem
      const turns = full.turns || []
      let text = `==================================================\n`
      text += `OUTREACH PORTAL — CALL TRANSCRIPT & AUDIT DOSSIER\n`
      text += `==================================================\n`
      text += `Call ID: #${c.id}\n`
      text += `Contact Name: ${c.contact_name}\n`
      text += `Phone: ${c.phone}\n`
      text += `Organization: ${c.organization || '—'}\n`
      text += `Designation: ${c.designation || '—'}\n`
      text += `Call Status: ${c.call_status}\n`
      text += `Duration: ${fmtDur(c.duration_sec)}\n`
      if (c.started_at) text += `Call Time: ${new Date(c.started_at).toLocaleString('en-IN')}\n`
      if (c.recording_url) text += `Audio Recording URL: ${c.recording_url}\n`
      text += `==================================================\n\n`

      text += `[COMPLETE CONVERSATION TRANSCRIPT]\n`
      text += `--------------------------------------------------\n`
      if (turns.length > 0) {
        turns.forEach((t) => {
          const speaker = t.speaker === 'agent' ? 'Ajay (AI Agent)' : (c.contact_name || 'Prospect')
          text += `${speaker}:\n${t.text}\n\n`
        })
      } else if (c.transcript) {
        text += c.transcript + `\n\n`
      } else {
        text += `(No transcript available)\n\n`
      }
      text += `--------------------------------------------------\n`

      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Transcript_Call_${c.id}_${(c.contact_name || 'Prospect').replace(/\s+/g, '_')}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Transcript download error: ' + (e.message || 'Failed'))
    }
  }

  // ── Table Export Handlers ──
  const handleExportTableExcel = () => {
    exportCallsToExcel(filteredCalls, extractionFields, 'Recent_Calls_Report')
  }

  const handleExportTablePDF = () => {
    exportCallsToPDF(filteredCalls, extractionFields, 'Outreach Portal — Live Call Tracking Report')
  }

  const handleOpenRowExport = async (callItem) => {
    setExportModalCall(callItem)
    setExportModalLoading(true)
    setExportModalDetails(null)
    try {
      const full = await api.call(callItem.id)
      setExportModalDetails(full)
    } catch (e) {
      setExportModalDetails({ call: callItem, turns: [], answers: callItem.answers || [] })
    } finally {
      setExportModalLoading(false)
    }
  }

  const handleCloseRowExport = () => {
    setExportModalCall(null)
    setExportModalDetails(null)
    setExportModalLoading(false)
  }

  // Edit Call Modal State
  const [editingCall, setEditingCall] = useState(null)
  const [editStatus, setEditStatus] = useState('')
  const [editInterest, setEditInterest] = useState('')
  const [editDemoAgreed, setEditDemoAgreed] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const handleOpenEdit = (c) => {
    setEditingCall(c)
    setEditStatus(c.call_status || 'completed')
    setEditInterest(c.interest_status || 'unknown')
    setEditDemoAgreed(
      c.it_head_call_agreed === 1 ? '1' : (c.it_head_call_agreed === 0 ? '0' : '')
    )
  }

  const handleCloseEdit = () => {
    setEditingCall(null)
    setSavingEdit(false)
  }

  const handleSaveEdit = async (e) => {
    e?.preventDefault()
    if (!editingCall) return

    setSavingEdit(true)
    try {
      const payload = {
        call_status: editStatus,
        interest_status: editInterest,
      }
      if (editDemoAgreed === '1') {
        payload.it_head_call_agreed = 1
      } else if (editDemoAgreed === '0') {
        payload.it_head_call_agreed = 0
      } else {
        payload.it_head_call_agreed = null
      }

      await api.updateCall(editingCall.id, payload)
      if (editStatus === 'queued') {
        setMsg({ text: `✓ Call #${editingCall.id} (${editingCall.contact_name}) status set to 'Queued'. Prospect has been added back to Pending Queue for re-dial.` })
      } else {
        setMsg({ text: `✓ Call #${editingCall.id} updated successfully.` })
      }
      setEditingCall(null)
      loadCalls()
    } catch (err) {
      alert('Failed to update call: ' + (err.message || 'Error'))
    } finally {
      setSavingEdit(false)
    }
  }

  const handleQuickCall = async (c) => {
    if (!c.lead_id) {
      alert('Lead ID not found for this call.')
      return
    }
    const targetAgentId = c.agent_id || agentId
    if (!window.confirm(`Initiate a new call to ${c.contact_name} (${c.phone})?`)) return

    setBusy(true)
    setMsg(null)
    try {
      const r = await api.startCall(c.lead_id, targetAgentId)
      setMsg({ text: `🚀 New call initiated (#${r.call_id}) for ${c.contact_name}! Dialing now...` })
      loadCalls()
    } catch (e) {
      alert('Call failed: ' + (e.message || 'Error starting call'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Top 5 Metric Summary Boxes */}
      <MetricCards
        stats={stats}
        activeFilter={statusFilter}
        onCardClick={handleCardClick}
      />

      {/* Call Launcher Box — Manual / Auto Campaign tabs */}
      <div className="panel launcher mb-4" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', marginBottom: '18px' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PhoneCall size={18} style={{ color: '#f26522' }} />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#103778' }}>Initiate AI Outreach Call</h3>
          </div>
          <button
            type="button"
            onClick={() => nav('/agents')}
            style={{
              background: 'none',
              border: 'none',
              color: '#103778',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <Bot size={14} /> Manage AI Agents →
          </button>
        </div>

        {/* Tab pills */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {[
            { id: 'manual', icon: <PhoneCall size={13} />, label: 'Manual Call' },
            { id: 'auto', icon: <Zap size={13} />, label: 'Auto Campaign' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCallMode(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 14px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '20px',
                border: callMode === tab.id ? '1.5px solid #103778' : '1.5px solid #e2e8f0',
                background: callMode === tab.id ? '#103778' : '#f8fafc',
                color: callMode === tab.id ? '#fff' : '#64748b',
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab 1: Manual Call (unchanged) ── */}
        {callMode === 'manual' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
              {/* Select AI Voice Agent */}
              <div style={{ width: '230px', maxWidth: '100%' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  AI Voice Agent
                </label>
                <SearchableSelect
                  options={agentOptions}
                  value={agentId}
                  onChange={setAgentId}
                  placeholder="-- Select Voice Agent --"
                  searchPlaceholder="Search agent…"
                />
              </div>

              {/* Calling From (Caller ID) */}
              <div style={{ width: '230px', maxWidth: '100%' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  <span>Calling From (Caller ID)</span>
                  {effectiveCallerId && <span style={{ color: '#15803d', fontSize: '10px', fontWeight: 800 }}>Custom ID</span>}
                </label>
                <select
                  value={callerIdMode}
                  onChange={e => setCallerIdMode(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 10px',
                    fontSize: '12.5px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#1e293b',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="default">Bolna Default Pool</option>
                  {availableCallerNumbers.map(num => (
                    <option key={num} value={num}>
                      {num} {selectedAgent?.from_phone_number === num ? '(Agent Default)' : ''}
                    </option>
                  ))}
                  <option value="custom">+ Enter Custom Number…</option>
                </select>
              </div>

              {callerIdMode === 'custom' && (
                <div style={{ width: '180px', maxWidth: '100%' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Purchased Number
                  </label>
                  <input
                    type="text"
                    value={customCallerId}
                    onChange={e => setCustomCallerId(e.target.value)}
                    placeholder="+9180XXXXXXXX"
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 10px',
                      fontSize: '12.5px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              {/* Compact Searchable Prospect Dropdown */}
              <div style={{ width: '300px', maxWidth: '100%' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Select Prospect
                </label>
                <SearchableSelect
                  options={leadOptions}
                  value={leadId}
                  onChange={setLeadId}
                  placeholder="-- Select prospect to dial --"
                  searchPlaceholder="Search name, phone, organization…"
                />
              </div>

              {/* Call Button Side-by-Side */}
              <button
                type="button"
                className="btn primary"
                disabled={!leadId || busy}
                onClick={start}
                style={{
                  height: '38px',
                  padding: '0 18px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  backgroundColor: '#f26522',
                  color: '#ffffff',
                  border: 'none',
                  cursor: !leadId || busy ? 'not-allowed' : 'pointer',
                  opacity: !leadId || busy ? 0.6 : 1,
                  boxShadow: '0 2px 6px rgba(242, 101, 34, 0.3)',
                  whiteSpace: 'nowrap',
                }}
              >
                <PhoneCall size={15} />
                <span>{busy ? 'Initiating Call…' : 'Start AI Call Now'}</span>
              </button>
            </div>

            {msg && <div className={'alert ' + (msg.err ? 'err' : 'ok')} style={{ marginTop: 12 }}>{msg.text}</div>}
          </div>
        )}

        {/* ── Tab 2: Auto Campaign ── */}
        {callMode === 'auto' && (
          <div>
            {/* Agent selector + delay */}
            <div style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div style={{ width: '270px', maxWidth: '100%' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  AI Voice Agent
                </label>
                <SearchableSelect
                  options={agentOptions}
                  value={agentId}
                  onChange={setAgentId}
                  placeholder="-- Select Voice Agent --"
                  searchPlaceholder="Search agent…"
                />
              </div>

              {/* Calling From (Caller ID) Dropdown */}
              <div style={{ width: '220px', maxWidth: '100%' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Calling From (Caller ID)
                </label>
                <select
                  value={callerIdMode}
                  disabled={campaignRunning}
                  onChange={e => setCallerIdMode(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 10px',
                    fontSize: '12.5px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    outline: 'none',
                    cursor: campaignRunning ? 'not-allowed' : 'pointer',
                  }}
                >
                  <option value="default">Bolna Default Pool</option>
                  {availableCallerNumbers.map(num => (
                    <option key={num} value={num}>
                      {num} {selectedAgent?.from_phone_number === num ? '(Agent Default)' : ''}
                    </option>
                  ))}
                  <option value="custom">+ Enter Custom Number…</option>
                </select>
              </div>

              {callerIdMode === 'custom' && (
                <div style={{ width: '180px', maxWidth: '100%' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Purchased Number
                  </label>
                  <input
                    type="text"
                    disabled={campaignRunning}
                    value={customCallerId}
                    onChange={e => setCustomCallerId(e.target.value)}
                    placeholder="+9180XXXXXXXX"
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 10px',
                      fontSize: '12.5px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Delay Between Calls (sec)
                </label>
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={autoDelay}
                  onChange={e => setAutoDelay(Math.min(60, Math.max(3, Number(e.target.value))))}
                  disabled={campaignRunning}
                  style={{
                    width: '90px',
                    height: '38px',
                    padding: '0 10px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Lead list header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <ListChecks size={15} style={{ color: '#103778' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#103778' }}>
                Pending Leads ({autoLeads.length})
              </span>
              <button
                type="button"
                onClick={selectAll}
                disabled={campaignRunning}
                style={{ fontSize: '11px', fontWeight: 700, color: '#103778', background: 'none', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={deselectAll}
                disabled={campaignRunning}
                style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}
              >
                Deselect All
              </button>
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                {selectedLeads.size} selected
              </span>
            </div>

            {/* Scrollable lead checklist */}
            <div style={{ maxHeight: '210px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', marginBottom: '14px' }}>
              {autoLeads.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  No pending leads found.
                </div>
              ) : (
                autoLeads.map(lead => (
                  <label
                    key={lead.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: campaignRunning ? 'not-allowed' : 'pointer',
                      background: selectedLeads.has(lead.id) ? '#eff6ff' : 'transparent',
                      transition: 'background .1s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLeads.has(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                      disabled={campaignRunning}
                      style={{ accentColor: '#103778', width: '14px', height: '14px', flexShrink: 0 }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b', minWidth: '140px' }}>
                      {lead.contact_name}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b', minWidth: '120px' }}>{lead.phone}</span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{lead.organization || '—'}</span>
                  </label>
                ))
              )}
            </div>

            {/* Progress bar (shown during campaign) */}
            {campaignRunning && campaignProgress && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#103778', marginBottom: '6px' }}>
                  Calling {campaignProgress.index} of {campaignProgress.total} — <em>{campaignProgress.name}</em>…
                </div>
                <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.round((campaignProgress.index / campaignProgress.total) * 100)}%`,
                    background: '#f26522',
                    borderRadius: '99px',
                    transition: 'width .4s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Start / Stop buttons */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {!campaignRunning ? (
                <button
                  type="button"
                  onClick={startCampaign}
                  disabled={selectedLeads.size === 0 || !agentId}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    height: '38px',
                    padding: '0 18px',
                    fontSize: '13px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    backgroundColor: selectedLeads.size === 0 || !agentId ? '#94a3b8' : '#103778',
                    color: '#fff',
                    border: 'none',
                    cursor: selectedLeads.size === 0 || !agentId ? 'not-allowed' : 'pointer',
                    boxShadow: selectedLeads.size > 0 && agentId ? '0 2px 6px rgba(16,55,120,0.25)' : 'none',
                  }}
                >
                  <Play size={14} /> Start Auto Campaign
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopCampaign}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    height: '38px',
                    padding: '0 18px',
                    fontSize: '13px',
                    fontWeight: 700,
                    borderRadius: '8px',
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(220,38,38,0.3)',
                  }}
                >
                  <Square size={14} /> Stop Campaign
                </button>
              )}
            </div>

            {/* Campaign summary log (shown after campaign ends or is stopped) */}
            {!campaignRunning && campaignLog.length > 0 && (
              <div style={{ marginTop: '14px', padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534', marginBottom: '8px' }}>
                  Campaign Summary{campaignStopped ? ' (Stopped Early)' : ' — Complete'} {' · '}
                  {campaignLog.filter(l => l.status === 'ok').length} succeeded {' · '}
                  {campaignLog.filter(l => l.status === 'err').length} failed {' · '}
                  {campaignLog.length} total initiated
                </div>
                <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {campaignLog.map((entry, i) => (
                    <div key={i} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: entry.status === 'ok' ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                        {entry.status === 'ok' ? '✓' : '✗'}
                      </span>
                      <span style={{ color: '#374151', fontWeight: 600 }}>{entry.name}</span>
                      {entry.status === 'ok'
                        ? <span style={{ color: '#64748b' }}>Call #{entry.callId} initiated</span>
                        : <span style={{ color: '#ef4444' }}>{entry.err}</span>
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Searchable Filter Toolbar (Horizontal Layout) */}
      <div className="filter-toolbar" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', marginBottom: '18px' }}>
        <div className="filter-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', width: '100%' }}>
          {/* Search Input */}
          <div className="filter-search-box" style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '340px' }}>
            <Search size={16} className="filter-search-icon" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search prospect, phone, org, call ID…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="filter-search-input"
              style={{ width: '100%', padding: '8px 12px 8px 36px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', height: '38px', outline: 'none' }}
            />
          </div>

          {/* Status Filter   */}
          <div style={{ minWidth: '170px', flex: '0 1 auto' }}>
            <SearchableSelect
              options={[
                { value: 'all', label: 'All Call Statuses' },
                { value: 'completed', label: 'Completed (>10s)' },
                { value: 'busy', label: 'Busy / Ringing' },
                { value: 'no_answer', label: 'No Answer' },
                { value: 'incomplete', label: 'Incomplete / Short' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'queued', label: 'Queued' },
                { value: 'failed', label: 'Failed' },
              ]}
              value={statusFilter}
              onChange={val => { setStatusFilter(val); setPage(1) }}
              placeholder="All Call Statuses"
              searchPlaceholder="Search status…"
            />
          </div>

          {/* Interest Filter   */}
          <div style={{ minWidth: '160px', flex: '0 1 auto' }}>
            <SearchableSelect
              options={[
                { value: 'all', label: 'All Outcomes' },
                { value: 'interested', label: 'Interested' },
                { value: 'maybe', label: 'Maybe' },
                { value: 'callback_requested', label: 'Callback' },
                { value: 'not_interested', label: 'Not Interested' },
                { value: 'not_reachable', label: 'Not Reachable' },
              ]}
              value={interestFilter}
              onChange={val => { setInterestFilter(val); setPage(1) }}
              placeholder="All Outcomes"
              searchPlaceholder="Search outcome…"
            />
          </div>

          {/* Who Answered Filter */}
          <div style={{ minWidth: '165px', flex: '0 1 auto' }}>
            <SearchableSelect
              options={[
                { value: 'all', label: 'All Respondents' },
                { value: 'self', label: '👤 Target Official' },
                { value: 'gatekeeper', label: '📞 PA / Assistant' },
                { value: 'wrong_person', label: '❌ Wrong Person / No' },
                { value: 'no_answer', label: '📴 No Answer' },
                { value: 'relative', label: '👥 Relative / Other' },
              ]}
              value={whoFilter}
              onChange={val => { setWhoFilter(val); setPage(1) }}
              placeholder="All Respondents"
              searchPlaceholder="Filter respondent…"
            />
          </div>

          {/* Meeting Agreed Filter */}
          <div style={{ minWidth: '170px', flex: '0 1 auto' }}>
            <SearchableSelect
              options={[
                { value: 'all', label: 'All Meetings' },
                { value: 'agreed', label: 'Meeting Agreed (Yes)' },
                { value: 'declined', label: 'Meeting Declined (No)' },
              ]}
              value={demoFilter}
              onChange={val => { setDemoFilter(val); setPage(1) }}
              placeholder="All Meetings"
              searchPlaceholder="Search meeting…"
            />
          </div>

          {/* Reset Filter Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="filter-reset-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 12px', fontSize: '12px', fontWeight: 700, borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', cursor: 'pointer' }}
              title="Reset all active filters"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}

          <div className="filter-count-badge" style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
            Showing <span style={{ color: '#103778', fontWeight: 800 }}>{filteredCalls.length}</span> of {calls.length} calls
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="table-card">
        {/* Table Navy Header Bar */}
        <div className="table-navy-header">
          <div className="title-group">
            <Radio size={17} className="text-gov-saffron" />
            <span className="title-text">Recent Calls &amp; Live Tracking</span>
            <span className="counter-pill">
              {filteredCalls.length} {filteredCalls.length === calls.length ? 'Calls' : `of ${calls.length} Calls`}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="header-btn"
              onClick={handleExportTableExcel}
              title="Download all filtered calls & AI extracted fields to Excel (.xlsx)"
              style={{
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                fontSize: '11.5px',
                fontWeight: 700,
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              <FileSpreadsheet size={13} />
              <span>Export Excel</span>
            </button>

            <button
              type="button"
              className="header-btn"
              onClick={handleExportTablePDF}
              title="Print or Save call report with AI extractions as PDF"
              style={{
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                fontSize: '11.5px',
                fontWeight: 700,
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              <FileText size={13} />
              <span>Export PDF</span>
            </button>

            <button type="button" className="header-btn" onClick={loadCalls}>
              <RefreshCw size={12} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Call ID</th>
                <th>Prospect</th>
                <th>Organization</th>
                <th>Status</th>
                <th>Who Answered</th>
                <th>Interest &amp; Reason</th>
                <th>Outcome / Next Step</th>
                <th>Duration</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.length === 0 && (
                <tr>
                  <td colSpan="9" className="empty">
                    {hasActiveFilters ? 'No calls matched your filter criteria.' : 'No call records found. Initiate your first call above!'}
                  </td>
                </tr>
              )}
              {paginatedCalls.map(c => {
                const live = ACTIVE.includes(c.call_status)
                const isExpanded = expandedCallId === c.id

                const ansMap = {}
                if (Array.isArray(c.answers)) {
                  c.answers.forEach(a => {
                    if (a.question_key) ansMap[a.question_key.toLowerCase().trim()] = a.response_value
                  })
                }

                const effectiveReason = c.interest_reason || ansMap['not_interested_reason'] || ansMap['interest_reason']
                const isWrong = ansMap['is_wrong_number'] === 'Yes' || c.who_answered === 'wrong_person' || c.who_answered === 'wrong_number'
                const hasFraudDoubt = ansMap['fraud_suspicion'] === 'Yes' || ansMap['trust_sentiment'] === 'Suspected Fraud' || ansMap['trust_sentiment'] === 'Skeptical'
                const isCallback = c.interest_status === 'callback_requested' || ansMap['callback_requested'] === 'Yes' || ansMap['callback_time']
                const callbackTime = ansMap['callback_time']

                return (
                  <Fragment key={c.id}>
                    <tr style={{ background: isExpanded ? '#f1f5f9' : 'transparent', transition: 'background 0.15s ease' }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <b>#{c.id}</b>
                          {c.summary && (
                            <button
                              type="button"
                              onClick={() => setExpandedCallId(isExpanded ? null : c.id)}
                              title={isExpanded ? 'Close summary' : 'Read AI conversation summary'}
                              style={{
                                border: '1px solid #bfdbfe',
                                background: isExpanded ? '#2563eb' : '#eff6ff',
                                color: isExpanded ? '#fff' : '#1d4ed8',
                                borderRadius: '4px',
                                padding: '1px 5px',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <Sparkles size={9} /> {isExpanded ? 'Hide' : 'Summary'}
                            </button>
                          )}
                        </div>
                        {c.agent_name && (
                          <div style={{ fontSize: '11px', color: '#103778', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                            <Bot size={11} style={{ color: '#f26522' }} /> {c.agent_name.split(' ')[0]}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="font-bold text-slate-900">{c.contact_name}</div>
                        <div className="muted sm">{c.phone}</div>
                        {c.designation && <div style={{ fontSize: '10.5px', color: '#64748b' }}>{c.designation}</div>}
                      </td>
                      <td>{c.organization || '—'}</td>
                      <td>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: STATUS_TEXT_COLORS[c.call_status] || '#475569',
                        }}>
                          {formatStatusText(c.call_status)}
                        </span>
                      </td>
                      <td>
                        <WhoAnsweredBadge who={c.who_answered} answers={c.answers} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                          {c.interest_status ? (
                            <span style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: INTEREST_TEXT_COLORS[c.interest_status] || '#475569'
                            }}>
                              {formatInterestText(c.interest_status)}
                            </span>
                          ) : (
                            <span className="muted sm">—</span>
                          )}
                          {effectiveReason && (
                            <div
                              title={effectiveReason}
                              style={{
                                fontSize: '11px',
                                color: '#64748b',
                                fontStyle: 'italic',
                                lineHeight: '1.3',
                                maxWidth: '210px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginTop: '1px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <MessageSquare size={10} style={{ color: '#94a3b8', flexShrink: 0 }} />
                              <span>{effectiveReason}</span>
                            </div>
                          )}
                          {hasFraudDoubt && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#dc2626',
                              marginTop: '1px'
                            }}>
                              <ShieldAlert size={12} /> {ansMap['trust_sentiment'] === 'Suspected Fraud' ? 'Fraud Doubt' : 'Skeptical'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                          {c.it_head_call_agreed === 1 ? (
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle2 size={13} /> Meeting Agreed
                              </div>
                              {(c.it_head_call_date || c.it_head_call_raw) && (
                                <div style={{ fontSize: '10.5px', color: '#15803d', fontWeight: 500, marginTop: '1px' }}>
                                  📅 {c.it_head_call_date ? fmtDate(c.it_head_call_date) : c.it_head_call_raw}
                                  {c.it_head_call_time && ` ${fmtTime(c.it_head_call_time)}`}
                                </div>
                              )}
                            </div>
                          ) : c.it_head_call_agreed === 0 ? (
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#dc2626' }}>Meeting Declined</span>
                          ) : null}

                          {Number(c.call_transferred) === 1 && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '13px',
                              fontWeight: 600,
                              color: '#1d4ed8'
                            }}>
                              <PhoneForwarded size={12} /> Transferred
                            </div>
                          )}

                          {isCallback && (
                            <div style={{ fontSize: '12px', color: '#0369a1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} />
                              <span>Callback: {callbackTime || 'Requested'}</span>
                            </div>
                          )}

                          {c.next_action && c.next_action.trim() && (
                            <div
                              title={c.next_action}
                              style={{
                                fontSize: '11px',
                                color: '#64748b',
                                maxWidth: '180px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              👉 {c.next_action}
                            </div>
                          )}

                          {!c.it_head_call_agreed && !c.call_transferred && !isCallback && !c.next_action && (
                            <span className="muted sm">—</span>
                          )}
                        </div>
                      </td>
                      <td className="font-semibold text-slate-700">{fmtDur(c.duration_sec)}</td>
                      <td className="actions">
                        <button
                          className="icon-btn"
                          title={`Call ${c.contact_name} Again Now`}
                          onClick={() => handleQuickCall(c)}
                          style={{ color: '#103778' }}
                        >
                          <PhoneCall size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title={isExpanded ? 'Hide AI Summary & Details' : 'Preview AI Summary & Survey Answers'}
                          onClick={() => setExpandedCallId(isExpanded ? null : c.id)}
                          style={{ color: isExpanded ? '#f26522' : '#8b5cf6' }}
                        >
                          <Sparkles size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title="Edit Call Status & Details"
                          onClick={() => handleOpenEdit(c)}
                          style={{ color: '#0284c7' }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title="View Full Transcript &amp; Audit Details"
                          onClick={() => nav(`/calls/${c.id}`)}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title="Export Call Dossier (Excel / PDF / Transcript)"
                          onClick={() => handleOpenRowExport(c)}
                          style={{ color: '#0369a1' }}
                        >
                          <Download size={16} />
                        </button>
                      </td>
                    </tr>

                    {/* Inline Expandable Drawer for Instant Context */}
                    {isExpanded && (
                      <tr key={`expand-${c.id}`} style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                        <td colSpan="9" style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* Executive Summary Box */}
                            <div style={{
                              background: '#fff',
                              border: '1px solid #fed7aa',
                              borderLeft: '4px solid #f26522',
                              borderRadius: '8px',
                              padding: '12px 16px',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#103778' }}>
                                  <Sparkles size={14} style={{ color: '#f26522' }} />
                                  <span>AI CONVERSATION SUMMARY &amp; AUDIT INSIGHTS</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setExpandedCallId(null)}
                                  style={{ border: 'none', background: 'none', color: '#64748b', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                >
                                  ✕ Close Preview
                                </button>
                              </div>
                              <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#1e293b' }}>
                                {c.summary || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Summary will be generated once call conversation concludes.</span>}
                              </p>
                            </div>

                            {/* Extracted Survey Answers Grid */}
                            {Array.isArray(c.answers) && c.answers.length > 0 && (
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                                  Extracted Survey &amp; Qualification Answers ({c.answers.length}):
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                  {c.answers.map(ans => (
                                    <div
                                      key={ans.id || ans.question_key}
                                      style={{
                                        background: '#fff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        padding: '5px 10px',
                                        fontSize: '11.5px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                      }}
                                    >
                                      <span style={{ fontWeight: 700, color: '#475569', textTransform: 'capitalize' }}>
                                        {(ans.question_key || '').replace(/_/g, ' ')}:
                                      </span>
                                      <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                        {ans.response_value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Action Bar Footer */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px', flexWrap: 'wrap', gap: '8px' }}>
                              <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                                {c.next_action && <span><strong>Recommended Next Action:</strong> {c.next_action}</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                  type="button"
                                  className="btn ghost sm"
                                  onClick={() => handleOpenRowExport(c)}
                                  style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <Download size={12} /> Export Dossier
                                </button>
                                <button
                                  type="button"
                                  className="btn primary sm"
                                  onClick={() => nav(`/calls/${c.id}`)}
                                  style={{ fontSize: '11px', background: '#103778', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <Eye size={12} /> View Full Dialogue &amp; Transcript →
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalPages={Math.ceil(filteredCalls.length / limit) || 1}
          totalItems={filteredCalls.length}
          perPage={limit}
          onPageChange={setPage}
          onPerPageChange={setLimit}
          itemLabel="calls"
        />
      </div>

      {/* Edit Call Modal */}
      {editingCall && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
            animation: 'fadeIn 0.15s ease-out',
          }}
          onClick={handleCloseEdit}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
              width: '100%',
              maxWidth: '480px',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                background: '#103778',
                color: '#ffffff',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Pencil size={16} style={{ color: '#f26522' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                    Edit Call #{editingCall.id}
                  </h3>
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                  {editingCall.contact_name} · {editingCall.phone} {editingCall.organization ? `· ${editingCall.organization}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseEdit}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveEdit} style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Call Status */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Call Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#0f172a',
                      background: '#fff',
                      outline: 'none',
                    }}
                  >
                    <option value="completed">Completed</option>
                    <option value="queued">Queued (Re-Call Prospect)</option>
                    <option value="busy">Busy</option>
                    <option value="no_answer">No Answer</option>
                    <option value="failed">Failed</option>
                    <option value="ringing">Ringing</option>
                    <option value="in_progress">In Progress</option>
                  </select>
                  {editStatus === 'queued' && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#0284c7', background: '#e0f2fe', padding: '8px 10px', borderRadius: '6px', lineHeight: '1.4' }}>
                      💡 <b>Queued select karne se:</b> Is call ka status 'Queued' ho jayega aur yeh prospect wapas se dialer ke <b>Pending Queue</b> me chala jayega taaki aap ise dubara call kar sakein.
                    </div>
                  )}
                </div>

                {/* Interest Status */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Interest Status
                  </label>
                  <select
                    value={editInterest}
                    onChange={(e) => setEditInterest(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#0f172a',
                      background: '#fff',
                      outline: 'none',
                    }}
                  >
                    <option value="unknown">Unknown</option>
                    <option value="interested">Interested</option>
                    <option value="maybe">Maybe</option>
                    <option value="not_interested">Not Interested</option>
                    <option value="dnd">Do Not Disturb (DND)</option>
                  </select>
                </div>

                {/* Senior Team Meeting Agreement */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Senior Team Meeting Agreed / Scheduled
                  </label>
                  <select
                    value={editDemoAgreed}
                    onChange={(e) => setEditDemoAgreed(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#0f172a',
                      background: '#fff',
                      outline: 'none',
                    }}
                  >
                    <option value="">Not Specified (—)</option>
                    <option value="1">Yes (Agreed for Meeting)</option>
                    <option value="0">No (Declined Meeting)</option>
                  </select>
                </div>

              </div>

              {/* Modal Actions */}
              <div
                style={{
                  marginTop: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '10px',
                }}
              >
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  disabled={savingEdit}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#103778',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(16, 55, 120, 0.2)',
                  }}
                >
                  {savingEdit ? (
                    <>Saving...</>
                  ) : (
                    <>
                      <Check size={16} /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Single Call Export Dossier Modal ── */}
      {exportModalCall && (
        <div
          className="modal-backdrop"
          onClick={handleCloseRowExport}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            className="modal-card"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
              border: '1px solid #cbd5e1',
            }}
          >
            {/* Modal Header */}
            <div style={{ background: '#103778', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileDown size={20} style={{ color: '#f26522' }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>
                    Export Call Dossier #{exportModalCall.id}
                  </h3>
                  <div style={{ fontSize: '11.5px', color: '#cbd5e1', marginTop: '2px' }}>
                    {exportModalCall.contact_name || 'Prospect'} · {exportModalCall.phone} {exportModalCall.organization ? `· ${exportModalCall.organization}` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseRowExport}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                Choose your preferred export format for this call record. All AI-extracted survey answers, duration metrics, and dialogue turns will be included.
              </p>

              {exportModalLoading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                  <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#103778' }} />
                  Preparing call data and extractions…
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Option 1: Excel */}
                  <div
                    onClick={() => {
                      const fullCall = exportModalDetails?.call || exportModalCall
                      const turns = exportModalDetails?.turns || []
                      const ans = exportModalDetails?.answers || exportModalCall.answers || []
                      exportSingleCallToExcel(fullCall, turns, ans, extractionFields)
                      handleCloseRowExport()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '14px 16px',
                      borderRadius: '10px',
                      border: '1px solid #bbf7d0',
                      background: '#f0fdf4',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#15803d', flexShrink: 0 }}>
                      <FileSpreadsheet size={22} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#166534' }}>
                        Excel Workbook (.xlsx)
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
                        Structured multi-sheet workbook with Call Overview, Extracted Survey Answers, and Dialogue Transcript.
                      </div>
                    </div>
                  </div>

                  {/* Option 2: PDF */}
                  <div
                    onClick={() => {
                      const fullCall = exportModalDetails?.call || exportModalCall
                      const turns = exportModalDetails?.turns || []
                      const ans = exportModalDetails?.answers || exportModalCall.answers || []
                      exportSingleCallToPDF(fullCall, turns, ans, extractionFields)
                      handleCloseRowExport()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '14px 16px',
                      borderRadius: '10px',
                      border: '1px solid #fecaca',
                      background: '#fef2f2',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', flexShrink: 0 }}>
                      <FileText size={22} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#991b1b' }}>
                        PDF Executive Dossier (.pdf)
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
                        Print-ready single-call report ready to save as PDF with prospect info, outcomes, survey cards, and dialogue.
                      </div>
                    </div>
                  </div>

                  {/* Option 3: Transcript Text */}
                  <div
                    onClick={() => {
                      downloadTranscriptFromTable(exportModalCall)
                      handleCloseRowExport()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '14px 16px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', flexShrink: 0 }}>
                      <Download size={22} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
                        Verbatim Transcript (.txt)
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                        Plain text file containing the entire turn-by-turn spoken dialogue between Ajay and the prospect.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCloseRowExport}
                style={{
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
