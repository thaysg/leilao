import { create } from 'zustand'

interface ToastItem { id: number; text: string; tone: 'info' | 'error' }
interface ToastState {
  items: ToastItem[]
  push: (text: string, tone?: ToastItem['tone']) => void
}

let seq = 0
export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (text, tone = 'info') => {
    const id = ++seq
    set((s) => ({ items: [...s.items, { id, text, tone }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 4500)
  },
}))

export const toast = (text: string, tone: ToastItem['tone'] = 'info') => useToasts.getState().push(text, tone)

export function ToastHost() {
  const items = useToasts((s) => s.items)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast ${t.tone === 'error' ? 'toast--error' : ''}`}>{t.text}</div>)}
    </div>
  )
}
