import * as XLSX from 'xlsx'

/**
 * Helper to format duration seconds into m:s string
 */
export const fmtDuration = (sec) => {
  const s = Number(sec)
  if (!s || s <= 0) return '0s'
  const m = Math.floor(s / 60)
  const rem = s % 60
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`
}

/**
 * Build a lookup map of extraction field definitions
 */
export const buildFieldMap = (extractionFields = []) => {
  const map = {}
  extractionFields.forEach(f => {
    if (f.question_key) {
      map[f.question_key.toLowerCase().trim()] = f
    }
  })
  return map
}

/**
 * Extract answers from a call object into a key-value dictionary
 */
export const extractCallAnswers = (call, fieldMap = {}) => {
  const answers = call.answers || []
  const result = {}
  answers.forEach(a => {
    const k = (a.question_key || '').toLowerCase().trim()
    if (!k) return
    const def = fieldMap[k]
    const label = def?.label || a.label || k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    const val = (a.response_value || '').trim()
    result[k] = {
      label,
      value: val || '—',
      confidence: a.confidence_score ? `${Math.round(a.confidence_score * 100)}%` : '—',
      category: def?.category || a.category || 'Survey',
    }
  })
  return result
}

/**
 * Gather all unique survey keys present across the provided calls and definitions
 */
export const collectAllSurveyKeys = (calls = [], extractionFields = []) => {
  const fieldMap = buildFieldMap(extractionFields)
  const keysSet = new Set()

  // First add defined fields in sort order
  extractionFields.forEach(f => {
    if (f.question_key) keysSet.add(f.question_key.toLowerCase().trim())
  })

  // Then scan calls for any additional keys
  calls.forEach(c => {
    const ans = c.answers || []
    ans.forEach(a => {
      if (a.question_key) keysSet.add(a.question_key.toLowerCase().trim())
    })
  })

  // Exclude obsolete legacy keys
  const obsolete = ['student_volume', 'college_count', 'current_verification_method']
  obsolete.forEach(k => keysSet.delete(k))

  return Array.from(keysSet).map(k => {
    const def = fieldMap[k]
    return {
      key: k,
      label: def?.label || k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      category: def?.category || 'Survey',
    }
  })
}

/**
 * Export Call list to Excel (.xlsx) with all extracted fields as separate columns
 */
export const exportCallsToExcel = (calls = [], extractionFields = [], filename = 'Call_History_Report') => {
  if (!calls || calls.length === 0) {
    alert('No call records available to export.')
    return
  }

  const fieldMap = buildFieldMap(extractionFields)
  const surveyColumns = collectAllSurveyKeys(calls, extractionFields)

  const rows = calls.map(c => {
    const callAnswers = extractCallAnswers(c, fieldMap)

    const row = {
      'Call ID': `#${c.id}`,
      'Date & Time': c.created_at || '—',
      'Prospect Name': c.contact_name || '—',
      'Phone Number': c.phone || '—',
      'Organization': c.organization || '—',
      'Designation': c.designation || '—',
      'Sector / Department': c.sector || '—',
      'District': c.district || '—',
      'Voice Agent': c.agent_name || '—',
      'Calling From (Caller ID)': c.from_phone_number || 'Bolna Default Pool',
      'Call Status': (c.call_status || '—').toUpperCase(),
      'Duration': fmtDuration(c.duration_sec),
      'Duration (sec)': c.duration_sec || 0,
      'Interest Status': (c.interest_status || '—').toUpperCase(),
      'Interest / Hesitation Reason': c.interest_reason || '—',
      'Who Answered': c.who_answered || '—',
      'Call Transferred?': c.call_transferred === 1 ? 'Yes' : 'No',
      'Transferred Destination': c.transferred_to_number || '—',
      'Senior Meeting Agreed?': c.it_head_call_agreed === 1 ? 'Yes' : (c.it_head_call_agreed === 0 ? 'No' : '—'),
      'Scheduled Meeting Date': c.it_head_call_date || '—',
      'Scheduled Meeting Time': c.it_head_call_time || '—',
      'Meeting Attendee Name': c.it_head_name || '—',
      'Meeting Attendee Phone': c.it_head_phone || '—',
      'Verbatim Meeting Spoken': c.it_head_call_raw || '—',
      'Recommended Next Action': c.next_action || '—',
      'Call Summary': c.summary || '—',
    }

    // Append dynamic extracted survey columns
    surveyColumns.forEach(sc => {
      const ansObj = callAnswers[sc.key]
      row[`[Survey] ${sc.label}`] = ansObj ? ansObj.value : '—'
    })

    return row
  })

  const ws = XLSX.utils.json_to_sheet(rows)

  // Auto-calculate column widths
  const colWidths = Object.keys(rows[0] || {}).map(key => {
    let maxLen = key.length
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const val = String(rows[i][key] || '')
      if (val.length > maxLen) maxLen = Math.min(val.length, 45)
    }
    return { wch: Math.max(maxLen + 3, 12) }
  })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Call_Records')

  const dateStr = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `${filename}_${dateStr}.xlsx`)
}

