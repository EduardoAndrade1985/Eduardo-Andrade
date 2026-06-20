import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { EmpresaProvider, useEmpresa } from '../contexts/EmpresaContext'

const TITLES = {
  '/custos':    '📊 Dashboard de Custos',
  '/cartoes':   '💳 Conciliação de Cartão',
  '/compras':   '🛒 Compras',
  '/gerencial': '📈 Gerencial',
  '/estoque':   '📦 Estoque',
  '/empresas':  '🏨 Empresas',
  '/usuarios':  '👥 Usuários',
  '/ocupacao':  '🏨 Ocupação',
  '/eventos':   '📅 Eventos',
  '/desperdicio': '🍽️ Food Intelligence',
}

function LayoutInner() {
  const [collapsed, setCollapsed] = useState(false)
  const { pathname } = useLocation()
  const { carregarEmpresas, empresaAtiva } = useEmpresa()
  const title = TITLES[pathname] || 'RPHub'

  useEffect(() => {
    carregarEmpresas()
  }, [carregarEmpresas])

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-scroll">
          {/* key força remonte completo quando empresa muda — páginas releem dados do banco */}
          <Outlet key={empresaAtiva?.id ?? 'sem-empresa'} />
        </main>
      </div>
    </div>
  )
}

export default function Layout() {
  return (
    <EmpresaProvider>
      <LayoutInner />
    </EmpresaProvider>
  )
}
