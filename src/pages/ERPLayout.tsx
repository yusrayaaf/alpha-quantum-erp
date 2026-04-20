// src/pages/ERPLayout.tsx — Alpha Quantum ERP v20 (fixed sidebar collapse)
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useLang } from '../lib/LangContext'
import { useTheme } from '../lib/ThemeContext'
import { isSuperUser } from '../lib/auth'
import { api } from '../lib/api'
import { useEffect, useState, useCallback } from 'react'
import logoUrl from '../assets/logo-alpha.png'

interface NavItem { to: string; icon: string; label: string; perm?: string; su?: boolean; cubeAdmin?: boolean }
type NavSection = { title: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  { title: 'Finance', items: [
    { to: '/',            icon: '◈',  label: 'Dashboard' },
    { to: '/expenses',    icon: '💰', label: 'Expenses',    perm: 'expenses' },
    { to: '/invoices',    icon: '🧾', label: 'Invoices',    perm: 'finance' },
    { to: '/wallet',      icon: '💳', label: 'Wallet',      perm: 'finance' },
    { to: '/approvals',   icon: '✅', label: 'Approvals',   su: true },
  ]},
  { title: 'Assets & Budget', items: [
    { to: '/budget',      icon: '📊', label: 'Budget',      perm: 'budget' },
    { to: '/assets',      icon: '🏗️', label: 'Assets',      perm: 'assets' },
    { to: '/investments', icon: '📈', label: 'Investments', perm: 'investments' },
    { to: '/liabilities', icon: '🏦', label: 'Liabilities', perm: 'liabilities' },
  ]},
  { title: 'HR', items: [
    { to: '/workers',   icon: '👷', label: 'Workers',   perm: 'workers' },
    { to: '/timesheet', icon: '🕐', label: 'Timesheet', perm: 'timesheet' },
    { to: '/salary',    icon: '💵', label: 'Salary',    perm: 'salary' },
  ]},
  { title: 'CRM', items: [
    { to: '/crm/customers', icon: '🏢', label: 'Customers', perm: 'crm' },
    { to: '/crm/leads',     icon: '🎯', label: 'Leads',     perm: 'crm' },
  ]},
  { title: 'Projects', items: [
    { to: '/projects', icon: '📁', label: 'Projects', perm: 'projects' },
    { to: '/tasks',    icon: '✔️', label: 'Tasks',    perm: 'projects' },
  ]},
  { title: 'System', items: [
    { to: '/reports',                icon: '📋', label: 'Reports',      perm: 'reports' },
    { to: '/users',                  icon: '👥', label: 'Users',        su: true },
    { to: '/permissions',            icon: '🔐', label: 'Permissions',  su: true },
    { to: '/form-builder',           icon: '🛠️', label: 'Form Builder', su: true },
    { to: '/subscription',           icon: '💎', label: 'Subscription', su: true },
    { to: '/cube-admin',             icon: '🧊', label: 'Cube Admin',   cubeAdmin: true },
    { to: '/settings',               icon: '⚙️', label: 'Settings' },
    { to: '/notifications/settings', icon: '🔔', label: 'Notifications' },
  ]},
]

const COLLAPSE_KEY = 'aq_sidebar_collapsed'

