// The browser clock may be wrong. The API sends `server_time` on most responses; we keep the offset
// and use `now()` for every countdown so all users see the same time left.
let offsetMs = 0

export function syncServerTime(serverIso: string): void {
  const t = Date.parse(serverIso)
  if (!Number.isNaN(t)) offsetMs = t - Date.now()
}

export const now = (): number => Date.now() + offsetMs
export const getOffset = (): number => offsetMs
export const resetClock = (): void => { offsetMs = 0 }
