import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot, RefreshCw, UploadCloud, AlertCircle, Check,
  ArrowLeft, Sparkles, Database, Table, CheckSquare, Square,
  Plus, Trash2, HelpCircle, Sliders, Tag,
  X, FileText, Key, PhoneForwarded,
} from 'lucide-react'
import { api } from '../../api'
import SearchableSelect from '../../components/ui/SearchableSelect'
import {
  VOICE_OPTIONS,
  LANGUAGE_OPTIONS,
  LLM_PROVIDERS,
  MODELS_BY_PROVIDER,
  RECOMMENDED_EXTRACTION_FIELDS,
} from '../../data/agentConstants'


const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#fff' }
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }
const cardStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }

function Banner({ type, children }) {
  const isError = type === 'error'
  return (
    <div style={{ background: isError ? '#fef2f2' : '#f0fdf4', border: `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`, color: isError ? '#b91c1c' : '#15803d', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      {isError ? <AlertCircle size={15} /> : <Check size={15} />} {children}
    </div>
  )
}

function ExtractionFieldsPanel({ fields, setFields, dbFields, loadingDbFields }) {
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [newFieldKey, setNewFieldKey] = useState('')
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldDesc, setNewFieldDesc] = useState('')
  const [newFieldCategory, setNewFieldCategory] = useState('Custom')
  const [newFieldSubcategory, setNewFieldSubcategory] = useState('')

  const toggleField = (key) =>
    setFields(prev => prev.map(f => (f.key === key || f.field_key === key) ? { ...f, enabled: !f.enabled } : f))

  const removeCustomField = (key) =>
    setFields(prev => prev.filter(f => (f.key !== key && f.field_key !== key)))

  const handleAddCustomField = (e) => {
    if (e && e.preventDefault) e.preventDefault()
    let cleanKey = newFieldKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    const cleanLabel = newFieldLabel.trim()
    if (!cleanKey && cleanLabel) {
      cleanKey = cleanLabel.toLowerCase().replace(/[^a-z0-9_]/g, '_')
    }
    if (!cleanKey) {
      alert('Please enter a Field Key or Label')
      return
    }
    if (fields.some(f => (f.key || f.field_key) === cleanKey)) {
      alert(`Field key "${cleanKey}" already exists in extraction list!`)
      return
    }
    const isCore = newFieldCategory === 'Core'
    setFields(prev => [...prev, {
      key: cleanKey,
      label: cleanLabel || cleanKey,
      category: newFieldCategory.trim() || 'Custom',
      subcategory: newFieldSubcategory.trim() || null,
      table: isCore ? 'pitch_calls' : 'pitch_call_answers',
      column: isCore ? cleanKey : 'response_value',
      type: 'String',
      enabled: true,
      isCore: isCore,
      description: newFieldDesc.trim() || 'Custom extraction field',
    }])
    setNewFieldKey('')
    setNewFieldLabel('')
    setNewFieldDesc('')
    setNewFieldCategory('Custom')
    setNewFieldSubcategory('')
    setShowAddCustom(false)
  }

  // Quick add single recommended field
  const handleAddRecommended = (rec) => {
    const exists = fields.find(f => (f.key || f.field_key) === rec.key)
    if (exists) {
      if (!exists.enabled) {
        toggleField(rec.key)
      }
    } else {
      setFields(prev => [...prev, { ...rec, enabled: true }])
    }
  }

  // Quick add all recommended fields that aren't added / enabled
  const handleAddAllRecommended = () => {
    setFields(prev => {
      const updated = [...prev]
      RECOMMENDED_EXTRACTION_FIELDS.forEach(rec => {
        const idx = updated.findIndex(f => (f.key || f.field_key) === rec.key)
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], enabled: true }
        } else {
          updated.push({ ...rec, enabled: true })
        }
      })
      return updated
    })
  }

  // Find which recommended fields are NOT yet added or enabled
  const unaddedRecommended = useMemo(() => {
    return RECOMMENDED_EXTRACTION_FIELDS.filter(rec => {
      const match = fields.find(f => (f.key || f.field_key) === rec.key)
      return !match || !match.enabled
    })
  }, [fields])

  // Group by category → subcategory
  const grouped = useMemo(() => {
    const cats = {}
    fields.forEach(f => {
      const cat = f.category || 'Core'
      if (!cats[cat]) cats[cat] = {}
      const sub = f.subcategory || 'General'
      if (!cats[cat][sub]) cats[cat][sub] = []
      cats[cat][sub].push(f)
    })
    return cats
  }, [fields])

  const enabledCount = fields.filter(f => f.enabled).length

  const catColors = {
    'Core': { bg: '#f0f7ff', border: '#bfdbfe', check: '#2563eb', badge: '#dbeafe', badgeText: '#1e40af' },
    'Overview': { bg: '#f0fdf4', border: '#bbf7d0', check: '#16a34a', badge: '#dcfce7', badgeText: '#15803d' },
    'Next Steps': { bg: '#eff6ff', border: '#bfdbfe', check: '#3b82f6', badge: '#dbeafe', badgeText: '#1d4ed8' },
    'Escalation': { bg: '#fef2f2', border: '#fecaca', check: '#ef4444', badge: '#fee2e2', badgeText: '#b91c1c' },
    'Quality': { bg: '#faf5ff', border: '#e9d5ff', check: '#9333ea', badge: '#f3e8ff', badgeText: '#7e22ce' },
    'Survey': { bg: '#fffbeb', border: '#fed7aa', check: '#d97706', badge: '#fef3c7', badgeText: '#92400e' },
    'Custom': { bg: '#f0fdf4', border: '#bbf7d0', check: '#16a34a', badge: '#dcfce7', badgeText: '#15803d' },
  }

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={16} style={{ color: '#103778' }} />
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#103778', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Call Data Extraction & Storage Fields
            </span>
            <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
              {enabledCount} of {fields.length} Enabled
            </span>
            {loadingDbFields && <span style={{ fontSize: '11px', color: '#94a3b8' }}>Loading...</span>}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Configure what fields the AI extracts during calls → stored in <code>pitch_calls</code> & <code>pitch_call_answers</code>.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button type="button" onClick={() => setFields(p => p.map(f => ({ ...f, enabled: true })))}
            style={{ border: 'none', background: 'none', color: '#103778', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer' }}>Select All</button>
          <span style={{ color: '#cbd5e1' }}>|</span>
          <button type="button" onClick={() => setFields(p => p.map(f => ({ ...f, enabled: false })))}
            style={{ border: 'none', background: 'none', color: '#64748b', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer' }}>Deselect All</button>
          {dbFields.length > 0 && (
            <>
              <span style={{ color: '#cbd5e1' }}>|</span>
              <button type="button" onClick={() => setFields(dbFields)}
                style={{ border: 'none', background: 'none', color: '#f26522', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer' }}>Reset from DB</button>
            </>
          )}
        </div>
      </div>

      {/* Quick Add Recommended Fields Bar */}
      {unaddedRecommended.length > 0 && (
        <div style={{
          background: '#f8fafc',
          border: '1px dashed #93c5fd',
          borderRadius: '8px',
          padding: '10px 12px',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700, color: '#1e40af' }}>
              <Sparkles size={13} style={{ color: '#2563eb' }} />
              <span>Recommended Fields to Extract (Click to Add):</span>
            </div>
            <button
              type="button"
              onClick={handleAddAllRecommended}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Plus size={12} /> Add All Recommended ({unaddedRecommended.length})
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {unaddedRecommended.map(rec => (
              <button
                key={rec.key}
                type="button"
                onClick={() => handleAddRecommended(rec)}
                title={rec.description}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: '#fff',
                  border: '1px solid #bfdbfe',
                  color: '#1d4ed8',
                  borderRadius: '6px',
                  padding: '4px 9px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#60a5fa' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#bfdbfe' }}
              >
                <Plus size={11} /> {rec.label}
                <code style={{ fontSize: '9.5px', color: '#64748b', background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>{rec.key}</code>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty State when no fields yet */}
      {fields.length === 0 && (
        <div style={{
          background: '#f8fafc',
          border: '1px dashed #cbd5e1',
          borderRadius: '10px',
          padding: '24px 20px',
          textAlign: 'center',
          marginBottom: '16px'
        }}>
          <Sparkles size={24} style={{ color: 'var(--orange)', marginBottom: '8px' }} />
          <div style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>
            No Preselected Extraction Fields
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', maxWidth: '500px', margin: '4px auto 12px' }}>
            Upload your project documents in the Gemini section above and click <strong>"Generate Prompt &amp; Extractions"</strong>. Gemini will automatically extract project-specific fields tailored for your pitch, or you can add custom fields below.
          </div>
          {dbFields.length > 0 && (
            <button
              type="button"
              onClick={() => setFields(dbFields)}
              style={{
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#475569',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Optional: Load Default Portal Fields
            </button>
          )}
        </div>
      )}

      {/* Category → Subcategory grouped fields */}
      {Object.entries(grouped).map(([cat, subcats]) => {
        const colors = catColors[cat] || catColors['Custom']
        return (
          <div key={cat} style={{ marginBottom: '18px' }}>
            {/* Category header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '10px' }}>
              {cat === 'Core' ? <Table size={13} style={{ color: '#2563eb' }} /> : <Tag size={13} style={{ color: '#d97706' }} />}
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>{cat} Fields</span>
              <span style={{ background: colors.badge, color: colors.badgeText, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, fontFamily: 'monospace' }}>
                TABLE: {cat === 'Core' ? 'pitch_calls' : 'pitch_call_answers'}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>
                {cat === 'Core' ? 'Stored in dedicated columns' : 'Stored as key-value rows'}
              </span>
            </div>

            {/* Subcategory sections */}
            {Object.entries(subcats).map(([sub, subFields]) => (
              <div key={sub} style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', paddingLeft: '4px' }}>
                  ↳ {sub}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '8px' }}>
                  {subFields.map(f => (
                    <div key={f.key} style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 12px', borderRadius: '8px', border: f.enabled ? `1px solid ${colors.border}` : '1px solid #e2e8f0', background: f.enabled ? colors.bg : '#fcfcfc', cursor: 'pointer', transition: 'all 0.15s ease' }}
                      onClick={() => toggleField(f.key)}>
                      <div style={{ marginTop: '2px', color: f.enabled ? colors.check : '#94a3b8', flexShrink: 0 }}>
                        {f.enabled ? <CheckSquare size={15} /> : <Square size={15} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: f.enabled ? '#0f172a' : '#64748b' }}>{f.label}</span>
                          <code style={{ fontSize: '10px', background: f.enabled ? colors.badge : '#e2e8f0', color: f.enabled ? colors.badgeText : '#64748b', padding: '1px 5px', borderRadius: '4px' }}>{f.key}</code>
                          <span style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>({f.type})</span>
                        </div>
                        {f.description && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}>{f.description}</div>}
                      </div>
                      {!f.isCore && (
                        <button type="button" onClick={e => { e.stopPropagation(); removeCustomField(f.key) }}
                          style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {/* Add Custom Field */}
      {!showAddCustom ? (
        <button type="button" onClick={() => setShowAddCustom(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px dashed #cbd5e1', background: '#fff', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 700, color: '#103778', cursor: 'pointer' }}>
          <Plus size={14} /> Add Custom Extraction Field
        </button>
      ) : (
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', display: 'flex', justifyContent: 'space-between' }}>
            <span>Define New Extraction Field</span>
            <button type="button" onClick={() => setShowAddCustom(false)} style={{ border: 'none', background: 'none', color: '#64748b', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Field Key (slug)</label>
              <input
                value={newFieldKey}
                onChange={e => setNewFieldKey(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomField(e); } }}
                placeholder="e.g. decision_timeline"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Display Label *</label>
              <input
                value={newFieldLabel}
                onChange={e => setNewFieldLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomField(e); } }}
                placeholder="e.g. Decision Timeline"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Category</label>
              <select value={newFieldCategory} onChange={e => setNewFieldCategory(e.target.value)} style={{ ...inputStyle }}>
                <option value="Core">Core (pitch_calls)</option>
                <option value="Survey">Survey (pitch_call_answers)</option>
                <option value="Custom">Custom (pitch_call_answers)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Subcategory</label>
              <input
                value={newFieldSubcategory}
                onChange={e => setNewFieldSubcategory(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomField(e); } }}
                placeholder="e.g. Demo Preference"
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Extraction Instruction / Description</label>
            <input
              value={newFieldDesc}
              onChange={e => setNewFieldDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomField(e); } }}
              placeholder="e.g. Target month or quarter for decision making"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setShowAddCustom(false)}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '12px', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={handleAddCustomField}
              style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#103778', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Add Field</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_WELCOME_MESSAGE = 'नमस्ते {{contact_name}} जी, मैं अजय, वी डी ए आई बायोसेक से बात कर रहा हूँ।'

const DEFAULT_CALL_END_PROMPT = `कॉल तभी काटना जब: 
1. मीटिंग बुक हो जाए (Step 5E पूरा होने के बाद)।
2. अधिकारी 3 बार साफ़ मना कर दे (या "दोबारा कॉल मत करना" कह दे)।
3. अनुचित या अभद्र भाषा का प्रयोग हो।
महत्वपूर्ण: शुरुआती बातचीत, अभिवादन, या ग्राहक के 'जी', 'हाँ', 'बोलिए' कहने पर कॉल कभी मत काटना।`

// ─── Component ───────────────────────────────────────────────────────────────

export default function CreateAgent() {
  const nav = useNavigate()

  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [accountsError, setAccountsError] = useState(null)

  // Form fields
  const [name, setName] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState(DEFAULT_WELCOME_MESSAGE)
  const [welcomeMessageDelay, setWelcomeMessageDelay] = useState(0)
  const [fromPhoneNumber, setFromPhoneNumber] = useState('')
  const [selectedVoice, setSelectedVoice] = useState('iWNf11sz1GrUE4ppxTOL')
  const [selectedLanguage, setSelectedLanguage] = useState('hi')
  const [selectedProvider, setSelectedProvider] = useState('openai')
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini')
  const [temperature, setTemperature] = useState(0.2)
  const [maxTokens, setMaxTokens] = useState(250)
  const [prompt, setPrompt] = useState('')
  const [callEndPrompt, setCallEndPrompt] = useState(DEFAULT_CALL_END_PROMPT)
  const [knowledgeBase, setKnowledgeBase] = useState('')

  const isReasoningModel = useMemo(() => /(gpt-5|o1|o3)/i.test(selectedModel), [selectedModel])

  const availableModels = useMemo(() => {
    return MODELS_BY_PROVIDER[selectedProvider] || MODELS_BY_PROVIDER.openai
  }, [selectedProvider])

  const handleProviderChange = (prov) => {
    setSelectedProvider(prov)
    const models = MODELS_BY_PROVIDER[prov] || []
    if (models.length > 0) setSelectedModel(models[0].value)
  }

  // Bolna RAG KB
  const [ragKbs, setRagKbs] = useState([])
  const [selectedRagIds, setSelectedRagIds] = useState([])
  const [loadingKbs, setLoadingKbs] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [pdfMsg, setPdfMsg] = useState(null)

  // Call Transfer (transfer_call) settings
  const [transferEnabled, setTransferEnabled] = useState(false)
  const [transferNumber, setTransferNumber] = useState('')
  const [transferPreMessage, setTransferPreMessage] = useState('जी सर, मैं आपकी कॉल सीनियर टीम को ट्रांसफर कर रहा हूँ, कृपया एक सेकंड लाइन पर बने रहिए।')
  const [transferDescription, setTransferDescription] = useState('Trigger this tool ONLY AFTER the caller has explicitly confirmed they want to talk to the senior team now AND the caller has completely finished speaking their sentence. NEVER trigger immediately on a partial utterance or mid-sentence pause like "haan" if the caller intends to speak more.')

  // Extraction fields — loaded from DB
  const [extractionFields, setExtractionFields] = useState([])
  const [dbFields, setDbFields] = useState([])
  const [loadingDbFields, setLoadingDbFields] = useState(false)

  // Agent templates — loaded from DB
  const [templates, setTemplates] = useState([])
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [templateMsg, setTemplateMsg] = useState(null)

  // Gemini document generator & Key management
  const [genFiles, setGenFiles] = useState([])
  const [genHint, setGenHint] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState(null)
  const [genError, setGenError] = useState(null)
  const [showKeyManager, setShowKeyManager] = useState(false)
  const [geminiKeys, setGeminiKeys] = useState([])
  const [newGeminiKey, setNewGeminiKey] = useState('')
  const [keyActionMsg, setKeyActionMsg] = useState(null)
  const [loadingKeys, setLoadingKeys] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [formSuccess, setFormSuccess] = useState(null)

  const loadKnowledgebases = useCallback((acctId, silent = false) => {
    if (!silent) setLoadingKbs(true)
    api.knowledgebases(acctId || null)
      .then(res => setRagKbs(Array.isArray(res.data) ? res.data : []))
      .catch(() => setRagKbs([]))
      .finally(() => { if (!silent) setLoadingKbs(false) })
  }, [])

  // Check if any attached RAG document is still processing on Bolna AI
  const processingRagKbs = useMemo(() => {
    return ragKbs.filter(k => selectedRagIds.includes(k.rag_id) && (k.status === 'processing' || k.status === 'queued' || !k.status))
  }, [ragKbs, selectedRagIds])

  const hasProcessingRag = uploadingPdf || processingRagKbs.length > 0

  // Auto-poll knowledgebases every 2.5s while any attached RAG is processing
  useEffect(() => {
    if (!hasProcessingRag) return
    const timer = setInterval(() => {
      loadKnowledgebases(selectedAccountId, true)
    }, 2500)
    return () => clearInterval(timer)
  }, [hasProcessingRag, selectedAccountId, loadKnowledgebases])

  const loadAccounts = useCallback(() => {
    setLoadingAccounts(true)
    setAccountsError(null)
    api.bolnaAccounts()
      .then(r => {
        const data = r.data || []
        setAccounts(data)
        const def = data.find(a => Number(a.is_default) === 1) || data[0]
        if (def) {
          setSelectedAccountId(String(def.id))
          loadKnowledgebases(def.id)
        } else {
          loadKnowledgebases(null)
        }
      })
      .catch(err => {
        setAccountsError(err.message || 'Failed to load accounts')
      })
      .finally(() => setLoadingAccounts(false))
  }, [loadKnowledgebases])

  // ── Load initial data ────────────────────────────────────────────────────────
  useEffect(() => {
    loadAccounts()

    // Load baseline extraction fields from DB for reference (do not pre-populate: let Gemini generate or user add)
    setLoadingDbFields(true)
    api.extractionFields()
      .then(r => {
        const obsolete = ['student_volume', 'college_count', 'current_verification_method']
        const fields = (Array.isArray(r.data) ? r.data : []).filter(f => !obsolete.includes(f.key || f.field_key))
        setDbFields(fields)
        // Keep extractionFields empty initially so Gemini model sets project-specific extractions
      })
      .catch(() => { })
      .finally(() => setLoadingDbFields(false))

    // Load agent templates from DB
    api.agentTemplates()
      .then(r => setTemplates(Array.isArray(r.data) ? r.data : []))
      .catch(() => { })
  }, [loadAccounts])

  const accountOptions = useMemo(() =>
    accounts.map(a => ({ value: String(a.id), label: a.label + (Number(a.is_default) === 1 ? ' (Default)' : ''), subtitle: `${a.api_key} · ${a.agent_count} agent(s)` })),
    [accounts]
  )

  // ── Load a template from DB ──────────────────────────────────────────────────
  const handleLoadTemplate = async (slug) => {
    if (!slug) return
    setLoadingTemplate(true)
    setTemplateMsg(null)
    try {
      const r = await api.agentTemplate(slug)
      const t = r.data
      if (t.welcome_message) setWelcomeMessage(t.welcome_message)
      if (t.system_prompt) setPrompt(t.system_prompt)
      if (t.knowledge_base) setKnowledgeBase(t.knowledge_base)
      if (t.voice_id) setSelectedVoice(t.voice_id)
      if (t.language) setSelectedLanguage(t.language)
      if (t.llm_model || t.llm_provider) {
        const rawModel = t.llm_model || 'gemini-3.7-flash'
        let rawProv = t.llm_provider || ''
        if (!rawProv && rawModel.includes('/')) {
          rawProv = rawModel.split('/')[0]
        }
        let p = 'google'
        if (rawProv === 'gemini' || rawProv === 'google' || rawModel.startsWith('gemini')) {
          p = 'google'
        } else {
          p = 'openai'
        }
        setSelectedProvider(p)

        let clean = rawModel.includes('/') ? rawModel.split('/')[1] : rawModel
        clean = clean.replace(/\s+cluster$/i, '').trim()
        if (clean === 'gpt-4.0-mini' || clean === 'gpt-4.1-mini') clean = 'gpt-4o-mini'
        setSelectedModel(clean || (p === 'openai' ? 'gpt-4o-mini' : 'gemini-3.7-flash'))
      }
      if (t.call_end_prompt) setCallEndPrompt(t.call_end_prompt)
      setTemplateMsg({ type: 'success', text: `Template "${t.name}" loaded!` })
      setTimeout(() => setTemplateMsg(null), 3000)
    } catch (e) {
      setTemplateMsg({ type: 'error', text: e.message || 'Failed to load template' })
    } finally {
      setLoadingTemplate(false)
    }
  }

  // ── PDF Upload ───────────────────────────────────────────────────────────────
  const handlePdfUpload = async (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) { alert('Bolna only accepts PDF files.'); return }
    const fd = new FormData(); fd.append('file', file)
    setUploadingPdf(true); setPdfMsg(null)
    try {
      const res = await api.uploadKnowledgebase(fd, selectedAccountId || null)
      const d = res.data || res
      setPdfMsg({
        type: 'info',
        text: `Uploaded "${d.file_name}" (RAG ID: ${d.rag_id}). Bolna AI is processing embeddings. Create button will enable automatically once processing completes.`
      })
      if (d.rag_id) setSelectedRagIds(prev => [...new Set([...prev, d.rag_id])])
      loadKnowledgebases(selectedAccountId)
    } catch (err) {
      setPdfMsg({ type: 'error', text: err.message || 'Upload failed' })
    } finally { setUploadingPdf(false) }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.name.toLowerCase().endsWith('.pdf')) { handlePdfUpload(file); e.target.value = ''; return }
    const reader = new FileReader()
    reader.onload = (ev) => { if (typeof ev.target?.result === 'string') setKnowledgeBase(prev => prev ? `${prev}\n\n---\n\n${ev.target.result}` : ev.target.result) }
    reader.readAsText(file); e.target.value = ''
  }

  // ── Gemini Key Management ──────────────────────────────────────────────────
  const loadGeminiKeys = useCallback(async () => {
    setLoadingKeys(true)
    try {
      const res = await api.geminiKeys()
      setGeminiKeys(res.keys || [])
    } catch (_) {
      setGeminiKeys([])
    } finally {
      setLoadingKeys(false)
    }
  }, [])

  const handleAddGeminiKey = async (e) => {
    e.preventDefault()
    if (!newGeminiKey.trim()) return
    setKeyActionMsg(null)
    try {
      await api.addGeminiKey(newGeminiKey.trim())
      setNewGeminiKey('')
      setKeyActionMsg({ type: 'success', text: 'Gemini API key added successfully!' })
      loadGeminiKeys()
    } catch (err) {
      setKeyActionMsg({ type: 'error', text: err.message || 'Failed to add key' })
    }
  }

  const handleDeleteGeminiKey = async (index) => {
    if (!window.confirm('Delete this Gemini API key from portal?')) return
    setKeyActionMsg(null)
    try {
      await api.deleteGeminiKey(index)
      setKeyActionMsg({ type: 'success', text: 'Gemini key deleted.' })
      loadGeminiKeys()
    } catch (err) {
      setKeyActionMsg({ type: 'error', text: err.message || 'Failed to delete key' })
    }
  }

  // ── Gemini Generate (Multiple Documents Support) ───────────────────────────
  const handleFilesSelect = (e) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length === 0) return
    setGenFiles(prev => {
      const existingKeys = new Set(prev.map(f => `${f.name}-${f.size}`))
      const fresh = selected.filter(f => !existingKeys.has(`${f.name}-${f.size}`))
      return [...prev, ...fresh]
    })
    setGenResult(null)
    setGenError(null)
    e.target.value = ''
  }

  const handleRemoveFile = (indexToRemove) => {
    setGenFiles(prev => prev.filter((_, idx) => idx !== indexToRemove))
    setGenResult(null)
  }

  const handleClearAllFiles = () => {
    setGenFiles([])
    setGenResult(null)
    setGenError(null)
  }

  const handleGenerate = async () => {
    if (genFiles.length === 0) return
    setGenerating(true)
    setGenError(null)
    setGenResult(null)
    try {
      const fd = new FormData()
      genFiles.forEach(f => {
        fd.append('files[]', f)
      })
      if (genFiles.length > 0) {
        fd.append('file', genFiles[0])
      }
      if (genHint.trim()) {
        fd.append('project_hint', genHint.trim())
      }
      const result = await api.generateFromDocument(fd)
      setGenResult(result)
    } catch (err) {
      setGenError(err.message || 'Generation failed. Make sure a Gemini API key is configured.')
    } finally {
      setGenerating(false)
    }
  }

  const handleApplyGenResult = () => {
    if (!genResult) return
    if (genResult.system_prompt) {
      let cleanP = genResult.system_prompt.replace(/آدرش\s*بات\s*چیت\s*کا\s*سٹیک\s*ادھارن/g, 'आदर्श बातचीत का सटीक उदाहरण')
      cleanP = cleanP.replace(/[\u0600-\u06FF]+/g, '')
      setPrompt(cleanP)
    }
    if (genResult.knowledge_base) setKnowledgeBase(genResult.knowledge_base)
    if (genResult.welcome_message) setWelcomeMessage(genResult.welcome_message)
    if (genResult.call_end_prompt) setCallEndPrompt(genResult.call_end_prompt)
    if (genResult.extraction_fields && Array.isArray(genResult.extraction_fields) && genResult.extraction_fields.length > 0) {
      setExtractionFields(genResult.extraction_fields)
    }
    if (genResult.call_transfer_description) {
      setTransferDescription(genResult.call_transfer_description)
    }
    if (genResult.call_transfer_pre_message) {
      setTransferPreMessage(genResult.call_transfer_pre_message)
    }
    // Auto-fill project / agent name if not already filled
    if (!name.trim()) {
      const match = genResult.system_prompt?.match(/\[PROJECT_NAME\]\s*=\s*"([^"]+)"/)
      if (match && match[1]) {
        setName(match[1])
      }
    }
    setGenResult(null)
    setGenFiles([])
    setGenError(null)
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null); setFormSuccess(null)
    if (!name.trim()) { setFormError('Agent Name is required.'); return }
    if (!welcomeMessage.trim()) { setFormError('Welcome Message is required.'); return }
    if (!prompt.trim()) { setFormError('System Prompt is required.'); return }
    if (transferEnabled && !transferNumber.trim()) {
      setFormError('Transfer Destination Number is required when Call Transfer is enabled.')
      return
    }
    const voiceObj = VOICE_OPTIONS.find(v => v.value === selectedVoice)
    setSubmitting(true)
    try {
      let cleanPrompt = prompt.trim()
      cleanPrompt = cleanPrompt.replace(/آدرش\s*بات\s*چیت\s*کا\s*سٹیک\s*ادھارن/g, 'आदर्श बातचीत का सटीक उदाहरण')
      cleanPrompt = cleanPrompt.replace(/[\u0600-\u06FF]+/g, '')

      const callTransferConfig = transferEnabled && transferNumber.trim() ? {
        enabled: true,
        transfer_number: transferNumber.trim(),
        pre_call_message: transferPreMessage.trim() || 'Theek hai, main call transfer kar raha hu, kripya wait kijiye.',
        description: transferDescription.trim() || 'Use when the caller asks to speak to a human officer.',
      } : null

      const res = await api.createAgent({
        name: name.trim(), welcome_message: welcomeMessage.trim(),
        welcome_message_delay: Number(welcomeMessageDelay) || 0,
        from_phone_number: fromPhoneNumber.trim() || null,
        system_prompt: cleanPrompt, knowledge_base: knowledgeBase.trim(),
        call_end_prompt: callEndPrompt.trim(),
        extraction_config: extractionFields,
        call_transfer_config: callTransferConfig,
        voice_id: selectedVoice, voice_name: voiceObj?.name || 'Viraj - Warm, Energetic and Lively',
        language: selectedLanguage, llm_model: selectedModel,
        llm_provider: selectedProvider,
        temperature: isReasoningModel ? 1.0 : Number(temperature),
        max_tokens: Number(maxTokens),
        bolna_account_id: selectedAccountId ? Number(selectedAccountId) : null,
        rag_ids: selectedRagIds,
      })
      setFormSuccess(`Agent "${name.trim()}" created on Bolna AI! ID: ${res.bolna_agent_id || '—'}`)
      setTimeout(() => nav('/agents'), 2000)
    } catch (err) { setFormError(err.message || 'Failed to create agent. Check your Bolna API key.') }
    finally { setSubmitting(false) }
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <button type="button" onClick={() => nav('/agents')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
          <ArrowLeft size={14} /> Back to Agents
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#103778', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} style={{ color: '#f26522' }} /> Create New Bolna AI Agent
          </h2>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            Configure a custom voice agent, or load a saved template from the database.
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {formError && <Banner type="error">{formError}</Banner>}
        {formSuccess && <Banner type="success">{formSuccess} Redirecting...</Banner>}

        {/* Card 1: Identity */}
        <div style={cardStyle}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '14px' }}>Agent Identity</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Agent Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ajay (Vdai Biosec Outreach)" required style={inputStyle} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Bolna Account (API Key Source)</label>
                {accounts.length === 0 && (
                  <button
                    type="button"
                    onClick={loadAccounts}
                    disabled={loadingAccounts}
                    style={{ fontSize: '11px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {loadingAccounts ? 'Loading…' : '↻ Reload'}
                  </button>
                )}
              </div>
              <SearchableSelect
                options={accountOptions}
                value={selectedAccountId}
                onChange={val => { setSelectedAccountId(val); loadKnowledgebases(val) }}
                placeholder={loadingAccounts ? "Loading accounts..." : "-- Select Bolna Account --"}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Voice & Model */}
        <div style={cardStyle}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '14px' }}>Voice & Model Configuration</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Spoken Language</label>
              <SearchableSelect options={LANGUAGE_OPTIONS} value={selectedLanguage} onChange={setSelectedLanguage} placeholder="Select Language" />
            </div>
            <div>
              <label style={labelStyle}>Voice Identity (ElevenLabs)</label>
              <SearchableSelect options={VOICE_OPTIONS} value={selectedVoice} onChange={setSelectedVoice} placeholder="Select Voice" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>LLM Provider (Family)</label>
              <SearchableSelect options={LLM_PROVIDERS} value={selectedProvider} onChange={handleProviderChange} placeholder="Select Provider" />
            </div>
            <div>
              <label style={labelStyle}>LLM Model</label>
              <SearchableSelect options={availableModels} value={selectedModel} onChange={setSelectedModel} placeholder="Select Model" />
            </div>
          </div>

          {/* Model Parameters: Tokens & Temperature */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Model Parameters
              </span>
              {isReasoningModel && (
                <span style={{ fontSize: '11px', color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                  ⚡ Reasoning model: Temperature locked to 1.0 on Bolna
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    Tokens generated on each LLM output
                  </label>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#103778', background: '#eff6ff', padding: '1px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                    {maxTokens}
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="10"
                  value={maxTokens}
                  onChange={e => setMaxTokens(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#103778', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
                  <span>50</span>
                  <span>Default: 250</span>
                  <span>1000</span>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    Temperature
                  </label>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#103778', background: '#eff6ff', padding: '1px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                    {isReasoningModel ? '1.0' : temperature}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  disabled={isReasoningModel}
                  value={isReasoningModel ? 1.0 : temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#103778', cursor: isReasoningModel ? 'not-allowed' : 'pointer', opacity: isReasoningModel ? 0.6 : 1 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
                  <span>0.0 (Deterministic)</span>
                  <span>Default: 0.2</span>
                  <span>1.0 (Creative)</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '14px', alignItems: 'flex-start' }}>
            <div>
              <label style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
                <span>Welcome Message *</span>
                <span style={{ fontSize: '11px', fontWeight: 400, color: '#94a3b8' }}><code>{'{contact_name}'}</code></span>
              </label>
              <input value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} placeholder="e.g. नमस्ते! मैं अजय बोल रहा हूँ..." required style={inputStyle} />
            </div>
            <div>
              <label style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
                <span>Welcome Delay (ms)</span>
                <span style={{ fontSize: '11px', fontWeight: 400, color: '#94a3b8' }}>0 - 1000ms</span>
              </label>
              <input
                type="number"
                min="0"
                max="5000"
                step="50"
                value={welcomeMessageDelay}
                onChange={e => setWelcomeMessageDelay(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                style={inputStyle}
              />
            </div>
          </div>
          <br />
          <div>
            <label style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
              <span>Outbound Caller ID (From Phone Number)</span>
              <span style={{ fontSize: '11px', fontWeight: 400, color: '#94a3b8' }}>Optional — Purchased number (e.g. +9180XXXXXXXX)</span>
            </label>
            <input
              value={fromPhoneNumber}
              onChange={e => setFromPhoneNumber(e.target.value)}
              placeholder="Leave blank to use Bolna default numbers, or enter purchased number e.g. +9180XXXXXXXX"
              style={inputStyle}
            />
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
              Agar aapne Bolna ya SIP Trunk se dedicated number buy kiya hai to yahan daalein. Khali chhodne par Bolna default pool se call lagayega.
            </div>
          </div>
        </div>

        {/* ── CARD: AI Generate System Prompt & KB from Document (Gemini LLM) ── */}
        <div style={{ ...cardStyle, border: '1px solid #e2e8f0', background: '#fafafa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} style={{ color: '#f26522' }} />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#103778', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                AI Generate: System Prompt, KB &amp; Extractions (Gemini LLM)
              </span>
              <span style={{ background: '#eff6ff', color: '#103778', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                p2.txt Engine
              </span>
            </div>
            <button
              type="button"
              onClick={() => nav('/keys')}
              style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', padding: '5px 12px', fontSize: '11.5px', fontWeight: 700, color: '#103778', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <Key size={13} style={{ color: '#f26522' }} /> Manage API Keys →
            </button>
          </div>

          <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px', lineHeight: 1.5 }}>
            Upload one or multiple project documents (.pdf, .txt, .md). Gemini will analyze all of them together and auto-generate the <strong>System Prompt (p2.txt format)</strong>, <strong>Knowledge Base</strong>, and <strong>Extraction Fields</strong>.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>1. Upload Project Documents * (.pdf, .txt, .md)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px dashed #103778', background: '#eff6ff', color: '#103778', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                    <UploadCloud size={14} /> {genFiles.length === 0 ? 'Choose Documents (Select Multiple)' : '+ Add More Documents'}
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.txt,.md,.doc,.docx"
                      onChange={handleFilesSelect}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {genFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllFiles}
                      style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      Clear All ({genFiles.length})
                    </button>
                  )}
                </div>

                {/* Uploaded Files Chips */}
                {genFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '130px', overflowY: 'auto', padding: '4px 0' }}>
                    {genFiles.map((f, idx) => (
                      <span
                        key={`${f.name}-${idx}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px',
                          padding: '4px 8px', fontSize: '11.5px', color: '#1e293b', boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      >
                        <FileText size={13} style={{ color: '#103778' }} />
                        <span style={{ maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={f.name}>
                          {f.name}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          ({(f.size / 1024).toFixed(1)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          title="Remove file"
                          style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0 2px', display: 'inline-flex', alignItems: 'center' }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label style={labelStyle}>2. Optional Project Context / Hint</label>
              <input
                value={genHint}
                onChange={e => setGenHint(e.target.value)}
                placeholder="e.g. Panchayat Gateway voucher monitoring system in UP"
                style={inputStyle}
              />
            </div>
          </div>

          {genError && <div style={{ marginBottom: '12px' }}><Banner type="error">{genError}</Banner></div>}

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={genFiles.length === 0 || generating}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '9px 18px', borderRadius: '8px',
                background: (genFiles.length === 0 || generating) ? '#94a3b8' : '#f26522',
                color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none',
                cursor: (genFiles.length === 0 || generating) ? 'not-allowed' : 'pointer',
                boxShadow: (genFiles.length === 0 || generating) ? 'none' : '0 2px 8px rgba(242,101,34,0.35)',
              }}
            >
              {generating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Analyzing {genFiles.length} Document(s) with Gemini AI...
                </>
              ) : (
                <>
                  <Sparkles size={14} /> Generate System Prompt &amp; KB ({genFiles.length || 0} Docs)
                </>
              )}
            </button>
            {generating && (
              <span style={{ fontSize: '11.5px', color: '#6366f1', fontStyle: 'italic' }}>
                Synthesizing documents, structuring data points &amp; clubbing discrepancies...
              </span>
            )}
          </div>

          {/* Generated Result Preview Card */}
          {genResult && (
            <div style={{ marginTop: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Check size={16} /> Prompt, Knowledge Base &amp; Extractions Generated Successfully!
                  </div>
                  {genResult.model_used && (
                    <div style={{ fontSize: '11px', color: '#15803d', marginTop: '2px' }}>
                      Generated using model: <code>{genResult.model_used}</code>
                    </div>
                  )}
                  {Array.isArray(genResult.analyzed_files) && genResult.analyzed_files.length > 0 && (
                    <div style={{ fontSize: '11.5px', color: '#166534', fontWeight: 600, marginTop: '4px' }}>
                      📁 Analyzed {genResult.analyzed_files.length} document(s): {genResult.analyzed_files.map(f => `${f.name} (${f.size})`).join(', ')}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setGenResult(null)}
                  style={{ border: 'none', background: 'none', color: '#64748b', fontSize: '11px', cursor: 'pointer' }}
                >
                  Dismiss
                </button>
              </div>

              {/* Project Summary Box */}
              {genResult.summary && (
                <div style={{ background: '#fff', border: '1px solid #dcfce7', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#166534', textTransform: 'uppercase', marginBottom: '4px' }}>
                    📋 Executive Project Summary
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#1e293b', lineHeight: 1.5 }}>
                    {genResult.summary}
                  </div>
                </div>
              )}

              {/* Stats badges */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                  ✓ System Prompt ({genResult.system_prompt?.length || 0} chars)
                </span>
                <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                  ✓ Knowledge Base ({genResult.knowledge_base?.length || 0} chars)
                </span>
                <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                  ✓ {genResult.extraction_fields?.length || 0} Extraction Fields
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleApplyGenResult}
                  style={{
                    background: '#16a34a', color: '#fff', border: 'none',
                    borderRadius: '6px', padding: '8px 16px', fontSize: '12.5px',
                    fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(22, 163, 74, 0.3)',
                  }}
                >
                  🚀 Apply to Agent (Auto-fill Form)
                </button>
                <button
                  type="button"
                  onClick={() => setGenResult(null)}
                  style={{
                    background: '#fff', color: '#475569', border: '1px solid #cbd5e1',
                    borderRadius: '6px', padding: '8px 14px', fontSize: '12px',
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Card 3: System Prompt — with DB template loader */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              System Prompt *
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {prompt && (
                <button type="button" onClick={() => { setPrompt(''); setWelcomeMessage(''); setKnowledgeBase('') }}
                  style={{ border: 'none', background: 'none', color: '#94a3b8', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Clear All</button>
              )}
              {/* DB Template Loader */}
              {/* {templates.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Load Template:</span>
                  {templates.map(t => (
                    <button key={t.slug} type="button"
                      disabled={loadingTemplate}
                      onClick={() => handleLoadTemplate(t.slug)}
                      style={{ border: '1px solid #f26522', background: loadingTemplate ? '#fef3c7' : '#fff7ed', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', fontWeight: 700, color: '#c2410c', cursor: loadingTemplate ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {loadingTemplate ? <RefreshCw size={10} className="animate-spin" /> : <Sparkles size={10} />}
                      {t.name.replace(/ — (ITI CCIMS Government Outreach|Outreach Portal)/, '').replace('Ajay', '📋 Ajay')}
                    </button>
                  ))}
                </div>
              )} */}
            </div>
          </div>

          {templateMsg && <div style={{ marginBottom: '8px' }}><Banner type={templateMsg.type}>{templateMsg.text}</Banner></div>}

          <textarea rows={13} value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder={`# ROLE & OBJECTIVE\nDescribe your agent's identity, objectives, and conversation rules...\n\n(Tip: Click a template button above to auto-fill from database)`}
            required style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12.5px', resize: 'vertical', lineHeight: 1.6 }} />
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{prompt.length} characters</div>
        </div>

        {/* Card 3b: Call-End Prompt */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={15} style={{ color: '#d97706' }} />
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Call-End / Post-Call Prompt
              </div>
              <span style={{ fontSize: '10px', background: '#fefce8', color: '#a16207', border: '1px solid #fde68a', padding: '1px 7px', borderRadius: '4px', fontWeight: 700 }}>
                Bolna Post-Call
              </span>
            </div>
            {callEndPrompt && (
              <button type="button" onClick={() => setCallEndPrompt('')}
                style={{ border: 'none', background: 'none', color: '#94a3b8', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Clear</button>
            )}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '10px', lineHeight: 1.5 }}>
            This prompt executes on Bolna right after the call terminates — configure instructions for call summary, extraction, or disposition reasoning. (Leave empty to use system prompt).
          </div>
          <textarea rows={5} value={callEndPrompt} onChange={e => setCallEndPrompt(e.target.value)}
            placeholder={`e.g.\nExtract the call outcome in the following JSON format:\n{\n  "interest": "interested / maybe / not_interested",\n  "callback_requested": true,\n  "summary": "Brief 2-line summary of discussion"\n}`}
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px', resize: 'vertical', lineHeight: 1.5 }} />
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{callEndPrompt.length} characters</div>
        </div>

        {/* Card 4: Knowledge Base */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Knowledge Base (Context & Bolna RAG)</div>
              <span style={{ fontSize: '10.5px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 7px', borderRadius: '4px', fontWeight: 700 }}>Canvas Synced</span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {knowledgeBase && (
                <button type="button" onClick={() => setKnowledgeBase('')}
                  style={{ border: 'none', background: 'none', color: '#94a3b8', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Clear</button>
              )}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#103778', cursor: 'pointer' }}>
                <UploadCloud size={12} /> Upload (.pdf / .txt / .md)
                <input type="file" accept=".pdf,.txt,.md,.csv,.json" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          <textarea rows={8} value={knowledgeBase} onChange={e => setKnowledgeBase(e.target.value)}
            placeholder="FAQs, institutional background, objection handling scripts, product details..."
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12.5px', resize: 'vertical', lineHeight: 1.6 }} />
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', marginBottom: '14px' }}>
            {knowledgeBase.length} characters — synced to Bolna Canvas for zero-latency in-call recall.
          </div>

          {/* Bolna RAG Upload */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Database size={15} style={{ color: '#103778' }} />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#103778' }}>
                    Bolna RAG Knowledge Bases (LanceDB Vector Store)
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  Upload PDFs to Bolna. Select multiple KBs to attach via LanceDB vector store RAG.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button type="button" onClick={() => loadKnowledgebases(selectedAccountId)}
                  disabled={loadingKbs}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#103778', fontSize: '11px', fontWeight: 700, cursor: loadingKbs ? 'not-allowed' : 'pointer' }}>
                  <RefreshCw size={12} className={loadingKbs ? 'animate-spin' : ''} /> Refresh List
                </button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', background: uploadingPdf ? '#94a3b8' : '#103778', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: uploadingPdf ? 'not-allowed' : 'pointer' }}>
                  {uploadingPdf ? <><RefreshCw size={12} className="animate-spin" /> Uploading...</> : <><UploadCloud size={12} /> Upload PDF to Bolna</>}
                  <input type="file" accept=".pdf" disabled={uploadingPdf} onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = '' }} style={{ display: 'none' }} />
                </label>
              </div>
            </div>

            {pdfMsg && <div style={{ marginBottom: '8px' }}><Banner type={pdfMsg.type}>{pdfMsg.text}</Banner></div>}

            {/* Selected Knowledge Bases Chips / Pills */}
            <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', background: selectedRagIds.length > 0 ? '#eff6ff' : '#f8fafc', border: `1px solid ${selectedRagIds.length > 0 ? '#bfdbfe' : '#e2e8f0'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: selectedRagIds.length > 0 ? '8px' : 0 }}>
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: selectedRagIds.length > 0 ? '#1e40af' : '#64748b' }}>
                  {selectedRagIds.length > 0
                    ? `✓ ${selectedRagIds.length} Knowledge Base${selectedRagIds.length > 1 ? 's' : ''} Selected (Attached to Agent)`
                    : 'No Knowledge Base attached yet'}
                </span>
                {selectedRagIds.length > 0 && (
                  <button type="button" onClick={() => setSelectedRagIds([])}
                    style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    Remove All Selection
                  </button>
                )}
              </div>

              {selectedRagIds.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {selectedRagIds.map(ragId => {
                    const matched = ragKbs.find(k => k.rag_id === ragId)
                    const label = matched?.file_name || `KB (${ragId.slice(0, 10)}...)`
                    return (
                      <span key={ragId}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #93c5fd', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: '#1e3a8a', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <FileText size={12} style={{ color: '#2563eb' }} />
                        <span>{label}</span>
                        <code style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>
                          {ragId.slice(0, 8)}...
                        </code>
                        <button type="button"
                          title="Remove from selection"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedRagIds(prev => prev.filter(i => i !== ragId))
                          }}
                          style={{ border: 'none', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: '2px', padding: 0 }}>
                          <X size={10} />
                        </button>
                      </span>
                    )
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  Select from the uploaded Knowledge Bases below or click "Upload PDF to Bolna" to add one.
                </div>
              )}
            </div>

            {/* RAG IDs Debug Panel (Hidden / Commented)
            {selectedRagIds.length > 0 && (
              <details style={{ marginBottom: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px' }}>
                <summary style={{ fontSize: '11px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>🔍 Debug: Full RAG IDs sent to Bolna ({selectedRagIds.length})</summary>
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {selectedRagIds.map((ragId, i) => {
                    const matched = ragKbs.find(k => k.rag_id === ragId)
                    return (
                      <div key={ragId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', borderRadius: '4px', background: '#fff', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '10px', color: '#94a3b8', minWidth: '16px' }}>{i + 1}.</span>
                        <code style={{ fontSize: '11px', color: '#1e40af', flex: 1, wordBreak: 'break-all' }}>{ragId}</code>
                        <span style={{ fontSize: '10px', color: '#64748b', flexShrink: 0 }}>{matched ? `✓ ${matched.file_name} (${matched.status})` : '⚠ Not in list'}</span>
                      </div>
                    )
                  })}
                  <div style={{ marginTop: '6px', fontSize: '10px', color: '#64748b', fontFamily: 'monospace', background: '#f1f5f9', padding: '6px 8px', borderRadius: '4px', wordBreak: 'break-all' }}>
                    JSON → Bolna: {JSON.stringify(selectedRagIds)}
                  </div>
                </div>
              </details>
            )}
            */}

            {/* Uploaded Knowledge Bases List */}
            <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Available Knowledge Bases on Bolna ({ragKbs.length})</span>
                {ragKbs.length > 1 && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button"
                      onClick={() => setSelectedRagIds(ragKbs.map(k => k.rag_id).filter(Boolean))}
                      style={{ border: 'none', background: 'none', color: '#103778', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                      Select All
                    </button>
                    <span style={{ color: '#cbd5e1' }}>|</span>
                    <button type="button"
                      onClick={() => setSelectedRagIds([])}
                      style={{ border: 'none', background: 'none', color: '#64748b', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                      Deselect All
                    </button>
                  </div>
                )}
              </div>

              {loadingKbs ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <RefreshCw size={14} className="animate-spin" /> Loading Knowledge Bases from Bolna...
                </div>
              ) : ragKbs.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                  No Knowledge Bases found on this Bolna account. Upload your first PDF using the button above.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {ragKbs.map((kb, idx) => {
                    const isSel = selectedRagIds.includes(kb.rag_id)
                    return (
                      <div key={kb.rag_id || idx}
                        onClick={() => setSelectedRagIds(prev => isSel ? prev.filter(i => i !== kb.rag_id) : [...prev, kb.rag_id])}
                        style={{
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${isSel ? '#3b82f6' : '#e2e8f0'}`,
                          background: isSel ? '#eff6ff' : '#fff',
                          transition: 'all 0.15s ease',
                        }}>
                        <input type="checkbox"
                          checked={isSel}
                          onChange={() => { }}
                          style={{ accentColor: '#103778', width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                        <FileText size={16} style={{ color: isSel ? '#2563eb' : '#64748b', flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                          <span style={{ fontWeight: 700, color: isSel ? '#1e3a8a' : '#1e293b', fontSize: '12.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {kb.file_name}
                          </span>
                          <span style={{ fontSize: '10px', color: '#64748b' }}>
                            RAG ID: <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px' }}>{kb.rag_id}</code>
                          </span>
                        </div>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: kb.status === 'processed' ? '#dcfce7' : (kb.status === 'error' ? '#fee2e2' : '#fef9c3'),
                          color: kb.status === 'processed' ? '#15803d' : (kb.status === 'error' ? '#b91c1c' : '#854d0e'),
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          flexShrink: 0,
                        }}>
                          {(kb.status === 'processing' || kb.status === 'queued' || !kb.status) && (
                            <RefreshCw size={10} className="animate-spin" />
                          )}
                          {kb.status || 'processing'}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: '5px',
                          background: isSel ? '#2563eb' : '#f1f5f9',
                          color: isSel ? '#fff' : '#475569',
                          flexShrink: 0,
                        }}>
                          {isSel ? 'Attached ✓' : '+ Attach'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {hasProcessingRag && (
              <div style={{ marginTop: '12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#92400e', fontWeight: 600 }}>
                <RefreshCw size={14} className="animate-spin" style={{ color: '#d97706', flexShrink: 0 }} />
                <span>Document embeddings are processing on Bolna AI. The <strong>Create Bolna AI Agent</strong> button is temporarily disabled until processing completes to prevent mismatch.</span>
              </div>
            )}
          </div>
        </div>

        {/* Card: Call Transfer to Human */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PhoneForwarded size={16} style={{ color: transferEnabled ? '#f26522' : '#64748b' }} />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#103778', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Call Transfer to Human Officer (Live Telephony)
              </span>
              <span style={{
                background: transferEnabled ? '#f0fdf4' : '#f1f5f9',
                color: transferEnabled ? '#15803d' : '#64748b',
                border: `1px solid ${transferEnabled ? '#bbf7d0' : '#cbd5e1'}`,
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 700
              }}>
                {transferEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={transferEnabled}
                onChange={e => setTransferEnabled(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#f26522', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px', fontWeight: 700, color: transferEnabled ? '#f26522' : '#475569' }}>
                Enable Call Transfer
              </span>
            </label>
          </div>

          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: transferEnabled ? '16px' : '0' }}>
            When a prospect or caller asks to speak to a real person / human officer, the AI will announce transfer and bridge the call in real time.
          </div>

          {transferEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>
                    Transfer Destination Number * <span style={{ fontWeight: 400, color: '#64748b' }}>(With Country Code)</span>
                  </label>
                  <input
                    value={transferNumber}
                    onChange={e => setTransferNumber(e.target.value)}
                    placeholder="e.g. +91XXXXXXXXXX"
                    style={{ ...inputStyle, borderColor: !transferNumber.trim() ? '#fca5a5' : '#cbd5e1' }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    Destination phone number for call transfer (E.164 format, e.g. <code>+91XXXXXXXXXX</code>).
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Pre-Transfer Spoken Message</label>
                  <input
                    value={transferPreMessage}
                    onChange={e => setTransferPreMessage(e.target.value)}
                    placeholder="Theek hai, main call transfer kar raha hu, kripya wait kijiye."
                    style={inputStyle}
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    What the AI speaks immediately before transferring the call.
                  </div>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Trigger Condition (LLM Tool Description)</label>
                <input
                  value={transferDescription}
                  onChange={e => setTransferDescription(e.target.value)}
                  placeholder="Use when the caller asks to speak to a human officer."
                  style={inputStyle}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Natural language instruction telling the LLM when to invoke this call transfer tool.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card 5: Extraction Fields — Category/Subcategory panel */}
        <ExtractionFieldsPanel
          fields={extractionFields}
          setFields={setExtractionFields}
          dbFields={dbFields}
          loadingDbFields={loadingDbFields}
        />

        {/* Submit */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingBottom: '24px' }}>
          <button type="button" onClick={() => nav('/agents')} disabled={submitting || hasProcessingRag}
            style={{ height: '40px', padding: '0 18px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '13px', fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || hasProcessingRag}
            style={{
              height: '40px',
              padding: '0 22px',
              borderRadius: '8px',
              border: 'none',
              background: (submitting || hasProcessingRag) ? '#94a3b8' : '#f26522',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: (submitting || hasProcessingRag) ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: (submitting || hasProcessingRag) ? 'none' : '0 2px 8px rgba(242,101,34,0.35)'
            }}>
            {submitting ? (
              <><RefreshCw size={14} className="animate-spin" /> Creating on Bolna AI...</>
            ) : uploadingPdf ? (
              <><RefreshCw size={14} className="animate-spin" /> Uploading PDF to Bolna...</>
            ) : hasProcessingRag ? (
              <><RefreshCw size={14} className="animate-spin" /> Processing Document ({processingRagKbs.length} pending)...</>
            ) : (
              <><Bot size={15} /> Create Bolna AI Agent</>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
