import { create } from 'zustand'
import { authRepo } from '@/app/di'
import { queryClient } from '@/app/queryClient'
import { configureHttp } from '@/core/http'
import type { RegisterInput, Session, User } from '../domain/entities'

const KEY = 'auth_token'
const readToken = (): string | null => { try { return localStorage.getItem(KEY) } catch { return null } }
const writeToken = (t: string | null) => {
  try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY) } catch { /* storage may be blocked */ }
}

interface AuthState {
  token: string | null
  user: User | null
  status: 'loading' | 'ready'
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => void
}

/** Works like a Cubit: small typed state + action methods. */
export const useAuth = create<AuthState>((set, get) => {
  const apply = (s: Session) => {
    writeToken(s.token)
    queryClient.clear()
    set({ token: s.token, user: s.user, status: 'ready' })
    return s.user
  }
  return {
    token: readToken(),
    user: null,
    status: readToken() ? 'loading' : 'ready',
    init: async () => {
      if (!get().token) return set({ status: 'ready' })
      try {
        set({ user: await authRepo.me(), status: 'ready' })
      } catch {
        writeToken(null)
        set({ token: null, user: null, status: 'ready' })
      }
    },
    login: async (email, password) => apply(await authRepo.login(email, password)),
    register: async (input) => apply(await authRepo.register(input)),
    logout: () => {
      writeToken(null)
      queryClient.clear()
      set({ token: null, user: null, status: 'ready' })
    },
  }
})

configureHttp({ getToken: () => useAuth.getState().token, onUnauthorized: () => useAuth.getState().logout() })

export const homeFor = (u: User | null) => (u?.role === 'seller' ? '/painel' : '/')
