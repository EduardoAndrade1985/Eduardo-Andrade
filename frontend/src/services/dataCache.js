const _cache = new Map()
const TTL_MS = 10 * 60 * 1000 // 10 min

export function getCached(key, empresaId) {
  const entry = _cache.get(key)
  if (!entry) return null
  if (entry.empresaId !== empresaId) return null
  if (Date.now() - entry.timestamp > TTL_MS) { _cache.delete(key); return null }
  return entry.data
}

export function setCached(key, data, empresaId) {
  _cache.set(key, { data, timestamp: Date.now(), empresaId })
}

export function invalidateCache(key) {
  _cache.delete(key)
}
