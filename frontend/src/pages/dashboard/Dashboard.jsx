import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Sparkles, Radio, PhoneCall, Plus, Bot } from 'lucide-react'
import { api } from '../../api'
import { fmtDate, fmtTime, StatusBadge, fmtDur } from '../../components/ui.jsx'
import MetricCards from '../../components/MetricCards.jsx'

const INTEREST_LABELS = [
  { key: 'interested', label: 'Interested', color: '#16a34a' },
  { key: 'maybe', label: 'Maybe / Undecided', color: '#d97706' },
  { key: 'callback_requested', label: 'Callback Requested', color: '#2563eb' },
  { key: 'not_interested', label: 'Not Interested', color: '#dc2626' },
  { key: 'not_reachable', label: 'Not Reachable', color: '#94a3b8' },
]

export default function Dashboard() {
  const [s, setS] = useState(null)
  const [m, setM] = useState([])
  const [recentCalls, setRecentCalls] = useState([])

  useEffect(() => {
    api.stats().then(setS).catch(() => {})
    api.meetings().then(r => setM(r.data.slice(0, 6))).catch(() => {})
    api.calls({ limit: 5 }).then(r => setRecentCalls(r.data?.slice(0, 5) || [])).catch(() => {})
  }, [])

  return (
    <>
      {/* Top Metric Summary Boxes */}
      <MetricCards stats={s} />

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {[
          { to: '/live-call', label: 'Start AI Call', icon: PhoneCall, color: '#f26522' },
          { to: '/numbers/add', label: 'Add Numbers', icon: Plus, color: '#103778' },
          { to: '/agents', label: 'AI Agents', icon: Bot, color: '#7c3aed' },
          { to: '/meetings', label: 'Meetings', icon: CalendarClock, color: '#0284c7' },
        ].map(({ to, label, icon: Icon, color }) => (
          <Link key={to} to={to} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 700, color: '#334155', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Icon size={15} style={{ color }} />{label}
          </Link>
        ))}
      </div>

      {/* 2-col grid: Recent Calls + Interest Outcomes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        {/* Recent Calls */}
        <div className="table-card" style={{ marginTop: 0 }}>
          <div className="table-navy-header">
            <div className="title-group">
              <Radio size={17} />
              <span className="title-text">Recent Calls</span>
            </div>
            <Link to="/live-call" className="header-btn"><span>View All</span></Link>
          </div>
          <table className="tbl">
            <thead><tr><th>Prospect</th><th>Status</th><th>Duration</th><th>Agent</th></tr></thead>
            <tbody>
              {recentCalls.map(c => (
                <tr key={c.id}>
                  <td><div style={{fontWeight:700}}>{c.contact_name}</div><div className="muted sm">{c.phone}</div></td>
                  <td><StatusBadge v={c.call_status} /></td>
                  <td>{fmtDur(c.duration_sec)}</td>
                  <td style={{fontSize:'11px',color:'#64748b'}}>{c.agent_name || '—'}</td>
                </tr>
              ))}
              {recentCalls.length === 0 && <tr><td colSpan={4} className="empty">No calls yet.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Interest Outcomes */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
          <div className="table-navy-header">
            <div className="title-group">
              <Sparkles size={17} />
              <span className="title-text">Interest Outcomes</span>
            </div>
          </div>
          <div style={{ padding: '16px' }}>
            {INTEREST_LABELS.map(({ key, label, color }) => {
              const val = s?.interest?.[key] || 0
              const total = Object.values(s?.interest || {}).reduce((a,b) => a+b, 0) || 1
              const pct = Math.round(val * 100 / total)
              return (
                <div key={key} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                    <span>{label}</span><span>{val} ({pct}%)</span>
                  </div>
                  <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '999px' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '999px', transition: 'width 0.5s' }} />
                  </div>
                </div>
              )
            })}
            {Object.keys(s?.interest || {}).length === 0 && <div style={{color:'#94a3b8',fontSize:'13px',textAlign:'center',padding:'20px 0'}}>No call outcomes yet.</div>}
          </div>
        </div>
      </div>

      <div className="table-card" style={{ marginTop: 20 }}>
        {/* Table Navy Header Bar */}
        <div className="table-navy-header">
          <div className="title-group">
            <CalendarClock size={17} className="text-gov-saffron" />
            <span className="title-text">Upcoming Scheduled Meetings</span>
            <span className="counter-pill">{m.length} Upcoming</span>
          </div>
          <Link to="/meetings" className="header-btn">
            <span>View All</span>
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Prospect</th>
                <th>Organization</th>
                <th>Meeting Attendee</th>
                <th>Date</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {m.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty">No meetings scheduled yet.</td>
                </tr>
              )}
              {m.map(r => (
                <tr key={r.call_id}>
                  <td>
                    {r.contact_name}
                    <div className="muted sm">{r.phone}</div>
                  </td>
                  <td>{r.organization || '—'}</td>
                  <td>
                    {r.it_head_name || '—'}
                    <div className="muted sm">{r.it_head_phone}</div>
                  </td>
                  <td>{fmtDate(r.it_head_call_date)}</td>
                  <td>{fmtTime(r.it_head_call_time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

