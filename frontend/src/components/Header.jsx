import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import api from '../services/api'

function Modal({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-bg2 border border-border rounded-2xl shadow-2xl w-full max-w-sm fade-up"
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export default function Header({ title }) {
  const { user, logout, refreshUser } = useAuth()
  const { tema, toggleTema } = useTheme()
  const [open, setOpen]         = useState(false)
  const [modal, setModal]       = useState(null) // 'senha' | 'perfil'
  const [form, setForm]         = useState({ senha_atual: '', senha_nova: '', senha_conf: '' })
  const [nome, setNome]         = useState('')
  const [msg, setMsg]           = useState('')
  const [erro, setErro]         = useState('')
  const [salvando, setSalvando] = useState(false)
  const [showSenha, setShowSenha] = useState({ senha_atual: false, senha_nova: false, senha_conf: false })
  const ref = useRef(null)

  const inicial = user?.username?.[0]?.toUpperCase() || 'U'
  const dataFmt = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function abrirModal(tipo) {
    setOpen(false)
    setErro(''); setMsg('')
    if (tipo === 'senha') setForm({ senha_atual: '', senha_nova: '', senha_conf: '' })
    if (tipo === 'perfil') setNome(user?.username || '')
    setModal(tipo)
  }

  async function salvarSenha() {
    setErro(''); setMsg('')
    if (!form.senha_atual || !form.senha_nova || !form.senha_conf) {
      setErro('Preencha todos os campos.'); return
    }
    if (form.senha_nova !== form.senha_conf) {
      setErro('As senhas não coincidem.'); return
    }
    setSalvando(true)
    try {
      await api.post('/auth/change-password/', {
        senha_atual: form.senha_atual,
        senha_nova:  form.senha_nova,
      })
      setMsg('Senha alterada com sucesso!')
      setForm({ senha_atual: '', senha_nova: '', senha_conf: '' })
    } catch (e) {
      setErro(e.response?.data?.error || 'Erro ao alterar senha.')
    } finally { setSalvando(false) }
  }

  async function salvarPerfil() {
    setErro(''); setMsg('')
    if (!nome.trim()) { setErro('Nome não pode ser vazio.'); return }
    setSalvando(true)
    try {
      await api.patch(`/empresas/membros/me/`, { username: nome.trim() })
      await refreshUser()
      setMsg('Perfil atualizado!')
    } catch (e) {
      setErro(e.response?.data?.error || 'Erro ao salvar.')
    } finally { setSalvando(false) }
  }

  return (
    <>
      <header className="h-14 flex-shrink-0 flex items-center justify-between
                         px-6 bg-bg2 border-b border-border
                         shadow-[0_1px_0_rgba(255,255,255,0.03),0_4px_12px_rgba(0,0,0,0.25)]">

        <h1 className="text-sm font-semibold tracking-wide
                       bg-gradient-to-r from-primary to-teal-400 bg-clip-text text-transparent">
          {title}
        </h1>

        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-[11px] text-muted capitalize tracking-wide">
            {dataFmt}
          </span>
          <div className="hidden sm:block w-px h-4 bg-border"/>

          {/* Avatar + dropdown */}
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen(o => !o)}
              className="relative group cursor-pointer focus:outline-none"
            >
              <div className="w-8 h-8 rounded-full gradient-primary
                              flex items-center justify-center
                              text-[11px] font-bold text-bg
                              ring-2 ring-primary/30 ring-offset-1 ring-offset-bg2
                              transition-all duration-200
                              group-hover:ring-primary/60 group-hover:glow-sm">
                {inicial}
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full
                               bg-primary border-2 border-bg2"/>
            </button>

            {open && (
              <div className="absolute right-0 top-11 w-56 bg-bg2 border border-border rounded-xl shadow-2xl z-50 overflow-hidden fade-up">

                {/* Info usuário */}
                <div className="px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-[12px] font-bold text-bg flex-shrink-0">
                      {inicial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-dim truncate">{user?.username}</p>
                      <p className="text-[10px] text-muted capitalize">{user?.papel || 'usuário'}</p>
                    </div>
                  </div>
                </div>

                {/* Itens */}
                <div className="py-1">
                  <button onClick={() => abrirModal('senha')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-dim hover:bg-primary/5 hover:text-primary transition text-left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Alterar senha
                  </button>

                  <button onClick={() => { setOpen(false); toggleTema() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-dim hover:bg-primary/5 hover:text-primary transition text-left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                      {tema === 'dark'
                        ? <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>
                        : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                      }
                    </svg>
                    {tema === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                  </button>
                </div>

                <div className="border-t border-border py-1">
                  <button onClick={logout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger/80 hover:bg-danger/5 hover:text-danger transition text-left">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sair
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Modal Alterar Senha */}
      {modal === 'senha' && (
        <Modal onClose={() => setModal(null)}>
          <div className="px-6 py-5 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-dim text-base">Alterar Senha</h2>
            <button onClick={() => setModal(null)} className="text-muted hover:text-dim text-2xl leading-none">×</button>
          </div>
          <div className="px-6 py-5 space-y-4">
            {['senha_atual', 'senha_nova', 'senha_conf'].map((field, i) => (
              <div key={field}>
                <label className="block text-[10px] font-semibold text-muted mb-1.5 uppercase tracking-wide">
                  {['Senha atual', 'Nova senha', 'Confirmar nova senha'][i]}
                </label>
                <div className="relative">
                  <input type={showSenha[field] ? 'text' : 'password'} value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full bg-bg3 border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary transition"/>
                  <button type="button"
                    onClick={() => setShowSenha(s => ({ ...s, [field]: !s[field] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-dim transition">
                    {showSenha[field]
                      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
            ))}
            {erro && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{erro}</p>}
            {msg  && <p className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">{msg}</p>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-border">
            <button onClick={() => setModal(null)}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted hover:text-dim transition">
              Cancelar
            </button>
            <button onClick={salvarSenha} disabled={salvando}
              className="flex-1 py-2.5 rounded-lg bg-primary text-bg text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
