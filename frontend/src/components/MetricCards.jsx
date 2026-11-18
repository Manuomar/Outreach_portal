import React from 'react'
import {
  Users,
  CheckCircle2,
  PhoneForwarded,
  PhoneMissed,
  Hourglass,
  UserCheck,
  Ban,
  PhoneCall,
  ExternalLink,
} from 'lucide-react'

/**
 * Enterprise Metric Summary Cards (UI.md standard)
 * 5 Horizontal Boxes: Numbers Added, Completed Calls, Busy/Ringing, Incomplete, and Pending Queue
 */
export default function MetricCards({ stats, onCardClick, activeFilter, showActiveDisabled = false }) {
  if (!stats) return null

  const cards = showActiveDisabled ? [
    {
      id: 'all_leads',
      label: 'Total Numbers',
      sub: `${stats.active_leads ?? stats.leads ?? 0} Active`,
      val: stats.leads ?? 0,
      icon: Users,
      theme: 'blue',
      iconColor: '#103778',
    },
    {
      id: 'pending_queue',
      label: 'Pending Queue',
      sub: 'Needs retry or uncalled',
      val: stats.pending_queue ?? 0,
      icon: Hourglass,
      theme: 'saffron',
      iconColor: '#f26522',
    },
    {
      // Completed Numbers — filters the table right here in Numbers page
      id: 'completed_numbers',
      label: 'Completed Numbers',
      sub: `${stats.completed_numbers ?? 0} Reached (>10s)`,
      val: stats.completed_numbers ?? 0,
      icon: CheckCircle2,
      theme: 'green',
      iconColor: '#059669',
      // No isLink! It filters locally
    },
    {
      // Total Calls — clicking routes to /call-history page
      id: 'total_calls',
      label: 'Total Calls',
      sub: `${stats.completed ?? 0} Connected (${stats.connect_rate ?? 0}%)`,
      val: stats.calls ?? 0,
      icon: PhoneCall,
      theme: 'amber',
      iconColor: '#d97706',
      isLink: true, // flag: this card redirects to /call-history
    },
    {
      id: 'ban_leads',
      label: 'Ban',
      sub: `${stats.disabled_leads ?? 0} Excluded numbers`,
      val: stats.disabled_leads ?? 0,
      icon: Ban,
      theme: 'red',
      iconColor: '#dc2626',
    },
  ] : [
    {
      id: 'all_leads',
      label: 'Numbers Added',
      sub: 'Total contact pool',
      val: stats.leads ?? 0,
      icon: Users,
      theme: 'blue',
      iconColor: '#103778',
    },
    {
      id: 'pending_queue',
      label: 'Pending Queue',
      sub: 'Needs retry or uncalled',
      val: stats.pending_queue ?? 0,
      icon: Hourglass,
      theme: 'saffron',
      iconColor: '#f26522',
    },
    {
      id: 'completed',
      label: 'Completed Calls',
      sub: `${stats.connect_rate ?? 0}% conversion`,
      val: stats.completed ?? 0,
      icon: CheckCircle2,
      theme: 'green',
      iconColor: '#059669',
    },
    {
      id: 'busy',
      label: 'Busy / Ringing',
      sub: 'No answer / waiting',
      val: stats.busy ?? 0,
      icon: PhoneForwarded,
      theme: 'amber',
      iconColor: '#d97706',
    },
    {
      id: 'incomplete',
      label: 'Incomplete / Failed',
      sub: 'Short or dropped',
      val: stats.incomplete ?? 0,
      icon: PhoneMissed,
      theme: 'red',
      iconColor: '#dc2626',
    },
  ]

  return (
    <div
      className="metric-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '14px',
        marginBottom: '20px',
        width: '100%',
      }}
    >
      {cards.map((c) => {
        const Icon = c.icon
        const isActive = activeFilter === c.id
        return (
          <div
            key={c.id}
            onClick={() => onCardClick?.(c.id)}
            className={`metric-box ${isActive ? 'active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 16px',
              backgroundColor: isActive ? '#f8faff' : '#ffffff',
              border: isActive ? '1px solid #103778' : '1px solid #e2e8f0',
              borderRadius: '12px',
              boxShadow: isActive
                ? '0 0 0 2px rgba(16, 55, 120, 0.2), 0 4px 12px rgba(16, 55, 120, 0.08)'
                : '0 1px 3px 0 rgba(0, 0, 0, 0.06)',
              cursor: onCardClick ? 'pointer' : 'default',
              transition: 'all 0.18s ease-in-out',
              position: 'relative',
            }}
            title={onCardClick ? (c.isLink ? 'Go to Call History →' : `Filter by ${c.label}`) : c.label}
          >
            {/* External link badge only for cards that navigate out */}
            {c.isLink && (
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 10,
                  fontSize: 9,
                  fontWeight: 800,
                  color: '#7c3aed',
                  background: '#ede9fe',
                  padding: '1px 6px',
                  borderRadius: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  letterSpacing: '0.03em',
                }}
              >
                <ExternalLink size={8} /> HISTORY
              </span>
            )}

            {/* Left: Lucide Icon in Square Rounded Box */}
            <div
              className={`metric-icon-wrap ${c.theme}`}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '10px',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={22} color={c.iconColor} />
            </div>

            {/* Right: Numbers and Labels */}
            <div
              className="metric-info"
              style={{
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                flex: 1,
              }}
            >
              <div
                className="metric-val"
                style={{
                  fontSize: '24px',
                  fontWeight: 800,
                  color: '#0f172a',
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                }}
              >
                {c.val}
              </div>
              <div
                className="metric-label"
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#334155',
                  marginTop: '4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {c.label}
              </div>
              <div
                className="metric-sub"
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#64748b',
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {c.sub}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
