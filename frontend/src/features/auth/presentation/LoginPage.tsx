import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/core/http'
import { Alert } from '@/shared/ui/Alert'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Field'
import { validateLogin } from '../domain/validation'
import { homeFor, useAuth } from './authStore'

const DEMO = [
  { label: 'Leiloeiro', email: 'leiloeiro@demo.com' },
  { label: 'Licitante Ana', email: 'ana@demo.com' },
  { label: 'Licitante Bruno', email: 'bruno@demo.com' },
]

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const login = useAuth((s) => s.login)
  const nav = useNavigate()
  const [params] = useSearchParams()

  async function run(e: string, p: string) {
    setBusy(true)
    setFormError(null)
    try {
      const user = await login(e, p)
      const next = params.get('next')
      nav(next && next.startsWith('/') ? next : homeFor(user), { replace: true })
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível entrar.')
    } finally {
      setBusy(false)
    }
  }

  function submit(ev: FormEvent) {
    ev.preventDefault()
    const v = validateLogin(email, password)
    setErrors(v as Record<string, string>)
    if (Object.keys(v).length === 0) void run(email, password)
  }

  return (
    <div className="auth">
      <form className="card card--raised auth__card stack" onSubmit={submit} noValidate>
        <div>
          <h1>Entrar</h1>
          <p className="muted">Acesse sua conta para dar lances ou gerenciar seus lotes.</p>
        </div>
        {formError && <Alert tone="danger" live>{formError}</Alert>}
        <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Input label="Senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <Button type="submit" loading={busy} block>Entrar</Button>
        <p className="muted" style={{ textAlign: 'center' }}>Ainda não tem conta? <Link to="/cadastro">Cadastre-se</Link></p>
        <div className="demo">
          <span className="label muted">Contas de demonstração (senha demo1234)</span>
          <div className="row">
            {DEMO.map((d) => (
              <Button key={d.email} type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void run(d.email, 'demo1234')}>{d.label}</Button>
            ))}
          </div>
        </div>
      </form>
    </div>
  )
}
