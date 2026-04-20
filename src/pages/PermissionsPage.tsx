// src/pages/PermissionsPage.tsx — Alpha Quantum ERP v20 (full permission matrix)
import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import type { PermLevel } from '../lib/auth'

interface UserRow {
  id: string; username: string; full_name: string; role: string
  department: string; email: string; is_active: boolean
  permissions: Record<string, PermLevel>
}

// All modules matching the actual ERP routes
const MODULE_GROUPS = [
  {
    group: '💰 Finance',
    modules: [
      { key: 'finance',     label: 'Finance',      icon: '◈', desc: 'Core financial records, wallet, balance' },
      { key: 'expenses',    label: 'Expenses',      icon: '💰', desc: 'Submit and view expense records' },
      { key: 'invoices',    label: 'Invoices',      icon: '🧾', desc: 'Create, send, and manage invoices' },
      { key: 'wallet',      label: 'Wallet',        icon: '💳', desc: 'View wallet balance and transactions' },
      { key: 'approvals',   label: 'Approvals',     icon: '✅', desc: 'Approve or reject pending submissions' },
      { key: 'budget',      label: 'Budget',        icon: '📊', desc: 'Set and monitor budget allocations' },
    ],
  },
  {
    group: '🏗️ Assets & Investment',
    modules: [
      { key: 'assets',      label: 'Assets',        icon: '🏗️', desc: 'Asset register, depreciation, maintenance' },
      { key: 'investments', label: 'Investments',   icon: '📈', desc: 'Investment portfolio and tracking' },
      { key: 'liabilities', label: 'Liabilities',   icon: '🏦', desc: 'Loans, payables, and credit management' },
    ],
  },
  {
    group: '👷 HR & Payroll',
    modules: [
      { key: 'workers',     label: 'Workers',       icon: '👷', desc: 'Employee profiles and management' },
      { key: 'timesheet',   label: 'Timesheet',     icon: '🕐', desc: 'Time tracking and attendance logs' },
      { key: 'salary',      label: 'Salary',        icon: '💵', desc: 'Payroll processing and salary records' },
    ],
  },
  {
    group: '🏢 CRM',
    modules: [
      { key: 'crm',         label: 'CRM (All)',     icon: '🏢', desc: 'Full CRM module access' },
      { key: 'customers',   label: 'Customers',     icon: '🤝', desc: 'Customer profiles and history' },
      { key: 'leads',       label: 'Leads',         icon: '🎯', desc: 'Lead pipeline and conversion' },
    ],
  },
  {
    group: '📁 Projects',
    modules: [
      { key: 'projects',    label: 'Projects',      icon: '📁', desc: 'Project management and progress' },
      { key: 'tasks',       label: 'Tasks',         icon: '✔️',  desc: 'Task assignment and tracking' },
    ],
  },
  {
    group: '🔧 System',
    modules: [
      { key: 'reports',     label: 'Reports',       icon: '📋', desc: 'Export PDF, XLSX financial reports' },
      { key: 'users',       label: 'Users',         icon: '👥', desc: 'Create and manage user accounts' },
      { key: 'settings',    label: 'Settings',      icon: '⚙️',  desc: 'System config, branding, tax rules' },
    ],
  },
]

// All 7 access levels from auth.ts
const LEVELS: {
  value: PermLevel; label: string; short: string
  color: string; bg: string; border: string; desc: string
}[] = [
  {
    value: 'none',              label: 'No Access',          short: 'NONE',
    color: 'var(--text3)',      bg: 'rgba(100,100,120,0.08)', border: 'rgba(100,100,120,0.2)',
    desc: 'Module is fully hidden',
  },
  {
    value: 'submit_only',       label: 'Submit Only',        short: 'SUBMIT',
    color: 'var(--amber)',      bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',
    desc: 'Can submit records only, cannot view history',
  },
  {
    value: 'view_own',          label: 'View Own',           short: 'OWN',
    color: 'var(--blue)',       bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)',
    desc: 'Can view their own records only',
  },
  {
    value: 'view_all',          label: 'View All',           short: 'ALL',
    color: 'var(--cyan)',       bg: 'rgba(8,145,178,0.1)',   border: 'rgba(8,145,178,0.3)',
    desc: 'Can view all records in the module',
  },
  {
    value: 'view_with_details', label: 'View + Details',     short: 'DETAILS',
    color: 'var(--violet)',     bg: 'rgba(124,58,237,0.1)',  border: 'rgba(124,58,237,0.3)',
    desc: 'View all records with full financial breakdown',
  },
  {
    value: 'report_view',       label: 'Reports Only',       short: 'REPORT',
    color: '#10b981',           bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)',
    desc: 'Can view and export reports, read-only',
  },
  {
    value: 'full_control',      label: 'Full Control',       short: 'FULL',
    color: 'var(--green)',      bg: 'rgba(5,150,105,0.12)',  border: 'rgba(5,150,105,0.35)',
    desc: 'Full CRUD + approve/reject + admin override',
  },
]

