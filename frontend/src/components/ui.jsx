import { X } from 'lucide-react'

export const INTEREST = {
  interested: { label: 'Interested', cls: 'green' },
  maybe: { label: 'Maybe', cls: 'amber' },
  callback_requested: { label: 'Callback', cls: 'blue' },
  not_interested: { label: 'Not interested', cls: 'red' },
  not_reachable: { label: 'Not reachable', cls: 'gray' },
  unknown: { label: 'Unknown', cls: 'gray' },
}
export const CALL_STATUS = {
  queued: 'amber',
  ringing: 'amber',
  in_progress: 'blue',
  completed: 'green',
  busy: 'amber',
  no_answer: 'gray',
  failed: 'red',
  incomplete: 'red',
}

export const Badge = ({ cls = 'gray', children }) => <span className={'badge ' + cls}>{children}</span>

export const InterestBadge = ({ v, status }) => {
  const val = v || status
  if (!val) return <span className="muted sm">—</span>
  const item = INTEREST[val]
  return <Badge cls={item?.cls || 'gray'}>{item?.label || String(val).replace(/_/g, ' ')}</Badge>
}

export const StatusBadge = ({ v, status }) => {
  const val = v || status || 'queued'
  const cls = CALL_STATUS[val] || 'gray'
  const label = String(val).replace(/_/g, ' ')
  return <Badge cls={cls}>{label}</Badge>
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={'modal ' + (wide ? 'wide' : '')} onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—'
export const fmtTime = (t) => {
  if (!t) return '—'
  const [h, m] = t.split(':'); const hh = +h
  return `${((hh + 11) % 12) + 1}:${m} ${hh >= 12 ? 'PM' : 'AM'}`
}
export const fmtDur = (s) => s ? `${Math.floor(s / 60)}m ${s % 60}s` : '—'
export { default as Pagination } from './Pagination'
export { default as SearchableSelect } from './ui/SearchableSelect'
