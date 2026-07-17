import { useState, useMemo } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import EmpresaSwitcher from './EmpresaSwitcher'

// ── SVG icon library ─────────────────────────────────────────────
function Ic({ n, cls = 'w-4 h-4 flex-shrink-0' }) {
  const p = {
    // item icons
    avaliacoes: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    ocupacao:   <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    eventos:    <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    custos:     <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>,
    receitas:   <><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></>,
    cartoes:    <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    compras:    <><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    estoque:    <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    food:       <><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></>,
    imob:       <><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 3h-4a2 2 0 0 0-2 2v2h8V5a2 2 0 0 0-2-2z"/><path d="M8 12h8"/><path d="M8 16h5"/></>,
    visao:      <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    usuarios:   <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    empresas:   <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    tv:         <><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></>,
    // section icons (collapsed mode)
    sec_op:     <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    sec_fin:    <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    sec_sup:    <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
    sec_ger:    <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    sec_adm:    <><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></>,
    // ui
    menu:       <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    search:     <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    upload:     <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    logout:     <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    sun:        <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
    moon:       <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    close:      <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={cls}>
      {p[n]}
    </svg>
  )
}

// ── navigation structure ─────────────────────────────────────────
const SECOES = [
  {
    id: 'operacional',
    titulo: 'Operacional',
    secIcon: 'sec_op',
    itens: [
      { label: 'Avaliações', icon: 'avaliacoes', path: '/avaliacoes', ativo: false, badge: 3, key: 'avaliacoes' },
      { label: 'Ocupação',   icon: 'ocupacao',   path: '/ocupacao',   ativo: true,            key: 'ocupacao'   },
      { label: 'Eventos',    icon: 'eventos',    path: '/eventos',    ativo: true,            key: 'eventos'    },
      { label: 'Food Intelligence', icon: 'food', path: '/desperdicio', ativo: true,          key: 'desperdicio'},
    ],
  },
  {
    id: 'financeiro',
    titulo: 'Financeiro',
    secIcon: 'sec_fin',
    itens: [
      { label: 'Custos',   icon: 'custos',   path: '/custos',   ativo: true,  key: 'custos'   },
      { label: 'Receitas', icon: 'receitas', path: '/receitas', ativo: true,  key: 'receitas' },
      { label: 'Cartões',  icon: 'cartoes',  path: '/cartoes',  ativo: true,  key: 'cartoes'  },
    ],
  },
  {
    id: 'suprimentos',
    titulo: 'Suprimentos',
    secIcon: 'sec_sup',
    itens: [
      { label: 'Compras',      icon: 'compras', path: '/compras',      ativo: false, key: 'compras'      },
      { label: 'Estoque',      icon: 'estoque', path: '/estoque',      ativo: true,  key: 'estoque'      },
      { label: 'Imobilizado',  icon: 'imob',    path: '/imobilizado',  ativo: true,  key: 'imobilizado'  },
    ],
  },
  {
    id: 'gerencial',
    titulo: 'Gerencial',
    secIcon: 'sec_ger',
    itens: [
      { label: 'Visão Geral', icon: 'visao', path: '/gerencial', ativo: false, key: 'gerencial' },
    ],
  },
  {
    id: 'admin',
    titulo: 'Administração',
    secIcon: 'sec_adm',
    apenasAdmin: true,
    itens: [
      { label: 'Empresas',   icon: 'empresas', path: '/empresas',   ativo: true },
      { label: 'Usuários',   icon: 'usuarios', path: '/usuarios',   ativo: true },
      { label: 'TV Manager', icon: 'tv',        path: '/tv-manager', ativo: true, key: 'tv' },
    ],
  },
]

// ── badge element ────────────────────────────────────────────────
function Badge({ value }) {
  if (value == null) return null
  if (value === 'alert')
    return (
      <span className="ml-auto flex-shrink-0 w-[18px] h-[18px] rounded-full bg-warn/20 text-warn text-[9px] font-bold flex items-center justify-center">
        !
      </span>
    )
  return (
    <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
      {value}
    </span>
  )
}

