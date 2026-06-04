import axios from 'axios'
import { supabase } from './supabase'
import { enqueue } from './offlineQueue'

// Resolve where the API lives:
//  - Phone on the LAN loaded the app over http://192.168.x.x:PORT → same origin.
//  - Desktop Tauri webview (tauri.localhost) or dev (localhost) → configured URL.
function resolveBaseUrl() {
    if (typeof window !== 'undefined' && window.location) {
        const { hostname, protocol, origin } = window.location
        const desktopOrigin = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('tauri.localhost')
        if (!desktopOrigin && (protocol === 'http:' || protocol === 'https:')) return origin
    }
    return import.meta.env.VITE_API_URL || 'http://localhost:8000'
}

const BASE_URL = resolveBaseUrl()
const LOCAL = import.meta.env.VITE_LOCAL_MODE === 'true'

const api = axios.create({ baseURL: BASE_URL })

// ── Attach Supabase JWT to every request (cloud build only) ─
api.interceptors.request.use(async config => {
    if (!LOCAL && supabase) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
            config.headers.Authorization = `Bearer ${session.access_token}`
        }
    }
    return config
})

// ── Offline: queue mutations, return graceful error ───────
api.interceptors.response.use(
    res => res,
    async err => {
        const isNetworkError = !err.response
        const req = err.config
        const isMutation = req && ['post', 'patch', 'put', 'delete'].includes(req.method?.toLowerCase())
        if (isNetworkError && isMutation) {
            await enqueue(req.method, req.url, req.data ? JSON.parse(req.data) : undefined)
            return Promise.reject(Object.assign(err, { queued: true }))
        }
        return Promise.reject(err)
    }
)

// ── Sync queue on reconnect ───────────────────────────────
import { getAll, remove } from './offlineQueue'

export async function flushOfflineQueue() {
    const ops = await getAll()
    let synced = 0, skipped = 0
    for (const op of ops) {
        try {
            await api.request({ method: op.method, url: op.url, data: op.data })
            await remove(op.id)
            synced++
        } catch (err) {
            if (err.response) {
                // Server responded with 4xx/5xx — this op will never succeed, discard it
                // (e.g. 409 conflict, 404 deleted elsewhere, 422 validation error)
                await remove(op.id)
                skipped++
                console.warn(`[offline-sync] Dropped op (${err.response.status}):`, op.method, op.url)
            } else {
                // Pure network error — server unreachable, stop and retry next time online
                break
            }
        }
    }
    return { synced, skipped }
}

// ── License (local desktop activation) ────────────────────
export const getLicenseStatus  = ()    => api.get('/license/status')
export const activateLicense   = (key) => api.post('/license/activate', { key })
export const deactivateLicense = ()    => api.post('/license/deactivate')

// ── Mobile access (same-WiFi) ─────────────────────────────
export const getMobileStatus = ()        => api.get('/mobile/status')
export const toggleMobile    = (enabled) => api.post('/mobile/toggle', { enabled })

// ── Backups ────────────────────────────────────────────────
export const listBackups   = ()        => api.get('/backup/list')
export const exportBackup  = ()        => api.post('/backup/export')
export const restoreBackup = (name)    => api.post('/backup/restore', { name })
export const restoreUpload = (zip_b64) => api.post('/backup/restore-upload', { zip_b64 })

// ── Categories ────────────────────────────────────────────
export const getCategories      = ()           => api.get('/categories')
export const createCategory     = (data)       => api.post('/categories', data)
export const updateCategory     = (id, data)   => api.patch(`/categories/${id}`, data)
export const deleteCategory     = (id)         => api.delete(`/categories/${id}`)

// ── Ingredients ───────────────────────────────────────────
export const getIngredients     = ()           => api.get('/ingredients')
export const createIngredient   = (data)       => api.post('/ingredients', data)
export const updateIngredient   = (id, data)   => api.patch(`/ingredients/${id}`, data)
export const deleteIngredient   = (id)         => api.delete(`/ingredients/${id}`)

