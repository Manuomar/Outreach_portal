import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, ShieldCheck, Search, RotateCcw, Users as UsersIcon, UserCheck, Headphones } from 'lucide-react'
import { api, auth } from '../../api'
import { Badge, Modal, Pagination } from '../../components/ui.jsx'
import SearchableSelect from '../../components/ui/SearchableSelect'

const ROLES = [
  { val: 'admin', label: 'Admin (Full Access)' },
  { val: 'organizer', label: 'Organizer (Campaign Manager)' },
  { val: 'agent', label: 'Agent (Operator)' },
  { val: 'viewer', label: 'Viewer (Read Only)' },
]

const ROLE_BADGE = {
  admin: 'purple',
  organizer: 'blue',
  agent: 'green',
  viewer: 'gray',
}

const EMPTY_USER = {
  username: '',
  name: '',
  email: '',
  password: '',
  role: 'agent',
  status: 'active',
}

export default function Users() {
  const [users, setUsers] = useState([])
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [newForm, setNewForm] = useState(EMPTY_USER)
  const [busy, setBusy] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const currentUid = auth.user?.id

  const load = useCallback(async () => {
    try {
      setErr('')
      const r = await api.users()
      setUsers(r.data || [])
    } catch (e) {
      setErr(e.message || 'Failed to load users list')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const userStats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.status === 'active').length,
    admins: users.filter(u => u.role === 'admin').length,
    agents: users.filter(u => u.role === 'agent').length,
  }), [users])

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchUser = (u.username || '').toLowerCase().includes(q)
        const matchName = (u.name || '').toLowerCase().includes(q)
        const matchEmail = (u.email || '').toLowerCase().includes(q)
        if (!matchUser && !matchName && !matchEmail) return false
      }

      // Role Filter
      if (roleFilter !== 'all' && u.role !== roleFilter) return false

      // Status Filter
      if (statusFilter !== 'all' && u.status !== statusFilter) return false

      return true
    })
  }, [users, search, roleFilter, statusFilter])

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * limit
    return filteredUsers.slice(start, start + limit)
  }, [filteredUsers, page, limit])

  const hasActiveFilters = search.trim() !== '' || roleFilter !== 'all' || statusFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setRoleFilter('all')
    setStatusFilter('all')
    setPage(1)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await api.addUser(newForm)
      setMsg({ ok: true, text: `User "${newForm.username}" added successfully!` })
      setAddModal(false)
      setNewForm(EMPTY_USER)
      await load()
    } catch (e) {
      setMsg({ err: true, text: e.message || 'Failed to create user' })
    } finally {
      setBusy(false)
    }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await api.updateUser(editUser.id, editUser)
      setMsg({ ok: true, text: `User "${editUser.username}" updated successfully!` })
      setEditUser(null)
      await load()
    } catch (e) {
      setMsg({ err: true, text: e.message || 'Failed to update user' })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (u) => {
    if (confirm(`Are you sure you want to delete user "${u.name || u.username}"?`)) {
      try {
        await api.deleteUser(u.id)
        setMsg({ ok: true, text: `User "${u.username}" deleted successfully.` })
        await load()
      } catch (e) {
        alert(e.message || 'Failed to delete user')
      }
    }
  }

  return (
    <>
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '18px' }}>
        {[
          { label: 'Total Users', value: userStats.total, bg: '#e0f2fe', color: '#0284c7', Icon: UsersIcon },
          { label: 'Active', value: userStats.active, bg: '#dcfce7', color: '#16a34a', Icon: UserCheck },
          { label: 'Admin Accounts', value: userStats.admins, bg: '#f3e8ff', color: '#7c3aed', Icon: ShieldCheck },
          { label: 'Agent Operators', value: userStats.agents, bg: '#fff7ed', color: '#ea580c', Icon: Headphones },
        ].map(({ label, value, bg, color, Icon }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon size={20} style={{ color }} />
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginTop: '3px' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Searchable Filter Toolbar (Horizontal Layout) */}
      <div className="filter-toolbar" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', marginBottom: '18px' }}>
        <div className="filter-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', width: '100%' }}>
          {/* Search Input */}
          <div className="filter-search-box" style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '340px' }}>
            <Search size={16} className="filter-search-icon" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search by username, name, email…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="filter-search-input"
              style={{ width: '100%', padding: '8px 12px 8px 36px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', height: '38px', outline: 'none' }}
            />
          </div>

          {/* Role Filter  */}
          <div style={{ minWidth: '160px', flex: '0 1 auto' }}>
            <SearchableSelect
              options={[
                { value: 'all', label: 'All Roles' },
                ...ROLES.map(r => ({ value: r.val, label: r.label })),
              ]}
              value={roleFilter}
              onChange={val => { setRoleFilter(val); setPage(1) }}
              placeholder="All Roles"
              searchPlaceholder="Search role…"
            />
          </div>

          {/* Status Filter  */}
          <div style={{ minWidth: '150px', flex: '0 1 auto' }}>
            <SearchableSelect
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'suspended', label: 'Suspended' },
              ]}
              value={statusFilter}
              onChange={val => { setStatusFilter(val); setPage(1) }}
              placeholder="All Statuses"
              searchPlaceholder="Search status…"
            />
          </div>

          {/* Reset Filters */}
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
            Showing <span style={{ color: '#103778', fontWeight: 800 }}>{filteredUsers.length}</span> of {users.length} users
          </div>
        </div>
      </div>

      {msg && (
        <div className={'alert ' + (msg.err ? 'err' : 'ok')} style={{ marginBottom: 14 }}>
          {msg.text}
        </div>
      )}
      {err && <div className="alert err" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="table-card">
        {/* Table Navy Header Bar */}
        <div className="table-navy-header">
          <div className="title-group">
            <ShieldCheck size={17} className="text-gov-saffron" />
            <span className="title-text">Portal Users &amp; Team Directory</span>
            <span className="counter-pill">
              {filteredUsers.length} {filteredUsers.length === users.length ? 'Users' : `of ${users.length} Users`}
            </span>
          </div>
          <button
            type="button"
            className="header-btn header-btn-primary"
            onClick={() => { setNewForm(EMPTY_USER); setAddModal(true) }}
          >
            <Plus size={13} />
            <span>Add New User</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Created At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && !loading && (
                <tr>
                  <td colSpan="7" className="empty">
                    {hasActiveFilters ? 'No users matched your search criteria.' : 'No users found.'}
                  </td>
                </tr>
              )}
              {paginatedUsers.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar sm" style={{ textTransform: 'uppercase' }}>
                        {(u.name || u.username || 'U')[0]}
                      </div>
                      <div>
                        <b>{u.name || u.username}</b>
                        <div className="muted sm">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td>{u.email || <span className="muted sm">—</span>}</td>
                  <td>
                    <Badge cls={ROLE_BADGE[u.role] || 'gray'}>
                      {u.role.toUpperCase()}
                    </Badge>
                  </td>
                  <td>
                    <span className={`badge ${u.status === 'active' ? 'green' : 'red'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td>
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleString('en-IN')
                      : <span className="muted sm">Never logged in</span>}
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="actions">
                    <button
                      className="icon-btn"
                      title="Edit User"
                      onClick={() => setEditUser({ ...u, password: '' })}
                    >
                      <Pencil size={16} />
                    </button>
                    {currentUid !== u.id && u.username !== 'admin' && (
                      <button
                        className="icon-btn danger"
                        title="Delete User"
                        onClick={() => handleDelete(u)}
                      >
                        <Trash2 size={16} />
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
          totalPages={Math.ceil(filteredUsers.length / limit) || 1}
          totalItems={filteredUsers.length}
          perPage={limit}
          onPageChange={setPage}
          onPerPageChange={setLimit}
          itemLabel="users"
        />
      </div>

      {/* Add User Modal */}
      {addModal && (
        <Modal title="Add New User" onClose={() => setAddModal(false)}>
          <form onSubmit={handleCreate}>
            <div className="form-grid">
              <div>
                <label>Username *</label>
                <input
                  required
                  placeholder="e.g. rahul_sharma"
                  value={newForm.username}
                  onChange={e => setNewForm({ ...newForm, username: e.target.value })}
                />
              </div>
              <div>
                <label>Full Name *</label>
                <input
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={newForm.name}
                  onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                />
              </div>
              <div>
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="rahul@iti.ac.in"
                  value={newForm.email}
                  onChange={e => setNewForm({ ...newForm, email: e.target.value })}
                />
              </div>
              <div>
                <label>Password * (min 6 chars)</label>
                <input
                  required
                  type="password"
                  placeholder="Secret password"
                  value={newForm.password}
                  onChange={e => setNewForm({ ...newForm, password: e.target.value })}
                />
              </div>
              <div>
                <label>User Role</label>
                <select
                  value={newForm.role}
                  onChange={e => setNewForm({ ...newForm, role: e.target.value })}
                >
                  {ROLES.map(r => (
                    <option key={r.val} value={r.val}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Status</label>
                <select
                  value={newForm.status}
                  onChange={e => setNewForm({ ...newForm, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>

            <div className="modal-foot" style={{ marginTop: 20 }}>
              <button type="button" className="btn ghost" onClick={() => setAddModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? 'Adding…' : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <Modal title={`Edit User: ${editUser.username}`} onClose={() => setEditUser(null)}>
          <form onSubmit={handleUpdate}>
            <div className="form-grid">
              <div>
                <label>Full Name *</label>
                <input
                  required
                  value={editUser.name}
                  onChange={e => setEditUser({ ...editUser, name: e.target.value })}
                />
              </div>
              <div>
                <label>Email Address</label>
                <input
                  type="email"
                  value={editUser.email || ''}
                  onChange={e => setEditUser({ ...editUser, email: e.target.value })}
                />
              </div>
              <div>
                <label>User Role</label>
                <select
                  value={editUser.role}
                  onChange={e => setEditUser({ ...editUser, role: e.target.value })}
                >
                  {ROLES.map(r => (
                    <option key={r.val} value={r.val}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Account Status</label>
                <select
                  value={editUser.status}
                  onChange={e => setEditUser({ ...editUser, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>New Password (leave blank if unchanged)</label>
                <input
                  type="password"
                  placeholder="New password (leave blank if unchanged)"
                  value={editUser.password || ''}
                  onChange={e => setEditUser({ ...editUser, password: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-foot" style={{ marginTop: 20 }}>
              <button type="button" className="btn ghost" onClick={() => setEditUser(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
