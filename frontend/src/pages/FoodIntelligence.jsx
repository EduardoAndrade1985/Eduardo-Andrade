import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line, LabelList,
} from 'recharts'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import api from '../services/api'
import { useTheme } from '../contexts/ThemeContext'
import { useEmpresa } from '../contexts/EmpresaContext'

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtR  = v => (+(v)||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2, maximumFractionDigits:2 })
const fmtK  = v => { const n=+(v)||0; if(Math.abs(n)>=1e6) return `R$${(n/1e6).toFixed(1).replace('.',',')}M`; if(Math.abs(n)>=1e3) return `R$${(n/1e3).toFixed(0)}k`; return fmtR(n) }
const fmtN  = v => (+(v)||0).toLocaleString('pt-BR')
const fmtKg = v => `${(+(v)||0).toLocaleString('pt-BR', { minimumFractionDigits:1, maximumFractionDigits:1 })} kg`
function trunc(s, n) { return s && s.length > n ? s.slice(0,n-1)+'…' : (s||'—') }
function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function fmtDiaCurto(iso) { const [, m, d] = iso.split('-'); return `${d}/${m}` }
function fmtDiaBR(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function fmtDiaBR2(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}` }

const CAT = ['#6366f1','#06b6d4','#f59e0b','#ec4899','#10b981','#f97316','#8b5cf6','#14b8a6','#ef4444','#64748b']

function KpiCard({ label, value, sub, color = 'text-primary' }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-bg2 p-3 flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted truncate">{label}</span>
      <span className={`text-lg font-bold tabular-nums leading-none ${color}`}>{value}</span>
      <span className="text-[10px] text-muted/70 truncate">{sub}</span>
    </div>
  )
}

function ChartCard({ title, onExpand, lblOn, onLbl, children }) {
  return (
    <div className="bg-bg2 rounded-2xl border border-white/[0.06] p-4 hover:border-primary/10 transition">
      <div className="flex items-center justify-between mb-3 gap-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">{title}</p>
        <div className="flex items-center gap-1.5">
          {onLbl && (
            <button onClick={onLbl} className={`text-[10px] px-2 py-1 border rounded transition ${
              lblOn ? 'border-primary/40 text-primary bg-primary/10' : 'border-white/[0.08] text-muted hover:border-primary/30 hover:text-primary'
            }`}>🏷 Rótulos</button>
          )}
          {onExpand && (
            <button onClick={onExpand}
              className="text-[10px] px-2 py-1 border border-white/[0.08] rounded text-muted hover:border-primary/30 hover:text-primary transition">
              ⛶
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

function ExpandModal({ title, onClose, children }) {
  useEffect(() => {
    const fn = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[9000] bg-black/95 backdrop-blur-sm flex flex-col p-5">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className="font-bold text-dim text-sm">{title}</span>
        <button onClick={onClose}
          className="text-xs px-4 py-1.5 border border-white/[0.08] rounded text-muted hover:border-rose-500/40 hover:text-rose-400 transition">
          ✕ Fechar
        </button>
      </div>
      <div className="flex-1 bg-bg2 border border-white/[0.06] rounded-2xl p-5 overflow-auto flex flex-col">
        {children}
      </div>
    </div>
  )
}

function RegistroEditModal({ registro, categorias, tiposPerda, refeicoes, onClose, onSaved }) {
  const [alimento, setAlimento] = useState(registro.alimento_ia || '')
  const [peso, setPeso]         = useState(registro.peso_kg)
  const [categoriaId, setCategoriaId] = useState(registro.categoria || '')
  const [tipoPerdaId, setTipoPerdaId] = useState(registro.tipo_perda || '')
  const [refeicaoId, setRefeicaoId]   = useState(registro.refeicao || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]         = useState('')

  async function salvar() {
    setSalvando(true); setErro('')
    try {
      const { data } = await api.patch(`/desperdicio/registros/${registro.id}/`, {
        alimento_ia: alimento, peso_kg: peso,
        categoria_id: categoriaId || '', tipo_perda_id: tipoPerdaId || '', refeicao_id: refeicaoId || '',
      })
      onSaved(data)
    } catch {
      setErro('Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-bg2 border border-white/[0.08] rounded-2xl p-5 w-full max-w-sm space-y-3">
        <p className="text-sm font-bold text-dim">Editar Lançamento</p>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">Alimento</span>
          <input value={alimento} onChange={e => setAlimento(e.target.value)}
            className="bg-bg3 border border-white/[0.08] rounded-lg px-2.5 py-2 text-sm text-dim outline-none focus:border-primary/40"/>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">Peso (kg)</span>
          <input type="number" step="0.001" min="0" value={peso} onChange={e => setPeso(e.target.value)}
            className="bg-bg3 border border-white/[0.08] rounded-lg px-2.5 py-2 text-sm text-dim outline-none focus:border-primary/40"/>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">Categoria de Custo</span>
          <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)}
            className="bg-bg3 border border-white/[0.08] rounded-lg px-2.5 py-2 text-sm text-dim outline-none focus:border-primary/40">
            <option value="">Sem categoria</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">Tipo de Perda</span>
          <select value={tipoPerdaId} onChange={e => setTipoPerdaId(e.target.value)}
            className="bg-bg3 border border-white/[0.08] rounded-lg px-2.5 py-2 text-sm text-dim outline-none focus:border-primary/40">
            <option value="">—</option>
            {tiposPerda.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">Refeição</span>
          <select value={refeicaoId} onChange={e => setRefeicaoId(e.target.value)}
            className="bg-bg3 border border-white/[0.08] rounded-lg px-2.5 py-2 text-sm text-dim outline-none focus:border-primary/40">
            <option value="">—</option>
            {refeicoes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        {erro && <p className="text-[11px] text-rose-400">{erro}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/[0.08] text-muted text-xs hover:text-dim">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="flex-1 py-2 rounded-lg bg-primary text-bg text-xs font-semibold disabled:opacity-50">
            {salvando ? '...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg3 border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl text-xs">
      {label && <p className="text-muted mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' ? fmtK(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

function EvolucaoTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg3 border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.dataKey === 'valor' ? fmtR(p.value) : fmtKg(p.value)}
        </p>
      ))}
    </div>
  )
}

function dispositivoOnline(d) {
  if (!d.last_seen) return false
  return (Date.now() - new Date(d.last_seen).getTime()) < 2 * 60 * 1000
}

// ─── pareamento de dispositivos (tablets) — mesmo padrão do TV Manager ─────────
function PainelDispositivos({ unidades }) {
  const [dispositivos, setDispositivos] = useState([])
  const [showForm, setShowForm]         = useState(false)
  const [novoNome, setNovoNome]         = useState('Tablet Cozinha')
  const [novoUnidade, setNovoUnidade]   = useState('')
  const [novoSetor, setNovoSetor]       = useState('')
  const [setoresNovo, setSetoresNovo]   = useState([])
  const [criando, setCriando]           = useState(false)
  const [pairCode, setPairCode]         = useState('')
  const [pairDispId, setPairDispId]     = useState('')
  const [pareando, setPareando]         = useState(false)
  const [pairMsg, setPairMsg]           = useState('')
  const [erro, setErro]                 = useState('')

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get('/desperdicio/dispositivos/')
      setDispositivos(data)
    } catch { setErro('Erro ao carregar dispositivos.') }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!novoUnidade) { setSetoresNovo([]); return }
    api.get('/desperdicio/setores/', { params: { unidade_id: novoUnidade } })
      .then(({ data }) => setSetoresNovo(data)).catch(() => {})
  }, [novoUnidade])

  async function criarDispositivo() {
    if (!novoUnidade) { setErro('Selecione a unidade.'); return }
    setCriando(true); setErro('')
    try {
      const { data } = await api.post('/desperdicio/dispositivos/', {
        nome: novoNome.trim() || 'Tablet Cozinha', unidade_id: novoUnidade, setor_id: novoSetor || undefined,
      })
      setDispositivos(d => [...d, data])
      setShowForm(false)
      setNovoNome('Tablet Cozinha'); setNovoUnidade(''); setNovoSetor('')
    } catch { setErro('Erro ao criar dispositivo.') }
    finally { setCriando(false) }
  }

  async function removerDispositivo(id) {
    if (!confirm('Remover este dispositivo? Ele vai pedir um novo pareamento.')) return
    await api.delete(`/desperdicio/dispositivos/${id}/`)
    setDispositivos(d => d.filter(x => x.id !== id))
  }

  async function parear() {
    if (!pairCode.trim() || !pairDispId) { setPairMsg('Informe o código e selecione o dispositivo.'); return }
    setPareando(true); setPairMsg('')
    try {
      const { data } = await api.post('/desperdicio/dispositivos/pair/confirm/', {
        code: pairCode.trim().toUpperCase(), dispositivo_id: pairDispId,
      })
      setPairMsg(`✓ Pareado com "${data.dispositivo}"!`)
      setPairCode('')
      setTimeout(() => setPairMsg(''), 4000)
    } catch (e) {
      setPairMsg(e.response?.data?.erro || 'Erro ao parear.')
    } finally { setPareando(false) }
  }

  return (
    <ChartCard title="Dispositivos (Tablets de Lançamento)">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Lista + criação */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted">{dispositivos.length} cadastrado{dispositivos.length !== 1 ? 's' : ''}</span>
            <button onClick={() => setShowForm(s => !s)}
              className="text-[10px] px-2 py-1 rounded bg-primary/10 border border-primary/20 text-primary font-semibold">
              + Novo
            </button>
          </div>

          {showForm && (
            <div className="bg-bg3 border border-white/[0.06] rounded-lg p-3 mb-2 space-y-2">
              <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome do dispositivo"
                className="w-full bg-bg2 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30"/>
              <select value={novoUnidade} onChange={e => setNovoUnidade(e.target.value)}
                className="w-full bg-bg2 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30">
                <option value="">Unidade...</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
              <select value={novoSetor} onChange={e => setNovoSetor(e.target.value)} disabled={!novoUnidade}
                className="w-full bg-bg2 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30 disabled:opacity-40">
                <option value="">Setor (opcional)...</option>
                {setoresNovo.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <button onClick={criarDispositivo} disabled={criando}
                className="w-full py-1.5 rounded bg-primary text-bg text-xs font-semibold disabled:opacity-50">
                {criando ? '...' : 'Criar'}
              </button>
            </div>
          )}

          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {dispositivos.map(d => (
              <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-bg3/50 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dispositivoOnline(d) ? 'bg-primary' : 'bg-muted'}`} title={dispositivoOnline(d) ? 'Online' : 'Offline'}/>
                <span className="flex-1 truncate text-dim">{d.nome} — {d.unidade_nome}{d.setor_nome ? ` / ${d.setor_nome}` : ''}</span>
                <button onClick={() => removerDispositivo(d.id)} className="text-muted hover:text-rose-400 flex-shrink-0">remover</button>
              </div>
            ))}
            {dispositivos.length === 0 && <p className="text-[10px] text-muted/50 text-center py-3">Nenhum dispositivo cadastrado</p>}
          </div>
          {erro && <p className="text-[10px] text-rose-400 mt-1">{erro}</p>}
        </div>

        {/* Pareamento */}
        <div className="bg-bg3/50 border border-primary/15 rounded-lg p-3">
          <p className="text-[10px] text-muted mb-2">
            Abra <span className="text-primary font-semibold">{window.location.origin}/desperdicio/registrar</span> no
            tablet e digite o código que aparecer na tela dele:
          </p>
          <input value={pairCode} onChange={e => setPairCode(e.target.value.toUpperCase())} placeholder="AAA-123" maxLength={7}
            className="w-full bg-bg2 border border-white/[0.08] rounded px-2 py-2 text-lg font-mono font-bold text-primary text-center tracking-widest mb-2 outline-none focus:border-primary/40"/>
          <select value={pairDispId} onChange={e => setPairDispId(e.target.value)}
            className="w-full bg-bg2 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim mb-2 outline-none focus:border-primary/30">
            <option value="">Vincular a qual dispositivo?</option>
            {dispositivos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
          <button onClick={parear} disabled={pareando}
            className="w-full py-2 rounded bg-primary text-bg text-xs font-bold disabled:opacity-40">
            {pareando ? 'Pareando...' : 'Parear'}
          </button>
          {pairMsg && (
            <p className={`text-[10px] mt-2 ${pairMsg.startsWith('✓') ? 'text-primary' : 'text-rose-400'}`}>{pairMsg}</p>
          )}
        </div>
      </div>
    </ChartCard>
  )
}

