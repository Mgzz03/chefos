import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import * as api from './api'
import { flushOfflineQueue } from './api'
import { supabase } from './supabase'
import QRCode from 'qrcode'
import './index.css'

// Local desktop build: no cloud login, talk straight to the bundled backend.
const LOCAL = import.meta.env.VITE_LOCAL_MODE === 'true'

// ── Code-split heavy page modules (loaded on first visit) ─
const Recipes        = lazy(() => import('./Kitchen').then(m => ({ default: m.Recipes })))
const Simulate       = lazy(() => import('./Kitchen').then(m => ({ default: m.Simulate })))
const HistoryPage    = lazy(() => import('./Kitchen').then(m => ({ default: m.HistoryPage })))
const AIAssistantPage = lazy(() => import('./Kitchen').then(m => ({ default: m.AIAssistantPage })))
const VendorsPage    = lazy(() => import('./Events').then(m => ({ default: m.VendorsPage })))
const SetupItemsPage = lazy(() => import('./Events').then(m => ({ default: m.SetupItemsPage })))
const EventsPage     = lazy(() => import('./Events').then(m => ({ default: m.EventsPage })))
const ItemsPage      = lazy(() => import('./Items').then(m => ({ default: m.ItemsPage })))
const CookedStockPage = lazy(() => import('./Items').then(m => ({ default: m.CookedStockPage })))
const WastePage      = lazy(() => import('./Items').then(m => ({ default: m.WastePage })))

// ── helpers ───────────────────────────────────────────────
export const uid = () => Math.random().toString(36).slice(2, 10)
export const EGP = (n) => `EGP ${(+n || 0).toFixed(2)}`
export const EGP3 = (n) => `EGP ${(+n || 0).toFixed(3)}`

export function stockStatus(ing) {
    if (!ing || !ing.stock || ing.stock <= 0) return 'out'
    if (ing.stock <= ing.threshold) return 'low'
    return 'ok'
}

export function expiryLabel(dateStr) {
    if (!dateStr) return null
    const d = new Date(dateStr), today = new Date()
    today.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0)
    const days = Math.round((d - today) / 86400000)
    if (days < 0) return { label: 'Expired', cls: 'expiry-expired', status: 'expired' }
    if (days === 0) return { label: 'Expires today!', cls: 'expiry-critical', status: 'critical' }
    if (days <= 3) return { label: `${days}d left`, cls: 'expiry-critical', status: 'critical' }
    if (days <= 7) return { label: `${days}d left`, cls: 'expiry-warning', status: 'warning' }
    return { label: `Exp ${dateStr}`, cls: 'expiry-ok', status: 'ok' }
}

export const CATEGORY_COLORS = [
    '#c8922a', '#ef4444', '#22c55e', '#3b82f6', '#a855f7',
    '#f97316', '#06b6d4', '#eab308', '#ec4899', '#14b8a6'
]

export function Modal({ onClose, children, wide }) {
    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className={`modal${wide ? ' modal-wide' : ''}`}>{children}</div>
        </div>
    )
}

export function CatBadge({ name, color }) {
    return (
        <span className="cat-chip" style={{ background: (color || '#888') + '22', borderColor: (color || '#888') + '55', color: color || '#888' }}>
            <span className="cat-dot" style={{ background: color || '#888' }} />
            {name || 'Uncategorised'}
        </span>
    )
}

// ── Nav ───────────────────────────────────────────────────
const NAV = [
    {
        label: 'Overview', items: [
            { id: 'dashboard', icon: '⬡', label: 'Dashboard' },
            { id: 'ai', icon: '✦', label: 'AI Assistant' },
        ]
    },
    {
        label: 'Kitchen', items: [
            { id: 'recipes', icon: '📋', label: 'Recipes' },
            { id: 'items', icon: '🍰', label: 'Items' },
            { id: 'simulate', icon: '⚗', label: 'Simulate' },
            { id: 'cooked-stock', icon: '🧊', label: 'Cooked Stock' },
            { id: 'history', icon: '📜', label: 'Cook History' },
            { id: 'waste', icon: '♻', label: 'Waste Log' },
        ]
    },
    {
        label: 'Inventory', items: [
            { id: 'inventory', icon: '📦', label: 'Inventory' },
            { id: 'ingredients', icon: '🥦', label: 'Ingredients' },
            { id: 'categories', icon: '🏷', label: 'Categories' },
        ]
    },
    {
        label: 'Events', items: [
            { id: 'events', icon: '🎉', label: 'Events' },
            { id: 'setup', icon: '🪑', label: 'Setup Items' },
            { id: 'vendors', icon: '🏢', label: 'Vendors' },
        ]
    },
    {
        label: 'System', items: [
            { id: 'settings', icon: '⚙', label: 'Settings' },
        ]
    },
]

// ─────────────────────────────────────────────────────────
// LOGIN SCREEN  (Supabase Auth)
// ─────────────────────────────────────────────────────────
function LoginScreen() {
    const [mode, setMode]         = useState('login')   // 'login' | 'signup' | 'forgot'
    const [email, setEmail]       = useState('')
    const [password, setPassword] = useState('')
    const [error, setError]       = useState('')
    const [info, setInfo]         = useState('')
    const [busy, setBusy]         = useState(false)

    const submit = async () => {
        if (!email || (mode !== 'forgot' && !password)) {
            setError('Please fill in all fields'); return
        }
        setBusy(true); setError(''); setInfo('')
        try {
            if (mode === 'login') {
                const { error: e } = await supabase.auth.signInWithPassword({ email, password })
                if (e) throw e
                // session change triggers App re-render automatically via onAuthStateChange
            } else if (mode === 'signup') {
                const { error: e } = await supabase.auth.signUp({ email, password })
                if (e) throw e
                setInfo('Account created! Check your email to confirm, then sign in.')
                setMode('login')
            } else {
                const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin,
                })
                if (e) throw e
                setInfo('Password reset email sent. Check your inbox.')
                setMode('login')
            }
        } catch (e) {
            setError(e.message || 'Something went wrong')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--sans)'
        }}>
            <div style={{
                background: 'var(--bg-soft)', border: '1px solid var(--line)',
                borderRadius: 'var(--r-xl)', padding: '44px 40px',
                maxWidth: '420px', width: '100%', boxShadow: 'var(--shadow-4)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ fontSize: 48, marginBottom: 8 }}>🍳</div>
                    <div style={{ fontFamily: 'var(--serif)', fontSize: 36, fontWeight: 600, color: 'var(--espresso)', lineHeight: 1 }}>ChefOS</div>
                    <div style={{ color: 'var(--ink-mute)', fontSize: 12, marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Kitchen Intelligence System</div>
                </div>

                {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}
                {info  && <div style={{ background: 'var(--success-bg,#d1fae5)', color: 'var(--success,#065f46)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{info}</div>}

                <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" placeholder="your@email.com" value={email}
                        onChange={e => setEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submit()}
                        autoFocus />
                </div>

                {mode !== 'forgot' && (
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input className="form-input" type="password" placeholder="••••••••" value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && submit()} />
                    </div>
                )}

                <button className="btn btn-primary" style={{ width: '100%', padding: '13px', fontSize: 15, marginTop: 8 }}
                    onClick={submit} disabled={busy}>
                    {busy ? 'Please wait…' : mode === 'login' ? 'Sign In →' : mode === 'signup' ? 'Create Account →' : 'Send Reset Email →'}
                </button>

                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 16, fontSize: 13, color: 'var(--ink-mute)' }}>
                    {mode !== 'login'   && <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setMode('login');  setError('') }}>Sign in</span>}
                    {mode !== 'signup'  && <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setMode('signup'); setError('') }}>Create account</span>}
                    {mode !== 'forgot'  && <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setMode('forgot'); setError('') }}>Forgot password</span>}
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────
// ACTIVATION SCREEN (local desktop license gate)
// ─────────────────────────────────────────────────────────
function ActivationScreen({ onActivated, info }) {
    const [key, setKey]     = useState('')
    const [busy, setBusy]   = useState(false)
    const [error, setError] = useState('')

    const formatKey = (v) => {
        let s = v.toUpperCase().replace(/[^A-Z0-9]/g, '')
        if (s.startsWith('CHEF')) s = s.slice(4)
        s = s.slice(0, 12)
        const groups = s.match(/.{1,4}/g) || []
        return s.length ? 'CHEF-' + groups.join('-') : ''
    }

    const submit = async (e) => {
        e.preventDefault()
        setError(''); setBusy(true)
        try {
            const { data } = await api.activateLicense(key)
            if (data.ok) onActivated(data)
            else setError(data.error || 'Activation failed')
        } catch (err) {
            setError('Could not reach the app service. Please try again.')
        }
        setBusy(false)
    }

    const reason = info && info.reason
    const notice = reason === 'expired'      ? 'Your license has expired. Enter a renewed key to continue.'
                 : reason === 'revoked'      ? 'This license is no longer active. Please contact support.'
                 : reason === 'invalid_or_moved' ? 'This install is on a new device. Please re-enter your license key.'
                 : reason === 'needs_reverification' ? 'Please reconnect to the internet to re-verify your license.'
                 : null

    const C = { cream: '#FAF7E7', espresso: '#2E1A0E', ruby: '#6C0B25', gold: '#c8922a', line: '#e3dcc4', mute: '#7a6f5a' }

    return (
        <div style={{ minHeight: '100vh', background: C.cream, color: C.espresso,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'Inter, system-ui, sans-serif', padding: 20 }}>
            <form onSubmit={submit} style={{ width: 420, maxWidth: '100%', background: '#fff',
                      border: `1px solid ${C.line}`, borderRadius: 18, padding: '38px 36px',
                      boxShadow: '0 24px 60px rgba(46,26,14,.12)', textAlign: 'center' }}>
                <div style={{ fontSize: 46, lineHeight: 1 }}>👨‍🍳</div>
                <h1 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 38,
                             margin: '10px 0 2px', color: C.espresso, letterSpacing: .5 }}>ChefOS</h1>
                <p style={{ margin: '0 0 22px', color: C.mute, fontSize: 14 }}>Activate this device to begin</p>

                {notice && (
                    <div style={{ background: '#fbf1e0', border: `1px solid ${C.gold}`, color: '#7a5a16',
                                  borderRadius: 10, padding: '9px 12px', fontSize: 13, marginBottom: 16 }}>{notice}</div>
                )}

                <label style={{ display: 'block', textAlign: 'left', fontSize: 12, color: C.mute,
                                textTransform: 'uppercase', letterSpacing: .6, marginBottom: 6 }}>License key</label>
                <input
                    autoFocus
                    value={key}
                    onChange={(e) => setKey(formatKey(e.target.value))}
                    placeholder="CHEF-XXXX-XXXX-XXXX"
                    spellCheck={false}
                    style={{ width: '100%', padding: '13px 14px', borderRadius: 10, fontSize: 18,
                             letterSpacing: 2, textAlign: 'center', fontFamily: 'ui-monospace, Consolas, monospace',
                             border: `1.5px solid ${error ? C.ruby : C.line}`, background: C.cream,
                             color: C.espresso, outline: 'none' }}
                />

                {error && <div style={{ color: C.ruby, fontSize: 13, marginTop: 12 }}>{error}</div>}

                <button type="submit" disabled={busy || key.length < 19}
                    style={{ width: '100%', marginTop: 20, padding: '13px', borderRadius: 10, border: 'none',
                             background: busy || key.length < 19 ? '#c9a9b1' : C.ruby, color: '#fff',
                             fontSize: 15, fontWeight: 700, cursor: busy || key.length < 19 ? 'default' : 'pointer' }}>
                    {busy ? 'Activating…' : 'Activate'}
                </button>

                <p style={{ marginTop: 22, marginBottom: 0, fontSize: 12, color: C.mute }}>
                    Contact support to get your license key.
                </p>
            </form>
        </div>
    )
}

