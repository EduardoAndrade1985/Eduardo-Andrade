import { createContext, useContext, useState, useCallback } from 'react'
import api from '../services/api'

const EmpresaContext = createContext(null)

export function EmpresaProvider({ children }) {
  const [minhasEmpresas, setMinhasEmpresas] = useState([])
  const [empresaAtiva,   setEmpresaAtiva]   = useState(null)

  const carregarEmpresas = useCallback(async () => {
    try {
      const res = await api.get('/empresas/minhas/')
      const { empresas, empresa_ativa } = res.data
      setMinhasEmpresas(empresas)

      const savedId = parseInt(localStorage.getItem('empresa_ativa_id'))
      const ativaId = savedId || empresa_ativa
      const ativa   = empresas.find(e => e.id === ativaId) || empresas[0]

      if (ativa) {
        setEmpresaAtiva(ativa)
        localStorage.setItem('empresa_ativa_id', ativa.id)
      }
    } catch {
      // usuário não autenticado ainda
    }
  }, [])

  async function trocarEmpresa(empresaId) {
    try {
      await api.post('/empresas/trocar/', { empresa_id: empresaId })
      localStorage.setItem('empresa_ativa_id', empresaId)
      const ativa = minhasEmpresas.find(e => e.id === empresaId)
      if (ativa) setEmpresaAtiva(ativa)
    } catch (e) {
      console.error('Erro ao trocar empresa', e)
    }
  }

  return (
    <EmpresaContext.Provider value={{ minhasEmpresas, empresaAtiva, trocarEmpresa, carregarEmpresas }}>
      {children}
    </EmpresaContext.Provider>
  )
}

export const useEmpresa = () => useContext(EmpresaContext)