export default function ERPLayout() {
  const { user, logout } = useAuth()
  const { lang, toggle } = useLang()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const su = isSuperUser(user)
  const isAdmin = ['creator','cube_admin','superuser'].includes(user?.role || '')

  const [unread, setUnread]     = useState(0)
  const [mobileOpen, setMobile] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  const [userMenu, setUserMenu] = useState(false)

  const toggleCollapse = useCallback(() => {
    setCollapsed(c => {
      const next = !c
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  const fetchUnread = useCallback(() => {
    api.get<{ unread: number }>('/notifications')
      .then(d => setUnread(d.unread ?? 0))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchUnread()
    const id = setInterval(fetchUnread, 30_000)
    return () => clearInterval(id)
  }, [fetchUnread])

  useEffect(() => {
    if (!userMenu) return
    const close = () => setUserMenu(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [userMenu])

  function canSee(item: NavItem) {
    if (item.cubeAdmin) return isAdmin
    if (item.su)        return su
    if (!item.perm)     return true
    const lv = user?.permissions?.[item.perm]
    return su || (!!lv && lv !== 'none')
  }

  const initials = user?.full_name
    ?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'AQ'

  return (
    <div
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
      style={{ display:'flex', minHeight:'100dvh', background:'var(--base)' }}
    >
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobile(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:200, backdropFilter:'blur(4px)' }}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className={`erp-sidebar${mobileOpen ? ' mobile-open' : ''}${collapsed ? ' collapsed' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <img
            src={logoUrl} alt="Alpha"
            style={{ width:36, height:36, borderRadius:9, objectFit:'cover', flexShrink:0 }}
            onError={e => (e.currentTarget.style.display = 'none')}
          />
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-name">ALPHA</div>
            <div className="sidebar-brand-sub">QUANTUM ERP</div>
          </div>
          <button
            className="sidebar-collapse-btn"
            onClick={toggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Nav sections */}
        <nav className="sidebar-nav">
          {SECTIONS.map(sec => {
            const visible = sec.items.filter(canSee)
            if (!visible.length) return null
            return (
              <div key={sec.title}>
                <div className="sidebar-section-title"><span>{sec.title}</span></div>
                {visible.map(item => (
                  <NavLink
                    key={item.to} to={item.to} end={item.to === '/'}
                    onClick={() => setMobile(false)}
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                    title={item.label}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    <span className="nav-label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}

          {user?.role === 'creator' && (
            <div style={{ borderTop:'1px solid var(--border)', marginTop:'.5rem' }}>
              <NavLink
                to="/creator" onClick={() => setMobile(false)}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                style={{ color:'var(--amber-bright)', fontWeight:600 }}
                title="Creator Panel"
              >
                <span className="nav-icon">👑</span>
                <span className="nav-label">Creator Panel</span>
              </NavLink>
            </div>
          )}
        </nav>

        {/* User card */}
        <div className="sidebar-user">
          <div className="sidebar-user-row">
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="" style={{ width:34, height:34, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
              : <div className="user-avatar">{initials}</div>
            }
            <div className="sidebar-user-info">
              <div style={{ color:'var(--text)', fontSize:'.82rem', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {user?.full_name}
              </div>
              <div style={{ color:'var(--text3)', fontSize:'.69rem', textTransform:'capitalize' }}>
                {user?.role?.replace('_', ' ')}
              </div>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="btn btn-secondary btn-sm w-full sidebar-signout-btn"
            style={{ fontWeight:600 }}
            title="Sign Out"
          >
            <span className="signout-icon">⏻</span>
            <span className="nav-label" style={{ marginLeft:'.4rem' }}>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <div className={`erp-main${collapsed ? ' sidebar-collapsed' : ''}`}>
        {/* Topbar */}
        <header className="erp-topbar">
          {/* Mobile menu toggle — visible only on mobile */}
          <button
            className="mobile-menu-btn topbar-btn"
            onClick={() => setMobile(s => !s)}
          >
            ☰
          </button>

          {/* Desktop collapse toggle — hidden on mobile */}
          <button
            className="desktop-collapse-btn topbar-btn"
            onClick={toggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '☰' : '✕'}
          </button>

          <div style={{ flex:1 }} />

          <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
            <button className="topbar-btn" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            <button
              className="topbar-btn" onClick={toggle}
              style={{ fontFamily:'var(--font-mono)', fontSize:'.75rem', fontWeight:700 }}
            >
              {lang === 'en' ? 'AR' : 'EN'}
            </button>

            <button
              className="topbar-btn" style={{ position:'relative' }}
              onClick={() => navigate('/notifications/settings')}
            >
              🔔
              {unread > 0 && <span className="notif-dot">{unread > 99 ? '99+' : unread}</span>}
            </button>

            <button
              className="topbar-btn" style={{ padding:'.25rem', position:'relative' }}
              onClick={e => { e.stopPropagation(); setUserMenu(m => !m) }}
            >
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="" style={{ width:30, height:30, borderRadius:'50%', objectFit:'cover' }} />
                : <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,var(--blue),var(--violet))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.68rem', fontWeight:700, color:'#fff' }}>{initials}</div>
              }
              {userMenu && (
                <div
                  onClick={e => e.stopPropagation()}
                  style={{ position:'absolute', top:'110%', right:0, background:'var(--card)', border:'1px solid var(--border2)', borderRadius:'var(--radius-lg)', minWidth:200, boxShadow:'var(--shadow-lg)', zIndex:100, overflow:'hidden' }}
                >
                  <div style={{ padding:'.9rem 1rem', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontWeight:700, fontSize:'.85rem', color:'var(--text)' }}>{user?.full_name}</div>
                    <div style={{ fontSize:'.72rem', color:'var(--text3)', marginTop:'.15rem' }}>{user?.email}</div>
                  </div>
                  <button
                    onClick={() => { navigate('/settings'); setUserMenu(false) }}
                    style={{ width:'100%', padding:'.7rem 1rem', background:'none', border:'none', color:'var(--text2)', cursor:'pointer', textAlign:'left', fontSize:'.84rem', display:'flex', gap:'.5rem', alignItems:'center' }}
                  >
                    ⚙️ Settings
                  </button>
                  <button
                    onClick={() => { logout(); navigate('/login') }}
                    style={{ width:'100%', padding:'.7rem 1rem', background:'none', border:'none', color:'var(--rose)', cursor:'pointer', textAlign:'left', fontSize:'.84rem', display:'flex', gap:'.5rem', alignItems:'center', borderTop:'1px solid var(--border)' }}
                  >
                    ⏻ Sign Out
                  </button>
                </div>
              )}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex:1, overflow:'auto' }}>
          <Outlet />
        </main>
      </div>

      {/* ── Mobile Bottom Navigation ──────────────────────────── */}
      <nav className="mobile-bottom-nav">
        <div className="mobile-bottom-nav-inner">
          <NavLink to="/" end className={({isActive}) => `mobile-nav-btn${isActive?' active':''}`} onClick={() => setMobile(false)}>
            <span className="nav-icon">◈</span>
            <span>Home</span>
          </NavLink>
          <NavLink to="/expenses" className={({isActive}) => `mobile-nav-btn${isActive?' active':''}`} onClick={() => setMobile(false)}>
            <span className="nav-icon">💰</span>
            <span>Expenses</span>
          </NavLink>
          <NavLink to="/invoices" className={({isActive}) => `mobile-nav-btn${isActive?' active':''}`} onClick={() => setMobile(false)}>
            <span className="nav-icon">🧾</span>
            <span>Invoices</span>
          </NavLink>
          <button className="mobile-nav-btn" onClick={() => setMobile(s => !s)}>
            <span className="nav-icon">☰</span>
            <span>Menu</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
