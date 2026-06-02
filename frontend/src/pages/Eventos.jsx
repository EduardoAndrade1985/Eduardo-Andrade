import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts'
import api from '../services/api'
import { useTheme } from '../contexts/ThemeContext'

// ─── helpers ──────────────────────────────────────────────────────────────────
const num = v => (+(v) || 0).toLocaleString('pt-BR')
const cur = v => (+(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
function curK(v) {
  const n = +(v) || 0
  if (Math.abs(n) >= 1_000_000) return `R$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (Math.abs(n) >= 1_000)     return `R$${(n / 1_000).toFixed(0)}k`
  return cur(n)
}
function localISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function lastDayISO(ano, mes) {
  return localISO(new Date(ano, mes, 0))
}
function normDateXlsx(v) {
  if (!v) return ''
  if (v instanceof Date) return localISO(v)
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) { const [d, m, y] = s.split('/'); return `${y}-${m}-${d}` }
  const n = Number(s)
  if (!isNaN(n) && n > 40000 && n < 60000) return localISO(new Date((n - 25569) * 86400000))
  return s.slice(0, 10)
}
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// ─── status ───────────────────────────────────────────────────────────────────
const STATUS = {
  A: { label: 'Atendido',   cls: 'text-blue-400',  bg: 'bg-blue-400/10',  border: 'border-blue-400/20',  hex: '#60a5fa' },
  C: { label: 'Confirmado', cls: 'text-teal-400',  bg: 'bg-teal-400/10',  border: 'border-teal-400/20',  hex: '#2dd4a0' },
  O: { label: 'Contrato',   cls: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20', hex: '#f59e0b' },
  G: { label: 'Negociação', cls: 'text-rose-400',  bg: 'bg-rose-400/10',  border: 'border-rose-400/20',  hex: '#f43f5e' },
}

// ─── sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.C
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.cls} ${s.bg} ${s.border}`}>
      {s.label}
    </span>
  )
}

