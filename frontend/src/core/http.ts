import { syncServerTime } from './clock'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

let tokenGetter: () => string | null = () => null
let onUnauthorized: () => void = () => {}
export const configureHttp = (cfg: { getToken: () => string | null; onUnauthorized: () => void }) => {
  tokenGetter = cfg.getToken
  onUnauthorized = cfg.onUnauthorized
}

const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

/** snake_case API payload -> camelCase entities (labels inside `attributes` have no underscores, so they are safe). */
export function camelize<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camelize(v)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [camel(k), camelize(v)])) as T
  }
  return value as T
}

interface Options {
  method?: 'GET' | 'POST'
  body?: unknown
  query?: Record<string, string | number | undefined | null>
}

export async function http<T>(path: string, opts: Options = {}): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  const url = `${BASE}/api${path}${qs.toString() ? `?${qs}` : ''}`
  const headers: Record<string, string> = {}
  const token = tokenGetter()
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(url, { method: opts.method ?? 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined })
  } catch {
    throw new ApiError('network', 'Sem conexão com o servidor. Verifique sua internet e tente novamente.', 0)
  }

  let data: unknown = null
  try { data = await res.json() } catch { /* empty or non-JSON body */ }

  if (!res.ok) {
    const d = (data ?? {}) as Record<string, unknown>
    if (res.status === 401 && token) onUnauthorized()
    const { code, message, ...extra } = d
    throw new ApiError(
      typeof code === 'string' ? code : 'http_error',
      typeof message === 'string' ? message : 'Algo deu errado. Tente novamente em instantes.',
      res.status,
      camelize(extra),
    )
  }
  const out = camelize<T>(data)
  const st = (out as { serverTime?: string } | null)?.serverTime
  if (typeof st === 'string') syncServerTime(st)
  return out
}
