import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'

function EyeIcon({ open }) {
  return open ? (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
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

const KPIS = [
  { label: 'Ocupação',      value: '82%',        delta: '+5,2pp',  unit: '' },
  { label: 'RevPAR',        value: 'R$ 284',     delta: '+8,7%',   unit: '' },
  { label: 'Receita Total', value: 'R$ 128.540', delta: '+12,4%',  unit: '' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const from      = location.state?.from?.pathname

  const [form, setForm]         = useState({ username: '', password: '' })
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [remember, setRemember] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username.trim().toLowerCase(), form.password)
      const res = await api.get('/empresas/minhas/')
      const { empresas } = res.data
      if (from && from !== '/login') {
        navigate(from, { replace: true })
      } else if (empresas.length > 1) {
        navigate('/selecionar-empresa', { replace: true })
      } else {
        navigate('/custos', { replace: true })
      }
    } catch (err) {
      const code = err.response?.data?.code
      setError(
        code === 'account_inactive'
          ? 'Seu acesso está inativo. Entre em contato com a área de Tecnologia para reativação.'
          : err.response?.status === 401
            ? 'Usuário ou senha incorretos.'
            : 'Erro ao conectar com o servidor.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-bg)' }}>

      {/* ── Painel esquerdo — branding ── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col relative overflow-hidden" style={{ background: 'var(--color-bg2)' }}>

        {/* Fundo gradiente */}
        <div className="absolute inset-0 gradient-primary opacity-90" />
        {/* Padrão de pontos sutil */}
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

          {/* Headline */}
          <div className="mb-10">
            <h1 className="text-white text-4xl font-bold leading-tight mb-4">
              Inteligência para<br />
              resultados reais no<br />
              <span style={{ color: 'rgba(255,255,255,0.75)' }}>seu hotel.</span>
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Acompanhe ocupação, tarifas, receita e desempenho<br />
              de todas as suas propriedades em um só lugar.
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

          {/* KPIs */}
          <div className="rounded-2xl p-5" style={{ background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(8px)' }}>
            <div className="grid grid-cols-3 gap-4">
              {KPIS.map(k => (
                <div key={k.label}>
                  <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{k.label}</p>
                  <p className="text-white text-lg font-bold leading-none">{k.value}</p>
                  <p className="text-xs mt-1 font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <span style={{ color: '#a7f3d0' }}>{k.delta}</span> vs. ontem
                  </p>
                </div>
              ))}
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

      {/* ── Painel direito — formulário ── */}
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
          <p className="text-sm mb-1" style={{ color: 'var(--color-muted)' }}>Bem-vindo(a) de volta!</p>
          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-dim)' }}>Acesse sua conta</h2>
          <p className="text-sm mb-8" style={{ color: 'var(--color-muted)' }}>Entre para continuar no RPHub</p>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Usuário */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-muted)' }}>
                Usuário
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }}>
                  <UserIcon />
                </span>
                <input
                  type="text"
                  autoComplete="username"
                  placeholder="seu.usuario"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  required
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

            {/* Senha */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-muted)' }}>
                Senha
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }}>
                  <LockIcon />
                </span>
                <input
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                  className="w-full rounded-xl pl-10 pr-10 py-3 text-sm outline-none transition font-mono tracking-widest"
                  style={{
                    background: 'var(--color-bg3)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-dim)',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--color-primary)' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--color-border)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition"
                  style={{ color: 'var(--color-muted)' }}
                  tabIndex={-1}
                >
                  <EyeIcon open={showPass} />
                </button>
              </div>
            </div>

            {/* Lembrar + Esqueci */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Manter-me conectado</span>
              </label>
              <button
                type="button"
                className="text-xs font-medium hover:opacity-80 transition"
                style={{ color: 'var(--color-primary)' }}
              >
                Esqueci minha senha
              </button>
            </div>

            {/* Erro */}
            {error && (
              <div className="flex items-center gap-2 text-xs rounded-xl px-4 py-3"
                style={{
                  color: 'var(--color-danger)',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}>
                <span>⚠</span> {error}
              </div>
            )}

            {/* Botão submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2
                         gradient-primary transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: '#0d1117', boxShadow: 'var(--glow-primary)' }}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  Entrando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                  Entrar no RPHub
                </>
              )}
            </button>
          </form>

          {/* Suporte */}
          <button
            type="button"
            className="w-full mt-4 flex items-center justify-between rounded-xl px-4 py-3 transition hover:opacity-80"
            style={{
              background: 'var(--color-bg3)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(45,212,160,0.12)' }}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>Precisa de ajuda?</p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Fale com o suporte</p>
              </div>
            </div>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>

          {/* Rodapé */}
          <p className="text-center text-xs mt-8" style={{ color: 'var(--color-muted)' }}>
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
