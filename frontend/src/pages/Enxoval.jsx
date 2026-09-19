import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import { useEmpresa } from '../contexts/EmpresaContext'
import { useRfid } from '../hooks/useRfid'
import { StatusLeitor } from '../services/rfid'

// ── helpers ───────────────────────────────────────────────────────────────────
const EPC_PREFIXO = 'A100'

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
      className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
        active
          ? 'bg-primary/15 text-primary border border-primary/30'
          : 'text-muted hover:text-dim border border-transparent hover:border-white/[0.08]'
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
  const bateriaLabel = info?.bateria != null ? ` · 🔋${info.bateria}%` : ''

  const LABEL = {
    [StatusLeitor.DESCONECTADO]: 'Leitor desconectado',
    [StatusLeitor.CONECTANDO]:   'Conectando…',
    [StatusLeitor.CONECTADO]:    `Conectado${nomeLabel}${bateriaLabel}`,
    [StatusLeitor.LENDO]:        `Lendo…${nomeLabel}`,
    [StatusLeitor.ERRO]:         `Erro: ${erro}`,
  }

  const conectadoOuLendo = status === StatusLeitor.CONECTADO || status === StatusLeitor.LENDO

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status === StatusLeitor.LENDO ? 'bg-primary animate-pulse' : 'bg-current'} ${COR[status]}`} />
      <span className={COR[status]}>{LABEL[status]}</span>
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

// ── Dashboard ─────────────────────────────────────────────────────────────────
function TabDashboard({ dados, loading }) {
  if (loading) return <p className="text-muted text-sm">Carregando…</p>
  if (!dados)  return <p className="text-muted text-sm">Sem dados.</p>

  return (
    <div className="space-y-4">
      {/* totalizadores */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'Total cadastrado',  value: dados.total_pecas,         cls: 'text-dim' },
          { label: 'Em Hotel',          value: dados.total_em_hotel,       cls: 'text-emerald-400' },
          { label: 'Na Lavanderia',     value: dados.total_na_lavanderia,  cls: 'text-amber-400' },
          { label: 'Na Lavanderia (%)', value: dados.total_pecas > 0 ? `${Math.round(dados.total_na_lavanderia / dados.total_pecas * 100)}%` : '—', cls: 'text-amber-400' },
        ].map(item => (
          <Card key={item.label}>
            <p className="text-xs text-muted mb-1">{item.label}</p>
            <p className={`text-2xl font-bold ${item.cls}`}>{item.value}</p>
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
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: tipo.cor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm text-dim font-medium truncate">{tipo.nome}</span>
                      <span className="text-xs text-muted flex-shrink-0">
                        {tipo.em_hotel} / {tipo.total}
                        {baixoEstoque && <span className="ml-1 text-rose-400">⚠</span>}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: tipo.cor }}
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
        <div className="text-center py-12 text-muted">
          <p className="text-4xl mb-3">🏷️</p>
          <p className="font-medium text-dim">Nenhum enxoval cadastrado</p>
          <p className="text-sm mt-1">Acesse a aba <strong className="text-primary">Cadastro</strong> para começar</p>
        </div>
      )}
    </div>
  )
}

// ── Sessão RFID (saída / entrada) ─────────────────────────────────────────────
function TabMovimentacao({ tipoMov, tipos, rfidState, onSuccess }) {
  const [responsavel, setResponsavel]   = useState('')
  const [observacoes, setObservacoes]   = useState('')
  const [confirmando, setConfirmando]   = useState(false)
  const [resultado, setResultado]       = useState(null)

  const {
    status, info, erro, lendo, conectado,
    tagsValidas, totalUnico, totalIgnorado,
    conectar, desconectar, iniciar, parar, limpar, paraApi,
  } = rfidState

  const podeConectar  = status === StatusLeitor.DESCONECTADO || status === StatusLeitor.ERRO
  const podeLer       = conectado && !lendo
  const podeParar     = lendo
  const podeConfirmar = conectado && !lendo && totalUnico > 0 && !resultado

  async function handleConectar() {
    try { await conectar() } catch {}
  }

  async function handleDesconectar() {
    await desconectar()
    limpar()
    setResultado(null)
  }

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
          <LeitorStatusBar status={status} info={info} erro={erro} />

          <div className="flex flex-wrap gap-2">
            {podeConectar ? (
              <button
                onClick={handleConectar}
                className="px-4 py-2 text-sm bg-primary/15 text-primary border border-primary/30 rounded-lg hover:bg-primary/20 transition"
              >
                Conectar leitor
              </button>
            ) : (
              <button
                onClick={handleDesconectar}
                className="px-4 py-2 text-sm bg-white/[0.06] text-muted border border-white/[0.08] rounded-lg hover:text-rose-400 hover:border-rose-500/30 transition"
              >
                Desconectar
              </button>
            )}

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

          <div className="max-h-64 overflow-y-auto space-y-1">
            {tagsValidas.map(tag => {
              const tipo = inferirTipo(tag.epc, tipos)
              return (
                <div
                  key={tag.epc}
                  className="flex items-center gap-3 py-1.5 px-2 rounded-lg bg-white/[0.03] border border-white/[0.04]"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: tipo?.cor || '#6366f1' }}
                  />
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
                <label className="text-xs text-muted mb-1 block">Responsável</label>
                <input
                  value={responsavel}
                  onChange={e => setResponsavel(e.target.value)}
                  placeholder="Nome do responsável"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary/40"
                />
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
                disabled={confirmando}
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
        <Card>
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
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
        </Card>
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
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {detalhe.itens?.map(it => (
                <div key={it.id} className="flex items-center gap-3 py-1 text-xs">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: it.tipo_cor || '#6366f1' }}
                  />
                  <span className="font-mono text-muted flex-1">{fmtEpc(it.epc_lido)}</span>
                  <span className="text-muted">{it.tipo_nome || 'Desconhecido'}</span>
                  <span className={`${it.status_item === 'RECONHECIDA' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {it.status_item === 'RECONHECIDA' ? '✓' : '?'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ── Cadastro ──────────────────────────────────────────────────────────────────
const CORES = ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#f97316', '#8b5cf6', '#ef4444']

function TabCadastro({ tipos, onRefresh, rfidState }) {
  const [form, setForm]         = useState({ nome: '', codigo: '', cor: CORES[0], estoque_minimo: 0 })
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState(null)

  // lote
  const [tipoLoteId, setTipoLoteId]   = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [resultadoLote, setResultLote] = useState(null)

  const {
    status, info, erro, lendo, conectado,
    tagsValidas, totalUnico, totalIgnorado,
    conectar, desconectar, iniciar, parar, limpar, paraApi,
  } = rfidState

  const podeConectar  = status === StatusLeitor.DESCONECTADO || status === StatusLeitor.ERRO
  const podeLer       = conectado && !lendo
  const podeRegistrar = conectado && !lendo && totalUnico > 0 && tipoLoteId && !resultadoLote

  async function handleConectarLote() {
    try { await conectar() } catch {}
  }

  async function handleIniciarLote() {
    limpar()
    setResultLote(null)
    try { await iniciar() } catch {}
  }

  async function handleRegistrarLote() {
    setRegistrando(true)
    try {
      const epcs = paraApi().map(t => t.epc)
      const { data } = await api.post('/enxoval/pecas/lote/', { tipo_id: tipoLoteId, epcs })
      setResultLote(data)
      onRefresh()
      limpar()
    } catch (e) {
      alert(e.response?.data?.erro || 'Erro ao registrar lote')
    } finally {
      setRegistrando(false)
    }
  }

  function iniciarEdicao(tipo) {
    setEditando(tipo.id)
    setForm({ nome: tipo.nome, codigo: tipo.codigo, cor: tipo.cor, estoque_minimo: tipo.estoque_minimo })
  }

  function cancelar() {
    setEditando(null)
    setForm({ nome: '', codigo: '', cor: CORES[0], estoque_minimo: 0 })
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

  const tipoLoteSel = tipos.find(t => String(t.id) === String(tipoLoteId))

  return (
    <div className="space-y-4">
      {/* ── cadastro em lote via RFID ── */}
      <Card title="Cadastro em lote via RFID">
        <p className="text-xs text-muted mb-4">
          Aproxime todas as etiquetas do leitor de uma vez, selecione o tipo e registre tudo em um clique.
        </p>

        {/* seleção de tipo */}
        <div className="mb-4">
          <label className="text-xs text-muted mb-1 block">Tipo de enxoval</label>
          <select
            value={tipoLoteId}
            onChange={e => { setTipoLoteId(e.target.value); setResultLote(null); limpar() }}
            className="w-full max-w-xs bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary/40"
          >
            <option value="">Selecione…</option>
            {tipos.map(t => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          {tipoLoteSel && (
            <p className="text-[10px] text-muted mt-1 font-mono">
              EPC: A100 <span className="text-primary">{tipoLoteSel.codigo}</span> SSSSSSSS 00000000
            </p>
          )}
        </div>

        {/* controles leitor */}
        <LeitorStatusBar status={status} info={info} erro={erro} />
        <div className="flex flex-wrap gap-2 mt-3">
          {podeConectar ? (
            <button
              onClick={handleConectarLote}
              className="px-4 py-2 text-sm bg-primary/15 text-primary border border-primary/30 rounded-lg hover:bg-primary/20 transition"
            >
              Conectar leitor
            </button>
          ) : (
            <button
              onClick={() => { desconectar(); limpar(); setResultLote(null) }}
              className="px-4 py-2 text-sm bg-white/[0.06] text-muted border border-white/[0.08] rounded-lg hover:text-rose-400 hover:border-rose-500/30 transition"
            >
              Desconectar
            </button>
          )}
          {podeLer && (
            <button
              onClick={handleIniciarLote}
              disabled={!tipoLoteId}
              className="px-4 py-2 text-sm bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition disabled:opacity-40"
            >
              Iniciar leitura
            </button>
          )}
          {lendo && (
            <button
              onClick={parar}
              className="px-4 py-2 text-sm bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition animate-pulse"
            >
              Parar
            </button>
          )}
        </div>

        {/* contador em tempo real */}
        {(totalUnico > 0 || lendo) && (
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-primary">{totalUnico}</span>
              <div>
                <p className="text-xs text-dim font-medium">etiquetas lidas</p>
                {totalIgnorado > 0 && <p className="text-[10px] text-muted">{totalIgnorado} ignoradas (fora do sistema)</p>}
              </div>
            </div>
            {lendo && <span className="text-xs text-primary animate-pulse ml-auto">lendo…</span>}
          </div>
        )}

        {/* lista resumida de tags */}
        {totalUnico > 0 && !lendo && (
          <div className="mt-3 max-h-40 overflow-y-auto space-y-0.5 border border-white/[0.06] rounded-xl p-2">
            {tagsValidas.map(tag => (
              <div key={tag.epc} className="flex items-center gap-2 py-1 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="font-mono text-muted flex-1 truncate">{fmtEpc(tag.epc)}</span>
                <span className="text-muted">{tag.contagem}×</span>
              </div>
            ))}
          </div>
        )}

        {/* botão registrar */}
        {podeRegistrar && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleRegistrarLote}
              disabled={registrando}
              className="px-5 py-2.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition font-medium disabled:opacity-50"
            >
              {registrando
                ? 'Registrando…'
                : `Cadastrar ${totalUnico} etiqueta${totalUnico !== 1 ? 's' : ''} como ${tipoLoteSel?.nome}`}
            </button>
          </div>
        )}

        {/* resultado */}
        {resultadoLote && (
          <div className="mt-4 flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <span className="text-xl">✅</span>
            <div>
              <p className="text-sm font-medium text-emerald-400">
                {resultadoLote.criadas} peças cadastradas
                {resultadoLote.atualizadas > 0 && `, ${resultadoLote.atualizadas} atualizadas`}
              </p>
              <p className="text-xs text-muted">{resultadoLote.total} etiquetas processadas no total</p>
            </div>
            <button
              onClick={() => setResultLote(null)}
              className="ml-auto text-xs text-muted hover:text-dim"
            >
              Novo lote
            </button>
          </div>
        )}

        {tipos.length === 0 && (
          <p className="text-xs text-amber-400 mt-3">
            Crie um tipo de enxoval primeiro (seção abaixo) para poder cadastrar etiquetas.
          </p>
        )}
      </Card>

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
              onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase().slice(0, 4) }))}
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

        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-muted">Cor:</span>
          {CORES.map(c => (
            <button
              key={c}
              onClick={() => setForm(f => ({ ...f, cor: c }))}
              className={`w-5 h-5 rounded-full border-2 transition ${form.cor === c ? 'border-white scale-110' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
          <span className="text-xs font-mono text-muted ml-1">{form.cor}</span>
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
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tipo.cor }} />
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
export default function Enxoval() {
  const { empresa } = useEmpresa()
  const [tab, setTab] = useState('dashboard')

  const [dashboard, setDashboard]     = useState(null)
  const [dashLoading, setDashLoading] = useState(false)
  const [tipos, setTipos]             = useState([])
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
  }, [empresa, carregarDashboard, carregarTipos])

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
    { id: 'saida',     label: '↑ Saída' },
    { id: 'entrada',   label: '↓ Entrada' },
    { id: 'historico', label: 'Histórico' },
    { id: 'cadastro',  label: 'Cadastro' },
  ]

  return (
    <div className="p-4 xl:p-6 space-y-4">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-dim">Controle de Enxoval</h1>
          <p className="text-xs text-muted mt-0.5">Saídas e entradas com leitura RFID</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(t => (
            <TabBtn key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </TabBtn>
          ))}
        </div>
      </div>

      {/* conteúdo */}
      {tab === 'dashboard' && (
        <TabDashboard dados={dashboard} loading={dashLoading} />
      )}
      {tab === 'saida' && (
        <TabMovimentacao
          tipoMov="SAIDA"
          tipos={tipos}
          rfidState={rfidState}
          onSuccess={onMovimentacaoRegistrada}
        />
      )}
      {tab === 'entrada' && (
        <TabMovimentacao
          tipoMov="ENTRADA"
          tipos={tipos}
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
          rfidState={rfidState}
          onRefresh={() => { carregarTipos(); carregarDashboard() }}
        />
      )}
    </div>
  )
}
