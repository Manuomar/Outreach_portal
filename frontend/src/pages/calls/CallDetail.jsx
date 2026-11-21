import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  RefreshCw,
  Phone,
  PhoneCall,
  PhoneForwarded,
  Building2,
  User,
  Clock,
  Calendar,
  CheckCircle2,
  Shield,
  Mic,
  FileText,
  Sparkles,
  MessageSquare,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Code,
  Tag,
  Bot,
  Hash,
  HelpCircle,
  Zap,
  Check,
  Copy,
  LayoutGrid,
  List,
  Search,
  FileSpreadsheet,
} from 'lucide-react'
import { api } from '../../api'
import { InterestBadge, StatusBadge, fmtDate, fmtTime, fmtDur, INTEREST } from '../../components/ui.jsx'
import { exportSingleCallToExcel, exportSingleCallToPDF } from '../../utils/callExport'

const ACTIVE_STATUSES = ['queued', 'ringing', 'in_progress']

const WHO_ANSWERED_LABELS = {
  self: { label: 'Target Official (Self)', color: '#16a34a', bg: '#dcfce7' },
  gatekeeper: { label: 'PA / Gatekeeper', color: '#2563eb', bg: '#dbeafe' },
  staff: { label: 'Staff / Assistant', color: '#0284c7', bg: '#e0f2fe' },
  relative: { label: 'Relative / Family', color: '#d97706', bg: '#fef3c7' },
  wrong_person: { label: 'Wrong Person', color: '#dc2626', bg: '#fee2e2' },
  no_answer: { label: 'No Answer', color: '#64748b', bg: '#f1f5f9' },
  unknown: { label: 'Unknown / Not Clear', color: '#64748b', bg: '#f1f5f9' },
}

