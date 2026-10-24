import { Link, NavLink, Outlet } from 'react-router-dom'
import { Gavel, History, LayoutDashboard, LogIn, LogOut, Moon, Store, Sun, Trophy, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTheme } from '@/core/theme'
import { useAuth } from '@/features/auth/presentation/authStore'
import { ToastHost } from '@/shared/ui/Toast'

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

function navFor(role: 'seller' | 'bidder' | undefined): NavItem[] {
  const base: NavItem[] = [{ to: '/', label: 'Vitrine', icon: Store, end: true }]
  if (role === 'bidder') {
    return [...base,
      { to: '/carteira', label: 'Carteira', icon: Wallet },
      { to: '/meus-lances', label: 'Meus lances', icon: History },
      { to: '/meus-arremates', label: 'Arremates', icon: Trophy }]
  }
  if (role === 'seller') return [...base, { to: '/painel', label: 'Painel', icon: LayoutDashboard }]
  return [...base, { to: '/login', label: 'Entrar', icon: LogIn }]
}

export function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const items = navFor(user?.role)

  return (
    <>
      <a href="#main" className="skip">Ir para o conteúdo</a>
      <header className="header">
        <div className="container header__in">
          <Link to="/" className="brand" aria-label="Casa de Leilões, início">
            <span className="brand__mark"><Gavel size={18} aria-hidden /></span>
            <span>Casa de Leilões</span>
          </Link>
          <nav className="nav" aria-label="Principal">
            {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className="nav__link">{i.label}</NavLink>)}
          </nav>
          <div className="header__actions">
            <button className="btn btn--ghost btn--sm icon-btn" onClick={toggle} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {user ? (
              <div className="user">
                <div className="user__info">
                  <span className="user__name">{user.name}</span>
                  <span className="user__role">{user.role === 'seller' ? 'Leiloeiro' : 'Licitante'}</span>
                </div>
                <button className="btn btn--ghost btn--sm icon-btn" onClick={logout} aria-label="Sair"><LogOut size={18} /></button>
              </div>
            ) : (
              <>
                <Link className="btn btn--ghost btn--sm hide-sm" to="/login">Entrar</Link>
                <Link className="btn btn--primary btn--sm" to="/cadastro">Criar conta</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="container main"><Outlet /></main>
      <nav className="tabbar" aria-label="Navegação">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className="tabbar__item">
            <i.icon size={20} />
            <span>{i.label}</span>
          </NavLink>
        ))}
      </nav>
      <ToastHost />
    </>
  )
}
