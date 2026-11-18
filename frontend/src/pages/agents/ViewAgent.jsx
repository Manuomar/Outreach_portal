import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Bot, Pencil, CheckCircle2, Volume2, Cpu,
  FileText, Database, PhoneCall, Zap, RefreshCw, Copy, Check,
  ToggleLeft, ToggleRight, Table, Tag,
} from 'lucide-react'
import { api } from '../../api'

// ── Banner ────────────────────────────────────────────────────────────────────
function Banner({ type, children }) {
  const cfg = {
    error: { bg: '#fef2f2', border: '#fecaca', color: '#dc2626' },
    success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a' },
    info: { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
  }[type] || { bg: '#f8fafc', border: '#e2e8f0', color: '#475569' }
  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: cfg.color, fontWeight: 600 }}>
      {children}
    </div>
  )
}

export default function ViewAgent() {
  const { id } = useParams()
  const nav = useNavigate()

  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('prompt')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [dbFields, setDbFields] = useState([])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.agent(id),
      api.extractionFields().catch(() => ({ data: [] })),
    ])
      .then(([agentRes, fieldsRes]) => {
        setAgent(agentRes.data)
        setDbFields(Array.isArray(fieldsRes.data) ? fieldsRes.data : [])
      })
      .catch(e => setError(e.message || 'Agent not found'))
      .finally(() => setLoading(false))
  }, [id])

  const copy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await api.syncAgentExtractions(id)
      setSyncMsg({ type: 'success', text: res.message || 'Synced to Bolna portal!' })
    } catch (e) {
      setSyncMsg({ type: 'error', text: e.message || 'Sync failed' })
    } finally { setSyncing(false) }
  }

  const cardStyle = {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden',
  }
  const headerStyle = {
    background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '12px 20px',
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '12px', fontWeight: 800, color: '#103778', textTransform: 'uppercase', letterSpacing: '0.04em',
  }

  // Resolve extraction fields list
  const extractionList = useMemo(() => {
    if (!agent) return []
    let list = dbFields
    if (agent.extraction_config) {
      try {
        const parsed = typeof agent.extraction_config === 'string'
          ? JSON.parse(agent.extraction_config)
          : agent.extraction_config
        if (Array.isArray(parsed) && parsed.length > 0) {
          const savedKeys = new Set(parsed.map(f => f.key))
          list = [
            ...parsed,
            ...dbFields.filter(f => !savedKeys.has(f.key)),
          ]
        }
      } catch (_) {}
    }
    return list
  }, [agent, dbFields])

  // Group extraction fields by Category -> Subcategory
  const groupedFields = useMemo(() => {
    const cats = {}
    extractionList.forEach(f => {
      const cat = f.category || (f.isCore !== false ? 'Core' : 'Survey')
      if (!cats[cat]) cats[cat] = {}
      const sub = f.subcategory || 'General'
      if (!cats[cat][sub]) cats[cat][sub] = []
      cats[cat][sub].push(f)
    })
    return cats
  }, [extractionList])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '16px', color: '#64748b' }}>
      <RefreshCw size={28} className="animate-spin" style={{ color: '#103778' }} />
      <span style={{ fontSize: '14px', fontWeight: 600 }}>Loading agent...</span>
    </div>
  )

  if (error || !agent) return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <Banner type="error">{error || 'Agent not found'}</Banner>
      <button type="button" onClick={() => nav('/agents')} className="btn ghost" style={{ marginTop: '20px' }}>← Back to Agents</button>
    </div>
  )

  let ragIds = []
  if (agent.rag_ids) {
    try { ragIds = typeof agent.rag_ids === 'string' ? JSON.parse(agent.rag_ids) : agent.rag_ids } catch (e) {}
  }

  const TABS = [
    ['prompt', 'System Prompt'],
    ['callEnd', 'Call-End Prompt'],
    ['kb', 'Knowledge Base'],
    ['greeting', 'Welcome Message'],
    ['extraction', 'Extraction Fields'],
  ]

  const catColors = {
    'Core':   { bg: '#f0f7ff', border: '#bfdbfe', badge: '#dbeafe', badgeText: '#1e40af' },
    'Survey': { bg: '#fffbeb', border: '#fed7aa', badge: '#fef3c7', badgeText: '#92400e' },
    'Custom': { bg: '#f0fdf4', border: '#bbf7d0', badge: '#dcfce7', badgeText: '#15803d' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '900px', margin: '0 auto' }}>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button type="button" onClick={() => nav('/agents')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#64748b', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            <ArrowLeft size={16} /> Back to Agents
          </button>
          <span style={{ color: '#cbd5e1' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#103778', display: 'grid', placeItems: 'center' }}>
              <Bot size={18} style={{ color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#103778' }}>{agent.name}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {agent.is_active ? '🟢 Active' : '🔴 Inactive'} · {agent.language === 'hi' ? 'Hindi' : 'English'} · {agent.total_calls || 0} calls
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" onClick={() => nav(`/live-call?agentId=${agent.id}`)} className="btn ghost" style={{ height: '36px', padding: '0 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <PhoneCall size={14} /> Dial
          </button>
          <button type="button" onClick={() => nav(`/agents/${agent.id}/edit`)} className="btn primary" style={{ height: '36px', padding: '0 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Pencil size={14} /> Edit Agent
          </button>
        </div>
      </div>

      {/* Identity Card */}
      <div style={cardStyle}>
        <div style={headerStyle}><Bot size={14} /> Agent Identity</div>
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {[
            { label: 'Agent Name', value: agent.name },
            { label: 'Bolna Account', value: agent.account_label || 'Default' },
            { label: 'Voice', value: agent.voice_name?.split(' - ')[0] || 'Viraj' },
            { label: 'Language', value: agent.language === 'hi' ? 'Hindi (Standard & Dialects)' : 'English' },
            { label: 'LLM Model', value: agent.llm_model?.split('/').pop() || 'gpt-4o-mini' },
            { label: 'Total Calls', value: agent.total_calls || 0 },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Bolna ID row */}
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Bolna Agent ID:</span>
          <code style={{ fontSize: '12px', color: '#475569' }}>{agent.bolna_agent_id}</code>
          <button type="button" onClick={() => copy(agent.bolna_agent_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'inline-flex' }}>
            {copied ? <Check size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} />}
          </button>
          <a href={`https://app.bolna.ai/agent/${agent.bolna_agent_id}`} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#f26522', fontWeight: 700, marginLeft: 'auto' }}>
            View on Bolna Studio ↗
          </a>
        </div>

        {/* RAG KBs */}
        {ragIds.length > 0 && (
          <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 20px', background: '#eff6ff' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8' }}>RAG Knowledge Bases Attached: </span>
            {ragIds.map(rid => (
              <code key={rid} style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>{rid.slice(0, 12)}...</code>
            ))}
          </div>
        )}
      </div>

      {/* Tabbed Content Card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', overflowX: 'auto' }}>
          {TABS.map(([tab, label]) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{
              padding: '11px 16px', border: 'none',
              borderBottom: activeTab === tab ? '2px solid #103778' : '2px solid transparent',
              background: 'none', fontWeight: 700, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap',
              color: activeTab === tab ? '#103778' : '#64748b',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ padding: '20px' }}>
          {activeTab === 'prompt' && (
            <pre style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', fontSize: '12.5px', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#0f172a', margin: 0 }}>
              {agent.system_prompt || '(no system prompt)'}
            </pre>
          )}
          {activeTab === 'callEnd' && (
            <pre style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px', fontSize: '12.5px', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#713f12', margin: 0 }}>
              {agent.call_end_prompt || '(no call-end prompt set - using default system prompt for post-call processing)'}
            </pre>
          )}
          {activeTab === 'kb' && (
            <pre style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', fontSize: '12.5px', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#0f172a', margin: 0 }}>
              {agent.knowledge_base || '(no knowledge base text)'}
            </pre>
          )}
          {activeTab === 'greeting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '16px', fontSize: '15px', color: '#9a3412', fontWeight: 600, lineHeight: '1.7' }}>
                "{agent.welcome_message}"
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                <span style={{ fontWeight: 600 }}>Welcome Message Delay:</span>
                <span style={{ background: '#eff6ff', color: '#103778', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, border: '1px solid #bfdbfe' }}>
                  {agent.welcome_message_delay || 0} ms
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  (waits {agent.welcome_message_delay || 0}ms before speaking greeting)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
                <span style={{ fontWeight: 600 }}>Outbound Caller ID:</span>
                <span style={{ background: agent.from_phone_number ? '#f0fdf4' : '#f1f5f9', color: agent.from_phone_number ? '#15803d' : '#475569', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, border: `1px solid ${agent.from_phone_number ? '#bbf7d0' : '#e2e8f0'}` }}>
                  {agent.from_phone_number || 'Bolna Default Numbers'}
                </span>
              </div>
            </div>
          )}
          {activeTab === 'extraction' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#103778' }}>
                  {extractionList.filter(f => f.enabled).length} of {extractionList.length} fields enabled
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {syncMsg && <Banner type={syncMsg.type}>{syncMsg.text}</Banner>}
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      background: '#f26522', color: '#fff', border: 'none',
                      borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 700,
                      cursor: syncing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {syncing ? <><RefreshCw size={12} className="animate-spin" /> Syncing...</> : <><Zap size={12} /> Sync to Bolna</>}
                  </button>
                </div>
              </div>

              {/* Grouped by Category -> Subcategory */}
              {Object.entries(groupedFields).map(([cat, subcats]) => {
                const colors = catColors[cat] || catColors['Custom']
                return (
                  <div key={cat} style={{ marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '10px' }}>
                      {cat === 'Core' ? <Table size={13} style={{ color: '#2563eb' }} /> : <Tag size={13} style={{ color: '#d97706' }} />}
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{cat} Fields</span>
                      <span style={{ background: colors.badge, color: colors.badgeText, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, fontFamily: 'monospace' }}>
                        TABLE: {cat === 'Core' ? 'pitch_calls' : 'pitch_call_answers'}
                      </span>
                    </div>

                    {Object.entries(subcats).map(([sub, fields]) => (
                      <div key={sub} style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', paddingLeft: '4px' }}>
                          ↳ {sub}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {fields.map(f => (
                            <div key={f.key} style={{
                              display: 'flex', alignItems: 'flex-start', gap: '10px',
                              padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0',
                              background: f.enabled ? '#fff' : '#f8fafc', opacity: f.enabled ? 1 : 0.55,
                            }}>
                              <div style={{ marginTop: '2px', color: f.enabled ? '#16a34a' : '#94a3b8' }}>
                                {f.enabled ? <CheckCircle2 size={14} /> : <span style={{ display: 'inline-block', width: 14, textAlign: 'center', fontSize: '12px' }}>—</span>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>{f.label}</span>
                                  <code style={{ fontSize: '11px', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', color: '#334155' }}>{f.key}</code>
                                  <span style={{
                                    fontSize: '10.5px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px',
                                    background: f.table === 'pitch_calls' ? '#dbeafe' : '#fef3c7',
                                    color: f.table === 'pitch_calls' ? '#1e40af' : '#92400e',
                                  }}>{f.table}</span>
                                </div>
                                {f.description && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{f.description}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
