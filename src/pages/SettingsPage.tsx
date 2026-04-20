// src/pages/SettingsPage.tsx — Alpha Quantum ERP v20
import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'
import { useLang } from '../lib/LangContext'

type Tab = 'Company' | 'Finance' | 'Notifications' | 'Security' | 'Theme'
const TABS: Tab[] = ['Company', 'Finance', 'Notifications', 'Security', 'Theme']

const TAB_ICONS: Record<Tab, string> = {
  Company: '🏢', Finance: '💰', Notifications: '🔔', Security: '🔐', Theme: '🎨'
}

export default function SettingsPage() {
  const { user }               = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { t }                  = useLang()
  const [tab, setTab]          = useState<Tab>('Company')
  const [settings, setSettings]= useState<Record<string, string>>({})
  const [loading, setLoading]  = useState(true)
  const [saving, setSaving]    = useState(false)
  const [msg, setMsg]          = useState('')
  const [err, setErr]          = useState('')
  const logoRef                = useRef<HTMLInputElement>(null)

  // Password state
  const [curPass, setCurPass]    = useState('')
  const [newPass, setNewPass]    = useState('')
  const [confPass, setConfPass]  = useState('')
  const [passMsg, setPassMsg]    = useState('')
  const [passErr, setPassErr]    = useState('')
  const [changingPass, setChanging] = useState(false)
  const [showCur, setShowCur]    = useState(false)
  const [showNew, setShowNew]    = useState(false)

  const isSu = ['creator','cube_admin','superuser'].includes(user?.role || '')

  useEffect(() => {
    api.get<{ settings: Record<string, string> }>('/settings')
      .then(d => setSettings(d.settings || {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function set(key: string, val: string) {
    setSettings(s => ({ ...s, [key]: val }))
  }

  async function save() {
    setSaving(true); setMsg(''); setErr('')
    try {
      // Save all settings as individual key-value pairs
      await Promise.all(
        Object.entries(settings).map(([key, value]) =>
          api.post('/settings', { key, value })
        )
      )
      setMsg('Settings saved successfully ✓')
      setTimeout(() => setMsg(''), 3000)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  async function changePassword() {
    if (!newPass || !confPass || !curPass) { setPassErr('All password fields are required'); return }
    if (newPass !== confPass) { setPassErr('New passwords do not match'); return }
    if (newPass.length < 8)   { setPassErr('Password must be at least 8 characters'); return }
    setChanging(true); setPassErr(''); setPassMsg('')
    try {
      await api.post('/users/change-password', { current_password: curPass, new_password: newPass })
      setPassMsg('Password changed successfully ✓')
      setCurPass(''); setNewPass(''); setConfPass('')
      setTimeout(() => setPassMsg(''), 4000)
    } catch (e: unknown) {
      setPassErr(e instanceof Error ? e.message : 'Failed to change password')
    } finally { setChanging(false) }
  }

  // ── Reusable input ────────────────────────────────────────────────────────
  const Field = ({
    k, label, type = 'text', placeholder = '', hint = '', required = false
  }: {
    k: string; label: string; type?: string
    placeholder?: string; hint?: string; required?: boolean
  }) => (
    <div style={{ marginBottom: '1.25rem' }}>
      <label style={{ display: 'block', fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '.4rem', letterSpacing: '.01em' }}>
        {label}{required && <span style={{ color: 'var(--rose)', marginLeft: 2 }}>*</span>}
      </label>
      <input
        className="input" type={type} placeholder={placeholder}
        value={settings[k] || ''}
        onChange={e => set(k, e.target.value)}
        style={{ width: '100%' }}
      />
      {hint && <div style={{ fontSize: '.72rem', color: 'var(--text3)', marginTop: '.3rem' }}>{hint}</div>}
    </div>
  )

  const Select = ({ k, label, options, hint = '' }: { k: string; label: string; options: { value: string; label: string }[]; hint?: string }) => (
    <div style={{ marginBottom: '1.25rem' }}>
      <label style={{ display: 'block', fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '.4rem' }}>{label}</label>
      <select className="input" value={settings[k] || options[0]?.value || ''} onChange={e => set(k, e.target.value)} style={{ width: '100%' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <div style={{ fontSize: '.72rem', color: 'var(--text3)', marginTop: '.3rem' }}>{hint}</div>}
    </div>
  )

  const Toggle = ({ k, label, hint = '' }: { k: string; label: string; hint?: string }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.1rem', padding: '.85rem 1rem', background: 'var(--hover-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {hint && <div style={{ fontSize: '.72rem', color: 'var(--text3)', marginTop: '.2rem' }}>{hint}</div>}
      </div>
      <button
        onClick={() => set(k, settings[k] === 'true' ? 'false' : 'true')}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: settings[k] === 'true' ? 'var(--blue)' : 'var(--border2)',
          position: 'relative', transition: 'background .2s'
        }}
      >
        <div style={{
          position: 'absolute', top: 2,
          left: settings[k] === 'true' ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.25)'
        }} />
      </button>
    </div>
  )

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div className="page-content" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">⚙️ {t.settings}</h1>
          <p className="page-sub">Configure your workspace and preferences</p>
        </div>
        {isSu && tab !== 'Security' && tab !== 'Theme' && (
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving
              ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving…</>
              : t.saveSettings}
          </button>
        )}
      </div>

      {msg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{msg}</div>}
      {err && <div className="alert alert-error"  style={{ marginBottom: '1rem' }}>{err}</div>}

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '.35rem', marginBottom: '1.75rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              display: 'flex', alignItems: 'center', gap: '.4rem',
              padding: '.42rem .9rem', borderRadius: 'var(--radius)',
              border: tab === t ? '1px solid var(--blue)' : '1px solid var(--border2)',
              background: tab === t ? 'var(--blue-d)' : 'var(--hover-bg)',
              color: tab === t ? 'var(--blue-bright)' : 'var(--text2)',
              fontWeight: tab === t ? 700 : 500, fontSize: '.83rem',
              cursor: 'pointer', transition: 'all .14s',
            }}
          >
            <span>{TAB_ICONS[t]}</span>
            <span>{t}</span>
          </button>
        ))}
      </div>

      {/* ─────────────────────────────────────────────────── */}
      {/* COMPANY TAB                                        */}
      {/* ─────────────────────────────────────────────────── */}
      {tab === 'Company' && (
        <div>
          {/* Logo section */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '.75rem' }}>Company Logo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              <div style={{
                width: 80, height: 80, borderRadius: 'var(--radius-lg)',
                background: 'var(--hover-bg)', border: '2px dashed var(--border2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0
              }}>
                {settings.company_logo
                  ? <img src={settings.company_logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '1.75rem' }}>🏢</span>
                }
              </div>
              <div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => logoRef.current?.click()}
                  style={{ marginBottom: '.4rem' }}
                >
                  📎 Upload Logo
                </button>
                <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => set('company_logo', ev.target?.result as string)
                    reader.readAsDataURL(file)
                  }}
                />
                {settings.company_logo && (
                  <button className="btn btn-secondary btn-sm" style={{ color: 'var(--rose)', borderColor: 'var(--rose)', display: 'block' }}
                    onClick={() => set('company_logo', '')}>
                    🗑 Remove
                  </button>
                )}
                <div style={{ fontSize: '.71rem', color: 'var(--text3)', marginTop: '.35rem' }}>PNG, JPG up to 2MB. Appears on invoices & reports.</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1.5rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field k="company_name"    label="Company Name"    placeholder="Alpha Ultimate Ltd." required />
            </div>
            <Field k="company_name_ar"  label="Company Name (Arabic)" placeholder="ألفا أولتيميت المحدودة" />
            <Field k="company_tagline"  label="Tagline / Business Type" placeholder="Construction & Cleaning | KSA" />
            <Field k="company_cr"       label="CR Number (السجل التجاري)" placeholder="1234567890" />
            <Field k="company_vat"      label="VAT Number (الرقم الضريبي)" placeholder="300xxxxxxxxx1003" hint="15-digit VAT number" />
            <div style={{ gridColumn: '1 / -1' }}>
              <Field k="company_address" label="Address" placeholder="Riyadh, Saudi Arabia" />
            </div>
            <Field k="company_address_ar" label="Address (Arabic)" placeholder="الرياض، المملكة العربية السعودية" />
            <Field k="company_city"     label="City" placeholder="Riyadh" />
            <Field k="company_phone"    label="Phone" type="tel"   placeholder="+966 5x xxx xxxx" />
            <Field k="company_fax"      label="Fax (optional)"     placeholder="+966 1x xxx xxxx" />
            <Field k="company_email"    label="Business Email" type="email" placeholder="info@alpha-01.info" />
            <Field k="company_website"  label="Website" type="url" placeholder="https://alpha-01.info" />
            <Field k="company_bank"     label="Bank Name"          placeholder="Al Rajhi Bank" />
            <Field k="company_iban"     label="IBAN"               placeholder="SA00 0000 0000 0000 0000 0000" />
            <div style={{ gridColumn: '1 / -1' }}>
              <Field k="company_footer" label="Invoice Footer Note" placeholder="Thank you for your business!" />
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────── */}
      {/* FINANCE TAB                                        */}
      {/* ─────────────────────────────────────────────────── */}
      {tab === 'Finance' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1.5rem' }}>
            <Select k="currency" label="Default Currency" options={[
              { value: 'SAR', label: 'SAR — Saudi Riyal (ريال)' },
              { value: 'USD', label: 'USD — US Dollar ($)' },
              { value: 'EUR', label: 'EUR — Euro (€)' },
              { value: 'GBP', label: 'GBP — British Pound (£)' },
              { value: 'AED', label: 'AED — UAE Dirham (د.إ)' },
              { value: 'KWD', label: 'KWD — Kuwaiti Dinar (د.ك)' },
              { value: 'QAR', label: 'QAR — Qatari Riyal (ر.ق)' },
              { value: 'BHD', label: 'BHD — Bahraini Dinar (.د.ب)' },
            ]} hint="Used in all invoices, expenses and reports" />
            <Field k="vat_rate"      label="Default VAT Rate (%)"    type="number"  placeholder="15"        hint="Saudi standard VAT is 15%" />
            <Field k="invoice_prefix" label="Invoice Prefix"         placeholder="INV"     hint="e.g. INV-2024-001" />
            <Field k="expense_prefix" label="Expense Prefix"         placeholder="EXP"     hint="e.g. EXP-2024-001" />
            <Field k="invoice_next"   label="Next Invoice Number"    type="number"  placeholder="1001" />
            <Field k="payment_terms"  label="Default Payment Terms"  placeholder="Net 30"  hint="Shown on all invoices" />
            <Select k="fiscal_year" label="Fiscal Year Start" options={[
              'January','February','March','April','May','June',
              'July','August','September','October','November','December'
            ].map(m => ({ value: m, label: m }))} />
            <Select k="date_format" label="Date Format" options={[
              { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (31/12/2024)' },
              { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/31/2024)' },
              { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2024-12-31)' },
            ]} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Field k="bank_account_details" label="Bank Account Details (for invoices)" placeholder="Bank: Al Rajhi | IBAN: SA00..." />
            </div>
          </div>

          <div style={{ marginTop: '.5rem' }}>
            <div style={{ fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '.75rem', paddingBottom: '.4rem', borderBottom: '1px solid var(--border)' }}>
              APPROVAL WORKFLOW
            </div>
            <Toggle k="require_approval_expenses"  label="Require approval for expenses"    hint="All expenses go through approval before booking" />
            <Toggle k="require_approval_invoices"  label="Require approval for invoices"    hint="Invoices need admin sign-off before sending" />
            <Toggle k="auto_approve_low_amount"    label="Auto-approve small amounts"       hint="Skip approval for amounts below threshold" />
            {settings.auto_approve_low_amount === 'true' && (
              <Field k="auto_approve_threshold" label="Auto-approve below (SAR)" type="number" placeholder="500" />
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────── */}
      {/* NOTIFICATIONS TAB                                  */}
      {/* ─────────────────────────────────────────────────── */}
      {tab === 'Notifications' && (
        <div>
          <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
            <strong>SMTP:</strong> smtp.ionos.com:587 · From: erp@alpha-01.info<br />
            Configure <code>SMTP_PASS</code> in your Vercel environment variables.
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '.75rem', paddingBottom: '.4rem', borderBottom: '1px solid var(--border)' }}>EMAIL NOTIFICATIONS</div>
            <Toggle k="notif_email_on_submit"   label="Email on new submission"   hint="Notify approvers when a new record is submitted" />
            <Toggle k="notif_email_on_approve"  label="Email on approval"         hint="Notify submitter when their record is approved" />
            <Toggle k="notif_email_on_reject"   label="Email on rejection"        hint="Notify submitter with reason for rejection" />
            <Toggle k="notif_email_on_salary"   label="Email on salary processing" hint="Notify workers when salary is processed" />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '.75rem', paddingBottom: '.4rem', borderBottom: '1px solid var(--border)' }}>IN-APP NOTIFICATIONS</div>
            <Toggle k="notif_inapp_approvals"   label="In-app approval alerts"    hint="Show notification badge for pending approvals" />
            <Toggle k="notif_inapp_mentions"    label="In-app mentions"           hint="Alert when someone mentions you in a comment" />
            <Toggle k="notif_inapp_deadlines"   label="Project deadline reminders" hint="Remind 3 days before task due dates" />
          </div>

          <div style={{ fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '.75rem', paddingBottom: '.4rem', borderBottom: '1px solid var(--border)' }}>DIGEST</div>
          <Select k="notif_digest" label="Email Digest Frequency" options={[
            { value: 'none',    label: 'Off — no digest emails' },
            { value: 'daily',   label: 'Daily digest' },
            { value: 'weekly',  label: 'Weekly digest' },
          ]} hint="Summary of all activity sent to admin email" />
        </div>
      )}

      {/* ─────────────────────────────────────────────────── */}
      {/* SECURITY TAB                                       */}
      {/* ─────────────────────────────────────────────────── */}
      {tab === 'Security' && (
        <div>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '1rem', paddingBottom: '.4rem', borderBottom: '1px solid var(--border)' }}>
              CHANGE PASSWORD
            </div>
            {passMsg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{passMsg}</div>}
            {passErr && <div className="alert alert-error"  style={{ marginBottom: '1rem' }}>{passErr}</div>}

            <div style={{ marginBottom: '1.1rem' }}>
              <label style={{ display: 'block', fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '.4rem' }}>Current Password</label>
              <div style={{ position: 'relative' }}>
                <input className="input" type={showCur ? 'text' : 'password'} value={curPass}
                  onChange={e => setCurPass(e.target.value)} placeholder="Enter current password"
                  style={{ width: '100%', paddingRight: '2.5rem' }} />
                <button onClick={() => setShowCur(x => !x)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '.85rem' }}>
                  {showCur ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '1.1rem' }}>
              <label style={{ display: 'block', fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '.4rem' }}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input className="input" type={showNew ? 'text' : 'password'} value={newPass}
                  onChange={e => setNewPass(e.target.value)} placeholder="Minimum 8 characters"
                  style={{ width: '100%', paddingRight: '2.5rem' }} />
                <button onClick={() => setShowNew(x => !x)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: '.85rem' }}>
                  {showNew ? '🙈' : '👁'}
                </button>
              </div>
              {/* Strength meter */}
              {newPass && (
                <div style={{ marginTop: '.5rem' }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: '.2rem' }}>
                    {[8, 12, 16, 20].map((threshold, i) => (
                      <div key={i} style={{
                        height: 3, flex: 1, borderRadius: 2,
                        background: newPass.length >= threshold
                          ? i < 2 ? 'var(--amber)' : i < 3 ? 'var(--blue)' : 'var(--green)'
                          : 'var(--border2)',
                        transition: 'background .2s'
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: '.68rem', color: 'var(--text3)' }}>
                    {newPass.length < 8 ? 'Too short' : newPass.length < 12 ? 'Weak' : newPass.length < 16 ? 'Good' : 'Strong'}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '.4rem' }}>Confirm New Password</label>
              <input className="input" type="password" value={confPass}
                onChange={e => setConfPass(e.target.value)} placeholder="Repeat new password"
                style={{ width: '100%', borderColor: confPass && newPass !== confPass ? 'var(--rose)' : '' }} />
              {confPass && newPass !== confPass && (
                <div style={{ fontSize: '.72rem', color: 'var(--rose)', marginTop: '.3rem' }}>Passwords do not match</div>
              )}
            </div>

            <button className="btn btn-primary" onClick={changePassword} disabled={changingPass}>
              {changingPass
                ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Updating…</>
                : '🔒 Change Password'}
            </button>
          </div>

          {isSu && (
            <div>
              <div style={{ fontSize: '.79rem', fontWeight: 600, color: 'var(--text2)', marginBottom: '.75rem', paddingBottom: '.4rem', borderBottom: '1px solid var(--border)' }}>
                SESSION & ACCESS
              </div>
              <Select k="session_timeout" label="Session Timeout" options={[
                { value: '1h',  label: '1 hour' },
                { value: '4h',  label: '4 hours' },
                { value: '8h',  label: '8 hours' },
                { value: '24h', label: '24 hours' },
                { value: '7d',  label: '7 days' },
              ]} hint="Users will be logged out after this period of inactivity" />
              <Toggle k="force_2fa" label="Require 2FA for admins" hint="Superusers must verify via email OTP on login" />
              <Toggle k="ip_whitelist_enabled" label="Enable IP whitelist" hint="Restrict login to specific IP addresses" />
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────── */}
      {/* THEME TAB                                          */}
      {/* ─────────────────────────────────────────────────── */}
      {tab === 'Theme' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            {(['dark', 'light'] as const).map(t => (
              <button
                key={t}
                onClick={() => { if (theme !== t) toggleTheme() }}
                style={{
                  padding: '1.5rem', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
                  border: `2px solid ${theme === t ? 'var(--blue)' : 'var(--border2)'}`,
                  background: theme === t ? 'var(--blue-d)' : 'var(--hover-bg)',
                  color: theme === t ? 'var(--blue-bright)' : 'var(--text2)',
                  fontWeight: 700, fontSize: '.95rem',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.6rem',
                  transition: 'all .16s',
                }}
              >
                <span style={{ fontSize: '2rem' }}>{t === 'dark' ? '🌙' : '☀️'}</span>
                <span>{t === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                {theme === t && <span style={{ fontSize: '.72rem', background: 'var(--blue)', color: '#fff', padding: '.15rem .5rem', borderRadius: 20 }}>Active</span>}
              </button>
            ))}
          </div>

          <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
            Theme preference is stored in your browser. Each user has their own theme setting.
          </div>

          {/* Language card */}
          <div style={{ padding: '1.1rem', background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text)', marginBottom: '.4rem' }}>Interface Language</div>
            <div style={{ fontSize: '.78rem', color: 'var(--text2)', marginBottom: '.85rem' }}>
              Use the <strong>AR / EN</strong> button in the top bar to switch between English and Arabic (RTL support included).
            </div>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <span style={{ padding: '.25rem .75rem', borderRadius: 20, background: 'var(--blue-d)', color: 'var(--blue)', fontSize: '.8rem', fontWeight: 700, border: '1px solid var(--blue)' }}>EN English</span>
              <span style={{ padding: '.25rem .75rem', borderRadius: 20, background: 'var(--hover-bg2)', color: 'var(--text2)', fontSize: '.8rem', fontWeight: 700, border: '1px solid var(--border2)' }}>AR العربية</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
