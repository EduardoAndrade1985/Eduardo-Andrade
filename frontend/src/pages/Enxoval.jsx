import { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import api from '../services/api'
import { useEmpresa } from '../contexts/EmpresaContext'
import { useRfid } from '../hooks/useRfid'
import { StatusLeitor, montarEpc } from '../services/rfid'
import { agruparPorTipo, exportarRolPdf, exportarRolExcel } from '../services/rolEnxoval'

// ── helpers ───────────────────────────────────────────────────────────────────
const EPC_PREFIXO = 'A100'

// ── ícones ────────────────────────────────────────────────────────────────────
const svg = (d, extra) => (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d={d} />
    {extra}
  </svg>
)

const Ico = {
  Saida:    svg('M12 19V5M5 12l7-7 7 7'),
  Entrada:  svg('M12 5v14M19 12l-7 7-7-7'),
  Voltar:   svg('M15 18l-6-6 6-6'),
  Alerta:   svg('M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z'),
  Check:    svg('M22 11.1V12a10 10 0 11-5.9-9.1M22 4L12 14l-3-3'),
  Etiqueta: svg('M20.6 13.4L12 22l-9-9V3h10l7.6 7.6a2 2 0 010 2.8z', <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />),
  Gestao:   svg('M3 6h18M3 12h18M3 18h18'),
  Antena:   svg('M5 12a7 7 0 0114 0M2 12a10 10 0 0120 0M8.5 12a3.5 3.5 0 017 0M12 12v9'),
  Bateria:  svg('M3 7h14a2 2 0 012 2v6a2 2 0 01-2 2H3a2 2 0 01-2-2V9a2 2 0 012-2zM22 11v2'),
  Baixar:   svg('M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3'),
}

function inferirTipo(epc, tipos) {
  if (!epc || epc.length < 8) return null
  const codigo = epc.substring(4, 8).toUpperCase()
  return tipos.find(t => t.codigo.toUpperCase() === codigo) || null
}

function fmtEpc(epc) {
  if (!epc) return '—'
  return epc.match(/.{1,4}/g)?.join(' ') || epc
}

// ── tiny components ───────────────────────────────────────────────────────────
function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-bg2 rounded-2xl border border-white/[0.06] p-4 ${className}`}>
      {title && <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{title}</p>}
      {children}
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted hover:text-dim hover:bg-white/[0.04]'
      }`}
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }) {
  const MAP = {
    EM_HOTEL:      { label: 'Em Hotel',      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    NA_LAVANDERIA: { label: 'Na Lavanderia', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    BAIXADA:       { label: 'Baixada',       cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  }
  const cfg = MAP[status] || { label: status, cls: 'bg-white/[0.06] text-muted border-white/[0.08]' }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function LeitorStatusBar({ status, info, erro }) {
  const COR = {
    [StatusLeitor.DESCONECTADO]: 'text-muted',
    [StatusLeitor.CONECTANDO]:   'text-amber-400',
    [StatusLeitor.CONECTADO]:    'text-emerald-400',
    [StatusLeitor.LENDO]:        'text-primary',
    [StatusLeitor.ERRO]:         'text-rose-400',
  }

  const isSimulado = info?.serial?.startsWith('MOCK') || info?.nome?.includes('simulado')
  const nomeLabel  = info?.nome ? ` · ${info.nome}` : ''
  const temBateria = info?.bateria != null && info.bateria >= 0

  const LABEL = {
    [StatusLeitor.DESCONECTADO]: 'Leitor desconectado',
    [StatusLeitor.CONECTANDO]:   'Conectando…',
    [StatusLeitor.CONECTADO]:    `Conectado${nomeLabel}`,
    [StatusLeitor.LENDO]:        `Lendo…${nomeLabel}`,
    [StatusLeitor.ERRO]:         `Erro: ${erro}`,
  }

  const conectadoOuLendo = status === StatusLeitor.CONECTADO || status === StatusLeitor.LENDO

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status === StatusLeitor.LENDO ? 'bg-primary animate-pulse' : 'bg-current'} ${COR[status]}`} />
      <span className={COR[status]}>{LABEL[status]}</span>
      {conectadoOuLendo && temBateria && (
        <span className="flex items-center gap-1 text-muted">
          <Ico.Bateria className="w-3.5 h-3.5" />
          {info.bateria}%
        </span>
      )}
      {conectadoOuLendo && isSimulado && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 tracking-wide">
          SIMULADO
        </span>
      )}
      {conectadoOuLendo && !isSimulado && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 tracking-wide">
          REAL
        </span>
      )}
    </div>
  )
}

// Único ponto de conexão do leitor no módulo. As telas de ação só mostram
// os botões do que fazer com ele (ler, parar, gravar).
function BarraLeitor({ rfidState }) {
  const { status, info, erro, conectar, desconectar, limpar } = rfidState
  const desconectado = status === StatusLeitor.DESCONECTADO || status === StatusLeitor.ERRO

  return (
    <div className="flex items-center gap-3 bg-bg2 rounded-2xl border border-white/[0.06] px-4 py-3">
      <span className={`w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 ${
        desconectado ? 'bg-white/[0.06] text-muted' : 'bg-primary/15 text-primary'
      }`}>
        <Ico.Antena className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <LeitorStatusBar status={status} info={info} erro={erro} />
      </div>
      {desconectado ? (
        <button
          onClick={() => { conectar().catch(() => {}) }}
          className="px-3.5 py-1.5 text-xs bg-primary/15 text-primary border border-primary/30 rounded-lg hover:bg-primary/20 transition flex-shrink-0"
        >
          Conectar
        </button>
      ) : (
        <button
          onClick={() => { desconectar(); limpar() }}
          className="px-3.5 py-1.5 text-xs text-muted border border-white/[0.08] rounded-lg hover:text-rose-400 hover:border-rose-500/30 transition flex-shrink-0"
        >
          Desconectar
        </button>
      )}
    </div>
  )
}

// Rol agrupado por item — é assim que a lavanderia confere, não etiqueta a etiqueta.
function ResumoRol({ mov }) {
  const { empresaAtiva } = useEmpresa()
  const linhas = agruparPorTipo(mov?.itens)
  if (!linhas.length) return null
  const total = linhas.reduce((s, l) => s + l.quantidade, 0)

  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Rol por item</p>
      <div className="space-y-0.5">
        {linhas.map(l => (
          <div key={l.item} className="flex items-center justify-between py-1 text-sm">
            <span className="text-dim truncate">{l.item}</span>
            <span className="text-muted font-medium flex-shrink-0 ml-3">{l.quantidade}</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/[0.06] text-sm font-semibold">
          <span className="text-dim">Total</span>
          <span className="text-primary">{total}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          onClick={() => exportarRolPdf(mov, empresaAtiva?.nome)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs text-muted border border-white/[0.08] rounded-lg hover:text-primary hover:border-primary/30 transition"
        >
          <Ico.Baixar className="w-3.5 h-3.5" />
          Rol em PDF
        </button>
        <button
          onClick={() => exportarRolExcel(mov, empresaAtiva?.nome)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs text-muted border border-white/[0.08] rounded-lg hover:text-primary hover:border-primary/30 transition"
        >
          <Ico.Baixar className="w-3.5 h-3.5" />
          Excel
        </button>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`bg-white/[0.06] rounded animate-pulse ${className}`} />
}

function TabDashboard({ dados, loading }) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <Card key={i}>
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-7 w-16" />
            </Card>
          ))}
        </div>
        <Card>
          <Skeleton className="h-3 w-32 mb-4" />
          {[0, 1, 2].map(i => (
            <div key={i} className="mb-4">
              <Skeleton className="h-3 w-40 mb-2" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        </Card>
      </div>
    )
  }
  if (!dados) return <p className="text-muted text-sm">Sem dados.</p>

  const pctLavanderia = dados.total_pecas > 0
    ? Math.round(dados.total_na_lavanderia / dados.total_pecas * 100)
    : 0
  const abaixoMinimo = dados.tipos.filter(
    t => t.estoque_minimo > 0 && t.em_hotel < t.estoque_minimo
  ).length

  return (
    <div className="space-y-4">
      {/* totalizadores */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'Total cadastrado', value: dados.total_pecas,        nota: 'peças com etiqueta', cls: 'text-dim',          barra: 'bg-white/20' },
          { label: 'Em hotel',         value: dados.total_em_hotel,     nota: 'disponíveis para uso', cls: 'text-emerald-400', barra: 'bg-emerald-400' },
          { label: 'Na lavanderia',    value: dados.total_na_lavanderia, nota: `${pctLavanderia}% do total`, cls: 'text-amber-400', barra: 'bg-amber-400' },
          abaixoMinimo > 0
            ? { label: 'Abaixo do mínimo', value: abaixoMinimo, nota: abaixoMinimo === 1 ? 'tipo precisa de reposição' : 'tipos precisam de reposição', cls: 'text-rose-400', barra: 'bg-rose-400' }
            : { label: 'Abaixo do mínimo', value: 0, nota: 'estoque saudável', cls: 'text-dim', barra: 'bg-white/20' },
        ].map(item => (
          <Card key={item.label} className="relative overflow-hidden">
            <span className={`absolute left-0 top-0 bottom-0 w-0.5 ${item.barra}`} />
            <p className="text-[11px] text-muted uppercase tracking-wide mb-1.5">{item.label}</p>
            <p className={`text-3xl font-bold leading-none ${item.cls}`}>{item.value}</p>
            <p className="text-[10px] text-muted mt-1.5">{item.nota}</p>
          </Card>
        ))}
      </div>

      {/* por tipo */}
      {dados.tipos.length > 0 && (
        <Card title="Estoque por tipo">
          <div className="space-y-3">
            {dados.tipos.map(tipo => {
              const pct = tipo.total > 0 ? Math.round(tipo.em_hotel / tipo.total * 100) : 0
              const baixoEstoque = tipo.estoque_minimo > 0 && tipo.em_hotel < tipo.estoque_minimo
              return (
                <div key={tipo.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm text-dim font-medium truncate">{tipo.nome}</span>
                      <span className="text-xs text-muted flex-shrink-0 flex items-center gap-1">
                        {tipo.em_hotel} / {tipo.total}
                        {baixoEstoque && (
                          <Ico.Alerta className="w-3.5 h-3.5 text-rose-400" title="Abaixo do estoque mínimo" />
                        )}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-muted">
                      <span>Hotel: {tipo.em_hotel}</span>
                      <span>Lavanderia: {tipo.na_lavanderia}</span>
                      {tipo.baixadas > 0 && <span className="text-rose-400">Baixadas: {tipo.baixadas}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* movimentações recentes */}
      {dados.movimentacoes_recentes.length > 0 && (
        <Card title="Últimas movimentações">
          <div className="space-y-1">
            {dados.movimentacoes_recentes.map(m => (
              <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${m.tipo_mov === 'SAIDA' ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {m.tipo_mov === 'SAIDA' ? '↑ Saída' : '↓ Entrada'}
                  </span>
                  <span className="text-muted text-xs">#{m.numero}</span>
                  {m.responsavel && <span className="text-muted text-xs">· {m.responsavel}</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>{m.total_itens} peças</span>
                  <span>{m.criado_em}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {dados.tipos.length === 0 && dados.total_pecas === 0 && (
        <div className="text-center py-16">
          <span className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] mb-4">
            <Ico.Etiqueta className="w-6 h-6 text-muted" />
          </span>
          <p className="font-medium text-dim">Nenhum enxoval cadastrado</p>
          <p className="text-sm text-muted mt-1">
            Abra <strong className="text-primary font-medium">Cadastro</strong> para criar os tipos e gravar as primeiras etiquetas
          </p>
        </div>
      )}
    </div>
  )
}

// ── Sessão RFID (saída / entrada) ─────────────────────────────────────────────
function TabMovimentacao({ tipoMov, tipos, coletores, rfidState, onSuccess }) {
  const [responsavel, setResponsavel]   = useState('')
  const [observacoes, setObservacoes]   = useState('')
  const [confirmando, setConfirmando]   = useState(false)
  const [resultado, setResultado]       = useState(null)

  const {
    lendo, conectado,
    tagsValidas, totalUnico, totalIgnorado,
    iniciar, parar, limpar, paraApi,
  } = rfidState

  const podeLer       = conectado && !lendo
  const podeParar     = lendo
  const podeConfirmar = conectado && !lendo && totalUnico > 0 && !resultado

  async function handleIniciar() {
    limpar()
    setResultado(null)
    try { await iniciar() } catch {}
  }

  async function handleConfirmar() {
    setConfirmando(true)
    try {
      const { data } = await api.post('/enxoval/movimentacoes/', {
        tipo_mov:    tipoMov,
        tags:        paraApi(),
        responsavel,
        observacoes,
      })
      setResultado(data.movimentacao)
      onSuccess()
      limpar()
    } catch (e) {
      alert(e.response?.data?.erro || 'Erro ao registrar movimentação')
    } finally {
      setConfirmando(false)
    }
  }

  const label = tipoMov === 'SAIDA' ? 'Saída para Lavanderia' : 'Entrada da Lavanderia'

  return (
    <div className="space-y-4">
      {/* controles do leitor */}
      <Card title={label}>
        <div className="flex flex-col gap-3">
          {!conectado && (
            <p className="text-xs text-amber-400">Conecte o leitor na barra acima para começar.</p>
          )}

          <div className="flex flex-wrap gap-2">
            {podeLer && (
              <button
                onClick={handleIniciar}
                className="px-4 py-2 text-sm bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition"
              >
                Iniciar leitura
              </button>
            )}

            {podeParar && (
              <button
                onClick={parar}
                className="px-4 py-2 text-sm bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition animate-pulse"
              >
                Parar
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* lista de tags lidas */}
      {(totalUnico > 0 || lendo) && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-4 text-xs">
              <span className="text-emerald-400 font-medium">{totalUnico} reconhecidas</span>
              {totalIgnorado > 0 && <span className="text-muted">{totalIgnorado} ignoradas</span>}
            </div>
            {lendo && <span className="text-xs text-primary animate-pulse">lendo…</span>}
          </div>

          <div className="space-y-1">
            {tagsValidas.map(tag => {
              const tipo = inferirTipo(tag.epc, tipos)
              return (
                <div
                  key={tag.epc}
                  className="flex items-center gap-3 py-1.5 px-2 rounded-lg bg-white/[0.03] border border-white/[0.04]"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-dim font-mono truncate">{fmtEpc(tag.epc)}</p>
                    <p className="text-[10px] text-muted">{tipo?.nome || 'Tipo desconhecido'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-muted">{tag.contagem}×</p>
                    {tag.rssi && <p className="text-[10px] text-muted">{tag.rssi} dBm</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* confirmação */}
      {podeConfirmar && (
        <Card title="Confirmar movimentação">
          <div className="space-y-3">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted mb-1 block">Quem fez a coleta</label>
                <select
                  value={responsavel}
                  onChange={e => setResponsavel(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary/40"
                >
                  <option value="">Selecione…</option>
                  {coletores.filter(c => c.ativo).map(c => (
                    <option key={c.id} value={c.nome}>{c.nome}</option>
                  ))}
                </select>
                {coletores.filter(c => c.ativo).length === 0 && (
                  <p className="text-[10px] text-amber-400 mt-1">
                    Nenhum coletor cadastrado — adicione na aba Cadastro.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Observações</label>
                <input
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  placeholder="Opcional"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary/40"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">
                Registrar <span className="text-dim font-medium">{totalUnico} peças</span>{' '}
                como <span className={tipoMov === 'SAIDA' ? 'text-amber-400' : 'text-emerald-400'}>
                  {tipoMov === 'SAIDA' ? 'Na Lavanderia' : 'Em Hotel'}
                </span>
              </p>
              <button
                onClick={handleConfirmar}
                disabled={confirmando || !responsavel}
                title={!responsavel ? 'Selecione o responsável pela coleta' : undefined}
                className="px-5 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
              >
                {confirmando ? 'Registrando…' : `Confirmar ${tipoMov === 'SAIDA' ? 'Saída' : 'Entrada'}`}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* resultado */}
      {resultado && (
        <div className="bg-emerald-500/[0.04] rounded-2xl border border-emerald-500/25 p-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 grid place-items-center flex-shrink-0">
              <Ico.Check className="w-5 h-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-dim">
                {tipoMov === 'SAIDA' ? 'Saída' : 'Entrada'} #{resultado.numero} registrada
              </p>
              <p className="text-xs text-muted">{resultado.total_itens} peças · {resultado.criado_em}</p>
            </div>
            <button
              onClick={() => { setResultado(null); limpar() }}
              className="ml-auto text-xs text-primary hover:underline"
            >
              Nova leitura
            </button>
          </div>
          <ResumoRol mov={resultado} />
        </div>
      )}
    </div>
  )
}

// ── Histórico ─────────────────────────────────────────────────────────────────
function TabHistorico({ movimentacoes, loading, onSelect, detalhe, loadingDetalhe }) {
  const [filtro, setFiltro] = useState('')

  const lista = filtro
    ? movimentacoes.filter(m => m.tipo_mov === filtro)
    : movimentacoes

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {['', 'SAIDA', 'ENTRADA'].map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition ${
              filtro === f
                ? 'border-primary/40 text-primary bg-primary/10'
                : 'border-white/[0.08] text-muted hover:border-primary/30 hover:text-primary'
            }`}
          >
            {f === '' ? 'Todos' : f === 'SAIDA' ? '↑ Saídas' : '↓ Entradas'}
          </button>
        ))}
      </div>

      {loading && <p className="text-muted text-sm">Carregando…</p>}

      <div className="space-y-1">
        {lista.map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:border-primary/20 hover:bg-white/[0.05] transition text-left"
          >
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${m.tipo_mov === 'SAIDA' ? 'text-amber-400' : 'text-emerald-400'}`}>
                {m.tipo_mov === 'SAIDA' ? '↑' : '↓'}
              </span>
              <div>
                <p className="text-sm text-dim">
                  {m.tipo_mov === 'SAIDA' ? 'Saída' : 'Entrada'} #{m.numero}
                  {m.responsavel && <span className="text-muted ml-2 text-xs">{m.responsavel}</span>}
                </p>
                <p className="text-xs text-muted">{m.criado_em}</p>
              </div>
            </div>
            <span className="text-xs text-muted">{m.total_itens} peças</span>
          </button>
        ))}
        {!loading && lista.length === 0 && (
          <p className="text-muted text-sm text-center py-8">Nenhuma movimentação encontrada.</p>
        )}
      </div>

      {/* detalhe */}
      {detalhe && (
        <Card title={`Detalhe · ${detalhe.tipo_mov === 'SAIDA' ? 'Saída' : 'Entrada'} #${detalhe.numero}`}>
          {loadingDetalhe ? (
            <p className="text-muted text-sm">Carregando…</p>
          ) : (
            <>
            <ResumoRol mov={detalhe} />
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mt-4 mb-2">Etiquetas lidas</p>
            <div className="space-y-1">
              {detalhe.itens?.map(it => (
                <div key={it.id} className="flex items-center gap-3 py-1 text-xs">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-primary" />
                  <span className="font-mono text-muted flex-1">{fmtEpc(it.epc_lido)}</span>
                  <span className="text-muted">{it.tipo_nome || 'Desconhecido'}</span>
                  <span className={`${it.status_item === 'RECONHECIDA' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {it.status_item === 'RECONHECIDA' ? '✓' : '?'}
                  </span>
                </div>
              ))}
            </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

// ── Cadastro ──────────────────────────────────────────────────────────────────
function CardColetores({ coletores, onRefresh }) {
  const [nome, setNome]       = useState('')
  const [salvando, setSalvando] = useState(false)

  const ativos   = coletores.filter(c => c.ativo)
  const inativos = coletores.filter(c => !c.ativo)

  async function adicionar() {
    const limpo = nome.trim()
    if (!limpo || salvando) return
    setSalvando(true)
    try {
      await api.post('/enxoval/coletores/', { nome: limpo })
      setNome('')
      onRefresh()
    } catch (e) {
      alert(e.response?.data?.erro || 'Erro ao adicionar')
    } finally {
      setSalvando(false)
    }
  }

  async function alternar(c) {
    try {
      await api.put(`/enxoval/coletores/${c.id}/`, { ativo: !c.ativo })
      onRefresh()
    } catch (e) {
      alert(e.response?.data?.erro || 'Erro ao atualizar')
    }
  }

  return (
    <Card title="Quem faz a coleta">
      <p className="text-xs text-muted mb-4">
        Lista própria do enxoval, independente dos usuários do sistema. Quem sai da
        equipe é desativado, não excluído, para não apagar o nome dos rols já emitidos.
      </p>

      <div className="flex gap-2">
        <input
          value={nome}
          onChange={e => setNome(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
          placeholder="Nome da pessoa"
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary/40"
        />
        <button
          onClick={adicionar}
          disabled={salvando || !nome.trim()}
          className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-40"
        >
          Adicionar
        </button>
      </div>

      {ativos.length > 0 && (
        <div className="mt-4 space-y-1">
          {ativos.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/[0.03] transition">
              <span className="flex-1 text-sm text-dim truncate">{c.nome}</span>
              <button
                onClick={() => alternar(c)}
                className="text-xs px-2 py-1 text-muted hover:text-rose-400 transition"
              >
                Desativar
              </button>
            </div>
          ))}
        </div>
      )}

      {inativos.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-1">
          <p className="text-[10px] text-muted uppercase tracking-wide mb-1">Inativos</p>
          {inativos.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg">
              <span className="flex-1 text-sm text-muted/50 truncate">{c.nome}</span>
              <button
                onClick={() => alternar(c)}
                className="text-xs px-2 py-1 text-muted hover:text-primary transition"
              >
                Reativar
              </button>
            </div>
          ))}
        </div>
      )}

      {coletores.length === 0 && (
        <p className="text-xs text-muted mt-3">Nenhuma pessoa cadastrada ainda.</p>
      )}
    </Card>
  )
}

function TabCadastro({ tipos, coletores, onRefresh, rfidState }) {
  const [form, setForm]         = useState({ nome: '', codigo: '', estoque_minimo: 0 })
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState(null)

  // programar (gravar EPC em tags em branco)
  const [progTipoId, setProgTipoId]       = useState('')
  const [proximoSerial, setProximoSerial] = useState(1)
  const [gravando, setGravando]           = useState(false)
  const [programadas, setProgramadas]     = useState([])

  const { lendo, conectado, gravarEpc } = rfidState

  // ── programar: calcula próximo serial quando tipo muda ────────────────────
  // montarEpc lança se o código do tipo não for hexadecimal. Como isso roda no
  // render, a exceção derrubaria a página inteira — daí o try.
  const tipoPrograma = tipos.find(t => String(t.id) === String(progTipoId))
  let epcProximo = null
  let epcErro    = null
  if (tipoPrograma) {
    try {
      epcProximo = montarEpc({ prefixo: 'A100', tipoCodigo: tipoPrograma.codigo, serial: proximoSerial })
    } catch {
      epcErro = `O código "${tipoPrograma.codigo}" do tipo ${tipoPrograma.nome} não é hexadecimal de 4 dígitos (0-9, A-F). Corrija o tipo para poder gravar etiquetas.`
    }
  }

  useEffect(() => {
    if (!progTipoId) return
    api.get(`/enxoval/pecas/?tipo=${progTipoId}`)
      .then(({ data }) => {
        const max = (data.pecas || []).reduce((m, p) => Math.max(m, p.serial || 0), 0)
        setProximoSerial(max + 1)
      })
      .catch(() => setProximoSerial(1))
  }, [progTipoId])

  async function handleGravar() {
    if (!epcProximo || !conectado || gravando) return
    setGravando(true)
    try {
      await gravarEpc({ epcAtual: '', epcNovo: epcProximo })
      await api.post('/enxoval/pecas/lote/', { tipo_id: progTipoId, epcs: [epcProximo] })
      setProgramadas(prev => [...prev, epcProximo])
      setProximoSerial(s => s + 1)
      onRefresh()
    } catch (e) {
      alert(e.message || e.response?.data?.erro || 'Erro ao gravar etiqueta')
    } finally {
      setGravando(false)
    }
  }

  function iniciarEdicao(tipo) {
    setEditando(tipo.id)
    setForm({ nome: tipo.nome, codigo: tipo.codigo, estoque_minimo: tipo.estoque_minimo })
  }

  function cancelar() {
    setEditando(null)
    setForm({ nome: '', codigo: '', estoque_minimo: 0 })
  }

  async function salvar() {
    if (!form.nome.trim() || !form.codigo.trim()) return
    setSalvando(true)
    try {
      if (editando) {
        await api.put(`/enxoval/tipos/${editando}/`, form)
      } else {
        await api.post('/enxoval/tipos/', form)
      }
      cancelar()
      onRefresh()
    } catch (e) {
      alert(e.response?.data?.erro || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(id) {
    if (!confirm('Excluir este tipo?')) return
    try {
      await api.delete(`/enxoval/tipos/${id}/`)
      onRefresh()
    } catch (e) {
      alert(e.response?.data?.erro || 'Erro ao excluir')
    }
  }

  return (
    <div className="space-y-4">

      {/* ── programar etiquetas em branco ── */}
      <Card title="Programar etiquetas em branco">
        <p className="text-xs text-muted mb-4">
          Grave o EPC do sistema em etiquetas RFID virgens. Posicione <strong className="text-dim">uma etiqueta por vez</strong> bem próxima ao leitor e clique em Gravar.
        </p>

        <div className="mb-4">
          <label className="text-xs text-muted mb-1 block">Tipo de enxoval</label>
          <select
            value={progTipoId}
            onChange={e => { setProgTipoId(e.target.value); setProgramadas([]) }}
            className="w-full max-w-xs bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary/40"
          >
            <option value="">Selecione…</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>

        {epcProximo && (
          <div className="mb-4 p-3 bg-white/[0.03] rounded-xl border border-white/[0.06]">
            <p className="text-[10px] text-muted mb-1">Próximo EPC a gravar — serial #{proximoSerial}</p>
            <p className="text-sm font-mono text-primary tracking-wider">{fmtEpc(epcProximo)}</p>
          </div>
        )}

        {epcErro && (
          <div className="mb-4 p-3 bg-amber-500/10 rounded-xl border border-amber-500/30">
            <p className="text-xs text-amber-400">{epcErro}</p>
          </div>
        )}

        {epcProximo && !conectado && (
          <p className="text-xs text-amber-400">Conecte o leitor na barra acima para gravar.</p>
        )}

        {conectado && epcProximo && !lendo && (
          <button
            onClick={handleGravar}
            disabled={gravando}
            className="px-5 py-2.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition font-medium disabled:opacity-50"
          >
            {gravando ? 'Gravando…' : 'Gravar etiqueta'}
          </button>
        )}

        {programadas.length > 0 && (
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <p className="text-xs text-emerald-400 font-medium mb-2">
              {programadas.length} etiqueta{programadas.length !== 1 ? 's' : ''} gravada{programadas.length !== 1 ? 's' : ''} nesta sessão
            </p>
            <div className="space-y-0.5">
              {programadas.map(epc => (
                <div key={epc} className="flex items-center gap-2 text-xs">
                  <Ico.Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="font-mono text-muted">{fmtEpc(epc)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tipos.length === 0 && (
          <p className="text-xs text-amber-400 mt-3">Crie um tipo de enxoval primeiro (seção abaixo).</p>
        )}
      </Card>

      <CardColetores coletores={coletores} onRefresh={onRefresh} />

      {/* ── gerenciar tipos ── */}
      <Card title={editando ? 'Editar tipo' : 'Tipos de enxoval'}>
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
          <div className="xl:col-span-2">
            <label className="text-xs text-muted mb-1 block">Nome</label>
            <input
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Lençol Casal"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Código EPC (4 hex)</label>
            <input
              value={form.codigo}
              onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 4) }))}
              placeholder="0001"
              maxLength={4}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-dim focus:outline-none focus:border-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Estoque mínimo</label>
            <input
              type="number"
              min={0}
              value={form.estoque_minimo}
              onChange={e => setForm(f => ({ ...f, estoque_minimo: parseInt(e.target.value) || 0 }))}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary/40"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={salvar}
            disabled={salvando || !form.nome.trim() || form.codigo.length !== 4}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-40"
          >
            {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar tipo'}
          </button>
          {editando && (
            <button onClick={cancelar} className="px-4 py-2 text-sm text-muted hover:text-dim transition">
              Cancelar
            </button>
          )}
        </div>

        <p className="text-[10px] text-muted mt-2">
          O código EPC identifica o tipo na etiqueta RFID: A100 <strong>{form.codigo || 'XXXX'}</strong> SSSSSSSS 00000000
        </p>

        {/* lista de tipos */}
        {tipos.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-1">
            {tipos.map(tipo => (
              <div key={tipo.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/[0.03] transition">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-dim">{tipo.nome}</span>
                  <span className="text-xs text-muted ml-2 font-mono">A100{tipo.codigo}</span>
                  {tipo.estoque_minimo > 0 && (
                    <span className="text-xs text-muted ml-2">mín: {tipo.estoque_minimo}</span>
                  )}
                </div>
                {!tipo.ativo && <span className="text-[10px] text-muted border border-white/[0.08] px-1.5 rounded">inativo</span>}
                <div className="flex gap-1">
                  <button onClick={() => iniciarEdicao(tipo)} className="text-xs px-2 py-1 text-muted hover:text-primary transition">Editar</button>
                  <button onClick={() => excluir(tipo.id)} className="text-xs px-2 py-1 text-muted hover:text-rose-400 transition">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
// ── Visão do operador ─────────────────────────────────────────────────────────
function AcaoGrande({ tipo, onClick }) {
  const saida = tipo === 'SAIDA'
  const Icone = saida ? Ico.Saida : Ico.Entrada
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl border p-5 flex items-center gap-4 transition active:scale-[0.98] ${
        saida
          ? 'bg-amber-500/[0.08] border-amber-500/25 hover:bg-amber-500/[0.12]'
          : 'bg-emerald-500/[0.08] border-emerald-500/25 hover:bg-emerald-500/[0.12]'
      }`}
    >
      <span className={`w-14 h-14 rounded-2xl grid place-items-center flex-shrink-0 ${
        saida ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'
      }`}>
        <Icone className="w-7 h-7" />
      </span>
      <span className="text-left min-w-0">
        <span className={`block text-lg font-semibold ${saida ? 'text-amber-400' : 'text-emerald-400'}`}>
          {saida ? 'Saída' : 'Entrada'}
        </span>
        <span className="block text-xs text-muted mt-0.5">
          {saida ? 'Enviar peças para a lavanderia' : 'Receber peças da lavanderia'}
        </span>
      </span>
    </button>
  )
}

function VistaOperacao({ tipos, coletores, rfidState, onSuccess, onGestao }) {
  const [acao, setAcao] = useState(null)

  if (acao) {
    return (
      <div className="p-4 space-y-4">
        <BarraLeitor rfidState={rfidState} />
        <button
          onClick={() => setAcao(null)}
          className="flex items-center gap-1 -ml-1 text-sm text-muted hover:text-dim transition"
        >
          <Ico.Voltar className="w-4 h-4" />
          Voltar
        </button>
        <TabMovimentacao
          tipoMov={acao}
          tipos={tipos}
          coletores={coletores}
          rfidState={rfidState}
          onSuccess={onSuccess}
        />
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-4 min-h-[calc(100vh-2rem)]">
      <div>
        <h1 className="text-xl font-bold text-dim">Enxoval</h1>
        <p className="text-xs text-muted mt-0.5">O que você vai fazer agora?</p>
      </div>

      <BarraLeitor rfidState={rfidState} />

      <div className="flex flex-col gap-3">
        <AcaoGrande tipo="SAIDA"   onClick={() => setAcao('SAIDA')} />
        <AcaoGrande tipo="ENTRADA" onClick={() => setAcao('ENTRADA')} />
      </div>

      <button
        onClick={onGestao}
        className="mt-auto flex items-center justify-center gap-2 py-3 text-xs text-muted hover:text-dim transition"
      >
        <Ico.Gestao className="w-4 h-4" />
        Painel de gestão
      </button>
    </div>
  )
}

export default function Enxoval() {
  const { empresaAtiva: empresa } = useEmpresa()
  const [tab, setTab] = useState('dashboard')
  // O APK só é instalado nos aparelhos que têm leitor, então ele abre direto na
  // visão do operador. Quem acessa pelo navegador é gestor e cai no painel.
  const [modoOperacao, setModoOperacao] = useState(() => {
    try { return Capacitor.isNativePlatform() } catch { return false }
  })

  const [dashboard, setDashboard]     = useState(null)
  const [dashLoading, setDashLoading] = useState(false)
  const [tipos, setTipos]             = useState([])
  const [coletores, setColetores]     = useState([])
  const [movimentacoes, setMovs]      = useState([])
  const [movsLoading, setMovsLoading] = useState(false)
  const [detalheId, setDetalheId]     = useState(null)
  const [detalhe, setDetalhe]         = useState(null)
  const [detalheLoading, setDetLoading] = useState(false)

  const rfidState = useRfid({ prefixo: EPC_PREFIXO, rssiMinimo: -65 })

  const carregarDashboard = useCallback(async () => {
    setDashLoading(true)
    try {
      const { data } = await api.get('/enxoval/dashboard/')
      setDashboard(data)
    } catch {}
    finally { setDashLoading(false) }
  }, [])

  const carregarTipos = useCallback(async () => {
    try {
      const { data } = await api.get('/enxoval/tipos/')
      setTipos(data.tipos || [])
    } catch {}
  }, [])

  const carregarColetores = useCallback(async () => {
    try {
      const { data } = await api.get('/enxoval/coletores/')
      setColetores(data.coletores || [])
    } catch {}
  }, [])

  const carregarMovs = useCallback(async () => {
    setMovsLoading(true)
    try {
      const { data } = await api.get('/enxoval/movimentacoes/')
      setMovs(data.movimentacoes || [])
    } catch {}
    finally { setMovsLoading(false) }
  }, [])

  const carregarDetalhe = useCallback(async (id) => {
    setDetalheId(id)
    setDetLoading(true)
    try {
      const { data } = await api.get(`/enxoval/movimentacoes/${id}/`)
      setDetalhe(data.movimentacao)
    } catch {}
    finally { setDetLoading(false) }
  }, [])

  useEffect(() => {
    if (!empresa) return
    carregarDashboard()
    carregarTipos()
    carregarColetores()
  }, [empresa, carregarDashboard, carregarTipos, carregarColetores])

  useEffect(() => {
    if (tab === 'historico') carregarMovs()
    if (tab === 'dashboard') carregarDashboard()
  }, [tab])  // eslint-disable-line

  function onMovimentacaoRegistrada() {
    carregarDashboard()
    if (tab === 'historico') carregarMovs()
  }

  const TABS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'saida',     label: 'Saída',     Icone: Ico.Saida },
    { id: 'entrada',   label: 'Entrada',   Icone: Ico.Entrada },
    { id: 'historico', label: 'Histórico' },
    { id: 'cadastro',  label: 'Cadastro' },
  ]

  if (modoOperacao) {
    return (
      <VistaOperacao
        tipos={tipos}
        coletores={coletores}
        rfidState={rfidState}
        onSuccess={onMovimentacaoRegistrada}
        onGestao={() => setModoOperacao(false)}
      />
    )
  }

  return (
    <div className="p-4 xl:p-6 space-y-5">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-dim">Controle de Enxoval</h1>
          <p className="text-xs text-muted mt-0.5">Saídas e entradas com leitura RFID</p>
        </div>
        <button
          onClick={() => setModoOperacao(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted hover:text-dim border border-white/[0.08] hover:border-white/[0.16] rounded-lg transition flex-shrink-0"
          title="Tela simplificada para quem opera o leitor"
        >
          <Ico.Antena className="w-3.5 h-3.5" />
          Modo operação
        </button>
      </div>

      {/* abas */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-x-auto">
        {TABS.map(t => (
          <TabBtn key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.Icone && <t.Icone className="w-3.5 h-3.5" />}
            {t.label}
          </TabBtn>
        ))}
      </div>

      {/* leitor: um ponto só de conexão, nas abas que o usam */}
      {['saida', 'entrada', 'cadastro'].includes(tab) && (
        <BarraLeitor rfidState={rfidState} />
      )}

      {/* conteúdo */}
      {tab === 'dashboard' && (
        <TabDashboard dados={dashboard} loading={dashLoading} />
      )}
      {tab === 'saida' && (
        <TabMovimentacao
          tipoMov="SAIDA"
          tipos={tipos}
          coletores={coletores}
          rfidState={rfidState}
          onSuccess={onMovimentacaoRegistrada}
        />
      )}
      {tab === 'entrada' && (
        <TabMovimentacao
          tipoMov="ENTRADA"
          tipos={tipos}
          coletores={coletores}
          rfidState={rfidState}
          onSuccess={onMovimentacaoRegistrada}
        />
      )}
      {tab === 'historico' && (
        <TabHistorico
          movimentacoes={movimentacoes}
          loading={movsLoading}
          onSelect={carregarDetalhe}
          detalhe={detalhe}
          loadingDetalhe={detalheLoading}
        />
      )}
      {tab === 'cadastro' && (
        <TabCadastro
          tipos={tipos}
          coletores={coletores}
          rfidState={rfidState}
          onRefresh={() => { carregarTipos(); carregarColetores(); carregarDashboard() }}
        />
      )}
    </div>
  )
}
