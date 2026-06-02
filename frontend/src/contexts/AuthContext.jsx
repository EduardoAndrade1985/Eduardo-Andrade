import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

const BASE = import.meta.env.VITE_API_BASE_URL || ''

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

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
    const me = await axios.get(BASE + '/auth/me/', {
      headers: { Authorization: `Bearer ${t}` },
    })
    localStorage.setItem('user_info', JSON.stringify(me.data))
    setUser(me.data)
    return me.data
  }

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
