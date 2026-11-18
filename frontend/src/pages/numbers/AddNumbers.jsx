import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  UploadCloud,
  Download,
  AlertCircle,
  Trash2,
  Check,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { api } from '../../api'
import { INDIA_LOCATIONS, INDIAN_STATES } from '../../data/indiaLocations'
import SearchableSelect from '../../components/ui/SearchableSelect'

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

const DEFAULT_STATE = 'Uttar Pradesh'
const DEFAULT_DISTRICT = 'Lucknow'

const EMPTY = {
  contact_name: '',
  phone: '',
  organization: '',
  designation: '',
  sector: SECTORS[1],
  state: DEFAULT_STATE,
  district: DEFAULT_DISTRICT,
}

export default function AddNumbers() {
  const nav = useNavigate()
  const fileInputRef = useRef(null)
  const [tab, setTab] = useState('single')
  const [f, setF] = useState(EMPTY)
  const [bulk, setBulk] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  // Excel / CSV File Import State
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [parsedRows, setParsedRows] = useState([])
  const [isDragging, setIsDragging] = useState(false)

  // Handle state change & update districts list
  const availableDistricts = INDIA_LOCATIONS[f.state] || ['Other / Unspecified']

  const handleStateChange = (newState) => {
    const districts = INDIA_LOCATIONS[newState] || ['Other / Unspecified']
    setF({
      ...f,
      state: newState,
      district: districts[0] || '',
    })
  }

  const run = async (fn) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setMsg({ err: true, text: e.message || 'Operation failed' })
    } finally {
      setBusy(false)
    }
  }

  const addOne = (e) => {
    e.preventDefault()
    if (!f.contact_name.trim() || !f.phone.trim()) {
      setMsg({ err: true, text: 'Please fill in Contact Name and a valid 10-digit mobile number' })
      return
    }

    run(async () => {
      await api.addLead(f)
      setF({ ...EMPTY, state: f.state, district: f.district })
      setMsg({ ok: true, text: `Contact "${f.contact_name}" (${f.phone}) added to calling pool successfully ✔` })
    })
  }

  // --- Excel (.xlsx / .xls) and CSV File Processing ---
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const cleanPhone = (val) => {
    const digits = String(val || '').replace(/\D/g, '')
    return digits.length > 10 ? digits.slice(-10) : digits
  }

  const processFile = (file) => {
    setUploadedFileName(file.name)
    setMsg(null)
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        let sheetData = []
        if (isExcel) {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.SheetNames[0]
          sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: '' })
        } else {
          const text = e.target.result
          const lines = text.split(/\r?\n/).filter(l => l.trim())
          sheetData = lines.map(line => line.split(/[,\t|]/).map(c => c.trim()))
        }

        if (sheetData.length === 0) {
          setMsg({ err: true, text: 'The selected file is empty.' })
          setParsedRows([])
          return
        }

        // Detect if row 0 is a header row
        const row0 = sheetData[0].map(c => String(c).toLowerCase())
        let hasHeader = false
        let colMap = { phone: 0, name: 1, org: 2, desig: 3, sector: 4, state: 5, district: 6 }

        row0.forEach((h, idx) => {
          if (h.includes('phone') || h.includes('mobile') || h.includes('contact_no') || h.includes('number')) {
            colMap.phone = idx
            hasHeader = true
          } else if (h.includes('name') || h.includes('prospect')) {
            colMap.name = idx
            hasHeader = true
          } else if (h.includes('org') || h.includes('college') || h.includes('company') || h.includes('institute')) {
            colMap.org = idx
            hasHeader = true
          } else if (h.includes('desig') || h.includes('role') || h.includes('post') || h.includes('title')) {
            colMap.desig = idx
            hasHeader = true
          } else if (h.includes('sector') || h.includes('dept') || h.includes('industry')) {
            colMap.sector = idx
            hasHeader = true
          } else if (h.includes('state')) {
            colMap.state = idx
            hasHeader = true
          } else if (h.includes('dist') || h.includes('city')) {
            colMap.district = idx
            hasHeader = true
          }
        })

        const dataRows = hasHeader ? sheetData.slice(1) : sheetData
        const validRows = []

        dataRows.forEach((r) => {
          if (!r || r.length === 0) return
          const rawPhone = r[colMap.phone]
          const phone = cleanPhone(rawPhone)
          const name = String(r[colMap.name] || 'Prospect').trim()
          const organization = String(r[colMap.org] || '').trim()
          const designation = String(r[colMap.desig] || '').trim()
          const sector = String(r[colMap.sector] || 'ITI / Polytechnic').trim()
          const state = String(r[colMap.state] || DEFAULT_STATE).trim()
          const district = String(r[colMap.district] || '').trim()

          if (phone.length === 10) {
            validRows.push({
              phone,
              contact_name: name || 'Prospect',
              organization,
              designation,
              sector: sector || 'ITI / Polytechnic',
              state: state || DEFAULT_STATE,
              district,
            })
          }
        })

        if (validRows.length === 0) {
          setMsg({
            err: true,
            text: 'No valid contacts with 10-digit mobile numbers found in this file.',
          })
          setParsedRows([])
          return
        }

        setParsedRows(validRows)
        setMsg({
          ok: true,
          text: `File "${file.name}" loaded successfully: ${validRows.length} valid contacts ready to import.`,
        })
      } catch (err) {
        setMsg({ err: true, text: `Failed to read file: ${err.message}` })
        setParsedRows([])
      }
    }

    if (isExcel) {
      reader.readAsArrayBuffer(file)
    } else {
      reader.readAsText(file)
    }
  }

  // Import parsed rows into database
  const handleImportParsedRows = () => {
    if (parsedRows.length === 0) return
    run(async () => {
      const r = await api.bulkLeads(parsedRows)
      setMsg({
        ok: true,
        text: `Bulk Import Completed: ${r.added} added to dialing pool · ${r.duplicates} duplicates skipped · ${r.invalid} invalid`,
      })
      if (r.added > 0) {
        setParsedRows([])
        setUploadedFileName('')
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    })
  }

  // Download Sample Excel (.xlsx) Template
  const downloadSampleExcel = () => {
    const sampleData = [
      {
        'Phone': '9876543210',
        'Contact Name': 'Rakesh Kumar Verma',
        'Organization': 'Govt ITI Aliganj Lucknow',
        'Designation': 'Principal',
        'Sector': 'ITI / Polytechnic',
        'State': 'Uttar Pradesh',
        'District': 'Lucknow',
      },
      {
        'Phone': '9123456780',
        'Contact Name': 'Priya Singh',
        'Organization': 'Skill Development Council',
        'Designation': 'Training Officer',
        'Sector': 'Skill Mission / UPSDM',
        'State': 'Uttar Pradesh',
        'District': 'Varanasi',
      },
      {
        'Phone': '9415012345',
        'Contact Name': 'Anil Sharma',
        'Organization': 'Govt Polytechnic Kanpur',
        'Designation': 'Placement Head',
        'Sector': 'ITI / Polytechnic',
        'State': 'Uttar Pradesh',
        'District': 'Kanpur Nagar',
      },
    ]
    const ws = XLSX.utils.json_to_sheet(sampleData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Outreach_Contacts')
    XLSX.writeFile(wb, 'Outreach_Portal_Contact_Template.xlsx')
  }

  // Download Sample CSV (.csv) Template
  const downloadSampleCSV = () => {
    const csvContent =
      'Phone,Contact Name,Organization,Designation,Sector,State,District\n' +
      '9876543210,Rakesh Kumar Verma,Govt ITI Aliganj Lucknow,Principal,ITI / Polytechnic,Uttar Pradesh,Lucknow\n' +
      '9123456780,Priya Singh,Skill Development Council,Training Officer,Skill Mission / UPSDM,Uttar Pradesh,Varanasi\n' +
      '9415012345,Anil Sharma,Govt Polytechnic Kanpur,Placement Head,ITI / Polytechnic,Uttar Pradesh,Kanpur Nagar\n'
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Outreach_Portal_Contact_Template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Manual Text Bulk Fallback
  const addBulkManualText = () =>
    run(async () => {
      const rows = bulk
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const p = l.split(/[,\t|]/).map((x) => x.trim())
          return {
            phone: cleanPhone(p[0]),
            contact_name: p[1] || 'Prospect',
            organization: p[2] || '',
            designation: p[3] || '',
            sector: p[4] || 'ITI / Polytechnic',
            state: p[5] || DEFAULT_STATE,
            district: p[6] || '',
          }
        })
        .filter(r => r.phone.length === 10)

      if (rows.length === 0) {
        setMsg({ err: true, text: 'Please enter at least one valid line with a 10-digit phone number' })
        return
      }

      const r = await api.bulkLeads(rows)
      setMsg({
        ok: true,
        text: `Bulk Import Completed: ${r.added} added · ${r.duplicates} duplicates · ${r.invalid} invalid`,
      })
      if (r.added) setBulk('')
    })

  return (
    <div style={{ maxWidth: '940px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Top Header Card */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#103778' }}>
            Add Outreach Numbers
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#64748b', fontWeight: 500 }}>
            Add single contacts or import bulk CSV / Excel spreadsheets to the dialing pool
          </p>
        </div>

        <button
          type="button"
          onClick={() => nav('/numbers')}
          className="btn ghost"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            fontSize: '12.5px',
            fontWeight: 700,
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} />
          <span>Back to Directory</span>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setTab('single')}
          style={{
            padding: '9px 18px',
            fontSize: '13px',
            fontWeight: 700,
            borderRadius: '8px',
            border: tab === 'single' ? '1px solid #103778' : '1px solid #cbd5e1',
            backgroundColor: tab === 'single' ? '#103778' : '#ffffff',
            color: tab === 'single' ? '#ffffff' : '#334155',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Single Contact Form
        </button>

        <button
          type="button"
          onClick={() => setTab('bulk')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 18px',
            fontSize: '13px',
            fontWeight: 700,
            borderRadius: '8px',
            border: tab === 'bulk' ? '1px solid #103778' : '1px solid #cbd5e1',
            backgroundColor: tab === 'bulk' ? '#103778' : '#ffffff',
            color: tab === 'bulk' ? '#ffffff' : '#334155',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <FileSpreadsheet size={16} />
          <span>Bulk Import (CSV / Excel .xlsx)</span>
        </button>
      </div>

      {/* Feedback Alert */}
      {msg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: msg.err ? '#fef2f2' : '#ecfdf5',
            border: msg.err ? '1px solid #fecaca' : '1px solid #a7f3d0',
            color: msg.err ? '#b91c1c' : '#047857',
          }}
        >
          {msg.err ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Single Contact Form */}
      {tab === 'single' ? (
        <div className="table-card" style={{ marginBottom: '30px', overflow: 'visible' }}>
          <div className="table-navy-header" style={{ borderTopLeftRadius: '0.75rem', borderTopRightRadius: '0.75rem' }}>
            <div className="title-group">
              <span className="title-text">Prospect Contact Information</span>
            </div>
            <span className="counter-pill">Fields with * are required</span>
          </div>

          <form onSubmit={addOne} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '22px', overflow: 'visible' }}>
            {/* 1. Contact Identity */}
            <div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#103778',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '14px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                1. Contact Identity
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Contact Name *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. Rakesh Kumar Verma"
                    value={f.contact_name}
                    onChange={(e) => setF({ ...f, contact_name: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '9px 12px',
                      fontSize: '13px',
                      fontWeight: 500,
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Full legal or professional name
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Mobile Phone Number *
                  </label>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    placeholder="10-digit mobile (e.g. 9876543210)"
                    value={f.phone}
                    onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '9px 12px',
                      fontSize: '13px',
                      fontWeight: 500,
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Telephony agent will dial this number
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Organization & Sector */}
            <div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#103778',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '14px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                2. Organization &amp; Sector
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Organization
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ITI nideshalaya"
                    value={f.organization}
                    onChange={(e) => setF({ ...f, organization: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '9px 12px',
                      fontSize: '13px',
                      fontWeight: 500,
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Designation
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Officer"
                    value={f.designation}
                    onChange={(e) => setF({ ...f, designation: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '9px 12px',
                      fontSize: '13px',
                      fontWeight: 500,
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Industry / Sector
                  </label>
                  <SearchableSelect
                    options={SECTORS}
                    value={f.sector}
                    onChange={(val) => setF({ ...f, sector: val })}
                    placeholder="Select Sector"
                    searchPlaceholder="Search sector…"
                  />
                </div>
              </div>
            </div>

            {/* 3. Location */}
            <div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#103778',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '14px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                3. Location &amp; Region
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    State *
                  </label>
                  <SearchableSelect
                    options={INDIAN_STATES}
                    value={f.state}
                    onChange={handleStateChange}
                    placeholder="Select State"
                    searchPlaceholder="Search state…"
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Selecting state updates district options automatically
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    District *
                  </label>
                  <SearchableSelect
                    options={availableDistricts}
                    value={f.district}
                    onChange={(val) => setF({ ...f, district: val })}
                    placeholder="Select District"
                    searchPlaceholder="Search district…"
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    {availableDistricts.length} districts available for {f.state}
                  </span>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div style={{ paddingTop: '10px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setF({ ...EMPTY, state: f.state, district: f.district })}
                className="btn ghost"
                style={{ padding: '10px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '8px', cursor: 'pointer' }}
              >
                Reset Form
              </button>

              <button
                type="submit"
                disabled={busy}
                className="btn primary"
                style={{
                  padding: '10px 24px',
                  fontSize: '13px',
                  fontWeight: 800,
                  borderRadius: '8px',
                  backgroundColor: '#f26522',
                  color: '#ffffff',
                  border: 'none',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 6px rgba(242, 101, 34, 0.35)',
                }}
              >
                {busy ? 'Saving Contact…' : 'Add Contact to Pool'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Excel / CSV Bulk Import Card */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="table-card" style={{ marginBottom: 0 }}>
            <div className="table-navy-header">
              <div className="title-group">
                <FileSpreadsheet size={17} className="text-gov-saffron" />
                <span className="title-text">Spreadsheet &amp; CSV Batch Import</span>
              </div>
              <span className="counter-pill">Supports .xlsx, .xls, .csv</span>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Sample Templates Download Box */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#103778' }}>
                    Need a standardized template?
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Download our formatted template with headers: Phone, Contact Name, Organization, Designation, Sector, State, District.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={downloadSampleExcel}
                    className="btn ghost"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '7px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#047857',
                      cursor: 'pointer',
                    }}
                  >
                    <Download size={14} />
                    <span>Download Excel (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={downloadSampleCSV}
                    className="btn ghost"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '7px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#103778',
                      cursor: 'pointer',
                    }}
                  >
                    <Download size={14} />
                    <span>Download CSV (.csv)</span>
                  </button>
                </div>
              </div>

              {/* Drag and Drop File Upload Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: isDragging ? '2px dashed #103778' : '2px dashed #cbd5e1',
                  borderRadius: '12px',
                  backgroundColor: isDragging ? '#eff6ff' : '#fafbfe',
                  padding: '36px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />

                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '50%',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    color: '#103778',
                    display: 'grid',
                    placeItems: 'center',
                    margin: '0 auto 12px',
                  }}
                >
                  <UploadCloud size={28} />
                </div>

                <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                  {uploadedFileName ? `Selected: ${uploadedFileName}` : 'Click to browse or drag & drop CSV or Excel file'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Supports Microsoft Excel (.xlsx, .xls) and CSV files. Automatic header and phone number detection.
                </div>
              </div>

              {/* Parsed Rows Preview Table */}
              {parsedRows.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#103778', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <span>{parsedRows.length} Valid Records Extracted</span>
                      <span className="counter-pill">{parsedRows.length} Contacts</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => { setParsedRows([]); setUploadedFileName(''); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        color: '#b91c1c',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      <Trash2 size={14} />
                      <span>Remove File</span>
                    </button>
                  </div>

                  <div className="table-card" style={{ marginBottom: 0 }}>
                    <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                      <table className="tbl small">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Phone</th>
                            <th>Contact Name</th>
                            <th>Organization</th>
                            <th>Designation</th>
                            <th>Sector</th>
                            <th>State &amp; District</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedRows.slice(0, 15).map((row, idx) => (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td><b>{row.phone}</b></td>
                              <td>{row.contact_name}</td>
                              <td>{row.organization || '—'}</td>
                              <td>{row.designation || '—'}</td>
                              <td>{row.sector}</td>
                              <td>{row.district ? `${row.district}, ${row.state}` : row.state}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {parsedRows.length > 15 && (
                    <div style={{ fontSize: '11.5px', color: '#64748b', textAlign: 'center' }}>
                      Showing preview of first 15 records (total {parsedRows.length} contacts will be imported).
                    </div>
                  )}

                  {/* Confirm Import Button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleImportParsedRows}
                      className="btn primary"
                      style={{
                        padding: '11px 26px',
                        fontSize: '13.5px',
                        fontWeight: 800,
                        borderRadius: '8px',
                        backgroundColor: '#f26522',
                        color: '#ffffff',
                        border: 'none',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 6px rgba(242, 101, 34, 0.35)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Check size={16} />
                      <span>{busy ? 'Importing Contacts…' : `Confirm & Import ${parsedRows.length} Contacts`}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Alternative: Plain Text / CSV Paste Accordion */}
          <div className="table-card" style={{ marginBottom: 0 }}>
            <div className="table-navy-header">
              <div className="title-group">
                <span className="title-text">Or Paste Plain CSV / Text Manually</span>
              </div>
              <span className="counter-pill">Quick Paste</span>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <textarea
                rows={6}
                placeholder="Format per line: Phone, Contact Name, Organization, Designation, Sector, State, District&#10;Example:&#10;9876543210, Rakesh Verma, Govt ITI Aliganj Lucknow, Principal, ITI / Polytechnic, Uttar Pradesh, Lucknow&#10;9123456780, Priya Singh, Skill Development Council, Training Officer, Skill Mission / UPSDM, Uttar Pradesh, Varanasi"
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  fontSize: '12.5px',
                  fontFamily: 'monospace',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setBulk('')}
                  className="btn ghost"
                  style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: 700, borderRadius: '8px', cursor: 'pointer' }}
                >
                  Clear
                </button>

                <button
                  type="button"
                  disabled={!bulk.trim() || busy}
                  onClick={addBulkManualText}
                  className="btn primary"
                  style={{
                    padding: '8px 20px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    borderRadius: '8px',
                    backgroundColor: '#103778',
                    color: '#ffffff',
                    border: 'none',
                    cursor: !bulk.trim() || busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {busy ? 'Importing…' : 'Import Pasted Text'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
