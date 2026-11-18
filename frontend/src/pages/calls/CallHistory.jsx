import { Fragment, useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Eye, Phone, Search, RotateCcw, PhoneCall, PhoneOff, Clock,
  CheckCircle2, XCircle, PhoneMissed, History, TrendingUp,
  CalendarClock, Calendar, ChevronDown, Download, FileSpreadsheet,
  FileText, FileDown, X, RefreshCw, UserCheck, User, Users,
  AlertTriangle, MessageSquare, ShieldAlert, Sparkles, PhoneForwarded, Bot,
} from 'lucide-react'
import { api } from '../../api'
import { fmtDate, fmtTime, Pagination } from '../../components/ui.jsx'
import SearchableSelect from '../../components/ui/SearchableSelect'
import {
  exportCallsToExcel,
  exportCallsToPDF,
  exportSingleCallToExcel,
  exportSingleCallToPDF,
} from '../../utils/callExport'

/* ───────── helpers ───────── */
const fmt_dur = (s) => {
  if (!s || s <= 0) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

const CALL_STATUS_META = {
  completed:   { label: 'Completed',  color: '#15803d', bg: '#dcfce7' },
  in_progress: { label: 'In Progress',color: '#1d4ed8', bg: '#dbeafe' },
  ringing:     { label: 'Ringing',    color: '#d97706', bg: '#fef3c7' },
  queued:      { label: 'Queued',     color: '#7c3aed', bg: '#ede9fe' },
  failed:      { label: 'Failed',     color: '#dc2626', bg: '#fee2e2' },
  busy:        { label: 'Busy',       color: '#ea580c', bg: '#ffedd5' },
  no_answer:   { label: 'No Answer',  color: '#64748b', bg: '#f1f5f9' },
  incomplete:  { label: 'Incomplete', color: '#9f1239', bg: '#ffe4e6' },
}

const INTEREST_META = {
  hot:         { label: 'Hot 🔥',         color: '#b45309', bg: '#fef3c7' },
  warm:        { label: 'Warm',           color: '#0369a1', bg: '#e0f2fe' },
  interested:  { label: 'Interested',     color: '#15803d', bg: '#dcfce7' },
  not_interested: { label: 'Not Interested', color: '#dc2626', bg: '#fee2e2' },
  callback:    { label: 'Callback',       color: '#7c3aed', bg: '#ede9fe' },
  unknown:     { label: 'Unknown',        color: '#64748b', bg: '#f1f5f9' },
}

const WHO_ANSWERED_META = {
  principal:   { label: 'Principal',  color: '#15803d' },
  staff:       { label: 'Staff',      color: '#0369a1' },
  student:     { label: 'Student',    color: '#7c3aed' },
  it_head:     { label: 'IT Head',    color: '#d97706' },
  no_answer:   { label: 'No Answer',  color: '#64748b' },
  other:       { label: 'Other',      color: '#475569' },
}

const StatusPill = ({ val, meta }) => {
  const m = meta[val] || { label: val || '—', color: '#64748b' }
  return (
    <span style={{
      fontSize: '13px', fontWeight: 600, color: m.color || '#475569',
    }}>{m.label}</span>
  )
}

const WhoAnsweredBadge = ({ who, answers }) => {
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

  return <span style={{ color: '#cbd5e1', fontSize: '13px' }}>—</span>
}

/* ───────── Metric Card ───────── */
const MCard = ({ icon: Icon, iconColor, iconBg, value, label, sub, active, onClick }) => (
  <div
    onClick={onClick}
    style={{
      flex: '1 1 150px', minWidth: 130, background: '#fff',
      border: active ? `2px solid ${iconColor}` : '1px solid #e2e8f0',
      borderRadius: '14px', padding: '14px 16px', cursor: onClick ? 'pointer' : 'default',
      boxShadow: active ? `0 0 0 3px ${iconColor}22` : '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'all .18s',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={iconColor} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{sub}</div>}
      </div>
    </div>
  </div>
)

/* ───────── CALL HISTORY PAGE ───────── */
export default function CallHistory() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(15)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [interestFilter, setInterestFilter] = useState('')
  const [demoFilter, setDemoFilter] = useState('')
  const [whoFilter, setWhoFilter] = useState('')
  const [expandedCallId, setExpandedCallId] = useState(null)
  // Metric card selected filter
  const [metricSel, setMetricSel] = useState('')

  // Extractions & Export State
  const [extractionFields, setExtractionFields] = useState([])
  const [exportModalCall, setExportModalCall] = useState(null)
  const [exportModalLoading, setExportModalLoading] = useState(false)
  const [exportModalDetails, setExportModalDetails] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (interestFilter) params.interest = interestFilter
    api.calls(params)
      .then(r => {
        setRows(r.data || [])
        if (r.extraction_fields) setExtractionFields(r.extraction_fields)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [interestFilter])

  useEffect(() => { load() }, [load])

  // Export handlers
  const handleExportTableExcel = () => {
    exportCallsToExcel(filteredRows, extractionFields, 'Call_History_Log')
  }

  const handleExportTablePDF = () => {
    exportCallsToPDF(filteredRows, extractionFields, 'Outreach Portal — Call History Report')
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

  const downloadTranscriptQuick = (callItem) => {
    const fullCall = exportModalDetails?.call || callItem
    const turns = exportModalDetails?.turns || []
    let text = `==================================================\n`
    text += `CALL TRANSCRIPT — #${fullCall.id} (${fullCall.contact_name || 'Prospect'})\n`
    text += `Phone: ${fullCall.phone} | Date: ${fullCall.created_at}\n`
    text += `==================================================\n\n`
    if (turns.length > 0) {
      turns.forEach(t => {
        const spk = t.speaker === 'agent' ? 'Ajay (AI Voice Agent)' : (fullCall.contact_name || 'Prospect')
        text += `${spk}:\n${t.text}\n\n`
      })
    } else if (fullCall.transcript) {
      text += fullCall.transcript + `\n\n`
    } else {
      text += `(No transcript available)\n`
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Transcript_Call_${fullCall.id}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Derived stats
  const stats = useMemo(() => {
    const total = rows.length
    const completed = rows.filter(r => r.call_status === 'completed' && Number(r.duration_sec) > 10).length
    const failed = rows.filter(r => ['failed', 'busy', 'no_answer', 'incomplete'].includes(r.call_status)).length
    const demo = rows.filter(r => Number(r.it_head_call_agreed) === 1).length
    const rate = total ? Math.round(completed * 100 / total) : 0
    return { total, completed, failed, demo, rate }
  }, [rows])

  // Filtered rows
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (q) {
        const match = [r.contact_name, r.phone, r.organization, r.designation, r.agent_name]
          .some(v => (v || '').toLowerCase().includes(q))
        if (!match) return false
      }
      if (statusFilter && r.call_status !== statusFilter) return false
      if (interestFilter && r.interest_status !== interestFilter) return false
      if (demoFilter === 'yes' && Number(r.it_head_call_agreed) !== 1) return false
      if (demoFilter === 'no' && Number(r.it_head_call_agreed) === 1) return false
      if (whoFilter) {
        if (whoFilter === 'wrong_person') {
          const ansMap = {}
          if (Array.isArray(r.answers)) {
            r.answers.forEach(a => { if (a.question_key) ansMap[a.question_key.toLowerCase().trim()] = a.response_value })
          }
          const isWrong = ansMap['is_wrong_number'] === 'Yes' || r.who_answered === 'wrong_person' || r.who_answered === 'wrong_number'
          if (!isWrong) return false
        } else if (whoFilter === 'target_official') {
          const w = (r.who_answered || '').toLowerCase()
          if (w !== 'target_official' && w !== 'self') return false
        } else if (whoFilter === 'pa_assistant') {
          const w = (r.who_answered || '').toLowerCase()
          if (!w.includes('pa') && !w.includes('assistant') && !w.includes('gatekeeper')) return false
        } else {
          if (r.who_answered !== whoFilter) return false
        }
      }

      // Metric card quick filter
      if (metricSel === 'completed' && !(r.call_status === 'completed' && Number(r.duration_sec) > 10)) return false
      if (metricSel === 'failed' && !['failed', 'busy', 'no_answer', 'incomplete'].includes(r.call_status)) return false
      if (metricSel === 'demo' && Number(r.it_head_call_agreed) !== 1) return false

      return true
    })
  }, [rows, search, statusFilter, interestFilter, demoFilter, whoFilter, metricSel])

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * limit
    return filteredRows.slice(start, start + limit)
  }, [filteredRows, page, limit])

  const hasActiveFilters = search || statusFilter || interestFilter || demoFilter || whoFilter || metricSel

  const clearFilters = () => {
    setSearch(''); setStatusFilter(''); setInterestFilter('')
    setDemoFilter(''); setWhoFilter(''); setMetricSel(''); setExpandedCallId(null); setPage(1)
  }

  const handleMetric = (key) => {
    setMetricSel(prev => prev === key ? '' : key)
    setPage(1)
  }

  return (
    <>
      {/* ── Metric Cards ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <MCard
          icon={PhoneCall} iconColor="#15803d" iconBg="#dcfce7"
          value={stats.total} label="Total Calls" sub={`All time calls`}
          active={!metricSel}
          onClick={() => handleMetric('')}
        />
        <MCard
          icon={CheckCircle2} iconColor="#0369a1" iconBg="#dbeafe"
          value={stats.completed} label="Completed" sub={`${stats.rate}% connect rate`}
          active={metricSel === 'completed'}
          onClick={() => handleMetric('completed')}
        />
        <MCard
          icon={PhoneOff} iconColor="#dc2626" iconBg="#fee2e2"
          value={stats.failed} label="Failed / Missed" sub="Busy, no answer, failed"
          active={metricSel === 'failed'}
          onClick={() => handleMetric('failed')}
        />
        <MCard
          icon={CalendarClock} iconColor="#7c3aed" iconBg="#ede9fe"
          value={stats.demo} label="Meetings Agreed" sub="Senior meetings scheduled"
          active={metricSel === 'demo'}
          onClick={() => handleMetric('demo')}
        />
        <MCard
          icon={TrendingUp} iconColor="#d97706" iconBg="#fef3c7"
          value={`${stats.rate}%`} label="Connect Rate" sub="Completed vs total"
          active={false}
        />
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              type="text" placeholder="Search prospect, phone, org, agent..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: 13, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', height: 38, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Call Status */}
          <div style={{ minWidth: 160 }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'completed', label: '✅ Completed' },
                { value: 'failed', label: '❌ Failed' },
                { value: 'busy', label: '📵 Busy' },
                { value: 'no_answer', label: '📴 No Answer' },
                { value: 'incomplete', label: '⚠️ Incomplete' },
                { value: 'ringing', label: '🔔 Ringing' },
                { value: 'in_progress', label: '🔴 In Progress' },
              ]}
              value={statusFilter}
              onChange={v => { setStatusFilter(v); setPage(1) }}
              placeholder="All Statuses"
            />
          </div>

          {/* Interest */}
          <div style={{ minWidth: 160 }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All Interest' },
                { value: 'hot', label: '🔥 Hot' },
                { value: 'warm', label: '🌤 Warm' },
                { value: 'interested', label: '✅ Interested' },
                { value: 'not_interested', label: '❌ Not Interested' },
                { value: 'callback', label: '🔁 Callback' },
                { value: 'unknown', label: '❓ Unknown' },
              ]}
              value={interestFilter}
              onChange={v => { setInterestFilter(v); setPage(1) }}
              placeholder="All Interest"
            />
          </div>

          {/* Meeting */}
          <div style={{ minWidth: 145 }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All Meetings' },
                { value: 'yes', label: '✅ Meeting Agreed' },
                { value: 'no', label: '⬜ No Meeting' },
              ]}
              value={demoFilter}
              onChange={v => { setDemoFilter(v); setPage(1) }}
              placeholder="All Meetings"
            />
          </div>

          {/* Who Answered */}
          <div style={{ minWidth: 165 }}>
            <SearchableSelect
              options={[
                { value: '', label: 'All Callers' },
                { value: 'wrong_person', label: '🔴 Wrong Person / Number' },
                { value: 'target_official', label: '🟢 Target Official' },
                { value: 'pa_assistant', label: '🟡 PA / Assistant' },
                { value: 'relative', label: '🟣 Relative' },
                { value: 'principal', label: '👤 Principal' },
                { value: 'staff', label: '👥 Staff' },
                { value: 'it_head', label: '💻 IT Head' },
                { value: 'no_answer', label: '📴 No Answer' },
                { value: 'other', label: '❔ Other' },
              ]}
              value={whoFilter}
              onChange={v => { setWhoFilter(v); setPage(1) }}
              placeholder="Who Answered"
            />
          </div>

          {/* Reset */}
          {hasActiveFilters && (
            <button
              type="button" onClick={clearFilters}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', cursor: 'pointer' }}
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
            Found <span style={{ color: '#103778', fontWeight: 800 }}>{filteredRows.length}</span> of {rows.length} calls
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="table-card">
        <div className="table-navy-header">
          <div className="title-group">
            <History size={17} className="text-gov-saffron" />
            <span className="title-text">Call History Log</span>
            <span className="counter-pill">{filteredRows.length} Calls</span>
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

            <button
              type="button"
              className="header-btn"
              onClick={load}
              style={{
                background: 'rgba(255,255,255,0.15)',
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
              <RefreshCw size={12} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Loading calls…</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Prospect</th>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>Who Answered</th>
                  <th>Interest &amp; Reason</th>
                  <th>Outcome / Next Step</th>
                  <th>Duration</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr><td colSpan="10" className="empty">
                    {hasActiveFilters ? 'No calls matched your filters.' : 'No call records found yet.'}
                  </td></tr>
                )}
                {paginatedRows.map(r => {
                  const isExpanded = expandedCallId === r.id
                  const ansMap = {}
                  if (Array.isArray(r.answers)) {
                    r.answers.forEach(a => {
                      if (a.question_key) ansMap[a.question_key.toLowerCase().trim()] = a.response_value
                    })
                  }

                  const effectiveReason = r.interest_reason || ansMap['not_interested_reason'] || ansMap['interest_reason']
                  const isWrong = ansMap['is_wrong_number'] === 'Yes' || r.who_answered === 'wrong_person' || r.who_answered === 'wrong_number'
                  const hasFraudDoubt = ansMap['fraud_suspicion'] === 'Yes' || ansMap['trust_sentiment'] === 'Suspected Fraud' || ansMap['trust_sentiment'] === 'Skeptical'
                  const isCallback = r.interest_status === 'callback_requested' || ansMap['callback_requested'] === 'Yes' || ansMap['callback_time']
                  const callbackTime = ansMap['callback_time']

                  return (
                    <Fragment key={r.id}>
                      <tr style={{ background: isExpanded ? '#f1f5f9' : 'transparent', transition: 'background 0.15s ease' }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#0f172a', fontWeight: 800, fontSize: 12 }}>#{r.id}</span>
                            {r.summary && (
                              <button
                                type="button"
                                onClick={() => setExpandedCallId(isExpanded ? null : r.id)}
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
                          {r.agent_name && (
                            <div style={{ fontSize: '11px', color: '#103778', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                              <Bot size={11} style={{ color: '#f26522' }} /> {r.agent_name.split(' ')[0]}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{r.contact_name || '—'}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{r.phone}</div>
                          {r.designation && <div style={{ fontSize: '10.5px', color: '#64748b' }}>{r.designation}</div>}
                        </td>
                        <td style={{ fontSize: 12, color: '#475569' }}>{r.organization || '—'}</td>
                        <td>
                          <StatusPill val={r.call_status} meta={CALL_STATUS_META} />
                        </td>
                        <td>
                          <WhoAnsweredBadge who={r.who_answered} answers={r.answers} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                            {r.interest_status ? (
                              <StatusPill val={r.interest_status} meta={INTEREST_META} />
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: 13 }}>—</span>
                            )}
                            {effectiveReason && (
                              <div
                                title={effectiveReason}
                                style={{
                                  fontSize: '11px',
                                  color: '#64748b',
                                  fontStyle: 'italic',
                                  lineHeight: '1.3',
                                  maxWidth: '200px',
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
                            {Number(r.it_head_call_agreed) === 1 ? (
                              <div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '13px', fontWeight: 600, color: '#15803d' }}>
                                  <CheckCircle2 size={13} /> Meeting Agreed
                                </div>
                                {(r.it_head_call_date || r.it_head_call_raw) && (
                                  <div style={{ fontSize: '10.5px', color: '#15803d', fontWeight: 500, marginTop: '1px' }}>
                                    📅 {r.it_head_call_date ? fmtDate(r.it_head_call_date) : r.it_head_call_raw}
                                    {r.it_head_call_time && ` ${fmtTime(r.it_head_call_time)}`}
                                  </div>
                                )}
                              </div>
                            ) : Number(r.it_head_call_agreed) === 0 ? (
                              <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>Meeting Declined</span>
                            ) : null}

                            {Number(r.call_transferred) === 1 && (
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

                            {r.next_action && r.next_action.trim() && (
                              <div
                                title={r.next_action}
                                style={{
                                  fontSize: '11px',
                                  color: '#64748b',
                                  maxWidth: '180px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                👉 {r.next_action}
                              </div>
                            )}

                            {!r.it_head_call_agreed && !r.call_transferred && !isCallback && !r.next_action && (
                              <span style={{ color: '#cbd5e1', fontSize: 13 }}>—</span>
                            )}
                          </div>
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{fmt_dur(r.duration_sec)}</td>
                        <td style={{ fontSize: 11, color: '#64748b' }}>
                          <div>{fmtDate(r.created_at?.split(' ')[0])}</div>
                          {r.created_at?.split(' ')[1] && (
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{fmtTime(r.created_at.split(' ')[1])}</div>
                          )}
                        </td>
                        <td className="actions">
                          <button
                            type="button"
                            className="icon-btn"
                            title={isExpanded ? 'Hide AI Summary & Details' : 'Preview AI Summary & Survey Answers'}
                            onClick={() => setExpandedCallId(isExpanded ? null : r.id)}
                            style={{ color: isExpanded ? '#f26522' : '#8b5cf6' }}
                          >
                            <Sparkles size={15} />
                          </button>
                          <Link to={`/calls/${r.id}`} className="icon-btn" title="View Call Details">
                            <Eye size={15} />
                          </Link>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Export Call Dossier (Excel / PDF / Transcript)"
                            onClick={() => handleOpenRowExport(r)}
                            style={{ color: '#0369a1' }}
                          >
                            <Download size={15} />
                          </button>
                        </td>
                      </tr>

                      {/* Inline Expandable Drawer for Instant Context */}
                      {isExpanded && (
                        <tr key={`expand-${r.id}`} style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                          <td colSpan="10" style={{ padding: '14px 20px' }}>
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
                                  {r.summary || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Summary will be generated once call conversation concludes.</span>}
                                </p>
                              </div>

                              {/* Extracted Survey Answers Grid */}
                              {Array.isArray(r.answers) && r.answers.length > 0 && (
                                <div>
                                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                                    Extracted Survey &amp; Qualification Answers ({r.answers.length}):
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {r.answers.map(ans => (
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
                                  {r.next_action && <span><strong>Recommended Next Action:</strong> {r.next_action}</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <button
                                    type="button"
                                    className="btn ghost sm"
                                    onClick={() => handleOpenRowExport(r)}
                                    style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <Download size={12} /> Export Dossier
                                  </button>
                                  <Link
                                    to={`/calls/${r.id}`}
                                    className="btn primary sm"
                                    style={{ fontSize: '11px', background: '#103778', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', color: '#fff', padding: '5px 10px', borderRadius: '6px' }}
                                  >
                                    <Eye size={12} /> View Full Dialogue &amp; Transcript →
                                  </Link>
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
          )}
        </div>

        <Pagination
          currentPage={page}
          totalPages={Math.ceil(filteredRows.length / limit) || 1}
          totalItems={filteredRows.length}
          perPage={limit}
          onPageChange={setPage}
          onPerPageChange={setLimit}
          itemLabel="calls"
        />
      </div>

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
                      downloadTranscriptQuick(exportModalCall)
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

