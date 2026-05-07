const DB_NAME = 'chefos-offline'
const STORE   = 'pending_ops'
let _db = null

function openDB() {
    if (_db) return Promise.resolve(_db)
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = e => {
            e.target.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        }
        req.onsuccess  = e => { _db = e.target.result; resolve(_db) }
        req.onerror    = ()  => reject(req.error)
    })
}

function tx(mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        t.onerror = () => reject(t.error)
        resolve(fn(t.objectStore(STORE)))
    }))
}

export function enqueue(method, url, data) {
    return tx('readwrite', store => {
        const req = store.add({ method, url, data, ts: Date.now() })
        return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })
    })
}

export function getAll() {
    return tx('readonly', store => {
        const req = store.getAll()
        return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error) })
    })
}

export function remove(id) {
    return tx('readwrite', store => {
        const req = store.delete(id)
        return new Promise((res, rej) => { req.onsuccess = () => res(); req.onerror = () => rej(req.error) })
    })
}

export function clearAll() {
    return tx('readwrite', store => {
        const req = store.clear()
        return new Promise((res, rej) => { req.onsuccess = () => res(); req.onerror = () => rej(req.error) })
    })
}
