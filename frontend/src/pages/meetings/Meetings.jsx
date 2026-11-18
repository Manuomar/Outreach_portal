import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Eye,
  CalendarClock,
  Search,
  RotateCcw,
  CalendarCheck,
  Clock,
  CalendarX,
  AlertCircle,
} from 'lucide-react'
import { api } from '../../api'
import { fmtDate, fmtTime, Pagination } from '../../components/ui.jsx'
import SearchableSelect from '../../components/ui/SearchableSelect'

/* ─── Metric Stat Card ─── */
const MCard = ({ icon: Icon, iconColor, iconBg, value, label, sub, active, onClick }) => (
  <div
    onClick={onClick}
    style={{
      flex: '1 1 140px',
      minWidth: 130,
      background: active ? '#f8faff' : '#ffffff',
      border: active ? `2px solid ${iconColor}` : '1px solid #e2e8f0',
      borderRadius: 14,
      padding: '14px 16px',
      cursor: onClick ? 'pointer' : 'default',
      boxShadow: active ? `0 0 0 3px ${iconColor}22` : '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'all .18s',
    }}
    title={onClick ? `Filter by ${label}` : label}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
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

export default function Meetings() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  // Filters
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('upcoming')

  useEffect(() => {
    api.meetings()
      .then(r => setRows(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const todayStr = new Date().toISOString().split('T')[0]

  // Derived statistics for Top Metric Cards
  const stats = useMemo(() => {
    const total = rows.length
    const today = rows.filter(r => r.it_head_call_date === todayStr).length
    const upcoming = rows.filter(r => r.it_head_call_date && r.it_head_call_date >= todayStr).length
    const past = rows.filter(r => r.it_head_call_date && r.it_head_call_date < todayStr).length
    const noDate = rows.filter(r => !r.it_head_call_date).length
    return { total, today, upcoming, past, noDate }
  }, [rows, todayStr])

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase()
        const ok = [
          r.contact_name,
          r.phone,
          r.organization,
          r.it_head_name,
          r.it_head_phone,
          r.it_head_call_raw,
        ].some(v => (v || '').toLowerCase().includes(q))
        if (!ok) return false
      }

      // Date Filter
      if (dateFilter !== 'all') {
        if (dateFilter === 'no_date') {
          if (r.it_head_call_date) return false
        } else if (!r.it_head_call_date) {
          return false
        } else {
          if (dateFilter === 'today' && r.it_head_call_date !== todayStr) return false
          if (dateFilter === 'upcoming' && r.it_head_call_date < todayStr) return false
          if (dateFilter === 'past' && r.it_head_call_date >= todayStr) return false
        }
      }

      return true
    })
  }, [rows, search, dateFilter, todayStr])

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * limit
    return filteredRows.slice(start, start + limit)
  }, [filteredRows, page, limit])

  const hasActiveFilters = search.trim() !== '' || dateFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setDateFilter('all')
    setPage(1)
  }

  const handleMetric = (key) => {
    setDateFilter(prev => (prev === key ? 'all' : key))
    setPage(1)
  }

  return (
    <>
      {/* ── Top Metric Summary Cards ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <MCard
          icon={CalendarClock}
          iconColor="#103778"
          iconBg="#eff6ff"
          value={stats.total}
          label="Total Scheduled"
          sub="All scheduled meetings"
          active={dateFilter === 'all'}
          onClick={() => handleMetric('all')}
        />
        <MCard
          icon={CalendarCheck}
          iconColor="#f59e0b"
          iconBg="#fef3c7"
          value={stats.today}
          label="Today's Meetings"
          sub="Scheduled for today"
          active={dateFilter === 'today'}
          onClick={() => handleMetric('today')}
        />
        <MCard
          icon={Clock}
          iconColor="#0369a1"
          iconBg="#dbeafe"
          value={stats.upcoming}
          label="Upcoming"
          sub="Future scheduled meetings"
          active={dateFilter === 'upcoming'}
          onClick={() => handleMetric('upcoming')}
        />
        <MCard
          icon={CalendarX}
          iconColor="#dc2626"
          iconBg="#fee2e2"
          value={stats.past}
          label="Past Dates"
          sub="Already passed"
          active={dateFilter === 'past'}
          onClick={() => handleMetric('past')}
        />
        <MCard
          icon={AlertCircle}
          iconColor="#64748b"
          iconBg="#f1f5f9"
          value={stats.noDate}
          label="Date Pending"
          sub="No date set yet"
          active={dateFilter === 'no_date'}
          onClick={() => handleMetric('no_date')}
        />
      </div>

      {/* ── Searchable Filter Toolbar ── */}
      <div
        className="filter-toolbar"
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '14px 16px',
          marginBottom: '18px',
        }}
      >
        <div
          className="filter-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            width: '100%',
          }}
        >
          {/* Search Box */}
          <div
            className="filter-search-box"
            style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '340px' }}
          >
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search prospect, phone, attendee, org..."
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                setPage(1)
              }}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                fontSize: '13px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                height: '38px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Date Filter (Icons removed from labels) */}
          <div style={{ minWidth: '190px' }}>
            <SearchableSelect
              options={[
                { value: 'all', label: 'All Scheduled' },
                { value: 'today', label: "Today's Schedule" },
                { value: 'upcoming', label: 'Upcoming Demos' },
                { value: 'past', label: 'Past / Completed Dates' },
                { value: 'no_date', label: 'Date Pending' },
              ]}
              value={dateFilter}
              onChange={val => {
                setDateFilter(val)
                setPage(1)
              }}
              placeholder="All Scheduled"
            />
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '38px',
                padding: '0 12px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '8px',
                background: '#fef2f2',
                color: '#b91c1c',
                border: '1px solid #fecaca',
                cursor: 'pointer',
              }}
              title="Reset all active filters"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}

          <div
            style={{
              marginLeft: 'auto',
              fontSize: '12px',
              fontWeight: 600,
              color: '#64748b',
            }}
          >
            Showing <span style={{ color: '#103778', fontWeight: 800 }}>{filteredRows.length}</span> of {rows.length} scheduled
          </div>
        </div>
      </div>

      {/* ── Table View Only ── */}
      <div className="table-card">
        {/* Table Navy Header Bar */}
        <div className="table-navy-header">
          <div className="title-group">
            <CalendarClock size={17} className="text-gov-saffron" />
            <span className="title-text">Scheduled Meetings &amp; Follow-ups</span>
            <span className="counter-pill">
              {filteredRows.length} {filteredRows.length === rows.length ? 'Scheduled' : `of ${rows.length} Scheduled`}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Prospect</th>
                <th>Organization</th>
                <th>Meeting Attendee</th>
                <th>Attendee Phone</th>
                <th>Statement</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9" className="empty">
                    Loading scheduled meetings...
                  </td>
                </tr>
              )}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan="9" className="empty">
                    {hasActiveFilters
                      ? 'No scheduled meetings matched your search criteria.'
                      : 'No meetings scheduled yet.'}
                  </td>
                </tr>
              )}
              {!loading &&
                paginatedRows.map(r => {
                  const isPast = r.it_head_call_date && r.it_head_call_date < todayStr
                  const isToday = r.it_head_call_date === todayStr

                  return (
                    <tr key={r.call_id}>
                      <td>
                        <div
                          style={{
                            fontWeight: 700,
                            color: isToday ? '#d97706' : isPast ? '#94a3b8' : '#1e293b',
                          }}
                        >
                          {r.it_head_call_date ? fmtDate(r.it_head_call_date) : <span style={{ color: '#cbd5e1' }}>TBD</span>}
                        </div>
                        {isToday && <div style={{ fontSize: '10px', color: '#d97706', fontWeight: 800 }}>TODAY</div>}
                        {isPast && <div style={{ fontSize: '10px', color: '#9f1239', fontWeight: 700 }}>PAST</div>}
                      </td>
                      <td style={{ fontWeight: 600, color: '#475569' }}>
                        {fmtTime(r.it_head_call_time)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.contact_name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{r.phone}</div>
                      </td>
                      <td>{r.organization || '—'}</td>
                      <td style={{ fontWeight: 600, color: '#1e293b' }}>
                        {r.it_head_name || '—'}
                      </td>
                      <td>{r.it_head_phone || '—'}</td>
                      <td style={{ fontSize: '11px', color: '#64748b', maxWidth: '240px' }}>
                        {r.it_head_call_raw || '—'}
                      </td>
                      <td>
                        {isToday ? (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#92400e',
                              background: '#fef3c7',
                              padding: '2px 8px',
                              borderRadius: '20px',
                            }}
                          >
                            Today
                          </span>
                        ) : isPast ? (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#9f1239',
                              background: '#ffe4e6',
                              padding: '2px 8px',
                              borderRadius: '20px',
                            }}
                          >
                            Past
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#0369a1',
                              background: '#dbeafe',
                              padding: '2px 8px',
                              borderRadius: '20px',
                            }}
                          >
                            Upcoming
                          </span>
                        )}
                      </td>
                      <td className="actions">
                        <Link
                          to={`/calls/${r.call_id}`}
                          className="icon-btn"
                          title="View Call Details"
                        >
                          <Eye size={15} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalPages={Math.ceil(filteredRows.length / limit) || 1}
          totalItems={filteredRows.length}
          perPage={limit}
          onPageChange={setPage}
          onPerPageChange={setLimit}
          itemLabel="scheduled calls"
        />
      </div>
    </>
  )
}
