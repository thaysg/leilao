import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

/**
 * Subscribes to /api/ws/lots/:id. On every server event the lot is refetched over REST.
 * Keeps the socket alive with a "ping" every 25 s and reconnects with exponential backoff.
 * Returns `connected`; while false the caller should poll (every 5 s) so nothing is missed.
 */
export function useLotRealtime(lotId: number, enabled: boolean): boolean {
  const qc = useQueryClient()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled || !Number.isFinite(lotId)) return
    let ws: WebSocket | null = null
    let ping: ReturnType<typeof setInterval> | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let closed = false

    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['lot', lotId] })
      void qc.invalidateQueries({ queryKey: ['wallet'] })
      void qc.invalidateQueries({ queryKey: ['myBids'] })
    }

    const connect = () => {
      const base = import.meta.env.VITE_API_URL
      const url = base
        ? `${base.replace(/^http/, 'ws').replace(/\/$/, '')}/api/ws/lots/${lotId}`
        : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws/lots/${lotId}`
      ws = new WebSocket(url)
      ws.onopen = () => {
        attempt = 0
        setConnected(true)
        refresh() // catch up on anything missed while offline
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 25_000)
      }
      ws.onmessage = refresh
      ws.onclose = () => {
        setConnected(false)
        clearInterval(ping)
        if (closed) return
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 15_000))
      }
      ws.onerror = () => ws?.close()
    }
    connect()

    return () => {
      closed = true
      clearInterval(ping)
      clearTimeout(retry)
      ws?.close()
      setConnected(false)
    }
  }, [lotId, enabled, qc])

  return connected
}
