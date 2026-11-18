import { useEffect, useState, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Headphones,
  LayoutGrid,
  Phone,
  Radio,
  CalendarClock,
  LogOut,
  ChevronDown,
  Search,
  Bot,
  ListPlus,
  List,
  ShieldCheck,
  Home,
  Users as UsersIcon,
  History,
  KeyRound,
} from 'lucide-react'
import { api, auth } from '../api'

const TITLES = {
  '/dashboard': 'Dashboard',
  '/numbers': 'Numbers Management',
  '/numbers/add': 'Add Numbers',
  '/live-call': 'Live AI Calling Agent',
  '/agents': 'AI Voice Outreach Agents',
  '/agents/create': 'Create AI Voice Agent',
  '/meetings': 'Scheduled Meetings & Follow-ups',
  '/call-history': 'Call History Log',
  '/users': 'Team & User Management',
  '/keys': 'Manage API Keys (Bolna & Gemini)',
}

const QUICK_LINKS = [
  { path: '/dashboard', label: 'Dashboard', sub: 'Overview & metrics', Icon: LayoutGrid },
  { path: '/numbers', label: 'All Numbers', sub: 'Contact directory', Icon: Phone },
  { path: '/numbers/add', label: 'Add Numbers', sub: 'Add single or bulk contacts', Icon: ListPlus },
  { path: '/live-call', label: 'AI Live Call', sub: 'Manual & auto campaign calling', Icon: Radio },
  { path: '/agents', label: 'AI Agents', sub: 'Manage Bolna voice agents', Icon: Bot },
  { path: '/call-history', label: 'Call History', sub: 'All call logs & recordings', Icon: History },
  { path: '/meetings', label: 'Meetings', sub: 'Scheduled meetings & follow-ups', Icon: CalendarClock },
  { path: '/keys', label: 'Manage Keys', sub: 'Bolna & Gemini credentials', Icon: KeyRound },
  { path: '/users', label: 'Team & Users', sub: 'Manage team accounts', Icon: UsersIcon },
]

export default function Layout() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const [currentUser, setCurrentUser] = useState(auth.user || { name: 'Admin Organizer', role: 'admin' })
  const [open, setOpen] = useState({
    numbers: pathname.startsWith('/numbers'),
    ai: pathname === '/live-call' || pathname.startsWith('/calls') || pathname === '/call-history' || pathname.startsWith('/agents'),
  })
  const [searchQ, setSearchQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef(null)

  useEffect(() => {
    // Refresh user profile in background
    api.me()
      .then(r => {
        if (r.user) {
          auth.setUser(r.user)
          setCurrentUser(r.user)
        }
      })
      .catch(() => { })
  }, [])

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const title = pathname.startsWith('/calls') && pathname !== '/call-history'
    ? 'Call Details & Recording'
    : (TITLES[pathname] || 'Portal')

  const logout = () => {
    api.logout().catch(() => {})
    auth.clear()
    nav('/login')
  }

  const initial = (currentUser?.name || currentUser?.username || 'A')[0].toUpperCase()
  const roleName = currentUser?.role ? currentUser.role.toUpperCase() : 'ORGANIZER'

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="brand-logo"><Headphones size={22} /></div>
          <div>
            <div className="brand-name">Outreach Portal</div>
            <div className="brand-sub">AI VOICE PANEL</div>
          </div>
        </div>

        <div className="usercard">
          <div className="avatar">{initial}</div>
          <div>
            <div className="u-name">{currentUser?.name || 'Admin Organizer'}</div>
            <div className="u-role">
              <ShieldCheck size={12} /> {currentUser?.role || 'Organizer'}
            </div>
          </div>
        </div>

        <div className="nav-label">MAIN NAVIGATION</div>
        <nav className="nav">
          <NavLink to="/dashboard" className="nav-item">
            <LayoutGrid size={18} /> Dashboard
          </NavLink>

          <NavLink to="/users" className="nav-item">
            <UsersIcon size={18} /> Team &amp; Users
          </NavLink>

          <button
            type="button"
            className="nav-item"
            onClick={() => setOpen(o => ({ ...o, numbers: !o.numbers }))}
          >
            <Phone size={18} /> Numbers Management
            <ChevronDown size={16} className={'chev ' + (open.numbers ? 'up' : '')} />
          </button>
          {open.numbers && (
            <div className="sub">
              <NavLink to="/numbers" end className="sub-item">
                <List size={14} /> All Numbers
              </NavLink>
              <NavLink to="/numbers/add" className="sub-item">
                <ListPlus size={14} /> Add Numbers
              </NavLink>
            </div>
          )}

          <button
            type="button"
            className={'nav-item ' + (pathname === '/live-call' || pathname === '/agents' ? 'group-active' : '')}
            onClick={() => setOpen(o => ({ ...o, ai: !o.ai }))}
          >
            <Bot size={18} /> AI Calling
            <ChevronDown size={16} className={'chev ' + (open.ai ? 'up' : '')} />
          </button>
          {open.ai && (
            <div className="sub">
              <NavLink to="/live-call" className="sub-item">
                <Radio size={14} /> AI Live Call
              </NavLink>
              <NavLink to="/agents" className="sub-item">
                <Bot size={14} /> AI Agents
              </NavLink>
              <NavLink to="/call-history" className="sub-item">
                <History size={14} /> Call History
              </NavLink>
            </div>
          )}

          <NavLink to="/meetings" className="nav-item">
            <CalendarClock size={18} /> Meetings
          </NavLink>

          <NavLink to="/keys" className="nav-item">
            <KeyRound size={18} /> Manage Keys
          </NavLink>


        </nav>

        <div className="side-foot">
          <button type="button" className="logout" onClick={logout}>
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>Outreach Portal</h1>
          <div className="search" style={{ position: 'relative' }}>
            <Search size={16} />
            <input
              placeholder="Search portal (Ctrl+K)..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
              ref={searchRef}
              style={{ outline: 'none' }}
            />
            {searchOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
                background: '#fff', borderRadius: '10px', boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                border: '1px solid #e2e8f0', zIndex: 999, overflow: 'hidden', minWidth: '280px',
              }}>
                <div style={{ padding: '8px 12px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>
                  Quick Navigation
                </div>
                {QUICK_LINKS.filter(l => !searchQ.trim() || l.label.toLowerCase().includes(searchQ.toLowerCase())).map(link => (
                  <div
                    key={link.path}
                    onMouseDown={() => { nav(link.path); setSearchOpen(false); setSearchQ('') }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', cursor: 'pointer', fontSize: '13px', color: '#334155', fontWeight: 600 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <link.Icon size={15} style={{ color: '#103778' }} />
                    <div>
                      <div>{link.label}</div>
                      {link.sub && <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>{link.sub}</div>}
                    </div>
                  </div>
                ))}
                {QUICK_LINKS.filter(l => !searchQ.trim() || l.label.toLowerCase().includes(searchQ.toLowerCase())).length === 0 && (
                  <div style={{ padding: '14px', fontSize: '13px', color: '#94a3b8', textAlign: 'center' }}>No results for "{searchQ}"</div>
                )}
              </div>
            )}
          </div>
          <div className="top-user">
            <div className="avatar sm">{initial}</div>
            <div>
              <div className="u-name">{currentUser?.name || 'Admin Organizer'}</div>
              <div className="u-role orange">{roleName}</div>
            </div>
          </div>
        </header>

        <div className="ribbon">
          <div className="ribbon-title">
            <LayoutGrid size={16} /> {title}
          </div>
          <div className="crumb">
            <Home size={13} /> Home &gt; {title}
          </div>
        </div>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
