// src/pages/WorkersPage.tsx — Alpha Ultimate ERP v7
// Full HR module: Workers list, tap-to-reveal, photo+ID upload, project workers
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { isSuperUser } from '../lib/auth'
import { api } from '../lib/api'
import CameraUploadForm from '../components/erp/CameraUploadForm'

interface Worker {
  id: string; employee_id: string; full_name: string; arabic_name?: string
  nationality: string; national_id?: string; passport_number?: string
  iqama_number?: string; iqama_expiry?: string; date_of_birth?: string
  gender: string; marital_status?: string; phone: string; phone2?: string
  email?: string; emergency_contact_name?: string; emergency_contact_phone?: string
  position: string; department: string; project_assignment?: string
  join_date: string; contract_type: string; contract_end?: string
  basic_salary: number; housing_allowance: number; transport_allowance: number
  other_allowance: number; bank_name?: string; bank_iban?: string
  status: string; photo_url?: string; id_photo_url?: string
  passport_photo_url?: string; iqama_photo_url?: string; notes?: string; created_at: string
}

const DEPTS = ['Operations','Construction','Cleaning','Maintenance','Administration','Finance','HR','IT','Safety','Logistics']
const POSITIONS = ['Site Manager','Project Manager','Supervisor','Foreman','Technician','Worker','Cleaner','Driver','Security','Admin','Accountant','Engineer','Helper']
const NATS = ['Saudi','Pakistani','Indian','Bangladeshi','Filipino','Yemeni','Egyptian','Sudanese','Syrian','Nepali','Ethiopian','Other']

const sar = (n: number) => `SAR ${Number(n||0).toLocaleString('en-SA',{minimumFractionDigits:2})}`

function Lightbox({ src, onClose }: { src:string; onClose:()=>void }) {
  return <div className="lightbox-overlay" onClick={onClose}><img src={src} alt="doc" /><button onClick={onClose} style={{position:'absolute',top:'1rem',right:'1rem',background:'rgba(255,255,255,.15)',border:'none',borderRadius:'50%',width:42,height:42,color:'#fff',cursor:'pointer',fontSize:'1.2rem'}}>✕</button></div>
}

