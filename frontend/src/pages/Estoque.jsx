import { useState, useMemo, useRef, useEffect } from 'react'
import api from '../services/api'
import GiroEstoque from './GiroEstoque'
import {
  ComposedChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Line, ResponsiveContainer, PieChart, Pie, Cell, LabelList,
} from 'recharts'
import { useTheme } from '../contexts/ThemeContext'
import { useEmpresa } from '../contexts/EmpresaContext'

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtR  = v => (+(v)||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2, maximumFractionDigits:2 })
const fmtK  = v => { const n=+(v)||0; if(Math.abs(n)>=1e6) return `R$${(n/1e6).toFixed(1).replace('.',',')}M`; if(Math.abs(n)>=1e3) return `R$${(n/1e3).toFixed(0)}k`; return fmtR(n) }
const fmtN  = v => (+(v)||0).toLocaleString('pt-BR')
const fmtN3 = v => (+(v)||0).toLocaleString('pt-BR', { minimumFractionDigits:3, maximumFractionDigits:3 })
function trunc(s, n) { return s && s.length > n ? s.slice(0,n-1)+'…' : (s||'—') }
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CAT   = ['#6366f1','#06b6d4','#f59e0b','#ec4899','#10b981','#f97316','#8b5cf6','#14b8a6','#ef4444','#64748b','#a855f7','#22c55e']

// ─── sub-components ───────────────────────────────────────────────────────────
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

function CTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg3 border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl text-xs">
      {label && <p className="text-muted mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.stroke }} className="font-semibold">
          {p.name}: {fmtR(p.value)}
        </p>
      ))}
    </div>
  )
}

