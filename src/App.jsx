import { useState, useEffect, useMemo, useCallback } from 'react'

const API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY
const SHEET_ID = import.meta.env.VITE_SHEET_ID
const TALLY_URL = import.meta.env.VITE_TALLY_URL
const FETCH_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/SlabWatch%20Data!A2:I1000?key=${API_KEY}`
const REFRESH_INTERVAL = 5 * 60 * 1000

const COMPANIES = [
  { name: 'PSA', color: '#3b82f6' },
  { name: 'BGS', color: '#f59e0b' },
  { name: 'SGC', color: '#10b981' },
  { name: 'CGC', color: '#8b5cf6' },
]


function parseRow(row) {
  return {
    timestamp: row[0] || '',
    company: row[1] || '',
    serviceLevel: row[2] || '',
    dateSubmitted: row[3] || '',
    dateReturned: row[4] || '',
    days: row[5] ? Number(row[5]) : null,
    cardCount: row[6] || '',
    submissionMethod: row[7] || '',
    notes: row[8] || '',
  }
}

function getCompanyColor(company) {
  const found = COMPANIES.find(c => c.name.toLowerCase() === company.toLowerCase())
  return found ? found.color : '#64748b'
}

function timeAgo(date) {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes === 1) return '1 minute ago'
  return `${minutes} minutes ago`
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
    const handleEsc = (e) => { if (e.key === 'Escape') setModalOpen(false) }
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

  const getDaysColor = (days) => {
    if (days === null) return 'text-white'
    const threshold = stats.avg * 0.1
    if (days < stats.avg - threshold) return 'text-green-400'
    if (days > stats.avg + threshold) return 'text-red-400'
    return 'text-white'
  }

  const columns = [
    { key: 'company', label: 'Company' },
    { key: 'serviceLevel', label: 'Service' },
    { key: 'dateSubmitted', label: 'Submitted' },
    { key: 'dateReturned', label: 'Returned' },
    { key: 'days', label: 'Days' },
    { key: 'cardCount', label: 'Cards' },
    { key: 'submissionMethod', label: 'Method' },
  ]

  const STAT_CARDS = [
    { value: stats.total, suffix: stats.total === 1 ? ' entry' : ' entries', label: 'Total Submissions', accent: '#3b82f6', valueColor: 'text-white' },
    { value: stats.avg, suffix: ' days', label: 'Average Turnaround', accent: '#64748b', valueColor: 'text-white' },
    { value: stats.fastest, suffix: ' days', label: 'Fastest on Record', accent: '#10b981', valueColor: 'text-green-400' },
    { value: stats.slowest, suffix: ' days', label: 'Slowest on Record', accent: '#ef4444', valueColor: 'text-red-400' },
  ]

  return (
    <div className="min-h-screen bg-navy text-white font-mono flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-navy border-b border-white/[0.06] px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-blue-700 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-medium tracking-widest">SLABWATCH</h1>
            <p className="text-xs text-[#475569]">Real grading turnaround times, tracked by collectors.</p>
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 text-xs border border-accent bg-accent/10 text-accent rounded-md hover:bg-accent/20 transition-colors"
        >
          Submit a return →
        </button>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto">
        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-4">
          {STAT_CARDS.map(({ value, suffix, label, accent, valueColor }) => (
            <div
              key={label}
              className="bg-navy-light rounded-lg px-4 py-3 border-t-2 border-white/[0.04]"
              style={{ borderTopColor: accent }}
            >
              <div className={`text-2xl font-semibold ${valueColor}`}>
                {loading ? '—' : <>{value}<span className="text-sm font-normal text-white/40">{suffix}</span></>}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[#475569] mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="px-5 py-2 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-[#475569]">Filter:</span>
          <div className="flex gap-1.5">
            {COMPANIES.map(({ name, color }) => (
              <button
                key={name}
                onClick={() => toggleCompany(name)}
                className="px-2.5 py-1 text-[11px] rounded-full border transition-all"
                style={{
                  borderColor: color,
                  backgroundColor: activeCompanies.includes(name) ? color + '22' : 'transparent',
                  color: activeCompanies.includes(name) ? color : '#475569',
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="bg-navy-light border border-white/[0.06] text-[11px] text-white rounded-md px-2.5 py-1 outline-none focus:border-accent"
          >
            {serviceLevels.map(level => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>


        {/* Main content */}
        <div className="px-5 pb-16">
          {loading ? (
            <div className="text-center py-20 text-[#475569]">Loading submissions...</div>
          ) : error ? (
            <div className="text-center py-20 text-red-400">Error loading data: {error}</div>
          ) : data.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[#475569] mb-4">No submissions yet. Be the first to contribute.</p>
              <button
                onClick={() => setModalOpen(true)}
                className="px-4 py-2 text-xs border border-accent bg-accent/10 text-accent rounded-md hover:bg-accent/20 transition-colors"
              >
                Submit a return →
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[#475569] mb-4">No submissions match your filters.</p>
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-xs border border-white/20 text-white/60 rounded-md hover:bg-white/5 transition-colors"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    {columns.map(({ key, label }) => (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className="text-left py-2.5 px-2.5 text-[10px] uppercase tracking-wider text-[#475569] font-medium cursor-pointer hover:text-white/80 transition-colors whitespace-nowrap select-none"
                      >
                        {label}
                        {sortColumn === key && (
                          <span className="ml-1 text-accent">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-white/[0.03] hover:bg-white/[0.04] transition-colors ${
                        i % 2 === 0 ? 'bg-navy-light' : 'bg-navy'
                      }`}
                    >
                      <td className="py-2 px-2.5">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            backgroundColor: getCompanyColor(row.company) + '22',
                            color: getCompanyColor(row.company),
                          }}
                        >
                          {row.company}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-white/80">{row.serviceLevel}</td>
                      <td className="py-2 px-2.5 text-white/60">{row.dateSubmitted}</td>
                      <td className="py-2 px-2.5 text-white/60">{row.dateReturned}</td>
                      <td className={`py-2 px-2.5 text-sm font-semibold ${getDaysColor(row.days)}`}>
                        {row.days !== null ? row.days : '—'}
                      </td>
                      <td className="py-2 px-2.5 text-white/40">{row.cardCount}</td>
                      <td className="py-2 px-2.5 text-white/40">{row.submissionMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-navy border-t border-white/[0.06] px-5 py-3 flex items-center justify-between mt-auto">
        <p className="text-[10px] text-[#475569]">
          Data submitted by the community. Not affiliated with PSA, BGS, SGC, or CGC. · slabwatch.fyi
        </p>
        {lastFetchedDisplay && (
          <p className="text-[10px] text-[#475569]">Last updated {lastFetchedDisplay}</p>
        )}
      </footer>

      {/* Submit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-navy-card border border-white/10 rounded-2xl w-full max-w-lg mx-4 p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white text-xl leading-none"
            >
              ×
            </button>
            <h2 className="text-lg font-medium mb-1">Submit a Return</h2>
            <p className="text-xs text-[#475569] mb-4">
              Takes about 60 seconds. Your data helps the whole community.
            </p>
            <iframe
              src={TALLY_URL}
              width="100%"
              height="600"
              frameBorder="0"
              title="Submit a return"
              className="rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  )
}
