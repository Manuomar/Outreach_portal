import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Headphones, Lock, User, ArrowRight } from 'lucide-react'
import { api, auth } from '../../api'

export default function Login() {
  const nav = useNavigate()
  const [f, setF] = useState({ username: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await api.login(f.username, f.password)
      auth.set(r.token, r.user, r.refresh_token)
      nav('/dashboard')
    } catch (x) {
      setErr(x.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-logo big"><Headphones size={28} /></div>
        <h2>Outreach Portal</h2>
        <p className="muted">AI Voice Outreach System — secure agent access, tracking & automated verification</p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <User size={14} /> Username / Email
        </label>
        <input
          value={f.username}
          onChange={e => setF({ ...f, username: e.target.value })}
          placeholder="e.g. admin or your username"
          autoFocus
          required
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <Lock size={14} /> Password
        </label>
        <input
          type="password"
          value={f.password}
          onChange={e => setF({ ...f, password: e.target.value })}
          placeholder="••••••••"
          required
        />

        {err && <div className="alert err">{err}</div>}

        <button className="btn primary full" disabled={busy} style={{ marginTop: 16 }}>
          {busy ? 'Authenticating…' : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Sign In to Portal <ArrowRight size={16} />
            </span>
          )}
        </button>
      </form>
    </div>
  )
}

