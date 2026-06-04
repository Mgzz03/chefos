import { useState, useEffect, useRef } from 'react'
import * as api from './api'
import { Modal, stockStatus, uid } from './App'

// ─────────────────────────────────────────────────────────
// RECIPES
// ─────────────────────────────────────────────────────────
export function Recipes({ ingredients, categories, recipes, onReload, setPage, setSimRecipe }) {
  const [modal,       setModal]       = useState(false)
  const [editing,     setEditing]     = useState(null)
  const [form,        setForm]        = useState({ name:'',category:'',base_yield:4,yield_unit:'portions',notes:'' })
  const [ingRows,     setIngRows]     = useState([{ key:uid(),id:'',qty:'',unit:'g' }])
  const [error,       setError]       = useState('')
  const [search,      setSearch]      = useState('')
  const [filterCat,   setFilterCat]   = useState('All')
  const [filterStock, setFilterStock] = useState('All')
  const [sortBy,      setSortBy]      = useState('name')

  const calcCost  = r => { let t=0; r.ings?.forEach(ri=>{const ing=ingredients.find(i=>i.id===ri.id); if(ing) t+=ri.qty*ing.cost}); return t }
  const checkStock= r => r.ings?.every(ri=>{const ing=ingredients.find(i=>i.id===ri.id); return ing && ing.stock>=ri.qty})
  const recipeCats= ['All',...Array.from(new Set(recipes.map(r=>r.category).filter(Boolean))).sort()]

  const filtered = recipes
    .filter(r=>!search||r.name.toLowerCase().includes(search.toLowerCase())||r.category?.toLowerCase().includes(search.toLowerCase())||r.notes?.toLowerCase().includes(search.toLowerCase()))
    .filter(r=>filterCat==='All'||r.category===filterCat)
    .filter(r=>filterStock==='All'||(filterStock==='Stockable'?checkStock(r):!checkStock(r)))
    .sort((a,b)=>{
      if (sortBy==='name')      return a.name.localeCompare(b.name)
      if (sortBy==='cost_high') return calcCost(b)-calcCost(a)
      if (sortBy==='cost_low')  return calcCost(a)-calcCost(b)
      if (sortBy==='yield')     return b.base_yield-a.base_yield
      return 0
    })

  const openNew = () => {
    setEditing(null); setForm({name:'',category:'',base_yield:4,yield_unit:'portions',notes:'',profit_margin:''})
    setIngRows([{key:uid(),id:'',qty:'',unit:'g'}]); setError(''); setModal(true)
  }
  const openEdit = r => {
    setEditing(r); setForm({name:r.name,category:r.category,base_yield:r.base_yield,yield_unit:r.yield_unit,notes:r.notes,profit_margin:r.profit_margin!=null?r.profit_margin:''})
    setIngRows(r.ings.map(ri=>({key:uid(),id:ri.id,qty:ri.qty,unit:ri.unit}))); setError(''); setModal(true)
  }
  const save = async () => {
    if (!form.name.trim()) { setError('Recipe name is required'); return }
    const ings = ingRows.filter(r=>r.id&&parseFloat(r.qty)>0).map(r=>({id:r.id,qty:parseFloat(r.qty),unit:r.unit}))
    const payload = {...form, base_yield:parseInt(form.base_yield)||4, profit_margin:form.profit_margin!==''?parseFloat(form.profit_margin):null, ings}
    try {
      if (editing) await api.updateRecipe(editing.id, payload)
      else         await api.createRecipe(payload)
      setModal(false); setError(''); await onReload()
    } catch(e) { console.error(e); setModal(false); await onReload() }
  }
  const del = async r => {
    if (!window.confirm(`Delete recipe "${r.name}"?`)) return
    await api.deleteRecipe(r.id); onReload()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><div className="page-title">Recipes</div><div className="page-sub">{recipes.length} recipes · {filtered.length} shown</div></div>
        <button className="btn btn-primary" onClick={openNew}>+ New Recipe</button>
      </div>
      <div className="filters">
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
          <div><div className="form-label" style={{marginBottom:4}}>Search</div>
            <input className="form-input" placeholder="Name, category, notes…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div><div className="form-label" style={{marginBottom:4}}>Category</div>
            <select className="form-select" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>{recipeCats.map(c=><option key={c}>{c}</option>)}</select></div>
          <div><div className="form-label" style={{marginBottom:4}}>Stock</div>
            <select className="form-select" value={filterStock} onChange={e=>setFilterStock(e.target.value)}>
              <option>All</option><option>Stockable</option><option>Stock issue</option></select></div>
          <div><div className="form-label" style={{marginBottom:4}}>Sort</div>
            <select className="form-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              <option value="name">Name A–Z</option><option value="cost_high">Cost: High→Low</option>
              <option value="cost_low">Cost: Low→High</option><option value="yield">Yield</option></select></div>
        </div>
        {(search||filterCat!=='All'||filterStock!=='All')&&<span className="filter-clear" onClick={()=>{setSearch('');setFilterCat('All');setFilterStock('All')}}>✕ Clear — showing {filtered.length} of {recipes.length}</span>}
      </div>

      {filtered.map(r=>{
        const cost=calcCost(r); const ok=checkStock(r)
        return (
          <div className="card" key={r.id} style={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontFamily:'var(--fd)',fontSize:18,fontWeight:700}}>{r.name}</div>
                <div style={{fontSize:12,color:'var(--slate)',marginTop:2}}>{r.category} · {r.base_yield} {r.yield_unit} · {r.ings?.length} ingredients</div>
              </div>
              <div className="btn-group">
                <span className={`badge badge-${ok?'ok':'out'}`}>{ok?'Stockable':'Stock issue'}</span>
                <button className="btn btn-sm" onClick={()=>openEdit(r)}>Edit</button>
                <button className="btn btn-sm btn-primary" onClick={()=>{setSimRecipe(r.id);setPage('simulate')}}>Cook</button>
                <button className="btn btn-sm btn-danger" onClick={()=>del(r)}>✕</button>
              </div>
            </div>
            <div style={{margin:'10px 0'}}>
              {r.ings?.map(ri=>{const ing=ingredients.find(i=>i.id===ri.id); return ing?<span key={ri.id} className="ing-tag">{ing.name} {ri.qty}{ri.unit}</span>:null})}
            </div>
            <div style={{display:'flex',gap:20,paddingTop:8,borderTop:'1px solid var(--border)',fontSize:13}}>
              <span>Total: <b style={{color:'var(--accent)'}}>EGP {cost.toFixed(2)}</b></span>
              <span>Per {r.yield_unit.replace(/s$/,'')}: <b style={{color:'var(--accent)'}}>EGP {(cost/r.base_yield).toFixed(3)}</b></span>
              {r.profit_margin!=null && <span style={{color:'var(--success)',fontWeight:500}}>Sell ≥ EGP {(cost/r.base_yield/(1-r.profit_margin/100)).toFixed(2)}/unit ({r.profit_margin}% margin)</span>}
              {r.notes&&<span style={{color:'var(--slate)'}}>📝 {r.notes}</span>}
            </div>
          </div>
        )
      })}
      {filtered.length===0&&<div className="empty"><div className="empty-icon">🍽</div><h3>No recipes match your filters</h3></div>}

      {modal&&(
        <Modal onClose={()=>setModal(false)} wide>
          <div className="modal-title">{editing?'Edit Recipe':'New Recipe'}</div>
          {error&&<div className="error-msg">{error}</div>}
          <div className="form-row">
            <div className="form-group"><label className="form-label">Name</label>
              <input className="form-input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Pasta Carbonara" autoFocus/></div>
            <div className="form-group"><label className="form-label">Category</label>
              <input className="form-input" value={form.category} onChange={e=>setForm({...form,category:e.target.value})} placeholder="Italian"/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Base Yield</label>
              <input className="form-input" type="number" value={form.base_yield} onChange={e=>setForm({...form,base_yield:e.target.value})}/></div>
            <div className="form-group"><label className="form-label">Yield Unit</label>
              <input className="form-input" value={form.yield_unit} onChange={e=>setForm({...form,yield_unit:e.target.value})} placeholder="portions"/></div>
          </div>
          <div className="form-group"><label className="form-label">Notes</label>
            <textarea className="form-input form-textarea" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={2}/></div>
          <div className="form-group">
            <label className="form-label">Target profit margin % <span style={{fontWeight:400,color:'var(--ink-mute)',textTransform:'none',letterSpacing:0}}>(optional — used to calculate suggested sell price)</span></label>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <input className="form-input" type="number" min={0} max={100} step={1} value={form.profit_margin||''} placeholder="e.g. 65"
                onChange={e=>setForm({...form,profit_margin:e.target.value?parseFloat(e.target.value):null})} style={{maxWidth:120}}/>
              <span className="muted">% — a 65% margin means food cost is 35% of sell price</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Profit Margin % <span style={{color:'var(--ink-mute)',fontWeight:400,textTransform:'none',fontSize:11}}>(optional — used to suggest selling price)</span></label>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <input className="form-input" type="number" min={0} max={99} step={1} value={form.profit_margin}
                placeholder="e.g. 65 means 65% of sell price is profit"
                onChange={e=>setForm({...form,profit_margin:e.target.value})} style={{flex:1}}/>
              {form.profit_margin!==''&&<span className="muted" style={{whiteSpace:'nowrap'}}>= {form.profit_margin}% margin</span>}
            </div>
          </div>
          <div className="divider"/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div className="card-title" style={{margin:0}}>Ingredients</div>
            <button className="btn btn-sm" onClick={()=>setIngRows([...ingRows,{key:uid(),id:'',qty:'',unit:'g'}])}>+ Add</button>
          </div>
          {ingRows.map((row,idx)=>(
            <div key={row.key} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
              <select className="form-select" style={{flex:2}} value={row.id} onChange={e=>setIngRows(ingRows.map((r,i)=>i===idx?{...r,id:e.target.value}:r))}>
                <option value="">— select —</option>
                {ingredients.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
              <input className="form-input" type="number" step="0.01" placeholder="Qty" style={{flex:1}}
                value={row.qty} onChange={e=>setIngRows(ingRows.map((r,i)=>i===idx?{...r,qty:e.target.value}:r))}/>
              <select className="form-select" style={{flex:1}} value={row.unit} onChange={e=>setIngRows(ingRows.map((r,i)=>i===idx?{...r,unit:e.target.value}:r))}>
                {['g','kg','ml','l','piece','tbsp','tsp'].map(u=><option key={u}>{u}</option>)}
              </select>
              <button className="btn btn-sm" onClick={()=>setIngRows(ingRows.filter((_,i)=>i!==idx))}>✕</button>
            </div>
          ))}
          <div className="modal-footer">
            <button className="btn" onClick={()=>setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save Recipe</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// SIMULATE
// ─────────────────────────────────────────────────────────
export function Simulate({ ingredients, recipes, onReload, initialRecipeId, addToHistory, setPage }) {
  const firstId = initialRecipeId || recipes[0]?.id || ''
  const [recipeId,     setRecipeId]     = useState(firstId)
  const [recipeSearch, setRecipeSearch] = useState('')
  const [portions,     setPortions]     = useState(() => { const r=recipes.find(x=>x.id===firstId); return r?r.base_yield:1 })
  const [customSize,   setCustomSize]   = useState(1)
  const [sizePreset,   setSizePreset]   = useState('1')
  const [result,       setResult]       = useState(null)
  const [cooking,      setCooking]      = useState(false)
  const [cookMode,     setCookMode]     = useState('direct')
  const [expiryDate,   setExpiryDate]   = useState('')
  const [stockNotes,   setStockNotes]   = useState('')
  const [done,         setDone]         = useState(null)

  const handleRecipeChange = id => {
    setRecipeId(id); setDone(null)
    const r = recipes.find(x=>x.id===id)
    if (r) setPortions(r.base_yield)
  }
  useEffect(()=>{
    if (initialRecipeId) {
      setRecipeId(initialRecipeId)
      const r=recipes.find(x=>x.id===initialRecipeId)
      if (r) setPortions(r.base_yield)
    }
  },[initialRecipeId])

  const recipe      = recipes.find(r=>r.id===recipeId)
  const minPortions = recipe ? recipe.base_yield : 1
  const sizeMult    = sizePreset==='custom' ? customSize : parseFloat(sizePreset)
  const scale       = recipe ? (portions/recipe.base_yield)*sizeMult : 1

  const filteredRecipes = recipes.filter(r=>!recipeSearch||r.name.toLowerCase().includes(recipeSearch.toLowerCase())||r.category?.toLowerCase().includes(recipeSearch.toLowerCase()))

  useEffect(()=>{ if(recipeId) api.simulateCook(recipeId,scale).then(r=>setResult(r.data)).catch(console.error) },[recipeId,portions,sizeMult])

  const cook = async () => {
    const label = cookMode==='to_stock' ? 'Cook and store as Cooked Stock' : 'Cook and consume directly'
    if (!window.confirm(`${label}\n${recipe?.name} — ${portions} portions\nEstimated cost: EGP ${result?.total?.toFixed(2)}`)) return
    setCooking(true); setDone(null)
    try {
      if (cookMode==='to_stock') {
        const res = await api.cookToStock({
          recipe_id: recipeId,
          scale_factor: scale,
          portions,
          expiry_date: expiryDate || null,
          notes: stockNotes || null
        })
        setDone({success:true, msg:`✓ Stored! ${res.data.quantity} ${res.data.unit} of ${recipe?.name} added to Cooked Stock.${res.data.expiry_date?` Expires ${res.data.expiry_date}`:''} Cost: EGP ${res.data.total_cost?.toFixed(2)}`})
      } else {
        await api.executeCook({recipe_id:recipeId, scale_factor:scale, portions})
        addToHistory({id:uid(), recipeId, recipeName:recipe?.name, category:recipe?.category,
          portions, scale, cost:result?.total||0, cookedAt:new Date().toISOString(), status:'completed',
          ingredients: recipe?.ings?.map(ri=>({ingredient_id:ri.id, qty:ri.qty*scale, unit:ri.unit})) || []
        })
        setDone({success:true, msg:`✓ Cooked! ${portions} ${recipe?.yield_unit} of ${recipe?.name}. Cost: EGP ${result?.total?.toFixed(2)}`})
      }
      onReload()
    } catch(e) {
      const msg = e.response?.data?.detail || (typeof e.response?.data === 'object' ? JSON.stringify(e.response?.data) : 'Cook failed')
      setDone({success:false, msg:`❌ ${msg}`})
    }
    setCooking(false)
  }

  const EGP = n => `EGP ${(+n||0).toFixed(2)}`
  const EGP3 = n => `EGP ${(+n||0).toFixed(3)}`

  return (
    <div className="page" style={{maxWidth:'none'}}>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,600px) minmax(0,1fr)',gap:24,alignItems:'start'}}>

        {/* LEFT — Controls */}
        <div>
          <div className="card" style={{marginBottom:16}}>
            <div className="card-title">Cook Simulation</div>
            <div className="form-group">
              <label className="form-label">Recipe</label>
              <input className="form-input" placeholder="Search…" value={recipeSearch} onChange={e=>setRecipeSearch(e.target.value)} style={{marginBottom:6}}/>
              <select className="form-select" value={recipeId} onChange={e=>handleRecipeChange(e.target.value)}>
                {filteredRecipes.length===0?<option>No recipes found</option>
                  :filteredRecipes.map(r=><option key={r.id} value={r.id}>{r.name}{r.category?` (${r.category})`:''}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" style={{display:'flex',justifyContent:'space-between'}}>
                <span>Portions</span>
                <span style={{color:'var(--accent)',fontWeight:700,fontSize:14}}>{portions} {recipe?.yield_unit}</span>
              </label>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <button className="btn btn-sm" onClick={()=>setPortions(p=>Math.max(minPortions,p-1))}>−</button>
                <input type="range" min={minPortions} max={50} value={Math.min(portions,50)} step={1}
                  style={{flex:1,accentColor:'var(--accent)'}} onChange={e=>{setPortions(parseInt(e.target.value));setDone(null)}}/>
                <button className="btn btn-sm" onClick={()=>setPortions(p=>Math.min(999,p+1))}>+</button>
                <input className="form-input" type="number" min={minPortions} max={9999} step={1} value={portions} style={{width:70,textAlign:'center'}}
                  onFocus={e=>e.target.select()}
                  onChange={e=>{const v=Math.max(minPortions,parseInt(e.target.value)||minPortions);setPortions(v);setDone(null)}}/>
              </div>
              <div className="muted" style={{marginTop:4}}>Min: {minPortions} {recipe?.yield_unit} · drag slider up to 50, or type any number</div>
            </div>

            <div className="form-group">
              <label className="form-label">Scale Preset</label>
              <div className="btn-group" style={{marginBottom:8,flexWrap:'wrap'}}>
                {[['0.5','½×'],['1','1×'],['1.5','1.5×'],['2','2×'],['3','3×'],['custom','Custom']].map(([v,l])=>(
                  <button key={v} className={`btn btn-sm${sizePreset===v?' btn-primary':''}`} onClick={()=>{setSizePreset(v);setDone(null)}}>{l}</button>
                ))}
              </div>
              {sizePreset==='custom'&&(
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <button className="btn btn-sm" onClick={()=>setCustomSize(s=>Math.max(0.1,parseFloat((s-0.1).toFixed(1))))}>−</button>
                  <input className="form-input" type="number" min={0.1} step={0.1}
                    value={customSize} style={{flex:1,textAlign:'center'}}
                    onFocus={e=>e.target.select()}
                    onChange={e=>{const v=parseFloat(e.target.value); if(!isNaN(v)&&v>0) setCustomSize(v)}}/>
                  <button className="btn btn-sm" onClick={()=>setCustomSize(s=>parseFloat((s+0.1).toFixed(1)))}>+</button>
                  <span className="muted">× multiplier</span>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Cook Output</label>
              <div className="btn-group">
                <button className={`btn btn-sm${cookMode==='direct'?' btn-primary':''}`} onClick={()=>setCookMode('direct')}>🍽 Serve directly</button>
                <button className={`btn btn-sm${cookMode==='to_stock'?' btn-primary':''}`} onClick={()=>setCookMode('to_stock')}>🧊 Store as cooked stock</button>
              </div>
              {cookMode==='to_stock'&&(
                <div style={{marginTop:10,padding:12,background:'var(--info-bg)',borderRadius:8,border:'1px solid var(--info-line)'}}>
                  <div className="muted" style={{marginBottom:8}}>Output goes to Cooked Stock — ready for Item assembly.</div>
                  <div className="form-row">
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Expiry date (optional)</label>
                      <input className="form-input" type="date" value={expiryDate} onChange={e=>setExpiryDate(e.target.value)}/>
                    </div>
                    <div className="form-group" style={{marginBottom:0}}>
                      <label className="form-label">Notes (optional)</label>
                      <input className="form-input" value={stockNotes} onChange={e=>setStockNotes(e.target.value)} placeholder="e.g. Batch A"/>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {result&&(
            <div className="sim-box" style={{marginBottom:12}}>
              <div className="sim-line"><span>Recipe</span><span><b>{recipe?.name}</b></span></div>
              <div className="sim-line"><span>Portions</span><span><b>{portions} {recipe?.yield_unit}</b></span></div>
              <div className="sim-line"><span>Scale</span><span><b>{scale.toFixed(2)}×</b></span></div>
              {result.breakdown?.map(b=>(
                <div className="sim-line" key={b.name}><span>{b.name}</span><span style={{color:'var(--ink-mute)'}}>{b.qty.toFixed(1)} {b.unit} — <b style={{color:'var(--ink)'}}>{EGP(b.cost)}</b></span></div>
              ))}
              <div className="sim-line"><span>Total cost</span><span style={{color:'var(--accent)',fontSize:16}}><b>{EGP(result.total)}</b></span></div>
              <div className="sim-line"><span>Per {recipe?.yield_unit?.replace(/s$/,'')||'portion'}</span><span><b>{EGP3(result.per_portion)}</b></span></div>
              {recipe?.profit_margin&&<div className="sim-line"><span>Suggested sell price ({recipe.profit_margin}% margin)</span><span style={{color:'var(--success)'}}><b>{EGP(result.per_portion/(1-recipe.profit_margin/100))}</b> per {recipe?.yield_unit?.replace(/s$/,'')||'portion'}</span></div>}
              <div className="sim-line"><span>Stock</span>
                <span style={{color:result.all_ok?'var(--success)':'var(--danger)',fontWeight:600}}>{result.all_ok?'✓ Sufficient':'✗ Insufficient'}</span>
              </div>
            </div>
          )}
          {result?.issues?.length>0&&<div className="alert-strip danger" style={{marginTop:10}}>⚠ {result.issues.map(i=>`${i.name}: need ${i.needed.toFixed(1)}, have ${i.have.toFixed(1)}`).join(' · ')}</div>}
          {done&&<div className={`alert-strip ${done.success?'success':'danger'}`} style={{marginTop:10}}>{done.msg}</div>}
          <button className="btn btn-primary" style={{width:'100%',padding:'13px 0',marginTop:12,fontSize:14,letterSpacing:'-0.01em'}}
            onClick={cook} disabled={!result?.all_ok||cooking}>
            {cooking?'Cooking…':cookMode==='to_stock'?'🧊 Cook & Store to Stock':'🍳 Execute Cook — Deduct Inventory'}
          </button>
        </div>

        {/* RIGHT — AI Assistant */}
        <InlineAIAssistant ingredients={ingredients} recipes={recipes} setPage={setPage} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// INLINE AI ASSISTANT (Simulate page sidebar — full chat)
// ─────────────────────────────────────────────────────────
function InlineAIAssistant({ ingredients, recipes, setPage }) {
  const [messages, setMessages] = useState([{role:'ai',text:'Hello Chef! I have access to your full kitchen — ask me about costs, scaling, substitutions, or what to cook right now.',time:new Date()}])
  const [input,    setInput]    = useState('')
  const [thinking, setThinking] = useState(false)

  const stockStat = ing => { if(!ing.stock||ing.stock<=0) return 'OUT'; if(ing.stock<=ing.threshold) return 'LOW'; return 'OK' }

  const buildContext = () => {
    const recs = recipes.map(r => {
      let c=0; r.ings?.forEach(ri=>{const ing=ingredients.find(i=>i.id===ri.id);if(ing)c+=ri.qty*ing.cost})
      const ok=r.ings?.every(ri=>{const ing=ingredients.find(i=>i.id===ri.id);return ing&&ing.stock>=ri.qty})
      return `- "${r.name}": ${r.base_yield} ${r.yield_unit}, EGP ${c.toFixed(2)} total (EGP ${(c/r.base_yield).toFixed(2)}/unit), ${ok?'READY':'BLOCKED'}`
    }).join('')
    const ings = ingredients.map(i=>`- "${i.name}": ${i.stock} ${i.unit} (${stockStat(i)}), EGP ${i.cost}/${i.unit}`).join('')
    return `RECIPES:
${recs}

INGREDIENTS:
${ings}`
  }

  const SYSTEM = `You are ChefOS AI, a kitchen advisor. You have live access to the chef's kitchen data below.
Answer concisely (under 120 words). Lead with the answer. Use EGP for currency. Use real numbers from the data.
${buildContext()}`

  const send = async text => {
    const q = text || input.trim()
    if (!q || thinking) return
    setInput('')
    const newMsgs = [...messages, {role:'user',text:q}]
    setMessages(newMsgs); setThinking(true)
    const reply = mgzzAnswer(q, ingredients, recipes, [], [], [])
    setTimeout(() => {
      setMessages(m => [...m, { role: 'ai', text: reply }])
      setThinking(false)
    }, 300)
  }

  const suggestions = ['What can I cook now?','Most expensive recipe?','Any stock issues?','Scale to 20 portions?']

  return (
    <div className="card" style={{display:'flex',flexDirection:'column',height:560,position:'sticky',top:'calc(var(--topbar-h) + 16px)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div className="card-title" style={{margin:0}}>✦ Mgzz Kitchen Assistant</div>
        {setPage && <button className="btn btn-sm" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setPage('ai')}>Open full assistant ↗</button>}
      </div>
      <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:10,paddingBottom:8}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:'flex',gap:8,justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
            {m.role==='ai'&&<div style={{width:26,height:26,borderRadius:'50%',background:'var(--espresso)',color:'var(--cream)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0,fontWeight:700}}>✦</div>}
            <div style={{maxWidth:'85%',padding:'10px 13px',borderRadius:m.role==='ai'?'4px 12px 12px 12px':'12px 4px 12px 12px',
              background:m.role==='ai'?'var(--bg-card)':'var(--espresso)',color:m.role==='ai'?'var(--ink)':'var(--cream)',
              border:m.role==='ai'?'1px solid var(--line)':'none',fontSize:13,lineHeight:1.55,whiteSpace:'pre-wrap'}}>
              {m.text}
            </div>
          </div>
        ))}
        {thinking&&(
          <div style={{display:'flex',gap:8}}>
            <div style={{width:26,height:26,borderRadius:'50%',background:'var(--espresso)',color:'var(--cream)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0}}>✦</div>
            <div style={{padding:'10px 14px',background:'var(--bg-card)',border:'1px solid var(--line)',borderRadius:'4px 12px 12px 12px',display:'flex',gap:5}}>
              {[0,1,2].map(i=><span key={i} style={{width:7,height:7,borderRadius:'50%',background:'var(--accent)',display:'inline-block',animation:`typing 1.4s ${i*0.2}s ease-in-out infinite`}}/>)}
            </div>
          </div>
        )}
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:5,paddingTop:10,borderTop:'1px solid var(--line)',marginBottom:8}}>
        {suggestions.map(q=>(
          <button key={q} onClick={()=>send(q)} style={{padding:'4px 10px',border:'1px solid var(--line)',borderRadius:20,fontSize:11.5,cursor:'pointer',color:'var(--ink-soft)',background:'var(--bg-card)',fontFamily:'var(--sans)',transition:'all 0.15s'}}
            onMouseEnter={e=>{e.target.style.borderColor='var(--accent)';e.target.style.color='var(--accent)'}}
            onMouseLeave={e=>{e.target.style.borderColor='var(--line)';e.target.style.color='var(--ink-soft)'}}>
            {q}
          </button>
        ))}
      </div>
      <div style={{display:'flex',gap:8}}>
        <input className="form-input" value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Ask anything about your kitchen…"
          style={{fontSize:13}}/>
        <button className="btn btn-accent btn-sm" onClick={()=>send()} disabled={thinking||!input.trim()} style={{padding:'0 14px',whiteSpace:'nowrap'}}>
          Send
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
// COOK HISTORY
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// COOK & ASSEMBLY HISTORY
// ─────────────────────────────────────────────────────────
export function HistoryPage({ history, onCancel, onDelete, onClearAll, onClearFiltered }) {
  const [filter,       setFilter]       = useState('All')   // All | completed | cancelled
  const [typeFilter,   setTypeFilter]   = useState('All')   // All | cook | assembly
  const [search,       setSearch]       = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [cancelModal,  setCancelModal]  = useState(null)
  const [cancelAction, setCancelAction] = useState('mark')
  const [detailId,     setDetailId]     = useState(null)

  const filtered = history.filter(h => {
    if (filter !== 'All'     && h.status !== filter.toLowerCase()) return false
    if (typeFilter !== 'All' && (h.type||'cook') !== typeFilter.toLowerCase()) return false
    if (search && !h.recipeName?.toLowerCase().includes(search.toLowerCase()) && !h.category?.toLowerCase().includes(search.toLowerCase()) && !h.itemName?.toLowerCase().includes(search.toLowerCase())) return false
    if (dateFrom && new Date(h.cookedAt) < new Date(dateFrom)) return false
    if (dateTo   && new Date(h.cookedAt) > new Date(dateTo+'T23:59:59')) return false
    return true
  })

  const completed      = history.filter(h => h.status === 'completed')
  const assemblies     = history.filter(h => (h.type||'cook') === 'assembly' && h.status === 'completed')
  const cooks          = history.filter(h => (h.type||'cook') === 'cook'     && h.status === 'completed')
  const totalCost      = completed.reduce((s,h) => s + (h.cost||0), 0)
  const totalPortions  = cooks.reduce((s,h) => s + (h.portions||0), 0)
  const hasFilters     = filter !== 'All' || typeFilter !== 'All' || search || dateFrom || dateTo

  const doCancel = async () => {
    if (cancelAction === 'delete') {
      onDelete(cancelModal.id)
    } else {
      onCancel(cancelModal.id, cancelAction)
    }
    setCancelModal(null)
  }

  const entryTypeIcon  = h => (h.type||'cook') === 'assembly' ? '🍰' : '🍳'
  const entryTypeLabel = h => (h.type||'cook') === 'assembly' ? 'Assembly' : 'Cook'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Production History</div>
          <div className="page-sub">{history.length} total entries — cooks and item assemblies</div>
        </div>
        <div className="btn-group">
          {hasFilters && filtered.length > 0 && (
            <button className="btn btn-sm btn-danger"
              onClick={() => { if(window.confirm(`Delete ${filtered.length} filtered entries? Cannot be undone.`)) onClearFiltered(filtered.map(h=>h.id)) }}>
              Delete filtered ({filtered.length})
            </button>
          )}
          {history.length > 0 && (
            <button className="btn btn-sm btn-danger"
              onClick={() => { if(window.confirm(`Delete ALL ${history.length} history entries? Cannot be undone.`)) onClearAll() }}>
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
          <div><div className="form-label" style={{marginBottom:4}}>Search</div>
            <input className="form-input" placeholder="Name or category…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div><div className="form-label" style={{marginBottom:4}}>Type</div>
            <select className="form-select" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
              <option>All</option><option value="cook">Cooks only</option><option value="assembly">Assemblies only</option>
            </select></div>
          <div><div className="form-label" style={{marginBottom:4}}>Status</div>
            <select className="form-select" value={filter} onChange={e=>setFilter(e.target.value)}>
              <option>All</option><option>Completed</option><option>Cancelled</option>
            </select></div>
          <div><div className="form-label" style={{marginBottom:4}}>From date</div>
            <input className="form-input" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 3fr',gap:10,marginTop:10}}>
          <div><div className="form-label" style={{marginBottom:4}}>To date</div>
            <input className="form-input" type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></div>
          <div style={{alignSelf:'flex-end'}}>
            {hasFilters && <span className="filter-clear" onClick={()=>{setFilter('All');setTypeFilter('All');setSearch('');setDateFrom('');setDateTo('')}}>
              ✕ Clear filters — showing {filtered.length} of {history.length}
            </span>}
          </div>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="metrics" style={{marginBottom:16}}>
        <div className="metric">
          <div className="metric-bar"/>
          <div className="metric-icon">🍳</div>
          <div className="metric-label">Recipe cooks</div>
          <div className="metric-value">{cooks.length}</div>
          <div className="metric-sub">{totalPortions} portions total</div>
        </div>
        <div className="metric">
          <div className="metric-bar"/>
          <div className="metric-icon">🍰</div>
          <div className="metric-label">Item assemblies</div>
          <div className="metric-value">{assemblies.length}</div>
          <div className="metric-sub">{assemblies.reduce((s,h)=>s+(h.portions||0),0)} pieces total</div>
        </div>
        <div className="metric gold">
          <div className="metric-bar"/>
          <div className="metric-icon">💰</div>
          <div className="metric-label">Total cost</div>
          <div className="metric-value">EGP ${totalCost.toFixed(2)}</div>
        </div>
        <div className="metric">
          <div className="metric-bar"/>
          <div className="metric-icon">❌</div>
          <div className="metric-label">Cancelled</div>
          <div className="metric-value">{history.filter(h=>h.status==='cancelled').length}</div>
        </div>
      </div>

      {filtered.length === 0
        ? <div className="empty"><div className="empty-icon">📋</div><h3>No history matches your filters</h3></div>
        : <div className="card">
            {[...filtered].reverse().map(h => {
              const isAssembly = (h.type||'cook') === 'assembly'
              const isDetail   = detailId === h.id
              return (
                <div key={h.id} style={{borderBottom:'1px solid var(--border)',opacity:h.status==='cancelled'?0.55:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0'}}>
                    {/* Type icon */}
                    <span style={{fontSize:18,flexShrink:0}}>{entryTypeIcon(h)}</span>

                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <span className="row-name">{h.recipeName || h.itemName}</span>
                        <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,
                          background:isAssembly?'var(--sky-lt)':'var(--sage-lt)',
                          color:isAssembly?'var(--sky)':'var(--sage)'}}>
                          {entryTypeLabel(h)}
                        </span>
                        <span className={`badge badge-${h.status==='completed'?'ok':'out'}`}>{h.status}</span>
                        {h.category && <span className="badge badge-gold">{h.category}</span>}
                      </div>
                      <div className="row-meta">
                        {h.portions} {isAssembly?(h.yield_unit||'pieces'):'portions'}
                        {h.scale && ` · scale ${h.scale.toFixed(2)}×`}
                        {` · cost $${h.cost?.toFixed(2)}`}
                        {` · ${new Date(h.cookedAt).toLocaleString()}`}
                      </div>
                    </div>

                    <div className="btn-group">
                      {/* Detail toggle for assemblies */}
                      {isAssembly && (h.subRecipes?.length > 0 || h.subIngs?.length > 0) && (
                        <button className="btn btn-sm btn-ghost" onClick={() => setDetailId(isDetail ? null : h.id)}>
                          {isDetail ? 'Hide' : 'Details'}
                        </button>
                      )}
                      {h.status === 'completed' && (
                        <button className="btn btn-sm btn-danger" onClick={() => { setCancelModal(h); setCancelAction('mark') }}>
                          Cancel
                        </button>
                      )}
                      {h.status === 'cancelled' && (
                        <button className="btn btn-sm" onClick={() => onDelete(h.id)}>Delete entry</button>
                      )}
                    </div>
                  </div>

                  {/* Assembly detail breakdown */}
                  {isDetail && isAssembly && (
                    <div style={{padding:'0 0 12px 28px'}}>
                      <div style={{background:'var(--warm)',borderRadius:8,padding:'10px 14px',fontSize:12}}>
                        {h.subRecipes?.length > 0 && (
                          <div style={{marginBottom:6}}>
                            <div style={{fontWeight:600,color:'var(--slate)',marginBottom:4}}>Sub-recipes used (from cooked stock):</div>
                            {h.subRecipes.map((sr,i) => (
                              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',color:'var(--sky)'}}>
                                <span>{sr.name}</span>
                                <span>{sr.qty?.toFixed(1)} {sr.unit}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {h.subIngs?.length > 0 && (
                          <div>
                            <div style={{fontWeight:600,color:'var(--slate)',marginBottom:4}}>Direct ingredients used:</div>
                            {h.subIngs.map((si,i) => (
                              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',color:'var(--sage)'}}>
                                <span>{si.name}</span>
                                <span>{si.qty?.toFixed(1)} {si.unit}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{borderTop:'1px solid var(--border)',marginTop:8,paddingTop:8,display:'flex',justifyContent:'space-between',fontWeight:600}}>
                          <span>Total assembly cost</span>
                          <span style={{color:'var(--gold)'}}>${h.cost?.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
      }

      {/* Cancel / Action modal */}
      {cancelModal && (
        <Modal onClose={() => setCancelModal(null)}>
          <div className="modal-title">
            {(cancelModal.type||'cook') === 'assembly' ? 'Cancel Assembly' : 'Cancel Cook'} — {cancelModal.recipeName || cancelModal.itemName}
          </div>
          <div style={{background:'var(--warm)',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13}}>
            {cancelModal.portions} {(cancelModal.type||'cook') === 'assembly' ? 'pieces' : 'portions'} ·
            ${cancelModal.cost?.toFixed(2)} · {new Date(cancelModal.cookedAt).toLocaleDateString()}
          </div>
          <div className="form-group">
            <label className="form-label">What should happen to the used stock?</label>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:6}}>
              {[
                ['mark',    '📋 Mark as cancelled only',
                            'Just change status — no stock changes.'],
                ...((cancelModal.type||'cook') !== 'assembly' ? [
                  ['restock', '📦 Restock ingredients to inventory',
                              'Adds the raw ingredients back to stock as a new batch.'],
                ] : []),
                ['waste',   '🗑 Log as waste',
                            'Records the cost as a loss in the Waste Log.'],
                ['delete',  '❌ Remove from history completely',
                            'Permanently removes this entry. No stock changes.'],
              ].map(([val, label, desc]) => (
                <label key={val} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 12px',cursor:'pointer',borderRadius:8,
                  border:`1px solid ${cancelAction===val?'var(--gold)':'var(--border)'}`,
                  background:cancelAction===val?'var(--gold-pale)':'var(--cream)'}}>
                  <input type="radio" value={val} checked={cancelAction===val} onChange={() => setCancelAction(val)} style={{marginTop:2}}/>
                  <div>
                    <div style={{fontWeight:500,fontSize:13}}>{label}</div>
                    <div className="muted">{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setCancelModal(null)}>Keep as completed</button>
            <button className="btn btn-danger" onClick={doCancel}>Confirm</button>
          </div>
        </Modal>
      )}
    </div>
  )
}


// ═════════════════════════════════════════════════════════
// AI KITCHEN ASSISTANT — Full-page experience
// ═════════════════════════════════════════════════════════
export function AIAssistantPage({ ingredients, recipes, items, events, alerts, setPage, setSimRecipe }) {
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [thinking, setThinking] = useState(false)
  const [err,      setErr]      = useState('')
  const [listening, setListening] = useState(false)
  const endRef = useRef(null)
  const recogRef = useRef(null)

  // Auto-scroll to the newest message
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, thinking])

  // Voice input (hands-free) via the browser Speech API
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setErr('Voice input isn\'t available in this window — please type instead.'); return }
    if (listening) { recogRef.current && recogRef.current.stop(); return }
    setErr('')
    const r = new SR()
    r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1
    r.onresult = (e) => { const t = e.results[0][0].transcript; setInput(t); setTimeout(() => send(t), 150) }
    r.onerror = () => setListening(false)
    r.onend = () => setListening(false)
    recogRef.current = r; setListening(true)
    try { r.start() } catch { setListening(false) }
  }

  // Build full kitchen context — exhaustive, structured for AI reasoning
  const buildContext = () => {
    const stockStat = ing => {
      if (!ing.stock || ing.stock <= 0) return 'OUT'
      if (ing.stock <= ing.threshold) return 'LOW'
      return 'OK'
    }

    const recipeLine = r => {
      let totalCost = 0
      const ingDetails = []
      r.ings?.forEach(ri => {
        const ing = ingredients.find(i => i.id === ri.id)
        if (ing) {
          totalCost += ri.qty * ing.cost
          ingDetails.push(`${ing.name} ${ri.qty}${ri.unit}`)
        }
      })
      const allOk = r.ings?.every(ri => {
        const ing = ingredients.find(i => i.id === ri.id)
        return ing && ing.stock >= ri.qty
      })
      const shortfalls = r.ings?.filter(ri => {
        const ing = ingredients.find(i => i.id === ri.id)
        return !ing || ing.stock < ri.qty
      }).map(ri => {
        const ing = ingredients.find(i => i.id === ri.id)
        return ing ? `${ing.name}(need ${ri.qty}, have ${ing.stock})` : 'unknown'
      })
      return `- "${r.name}" [${r.category||'—'}]: yields ${r.base_yield} ${r.yield_unit}, cost $EGP ${totalCost.toFixed(2)} ($${(totalCost/r.base_yield).toFixed(3)}/unit), ingredients: [${ingDetails.join(', ')}], stock: ${allOk?'READY':'BLOCKED — '+shortfalls.join(', ')}`
    }

    const ingLine = i => {
      const status = stockStat(i)
      const exp = i.batches?.filter(b => b.expiry_date).map(b => {
        const d = new Date(b.expiry_date), today = new Date()
        const days = Math.round((d - today) / 86400000)
        return `${b.quantity}${i.unit} expires in ${days}d`
      }).join('; ')
      return `- "${i.name}" [${i.category_name||'uncategorised'}]: ${i.stock} ${i.unit} (status: ${status}, threshold: ${i.threshold}), $${i.cost}/${i.unit}${exp?`, expiry: ${exp}`:''}${i.supplier?`, supplier: ${i.supplier}`:''}`
    }

    const itemLine = it => {
      const subRecipes = it.sub_recipes?.map(sr => `${sr.recipe_name} ${sr.quantity}${sr.unit}`).join(' + ') || ''
      const subIngs = it.sub_ings?.map(si => `${si.ingredient_name} ${si.qty}${si.unit}`).join(' + ') || ''
      return `- "${it.name}" [${it.category||'—'}]: yields ${it.base_yield} ${it.yield_unit}, cost $${it.total_cost?.toFixed(2)||'—'}, components: [sub-recipes: ${subRecipes||'none'}; ingredients: ${subIngs||'none'}], ready: ${it.all_stock_ok?'YES':'NO'}`
    }

    const eventLine = e => {
      return `- "${e.name}" [${e.event_date||'—'}]: ${e.guest_count||0} guests, status ${e.status}, total $${e.total?.toFixed(2)||'—'}`
    }

    return `
## REAL-TIME KITCHEN STATE

### INGREDIENTS (${ingredients.length} total)
${ingredients.map(ingLine).join('\n')}

### RECIPES (${recipes.length} total)
${recipes.map(recipeLine).join('\n')}

### ASSEMBLED ITEMS (${items?.length||0} total)
${items?.length ? items.map(itemLine).join('\n') : '(none defined)'}

### EVENTS (${events?.length||0} total)
${events?.length ? events.map(eventLine).join('\n') : '(none planned)'}

### ACTIVE ALERTS (${alerts?.length||0} total)
${alerts?.length ? alerts.map(a => `- ${a.type.toUpperCase()}: ${a.ingredient} — ${a.type==='out'?'OUT OF STOCK':a.type==='low'?`only ${a.stock} ${a.unit} left (threshold ${a.threshold})`:a.type==='expired'?`EXPIRED ${a.qty} ${a.unit}`:a.type==='critical'?`expires ${a.expiry} (${a.qty} ${a.unit})`:`expiring ${a.expiry} (${a.qty} ${a.unit})`}`).join('\n') : '(no alerts — all good)'}
`.trim()
  }

  // System prompt that makes the AI genuinely useful for chefs
  const SYSTEM_PROMPT = `You are ChefOS Assistant — an expert AI kitchen advisor with deep knowledge of culinary operations, food cost management, recipe scaling, inventory logistics, and food safety. You have full real-time access to the chef's kitchen data.

YOUR ROLE:
You help chefs make fast, confident decisions during service. You think like a head chef + cost accountant + inventory manager combined. Answer with precision, brevity, and actionable specifics.

CAPABILITIES — answer questions about:
1. **What can I cook now?** — check ingredient stock against recipe requirements
2. **Recipe costing** — total cost, cost per portion, profit margins, scaling
3. **Inventory analysis** — what's low, what's expiring, what to restock first, FIFO order
4. **Item assembly** — multi-recipe items (e.g. lemon tart = lemon cream + meringue + ingredients), check feasibility
5. **Event planning** — scale recipes for X guests, calculate total cost, ingredient shopping list
6. **Substitutions** — suggest swaps when ingredients are out (be culinarily intelligent)
7. **Waste reduction** — identify expiring items, suggest dishes to use them in, calculate waste cost
8. **Cooking advice** — techniques, timing, sequencing for parallel prep, mise en place
9. **Food safety** — expiry warnings, cross-contamination risks, holding times
10. **Menu engineering** — which dishes are most/least profitable, cost ratios, suggestions
11. **Shopping lists** — exactly what to buy and quantities, given a target (event, period, recipes)
12. **Pricing** — suggest selling prices given target food-cost % (typically 25-35% of menu price)
13. **Scaling math** — accurate ingredient quantities for any portion count
14. **Egyptian cuisine context** — ingredient availability, traditional dishes, local equivalents

RESPONSE STYLE:
- Lead with the direct answer in the first sentence — chefs are busy
- Use real numbers from the kitchen data (never make up amounts)
- Bullet points for lists, but keep them short (4-6 items max)
- If suggesting an action, mention which page in the app to use (Simulate, Items, Events, Inventory, etc.)
- For substitutions, give 2-3 options with brief reasoning
- For costs, always show both total and per-unit
- For warnings, be direct: "DON'T USE — expired" or "URGENT: only 200g of butter left"
- If you cannot answer due to missing data, say so honestly and suggest what to log
- Use metric units (grams, ml, kg, l) — Egyptian context
- Currency: EGP if the chef mentions Egypt or LE, otherwise dollars (default)
- Keep responses under 200 words unless deeply technical question

NEVER:
- Make up data not in the context (no fake ingredients, no fake costs)
- Give generic advice when specific data exists
- Suggest cooking with expired ingredients
- Recommend recipes that block on out-of-stock ingredients without saying so first
- Use overly formal language — chefs are practical people

${buildContext()}`

  const send = async (textOverride) => {
    const text = (textOverride || input).trim()
    if (!text || thinking) return
    setInput('')
    setErr('')
    const userMsg = { role: 'user', text, time: new Date() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setThinking(true)

    const answer = mgzzAnswer(text, ingredients, recipes, items, events, alerts)
    setTimeout(() => {
      setMessages(m => [...m, { role: 'ai', text: answer, time: new Date() }])
      setThinking(false)
    }, 300)
  }

  const formatTime = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  const exampleRecipe = recipes[0]?.name
  const quickActions = [
    { icon: '🍳', title: exampleRecipe ? `Make ${exampleRecipe} for 20` : 'Make a recipe for 20 people', desc: 'Scaled ingredients, cost, shopping list & steps', q: exampleRecipe ? `Make ${exampleRecipe} for 20 people` : 'Make a recipe for 20 people' },
    { icon: '✅', title: 'What can I cook right now?', desc: 'Dishes ready to make with current stock', q: 'What can I cook right now?' },
    { icon: '🎉', title: 'Plan an event for 50 guests', desc: 'Scale dishes, total cost, combined shopping list', q: 'Plan an event for 50 guests' },
    { icon: '🛒', title: 'Build my shopping list', desc: 'Exactly what to restock and how much', q: 'Build my shopping list' },
    { icon: '⚠️', title: 'What\'s urgent?', desc: 'Out of stock, low, and expiring items', q: "What's urgent?" },
    { icon: '♻️', title: 'Use up what\'s expiring', desc: 'Recipes that use soon-to-expire stock', q: 'Use up my expiring ingredients' },
    { icon: '💰', title: 'Which recipes cost the most?', desc: 'Cost per portion + suggested sell price', q: 'Which recipes cost the most per portion?' },
    { icon: '📦', title: 'What\'s my inventory worth?', desc: 'Total stock value on hand', q: "What's my inventory worth?" },
  ]

  return (
    <div className="ai-page">
      <div className="ai-shell">
        <aside className="ai-sidebar">
          <div>
            <h4>Quick Actions</h4>
            {quickActions.slice(0, 4).map((a, i) => (
              <button key={i} className="ai-suggest-btn" onClick={() => send(a.q)}>{a.icon} {a.title}</button>
            ))}
          </div>
          <div>
            <h4>Conversation</h4>
            <button className="ai-suggest-btn" onClick={() => setMessages([])}>↻ New chat</button>
            <button className="ai-suggest-btn" onClick={() => setPage('inventory')}>📦 Open Inventory</button>
            <button className="ai-suggest-btn" onClick={() => setPage('recipes')}>📋 Open Recipes</button>
            <button className="ai-suggest-btn" onClick={() => setPage('items')}>🍰 Open Items</button>
          </div>
          <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
            <b>Powered by Mgzz's intelligence.</b><br/>
            ChefOS Assistant has full live access to your inventory, recipes, items, events, and alerts. Ask anything.
          </div>
        </aside>

        <div className="ai-main">
          {messages.length === 0 ? (
            <div className="ai-empty-state">
              <div className="ai-empty-icon">✦</div>
              <div className="ai-empty-title">How can I help you, Chef?</div>
              <div className="ai-empty-sub">
                I work from your real recipes, costs and live stock. Tell me a dish and a headcount —
                like <b>"make {exampleRecipe || 'Pasta Carbonara'} for 20 people"</b> — and I'll give you the
                exact ingredients, what to buy, the total cost, and step-by-step what to do.
              </div>
              <div className="ai-quick-actions">
                {quickActions.map((a, i) => (
                  <button key={i} className="ai-quick-card" onClick={() => send(a.q)}>
                    <div className="ai-quick-card-icon">{a.icon}</div>
                    <div className="ai-quick-card-title">{a.title}</div>
                    <div className="ai-quick-card-desc">{a.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="ai-messages">
              {messages.map((m, i) => (
                <div key={i} className={`ai-msg-row ${m.role}`}>
                  <div className={`ai-avatar ${m.role}`}>{m.role === 'ai' ? '✦' : 'C'}</div>
                  <div className="ai-msg-content">
                    <div className="ai-msg-bubble">{m.text}</div>
                    <div className="ai-msg-time">
                      {m.time ? formatTime(m.time) : ''}
                      {m.role === 'ai' && (
                        <button className="ai-print-btn" title="Print or save as PDF"
                          onClick={() => printDoc('Kitchen note', m.text)}>🖨 Print / PDF</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="ai-msg-row ai">
                  <div className="ai-avatar ai">✦</div>
                  <div className="ai-thinking"><span/><span/><span/></div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}

          <div className="ai-input-area">
            {err && <div className="error-msg" style={{ maxWidth: 900, margin: '0 auto 10px' }}>{err}</div>}
            <div className="ai-input-row">
              <textarea
                className="ai-input"
                placeholder="Ask anything about your kitchen — recipes, costs, what to cook, who to feed, what's expiring…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
                }}
                rows={1}
              />
              <button className={`ai-mic-btn${listening ? ' listening' : ''}`} onClick={startVoice}
                title={listening ? 'Listening… click to stop' : 'Speak your question'}>{listening ? '●' : '🎤'}</button>
              <button className="ai-send-btn" onClick={() => send()} disabled={thinking || !input.trim()} title="Send (Enter)">→</button>
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-faint)', marginTop: 8 }}>
              Press <b>Enter</b> to send · <b>Shift+Enter</b> for newline
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Print / Save-as-PDF any answer (uses a hidden iframe so it works inside the app)
function printDoc(title, text, brand) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const when = new Date().toLocaleString()
  let saved = ''
  try { saved = localStorage.getItem('chefos_brand') || '' } catch (e) {}
  const name = brand || saved || 'ChefOS'
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)} — ${esc(title)}</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;color:#2E1A0E;padding:34px;max-width:720px;margin:0 auto}
    h1{font-family:'Cormorant Garamond',Georgia,serif;color:#6C0B25;font-size:30px;margin:0}
    .meta{color:#7a6f5a;font-size:12px;margin:2px 0 18px}
    pre{white-space:pre-wrap;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.65;margin:0}
    .foot{margin-top:26px;border-top:1px solid #e3dcc4;padding-top:10px;color:#9b8f78;font-size:11px}
  </style></head><body>
    <h1>${esc(name)}</h1><div class="meta">${esc(title)} · ${esc(when)}</div>
    <pre>${esc(text)}</pre><div class="foot">Powered by Mgzz's intelligence</div>
  </body></html>`
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow.document
  doc.open(); doc.write(html); doc.close()
  iframe.contentWindow.focus()
  setTimeout(() => { try { iframe.contentWindow.print() } catch (e) {} setTimeout(() => { try { document.body.removeChild(iframe) } catch (e) {} }, 1500) }, 300)
}

// ═════════════════════════════════════════════════════════
// MGZZ ASSISTANT — data-driven kitchen engine (exact, offline)
// Uses the chef's real recipes, ingredient costs and live stock.
// ═════════════════════════════════════════════════════════
const _num = (n) => { const r = Math.round((n + Number.EPSILON) * 100) / 100; return String(r) }
const _money = (n) => 'EGP ' + (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2)
// Chef's target gross profit margin % (set in Settings → Brand)
const _margin = () => { try { const m = parseFloat(localStorage.getItem('chefos_margin')); return isNaN(m) ? 70 : Math.max(0, Math.min(95, m)) } catch (e) { return 70 } }
const _sellAt = (cost, m) => (m < 100 ? cost / (1 - m / 100) : cost)

function _recipeCost(r, ingredients, scale = 1) {
  let total = 0
  for (const ri of (r.ings || [])) {
    const ing = ingredients.find((i) => i.id === ri.id)
    if (ing) total += ri.qty * scale * ing.cost
  }
  return total
}

function _findRecipe(q, recipes) {
  const ql = ' ' + q.toLowerCase() + ' '
  let best = null, bestLen = 0
  for (const r of recipes) {
    const n = (r.name || '').toLowerCase()
    if (n && ql.includes(n) && n.length > bestLen) { best = r; bestLen = n.length }
  }
  if (best) return best
  // word-overlap fallback (e.g. "carbonara" → "Pasta Carbonara")
  const qWords = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  let bestScore = 0
  for (const r of recipes) {
    const nWords = (r.name || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2)
    const score = nWords.filter((w) => qWords.includes(w)).length
    if (score > bestScore) { bestScore = score; best = r }
  }
  return bestScore ? best : null
}

function _extractCount(q) {
  const m = q.toLowerCase().match(/(\d{1,5})\s*(people|persons?|ppl|guests?|portions?|servings?|pax|covers?)?/)
  return m ? parseInt(m[1], 10) : null
}

function _recipeGuide(r, people, ingredients) {
  const base = r.base_yield || 1
  const target = people || base
  const scale = target / base
  const lines = [], shopping = [], prep = []
  let total = 0, missing = false
  for (const ri of (r.ings || [])) {
    const ing = ingredients.find((i) => i.id === ri.id)
    if (!ing) { lines.push('• (an ingredient is missing from your list)'); continue }
    const need = ri.qty * scale
    const cost = need * ing.cost
    total += cost
    const have = ing.stock || 0
    const ok = have >= need
    if (!ok) { missing = true; shopping.push(`• ${ing.name}: buy ${_num(need - have)} ${ri.unit}  (you have ${_num(have)})`) }
    lines.push(`• ${ing.name} — ${_num(need)} ${ri.unit}  ·  ${_money(cost)}${ok ? '  ✓ in stock' : '  ⚠ short'}`)
    prep.push(`${ing.name} ${_num(need)} ${ri.unit}`)
  }
  const per = target ? total / target : total
  const out = []
  out.push(`🍳  ${r.name} — for ${target} ${people ? 'people' : (r.yield_unit || 'portions')}`)
  out.push(`(base recipe makes ${base} ${r.yield_unit || 'portions'}${people ? `, so we scale ×${_num(scale)}` : ''})`)
  out.push('')
  out.push('🧾  INGREDIENTS YOU NEED')
  out.push(lines.join('\n') || '• (no ingredients recorded for this recipe)')
  out.push('')
  out.push('💰  COST')
  out.push(`Total: ${_money(total)}  for ${target} ${r.yield_unit || 'portions'}`)
  out.push(`Per person: ${_money(per)}`)
  const _m = _margin()
  out.push(`Suggested sell price (your ${_m}% margin): ${_money(_sellAt(per, _m))} each`)
  out.push('')
  if (shopping.length) {
    out.push('🛒  SHOPPING LIST (you\'re short on these)')
    out.push(shopping.join('\n'))
  } else {
    out.push('🛒  SHOPPING LIST: ✓ You already have everything in stock — nothing to buy!')
  }
  out.push('')
  out.push('👩‍🍳  STEP BY STEP')
  let s = 1
  if (shopping.length) out.push(`${s++}.  Buy the shopping-list items above.`)
  out.push(`${s++}.  Mise en place — measure out: ${prep.join(', ')}.`)
  if (r.notes && r.notes.trim()) out.push(`${s++}.  Method: ${r.notes.trim()}`)
  else out.push(`${s++}.  Cook your way, combining the ingredients above in order.`)
  out.push(`${s++}.  You'll get ${target} ${r.yield_unit || 'portions'} at ${_money(per)} each.`)
  if (missing) out.push('\n💡  Tip: open Simulate to scale this exact recipe and auto-deduct the stock you used.')
  return out.join('\n')
}

function _findAllRecipes(q, recipes) {
  const ql = ' ' + q.toLowerCase() + ' '
  return recipes.filter((r) => r.name && ql.includes(r.name.toLowerCase()))
}

function _eventPlan(dishes, people, ingredients) {
  let grand = 0
  const shop = {}
  const per = []
  for (const r of dishes) {
    const scale = people / (r.base_yield || 1)
    let rc = 0
    for (const ri of (r.ings || [])) {
      const ing = ingredients.find((i) => i.id === ri.id); if (!ing) continue
      const need = ri.qty * scale
      rc += need * ing.cost
      if (!shop[ri.id]) shop[ri.id] = { name: ing.name, unit: ri.unit, need: 0, have: ing.stock || 0 }
      shop[ri.id].need += need
    }
    grand += rc
    per.push(`•  ${r.name} — ${people} ${r.yield_unit || 'portions'}  ·  ${_money(rc)}`)
  }
  const shopping = Object.values(shop).filter((s) => s.need > s.have).map((s) => `•  ${s.name}: buy ${_num(s.need - s.have)} ${s.unit}`)
  const out = []
  out.push(`🎉  Event plan — ${people} guests, ${dishes.length} dish${dishes.length > 1 ? 'es' : ''}`)
  out.push('')
  out.push('🍽️  DISHES (each scaled to your guest count)')
  out.push(per.join('\n'))
  out.push('')
  out.push('💰  TOTAL FOOD COST')
  out.push(`${_money(grand)}  ·  ${_money(grand / people)} per guest`)
  out.push('')
  if (shopping.length) { out.push('🛒  COMBINED SHOPPING LIST'); out.push(shopping.join('\n')) }
  else out.push('🛒  You have everything in stock for this event!')
  out.push('\n💡  Tip: build this on the Events page to track it and auto-deduct stock when you cook.')
  return out.join('\n')
}

function mgzzAnswer(query, ingredients = [], recipes = [], items = [], events = [], alerts = []) {
  const q = (query || '').toLowerCase().trim()
  if (!q) return 'Ask me anything — e.g. "make Pasta Carbonara for 20 people".'

  // Help
  if (q === '?' || q.match(/^(help|what can you do|how do you work|commands?)\b/)) {
    return ['I use your real recipes, costs and stock. Try:', '',
      '•  "Make Pasta Carbonara for 20 people"  → ingredients, cost, shopping list & steps',
      '•  "What can I cook right now?"',
      '•  "How much does [recipe] cost?"  ·  "[recipe] at 50%"  (you set the margin)',
      '•  "What\'s urgent / expiring?"',
      '•  "Build my shopping list"',
      '•  "Which recipes are most expensive?"',
      '•  "What recipes do I have?"'].join('\n')
  }

  // List recipes
  if (q.match(/what recipes|list recipes|my recipes|recipes do i have|show recipes/)) {
    if (!recipes.length) return 'You have no recipes yet — add some on the Recipes page.'
    const lines = recipes.map((r) => { const c = _recipeCost(r, ingredients); return `•  ${r.name} — makes ${r.base_yield} ${r.yield_unit}, ${_money(c)} (${_money(c / (r.base_yield || 1))}/portion)` }).join('\n')
    return `You have ${recipes.length} recipes:\n\n${lines}\n\nAsk "make [name] for N people" for a full plan.`
  }

  // ── Event / menu planning for N guests (multi-dish) ──
  if (q.match(/event|menu|party|dinner|buffet|cater|banquet|wedding|reception/) && _extractCount(q)) {
    const people = _extractCount(q)
    const named = _findAllRecipes(q, recipes)
    const dishes = named.length
      ? named
      : recipes.filter((r) => (r.ings || []).every((ri) => { const ing = ingredients.find((i) => i.id === ri.id); return ing && (ing.stock || 0) >= ri.qty })).slice(0, 4)
    if (dishes.length) return _eventPlan(dishes, people, ingredients)
    return `Tell me which dishes for your ${people}-guest event (e.g. "event for ${people}: Pasta Carbonara and Tiramisu"), or add recipes first on the Recipes page.`
  }

  // ── Pricing for a specific recipe (chef decides the margin / sell price) ──
  const priced = _findRecipe(q, recipes)
  if (priced && q.match(/%|margin|profit|sell|charge|markup|\bprice\b/) && !q.match(/\b(people|guests?|portions?|servings?|pax)\b/)) {
    const per = _recipeCost(priced, ingredients) / (priced.base_yield || 1)
    const pctM = q.match(/(\d{1,3})\s*%/)
    const priceM = q.match(/(?:sell|charge|price|at|for)\D{0,8}(\d+(?:\.\d+)?)/)
    if (pctM) {
      const m = Math.min(95, parseInt(pctM[1], 10)); const sell = _sellAt(per, m)
      return `💵  ${priced.name} at ${m}% margin\n•  Cost: ${_money(per)}/portion\n•  Sell at: ${_money(sell)}\n•  Profit: ${_money(sell - per)}/portion`
    }
    if (priceM) {
      const p = parseFloat(priceM[1]); const margin = p > 0 ? (p - per) / p * 100 : 0; const fc = p > 0 ? per / p * 100 : 0
      return `💵  ${priced.name} sold at ${_money(p)}/portion\n•  Cost: ${_money(per)}\n•  Profit: ${_money(p - per)}  (${margin.toFixed(0)}% margin)\n•  Food cost: ${fc.toFixed(0)}%`
    }
    const m = _margin(); const sell = _sellAt(per, m)
    return `💵  ${priced.name}\n•  Cost: ${_money(per)}/portion\n•  At your ${m}% target margin → sell for ${_money(sell)}\n•  Profit: ${_money(sell - per)}/portion\n\n(Set your target margin in Settings → Brand, or ask "${priced.name} at 50%".)`
  }

  // ── The big one: a specific recipe, scaled ──
  const matched = _findRecipe(q, recipes)
  if (matched && (_extractCount(q) || q.match(/make|cook|prepare|scale|recipe|how (much|do|to)|cost|need|ingredient|plan|for /))) {
    return _recipeGuide(matched, _extractCount(q), ingredients)
  }

  // What can I cook now
  if (q.match(/cook (now|right now|today)|what can i (cook|make)|ready to (cook|make)|recipes? .*(stock|ready)/)) {
    const ready = recipes.filter((r) => (r.ings || []).every((ri) => { const ing = ingredients.find((i) => i.id === ri.id); return ing && (ing.stock || 0) >= ri.qty }))
    if (!ready.length) return 'No recipes are fully stocked right now. Ask "build my shopping list" to see what to buy.'
    const lines = ready.slice(0, 12).map((r) => { const c = _recipeCost(r, ingredients); return `•  ${r.name} — ${r.base_yield} ${r.yield_unit}, ${_money(c)} (${_money(c / (r.base_yield || 1))}/portion)` }).join('\n')
    return `✅  Ready to cook now (${ready.length}):\n\n${lines}\n\nSay "make [name] for N people" for the full plan.`
  }

  // Use up what's expiring soon
  if (q.match(/use up|going bad|use.*(expir|soon|before)|leftover|reduce waste|about to (go|expire)/)) {
    const soon = ingredients.filter((i) => (i.batches || []).some((b) => {
      if (!b.expiry_date) return false
      const days = (new Date(b.expiry_date) - new Date()) / 86400000
      return days >= 0 && days <= 7
    }))
    if (!soon.length) return '✓  Nothing is expiring in the next 7 days — no rush.'
    const soonIds = new Set(soon.map((i) => i.id))
    const usable = recipes.filter((r) => (r.ings || []).some((ri) => soonIds.has(ri.id)))
    const a = soon.slice(0, 8).map((i) => `•  ${i.name}`).join('\n')
    const b = usable.length ? usable.slice(0, 6).map((r) => `•  ${r.name}`).join('\n') : '(none of your recipes use these — consider a special)'
    return `⏰  Expiring within 7 days:\n${a}\n\n🍳  Cook these to use them up:\n${b}`
  }

  // Urgent / alerts
  if (q.match(/urgent|attention|alert|expir|critical|out of stock|low stock|running low/)) {
    if (!alerts || !alerts.length) return "✓  Nothing urgent — everything's stocked and within its expiry window."
    const lines = alerts.slice(0, 12).map((a) => {
      if (a.type === 'out') return `•  ⚠ OUT: ${a.ingredient}`
      if (a.type === 'low') return `•  🟡 LOW: ${a.ingredient} — ${a.stock} ${a.unit} left (threshold ${a.threshold})`
      if (a.type === 'expired') return `•  🔴 EXPIRED: ${a.ingredient} — ${a.qty} ${a.unit}, do NOT use`
      if (a.type === 'critical') return `•  🟠 EXPIRES ${a.expiry}: ${a.ingredient} — ${a.qty} ${a.unit}`
      if (a.type === 'warning') return `•  🟡 ${a.ingredient} expiring ${a.expiry}`
      return `•  ${a.ingredient}: ${a.type}`
    }).join('\n')
    return `Here's what needs attention (${alerts.length}):\n\n${lines}`
  }

  // Shopping list
  if (q.match(/shop|restock|buy|grocery|order|what.*(need|low)/)) {
    const low = ingredients.filter((i) => (i.stock || 0) <= (i.threshold || 0))
    if (!low.length) return "✓  Everything's above its threshold — no restocking needed today."
    const lines = low.slice(0, 15).map((i) => { const buy = Math.max(Math.ceil((i.threshold || 0) * 2 - (i.stock || 0)), 1); return `•  ${i.name}: have ${_num(i.stock || 0)} ${i.unit} (threshold ${i.threshold}) → buy ~${buy} ${i.unit}` }).join('\n')
    return `🛒  Restock list (${low.length} items):\n\n${lines}\n\nLog new stock on Inventory → Restock.`
  }

  // Cost / pricing
  if (q.match(/cost|expensive|cheap|profit|margin|price|pricing/)) {
    const costed = recipes.map((r) => { const c = _recipeCost(r, ingredients); return { name: r.name, total: c, per: c / (r.base_yield || 1), unit: r.yield_unit } }).sort((a, b) => b.per - a.per)
    if (!costed.length) return 'No recipes to analyse yet.'
    const M = _margin()
    const top = costed.slice(0, 8).map((c) => `•  ${c.name} — cost ${_money(c.per)}/portion → sell ${_money(_sellAt(c.per, M))}`).join('\n')
    return `💰  Costs & suggested prices (at your ${M}% margin):\n\n${top}\n\nChange your target margin in Settings → Brand, or ask e.g. "Tiramisu at 60%".`
  }

  // Inventory value
  if (q.match(/inventory (value|worth)|stock.*(value|worth)|value of (my )?(inventory|stock)|how much.*(inventory|stock).*worth/)) {
    const val = ingredients.reduce((s, i) => s + (i.stock || 0) * (i.cost || 0), 0)
    const top = [...ingredients].map((i) => ({ name: i.name, v: (i.stock || 0) * (i.cost || 0) })).sort((a, b) => b.v - a.v).slice(0, 5)
    const lines = top.map((t) => `•  ${t.name}: ${_money(t.v)}`).join('\n')
    return `📦  Your inventory is worth ${_money(val)} across ${ingredients.length} ingredients.\n\nMost valuable on hand:\n${lines}`
  }

  // Blocked recipes — what's missing
  if (q.match(/block|can.?t (cook|make)|why can|missing|not enough|short on/)) {
    const blocked = recipes.map((r) => {
      const short = (r.ings || []).filter((ri) => { const ing = ingredients.find((i) => i.id === ri.id); return !ing || (ing.stock || 0) < ri.qty })
      return { r, short }
    }).filter((x) => x.short.length)
    if (!blocked.length) return "✓  No recipes are blocked — everything's makeable with current stock!"
    const lines = blocked.slice(0, 8).map((x) => `•  ${x.r.name} — missing: ${x.short.map((ri) => { const ing = ingredients.find((i) => i.id === ri.id); return ing ? ing.name : '?' }).join(', ')}`).join('\n')
    return `🚫  Blocked recipes (not enough stock):\n\n${lines}\n\nAsk "build my shopping list" to fix these.`
  }

  // A recipe was named but no clear intent → still give its plan
  if (matched) return _recipeGuide(matched, _extractCount(q), ingredients)

  // Default
  return [`I can help with your ${recipes.length} recipes and ${ingredients.length} ingredients. Try:`, '',
    '•  "Make [recipe] for 20 people"',
    '•  "What can I cook right now?"',
    '•  "What\'s urgent?"',
    '•  "Build my shopping list"',
    '•  "Which recipes cost the most?"'].join('\n')
}

// ─── Local fallback (offline mode or API failure) ─────────
function generateLocalFallback(query, ingredients, recipes, items, events, alerts) {
  const q = query.toLowerCase()

  // What can I cook?
  if (q.match(/what.*(cook|make).*now|can i (cook|make)/)) {
    const ready = recipes.filter(r => r.ings?.every(ri => {
      const ing = ingredients.find(i => i.id === ri.id)
      return ing && ing.stock >= ri.qty
    }))
    if (ready.length === 0) return "Right now, no recipes are fully stocked. Check the Inventory page for what to restock first."
    const lines = ready.slice(0, 8).map(r => {
      let cost = 0
      r.ings?.forEach(ri => {
        const ing = ingredients.find(i => i.id === ri.id)
        if (ing) cost += ri.qty * ing.cost
      })
      return `• ${r.name} — ${r.base_yield} ${r.yield_unit}, $${cost.toFixed(2)} total ($${(cost/r.base_yield).toFixed(2)}/unit)`
    }).join('\n')
    return `You can cook these right now:\n\n${lines}\n\nGo to Simulate to scale and execute the cook.`
  }

  // Urgent / alerts
  if (q.match(/urgent|attention|alert|expiring|expired|critical|today/)) {
    if (!alerts || alerts.length === 0) return "Nothing urgent right now. All ingredients are stocked and within their expiry window."
    const lines = alerts.slice(0, 8).map(a => {
      if (a.type === 'out') return `• ⚠️ OUT: ${a.ingredient}`
      if (a.type === 'low') return `• 🟡 LOW: ${a.ingredient} — ${a.stock} ${a.unit} (threshold ${a.threshold})`
      if (a.type === 'expired') return `• 🔴 EXPIRED: ${a.ingredient} — ${a.qty} ${a.unit}, do NOT use`
      if (a.type === 'critical') return `• 🟠 EXPIRES ${a.expiry}: ${a.ingredient} — ${a.qty} ${a.unit}`
      if (a.type === 'warning') return `• 🟡 expiry warning ${a.expiry}: ${a.ingredient}`
      return `• ${a.ingredient}: ${a.type}`
    }).join('\n')
    return `Here's what needs attention:\n\n${lines}\n\nOpen Inventory to handle these.`
  }

  // Cost / expensive
  if (q.match(/cost|expensive|cheap|profit|margin|price/)) {
    const costed = recipes.map(r => {
      let c = 0
      r.ings?.forEach(ri => {
        const ing = ingredients.find(i => i.id === ri.id)
        if (ing) c += ri.qty * ing.cost
      })
      return { name: r.name, total: c, per: c / r.base_yield, unit: r.yield_unit }
    }).sort((a, b) => b.per - a.per)
    if (costed.length === 0) return "No recipes to analyse yet."
    const top = costed.slice(0, 5).map(c => `• ${c.name} — $${c.per.toFixed(2)}/${c.unit.replace(/s$/,'')} ($${c.total.toFixed(2)} total)`).join('\n')
    return `Recipe costs (highest per portion):\n\n${top}\n\nFor a healthy 30% food cost, sell prices should be roughly 3.3× these numbers.`
  }

  // Shopping / restock
  if (q.match(/shop|restock|buy|low stock|need/)) {
    const low = ingredients.filter(i => !i.stock || i.stock <= i.threshold)
    if (low.length === 0) return "Everything is well-stocked. No restocking needed today."
    const lines = low.slice(0, 10).map(i => `• ${i.name}: have ${i.stock} ${i.unit}, threshold ${i.threshold} — buy at least ${Math.ceil((i.threshold * 2) - (i.stock || 0))} ${i.unit}`).join('\n')
    return `Restock list:\n\n${lines}\n\nUse the Inventory page → Restock to log new stock.`
  }

  // Default
  return `I have ${recipes.length} recipes, ${ingredients.length} ingredients, ${items?.length||0} items, and ${events?.length||0} events to help with. The assistant is currently unreachable — try asking again in a moment, or check your internet connection. Common questions I can answer locally:\n\n• What can I cook now?\n• What's urgent?\n• Cost analysis\n• Shopping list / restock`
}
