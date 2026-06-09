// Centralised date formatting — everything shows DAY-MONTH-YEAR.

function toDate(input) {
    if (input == null || input === '') return null
    if (input instanceof Date) return isNaN(input) ? null : input
    if (typeof input === 'number') return new Date(input)        // unix ms (caller multiplies seconds)
    if (typeof input === 'string') {
        // date-only "YYYY-MM-DD" → local midnight (avoid UTC off-by-one)
        const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (m) return new Date(+m[1], +m[2] - 1, +m[3])
        // datetime without timezone (SQLite created_at is UTC) → mark as UTC so it shows local
        let s = input.includes('T') ? input : input.replace(' ', 'T')
        if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
        const d = new Date(s)
        return isNaN(d) ? null : d
    }
    return null
}

const p2 = n => String(n).padStart(2, '0')

// 09-06-2026
export function fmtDate(input) {
    const d = toDate(input)
    if (!d) return '—'
    return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}`
}

// 09-06-2026 14:35
export function fmtDateTime(input) {
    const d = toDate(input)
    if (!d) return '—'
    return `${fmtDate(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

// Tuesday, 9 June 2026  (day before month)
export function fmtDateLong(input) {
    const d = toDate(input) || new Date()
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// for unix-seconds values
export const fmtUnixDate = u => (u ? fmtDate(new Date(u * 1000)) : '—')
export const fmtUnixDateTime = u => (u ? fmtDateTime(new Date(u * 1000)) : 'never')
