import { useState, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, LabelList,
} from 'recharts'
import { useTheme } from '../contexts/ThemeContext'

// ─── constantes ──────────────────────────────────────────────────────────────
const MESES_NOME = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_ABB  = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const ALM_COLORS = { Central: '#00d48a', Diversos: '#3b7eff', Manutenção: '#b07af9' }
const PALETTE    = ['#3b7eff','#f5a623','#00d48a','#ff4d6a','#b07af9','#06c8d9','#f97316','#e879f9']

// ─── helpers ──────────────────────────────────────────────────────────────────
const fN  = (v, d = 2) => (v == null || isNaN(v)) ? '—' : (+v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const fRk = v => { const n = Math.abs(+(v) || 0); if (n >= 1e6) return 'R$' + (+(v) / 1e6).toFixed(1).replace('.', ',') + 'M'; if (n >= 1e3) return 'R$' + Math.round(+(v) / 1e3).toLocaleString('pt-BR') + 'k'; return 'R$' + Math.round(+(v) || 0).toLocaleString('pt-BR') }
const fR  = v => 'R$ ' + Math.round(+(v) || 0).toLocaleString('pt-BR')

function gBadgeCls(g) {
  if (g >= 3) return 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400'
  if (g >= 2) return 'bg-blue-500/10 border border-blue-500/25 text-blue-400'
  if (g >= 1) return 'bg-amber-500/10 border border-amber-500/25 text-amber-400'
  if (g > 0)  return 'bg-slate-500/10 border border-slate-500/25 text-slate-400'
  return 'bg-rose-500/10 border border-rose-500/25 text-rose-400'
}
function gBarColor(g) {
  if (g >= 3) return '#10b981'
  if (g >= 2) return '#3b82f6'
  if (g >= 1) return '#f59e0b'
  if (g > 0)  return '#64748b'
  return '#ef4444'
}
function almBadgeCls(alm) {
  if (alm === 'Central')     return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (alm === 'Diversos')    return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  if (alm === 'Manutenção')  return 'bg-violet-500/10 text-violet-400 border-violet-500/20'
  return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
}

// ─── sub-components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'text-primary' }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-bg2 p-3 flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted truncate">{label}</span>
      <span className={`text-lg font-bold tabular-nums leading-none ${color}`}>{value}</span>
      <span className="text-[10px] text-muted/70 truncate">{sub}</span>
    </div>
  )
}

