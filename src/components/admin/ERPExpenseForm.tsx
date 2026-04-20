// src/components/admin/ERPExpenseForm.tsx — v9 Fixed
// - Loads categories from DB (real UUIDs)
// - Fallback categories use empty IDs (no non-UUID sent to DB)
// - Company header loaded from system settings
import { useState, useRef, useEffect, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { api } from '../../lib/api'
import logoUrl from '../../assets/logo-alpha.png'

interface LineItem { description:string; quantity:string; unit:string; unit_price:string; tax_percent:string }
interface StagedFile { name:string; size:number; type:string; dataUrl:string }
interface UploadedFile { id:string|null; name:string; url:string; thumb_url:string|null; type:string }
interface Category { id:string; name:string; code:string }

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_TOT_BYTES  = 25 * 1024 * 1024
const EMPTY_LINE = (): LineItem => ({ description:'', quantity:'1', unit:'', unit_price:'', tax_percent:'15' })

function calcLine(l: LineItem) {
  const sub = parseFloat(l.quantity||'0') * parseFloat(l.unit_price||'0')
  const tax = sub * (parseFloat(l.tax_percent||'0') / 100)
  return { sub: isNaN(sub)?0:sub, tax: isNaN(tax)?0:tax, total: isNaN(sub+tax)?0:sub+tax }
}
function fmt(n: number) { return n.toLocaleString('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function humanSize(b: number) { return b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB` }

const inputS: React.CSSProperties = { width:'100%', background:'rgba(5,5,26,0.92)', border:'1px solid #201e58', color:'#ece9ff', padding:'0.55rem 0.8rem', borderRadius:8, fontSize:'0.875rem', fontFamily:'Rajdhani,sans-serif', outline:'none', minHeight:38 }
const labelS: React.CSSProperties = { display:'block', fontSize:'0.58rem', fontWeight:700, color:'#7470b0', marginBottom:'0.25rem', textTransform:'uppercase', letterSpacing:'0.09em', fontFamily:'var(--font-mono)' }

// Fallback categories with empty IDs — so null gets sent to DB, not a short code
const FALLBACK_CATS: Category[] = [
  {id:'', name:'Materials & Supplies', code:'MAT'},
  {id:'', name:'Labour & Wages', code:'LAB'},
  {id:'', name:'Equipment & Tools', code:'EQP'},
  {id:'', name:'Transport & Fuel', code:'TRN'},
  {id:'', name:'Utilities', code:'UTL'},
  {id:'', name:'Office & Admin', code:'OFC'},
  {id:'', name:'Maintenance & Repairs', code:'MNT'},
  {id:'', name:'Safety & PPE', code:'SAF'},
  {id:'', name:'Miscellaneous', code:'MSC'},
]

export default function ERPExpenseForm() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fileRef  = useRef<HTMLInputElement>(null)
  const mountTime = useRef(new Date())

  const [tick, setTick] = useState(0)
  useEffect(() => { const id = setInterval(()=>setTick(p=>p+1),1000); return ()=>clearInterval(id) }, [])

  const [lines,       setLines]      = useState<LineItem[]>([EMPTY_LINE()])
  const [projectName, setProject]    = useState('')
  const [projectLoc,  setLocation]   = useState('')
  const [categoryId,  setCategoryId] = useState('')
  const [notes,       setNotes]      = useState('')
  const [categories,  setCategories] = useState<Category[]>([])
  const [companyInfo, setCompanyInfo] = useState({ name:'Alpha Ultimate Ltd', cr:'1234567890', address:'Riyadh, KSA' })

  const [staged,    setStaged]    = useState<StagedFile[]>([])
  const [uploaded,  setUploaded]  = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  // Load real categories from DB
  useEffect(() => {
    api.get<{categories: Category[]}>('/categories')
      .then(d => {
        if (d.categories?.length) setCategories(d.categories)
        else setCategories(FALLBACK_CATS)
      })
      .catch(() => setCategories(FALLBACK_CATS))
  }, [])

  // Load company info from settings
  useEffect(() => {
    api.get<{settings: Record<string, string>}>('/settings')
      .then(d => {
        const s = d.settings
        setCompanyInfo({
          name:    String(s.company_name    ?? 'Alpha Ultimate Ltd'),
          cr:      String(s.company_cr      ?? '1234567890'),
          address: String(s.company_address ?? 'Riyadh, KSA'),
        })
      })
      .catch(() => {}) // keep defaults
  }, [])

  const computed   = lines.map(calcLine)
  const grandTotal = computed.reduce((a,c) => a+c.total, 0)
  const taxTotal   = computed.reduce((a,c) => a+c.tax, 0)
  const subTotal   = computed.reduce((a,c) => a+c.sub, 0)
  const stagedBytes = staged.reduce((a,f) => a+f.size, 0)

  function setLine(i:number, k:keyof LineItem, v:string) {
    setLines(p => { const c=[...p]; c[i]={...c[i],[k]:v}; return c })
  }

  // File staging
  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    setUploadErr('')
    const files = Array.from(e.target.files ?? []) as File[]
    if (!files.length) return
    let totalBytes = staged.reduce((a,f)=>a+f.size,0)
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) { setUploadErr(`"${f.name}" exceeds 10 MB`); return }
      if (totalBytes + f.size > MAX_TOT_BYTES) { setUploadErr('Total exceeds 25 MB'); return }
      totalBytes += f.size
      const reader = new FileReader()
      reader.onload = () => {
        setStaged(p => [...p, { name:f.name, size:f.size, type:f.type, dataUrl: reader.result as string }])
      }
      reader.readAsDataURL(f)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function uploadFiles() {
    if (!staged.length) return
    const notReady = staged.filter(f => !f.dataUrl)
    if (notReady.length) { setUploadErr('Files still loading, please wait'); return }
    setUploading(true); setUploadErr('')
    try {
      const results: UploadedFile[] = []
      for (const f of staged) {
        const data = f.dataUrl.includes(',') ? f.dataUrl.split(',')[1] : f.dataUrl
        const r = await api.post<{url:string; key:string}>('/uploads/file', {
          filename: f.name, mimetype: f.type, data, size: f.size
        })
        results.push({ id: r.key||null, name: f.name, url: r.url, thumb_url: r.url, type: f.type })
      }
      setUploaded(p => [...p, ...results])
      setStaged([])
    } catch(e:unknown) { setUploadErr(e instanceof Error ? e.message : 'Upload failed — R2 storage may not be configured') }
    finally { setUploading(false) }
  }

  async function handleSubmit() {
    if (staged.length > 0) { setError('Upload staged files first before submitting.'); return }
    const validLines = lines.filter(l => l.description.trim())
    if (!validLines.length) { setError('At least one line item with a description is required.'); return }
    // Validate category: must be a proper UUID or empty
    const finalCatId = categoryId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)
      ? categoryId
      : null
    setSubmitting(true); setError('')
    try {
      await api.post('/expenses', {
        project_name:     projectName || null,
        project_location: projectLoc  || null,
        category_id:      finalCatId,
        notes:            notes       || null,
        media_urls:       uploaded.map(f => f.url),
        line_items: validLines.map(l => ({
          description: l.description.trim(),
          quantity:    parseFloat(l.quantity)    || 1,
          unit:        l.unit || '',
          unit_price:  parseFloat(l.unit_price)  || 0,
          tax_percent: parseFloat(l.tax_percent) || 15,
        })),
      })
      navigate('/expenses', { replace:true })
    } catch(e:unknown) { setError(e instanceof Error ? e.message : 'Submission failed') }
    finally { setSubmitting(false) }
  }

  const now = new Date()
  const headerStyle: React.CSSProperties = { background:'linear-gradient(135deg,rgba(79,140,255,0.15),rgba(191,95,255,0.08))', padding:'1.25rem', borderBottom:'1px solid #201e58', borderRadius:'12px 12px 0 0' }

  return (
    <div style={{ maxWidth:900, margin:'0 auto', fontFamily:"'Rajdhani','Hind Siliguri',sans-serif" }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={()=>navigate('/expenses')}>← Back</button>
        <img src={logoUrl} alt="Alpha Ultimate" style={{ height:36, borderRadius:6 }} />
      </div>

      <div style={{ background:'rgba(14,13,46,0.9)', border:'1px solid #201e58', borderRadius:14, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
        {/* Title */}
        <div style={headerStyle}>
          <h1 style={{ fontFamily:'Rajdhani,sans-serif', fontSize:'1.5rem', fontWeight:800, color:'#ece9ff', margin:0 }}>New Expense Form</h1>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#4f8cff', marginTop:4, letterSpacing:'0.08em' }}>
            {companyInfo.name.toUpperCase()} · CR: {companyInfo.cr} · {companyInfo.address.toUpperCase()}
          </div>
        </div>

        {error && <div style={{ margin:'1rem', padding:'0.75rem 1rem', background:'rgba(255,60,172,0.1)', border:'1px solid rgba(255,60,172,0.4)', borderRadius:8, color:'#ff3cac', fontSize:'0.875rem' }}>{error}</div>}

        <div style={{ padding:'1.5rem' }}>
          {/* AUTO-POPULATED READ-ONLY SECTION */}
          <div style={{ background:'rgba(5,5,26,0.7)', border:'1px solid rgba(79,140,255,0.2)', borderRadius:10, padding:'1rem', marginBottom:'1.25rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'0.75rem' }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'#7470b0', letterSpacing:'0.1em', textTransform:'uppercase' }}>AUTO-POPULATED — READ ONLY</span>
              <span style={{ background:'rgba(0,255,179,0.12)', border:'1px solid rgba(0,255,179,0.3)', borderRadius:20, padding:'0.1rem 0.5rem', fontSize:'0.6rem', color:'#00ffb3', fontFamily:'var(--font-mono)', fontWeight:700, letterSpacing:'0.08em' }}>LOCKED</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:'0.75rem' }}>
              {([
                ['SUBMISSION DATE', mountTime.current.toLocaleDateString('en-GB')],
                ['SUBMISSION TIME', now.toLocaleTimeString('en-GB')],
                ['USER ID',         user?.id || '—'],
                ['SUBMITTED BY',    user?.full_name || '—'],
                ['EMAIL',           user?.email || '—'],
                ['DEPARTMENT',      user?.department || 'General'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <label style={labelS}>{label}</label>
                  <input readOnly disabled value={value} style={{ ...inputS, opacity:0.6, cursor:'not-allowed', color:'#ece9ff' }} />
                </div>
              ))}
            </div>
          </div>

          {/* PROJECT DETAILS */}
          <div style={{ marginBottom:'1.25rem' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#7470b0', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'0.75rem', borderBottom:'1px solid #201e58', paddingBottom:'0.4rem' }}>PROJECT DETAILS</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:'0.75rem' }}>
              <div>
                <label style={labelS}>PROJECT NAME</label>
                <input type="text" style={inputS} value={projectName} onChange={e=>setProject(e.target.value)} placeholder="Site / Project name…" />
              </div>
              <div>
                <label style={labelS}>LOCATION</label>
                <input type="text" style={inputS} value={projectLoc} onChange={e=>setLocation(e.target.value)} placeholder="City / Area…" />
              </div>
              <div>
                <label style={labelS}>CATEGORY</label>
                <select style={{ ...inputS, color:'#ece9ff' }} value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
                  <option value="" style={{ background:'#0e0d2e', color:'#ece9ff' }}>— Select Category —</option>
                  {categories.map((c, idx) => (
                    <option key={c.id || idx} value={c.id} style={{ background:'#0e0d2e', color:'#ece9ff' }}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginTop:'0.75rem' }}>
              <label style={labelS}>NOTES</label>
              <textarea style={{ ...inputS, minHeight:64, resize:'vertical' }} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Additional remarks…" />
            </div>
          </div>

          {/* LINE ITEMS */}
          <div style={{ marginBottom:'1.25rem' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#7470b0', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'0.75rem', borderBottom:'1px solid #201e58', paddingBottom:'0.4rem' }}>LINE ITEMS</div>

            {/* Headers - desktop */}
            <div className="line-item-headers" style={{ display:'grid', gridTemplateColumns:'3fr 70px 80px 110px 80px 110px 32px', gap:'0.4rem', marginBottom:'0.35rem' }}>
              {['Description','Qty','Unit','Unit Price','Tax %','Line Total',''].map(h => (
                <div key={h} style={{ fontFamily:'var(--font-mono)', fontSize:'0.55rem', color:'#7470b0', letterSpacing:'0.08em', textTransform:'uppercase' }}>{h}</div>
              ))}
            </div>

            {lines.map((line, i) => {
              const { total } = calcLine(line)
              return (
                <div key={i} className="line-item-row">
                  <input type="text" className="li-desc" style={inputS} value={line.description} onChange={e=>setLine(i,'description',e.target.value)} placeholder="Item description…" />
                  <input type="number" style={inputS} value={line.quantity} onChange={e=>setLine(i,'quantity',e.target.value)} min="0" step="0.001" />
                  <input type="text" style={inputS} value={line.unit} onChange={e=>setLine(i,'unit',e.target.value)} placeholder="pcs" />
                  <input type="number" style={inputS} value={line.unit_price} onChange={e=>setLine(i,'unit_price',e.target.value)} min="0" step="0.01" placeholder="0.00" />
                  <input type="number" style={inputS} value={line.tax_percent} onChange={e=>setLine(i,'tax_percent',e.target.value)} min="0" max="100" step="0.01" />
                  <div className="li-total" style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:'#00ffb3', padding:'0.55rem 0.5rem', background:'rgba(0,255,179,0.05)', borderRadius:7, border:'1px solid rgba(0,255,179,0.15)', textAlign:'right' }}>
                    {fmt(total)}
                  </div>
                  <button className="li-delete" onClick={()=>{ if(lines.length>1) setLines(p=>p.filter((_,j)=>j!==i)) }}
                    style={{ background:'rgba(255,60,172,0.1)', border:'1px solid rgba(255,60,172,0.3)', borderRadius:7, color:'#ff3cac', cursor:'pointer', width:32, height:38, fontSize:'0.9rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    ✕
                  </button>
                </div>
              )
            })}

            <button className="btn btn-ghost btn-sm" style={{ marginTop:'0.5rem' }} onClick={()=>setLines(p=>[...p,EMPTY_LINE()])}>
              + Add Line Item
            </button>

            {/* Totals */}
            <div style={{ marginTop:'1rem', background:'rgba(5,5,26,0.8)', border:'1px solid #201e58', borderRadius:10, overflow:'hidden' }}>
              {([['Subtotal', subTotal, '#ece9ff'], ['VAT / Tax', taxTotal, '#ffe135']] as [string, number, string][]).map(([l,v,c]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'0.5rem 1rem', borderBottom:'1px solid rgba(32,30,88,0.5)', fontSize:'0.875rem' }}>
                  <span style={{ color:'#7470b0' }}>{l}</span>
                  <span style={{ fontFamily:'var(--font-mono)', color:c }}>SAR {fmt(v)}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'0.75rem 1rem', fontSize:'1rem', fontWeight:700 }}>
                <span style={{ color:'#ece9ff' }}>GRAND TOTAL</span>
                <span style={{ fontFamily:'var(--font-mono)', color:'#00ffb3', fontSize:'1.1rem', textShadow:'0 0 16px rgba(0,255,179,0.4)' }}>SAR {fmt(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* FILE UPLOAD */}
          <div style={{ marginBottom:'1.25rem' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'#7470b0', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'0.75rem', borderBottom:'1px solid #201e58', paddingBottom:'0.4rem' }}>
              ATTACH RECEIPTS / DOCUMENTS
            </div>

            <input ref={fileRef} type="file" id="exp-upload" multiple
              accept="image/*,.pdf,.docx,.xlsx,.txt,.zip"
              capture="environment"
              onChange={onFiles}
              style={{ display:'none' }}
            />

            {uploadErr && <div style={{ padding:'0.6rem 0.8rem', background:'rgba(255,60,172,0.1)', border:'1px solid rgba(255,60,172,0.3)', borderRadius:8, color:'#ff3cac', fontSize:'0.82rem', marginBottom:'0.75rem' }}>{uploadErr}</div>}

            <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.75rem' }}>
              <label htmlFor="exp-upload" className="btn btn-secondary" style={{ cursor:'pointer' }}>
                📷 Camera / Files
              </label>
              {staged.length > 0 && !uploading && (
                <button className="btn btn-primary" onClick={uploadFiles}>
                  ⬆ Upload {staged.length} File{staged.length>1?'s':''}
                </button>
              )}
              {uploading && <span style={{ color:'#4f8cff', fontFamily:'var(--font-mono)', fontSize:'0.75rem', alignSelf:'center' }}>Uploading…</span>}
            </div>

            {/* Staged preview */}
            {staged.length > 0 && (
              <div style={{ background:'rgba(5,5,26,0.6)', border:'1px solid #201e58', borderRadius:10, padding:'0.75rem', marginBottom:'0.75rem' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'#7470b0', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.5rem' }}>
                  STAGED ({humanSize(stagedBytes)})
                </div>
                <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                  {staged.map((f,i) => (
                    <div key={i} style={{ background:'rgba(79,140,255,0.08)', border:'1px solid rgba(79,140,255,0.2)', borderRadius:8, padding:'0.4rem 0.6rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                      {f.dataUrl && f.type.startsWith('image/') ? (
                        <img src={f.dataUrl} alt="" style={{ width:32, height:32, objectFit:'cover', borderRadius:4 }} />
                      ) : (
                        <span style={{ fontSize:'1.2rem' }}>📄</span>
                      )}
                      <div>
                        <div style={{ fontSize:'0.75rem', color:'#ece9ff', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize:'0.6rem', color:'#7470b0', fontFamily:'var(--font-mono)' }}>{humanSize(f.size)}</div>
                      </div>
                      <button onClick={()=>setStaged(p=>p.filter((_,j)=>j!==i))}
                        style={{ background:'none', border:'none', color:'#ff3cac', cursor:'pointer', fontSize:'0.9rem', padding:'0 0.2rem' }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Uploaded files */}
            {uploaded.length > 0 && (
              <div style={{ background:'rgba(0,255,179,0.05)', border:'1px solid rgba(0,255,179,0.2)', borderRadius:10, padding:'0.75rem' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'#00ffb3', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'0.5rem' }}>
                  ✓ UPLOADED ({uploaded.length})
                </div>
                <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                  {uploaded.map((f,i) => (
                    <a key={i} href={f.url} target="_blank" rel="noreferrer"
                      style={{ background:'rgba(0,255,179,0.08)', border:'1px solid rgba(0,255,179,0.2)', borderRadius:8, padding:'0.35rem 0.6rem', display:'flex', alignItems:'center', gap:'0.35rem', textDecoration:'none' }}>
                      {f.type?.startsWith('image/') ? (
                        <img src={f.thumb_url||f.url} alt="" style={{ width:28, height:28, objectFit:'cover', borderRadius:4 }} />
                      ) : <span>📄</span>}
                      <span style={{ fontSize:'0.72rem', color:'#00ffb3', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', flexWrap:'wrap', paddingTop:'1rem', borderTop:'1px solid #201e58' }}>
            <button className="btn btn-ghost" onClick={()=>navigate('/expenses')} disabled={submitting}>
              Cancel
            </button>
            <button className="btn btn-primary btn-lg" onClick={handleSubmit} disabled={submitting || uploading} style={{ minWidth:180 }}>
              {submitting ? '⟳ Submitting…' : '✓ Submit Expense'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
