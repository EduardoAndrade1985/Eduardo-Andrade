import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEmpresa } from '../contexts/EmpresaContext'
import { useAuth } from '../contexts/AuthContext'

function inicial(nome) {
  return (nome || '?').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
    title: 'Dashboards interativos',
    desc: 'Visualize indicadores em tempo real',
  },
  {
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    title: 'Decisões mais inteligentes',
    desc: 'Dados confiáveis para ações estratégicas',
  },
  {
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: 'Seguro e confiável',
    desc: 'Proteção de dados e acesso controlado',
  },
]

export default function SelecionarEmpresa() {
  const { minhasEmpresas, trocarEmpresa } = useEmpresa()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [busca, setBusca] = useState('')
  const [selecionando, setSelecionando] = useState(null)

  async function handleSelect(id) {
    setSelecionando(id)
    await trocarEmpresa(id)
    navigate('/custos', { replace: true })
  }

  const filtradas = minhasEmpresas.filter(emp =>
    (emp.nome_fantasia || emp.nome || '').toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-bg)' }}>

      {/* ── Painel esquerdo — branding (igual ao login) ── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col relative overflow-hidden" style={{ background: 'var(--color-bg2)' }}>

        {/* Fundo gradiente */}
        <div className="absolute inset-0 gradient-primary opacity-90" />
        {/* Padrão de pontos */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,.25) 1px, transparent 0)`,
            backgroundSize: '28px 28px',
          }}
        />
        {/* Brilho decorativo */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)', filter: 'blur(60px)' }} />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full"
          style={{ background: 'rgba(0,0,0,0.15)', filter: 'blur(50px)' }} />

        <div className="relative z-10 flex flex-col h-full p-10">

          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-auto">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.2)' }}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <span className="text-white text-xl font-bold tracking-tight">RPHub</span>
          </div>

          {/* Headline — adaptada para esse passo */}
          <div className="mb-10">
            <h1 className="text-white text-4xl font-bold leading-tight mb-4">
              Quase lá,<br />
              <span style={{ color: 'rgba(255,255,255,0.75)' }}>
                {user?.username ? `${user.username}.` : 'escolha sua propriedade.'}
              </span>
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Selecione a empresa para acessar os dashboards<br />
              e relatórios da propriedade.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-4 mb-10">
            {FEATURES.map(f => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.18)', color: 'rgba(255,255,255,0.9)' }}>
                  {f.icon}
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{f.title}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Indicador de progresso — passo 2 de 2 */}
          <div className="rounded-2xl p-5" style={{ background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(8px)' }}>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>Progresso de acesso</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(167,243,208,0.25)', border: '1.5px solid rgba(167,243,208,0.6)' }}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="#a7f3d0" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Login</span>
              </div>
              <div className="flex-1 h-px" style={{ background: 'rgba(167,243,208,0.3)' }} />
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(45,212,160,0.3)', border: '1.5px solid rgba(45,212,160,0.8)' }}>
                  <span className="text-xs font-bold text-white">2</span>
                </div>
                <span className="text-xs font-semibold text-white">Empresa</span>
              </div>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.2)' }}>
                  <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>3</span>
                </div>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Dashboard</span>
              </div>
            </div>
          </div>

          {/* Rodapé */}
          <div className="mt-6 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Plataforma 100% segura · Dados hospedados no Brasil
            </span>
          </div>
        </div>
      </div>

      {/* ── Painel direito — seleção ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 fade-up">

        {/* Logo mobile */}
        <div className="lg:hidden mb-8 flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--color-primary)', opacity: 0.9 }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" strokeWidth="2.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <span className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>RPHub</span>
        </div>

        <div className="w-full max-w-sm">

          {/* Saudação */}
          <p className="text-sm mb-1" style={{ color: 'var(--color-muted)' }}>
            Olá, <span className="font-semibold" style={{ color: 'var(--color-dim)' }}>{user?.username}</span>!
          </p>
          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-dim)' }}>Selecione a Empresa</h2>
          <p className="text-sm mb-8" style={{ color: 'var(--color-muted)' }}>
            {minhasEmpresas.length} empresa{minhasEmpresas.length !== 1 ? 's' : ''} disponíve{minhasEmpresas.length !== 1 ? 'is' : 'l'}
          </p>

          {/* Busca — só aparece com 4+ */}
          {minhasEmpresas.length >= 4 && (
            <div className="mb-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </span>
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar empresa..."
                  className="w-full rounded-xl pl-10 pr-4 py-3 text-sm outline-none transition"
                  style={{
                    background: 'var(--color-bg3)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-dim)',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--color-primary)' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--color-border)' }}
                />
              </div>
            </div>
          )}

          {/* Lista de empresas */}
          <div className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg3)' }}>
            {filtradas.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: 'var(--color-muted)' }}>
                Nenhuma empresa encontrada.
              </div>
            ) : (
              filtradas.map((emp, i) => {
                const nome    = emp.nome_fantasia || emp.nome
                const cor     = emp.cor_primaria || '#2dd4a0'
                const ini     = inicial(nome)
                const loading = selecionando === emp.id

                return (
                  <button
                    key={emp.id}
                    onClick={() => handleSelect(emp.id)}
                    disabled={!!selecionando}
                    className="w-full flex items-center gap-4 px-4 py-4 text-left transition-colors disabled:opacity-60"
                    style={{
                      borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${cor}0d` }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: cor + '20', border: `1.5px solid ${cor}40`, color: cor }}
                    >
                      {ini}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-dim)' }}>{nome}</p>
                      {(emp.cidade || emp.estado) && (
                        <p className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
                          {[emp.cidade, emp.estado].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>

                    {/* Papel */}
                    {emp.papel && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: cor + '18', color: cor }}>
                        {emp.papel}
                      </span>
                    )}

                    {/* Seta / spinner */}
                    <div className="flex-shrink-0" style={{ color: 'var(--color-muted)' }}>
                      {loading ? (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Sem empresas */}
          {minhasEmpresas.length === 0 && (
            <div className="text-center py-10 mt-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--color-bg3)', border: '1px solid var(--color-border)' }}>
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-dim)' }}>Nenhuma empresa encontrada</p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Entre em contato com o administrador.</p>
            </div>
          )}

          {/* Logout */}
          <button
            onClick={logout}
            className="w-full mt-4 py-2.5 text-sm rounded-xl transition hover:opacity-80"
            style={{
              color: 'var(--color-muted)',
              border: '1px solid var(--color-border)',
              background: 'transparent',
            }}
          >
            Sair da conta
          </button>

          {/* Rodapé */}
          <p className="text-center text-xs mt-6" style={{ color: 'var(--color-muted)' }}>
            <svg className="inline w-3 h-3 mr-1 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Conexão segura · Sistema interno
          </p>
        </div>
      </div>
    </div>
  )
}
