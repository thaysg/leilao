import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Gavel, Hammer } from 'lucide-react'
import { ApiError } from '@/core/http'
import { Alert } from '@/shared/ui/Alert'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Field'
import type { Role } from '../domain/entities'
import { validateRegister } from '../domain/validation'
import { homeFor, useAuth } from './authStore'

const ROLES: { role: Role; title: string; text: string; icon: typeof Gavel }[] = [
  { role: 'bidder', title: 'Quero dar lances', text: 'Deposite saldo, dispute lotes ao vivo e arremate.', icon: Hammer },
  { role: 'seller', title: 'Quero leiloar', text: 'Monte lotes a partir de itens e acompanhe os resultados.', icon: Gavel },
]

export function RegisterPage() {
  const [role, setRole] = useState<Role>('bidder')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const register = useAuth((s) => s.register)
  const nav = useNavigate()

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const input = { name, email, password, role }
    const v = validateRegister(input)
    setErrors(v as Record<string, string>)
    if (Object.keys(v).length) return
    setBusy(true)
    setFormError(null)
    try {
      nav(homeFor(await register(input)), { replace: true })
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form className="card card--raised auth__card stack" onSubmit={submit} noValidate>
        <div>
          <h1>Criar conta</h1>
          <p className="muted">Escolha como você quer participar.</p>
        </div>
        <div className="role-picker" role="radiogroup" aria-label="Tipo de conta">
          {ROLES.map(({ role: r, title, text, icon: Icon }) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} className={`role-card ${role === r ? 'is-active' : ''}`} onClick={() => setRole(r)}>
              <Icon size={22} aria-hidden />
              <strong>{title}</strong>
              <span>{text}</span>
            </button>
          ))}
        </div>
        {formError && <Alert tone="danger" live>{formError}</Alert>}
        <Input label="Nome" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <div className="field">
          <Input label="Senha" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="Entre 8 e 64 caracteres." />
          <label className="check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar senha</label>
        </div>
        <Button type="submit" loading={busy} block>Criar conta</Button>
        <p className="muted" style={{ textAlign: 'center' }}>Já tem conta? <Link to="/login">Entrar</Link></p>
      </form>
    </div>
  )
}
