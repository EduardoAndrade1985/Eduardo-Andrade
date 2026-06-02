import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEmpresa } from '../contexts/EmpresaContext'
import { useAuth } from '../contexts/AuthContext'

function inicial(nome) {
  return (nome || '?').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

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
    <div className="min-h-screen bg-bg flex flex-col">

      {/* Header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-[12px] font-bold text-primary">
            RP
          </div>
          <span className="text-sm font-bold text-primary">RPHub</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            Olá, <span className="text-dim font-semibold">{user?.username}</span>
          </span>
          <button
            onClick={logout}
            className="text-xs text-muted hover:text-danger transition px-2 py-1 rounded hover:bg-danger/10"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">

          {/* Título */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-dim mb-1">Selecione a Empresa</h1>
            <p className="text-xs text-muted">
              {minhasEmpresas.length} empresa{minhasEmpresas.length !== 1 ? 's' : ''} disponíve{minhasEmpresas.length !== 1 ? 'is' : 'l'}
            </p>
          </div>

          {/* Busca — só aparece com 4+ empresas */}
          {minhasEmpresas.length >= 4 && (
            <div className="mb-3">
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar empresa..."
                className="w-full bg-bg2 border border-border rounded-lg px-3 py-2.5 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary transition"
              />
            </div>
          )}

          {/* Lista */}
          <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
            {filtradas.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted">Nenhuma empresa encontrada.</div>
            ) : (
              filtradas.map((emp, i) => {
                const nome = emp.nome_fantasia || emp.nome
                const cor  = emp.cor_primaria || '#2dd4a0'
                const ini  = inicial(nome)
                const loading = selecionando === emp.id

                return (
                  <button
                    key={emp.id}
                    onClick={() => handleSelect(emp.id)}
                    disabled={!!selecionando}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 text-left
                      hover:bg-primary/5 transition-colors disabled:opacity-60
                      ${i > 0 ? 'border-t border-border/60' : ''}`}
                  >
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: cor + '22', border: `1.5px solid ${cor}44`, color: cor }}
                    >
                      {ini}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-dim truncate">{nome}</p>
                      {(emp.cidade || emp.estado) && (
                        <p className="text-[11px] text-muted truncate">
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

                    {/* Seta / loading */}
                    <div className="text-muted flex-shrink-0 text-sm">
                      {loading ? (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="10"/>
                        </svg>
                      ) : '→'}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Sem empresas */}
          {minhasEmpresas.length === 0 && (
            <div className="text-center py-10">
              <p className="text-4xl mb-3">🏨</p>
              <p className="text-dim font-semibold text-sm mb-1">Nenhuma empresa encontrada</p>
              <p className="text-xs text-muted">Entre em contato com o administrador.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
