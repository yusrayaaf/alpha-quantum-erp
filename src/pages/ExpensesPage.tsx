// src/pages/ExpensesPage.tsx — v7 with tap-to-reveal detail modal
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { isSuperUser } from '../lib/auth'
import { api } from '../lib/api'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface LineItem { description:string; quantity:number; unit:string; unit_price:number; tax_percent:number; line_total:number }
interface Expense {
  id:string; form_number:string; submitted_by_name:string; project_name:string
  project_location:string; notes:string; grand_total:number; total_amount:number; tax_total:number
  status:string; submitted_at:string; category_name?:string; rejection_comment?:string
  approved_by_name?:string; approved_at?:string; media_urls?:string[]
  line_items?: LineItem[]
}

function Lightbox({ src, onClose }: { src:string; onClose:()=>void }) {
  return <div className="lightbox-overlay" onClick={onClose}><img src={src} alt="receipt" /></div>
}

function ExpenseDetail({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const [full, setFull] = useState<Expense | null>(null)
  const [lb, setLb] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ expense: Expense }>(`/expenses/${expense.id}`)
      .then(d => setFull(d.expense))
      .catch(() => setFull(expense))
      .finally(() => setLoading(false))
  }, [expense.id])

  const d = full || expense
  const sar = (n: number) => `SAR ${Number(n||0).toLocaleString('en-SA',{minimumFractionDigits:2})}`

  function printPDF() {
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
    doc.setFillColor(5,5,26); doc.rect(0,0,210,297,'F')
    doc.setFontSize(16); doc.setTextColor(79,140,255); doc.text('ALPHA ULTIMATE', 14, 16)
    doc.setFontSize(9); doc.setTextColor(120,115,180); doc.text('Expense Report', 14, 23)
    doc.setFontSize(13); doc.setTextColor(255,255,255); doc.text('EXPENSE FORM', 140, 16)
    doc.setFontSize(8); doc.setTextColor(120,115,180); doc.text(d.form_number, 140, 23)
    doc.setDrawColor(79,140,255); doc.line(14,28,196,28)
    autoTable(doc, {
      startY: 34,
      head:[['Field','Value']],
      body:[
        ['Submitted By', d.submitted_by_name], ['Project', d.project_name||'—'],
        ['Location', d.project_location||'—'], ['Category', d.category_name||'—'],
        ['Date', new Date(d.submitted_at).toLocaleDateString('en-GB')],
        ['Status', d.status.toUpperCase()],
        ['Notes', d.notes||'—'],
      ],
      theme:'plain', headStyles:{fillColor:[14,13,46],textColor:[79,140,255],fontSize:8},
      bodyStyles:{textColor:[200,195,240],fontSize:8,fillColor:[10,9,33]},
      alternateRowStyles:{fillColor:[14,13,46]},
    })
    if (d.line_items && d.line_items.length > 0) {
      const ly = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
      doc.setFontSize(10); doc.setTextColor(79,140,255); doc.text('LINE ITEMS', 14, ly)
      autoTable(doc, {
        startY: ly+4,
        head:[['Description','Qty','Unit Price','Tax%','Total']],
        body: d.line_items.map(li => [li.description, li.quantity, sar(li.unit_price), `${li.tax_percent}%`, sar(li.line_total)]),
        theme:'striped', headStyles:{fillColor:[14,13,46],textColor:[0,255,179],fontSize:8},
        bodyStyles:{textColor:[200,195,240],fontSize:8}, alternateRowStyles:{fillColor:[10,9,33]},
      })
    }
    const fy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    doc.setFillColor(14,13,46); doc.roundedRect(14,fy,182,22,3,3,'F')
    doc.setFontSize(10); doc.setTextColor(0,255,179)
    doc.text(`Subtotal: ${sar(d.total_amount)}  |  VAT: ${sar(d.tax_total)}  |  GRAND TOTAL: ${sar(d.grand_total)}`, 20, fy+14)
    doc.save(`Expense_${d.form_number}.pdf`)
  }

  return (
    <div className="detail-modal-overlay" onClick={onClose}>
      <div className="detail-modal" onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'1.25rem', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'linear-gradient(135deg,rgba(79,140,255,0.1),rgba(0,0,0,0))' }}>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--blue)', letterSpacing:'0.1em', marginBottom:'0.25rem' }}>{d.form_number}</div>
            <div style={{ fontFamily:'var(--font)', fontSize:'1.1rem', fontWeight:800, color:'var(--text)' }}>Expense Detail</div>
          </div>
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
            <span className={`badge badge-${d.status}`}>{d.status}</span>
            <button className="btn btn-secondary btn-sm" onClick={printPDF}>📄 PDF</button>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:'1.2rem' }}>✕</button>
          </div>
        </div>

        <div style={{ padding:'1.25rem' }}>
          {loading && <div style={{ textAlign:'center', padding:'1rem', color:'var(--muted)' }}>Loading details…</div>}

          <div className="info-grid" style={{ marginBottom:'1rem' }}>
            {[
              ['Form #', d.form_number], ['Submitted By', d.submitted_by_name],
              ['Project', d.project_name||'—'], ['Location', d.project_location||'—'],
              ['Category', d.category_name||'—'], ['Date', new Date(d.submitted_at).toLocaleDateString('en-GB')],
              ['Approved By', d.approved_by_name||'—'], ['Approved At', d.approved_at ? new Date(d.approved_at).toLocaleDateString('en-GB') : '—'],
            ].map(([l,v]) => (
              <div key={String(l)} className="info-cell">
                <div className="info-cell-label">{String(l)}</div>
                <div className="info-cell-value">{String(v)}</div>
              </div>
            ))}
          </div>

          {d.notes && <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', borderRadius:8, padding:'0.75rem', marginBottom:'1rem', fontSize:'0.85rem', color:'var(--text2)' }}>{d.notes}</div>}

          {d.rejection_comment && (
            <div className="alert-error" style={{ marginBottom:'1rem' }}>
              <strong>Rejection Note:</strong> {d.rejection_comment}
            </div>
          )}

          {/* Line items */}
          {full?.line_items && full.line_items.length > 0 && (
            <div style={{ marginBottom:'1rem' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.5rem' }}>LINE ITEMS</div>
              <div className="table-wrap">
                <table style={{ minWidth:'unset' }}>
                  <thead>
                    <tr>
                      <th>Description</th><th>Qty</th><th>Unit Price</th><th>Tax</th><th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {full.line_items.map((li, i) => (
                      <tr key={i}>
                        <td style={{ fontSize:'0.85rem' }}>{li.description}</td>
                        <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{li.quantity}</td>
                        <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{sar(li.unit_price)}</td>
                        <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.82rem', color:'var(--amber)' }}>{li.tax_percent}%</td>
                        <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.82rem', color:'var(--green)' }}>{sar(li.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
          <div style={{ background:'rgba(14,13,46,0.8)', border:'1px solid var(--border)', borderRadius:10, padding:'0.85rem', marginBottom:'1rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.35rem', fontSize:'0.85rem', color:'var(--text2)' }}>
              <span>Subtotal</span><span className="mono">{sar(d.total_amount)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.35rem', fontSize:'0.85rem', color:'var(--amber)' }}>
              <span>VAT</span><span className="mono">{sar(d.tax_total)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'1rem', fontWeight:700, color:'var(--green)', borderTop:'1px solid var(--border)', paddingTop:'0.35rem', marginTop:'0.35rem' }}>
              <span>GRAND TOTAL</span><span className="mono">{sar(d.grand_total)}</span>
            </div>
          </div>

          {/* Attachments */}
          {d.media_urls && d.media_urls.length > 0 && (
            <div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.5rem' }}>ATTACHMENTS ({d.media_urls.length})</div>
              <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                {d.media_urls.map((url, i) => (
                  <div key={i} onClick={() => setLb(url)} style={{ cursor:'zoom-in', borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
                    <img src={url} alt={`attachment-${i}`} style={{ width:80, height:80, objectFit:'cover', display:'block' }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {lb && <Lightbox src={lb} onClose={() => setLb('')} />}
    </div>
  )
}

export default function ExpensesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const su = isSuperUser(user)
  const submitOnly = user?.permissions?.finance === 'submit_only'
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Expense | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    if (submitOnly) { setLoading(false); return }
    api.get<{ expenses:Expense[] }>('/expenses')
      .then(d => setExpenses(d.expenses))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [submitOnly])

  const sar = (n: number) => `SAR ${Number(n||0).toLocaleString('en-SA',{minimumFractionDigits:2})}`
  const filtered = expenses.filter(e => {
    const q = search.toLowerCase()
    return (!q || e.form_number.toLowerCase().includes(q) || e.submitted_by_name.toLowerCase().includes(q) || (e.project_name||'').toLowerCase().includes(q))
      && (filterStatus === 'all' || e.status === filterStatus)
  })
  const totalApproved = filtered.filter(e=>e.status==='approved').reduce((s,e)=>s+Number(e.grand_total),0)
  const totalPending = filtered.filter(e=>e.status==='pending').length

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <h1 className="page-title">💸 Expenses</h1>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--muted)', marginTop:2 }}>
            {filtered.length} records · Approved: {sar(totalApproved)} · Pending: {totalPending}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/expenses/new')}>+ New Expense</button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {submitOnly ? (
        <div className="glass" style={{ padding:'2rem', textAlign:'center', color:'var(--text2)' }}>
          You have submit-only access. Previous submissions are not visible.
          <br />
          <button className="btn btn-primary" style={{ marginTop:'1rem' }} onClick={() => navigate('/expenses/new')}>Submit New Expense</button>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', flexWrap:'wrap' }}>
            <div className="search-wrap" style={{ flex:1, minWidth:180 }}>
              <input className="search-input" placeholder="Search form #, name, project…" value={search} onChange={e=>setSearch(e.target.value)} />
            </div>
            <select className="input" style={{ maxWidth:140 }} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="hold">On Hold</option>
            </select>
          </div>

          {loading ? <div style={{ color:'var(--text2)', padding:'1rem' }}>Loading…</div> : (
            <div className="glass table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Form #</th>
                    {su && <th>Submitted By</th>}
                    <th>Project</th>
                    <th>Category</th>
                    <th style={{ textAlign:'right' }}>Total</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Attach.</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={su?8:7} style={{ textAlign:'center', color:'var(--muted)', padding:'2.5rem' }}>
                      No expenses found.
                    </td></tr>
                  )}
                  {filtered.map(e => (
                    <tr key={e.id} className="clickable-row" onClick={() => setSelected(e)}>
                      <td><span className="mono" style={{ color:'var(--cyan)', fontSize:'0.85rem' }}>{e.form_number}</span></td>
                      {su && <td style={{ fontSize:'0.875rem' }}>{e.submitted_by_name}</td>}
                      <td style={{ color:'var(--text2)', fontSize:'0.875rem' }}>{e.project_name || '—'}</td>
                      <td style={{ color:'var(--text2)', fontSize:'0.82rem' }}>{e.category_name || '—'}</td>
                      <td style={{ textAlign:'right' }}><span className="mono" style={{ fontSize:'0.875rem', color:'var(--green)' }}>{sar(e.grand_total)}</span></td>
                      <td><span className={`badge badge-${e.status}`}>{e.status}</span></td>
                      <td style={{ color:'var(--muted)', fontSize:'0.82rem', whiteSpace:'nowrap' }}>{new Date(e.submitted_at).toLocaleDateString('en-GB')}</td>
                      <td style={{ color:'var(--text2)', fontSize:'0.8rem' }}>{e.media_urls?.length ? `📎 ${e.media_urls.length}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selected && <ExpenseDetail expense={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