/**
 * Export Call list to Printable PDF (A4 Landscape) with styled tables & stats
 */
export const exportCallsToPDF = (calls = [], extractionFields = [], title = 'Call History & AI Extractions Report') => {
  if (!calls || calls.length === 0) {
    alert('No call records available to export.')
    return
  }

  const fieldMap = buildFieldMap(extractionFields)
  const surveyColumns = collectAllSurveyKeys(calls, extractionFields)

  // Compute summary stats
  const totalCalls = calls.length
  const completedCalls = calls.filter(c => c.call_status === 'completed' && Number(c.duration_sec) > 10).length
  const connectRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0
  const meetingsAgreed = calls.filter(c => Number(c.it_head_call_agreed) === 1).length
  const interestedCount = calls.filter(c => ['hot', 'warm', 'interested'].includes(c.interest_status)).length

  // Build rows HTML
  const rowsHtml = calls.map((c, idx) => {
    const callAnswers = extractCallAnswers(c, fieldMap)
    const isCompleted = c.call_status === 'completed'
    const statusBg = isCompleted ? '#dcfce7' : (['busy', 'failed', 'no_answer'].includes(c.call_status) ? '#fee2e2' : '#f1f5f9')
    const statusColor = isCompleted ? '#15803d' : (['busy', 'failed', 'no_answer'].includes(c.call_status) ? '#dc2626' : '#475569')

    const interestBg = ['hot', 'warm', 'interested'].includes(c.interest_status) ? '#dcfce7' : '#f1f5f9'
    const interestColor = ['hot', 'warm', 'interested'].includes(c.interest_status) ? '#15803d' : '#64748b'

    // Survey badges / pills
    const surveyItems = surveyColumns
      .map(sc => {
        const a = callAnswers[sc.key]
        if (!a || !a.value || a.value === '—') return null
        return `<div class="survey-badge">
          <span class="survey-key">${escapeHtml(sc.label)}:</span>
          <span class="survey-val">${escapeHtml(a.value)}</span>
        </div>`
      })
      .filter(Boolean)
      .join('')

    return `
      <tr>
        <td style="font-weight:700; color:#475569;">#${c.id}</td>
        <td>
          <div style="font-weight:700; color:#0f172a; font-size:12px;">${escapeHtml(c.contact_name || '—')}</div>
          <div style="font-size:11px; color:#64748b;">${escapeHtml(c.phone || '—')}</div>
        </td>
        <td>
          <div style="font-size:11.5px; color:#334155; font-weight:600;">${escapeHtml(c.organization || '—')}</div>
          ${c.designation ? `<div style="font-size:10.5px; color:#64748b;">${escapeHtml(c.designation)}</div>` : ''}
        </td>
        <td style="font-size:11px; color:#0369a1; font-weight:600;">${escapeHtml(c.agent_name || '—')}</td>
        <td>
          <span class="pill" style="background:${statusBg}; color:${statusColor}; font-weight:700;">
            ${escapeHtml((c.call_status || '—').toUpperCase())}
          </span>
        </td>
        <td>
          <span class="pill" style="background:${interestBg}; color:${interestColor}; font-weight:700;">
            ${escapeHtml((c.interest_status || '—').toUpperCase())}
          </span>
        </td>
        <td style="font-size:11.5px; font-weight:600; color:#475569;">${fmtDuration(c.duration_sec)}</td>
        <td>
          ${c.it_head_call_agreed === 1
            ? `<span class="pill" style="background:#dcfce7; color:#15803d; font-weight:700;">✅ YES</span>`
            : `<span style="color:#94a3b8; font-size:11px;">—</span>`
          }
        </td>
        <td style="font-size:10.5px; color:#64748b; white-space:nowrap;">${escapeHtml(c.created_at || '—')}</td>
        <td style="max-width:320px;">
          ${surveyItems || '<span style="color:#94a3b8; font-size:11px; font-style:italic;">No survey answers</span>'}
        </td>
      </tr>
    `
  }).join('')

  const printDoc = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(title)}</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 10mm 8mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          margin: 0;
          padding: 16px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Devanagari", "Mangal", sans-serif;
          background: #ffffff;
          color: #0f172a;
          font-size: 11px;
          line-height: 1.4;
        }
        .no-print-bar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: #103778;
          color: #ffffff;
          padding: 10px 18px;
          margin: -16px -16px 16px -16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .btn-print {
          background: #f26522;
          color: #ffffff;
          border: none;
          padding: 7px 16px;
          font-size: 12px;
          font-weight: 700;
          border-radius: 6px;
          cursor: pointer;
        }
        .btn-close {
          background: transparent;
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.4);
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          margin-left: 8px;
        }
        .header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          border-bottom: 2px solid #103778;
          padding-bottom: 10px;
          margin-bottom: 12px;
        }
        .brand-title {
          font-size: 18px;
          font-weight: 800;
          color: #103778;
          margin: 0 0 2px 0;
        }
        .brand-sub {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
          margin-bottom: 14px;
        }
        .stat-card {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 8px 12px;
          background: #f8fafc;
        }
        .stat-num {
          font-size: 17px;
          font-weight: 800;
          color: #103778;
          line-height: 1.2;
        }
        .stat-lbl {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        thead {
          display: table-header-group;
        }
        th {
          background: #103778;
          color: #ffffff;
          text-align: left;
          padding: 7px 8px;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.3px;
        }
        td {
          padding: 7px 8px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: top;
        }
        tr:nth-child(even) td {
          background-color: #fcfdfe;
        }
        .pill {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 99px;
          font-size: 9.5px;
        }
        .survey-badge {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 2px 5px;
          margin-bottom: 3px;
          font-size: 10px;
          line-height: 1.3;
        }
        .survey-key {
          font-weight: 700;
          color: #1e293b;
          margin-right: 3px;
        }
        .survey-val {
          color: #334155;
        }
        @media print {
          .no-print-bar {
            display: none !important;
          }
          body {
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="no-print-bar">
        <div>
          <strong>Outreach Portal — Print / Save as PDF</strong>
          <span style="font-size:12px; opacity:0.85; margin-left:10px;">Select "Destination: Save as PDF" in print window</span>
        </div>
        <div>
          <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
          <button class="btn-close" onclick="window.close()">Close</button>
        </div>
      </div>

      <div class="header">
        <div>
          <h1 class="brand-title">OUTREACH PORTAL — AI CALL RECORDS &amp; EXTRACTIONS</h1>
          <div class="brand-sub">Comprehensive Voice Analytics Dossier · Generated on ${new Date().toLocaleString('en-IN')}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14px; font-weight:800; color:#103778;">${totalCalls} Total Records</div>
          <div style="font-size:10px; color:#64748b;">Includes all AI survey questions &amp; prospect responses</div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-num">${totalCalls}</div>
          <div class="stat-lbl">Total Calls</div>
        </div>
        <div class="stat-card">
          <div class="stat-num" style="color:#15803d;">${completedCalls}</div>
          <div class="stat-lbl">Completed Calls</div>
        </div>
        <div class="stat-card">
          <div class="stat-num" style="color:#d97706;">${connectRate}%</div>
          <div class="stat-lbl">Connect Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-num" style="color:#7c3aed;">${meetingsAgreed}</div>
          <div class="stat-lbl">Meetings Agreed</div>
        </div>
        <div class="stat-card">
          <div class="stat-num" style="color:#0284c7;">${interestedCount}</div>
          <div class="stat-lbl">Interested Prospects</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:40px;">#ID</th>
            <th style="width:130px;">Prospect</th>
            <th style="width:140px;">Organization</th>
            <th style="width:100px;">Voice Agent</th>
            <th style="width:80px;">Status</th>
            <th style="width:80px;">Interest</th>
            <th style="width:65px;">Duration</th>
            <th style="width:65px;">Meeting</th>
            <th style="width:85px;">Date</th>
            <th>Extracted Survey Answers</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <script>
        // Auto trigger print dialog on page load
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => {
            window.print()
          }, 400)
        })
      </script>
    </body>
    </html>
  `

  const win = window.open('', '_blank')
  if (!win) {
    alert('Popup blocked. Please allow popups for this site to export PDF.')
    return
  }
  win.document.open()
  win.document.write(printDoc)
  win.document.close()
}

/**
 * Export a Single Call Dossier to Printable PDF (A4 Portrait)
 */
export const exportSingleCallToPDF = (callData, turns = [], answers = [], extractionFields = []) => {
  if (!callData) return
  const c = callData
  const fieldMap = buildFieldMap(extractionFields)

  // Format survey answers
  const surveyHtml = (answers || []).map(a => {
    const k = (a.question_key || '').toLowerCase().trim()
    const def = fieldMap[k]
    const label = def?.label || a.label || k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    const val = a.response_value || '—'
    const conf = a.confidence_score ? `${Math.round(a.confidence_score * 100)}%` : '—'
    return `
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <strong style="color:#0f172a; font-size:12px;">${escapeHtml(label)}</strong>
          <span style="font-size:10px; background:#ecfdf5; color:#15803d; font-weight:700; padding:1px 6px; border-radius:10px; border:1px solid #bbf7d0;">
            Confidence: ${conf}
          </span>
        </div>
        <div style="font-size:12px; color:#334155; line-height:1.4; background:#f8fafc; padding:6px 10px; border-radius:5px; border:1px solid #e2e8f0;">
          ${escapeHtml(val)}
        </div>
      </div>
    `
  }).join('') || '<div style="color:#94a3b8; font-style:italic; padding:12px;">No survey extractions recorded for this call.</div>'

  // Format dialogue turns
  const turnsHtml = (turns || []).map((t, i) => {
    const isAgent = t.speaker === 'agent'
    const speakerLabel = isAgent ? 'Ajay (AI Voice Agent)' : (c.contact_name || 'Prospect')
    const bg = isAgent ? '#f8fafc' : '#eff6ff'
    const border = isAgent ? '#e2e8f0' : '#bfdbfe'
    const nameColor = isAgent ? '#f26522' : '#1d4ed8'
    return `
      <div style="background:${bg}; border:1px solid ${border}; border-radius:8px; padding:9px 12px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
          <strong style="font-size:11px; color:${nameColor};">${escapeHtml(speakerLabel)}</strong>
          <span style="font-size:10px; color:#94a3b8;">Turn #${t.idx || (i + 1)}</span>
        </div>
        <div style="font-size:12px; color:#1e293b; line-height:1.45;">
          ${escapeHtml(t.text || '')}
        </div>
      </div>
    `
  }).join('')

  const printDoc = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Call Audit Dossier — Call #${c.id} (${escapeHtml(c.contact_name || 'Prospect')})</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 10mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          margin: 0;
          padding: 16px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Devanagari", "Mangal", sans-serif;
          background: #ffffff;
          color: #0f172a;
          font-size: 11.5px;
        }
        .no-print-bar {
          position: sticky;
          top: 0;
          background: #103778;
          color: #fff;
          padding: 10px 16px;
          margin: -16px -16px 16px -16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .btn-print {
          background: #f26522;
          color: #fff;
          border: none;
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 700;
          border-radius: 6px;
          cursor: pointer;
        }
        .section-box {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px 14px;
          margin-bottom: 14px;
          background: #ffffff;
        }
        .section-title {
          font-size: 13px;
          font-weight: 800;
          color: #103778;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 6px;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .info-item {
          margin-bottom: 6px;
        }
        .info-label {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
        }
        .info-val {
          font-size: 12px;
          font-weight: 600;
          color: #0f172a;
        }
        @media print {
          .no-print-bar { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="no-print-bar">
        <strong>Executive Call Audit Dossier — Call #${c.id}</strong>
        <div>
          <button class="btn-print" onclick="window.print()">🖨️ Save as PDF / Print</button>
          <button style="background:transparent; color:#fff; border:1px solid #fff; padding:5px 12px; border-radius:6px; cursor:pointer; margin-left:8px;" onclick="window.close()">Close</button>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; border-bottom:2px solid #103778; padding-bottom:8px; margin-bottom:12px;">
        <div>
          <h2 style="margin:0 0 2px 0; color:#103778; font-size:18px;">OUTREACH CALL AUDIT DOSSIER</h2>
          <div style="font-size:11px; color:#64748b;">Call #${c.id} · Recorded on ${c.created_at || '—'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14px; font-weight:800; color:#f26522;">${(c.call_status || '').toUpperCase()}</div>
          <div style="font-size:11px; color:#64748b;">Duration: ${fmtDuration(c.duration_sec)}</div>
        </div>
      </div>

      <div class="section-box">
        <div class="section-title">Prospect &amp; Organization Details</div>
        <div class="grid-2">
          <div>
            <div class="info-item"><div class="info-label">Contact Name</div><div class="info-val">${escapeHtml(c.contact_name || '—')}</div></div>
            <div class="info-item"><div class="info-label">Phone Number</div><div class="info-val">${escapeHtml(c.phone || '—')}</div></div>
            <div class="info-item"><div class="info-label">Designation</div><div class="info-val">${escapeHtml(c.designation || '—')}</div></div>
          </div>
          <div>
            <div class="info-item"><div class="info-label">Organization</div><div class="info-val">${escapeHtml(c.organization || '—')}</div></div>
            <div class="info-item"><div class="info-label">Sector / District</div><div class="info-val">${escapeHtml(c.sector || '—')} / ${escapeHtml(c.district || '—')}</div></div>
            <div class="info-item"><div class="info-label">Voice Agent Used</div><div class="info-val">${escapeHtml(c.agent_name || '—')}</div></div>
          </div>
        </div>
      </div>

      <div class="section-box">
        <div class="section-title">Call Outcomes &amp; Next Action</div>
        <div class="grid-2">
          <div>
            <div class="info-item"><div class="info-label">Interest Status</div><div class="info-val">${escapeHtml(c.interest_status || '—')}</div></div>
            <div class="info-item"><div class="info-label">Who Answered</div><div class="info-val">${escapeHtml(c.who_answered || '—')}</div></div>
            <div class="info-item"><div class="info-label">Call Transferred</div><div class="info-val">${c.call_transferred ? `Yes (To: ${c.transferred_to_number})` : 'No'}</div></div>
          </div>
          <div>
            <div class="info-item"><div class="info-label">Meeting Scheduled</div><div class="info-val">${c.it_head_call_agreed === 1 ? 'Yes' : (c.it_head_call_agreed === 0 ? 'No' : 'Unknown')}</div></div>
            <div class="info-item"><div class="info-label">Meeting Date &amp; Time</div><div class="info-val">${c.it_head_call_date || '—'} ${c.it_head_call_time || ''}</div></div>
            <div class="info-item"><div class="info-label">Meeting Attendee</div><div class="info-val">${escapeHtml(c.it_head_name || '—')} (${escapeHtml(c.it_head_phone || '—')})</div></div>
          </div>
        </div>
        ${c.interest_reason ? `<div style="margin-top:6px;"><div class="info-label">Interest / Objection Reason</div><div style="font-size:11.5px; color:#334155; margin-top:2px;">${escapeHtml(c.interest_reason)}</div></div>` : ''}
        ${c.next_action ? `<div style="margin-top:6px;"><div class="info-label">Recommended Next Action</div><div style="font-size:11.5px; color:#0f172a; font-weight:600; margin-top:2px;">${escapeHtml(c.next_action)}</div></div>` : ''}
      </div>

      <div class="section-box">
        <div class="section-title">AI Extracted Survey Answers (${(answers || []).length} Fields)</div>
        ${surveyHtml}
      </div>

      ${turns && turns.length > 0 ? `
        <div class="section-box">
          <div class="section-title">Conversation Transcript (${turns.length} Turns)</div>
          ${turnsHtml}
        </div>
      ` : ''}

      <script>
        window.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => { window.print() }, 350)
        })
      </script>
    </body>
    </html>
  `

  const win = window.open('', '_blank')
  if (!win) {
    alert('Popup blocked. Please allow popups for this site to export PDF.')
    return
  }
  win.document.open()
  win.document.write(printDoc)
  win.document.close()
}