function WorkerModal({ w, onClose, onRefresh, su }: { w:Worker; onClose:()=>void; onRefresh:()=>void; su:boolean }) {
  const [tab, setTab] = useState<'info'|'docs'|'salary'|'edit'>('info')
  const [lb, setLb] = useState('')
  const [ed, setEd] = useState<Partial<Worker>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  const total = [w.basic_salary,w.housing_allowance,w.transport_allowance,w.other_allowance].reduce((a,v)=>a+Number(v||0),0)

  async function save() {
    setSaving(true); setErr(''); setOk('')
    try { await api.post('/workers/update',{id:w.id,...ed}); setOk('Saved!'); onRefresh() }
    catch(e:unknown){setErr(e instanceof Error?e.message:'Error')} finally{setSaving(false)}
  }

  const docs = [{label:'Profile Photo',url:w.photo_url},{label:'National ID / Iqama',url:w.id_photo_url},{label:'Passport',url:w.passport_photo_url},{label:'Iqama Card',url:w.iqama_photo_url}].filter(d=>d.url)

  return (
    <div className="detail-modal-overlay" onClick={onClose}>
      {lb && <Lightbox src={lb} onClose={()=>setLb('')}/>}
      <div className="detail-modal" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{padding:'1.5rem',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'1rem',background:'linear-gradient(135deg,rgba(79,140,255,.1),rgba(191,95,255,.07))'}}>
          <div style={{display:'flex',alignItems:'center',gap:'1rem',flex:1,minWidth:0}}>
            {w.photo_url
              ? <img src={w.photo_url} alt={w.full_name} className="worker-avatar" style={{width:72,height:72,cursor:'zoom-in'}} onClick={()=>setLb(w.photo_url!)}/>
              : <div className="worker-avatar-placeholder" style={{width:72,height:72,fontSize:'2rem'}}>👷</div>}
            <div style={{minWidth:0}}>
              <div style={{fontFamily:'var(--font)',fontWeight:800,fontSize:'1.3rem',color:'var(--text)',lineHeight:1.1}}>{w.full_name}</div>
              {w.arabic_name && <div style={{fontSize:'1rem',color:'var(--text2)',direction:'rtl'}}>{w.arabic_name}</div>}
              <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap',marginTop:'.35rem'}}>
                <span className="mono" style={{fontSize:'.72rem',color:'var(--cyan)'}}>{w.employee_id}</span>
                <span className="badge" style={{background:'rgba(79,140,255,.12)',color:'var(--blue)',border:'1px solid rgba(79,140,255,.3)'}}>{w.position}</span>
                <span className={`badge badge-${w.status==='active'?'active':'inactive'}`}>{w.status}</span>
              </div>
              <div style={{fontSize:'.82rem',color:'var(--text2)',marginTop:'.2rem'}}>{w.department} · {w.nationality}</div>
            </div>
          </div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,.08)',border:'1px solid var(--border)',borderRadius:8,width:36,height:36,color:'var(--text2)',cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>

        {/* Salary banner */}
        <div style={{padding:'.7rem 1.5rem',background:'rgba(0,255,179,.06)',borderBottom:'1px solid rgba(0,255,179,.15)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:'.7rem',color:'var(--text2)',fontFamily:'var(--font-mono)',textTransform:'uppercase'}}>Monthly Package</span>
          <span className="mono" style={{fontSize:'1.2rem',fontWeight:700,color:'var(--green)'}}>{sar(total)}</span>
        </div>

        {/* Tabs */}
        <div className="tab-nav" style={{padding:'0 1.5rem',marginBottom:0}}>
          {([['info','👤 Info'],['docs','📄 Docs'],['salary','💰 Salary'],...(su?[['edit','✏️ Edit']]:[])] as [string,string][]).map(([k,l])=>(
            <button key={k} className={`tab-btn${tab===k?' active':''}`} onClick={()=>setTab(k as typeof tab)}>{l}</button>
          ))}
        </div>

        <div style={{padding:'1.5rem'}}>
          {tab==='info' && (
            <div className="fade-in">
              <div className="section-label">Personal</div>
              <div className="info-grid" style={{marginBottom:'1rem'}}>
                {[['Full Name',w.full_name],['Arabic Name',w.arabic_name||'—'],['Emp ID',w.employee_id],['Nationality',w.nationality],['National ID',w.national_id||'—'],['Passport',w.passport_number||'—'],['Iqama #',w.iqama_number||'—'],['Iqama Expiry',w.iqama_expiry?new Date(w.iqama_expiry).toLocaleDateString('en-GB'):'—'],['Date of Birth',w.date_of_birth?new Date(w.date_of_birth).toLocaleDateString('en-GB'):'—'],['Gender',w.gender],['Marital',w.marital_status||'—']].map(([l,v])=>(
                  <div key={l} className="info-cell"><div className="info-cell-label">{l}</div><div className="info-cell-value">{v}</div></div>
                ))}
              </div>
              <div className="section-label">Contact & Employment</div>
              <div className="info-grid">
                {[['Phone',w.phone],['Phone 2',w.phone2||'—'],['Email',w.email||'—'],['Emergency',w.emergency_contact_name||'—'],['Emg Phone',w.emergency_contact_phone||'—'],['Position',w.position],['Department',w.department],['Project',w.project_assignment||'—'],['Join Date',new Date(w.join_date).toLocaleDateString('en-GB')],['Contract',w.contract_type],['Contract End',w.contract_end?new Date(w.contract_end).toLocaleDateString('en-GB'):'Permanent']].map(([l,v])=>(
                  <div key={l} className="info-cell"><div className="info-cell-label">{l}</div><div className="info-cell-value">{v}</div></div>
                ))}
              </div>
              {(w.bank_name||w.bank_iban) && (
                <div style={{marginTop:'1rem'}}>
                  <div className="section-label">Bank</div>
                  <div className="info-grid">
                    {w.bank_name && <div className="info-cell"><div className="info-cell-label">Bank</div><div className="info-cell-value">{w.bank_name}</div></div>}
                    {w.bank_iban && <div className="info-cell" style={{gridColumn:'span 2'}}><div className="info-cell-label">IBAN</div><div className="info-cell-value mono" style={{fontSize:'.76rem',wordBreak:'break-all'}}>{w.bank_iban}</div></div>}
                  </div>
                </div>
              )}
            </div>
          )}
          {tab==='docs' && (
            <div className="fade-in">
              <div className="section-label">Document Photos</div>
              {docs.length===0
                ? <div style={{textAlign:'center',color:'var(--text-dim)',padding:'2rem',background:'rgba(255,255,255,.025)',borderRadius:'var(--radius)',border:'1px dashed var(--border)'}}>No documents uploaded yet</div>
                : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:'1rem'}}>
                    {docs.map(d=>(
                      <div key={d.label} style={{cursor:'zoom-in'}} onClick={()=>setLb(d.url!)}>
                        <div style={{border:'1px solid var(--border)',borderRadius:'var(--radius)',overflow:'hidden',aspectRatio:'4/3',marginBottom:'.3rem'}}>
                          <img src={d.url} alt={d.label} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                        </div>
                        <div style={{fontSize:'.68rem',color:'var(--text2)',fontFamily:'var(--font-mono)',textAlign:'center'}}>{d.label}</div>
                      </div>
                    ))}
                  </div>}
              {su && <div style={{marginTop:'1.5rem'}}><div className="section-label">Upload More Documents</div><CameraUploadForm entityType="worker_docs" entityId={w.id} onUploaded={()=>onRefresh()}/></div>}
            </div>
          )}
          {tab==='salary' && (
            <div className="fade-in">
              <div className="salary-slip">
                <div className="salary-slip-header">
                  <div style={{fontSize:'.7rem',color:'var(--text2)',fontFamily:'var(--font-mono)',textTransform:'uppercase',marginBottom:'.3rem'}}>Salary Structure</div>
                  <div style={{fontFamily:'var(--font)',fontWeight:800,fontSize:'1.4rem',color:'var(--text)'}}>{w.full_name}</div>
                  <div style={{fontSize:'.82rem',color:'var(--text2)'}}>{w.position} · {w.department}</div>
                </div>
                {[['Basic Salary',w.basic_salary,'var(--green)'],['Housing Allowance',w.housing_allowance,'var(--blue)'],['Transport Allowance',w.transport_allowance,'var(--cyan)'],['Other Allowance',w.other_allowance,'var(--violet)']].map(([l,a,c])=>(
                  <div key={l as string} className="salary-item-row">
                    <span style={{fontSize:'.88rem',color:'var(--text2)'}}>{l as string}</span>
                    <span className="mono" style={{fontSize:'.88rem',color:c as string}}>{sar(Number(a))}</span>
                  </div>
                ))}
                <div className="salary-item-row" style={{borderTop:'1px solid var(--border2)',background:'rgba(0,255,179,.06)'}}>
                  <span style={{fontWeight:700,color:'var(--text)',fontSize:'1rem'}}>TOTAL MONTHLY</span>
                  <span className="mono" style={{fontSize:'1.1rem',fontWeight:700,color:'var(--green)'}}>{sar(total)}</span>
                </div>
              </div>
            </div>
          )}
          {tab==='edit' && su && (
            <div className="fade-in">
              {err&&<div className="alert-error">{err}</div>}{ok&&<div className="alert-success">{ok}</div>}
              <div className="form-grid" style={{marginBottom:'1rem'}}>
                {[['Status','status','select',['active','inactive','on_leave','terminated']],['Position','position','select',POSITIONS],['Department','department','select',DEPTS]].map(([l,k,t,opts])=>(
                  <div key={k as string} className="form-row">
                    <label className="label">{l as string}</label>
                    <select className="input" defaultValue={(w as unknown as Record<string,unknown>)[k as string] as string} onChange={e=>setEd(p=>({...p,[k as string]:e.target.value}))}>
                      {(opts as string[]).map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                <div className="form-row">
                  <label className="label">Project</label>
                  <input className="input" defaultValue={w.project_assignment||''} onChange={e=>setEd(p=>({...p,project_assignment:e.target.value}))}/>
                </div>
                {[['basic_salary','Basic Salary'],['housing_allowance','Housing'],['transport_allowance','Transport'],['other_allowance','Other']].map(([k,l])=>(
                  <div key={k} className="form-row">
                    <label className="label">{l} (SAR)</label>
                    <input className="input" type="number" defaultValue={Number((w as unknown as Record<string,unknown>)[k])||0} onChange={e=>setEd(p=>({...p,[k]:parseFloat(e.target.value)||0}))}/>
                  </div>
                ))}
                <div className="form-row col-span-2">
                  <label className="label">Notes</label>
                  <textarea className="input" rows={2} defaultValue={w.notes||''} onChange={e=>setEd(p=>({...p,notes:e.target.value}))}/>
                </div>
              </div>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':'💾 Save Changes'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AddWorkerForm({ onClose, onCreated }: { onClose:()=>void; onCreated:()=>void }) {
  const [form, setForm] = useState({ full_name:'',arabic_name:'',nationality:'Saudi',national_id:'',passport_number:'',iqama_number:'',iqama_expiry:'',date_of_birth:'',gender:'Male',marital_status:'Single',phone:'',phone2:'',email:'',emergency_contact_name:'',emergency_contact_phone:'',position:'Worker',department:'Operations',project_assignment:'',join_date:new Date().toISOString().split('T')[0],contract_type:'Full-time',contract_end:'',basic_salary:'',housing_allowance:'',transport_allowance:'',other_allowance:'',bank_name:'',bank_iban:'',notes:'' })
  const [photoUrl, setPhotoUrl] = useState(''); const [idPhotoUrl, setIdPhotoUrl] = useState('')
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('')
  const f = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm(p=>({...p,[k]:e.target.value}))

  async function submit() {
    if (!form.full_name.trim()||!form.phone.trim()||!form.join_date){setErr('Full Name, Phone and Join Date required');return}
    setSaving(true); setErr('')
    try { await api.post('/workers',{...form,photo_url:photoUrl,id_photo_url:idPhotoUrl}); onCreated(); onClose() }
    catch(e:unknown){setErr(e instanceof Error?e.message:'Error')} finally{setSaving(false)}
  }

  return (
    <div className="detail-modal-overlay" onClick={onClose}>
      <div className="detail-modal" style={{maxWidth:860}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'1.25rem 1.5rem',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'linear-gradient(135deg,rgba(79,140,255,.1),rgba(191,95,255,.07))'}}>
          <div><div className="page-title" style={{fontSize:'1.3rem'}}>Add New Worker</div><div style={{fontSize:'.72rem',color:'var(--text2)',fontFamily:'var(--font-mono)'}}>HR RECORD</div></div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,.08)',border:'1px solid var(--border)',borderRadius:8,width:36,height:36,color:'var(--text2)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>
        <div style={{padding:'1.5rem'}}>
          {err&&<div className="alert-error">{err}</div>}
          <div className="section-label">Photos & Documents</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1.5rem'}}>
            <div>
              <label className="label">Profile Photo (tap to take photo)</label>
              <CameraUploadForm entityType="worker_photo" onUploaded={files=>setPhotoUrl(files[0]?.url||'')}/>
              {photoUrl&&<img src={photoUrl} style={{marginTop:'.5rem',width:72,height:72,objectFit:'cover',borderRadius:'50%',border:'2px solid var(--border2)'}} alt="profile"/>}
            </div>
            <div>
              <label className="label">ID / Iqama Photo (tap to capture)</label>
              <CameraUploadForm entityType="worker_id" onUploaded={files=>setIdPhotoUrl(files[0]?.url||'')}/>
              {idPhotoUrl&&<img src={idPhotoUrl} style={{marginTop:'.5rem',width:120,height:80,objectFit:'cover',borderRadius:'var(--radius)',border:'2px solid var(--border2)'}} alt="id"/>}
            </div>
          </div>
          <div className="section-label">Personal Information</div>
          <div className="form-grid" style={{marginBottom:'1.25rem'}}>
            <div className="form-row"><label className="label">Full Name (English) *</label><input className="input" value={form.full_name} onChange={f('full_name')} placeholder="John Smith"/></div>
            <div className="form-row"><label className="label">Arabic Name</label><input className="input" value={form.arabic_name} onChange={f('arabic_name')} placeholder="الاسم بالعربي" dir="rtl"/></div>
            <div className="form-row"><label className="label">Nationality</label><select className="input" value={form.nationality} onChange={f('nationality')}>{NATS.map(n=><option key={n}>{n}</option>)}</select></div>
            <div className="form-row"><label className="label">Gender</label><select className="input" value={form.gender} onChange={f('gender')}><option>Male</option><option>Female</option></select></div>
            <div className="form-row"><label className="label">Date of Birth</label><input className="input" type="date" value={form.date_of_birth} onChange={f('date_of_birth')}/></div>
            <div className="form-row"><label className="label">Marital Status</label><select className="input" value={form.marital_status} onChange={f('marital_status')}><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select></div>
            <div className="form-row"><label className="label">National ID</label><input className="input" value={form.national_id} onChange={f('national_id')} placeholder="1234567890"/></div>
            <div className="form-row"><label className="label">Iqama Number</label><input className="input" value={form.iqama_number} onChange={f('iqama_number')} placeholder="2XXXXXXXX"/></div>
            <div className="form-row"><label className="label">Iqama Expiry</label><input className="input" type="date" value={form.iqama_expiry} onChange={f('iqama_expiry')}/></div>
            <div className="form-row"><label className="label">Passport Number</label><input className="input" value={form.passport_number} onChange={f('passport_number')} placeholder="A12345678"/></div>
          </div>
          <div className="section-label">Contact</div>
          <div className="form-grid" style={{marginBottom:'1.25rem'}}>
            <div className="form-row"><label className="label">Phone *</label><input className="input" value={form.phone} onChange={f('phone')} placeholder="+966 5X XXX XXXX"/></div>
            <div className="form-row"><label className="label">Phone 2</label><input className="input" value={form.phone2} onChange={f('phone2')} placeholder="+966…"/></div>
            <div className="form-row"><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={f('email')} placeholder="email@domain.com"/></div>
            <div className="form-row"><label className="label">Emergency Contact</label><input className="input" value={form.emergency_contact_name} onChange={f('emergency_contact_name')} placeholder="Relative name"/></div>
            <div className="form-row"><label className="label">Emergency Phone</label><input className="input" value={form.emergency_contact_phone} onChange={f('emergency_contact_phone')} placeholder="+966…"/></div>
          </div>
          <div className="section-label">Employment</div>
          <div className="form-grid" style={{marginBottom:'1.25rem'}}>
            <div className="form-row"><label className="label">Position</label><select className="input" value={form.position} onChange={f('position')}>{POSITIONS.map(p=><option key={p}>{p}</option>)}</select></div>
            <div className="form-row"><label className="label">Department</label><select className="input" value={form.department} onChange={f('department')}>{DEPTS.map(d=><option key={d}>{d}</option>)}</select></div>
            <div className="form-row"><label className="label">Project / Site</label><input className="input" value={form.project_assignment} onChange={f('project_assignment')} placeholder="Project name"/></div>
            <div className="form-row"><label className="label">Join Date *</label><input className="input" type="date" value={form.join_date} onChange={f('join_date')}/></div>
            <div className="form-row"><label className="label">Contract Type</label><select className="input" value={form.contract_type} onChange={f('contract_type')}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Daily</option><option>Seasonal</option></select></div>
            <div className="form-row"><label className="label">Contract End</label><input className="input" type="date" value={form.contract_end} onChange={f('contract_end')}/></div>
          </div>
          <div className="section-label">Salary Package (SAR/month)</div>
          <div className="form-grid" style={{marginBottom:'1.25rem'}}>
            <div className="form-row"><label className="label">Basic Salary</label><input className="input" type="number" value={form.basic_salary} onChange={f('basic_salary')} placeholder="0.00"/></div>
            <div className="form-row"><label className="label">Housing Allowance</label><input className="input" type="number" value={form.housing_allowance} onChange={f('housing_allowance')} placeholder="0.00"/></div>
            <div className="form-row"><label className="label">Transport Allowance</label><input className="input" type="number" value={form.transport_allowance} onChange={f('transport_allowance')} placeholder="0.00"/></div>
            <div className="form-row"><label className="label">Other Allowance</label><input className="input" type="number" value={form.other_allowance} onChange={f('other_allowance')} placeholder="0.00"/></div>
          </div>
          <div className="section-label">Bank Details</div>
          <div className="form-grid" style={{marginBottom:'1.25rem'}}>
            <div className="form-row"><label className="label">Bank Name</label><input className="input" value={form.bank_name} onChange={f('bank_name')} placeholder="Al Rajhi, NCB…"/></div>
            <div className="form-row"><label className="label">IBAN</label><input className="input" value={form.bank_iban} onChange={f('bank_iban')} placeholder="SA…"/></div>
          </div>
          <div className="form-row" style={{marginBottom:'1.5rem'}}>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={f('notes')} placeholder="Any notes…"/>
          </div>
          <div style={{display:'flex',gap:'.75rem',justifyContent:'flex-end'}}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving?'Saving…':'👷 Add Worker'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WorkersPage() {
  const { user } = useAuth()
  const su = isSuperUser(user)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [view, setView] = useState<'grid'|'list'>('grid')
  const [selected, setSelected] = useState<Worker|null>(null)
  const [showAdd, setShowAdd] = useState(false)

  function load() {
    setLoading(true)
    api.get<{workers:Worker[]}>('/workers')
      .then(d=>setWorkers(d.workers))
      .catch(e=>setError(e.message))
      .finally(()=>setLoading(false))
  }
  useEffect(load,[])

  const projects = [...new Set(workers.map(w=>w.project_assignment).filter(Boolean))]
  const filtered = workers.filter(w=>{
    const q = search.toLowerCase()
    const mq = !q || w.full_name.toLowerCase().includes(q) || (w.employee_id||'').toLowerCase().includes(q) || w.position.toLowerCase().includes(q) || (w.phone||'').includes(q) || (w.national_id||'').includes(q)
    const md = !filterDept || w.department===filterDept
    const ms = !filterStatus || w.status===filterStatus
    const mp = !filterProject || w.project_assignment===filterProject
    return mq&&md&&ms&&mp
  })

  const activeCount = workers.filter(w=>w.status==='active').length
  const payroll = workers.filter(w=>w.status==='active').reduce((s,w)=>s+[w.basic_salary,w.housing_allowance,w.transport_allowance,w.other_allowance].reduce((a,v)=>a+Number(v||0),0),0)
  const expiring = workers.filter(w=>{if(!w.iqama_expiry)return false;const d=(new Date(w.iqama_expiry).getTime()-Date.now())/(86400000);return d>=0&&d<=60}).length

  return (
    <div>
      {selected && <WorkerModal w={selected} onClose={()=>setSelected(null)} onRefresh={()=>{load();setSelected(null)}} su={su}/>}
      {showAdd && su && <AddWorkerForm onClose={()=>setShowAdd(false)} onCreated={load}/>}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.25rem',flexWrap:'wrap',gap:'.75rem'}}>
        <div>
          <h1 className="page-title">Workers & HR</h1>
          <div style={{fontSize:'.78rem',color:'var(--text2)',fontFamily:'var(--font-mono)',marginTop:'.2rem'}}>{workers.length} total records</div>
        </div>
        <div style={{display:'flex',gap:'.6rem',flexWrap:'wrap'}}>
          <button className={`btn btn-sm btn-${view==='grid'?'primary':'ghost'}`} onClick={()=>setView('grid')}>⊞ Grid</button>
          <button className={`btn btn-sm btn-${view==='list'?'primary':'ghost'}`} onClick={()=>setView('list')}>☰ List</button>
          {su&&<button className="btn btn-primary btn-sm" onClick={()=>setShowAdd(true)}>+ Add Worker</button>}
        </div>
      </div>

      <div className="stat-grid" style={{marginBottom:'1.25rem'}}>
        {[{l:'Total Workers',v:workers.length,c:'var(--blue)'},{l:'Active',v:activeCount,c:'var(--green)'},{l:'Monthly Payroll',v:sar(payroll),c:'var(--cyan)',mono:true},{l:'Iqama Expiring 60d',v:expiring,c:expiring>0?'var(--amber)':'var(--green)'}].map(s=>(
          <div key={s.l} className="stat-card" style={{'--accent':s.c} as React.CSSProperties}>
            <div className="glow-dot"/>
            <div style={{fontSize:'.68rem',color:'var(--text2)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'.4rem'}}>{s.l}</div>
            <div className={s.mono?'mono':''} style={{fontSize:'1.35rem',fontWeight:700,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="glass" style={{padding:'1rem',marginBottom:'1rem',display:'flex',gap:'.75rem',flexWrap:'wrap',alignItems:'center'}}>
        <div className="search-wrap" style={{flex:1,minWidth:200}}>
          <input className="search-input" style={{width:'100%'}} placeholder="Search name, ID, phone, position…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="input" style={{minWidth:140,width:'auto'}} value={filterDept} onChange={e=>setFilterDept(e.target.value)}>
          <option value="">All Departments</option>{DEPTS.map(d=><option key={d}>{d}</option>)}
        </select>
        <select className="input" style={{minWidth:120,width:'auto'}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On Leave</option><option value="terminated">Terminated</option>
        </select>
        {projects.length>0&&<select className="input" style={{minWidth:140,width:'auto'}} value={filterProject} onChange={e=>setFilterProject(e.target.value)}><option value="">All Projects</option>{projects.map(p=><option key={p!}>{p}</option>)}</select>}
        {(search||filterDept||filterStatus||filterProject)&&<button className="btn btn-sm btn-ghost" onClick={()=>{setSearch('');setFilterDept('');setFilterStatus('');setFilterProject('')}}>✕ Clear</button>}
        <span style={{fontSize:'.72rem',color:'var(--text-dim)',fontFamily:'var(--font-mono)',marginLeft:'auto'}}>{filtered.length}/{workers.length}</span>
      </div>

      {error&&<div className="alert-error">{error}</div>}
      {loading?(<div className="loading-center"><div className="spinner"/><div className="loading-text">LOADING WORKERS…</div></div>)
      : filtered.length===0?(<div className="glass" style={{padding:'3rem',textAlign:'center',color:'var(--text-dim)'}}><div style={{fontSize:'3rem',marginBottom:'1rem'}}>👷</div><div style={{fontSize:'1rem',color:'var(--text2)'}}>{workers.length===0?'No workers added yet.':'No workers match your search.'}</div>{su&&workers.length===0&&<button className="btn btn-primary" style={{marginTop:'1rem'}} onClick={()=>setShowAdd(true)}>+ Add First Worker</button>}</div>)
      : view==='grid'?(
        <div className="worker-grid fade-in">
          {filtered.map(w=>{
            const t=[w.basic_salary,w.housing_allowance,w.transport_allowance,w.other_allowance].reduce((a,v)=>a+Number(v||0),0)
            return(
              <div key={w.id} className="worker-card" onClick={()=>setSelected(w)}>
                <div style={{display:'flex',alignItems:'flex-start',gap:'.85rem',marginBottom:'.75rem'}}>
                  {w.photo_url?<img src={w.photo_url} alt={w.full_name} className="worker-avatar"/>:<div className="worker-avatar-placeholder">👷</div>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:'.98rem',color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.full_name}</div>
                    <div style={{fontSize:'.75rem',color:'var(--text2)',marginTop:'.1rem'}}>{w.position}</div>
                    <div style={{display:'flex',gap:'.4rem',marginTop:'.3rem',flexWrap:'wrap'}}>
                      <span className={`badge badge-${w.status==='active'?'active':'inactive'}`}>{w.status}</span>
                      <span style={{fontSize:'.62rem',color:'var(--text-dim)',fontFamily:'var(--font-mono)'}}>{w.nationality}</span>
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid var(--border)',paddingTop:'.6rem'}}>
                  <div><div style={{fontSize:'.58rem',color:'var(--text-dim)',fontFamily:'var(--font-mono)',textTransform:'uppercase'}}>{w.department}</div>{w.project_assignment&&<div style={{fontSize:'.72rem',color:'var(--text2)'}}>{w.project_assignment}</div>}</div>
                  <div className="mono" style={{fontSize:'.8rem',fontWeight:700,color:'var(--green)'}}>{sar(t)}</div>
                </div>
                <div style={{fontSize:'.58rem',color:'var(--text-dim)',fontFamily:'var(--font-mono)',marginTop:'.3rem',display:'flex',justifyContent:'space-between'}}>
                  <span>{w.employee_id}</span><span style={{color:'var(--cyan)'}}>↗ tap to view</span>
                </div>
              </div>
            )
          })}
        </div>
      ):(
        <div className="glass table-wrap fade-in">
          <table>
            <thead><tr><th>Worker</th><th>ID</th><th>Position</th><th>Dept</th><th>Project</th><th>Phone</th><th>Salary/mo</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map(w=>{
                const t=[w.basic_salary,w.housing_allowance,w.transport_allowance,w.other_allowance].reduce((a,v)=>a+Number(v||0),0)
                return(
                  <tr key={w.id} className="clickable-row" onClick={()=>setSelected(w)}>
                    <td><div style={{display:'flex',alignItems:'center',gap:'.6rem'}}>{w.photo_url?<img src={w.photo_url} style={{width:32,height:32,borderRadius:'50%',objectFit:'cover',border:'1px solid var(--border2)'}} alt=""/>:<div style={{width:32,height:32,borderRadius:'50%',background:'var(--surface)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.85rem'}}>👷</div>}<div><div style={{fontWeight:600}}>{w.full_name}</div><div style={{fontSize:'.72rem',color:'var(--text2)'}}>{w.nationality}</div></div></div></td>
                    <td><span className="mono" style={{fontSize:'.78rem',color:'var(--cyan)'}}>{w.employee_id}</span></td>
                    <td style={{fontSize:'.85rem'}}>{w.position}</td>
                    <td style={{fontSize:'.85rem',color:'var(--text2)'}}>{w.department}</td>
                    <td style={{fontSize:'.82rem',color:'var(--text2)'}}>{w.project_assignment||'—'}</td>
                    <td style={{fontSize:'.82rem'}}>{w.phone}</td>
                    <td><span className="mono" style={{fontSize:'.82rem',color:'var(--green)'}}>{sar(t)}</span></td>
                    <td><span className={`badge badge-${w.status==='active'?'active':'inactive'}`}>{w.status}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