// ── collapsed item (um por módulo ativo) ─────────────────────────
function CollapsedItem({ mod, bloqueado }) {
  if (bloqueado) return (
    <div
      title={`${mod.label} — sem acesso`}
      className="relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg border border-transparent opacity-30 cursor-not-allowed text-muted"
    >
      <Ic n={mod.icon} cls="w-[18px] h-[18px]"/>
    </div>
  )
  return (
    <NavLink
      to={mod.path}
      title={mod.label}
      className={({ isActive }) =>
        `relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all border
        ${isActive
          ? 'nav-active text-primary'
          : 'text-dim hover:text-primary hover:bg-bg3 border-transparent'}`
      }
    >
      <Ic n={mod.icon} cls="w-[18px] h-[18px]"/>
      {mod.badge != null && (
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-danger"/>
      )}
    </NavLink>
  )
}

// ── nav item (expanded) ──────────────────────────────────────────
function NavItem({ mod, bloqueado }) {
  const base = 'relative flex items-center gap-3 px-3 py-[7px] rounded-lg text-[13px] font-medium transition-all'
  const hasBadge = mod.badge != null

  if (bloqueado) {
    return (
      <div className={`${base} text-muted opacity-30 cursor-not-allowed`}>
        <Ic n={mod.icon}/>
        <span className="flex-1 truncate">{mod.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 ml-auto flex-shrink-0">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
    )
  }

  if (!mod.ativo) {
    return (
      <div className={`${base} text-muted opacity-50 cursor-not-allowed`}>
        <Ic n={mod.icon}/>
        <span className="flex-1 truncate">{mod.label}</span>
        {hasBadge
          ? <Badge value={mod.badge}/>
          : <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-bg3 border border-border text-muted">breve</span>
        }
      </div>
    )
  }

  return (
    <NavLink
      to={mod.path}
      className={({ isActive }) =>
        `${base} ${isActive
          ? 'nav-active text-primary border'
          : 'text-dim hover:bg-bg3 hover:text-primary border border-transparent'}`
      }
    >
      <Ic n={mod.icon}/>
      <span className="flex-1 truncate">{mod.label}</span>
      <Badge value={mod.badge}/>
    </NavLink>
  )
}

// ── main component ───────────────────────────────────────────────
export default function Sidebar({ collapsed, setCollapsed, drawerOpen, onDrawerClose }) {
  const { user, logout } = useAuth()
  const { tema, toggleTema } = useTheme()
  const isAdmin = user?.papel === 'admin' || user?.is_staff
  const modulosPermitidos = user?.modulos_permitidos  // null/undefined = todos

  const podeVerModulo = (item) => {
    if (!modulosPermitidos || modulosPermitidos.length === 0) return true
    return modulosPermitidos.includes(item.key)
  }
  const [search, setSearch]     = useState('')
  const [openSecs, setOpenSecs] = useState(() =>
    Object.fromEntries(SECOES.map(s => [s.id, true]))
  )

  const toggleSec = id => setOpenSecs(p => ({ ...p, [id]: !p[id] }))

  const filteredSecs = useMemo(() => {
    if (!search.trim()) return SECOES
    const q = search.toLowerCase()
    return SECOES
      .map(s => ({ ...s, itens: s.itens.filter(it => it.label.toLowerCase().includes(q)) }))
      .filter(s => s.itens.length > 0)
  }, [search])

  const PAPEL_LABEL = {
    admin: 'Administrador', gerente: 'Gerente',
    operacional: 'Operacional', visualizador: 'Visualizador',
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden
          transition-opacity duration-300
          ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onDrawerClose}
      />

    <aside className={`
      flex flex-col bg-bg2 border-r border-border flex-shrink-0
      transition-transform duration-300
      fixed top-0 left-0 h-full z-50 w-[280px]
      ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}
      lg:static lg:h-screen lg:z-auto lg:translate-x-0
      ${collapsed ? 'lg:w-[60px]' : 'lg:w-[240px]'}
    `}>

      {/* ── Header ── */}
      {collapsed ? (
        /* collapsed: só o botão de expandir, centralizado */
        <div className="flex items-center justify-center border-b border-border flex-shrink-0 py-3">
          <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-bg3 transition"
            title="Expandir"
          >
            <Ic n="menu" cls="w-4 h-4"/>
          </button>
        </div>
      ) : (
        /* expanded: logo + nome + botão recolher */
        <div className="flex items-center gap-3 border-b border-border flex-shrink-0 px-3 py-3">
          <div className="w-8 h-8 rounded-lg gradient-primary glow-sm
                          flex items-center justify-center text-[12px] font-bold text-bg flex-shrink-0">
            RP
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate leading-tight
                          bg-gradient-to-r from-primary to-teal-400 bg-clip-text text-transparent">
              RPHub
            </p>
            <p className="text-[10px] text-muted truncate leading-tight">Sistema Gerencial</p>
          </div>
          {/* Desktop: recolher */}
          <button
            onClick={() => setCollapsed(true)}
            className="hidden lg:block p-1.5 rounded-lg text-muted hover:text-primary hover:bg-bg3 transition flex-shrink-0"
            title="Recolher"
          >
            <Ic n="menu" cls="w-4 h-4"/>
          </button>
          {/* Mobile: fechar drawer */}
          <button
            onClick={onDrawerClose}
            className="lg:hidden p-1.5 rounded-lg text-muted hover:text-primary hover:bg-bg3 transition flex-shrink-0"
            title="Fechar"
          >
            <Ic n="close" cls="w-4 h-4"/>
          </button>
        </div>
      )}

      {/* ── Empresa ── */}
      <div className="py-2 border-b border-border flex-shrink-0">
        <EmpresaSwitcher collapsed={collapsed}/>
      </div>

      {/* ── Search (expanded only) ── */}
      {!collapsed && (
        <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 bg-bg3 border border-border rounded-lg px-2.5 py-1.5">
            <Ic n="search" cls="w-3.5 h-3.5 text-muted flex-shrink-0"/>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar módulo..."
              className="bg-transparent text-xs text-dim placeholder-muted focus:outline-none flex-1 min-w-0"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted hover:text-dim text-sm leading-none">×</button>
            )}
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">

        {/* collapsed: one icon per active module, separator between sections */}
        {collapsed && (
          <div className="flex flex-col items-center py-1">
            {SECOES.map((secao, si) => {
              if (secao.apenasAdmin && !isAdmin) return null
              const ativos = secao.itens.filter(it => it.ativo)
              if (ativos.length === 0) return null
              return (
                <div key={secao.id} className="w-full">
                  {si > 0 && (
                    <div className="w-6 mx-auto my-1 border-t border-border/60"/>
                  )}
                  <div className="flex flex-col gap-0.5">
                    {ativos.map(mod => (
                      <CollapsedItem key={mod.path} mod={mod} bloqueado={!podeVerModulo(mod)}/>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* expanded: full section headers + items */}
        {!collapsed && (
          <div className="space-y-0.5">
            {filteredSecs.map(secao => {
              if (secao.apenasAdmin && !isAdmin) return null
              const isOpen = openSecs[secao.id] !== false
              return (
                <div key={secao.id} className="mb-1">
                  <button
                    onClick={() => toggleSec(secao.id)}
                    className="flex items-center gap-1 w-full px-2 py-1 rounded text-muted hover:text-dim transition"
                  >
                    <span className="flex-1 text-left text-[10px] font-bold uppercase tracking-widest">
                      {secao.titulo}
                    </span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                      className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="space-y-0.5 pl-0.5">
                      {secao.itens.map(mod => (
                        <NavItem key={mod.path} mod={mod} bloqueado={!podeVerModulo(mod)}/>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </nav>


{/* ── User + logout ── */}
      <div className="border-t border-border px-2 py-3 flex-shrink-0">
        {!collapsed && user && (
          <div className="flex items-center gap-2.5 px-3 py-2 mb-2 rounded-lg
                          bg-bg3 border border-border/60">
            <div className="relative flex-shrink-0">
              <div className="w-7 h-7 rounded-full gradient-primary
                              flex items-center justify-center text-[11px] font-bold text-bg">
                {user.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full
                               bg-primary border border-bg3"/>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-dim truncate">{user.username}</p>
              <p className="text-[10px] text-muted truncate">
                {PAPEL_LABEL[user.papel] ?? (user.email || 'Admin')}
              </p>
            </div>
          </div>
        )}
        {/* tema */}
        <button
          onClick={toggleTema}
          title={collapsed ? (tema === 'dark' ? 'Modo Claro' : 'Modo Escuro') : ''}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-muted
            hover:text-primary hover:bg-primary/5 transition mb-0.5 ${collapsed ? 'justify-center' : ''}`}
        >
          <Ic n={tema === 'dark' ? 'sun' : 'moon'} cls="w-4 h-4 flex-shrink-0"/>
          {!collapsed && (
            <span>{tema === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
          )}
        </button>

        {/* logout */}
        <button
          onClick={logout}
          title={collapsed ? 'Sair' : ''}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-muted hover:text-danger hover:bg-danger/10 transition ${collapsed ? 'justify-center' : ''}`}
        >
          <Ic n="logout" cls="w-4 h-4 flex-shrink-0"/>
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
    </>
  )
}
