import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Custos from './pages/Custos'
import Cartoes from './pages/Cartoes'
import Usuarios from './pages/Usuarios'
import Empresas from './pages/Empresas'
import Ocupacao from './pages/Ocupacao'
import Eventos from './pages/Eventos'
import SelecionarEmpresa from './pages/SelecionarEmpresa'
import EmBreve from './pages/EmBreve'
import DefinirSenha from './pages/DefinirSenha'
import Estoque from './pages/Estoque'
import TVManager from './pages/TVManager'
import TVPlayer from './pages/TVPlayer'

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/definir-senha" element={
          <ProtectedRoute><DefinirSenha /></ProtectedRoute>
        } />
        <Route path="/selecionar-empresa" element={
          <ProtectedRoute>
            <SelecionarEmpresaWrapper />
          </ProtectedRoute>
        } />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/custos" replace />} />
          <Route path="/custos"    element={<Custos />} />
          <Route path="/cartoes"   element={<Cartoes />} />
          <Route path="/ocupacao"  element={<Ocupacao />} />
          <Route path="/eventos"   element={<Eventos />} />
          <Route path="/compras"   element={<EmBreve modulo="Compras" />} />
          <Route path="/gerencial" element={<EmBreve modulo="Gerencial" />} />
          <Route path="/estoque"   element={<Estoque />} />
          <Route path="/usuarios"  element={<Usuarios />} />
          <Route path="/empresas"  element={<Empresas />} />
          <Route path="/tv-manager" element={<TVManager />} />
        </Route>

        {/* TV Player — público, sem login */}
        <Route path="/tv/:token" element={<TVPlayer />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
    </ThemeProvider>
  )
}

// SelecionarEmpresa precisa do EmpresaProvider — usa um wrapper com Layout mínimo
import { EmpresaProvider } from './contexts/EmpresaContext'
import { useEmpresa } from './contexts/EmpresaContext'
import { useEffect } from 'react'

function SelecionarEmpresaWrapper() {
  return (
    <EmpresaProvider>
      <SelecionarEmpresaLoader />
    </EmpresaProvider>
  )
}

function SelecionarEmpresaLoader() {
  const { carregarEmpresas } = useEmpresa()
  useEffect(() => { carregarEmpresas() }, [carregarEmpresas])
  return <SelecionarEmpresa />
}
