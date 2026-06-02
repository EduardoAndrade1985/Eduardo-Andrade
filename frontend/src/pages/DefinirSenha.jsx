import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

function SenhaInput({ value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="w-full bg-bg3 border border-border rounded-lg px-3.5 py-2.5 pr-10
                   text-sm text-dim placeholder-muted outline-none
                   focus:border-primary transition font-mono tracking-widest"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-dim transition"
        tabIndex={-1}
      >
        <EyeIcon open={show}/>
      </button>
    </div>
  )
}

export default function DefinirSenha() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [nova,    setNova]    = useState('')
  const [confirm, setConfirm] = useState('')
  const [erro,    setErro]    = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    if (nova.length < 4)  { setErro('A senha deve ter ao menos 4 caracteres.'); return }
    if (nova !== confirm)  { setErro('As senhas não coincidem.'); return }
    setLoading(true)
    try {
      await api.post('/empresas/change-password/', { nova_senha: nova })
      await refreshUser()
      navigate('/custos', { replace: true })
    } catch (e) {
      setErro(e.response?.data?.error || 'Erro ao definir senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm fade-up">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-warn/15 border border-warn/30 mb-4">
            <span className="text-2xl">🔑</span>
          </div>
          <h1 className="text-xl font-bold text-dim">Defina sua nova senha</h1>
          <p className="text-xs text-muted mt-1">
            Olá, <span className="text-primary font-semibold">{user?.username}</span>. Por segurança, crie uma senha pessoal antes de continuar.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-bg2 border border-border rounded-2xl p-7 shadow-2xl space-y-4"
        >
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted mb-1.5">
              Nova senha
            </label>
            <SenhaInput
              value={nova}
              onChange={e => setNova(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-muted mb-1.5">
              Confirmar senha
            </label>
            <SenhaInput
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>

          {erro && (
            <div className="flex items-center gap-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
              <span>⚠</span> {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-bold bg-primary text-bg transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? 'Salvando...' : 'Definir senha e entrar'}
          </button>
        </form>

        <p className="text-center text-[10px] text-muted mt-5">
          Esta tela aparece apenas quando um administrador redefine sua senha.
        </p>
      </div>
    </div>
  )
}