// ─── cadastros — Unidade / Setor / Tipo de Perda / Categoria de Custo ─────────
function CadastroSimples({ titulo, endpoint, placeholder, onChange }) {
  const [itens, setItens]     = useState([])
  const [novoNome, setNovoNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [erro, setErro]       = useState('')
  const [editId, setEditId]   = useState(null)
  const [editNome, setEditNome] = useState('')
  const [salvandoEdit, setSalvandoEdit] = useState(false)

  const carregar = useCallback(async () => {
    try { const { data } = await api.get(endpoint); setItens(data) }
    catch { setErro('Erro ao carregar.') }
  }, [endpoint])

  useEffect(() => { carregar() }, [carregar])

  async function criar() {
    if (!novoNome.trim()) return
    setCriando(true); setErro('')
    try {
      const { data } = await api.post(endpoint, { nome: novoNome.trim() })
      setItens(i => [...i, data])
      setNovoNome('')
      onChange?.()
    } catch { setErro('Erro ao criar.') }
    finally { setCriando(false) }
  }

  async function toggleAtivo(item) {
    const { data } = await api.patch(`${endpoint}${item.id}/`, { ativo: !item.ativo })
    setItens(i => i.map(x => x.id === item.id ? data : x))
    onChange?.()
  }

  function iniciarEdicao(item) {
    setEditId(item.id)
    setEditNome(item.nome)
  }

  async function salvarEdicao(id) {
    if (!editNome.trim()) return
    setSalvandoEdit(true); setErro('')
    try {
      const { data } = await api.patch(`${endpoint}${id}/`, { nome: editNome.trim() })
      setItens(i => i.map(x => x.id === id ? data : x))
      setEditId(null)
      onChange?.()
    } catch { setErro('Erro ao salvar edição.') }
    finally { setSalvandoEdit(false) }
  }

  async function remover(id) {
    if (!confirm('Remover este item?')) return
    await api.delete(`${endpoint}${id}/`)
    setItens(i => i.filter(x => x.id !== id))
    onChange?.()
  }

  return (
    <ChartCard title={titulo}>
      <div className="flex gap-2 mb-3">
        <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder={placeholder}
          onKeyDown={e => e.key === 'Enter' && criar()}
          className="flex-1 bg-bg3 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30"/>
        <button onClick={criar} disabled={criando}
          className="px-3 py-1.5 rounded bg-primary/10 border border-primary/20 text-primary text-xs font-semibold disabled:opacity-50">
          + Adicionar
        </button>
      </div>
      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {itens.map(it => editId === it.id ? (
          <div key={it.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-bg3 border border-primary/30 text-xs">
            <input value={editNome} onChange={e => setEditNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvarEdicao(it.id)} autoFocus
              className="flex-1 bg-bg2 border border-white/[0.08] rounded px-2 py-1 text-xs text-dim outline-none focus:border-primary/40"/>
            <button onClick={() => salvarEdicao(it.id)} disabled={salvandoEdit} className="text-primary hover:text-primary/80 flex-shrink-0 font-semibold">salvar</button>
            <button onClick={() => setEditId(null)} className="text-muted hover:text-dim flex-shrink-0">cancelar</button>
          </div>
        ) : (
          <div key={it.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-bg3/50 text-xs">
            <span className={`flex-1 truncate ${!it.ativo ? 'text-muted/40 line-through' : 'text-dim'}`}>{it.nome}</span>
            <button onClick={() => iniciarEdicao(it)} className="text-muted hover:text-primary flex-shrink-0">editar</button>
            <button onClick={() => toggleAtivo(it)} className="text-muted hover:text-primary flex-shrink-0">{it.ativo ? 'desativar' : 'ativar'}</button>
            <button onClick={() => remover(it.id)} className="text-muted hover:text-rose-400 flex-shrink-0">remover</button>
          </div>
        ))}
        {itens.length === 0 && <p className="text-[10px] text-muted/50 text-center py-3">Nenhum cadastrado</p>}
      </div>
      {erro && <p className="text-[10px] text-rose-400 mt-1">{erro}</p>}
    </ChartCard>
  )
}

function CadastroSetores({ unidades }) {
  const [unidadeId, setUnidadeId] = useState('')
  const [setores, setSetores]     = useState([])
  const [novoNome, setNovoNome]   = useState('')
  const [criando, setCriando]     = useState(false)
  const [erro, setErro]           = useState('')
  const [editId, setEditId]       = useState(null)
  const [editNome, setEditNome]   = useState('')
  const [salvandoEdit, setSalvandoEdit] = useState(false)

  useEffect(() => {
    if (unidades.length && !unidadeId) setUnidadeId(String(unidades[0].id))
  }, [unidades, unidadeId])

  const carregar = useCallback(async () => {
    if (!unidadeId) { setSetores([]); return }
    try { const { data } = await api.get('/desperdicio/setores/', { params: { unidade_id: unidadeId } }); setSetores(data) }
    catch { setErro('Erro ao carregar.') }
  }, [unidadeId])

  useEffect(() => { carregar() }, [carregar])

  async function criar() {
    if (!novoNome.trim() || !unidadeId) return
    setCriando(true); setErro('')
    try {
      const { data } = await api.post('/desperdicio/setores/', { nome: novoNome.trim(), unidade_id: unidadeId })
      setSetores(s => [...s, data])
      setNovoNome('')
    } catch { setErro('Erro ao criar.') }
    finally { setCriando(false) }
  }

  async function toggleAtivo(item) {
    const { data } = await api.patch(`/desperdicio/setores/${item.id}/`, { ativo: !item.ativo })
    setSetores(s => s.map(x => x.id === item.id ? data : x))
  }

  function iniciarEdicao(item) {
    setEditId(item.id)
    setEditNome(item.nome)
  }

  async function salvarEdicao(id) {
    if (!editNome.trim()) return
    setSalvandoEdit(true); setErro('')
    try {
      const { data } = await api.patch(`/desperdicio/setores/${id}/`, { nome: editNome.trim() })
      setSetores(s => s.map(x => x.id === id ? data : x))
      setEditId(null)
    } catch { setErro('Erro ao salvar edição.') }
    finally { setSalvandoEdit(false) }
  }

  async function remover(id) {
    if (!confirm('Remover este setor?')) return
    await api.delete(`/desperdicio/setores/${id}/`)
    setSetores(s => s.filter(x => x.id !== id))
  }

  return (
    <ChartCard title="Setores">
      <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)}
        className="w-full bg-bg3 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30 mb-3">
        {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        {unidades.length === 0 && <option value="">Cadastre uma Unidade primeiro</option>}
      </select>
      <div className="flex gap-2 mb-3">
        <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Novo setor..."
          onKeyDown={e => e.key === 'Enter' && criar()} disabled={!unidadeId}
          className="flex-1 bg-bg3 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30 disabled:opacity-40"/>
        <button onClick={criar} disabled={criando || !unidadeId}
          className="px-3 py-1.5 rounded bg-primary/10 border border-primary/20 text-primary text-xs font-semibold disabled:opacity-50">
          + Adicionar
        </button>
      </div>
      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {setores.map(it => editId === it.id ? (
          <div key={it.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-bg3 border border-primary/30 text-xs">
            <input value={editNome} onChange={e => setEditNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && salvarEdicao(it.id)} autoFocus
              className="flex-1 bg-bg2 border border-white/[0.08] rounded px-2 py-1 text-xs text-dim outline-none focus:border-primary/40"/>
            <button onClick={() => salvarEdicao(it.id)} disabled={salvandoEdit} className="text-primary hover:text-primary/80 flex-shrink-0 font-semibold">salvar</button>
            <button onClick={() => setEditId(null)} className="text-muted hover:text-dim flex-shrink-0">cancelar</button>
          </div>
        ) : (
          <div key={it.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-bg3/50 text-xs">
            <span className={`flex-1 truncate ${!it.ativo ? 'text-muted/40 line-through' : 'text-dim'}`}>{it.nome}</span>
            <button onClick={() => iniciarEdicao(it)} className="text-muted hover:text-primary flex-shrink-0">editar</button>
            <button onClick={() => toggleAtivo(it)} className="text-muted hover:text-primary flex-shrink-0">{it.ativo ? 'desativar' : 'ativar'}</button>
            <button onClick={() => remover(it.id)} className="text-muted hover:text-rose-400 flex-shrink-0">remover</button>
          </div>
        ))}
        {setores.length === 0 && <p className="text-[10px] text-muted/50 text-center py-3">Nenhum setor cadastrado nessa unidade</p>}
      </div>
      {erro && <p className="text-[10px] text-rose-400 mt-1">{erro}</p>}
    </ChartCard>
  )
}

const MODO_CUSTO_LABEL = {
  manual: 'Manual',
  estoque_medio: 'Estoque (médio)',
  estoque_ultimo: 'Estoque (último preço)',
}

function CategoriaCamposForm({ nome, setNome, modo, setModo, custo, setCusto, classe, setClasse }) {
  return (
    <div className="space-y-2">
      <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome (ex: Carnes)"
        className="w-full bg-bg2 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30"/>
      <select value={modo} onChange={e => setModo(e.target.value)}
        className="w-full bg-bg2 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30">
        <option value="manual">Custo manual</option>
        <option value="estoque_medio">Custo médio do Estoque</option>
        <option value="estoque_ultimo">Último preço pago no Estoque</option>
      </select>
      {modo === 'manual' ? (
        <input value={custo} onChange={e => setCusto(e.target.value)} type="number" step="0.01" placeholder="Custo por kg (R$)"
          className="w-full bg-bg2 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30"/>
      ) : (
        <input value={classe} onChange={e => setClasse(e.target.value)} placeholder="Classe no Estoque (Entrada de Notas)"
          className="w-full bg-bg2 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30"/>
      )}
    </div>
  )
}

function CadastroCategorias() {
  const [categorias, setCategorias] = useState([])
  const [showForm, setShowForm]     = useState(false)
  const [novoNome, setNovoNome]     = useState('')
  const [novoCusto, setNovoCusto]   = useState('')
  const [novoModo, setNovoModo]     = useState('manual')
  const [novaClasse, setNovaClasse] = useState('')
  const [criando, setCriando]       = useState(false)
  const [erro, setErro]             = useState('')
  const [editId, setEditId]         = useState(null)
  const [editNome, setEditNome]     = useState('')
  const [editCusto, setEditCusto]   = useState('')
  const [editModo, setEditModo]     = useState('manual')
  const [editClasse, setEditClasse] = useState('')
  const [salvandoEdit, setSalvandoEdit] = useState(false)

  const carregar = useCallback(async () => {
    try { const { data } = await api.get('/desperdicio/categorias/'); setCategorias(data) }
    catch { setErro('Erro ao carregar.') }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function criar() {
    if (!novoNome.trim()) return
    setCriando(true); setErro('')
    try {
      const { data } = await api.post('/desperdicio/categorias/', {
        nome: novoNome.trim(), custo_kg_medio: novoCusto || 0, modo_custo: novoModo, estoque_classe: novaClasse.trim(),
      })
      setCategorias(c => [...c, data])
      setShowForm(false)
      setNovoNome(''); setNovoCusto(''); setNovoModo('manual'); setNovaClasse('')
    } catch { setErro('Erro ao criar.') }
    finally { setCriando(false) }
  }

  async function toggleAtivo(item) {
    const { data } = await api.patch(`/desperdicio/categorias/${item.id}/`, { ativo: !item.ativo })
    setCategorias(c => c.map(x => x.id === item.id ? data : x))
  }

  function iniciarEdicao(item) {
    setEditId(item.id)
    setEditNome(item.nome)
    setEditCusto(item.custo_kg_medio)
    setEditModo(item.modo_custo)
    setEditClasse(item.estoque_classe || '')
  }

  async function salvarEdicao(id) {
    if (!editNome.trim()) return
    setSalvandoEdit(true); setErro('')
    try {
      const { data } = await api.patch(`/desperdicio/categorias/${id}/`, {
        nome: editNome.trim(), custo_kg_medio: editCusto || 0, modo_custo: editModo, estoque_classe: editClasse.trim(),
      })
      setCategorias(c => c.map(x => x.id === id ? data : x))
      setEditId(null)
    } catch { setErro('Erro ao salvar edição.') }
    finally { setSalvandoEdit(false) }
  }

  async function remover(id) {
    if (!confirm('Remover esta categoria?')) return
    await api.delete(`/desperdicio/categorias/${id}/`)
    setCategorias(c => c.filter(x => x.id !== id))
  }

  return (
    <ChartCard title="Categorias de Custo">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted">{categorias.length} cadastrada{categorias.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setShowForm(s => !s)}
          className="text-[10px] px-2 py-1 rounded bg-primary/10 border border-primary/20 text-primary font-semibold">
          + Nova
        </button>
      </div>

      {showForm && (
        <div className="bg-bg3 border border-white/[0.06] rounded-lg p-3 mb-3 space-y-2">
          <CategoriaCamposForm
            nome={novoNome} setNome={setNovoNome}
            modo={novoModo} setModo={setNovoModo}
            custo={novoCusto} setCusto={setNovoCusto}
            classe={novaClasse} setClasse={setNovaClasse}
          />
          <button onClick={criar} disabled={criando}
            className="w-full py-1.5 rounded bg-primary text-bg text-xs font-semibold disabled:opacity-50">
            {criando ? '...' : 'Criar'}
          </button>
        </div>
      )}

      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {categorias.map(c => editId === c.id ? (
          <div key={c.id} className="bg-bg3 border border-primary/30 rounded-lg p-3 space-y-2">
            <CategoriaCamposForm
              nome={editNome} setNome={setEditNome}
              modo={editModo} setModo={setEditModo}
              custo={editCusto} setCusto={setEditCusto}
              classe={editClasse} setClasse={setEditClasse}
            />
            <div className="flex gap-2">
              <button onClick={() => setEditId(null)} className="flex-1 py-1.5 rounded border border-white/[0.08] text-muted text-xs hover:text-dim">cancelar</button>
              <button onClick={() => salvarEdicao(c.id)} disabled={salvandoEdit}
                className="flex-1 py-1.5 rounded bg-primary text-bg text-xs font-semibold disabled:opacity-50">
                {salvandoEdit ? '...' : 'Salvar'}
              </button>
            </div>
          </div>
        ) : (
          <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-bg3/50 text-xs">
            <span className={`flex-1 truncate ${!c.ativo ? 'text-muted/40 line-through' : 'text-dim'}`}>
              {c.nome} — {MODO_CUSTO_LABEL[c.modo_custo]}
              {c.modo_custo === 'manual' ? ` (R$${(+c.custo_kg_medio).toFixed(2)}/kg)` : c.estoque_classe ? ` (${c.estoque_classe})` : ''}
            </span>
            <button onClick={() => iniciarEdicao(c)} className="text-muted hover:text-primary flex-shrink-0">editar</button>
            <button onClick={() => toggleAtivo(c)} className="text-muted hover:text-primary flex-shrink-0">{c.ativo ? 'desativar' : 'ativar'}</button>
            <button onClick={() => remover(c.id)} className="text-muted hover:text-rose-400 flex-shrink-0">remover</button>
          </div>
        ))}
        {categorias.length === 0 && <p className="text-[10px] text-muted/50 text-center py-3">Nenhuma categoria cadastrada</p>}
      </div>
      {erro && <p className="text-[10px] text-rose-400 mt-1">{erro}</p>}
    </ChartCard>
  )
}

function CadastroContagemRefeicoes({ unidades }) {
  const [unidadeId, setUnidadeId] = useState('')
  const [refeicoes, setRefeicoes] = useState([])
  const [refeicaoId, setRefeicaoId] = useState('')
  const [data, setData]           = useState(isoDate(new Date()))
  const [nClientes, setNClientes] = useState('')
  const [salvando, setSalvando]   = useState(false)
  const [erro, setErro]           = useState('')
  const [msg, setMsg]             = useState('')
  const [registros, setRegistros] = useState([])

  useEffect(() => {
    if (unidades.length && !unidadeId) setUnidadeId(String(unidades[0].id))
  }, [unidades, unidadeId])

  useEffect(() => {
    api.get('/desperdicio/refeicoes/').then(({ data }) => setRefeicoes(data)).catch(() => {})
  }, [])

  const carregarRegistros = useCallback(() => {
    if (!unidadeId) { setRegistros([]); return }
    api.get('/desperdicio/contagem-clientes/', { params: { unidade_id: unidadeId } })
      .then(({ data }) => setRegistros(data)).catch(() => {})
  }, [unidadeId])

  useEffect(() => { carregarRegistros() }, [carregarRegistros])

  async function salvar() {
    if (!unidadeId || !data || !nClientes) { setErro('Preencha unidade, data e quantidade.'); return }
    setSalvando(true); setErro('')
    try {
      await api.post('/desperdicio/contagem-clientes/', {
        unidade_id: unidadeId, data, refeicao_id: refeicaoId || undefined, n_clientes: nClientes,
      })
      setMsg('Salvo!')
      setNClientes('')
      carregarRegistros()
      setTimeout(() => setMsg(''), 3000)
    } catch { setErro('Erro ao salvar.') }
    finally { setSalvando(false) }
  }

  return (
    <ChartCard title="Contagem de Refeições Servidas">
      <p className="text-[10px] text-muted mb-2">Alimenta o KPI "Resíduo por Cliente" do dashboard.</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)}
          className="bg-bg3 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30">
          {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          {unidades.length === 0 && <option value="">Cadastre uma Unidade</option>}
        </select>
        <select value={refeicaoId} onChange={e => setRefeicaoId(e.target.value)}
          className="bg-bg3 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30">
          <option value="">Total do dia (todas refeições)</option>
          {refeicoes.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
        <input type="date" value={data} onChange={e => setData(e.target.value)}
          className="bg-bg3 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30"/>
        <input type="number" min="0" value={nClientes} onChange={e => setNClientes(e.target.value)} placeholder="Qtd. servida"
          className="bg-bg3 border border-white/[0.08] rounded px-2 py-1.5 text-xs text-dim outline-none focus:border-primary/30"/>
      </div>
      <button onClick={salvar} disabled={salvando}
        className="w-full py-1.5 rounded bg-primary text-bg text-xs font-semibold disabled:opacity-50 mb-2">
        {salvando ? '...' : 'Salvar'}
      </button>
      {msg && <p className="text-[10px] text-primary mb-2">{msg}</p>}
      {erro && <p className="text-[10px] text-rose-400 mb-2">{erro}</p>}
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {registros.map(r => (
          <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-bg3/50 text-xs">
            <span className="text-dim flex-shrink-0">{fmtDiaBR(r.data)}</span>
            <span className="text-muted flex-1 truncate">{r.refeicao_nome || 'Total do dia'}</span>
            <span className="text-dim font-bold flex-shrink-0">{fmtN(r.n_clientes)}</span>
          </div>
        ))}
        {registros.length === 0 && <p className="text-[10px] text-muted/50 text-center py-3">Nenhuma contagem cadastrada</p>}
      </div>
    </ChartCard>
  )
}

function PainelCadastros({ unidades, onUnidadesChange }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <CadastroSimples titulo="Unidades" endpoint="/desperdicio/unidades/" placeholder="Nova unidade..." onChange={onUnidadesChange}/>
      <CadastroSetores unidades={unidades}/>
      <CadastroSimples titulo="Tipos de Perda" endpoint="/desperdicio/tipos-perda/" placeholder="Novo tipo de perda..."/>
      <CadastroSimples titulo="Refeições" endpoint="/desperdicio/refeicoes/" placeholder="Nova refeição..."/>
      <CadastroCategorias/>
      <CadastroContagemRefeicoes unidades={unidades}/>
    </div>
  )
}

export default function FoodIntelligence() {
  const { tema } = useTheme()
  const { empresaAtiva } = useEmpresa()
  const C = useMemo(() => ({
    grid: tema === 'light' ? '#e2e8f0' : '#1e2535',
    tick: tema === 'light' ? '#475569' : '#7a8fa8',
    dim:  tema === 'light' ? '#334155' : '#c8d6e8',
  }), [tema])

  const hoje = isoDate(new Date())
  const [aba, setAba]               = useState('dashboard')
  const [unidades, setUnidades]     = useState([])
  const [unidadeId, setUnidadeId]   = useState('')
  const [refeicaoFiltro, setRefeicaoFiltro] = useState('')
  const [dataIni, setDataIni]       = useState(hoje)
  const [dataFim, setDataFim]       = useState(hoje)
  const [dash, setDash]             = useState(null)
  const [registros, setRegistros]   = useState([])
  const [loading, setLoading]       = useState(false)
  const [expand, setExpand]         = useState(null)
  const [lbls, setLbls]             = useState({ evolucao: false, hospede: false, ranking: false, comparativo: false })
  const togLbl = k => setLbls(p => ({ ...p, [k]: !p[k] }))
  const [categoriasOpts, setCategoriasOpts] = useState([])
  const [tiposPerdaOpts, setTiposPerdaOpts] = useState([])
  const [refeicoesOpts, setRefeicoesOpts]   = useState([])
  const [editRegistro, setEditRegistro]     = useState(null)
  const [diaExpandido, setDiaExpandido]     = useState(null)

  const carregarUnidades = useCallback(() => {
    api.get('/desperdicio/unidades/').then(({ data }) => setUnidades(data)).catch(() => {})
  }, [])

  useEffect(() => { carregarUnidades() }, [carregarUnidades, empresaAtiva?.id])

  useEffect(() => {
    api.get('/desperdicio/categorias/').then(({ data }) => setCategoriasOpts(data)).catch(() => {})
    api.get('/desperdicio/tipos-perda/').then(({ data }) => setTiposPerdaOpts(data)).catch(() => {})
    api.get('/desperdicio/refeicoes/').then(({ data }) => setRefeicoesOpts(data)).catch(() => {})
  }, [empresaAtiva?.id])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const params = { data_ini: dataIni, data_fim: dataFim }
      if (unidadeId) params.unidade_id = unidadeId
      if (refeicaoFiltro) params.refeicao_id = refeicaoFiltro
      const [dashRes, regRes] = await Promise.all([
        api.get('/desperdicio/dashboard/', { params }),
        api.get('/desperdicio/registros/', { params }),
      ])
      setDash(dashRes.data)
      setRegistros(regRes.data)
    } catch {
      setDash(null)
    } finally {
      setLoading(false)
    }
  }, [dataIni, dataFim, unidadeId, refeicaoFiltro])

  useEffect(() => { carregar() }, [carregar, empresaAtiva?.id])

  async function excluirRegistro(id) {
    if (!confirm('Excluir este lançamento?')) return
    await api.delete(`/desperdicio/registros/${id}/`)
    carregar()
  }

  const porCategoria = dash?.por_categoria || []
  const porRefeicao  = dash?.por_refeicao || []
  const ranking      = dash?.ranking_alimentos || []
  const comparativo  = dash?.comparativo_unidades || []
  const porDia       = dash?.por_dia || []
  const diasSemLancamento = dash?.dias_sem_lancamento || []

  const unidadeNome = unidadeId
    ? (unidades.find(u => String(u.id) === String(unidadeId))?.nome || '')
    : 'Todas as Unidades'
  const refeicaoNome = refeicaoFiltro
    ? (refeicoesOpts.find(r => String(r.id) === String(refeicaoFiltro))?.nome || '')
    : 'Todas as Refeições'

  function exportarExcel() {
    const wb = XLSX.utils.book_new()

    const wsResumo = XLSX.utils.aoa_to_sheet([
      ['Food Intelligence — Resumo'],
      [`Período: ${fmtDiaBR(dataIni)} a ${fmtDiaBR(dataFim)}`],
      [`Unidade: ${unidadeNome}`],
      [`Refeição: ${refeicaoNome}`],
      [],
      ['Indicador', 'Valor'],
      ['Total Desperdiçado (kg)', dash?.total_kg ?? 0],
      ['Lançamentos', dash?.lancamentos ?? 0],
      ['Valor da Perda (R$)', dash?.valor_total_perda ?? 0],
      ['Perdas Críticas', dash?.perdas_criticas ?? 0],
      ['Cobertura da IA (%)', dash?.cobertura_ia_pct ?? 0],
      ['Refeição que Mais Perde', dash?.refeicao_concentra?.refeicao || '—'],
    ])
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Data', 'Lançamentos', 'Total (kg)', 'Valor da Perda', 'Hóspedes', 'g/Hóspede', 'Maior Lançamento'],
      ...porDia.map(r => [
        fmtDiaBR(r.data), r.lancamentos, r.kg, r.valor, r.n_clientes || '', r.residuo_por_hospede_g ?? '',
        r.maior_lancamento ? `${r.maior_lancamento.alimento} (${r.maior_lancamento.kg}kg)` : '',
      ]),
    ]), 'Por Dia')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Categoria', 'kg'],
      ...porCategoria.map(c => [c.categoria, c.kg]),
    ]), 'Por Categoria')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Refeição', 'kg', 'Valor'],
      ...porRefeicao.map(r => [r.refeicao, r.kg, r.valor]),
    ]), 'Por Refeição')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Alimento', 'kg', 'Valor'],
      ...ranking.map(r => [r.alimento, r.kg, r.valor]),
    ]), 'Ranking Alimentos')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Data', 'Unidade', 'Setor', 'Alimento', 'Categoria', 'Tipo', 'Peso (kg)', 'Valor'],
      ...registros.map(r => [
        new Date(r.created_at).toLocaleString('pt-BR'), r.unidade_nome, r.setor_nome || '',
        r.alimento_ia || '', r.categoria_nome || '', r.tipo_perda_nome || '', +r.peso_kg, +r.valor_perda,
      ]),
    ]), 'Lançamentos')

    XLSX.writeFile(wb, `food_intelligence_${dataIni}_${dataFim}.xlsx`)
  }

  function exportarPdf() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFontSize(13); doc.setFont('helvetica', 'bold')
    doc.text('FOOD INTELLIGENCE — RELATÓRIO DE DESPERDÍCIO', 14, 14)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    doc.text(`Período: ${fmtDiaBR(dataIni)} a ${fmtDiaBR(dataFim)} · ${unidadeNome} · ${refeicaoNome} · Gerado: ${new Date().toLocaleString('pt-BR')}`, 14, 20)

    let y = 26
    autoTable(doc, {
      startY: y, margin: { left: 14, right: 14 }, tableWidth: 130,
      head: [['Indicador', 'Valor']],
      body: [
        ['Total Desperdiçado', fmtKg(dash?.total_kg)],
        ['Lançamentos', fmtN(dash?.lancamentos)],
        ['Valor da Perda', fmtR(dash?.valor_total_perda)],
        ['Perdas Críticas', fmtN(dash?.perdas_criticas)],
        ['Cobertura da IA', `${dash?.cobertura_ia_pct ?? 0}%`],
        ['Refeição que Mais Perde', dash?.refeicao_concentra?.refeicao || '—'],
      ],
      styles: { fontSize: 8 }, headStyles: { fillColor: [30, 30, 40], textColor: 255 },
    })
    y = doc.lastAutoTable.finalY + 8

    if (porRefeicao.length) {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('DESPERDÍCIO POR REFEIÇÃO', 14, y); y += 4
      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 }, tableWidth: 120,
        head: [['Refeição', 'kg', 'Valor']],
        body: porRefeicao.map(r => [r.refeicao, fmtKg(r.kg), fmtR(r.valor)]),
        styles: { fontSize: 7 }, headStyles: { fillColor: [30, 30, 40], textColor: 255 },
      })
      y = doc.lastAutoTable.finalY + 8
    }

    if (porCategoria.length) {
      if (y > 170) { doc.addPage(); y = 14 }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('DESPERDÍCIO POR CATEGORIA', 14, y); y += 4
      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 }, tableWidth: 120,
        head: [['Categoria', 'kg']],
        body: porCategoria.map(c => [c.categoria, fmtKg(c.kg)]),
        styles: { fontSize: 7 }, headStyles: { fillColor: [30, 30, 40], textColor: 255 },
      })
      y = doc.lastAutoTable.finalY + 8
    }

    if (ranking.length) {
      if (y > 170) { doc.addPage(); y = 14 }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('RANKING DE ALIMENTOS', 14, y); y += 4
      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [['Alimento', 'kg', 'Valor']],
        body: ranking.map(r => [r.alimento, fmtKg(r.kg), fmtR(r.valor)]),
        styles: { fontSize: 7 }, headStyles: { fillColor: [30, 30, 40], textColor: 255 },
      })
      y = doc.lastAutoTable.finalY + 8
    }

    if (comparativo.length) {
      if (y > 170) { doc.addPage(); y = 14 }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('COMPARATIVO ENTRE UNIDADES', 14, y); y += 4
      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [['Unidade', 'kg', 'Valor']],
        body: comparativo.map(c => [c.unidade, fmtKg(c.kg), fmtR(c.valor)]),
        styles: { fontSize: 7 }, headStyles: { fillColor: [30, 30, 40], textColor: 255 },
      })
      y = doc.lastAutoTable.finalY + 8
    }

    if (porDia.length) {
      if (y > 170) { doc.addPage(); y = 14 }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('LANÇAMENTOS POR DIA', 14, y); y += 4
      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [['Data', 'Lançamentos', 'Total (kg)', 'Valor da Perda', 'g/Hóspede', 'Maior Lançamento']],
        body: porDia.map(r => [
          fmtDiaBR(r.data), r.lancamentos, fmtKg(r.kg), fmtR(r.valor),
          r.residuo_por_hospede_g != null ? `${r.residuo_por_hospede_g} g` : '—',
          r.maior_lancamento ? `${r.maior_lancamento.alimento} (${fmtKg(r.maior_lancamento.kg)})` : '—',
        ]),
        styles: { fontSize: 7 }, headStyles: { fillColor: [30, 30, 40], textColor: 255 },
      })
    }

    doc.save(`food_intelligence_${dataIni}_${dataFim}.pdf`)
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Abas ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 flex border-b border-white/[0.06] bg-bg2 px-4">
        {[
          { id: 'dashboard',    label: 'Dashboard' },
          { id: 'cadastros',    label: 'Cadastros' },
          { id: 'dispositivos', label: 'Dispositivos' },
        ].map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-[11px] font-semibold border-b-2 transition-all ${
              aba === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-dim hover:border-white/[0.15]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Aba: Cadastros ──────────────────────────────────────────── */}
      {aba === 'cadastros' && (
        <div className="flex-1 overflow-auto p-4">
          <PainelCadastros unidades={unidades} onUnidadesChange={carregarUnidades}/>
        </div>
      )}

      {/* ── Aba: Dispositivos ───────────────────────────────────────── */}
      {aba === 'dispositivos' && (
        <div className="flex-1 overflow-auto p-4">
          <PainelDispositivos unidades={unidades}/>
        </div>
      )}

      {/* ── Aba: Dashboard ──────────────────────────────────────────── */}
      {aba === 'dashboard' && <>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-end gap-3 px-4 py-3 bg-bg2 border-b border-white/[0.06] flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] font-bold text-muted uppercase tracking-wider">Unidade</span>
          <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)}
            className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 min-w-[140px]">
            <option value="">Todas</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] font-bold text-muted uppercase tracking-wider">Refeição</span>
          <select value={refeicaoFiltro} onChange={e => setRefeicaoFiltro(e.target.value)}
            className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 min-w-[120px]">
            <option value="">Todas</option>
            {refeicoesOpts.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] font-bold text-muted uppercase tracking-wider">Data Inicial</span>
          <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
            className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 w-[130px]"/>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] font-bold text-muted uppercase tracking-wider">Data Final</span>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
            className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 w-[130px]"/>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportarExcel}
            className="px-2.5 py-1.5 rounded-md border border-white/[0.08] text-muted text-[11px] font-semibold hover:text-dim hover:border-white/[0.15] transition whitespace-nowrap">
            📊 Excel
          </button>
          <button onClick={exportarPdf}
            className="px-2.5 py-1.5 rounded-md border border-white/[0.08] text-muted text-[11px] font-semibold hover:text-dim hover:border-white/[0.15] transition whitespace-nowrap">
            📄 PDF
          </button>
          <a href="/desperdicio/registrar" target="_blank" rel="noopener noreferrer"
            className="px-2.5 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold hover:bg-primary/20 transition whitespace-nowrap">
            📷 Abrir Tela de Lançamento
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-4">

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <KpiCard label="Total Desperdiçado" value={fmtKg(dash?.total_kg)} sub={`${fmtN(dash?.lancamentos)} lançamentos`} color="text-primary"/>
          <KpiCard label="Valor da Perda" value={fmtK(dash?.valor_total_perda)} sub="no período" color="text-rose-400"/>
          <KpiCard label="Perdas Críticas" value={fmtN(dash?.perdas_criticas)} sub="acima de 2x a média" color="text-amber-400"/>
          <KpiCard label="Resíduo / Cliente" value={dash?.residuo_por_cliente_g != null ? `${dash.residuo_por_cliente_g} g` : '—'} sub={`${fmtN(dash?.n_clientes)} clientes`} color="text-teal-400"/>
          <KpiCard label="Cobertura da IA" value={`${dash?.cobertura_ia_pct ?? 0}%`} sub="lançamentos via foto" color="text-violet-400"/>
          <KpiCard label="Refeição que Mais Perde" value={dash?.refeicao_concentra?.refeicao || '—'} sub={dash?.refeicao_concentra ? `${dash.refeicao_concentra.pct}% do total` : ''} color="text-blue-400"/>
        </div>

        {loading && <div className="text-center text-xs text-muted py-6">Carregando...</div>}

        {!loading && (
          <ChartCard title="Evolução Diária — Desperdício (kg) e Valor da Perda"
            onExpand={() => setExpand('evolucao')} lblOn={lbls.evolucao} onLbl={() => togLbl('evolucao')}>
            {porDia.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-xs text-muted/50">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={porDia.map(r => ({ ...r, dia: fmtDiaCurto(r.data) }))} margin={{ top: lbls.evolucao ? 24 : 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false}/>
                  <YAxis yAxisId="kg" tickFormatter={fmtKg} tick={{ fontSize: 9, fill: C.tick }} axisLine={false} tickLine={false} width={64}/>
                  <YAxis yAxisId="valor" orientation="right" tickFormatter={fmtK} tick={{ fontSize: 9, fill: '#f43f5e' }} axisLine={false} tickLine={false} width={56}/>
                  <Tooltip content={<EvolucaoTooltip/>}/>
                  <Bar yAxisId="kg" dataKey="kg" name="Desperdício (kg)" fill="#6366f1" radius={[3,3,0,0]} maxBarSize={48}>
                    {lbls.evolucao && <LabelList dataKey="kg" position="top" formatter={fmtKg} style={{ fill: C.tick, fontSize: 9, fontWeight: 700 }}/>}
                  </Bar>
                  <Line yAxisId="valor" dataKey="valor" name="Valor da Perda" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3, fill: '#f43f5e' }} type="monotone"/>
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        )}

        {!loading && porDia.some(r => r.residuo_por_hospede_g != null) && (
          <ChartCard title="Resíduo por Hóspede ao Longo do Tempo (g)"
            onExpand={() => setExpand('hospede')} lblOn={lbls.hospede} onLbl={() => togLbl('hospede')}>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={porDia.map(r => ({ dia: fmtDiaCurto(r.data), g: r.residuo_por_hospede_g }))} margin={{ top: lbls.hospede ? 22 : 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v => `${v}g`} tick={{ fontSize: 9, fill: C.tick }} axisLine={false} tickLine={false} width={48}/>
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="bg-bg3 border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl text-xs">
                      <p className="text-muted mb-1">{label}</p>
                      <p className="text-teal-400 font-semibold">Resíduo/Hóspede: {payload[0].value} g</p>
                    </div>
                  )
                }}/>
                <Line dataKey="g" name="g/Hóspede" stroke="#2dd4a0" strokeWidth={2.5} dot={{ r: 4, fill: '#2dd4a0' }} type="monotone" connectNulls>
                  {lbls.hospede && <LabelList dataKey="g" position="top" formatter={v => `${v}g`} style={{ fill: C.tick, fontSize: 9, fontWeight: 700 }}/>}
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {!loading && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            <ChartCard title="Desperdício por Categoria" onExpand={() => setExpand('categoria')}>
              {porCategoria.length === 0 ? (
                <div className="flex items-center justify-center h-[180px] text-xs text-muted/50">Sem dados no período</div>
              ) : (
                <div className="flex items-center justify-center gap-8">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={porCategoria} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3} dataKey="kg" nameKey="categoria">
                        {porCategoria.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                      </Pie>
                      <Tooltip content={<CTooltip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2 min-w-0">
                    {porCategoria.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAT[i % CAT.length] }}/>
                        <span className="text-[11px] text-muted truncate flex-1">{trunc(c.categoria, 24)}</span>
                        <span className="text-[11px] font-bold text-dim ml-2">{fmtKg(c.kg)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Desperdício por Refeição" onExpand={() => setExpand('refeicao')}>
              {porRefeicao.length === 0 ? (
                <div className="flex items-center justify-center h-[180px] text-xs text-muted/50">Sem dados no período</div>
              ) : (
                <div className="flex items-center justify-center gap-8">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={porRefeicao} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3} dataKey="kg" nameKey="refeicao">
                        {porRefeicao.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                      </Pie>
                      <Tooltip content={<CTooltip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2 min-w-0">
                    {porRefeicao.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAT[i % CAT.length] }}/>
                        <span className="text-[11px] text-muted truncate flex-1">{trunc(r.refeicao, 24)}</span>
                        <span className="text-[11px] font-bold text-dim ml-2">{fmtKg(r.kg)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Ranking de Alimentos (kg)"
              onExpand={() => setExpand('ranking')} lblOn={lbls.ranking} onLbl={() => togLbl('ranking')}>
              {ranking.length === 0 ? (
                <div className="flex items-center justify-center h-[180px] text-xs text-muted/50">Sem dados no período</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, ranking.length * 28)}>
                  <BarChart data={ranking} layout="vertical" barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
                    <XAxis type="number" tick={{ fontSize: 9, fill: C.tick }} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="alimento" width={150} axisLine={false} tickLine={false} interval={0}
                      tick={({ x, y, payload }) => (
                        <text x={x} y={y} textAnchor="end" fill={C.dim} fontSize={9} dominantBaseline="central">
                          {trunc(payload.value, 26)}
                        </text>
                      )}/>
                    <Tooltip content={<CTooltip/>}/>
                    <Bar dataKey="kg" name="kg" radius={[0,4,4,0]}>
                      {ranking.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                      {lbls.ranking && <LabelList dataKey="kg" position="right" formatter={fmtKg} style={{ fill: C.tick, fontSize: 9, fontWeight: 700 }}/>}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {comparativo.length > 0 && (
              <ChartCard title="Comparativo entre Unidades"
                onExpand={() => setExpand('comparativo')} lblOn={lbls.comparativo} onLbl={() => togLbl('comparativo')}>
                <ResponsiveContainer width="100%" height={Math.max(180, comparativo.length * 32)}>
                  <BarChart data={comparativo} layout="vertical" barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
                    <XAxis type="number" tick={{ fontSize: 9, fill: C.tick }} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="unidade" width={130} axisLine={false} tickLine={false} interval={0}
                      tick={{ fontSize: 10, fill: C.dim }}/>
                    <Tooltip content={<CTooltip/>}/>
                    <Bar dataKey="kg" name="kg" radius={[0,4,4,0]}>
                      {comparativo.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                      {lbls.comparativo && <LabelList dataKey="kg" position="right" formatter={fmtKg} style={{ fill: C.tick, fontSize: 9, fontWeight: 700 }}/>}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            <ChartCard title="Lançamentos Recentes">
              <div className="overflow-auto max-h-72">
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead className="sticky top-0 bg-bg3 z-10">
                    <tr className="text-muted uppercase tracking-wide text-[9px] border-b border-white/[0.06]">
                      {['Data','Refeição','Alimento','Categoria','Tipo','Peso','Valor',''].map(h => (
                        <th key={h} className="px-1.5 py-1.5 font-bold text-left whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {registros.slice(0, 100).map(r => (
                      <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.025]">
                        <td className="px-1.5 py-1 text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>
                        <td className="px-1.5 py-1 text-muted whitespace-nowrap">{r.refeicao_nome || '—'}</td>
                        <td className="px-1.5 py-1 text-dim whitespace-nowrap" title={r.alimento_ia}>{trunc(r.alimento_ia, 20) || '—'}</td>
                        <td className="px-1.5 py-1 text-muted whitespace-nowrap" title={r.categoria_nome}>{trunc(r.categoria_nome, 14) || '—'}</td>
                        <td className="px-1.5 py-1 text-muted whitespace-nowrap">{r.tipo_perda_nome || '—'}</td>
                        <td className="px-1.5 py-1 text-right tabular-nums text-dim whitespace-nowrap">{fmtKg(r.peso_kg)}</td>
                        <td className="px-1.5 py-1 text-right tabular-nums text-dim font-bold whitespace-nowrap">{fmtR(r.valor_perda)}</td>
                        <td className="px-1.5 py-1 text-right whitespace-nowrap">
                          <button onClick={() => setEditRegistro(r)} title="Editar" className="text-muted hover:text-primary px-1">✎</button>
                          <button onClick={() => excluirRegistro(r.id)} title="Excluir" className="text-muted hover:text-rose-400 px-1">🗑</button>
                        </td>
                      </tr>
                    ))}
                    {registros.length === 0 && (
                      <tr><td colSpan={8} className="py-6 text-center text-muted/50">Nenhum lançamento no período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ChartCard>

            <ChartCard title="Lançamentos por Dia">
              {diasSemLancamento.length > 0 && (
                <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400">
                  ⚠️ {diasSemLancamento.length} dia{diasSemLancamento.length !== 1 ? 's' : ''} sem lançamento no período: {diasSemLancamento.map(fmtDiaBR).join(', ')}
                </div>
              )}
              <p className="text-[9px] text-muted/50 mb-1.5">Clique numa linha pra ver o detalhe por refeição</p>
              <div className="overflow-auto max-h-72">
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead className="sticky top-0 bg-bg3 z-10">
                    <tr className="text-muted uppercase tracking-wide text-[9px] border-b border-white/[0.06]">
                      {['Data','Lanç.','Kg','Valor','Hóspedes','g/Hóspede','Maior Lançamento'].map((h, i) => (
                        <th key={h} className={`px-1.5 py-1.5 font-bold whitespace-nowrap ${i===0?'text-left':'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...porDia].reverse().map(r => (
                      <>
                        <tr key={r.data} onClick={() => setDiaExpandido(d => d === r.data ? null : r.data)}
                          className="border-b border-white/[0.03] hover:bg-white/[0.025] cursor-pointer">
                          <td className="px-1.5 py-1 text-dim whitespace-nowrap">{diaExpandido === r.data ? '▾' : '▸'} {fmtDiaBR2(r.data)}</td>
                          <td className="px-1.5 py-1 text-right tabular-nums text-muted">{fmtN(r.lancamentos)}</td>
                          <td className="px-1.5 py-1 text-right tabular-nums text-dim">{fmtKg(r.kg)}</td>
                          <td className="px-1.5 py-1 text-right tabular-nums text-dim font-bold">{fmtR(r.valor)}</td>
                          <td className="px-1.5 py-1 text-right tabular-nums text-muted">{r.n_clientes || '—'}</td>
                          <td className="px-1.5 py-1 text-right tabular-nums text-teal-400">{r.residuo_por_hospede_g != null ? `${r.residuo_por_hospede_g} g` : '—'}</td>
                          <td className="px-1.5 py-1 text-right text-muted whitespace-nowrap" title={r.maior_lancamento?.alimento}>
                            {r.maior_lancamento ? `${trunc(r.maior_lancamento.alimento, 16)} (${fmtKg(r.maior_lancamento.kg)})` : '—'}
                          </td>
                        </tr>
                        {diaExpandido === r.data && (
                          <tr>
                            <td colSpan={7} className="px-3 py-2 bg-bg3/40">
                              {r.por_refeicao.length === 0 ? (
                                <span className="text-[10px] text-muted/50">Sem detalhe por refeição nesse dia.</span>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {r.por_refeicao.map((rf, i) => (
                                    <div key={i} className="px-2.5 py-1.5 rounded-lg bg-bg2 border border-white/[0.06] text-[10px]">
                                      <span className="text-primary font-semibold">{rf.refeicao}</span>
                                      <span className="text-muted ml-1.5">{fmtN(rf.lancamentos)} lanç. · {fmtKg(rf.kg)} · {fmtR(rf.valor)}</span>
                                      {rf.n_clientes > 0 && <span className="text-teal-400 ml-1.5">· 👥 {fmtN(rf.n_clientes)}</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                    {porDia.length === 0 && (
                      <tr><td colSpan={7} className="py-6 text-center text-muted/50">Nenhum lançamento no período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ChartCard>

          </div>
        )}
      </div>

      {editRegistro && (
        <RegistroEditModal
          registro={editRegistro}
          categorias={categoriasOpts}
          tiposPerda={tiposPerdaOpts}
          refeicoes={refeicoesOpts}
          onClose={() => setEditRegistro(null)}
          onSaved={(atualizado) => {
            setRegistros(rs => rs.map(r => r.id === atualizado.id ? atualizado : r))
            setEditRegistro(null)
            carregar()
          }}
        />
      )}

      {expand === 'evolucao' && (
        <ExpandModal title="Evolução Diária — Desperdício (kg) e Valor da Perda" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={440}>
            <ComposedChart data={porDia.map(r => ({ ...r, dia: fmtDiaCurto(r.data) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
              <XAxis dataKey="dia" tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="kg" tickFormatter={fmtKg} tick={{ fontSize: 11, fill: C.tick }} axisLine={false} tickLine={false} width={70}/>
              <YAxis yAxisId="valor" orientation="right" tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#f43f5e' }} axisLine={false} tickLine={false} width={70}/>
              <Tooltip content={<EvolucaoTooltip/>}/>
              <Bar yAxisId="kg" dataKey="kg" name="Desperdício (kg)" fill="#6366f1" radius={[4,4,0,0]}>
                <LabelList dataKey="kg" position="top" formatter={fmtKg} style={{ fill: C.tick, fontSize: 11, fontWeight: 700 }}/>
              </Bar>
              <Line yAxisId="valor" dataKey="valor" name="Valor da Perda" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4, fill: '#f43f5e' }} type="monotone"/>
            </ComposedChart>
          </ResponsiveContainer>
        </ExpandModal>
      )}

      {expand === 'hospede' && (
        <ExpandModal title="Resíduo por Hóspede ao Longo do Tempo (g)" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={440}>
            <ComposedChart data={porDia.map(r => ({ dia: fmtDiaCurto(r.data), g: r.residuo_por_hospede_g }))}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
              <XAxis dataKey="dia" tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v => `${v}g`} tick={{ fontSize: 11, fill: C.tick }} axisLine={false} tickLine={false} width={60}/>
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-bg3 border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl text-xs">
                    <p className="text-muted mb-1">{label}</p>
                    <p className="text-teal-400 font-semibold">Resíduo/Hóspede: {payload[0].value} g</p>
                  </div>
                )
              }}/>
              <Line dataKey="g" name="g/Hóspede" stroke="#2dd4a0" strokeWidth={2.5} dot={{ r: 4, fill: '#2dd4a0' }} type="monotone" connectNulls>
                <LabelList dataKey="g" position="top" formatter={v => `${v}g`} style={{ fill: C.tick, fontSize: 11, fontWeight: 700 }}/>
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </ExpandModal>
      )}

      {expand === 'categoria' && (
        <ExpandModal title="Desperdício por Categoria" onClose={() => setExpand(null)}>
          <div className="flex items-center justify-center gap-12 flex-1">
            <ResponsiveContainer width={300} height={300}>
              <PieChart>
                <Pie data={porCategoria} cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={3} dataKey="kg" nameKey="categoria"
                  label={({ categoria, percent }) => `${trunc(categoria,15)}: ${(percent*100).toFixed(1)}%`} labelLine>
                  {porCategoria.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                </Pie>
                <Tooltip content={<CTooltip/>}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-3">
              {porCategoria.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: CAT[i % CAT.length] }}/>
                  <span className="text-sm text-muted">{c.categoria}</span>
                  <span className="text-sm font-bold text-dim tabular-nums ml-2">{fmtKg(c.kg)}</span>
                </div>
              ))}
            </div>
          </div>
        </ExpandModal>
      )}

      {expand === 'refeicao' && (
        <ExpandModal title="Desperdício por Refeição" onClose={() => setExpand(null)}>
          <div className="flex items-center justify-center gap-12 flex-1">
            <ResponsiveContainer width={300} height={300}>
              <PieChart>
                <Pie data={porRefeicao} cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={3} dataKey="kg" nameKey="refeicao"
                  label={({ refeicao, percent }) => `${trunc(refeicao,15)}: ${(percent*100).toFixed(1)}%`} labelLine>
                  {porRefeicao.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                </Pie>
                <Tooltip content={<CTooltip/>}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-3">
              {porRefeicao.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: CAT[i % CAT.length] }}/>
                  <span className="text-sm text-muted">{r.refeicao}</span>
                  <span className="text-sm font-bold text-dim tabular-nums ml-2">{fmtKg(r.kg)}</span>
                </div>
              ))}
            </div>
          </div>
        </ExpandModal>
      )}

      {expand === 'ranking' && (
        <ExpandModal title="Ranking de Alimentos (kg)" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={Math.max(400, ranking.length * 44)}>
            <BarChart data={ranking} layout="vertical" barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
              <XAxis type="number" tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="alimento" tick={{ fontSize: 12, fill: C.dim }} width={160}
                tickFormatter={v => trunc(v, 24)} axisLine={false} tickLine={false} interval={0}/>
              <Tooltip content={<CTooltip/>}/>
              <Bar dataKey="kg" name="kg" radius={[0,4,4,0]}>
                {ranking.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                <LabelList dataKey="kg" position="right" formatter={fmtKg} style={{ fill: C.tick, fontSize: 11, fontWeight: 700 }}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ExpandModal>
      )}

      {expand === 'comparativo' && (
        <ExpandModal title="Comparativo entre Unidades" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={Math.max(400, comparativo.length * 60)}>
            <BarChart data={comparativo} layout="vertical" barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
              <XAxis type="number" tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="unidade" tick={{ fontSize: 12, fill: C.dim }} width={150} axisLine={false} tickLine={false} interval={0}/>
              <Tooltip content={<CTooltip/>}/>
              <Bar dataKey="kg" name="kg" radius={[0,4,4,0]}>
                {comparativo.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                <LabelList dataKey="kg" position="right" formatter={fmtKg} style={{ fill: C.tick, fontSize: 11, fontWeight: 700 }}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ExpandModal>
      )}

      </>}
    </div>
  )
}