function AbcTag({ abc }) {
  const cls = abc === 'A'
    ? 'text-teal-400 bg-teal-400/10 border-teal-400/20'
    : abc === 'B'
    ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
    : 'text-rose-400 bg-rose-400/10 border-rose-400/20'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${cls}`}>{abc}</span>
}

function KpiCard({ label, value, sub, color = 'text-primary', icon }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-bg2 p-3 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted truncate">{label}</span>
        {icon && <span className="text-muted/50 flex-shrink-0">{icon}</span>}
      </div>
      <span className={`text-lg font-bold tabular-nums leading-none ${color}`}>{value}</span>
      <span className="text-[10px] text-muted/70 truncate">{sub}</span>
    </div>
  )
}

function SelectFiltro({ label, value, onChange, options, allLabel }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[8px] font-bold text-muted uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 min-w-[110px] max-w-[160px]"
      >
        <option value="">{allLabel}</option>
        {options.map(o => <option key={o} value={o}>{trunc(o, 30)}</option>)}
      </select>
    </div>
  )
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function Estoque() {
  const { tema } = useTheme()
  const { empresaAtiva } = useEmpresa()
  const C = useMemo(() => ({
    grid:    tema === 'light' ? '#e2e8f0' : '#1e2535',
    tick:    tema === 'light' ? '#475569' : '#7a8fa8',
    dim:     tema === 'light' ? '#334155' : '#c8d6e8',
    purple:  '#a78bfa',
  }), [tema])

  // ── dados ──────────────────────────────────────────────────────────
  const [rawData,    setRawData]    = useState([])
  const [fileLoaded, setFileLoaded] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [dragOver,   setDragOver]   = useState(false)
  const [arquivoInfo, setArquivoInfo] = useState(null)
  const fileRef = useRef()
  const filtersInitRef = useRef(false)

  // ── filtros ────────────────────────────────────────────────────────
  const [dateStart,  setDateStart]  = useState('')
  const [dateEnd,    setDateEnd]    = useState('')
  const [filtAlmox,  setFiltAlmox]  = useState('')
  const [filtClasse, setFiltClasse] = useState('')
  const [filtForn,   setFiltForn]   = useState('')
  const [filtCtrl,   setFiltCtrl]   = useState('')

  // ── busca tabelas ──────────────────────────────────────────────────
  const [itemSearch, setItemSearch] = useState('')
  const [fornSearch, setFornSearch] = useState('')

  // ── expand / rótulos ───────────────────────────────────────────────
  const [expand, setExpand] = useState(null)
  const [lbls,   setLbls]   = useState({ monthly: false, classes: false, forn: false, stacked: false })
  const [aba,    setAba]    = useState('entradas')
  const togLbl = k => setLbls(p => ({ ...p, [k]: !p[k] }))

  // ── helpers ────────────────────────────────────────────────────────
  function _apiToRaw(entries) {
    return entries.map(r => ({ ...r, data: new Date(r.data + 'T00:00:00'), valorTotal: r.valor_total }))
      .filter(r => r.data && !isNaN(r.data.getTime()))
  }

  function _setDatas(parsed) {
    if (!parsed.length) return
    const times = parsed.map(r => r.data.getTime())
    setDateStart(isoDate(new Date(Math.min(...times))))
    setDateEnd(isoDate(new Date(Math.max(...times))))
  }

  const lsKeyEstoque = `filters_estoque_${empresaAtiva?.id||'default'}`

  // ── carregar dados do backend ──────────────────────────────────────
  async function carregarEntradas() {
    try {
      const { data: entries } = await api.get('/estoque/entradas/')
      const parsed = _apiToRaw(entries)
      parsed.sort((a, b) => a.data - b.data)
      setRawData(parsed)
      if (!filtersInitRef.current) {
        filtersInitRef.current = true
        try {
          const saved = localStorage.getItem(lsKeyEstoque)
          if (saved) {
            const s = JSON.parse(saved)
            if (s.dateStart)  setDateStart(s.dateStart)
            if (s.dateEnd)    setDateEnd(s.dateEnd)
            if (s.filtAlmox  !== undefined) setFiltAlmox(s.filtAlmox)
            if (s.filtClasse !== undefined) setFiltClasse(s.filtClasse)
            if (s.filtForn   !== undefined) setFiltForn(s.filtForn)
            if (s.filtCtrl   !== undefined) setFiltCtrl(s.filtCtrl)
          } else {
            _setDatas(parsed)
          }
        } catch { _setDatas(parsed) }
      }
      setFileLoaded(true)
    } catch {}
  }

  // reset filter init when company changes so new company gets fresh/saved state
  useEffect(() => { filtersInitRef.current = false }, [empresaAtiva?.id])

  // ── verificar status ao montar ─────────────────────────────────────
  useEffect(() => {
    api.get('/estoque/status/').then(({ data }) => {
      if (data.ok) {
        setArquivoInfo(data)
        carregarEntradas()
      }
    }).catch(() => {})
  }, [empresaAtiva?.id])

  useEffect(() => {
    if (!filtersInitRef.current) return
    localStorage.setItem(lsKeyEstoque, JSON.stringify({
      dateStart, dateEnd, filtAlmox, filtClasse, filtForn, filtCtrl,
    }))
  }, [dateStart, dateEnd, filtAlmox, filtClasse, filtForn, filtCtrl, lsKeyEstoque])

  // ── upload para o backend ──────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return
    setCarregando(true)
    try {
      const form = new FormData()
      form.append('arquivo', file)
      const { data } = await api.post('/estoque/upload/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      if (!data.ok) { alert('Erro: ' + data.erro); return }
      setArquivoInfo({ arquivo: data.arquivo, total_registros: data.total_registros })
      await carregarEntradas()
    } catch (err) {
      alert('Erro ao enviar arquivo: ' + (err.response?.data?.erro || err.message))
    } finally {
      setCarregando(false)
    }
  }

  // ── opções de filtro ───────────────────────────────────────────────
  const almoxOpts  = useMemo(() => [...new Set(rawData.map(r => r.almox))].filter(Boolean).sort(), [rawData])
  const classeOpts = useMemo(() => [...new Set(rawData.map(r => r.classe))].filter(Boolean).sort(), [rawData])
  const fornOpts   = useMemo(() => [...new Set(rawData.map(r => r.fornecedor))].filter(Boolean).sort(), [rawData])

  // ── dados filtrados ────────────────────────────────────────────────
  const filtered = useMemo(() => rawData.filter(r => {
    if (dateStart  && r.data < new Date(dateStart + 'T00:00:00')) return false
    if (dateEnd    && r.data > new Date(dateEnd   + 'T23:59:59')) return false
    if (filtAlmox  && r.almox      !== filtAlmox)  return false
    if (filtClasse && r.classe     !== filtClasse) return false
    if (filtForn   && r.fornecedor !== filtForn)   return false
    if (filtCtrl   && r.controlado !== filtCtrl)   return false
    return true
  }), [rawData, dateStart, dateEnd, filtAlmox, filtClasse, filtForn, filtCtrl])

  // ── KPIs ───────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalValor = filtered.reduce((s, r) => s + r.valorTotal, 0)
    const totalQtde  = filtered.reduce((s, r) => s + r.qtde,       0)
    const nfsUnicas  = new Set(filtered.map(r => r.nf)).size
    const itens      = new Set(filtered.map(r => r.item)).size
    const forns      = new Set(filtered.map(r => r.fornecedor)).size
    return {
      totalValor,
      totalQtde,
      nfsUnicas,
      itens,
      forns,
      ticketMedio: nfsUnicas > 0 ? totalValor / nfsUnicas : 0,
      precoMedio:  totalQtde  > 0 ? totalValor / totalQtde  : 0,
    }
  }, [filtered])

  // ── gráfico mensal ─────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const key = `${r.data.getFullYear()}-${String(r.data.getMonth()+1).padStart(2,'0')}`
      map[key] = (map[key] || 0) + r.valorTotal
    })
    let acum = 0
    return Object.keys(map).sort().map((m, i) => {
      acum += map[m]
      const [y, mo] = m.split('-')
      return { name: MESES[+mo-1]+'/'+y.slice(2), valor: map[m], acumulado: acum, media: acum / (i + 1) }
    })
  }, [filtered])

  // ── top classes ────────────────────────────────────────────────────
  const classesChart = useMemo(() => {
    const map = {}
    filtered.forEach(r => { map[r.classe] = (map[r.classe]||0) + r.valorTotal })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value).slice(0, 10)
  }, [filtered])

  // ── top fornecedores ───────────────────────────────────────────────
  const fornChart = useMemo(() => {
    const map = {}
    filtered.forEach(r => { map[r.fornecedor||'—'] = (map[r.fornecedor||'—']||0) + r.valorTotal })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value).slice(0, 10)
  }, [filtered])

  // ── almox donut ────────────────────────────────────────────────────
  const almoxChart = useMemo(() => {
    const map = {}
    filtered.forEach(r => { map[r.almox||'—'] = (map[r.almox||'—']||0) + r.valorTotal })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value)
  }, [filtered])

  // ── stacked todas as classes ───────────────────────────────────────
  const { stackedData, allClasses } = useMemo(() => {
    const classMap = {}
    filtered.forEach(r => { classMap[r.classe] = (classMap[r.classe]||0) + r.valorTotal })
    const allClasses = Object.entries(classMap).sort((a,b)=>b[1]-a[1]).map(([k])=>k)

    const monthMap = {}
    filtered.forEach(r => {
      const key = `${r.data.getFullYear()}-${String(r.data.getMonth()+1).padStart(2,'0')}`
      if (!monthMap[key]) monthMap[key] = {}
      monthMap[key][r.classe] = (monthMap[key][r.classe]||0) + r.valorTotal
    })

    const stackedData = Object.keys(monthMap).sort().map(m => {
      const [y, mo] = m.split('-')
      const entry = { name: MESES[+mo-1]+'/'+y.slice(2) }
      allClasses.forEach(k => { entry[k] = monthMap[m][k] || 0 })
      entry._total = allClasses.reduce((s, k) => s + entry[k], 0)
      return entry
    })
    return { stackedData, allClasses }
  }, [filtered])

  // ── ABC classes ────────────────────────────────────────────────────
  const classeABC = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      if (!map[r.classe]) map[r.classe] = { valor:0, qtde:0, nfs:new Set(), count:0 }
      map[r.classe].valor += r.valorTotal
      map[r.classe].qtde  += r.qtde
      map[r.classe].nfs.add(r.nf)
      map[r.classe].count++
    })
    const total = filtered.reduce((s,r) => s+r.valorTotal, 0)
    const rows = Object.entries(map)
      .map(([k,v]) => ({ classe:k, valor:v.valor, qtde:v.qtde, nfs:v.nfs.size, count:v.count, pct: total>0 ? v.valor/total*100 : 0 }))
      .sort((a,b) => b.valor - a.valor)
    let acum = 0
    return rows.map(r => { acum += r.pct; return { ...r, acum, abc: acum<=80?'A':acum<=95?'B':'C' } })
  }, [filtered])

  // ── ABC itens ──────────────────────────────────────────────────────
  const itemABC = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      if (!map[r.item]) map[r.item] = { valor:0, qtde:0, count:0, classe:r.classe }
      map[r.item].valor += r.valorTotal
      map[r.item].qtde  += r.qtde
      map[r.item].count++
    })
    const total = filtered.reduce((s,r) => s+r.valorTotal, 0)
    const rows = Object.entries(map)
      .map(([k,v]) => ({ item:k, classe:v.classe, valor:v.valor, qtde:v.qtde, entradas:v.count, precoMedio: v.qtde>0?v.valor/v.qtde:0, pct: total>0?v.valor/total*100:0 }))
      .sort((a,b) => b.valor - a.valor)
    let acum = 0
    return rows.map(r => { acum += r.pct; return { ...r, acum, abc: acum<=80?'A':acum<=95?'B':'C' } })
  }, [filtered])

  // ── ABC fornecedores ───────────────────────────────────────────────
  const fornABC = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      if (!map[r.fornecedor]) map[r.fornecedor] = { valor:0, qtde:0, nfs:new Set() }
      map[r.fornecedor].valor += r.valorTotal
      map[r.fornecedor].qtde  += r.qtde
      map[r.fornecedor].nfs.add(r.nf)
    })
    const total = filtered.reduce((s,r) => s+r.valorTotal, 0)
    const rows = Object.entries(map)
      .map(([k,v]) => ({ forn:k, valor:v.valor, qtde:v.qtde, nfs:v.nfs.size, ticketMedio: v.nfs.size>0?v.valor/v.nfs.size:0, pct: total>0?v.valor/total*100:0 }))
      .sort((a,b) => b.valor - a.valor)
    let acum = 0
    return rows.map(r => { acum += r.pct; return { ...r, acum, abc: acum<=80?'A':acum<=95?'B':'C' } })
  }, [filtered])

  const itemsFiltered = useMemo(() => {
    if (!itemSearch) return itemABC.slice(0, 100)
    const q = itemSearch.toLowerCase()
    return itemABC.filter(r => r.item.toLowerCase().includes(q) || r.classe.toLowerCase().includes(q)).slice(0, 100)
  }, [itemABC, itemSearch])

  const fornsFiltered = useMemo(() => {
    if (!fornSearch) return fornABC.slice(0, 80)
    const q = fornSearch.toLowerCase()
    return fornABC.filter(r => r.forn.toLowerCase().includes(q)).slice(0, 80)
  }, [fornABC, fornSearch])

  function exportarCSV() {
    const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
    const headers = ['Data','Item','Classe','Almoxarifado','Fornecedor','NF','Qtde','Preco_Unit','Valor_Total','Unidade']
    const lines = [headers.join(';'), ...filtered.map(r => [
      r.data ? fmt(r.data) : '',
      `"${(r.item||'').replace(/"/g,'""')}"`,
      `"${(r.classe||'').replace(/"/g,'""')}"`,
      `"${(r.almox||'').replace(/"/g,'""')}"`,
      `"${(r.fornecedor||'').replace(/"/g,'""')}"`,
      r.nf,
      fmtN3(r.qtde).replace(/\./g,'').replace(',','.'),
      r.preco.toFixed(4).replace('.',','),
      r.valorTotal.toFixed(2).replace('.',','),
      r.unidade,
    ].join(';'))]
    const blob = new Blob(['﻿'+lines.join('\n')], { type:'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Entrada_Notas_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  // ── render ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {carregando && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin"/>
          <span className="text-sm text-muted">Processando arquivo...</span>
        </div>
      )}

      {/* ── Abas ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex border-b border-white/[0.06] bg-bg2 px-4">
        {[
          { id: 'entradas', label: 'Entradas de Notas',
            icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> },
          { id: 'giro',     label: 'Giro de Estoque',
            icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> },
        ].map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-[11px] font-semibold border-b-2 transition-all ${
              aba === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-dim hover:border-white/[0.15]'
            }`}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Aba: Giro de Estoque ───────────────────────────────────── */}
      {aba === 'giro' && <GiroEstoque />}

      {/* ── Aba: Entradas de Notas ─────────────────────────────────── */}
      {aba === 'entradas' && <>

      {/* ── Upload Zone ────────────────────────────────────────────── */}
      {!fileLoaded ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all max-w-md w-full bg-bg2 ${
              dragOver ? 'border-primary/50 bg-primary/5 scale-[1.02]' : 'border-white/[0.08] hover:border-primary/30 hover:bg-primary/[0.03]'
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          >
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p className="font-bold text-dim text-base mb-2">Importar Planilha de Entradas</p>
            <p className="text-sm text-muted/70 leading-relaxed">
              Arraste e solte o arquivo aqui<br/>ou clique para selecionar
            </p>
            <p className="text-[10px] text-muted/50 mt-3">Os dados são salvos no servidor e persistem entre sessões</p>
            <div className="flex gap-2 justify-center mt-5">
              {['.xlsx','.xls','.csv'].map(f => (
                <span key={f} className="text-[10px] px-2.5 py-1 bg-bg3 rounded-lg text-muted font-mono border border-white/[0.05]">{f}</span>
              ))}
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => handleFile(e.target.files[0])}/>
        </div>
      ) : (
        <>
          {/* ── Toolbar ──────────────────────────────────────────── */}
          <div className="flex-shrink-0 flex items-stretch bg-bg2 border-b border-white/[0.06]">
            {/* Scrollable filters */}
            <div className="flex items-end gap-2 px-4 py-2 overflow-x-auto flex-1 min-w-0">
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <span className="text-[8px] font-bold text-muted uppercase tracking-wider">Data Inicial</span>
                <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                  className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 w-[130px]"/>
              </div>
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <span className="text-[8px] font-bold text-muted uppercase tracking-wider">Data Final</span>
                <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                  className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 w-[130px]"/>
              </div>
              <div className="flex-shrink-0"><SelectFiltro label="Almoxarifado" value={filtAlmox} onChange={setFiltAlmox} options={almoxOpts} allLabel="Todos"/></div>
              <div className="flex-shrink-0"><SelectFiltro label="Classe" value={filtClasse} onChange={setFiltClasse} options={classeOpts} allLabel="Todas"/></div>
              <div className="flex-shrink-0"><SelectFiltro label="Fornecedor" value={filtForn} onChange={setFiltForn} options={fornOpts} allLabel="Todos"/></div>
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <span className="text-[8px] font-bold text-muted uppercase tracking-wider">Controlado</span>
                <select value={filtCtrl} onChange={e => setFiltCtrl(e.target.value)}
                  className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 w-[80px]">
                  <option value="">Todos</option>
                  <option value="S">Sim</option>
                  <option value="N">Não</option>
                </select>
              </div>
            </div>

            {/* Fixed action buttons — always visible */}
            <div className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 border-l border-white/[0.06]">
              {arquivoInfo && (
                <span className="hidden xl:flex items-center gap-1 text-[10px] text-muted/60 border border-white/[0.05] rounded px-2 py-1 max-w-[160px] truncate" title={arquivoInfo.arquivo}>
                  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {trunc(arquivoInfo.arquivo, 20)}
                </span>
              )}
              <button
                onClick={() => { setFiltAlmox(''); setFiltClasse(''); setFiltForn(''); setFiltCtrl('') }}
                className="px-2.5 py-1.5 rounded-md border border-border text-[11px] text-muted hover:text-dim hover:border-white/[0.15] transition whitespace-nowrap">
                Limpar
              </button>
              <button onClick={exportarCSV}
                className="px-2.5 py-1.5 rounded-md border border-border text-[11px] text-muted hover:text-dim hover:border-white/[0.15] transition flex items-center gap-1 whitespace-nowrap">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Exportar
              </button>
              <button
                onClick={() => { setFileLoaded(false); setRawData([]); setArquivoInfo(null); setFiltAlmox(''); setFiltClasse(''); setFiltForn(''); setFiltCtrl('') }}
                className="px-2.5 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold hover:bg-primary/20 transition flex items-center gap-1 whitespace-nowrap">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Nova Planilha
              </button>
            </div>
          </div>

          {/* ── Conteúdo ─────────────────────────────────────────── */}
          <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-4">

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <KpiCard label="Valor Total Entradas" value={fmtK(kpis.totalValor)} sub={`${fmtN(filtered.length)} registros`} color="text-primary"
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}/>
              <KpiCard label="Volume de NFs" value={fmtN(kpis.nfsUnicas)} sub={`Ticket médio: ${fmtK(kpis.ticketMedio)}`} color="text-teal-400"
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}/>
              <KpiCard label="Qtde Total Itens" value={fmtN(Math.round(kpis.totalQtde))} sub={`${fmtN(kpis.itens)} itens distintos`} color="text-blue-400"
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>}/>
              <KpiCard label="Registros de Entrada" value={fmtN(kpis.forns)} sub={`${fmtN(filtered.length)} entradas`} color="text-violet-400"
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}/>
              <KpiCard label="Preço Médio Unit." value={fmtR(kpis.precoMedio)} sub={`Sobre ${fmtN(Math.round(kpis.totalQtde))} unidades`} color="text-amber-400"
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>}/>
              <KpiCard label="Ticket Médio / NF" value={fmtK(kpis.ticketMedio)} sub={`${fmtN(kpis.nfsUnicas)} NFs no período`} color="text-rose-400"
                icon={<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>}/>
            </div>

            {filtered.length === 0 && (
              <div className="flex items-center justify-center h-32 text-sm text-muted/50">
                Nenhum registro para o período e filtros selecionados
              </div>
            )}

            {filtered.length > 0 && (<>

            {/* Row 1 — 2 colunas iguais */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

              <ChartCard title="Evolução Mensal de Valores"
                onExpand={() => setExpand('monthly')}
                lblOn={lbls.monthly} onLbl={() => togLbl('monthly')}>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={monthlyData} margin={{ top: 28, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="left" tickFormatter={fmtK} tick={{ fontSize: 9, fill: C.tick }} axisLine={false} tickLine={false} width={52}/>
                    <YAxis yAxisId="right" orientation="right" tickFormatter={fmtK} tick={{ fontSize: 9, fill: C.purple }} axisLine={false} tickLine={false} width={52}/>
                    <Tooltip content={<CTooltip/>}/>
                    <Bar yAxisId="left" dataKey="valor" name="Valor Mensal" fill="#6366f1" radius={[3,3,0,0]} maxBarSize={56}>
                      {lbls.monthly && <LabelList dataKey="valor" position="top" formatter={fmtK} style={{ fill: C.tick, fontSize: 9, fontWeight: 700 }}/>}
                    </Bar>
                    <Line yAxisId="left" dataKey="media" name="Média" stroke="#2dd4a0" strokeWidth={1.8} strokeDasharray="5 3" dot={{ r: 2.5, fill: '#2dd4a0' }} type="monotone"/>
                    <Line yAxisId="right" dataKey="acumulado" name="Acumulado" stroke={C.purple} strokeWidth={1.8} dot={{ r: 2.5, fill: C.purple }} type="monotone"/>
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="flex gap-5 justify-center mt-2">
                  {[['Valor Mensal','#6366f1'],['Média (running)','#2dd4a0'],['Acumulado',C.purple]].map(([n,c]) => (
                    <div key={n} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm" style={{ background: c }}/>
                      <span className="text-[10px] text-muted">{n}</span>
                    </div>
                  ))}
                </div>
              </ChartCard>

              <ChartCard title="Top 10 Classes por Valor" onExpand={() => setExpand('classes')} lblOn={lbls.classes} onLbl={() => togLbl('classes')}>
                <ResponsiveContainer width="100%" height={Math.max(220, classesChart.length * 26)}>
                  <BarChart data={classesChart} layout="vertical" barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
                    <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 9, fill: C.tick }} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" width={160} axisLine={false} tickLine={false} interval={0}
                      tick={({ x, y, payload }) => (
                        <g transform={`translate(${x},${y})`}>
                          <text x={0} y={0} textAnchor="end" fill={C.dim} fontSize={9} dominantBaseline="central">
                            {trunc(payload.value, 28)}
                          </text>
                        </g>
                      )}/>
                    <Tooltip content={<CTooltip/>}/>
                    <Bar dataKey="value" name="Valor" radius={[0,4,4,0]}>
                      {classesChart.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                      {lbls.classes && <LabelList dataKey="value" position="right" formatter={fmtK} style={{ fill: C.tick, fontSize: 9, fontWeight: 700 }}/>}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Row 2 — 2 colunas iguais */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

              <ChartCard title="Top 10 Fornecedores por Valor"
                onExpand={() => setExpand('forn')}
                lblOn={lbls.forn} onLbl={() => togLbl('forn')}>
                <ResponsiveContainer width="100%" height={Math.max(220, fornChart.length * 26)}>
                  <BarChart data={fornChart} layout="vertical" barCategoryGap="18%">
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
                    <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 9, fill: C.tick }} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" width={160} axisLine={false} tickLine={false} interval={0}
                      tick={({ x, y, payload }) => (
                        <g transform={`translate(${x},${y})`}>
                          <text x={0} y={0} textAnchor="end" fill={C.dim} fontSize={9} dominantBaseline="central">
                            {trunc(payload.value, 28)}
                          </text>
                        </g>
                      )}/>
                    <Tooltip content={<CTooltip/>}/>
                    <Bar dataKey="value" name="Valor" radius={[0,4,4,0]}>
                      {fornChart.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                      {lbls.forn && <LabelList dataKey="value" position="right" formatter={fmtK} style={{ fill: C.tick, fontSize: 9, fontWeight: 700 }}/>}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Distribuição por Almoxarifado" onExpand={() => setExpand('almox')}>
                <div className="flex items-center justify-center gap-8">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={almoxChart} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3} dataKey="value">
                        {almoxChart.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                      </Pie>
                      <Tooltip content={<CTooltip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-3 min-w-0">
                    {almoxChart.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CAT[i % CAT.length] }}/>
                        <span className="text-[11px] text-muted truncate flex-1" title={a.name}>{trunc(a.name, 28)}</span>
                        <span className="text-[11px] font-bold text-dim flex-shrink-0 ml-3">{fmtK(a.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </ChartCard>

            </div>

            {/* Stacked por classe */}
            {allClasses.length > 0 && (
              <ChartCard title="Evolução Mensal por Classe"
                onExpand={() => setExpand('stacked')}
                lblOn={lbls.stacked} onLbl={() => togLbl('stacked')}>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={stackedData} barCategoryGap="20%" margin={{ top: lbls.stacked ? 32 : 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false} width={60}/>
                    <Tooltip content={<CTooltip/>}/>
                    {allClasses.map((cls, i) => {
                      const isLast = i === allClasses.length - 1
                      const fill = CAT[i % CAT.length]
                      return (
                        <Bar key={cls} dataKey={cls} stackId="a" fill={fill} name={trunc(cls, 20)}
                          shape={isLast ? (props) => {
                            const { x, y, width, height, index } = props
                            const total = stackedData[index]?._total
                            const r = 3
                            return (
                              <g>
                                {height > 0.5 && (
                                  <path fill={fill}
                                    d={`M${x+r},${y} h${width-2*r} a${r},${r} 0 0 1 ${r},${r} v${height-r} h${-width} v${-(height-r)} a${r},${r} 0 0 1 ${r},${-r}z`}/>
                                )}
                                {lbls.stacked && total > 0 && (
                                  <text x={x+width/2} y={y-4} textAnchor="middle"
                                    fill={C.tick} fontSize={9} fontWeight={700}>
                                    {fmtK(total)}
                                  </text>
                                )}
                              </g>
                            )
                          } : undefined}
                        />
                      )
                    })}
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 justify-center mt-2">
                  {allClasses.map((cls, i) => (
                    <div key={cls} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: CAT[i % CAT.length] }}/>
                      <span className="text-[10px] text-muted">{trunc(cls, 22)}</span>
                    </div>
                  ))}
                </div>
              </ChartCard>
            )}

            {/* Tabela Classes ABC */}
            <div className="bg-bg2 rounded-2xl border border-white/[0.06] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.05]">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Detalhamento por Classe — Curva ABC</p>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead className="sticky top-0 bg-bg3 z-10">
                    <tr className="text-muted uppercase tracking-wide text-[9px] border-b border-white/[0.06]">
                      {['Classe','Valor Total','% do Total','% Acum.','Qtde Itens','Nº NFs','ABC','Representação'].map((h,i) => (
                        <th key={h} className={`px-3 py-2.5 font-bold whitespace-nowrap ${i===0?'text-left':'text-right'} ${i===6||i===7?'text-center':''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {classeABC.map((r, i) => (
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.025] transition-colors">
                        <td className="px-3 py-2 text-dim font-medium max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap" title={r.classe}>{r.classe}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-dim font-bold">{fmtR(r.valor)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{r.pct.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{r.acum.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{fmtN(Math.round(r.qtde))}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{fmtN(r.nfs)}</td>
                        <td className="px-3 py-2 text-center"><AbcTag abc={r.abc}/></td>
                        <td className="px-3 py-2">
                          <div className="w-full bg-bg3 rounded-full h-1.5 min-w-[60px]">
                            <div className="h-1.5 rounded-full bg-gradient-to-r from-primary to-blue-500"
                              style={{ width: `${classeABC[0]?.valor ? (r.valor/classeABC[0].valor*100).toFixed(1) : 0}%` }}/>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabela Itens ABC */}
            <div className="bg-bg2 rounded-2xl border border-white/[0.06] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Detalhamento por Item — Curva ABC</p>
                <input
                  type="text" value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                  placeholder="Buscar item..."
                  className="px-2.5 py-1.5 bg-bg3 border border-white/[0.06] rounded-lg text-xs text-dim outline-none focus:border-primary/30 w-52"/>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead className="sticky top-0 bg-bg3 z-10">
                    <tr className="text-muted uppercase tracking-wide text-[9px] border-b border-white/[0.06]">
                      {['Item','Classe','Valor Total','Qtde','Preço Médio','Entradas','ABC'].map((h,i) => (
                        <th key={h} className={`px-3 py-2.5 font-bold whitespace-nowrap ${i<=1?'text-left':'text-right'} ${i===6?'text-center':''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itemsFiltered.map((r, i) => (
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.025] transition-colors">
                        <td className="px-3 py-2 text-dim max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap" title={r.item}>{trunc(r.item,45)}</td>
                        <td className="px-3 py-2 text-muted max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">{trunc(r.classe,25)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-dim font-bold">{fmtR(r.valor)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{fmtN3(r.qtde)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{fmtR(r.precoMedio)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{r.entradas}</td>
                        <td className="px-3 py-2 text-center"><AbcTag abc={r.abc}/></td>
                      </tr>
                    ))}
                    {itemsFiltered.length === 0 && (
                      <tr><td colSpan={7} className="py-8 text-center text-muted/50">Nenhum item encontrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabela Fornecedores ABC */}
            <div className="bg-bg2 rounded-2xl border border-white/[0.06] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Detalhamento por Fornecedor</p>
                <input
                  type="text" value={fornSearch} onChange={e => setFornSearch(e.target.value)}
                  placeholder="Buscar fornecedor..."
                  className="px-2.5 py-1.5 bg-bg3 border border-white/[0.06] rounded-lg text-xs text-dim outline-none focus:border-primary/30 w-52"/>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead className="sticky top-0 bg-bg3 z-10">
                    <tr className="text-muted uppercase tracking-wide text-[9px] border-b border-white/[0.06]">
                      {['Fornecedor','Valor Total','Qtde','Nº NFs','Ticket Médio NF','ABC'].map((h,i) => (
                        <th key={h} className={`px-3 py-2.5 font-bold whitespace-nowrap ${i===0?'text-left':'text-right'} ${i===5?'text-center':''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fornsFiltered.map((r, i) => (
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.025] transition-colors">
                        <td className="px-3 py-2 text-dim max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap" title={r.forn}>{trunc(r.forn,45)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-dim font-bold">{fmtR(r.valor)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{fmtN3(r.qtde)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{fmtN(r.nfs)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{fmtR(r.ticketMedio)}</td>
                        <td className="px-3 py-2 text-center"><AbcTag abc={r.abc}/></td>
                      </tr>
                    ))}
                    {fornsFiltered.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-muted/50">Nenhum fornecedor encontrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            </>)}
          </div>
        </>
      )}

      </>}

      {/* ── Modais de Expansão ──────────────────────────────────────── */}
      {expand === 'monthly' && (
        <ExpandModal title="Evolução Mensal de Valores" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={440}>
            <ComposedChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="left" tickFormatter={fmtK} tick={{ fontSize: 11, fill: C.tick }} axisLine={false} tickLine={false} width={70}/>
              <YAxis yAxisId="right" orientation="right" tickFormatter={fmtK} tick={{ fontSize: 11, fill: C.purple }} axisLine={false} tickLine={false} width={70}/>
              <Tooltip content={<CTooltip/>}/>
              <Bar yAxisId="left" dataKey="valor" name="Valor Mensal" fill="#6366f1" radius={[4,4,0,0]}>
                <LabelList dataKey="valor" position="top" formatter={fmtK} style={{ fill: C.tick, fontSize: 11, fontWeight: 700 }}/>
              </Bar>
              <Line yAxisId="left" dataKey="media" name="Média" stroke="#2dd4a0" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 4, fill: '#2dd4a0' }} type="monotone"/>
              <Line yAxisId="right" dataKey="acumulado" name="Acumulado" stroke={C.purple} strokeWidth={2.5} dot={{ r: 4, fill: C.purple }} type="monotone"/>
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex gap-6 justify-center mt-3">
            {[['Valor Mensal','#6366f1'],['Média (running)','#2dd4a0'],['Acumulado',C.purple]].map(([n,c]) => (
              <div key={n} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }}/>
                <span className="text-xs text-muted">{n}</span>
              </div>
            ))}
          </div>
        </ExpandModal>
      )}

      {expand === 'almox' && (
        <ExpandModal title="Distribuição por Almoxarifado" onClose={() => setExpand(null)}>
          <div className="flex items-center justify-center gap-12 flex-1">
            <ResponsiveContainer width={280} height={280}>
              <PieChart>
                <Pie data={almoxChart} cx="50%" cy="50%" innerRadius={70} outerRadius={120} paddingAngle={3} dataKey="value"
                  label={({ name, percent }) => `${trunc(name,15)}: ${(percent*100).toFixed(1)}%`} labelLine>
                  {almoxChart.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                </Pie>
                <Tooltip content={<CTooltip/>}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-3">
              {almoxChart.map((a, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: CAT[i % CAT.length] }}/>
                  <span className="text-sm text-muted">{a.name}</span>
                  <span className="text-sm font-bold text-dim tabular-nums ml-2">{fmtR(a.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </ExpandModal>
      )}

      {expand === 'classes' && (
        <ExpandModal title="Top 10 Classes por Valor" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={Math.max(400, classesChart.length * 44)}>
            <BarChart data={classesChart} layout="vertical" barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
              <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: C.dim }} width={130}
                tickFormatter={v => trunc(v, 22)} axisLine={false} tickLine={false} interval={0}/>
              <Tooltip content={<CTooltip/>}/>
              <Bar dataKey="value" name="Valor" radius={[0,4,4,0]}>
                {classesChart.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                <LabelList dataKey="value" position="right" formatter={fmtK} style={{ fill: C.tick, fontSize: 11, fontWeight: 700 }}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ExpandModal>
      )}

      {expand === 'forn' && (
        <ExpandModal title="Top 10 Fornecedores por Valor" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={Math.max(400, fornChart.length * 44)}>
            <BarChart data={fornChart} layout="vertical" barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
              <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: C.dim }} width={140}
                tickFormatter={v => trunc(v, 24)} axisLine={false} tickLine={false} interval={0}/>
              <Tooltip content={<CTooltip/>}/>
              <Bar dataKey="value" name="Valor" radius={[0,4,4,0]}>
                {fornChart.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]}/>)}
                <LabelList dataKey="value" position="right" formatter={fmtK} style={{ fill: C.tick, fontSize: 11, fontWeight: 700 }}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ExpandModal>
      )}

      {expand === 'stacked' && (
        <ExpandModal title="Evolução Mensal por Classe" onClose={() => setExpand(null)}>
          <ResponsiveContainer width="100%" height={440}>
            <BarChart data={stackedData} barCategoryGap="20%" margin={{ top: 36, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: C.tick }} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: C.tick }} axisLine={false} tickLine={false} width={70}/>
              <Tooltip content={<CTooltip/>}/>
              {allClasses.map((cls, i) => {
                const isLast = i === allClasses.length - 1
                const fill = CAT[i % CAT.length]
                return (
                  <Bar key={cls} dataKey={cls} stackId="a" fill={fill} name={trunc(cls, 20)}
                    shape={isLast ? (props) => {
                      const { x, y, width, height, index } = props
                      const total = stackedData[index]?._total
                      const r = 4
                      return (
                        <g>
                          {height > 0.5 && (
                            <path fill={fill}
                              d={`M${x+r},${y} h${width-2*r} a${r},${r} 0 0 1 ${r},${r} v${height-r} h${-width} v${-(height-r)} a${r},${r} 0 0 1 ${r},${-r}z`}/>
                          )}
                          {total > 0 && (
                            <text x={x+width/2} y={y-5} textAnchor="middle"
                              fill={C.tick} fontSize={11} fontWeight={700}>
                              {fmtK(total)}
                            </text>
                          )}
                        </g>
                      )
                    } : undefined}
                  />
                )
              })}
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-4 justify-center mt-3">
            {allClasses.map((cls, i) => (
              <div key={cls} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: CAT[i % CAT.length] }}/>
                <span className="text-xs text-muted">{trunc(cls, 25)}</span>
              </div>
            ))}
          </div>
        </ExpandModal>
      )}

    </div>
  )
}
