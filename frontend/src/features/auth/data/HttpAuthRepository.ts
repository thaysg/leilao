import { http } from '@/core/http'
import type { AuthRepository } from '../domain/AuthRepository'
import type { RegisterInput, Session, User } from '../domain/entities'

export class HttpAuthRepository implements AuthRepository {
  login(email: string, password: string) {
    return http<Session>('/auth/login', { method: 'POST', body: { email: email.trim(), password } })
  }
  register(i: RegisterInput) {
    return http<Session>('/auth/register', { method: 'POST', body: { ...i, name: i.name.trim(), email: i.email.trim() } })
  }
  me() {
    return http<User>('/auth/me')
  }
}