export default function CallDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [form, setForm] = useState({})
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const [showRawJson, setShowRawJson] = useState(false)
  const [extFilter, setExtFilter] = useState('all') // 'all' | 'answered' | 'unanswered'
  const [extSearch, setExtSearch] = useState('')
  const [extView, setExtView] = useState('grid') // 'grid' | 'table'

  const load = useCallback(async () => {
    try {
      setErr('')
      const r = await api.call(id)
      setData(r)

      // Look up extracted values from answers table as fallback
      const ansMap = {}
      if (Array.isArray(r.answers)) {
        r.answers.forEach(a => {
          if (a.question_key && a.response_value) {
            ansMap[a.question_key.toLowerCase().trim()] = a.response_value
          }
        })
      }
      const findAns = (keys) => {
        for (const k of keys) {
          if (ansMap[k]) return ansMap[k]
        }
        return ''
      }

      const extPhone = findAns(['it head phone', 'it_head_phone', 'meeting phone', 'attendee phone', 'phone', 'contact number', 'contact', 'mobile'])
      const extName = findAns(['it head name', 'it_head_name', 'meeting attendee', 'attendee name', 'name', 'naam'])
      const extInterest = findAns(['interest status', 'interest_status', 'interest level'])
      const extTransfer = findAns(['transferred to number', 'transfer number', 'forwarded to', 'redirected number'])

      const isTransferred = r.call.call_transferred != null 
        ? Number(r.call.call_transferred) 
        : (r.call.transferred_to_number ? 1 : 0)

      setForm({
        call_status: r.call.call_status || 'completed',
        who_answered: r.call.who_answered || '',
        interest_status: r.call.interest_status || (extInterest ? extInterest.toLowerCase() : ''),
        interest_reason: r.call.interest_reason || '',
        call_transferred: isTransferred,
        transferred_to_number: r.call.transferred_to_number || r.call.agent_transfer_number || extTransfer || '',
        it_head_name: r.call.it_head_name || extName || '',
        it_head_phone: r.call.it_head_phone || extPhone || '',
        it_head_call_date: r.call.it_head_call_date || '',
        it_head_call_time: (r.call.it_head_call_time || '').slice(0, 5),
        it_head_call_agreed: r.call.it_head_call_agreed,
        it_head_call_raw: r.call.it_head_call_raw || '',
        next_action: r.call.next_action || '',
      })
    } catch (e) {
      setErr(e.message || 'Call load karne me dikkat aayi')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Auto-sync polling:
  // 1. While call is active (queued, ringing, in_progress): poll every 3 seconds
  // 2. When call completes: Bolna takes 3-10s to run background extraction and fill answers.
  //    Keep polling every 3 seconds for up to 10 attempts until answers or transcript are populated!
  const completedPollCount = useRef(0)

  useEffect(() => {
    const status = data?.call?.call_status
    if (!status) return

    const isActive = ACTIVE_STATUSES.includes(status)
    const hasAnswers = Array.isArray(data?.answers) && data.answers.length > 0
    const isExtracting = status === 'completed' && !hasAnswers && completedPollCount.current < 10

    if (!isActive && !isExtracting) return

    const timer = setInterval(async () => {
      try {
        if (!isActive) {
          completedPollCount.current += 1
        }
        await api.syncCall(id)
        await load()
      } catch (_) {}
    }, 3000)

    return () => clearInterval(timer)
  }, [id, data?.call?.call_status, data?.answers, load])

  const manualSync = async () => {
    setSyncing(true)
    try {
      await api.syncCall(id)
      await load()
    } catch (e) {
      alert('Sync error: ' + (e.message || 'Failed to sync with Bolna'))
    } finally {
      setSyncing(false)
    }
  }

  const [callingAgain, setCallingAgain] = useState(false)
  const handleCallAgain = async () => {
    const callItem = data?.call
    if (!callItem?.lead_id) return
    if (!window.confirm(`Initiate a new call to ${callItem.contact_name} (${callItem.phone})?`)) return
    setCallingAgain(true)
    try {
      const res = await api.startCall(callItem.lead_id, callItem.agent_id || null)
      alert(`New call initiated (#${res.call_id})! Opening new call...`)
      nav(`/calls/${res.call_id}`)
    } catch (err) {
      alert('Call failed: ' + (err.message || 'Error'))
    } finally {
      setCallingAgain(false)
    }
  }

  const saveCorrection = async (e) => {
    e.preventDefault()
    try {
      await api.updateCall(id, {
        ...form,
        is_manual: 1,
        call_transferred: form.call_transferred === null || form.call_transferred === '' ? 0 : Number(form.call_transferred),
        transferred_to_number: form.transferred_to_number || null,
        it_head_call_agreed: form.it_head_call_agreed === null || form.it_head_call_agreed === '' ? null : Number(form.it_head_call_agreed),
      })
      setSaved(true)
      await load()
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      alert('Save error: ' + (e.message || 'Failed to save correction'))
    }
  }

  const c = data?.call || {}
  const turns = data?.turns || []
  const answers = data?.answers || []
  const analysis = c.analysis || {}
  const objections = Array.isArray(analysis.objections) ? analysis.objections : []

  // Map extraction fields definitions for metadata & friendly labels
  const fieldDefMap = useMemo(() => {
    const map = {}
    if (Array.isArray(data?.extraction_fields)) {
      data.extraction_fields.forEach(f => {
        map[f.field_key.toLowerCase().trim()] = f
      })
    }
    return map
  }, [data?.extraction_fields])

  // Obsolete legacy keys to ignore
  const OBSOLETE_KEYS = ['student_volume', 'college_count', 'current_verification_method']

  // Group answers by category / subcategory and detect whether answered
  const categorizedAnswers = useMemo(() => {
    return answers
      .filter(a => {
        const k = a.question_key ? a.question_key.toLowerCase().trim() : ''
        return !OBSOLETE_KEYS.includes(k)
      })
      .map(a => {
        const k = a.question_key ? a.question_key.toLowerCase().trim() : ''
        const def = fieldDefMap[k]
        const val = (a.response_value || '').trim()
        const lower = val.toLowerCase()
        const isUnanswered = (
          !val ||
          val === '—' ||
          lower.includes('not mentioned') ||
          lower.includes('not specified') ||
          lower.includes('not discussed') ||
          lower.includes('not provided') ||
          lower.includes('not applicable') ||
          lower === 'none' ||
          lower === 'n/a'
        )
        return {
          ...a,
          label: def ? def.label : (a.question_key || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          category: def?.category || 'Survey',
          subcategory: def?.subcategory || 'General',
          description: def?.description || '',
          isAnswered: !isUnanswered,
        }
      })
  }, [answers, fieldDefMap])

  const answeredCount = useMemo(() => categorizedAnswers.filter(a => a.isAnswered).length, [categorizedAnswers])
  const unansweredCount = useMemo(() => categorizedAnswers.filter(a => !a.isAnswered).length, [categorizedAnswers])

  const filteredAnswers = useMemo(() => {
    return categorizedAnswers.filter(a => {
      if (extFilter === 'answered' && !a.isAnswered) return false
      if (extFilter === 'unanswered' && a.isAnswered) return false
      if (extSearch) {
        const q = extSearch.toLowerCase().trim()
        return (
          a.label.toLowerCase().includes(q) ||
          (a.question_key || '').toLowerCase().includes(q) ||
          (a.response_value || '').toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q) ||
          a.subcategory.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [categorizedAnswers, extFilter, extSearch])

  const downloadTranscript = () => {
    if (!data?.call) return
    const callItem = data.call
    let text = `==================================================\n`
    text += `OUTREACH PORTAL — CALL TRANSCRIPT & AUDIT DOSSIER\n`
    text += `==================================================\n`
    text += `Call ID: #${callItem.id}\n`
    text += `Agent: ${callItem.agent_name || 'Ajay (Outreach Portal Default)'}\n`
    text += `Contact Name: ${callItem.contact_name}\n`
    text += `Phone: ${callItem.phone}\n`
    text += `Organization: ${callItem.organization || '—'}\n`
    text += `Designation: ${callItem.designation || '—'}\n`
    text += `Call Status: ${callItem.call_status}\n`
    text += `Who Answered: ${callItem.who_answered || '—'}\n`
    text += `Interest Status: ${callItem.interest_status || '—'}\n`
    if (callItem.interest_reason) text += `Interest Reason: ${callItem.interest_reason}\n`
    if (callItem.call_transferred || callItem.transferred_to_number) {
      text += `Call Transferred to Senior Team: Yes (To: ${callItem.transferred_to_number || callItem.agent_transfer_number || 'Senior Officer'})\n`
    } else {
      text += `Call Transferred: No (Direct AI Call)\n`
    }
    if (callItem.it_head_call_agreed === 1 || callItem.it_head_name || callItem.it_head_call_date) {
      text += `Senior Team Meeting Scheduled: Yes\n`
      if (callItem.it_head_name) text += `Meeting Attendee: ${callItem.it_head_name}\n`
      if (callItem.it_head_phone) text += `Attendee Phone: ${callItem.it_head_phone}\n`
      if (callItem.it_head_call_date) text += `Meeting Date: ${callItem.it_head_call_date}\n`
      if (callItem.it_head_call_time) text += `Meeting Time: ${callItem.it_head_call_time}\n`
    }
    text += `Duration: ${fmtDur(callItem.duration_sec)}\n`
    text += `Dialect Detected: ${callItem.dialect_detected || 'Standard Hindi'}\n`
    if (callItem.started_at) text += `Call Started: ${new Date(callItem.started_at).toLocaleString('en-IN')}\n`
    if (callItem.end_time) text += `Call Ended: ${new Date(callItem.end_time).toLocaleString('en-IN')}\n`
    if (callItem.bolna_execution_id) text += `Bolna Execution ID: ${callItem.bolna_execution_id}\n`
    if (callItem.recording_url) text += `Audio Recording URL: ${callItem.recording_url}\n`
    text += `==================================================\n\n`

    text += `[COMPLETE CONVERSATION TRANSCRIPT]\n`
    text += `--------------------------------------------------\n`
    if (turns.length > 0) {
      turns.forEach((t) => {
        const speaker = t.speaker === 'agent' ? (callItem.agent_name || 'Ajay (AI Outreach Agent)') : (callItem.contact_name || 'Prospect')
        text += `${speaker}:\n${t.text}\n\n`
      })
    } else if (callItem.transcript) {
      text += callItem.transcript + `\n\n`
    } else {
      text += `(No transcript available)\n\n`
    }
    text += `--------------------------------------------------\n\n`

    if (callItem.summary) {
      text += `[AI SUMMARY & INSIGHTS]\n`
      text += `${callItem.summary}\n\n`
    }
    if (callItem.next_action) {
      text += `Recommended Next Action: ${callItem.next_action}\n\n`
    }

    if (answers.length > 0) {
      text += `[EXTRACTED SURVEY & CUSTOM DATA]\n`
      text += `--------------------------------------------------\n`
      answers.forEach((a) => {
        const def = fieldDefMap[a.question_key.toLowerCase().trim()]
        const label = def ? def.label : a.question_key
        text += `- ${label} (${a.question_key}): ${a.response_value || '—'} (Confidence: ${Math.round((a.confidence_score || 1) * 100)}%)\n`
      })
      text += `--------------------------------------------------\n\n`
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Transcript_Call_${callItem.id}_${(callItem.contact_name || 'Prospect').replace(/\s+/g, '_')}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <RefreshCw size={28} className="spin" style={{ color: 'var(--navy)', marginBottom: 12 }} />
        <h3 style={{ margin: 0 }}>Loading call details…</h3>
      </div>
    )
  }

  if (err || !data?.call) {
    return (
      <div className="panel">
        <div className="alert err">{err || 'Call record not found'}</div>
        <button className="btn ghost" onClick={() => nav('/live-call')}>
          <ArrowLeft size={16} /> Back to Live Calls
        </button>
      </div>
    )
  }

  const whoAnsweredMeta = WHO_ANSWERED_LABELS[c.who_answered] || { label: c.who_answered || 'Unknown', color: '#64748b', bg: '#f1f5f9' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Navigation & Action Header */}
      <div className="panel" style={{ padding: '16px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="btn ghost" onClick={() => nav('/live-call')} style={{ padding: '8px 14px' }}>
              <ArrowLeft size={16} /> Back to Live Calls
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 20, color: 'var(--navy)' }}>
                  Call #{c.id} — {c.contact_name}
                </h2>
                {c.agent_name && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    background: '#e0e7ff',
                    color: '#3730a3',
                    padding: '2px 8px',
                    borderRadius: 99,
                  }}>
                    <Bot size={12} /> {c.agent_name}
                  </span>
                )}
              </div>
              <div className="muted sm" style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span>Lead ID: #{c.lead_id}</span>
                {c.bolna_execution_id && <span>Bolna Execution: <code>{c.bolna_execution_id}</code></span>}
                {c.started_at && <span>Initiated: {new Date(c.started_at).toLocaleString('en-IN')}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <StatusBadge status={c.call_status} />
            <InterestBadge status={c.interest_status} />
            {c.who_answered && (
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: whoAnsweredMeta.color,
                background: whoAnsweredMeta.bg,
                padding: '4px 10px',
                borderRadius: 99,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <User size={13} /> {whoAnsweredMeta.label}
              </span>
            )}
            {Boolean(c.call_transferred || c.transferred_to_number) && (
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#065f46',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                padding: '4px 10px',
                borderRadius: 99,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <PhoneForwarded size={13} /> Transferred: {c.transferred_to_number || c.agent_transfer_number || 'Senior Officer'}
              </span>
            )}
            {c.it_head_call_agreed === 1 && (
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#1d4ed8',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                padding: '4px 10px',
                borderRadius: 99,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <Calendar size={13} /> Meeting Scheduled
              </span>
            )}
            <button className="btn ghost" onClick={manualSync} disabled={loading || syncing} style={{ padding: '8px 14px' }} title="Fetch live status, transcript and extractions from Bolna">
              <RefreshCw size={14} className={loading || syncing ? 'spin' : ''} /> {syncing ? 'Syncing…' : 'Refresh & Sync'}
            </button>
            <button
              className="btn primary"
              onClick={() => exportSingleCallToExcel(c, turns, answers, data?.extraction_fields)}
              style={{
                padding: '8px 14px',
                background: '#16a34a',
                borderColor: '#15803d',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 700,
              }}
              title="Download complete call dossier & all extracted fields as Excel workbook"
            >
              <FileSpreadsheet size={15} /> Export Excel
            </button>
            <button
              className="btn primary"
              onClick={() => exportSingleCallToPDF(c, turns, answers, data?.extraction_fields)}
              style={{
                padding: '8px 14px',
                background: '#dc2626',
                borderColor: '#b91c1c',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 700,
              }}
              title="Print or Save complete executive call dossier as PDF"
            >
              <FileText size={15} /> Export PDF
            </button>
            <button className="btn ghost" onClick={downloadTranscript} disabled={turns.length === 0 && !c.transcript} style={{ padding: '8px 14px' }} title="Download plain text dialogue transcript">
              <Download size={15} /> Transcript (.txt)
            </button>
            <button className="btn primary" onClick={handleCallAgain} disabled={callingAgain} style={{ padding: '8px 14px', background: '#103778' }} title="Call this prospect again immediately">
              <PhoneCall size={15} /> {callingAgain ? 'Dialing…' : 'Call Again'}
            </button>
          </div>
        </div>
      </div>

      {/* Live Call / Extraction Status Banner */}
      {ACTIVE_STATUSES.includes(c.call_status) && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#1e40af', fontWeight: 600 }}>
          <RefreshCw size={14} className="spin" style={{ color: '#2563eb' }} />
          <span>Call is currently in progress — live status and transcript auto-syncing every 3 seconds...</span>
        </div>
      )}
      {c.call_status === 'completed' && turns.length === 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
          <RefreshCw size={14} className="spin" style={{ color: '#d97706' }} />
          <span>Call finished! Bolna AI is finalizing the transcript and extracting question answers. Auto-fetching results...</span>
        </div>
      )}

      {/* Overview Metadata Grid */}
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <div className="stat">
          <div className="stat-ic" style={{ background: '#eaf1ff', color: 'var(--navy)' }}><User size={22} /></div>
          <div>
            <div className="stat-val" style={{ fontSize: 17 }}>{c.contact_name}</div>
            <div className="stat-label">{c.designation || 'Prospect'}</div>
            <div className="stat-sub">{c.phone}</div>
          </div>
        </div>

        <div className="stat">
          <div className="stat-ic" style={{ background: '#fff2e8', color: 'var(--orange)' }}><Building2 size={22} /></div>
          <div>
            <div className="stat-val" style={{ fontSize: 17 }}>{c.organization || '—'}</div>
            <div className="stat-label">{c.sector || 'ITI / Skill Sector'}</div>
            <div className="stat-sub">{c.district ? `District: ${c.district}` : 'All India'}</div>
          </div>
        </div>

        <div className="stat">
          <div className="stat-ic" style={{ background: '#e3f6ee', color: 'var(--green)' }}><Clock size={22} /></div>
          <div>
            <div className="stat-val" style={{ fontSize: 17 }}>{fmtDur(c.duration_sec)}</div>
            <div className="stat-label">Call Duration</div>
            <div className="stat-sub">
              {c.started_at ? new Date(c.started_at).toLocaleTimeString('en-IN') : '—'}
              {c.end_time ? ` to ${new Date(c.end_time).toLocaleTimeString('en-IN')}` : ''}
            </div>
          </div>
        </div>

        <div className="stat">
          <div className="stat-ic" style={{
            background: (c.call_transferred || c.transferred_to_number) ? '#ecfdf5' : '#f1f5f9',
            color: (c.call_transferred || c.transferred_to_number) ? '#059669' : '#64748b'
          }}>
            <PhoneForwarded size={22} />
          </div>
          <div>
            <div className="stat-val" style={{ fontSize: 17, color: (c.call_transferred || c.transferred_to_number) ? '#059669' : 'inherit' }}>
              {(c.call_transferred || c.transferred_to_number) ? 'Transferred' : 'Direct Call'}
            </div>
            <div className="stat-label">Call Redirection</div>
            <div className="stat-sub">
              {(c.transferred_to_number || c.agent_transfer_number)
                ? (c.transferred_to_number || c.agent_transfer_number)
                : 'No transfer requested'}
            </div>
          </div>
        </div>

        <div className="stat">
          <div className="stat-ic" style={{
            background: c.it_head_call_agreed === 1 ? '#eff6ff' : (c.it_head_call_agreed === 0 ? '#fef2f2' : '#f8fafc'),
            color: c.it_head_call_agreed === 1 ? '#2563eb' : (c.it_head_call_agreed === 0 ? '#dc2626' : '#64748b')
          }}>
            <Calendar size={22} />
          </div>
          <div>
            <div className="stat-val" style={{
              fontSize: 17,
              color: c.it_head_call_agreed === 1 ? '#2563eb' : (c.it_head_call_agreed === 0 ? '#dc2626' : 'inherit')
            }}>
              {c.it_head_call_agreed === 1 ? 'Scheduled' : (c.it_head_call_agreed === 0 ? 'Declined' : 'Not Set')}
            </div>
            <div className="stat-label">Senior Meeting</div>
            <div className="stat-sub">
              {c.it_head_call_date
                ? `${c.it_head_call_date} ${c.it_head_call_time || ''}`
                : (c.it_head_name ? `With: ${c.it_head_name}` : 'Not scheduled')}
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Section: Left (Dialogue & Audio) / Right (Result & Details) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20, alignItems: 'start' }}>
        
        {/* Left Column: Recording, Dialogue, & Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Call Redirection Triggered Banner */}
          {(c.call_transferred || c.transferred_to_number) && (
            <div style={{
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
              border: '1px solid #6ee7b7',
              borderRadius: 10,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: '#059669',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <PhoneForwarded size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#065f46', fontSize: 14 }}>
                    Call Redirection Triggered
                  </div>
                  <div style={{ color: '#047857', fontSize: 13, marginTop: 2 }}>
                    Call transferred to Senior Officer at: <strong>{c.transferred_to_number || c.agent_transfer_number || 'Configured Transfer Number'}</strong>
                  </div>
                </div>
              </div>
              {c.transferred_to_number && (
                <a
                  href={`tel:${c.transferred_to_number}`}
                  className="btn primary"
                  style={{
                    background: '#059669',
                    padding: '6px 14px',
                    fontSize: 12,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Phone size={13} /> Call Senior ({c.transferred_to_number})
                </a>
              )}
            </div>
          )}

          {/* Audio Player Card */}
          <div className="panel">
            <div className="section-title"><Mic size={16} /> CALL AUDIO RECORDING</div>
            {c.recording_url ? (
              <div>
                <audio controls src={c.recording_url} style={{ width: '100%', borderRadius: 8, outline: 'none' }} />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="muted sm">Verified audio proof from telephony server</span>
                  <a href={c.recording_url} target="_blank" rel="noreferrer" className="sm" style={{ color: 'var(--orange)', fontWeight: 600, textDecoration: 'none' }}>
                    Open Audio Link ↗
                  </a>
                </div>
              </div>
            ) : (
              <div className="muted" style={{ padding: '16px 0', textAlign: 'center' }}>
                {ACTIVE_STATUSES.includes(c.call_status) ? 'Call is currently in progress; recording will appear here once the call ends.' : 'Recording audio is not available.'}
              </div>
            )}
          </div>

          {/* AI Executive Summary & Core Insights */}
          <div className="panel" style={{ borderLeft: '4px solid var(--orange)' }}>
            <div className="section-title" style={{ color: 'var(--orange-d)' }}><Sparkles size={16} /> AI SUMMARY &amp; CONVERSATION INSIGHTS</div>
            
            {c.summary ? (
              <p style={{ margin: '6px 0 0', lineHeight: 1.6, fontSize: 14, color: '#1e293b' }}>
                {c.summary}
              </p>
            ) : (
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                Summary will be generated once call conversation concludes.
              </p>
            )}

            {/* Interest & Reason Highlight */}
            {c.interest_reason && (
              <div style={{ marginTop: 12, background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: 'var(--navy)' }}>Interest / Objection Rationale:</span>
                <div style={{ color: '#475569', marginTop: 3 }}>{c.interest_reason}</div>
              </div>
            )}

            {/* Objections Tag List */}
            {objections.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <AlertTriangle size={13} /> Objections Raised by Prospect:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {objections.map((obj, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 12,
                        background: '#fef3c7',
                        color: '#92400e',
                        border: '1px solid #fde68a',
                        padding: '3px 9px',
                        borderRadius: 6,
                        fontWeight: 600,
                      }}
                    >
                      • {obj}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Extra Detected Role / Volume Hints */}
            {(analysis.contact_role || analysis.volume_hint || analysis.organization_type) && (
              <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--line)', display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12 }}>
                {analysis.contact_role && (
                  <div>
                    <span className="muted">Role Detected: </span>
                    <b style={{ color: 'var(--navy)' }}>{analysis.contact_role}</b>
                  </div>
                )}
                {analysis.volume_hint && (
                  <div>
                    <span className="muted">Student Volume: </span>
                    <b style={{ color: 'var(--navy)' }}>{analysis.volume_hint}</b>
                  </div>
                )}
                {analysis.organization_type && (
                  <div>
                    <span className="muted">Org Type: </span>
                    <b style={{ color: 'var(--navy)' }}>{analysis.organization_type}</b>
                  </div>
                )}
              </div>
            )}

            {c.next_action && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 13 }}>
                <b style={{ color: '#047857' }}>Recommended Next Action:</b> <span style={{ color: '#0f172a', fontWeight: 600 }}>{c.next_action}</span>
              </div>
            )}
          </div>

          {/* Full Dialogue Transcript */}
          <div className="panel">
            <div className="panel-head">
              <div className="section-title" style={{ margin: 0 }}><MessageSquare size={16} /> COMPLETE CONVERSATION TRANSCRIPT</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="muted sm">{turns.length} utterances</span>
                <button className="btn ghost" onClick={downloadTranscript} disabled={turns.length === 0 && !c.transcript} style={{ padding: '4px 10px', fontSize: 12 }}>
                  <Download size={13} /> Export .txt
                </button>
              </div>
            </div>
            <div className="chat" style={{ maxHeight: 450, padding: 16 }}>
              {turns.length === 0 && (
                <p className="muted" style={{ textAlign: 'center', padding: 20 }}>
                  {ACTIVE_STATUSES.includes(c.call_status)
                    ? 'Call is in progress… transcript will appear once conversation finishes.'
                    : 'No transcript records found.'}
                </p>
              )}
              {turns.map((t) => (
                <div key={t.id} className={'bubble ' + t.speaker} style={{ maxWidth: '85%' }}>
                  <span>{t.speaker === 'agent' ? (c.agent_name || 'Ajay (AI Outreach Agent)') : (c.contact_name || 'Prospect')}</span>
                  {t.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Qualification & Extracted Answers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Result & Meeting Schedule Editor */}
          <div className="panel">
            <div className="panel-head">
              <div className="section-title" style={{ margin: 0 }}><CheckCircle2 size={16} /> QUALIFICATION &amp; SENIOR MEETING</div>
              {saved && <span className="ok-text" style={{ fontSize: 12 }}>Saved successfully ✔</span>}
            </div>

            <form onSubmit={saveCorrection}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
                
                {/* Who Answered */}
                <div>
                  <label>Who Answered the Call?</label>
                  <select
                    value={form.who_answered || ''}
                    onChange={e => setForm({ ...form, who_answered: e.target.value })}
                  >
                    <option value="">— Select respondent —</option>
                    <option value="self">Target Official (Self)</option>
                    <option value="gatekeeper">PA / Gatekeeper</option>
                    <option value="staff">Staff / Assistant</option>
                    <option value="relative">Relative / Family</option>
                    <option value="wrong_person">Wrong Person</option>
                    <option value="no_answer">No Answer</option>
                    <option value="unknown">Unknown / Not Clear</option>
                  </select>
                </div>

                {/* Call Status */}
                <div>
                  <label>Call Status</label>
                  <select value={form.call_status || c.call_status} onChange={e => setForm({ ...form, call_status: e.target.value })}>
                    <option value="completed">Completed</option>
                    <option value="queued">Queued (Re-Call Prospect)</option>
                    <option value="busy">Busy</option>
                    <option value="no_answer">No Answer</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>

                {/* Prospect Interest Status */}
                <div>
                  <label>Prospect Interest Status</label>
                  <select value={form.interest_status} onChange={e => setForm({ ...form, interest_status: e.target.value })}>
                    <option value="">— Select status —</option>
                    {Object.entries(INTEREST).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>

                {/* Interest / Objection Reason */}
                <div>
                  <label>Interest / Objection Reason</label>
                  <textarea
                    rows={2}
                    placeholder="Specific reason or conversation context for interest or hesitation..."
                    value={form.interest_reason || ''}
                    onChange={e => setForm({ ...form, interest_reason: e.target.value })}
                    style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)', padding: 8, fontSize: 13 }}
                  />
                </div>

                {/* Call Redirection / Transfer Section */}
                <div style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#166534', fontSize: 13 }}>
                    <PhoneForwarded size={14} style={{ color: '#16a34a' }} /> Call Redirection &amp; Transfer Tracking
                  </div>

                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div>
                      <label>Call Transferred?</label>
                      <select
                        value={form.call_transferred ?? 0}
                        onChange={e => setForm({ ...form, call_transferred: Number(e.target.value) })}
                      >
                        <option value="0">No (Direct AI Call)</option>
                        <option value="1">Yes (Transferred to Senior)</option>
                      </select>
                    </div>
                    <div>
                      <label>Redirected / Transferred Number</label>
                      <input
                        placeholder="e.g. +91XXXXXXXXXX"
                        value={form.transferred_to_number || ''}
                        onChange={e => setForm({ ...form, transferred_to_number: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Senior Team Meeting Scheduled Section */}
                <div style={{
                  background: '#f8fafd',
                  border: '1px solid #dbeafe',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--navy)', fontSize: 13 }}>
                    <Calendar size={14} style={{ color: '#2563eb' }} /> Scheduled Meeting &amp; Follow-up Details
                  </div>

                  <div>
                    <label>Senior Team Meeting Agreed / Scheduled?</label>
                    <select
                      value={form.it_head_call_agreed ?? ''}
                      onChange={e => setForm({ ...form, it_head_call_agreed: e.target.value })}
                    >
                      <option value="">Unknown / Not Discussed</option>
                      <option value="1">Yes (Meeting Scheduled)</option>
                      <option value="0">No (Declined Meeting)</option>
                    </select>
                  </div>

                  {/* Meeting Attendee Info */}
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div>
                      <label>Meeting Attendee Name</label>
                      <input
                        placeholder="e.g. Sharma ji"
                        value={form.it_head_name}
                        onChange={e => setForm({ ...form, it_head_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Attendee Contact Phone</label>
                      <input
                        placeholder="e.g. 98XXXXXXXX"
                        value={form.it_head_phone}
                        onChange={e => setForm({ ...form, it_head_phone: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Scheduled Date & Time */}
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div>
                      <label>Scheduled Meeting Date</label>
                      <input
                        type="date"
                        value={form.it_head_call_date}
                        onChange={e => setForm({ ...form, it_head_call_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label>Scheduled Meeting Time</label>
                      <input
                        type="time"
                        value={form.it_head_call_time}
                        onChange={e => setForm({ ...form, it_head_call_time: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Verbatim Time Spoken */}
                  {c.it_head_call_raw && (
                    <div style={{ background: '#ffffff', padding: 10, borderRadius: 6, border: '1px solid #bfdbfe', fontSize: 12 }}>
                      <span className="muted">Prospect mentioned during call:</span>
                      <div style={{ fontStyle: 'italic', fontWeight: 600, color: 'var(--navy)', marginTop: 4 }}>
                        “{c.it_head_call_raw}”
                      </div>
                    </div>
                  )}
                </div>

                {/* Recommended Next Action */}
                <div>
                  <label>Recommended Next Action</label>
                  <input
                    placeholder="e.g. Follow up on Friday for senior team meeting..."
                    value={form.next_action || ''}
                    onChange={e => setForm({ ...form, next_action: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="submit" className="btn primary">
                    Save Changes / Correction
                  </button>
                </div>
              </div>
            </form>
          </div>

        </div>
      </div>

      {/* Full Width Bottom Section 1: AI Extracted Fields & Survey Data */}
      <div className="panel" style={{ width: '100%' }}>
        <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--line)', paddingBottom: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="section-title" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} style={{ color: 'var(--navy)' }} /> AI EXTRACTIONS &amp; SURVEY DATA
            </div>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              background: '#e0e7ff',
              color: '#3730a3',
              padding: '2px 8px',
              borderRadius: 99,
            }}>
              {answers.length} total fields
            </span>
            {answeredCount > 0 && (
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                background: '#dcfce7',
                color: '#15803d',
                padding: '2px 8px',
                borderRadius: 99,
              }}>
                {answeredCount} answered
              </span>
            )}
            {unansweredCount > 0 && (
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                background: '#f1f5f9',
                color: '#64748b',
                padding: '2px 8px',
                borderRadius: 99,
              }}>
                {unansweredCount} not mentioned
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search extracted fields..."
                value={extSearch}
                onChange={e => setExtSearch(e.target.value)}
                style={{
                  paddingLeft: 30,
                  paddingRight: 10,
                  paddingTop: 5,
                  paddingBottom: 5,
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                  width: '100%',
                }}
              />
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 8, padding: 2, border: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => setExtFilter('all')}
                style={{
                  border: 'none',
                  background: extFilter === 'all' ? '#ffffff' : 'transparent',
                  color: extFilter === 'all' ? 'var(--navy)' : '#64748b',
                  fontWeight: extFilter === 'all' ? 700 : 500,
                  fontSize: 12,
                  padding: '5px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: extFilter === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                All ({answers.length})
              </button>
              <button
                type="button"
                onClick={() => setExtFilter('answered')}
                style={{
                  border: 'none',
                  background: extFilter === 'answered' ? '#ffffff' : 'transparent',
                  color: extFilter === 'answered' ? '#15803d' : '#64748b',
                  fontWeight: extFilter === 'answered' ? 700 : 500,
                  fontSize: 12,
                  padding: '5px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: extFilter === 'answered' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Answered ({answeredCount})
              </button>
              <button
                type="button"
                onClick={() => setExtFilter('unanswered')}
                style={{
                  border: 'none',
                  background: extFilter === 'unanswered' ? '#ffffff' : 'transparent',
                  color: extFilter === 'unanswered' ? '#b45309' : '#64748b',
                  fontWeight: extFilter === 'unanswered' ? 700 : 500,
                  fontSize: 12,
                  padding: '5px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  boxShadow: extFilter === 'unanswered' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Not Mentioned ({unansweredCount})
              </button>
            </div>

            {/* View Mode Toggle */}
            <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 8, padding: 2, border: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => setExtView('grid')}
                title="Horizontal Cards Grid"
                style={{
                  border: 'none',
                  background: extView === 'grid' ? '#ffffff' : 'transparent',
                  color: extView === 'grid' ? 'var(--navy)' : '#64748b',
                  padding: '5px 9px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  boxShadow: extView === 'grid' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setExtView('table')}
                title="Full-width Table View"
                style={{
                  border: 'none',
                  background: extView === 'table' ? '#ffffff' : 'transparent',
                  color: extView === 'table' ? 'var(--navy)' : '#64748b',
                  padding: '5px 9px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  boxShadow: extView === 'table' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {filteredAnswers.length === 0 ? (
          <p className="muted" style={{ padding: '24px 0', textAlign: 'center', margin: 0 }}>
            {answers.length === 0 
              ? (turns.length > 0 ? 'No specific survey keys extracted for this call.' : 'Extracted answers will appear here once the call is completed.')
              : 'No extraction fields match your search or filter criteria.'}
          </p>
        ) : extView === 'grid' ? (
          /* Horizontal Multi-Column Cards Grid */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: 14,
          }}>
            {filteredAnswers.map(a => {
              const isLong = (a.response_value || '').length > 150
              return (
                <div
                  key={a.id}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 8,
                    gridColumn: isLong ? '1 / -1' : 'span 1',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                          {a.label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                            {a.category} · {a.subcategory}
                          </span>
                          <span className="muted" style={{ fontSize: 10, fontFamily: 'monospace' }}>({a.question_key})</span>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 99,
                          background: a.isAnswered ? '#ecfdf5' : '#f1f5f9',
                          color: a.isAnswered ? '#15803d' : '#64748b',
                          border: a.isAnswered ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                          flexShrink: 0,
                        }}
                      >
                        {Math.round((a.confidence_score || 0) * 100)}%
                      </span>
                    </div>
                    {a.description && (
                      <div className="muted sm" style={{ fontSize: 11, marginBottom: 6 }}>{a.description}</div>
                    )}
                  </div>

                  <div style={{
                    padding: '8px 12px',
                    background: '#f8fafc',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: a.isAnswered ? '#0f172a' : '#64748b',
                    fontStyle: a.isAnswered ? 'normal' : 'italic',
                    fontWeight: a.isAnswered ? 500 : 400,
                    wordBreak: 'break-word',
                  }}>
                    {a.response_value || '—'}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Full Width Table View */
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Field / Key</th>
                  <th style={{ width: '14%' }}>Category</th>
                  <th style={{ width: '46%' }}>Extracted Value</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {filteredAnswers.map(a => (
                  <tr key={a.id} style={{ background: 'transparent' }}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 13 }}>
                        {a.label}
                      </div>
                      <div className="muted" style={{ fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
                        {a.question_key}
                      </div>
                      {a.description && (
                        <div className="muted sm" style={{ fontSize: 11, marginTop: 2 }}>{a.description}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                        {a.category} · {a.subcategory}
                      </span>
                    </td>
                    <td>
                      <div style={{
                        fontWeight: a.isAnswered ? 600 : 400,
                        color: a.isAnswered ? '#0f172a' : '#64748b',
                        fontStyle: a.isAnswered ? 'normal' : 'italic',
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}>
                        {a.response_value || '—'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 99,
                          background: a.isAnswered ? '#ecfdf5' : '#f1f5f9',
                          color: a.isAnswered ? '#15803d' : '#64748b',
                          border: a.isAnswered ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                        }}
                      >
                        {Math.round((a.confidence_score || 0) * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Full Width Bottom Section 2: Complete Raw Pipeline Extraction & Bolna Telemetry */}
      <div className="panel" style={{ width: '100%' }}>
        <button
          type="button"
          onClick={() => setShowRawJson(!showRawJson)}
          style={{
            background: 'transparent',
            border: 'none',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            padding: '4px 0',
            color: 'var(--navy)',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Code size={15} /> Raw Bolna &amp; AI Pipeline Telemetry
          </span>
          {showRawJson ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showRawJson && (
          <div style={{ marginTop: 14 }}>
            <div style={{ marginBottom: 10, fontSize: 12, color: '#64748b' }}>
              Below is the complete payload data received and processed for this call:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12, fontSize: 12 }}>
              <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <span className="muted">Bolna Execution ID:</span>
                <div style={{ fontWeight: 600, fontFamily: 'monospace', wordBreak: 'break-all' }}>{c.bolna_execution_id || '—'}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <span className="muted">Agent ID:</span>
                <div style={{ fontWeight: 600, fontFamily: 'monospace', wordBreak: 'break-all' }}>{c.bolna_agent_id || '—'}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <span className="muted">Call Start:</span>
                <div style={{ fontWeight: 600 }}>{c.started_at ? new Date(c.started_at).toLocaleString('en-IN') : '—'}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <span className="muted">Call End:</span>
                <div style={{ fontWeight: 600 }}>{c.end_time ? new Date(c.end_time).toLocaleString('en-IN') : '—'}</div>
              </div>
            </div>

            <pre style={{
              background: '#0f172a',
              color: '#38bdf8',
              padding: 14,
              borderRadius: 8,
              fontSize: 12,
              maxHeight: 280,
              overflowY: 'auto',
              lineHeight: 1.5,
            }}>
              {JSON.stringify({
                call_summary: {
                  id: c.id,
                  status: c.call_status,
                  duration_sec: c.duration_sec,
                  who_answered: c.who_answered,
                  interest_status: c.interest_status,
                  interest_reason: c.interest_reason,
                  call_transferred: c.call_transferred,
                  transferred_to_number: c.transferred_to_number,
                  senior_meeting_agreed: c.it_head_call_agreed,
                  meeting_attendee_name: c.it_head_name,
                  attendee_phone: c.it_head_phone,
                  meeting_date: c.it_head_call_date,
                  meeting_time: c.it_head_call_time,
                  dialect_detected: c.dialect_detected,
                  next_action: c.next_action,
                },
                analysis_pipeline: analysis,
                extractions: answers,
              }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
