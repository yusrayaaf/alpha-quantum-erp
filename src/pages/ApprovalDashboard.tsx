// src/pages/ApprovalDashboard.tsx — Alpha Quantum ERP v16
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { isSuperUser } from '../lib/auth'
import { api } from '../lib/api'

interface Item {
  id: string; ref?: string; form_number?: string; invoice_number?: string
  submitted_by_name: string; grand_total: number; total_amount?: number; status: string
  submitted_at: string; project_name?: string; client_name?: string
  notes?: string; category_name?: string
}
type Tab = 'expenses' | 'invoices'

export default function ApprovalDashboard() {
  const { user } = useAuth()
  const su = isSuperUser(user)

  const [tab,     setTab]     = useState<Tab>('expenses')
  const [data,    setData]    = useState<{ expenses: Item[]; invoices: Item[] }>({ expenses:[], invoices:[] })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [comment, setComment] = useState<Record<string, string>>({})
  const [acting,  setActing]  = useState<string | null>(null)
  const [success, setSuccess] = useState('')

  function load() {
    if (!su) { setLoading(false); return }
    setLoading(true); setError(''); setSuccess('')
    api.get<{ expenses: Item[]; invoices: Item[]; total: number }>('/approvals')
      .then(d => { setData({ expenses: d.expenses || [], invoices: d.invoices || [] }); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [su])

  async function act(id: string, type: Tab, action: 'approve' | 'reject') {
    setActing(id)
    try {
      const note = comment[id] || ''
      if (type === 'expenses') {
        await api.post('/expenses/approve', { expense_id: id, action, note })
      } else {
        await api.post('/invoices/approve', { invoice_id: id, action, note })
      }
      setSuccess(`${action === 'approve' ? '✅ Approved' : '❌ Rejected'} successfully`)
      setComment(c => { const x = {...c}; delete x[id]; return x })
      load()
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally { setActing(null) }
  }

  const items = tab === 'expenses' ? data.expenses : data.invoices
  const sar   = (n: number) => `SAR ${Number(n||0).toLocaleString('en-SA', { minimumFractionDigits:2 })}`

  if (!su) return (
    <div className="page-content">
      <div className="empty-state">
        <div className="empty-icon">🔐</div>
        <div className="empty-title">Access Restricted</div>
        <div className="empty-desc">Only admins can access approvals.</div>
      </div>
    </div>
  )

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Approvals</h1>
          <p className="page-sub">Review and approve pending submissions</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'1rem', marginBottom:'1.5rem' }}>
        {[
          { label:'Pending Expenses', value:data.expenses.length, color:'var(--amber)', icon:'💰', onClick:()=>setTab('expenses') },
          { label:'Pending Invoices', value:data.invoices.length, color:'var(--blue)',  icon:'🧾', onClick:()=>setTab('invoices') },
          { label:'Total Pending',    value:data.expenses.length+data.invoices.length, color:data.expenses.length+data.invoices.length>0?'var(--rose)':'var(--green)', icon:'⏳', onClick:()=>{} },
        ].map((s,i) => (
          <div key={i} className="stat-card" onClick={s.onClick} style={{ '--accent':s.color } as React.CSSProperties}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color:s.color, fontSize:'1.6rem' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'.5rem', marginBottom:'1.1rem' }}>
        {(['expenses','invoices'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`btn btn-sm ${tab===t ? 'btn-primary' : 'btn-secondary'}`}
            style={{ textTransform:'capitalize' }}>
            {t} {t==='expenses' ? `(${data.expenses.length})` : `(${data.invoices.length})`}
          </button>
        ))}
      </div>

      {success && <div className="alert alert-success">{success}</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'3rem' }}>
          <div className="spinner" />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎉</div>
          <div className="empty-title">All Clear!</div>
          <div className="empty-desc">No pending {tab} to review.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          {items.map(item => (
            <div key={item.id} className="card" style={{ border:'1px solid var(--border2)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'.75rem' }}>
                <div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'.75rem', color:'var(--blue)', fontWeight:700, marginBottom:'.3rem' }}>
                    {item.form_number || item.invoice_number || item.ref || item.id.slice(-8)}
                  </div>
                  <div style={{ fontWeight:600, color:'var(--text)', marginBottom:'.2rem' }}>
                    {item.client_name || item.project_name || item.category_name || '—'}
                  </div>
                  <div style={{ fontSize:'.8rem', color:'var(--text2)' }}>
                    By <strong>{item.submitted_by_name}</strong> · {new Date(item.submitted_at).toLocaleDateString('en-GB')}
                  </div>
                  {item.notes && (
                    <div style={{ fontSize:'.78rem', color:'var(--text3)', marginTop:'.3rem', maxWidth:400 }}>{item.notes}</div>
                  )}
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.2rem', fontWeight:700, color:'var(--text)', marginBottom:'.3rem' }}>
                    {sar(item.grand_total || item.total_amount || 0)}
                  </div>
                  <span className={`badge badge-${item.status}`}>{item.status}</span>
                </div>
              </div>

              {/* Comment + Action buttons */}
              <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--border)', display:'flex', gap:'.75rem', alignItems:'center', flexWrap:'wrap' }}>
                <input
                  className="input"
                  style={{ flex:'1', minWidth:200 }}
                  placeholder="Note / rejection reason (optional)"
                  value={comment[item.id] || ''}
                  onChange={e => setComment(c => ({ ...c, [item.id]: e.target.value }))}
                />
                <button className="btn btn-success btn-sm"
                  disabled={!!acting}
                  onClick={() => act(item.id, tab, 'approve')}>
                  {acting === item.id ? <span className="spinner spinner-sm" /> : '✓ Approve'}
                </button>
                <button className="btn btn-danger btn-sm"
                  disabled={!!acting}
                  onClick={() => act(item.id, tab, 'reject')}>
                  {acting === item.id ? <span className="spinner spinner-sm" /> : '✗ Reject'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