// ── Inventory ─────────────────────────────────────────────
export const getInventory       = ()           => api.get('/inventory')
export const restockIng         = (data)       => api.post('/inventory/restock', data)
export const updateInventory    = (id, data)   => api.patch(`/inventory/${id}`, data)
export const deleteBatch        = (id)         => api.delete(`/inventory/batch/${id}`)
export const getAlerts          = ()           => api.get('/inventory/alerts')

// ── Recipes ───────────────────────────────────────────────
export const getRecipes         = ()           => api.get('/recipes')
export const createRecipe       = (data)       => api.post('/recipes', data)
export const updateRecipe       = (id, data)   => api.patch(`/recipes/${id}`, data)
export const deleteRecipe       = (id)         => api.delete(`/recipes/${id}`)
export const getRecipeCost      = (id, scale)  => api.get(`/recipes/${id}/cost?scale=${scale}`)
export const simulateCook       = (id, scale)  => api.get(`/recipes/${id}/simulate?scale=${scale}`)
export const executeCook        = (data)       => api.post('/cook', data)

// ── Cook to stock ─────────────────────────────────────────
export const cookToStock        = (data)       => api.post('/cook-to-stock', data)

// ── Cooked stock ──────────────────────────────────────────
export const getCookedStock     = ()           => api.get('/cooked-stock')
export const addCookedStock     = (data)       => api.post('/cooked-stock', data)
export const wasteCookedStock   = (id, data)   => api.delete(`/cooked-stock/${id}/waste`, { data })

// ── Items ─────────────────────────────────────────────────
export const getItems           = ()           => api.get('/items')
export const createItem         = (data)       => api.post('/items', data)
export const updateItem         = (id, data)   => api.patch(`/items/${id}`, data)
export const deleteItem         = (id)         => api.delete(`/items/${id}`)
export const simulateItem       = (id, scale)  => api.get(`/items/${id}/simulate?scale=${scale}`)
export const assembleItem       = (id, data)   => api.post(`/items/${id}/assemble`, data)

// ── Vendors ───────────────────────────────────────────────
export const getVendors         = ()           => api.get('/vendors')
export const createVendor       = (data)       => api.post('/vendors', data)
export const updateVendor       = (id, data)   => api.patch(`/vendors/${id}`, data)
export const deleteVendor       = (id)         => api.delete(`/vendors/${id}`)

// ── Setup Items ───────────────────────────────────────────
export const getSetupItems      = ()           => api.get('/setup-items')
export const createSetupItem    = (data)       => api.post('/setup-items', data)
export const updateSetupItem    = (id, data)   => api.patch(`/setup-items/${id}`, data)
export const deleteSetupItem    = (id)         => api.delete(`/setup-items/${id}`)

// ── Events ────────────────────────────────────────────────
export const getEvents          = ()           => api.get('/events')
export const createEvent        = (data)       => api.post('/events', data)
export const updateEvent        = (id, data)   => api.patch(`/events/${id}`, data)
export const updateEventStatus  = (id, status) => api.patch(`/events/${id}/status`, { status })
export const deleteEvent        = (id)         => api.delete(`/events/${id}`)

// ── Waste ─────────────────────────────────────────────────
export const getWaste           = ()           => api.get('/waste')
export const getWasteSummary    = ()           => api.get('/waste/summary')
export const wasteIngBatch      = (id, data)   => api.post(`/waste/ingredient-batch/${id}`, data)
export const deleteWasteEntry   = (id)         => api.delete(`/waste/${id}`)

// ── Transactions ──────────────────────────────────────────
export const getTransactions    = ()           => api.get('/transactions')

// ── Misc ──────────────────────────────────────────────────
export const restockFromCook    = (data)       => api.post('/restock-from-cook', data)
export const updateBatch        = (id, data)   => api.patch(`/inventory/batch/${id}`, data)
