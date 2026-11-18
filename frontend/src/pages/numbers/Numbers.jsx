import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus,
  Trash2,
  Pencil,
  Users,
  Search,
  RotateCcw,
  Ban,
  CheckCircle2,
} from 'lucide-react'
import { api } from '../../api'
import { Badge, Modal, Pagination } from '../../components/ui.jsx'
import SearchableSelect from '../../components/ui/SearchableSelect'
import MetricCards from '../../components/MetricCards.jsx'
import { INDIA_LOCATIONS, INDIAN_STATES } from '../../data/indiaLocations'

const LS = {
  new: 'gray',
  contacted: 'blue',
  interested: 'green',
  not_interested: 'red',
  callback: 'amber',
  meeting_scheduled: 'green',
}

const SECTORS = [
  'Government Department',
  'ITI / Polytechnic',
  'Skill Mission / UPSDM',
  'Directorate of Training',
  'BPO / Call Center',
  'CSR / Skill Foundation',
  'University / College',
  'Industry Partner / Recruiter',
  'Other',
]

const QUEUE_OPTIONS = [
  { value: '', label: 'All Dialing Queues' },
  { value: 'pending', label: 'Pending Queue (To Call / Retry)' },
  { value: 'completed', label: 'Completed Calls (>10s)' },
  { value: 'busy', label: 'Busy / Ringing' },
  { value: 'incomplete', label: 'Incomplete / Dropped' },
]