function ChartCard({ title, sub, children }) {
  return (
    <div className="bg-bg2 rounded-2xl border border-white/[0.06] p-4 hover:border-primary/10 transition">
      <div className="mb-3">
        <p className="text-xs font-semibold text-dim">{title}</p>
        {sub && <p className="text-[10px] text-muted/60 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

function GiroBadge({ g }) {
  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-semibold tabular-nums min-w-[52px] ${gBadgeCls(g)}`}>
      {fN(g, 2)}x
    </span>
  )
}

function GiroTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg3 border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl text-xs">
      {label && <p className="text-muted mb-1 font-mono">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.stroke }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' ? fN(p.value, 2) + 'x' : '—'}
        </p>
      ))}
    </div>
  )
}

function MovTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg3 border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl text-xs">
      {label && <p className="text-muted mb-1 font-mono">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.stroke }} className="font-semibold">
          {p.name}: {fR(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── parsing xlsx ─────────────────────────────────────────────────────────────
function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb  = XLSX.read(e.target.result, { type: 'binary' })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: 0, raw: true })
        if (!raw.length) throw new Error('Planilha vazia')

        const normKey = s => String(s).toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[\s_]+/g, '').trim()

        const keys     = Object.keys(raw[0])
        const normKeys = keys.map(normKey)

        const fc = terms => {
          for (const t of terms) { const i = normKeys.findIndex(k => k === t);          if (i >= 0) return keys[i] }
          for (const t of terms) { const i = normKeys.findIndex(k => k.startsWith(t));  if (i >= 0) return keys[i] }
          for (const t of terms) { const i = normKeys.findIndex(k => k.includes(t));    if (i >= 0) return keys[i] }
          return null
        }

        const cM  = fc(['mes', 'month', 'competencia'])
        const cA  = fc(['ano', 'year'])
        const cAl = fc(['almoxarifado', 'almox', 'alm', 'centrodecusto', 'cc', 'centro'])
        const cCl = fc(['classedescricao', 'classedesc', 'classe', 'class', 'grupo'])
        const cSI = fc(['saldoinicial', 'saldoini', 'inicial'])
        const cSF = fc(['saldofinal', 'saldofin', 'final'])
        const cSd = fc(['saidatransf', 'saidas', 'saida', 'pedido', 'consumo'])
        const cEn = fc(['entradanf', 'entrada', 'entradas'])

        if (!cAl || !cCl) throw new Error(
          'Colunas Almoxarifado/Classe não encontradas.\nColunas no arquivo: [' + keys.join(', ') + ']'
        )

        const mmMap = {
          jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
          jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
          janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
          julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
        }

        const toNum = v => {
          if (v === '' || v == null) return 0
          const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.,-]/g, '').replace(',', '.'))
          return isNaN(n) ? 0 : n
        }

        const agg = {}
        raw.forEach(row => {
          const almRaw = cAl ? (typeof row[cAl] === 'string' ? row[cAl].trim() : String(row[cAl]) || '') : ''
          const clsRaw = cCl ? (typeof row[cCl] === 'string' ? row[cCl].trim() : String(row[cCl]) || '') : ''
          if (!almRaw || !clsRaw || almRaw === '0' || clsRaw === '0') return

          let mn = 0
          if (cM) {
            const mVal = row[cM]
            if (typeof mVal === 'number') { mn = (mVal >= 1 && mVal <= 12) ? mVal : 0 }
            else {
              const mRaw = normKey(String(mVal))
              const asN  = parseInt(mRaw)
              mn = (asN >= 1 && asN <= 12) ? asN : (mmMap[mRaw] || mmMap[mRaw.slice(0, 3)] || 0)
            }
          }
          if (!mn) mn = 1
          const y = parseInt(cA ? row[cA] : 2026) || 2026

          const k = `${almRaw}||${clsRaw}||${mn}||${y}`
          if (!agg[k]) agg[k] = { alm: almRaw, cls: clsRaw, mn, y, si: 0, sf: 0, saidas: 0, ent: 0 }
          agg[k].si     += toNum(row[cSI])
          agg[k].sf     += toNum(row[cSF])
          agg[k].saidas += toNum(row[cSd])
          agg[k].ent    += toNum(row[cEn])
        })

        const parsed = Object.values(agg).map(r => {
          const em = (r.si + r.sf) / 2
          const g  = em > 0 ? +(r.saidas / em).toFixed(4) : 0
          return {
            m: MESES_NOME[r.mn] || 'Janeiro', mn: r.mn, y: r.y,
            alm: r.alm, cls: r.cls,
            si: +r.si.toFixed(2), sf: +r.sf.toFixed(2),
            saidas: +r.saidas.toFixed(2), ent: +r.ent.toFixed(2),
            em: +em.toFixed(2), g,
          }
        }).filter(r => r.alm && r.cls)

        if (!parsed.length) throw new Error('Nenhuma linha válida após agrupamento')
        resolve({ data: parsed, rows: raw.length })
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    reader.readAsBinaryString(file)
  })
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function GiroEstoque() {
  const { tema } = useTheme()
  const C = {
    grid: tema === 'light' ? '#e2e8f0' : '#1e2535',
    tick: tema === 'light' ? '#475569' : '#7a8fa8',
  }

  // ── dados ──────────────────────────────────────────────────────────────────
  const [rawData,    setRawData]    = useState([])
  const [fileLoaded, setFileLoaded] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [dragOver,   setDragOver]   = useState(false)
  const [fileName,   setFileName]   = useState('')
  const [parseMsg,   setParseMsg]   = useState('')
  const fileRef = useRef()

  // ── filtros ────────────────────────────────────────────────────────────────
  const [filtMesIni,  setFiltMesIni]  = useState('')
  const [filtMesFim,  setFiltMesFim]  = useState('')
  const [filtAlmox,   setFiltAlmox]   = useState('')
  const [filtClasse,  setFiltClasse]  = useState('')
  const [filtGiroMin, setFiltGiroMin] = useState('0')

  // ── tabela ─────────────────────────────────────────────────────────────────
  const [showVarPct, setShowVarPct] = useState(true)
  const [tblSearch,  setTblSearch]  = useState('')
  const [tblSortCol, setTblSortCol] = useState('g_avg')
  const [tblSortDir, setTblSortDir] = useState('desc')

  // ── upload ─────────────────────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return
    setLoading(true)
    setParseMsg('')
    try {
      const { data, rows } = await parseExcel(file)
      setRawData(data)
      setFileName(file.name)
      const meses = [...new Set(data.map(r => r.mn + '_' + r.y))].map(k => {
        const [mn, y] = k.split('_')
        return { mn: +mn, y: +y, key: k }
      }).sort((a, b) => a.y - b.y || a.mn - b.mn)
      if (meses.length) {
        setFiltMesIni(meses[0].key)
        setFiltMesFim(meses[meses.length - 1].key)
      }
      setParseMsg(`✓ ${file.name} — ${data.length} combinações / ${rows} linhas`)
      setFileLoaded(true)
    } catch (err) {
      setParseMsg('Erro: ' + err.message)
      alert('Erro ao processar arquivo:\n' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setFileLoaded(false); setRawData([]); setFileName(''); setParseMsg('')
    setFiltAlmox(''); setFiltClasse(''); setFiltGiroMin('0')
    setTblSearch(''); setTblSortCol('g_avg'); setTblSortDir('desc')
  }

  // ── meses disponíveis ──────────────────────────────────────────────────────
  const allMeses = useMemo(() => {
    const set = {}
    rawData.forEach(r => {
      const k = r.mn + '_' + r.y
      if (!set[k]) set[k] = { mn: r.mn, y: r.y, m: r.m, key: k }
    })
    return Object.values(set).sort((a, b) => a.y - b.y || a.mn - b.mn)
  }, [rawData])

  const activeMeses = useMemo(() => {
    if (!allMeses.length) return allMeses
    const pk = k => { if (!k) return null; const [mn, y] = k.split('_'); return +y * 12 + (+mn) }
    const ini = pk(filtMesIni) || pk(allMeses[0]?.key)
    const fim = pk(filtMesFim) || pk(allMeses[allMeses.length - 1]?.key)
    return allMeses.filter(x => x.y * 12 + x.mn >= ini && x.y * 12 + x.mn <= fim)
  }, [allMeses, filtMesIni, filtMesFim])

  const activeKeys = useMemo(() => new Set(activeMeses.map(x => x.mn + '_' + x.y)), [activeMeses])

  const almoxOpts  = useMemo(() => [...new Set(rawData.map(r => r.alm))].filter(Boolean).sort(), [rawData])
  const classeOpts = useMemo(() => [...new Set(rawData.map(r => r.cls))].filter(Boolean).sort(), [rawData])

  // ── dados filtrados ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const gMin = +filtGiroMin || 0
    return rawData.filter(r => {
      if (!activeKeys.has(r.mn + '_' + r.y)) return false
      if (filtAlmox  && r.alm !== filtAlmox)  return false
      if (filtClasse && r.cls !== filtClasse) return false
      if (gMin > 0   && r.g < gMin)          return false
      return true
    })
  }, [rawData, activeKeys, filtAlmox, filtClasse, filtGiroMin])

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const saidas = filtered.reduce((a, r) => a + r.saidas, 0)
    const em     = filtered.reduce((a, r) => a + r.em,     0)
    const ent    = filtered.reduce((a, r) => a + r.ent,    0)
    const g      = em > 0 ? saidas / em : 0
    const maxG   = filtered.reduce((a, r) => r.g > a ? r.g : a, 0)
    const topR   = filtered.reduce((a, r) => r.g > a.g ? r : a, { g: 0, cls: '—' })
    return { saidas, em, ent, g, maxG, topCls: topR.cls }
  }, [filtered])

  // ── ch5: evolução giro por almoxarifado (linha) ────────────────────────────
  const ch5Data = useMemo(() => {
    const almList  = filtAlmox ? [filtAlmox] : Object.keys(ALM_COLORS)
    const allPeriod = rawData.filter(r => activeKeys.has(r.mn + '_' + r.y))
    return activeMeses.map(x => {
      const row    = { mes: MESES_ABB[x.mn] + '/' + String(x.y).slice(2) }
      const period = allPeriod.filter(r => r.mn === x.mn && r.y === x.y)
      almList.forEach(alm => {
        const rows = period.filter(r => r.alm === alm)
        const s = rows.reduce((a, r) => a + r.saidas, 0)
        const e = rows.reduce((a, r) => a + r.em, 0)
        row[alm] = e > 0 ? +(s / e).toFixed(3) : 0
      })
      if (!filtAlmox) {
        const s = period.reduce((a, r) => a + r.saidas, 0)
        const e = period.reduce((a, r) => a + r.em, 0)
        row['Total Geral'] = e > 0 ? +(s / e).toFixed(3) : 0
      }
      return row
    })
  }, [rawData, activeMeses, activeKeys, filtAlmox])

  // ── ch2: giro por classe (barra horizontal) ────────────────────────────────
  const ch2Data = useMemo(() => {
    const byCls = {}
    filtered.forEach(r => {
      if (!byCls[r.cls]) byCls[r.cls] = { s: 0, em: 0 }
      byCls[r.cls].s  += r.saidas
      byCls[r.cls].em += r.em
    })
    return Object.entries(byCls)
      .map(([cls, v]) => ({ cls: cls.length > 30 ? cls.slice(0, 29) + '…' : cls, g: v.em > 0 ? +(v.s / v.em).toFixed(3) : 0 }))
      .sort((a, b) => b.g - a.g)
      .slice(0, 12)
  }, [filtered])

  // ── ch3: movimentação empilhada (top 6 classes) ────────────────────────────
  const ch3Data = useMemo(() => {
    const totCls = {}
    filtered.forEach(r => { totCls[r.cls] = (totCls[r.cls] || 0) + r.saidas })
    const top6 = Object.entries(totCls).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c)
    const rows = activeMeses.map(x => {
      const row = { mes: MESES_ABB[x.mn] + '/' + String(x.y).slice(2) }
      top6.forEach(cls => {
        const r = filtered.filter(r => r.mn === x.mn && r.y === x.y && r.cls === cls)
        row[cls] = r.reduce((a, r) => a + r.saidas, 0)
      })
      return row
    })
    return { labels: top6, rows }
  }, [filtered, activeMeses])

  // ── ch4: evolução giro top classes (linha) ─────────────────────────────────
  const ch4Data = useMemo(() => {
    const clsGiro = {}
    filtered.forEach(r => { if (!clsGiro[r.cls]) clsGiro[r.cls] = []; clsGiro[r.cls].push(r.g) })
    const top6 = Object.entries(clsGiro)
      .map(([c, gs]) => ({ c, avg: gs.reduce((a, v) => a + v, 0) / gs.length }))
      .filter(x => x.avg > 0.3)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 6)
      .map(x => x.c)
    const rows = activeMeses.map(x => {
      const row = { mes: MESES_ABB[x.mn] + '/' + String(x.y).slice(2) }
      top6.forEach(cls => {
        const rows = filtered.filter(r => r.mn === x.mn && r.y === x.y && r.cls === cls)
        if (!rows.length) { row[cls] = null; return }
        const s = rows.reduce((a, r) => a + r.saidas, 0)
        const e = rows.reduce((a, r) => a + r.em, 0)
        row[cls] = e > 0 ? +(s / e).toFixed(3) : null
      })
      return row
    })
    return { labels: top6, rows }
  }, [filtered, activeMeses])

  // ── ch1: movimentação por almoxarifado (linha) ─────────────────────────────
  const ch1Data = useMemo(() => {
    const almList = filtAlmox ? [filtAlmox] : Object.keys(ALM_COLORS)
    return activeMeses.map(x => {
      const row = { mes: MESES_ABB[x.mn] + '/' + String(x.y).slice(2) }
      const all = rawData.filter(r => r.mn === x.mn && r.y === x.y)
      almList.forEach(alm => { row[alm] = all.filter(r => r.alm === alm).reduce((a, r) => a + r.saidas, 0) })
      if (!filtAlmox) row['Total Geral'] = all.reduce((a, r) => a + r.saidas, 0)
      return row
    })
  }, [rawData, activeMeses, filtAlmox])

  // ── tabela pivot ───────────────────────────────────────────────────────────
  const tblRows = useMemo(() => {
    const piv = {}
    filtered.forEach(r => {
      const k = r.cls + '||' + r.alm
      if (!piv[k]) piv[k] = { cls: r.cls, alm: r.alm, mo: {} }
      piv[k].mo[r.mn + '_' + r.y] = r
    })
    let rows = Object.values(piv)
    if (tblSearch) {
      const s = tblSearch.toLowerCase()
      rows = rows.filter(r => r.cls.toLowerCase().includes(s) || r.alm.toLowerCase().includes(s))
    }
    rows = rows.map(r => {
      const gs  = activeMeses.map(x => (r.mo[x.mn + '_' + x.y] || { g: null }).g).filter(g => g !== null && g > 0)
      r.g_avg   = gs.length ? gs.reduce((a, v) => a + v, 0) / gs.length : 0
      r.g_max   = Math.max(...activeMeses.map(x => (r.mo[x.mn + '_' + x.y] || { g: 0 }).g), 0)
      return r
    })
    const mult = tblSortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const av = a[tblSortCol] ?? '', bv = b[tblSortCol] ?? ''
      return typeof av === 'string' ? av.localeCompare(bv, 'pt-BR') * mult : (av - bv) * mult
    })
    return rows
  }, [filtered, activeMeses, tblSearch, tblSortCol, tblSortDir])

  const tblMaxG = useMemo(() => Math.max(...tblRows.map(r => r.g_max), 0.01), [tblRows])

  function sortTbl(col) {
    setTblSortDir(tblSortCol === col ? (tblSortDir === 'asc' ? 'desc' : 'asc') : (col === 'cls' || col === 'alm' ? 'asc' : 'desc'))
    setTblSortCol(col)
  }

  function resetFilters() {
    setFiltAlmox(''); setFiltClasse(''); setFiltGiroMin('0')
    if (allMeses.length) { setFiltMesIni(allMeses[0].key); setFiltMesFim(allMeses[allMeses.length - 1].key) }
  }

  const almList = filtAlmox ? [filtAlmox] : Object.keys(ALM_COLORS)

  // ── upload zone ────────────────────────────────────────────────────────────
  if (!fileLoaded) {
    return (
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
            {loading
              ? <svg className="w-7 h-7 text-primary animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              : <svg className="w-7 h-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
            }
          </div>
          <p className="font-bold text-dim text-base mb-2">
            {loading ? 'Processando…' : 'Importar Planilha de Giro de Estoque'}
          </p>
          <p className="text-sm text-muted/70 leading-relaxed">
            Arraste e solte o arquivo aqui<br />ou clique para selecionar
          </p>
          <p className="text-[10px] text-muted/50 mt-3 leading-relaxed">
            Colunas esperadas: Mês · Ano · Almoxarifado · Classe<br />
            Saldo_Inicial · Saldo_Final · Saida_Transf · Entrada_NF
          </p>
          <div className="flex gap-2 justify-center mt-5">
            {['.xlsx', '.xls'].map(f => (
              <span key={f} className="text-[10px] px-2.5 py-1 bg-bg3 rounded-lg text-muted font-mono border border-white/[0.05]">{f}</span>
            ))}
          </div>
          {parseMsg && !loading && (
            <p className="mt-3 text-[11px] font-mono text-rose-400">{parseMsg}</p>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
      </div>
    )
  }

  // ── dashboard ──────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-stretch bg-bg2 border-b border-white/[0.06]">
        <div className="flex items-end gap-2 px-4 py-2 overflow-x-auto flex-1 min-w-0">

          {/* Período */}
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <span className="text-[8px] font-bold text-muted uppercase tracking-wider">De</span>
            <select value={filtMesIni} onChange={e => setFiltMesIni(e.target.value)}
              className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 min-w-[80px]">
              {allMeses.map(x => <option key={x.key} value={x.key}>{MESES_ABB[x.mn]}/{String(x.y).slice(2)}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <span className="text-[8px] font-bold text-muted uppercase tracking-wider">Até</span>
            <select value={filtMesFim} onChange={e => setFiltMesFim(e.target.value)}
              className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 min-w-[80px]">
              {allMeses.map(x => <option key={x.key} value={x.key}>{MESES_ABB[x.mn]}/{String(x.y).slice(2)}</option>)}
            </select>
          </div>

          {/* Almoxarifado */}
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <span className="text-[8px] font-bold text-muted uppercase tracking-wider">Almoxarifado</span>
            <select value={filtAlmox} onChange={e => setFiltAlmox(e.target.value)}
              className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 min-w-[120px]">
              <option value="">Todos</option>
              {almoxOpts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Classe */}
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <span className="text-[8px] font-bold text-muted uppercase tracking-wider">Classe</span>
            <select value={filtClasse} onChange={e => setFiltClasse(e.target.value)}
              className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 min-w-[160px] max-w-[200px]">
              <option value="">Todas</option>
              {classeOpts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Giro mínimo */}
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <span className="text-[8px] font-bold text-muted uppercase tracking-wider">Giro Mín.</span>
            <select value={filtGiroMin} onChange={e => setFiltGiroMin(e.target.value)}
              className="px-1.5 py-1 bg-bg3 border border-white/[0.06] rounded-md text-[11px] text-dim outline-none focus:border-primary/30 min-w-[80px]">
              <option value="0">Todos</option>
              <option value="0.5">≥ 0.5x</option>
              <option value="1">≥ 1.0x</option>
              <option value="2">≥ 2.0x</option>
              <option value="3">≥ 3.0x</option>
            </select>
          </div>
        </div>

        {/* Botões fixos */}
        <div className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 border-l border-white/[0.06]">
          {fileName && (
            <span className="hidden xl:flex items-center gap-1 text-[10px] text-muted/60 border border-white/[0.05] rounded px-2 py-1 max-w-[160px] truncate" title={fileName}>
              <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {fileName.length > 18 ? fileName.slice(0, 17) + '…' : fileName}
            </span>
          )}
          <button onClick={resetFilters}
            className="px-2.5 py-1.5 rounded-md border border-border text-[11px] text-muted hover:text-dim hover:border-white/[0.15] transition whitespace-nowrap">
            Limpar
          </button>
          <button onClick={reset}
            className="px-2.5 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold hover:bg-primary/20 transition flex items-center gap-1 whitespace-nowrap">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Nova Planilha
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-4">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <KpiCard label="Giro Consolidado"  value={fN(kpis.g, 2) + 'x'}   sub="Saídas / Est. Médio"   color="text-primary"/>
          <KpiCard label="Total Saídas"       value={fRk(kpis.saidas)}        sub="Consumo no período"    color="text-teal-400"/>
          <KpiCard label="Estoque Médio"      value={fRk(kpis.em)}            sub="Posição média"         color="text-blue-400"/>
          <KpiCard label="Total Entradas"     value={fRk(kpis.ent)}           sub="Reposição"             color="text-violet-400"/>
          <KpiCard label="Maior Giro"         value={fN(kpis.maxG, 2) + 'x'} sub={kpis.topCls.split('/')[0]?.trim()?.slice(0, 22) || '—'} color="text-amber-400"/>
        </div>

        {/* Linha 1: Evolução Giro Almox + Giro por Classe */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Ch5 — Evolução Giro por Almoxarifado */}
          <ChartCard title="Evolução Giro por Almoxarifado" sub="Giro mensal · Central · Diversos · Manutenção">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={ch5Data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="mes" tick={{ fill: C.tick, fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: C.tick, fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => fN(v, 1) + 'x'} />
                <Tooltip content={<GiroTooltip />} />
                {almList.map(alm => (
                  <Line key={alm} type="monotone" dataKey={alm} name={alm}
                    stroke={ALM_COLORS[alm] || PALETTE[0]} strokeWidth={2.5}
                    dot={{ fill: ALM_COLORS[alm] || PALETTE[0], r: 4, strokeWidth: 2, stroke: '#0c0e13' }}
                    activeDot={{ r: 6 }} connectNulls />
                ))}
                {!filtAlmox && (
                  <Line type="monotone" dataKey="Total Geral" name="Total Geral"
                    stroke="#f5a623" strokeWidth={2.5} strokeDasharray="6 3"
                    dot={{ fill: '#f5a623', r: 4, strokeWidth: 2, stroke: '#0c0e13' }}
                    activeDot={{ r: 6 }} connectNulls />
                )}
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} iconType="circle" iconSize={8} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Ch2 — Giro por Classe (barra horizontal) */}
          <ChartCard title="Giro por Classe" sub="Comparativo entre classes (período selecionado)">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ch2Data} layout="vertical" margin={{ top: 4, right: 52, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis type="number" tick={{ fill: C.tick, fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => fN(v, 1) + 'x'} />
                <YAxis type="category" dataKey="cls" tick={{ fill: '#cdd5e2', fontSize: 11, fontFamily: 'Outfit' }} tickLine={false} axisLine={false} width={140} />
                <Tooltip content={<GiroTooltip />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                <Bar dataKey="g" name="Giro" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {ch2Data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  <LabelList dataKey="g" position="right" style={{ fill: C.tick, fontSize: 10, fontFamily: 'monospace' }} formatter={v => fN(v, 2) + 'x'} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Linha 2: Movimentação Empilhada + Evolução Giro Top Classes */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Ch3 — Movimentação Empilhada */}
          <ChartCard title="Movimentação por Mês e Classe" sub="Saída_Transf — top classes">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ch3Data.rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: C.tick, fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: C.tick, fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => fRk(v)} />
                <Tooltip content={<MovTooltip />} />
                {ch3Data.labels.map((cls, i) => (
                  <Bar key={cls} dataKey={cls} name={cls.length > 16 ? cls.slice(0, 15) + '…' : cls}
                    stackId="a" fill={PALETTE[i % PALETTE.length] + 'cc'}
                    radius={i === ch3Data.labels.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                ))}
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} iconType="square" iconSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Ch4 — Evolução Giro Top Classes */}
          <ChartCard title="Evolução Giro — Top Classes" sub="Tendência mês a mês das principais classes">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={ch4Data.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="mes" tick={{ fill: C.tick, fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: C.tick, fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => fN(v, 1) + 'x'} />
                <Tooltip content={<GiroTooltip />} />
                {ch4Data.labels.map((cls, i) => (
                  <Line key={cls} type="monotone" dataKey={cls} name={cls.length > 16 ? cls.slice(0, 15) + '…' : cls}
                    stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} connectNulls
                    dot={{ fill: PALETTE[i % PALETTE.length], r: 4, strokeWidth: 2, stroke: '#0c0e13' }}
                    activeDot={{ r: 6 }} />
                ))}
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} iconType="circle" iconSize={8} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Ch1 — Movimentação por Almoxarifado (full width) */}
        <ChartCard title="Movimentação por Almoxarifado" sub="Saída_Transf mensal · Central · Diversos · Manutenção">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={ch1Data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="mes" tick={{ fill: C.tick, fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: C.tick, fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => fRk(v)} />
              <Tooltip content={<MovTooltip />} />
              {almList.map(alm => (
                <Line key={alm} type="monotone" dataKey={alm} name={alm}
                  stroke={ALM_COLORS[alm] || PALETTE[0]} strokeWidth={2.5}
                  dot={{ fill: ALM_COLORS[alm] || PALETTE[0], r: 4, strokeWidth: 2, stroke: '#0c0e13' }}
                  activeDot={{ r: 6 }} connectNulls />
              ))}
              {!filtAlmox && (
                <Line type="monotone" dataKey="Total Geral" name="Total Geral"
                  stroke="#f5a623" strokeWidth={2.5} strokeDasharray="6 3"
                  dot={{ fill: '#f5a623', r: 4, strokeWidth: 2, stroke: '#0c0e13' }}
                  activeDot={{ r: 6 }} connectNulls />
              )}
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} iconType="circle" iconSize={8} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Tabela */}
        <div className="bg-bg2 rounded-2xl border border-white/[0.06] overflow-hidden">

          {/* Cabeçalho da tabela */}
          <div className="flex items-center px-4 py-2.5 border-b border-white/[0.06] gap-3">
            <p className="text-xs font-semibold text-dim">Giro de Estoque por Classe e Mês</p>
            <span className="text-[10px] font-mono text-muted bg-bg3 border border-white/[0.05] px-2 py-0.5 rounded">
              {tblRows.length} classe{tblRows.length !== 1 ? 's' : ''} · {activeMeses.length} {activeMeses.length === 1 ? 'mês' : 'meses'}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
                <input type="checkbox" checked={showVarPct} onChange={e => setShowVarPct(e.target.checked)} className="accent-teal-500 w-3 h-3" />
                Variação %
              </label>
              <div className="flex items-center gap-1.5 bg-bg3 border border-white/[0.06] rounded-md px-2 py-1">
                <svg className="w-3 h-3 text-muted/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={tblSearch} onChange={e => setTblSearch(e.target.value)} placeholder="Buscar classe…"
                  className="bg-transparent border-none outline-none text-[11px] text-dim placeholder:text-muted/50 w-28" />
              </div>
            </div>
          </div>

          {/* Tabela */}
          <div className="overflow-auto max-h-[480px]">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="sticky top-0 z-10">
                  <th onClick={() => sortTbl('cls')}
                    className="sticky left-0 z-20 bg-bg3 px-3 py-2 text-left font-mono text-[9px] uppercase tracking-wider text-muted border-b border-r border-white/[0.06] cursor-pointer hover:text-dim whitespace-nowrap"
                    style={{ minWidth: 200 }}>
                    Classe {tblSortCol === 'cls' ? (tblSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => sortTbl('alm')}
                    className="sticky z-20 bg-bg3 px-3 py-2 text-left font-mono text-[9px] uppercase tracking-wider text-muted border-b border-r border-white/[0.06] cursor-pointer hover:text-dim whitespace-nowrap"
                    style={{ left: 200, minWidth: 110 }}>
                    Almox {tblSortCol === 'alm' ? (tblSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  {activeMeses.map((x, i) => (
                    <th key={x.key} colSpan={showVarPct && i > 0 ? 2 : 1}
                      className="bg-bg3 px-3 py-2 text-right font-mono text-[9px] uppercase tracking-wider text-muted border-b border-l border-white/[0.06] whitespace-nowrap">
                      {MESES_ABB[x.mn]}/{String(x.y).slice(2)}
                    </th>
                  ))}
                  <th onClick={() => sortTbl('g_avg')}
                    className="bg-bg3 px-3 py-2 text-right font-mono text-[9px] uppercase tracking-wider text-muted border-b border-l-2 border-white/[0.12] cursor-pointer hover:text-dim whitespace-nowrap">
                    Giro Méd {tblSortCol === 'g_avg' ? (tblSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th onClick={() => sortTbl('g_max')}
                    className="bg-bg3 px-3 py-2 text-right font-mono text-[9px] uppercase tracking-wider text-muted border-b border-white/[0.06] cursor-pointer hover:text-dim whitespace-nowrap">
                    Giro Máx {tblSortCol === 'g_max' ? (tblSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tblRows.length === 0 && (
                  <tr>
                    <td colSpan={999} className="text-center py-10 text-muted/50">
                      Nenhum resultado. Ajuste os filtros.
                    </td>
                  </tr>
                )}
                {tblRows.map((row, ri) => {
                  const pct = Math.round(row.g_avg / tblMaxG * 100)
                  return (
                    <tr key={ri} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="sticky left-0 bg-bg2 px-3 py-2 border-r border-white/[0.05] whitespace-nowrap" style={{ minWidth: 200 }}>
                        {row.cls.length > 34 ? row.cls.slice(0, 33) + '…' : row.cls}
                      </td>
                      <td className="sticky bg-bg2 px-3 py-2 border-r border-white/[0.05]" style={{ left: 200, minWidth: 110 }}>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${almBadgeCls(row.alm)}`}>
                          {row.alm}
                        </span>
                      </td>
                      {activeMeses.map((x, idx) => {
                        const dd   = row.mo[x.mn + '_' + x.y]
                        const prev = idx > 0 ? row.mo[activeMeses[idx - 1].mn + '_' + activeMeses[idx - 1].y] : null
                        const g    = dd?.g ?? null
                        const pg   = prev?.g ?? null
                        const hasDelta  = showVarPct && idx > 0 && g !== null && pg !== null && pg > 0
                        const pctDelta  = hasDelta ? ((g - pg) / pg) * 100 : null
                        return [
                          <td key={x.key} className="px-3 py-2 text-right border-l border-white/[0.04] whitespace-nowrap">
                            {g !== null
                              ? <GiroBadge g={g} />
                              : <span className="text-muted/40 font-mono text-[11px]">—</span>}
                          </td>,
                          showVarPct && idx > 0 && (
                            <td key={x.key + '_d'} className="px-2 py-2 text-right whitespace-nowrap w-[52px]">
                              {pctDelta !== null && Math.abs(pctDelta) > 0.5 && (
                                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${pctDelta > 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                                  {pctDelta > 0 ? '▲' : '▼'}{Math.abs(pctDelta).toFixed(1)}%
                                </span>
                              )}
                            </td>
                          ),
                        ]
                      })}
                      {/* Giro Médio */}
                      <td className="px-3 py-2 text-right border-l-2 border-white/[0.08] whitespace-nowrap" style={{ minWidth: 100 }}>
                        <GiroBadge g={row.g_avg} />
                        <div className="h-[3px] rounded-full bg-white/[0.06] mt-1.5 w-full" style={{ minWidth: 52 }}>
                          <div className="h-full rounded-full" style={{ width: pct + '%', background: gBarColor(row.g_avg) }} />
                        </div>
                      </td>
                      {/* Giro Máx */}
                      <td className="px-3 py-2 text-right whitespace-nowrap font-mono text-muted">
                        {fN(row.g_max, 2)}x
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  )
}