function levelDef(v: PermLevel | undefined) {
  return LEVELS.find(l => l.value === v) ?? LEVELS[0]
}

const ROLE_COLORS: Record<string, string> = {
  superuser: 'var(--blue)',    manager: 'var(--cyan)',
  accountant: 'var(--violet)', hr: 'var(--amber)',
  employee: 'var(--text2)',    viewer: 'var(--text3)',
}

export default function PermissionsPage() {
  const { user } = useAuth()
  const isAdmin = ['creator', 'cube_admin', 'superuser'].includes(user?.role || '')

  const [users,    setUsers]    = useState<UserRow[]>([])
  const [selected, setSelected] = useState<UserRow | null>(null)
  const [perms,    setPerms]    = useState<Record<string, PermLevel>>({})
  const [original, setOriginal] = useState<Record<string, PermLevel>>({})
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [bulkSave, setBulkSave] = useState<string | null>(null)
  const [msg,      setMsg]      = useState('')
  const [err,      setErr]      = useState('')
  const [search,   setSearch]   = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_GROUPS.map(g => [g.group, true]))
  )

  const isDirty = JSON.stringify(perms) !== JSON.stringify(original)

  const allModules = MODULE_GROUPS.flatMap(g => g.modules)

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return }
    api.get<{ users: UserRow[] }>('/permissions')
      .then(d => setUsers((d.users || []).filter(u => !['creator', 'cube_admin'].includes(u.role))))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  const loadPerms = useCallback(async (u: UserRow) => {
    setMsg(''); setErr('')
    try {
      const d = await api.get<{ permissions: { module: string; access_level: PermLevel }[] }>(`/permissions?userId=${u.id}`)
      const map: Record<string, PermLevel> = {}
      d.permissions?.forEach(p => { map[p.module] = p.access_level })
      allModules.forEach(m => { if (!map[m.key]) map[m.key] = 'none' })
      setPerms({ ...map }); setOriginal({ ...map })
    } catch (e: unknown) {
      // Fall back to permissions in user object
      const map: Record<string, PermLevel> = {}
      allModules.forEach(m => { map[m.key] = (u.permissions?.[m.key] as PermLevel) || 'none' })
      setPerms({ ...map }); setOriginal({ ...map })
    }
  }, [allModules])

  useEffect(() => {
    if (selected) loadPerms(selected)
  }, [selected, loadPerms])

  function setLevel(moduleKey: string, level: PermLevel) {
    setMsg('')
    setPerms(p => ({ ...p, [moduleKey]: level }))
  }

  function setGroupLevel(group: string, level: PermLevel) {
    const g = MODULE_GROUPS.find(g => g.group === group)
    if (!g) return
    const updates: Record<string, PermLevel> = {}
    g.modules.forEach(m => { updates[m.key] = level })
    setPerms(p => ({ ...p, ...updates }))
  }

  function setAllLevel(level: PermLevel) {
    const map: Record<string, PermLevel> = {}
    allModules.forEach(m => { map[m.key] = level })
    setPerms(map)
  }

  function reset() { setPerms({ ...original }); setMsg('') }

  async function savePerms() {
    if (!selected) return
    setSaving(true); setMsg(''); setErr('')
    try {
      await api.put('/permissions', { userId: selected.id, permissions: perms })
      setOriginal({ ...perms })
      // Update the user in list too
      setUsers(prev => prev.map(u =>
        u.id === selected.id ? { ...u, permissions: { ...perms } } : u
      ))
      setMsg('Permissions saved successfully ✓')
      setTimeout(() => setMsg(''), 3000)
    } catch (e: unknown) {
      // Fallback: save one by one
      try {
        await Promise.all(
          Object.entries(perms).map(([module, level]) =>
            api.post('/permissions', { user_id: selected.id, module, level })
          )
        )
        setOriginal({ ...perms })
        setMsg('Permissions saved ✓')
        setTimeout(() => setMsg(''), 3000)
      } catch (e2: unknown) {
        setErr(e2 instanceof Error ? e2.message : 'Save failed')
      }
    } finally { setSaving(false) }
  }

  // Apply a role preset
  function applyPreset(preset: string) {
    const map: Record<string, PermLevel> = {}
    allModules.forEach(m => { map[m.key] = 'none' })
    if (preset === 'finance') {
      ['finance','expenses','invoices','wallet','budget','reports'].forEach(k => { map[k] = 'view_all' })
      map.approvals = 'full_control'
    } else if (preset === 'hr') {
      ['workers','timesheet','salary'].forEach(k => { map[k] = 'full_control' })
      map.reports = 'report_view'
    } else if (preset === 'viewer') {
      allModules.forEach(m => { map[m.key] = 'view_own' })
    } else if (preset === 'manager') {
      allModules.forEach(m => { map[m.key] = 'view_all' })
      map.approvals = 'full_control'; map.users = 'none'; map.settings = 'none'
    } else if (preset === 'full') {
      allModules.forEach(m => { map[m.key] = 'full_control' })
    }
    setPerms(map)
  }

  const filtered = users.filter(u =>
    !search || [u.full_name, u.username, u.email, u.department, u.role]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()))
  )

  if (!isAdmin) return (
    <div className="page-content">
      <div className="empty-state">
        <div className="empty-icon">🔐</div>
        <div className="empty-title">Admin Access Required</div>
        <div className="empty-desc">You need superuser privileges to manage permissions.</div>
      </div>
    </div>
  )

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">🔐 Permissions</h1>
          <p className="page-sub">Granular module-level access control for each user</p>
        </div>
      </div>

      {msg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{msg}</div>}
      {err && <div className="alert alert-error"  style={{ marginBottom: '1rem' }}>{err}</div>}

      {/* ── Level Legend ── */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '.6rem' }}>Access Level Reference</div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          {LEVELS.map(lv => (
            <div key={lv.value} style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
              <span style={{
                padding: '.12rem .5rem', borderRadius: 20, fontSize: '.65rem', fontWeight: 700,
                fontFamily: 'var(--font-mono)', letterSpacing: '.05em',
                color: lv.color, background: lv.bg, border: `1px solid ${lv.border}`,
              }}>{lv.short}</span>
              <span style={{ fontSize: '.74rem', color: 'var(--text2)' }}>{lv.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '260px 1fr' : '1fr', gap: '1.1rem', alignItems: 'start' }}>

        {/* ── User List ── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: 'calc(var(--topbar-h) + 1rem)' }}>
          <div style={{ padding: '.75rem', borderBottom: '1px solid var(--border)' }}>
            <input className="input" placeholder="🔍 Search users…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%' }} />
          </div>
          {loading
            ? <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
            : (
              <div style={{ maxHeight: 'calc(100dvh - 280px)', overflowY: 'auto' }}>
                {filtered.map(u => {
                  const isSelected = selected?.id === u.id
                  const accessCount = Object.values(u.permissions || {}).filter(v => v !== 'none').length
                  return (
                    <div
                      key={u.id}
                      onClick={() => setSelected(isSelected ? null : u)}
                      style={{
                        padding: '.75rem 1rem', cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        background: isSelected ? 'var(--blue-d)' : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--blue)' : '3px solid transparent',
                        transition: 'all .12s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.2rem' }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '.7rem', fontWeight: 700, color: '#fff',
                        }}>
                          {u.full_name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '.84rem', color: isSelected ? 'var(--blue-bright)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.full_name}
                          </div>
                          <div style={{ fontSize: '.7rem', color: 'var(--text3)', display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                            <span style={{ color: ROLE_COLORS[u.role] || 'var(--text3)', fontWeight: 600, textTransform: 'capitalize' }}>{u.role}</span>
                            {u.department && <><span>·</span><span>{u.department}</span></>}
                          </div>
                        </div>
                        {!u.is_active && (
                          <span style={{ fontSize: '.6rem', padding: '.1rem .35rem', background: 'var(--rose)20', color: 'var(--rose)', borderRadius: 20, fontWeight: 700 }}>OFF</span>
                        )}
                      </div>
                      {/* Permission dots */}
                      <div style={{ display: 'flex', gap: 3, marginTop: '.35rem', flexWrap: 'wrap' }}>
                        {allModules.slice(0, 10).map(m => {
                          const lv = u.permissions?.[m.key] || 'none'
                          const def = levelDef(lv as PermLevel)
                          return (
                            <div key={m.key} title={`${m.label}: ${lv}`}
                              style={{ width: 7, height: 7, borderRadius: '50%', background: lv === 'none' ? 'var(--border2)' : def.color }} />
                          )
                        })}
                        {accessCount > 0 && (
                          <span style={{ fontSize: '.6rem', color: 'var(--text3)', marginLeft: 2 }}>{accessCount} modules</span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text3)', fontSize: '.84rem' }}>No users found</div>
                )}
              </div>
            )
          }
        </div>

        {/* ── Permission Matrix ── */}
        {selected ? (
          <div>
            {/* Header bar */}
            <div className="card" style={{ marginBottom: '.85rem', padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem', fontWeight: 700, color: '#fff',
                }}>
                  {selected.full_name?.[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{selected.full_name}</div>
                  <div style={{ fontSize: '.74rem', color: 'var(--text3)' }}>{selected.email} · @{selected.username}</div>
                </div>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {isDirty && <span style={{ fontSize: '.7rem', padding: '.15rem .5rem', borderRadius: 20, background: 'var(--amber)18', color: 'var(--amber)', border: '1px solid var(--amber)40', fontWeight: 700 }}>UNSAVED</span>}
                  <button className="btn btn-secondary btn-sm" onClick={reset} disabled={saving || !isDirty}>↩ Reset</button>
                  <button className="btn btn-primary btn-sm" onClick={savePerms} disabled={saving || !isDirty}>
                    {saving ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Saving…</> : '✓ Save All'}
                  </button>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '1.1rem', padding: '.1rem .3rem' }}>✕</button>
                </div>
              </div>

              {/* Quick presets */}
              <div style={{ marginTop: '.85rem', paddingTop: '.85rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text3)', fontFamily: 'var(--font-mono)', letterSpacing: '.05em' }}>PRESETS:</span>
                {[
                  { key: 'none',    label: 'Lock All',     color: 'var(--text3)' },
                  { key: 'viewer',  label: 'Viewer',       color: 'var(--blue)' },
                  { key: 'finance', label: 'Finance Role', color: 'var(--cyan)' },
                  { key: 'hr',      label: 'HR Role',      color: 'var(--amber)' },
                  { key: 'manager', label: 'Manager',      color: 'var(--violet)' },
                  { key: 'full',    label: 'Full Access',  color: 'var(--green)' },
                ].map(p => (
                  <button key={p.key} onClick={() => applyPreset(p.key)}
                    style={{
                      padding: '.22rem .65rem', borderRadius: 20, border: `1px solid ${p.color}40`,
                      background: `${p.color}10`, color: p.color,
                      fontSize: '.72rem', fontWeight: 700, cursor: 'pointer', transition: 'all .12s',
                      fontFamily: 'var(--font-mono)',
                    }}>
                    {p.label}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>QUICK SET ALL:</span>
                {LEVELS.map(lv => (
                  <button key={lv.value} onClick={() => setAllLevel(lv.value)}
                    style={{
                      padding: '.2rem .55rem', borderRadius: 20, cursor: 'pointer',
                      fontSize: '.68rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
                      border: `1px solid ${lv.border}`, background: lv.bg, color: lv.color,
                    }}>{lv.short}</button>
                ))}
              </div>
            </div>

            {/* Module groups */}
            {MODULE_GROUPS.map(grp => {
              const isExpanded = expandedGroups[grp.group] !== false
              const groupLevels = grp.modules.map(m => perms[m.key] || 'none')
              const allSame = groupLevels.every(l => l === groupLevels[0])
              const groupLevel = allSame ? groupLevels[0] : null

              return (
                <div key={grp.group} className="card" style={{ marginBottom: '.75rem', padding: 0, overflow: 'hidden' }}>
                  {/* Group header */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: '.75rem',
                      padding: '.8rem 1.1rem', cursor: 'pointer',
                      borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
                      background: 'var(--hover-bg)', userSelect: 'none',
                    }}
                    onClick={() => setExpandedGroups(p => ({ ...p, [grp.group]: !isExpanded }))}
                  >
                    <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text)', flex: 1 }}>{grp.group}</span>
                    {/* Group level chips */}
                    <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                      {LEVELS.map(lv => {
                        const isActive = groupLevel === lv.value
                        return (
                          <button key={lv.value}
                            onClick={() => setGroupLevel(grp.group, lv.value)}
                            title={`Set all ${grp.group} to ${lv.label}`}
                            style={{
                              padding: '.16rem .45rem', borderRadius: 20, cursor: 'pointer',
                              fontSize: '.62rem', fontWeight: isActive ? 700 : 400,
                              fontFamily: 'var(--font-mono)',
                              border: `1px solid ${isActive ? lv.border : 'var(--border)'}`,
                              background: isActive ? lv.bg : 'transparent',
                              color: isActive ? lv.color : 'var(--text3)',
                              transition: 'all .12s',
                            }}>{lv.short}</button>
                        )
                      })}
                    </div>
                    <span style={{ color: 'var(--text3)', fontSize: '.8rem', marginLeft: '.25rem' }}>{isExpanded ? '▾' : '▸'}</span>
                  </div>

                  {/* Module rows */}
                  {isExpanded && grp.modules.map(mod => {
                    const current = perms[mod.key] || 'none'
                    const currentDef = levelDef(current as PermLevel)
                    return (
                      <div key={mod.key}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '.65rem',
                          padding: '.65rem 1.1rem', borderBottom: '1px solid var(--border)',
                          flexWrap: 'wrap',
                          background: current !== 'none' ? `${currentDef.color}05` : 'transparent',
                          transition: 'background .15s',
                        }}
                      >
                        {/* Module info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 170, flex: '0 0 auto' }}>
                          <span style={{ fontSize: '.9rem', width: 22, textAlign: 'center', flexShrink: 0 }}>{mod.icon}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '.84rem', color: 'var(--text)' }}>{mod.label}</div>
                            <div style={{ fontSize: '.68rem', color: 'var(--text3)' }}>{mod.desc}</div>
                          </div>
                        </div>

                        {/* Level buttons */}
                        <div style={{ display: 'flex', gap: '.28rem', flexWrap: 'wrap', flex: 1 }}>
                          {LEVELS.map(lv => {
                            const active = current === lv.value
                            return (
                              <button key={lv.value}
                                onClick={() => setLevel(mod.key, lv.value)}
                                title={lv.desc}
                                style={{
                                  padding: '.22rem .6rem', borderRadius: 20, cursor: 'pointer',
                                  fontSize: '.7rem', fontWeight: active ? 700 : 400,
                                  fontFamily: 'var(--font-mono)',
                                  border: `1px solid ${active ? lv.border : 'var(--border)'}`,
                                  background: active ? lv.bg : 'transparent',
                                  color: active ? lv.color : 'var(--text3)',
                                  boxShadow: active ? `0 0 8px ${lv.bg}` : 'none',
                                  transform: active ? 'scale(1.05)' : 'scale(1)',
                                  transition: 'all .13s',
                                }}>{lv.short}</button>
                            )
                          })}
                        </div>

                        {/* Current badge */}
                        <span style={{
                          flexShrink: 0, padding: '.15rem .5rem', borderRadius: 20,
                          fontSize: '.65rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
                          color: currentDef.color, background: currentDef.bg, border: `1px solid ${currentDef.border}`,
                        }}>{currentDef.short}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Bottom save bar */}
            <div className="card" style={{ display: 'flex', gap: '.75rem', alignItems: 'center', padding: '1rem 1.25rem' }}>
              <button className="btn btn-primary" onClick={savePerms} disabled={saving || !isDirty}>
                {saving ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving…</> : '✓ Save Permissions'}
              </button>
              <button className="btn btn-secondary" onClick={reset} disabled={saving || !isDirty}>↩ Reset Changes</button>
              {!isDirty && msg && <span style={{ fontSize: '.82rem', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '.35rem' }}>✓ All saved</span>}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: '.75rem', color: 'var(--text3)' }}>
                {Object.values(perms).filter(v => v !== 'none').length} / {allModules.length} modules enabled
              </span>
            </div>
          </div>
        ) : !loading && (
          <div className="empty-state card" style={{ minHeight: 300 }}>
            <div className="empty-icon">👈</div>
            <div className="empty-title">Select a User</div>
            <div className="empty-desc">Click any user on the left to configure their module permissions</div>
          </div>
        )}
      </div>
    </div>
  )
}
