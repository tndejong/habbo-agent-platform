import { useState, useEffect } from 'react'
import { api } from './api'

// Module-level cache so all components share a single fetch
let _catalog = null
let _promise = null

function fetchCatalog() {
  if (_catalog) return Promise.resolve(_catalog)
  if (_promise) return _promise
  _promise = api('/api/skills')
    .then(d => { _catalog = d.skills || []; return _catalog })
    .catch(() => { _catalog = []; return _catalog })
    .finally(() => { _promise = null })
  return _promise
}

/**
 * Returns the full skills catalog. Fetches once per session and shares
 * the result across all consuming components.
 */
export function useSkillsCatalog() {
  const [catalog, setCatalog] = useState(_catalog || [])
  const [loading, setLoading] = useState(!_catalog)

  useEffect(() => {
    if (_catalog) { setCatalog(_catalog); setLoading(false); return }
    fetchCatalog().then(c => { setCatalog(c); setLoading(false) })
  }, [])

  return { catalog, loading }
}
