const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Money is always integer cents; only formatted here, at the edge. */
export const formatMoney = (cents: number): string => brl.format(cents / 100)

/** Parses "1.234,56", "1234,56" or "1234.56" into cents. Returns null when invalid. */
export function parseMoney(input: string): number | null {
  const s = input.replace(/[^\d.,]/g, '').trim()
  if (!s) return null
  let normalized = s
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.')
  else if ((s.match(/\./g) ?? []).length > 1) normalized = s.replace(/\./g, '')
  else if (/^\d{1,3}\.\d{3}$/.test(s)) normalized = s.replace('.', '') // "1.234" is a thousands separator
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export const centsToInput = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',')

const dtf = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })
const dtfSec = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
export const formatDateTime = (iso: string): string => dtf.format(new Date(iso))
export const formatDateTimeSec = (iso: string): string => dtfSec.format(new Date(iso))

export const aliasLabel = (alias: string): string => `Licitante #${alias}`

/** 93_000 -> "01:33"; 3_700_000 -> "01:01:40"; 2 days+ -> "2d 03:12:45". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return `${d}d ${p(h)}:${p(m)}:${p(s)}`
  if (h > 0) return `${p(h)}:${p(m)}:${p(s)}`
  return `${p(m)}:${p(s)}`
}

export function formatRelative(iso: string, nowMs: number): string {
  const diff = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000))
  if (diff < 5) return 'agora'
  if (diff < 60) return `há ${diff}s`
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  return `há ${Math.floor(diff / 86400)} d`
}

/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
