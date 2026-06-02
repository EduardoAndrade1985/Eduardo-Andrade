import { useNavigate } from 'react-router-dom'
import { useEmpresa } from '../contexts/EmpresaContext'
import { useAuth } from '../contexts/AuthContext'

const BANDEIRAS_ESTADO = {
  AC:'🌳',AM:'🌳',PA:'🌳',RO:'🌳',RR:'🌳',AP:'🌳',TO:'🌳',
  MA:'⭐',PI:'⭐',CE:'⭐',RN:'⭐',PB:'⭐',PE:'⭐',AL:'⭐',SE:'⭐',BA:'⭐',
  MG:'🌟',ES:'🌟',RJ:'🌟',SP:'🌟',
  PR:'🌲',SC:'🌲',RS:'🌲',
  MS:'🟩',MT:'🟩',GO:'🟩',DF:'🟩',
}

function inicial(nome) {
  return (nome || '?').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

export default function SelecionarEmpresa() {
  const { minhasEmpresas, trocarEmpresa } = useEmpresa()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleSelect(id) {
    await trocarEmpresa(id)
    navigate('/custos', { replace: true })
  }

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

        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-dim mb-2">Selecione a Empresa</h1>
          <p className="text-sm text-muted">
            Você tem acesso a {minhasEmpresas.length} empresa{minhasEmpresas.length !== 1 ? 's' : ''}.
            Escolha com qual deseja trabalhar.
          </p>
        </div>

        <div className={`grid gap-4 w-full max-w-4xl
          ${minhasEmpresas.length === 1 ? 'grid-cols-1 max-w-xs' :
            minhasEmpresas.length === 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-xl' :
            'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
          {minhasEmpresas.map(emp => {
            const nome = emp.nome_fantasia || emp.nome
            const ini  = inicial(nome)
            const cor  = emp.cor_primaria || '#2dd4a0'
            const flag = BANDEIRAS_ESTADO[emp.estado] || '🏨'

            return (
              <button
                key={emp.id}
                onClick={() => handleSelect(emp.id)}
                className="group relative bg-bg2 border border-border rounded-2xl p-6 text-left
                           hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5
                           transition-all duration-200 hover:-translate-y-0.5 focus:outline-none
                           focus:border-primary/60"
              >
                {/* Barra de cor superior */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl opacity-70
                             group-hover:opacity-100 transition-opacity"
                  style={{ background: cor }}
                />

                {/* Avatar + nome */}
                <div className="flex items-start gap-4 mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center
                               text-sm font-bold text-white flex-shrink-0"
                    style={{ background: cor + '33', border: `1.5px solid ${cor}55` }}
                  >
                    <span style={{ color: cor }}>{ini}</span>
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="font-bold text-dim text-sm leading-tight truncate">{nome}</p>
                    {emp.nome_fantasia && (
                      <p className="text-[11px] text-muted truncate mt-0.5">{emp.nome}</p>
                    )}
                  </div>
                </div>

                {/* Infos */}
                <div className="space-y-1.5">
                  {(emp.cidade || emp.estado) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <span>{flag}</span>
                      <span>{[emp.cidade, emp.estado].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  {emp.total_uhs > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <span>🛏</span>
                      <span>{emp.total_uhs} UHs</span>
                    </div>
                  )}
                  {emp.papel && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span>👤</span>
                      <span className="capitalize" style={{ color: cor }}>{emp.papel}</span>
                    </div>
                  )}
                </div>

                {/* Seta hover */}
                <div className="absolute bottom-5 right-5 text-muted group-hover:text-primary
                               transition-colors text-sm">
                  →
                </div>
              </button>
            )
          })}
        </div>

        {minhasEmpresas.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">🏨</div>
            <p className="text-dim font-semibold mb-1">Nenhuma empresa encontrada</p>
            <p className="text-xs text-muted">Entre em contato com o administrador do sistema.</p>
          </div>
        )}
      </div>
    </div>
  )
}
