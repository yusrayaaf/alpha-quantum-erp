// src/pages/BudgetPage.tsx — Budget Management Module
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { isSuperUser } from '../lib/auth'
import { api } from '../lib/api'

interface Budget {
  id: string; budget_number: string; name: string; category: string
  fiscal_year: number; fiscal_quarter: number; total_budget: number
  spent_amount: number; committed_amount: number; status: string
  project_branch: string; notes: string; created_at: string; created_by_name?: string
}

const CAT_COLORS: Record<string, string> = {
  operations: '#4f8cff', labour: '#00ffb3', equipment: '#ffe135',
  materials: '#bf5fff', overhead: '#ff3cac', other: '#8b86c8'
}

export default function BudgetPage() {
  const { user } = useAuth()
  const su = isSuperUser(user)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<Budget | null>(null)
  const [error, setError] = useState('')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString())

  const load = () => {
    setLoading(true)
    api.get<{ budgets: Budget[] }>('/budgets')
      .then(d => setBudgets(d.budgets))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = budgets.filter(b => !filterYear || b.fiscal_year.toString() === filterYear)

  const totalBudget = filtered.reduce((s, b) => s + Number(b.total_budget), 0)
  const totalSpent = filtered.reduce((s, b) => s + Number(b.spent_amount), 0)
  const totalRemaining = totalBudget - totalSpent
  const utilizationPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

  if (loading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ width: 40, height: 40, border: '3px solid var(--border2)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding: '1rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--text)', margin: 0 }}>📊 Budget Management</h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>
            FY {filterYear} · {filtered.length} budgets
          </div>
        </div>
        {su && <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ fontSize: '0.85rem' }}>+ New Budget</button>}
      </div>

      {error && <div className="alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Budget overview */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.2rem', marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--muted)', marginBottom: '0.8rem', letterSpacing: '0.08em' }}>FY {filterYear} OVERVIEW</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '1rem', marginBottom: '1rem' }}>
          {[
            { label: 'Total Budget', val: `SAR ${totalBudget.toLocaleString('en-SA', { minimumFractionDigits: 2 })}`, color: 'var(--blue)' },
            { label: 'Total Spent', val: `SAR ${totalSpent.toLocaleString('en-SA', { minimumFractionDigits: 2 })}`, color: '#ff3cac' },
            { label: 'Remaining', val: `SAR ${totalRemaining.toLocaleString('en-SA', { minimumFractionDigits: 2 })}`, color: '#00ffb3' },
            { label: 'Utilization', val: `${utilizationPct.toFixed(1)}%`, color: utilizationPct > 90 ? '#ff3cac' : utilizationPct > 70 ? '#ffe135' : '#00ffb3' },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize: '0.6rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem' }}>{f.label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: f.color, fontFamily: 'var(--font-mono)' }}>{f.val}</div>
            </div>
          ))}
        </div>
        {/* Progress bar */}
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 8, transition: 'width 0.8s ease',
            width: `${Math.min(utilizationPct, 100)}%`,
            background: utilizationPct > 90 ? 'linear-gradient(90deg,#ff3cac,#bf5fff)' : utilizationPct > 70 ? 'linear-gradient(90deg,#ffe135,#00ffb3)' : 'linear-gradient(90deg,#4f8cff,#00ffb3)',
          }} />
        </div>
      </div>

      {/* Year filter */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className="form-select" style={{ fontSize: '0.8rem' }}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Budget cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>No budgets for this year</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '0.8rem' }}>
          {filtered.map(budget => {
            const pct = Number(budget.total_budget) > 0 ? (Number(budget.spent_amount) / Number(budget.total_budget)) * 100 : 0
            const remaining = Number(budget.total_budget) - Number(budget.spent_amount)
            const catColor = CAT_COLORS[budget.category] || '#8b86c8'
            return (
              <div key={budget.id} onClick={() => setSelected(budget)}
                style={{ background: 'var(--card)', border: `1px solid ${catColor}33`, borderRadius: 12, padding: '1rem', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = '' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{budget.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--muted)' }}>{budget.budget_number} · Q{budget.fiscal_quarter} {budget.fiscal_year}</div>
                  </div>
                  <span style={{
                    padding: '0.15rem 0.5rem', borderRadius: 20, fontSize: '0.58rem', fontFamily: 'var(--font-mono)',
                    background: `${catColor}22`, color: catColor, border: `1px solid ${catColor}44`,
                  }}>{budget.category}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '0.4rem', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--muted)' }}>Spent: <span style={{ color: '#ff3cac', fontWeight: 700 }}>SAR {Number(budget.spent_amount).toLocaleString('en-SA')}</span></span>
                  <span style={{ color: 'var(--muted)' }}>of SAR {Number(budget.total_budget).toLocaleString('en-SA')}</span>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 6, overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{
                    height: '100%', borderRadius: 6, width: `${Math.min(pct, 100)}%`,
                    background: pct > 90 ? '#ff3cac' : pct > 70 ? '#ffe135' : catColor,
                    transition: 'width 0.6s ease',
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: pct > 90 ? '#ff3cac' : '#00ffb3' }}>{pct.toFixed(1)}% used</span>
                  <span style={{ color: remaining >= 0 ? '#00ffb3' : '#ff3cac' }}>
                    {remaining >= 0 ? 'Remaining' : 'Over by'}: SAR {Math.abs(remaining).toLocaleString('en-SA')}
                  </span>
                </div>

                {budget.project_branch && (
                  <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '0.4rem' }}>📍 {budget.project_branch}</div>
                )}
                <div style={{ marginTop: '0.5rem', fontSize: '0.6rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Tap to view details →</div>
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--border2)', boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>
            <div style={{ padding: '1.2rem 1.4rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font)', fontWeight: 800, fontSize: '1.2rem', color: 'var(--text)', margin: 0 }}>{selected.name}</h2>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--blue)' }}>{selected.budget_number}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.4rem' }}>✕</button>
            </div>
            <div style={{ padding: '1.2rem 1.4rem' }}>
              {(() => {
                const pct = Number(selected.total_budget) > 0 ? (Number(selected.spent_amount) / Number(selected.total_budget)) * 100 : 0
                const remaining = Number(selected.total_budget) - Number(selected.spent_amount)
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
                      {[
                        { label: 'Total Budget', val: `SAR ${Number(selected.total_budget).toLocaleString('en-SA', { minimumFractionDigits: 2 })}`, color: 'var(--blue)' },
                        { label: 'Spent', val: `SAR ${Number(selected.spent_amount).toLocaleString('en-SA', { minimumFractionDigits: 2 })}`, color: '#ff3cac' },
                        { label: 'Remaining', val: `SAR ${Math.abs(remaining).toLocaleString('en-SA', { minimumFractionDigits: 2 })}`, color: remaining >= 0 ? '#00ffb3' : '#ff3cac' },
                      ].map(f => (
                        <div key={f.label} style={{ background: `${f.color}11`, border: `1px solid ${f.color}33`, borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.58rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem' }}>{f.label}</div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: f.color, fontFamily: 'var(--font-mono)' }}>{f.val}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, height: 10, overflow: 'hidden', marginBottom: '1rem' }}>
                      <div style={{ height: '100%', borderRadius: 8, width: `${Math.min(pct, 100)}%`, background: pct > 90 ? '#ff3cac' : pct > 70 ? '#ffe135' : 'var(--blue)', transition: 'width 0.8s ease' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
                      {[
                        { label: 'Category', val: selected.category },
                        { label: 'Fiscal Year', val: selected.fiscal_year.toString() },
                        { label: 'Quarter', val: `Q${selected.fiscal_quarter}` },
                        { label: 'Status', val: selected.status },
                        { label: 'Project / Branch', val: selected.project_branch || '—' },
                        { label: 'Created At', val: new Date(selected.created_at).toLocaleString('en-GB') },
                      ].map(f => (
                        <div key={f.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                          <div style={{ fontSize: '0.58rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.15rem' }}>{f.label}</div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text)', fontWeight: 600 }}>{f.val}</div>
                        </div>
                      ))}
                    </div>
                    {selected.notes && (
                      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '0.75rem', marginTop: '0.8rem' }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem' }}>NOTES</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.5 }}>{selected.notes}</div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {showForm && <BudgetFormModal onClose={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function BudgetFormModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    name: '', category: 'operations', fiscal_year: new Date().getFullYear().toString(),
    fiscal_quarter: '1', total_budget: '', project_branch: '', notes: '', status: 'active',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name.trim()) return setErr('Budget name is required')
    if (!form.total_budget) return setErr('Total budget amount is required')
    setSaving(true); setErr('')
    try {
      await api.post('/budgets', form)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border2)' }}>
        <div style={{ padding: '1.1rem 1.3rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text)', margin: 0 }}>📊 New Budget</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
        </div>
        <div style={{ padding: '1.2rem 1.3rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.8rem', background: 'rgba(79,140,255,0.04)', borderRadius: 8, padding: '0.75rem', border: '1px solid rgba(79,140,255,0.15)' }}>
            <div>
              <label style={{ fontSize: '0.6rem', color: 'var(--blue)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 4 }}>CREATED BY</label>
              <input value={user?.full_name || ''} disabled style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.6rem', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'not-allowed' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.6rem', color: 'var(--blue)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 4 }}>DATE</label>
              <input value={new Date().toLocaleString('en-GB')} disabled style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.6rem', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'not-allowed' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Budget Name *</label>
              <input className="form-input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Q1 2026 Operations Budget" />
            </div>
            <div>
              <label className="form-label">Category</label>
              <select className="form-select" value={form.category} onChange={e => f('category', e.target.value)}>
                <option value="operations">Operations</option>
                <option value="labour">Labour</option>
                <option value="equipment">Equipment</option>
                <option value="materials">Materials</option>
                <option value="overhead">Overhead</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => f('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="form-label">Fiscal Year</label>
              <select className="form-select" value={form.fiscal_year} onChange={e => f('fiscal_year', e.target.value)}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Quarter</label>
              <select className="form-select" value={form.fiscal_quarter} onChange={e => f('fiscal_quarter', e.target.value)}>
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Total Budget Amount (SAR) *</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.total_budget} onChange={e => f('total_budget', e.target.value)} placeholder="0.00" />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Project / Branch</label>
              <input className="form-input" value={form.project_branch} onChange={e => f('project_branch', e.target.value)} placeholder="Associated project or branch" />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Notes</label>
              <textarea className="form-input" value={form.notes} onChange={e => f('notes', e.target.value)} rows={3} style={{ resize: 'vertical' }} placeholder="Budget purpose and details..." />
            </div>
          </div>
          {err && <div className="alert-error" style={{ marginTop: '0.75rem' }}>{err}</div>}
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.2rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : '✓ Create Budget'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
