// src/pages/InvoicesPage.tsx — v7 with tap-to-reveal detail modal
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { isSuperUser } from '../lib/auth'
import { api } from '../lib/api'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface LineItem { description:string; quantity:number; unit:string; unit_price:number; tax_percent:number; line_total:number }
interface Invoice {
  id:string; invoice_number:string; submitted_by_name:string; client_name:string
  client_address?:string; client_vat_number?:string; project_name?:string; po_number?:string
  due_date?:string; payment_terms?:string; subtotal:number; tax_total:number; grand_total:number
  notes?:string; status:string; submitted_at:string; approved_by_name?:string; approved_at?:string
  rejection_comment?:string; media_urls?:string[]; line_items?:LineItem[]
}

function Lightbox({ src, onClose }: { src:string; onClose:()=>void }) {
  return <div className="lightbox-overlay" onClick={onClose}><img src={src} alt="doc" /></div>
}

function InvoiceDetail({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [full, setFull] = useState<Invoice | null>(null)
  const [lb, setLb] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ invoice: Invoice }>(`/invoices/${invoice.id}`)
      .then(d => setFull(d.invoice))
      .catch(() => setFull(invoice))
      .finally(() => setLoading(false))
  }, [invoice.id])

  const d = full || invoice
  const sar = (n: number) => `SAR ${Number(n||0).toLocaleString('en-SA',{minimumFractionDigits:2})}`

  function printPDF() {
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
    doc.setFillColor(5,5,26); doc.rect(0,0,210,297,'F')
    // Header
    doc.setFontSize(20); doc.setTextColor(79,140,255); doc.text('ALPHA ULTIMATE', 14, 18)
    doc.setFontSize(9); doc.setTextColor(120,115,180); doc.text('Construction & Cleaning Services | KSA', 14, 25)
    doc.setFontSize(22); doc.setTextColor(255,255,255); doc.text('INVOICE', 140, 16)
    doc.setFontSize(10); doc.setTextColor(0,255,179); doc.text(d.invoice_number, 140, 24)
    doc.setDrawColor(79,140,255); doc.setLineWidth(0.5); doc.line(14,30,196,30)
    // Client info
    doc.setFontSize(9); doc.setTextColor(120,115,180); doc.text('INVOICE TO:', 14, 38)
    doc.setFontSize(11); doc.setTextColor(255,255,255); doc.text(d.client_name, 14, 45)
    if (d.client_address) { doc.setFontSize(8); doc.setTextColor(150,145,200); doc.text(d.client_address, 14, 51) }
    if (d.client_vat_number) { doc.setFontSize(8); doc.setTextColor(150,145,200); doc.text(`VAT: ${d.client_vat_number}`, 14, 57) }
    doc.setFontSize(8); doc.setTextColor(150,145,200)
    doc.text(`Date: ${new Date(d.submitted_at).toLocaleDateString('en-GB')}`, 140, 38)
    if (d.due_date) doc.text(`Due: ${new Date(d.due_date).toLocaleDateString('en-GB')}`, 140, 44)
    if (d.po_number) doc.text(`PO: ${d.po_number}`, 140, 50)
    // Line items
    if (d.line_items && d.line_items.length > 0) {
      autoTable(doc, {
        startY: 62,
        head:[['Description','Qty','Unit Price','Tax%','Total']],
        body: d.line_items.map(li => [li.description, li.quantity, sar(li.unit_price), `${li.tax_percent}%`, sar(li.line_total)]),
        theme:'plain',
        headStyles:{ fillColor:[14,13,46], textColor:[79,140,255], fontSize:9 },
        bodyStyles:{ textColor:[220,215,255], fontSize:9, fillColor:[10,9,33] },
        alternateRowStyles:{ fillColor:[14,13,46] },
      })
    }
    const fy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || 80
    doc.setFillColor(14,13,46); doc.roundedRect(120, fy+8, 76, 30, 3, 3, 'F')
    doc.setFontSize(9); doc.setTextColor(150,145,200)
    doc.text(`Subtotal: ${sar(d.subtotal)}`, 125, fy+16)
    doc.text(`VAT: ${sar(d.tax_total)}`, 125, fy+22)
    doc.setFontSize(11); doc.setTextColor(0,255,179)
    doc.text(`TOTAL: ${sar(d.grand_total)}`, 125, fy+32)
    if (d.notes) {
      doc.setFontSize(8); doc.setTextColor(120,115,180)
      doc.text(`Notes: ${d.notes}`, 14, fy+20)
    }
    doc.setFontSize(7); doc.setTextColor(60,55,110)
    doc.text('This is a computer-generated invoice. Alpha Ultimate Ltd.', 14, 285)
    doc.save(`Invoice_${d.invoice_number}.pdf`)
  }

  return (
    <div className="detail-modal-overlay" onClick={onClose}>
      <div className="detail-modal" onClick={e=>e.stopPropagation()}>
        <div style={{ padding:'1.25rem', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'linear-gradient(135deg,rgba(0,255,179,0.08),rgba(0,0,0,0))' }}>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--cyan)', letterSpacing:'0.1em', marginBottom:'0.25rem' }}>{d.invoice_number}</div>
            <div style={{ fontFamily:'var(--font)', fontSize:'1.1rem', fontWeight:800, color:'var(--text)' }}>{d.client_name}</div>
          </div>
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
            <span className={`badge badge-${d.status}`}>{d.status}</span>
            <button className="btn btn-secondary btn-sm" onClick={printPDF}>📄 PDF</button>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:'1.2rem' }}>✕</button>
          </div>
        </div>

        <div style={{ padding:'1.25rem' }}>
          {loading && <div style={{ textAlign:'center', padding:'1rem', color:'var(--muted)' }}>Loading…</div>}

          <div className="info-grid" style={{ marginBottom:'1rem' }}>
            {[
              ['Invoice #', d.invoice_number], ['Client', d.client_name],
              ['Client Address', d.client_address||'—'], ['Client VAT', d.client_vat_number||'—'],
              ['Project', d.project_name||'—'], ['PO Number', d.po_number||'—'],
              ['Due Date', d.due_date ? new Date(d.due_date).toLocaleDateString('en-GB') : '—'],
              ['Payment Terms', d.payment_terms||'—'],
              ['Submitted By', d.submitted_by_name],
              ['Date', new Date(d.submitted_at).toLocaleDateString('en-GB')],
            ].map(([l,v]) => (
              <div key={String(l)} className="info-cell">
                <div className="info-cell-label">{String(l)}</div>
                <div className="info-cell-value">{String(v)}</div>
              </div>
            ))}
          </div>

          {d.rejection_comment && (
            <div className="alert-error" style={{ marginBottom:'1rem' }}>
              <strong>Rejection:</strong> {d.rejection_comment}
            </div>
          )}

          {full?.line_items && full.line_items.length > 0 && (
            <div style={{ marginBottom:'1rem' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.5rem' }}>LINE ITEMS</div>
              <div className="table-wrap">
                <table style={{ minWidth:'unset' }}>
                  <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Tax%</th><th>Total</th></tr></thead>
                  <tbody>
                    {full.line_items.map((li, i) => (
                      <tr key={i}>
                        <td style={{ fontSize:'0.85rem' }}>{li.description}</td>
                        <td className="mono" style={{ fontSize:'0.82rem' }}>{li.quantity}</td>
                        <td className="mono" style={{ fontSize:'0.82rem' }}>{sar(li.unit_price)}</td>
                        <td className="mono" style={{ fontSize:'0.82rem', color:'var(--amber)' }}>{li.tax_percent}%</td>
                        <td className="mono" style={{ fontSize:'0.82rem', color:'var(--green)' }}>{sar(li.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ background:'rgba(14,13,46,0.8)', border:'1px solid var(--border)', borderRadius:10, padding:'0.85rem', marginBottom:'1rem' }}>
            {[['Subtotal', d.subtotal, 'var(--text)'], ['VAT', d.tax_total, 'var(--amber)']].map(([l,v,c]) => (
              <div key={String(l)} style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.3rem', fontSize:'0.85rem' }}>
                <span style={{ color:'var(--text2)' }}>{String(l)}</span>
                <span className="mono" style={{ color:String(c) }}>{sar(Number(v))}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'1rem', fontWeight:700, color:'var(--green)', borderTop:'1px solid var(--border)', paddingTop:'0.3rem', marginTop:'0.3rem' }}>
              <span>GRAND TOTAL</span><span className="mono">{sar(d.grand_total)}</span>
            </div>
          </div>

          {d.media_urls && d.media_urls.length > 0 && (
            <div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.5rem' }}>ATTACHMENTS ({d.media_urls.length})</div>
              <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                {d.media_urls.map((url, i) => (
                  <div key={i} onClick={() => setLb(url)} style={{ cursor:'zoom-in', borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
                    <img src={url} alt="" style={{ width:80, height:80, objectFit:'cover', display:'block' }} />
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

export default function InvoicesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const su = isSuperUser(user)
  const submitOnly = user?.permissions?.finance === 'submit_only'
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    if (submitOnly) { setLoading(false); return }
    api.get<{ invoices: Invoice[] }>('/invoices')
      .then(d => setInvoices(d.invoices))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [submitOnly])

  const sar = (n: number) => `SAR ${Number(n||0).toLocaleString('en-SA',{minimumFractionDigits:2})}`
  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase()
    return (!q || inv.invoice_number.toLowerCase().includes(q) || inv.client_name.toLowerCase().includes(q))
      && (filterStatus === 'all' || inv.status === filterStatus)
  })
  const totalApproved = filtered.filter(i=>i.status==='approved').reduce((s,i)=>s+Number(i.grand_total),0)

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <h1 className="page-title">🧾 Invoices</h1>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--muted)', marginTop:2 }}>
            {filtered.length} records · Approved Total: {sar(totalApproved)}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/invoices/new')}>+ New Invoice</button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {submitOnly ? (
        <div className="glass" style={{ padding:'2rem', textAlign:'center', color:'var(--text2)' }}>
          Submit-only access — previous submissions hidden.
          <br />
          <button className="btn btn-primary" style={{ marginTop:'1rem' }} onClick={() => navigate('/invoices/new')}>Create Invoice</button>
        </div>
      ) : (
        <>
          <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', flexWrap:'wrap' }}>
            <div className="search-wrap" style={{ flex:1, minWidth:180 }}>
              <input className="search-input" placeholder="Search invoice #, client…" value={search} onChange={e=>setSearch(e.target.value)} />
            </div>
            <select className="input" style={{ maxWidth:140 }} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="hold">Hold</option>
            </select>
          </div>

          {loading ? <div style={{ color:'var(--text2)', padding:'1rem' }}>Loading…</div> : (
            <div className="glass table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Client</th>
                    {su && <th>Submitted By</th>}
                    <th>Project</th>
                    <th>Due Date</th>
                    <th style={{ textAlign:'right' }}>Total</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={su?8:7} style={{ textAlign:'center', color:'var(--muted)', padding:'2.5rem' }}>No invoices found.</td></tr>
                  )}
                  {filtered.map(inv => (
                    <tr key={inv.id} className="clickable-row" onClick={() => setSelected(inv)}>
                      <td><span className="mono" style={{ color:'var(--cyan)', fontSize:'0.85rem' }}>{inv.invoice_number}</span></td>
                      <td style={{ fontWeight:600, fontSize:'0.88rem' }}>{inv.client_name}</td>
                      {su && <td style={{ fontSize:'0.85rem', color:'var(--text2)' }}>{inv.submitted_by_name}</td>}
                      <td style={{ color:'var(--text2)', fontSize:'0.85rem' }}>{inv.project_name || '—'}</td>
                      <td style={{ color: inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'approved' ? 'var(--rose)' : 'var(--muted)', fontSize:'0.82rem', whiteSpace:'nowrap' }}>
                        {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td style={{ textAlign:'right' }}><span className="mono" style={{ fontSize:'0.875rem', color:'var(--green)' }}>{sar(inv.grand_total)}</span></td>
                      <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                      <td style={{ color:'var(--muted)', fontSize:'0.82rem', whiteSpace:'nowrap' }}>{new Date(inv.submitted_at).toLocaleDateString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selected && <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
