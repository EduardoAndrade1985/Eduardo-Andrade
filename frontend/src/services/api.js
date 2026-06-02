import axios from 'axios'

const BASE = import.meta.env.VITE_API_BASE_URL || ''

const api = axios.create({
  baseURL: BASE + '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Injeta JWT e empresa ativa em toda requisição
api.interceptors.request.use(cfg => {
  const token     = localStorage.getItem('access_token')
  const empresaId = localStorage.getItem('empresa_ativa_id')
  if (token)     cfg.headers.Authorization  = `Bearer ${token}`
  // só injeta empresa do localStorage se a requisição não já trouxer X-Empresa-ID próprio
  if (empresaId && !cfg.headers['X-Empresa-ID']) cfg.headers['X-Empresa-ID'] = empresaId
  return cfg
})

// 401 → desloga
api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('empresa_ativa_id')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