const ACTIVE_FILTER_OPTIONS = [
  { value: 'active', label: 'Active Only' },
  { value: 'disabled', label: 'Disabled Only' },
  { value: 'all', label: 'All (Active + Disabled)' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'All Lead Statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'interested', label: 'Interested' },
  { value: 'callback', label: 'Callback' },
  { value: 'meeting_scheduled', label: 'Meeting Scheduled' },
  { value: 'not_interested', label: 'Not Interested' },
]

const SECTOR_OPTIONS = [
  { value: '', label: 'All Sectors' },
  ...SECTORS.map(s => ({ value: s, label: s })),
]

const STATE_OPTIONS = [
  { value: '', label: 'All States' },
  ...INDIAN_STATES.map(s => ({ value: s, label: s })),
]

export default function Numbers() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [queue, setQueue] = useState('pending')
  const [sector, setSector] = useState('')
  const [state, setState] = useState('')
  const [district, setDistrict] = useState('')
  const [activeFilter, setActiveFilter] = useState('active') // 'active' (default) | 'disabled' | 'all'
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState('')
  const [limit, setLimit] = useState(10)

  const loadStats = useCallback(() => {
    api.stats().then(r => setStats(r)).catch(() => { })
  }, [])

  const load = useCallback(() => {
    api.leads({ q, status, queue, sector, state, district, active: activeFilter, page, limit })
      .then(r => {
        setRows(r.data || [])
        setTotal(r.total || 0)
      })
      .catch(e => setErr(e.message))
    loadStats()
  }, [q, status, queue, sector, state, district, activeFilter, page, limit, loadStats])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const del = async (r) => {
    if (confirm(`Are you sure you want to delete ${r.contact_name} (${r.phone})?`)) {
      await api.deleteLead(r.id)
      load()
    }
  }

  const handleToggleDisable = async (r, enable) => {
    try {
      if (enable) {
        await api.enableLead(r.id)
      } else {
        if (!confirm(`Are you sure you want to disable ${r.contact_name} (${r.phone})?`)) return
        await api.disableLead(r.id)
      }
      load()
    } catch (e) {
      alert('Error: ' + (e.message || 'Operation failed'))
    }
  }

  const save = async () => {
    await api.updateLead(edit.id, edit)
    setEdit(null)
    load()
  }

  const handleCardClick = (cardId) => {
    if (cardId === 'total_calls') {
      navigate('/call-history')
      return
    }
    setPage(1)
    if (cardId === 'all_leads') {
      setActiveFilter('all')
      setQueue('')
    } else if (cardId === 'pending_queue') {
      setQueue('pending')
      setActiveFilter('active')
    } else if (cardId === 'completed_numbers' || cardId === 'completed') {
      setQueue('completed')
      setActiveFilter('all')
    } else if (cardId === 'ban_leads' || cardId === 'disabled_leads') {
      setActiveFilter('disabled')
      setQueue('')
    }
  }

  const hasActiveFilters = Boolean(
    q.trim() || status || queue !== 'pending' || sector || state || district || activeFilter !== 'active'
  )

  const clearFilters = () => {
    setQ('')
    setStatus('')
    setQueue('pending')
    setSector('')
    setState('')
    setDistrict('')
    setActiveFilter('active')
    setPage(1)
  }

  // Determine available districts for the selected filter state
  const filterDistricts = state && INDIA_LOCATIONS[state] ? INDIA_LOCATIONS[state] : []
  // Available districts for edit modal
  const editDistricts = edit?.state && INDIA_LOCATIONS[edit.state] ? INDIA_LOCATIONS[edit.state] : ['Other / Unspecified']

  return (
    <>
      {/* Top Metric Summary Boxes in Requested Order */}
      <MetricCards
        stats={stats}
        showActiveDisabled={true}
        activeFilter={
          queue === 'pending'
            ? 'pending_queue'
            : (queue === 'completed'
              ? 'completed_numbers'
              : (activeFilter === 'disabled'
                ? 'ban_leads'
                : (activeFilter === 'all' && !queue
                  ? 'all_leads'
                  : 'pending_queue')))
        }
        onCardClick={handleCardClick}
      />

      {/* Searchable Filter Toolbar (Horizontal Layout) */}
      <div className="filter-toolbar" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Top Row: Search + Queue + Active/Disabled + Status + Sector */}
          <div className="filter-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', width: '100%' }}>
            {/* Search Input with Lucide Search icon */}
            <div className="filter-search-box" style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '340px' }}>
              <Search size={16} className="filter-search-icon" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search name, phone, org, district…"
                value={q}
                onChange={e => { setQ(e.target.value); setPage(1) }}
                className="filter-search-input"
                style={{ width: '100%', padding: '8px 12px 8px 36px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', height: '38px', outline: 'none' }}
              />
            </div>

            {/* Calling Queue Filter   */}
            <div style={{ minWidth: '180px', flex: '0 1 auto' }}>
              <SearchableSelect
                options={QUEUE_OPTIONS}
                value={queue}
                onChange={val => { setQueue(val); setPage(1) }}
                placeholder="All Dialing Queues"
                searchPlaceholder="Search queue…"
              />
            </div>

            {/* Active / Disabled Status Filter */}
            <div style={{ minWidth: '160px', flex: '0 1 auto' }}>
              <SearchableSelect
                options={ACTIVE_FILTER_OPTIONS}
                value={activeFilter}
                onChange={val => { setActiveFilter(val); setPage(1) }}
                placeholder="Active / Disabled"
                searchPlaceholder="Search active status…"
              />
            </div>

            {/* Lead Status Filter   */}
            <div style={{ minWidth: '160px', flex: '0 1 auto' }}>
              <SearchableSelect
                options={STATUS_OPTIONS}
                value={status}
                onChange={val => { setStatus(val); setPage(1) }}
                placeholder="All Lead Statuses"
                searchPlaceholder="Search status…"
              />
            </div>

            {/* Sector Filter   */}
            <div style={{ minWidth: '170px', flex: '0 1 auto' }}>
              <SearchableSelect
                options={SECTOR_OPTIONS}
                value={sector}
                onChange={val => { setSector(val); setPage(1) }}
                placeholder="All Sectors"
                searchPlaceholder="Search sector…"
              />
            </div>
          </div>

          {/* Bottom Row: State + District + Reset Button + Counter */}
          <div className="filter-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', width: '100%' }}>
            {/* State Filter   */}
            <div style={{ minWidth: '170px', flex: '0 1 auto' }}>
              <SearchableSelect
                options={STATE_OPTIONS}
                value={state}
                onChange={val => { setState(val); setDistrict(''); setPage(1) }}
                placeholder="All States"
                searchPlaceholder="Search state…"
              />
            </div>

            {/* Dynamic District Filter   */}
            <div style={{ minWidth: '170px', flex: '0 1 auto' }}>
              <SearchableSelect
                options={[
                  { value: '', label: state ? 'All Districts' : 'Select State first' },
                  ...filterDistricts.map(d => ({ value: d, label: d }))
                ]}
                disabled={!state}
                value={district}
                onChange={val => { setDistrict(val); setPage(1) }}
                placeholder={state ? 'All Districts' : 'Select State first'}
                searchPlaceholder="Search district…"
              />
            </div>

            {/* Reset Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="filter-reset-btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 12px', fontSize: '12px', fontWeight: 700, borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', cursor: 'pointer' }}
                title="Reset all active filters"
              >
                <RotateCcw size={13} />
                <span>Reset Filters</span>
              </button>
            )}

            <div className="filter-count-badge" style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
              Found <span style={{ color: '#103778', fontWeight: 800 }}>{total}</span> contacts
            </div>
          </div>
        </div>
      </div>

      {err && <div className="alert err mb-4">{err}</div>}

      {/* Table Card */}
      <div className="table-card">
        {/* Table Navy Header Bar */}
        <div className="table-navy-header">
          <div className="title-group">
            <Users size={17} className="text-gov-saffron" />
            <span className="title-text">Prospect Numbers Directory</span>
            <span className="counter-pill">{total} Contacts</span>
          </div>
          <Link to="/numbers/add" className="header-btn header-btn-primary">
            <Plus size={13} />
            <span>Add Numbers</span>
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Organization</th>
                <th>Designation</th>
                <th>Sector</th>
                <th>State &amp; District</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan="8" className="empty">
                    {hasActiveFilters ? 'No numbers matched your filter criteria.' : 'No contacts found. Click "Add Numbers" to import contacts.'}
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="font-bold text-slate-900">{r.contact_name}</div>
                  </td>
                  <td className="font-semibold text-slate-700">{r.phone}</td>
                  <td>{r.organization || '—'}</td>
                  <td>{r.designation || '—'}</td>
                  <td>{r.sector || '—'}</td>
                  <td>
                    {r.district ? (
                      <div>
                        <span className="font-semibold text-slate-800">{r.district}</span>
                        {r.state && <span className="text-slate-400 text-xs block">{r.state}</span>}
                      </div>
                    ) : (r.state || '—')}
                  </td>
                  <td>
                    {Number(r.is_active) === 0 ? (
                      <span className="badge red" style={{ fontWeight: 700 }}>Disabled</span>
                    ) : (
                      <Badge cls={LS[r.lead_status]}>{(r.lead_status || 'new').replace('_', ' ')}</Badge>
                    )}
                  </td>
                  <td className="actions">
                    <button className="icon-btn" title="Edit contact" onClick={() => setEdit({ ...r })}>
                      <Pencil size={15} />
                    </button>
                    {/* <button className="icon-btn danger" title="Delete contact" onClick={() => del(r)}>
                      <Trash2 size={15} />
                    </button> */}
                    {Number(r.is_active) === 0 ? (
                      <button
                        type="button"
                        className="icon-btn"
                        title="Enable contact"
                        style={{ color: '#16a34a' }}
                        onClick={() => handleToggleDisable(r, true)}
                      >
                        <CheckCircle2 size={15} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn"
                        title="Disable contact"
                        style={{ color: '#d97706' }}
                        onClick={() => handleToggleDisable(r, false)}
                      >
                        <Ban size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalPages={Math.ceil(total / limit) || 1}
          totalItems={total}
          perPage={limit}
          onPageChange={setPage}
          onPerPageChange={setLimit}
          itemLabel="contacts"
        />
      </div>

      {/* Edit Contact Modal with State and Dynamic District Dropdown */}
      {edit && (
        <Modal title="Edit Contact Information" onClose={() => setEdit(null)}>
          <div className="form-grid">
            <div>
              <label>Contact Name *</label>
              <input
                value={edit.contact_name || ''}
                onChange={e => setEdit({ ...edit, contact_name: e.target.value })}
              />
            </div>
            <div>
              <label>Phone Number *</label>
              <input
                value={edit.phone || ''}
                onChange={e => setEdit({ ...edit, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
              />
            </div>
            <div>
              <label>Organization</label>
              <input
                value={edit.organization || ''}
                onChange={e => setEdit({ ...edit, organization: e.target.value })}
              />
            </div>
            <div>
              <label>Designation</label>
              <input
                value={edit.designation || ''}
                onChange={e => setEdit({ ...edit, designation: e.target.value })}
              />
            </div>
            <div>
              <label>Industry / Sector  </label>
              <SearchableSelect
                options={SECTORS}
                value={edit.sector || SECTORS[1]}
                onChange={val => setEdit({ ...edit, sector: val })}
                placeholder="Select Sector"
                searchPlaceholder="Search sector…"
              />
            </div>
            <div>
              <label>Lead Status  </label>
              <SearchableSelect
                options={Object.keys(LS).map(k => ({ value: k, label: k.replace('_', ' ').toUpperCase() }))}
                value={edit.lead_status || 'new'}
                onChange={val => setEdit({ ...edit, lead_status: val })}
                placeholder="Select Status"
                searchPlaceholder="Search status…"
              />
            </div>
            <div>
              <label>State </label>
              <SearchableSelect
                options={INDIAN_STATES}
                value={edit.state || 'Uttar Pradesh'}
                onChange={val => {
                  const dists = INDIA_LOCATIONS[val] || ['Other / Unspecified']
                  setEdit({ ...edit, state: val, district: dists[0] || '' })
                }}
                placeholder="Select State"
                searchPlaceholder="Search state…"
              />
            </div>
            <div>
              <label>District </label>
              <SearchableSelect
                options={editDistricts}
                value={edit.district || ''}
                onChange={val => setEdit({ ...edit, district: val })}
                placeholder="Select District"
                searchPlaceholder="Search district…"
              />
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn primary" onClick={save}>Save Changes</button>
          </div>
        </Modal>
      )}
    </>
  )
}
