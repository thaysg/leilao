import type { RegisterInput } from './entities'

export type FieldErrors<T> = Partial<Record<keyof T, string>>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateLogin(email: string, password: string): FieldErrors<{ email: string; password: string }> {
  const e: FieldErrors<{ email: string; password: string }> = {}
  if (!EMAIL.test(email.trim())) e.email = 'Informe um e-mail válido.'
  if (!password) e.password = 'Informe sua senha.'
  return e
}

export function validateRegister(i: RegisterInput): FieldErrors<RegisterInput> {
  const e: FieldErrors<RegisterInput> = {}
  if (i.name.trim().length < 2) e.name = 'Informe seu nome (mínimo 2 letras).'
  if (!EMAIL.test(i.email.trim())) e.email = 'Informe um e-mail válido.'
  if (i.password.length < 8 || i.password.length > 64) e.password = 'A senha deve ter entre 8 e 64 caracteres.'
  return e
}
