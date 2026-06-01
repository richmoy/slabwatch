import { useState, useEffect, useMemo, useCallback } from 'react'

const API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY
const SHEET_ID = import.meta.env.VITE_SHEET_ID
const TALLY_URL = import.meta.env.VITE_TALLY_URL
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL
const FETCH_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/SlabWatch!D2:I1000?key=${API_KEY}`
const REFRESH_INTERVAL = 5 * 60 * 1000

const COMPANIES = [
  { name: 'PSA', color: '#3b82f6', activeBg: '#dbeafe', activeText: '#1e40af', activeBorder: '#1d4ed840' },
  { name: 'BGS', color: '#f59e0b', activeBg: '#fef3c7', activeText: '#92400e', activeBorder: '#b4530940' },
  { name: 'SGC', color: '#10b981', activeBg: '#d1fae5', activeText: '#065f46', activeBorder: '#04785740' },
  { name: 'CGC', color: '#8b5cf6', activeBg: '#ede9fe', activeText: '#5b21b6', activeBorder: '#6d28d940' },
]

function calcDays(submitted, returned) {
  if (!submitted || !returned) return null
  const s = new Date(submitted)
  const r = new Date(returned)
  if (isNaN(s) || isNaN(r)) return null
  return Math.round((r - s) / (1000 * 60 * 60 * 24))
}

function parseRow(row) {
  const dateSubmitted = row[2] || ''
  const dateReturned = row[3] || ''
  return {
    company: row[0] || '',
    serviceLevel: row[1] || '',
    dateSubmitted,
    dateReturned,
    days: calcDays(dateSubmitted, dateReturned),
    cardCount: row[4] || '',
    submissionMethod: row[5] || '',
  }
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  const rows = []
  for (let i = 0; i < lines.length; i++) {
    const fields = []
    let current = ''
    let inQuotes = false
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    rows.push(fields)
  }
  return rows
}

function getCompanyPill(company) {
  const found = COMPANIES.find(c => c.name.toLowerCase() === company.toLowerCase())
  if (found) return { bg: found.activeBg, text: found.activeText }
  return { bg: '#f3f4f6', text: '#374151' }
}

function timeAgo(date) {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) return 'UPDATED JUST NOW'
  if (minutes === 1) return 'UPDATED 1 MIN AGO'
  return `UPDATED ${minutes} MIN AGO`
}

export default function App() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastFetched, setLastFetched] = useState(null)
  const [lastFetchedDisplay, setLastFetchedDisplay] = useState('')
  const [activeCompanies, setActiveCompanies] = useState(COMPANIES.map(c => c.name))
  const [serviceFilter, setServiceFilter] = useState('All service levels')
  const [sortColumn, setSortColumn] = useState('dateReturned')
  const [sortDirection, setSortDirection] = useState('desc')
  const [modalOpen, setModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [csvRows, setCsvRows] = useState([])
  const [uploadStatus, setUploadStatus] = useState(null)
  const [uploading, setUploading] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(FETCH_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const rows = (json.values || []).map(parseRow)
      setData(rows)
      setLastFetched(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    const interval = setInterval(() => {
      if (lastFetched) setLastFetchedDisplay(timeAgo(lastFetched))
    }, 10000)
    if (lastFetched) setLastFetchedDisplay(timeAgo(lastFetched))
    return () => clearInterval(interval)
  }, [lastFetched])

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setModalOpen(false)
        setUploadModalOpen(false)
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [])

  const serviceLevels = useMemo(() => {
    const levels = new Set(data.map(r => r.serviceLevel).filter(Boolean))
    return ['All service levels', ...Array.from(levels).sort()]
  }, [data])

  const filtered = useMemo(() => {
    return data.filter(row => {
      if (!activeCompanies.some(c => c.toLowerCase() === row.company.toLowerCase())) return false
      if (serviceFilter !== 'All service levels' && row.serviceLevel !== serviceFilter) return false
      return true
    })
  }, [data, activeCompanies, serviceFilter])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      let aVal = a[sortColumn]
      let bVal = b[sortColumn]
      if (sortColumn === 'days' || sortColumn === 'cardCount') {
        aVal = Number(aVal) || 0
        bVal = Number(bVal) || 0
      } else if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = (bVal || '').toLowerCase()
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [filtered, sortColumn, sortDirection])

  const stats = useMemo(() => {
    const days = filtered.map(r => r.days).filter(d => d !== null && !isNaN(d))
    return {
      total: filtered.length,
      avg: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0,
      fastest: days.length ? Math.min(...days) : 0,
      slowest: days.length ? Math.max(...days) : 0,
    }
  }, [filtered])

  const toggleCompany = (name) => {
    setActiveCompanies(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    )
  }

  const handleSort = (col) => {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(col)
      setSortDirection('desc')
    }
  }

  const clearFilters = () => {
    setActiveCompanies(COMPANIES.map(c => c.name))
    setServiceFilter('All service levels')
  }

  const getDaysPill = (days) => {
    if (days === null) return { bg: '#f3f4f6', text: '#374151' }
    if (days < stats.avg * 0.9) return { bg: '#d1fae5', text: '#065f46' }
    if (days > stats.avg * 1.1) return { bg: '#fee2e2', text: '#991b1b' }
    return { bg: '#f3f4f6', text: '#374151' }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadStatus(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const allRows = parseCsv(ev.target.result)
      const isHeader = allRows[0] && allRows[0][0]?.toLowerCase().includes('company')
      const dataRows = isHeader ? allRows.slice(1) : allRows
      setCsvRows(dataRows.filter(r => r.length >= 6))
    }
    reader.readAsText(file)
  }

  const handleUpload = async () => {
    if (!csvRows.length) return
    setUploading(true)
    setUploadStatus(null)
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ rows: csvRows }),
      })
      const json = await res.json()
      if (json.success) {
        setUploadStatus({ type: 'success', message: `Uploaded ${json.count} rows successfully.` })
        setCsvRows([])
        setTimeout(fetchData, 2000)
      } else {
        setUploadStatus({ type: 'error', message: json.error || 'Upload failed.' })
      }
    } catch (err) {
      setUploadStatus({ type: 'error', message: err.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#111827] font-sans flex flex-col">
      {/* Header */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between border-b border-[#e5e7eb]"
        style={{ height: 60, padding: '0 48px', background: 'rgba(250,250,249,0.95)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-0">
          <span className="font-mono text-[13px] font-medium tracking-[0.2em] text-[#111827]">SLABWATCH</span>
          <span className="mx-3 inline-block w-px bg-[#e5e7eb]" style={{ height: 14 }} />
          <span className="font-sans text-[11px] text-[#9ca3af]">Real PSA grading turnaround times, tracked by collectors.</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUploadModalOpen(true)}
            className="font-mono text-[10.5px] tracking-[0.1em] px-4 py-[7px] rounded-[3px] border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
          >
            BULK UPLOAD CSV
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="font-mono text-[10.5px] tracking-[0.1em] px-4 py-[7px] rounded-[3px] bg-[#111827] text-[#fafaf9] border border-[#111827] hover:bg-[#1f2937] transition-colors"
          >
            SUBMIT A RETURN →
          </button>
        </div>
      </header>

      {/* Alert banner */}
      <div className="border-b border-[#fde68a]" style={{ background: '#fffbeb', padding: '10px 48px' }}>
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#d97706] flex-shrink-0" />
          <p className="font-sans text-[11.5px] text-[#92400e]">
            <strong>PSA Value tier submissions paused as of June 2, 2026.</strong>{' '}
            Regular turnaround revised to 50–60 days. Data below reflects community-reported actuals.
          </p>
        </div>
      </div>

      <div className="flex-1 w-full" style={{ padding: '0 48px' }}>
        {/* Stats bar */}
        <div className="grid grid-cols-4 border-b border-[#e5e7eb]" style={{ padding: '28px 0 24px' }}>
          {[
            { value: stats.total, label: 'TOTAL SUBMISSIONS', color: '#111827' },
            { value: stats.avg, label: 'AVERAGE DAYS', color: '#111827' },
            { value: stats.fastest, label: 'FASTEST ON RECORD', color: '#047857' },
            { value: stats.slowest, label: 'SLOWEST ON RECORD', color: '#b91c1c' },
          ].map(({ value, label, color }, idx) => (
            <div
              key={label}
              className={idx > 0 ? 'border-l border-[#e5e7eb] pl-8' : ''}
            >
              <div className="font-sans text-[9.5px] tracking-[0.16em] text-[#9ca3af] uppercase mb-2.5">{label}</div>
              <div className="font-mono text-[38px] font-medium" style={{ color, letterSpacing: '-0.02em' }}>
                {loading ? '—' : value}
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between border-b border-[#e5e7eb] py-4">
          <div className="flex items-center gap-2">
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="font-mono text-[10px] border border-[#e5e7eb] bg-white rounded-[3px] px-2.5 py-1 outline-none focus:border-[#9ca3af] text-[#374151]"
            >
              {serviceLevels.map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
          {lastFetchedDisplay && (
            <span className="font-mono text-[9.5px] tracking-[0.08em] text-[#d1d5db]">{lastFetchedDisplay}</span>
          )}
        </div>

        {/* Main content */}
        <div className="pb-8">
          {loading ? (
            <div className="text-center py-20 text-[#9ca3af] font-sans text-sm">Loading submissions...</div>
          ) : error ? (
            <div className="text-center py-20 text-[#b91c1c] font-sans text-sm">Error loading data: {error}</div>
          ) : data.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[#9ca3af] font-sans text-sm mb-4">No submissions yet. Be the first to contribute.</p>
              <button
                onClick={() => setModalOpen(true)}
                className="font-mono text-[10.5px] tracking-[0.1em] px-4 py-[7px] rounded-[3px] bg-[#111827] text-[#fafaf9] border border-[#111827]"
              >
                SUBMIT A RETURN →
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[#9ca3af] font-sans text-sm mb-4">No submissions match your filters.</p>
              <button
                onClick={clearFilters}
                className="font-mono text-[10.5px] tracking-[0.1em] px-4 py-[7px] rounded-[3px] border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f3f4f6]"
              >
                CLEAR FILTERS
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-[#111827]">
                      {[
                        { key: 'serviceLevel', label: 'SERVICE LEVEL' },
                        { key: 'dateSubmitted', label: 'SUBMITTED' },
                        { key: 'dateReturned', label: 'SHIPPED BACK' },
                        { key: 'days', label: 'DAYS', align: 'right' },
                        { key: 'cardCount', label: 'CARDS', align: 'right' },
                        { key: 'submissionMethod', label: 'METHOD' },
                      ].map(({ key, label, align }) => (
                        <th
                          key={key}
                          onClick={() => handleSort(key)}
                          className={`font-sans text-[9px] font-semibold tracking-[0.18em] text-[#6b7280] uppercase cursor-pointer hover:text-[#374151] transition-colors whitespace-nowrap select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
                          style={{ padding: '10px 20px 10px 0' }}
                        >
                          {label}
                          {sortColumn === key && (
                            <span className="ml-1 text-[#111827]">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row, i) => {
                      const daysPill = getDaysPill(row.days)
                      return (
                        <tr key={i} className="border-b border-[#f3f4f6]">
                          <td className="font-sans text-[12px] text-[#374151]" style={{ padding: '11px 20px 11px 0' }}>
                            {row.serviceLevel}
                          </td>
                          <td className="font-mono text-[11px] text-[#9ca3af]" style={{ padding: '11px 20px 11px 0' }}>
                            {row.dateSubmitted}
                          </td>
                          <td className="font-mono text-[11px] text-[#6b7280]" style={{ padding: '11px 20px 11px 0' }}>
                            {row.dateReturned}
                          </td>
                          <td className="text-right" style={{ padding: '11px 20px 11px 0' }}>
                            <span
                              className="font-mono text-[12px] font-medium inline-block"
                              style={{
                                background: daysPill.bg,
                                color: daysPill.text,
                                borderRadius: 2,
                                padding: '2px 7px',
                              }}
                            >
                              {row.days !== null ? `${row.days}d` : '—'}
                            </span>
                          </td>
                          <td className="font-mono text-[11px] text-[#9ca3af] text-right" style={{ padding: '11px 20px 11px 0' }}>
                            {row.cardCount}
                          </td>
                          <td className="font-sans text-[11px] text-[#9ca3af]" style={{ padding: '11px 20px 11px 0' }}>
                            {row.submissionMethod}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <span className="font-mono text-[10px] tracking-[0.08em] text-[#d1d5db]">
                  {sorted.length} RESULTS
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#e5e7eb] flex items-center justify-between" style={{ marginTop: 64, padding: '24px 48px 24px' }}>
        <span className="font-mono text-[9.5px] tracking-[0.16em] text-[#d1d5db]">SLABWATCH.TECH</span>
        <span className="font-sans text-[10px] text-[#d1d5db]">Data submitted by the community. Not affiliated with PSA, BGS, SGC, or CGC.</span>
      </footer>

      {/* Submit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white border border-[#e5e7eb] w-full max-w-[500px] mx-4 relative"
            style={{ borderRadius: 6, padding: 36, boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-[#9ca3af] hover:text-[#374151] text-xl leading-none border-none bg-transparent"
            >
              ×
            </button>
            <h2 className="font-sans text-[15px] font-semibold text-[#111827] mb-1" style={{ letterSpacing: '-0.01em' }}>Submit a Return</h2>
            <p className="font-sans text-[11.5px] text-[#9ca3af] mb-5">
              Takes about 60 seconds. Your data helps the whole community.
            </p>
            <iframe
              src={TALLY_URL}
              width="100%"
              height="600"
              frameBorder="0"
              title="Submit a return"
              style={{ borderRadius: 4 }}
            />
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}
          onClick={() => { setUploadModalOpen(false); setCsvRows([]); setUploadStatus(null) }}
        >
          <div
            className="bg-white border border-[#e5e7eb] w-full max-w-2xl mx-4 relative max-h-[80vh] overflow-y-auto"
            style={{ borderRadius: 6, padding: 36, boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setUploadModalOpen(false); setCsvRows([]); setUploadStatus(null) }}
              className="absolute top-4 right-4 text-[#9ca3af] hover:text-[#374151] text-xl leading-none border-none bg-transparent"
            >
              ×
            </button>
            <h2 className="font-sans text-[15px] font-semibold text-[#111827] mb-1" style={{ letterSpacing: '-0.01em' }}>Bulk Upload CSV</h2>
            <p className="font-sans text-[11.5px] text-[#9ca3af] mb-5">
              Upload multiple submissions at once. CSV should have 6 columns:{' '}
              <span className="text-[#374151]">Company, Service Level, Date Submitted, Date Returned, Card Count, Method</span>
            </p>

            <div className="flex items-center gap-3 mb-4">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="text-[11px] text-[#6b7280] file:mr-3 file:py-1.5 file:px-3 file:rounded-[3px] file:border file:border-[#e5e7eb] file:bg-white file:text-[#6b7280] file:text-[11px] file:cursor-pointer hover:file:bg-[#f3f4f6]"
              />
              <a
                href="/slabwatch-template.csv"
                download
                className="font-mono text-[11px] text-[#1e40af] hover:underline whitespace-nowrap"
              >
                Download template
              </a>
            </div>

            {csvRows.length > 0 && (
              <>
                <div className="overflow-x-auto mb-4 border border-[#e5e7eb] rounded-[4px]">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-[#e5e7eb] bg-[#fafaf9]">
                        <th className="text-left py-2 px-3 font-sans text-[9px] tracking-[0.16em] text-[#6b7280] uppercase font-semibold">Company</th>
                        <th className="text-left py-2 px-3 font-sans text-[9px] tracking-[0.16em] text-[#6b7280] uppercase font-semibold">Service</th>
                        <th className="text-left py-2 px-3 font-sans text-[9px] tracking-[0.16em] text-[#6b7280] uppercase font-semibold">Submitted</th>
                        <th className="text-left py-2 px-3 font-sans text-[9px] tracking-[0.16em] text-[#6b7280] uppercase font-semibold">Returned</th>
                        <th className="text-left py-2 px-3 font-sans text-[9px] tracking-[0.16em] text-[#6b7280] uppercase font-semibold">Cards</th>
                        <th className="text-left py-2 px-3 font-sans text-[9px] tracking-[0.16em] text-[#6b7280] uppercase font-semibold">Method</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 20).map((row, i) => (
                        <tr key={i} className="border-b border-[#f3f4f6]">
                          <td className="py-1.5 px-3 font-mono text-[11px] text-[#374151]">{row[0]}</td>
                          <td className="py-1.5 px-3 font-sans text-[11px] text-[#6b7280]">{row[1]}</td>
                          <td className="py-1.5 px-3 font-mono text-[11px] text-[#9ca3af]">{row[2]}</td>
                          <td className="py-1.5 px-3 font-mono text-[11px] text-[#9ca3af]">{row[3]}</td>
                          <td className="py-1.5 px-3 font-mono text-[11px] text-[#9ca3af]">{row[4]}</td>
                          <td className="py-1.5 px-3 font-sans text-[11px] text-[#9ca3af]">{row[5]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csvRows.length > 20 && (
                    <p className="font-sans text-[10px] text-[#9ca3af] px-3 py-1.5">
                      ...and {csvRows.length - 20} more rows
                    </p>
                  )}
                </div>

                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="font-mono text-[10.5px] tracking-[0.1em] px-4 py-[7px] rounded-[3px] bg-[#111827] text-[#fafaf9] border border-[#111827] hover:bg-[#1f2937] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'UPLOADING...' : `UPLOAD ${csvRows.length} ROW${csvRows.length !== 1 ? 'S' : ''}`}
                </button>
              </>
            )}

            {uploadStatus && (
              <p className={`font-sans text-[11px] mt-3 ${uploadStatus.type === 'success' ? 'text-[#047857]' : 'text-[#b91c1c]'}`}>
                {uploadStatus.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
