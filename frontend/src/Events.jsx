import { useState } from 'react'
import * as api from './api'
import { Modal, uid } from './App'

// ─────────────────────────────────────────────────────────
// VENDORS
// ─────────────────────────────────────────────────────────
export function VendorsPage({ vendors, onReload }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name:'', contact_name:'', phone:'', email:'', notes:'' })
  const [error, setError] = useState('')

  const open = (v=null) => {
    setEditing(v)
    setForm(v ? { name:v.name, contact_name:v.contact_name, phone:v.phone, email:v.email, notes:v.notes }
               : { name:'', contact_name:'', phone:'', email:'', notes:'' })
    setError(''); setModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    try {
      if (editing) await api.updateVendor(editing.id, form)
      else await api.createVendor(form)
      setModal(false); await onReload()
    } catch(e) { setError(e.response?.data?.detail || 'Save failed') }
  }

  const del = async (v) => {
    if (!window.confirm(`Delete vendor "${v.name}"? This cannot be undone.`)) return
    try { await api.deleteVendor(v.id); await onReload() }
    catch(e) { alert(e.response?.data?.detail || 'Delete failed') }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Vendors</div><div className="page-sub">Suppliers for setup items and equipment</div></div>
        <button className="btn btn-primary" onClick={() => open()}>+ New Vendor</button>
      </div>

      {vendors.length === 0 && (
        <div className="empty"><div className="empty-icon">🏢</div>No vendors yet. Add suppliers for your setup items.</div>
      )}

      <div className="three-col">
        {vendors.map(v => (
          <div className="card" key={v.id}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700}}>{v.name}</div>
              <div className="btn-group">
                <button className="btn btn-sm" onClick={() => open(v)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => del(v)}>✕</button>
              </div>
            </div>
            {v.contact_name && <div className="row-meta">👤 {v.contact_name}</div>}
            {v.phone && <div className="row-meta">📞 {v.phone}</div>}
            {v.email && <div className="row-meta">✉ {v.email}</div>}
            {v.notes && <div className="muted" style={{marginTop:6,fontStyle:'italic'}}>{v.notes}</div>}
          </div>
        ))}
      </div>

      {modal && (
        <Modal onClose={() => setModal(false)}>
          <div className="modal-title">{editing ? 'Edit Vendor' : 'New Vendor'}</div>
          {error && <div className="error-msg">{error}</div>}
          <div className="form-group"><label className="form-label">Company Name</label>
            <input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Event Pro Rentals" autoFocus/></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Contact Person</label>
              <input className="form-input" value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Phone</label>
              <input className="form-input" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div>
          </div>
          <div className="form-group"><label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
          <div className="form-group"><label className="form-label">Notes</label>
            <textarea className="form-input form-textarea" rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save Vendor</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// SETUP ITEMS
// ─────────────────────────────────────────────────────────
export function SetupItemsPage({ setupItems, vendors, onReload }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name:'', category:'', cost_per_hour:0, qty_available:0, vendor_id:'', notes:'' })
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('All')

  const SETUP_CATS = ['Furniture','Tableware','Decoration','Lighting','Structure','AV','Other']

  const open = (s=null) => {
    setEditing(s)
    setForm(s ? { name:s.name, category:s.category, cost_per_hour:s.cost_per_hour,
                  qty_available:s.qty_available, vendor_id:s.vendor_id||'', notes:s.notes }
               : { name:'', category:'', cost_per_hour:0, qty_available:0, vendor_id:'', notes:'' })
    setError(''); setModal(true)
  }

  const save = async () => {
    if (!form.name.trim() || form.cost_per_hour === '') { setError('Name and cost/hour are required'); return }
    const payload = { ...form, cost_per_hour: parseFloat(form.cost_per_hour)||0,
      qty_available: parseFloat(form.qty_available)||0, vendor_id: form.vendor_id || null }
    try {
      if (editing) await api.updateSetupItem(editing.id, payload)
      else await api.createSetupItem(payload)
      setModal(false); await onReload()
    } catch(e) { setError(e.response?.data?.detail || 'Save failed') }
  }

  const del = async (s) => {
    if (!window.confirm(`Delete setup item "${s.name}"? This cannot be undone.`)) return
    try { await api.deleteSetupItem(s.id); await onReload() }
    catch(e) { alert(e.response?.data?.detail || 'Delete failed') }
  }

  const cats = ['All', ...Array.from(new Set(setupItems.map(s=>s.category).filter(Boolean))).sort()]
  const filtered = setupItems
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.category?.toLowerCase().includes(search.toLowerCase()))
    .filter(s => filterCat === 'All' || s.category === filterCat)

  // Group by category
  const grouped = {}
  filtered.forEach(s => {
    const k = s.category || 'Other'
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(s)
  })

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Setup Items</div><div className="page-sub">Equipment and decorations — priced per hour</div></div>
        <button className="btn btn-primary" onClick={() => open()}>+ New Item</button>
      </div>

      <div className="filters">
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:10}}>
          <div><div className="form-label" style={{marginBottom:4}}>Search</div>
            <input className="form-input" placeholder="Name or category..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div><div className="form-label" style={{marginBottom:4}}>Category</div>
            <select className="form-select" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
              {cats.map(c=><option key={c}>{c}</option>)}
            </select></div>
        </div>
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8,paddingLeft:2}}>
            {cat} <span style={{color:'var(--warning)'}}>({items.length})</span>
          </div>
          <div className="card">
            {items.map(s => (
              <div className="row" key={s.id}>
                <div style={{flex:1}}>
                  <div className="row-name">{s.name}</div>
                  <div className="row-meta">
                    <span className="gold-text">${s.cost_per_hour}/hr</span>
                    {s.qty_available > 0 && ` · ${s.qty_available} available`}
                    {s.vendor_name && ` · ${s.vendor_name}`}
                  </div>
                  {s.notes && <div className="muted" style={{marginTop:2}}>{s.notes}</div>}
                </div>
                <div className="btn-group">
                  <button className="btn btn-sm" onClick={() => open(s)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => del(s)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="empty"><div className="empty-icon">🪑</div>No setup items found</div>
      )}

      {modal && (
        <Modal onClose={() => setModal(false)}>
          <div className="modal-title">{editing ? 'Edit Setup Item' : 'New Setup Item'}</div>
          {error && <div className="error-msg">{error}</div>}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Name</label>
              <input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Round Table (10 seats)" autoFocus/></div>
            <div className="form-group"><label className="form-label">Category</label>
              <select className="form-select" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                <option value="">— select —</option>
                {SETUP_CATS.map(c=><option key={c}>{c}</option>)}
              </select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Cost per hour ($)</label>
              <input className="form-input" type="number" step="0.01" value={form.cost_per_hour}
                onChange={e=>setForm({...form,cost_per_hour:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Qty available</label>
              <input className="form-input" type="number" step="1" value={form.qty_available}
                onChange={e=>setForm({...form,qty_available:e.target.value})}/></div>
          </div>
          <div className="form-group"><label className="form-label">Vendor (optional)</label>
            <select className="form-select" value={form.vendor_id} onChange={e=>setForm({...form,vendor_id:e.target.value})}>
              <option value="">— None —</option>
              {vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
            </select></div>
          <div className="form-group"><label className="form-label">Notes</label>
            <textarea className="form-input form-textarea" rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save Item</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────
export function EventsPage({ events, recipes, setupItems, ingredients, onReload }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [form, setForm] = useState({ name:'', event_date:'', duration_hrs:4, guest_count:0, notes:'', recipes:[], setup_items:[] })
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')

  // ── cost helpers ───────────────────────────────────────
  const calcFoodCost = (eventRecipes, scale=1) => {
    let total = 0
    eventRecipes.forEach(er => {
      const r = recipes.find(x=>x.id===er.recipe_id)
      if (!r) return
      const s = er.portions / r.base_yield
      r.ings?.forEach(ri=>{
        const ing = ingredients.find(i=>i.id===ri.id)
        if (ing) total += ri.qty * s * ing.cost
      })
    })
    return total
  }

  const calcSetupCost = (eventSetup) => {
    let total = 0
    eventSetup.forEach(esi => {
      const s = setupItems.find(x=>x.id===esi.setup_item_id)
      if (s) total += esi.quantity * esi.hours * s.cost_per_hour
    })
    return total
  }

  // ── modal helpers ──────────────────────────────────────
  const openNew = () => {
    setEditing(null)
    setForm({ name:'', event_date:'', duration_hrs:4, guest_count:0, notes:'', recipes:[], setup_items:[] })
    setError(''); setModal(true)
  }

  const openEdit = (ev) => {
    setEditing(ev)
    setForm({
      name:ev.name, event_date:ev.event_date||'',
      duration_hrs:ev.duration_hrs, guest_count:ev.guest_count, notes:ev.notes,
      recipes: ev.recipes.map(r=>({recipe_id:r.recipe_id,portions:r.portions})),
      setup_items: ev.setup_items.map(s=>({setup_item_id:s.setup_item_id,quantity:s.quantity,hours:s.hours}))
    })
    setError(''); setModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Event name is required'); return }
    const payload = {
      ...form,
      duration_hrs: parseFloat(form.duration_hrs)||4,
      guest_count: parseInt(form.guest_count)||0,
      event_date: form.event_date || null,
      recipes: form.recipes.filter(r=>r.recipe_id&&r.portions>0),
      setup_items: form.setup_items.filter(s=>s.setup_item_id&&s.quantity>0&&s.hours>0)
    }
    try {
      if (editing) await api.updateEvent(editing.id, payload)
      else await api.createEvent(payload)
      setModal(false); await onReload()
    } catch(e) { setError(e.response?.data?.detail || 'Save failed') }
  }

  const del = async (ev) => {
    if (!window.confirm(`Delete event "${ev.name}"? This cannot be undone.`)) return
    try { await api.deleteEvent(ev.id); await onReload() }
    catch(e) { alert('Delete failed') }
  }

  const setStatus = async (ev, status) => {
    const labels = { executed:'Mark as Executed', cancelled:'Cancel this event', planned:'Revert to Planned' }
    if (!window.confirm(`${labels[status] || 'Change status'} for "${ev.name}"?`)) return
    try { await api.updateEventStatus(ev.id, status); await onReload() }
    catch(e) { alert('Status update failed') }
  }

  // ── form helpers ───────────────────────────────────────
  const addRecipeRow = () => setForm(f=>({...f, recipes:[...f.recipes,{recipe_id:'',portions:1}]}))
  const updateRecipeRow = (idx, field, val) => setForm(f=>({...f, recipes:f.recipes.map((r,i)=>i===idx?{...r,[field]:val}:r)}))
  const removeRecipeRow = (idx) => setForm(f=>({...f, recipes:f.recipes.filter((_,i)=>i!==idx)}))

  const addSetupRow = () => setForm(f=>({...f, setup_items:[...f.setup_items,{setup_item_id:'',quantity:1,hours:f.duration_hrs||4}]}))
  const updateSetupRow = (idx, field, val) => setForm(f=>({...f, setup_items:f.setup_items.map((s,i)=>i===idx?{...s,[field]:val}:s)}))
  const removeSetupRow = (idx) => setForm(f=>({...f, setup_items:f.setup_items.filter((_,i)=>i!==idx)}))

  // ── live cost preview ──────────────────────────────────
  const previewFood = calcFoodCost(form.recipes.map(r=>({...r,portions:parseInt(r.portions)||0})))
  const previewSetup = calcSetupCost(form.setup_items.map(s=>({...s,quantity:parseFloat(s.quantity)||0,hours:parseFloat(s.hours)||0})))
  const previewTotal = previewFood + previewSetup

  // ── filter ─────────────────────────────────────────────
  const filtered = events.filter(ev => filterStatus==='All' || ev.status===filterStatus.toLowerCase())

  const statusColor = { planned:'var(--sky)', executed:'var(--sage)', cancelled:'var(--ember)' }
  const statusBadge = { planned:'badge-sky', executed:'badge-ok', cancelled:'badge-out' }

  // ── detail view ────────────────────────────────────────
  const detailEvent = events.find(e=>e.id===detailId)

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Events</div><div className="page-sub">Full-service event planning — food + setup costs</div></div>
        <div className="btn-group">
          <select className="form-select" style={{width:'auto'}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option>All</option><option>Planned</option><option>Executed</option><option>Cancelled</option>
          </select>
          <button className="btn btn-primary" onClick={openNew}>+ New Event</button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="metrics">
        <div className="metric sky"><div className="metric-label">Planned</div><div className="metric-value">{events.filter(e=>e.status==='planned').length}</div></div>
        <div className="metric sage"><div className="metric-label">Executed</div><div className="metric-value">{events.filter(e=>e.status==='executed').length}</div></div>
        <div className="metric gold"><div className="metric-label">Total Revenue Pipeline</div><div className="metric-value">EGP {events.filter(e=>e.status==='planned').reduce((s,e)=>s+e.total,0).toFixed(0)}</div></div>
        <div className="metric"><div className="metric-label">Avg Event Cost</div><div className="metric-value">EGP {events.length?((events.reduce((s,e)=>s+e.total,0))/events.length).toFixed(0):0}</div></div>
      </div>

      {filtered.length === 0 && <div className="empty"><div className="empty-icon">🎉</div>No events yet. Create one to plan food and setup together.</div>}

      {filtered.map(ev => (
        <div className="card" key={ev.id} style={{marginBottom:12,borderLeft:`4px solid ${statusColor[ev.status]||'var(--border)'}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700}}>{ev.name}</div>
                <span className={`badge ${statusBadge[ev.status]||'badge-gold'}`}>{ev.status}</span>
              </div>
              <div className="row-meta">
                {ev.event_date && `📅 ${ev.event_date} · `}
                ⏱ {ev.duration_hrs}h · 👥 {ev.guest_count} guests ·
                {ev.recipes.length} recipe{ev.recipes.length!==1?'s':''} ·
                {ev.setup_items.length} setup item{ev.setup_items.length!==1?'s':''}
              </div>
            </div>
            <div className="btn-group">
              <button className="btn btn-sm" onClick={()=>setDetailId(detailId===ev.id?null:ev.id)}>
                {detailId===ev.id?'Hide':'Details'}
              </button>
              {ev.status==='planned' && <button className="btn btn-sm" style={{color:'var(--sage)',borderColor:'var(--sage)'}} onClick={()=>setStatus(ev,'executed')}>✓ Execute</button>}
              {ev.status==='planned' && <button className="btn btn-sm btn-danger" onClick={()=>setStatus(ev,'cancelled')}>Cancel</button>}
              {ev.status==='cancelled' && <button className="btn btn-sm" onClick={()=>setStatus(ev,'planned')}>Restore</button>}
              <button className="btn btn-sm" onClick={()=>openEdit(ev)}>Edit</button>
              <button className="btn btn-sm btn-danger" onClick={()=>del(ev)}>✕</button>
            </div>
          </div>

          {/* Cost summary always visible */}
          <div style={{display:'flex',gap:20,marginTop:10,padding:'10px 0',borderTop:'1px solid var(--border)',fontSize:13}}>
            <span>Food cost: <b style={{color:'var(--warning)'}}>$ {ev.food_cost?.toFixed(2)}</b></span>
            <span>Setup cost: <b style={{color:'var(--sage-2)'}}>$ {ev.setup_cost?.toFixed(2)}</b></span>
            <span style={{fontWeight:700,fontSize:15}}>Total: <b style={{color:'var(--warning)'}}>$ {ev.total?.toFixed(2)}</b></span>
            {ev.guest_count > 0 && <span className="muted">≈ ${(ev.total/ev.guest_count).toFixed(2)}/guest</span>}
          </div>

          {/* Detail breakdown */}
          {detailId === ev.id && (
            <div style={{marginTop:12,padding:14,background:'var(--bg-2)',borderRadius:'var(--radius)'}}>
              <div className="two-col" style={{gap:20}}>
                <div>
                  <div className="card-title">Food</div>
                  {ev.recipes.length === 0 && <div className="muted">No recipes added</div>}
                  {ev.recipes.map((er,i) => {
                    const r = recipes.find(x=>x.id===er.recipe_id)
                    if (!r) return null
                    const scale = er.portions / r.base_yield
                    let cost = 0
                    r.ings?.forEach(ri=>{const ing=ingredients.find(i=>i.id===ri.id);if(ing)cost+=ri.qty*scale*ing.cost})
                    return (
                      <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'4px 0',borderBottom:'1px solid var(--border)'}}>
                        <span>{r.name}</span>
                        <span>{er.portions} portions · <b>EGP {cost.toFixed(2)}</b></span>
                      </div>
                    )
                  })}
                </div>
                <div>
                  <div className="card-title">Setup</div>
                  {ev.setup_items.length === 0 && <div className="muted">No setup items added</div>}
                  {ev.setup_items.map((esi,i) => {
                    const s = setupItems.find(x=>x.id===esi.setup_item_id)
                    if (!s) return null
                    const cost = esi.quantity * esi.hours * s.cost_per_hour
                    return (
                      <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'4px 0',borderBottom:'1px solid var(--border)'}}>
                        <span>{s.name}</span>
                        <span>{esi.quantity}× · {esi.hours}h · <b>EGP {cost.toFixed(2)}</b></span>
                      </div>
                    )
                  })}
                </div>
              </div>
              {ev.notes && <div className="muted" style={{marginTop:10,fontStyle:'italic'}}>📝 {ev.notes}</div>}
            </div>
          )}
        </div>
      ))}

      {/* ── EVENT MODAL ─────────────────────────────────── */}
      {modal && (
        <Modal onClose={() => setModal(false)} wide>
          <div className="modal-title">{editing ? 'Edit Event' : 'New Event'}</div>
          {error && <div className="error-msg">{error}</div>}

          {/* Basic info */}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Event Name</label>
              <input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Al-Rashid Wedding" autoFocus/></div>
            <div className="form-group"><label className="form-label">Date</label>
              <input className="form-input" type="date" value={form.event_date} onChange={e=>setForm({...form,event_date:e.target.value})}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Duration (hours)</label>
              <input className="form-input" type="number" step="0.5" min="0.5" value={form.duration_hrs}
                onChange={e=>setForm({...form,duration_hrs:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Guest count</label>
              <input className="form-input" type="number" min="0" value={form.guest_count}
                onChange={e=>setForm({...form,guest_count:e.target.value})}/></div>
          </div>
          <div className="form-group"><label className="form-label">Notes</label>
            <textarea className="form-input form-textarea" rows={2} value={form.notes}
              onChange={e=>setForm({...form,notes:e.target.value})}/></div>

          <div className="divider"/>

          {/* Recipes */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div className="card-title" style={{margin:0}}>Food / Recipes</div>
            <button className="btn btn-sm" onClick={addRecipeRow}>+ Add Recipe</button>
          </div>
          {form.recipes.map((row,idx) => {
            const r = recipes.find(x=>x.id===row.recipe_id)
            const scale = r && row.portions ? parseInt(row.portions)/r.base_yield : 0
            let cost = 0
            if (r) r.ings?.forEach(ri=>{const ing=ingredients.find(i=>i.id===ri.id);if(ing)cost+=ri.qty*scale*ing.cost})
            return (
              <div key={idx} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
                <select className="form-select" style={{flex:3}} value={row.recipe_id}
                  onChange={e=>updateRecipeRow(idx,'recipe_id',e.target.value)}>
                  <option value="">— select recipe —</option>
                  {recipes.map(r=><option key={r.id} value={r.id}>{r.name} ({r.base_yield} {r.yield_unit})</option>)}
                </select>
                <input className="form-input" type="number" min="1" placeholder="Portions" style={{flex:1}}
                  value={row.portions} onChange={e=>updateRecipeRow(idx,'portions',parseInt(e.target.value)||1)}/>
                {cost > 0 && <span className="gold-text" style={{minWidth:60,textAlign:'right'}}>EGP {cost.toFixed(2)}</span>}
                <button className="btn btn-sm btn-danger" onClick={()=>removeRecipeRow(idx)}>✕</button>
              </div>
            )
          })}
          {form.recipes.length === 0 && <div className="muted" style={{marginBottom:8}}>No recipes added yet.</div>}

          <div className="divider"/>

          {/* Setup Items */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div className="card-title" style={{margin:0}}>Setup Items</div>
            <button className="btn btn-sm" onClick={addSetupRow}>+ Add Item</button>
          </div>
          {form.setup_items.map((row,idx) => {
            const s = setupItems.find(x=>x.id===row.setup_item_id)
            const cost = s ? (parseFloat(row.quantity)||0)*(parseFloat(row.hours)||0)*s.cost_per_hour : 0
            return (
              <div key={idx} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
                <select className="form-select" style={{flex:3}} value={row.setup_item_id}
                  onChange={e=>updateSetupRow(idx,'setup_item_id',e.target.value)}>
                  <option value="">— select item —</option>
                  {setupItems.map(s=><option key={s.id} value={s.id}>{s.name} (EGP {s.cost_per_hour}/hr)</option>)}
                </select>
                <div style={{display:'flex',gap:4,flex:2,alignItems:'center'}}>
                  <input className="form-input" type="number" min="1" step="1" placeholder="Qty" title="Quantity"
                    value={row.quantity} onChange={e=>updateSetupRow(idx,'quantity',e.target.value)}/>
                  <span className="muted">×</span>
                  <input className="form-input" type="number" min="0.5" step="0.5" placeholder="Hrs" title="Hours"
                    value={row.hours} onChange={e=>updateSetupRow(idx,'hours',e.target.value)}/>
                  <span className="muted">h</span>
                </div>
                {cost > 0 && <span className="gold-text" style={{minWidth:60,textAlign:'right'}}>EGP {cost.toFixed(2)}</span>}
                <button className="btn btn-sm btn-danger" onClick={()=>removeSetupRow(idx)}>✕</button>
              </div>
            )
          })}
          {form.setup_items.length === 0 && <div className="muted" style={{marginBottom:8}}>No setup items added yet.</div>}

          {/* Live cost preview */}
          {(previewFood > 0 || previewSetup > 0) && (
            <div className="cost-box" style={{marginTop:12}}>
              <div className="cost-line"><span>Food cost</span><span>EGP {previewFood.toFixed(2)}</span></div>
              <div className="cost-line"><span>Setup cost</span><span>EGP {previewSetup.toFixed(2)}</span></div>
              <div className="cost-line"><span>Total event cost</span><span style={{color:'var(--warning)',fontSize:16}}>EGP {previewTotal.toFixed(2)}</span></div>
              {form.guest_count > 0 && (
                <div className="cost-line"><span>Per guest</span><span>EGP {(previewTotal/form.guest_count).toFixed(2)}</span></div>
              )}
            </div>
          )}

          <div className="modal-footer">
            <button className="btn" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save Event</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
