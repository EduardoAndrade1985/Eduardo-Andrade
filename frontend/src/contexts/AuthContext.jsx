import { createContext, useContext, useState, useEffect, useRef } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const BASE = import.meta.env.VITE_API_BASE_URL || ''
const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutos

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef(null)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const saved = localStorage.getItem('user_info')
    if (token && saved) {
      setUser(JSON.parse(saved))
    }
    setLoading(false)
  }, [])

  async function fetchMe(token) {
    const t = token || localStorage.getItem('access_token')
    if (!t) return null
    try {
      const me = await axios.get(BASE + '/auth/me/', {
        headers: { Authorization: `Bearer ${t}` },
      })
      localStorage.setItem('user_info', JSON.stringify(me.data))
      setUser(me.data)
      return me.data
    } catch {
      return null
    }
  }

  // Refresh automático: a cada 5 min e ao voltar para a aba
  useEffect(() => {
    function silentRefresh() {
      if (localStorage.getItem('access_token')) fetchMe()
    }

    timerRef.current = setInterval(silentRefresh, REFRESH_INTERVAL)

    function onVisible() {
      if (document.visibilityState === 'visible') silentRefresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(username, password) {
    const res = await axios.post(BASE + '/auth/token/', { username, password })
    const { access, refresh } = res.data
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
    return fetchMe(access)
  }

  async function refreshUser() {
    return fetchMe()
  }

  function logout() {
    clearInterval(timerRef.current)
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_info')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
