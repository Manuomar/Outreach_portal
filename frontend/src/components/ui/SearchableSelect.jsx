import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X, Check } from 'lucide-react'

export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = '-- Select Option --',
  disabled = false,
  required = false,
  className = '',
  searchPlaceholder = 'Type to search…',
  id,
  icon: Icon = null,
  clearable = true,
  clearValue = '',
  buttonClassName = '',
  style = {},
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [openUpwards, setOpenUpwards] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Normalize options to [{ value, label, subtitle }]
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        value: opt.value ?? '',
        label: opt.label ?? String(opt.value ?? ''),
        subtitle: opt.subtitle ?? '',
      }
    }
    return {
      value: opt,
      label: String(opt),
      subtitle: '',
    }
  })

  // Find currently selected option
  const selectedOption = normalizedOptions.find((opt) => String(opt.value) === String(value))

  // Filter options based on search term
  const filteredOptions = normalizedOptions.filter((opt) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      opt.label.toLowerCase().includes(term) ||
      String(opt.value).toLowerCase().includes(term) ||
      (opt.subtitle && opt.subtitle.toLowerCase().includes(term))
    )
  })

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus search box on open & detect available viewport space
  useEffect(() => {
    if (isOpen) {
      if (inputRef.current) {
        inputRef.current.focus()
      }
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        if (spaceBelow < 280 && rect.top > 260) {
          setOpenUpwards(true)
        } else {
          setOpenUpwards(false)
        }
      }
    }
  }, [isOpen])

  const handleSelect = (val) => {
    if (onChange) {
      onChange(val)
    }
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleClear = (e) => {
    e.stopPropagation()
    if (onChange) {
      onChange(clearValue !== undefined ? clearValue : '')
    }
    setSearchTerm('')
  }

  return (
    <div
      ref={containerRef}
      id={id}
      className={`searchable-select-wrap ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        zIndex: isOpen ? 1000 : 'auto',
        ...style,
      }}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`searchable-select-btn ${buttonClassName}`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '8px 12px',
          fontSize: '12.5px',
          fontWeight: 600,
          color: selectedOption && selectedOption.value !== '' ? '#0f172a' : '#64748b',
          backgroundColor: disabled ? '#f1f5f9' : '#ffffff',
          border: isOpen ? '1.5px solid #103778' : '1px solid #cbd5e1',
          borderRadius: '8px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 3px rgba(16, 55, 120, 0.12)' : '0 1px 2px rgba(0, 0, 0, 0.04)',
          transition: 'all 0.15s ease',
          textAlign: 'left',
          height: '38px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          {Icon && <Icon size={14} style={{ color: '#64748b', flexShrink: 0 }} />}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: selectedOption && selectedOption.value !== '' ? 700 : 500,
            }}
          >
            {selectedOption && selectedOption.value !== '' ? selectedOption.label : placeholder}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, color: '#94a3b8' }}>
          {clearable && selectedOption && selectedOption.value !== '' && selectedOption.value !== clearValue && !disabled && (
            <span
              onClick={handleClear}
              style={{
                display: 'inline-grid',
                placeItems: 'center',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                cursor: 'pointer',
                color: '#64748b',
              }}
              title="Clear selection"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown
            size={14}
            style={{
              transition: 'transform 0.18s ease',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              color: isOpen ? '#103778' : '#94a3b8',
            }}
          />
        </div>
      </button>

      {/* Hidden input for HTML validation if required */}
      {required && (
        <input
          type="text"
          value={value || ''}
          onChange={() => {}}
          required={required}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
          tabIndex={-1}
        />
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            zIndex: 99999,
            top: openUpwards ? 'auto' : 'calc(100% + 4px)',
            bottom: openUpwards ? 'calc(100% + 4px)' : 'auto',
            left: 0,
            right: 0,
            minWidth: '220px',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.18), 0 4px 6px -2px rgba(0, 0, 0, 0.08)',
            overflow: 'hidden',
          }}
        >
          {/* Search Box Header */}
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
            }}
          >
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '6px 28px 6px 30px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#0f172a',
                  outline: 'none',
                  height: '32px',
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 0,
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div
            style={{
              maxHeight: '220px',
              overflowY: 'auto',
              padding: '4px 0',
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: '16px 12px',
                  textAlign: 'center',
                  fontSize: '12px',
                  color: '#94a3b8',
                  fontWeight: 500,
                }}
              >
                No matching options found
              </div>
            ) : (
              filteredOptions.map((opt, index) => {
                const isSelected = String(opt.value) === String(value)
                return (
                  <div
                    key={`${opt.value}-${index}`}
                    onClick={() => handleSelect(opt.value)}
                    style={{
                      padding: '8px 12px',
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      backgroundColor: isSelected ? 'rgba(16, 55, 120, 0.08)' : '#ffffff',
                      color: isSelected ? '#103778' : '#1e293b',
                      fontWeight: isSelected ? 700 : 500,
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#f1f5f9'
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#ffffff'
                    }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div>{opt.label}</div>
                      {opt.subtitle && (
                        <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 400 }}>
                          {opt.subtitle}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check size={14} style={{ color: '#103778', flexShrink: 0 }} />}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

