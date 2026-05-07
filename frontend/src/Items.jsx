import { useState, useEffect } from 'react'
import * as api from './api'
import { Modal, expiryLabel, uid } from './App'

// ─────────────────────────────────────────────────────────
// ITEMS PAGE
// ─────────────────────────────────────────────────────────
export function ItemsPage({ ingredients, recipes, items, onReload, addToHistory }) {
  const [modal,          setModal]          = useState(false)
  const [editing,        setEditing]        = useState(null)
  const [form,           setForm]           = useState({ name:'',category:'',base_yield:1,yield_unit:'pieces',notes:'',sub_recipes:[],sub_ings:[] })
  const [error,          setError]          = useState('')
  const [assembleModal,  setAssembleModal]  = useState(null)
  const [assemblePortions,setAssemblePortions] = useState(1)
  const [assembleResult, setAssembleResult] = useState(null)
  const [assembling,     setAssembling]     = useState(false)
  const [search,         setSearch]         = useState('')
  const [filterCat,      setFilterCat]      = useState('All')
  const [filterStock,    setFilterStock]    = useState('All')

  const open = (item=null) => {
    setEditing(item)
    if (item) {
      setForm({ name:item.name, category:item.category, base_yield:item.base_yield, yield_unit:item.yield_unit, notes:item.notes,
        sub_recipes:item.sub_recipes.map(sr=>({recipe_id:sr.recipe_id,quantity:sr.quantity,unit:sr.unit})),
        sub_ings:item.sub_ings.map(si=>({ingredient_id:si.ingredient_id,qty:si.qty,unit:si.unit})),
        profit_margin:item.profit_margin!=null?item.profit_margin:'' })
    } else {
      setForm({name:'',category:'',base_yield:1,yield_unit:'pieces',notes:'',profit_margin:'',sub_recipes:[],sub_ings:[]})
    }
    setError(''); setModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Name required'); return }
    const payload = {
      ...form, base_yield:parseInt(form.base_yield)||1, profit_margin:form.profit_margin!==''?parseFloat(form.profit_margin):null,
      sub_recipes:form.sub_recipes.filter(sr=>sr.recipe_id&&parseFloat(sr.quantity)>0).map(sr=>({recipe_id:sr.recipe_id,quantity:parseFloat(sr.quantity),unit:sr.unit})),
      sub_ings:form.sub_ings.filter(si=>si.ingredient_id&&parseFloat(si.qty)>0).map(si=>({ingredient_id:si.ingredient_id,qty:parseFloat(si.qty),unit:si.unit})),
    }
    try {
      if (editing) await api.updateItem(editing.id, payload)
      else         await api.createItem(payload)
      setModal(false); await onReload()
    } catch(e) { setError(e.response?.data?.detail||'Save failed') }
  }

  const del = async item => {
    if (!window.confirm(`Delete item "${item.name}"? This cannot be undone.`)) return
    try { await api.deleteItem(item.id); await onReload() } catch(e) { alert('Delete failed') }
  }

  const openAssemble = item => { setAssembleModal(item); setAssemblePortions(item.base_yield); setAssembleResult(null) }

  const doAssemble = async () => {
    const scale = assemblePortions/assembleModal.base_yield
    if (!window.confirm(`Assemble "${assembleModal.name}" — ${assemblePortions} ${assembleModal.yield_unit}?\nThis deducts cooked stock and ingredients.`)) return
    setAssembling(true)
    try {
      await api.assembleItem(assembleModal.id, {item_id:assembleModal.id, scale_factor:scale, portions:assemblePortions})
      // Add to history log
      if (addToHistory) {
        addToHistory({
          id: Math.random().toString(36).slice(2),
          type: 'assembly',
          itemId:       assembleModal.id,
          itemName:     assembleModal.name,
          recipeName:   assembleModal.name,   // reuse recipeName field for display
          category:     assembleModal.category,
          portions:     assemblePortions,
          scale,
          cost: assembleModal.total_cost * scale,
          cookedAt: new Date().toISOString(),
          status: 'completed',
          subRecipes: assembleModal.sub_recipes?.map(sr => ({name:sr.recipe_name, qty:sr.quantity*scale, unit:sr.unit})) || [],
          subIngs:    assembleModal.sub_ings?.map(si => ({name:si.ingredient_name, qty:si.qty*scale, unit:si.unit})) || [],
        })
      }
      await onReload()
      setAssembleModal(null)
      setAssembleResult(null)
    } catch(e) {
      setAssembleResult({success:false, msg:e.response?.data?.detail||'Assembly failed — check cooked stock and ingredient levels.'})
    }
    setAssembling(false)
  }

  const addSR=()=>setForm(f=>({...f,sub_recipes:[...f.sub_recipes,{recipe_id:'',quantity:'',unit:'g'}]}))
  const updSR=(idx,field,val)=>setForm(f=>({...f,sub_recipes:f.sub_recipes.map((r,i)=>i===idx?{...r,[field]:val}:r)}))
  const delSR=(idx)=>setForm(f=>({...f,sub_recipes:f.sub_recipes.filter((_,i)=>i!==idx)}))
  const addSI=()=>setForm(f=>({...f,sub_ings:[...f.sub_ings,{ingredient_id:'',qty:'',unit:'g'}]}))
  const updSI=(idx,field,val)=>setForm(f=>({...f,sub_ings:f.sub_ings.map((s,i)=>i===idx?{...s,[field]:val}:s)}))
  const delSI=(idx)=>setForm(f=>({...f,sub_ings:f.sub_ings.filter((_,i)=>i!==idx)}))

  const cats = ['All', ...Array.from(new Set(items.map(i=>i.category).filter(Boolean))).sort()]
  const filtered = items
    .filter(i=>!search||i.name.toLowerCase().includes(search.toLowerCase())||i.category?.toLowerCase().includes(search.toLowerCase()))
    .filter(i=>filterCat==='All'||i.category===filterCat)
    .filter(i=>filterStock==='All'||(filterStock==='Ready'?i.all_stock_ok:!i.all_stock_ok))

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Items</div><div className="page-sub">Finished products assembled from cooked recipes + ingredients</div></div>
        <button className="btn btn-primary" onClick={()=>open()}>+ New Item</button>
      </div>

      <div className="alert-strip info" style={{marginBottom:16}}>
        <b>How items work:</b> Create an item (e.g. Lemon Tart) from sub-recipes in Cooked Stock and/or direct ingredients. First cook sub-recipes via Simulate → "Cook & Store to Stock", then assemble here.
      </div>

      <div className="filters" style={{marginBottom:16,padding:'12px 14px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:10,alignItems:'end'}}>
          <div>
            <div className="form-label" style={{marginBottom:4}}>Search</div>
            <input className="form-input" placeholder="Name or category…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div>
            <div className="form-label" style={{marginBottom:4}}>Category</div>
            <select className="form-select" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
              {cats.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="form-label" style={{marginBottom:4}}>Status</div>
            <select className="form-select" value={filterStock} onChange={e=>setFilterStock(e.target.value)}>
              <option>All</option><option>Ready</option><option>Stock missing</option>
            </select>
          </div>
          <div>
            {(search||filterCat!=='All'||filterStock!=='All')&&
              <button className="btn btn-sm" onClick={()=>{setSearch('');setFilterCat('All');setFilterStock('All')}}>✕ Clear</button>}
          </div>
        </div>
      </div>

      {filtered.length===0&&<div className="empty"><div className="empty-icon">🍋</div><h3>No items yet</h3></div>}

      {filtered.map(item=>(
        <div className="card" key={item.id} style={{marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                <div style={{fontFamily:'var(--fd)',fontSize:18,fontWeight:700}}>{item.name}</div>
                {item.category&&<span className="badge badge-gold">{item.category}</span>}
                <span className={`badge badge-${item.all_stock_ok?'ok':'out'}`}>{item.all_stock_ok?'Ready':'Stock missing'}</span>
              </div>
              <div className="row-meta">{item.base_yield} {item.yield_unit} · {item.sub_recipes.length} sub-recipe(s) · {item.sub_ings.length} ingredient(s)</div>
            </div>
            <div className="btn-group">
              <button className="btn btn-sm btn-primary" onClick={()=>openAssemble(item)}>Assemble</button>
              <button className="btn btn-sm" onClick={()=>open(item)}>Edit</button>
              <button className="btn btn-sm btn-danger" onClick={()=>del(item)}>✕</button>
            </div>
          </div>
          {item.sub_recipes.length>0&&(
            <div style={{marginTop:10}}>
              <div className="muted" style={{marginBottom:4}}>Sub-recipes (from cooked stock):</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {item.sub_recipes.map((sr,i)=>(
                  <span key={i} style={{padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:500,
                    background:sr.stock_ok?'var(--sky-lt)':'var(--ember-lt)',color:sr.stock_ok?'var(--sky)':'var(--ember)',
                    border:`1px solid ${sr.stock_ok?'#bfdbfe':'#f5c6c0'}`}}>
                    {sr.recipe_name} {sr.quantity}{sr.unit}
                    {!sr.stock_ok&&` ⚠ have ${sr.cooked_stock_available?.toFixed(1)}`}
                  </span>
                ))}
              </div>
            </div>
          )}
          {item.sub_ings.length>0&&(
            <div style={{marginTop:8}}>
              <div className="muted" style={{marginBottom:4}}>Direct ingredients:</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {item.sub_ings.map((si,i)=>(
                  <span key={i} className="ing-tag" style={!si.stock_ok?{background:'var(--ember-lt)',color:'var(--ember)'}:{}}>{si.ingredient_name} {si.qty}{si.unit}</span>
                ))}
              </div>
            </div>
          )}
          <div style={{display:'flex',gap:20,paddingTop:8,marginTop:8,borderTop:'1px solid var(--border)',fontSize:13}}>
            <span>Cost: <b style={{color:'var(--accent)'}}>EGP {item.total_cost?.toFixed(2)}</b></span>
              <span>Per {item.yield_unit.replace(/s$/,'')}: <b style={{color:'var(--accent)'}}>EGP {item.cost_per_unit?.toFixed(3)}</b></span>
              {item.profit_margin!=null && <span style={{color:'var(--success)',fontWeight:500}}>Sell ≥ EGP {(item.cost_per_unit/(1-item.profit_margin/100)).toFixed(2)}/unit ({item.profit_margin}%)</span>}
            {item.notes&&<span className="muted">📝 {item.notes}</span>}
          </div>
        </div>
      ))}

      {assembleModal&&(
        <Modal onClose={()=>setAssembleModal(null)}>
          <div className="modal-title">Assemble — {assembleModal.name}</div>
          <div style={{background:'var(--warm)',borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:13}}>
            Base: <b>{assembleModal.base_yield} {assembleModal.yield_unit}</b> · Cost: <b>EGP {assembleModal.total_cost?.toFixed(2)}</b>
          </div>
          <div className="form-group">
            <label className="form-label">How many {assembleModal.yield_unit}?</label>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <button className="btn btn-sm" onClick={()=>setAssemblePortions(p=>Math.max(assembleModal.base_yield,p-assembleModal.base_yield))}>−</button>
              <input className="form-input" type="number" min={assembleModal.base_yield} step={assembleModal.base_yield}
                value={assemblePortions} onChange={e=>setAssemblePortions(Math.max(assembleModal.base_yield,parseInt(e.target.value)||assembleModal.base_yield))}
                style={{textAlign:'center',fontSize:18,fontWeight:600}}/>
              <button className="btn btn-sm" onClick={()=>setAssemblePortions(p=>p+assembleModal.base_yield)}>+</button>
            </div>
            <div className="muted" style={{marginTop:4}}>Minimum: {assembleModal.base_yield} {assembleModal.yield_unit}</div>
          </div>
          <div style={{marginBottom:14}}>
            <div className="card-title">Requirements at {(assemblePortions/assembleModal.base_yield).toFixed(2)}× scale</div>
            {assembleModal.sub_recipes.map((sr,i)=>{
              const needed=sr.quantity*(assemblePortions/assembleModal.base_yield); const ok=sr.cooked_stock_available>=needed
              return <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                <span>{sr.recipe_name} <span className="muted">(cooked stock)</span></span>
                <span>Need <b>{needed.toFixed(1)}{sr.unit}</b> · Have <b style={{color:ok?'var(--sage)':'var(--ember)'}}>{sr.cooked_stock_available?.toFixed(1)}{sr.unit}</b> {ok?'✓':'✗'}</span>
              </div>
            })}
            {assembleModal.sub_ings.map((si,i)=>{
              const needed=si.qty*(assemblePortions/assembleModal.base_yield); const ok=si.stock>=needed
              return <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                <span>{si.ingredient_name}</span>
                <span>Need <b>{needed.toFixed(1)}{si.unit}</b> · Have <b style={{color:ok?'var(--sage)':'var(--ember)'}}>{si.stock?.toFixed(1)}{si.unit}</b> {ok?'✓':'✗'}</span>
              </div>
            })}
            <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',fontWeight:600,fontSize:14}}>
              <span>Total cost</span>
              <span style={{color:'var(--accent)'}}>EGP {(assembleModal.total_cost*(assemblePortions/assembleModal.base_yield)).toFixed(2)}</span>
            </div>
          </div>
          {assembleResult&&<div className={`alert-strip ${assembleResult.success?'success':'danger'}`} style={{marginBottom:12}}>{assembleResult.success?'✓ ':''}{assembleResult.msg}</div>}
          <div className="modal-footer">
            <button className="btn" onClick={()=>setAssembleModal(null)}>Close</button>
            <button className="btn btn-primary" onClick={doAssemble} disabled={assembling||!assembleModal.all_stock_ok}>
              {assembling?'Assembling…':`Assemble ${assemblePortions} ${assembleModal.yield_unit}`}
            </button>
          </div>
        </Modal>
      )}

      {modal&&(
        <Modal onClose={()=>setModal(false)} wide>
          <div className="modal-title">{editing?'Edit Item':'New Item'}</div>
          {error&&<div className="error-msg">{error}</div>}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Name</label>
              <input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Lemon Tart" autoFocus/></div>
            <div className="form-group"><label className="form-label">Category</label>
              <input className="form-input" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} placeholder="e.g. Pastry"/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Base yield</label>
              <input className="form-input" type="number" min={1} value={form.base_yield} onChange={e=>setForm({...form,base_yield:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Yield unit</label>
              <input className="form-input" value={form.yield_unit} onChange={e=>setForm({...form,yield_unit:e.target.value})} placeholder="pieces / bites / portions"/></div>
          </div>
          <div className="form-group"><label className="form-label">Notes</label>
            <textarea className="form-input form-textarea" rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
          <div className="form-group">
            <label className="form-label">Target profit margin % <span style={{fontWeight:400,color:'var(--ink-mute)',textTransform:'none',letterSpacing:0}}>(optional)</span></label>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <input className="form-input" type="number" min={0} max={100} step={1} value={form.profit_margin||''} placeholder="e.g. 65"
                onChange={e=>setForm({...form,profit_margin:e.target.value?parseFloat(e.target.value):null})} style={{maxWidth:120}}/>
              <span className="muted">% — used to show suggested sell price</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Profit Margin % <span style={{color:'var(--ink-mute)',fontWeight:400,textTransform:'none',fontSize:11}}>(optional)</span></label>
            <input className="form-input" type="number" min={0} max={99} step={1} value={form.profit_margin}
              placeholder="e.g. 65" onChange={e=>setForm({...form,profit_margin:e.target.value})} style={{maxWidth:160}}/>
          </div>
          <div className="divider"/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div className="card-title" style={{margin:0}}>Sub-recipes <span className="muted">(from cooked stock)</span></div>
            <button className="btn btn-sm" onClick={addSR}>+ Add</button>
          </div>
          {form.sub_recipes.map((row,idx)=>(
            <div key={idx} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
              <select className="form-select" style={{flex:3}} value={row.recipe_id} onChange={e=>updSR(idx,'recipe_id',e.target.value)}>
                <option value="">— select recipe —</option>
                {recipes.map(r=><option key={r.id} value={r.id}>{r.name} (yields {r.base_yield} {r.yield_unit})</option>)}
              </select>
              <input className="form-input" type="number" min={0.01} step={0.01} placeholder="Qty needed" style={{flex:1}}
                value={row.quantity} onChange={e=>updSR(idx,'quantity',e.target.value)}/>
              <select className="form-select" style={{flex:1}} value={row.unit} onChange={e=>updSR(idx,'unit',e.target.value)}>
                {['g','kg','ml','l','piece','portions'].map(u=><option key={u}>{u}</option>)}
              </select>
              <button className="btn btn-sm btn-danger" onClick={()=>delSR(idx)}>✕</button>
            </div>
          ))}
          {form.sub_recipes.length===0&&<div className="muted" style={{marginBottom:8}}>No sub-recipes yet.</div>}
          <div className="divider"/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div className="card-title" style={{margin:0}}>Direct ingredients</div>
            <button className="btn btn-sm" onClick={addSI}>+ Add</button>
          </div>
          {form.sub_ings.map((row,idx)=>(
            <div key={idx} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
              <select className="form-select" style={{flex:3}} value={row.ingredient_id} onChange={e=>updSI(idx,'ingredient_id',e.target.value)}>
                <option value="">— select ingredient —</option>
                {ingredients.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
              <input className="form-input" type="number" min={0.01} step={0.01} placeholder="Qty" style={{flex:1}}
                value={row.qty} onChange={e=>updSI(idx,'qty',e.target.value)}/>
              <select className="form-select" style={{flex:1}} value={row.unit} onChange={e=>updSI(idx,'unit',e.target.value)}>
                {['g','kg','ml','l','piece','tbsp','tsp'].map(u=><option key={u}>{u}</option>)}
              </select>
              <button className="btn btn-sm btn-danger" onClick={()=>delSI(idx)}>✕</button>
            </div>
          ))}
          {form.sub_ings.length===0&&<div className="muted" style={{marginBottom:8}}>No direct ingredients yet.</div>}
          <div className="modal-footer">
            <button className="btn" onClick={()=>setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save Item</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// COOKED STOCK PAGE
// ─────────────────────────────────────────────────────────
export function CookedStockPage({ onReload }) {
  const [stocks,       setStocks]       = useState([])
  const [wasteModal,   setWasteModal]   = useState(null)
  const [reason,       setReason]       = useState('expired')
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('All')

  const load = async () => {
    setLoading(true)
    try { const r=await api.getCookedStock(); setStocks(r.data) } catch(e) { console.error(e) }
    setLoading(false)
  }
  useEffect(()=>{ load() },[])

  const doWaste = async () => {
    if (!window.confirm(`Send "${wasteModal.recipe_name}" (${wasteModal.quantity} ${wasteModal.unit}) to waste?\nCost lost: $EGP {wasteModal.cost_snapshot?.toFixed(2)}`)) return
    try { await api.wasteCookedStock(wasteModal.id,{reason}); setWasteModal(null); await load(); onReload() }
    catch(e) { alert(e.response?.data?.detail||'Failed') }
  }

  const filtered = stocks
    .filter(cs => !search || cs.recipe_name?.toLowerCase().includes(search.toLowerCase()) || cs.notes?.toLowerCase().includes(search.toLowerCase()))
    .filter(cs => {
      if (filterStatus === 'All') return true
      if (filterStatus === 'OK')       return cs.expiry_status === 'ok' || cs.expiry_status === 'none'
      if (filterStatus === 'Warning')  return cs.expiry_status === 'warning'
      if (filterStatus === 'Critical') return cs.expiry_status === 'critical'
      if (filterStatus === 'Expired')  return cs.expiry_status === 'expired'
      return true
    })

  const grouped = {}
  filtered.forEach(cs=>{ if(!grouped[cs.recipe_name])grouped[cs.recipe_name]=[]; grouped[cs.recipe_name].push(cs) })
  const totalCost = stocks.reduce((s,cs)=>s+cs.cost_snapshot,0)
  const expiring  = stocks.filter(cs=>['critical','warning'].includes(cs.expiry_status)).length

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Cooked Stock</div><div className="page-sub">Prepared outputs ready for item assembly — your kitchen fridge</div></div>
      </div>
      <div className="metrics metrics-3" style={{marginBottom:20}}>
        <div className="metric"><div className="metric-bar"/><div className="metric-label">Batches in stock</div><div className="metric-value">{stocks.length}</div></div>
        <div className="metric gold"><div className="metric-bar"/><div className="metric-label">Total value</div><div className="metric-value">EGP {totalCost.toFixed(2)}</div></div>
        <div className={`metric${expiring>0?' warn':''}`}><div className="metric-bar"/><div className="metric-label">Expiry alerts</div><div className="metric-value">{expiring}</div></div>
      </div>

      <div className="filters" style={{marginBottom:16}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:10}}>
          <div><div className="form-label" style={{marginBottom:4}}>Search recipe or notes</div>
            <input className="form-input" placeholder="Type to search…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div><div className="form-label" style={{marginBottom:4}}>Expiry status</div>
            <select className="form-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option>All</option><option>OK</option><option>Warning</option><option>Critical</option><option>Expired</option>
            </select></div>
          <div style={{alignSelf:'flex-end'}}>
            {(search||filterStatus!=='All')&&<span className="filter-clear" onClick={()=>{setSearch('');setFilterStatus('All')}}>✕ Clear — {filtered.length} of {stocks.length}</span>}
          </div>
        </div>
      </div>

      {loading&&<div className="loading"><div className="loading-spinner"/><span>Loading…</span></div>}
      {!loading&&stocks.length===0&&(
        <div className="empty">
          <div className="empty-icon">🧊</div><h3>No cooked stock yet</h3>
          <div className="muted" style={{marginTop:6}}>Use <b>Simulate → Cook & Store to Stock</b> to prepare recipe outputs.</div>
        </div>
      )}
      {Object.entries(grouped).map(([recipeName,batches])=>(
        <div key={recipeName} style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--slate)',marginBottom:8}}>
            {recipeName} <span style={{color:'var(--gold)'}}>({batches.length} batch{batches.length>1?'es':''})</span>
          </div>
          <div className="card">
            {batches.map(cs=>{
              const exp=expiryLabel(cs.expiry_date)
              return (
                <div className="row" key={cs.id}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span className="row-name">{cs.quantity.toFixed(1)} {cs.unit}</span>
                      {exp&&<span className={exp.cls}>{exp.label}</span>}
                      {!exp&&<span className="muted" style={{fontSize:11}}>No expiry</span>}
                      {cs.expiry_status==='expired'&&<span className="badge badge-expired">EXPIRED</span>}
                      {cs.expiry_status==='critical'&&<span className="badge badge-critical">CRITICAL</span>}
                      {cs.expiry_status==='warning'&&<span className="badge badge-warn">Expiring soon</span>}
                    </div>
                    <div className="row-meta">Cost: EGP {cs.cost_snapshot?.toFixed(2)} · {cs.created_at?new Date(cs.created_at).toLocaleDateString():'—'}{cs.notes?` · ${cs.notes}`:''}</div>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={()=>{setWasteModal(cs);setReason('expired')}}>🗑 Waste</button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {wasteModal&&(
        <Modal onClose={()=>setWasteModal(null)}>
          <div className="modal-title">Send to Waste</div>
          <div style={{background:'var(--ember-lt)',borderRadius:8,padding:'12px 14px',marginBottom:14,fontSize:13}}>
            <b>{wasteModal.recipe_name}</b> — {wasteModal.quantity.toFixed(1)} {wasteModal.unit}<br/>
            Cost lost: <b style={{color:'var(--ember)'}}>EGP {wasteModal.cost_snapshot?.toFixed(2)}</b>
          </div>
          <div className="form-group"><label className="form-label">Reason</label>
            <select className="form-select" value={reason} onChange={e=>setReason(e.target.value)}>
              <option value="expired">Expired</option>
              <option value="overproduced">Overproduced</option>
              <option value="spoiled">Spoiled</option>
              <option value="quality">Quality issue</option>
              <option value="other">Other</option>
            </select></div>
          <div className="modal-footer">
            <button className="btn" onClick={()=>setWasteModal(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={doWaste}>Confirm Waste</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// WASTE LOG PAGE
// ─────────────────────────────────────────────────────────
export function WastePage() {
  const [waste,        setWaste]        = useState([])
  const [summary,      setSummary]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterReason, setFilterReason] = useState('All')
  const [filterType,   setFilterType]   = useState('All')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')

  const load = async () => {
    setLoading(true)
    try { const [w,s]=await Promise.all([api.getWaste(),api.getWasteSummary()]); setWaste(w.data); setSummary(s.data) }
    catch(e) { console.error(e) }
    setLoading(false)
  }
  useEffect(()=>{ load() },[])

  const del = async id => {
    if (!window.confirm('Remove this waste entry? This does NOT restore any stock.')) return
    try { await api.deleteWasteEntry(id); await load() } catch(e) { alert('Delete failed') }
  }

  const reasonColor = {expired:'var(--ember)',overproduced:'var(--amber)',spoiled:'var(--ember)',quality:'var(--amber)',other:'var(--slate)'}
  const reasons = ['All',...Array.from(new Set(waste.map(w=>w.reason).filter(Boolean))).sort()]

  const filtered = waste.filter(w => {
    if (search && !w.name_snapshot?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterReason !== 'All' && w.reason !== filterReason) return false
    if (filterType !== 'All' && w.source_type !== (filterType === 'Cooked stock' ? 'cooked_stock' : 'ingredient_batch')) return false
    if (dateFrom && new Date(w.created_at) < new Date(dateFrom)) return false
    if (dateTo   && new Date(w.created_at) > new Date(dateTo+'T23:59:59')) return false
    return true
  })
  const hasFilters = search || filterReason !== 'All' || filterType !== 'All' || dateFrom || dateTo

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Waste Log</div><div className="page-sub">Track lost stock and its cost impact</div></div>
      </div>
      {summary&&(
        <>
          <div className="metrics metrics-3" style={{marginBottom:16}}>
            <div className="metric warn"><div className="metric-bar"/><div className="metric-label">Total entries</div><div className="metric-value">{summary.total_entries}</div></div>
            <div className="metric warn"><div className="metric-bar"/><div className="metric-label">Total cost lost</div><div className="metric-value">EGP {summary.total_cost_lost?.toFixed(2)}</div></div>
            <div className="metric"><div className="metric-bar"/><div className="metric-label">Top reason</div>
              <div className="metric-value" style={{fontSize:16,textTransform:'capitalize'}}>{Object.keys(summary.by_reason||{})[0]||'—'}</div></div>
          </div>
          {Object.keys(summary.by_reason||{}).length>0&&(
            <div className="card" style={{marginBottom:16}}>
              <div className="card-title">Cost lost by reason</div>
              {Object.entries(summary.by_reason).map(([r,cost])=>{
                const max=Math.max(...Object.values(summary.by_reason))
                return <div key={r} className="bar-chart-row">
                  <div className="bar-chart-label" style={{textTransform:'capitalize'}}>{r}</div>
                  <div className="bar-chart-bar" style={{width:`${(cost/max)*200}px`,background:reasonColor[r]||'var(--ember)'}}/>
                  <div className="bar-chart-val" style={{color:reasonColor[r]||'var(--ember)'}}>EGP {cost.toFixed(2)}</div>
                </div>
              })}
            </div>
          )}
        </>
      )}
      <div className="filters" style={{marginBottom:16}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
          <div><div className="form-label" style={{marginBottom:4}}>Search</div>
            <input className="form-input" placeholder="Ingredient or recipe…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div><div className="form-label" style={{marginBottom:4}}>Reason</div>
            <select className="form-select" value={filterReason} onChange={e=>setFilterReason(e.target.value)}>
              {reasons.map(r=><option key={r}>{r}</option>)}</select></div>
          <div><div className="form-label" style={{marginBottom:4}}>Type</div>
            <select className="form-select" value={filterType} onChange={e=>setFilterType(e.target.value)}>
              <option>All</option><option>Cooked stock</option><option>Ingredient batch</option>
            </select></div>
          <div><div className="form-label" style={{marginBottom:4}}>From date</div>
            <input className="form-input" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'3fr 1fr',gap:10,marginTop:10}}>
          <div><div className="form-label" style={{marginBottom:4}}>To date</div>
            <input className="form-input" type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></div>
          <div style={{alignSelf:'flex-end'}}>
            {hasFilters&&<span className="filter-clear" onClick={()=>{setSearch('');setFilterReason('All');setFilterType('All');setDateFrom('');setDateTo('')}}>✕ Clear — {filtered.length} of {waste.length}</span>}
          </div>
        </div>
      </div>

      {loading&&<div className="loading"><div className="loading-spinner"/><span>Loading…</span></div>}
      {!loading&&waste.length===0&&<div className="empty"><div className="empty-icon">♻️</div><h3>No waste recorded yet. Great job!</h3></div>}
      {!loading&&waste.length>0&&filtered.length===0&&<div className="empty"><div className="empty-icon">🔍</div><h3>No waste matches your filters</h3></div>}
      {filtered.length>0&&(
        <div className="card">
          {filtered.map(w=>(
            <div className="row" key={w.id}>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span className="row-name">{w.name_snapshot}</span>
                  <span className="badge" style={{background:(reasonColor[w.reason]||'var(--slate)')+'22',color:reasonColor[w.reason]||'var(--slate)'}}>{w.reason}</span>
                  <span className="badge badge-out">EGP {w.cost_lost?.toFixed(2)} lost</span>
                </div>
                <div className="row-meta">{w.quantity} {w.unit} · {w.source_type==='cooked_stock'?'cooked stock':'ingredient batch'} · {w.created_at?new Date(w.created_at).toLocaleString():''}</div>
              </div>
              <button className="btn btn-sm btn-danger" onClick={()=>del(w.id)}>Remove entry</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