function KpiCard({ label, value, sub, color = 'text-primary', icon }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-bg2 p-3 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted truncate">{label}</span>
        {icon && <span className="text-muted/50 flex-shrink-0">{icon}</span>}
      </div>
      <span className={`text-lg font-bold tabular-nums leading-none ${color}`}>{value ?? '—'}</span>
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
            <button onClick={onLbl}
              className={`text-[10px] px-2 py-1 border rounded transition ${
                lblOn ? 'border-primary/40 text-primary bg-primary/10' : 'border-white/[0.08] text-muted hover:border-primary/30 hover:text-primary'
              }`}>
              🏷 Rótulos
            </button>
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

function CTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg3 border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl text-xs">
      {label && <p className="text-muted mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {cur(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function Eventos() {
  const { tema } = useTheme()
  const C = useMemo(() => ({
    grid: tema === 'light' ? '#e2e8f0' : '#1e2535',
    tick: tema === 'light' ? '#475569' : '#7a8fa8',
    dim:  tema === 'light' ? '#334155' : '#c8d6e8',
    l1: '#2dd4a0', l2: '#0ea5e9', l3: '#f59e0b', l4: '#ec4899',
    cat: ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#f97316', '#8b5cf6', '#14b8a6', '#ef4444', '#64748b'],
  }), [tema])

  // ── período ────────────────────────────────────────────────────────────────
  const hoje = new Date()
  const [anoSel,    setAnoSel]    = useState(hoje.getFullYear())
  const [mesSel,    setMesSel]    = useState(hoje.getMonth() + 1)
  const [useCustom, setUseCustom] = useState(false)
  const [customIni, setCustomIni] = useState('')
  const [customFim, setCustomFim] = useState('')

  const rangeStart = useCustom ? customIni : `${anoSel}-${String(mesSel).padStart(2, '0')}-01`
  const rangeEnd   = useCustom ? customFim : lastDayISO(anoSel, mesSel)

  // ── filtros / tab ──────────────────────────────────────────────────────────
  const [statusFil, setStatusFil] = useState('Todos')
  const [tab,       setTab]       = useState('visao')

  // ── dados ──────────────────────────────────────────────────────────────────
  const [eventos,    setEventos]    = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erroAPI,    setErroAPI]    = useState('')

  // ── import modal ───────────────────────────────────────────────────────────
  const [importModal, setImportModal] = useState(false)
  const [fileUpload,  setFileUpload]  = useState(null)
  const [uploading,   setUploading]   = useState(false)
  const [uploadMsg,   setUploadMsg]   = useState('')
  const [substituir,  setSubstituir]  = useState(false)
  const [limparModal, setLimparModal] = useState(false)
  const [limpando,    setLimpando]    = useState(false)
  const fileRef = useRef()

  // ── expand / rótulos ───────────────────────────────────────────────────────
  const [expand, setExpand] = useState(null)
  const [lbls,   setLbls]   = useState({ weekly: false, exec: false, simul: false, rn: false })
  const togLbl = k => setLbls(p => ({ ...p, [k]: !p[k] }))

  // ── fetch ──────────────────────────────────────────────────────────────────
  const carregarEventos = useCallback(async () => {
    if (!rangeStart || !rangeEnd) return
    setCarregando(true)
    setErroAPI('')
    try {
      const res = await api.get('/eventos/', { params: { data_ini: rangeStart, data_fim: rangeEnd } })
      setEventos(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      const status = e.response?.status
      const msg = status === 500
        ? 'Erro no servidor (500) — verifique se as migrações foram aplicadas: python manage.py migrate'
        : status === 403
        ? 'Empresa não identificada — selecione uma empresa ativa'
        : `Erro ao carregar eventos (${status ?? 'sem resposta'})`
      setErroAPI(msg)
      setEventos([])
      console.error('[Eventos] GET /eventos/ falhou:', e.response?.status, e.response?.data)
    } finally {
      setCarregando(false)
    }
  }, [rangeStart, rangeEnd])

  useEffect(() => { carregarEventos() }, [carregarEventos])

  // ── filtrado ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (statusFil === 'Todos') return eventos
    const code = Object.entries(STATUS).find(([, v]) => v.label === statusFil)?.[0]
    return eventos.filter(e => e.status === code)
  }, [eventos, statusFil])

  // ── totais ─────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const t = { hosp: 0, sala: 0, aeb: 0, outros: 0, rn: 0, diaria: 0, count: filtered.length }
    filtered.forEach(e => {
      t.hosp   += +e.prev_hosp   || 0
      t.sala   += +e.prev_sala   || 0
      t.aeb    += +e.prev_aeb    || 0
      t.outros += +e.prev_outros || 0
      t.rn     += +e.rn          || 0
      t.diaria += +e.diaria      || 0
    })
    t.total = t.hosp + t.sala + t.aeb + t.outros
    return t
  }, [filtered])

  // ── gráficos ───────────────────────────────────────────────────────────────
  const statusData = useMemo(() => {
    const map = {}
    eventos.forEach(e => { map[e.status] = (map[e.status] || 0) + 1 })
    return Object.entries(map).map(([k, v]) => ({
      name: STATUS[k]?.label || k, value: v, hex: STATUS[k]?.hex || '#64748b',
    }))
  }, [eventos])

  const revenueByCategory = useMemo(() => [
    { name: 'Hospedagem', value: totals.hosp,   color: '#6366f1' },
    { name: 'Salas',      value: totals.sala,   color: '#06b6d4' },
    { name: 'A&B',        value: totals.aeb,    color: '#f59e0b' },
    { name: 'Outros',     value: totals.outros, color: '#ec4899' },
  ].filter(r => r.value > 0), [totals])

  const weeklyData = useMemo(() => {
    if (!rangeStart || !rangeEnd) return []
    const weeks = []
    const end = new Date(rangeEnd + 'T12:00:00')
    const cur = new Date(rangeStart + 'T12:00:00')
    cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7))
    while (cur <= end) {
      const wS = localISO(cur)
      const wE = localISO(new Date(cur.getTime() + 6 * 86400000))
      weeks.push({ wS, wE })
      cur.setDate(cur.getDate() + 7)
    }
    return weeks.map(({ wS, wE }) => {
      const evts = filtered.filter(e => e.inicio <= wE && e.fim >= wS)
      const d = new Date(wS + 'T12:00:00')
      return {
        name:       `${d.getDate()}/${d.getMonth() + 1}`,
        Hospedagem: evts.reduce((s, e) => s + (+e.prev_hosp   || 0), 0),
        Salas:      evts.reduce((s, e) => s + (+e.prev_sala   || 0), 0),
        'A&B':      evts.reduce((s, e) => s + (+e.prev_aeb    || 0), 0),
        Outros:     evts.reduce((s, e) => s + (+e.prev_outros || 0), 0),
        eventos:    evts.length,
        rn:         evts.reduce((s, e) => s + (+e.rn || 0), 0),
        total:      evts.reduce((s, e) => s + (+e.prev_hosp||0) + (+e.prev_sala||0) + (+e.prev_aeb||0) + (+e.prev_outros||0), 0),
      }
    })
  }, [filtered, rangeStart, rangeEnd])

  const execData = useMemo(() => {
    const map = {}
    filtered.forEach(e => {
      const k = e.exec_nome || '—'
      if (!map[k]) map[k] = { name: k, eventos: 0, receita: 0, rn: 0 }
      map[k].eventos++
      map[k].receita += (+e.prev_hosp || 0) + (+e.prev_sala || 0) + (+e.prev_aeb || 0) + (+e.prev_outros || 0)
      map[k].rn += +e.rn || 0
    })
    return Object.values(map).sort((a, b) => b.receita - a.receita)
  }, [filtered])

  const ramoData = useMemo(() => {
    const map = {}
    filtered.forEach(e => {
      const k = e.ramo || 'Outros'
      if (!map[k]) map[k] = { name: k, value: 0, count: 0 }
      map[k].value += +e.diaria || 0
      map[k].count++
    })
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [filtered])

  const timelineData = useMemo(() => {
    if (!rangeStart || !rangeEnd) return []
    const days = []
    const d = new Date(rangeStart + 'T12:00:00')
    const end = new Date(rangeEnd + 'T12:00:00')
    while (d <= end) {
      const iso = localISO(d)
      const evts = filtered.filter(e => e.inicio <= iso && e.fim >= iso)
      days.push({
        day:     `${d.getDate()}/${d.getMonth() + 1}`,
        eventos: evts.length,
        rn:      evts.reduce((s, e) => s + (+e.rn || 0), 0),
      })
      d.setDate(d.getDate() + 1)
    }
    return days
  }, [filtered, rangeStart, rangeEnd])

  const ganttDays = useMemo(() => {
    if (!rangeStart || !rangeEnd) return []
    const days = []
    const d = new Date(rangeStart + 'T12:00:00')
    const end = new Date(rangeEnd + 'T12:00:00')
    while (d <= end && days.length < 62) {
      days.push({ iso: localISO(d), label: d.getDate() })
      d.setDate(d.getDate() + 1)
    }
    return days
  }, [rangeStart, rangeEnd])

  // ── navegação mês ──────────────────────────────────────────────────────────
  function prevMes() {
    if (useCustom) return
    if (mesSel === 1) { setMesSel(12); setAnoSel(a => a - 1) }
    else setMesSel(m => m - 1)
  }
  function nextMes() {
    if (useCustom) return
    if (mesSel === 12) { setMesSel(1); setAnoSel(a => a + 1) }
    else setMesSel(m => m + 1)
  }

  // ── import ─────────────────────────────────────────────────────────────────
  async function importar() {
    if (!fileUpload) return
    setUploading(true); setUploadMsg('')
    try {
      const buf  = await fileUpload.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'array', cellDates: true })
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
      const registros = rows.map(r => ({
        ...r,
        Inicio: normDateXlsx(
          r.Inicio || r.inicio || r['Data Inicio'] || r['Data Início'] ||
          r['Data_Inicio'] || r['Data_Início'] || r['DataInicio']
        ),
        Fim: normDateXlsx(
          r.Fim || r.fim || r['Data Fim'] || r['Data_Fim'] ||
          r['Data_Termino'] || r['Data Termino'] || r['Data Término'] || r['DataFim']
        ),
      }))
      const res = await api.post('/eventos/importar/', { registros, substituir })
      const d = res.data
      const baseMsg = `✓ ${d.criados} criados · ${d.atualizados} atualizados · ${d.ignorados} ignorados`
      const colMsg  = d.colunas_encontradas?.length
        ? `\nColunas detectadas: ${d.colunas_encontradas.join(' | ')}`
        : ''
      setUploadMsg(baseMsg + colMsg)
      if (d.criados > 0 || d.atualizados > 0) {
        setTimeout(() => {
          setImportModal(false); setFileUpload(null); setUploadMsg('')
          carregarEventos()
        }, 2500)
      } else {
        carregarEventos()
      }
    } catch (e) {
      setUploadMsg(e.response?.data?.erro || 'Erro ao importar')
    } finally {
      setUploading(false)
    }
  }

  async function limpar() {
    setLimpando(true)
    try {
      await api.delete('/eventos/limpar/')
      setLimparModal(false); carregarEventos()
    } catch (e) {
      alert(e.response?.data?.erro || 'Erro ao limpar')
    } finally {
      setLimpando(false)
    }
  }

  const periodoLabel = useCustom
    ? `${customIni?.slice(5).replace('-', '/')} → ${customFim?.slice(5).replace('-', '/')}`
    : `${MESES[mesSel - 1]} ${anoSel}`

  // ── render helpers ─────────────────────────────────────────────────────────
  const weeklyLegend = (
    <div className="flex gap-4 justify-center mt-2">
      {[['Hospedagem', '#6366f1'], ['Salas', '#06b6d4'], ['A&B', '#f59e0b'], ['Outros', '#ec4899']].map(([n, c]) => (
        <div key={n} className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm" style={{ background: c }}/>
          <span className="text-[10px] text-muted">{n}</span>
        </div>
      ))}
    </div>
  )

  const ganttContent = (
    <div className="overflow-x-auto">
      <div style={{ minWidth: Math.max(600, 200 + ganttDays.length * 22) }}>
        <div className="flex mb-2" style={{ marginLeft: 200 }}>
          {ganttDays.map(({ label, iso }) => (
            <div key={iso} className="flex-shrink-0 text-center text-[9px] text-muted/60 font-medium" style={{ width: 22 }}>
              {label}
            </div>
          ))}
        </div>
        {filtered.map((e, i) => (
          <div key={i} className="flex items-center mb-1">
            <div className="flex-shrink-0 text-[10px] text-muted pr-2 text-right overflow-hidden text-ellipsis whitespace-nowrap"
              style={{ width: 200 }} title={e.nome}>
              {e.nome?.length > 28 ? e.nome.slice(0, 28) + '…' : e.nome}
            </div>
            <div className="flex">
              {ganttDays.map(({ iso }) => {
                const inRange = e.inicio <= iso && e.fim >= iso
                const isFirst = iso === e.inicio
                const isLast  = iso === e.fim
                return (
                  <div key={iso} className="flex-shrink-0" title={inRange ? e.nome : ''} style={{
                    width: 22, height: 18,
                    background: inRange ? (STATUS[e.status]?.hex || '#2dd4a0') : 'transparent',
                    opacity:    inRange ? 0.75 : 1,
                    borderRadius: isFirst && isLast ? 4 : isFirst ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : 0,
                    borderRight: inRange && !isLast ? '1px solid rgba(0,0,0,0.15)' : 'none',
                  }}/>
                )
              })}
            </div>
          </div>
        ))}
        <div className="flex gap-5 mt-3" style={{ marginLeft: 200 }}>
          {Object.values(STATUS).map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <div className="w-3 h-2 rounded-sm opacity-75" style={{ background: s.hex }}/>
              <span className="text-[10px] text-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 bg-bg2 border-b border-white/[0.06]">

        <div className="flex items-center gap-1">
          <button onClick={prevMes} disabled={useCustom}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-muted disabled:opacity-30 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="text-xs font-bold text-dim min-w-[88px] text-center tabular-nums">{periodoLabel}</span>
          <button onClick={nextMes} disabled={useCustom}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-muted disabled:opacity-30 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        <button onClick={() => setUseCustom(c => !c)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
            useCustom ? 'bg-primary/15 border-primary/25 text-primary' : 'border-white/[0.07] text-muted hover:text-dim'
          }`}>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Custom
        </button>

        {useCustom && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={customIni} onChange={e => setCustomIni(e.target.value)}
              className="bg-bg3 border border-white/[0.07] rounded-lg px-2 py-1 text-xs text-dim focus:outline-none focus:border-primary/40"/>
            <span className="text-muted text-xs">→</span>
            <input type="date" value={customFim} onChange={e => setCustomFim(e.target.value)}
              className="bg-bg3 border border-white/[0.07] rounded-lg px-2 py-1 text-xs text-dim focus:outline-none focus:border-primary/40"/>
          </div>
        )}

        <div className="flex rounded-xl overflow-hidden border border-white/[0.07] text-xs">
          {['Todos', ...Object.values(STATUS).map(s => s.label)].map(s => (
            <button key={s} onClick={() => setStatusFil(s)}
              className={`px-2.5 py-1.5 font-semibold transition-colors ${
                statusFil === s ? 'bg-primary/20 text-primary' : 'text-muted hover:text-dim'
              }`}>
              {s}
            </button>
          ))}
        </div>

        <div className="flex-1"/>

        <button onClick={() => setImportModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Importar Excel
        </button>
        <button onClick={() => setLimparModal(true)}
          className="px-3 py-1.5 rounded-xl border border-rose-500/20 text-rose-400 text-xs font-semibold hover:bg-rose-500/10 transition-colors">
          Limpar dados
        </button>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex gap-0 px-4 border-b border-white/[0.06]">
        {[
          { id: 'visao',    label: 'Visão Geral' },
          { id: 'timeline', label: 'Timeline' },
          { id: 'tabela',   label: 'Tabela Detalhada' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-dim'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Conteúdo ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 py-3">

        {erroAPI && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl px-4 py-3 mb-3">
            <svg className="w-4 h-4 text-rose-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span className="text-xs text-rose-400 font-medium">{erroAPI}</span>
          </div>
        )}

        {/* ═══ VISÃO GERAL ══════════════════════════════════════ */}
        {tab === 'visao' && (
          <div className="flex flex-col gap-4">

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {carregando ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/[0.05] bg-bg2 p-3 h-20 animate-pulse"/>
                ))
              ) : (<>
                <KpiCard label="Eventos" value={num(totals.count)} sub={periodoLabel} color="text-primary"
                  icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}/>
                <KpiCard label="Room Nights" value={num(totals.rn)} sub="total previsto" color="text-blue-400"
                  icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>}/>
                <KpiCard label="Receita Prev." value={curK(totals.total)} sub="todas categorias" color="text-teal-400"
                  icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}/>
                <KpiCard label="Hospedagem" value={curK(totals.hosp)}
                  sub={totals.total ? `${((totals.hosp / totals.total) * 100).toFixed(0)}% do total` : '—'}
                  color="text-violet-400"/>
                <KpiCard label="A&B" value={curK(totals.aeb)}
                  sub={totals.total ? `${((totals.aeb / totals.total) * 100).toFixed(0)}% do total` : '—'}
                  color="text-amber-400"/>
                <KpiCard label="Diárias" value={curK(totals.diaria)} sub="valor total" color="text-rose-400"/>
              </>)}
            </div>

            {!carregando && !erroAPI && filtered.length === 0 && (
              <div className="flex items-center justify-center h-40 text-sm text-muted/50">
                Sem eventos para o período selecionado
              </div>
            )}

            {filtered.length > 0 && (<>

            {/* Pies */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

              <ChartCard title="Status dos Eventos" onExpand={() => setExpand('status')}>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={130} height={130}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value">
                        {statusData.map((e, i) => <Cell key={i} fill={e.hex}/>)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--color-bg3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2.5 flex-1">
                    {statusData.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.hex }}/>
                        <span className="text-[11px] text-muted flex-1">{s.name}</span>
                        <span className="text-[11px] font-bold text-dim tabular-nums">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </ChartCard>

              <ChartCard title="Receita Prevista por Categoria" onExpand={() => setExpand('revenue')}>
                {revenueByCategory.length > 0 ? (
                  <div className="flex items-center gap-6">
                    <ResponsiveContainer width={130} height={130}>
                      <PieChart>
                        <Pie data={revenueByCategory} cx="50%" cy="50%" innerRadius={38} outerRadius={58} paddingAngle={3} dataKey="value">
                          {revenueByCategory.map((e, i) => <Cell key={i} fill={e.color}/>)}
                        </Pie>
                        <Tooltip content={<CTooltip/>}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2.5 flex-1">
                      {revenueByCategory.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }}/>
                          <span className="text-[11px] text-muted flex-1">{r.name}</span>
                          <span className="text-[11px] font-bold text-dim tabular-nums">{curK(r.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted/50 py-10 text-center">Sem previsão de receita</p>
                )}
              </ChartCard>
            </div>

            {/* Receita semanal */}
            <ChartCard title="Receita Semanal por Categoria"
              onExpand={() => setExpand('weekly')}
              lblOn={lbls.weekly} onLbl={() => togLbl('weekly')}>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={weeklyData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={curK} tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false} width={60}/>
                  <Tooltip content={<CTooltip/>}/>
                  <Bar dataKey="Hospedagem" stackId="a" fill="#6366f1"/>
                  <Bar dataKey="Salas"      stackId="a" fill="#06b6d4"/>
                  <Bar dataKey="A&B"        stackId="a" fill="#f59e0b"/>
                  <Bar dataKey="Outros"     stackId="a" fill="#ec4899" radius={[3, 3, 0, 0]}>
                    {lbls.weekly && <LabelList dataKey="total" position="top" formatter={curK} style={{ fill: C.tick, fontSize: 9, fontWeight: 700 }}/>}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {weeklyLegend}
            </ChartCard>

            {/* Executivos + Ramos */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

              <ChartCard title="Performance por Executivo"
                onExpand={() => setExpand('exec')}
                lblOn={lbls.exec} onLbl={() => togLbl('exec')}>
                <ResponsiveContainer width="100%" height={Math.max(160, execData.length * 36)}>
                  <BarChart data={execData} layout="vertical" barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
                    <XAxis type="number" tickFormatter={curK} tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.dim }} width={90} axisLine={false} tickLine={false} interval={0}/>
                    <Tooltip content={<CTooltip/>}/>
                    <Bar dataKey="receita" name="Receita" fill={C.l1} radius={[0, 4, 4, 0]}>
                      {lbls.exec && <LabelList dataKey="receita" position="right" formatter={curK} style={{ fill: C.tick, fontSize: 9, fontWeight: 700 }}/>}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Por Ramo de Atividade" onExpand={() => setExpand('ramo')}>
                <div className="flex flex-col gap-3 mt-1">
                  {ramoData.slice(0, 8).map((r, i) => (
                    <div key={i}>
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px] text-muted truncate max-w-[55%]" title={r.name}>{r.name}</span>
                        <span className="text-[11px] font-bold tabular-nums text-dim">{curK(r.value)}</span>
                      </div>
                      <div className="h-1.5 bg-bg3 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${ramoData[0]?.value ? (r.value / ramoData[0].value) * 100 : 0}%`,
                            background: C.cat[i % C.cat.length],
                          }}/>
                      </div>
                    </div>
                  ))}
                </div>
              </ChartCard>
            </div>
            </>)}
          </div>
        )}

        {/* ═══ TIMELINE ══════════════════════════════════════════ */}
        {tab === 'timeline' && filtered.length > 0 && (
          <div className="flex flex-col gap-4">

            <ChartCard title="Eventos Simultâneos por Dia"
              onExpand={() => setExpand('simul')}
              lblOn={lbls.simul} onLbl={() => togLbl('simul')}>
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="gradEvt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.l1} stopOpacity={0.35}/>
                      <stop offset="100%" stopColor={C.l1} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: C.tick }} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false} width={28} allowDecimals={false}/>
                  <Tooltip contentStyle={{ background: 'var(--color-bg3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}/>
                  <Area type="monotone" dataKey="eventos" name="Eventos" stroke={C.l1} fill="url(#gradEvt)" strokeWidth={2}>
                    {lbls.simul && <LabelList dataKey="eventos" position="top" style={{ fill: C.tick, fontSize: 9, fontWeight: 700 }}/>}
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Room Nights por Dia"
              onExpand={() => setExpand('rn')}
              lblOn={lbls.rn} onLbl={() => togLbl('rn')}>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: C.tick }} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false} width={36}/>
                  <Tooltip contentStyle={{ background: 'var(--color-bg3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}/>
                  <Bar dataKey="rn" name="Room Nights" fill={C.l2} radius={[3, 3, 0, 0]}>
                    {lbls.rn && <LabelList dataKey="rn" position="top" style={{ fill: C.tick, fontSize: 9, fontWeight: 700 }}/>}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Linha do Tempo dos Eventos" onExpand={() => setExpand('gantt')}>
              {ganttContent}
            </ChartCard>
          </div>
        )}

        {/* ═══ TABELA ═══════════════════════════════════════════ */}
        {tab === 'tabela' && (
          <div className="bg-bg2 rounded-2xl border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead className="sticky top-0 bg-bg3 z-10">
                  <tr className="text-muted uppercase tracking-wide text-[9px] border-b border-white/[0.06]">
                    {['Evento', 'Período', 'Status', 'Executivo', 'Cliente', 'Hosp.', 'Salas', 'A&B', 'Outros', 'Total Prev.', 'RN', 'Diárias'].map((h, i) => (
                      <th key={h} className={`px-3 py-2.5 font-bold whitespace-nowrap ${i <= 4 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.025] transition-colors">
                      <td className="px-3 py-2 max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-dim font-medium" title={e.nome}>{e.nome}</td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap tabular-nums text-[10px]">
                        {e.inicio?.slice(5).replace('-', '/')} → {e.fim?.slice(5).replace('-', '/')}
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={e.status}/></td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{e.exec_nome || '—'}</td>
                      <td className="px-3 py-2 text-muted max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap" title={e.cliente}>{e.cliente || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{+e.prev_hosp   > 0 ? <span className="text-dim">{curK(e.prev_hosp)}</span>   : <span className="text-muted/30">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{+e.prev_sala   > 0 ? <span className="text-dim">{curK(e.prev_sala)}</span>   : <span className="text-muted/30">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{+e.prev_aeb    > 0 ? <span className="text-dim">{curK(e.prev_aeb)}</span>    : <span className="text-muted/30">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{+e.prev_outros > 0 ? <span className="text-dim">{curK(e.prev_outros)}</span> : <span className="text-muted/30">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-teal-400">{+e.prev_total > 0 ? curK(e.prev_total) : <span className="text-muted/30">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-blue-400 font-bold">{+e.rn > 0 ? num(e.rn) : <span className="text-muted/30">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{+e.diaria > 0 ? <span className="text-dim">{curK(e.diaria)}</span> : <span className="text-muted/30">—</span>}</td>
                    </tr>
                  ))}
                  {filtered.length > 0 && (
                    <tr className="border-t-2 border-primary/20 bg-primary/[0.04]">
                      <td colSpan={5} className="px-3 py-2.5 font-bold text-primary text-xs">
                        TOTAL — {filtered.length} evento{filtered.length !== 1 ? 's' : ''}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-primary">{curK(totals.hosp)}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-primary">{curK(totals.sala)}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-primary">{curK(totals.aeb)}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-primary">{curK(totals.outros)}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-teal-400">{curK(totals.total)}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-blue-400">{num(totals.rn)}</td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-primary">{curK(totals.diaria)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {filtered.length === 0 && !carregando && (
                <div className="py-12 text-center text-xs text-muted/50">Sem eventos para o período</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modais de Expansão ──────────────────────────────────── */}
      {expand === 'status' && (
        <ExpandModal title="Status dos Eventos" onClose={() => setExpand(null)}>
          <div className="flex items-center justify-center gap-12 flex-1">
            <ResponsiveContainer width={300} height={300}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={3} dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`} labelLine>
                  {statusData.map((e, i) => <Cell key={i} fill={e.hex}/>)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--color-bg3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13 }}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-4">
              {statusData.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: s.hex }}/>
                  <span className="text-sm text-muted">{s.name}</span>
                  <span className="text-sm font-bold text-dim tabular-nums ml-2">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </ExpandModal>
      )}

      {expand === 'revenue' && (
        <ExpandModal title="Receita Prevista por Categoria" onClose={() => setExpand(null)}>
          <div className="flex items-center justify-center gap-12 flex-1">
            <ResponsiveContainer width={300} height={300}>
              <PieChart>
                <Pie data={revenueByCategory} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={3} dataKey="value"
                  label={({ name, value }) => `${name}: ${curK(value)}`} labelLine>
                  {revenueByCategory.map((e, i) => <Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip content={<CTooltip/>}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-4">
              {revenueByCategory.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: r.color }}/>
                  <span className="text-sm text-muted">{r.name}</span>
                  <span className="text-sm font-bold text-dim tabular-nums ml-2">{curK(r.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </ExpandModal>
      )}

      {expand === 'weekly' && (
        <ExpandModal title="Receita Semanal por Categoria" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={460}>
            <BarChart data={weeklyData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={curK} tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false} width={70}/>
              <Tooltip content={<CTooltip/>}/>
              <Bar dataKey="Hospedagem" stackId="a" fill="#6366f1"/>
              <Bar dataKey="Salas"      stackId="a" fill="#06b6d4"/>
              <Bar dataKey="A&B"        stackId="a" fill="#f59e0b"/>
              <Bar dataKey="Outros"     stackId="a" fill="#ec4899" radius={[3, 3, 0, 0]}>
                <LabelList dataKey="total" position="top" formatter={curK} style={{ fill: C.tick, fontSize: 11, fontWeight: 700 }}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {weeklyLegend}
        </ExpandModal>
      )}

      {expand === 'exec' && (
        <ExpandModal title="Performance por Executivo" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={Math.max(400, execData.length * 50)}>
            <BarChart data={execData} layout="vertical" barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
              <XAxis type="number" tickFormatter={curK} tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: C.dim }} width={120} axisLine={false} tickLine={false} interval={0}/>
              <Tooltip content={<CTooltip/>}/>
              <Bar dataKey="receita" name="Receita" fill={C.l1} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="receita" position="right" formatter={curK} style={{ fill: C.tick, fontSize: 11, fontWeight: 700 }}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ExpandModal>
      )}

      {expand === 'ramo' && (
        <ExpandModal title="Por Ramo de Atividade" onClose={() => setExpand(null)}>
          <div className="flex flex-col gap-4 max-w-2xl mx-auto w-full mt-4">
            {ramoData.map((r, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm text-muted">{r.name}</span>
                  <span className="text-sm font-bold tabular-nums text-dim">{curK(r.value)}</span>
                </div>
                <div className="h-2 bg-bg3 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${ramoData[0]?.value ? (r.value / ramoData[0].value) * 100 : 0}%`,
                      background: C.cat[i % C.cat.length],
                    }}/>
                </div>
              </div>
            ))}
          </div>
        </ExpandModal>
      )}

      {expand === 'simul' && (
        <ExpandModal title="Eventos Simultâneos por Dia" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={420}>
            <AreaChart data={timelineData}>
              <defs>
                <linearGradient id="gradEvt2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.l1} stopOpacity={0.35}/>
                  <stop offset="100%" stopColor={C.l1} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: C.tick }} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false} width={36} allowDecimals={false}/>
              <Tooltip contentStyle={{ background: 'var(--color-bg3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13 }}/>
              <Area type="monotone" dataKey="eventos" name="Eventos" stroke={C.l1} fill="url(#gradEvt2)" strokeWidth={2}>
                <LabelList dataKey="eventos" position="top" style={{ fill: C.tick, fontSize: 10, fontWeight: 700 }}/>
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        </ExpandModal>
      )}

      {expand === 'rn' && (
        <ExpandModal title="Room Nights por Dia" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: C.tick }} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false} width={42}/>
              <Tooltip contentStyle={{ background: 'var(--color-bg3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13 }}/>
              <Bar dataKey="rn" name="Room Nights" fill={C.l2} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="rn" position="top" style={{ fill: C.tick, fontSize: 10, fontWeight: 700 }}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ExpandModal>
      )}

      {expand === 'gantt' && (
        <ExpandModal title="Linha do Tempo dos Eventos" onClose={() => setExpand(null)}>
          {ganttContent}
        </ExpandModal>
      )}

      {/* ── Modal Importar ───────────────────────────────────────── */}
      {importModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg2 border border-white/[0.08] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-bold text-dim mb-4">Importar Eventos</h3>
            <label className="block mb-4 cursor-pointer">
              <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${fileUpload ? 'border-primary/40 bg-primary/5' : 'border-white/[0.08] hover:border-primary/30'}`}>
                <svg className="w-8 h-8 mx-auto mb-2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                {fileUpload
                  ? <p className="text-xs text-primary font-semibold">{fileUpload.name}</p>
                  : <p className="text-xs text-muted">Clique para selecionar<br/><span className="text-[10px]">.xlsx · .xls · .csv</span></p>}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => setFileUpload(e.target.files[0] || null)}/>
            </label>
            <label className="flex items-center gap-2 mb-4 cursor-pointer text-xs text-muted">
              <input type="checkbox" checked={substituir} onChange={e => setSubstituir(e.target.checked)} className="rounded accent-primary"/>
              Substituir registros existentes (por ID)
            </label>
            {uploadMsg && (
              <p className={`text-xs mb-3 font-semibold whitespace-pre-wrap break-all ${uploadMsg.startsWith('✓') ? 'text-primary' : 'text-rose-400'}`}>{uploadMsg}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setImportModal(false); setFileUpload(null); setUploadMsg('') }}
                className="flex-1 py-2 rounded-xl border border-white/[0.08] text-xs text-muted hover:text-dim">Cancelar</button>
              <button onClick={importar} disabled={!fileUpload || uploading}
                className="flex-1 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/30 disabled:opacity-40">
                {uploading ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Limpar ─────────────────────────────────────────── */}
      {limparModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg2 border border-white/[0.08] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
            <h3 className="text-sm font-bold text-dim mb-2">Limpar dados</h3>
            <p className="text-xs text-muted mb-6">Isso apagará <strong className="text-rose-400">todos</strong> os eventos desta empresa. Não há como desfazer.</p>
            <div className="flex gap-2">
              <button onClick={() => setLimparModal(false)}
                className="flex-1 py-2 rounded-xl border border-white/[0.08] text-xs text-muted hover:text-dim">Cancelar</button>
              <button onClick={limpar} disabled={limpando}
                className="flex-1 py-2 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400 text-xs font-semibold hover:bg-rose-500/25 disabled:opacity-40">
                {limpando ? 'Limpando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
