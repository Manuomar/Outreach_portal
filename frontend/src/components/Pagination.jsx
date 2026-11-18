import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Official Govt Call Center IMS Pagination Component
 * Matches UI.md Design Standard & Reference Portal Exactly
 */
export default function Pagination({
  currentPage = 1,
  totalPages,
  totalItems = 0,
  perPage = 10,
  itemsPerPage,
  onPageChange,
  onPerPageChange,
  onItemsPerPageChange,
  perPageOptions = [10, 20, 25, 50, 100],
  itemLabel = 'records',
  // Backwards compatibility props
  page,
  limit,
  total,
  onLimitChange,
  itemName,
}) {
  const activePage = Number(page ?? currentPage ?? 1)
  const effectivePerPage = Number(limit ?? itemsPerPage ?? perPage ?? 10)
  const effectiveTotal = Number(total ?? totalItems ?? 0)
  const effectiveTotalPages =
    totalPages && totalPages > 1
      ? totalPages
      : Math.max(1, Math.ceil(effectiveTotal / effectivePerPage))
  const effectiveItemLabel = itemName ?? itemLabel ?? 'records'
  const handlePerPageChange = onPerPageChange || onItemsPerPageChange || onLimitChange

  if (effectiveTotal === 0 && effectiveTotalPages <= 1) return null

  const start =
    effectiveTotal > 0
      ? Math.min((activePage - 1) * effectivePerPage + 1, effectiveTotal)
      : 0
  const end =
    effectiveTotal > 0
      ? Math.min(activePage * effectivePerPage, effectiveTotal)
      : 0

  const options = Array.from(new Set([...perPageOptions, effectivePerPage])).sort(
    (a, b) => a - b
  )

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        padding: '0.75rem 1.25rem',
        borderTop: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        borderBottomLeftRadius: '0.75rem',
        borderBottomRightRadius: '0.75rem',
        fontSize: '0.75rem',
      }}
      className="px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white rounded-b-xl text-xs select-none"
    >
      {/* Left: Showing Range & Rows Per Page */}
      <div
        style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}
        className="flex flex-wrap items-center gap-3 text-slate-600 font-medium"
      >
        {effectiveTotal > 0 && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
            className="flex items-center gap-1.5"
          >
            <span>Showing</span>
            <span
              style={{
                fontWeight: 700,
                color: '#0f172a',
                backgroundColor: '#ffffff',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
              }}
              className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs"
            >
              {start}–{end}
            </span>
            <span>of</span>
            <span style={{ fontWeight: 700, color: '#103778' }} className="font-bold text-gov-navy">
              {effectiveTotal}
            </span>
            <span>{effectiveItemLabel}</span>
          </div>
        )}

        {handlePerPageChange && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              borderLeft: '1px solid #e2e8f0',
              paddingLeft: '0.75rem',
            }}
            className="flex items-center gap-2 border-l border-slate-200 pl-3"
          >
            <span style={{ color: '#64748b', fontWeight: 600 }}>Rows:</span>
            <select
              value={effectivePerPage}
              onChange={(e) => {
                handlePerPageChange(Number(e.target.value))
                onPageChange?.(1)
              }}
              style={{
                width: 'auto',
                display: 'inline-block',
                height: 'auto',
                padding: '3px 8px',
                margin: 0,
                fontSize: '12px',
                fontWeight: 700,
                color: '#1e293b',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              className="pagination-select bg-white border border-slate-300 text-slate-800 rounded px-2 py-0.5 text-xs font-bold cursor-pointer hover:border-gov-navy focus:outline-none shadow-2xs !w-auto !inline-block"
            >
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page Indicator & Navigation Controls */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        className="flex items-center gap-2"
      >
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', marginRight: '4px' }}>
          Page <span style={{ color: '#103778', fontWeight: 700 }}>{activePage}</span> of{' '}
          <span style={{ color: '#0f172a', fontWeight: 700 }}>{Math.max(1, effectiveTotalPages)}</span>
        </div>

        <button
          type="button"
          disabled={activePage <= 1}
          onClick={() => onPageChange(activePage - 1)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '4px 10px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '4px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            color: activePage <= 1 ? '#94a3b8' : '#334155',
            cursor: activePage <= 1 ? 'not-allowed' : 'pointer',
            opacity: activePage <= 1 ? 0.45 : 1,
          }}
          className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-all shadow-2xs cursor-pointer"
          title="Previous page"
        >
          <ChevronLeft size={13} />
          <span>Prev</span>
        </button>

        {/* Dynamic page numbers when effectiveTotalPages > 1 */}
        {effectiveTotalPages > 1 && (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            className="hidden sm:flex items-center gap-1"
          >
            {Array.from({ length: effectiveTotalPages }, (_, i) => i + 1)
              .filter(
                (p) =>
                  p === 1 ||
                  p === effectiveTotalPages ||
                  Math.abs(p - activePage) <= 1
              )
              .map((p, idx, arr) => {
                const prev = arr[idx - 1]
                const showEllipsis = prev && p - prev > 1
                const isCurrent = p === activePage
                return (
                  <div
                    key={p}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    className="flex items-center gap-1"
                  >
                    {showEllipsis && (
                      <span style={{ color: '#94a3b8', padding: '0 4px', fontSize: '12px' }}>...</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onPageChange(p)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 700,
                        border: isCurrent ? '1px solid #103778' : '1px solid #cbd5e1',
                        backgroundColor: isCurrent ? '#103778' : '#ffffff',
                        color: isCurrent ? '#ffffff' : '#334155',
                        display: 'inline-grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                      }}
                      className={
                        'w-7 h-7 rounded text-xs font-bold transition-all cursor-pointer ' +
                        (isCurrent
                          ? 'bg-gov-navy text-white shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300')
                      }
                    >
                      {p}
                    </button>
                  </div>
                )
              })}
          </div>
        )}

        <button
          type="button"
          disabled={activePage >= effectiveTotalPages}
          onClick={() => onPageChange(activePage + 1)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '4px 10px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '4px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            color: activePage >= effectiveTotalPages ? '#94a3b8' : '#334155',
            cursor: activePage >= effectiveTotalPages ? 'not-allowed' : 'pointer',
            opacity: activePage >= effectiveTotalPages ? 0.45 : 1,
          }}
          className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-all shadow-2xs cursor-pointer"
          title="Next page"
        >
          <span>Next</span>
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