// ─────────────────────────────────────────────────────────
// SETTINGS PAGE  (License now; Mobile Access + Backups added in later steps)
// ─────────────────────────────────────────────────────────
function SettingsPage({ licenseInfo, onDeactivate, onReload }) {
    const [info, setInfo] = useState(licenseInfo || {})
    const [mobile, setMobile] = useState(null)
    const [qr, setQr] = useState('')
    const [mBusy, setMBusy] = useState(false)
    const [bks, setBks] = useState([])
    const [bMsg, setBMsg] = useState('')
    const fileRef = useRef(null)
    const [gd, setGd] = useState(null)
    const [gdFiles, setGdFiles] = useState([])
    const [gdMsg, setGdMsg] = useState('')
    const [gdBusy, setGdBusy] = useState(false)
    const loadBackups = () => api.listBackups().then(({ data }) => setBks(data.backups || [])).catch(() => {})
    const loadGd = () => api.gdriveStatus().then(({ data }) => setGd(data)).catch(() => {})
    useEffect(() => {
        let alive = true
        api.getLicenseStatus().then(({ data }) => { if (alive) setInfo(data) }).catch(() => {})
        api.getMobileStatus().then(({ data }) => { if (alive) setMobile(data) }).catch(() => {})
        loadBackups()
        loadGd()
        return () => { alive = false }
    }, [])

    const gdConnect = async () => {
        setGdBusy(true); setGdMsg('Opening Google sign-in in your browser…')
        try { const { data } = await api.gdriveConnect(); setGdMsg(data.ok ? '✓ Connected' : `Error: ${data.error}`); if (data.ok) loadGd() }
        catch { setGdMsg('Connection failed or timed out.') }
        setGdBusy(false)
    }
    const gdDisconnect = async () => {
        if (!window.confirm('Disconnect Google Drive? Your existing cloud backups stay in your Drive.')) return
        await api.gdriveDisconnect().catch(() => {}); setGdFiles([]); setGdMsg(''); loadGd()
    }
    const gdBackup = async () => {
        setGdBusy(true); setGdMsg('Uploading backup to Google Drive…')
        try { const { data } = await api.gdriveBackupNow(); setGdMsg(data.ok ? '✓ Backed up to Google Drive' : `Error: ${data.error}`); if (data.ok) loadGd() }
        catch { setGdMsg('Backup failed.') }
        setGdBusy(false)
    }
    const gdLoadFiles = async () => {
        setGdMsg('Loading cloud backups…')
        try { const { data } = await api.gdriveList(); if (data.ok) { setGdFiles(data.files || []); setGdMsg(data.files && data.files.length ? '' : 'No cloud backups yet.') } else setGdMsg(`Error: ${data.error}`) }
        catch { setGdMsg('Could not list Drive backups.') }
    }
    const gdRestore = async (id, name) => {
        if (!window.confirm(`This will replace ALL current data with "${name}" from Google Drive. This cannot be undone.\n\nContinue?`)) return
        setGdBusy(true); setGdMsg('Downloading & restoring…')
        try { const { data } = await api.gdriveRestore(id); if (data.ok) { setGdMsg('✓ Restored. Reloading…'); await onReload(); loadBackups(); setGdMsg('✓ Restore complete.') } else setGdMsg(`Error: ${data.error}`) }
        catch { setGdMsg('Restore failed.') }
        setGdBusy(false)
    }
    const fmtDT = (u) => u ? new Date(u * 1000).toLocaleString() : 'never'

    const fileToB64 = (file) => new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result).split(',')[1])
        r.onerror = rej
        r.readAsDataURL(file)
    })
    const doExport = async () => {
        setBMsg('Exporting…')
        try { const { data } = await api.exportBackup(); setBMsg(data.ok ? `✓ Saved to ${data.path}` : `Error: ${data.error}`) }
        catch { setBMsg('Export failed.') }
    }
    const doRestore = async (name, label) => {
        if (!window.confirm(`This will replace ALL current data with the backup from ${label}. This cannot be undone.\n\nContinue?`)) return
        setBMsg('Restoring…')
        try {
            const { data } = await api.restoreBackup(name)
            if (data.ok) { setBMsg('✓ Restored. Reloading…'); await onReload(); loadBackups(); setBMsg('✓ Restore complete.') }
            else setBMsg(`Error: ${data.error}`)
        } catch { setBMsg('Restore failed.') }
    }
    const doRestoreFile = async (e) => {
        const file = e.target.files[0]; if (!file) return
        if (!window.confirm(`This will replace ALL current data with "${file.name}". This cannot be undone.\n\nContinue?`)) { e.target.value = ''; return }
        setBMsg('Restoring…')
        try {
            const b64 = await fileToB64(file)
            const { data } = await api.restoreUpload(b64)
            if (data.ok) { setBMsg('✓ Restored. Reloading…'); await onReload(); loadBackups(); setBMsg('✓ Restore complete.') }
            else setBMsg(`Error: ${data.error}`)
        } catch { setBMsg('Restore failed.') }
        e.target.value = ''
    }
    useEffect(() => {
        if (mobile && mobile.enabled && mobile.url) {
            QRCode.toDataURL(mobile.url, { margin: 1, width: 210 }).then(setQr).catch(() => setQr(''))
        } else setQr('')
    }, [mobile])
    const flipMobile = async () => {
        setMBusy(true)
        try { const { data } = await api.toggleMobile(!(mobile && mobile.enabled)); setMobile(data) }
        catch (e) { console.error(e) }
        setMBusy(false)
    }
    const fmt = (u) => u ? new Date(u * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
    const Row = ({ label, value }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--line, #e3dcc4)' }}>
            <span style={{ color: 'var(--ink-mute, #7a6f5a)' }}>{label}</span>
            <span style={{ fontWeight: 600 }}>{value}</span>
        </div>
    )
    return (
        <div style={{ maxWidth: 640 }}>
            <div className="card" style={{ padding: 24 }}>
                <h3 style={{ marginTop: 0, marginBottom: 8 }}>License &amp; Activation</h3>
                <Row label="Status" value={info.activated ? 'Activated ✓' : 'Not activated'} />
                {info.chef_name ? <Row label="Licensed to" value={info.chef_name} /> : null}
                <Row label="This device ID" value={(info.fingerprint || '').slice(0, 12) + '…'} />
                <Row label="Last verified" value={fmt(info.last_validated)} />
                <Row label="Expires" value={info.expires_at ? fmt(info.expires_at) : 'Never'} />
                <button onClick={onDeactivate}
                    style={{ marginTop: 20, padding: '10px 16px', borderRadius: 9, border: 'none',
                             background: '#6C0B25', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                    Deactivate this device
                </button>
                <p style={{ color: 'var(--ink-mute, #7a6f5a)', fontSize: 12, marginTop: 10, marginBottom: 0 }}>
                    Deactivating frees this license so it can be used on another computer.
                </p>
            </div>

            {/* ── Mobile Access (same-WiFi) ── */}
            <div className="card" style={{ padding: 24, marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <h3 style={{ margin: 0 }}>Mobile Access
                        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-mute, #7a6f5a)', marginLeft: 6 }}>(same WiFi)</span>
                    </h3>
                    <button onClick={flipMobile} disabled={mBusy || !mobile}
                        style={{ padding: '9px 15px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 13,
                                 cursor: mBusy || !mobile ? 'default' : 'pointer',
                                 background: mobile && mobile.enabled ? '#1f7a32' : '#c0b6a0', color: '#fff' }}>
                        {mobile && mobile.enabled ? '● Active — turn off' : '○ Inactive — turn on'}
                    </button>
                </div>

                {mobile && mobile.enabled ? (
                    <div style={{ marginTop: 18, textAlign: 'center' }}>
                        <p style={{ color: 'var(--ink-mute, #7a6f5a)', fontSize: 13, marginTop: 0 }}>
                            On your phone or tablet, scan this code with the camera — or open the address below.
                        </p>
                        {qr && <img src={qr} alt="Scan to open ChefOS" width={210} height={210}
                                    style={{ borderRadius: 12, border: '1px solid var(--line, #e3dcc4)' }} />}
                        <div style={{ marginTop: 12, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 17, fontWeight: 700 }}>
                            {mobile.url}
                        </div>
                        <p style={{ color: 'var(--ink-mute, #7a6f5a)', fontSize: 12, marginTop: 8 }}>
                            Make sure your phone is on the <b>same WiFi network</b> as this computer.
                        </p>
                    </div>
                ) : (
                    <p style={{ color: 'var(--ink-mute, #7a6f5a)', fontSize: 13, marginTop: 12, marginBottom: 0 }}>
                        Turn this on to use ChefOS from your phone or tablet on the same WiFi.
                        While it's off, only this computer can reach your data.
                    </p>
                )}
            </div>

            {/* ── Backups ── */}
            <div className="card" style={{ padding: 24, marginTop: 20 }}>
                <h3 style={{ marginTop: 0, marginBottom: 6 }}>Backups</h3>
                <p style={{ color: 'var(--ink-mute, #7a6f5a)', fontSize: 13, marginTop: 0 }}>
                    A backup is saved automatically every day (the last 30 are kept).
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    <button onClick={doExport}
                        style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: '#6C0B25', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                        Export Backup → Desktop
                    </button>
                    <button onClick={() => fileRef.current && fileRef.current.click()}
                        style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid #6C0B25', background: 'transparent', color: '#6C0B25', fontWeight: 600, cursor: 'pointer' }}>
                        Restore from a .zip file…
                    </button>
                    <input ref={fileRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={doRestoreFile} />
                </div>
                {bMsg && <div style={{ fontSize: 13, padding: '8px 12px', background: 'var(--cream, #faf7e7)', borderRadius: 8, marginBottom: 12, wordBreak: 'break-all' }}>{bMsg}</div>}
                <div style={{ maxHeight: 230, overflow: 'auto' }}>
                    {bks.length === 0
                        ? <p style={{ color: 'var(--ink-mute, #7a6f5a)', fontSize: 13 }}>No backups yet.</p>
                        : bks.map((b) => (
                            <div key={b.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line, #e3dcc4)' }}>
                                <span>{b.date} <span style={{ color: 'var(--ink-mute, #7a6f5a)', fontSize: 12 }}>· {(b.size / 1024).toFixed(0)} KB</span></span>
                                <button onClick={() => doRestore(b.name, b.date)}
                                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line, #e3dcc4)', background: '#efe9d6', color: '#2E1A0E', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                                    Restore
                                </button>
                            </div>
                        ))}
                </div>
            </div>

            {/* ── Cloud Backup (Google Drive) ── */}
            <div className="card" style={{ padding: 24, marginTop: 20, marginBottom: 40 }}>
                <h3 style={{ marginTop: 0, marginBottom: 6 }}>Cloud Backup
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-mute, #7a6f5a)', marginLeft: 6 }}>(Google Drive)</span>
                </h3>

                {gd && !gd.configured ? (
                    <p style={{ color: 'var(--ink-mute, #7a6f5a)', fontSize: 13, marginTop: 0 }}>
                        Google Drive backup isn't set up in this build. (Add your Google OAuth keys at build time — see GOOGLE_DRIVE_SETUP.md.)
                    </p>
                ) : !gd || !gd.connected ? (
                    <>
                        <p style={{ color: 'var(--ink-mute, #7a6f5a)', fontSize: 13, marginTop: 0 }}>
                            Automatically keep a copy of your data in your own Google Drive (last 7 uploads kept).
                        </p>
                        <button onClick={gdConnect} disabled={gdBusy}
                            style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: '#6C0B25', color: '#fff', fontWeight: 600, cursor: gdBusy ? 'default' : 'pointer' }}>
                            Connect Google Drive
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line, #e3dcc4)' }}>
                            <span style={{ color: 'var(--ink-mute, #7a6f5a)' }}>Account</span><span style={{ fontWeight: 600 }}>{gd.email || 'connected'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line, #e3dcc4)' }}>
                            <span style={{ color: 'var(--ink-mute, #7a6f5a)' }}>Last cloud backup</span><span style={{ fontWeight: 600 }}>{fmtDT(gd.last_upload)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                            <button onClick={gdBackup} disabled={gdBusy}
                                style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: '#1f7a32', color: '#fff', fontWeight: 600, cursor: gdBusy ? 'default' : 'pointer' }}>
                                Backup Now
                            </button>
                            <button onClick={gdLoadFiles} disabled={gdBusy}
                                style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid #6C0B25', background: 'transparent', color: '#6C0B25', fontWeight: 600, cursor: gdBusy ? 'default' : 'pointer' }}>
                                Restore from Google Drive…
                            </button>
                            <button onClick={gdDisconnect} disabled={gdBusy}
                                style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid var(--line, #e3dcc4)', background: '#efe9d6', color: '#2E1A0E', fontWeight: 600, cursor: gdBusy ? 'default' : 'pointer' }}>
                                Disconnect
                            </button>
                        </div>
                        {gdFiles.length > 0 && (
                            <div style={{ marginTop: 14, maxHeight: 230, overflow: 'auto' }}>
                                {gdFiles.map((f) => (
                                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line, #e3dcc4)' }}>
                                        <span>{f.name} <span style={{ color: 'var(--ink-mute, #7a6f5a)', fontSize: 12 }}>· {f.size ? (f.size / 1024).toFixed(0) + ' KB' : ''}</span></span>
                                        <button onClick={() => gdRestore(f.id, f.name)}
                                            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line, #e3dcc4)', background: '#efe9d6', color: '#2E1A0E', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                                            Restore
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
                {gdMsg && <div style={{ fontSize: 13, padding: '8px 12px', background: 'var(--cream, #faf7e7)', borderRadius: 8, marginTop: 12, wordBreak: 'break-all' }}>{gdMsg}</div>}
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────
// APP SHELL
// ─────────────────────────────────────────────────────────
export default function App() {
    const [session, setSession]   = useState(null)
    const [authReady, setAuthReady] = useState(false)
    const [online, setOnline]     = useState(navigator.onLine)
    const [syncing, setSyncing]   = useState(false)
    const [queueSize, setQueueSize] = useState(0)
    const [page, setPage] = useState('dashboard')
    const [ingredients, setIngredients] = useState([])
    const [categories, setCategories] = useState([])
    const [recipes, setRecipes] = useState([])
    const [vendors, setVendors] = useState([])
    const [setupItems, setSetupItems] = useState([])
    const [events, setEvents] = useState([])
    const [alerts, setAlerts] = useState([])
    const [items, setItems] = useState([])
    const [wasteLog, setWasteLog] = useState([])
    const [loading, setLoading] = useState(true)
    const [simRecipe, setSimRecipe] = useState(null)
    const [history, setHistory] = useState([])
    // License gate (local desktop only; cloud build is not gated here)
    const [licenseReady, setLicenseReady] = useState(!LOCAL)
    const [licensed, setLicensed]         = useState(!LOCAL)
    const [licenseInfo, setLicenseInfo]   = useState(null)

    const reload = useCallback(async () => {
        try {
            const [ings, cats, recs, vens, setup, evs, itms, wl, alrts] = await Promise.all([
                api.getIngredients(), api.getCategories(), api.getRecipes(),
                api.getVendors(), api.getSetupItems(), api.getEvents(),
                api.getItems(), api.getWaste(), api.getAlerts()
            ])
            setIngredients(ings.data); setCategories(cats.data); setRecipes(recs.data)
            setVendors(vens.data); setSetupItems(setup.data); setEvents(evs.data)
            setItems(itms.data); setWasteLog(wl.data); setAlerts(alrts.data)
        } catch (e) { console.error('Reload error:', e) }
        setLoading(false)
    }, [])

    // ── Auth listener ─────────────────────────────────────
    useEffect(() => {
        if (LOCAL) {
            // Local desktop: no login. Behave as a single signed-in chef.
            setSession({ user: { email: 'Local Chef' } })
            setAuthReady(true)
            return
        }
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session); setAuthReady(true)
        })
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })
        return () => subscription.unsubscribe()
    }, [])

    // ── First load — in local mode wait for the bundled backend to boot ──
    useEffect(() => {
        if (!session) return
        let cancelled = false
        const boot = async () => {
            if (LOCAL) {
                const base = import.meta.env.VITE_API_URL || ''
                for (let i = 0; i < 40 && !cancelled; i++) {
                    try { await fetch(`${base}/health`); break }
                    catch { await new Promise(r => setTimeout(r, 500)) }
                }
                // ── License gate: only load the app if this device is activated ──
                try {
                    const { data } = await api.getLicenseStatus()
                    if (cancelled) return
                    setLicenseInfo(data)
                    setLicensed(!!data.activated)
                    setLicenseReady(true)
                    if (!data.activated) { setLoading(false); return }
                } catch {
                    if (cancelled) return
                    setLicensed(false); setLicenseReady(true); setLoading(false)
                    return
                }
            }
            if (!cancelled) reload()
        }
        boot()
        return () => { cancelled = true }
    }, [session, reload])

    // ── Online / offline + sync queue ─────────────────────
    useEffect(() => {
        const goOnline = async () => {
            setOnline(true)
            setSyncing(true)
            await flushOfflineQueue()
            setSyncing(false)
            setQueueSize(0)
            reload()
        }
        const goOffline = () => setOnline(false)
        window.addEventListener('online',  goOnline)
        window.addEventListener('offline', goOffline)
        return () => {
            window.removeEventListener('online',  goOnline)
            window.removeEventListener('offline', goOffline)
        }
    }, [reload])

    // ── Supabase Realtime — live cross-device sync (cloud only) ─
    useEffect(() => {
        if (LOCAL || !session) return
        let debounce
        const trigger = () => { clearTimeout(debounce); debounce = setTimeout(reload, 600) }

        const channel = supabase
            .channel('chefos-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' },      trigger)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_batches' }, trigger)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' },           trigger)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'events' },            trigger)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'cooked_stock' },      trigger)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'items' },             trigger)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' },        trigger)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'waste_log' },         trigger)
            .subscribe()

        return () => { clearTimeout(debounce); supabase.removeChannel(channel) }
    }, [session, reload])

    const addToHistory = (entry) => setHistory(h => [...h, entry])
    const deleteHistory = (id) => setHistory(h => h.filter(e => e.id !== id))
    const clearAllHistory = () => setHistory([])
    const clearFilteredHistory = (ids) => setHistory(h => h.filter(e => !ids.includes(e.id)))

    const cancelHistory = async (id, action) => {
        const entry = history.find(e => e.id === id)
        if (!entry) return
        if (action === 'delete') { setHistory(h => h.filter(e => e.id !== id)); return }
        if (action === 'restock' && entry.recipeId) {
            try { await api.restockFromCook({ recipe_id: entry.recipeId, scale_factor: entry.scale || 1 }) }
            catch (e) { console.error('Restock failed', e) }
        }
        setHistory(h => h.map(e => e.id === id ? { ...e, status: 'cancelled' } : e))
        await reload()
    }

    const handleLogout = async () => {
        if (LOCAL) return   // local desktop has no login to sign out of
        await supabase.auth.signOut()
        setSession(null)
    }

    const handleActivated = async (info) => {
        setLicensed(true)
        try { const { data } = await api.getLicenseStatus(); setLicenseInfo(data) }
        catch { setLicenseInfo(info) }
        await reload()
    }

    const handleDeactivate = async () => {
        if (!window.confirm('Deactivate ChefOS on this device?\nYou will need your license key to use it here again.')) return
        try { await api.deactivateLicense() } catch (e) { console.error(e) }
        setLicensed(false)
    }

    const dangerAlerts = alerts.filter(a => ['out', 'expired', 'critical'].includes(a.type))
    const wasteCost = wasteLog.reduce((s, w) => s + (w.cost_lost || 0), 0)

    const pageTitles = {
        dashboard: 'Dashboard', ai: 'AI Kitchen Assistant', recipes: 'Recipes', items: 'Items',
        simulate: 'Simulate', 'cooked-stock': 'Cooked Stock',
        history: 'Cook History', waste: 'Waste Log',
        inventory: 'Inventory', ingredients: 'Ingredients', categories: 'Categories',
        events: 'Events', setup: 'Setup Items', vendors: 'Vendors',
        settings: 'Settings',
    }

    // ── Show login if not authenticated ───────────────────
    if (!authReady) return null   // avoid flash while session loads
    if (!session)   return <LoginScreen />
    if (LOCAL && !licenseReady) return null   // checking license
    if (LOCAL && !licensed)     return <ActivationScreen onActivated={handleActivated} info={licenseInfo} />

    return (
        <div className="app-shell">
            {/* SIDEBAR */}
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <div className="logo-mark">
                        <div className="logo-icon">🍳</div>
                        <div className="logo-name">Chef<em>OS</em></div>
                    </div>
                    <div className="logo-tagline">Kitchen Intelligence</div>
                </div>

                <nav className="nav-body">
                    {NAV.map(section => (
                        <div key={section.label} className="nav-section">
                            <span className="nav-section-label">{section.label}</span>
                            {section.items.map(item => (
                                <button key={item.id}
                                    className={`nav-btn${page === item.id ? ' active' : ''}`}
                                    onClick={() => setPage(item.id)}>
                                    <span className="nav-icon">{item.icon}</span>
                                    <span>{item.label}</span>
                                    {item.id === 'waste' && wasteLog.length > 0 && <span className="nav-badge">{wasteLog.length}</span>}
                                    {item.id === 'inventory' && dangerAlerts.length > 0 && <span className="nav-badge">{dangerAlerts.length}</span>}
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className="sidebar-footer">ChefOS v2 · {new Date().getFullYear()}</div>
            </aside>

            {/* MAIN */}
            <div className="main-content">
                <header className="topbar">
                    <div>
                        <div className="topbar-title">{pageTitles[page] || page}</div>
                        <div className="topbar-sub">
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Online / offline indicator */}
                        {syncing && (
                            <div style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite' }} />
                                Syncing…
                            </div>
                        )}
                        {!online && !syncing && (
                            <div style={{ fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 5 }}
                                title="You're offline. Changes are queued and will sync when back online.">
                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} />
                                Offline{queueSize > 0 ? ` · ${queueSize} queued` : ''}
                            </div>
                        )}
                        {online && !syncing && (
                            <div style={{ fontSize: 12, color: 'var(--success,#22c55e)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--success,#22c55e)' }} />
                                Live
                            </div>
                        )}
                        {dangerAlerts.length > 0 && (
                            <div className="alert-pill" onClick={() => setPage('inventory')}>
                                <span className="alert-pill-dot" />
                                {dangerAlerts.length} alert{dangerAlerts.length > 1 ? 's' : ''}
                            </div>
                        )}
                        <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>{session?.user?.email}</div>
                        <button className="btn btn-sm btn-ghost" onClick={handleLogout} style={{ fontSize: 12 }}>Logout</button>
                    </div>
                </header>

                {loading ? (
                    <div className="loading">
                        <div className="loading-spinner" />
                        <span>Loading kitchen data…</span>
                    </div>
                ) : (
                    <Suspense fallback={<div className="loading"><div className="loading-spinner" /><span>Loading…</span></div>}>
                        {page === 'dashboard'    && <Dashboard ingredients={ingredients} recipes={recipes} alerts={alerts} events={events} wasteCost={wasteCost} wasteCount={wasteLog.length} setPage={setPage} />}
                        {page === 'ai'           && <AIAssistantPage ingredients={ingredients} recipes={recipes} items={items} events={events} alerts={alerts} setPage={setPage} setSimRecipe={setSimRecipe} />}
                        {page === 'recipes'      && <Recipes ingredients={ingredients} categories={categories} recipes={recipes} onReload={reload} setPage={setPage} setSimRecipe={setSimRecipe} />}
                        {page === 'items'        && <ItemsPage items={items} recipes={recipes} ingredients={ingredients} onReload={reload} addToHistory={addToHistory} />}
                        {page === 'simulate'     && <Simulate ingredients={ingredients} recipes={recipes} onReload={reload} initialRecipeId={simRecipe} addToHistory={addToHistory} setPage={setPage} />}
                        {page === 'cooked-stock' && <CookedStockPage onReload={reload} />}
                        {page === 'history'      && <HistoryPage history={history} onCancel={cancelHistory} onDelete={deleteHistory} onClearAll={clearAllHistory} onClearFiltered={clearFilteredHistory} />}
                        {page === 'waste'        && <WastePage />}
                        {page === 'inventory'    && <InventoryPage ingredients={ingredients} categories={categories} onReload={reload} />}
                        {page === 'ingredients'  && <IngredientsPage ingredients={ingredients} categories={categories} onReload={reload} />}
                        {page === 'categories'   && <CategoriesPage categories={categories} onReload={reload} />}
                        {page === 'vendors'      && <VendorsPage vendors={vendors} onReload={reload} />}
                        {page === 'setup'        && <SetupItemsPage setupItems={setupItems} vendors={vendors} onReload={reload} />}
                        {page === 'events'       && <EventsPage events={events} recipes={recipes} setupItems={setupItems} ingredients={ingredients} onReload={reload} />}
                        {page === 'settings'     && <SettingsPage licenseInfo={licenseInfo} onDeactivate={handleDeactivate} onReload={reload} />}
                    </Suspense>
                )}
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────
function Dashboard({ ingredients, recipes, alerts, events, wasteCost, wasteCount, setPage }) {
    const calcCost = r => { let t = 0; r.ings?.forEach(ri => { const ing = ingredients.find(i => i.id === ri.id); if (ing) t += ri.qty * ing.cost }); return t }
    const checkStock = r => r.ings?.every(ri => { const ing = ingredients.find(i => i.id === ri.id); return ing && ing.stock >= ri.qty })

    const outCount = alerts.filter(a => a.type === 'out').length
    const lowCount = alerts.filter(a => a.type === 'low').length
    const expiryCount = alerts.filter(a => ['expired', 'critical', 'warning'].includes(a.type)).length
    const upcoming = events.filter(e => e.status === 'planned').length
    const avgCPP = recipes.length ? recipes.reduce((s, r) => s + (calcCost(r) / r.base_yield), 0) / recipes.length : 0

    return (
        <div className="page">
            <div className="dash-hero">
                <div className="dash-hero-greeting">
                    Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},
                    <strong>Chef 👨‍🍳</strong>
                </div>
                <div className="dash-hero-date">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
            </div>

            {(outCount > 0 || expiryCount > 0) && (
                <div style={{ marginBottom: 18 }}>
                    {outCount > 0 && <div className="alert-strip danger"><span>⚠</span><span><b>{outCount} ingredient{outCount > 1 ? 's are' : ' is'} out of stock.</b> Check inventory before service.</span></div>}
                    {expiryCount > 0 && <div className="alert-strip warning"><span>🕐</span><span><b>{expiryCount} batch{expiryCount > 1 ? 'es near' : '  near'} or past expiry.</b> Use FIFO — check inventory.</span></div>}
                </div>
            )}

            <div className="metrics">
                <div className="metric"><div className="metric-icon">📋</div><div className="metric-label">Recipes</div><div className="metric-value">{recipes.length}</div><div className="metric-sub">in library</div></div>
                <div className="metric"><div className="metric-icon">💰</div><div className="metric-label">Avg Cost / Portion</div><div className="metric-value">EGP {avgCPP.toFixed(2)}</div></div>
                <div className={`metric${(outCount + lowCount) > 0 ? ' warn' : ''}`}><div className="metric-icon">📦</div><div className="metric-label">Stock Alerts</div><div className="metric-value">{outCount + lowCount}</div><div className="metric-sub">{outCount} out · {lowCount} low</div></div>
                <div className="metric"><div className="metric-icon">🎉</div><div className="metric-label">Upcoming Events</div><div className="metric-value">{upcoming}</div><div className="metric-sub">planned</div></div>
            </div>

            <div className="two-col">
                <div className="card card-accent">
                    <div className="card-title">Recipes — Cook Status</div>
                    {recipes.slice(0, 5).map(r => {
                        const cost = calcCost(r); const ok = checkStock(r)
                        return (
                            <div className="row" key={r.id}>
                                <div style={{ flex: 1 }}>
                                    <div className="row-name">{r.name}</div>
                                    <div className="row-meta">{r.category} · EGP {(cost / r.base_yield).toFixed(2)}/portion</div>
                                </div>
                                <span style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 13, marginRight: 8 }}>EGP {cost.toFixed(2)}</span>
                                <span className={`badge badge-${ok ? 'ok' : 'out'}`}>{ok ? 'Ready' : 'Low'}</span>
                            </div>
                        )
                    })}
                    {recipes.length === 0 && <div className="empty"><div className="empty-icon">🍽</div><h3>No recipes yet</h3></div>}
                </div>

                <div>
                    <div className="card card-accent" style={{ marginBottom: 14 }}>
                        <div className="card-title">Active Alerts</div>
                        {alerts.length === 0
                            ? <div style={{ color: 'var(--success)', fontSize: 13, padding: '8px 0' }}>✓ All ingredients stocked and fresh</div>
                            : alerts.slice(0, 5).map((a, i) => (
                                <div className="row" key={i} style={{ cursor: 'pointer' }} onClick={() => setPage('inventory')}
                                    title="Click to open Inventory and handle this alert">
                                    <span className={`status-dot dot-${a.type === 'out' || a.type === 'expired' ? 'danger' : a.type === 'critical' ? 'danger' : 'warn'}`} />
                                    <div style={{ flex: 1 }}>
                                        <div className="row-name">{a.ingredient}</div>
                                        <div className="row-meta">
                                            {a.type === 'out' && 'Out of stock — click to restock'}
                                            {a.type === 'low' && `${a.stock} ${a.unit} — below threshold ${a.threshold}`}
                                            {a.type === 'expired' && `Expired: ${a.qty} ${a.unit} — click to handle`}
                                            {a.type === 'critical' && `Critical: expires ${a.expiry} (${a.qty} ${a.unit})`}
                                            {a.type === 'warning' && `Expiry warning: ${a.expiry} (${a.qty} ${a.unit})`}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span className={`badge badge-${a.type === 'low' ? 'low' : a.type === 'warning' ? 'warn' : 'out'}`}>{a.type}</span>
                                        <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>→</span>
                                    </div>
                                </div>
                            ))
                        }
                        {alerts.length > 5 && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8, cursor: 'pointer' }} onClick={() => setPage('inventory')}>View all {alerts.length} alerts →</div>}
                    </div>

                    {wasteCost > 0 && (
                        <div className="card">
                            <div className="card-title">Waste This Period</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 600, color: 'var(--danger)' }}>EGP {wasteCost.toFixed(2)}</div>
                                    <div className="muted">{wasteCount} entries logged</div>
                                </div>
                                <button className="btn btn-sm btn-ghost" onClick={() => setPage('waste')}>View log →</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {events.filter(e => e.status === 'planned').length > 0 && (
                <div className="card" style={{ marginTop: 16 }}>
                    <div className="card-title">Upcoming Events</div>
                    <div className="two-col">
                        {events.filter(e => e.status === 'planned').slice(0, 4).map(ev => (
                            <div className="row" key={ev.id}>
                                <div style={{ flex: 1 }}>
                                    <div className="row-name">{ev.name}</div>
                                    <div className="row-meta">{ev.event_date || 'No date'} · {ev.guest_count} guests</div>
                                </div>
                                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>EGP {ev.total?.toFixed(0)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────
function CategoriesPage({ categories, onReload }) {
    const [modal, setModal] = useState(false)
    const [editing, setEditing] = useState(null)
    const [form, setForm] = useState({ name: '', color: '#c8922a' })
    const [error, setError] = useState('')

    const open = (cat = null) => {
        setEditing(cat)
        setForm(cat ? { name: cat.name, color: cat.color } : { name: '', color: '#c8922a' })
        setError(''); setModal(true)
    }
    const save = async () => {
        if (!form.name.trim()) { setError('Name required'); return }
        try {
            if (editing) await api.updateCategory(editing.id, form)
            else await api.createCategory(form)
            setModal(false); await onReload()
        } catch (e) { setError(e.response?.data?.detail || 'Save failed') }
    }
    const del = async (cat) => {
        if (!window.confirm(`Delete "${cat.name}"? Ingredients using it become uncategorised.`)) return
        try { await api.deleteCategory(cat.id); await onReload() }
        catch (e) { alert(e.response?.data?.detail || 'Cannot delete — ingredients still use this category') }
    }

    return (
        <div className="page">
            <div className="page-header">
                <div><div className="page-title">Categories</div><div className="page-sub">Organise ingredients by type</div></div>
                <button className="btn btn-primary" onClick={() => open()}>+ New Category</button>
            </div>
            <div className="three-col">
                {categories.map(cat => (
                    <div className="card" key={cat.id} style={{ borderTop: `3px solid ${cat.color}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <CatBadge name={cat.name} color={cat.color} />
                            <div className="btn-group">
                                <button className="btn btn-sm" onClick={() => open(cat)}>Edit</button>
                                <button className="btn btn-sm btn-danger" onClick={() => del(cat)}>✕</button>
                            </div>
                        </div>
                        <div className="muted" style={{ marginTop: 8 }}>{cat.ingredient_count} ingredient{cat.ingredient_count !== 1 ? 's' : ''}</div>
                    </div>
                ))}
                {categories.length === 0 && <div style={{ gridColumn: '1/-1' }} className="empty"><div className="empty-icon">📂</div><h3>No categories yet</h3></div>}
            </div>

            {modal && (
                <Modal onClose={() => setModal(false)}>
                    <div className="modal-title">{editing ? 'Edit Category' : 'New Category'}</div>
                    {error && <div className="error-msg">{error}</div>}
                    <div className="form-group">
                        <label className="form-label">Name</label>
                        <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dairy, Vegetables" autoFocus />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Colour</label>
                        <div className="color-swatches">
                            {CATEGORY_COLORS.map(c => (
                                <div key={c} className={`swatch${form.color === c ? ' selected' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />
                            ))}
                        </div>
                        <input className="form-input" style={{ marginTop: 8 }} value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="#hex" />
                        <div style={{ marginTop: 8 }}><CatBadge name={form.name || 'Preview'} color={form.color} /></div>
                    </div>
                    <div className="modal-footer">
                        <button className="btn" onClick={() => setModal(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={save}>Save</button>
                    </div>
                </Modal>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────
// INGREDIENTS
// ─────────────────────────────────────────────────────────
function IngredientsPage({ ingredients, categories, onReload }) {
    const [modal, setModal] = useState(false)
    const [editing, setEditing] = useState(null)
    const [form, setForm] = useState({ name: '', unit: 'g', cost: '', category_id: '', supplier: '', threshold: '' })
    const [newCatName, setNewCatName] = useState('')
    const [creatingCat, setCreatingCat] = useState(false)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [filterCat, setFilterCat] = useState('All')

    const open = (ing = null) => {
        setEditing(ing)
        setForm(ing ? { name: ing.name, unit: ing.unit, cost: ing.cost, category_id: ing.category_id || '', supplier: ing.supplier || '', threshold: ing.threshold }
            : { name: '', unit: 'g', cost: '', category_id: '', supplier: '', threshold: '' })
        setError(''); setNewCatName(''); setCreatingCat(false); setModal(true)
    }
    const createCatInline = async () => {
        if (!newCatName.trim()) return
        try {
            const r = await api.createCategory({ name: newCatName, color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length] })
            await onReload()
            setForm(f => ({ ...f, category_id: r.data.id }))
            setCreatingCat(false); setNewCatName('')
        } catch (e) { alert(e.response?.data?.detail || 'Category already exists') }
    }
    const save = async () => {
        if (!form.name.trim() || !form.cost) { setError('Name and cost are required'); return }
        const payload = { ...form, cost: parseFloat(form.cost), threshold: parseFloat(form.threshold) || 0, category_id: form.category_id || null }
        try {
            if (editing) await api.updateIngredient(editing.id, payload)
            else await api.createIngredient(payload)
            setModal(false); await onReload()
        } catch (e) { setError(e.response?.data?.detail || 'Save failed') }
    }
    const del = async (ing) => {
        if (!window.confirm(`Delete "${ing.name}"? Cannot be undone.`)) return
        try { await api.deleteIngredient(ing.id); await onReload() }
        catch (e) { alert(e.response?.data?.detail || 'Cannot delete — used in recipes') }
    }

    const catNames = ['All', ...Array.from(new Set(ingredients.map(i => i.category_name).filter(Boolean))).sort()]
    const filtered = ingredients
        .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.supplier?.toLowerCase().includes(search.toLowerCase()))
        .filter(i => filterCat === 'All' || i.category_name === filterCat)

    return (
        <div className="page">
            <div className="page-header">
                <div><div className="page-title">Ingredients</div><div className="page-sub">Edit price to update all recipe costs instantly</div></div>
                <button className="btn btn-primary" onClick={() => open()}>+ New Ingredient</button>
            </div>
            <div className="filters">
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                    <div><div className="form-label" style={{ marginBottom: 4 }}>Search</div>
                        <input className="form-input" placeholder="Name or supplier…" value={search} onChange={e => setSearch(e.target.value)} /></div>
                    <div><div className="form-label" style={{ marginBottom: 4 }}>Category</div>
                        <select className="form-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                            {catNames.map(c => <option key={c}>{c}</option>)}</select></div>
                    <div style={{ alignSelf: 'flex-end' }}>
                        {(search || filterCat !== 'All') && <span className="filter-clear" onClick={() => { setSearch(''); setFilterCat('All') }}>✕ Clear</span>}
                    </div>
                </div>
            </div>
            <div className="card">
                {filtered.map(i => {
                    const cat = categories.find(c => c.id === i.category_id)
                    return (
                        <div className="row" key={i.id}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                    <span className="row-name">{i.name}</span>
                                    <CatBadge name={i.category_name} color={cat?.color} />
                                </div>
                                <div className="row-meta">EGP {i.cost.toFixed(4)} per {i.unit}{i.supplier ? ` · ${i.supplier}` : ''}</div>
                            </div>
                            <div className="btn-group">
                                <button className="btn btn-sm" onClick={() => open(i)}>Edit</button>
                                <button className="btn btn-sm btn-danger" onClick={() => del(i)}>✕</button>
                            </div>
                        </div>
                    )
                })}
                {filtered.length === 0 && <div className="empty"><div className="empty-icon">🥦</div><h3>No ingredients found</h3></div>}
            </div>

            {modal && (
                <Modal onClose={() => setModal(false)}>
                    <div className="modal-title">{editing ? 'Edit Ingredient' : 'New Ingredient'}</div>
                    {error && <div className="error-msg">{error}</div>}
                    <div className="form-row">
                        <div className="form-group"><label className="form-label">Name</label>
                            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. 00 Flour" autoFocus /></div>
                        <div className="form-group"><label className="form-label">Unit</label>
                            <select className="form-select" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                                {['g', 'kg', 'ml', 'l', 'piece', 'tbsp', 'tsp', 'pack'].map(u => <option key={u}>{u}</option>)}
                            </select></div>
                    </div>
                    <div className="form-row">
                        <div className="form-group"><label className="form-label">Cost per unit (EGP)</label>
                            <input className="form-input" type="number" step="0.0001" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} placeholder="0.0012" /></div>
                        <div className="form-group"><label className="form-label">Low-stock threshold</label>
                            <input className="form-input" type="number" step="0.01" value={form.threshold} onChange={e => setForm({ ...form, threshold: e.target.value })} /></div>
                    </div>
                    <div className="form-group"><label className="form-label">Supplier (optional)</label>
                        <input className="form-input" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
                    <div className="form-group">
                        <label className="form-label">Category</label>
                        {!creatingCat ? (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <select className="form-select" style={{ flex: 1 }} value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                                    <option value="">— None —</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <button className="btn btn-sm" onClick={() => setCreatingCat(true)}>+ New</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input className="form-input" style={{ flex: 1 }} value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" autoFocus onKeyDown={e => e.key === 'Enter' && createCatInline()} />
                                <button className="btn btn-primary btn-sm" onClick={createCatInline}>Create</button>
                                <button className="btn btn-sm" onClick={() => setCreatingCat(false)}>Cancel</button>
                            </div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button className="btn" onClick={() => setModal(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={save}>Save Ingredient</button>
                    </div>
                </Modal>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────
// INVENTORY PAGE
// ─────────────────────────────────────────────────────────
function InventoryPage({ ingredients, categories, onReload }) {
    const [restockModal, setRestockModal] = useState(false)
    const [editModal, setEditModal] = useState(null)
    const [restockForm, setRestockForm] = useState({ ingredient_id: '', quantity: '', expiry_date: '', cost_snapshot: '', notes: '' })
    const [editForm, setEditForm] = useState({ stock: '', threshold: '', expiry_date: '', notes: '' })
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [filterCat, setFilterCat] = useState('All')
    const [filterStatus, setFilterStatus] = useState('All')
    const [collapsed, setCollapsed] = useState({})
    const [expiredModal, setExpiredModal] = useState(null)
    const [expiredAction, setExpiredAction] = useState('waste')

    const doRestock = async () => {
        if (!restockForm.ingredient_id || !restockForm.quantity) { setError('Select ingredient and quantity'); return }
        const payload = {
            ingredient_id: restockForm.ingredient_id,
            quantity: parseFloat(restockForm.quantity),
            expiry_date: restockForm.expiry_date || null,
            cost_snapshot: restockForm.cost_snapshot ? parseFloat(restockForm.cost_snapshot) : null,
            notes: restockForm.notes,
        }
        try { await api.restockIng(payload); setRestockModal(false); await onReload() }
        catch (e) { setError(e.response?.data?.detail || 'Restock failed') }
    }

    const openEdit = (ing) => {
        setEditModal(ing)
        setEditForm({ stock: ing.stock?.toString() || '0', threshold: ing.threshold?.toString() || '0', expiry_date: '', notes: '' })
        setError('')
    }

    const saveEdit = async () => {
        const stockVal = parseFloat(editForm.stock), thresholdVal = parseFloat(editForm.threshold)
        if (isNaN(stockVal) || stockVal < 0) { setError('Enter a valid stock quantity'); return }
        if (isNaN(thresholdVal) || thresholdVal < 0) { setError('Enter a valid threshold'); return }
        try {
            await api.updateInventory(editModal.id, { stock: stockVal, threshold: thresholdVal })
            if (editForm.expiry_date && editModal.batches?.length > 0) {
                const newest = [...editModal.batches].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0]
                if (newest) await api.updateBatch(newest.id, { expiry_date: editForm.expiry_date, notes: editForm.notes || newest.notes })
            }
            setEditModal(null); await onReload()
        } catch (e) { setError('Update failed') }
    }

    const removeAll = async (ing) => {
        if (!window.confirm(`Set ALL stock of "${ing.name}" to 0?`)) return
        try { await api.updateInventory(ing.id, { stock: 0, threshold: ing.threshold }); await onReload() } catch (e) { alert('Failed') }
    }

    const doExpiredAction = async () => {
        const { batch } = expiredModal
        try {
            if (expiredAction === 'waste') await api.wasteIngBatch(batch.id, { reason: 'expired' })
            else await api.deleteBatch(batch.id)
            setExpiredModal(null); await onReload()
        } catch (e) { alert(e.response?.data?.detail || 'Action failed') }
    }

    const removeBatch = async (batch, ing) => {
        const exp = expiryLabel(batch.expiry_date)
        if (exp?.status === 'expired') { setExpiredModal({ batch, ing }); setExpiredAction('waste'); return }
        if (!window.confirm(`Remove batch of ${batch.quantity.toFixed(1)} ${ing.unit} from ${ing.name}?`)) return
        try { await api.deleteBatch(batch.id); await onReload() } catch (e) { alert('Failed') }
    }

    const catNames = ['All', ...Array.from(new Set(ingredients.map(i => i.category_name).filter(Boolean))).sort()]
    const filtered = ingredients
        .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
        .filter(i => filterCat === 'All' || i.category_name === filterCat)
        .filter(i => {
            if (filterStatus === 'All') return true
            const s = stockStatus(i)
            if (filterStatus === 'OK') return s === 'ok'
            if (filterStatus === 'Low') return s === 'low'
            if (filterStatus === 'Out') return s === 'out'
            if (filterStatus === 'Expiring') return i.batches?.some(b => ['critical', 'warning', 'expired'].includes(expiryLabel(b.expiry_date)?.status))
            return true
        })

    const grouped = {}
    filtered.forEach(i => { const k = i.category_name || 'Uncategorised'; if (!grouped[k]) grouped[k] = []; grouped[k].push(i) })
    const catColor = n => categories.find(c => c.name === n)?.color || '#888'
    const toggle = k => setCollapsed(c => ({ ...c, [k]: !c[k] }))

    return (
        <div className="page">
            <div className="page-header">
                <div><div className="page-title">Inventory</div><div className="page-sub">Grouped by category · FIFO expiry tracking</div></div>
                <button className="btn btn-primary" onClick={() => { setRestockForm({ ingredient_id: '', quantity: '', expiry_date: '', cost_snapshot: '', notes: '' }); setError(''); setRestockModal(true) }}>+ Restock</button>
            </div>

            <div className="filters">
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
                    <div><div className="form-label" style={{ marginBottom: 4 }}>Search</div>
                        <input className="form-input" placeholder="Type to search…" value={search} onChange={e => setSearch(e.target.value)} /></div>
                    <div><div className="form-label" style={{ marginBottom: 4 }}>Category</div>
                        <select className="form-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                            {catNames.map(c => <option key={c}>{c}</option>)}</select></div>
                    <div><div className="form-label" style={{ marginBottom: 4 }}>Status</div>
                        <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option>All</option><option>OK</option><option>Low</option><option>Out</option><option>Expiring</option>
                        </select></div>
                    <div style={{ alignSelf: 'flex-end' }}>
                        {(search || filterCat !== 'All' || filterStatus !== 'All') &&
                            <span className="filter-clear" onClick={() => { setSearch(''); setFilterCat('All'); setFilterStatus('All') }}>✕ Clear</span>}
                    </div>
                </div>
            </div>

            {Object.entries(grouped).map(([catName, ings]) => {
                const color = catColor(catName), isOpen = !collapsed[catName]
                const outs = ings.filter(i => stockStatus(i) === 'out').length
                const lows = ings.filter(i => stockStatus(i) === 'low').length
                const expired = ings.filter(i => i.batches?.some(b => expiryLabel(b.expiry_date)?.status === 'expired')).length
                return (
                    <div key={catName} style={{ marginBottom: 8 }}>
                        <div className="collapse-header" onClick={() => toggle(catName)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ fontWeight: 600, fontSize: 14 }}>{catName}</span>
                                <span className="muted">({ings.length})</span>
                                {outs > 0 && <span className="badge badge-out">{outs} out</span>}
                                {lows > 0 && <span className="badge badge-low">{lows} low</span>}
                                {expired > 0 && <span className="badge badge-expired">⚠ {expired} expired</span>}
                            </div>
                            <span className={`collapse-arrow${isOpen ? ' open' : ''}`}>▶</span>
                        </div>

                        {isOpen && (
                            <div className="collapse-body" style={{ maxHeight: '9999px' }}>
                                {ings.map(i => {
                                    const s = stockStatus(i)
                                    const max = Math.max(i.threshold * 4, i.stock * 1.2, 100)
                                    const pct = Math.min(100, (i.stock / max) * 100)
                                    const hasExpired = i.batches?.some(b => expiryLabel(b.expiry_date)?.status === 'expired')
                                    const hasExpiring = i.batches?.some(b => ['critical', 'warning'].includes(expiryLabel(b.expiry_date)?.status))
                                    return (
                                        <div key={i.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                                            {hasExpired && (
                                                <div className="alert-strip danger" style={{ marginBottom: 8, padding: '8px 12px', fontSize: 12 }}>
                                                    <span>⚠</span><span><b>Expired batch detected.</b> Cannot be used. Please remove or log as waste.</span>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <div style={{ flex: 1 }}>
                                                    <span className="row-name">{i.name}</span>
                                                    <span className={`badge badge-${s === 'ok' ? 'ok' : s === 'low' ? 'low' : 'out'}`} style={{ marginLeft: 8 }}>
                                                        {s === 'ok' ? 'OK' : s === 'low' ? 'Low' : 'OUT'}
                                                    </span>
                                                    {hasExpired && <span className="badge badge-expired" style={{ marginLeft: 4 }}>EXPIRED</span>}
                                                    {!hasExpired && hasExpiring && <span className="badge badge-critical" style={{ marginLeft: 4 }}>⚠ Expiry</span>}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span className="muted" style={{ marginRight: 4 }}>{i.stock?.toFixed(1)} {i.unit}</span>
                                                    <button className="btn btn-sm" onClick={() => openEdit(i)}>✏ Edit</button>
                                                    <button className="btn btn-sm btn-danger" onClick={() => removeAll(i)}>✕ All</button>
                                                </div>
                                            </div>
                                            <div className="stock-wrap"><div className={`stock-bar bar-${s}`} style={{ width: `${pct}%` }} /></div>
                                            <div className="muted" style={{ marginTop: 3 }}>threshold {i.threshold} {i.unit} · EGP {i.cost}/{i.unit}</div>
                                            {i.batches?.length > 0 && (
                                                <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--line)' }}>
                                                    {i.batches.map(b => {
                                                        const exp = expiryLabel(b.expiry_date), isExpd = exp?.status === 'expired'
                                                        return (
                                                            <div key={b.id} style={{
                                                                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-mute)', padding: '4px 0',
                                                                background: isExpd ? 'var(--danger-bg)' : 'transparent', borderRadius: isExpd ? 4 : 0, paddingLeft: isExpd ? 8 : 0
                                                            }}>
                                                                <span>Batch: <b>{b.quantity?.toFixed(1)} {i.unit}</b></span>
                                                                {exp ? <span className={exp.cls}>{exp.label}</span> : <span className="muted">No expiry set</span>}
                                                                {b.cost_snapshot && <span>@ EGP {b.cost_snapshot}/{i.unit}</span>}
                                                                {b.notes && <span className="muted">· {b.notes}</span>}
                                                                {isExpd ? (
                                                                    <button className="btn btn-sm btn-danger" style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto' }}
                                                                        onClick={() => { setExpiredModal({ batch: b, ing: i }); setExpiredAction('waste') }}>
                                                                        ⚠ Handle
                                                                    </button>
                                                                ) : (
                                                                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', fontSize: 11, padding: '2px 6px', marginLeft: 'auto' }}
                                                                        onClick={() => removeBatch(b, i)}>Remove</button>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )
            })}
            {Object.keys(grouped).length === 0 && <div className="empty"><div className="empty-icon">📦</div><h3>No inventory matches your filters</h3></div>}

            {editModal && (
                <Modal onClose={() => setEditModal(null)}>
                    <div className="modal-title">Edit — {editModal.name}</div>
                    {error && <div className="error-msg">{error}</div>}
                    <div style={{ background: 'var(--bg-hover)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                        Current stock: <b>{editModal.stock} {editModal.unit}</b> across {editModal.batches?.length || 0} batch(es)
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Total stock ({editModal.unit})</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button className="btn btn-sm" onClick={() => setEditForm(f => ({ ...f, stock: String(Math.max(0, parseFloat(f.stock || 0) - 1)) }))}>−</button>
                                <input className="form-input" type="number" min="0" step="0.01" value={editForm.stock}
                                    onChange={e => setEditForm(f => ({ ...f, stock: e.target.value }))} style={{ textAlign: 'center', fontSize: 16, fontWeight: 600 }} autoFocus
                                    onFocus={e => e.target.select()} />
                                <button className="btn btn-sm" onClick={() => setEditForm(f => ({ ...f, stock: String(parseFloat(f.stock || 0) + 1) }))}>+</button>
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                                {[0, 25, 50, 100, 200, 500, 1000].map(v => (
                                    <button key={v} className="btn btn-sm" onClick={() => setEditForm(f => ({ ...f, stock: String(v) }))}>{v}</button>
                                ))}
                            </div>
                            <div className="muted" style={{ marginTop: 6 }}>⚠ Replaces all batches with one adjusted batch.</div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Low-stock threshold ({editModal.unit})</label>
                            <input className="form-input" type="number" min="0" step="0.01" value={editForm.threshold}
                                onChange={e => setEditForm(f => ({ ...f, threshold: e.target.value }))} />
                            <div className="muted" style={{ marginTop: 4 }}>Alert fires when stock drops below this.</div>
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Expiry date for batch (optional)</label>
                            <input className="form-input" type="date" value={editForm.expiry_date}
                                onChange={e => setEditForm(f => ({ ...f, expiry_date: e.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Batch notes (optional)</label>
                            <input className="form-input" value={editForm.notes}
                                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Fresh delivery" />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button className="btn" onClick={() => setEditModal(null)}>Cancel</button>
                        <button className="btn btn-danger" onClick={() => { setEditForm(f => ({ ...f, stock: '0' })); setTimeout(saveEdit, 50) }}>Set to 0</button>
                        <button className="btn btn-primary" onClick={saveEdit}>Save Changes</button>
                    </div>
                </Modal>
            )}

            {expiredModal && (
                <Modal onClose={() => setExpiredModal(null)}>
                    <div className="modal-title">Expired Batch — {expiredModal.ing.name}</div>
                    <div className="alert-strip danger" style={{ marginBottom: 14 }}>
                        ⚠ Expired on <b>{expiredModal.batch.expiry_date}</b>. Cannot be used.
                    </div>
                    <div className="form-group">
                        <label className="form-label">How to handle?</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                            {[['waste', '🗑 Log as waste', 'Records cost as lost in Waste Log'],
                            ['delete', '❌ Remove silently', 'Removes without logging']].map(([val, label, desc]) => (
                                <label key={val} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                                    border: `1px solid ${expiredAction === val ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, cursor: 'pointer',
                                    background: expiredAction === val ? 'var(--accent-soft)' : 'var(--bg-card)'
                                }}>
                                    <input type="radio" value={val} checked={expiredAction === val} onChange={() => setExpiredAction(val)} style={{ marginTop: 2 }} />
                                    <div><div style={{ fontWeight: 500, fontSize: 13 }}>{label}</div><div className="muted">{desc}</div></div>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button className="btn" onClick={() => setExpiredModal(null)}>Cancel</button>
                        <button className="btn btn-danger" onClick={doExpiredAction}>Confirm</button>
                    </div>
                </Modal>
            )}

            {restockModal && (
                <Modal onClose={() => setRestockModal(false)}>
                    <div className="modal-title">Restock Ingredient</div>
                    {error && <div className="error-msg">{error}</div>}
                    <div className="form-group">
                        <label className="form-label">Ingredient</label>
                        <select className="form-select" value={restockForm.ingredient_id}
                            onChange={e => setRestockForm({ ...restockForm, ingredient_id: e.target.value })}>
                            <option value="">— select —</option>
                            {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} (currently {i.stock} {i.unit})</option>)}
                        </select>
                    </div>
                    <div className="form-row">
                        <div className="form-group"><label className="form-label">Quantity to add</label>
                            <input className="form-input" type="number" step="0.01" value={restockForm.quantity}
                                onChange={e => setRestockForm({ ...restockForm, quantity: e.target.value })} /></div>
                        <div className="form-group"><label className="form-label">Unit cost EGP (optional)</label>
                            <input className="form-input" type="number" step="0.0001" value={restockForm.cost_snapshot}
                                onChange={e => setRestockForm({ ...restockForm, cost_snapshot: e.target.value })} placeholder="leave blank to keep" /></div>
                    </div>
                    <div className="form-row">
                        <div className="form-group"><label className="form-label">Expiry date (optional)</label>
                            <input className="form-input" type="date" value={restockForm.expiry_date}
                                onChange={e => setRestockForm({ ...restockForm, expiry_date: e.target.value })} /></div>
                        <div className="form-group"><label className="form-label">Notes (optional)</label>
                            <input className="form-input" value={restockForm.notes}
                                onChange={e => setRestockForm({ ...restockForm, notes: e.target.value })} placeholder="e.g. Batch #A12" /></div>
                    </div>
                    <div className="modal-footer">
                        <button className="btn" onClick={() => setRestockModal(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={doRestock}>Restock</button>
                    </div>
                </Modal>
            )}
        </div>
    )
}