/**
 * Export Single Call Dossier to Excel (.xlsx) with multiple dedicated tabs
 */
export const exportSingleCallToExcel = (callData, turns = [], answers = [], extractionFields = []) => {
  if (!callData) return
  const c = callData
  const fieldMap = buildFieldMap(extractionFields)

  const wb = XLSX.utils.book_new()

  // Sheet 1: Call Overview
  const overviewRows = [
    { 'Field': 'Call ID', 'Value': `#${c.id}` },
    { 'Field': 'Call Status', 'Value': (c.call_status || '').toUpperCase() },
    { 'Field': 'Date & Time', 'Value': c.created_at || '—' },
    { 'Field': 'Duration', 'Value': fmtDuration(c.duration_sec) },
    { 'Field': 'Prospect Name', 'Value': c.contact_name || '—' },
    { 'Field': 'Prospect Phone', 'Value': c.phone || '—' },
    { 'Field': 'Organization', 'Value': c.organization || '—' },
    { 'Field': 'Designation', 'Value': c.designation || '—' },
    { 'Field': 'Sector / Department', 'Value': c.sector || '—' },
    { 'Field': 'District', 'Value': c.district || '—' },
    { 'Field': 'Voice Agent', 'Value': c.agent_name || '—' },
    { 'Field': 'Calling From (Caller ID)', 'Value': c.from_phone_number || 'Bolna Default' },
    { 'Field': 'Interest Level', 'Value': (c.interest_status || '—').toUpperCase() },
    { 'Field': 'Interest / Objection Reason', 'Value': c.interest_reason || '—' },
    { 'Field': 'Who Answered', 'Value': c.who_answered || '—' },
    { 'Field': 'Call Transferred?', 'Value': c.call_transferred ? 'Yes' : 'No' },
    { 'Field': 'Transferred Destination', 'Value': c.transferred_to_number || '—' },
    { 'Field': 'Meeting Scheduled?', 'Value': c.it_head_call_agreed === 1 ? 'Yes' : (c.it_head_call_agreed === 0 ? 'No' : '—') },
    { 'Field': 'Meeting Date', 'Value': c.it_head_call_date || '—' },
    { 'Field': 'Meeting Time', 'Value': c.it_head_call_time || '—' },
    { 'Field': 'Meeting Attendee Name', 'Value': c.it_head_name || '—' },
    { 'Field': 'Meeting Attendee Phone', 'Value': c.it_head_phone || '—' },
    { 'Field': 'Next Recommended Action', 'Value': c.next_action || '—' },
    { 'Field': 'Executive Summary', 'Value': c.summary || '—' },
  ]
  const wsOverview = XLSX.utils.json_to_sheet(overviewRows)
  wsOverview['!cols'] = [{ wch: 26 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, wsOverview, 'Call_Overview')

  // Sheet 2: Extracted Survey Answers
  const answersRows = (answers || []).map((a, i) => {
    const k = (a.question_key || '').toLowerCase().trim()
    const def = fieldMap[k]
    return {
      '#': i + 1,
      'Field Key': a.question_key || '—',
      'Field Label': def?.label || a.label || k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      'Category': def?.category || a.category || 'Survey',
      'Subcategory': def?.subcategory || a.subcategory || 'General',
      'Extracted Response': a.response_value || '—',
      'Confidence Score': a.confidence_score ? `${Math.round(a.confidence_score * 100)}%` : '—',
    }
  })
  if (answersRows.length > 0) {
    const wsAnswers = XLSX.utils.json_to_sheet(answersRows)
    wsAnswers['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 24 }, { wch: 15 }, { wch: 15 }, { wch: 45 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, wsAnswers, 'Survey_Answers')
  }

  // Sheet 3: Transcript Turns
  const turnsRows = (turns || []).map((t, i) => ({
    'Turn #': t.idx || (i + 1),
    'Speaker': t.speaker === 'agent' ? 'AI Voice Agent (Ajay)' : (c.contact_name || 'Prospect'),
    'Dialogue Text': t.text || '',
  }))
  if (turnsRows.length > 0) {
    const wsTurns = XLSX.utils.json_to_sheet(turnsRows)
    wsTurns['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 80 }]
    XLSX.utils.book_append_sheet(wb, wsTurns, 'Dialogue_Transcript')
  }

  const nameSlug = (c.contact_name || 'Prospect').replace(/\s+/g, '_')
  XLSX.writeFile(wb, `Call_${c.id}_${nameSlug}_Audit.xlsx`)
}

function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
