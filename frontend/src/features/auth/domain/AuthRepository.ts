import type { RegisterInput, Session, User } from './entities'

export interface AuthRepository {
  login(email: string, password: string): Promise<Session>
  register(input: RegisterInput): Promise<Session>
  me(): Promise<User>
}
