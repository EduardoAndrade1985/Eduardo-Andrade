import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'
import api from '../services/api'
import { useTheme } from '../contexts/ThemeContext'

// ─── helpers ──────────────────────────────────────────────────────────────────
const num = v => (+(v) || 0).toLocaleString('pt-BR')
const cur = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
function curK(v) {
  const n = +(v) || 0
  if (Math.abs(n) >= 1_000_000) return `R$${(n/1_000_000).toFixed(1).replace('.',',')}M`
  if (Math.abs(n) >= 1_000)     return `R$${(n/1_000).toFixed(0)}k`
  return cur(n)
}
function fmtDt(s) {
  if (!s) return ''
  if (s.includes('-')) { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}` }
  return s
}
function fmtDtShort(s) {
  if (!s) return ''
  const [,m,d] = s.split('-')
  return `${d}/${m}`
}
function normDateXlsx(v) {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString().slice(0,10)
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10)
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) { const [d,m,y]=s.split('/'); return `${y}-${m}-${d}` }
  const n = Number(s)
  if (!isNaN(n) && n > 40000 && n < 60000) return new Date((n-25569)*86400000).toISOString().slice(0,10)
  return s.slice(0,10)
}
const mesAbr = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function fmtMesAbr(iso) {
  if (!iso) return ''
  const [,m,d] = iso.split('-')
  return `${d}/${mesAbr[(+m)-1]}`
}
function localISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
function todayISO()     { return localISO() }
function yesterdayISO() { const d=new Date(); d.setDate(d.getDate()-1); return localISO(d) }
function firstOfMonthISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return localISO(d)
}
function prevMonthRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const last  = new Date(now.getFullYear(), now.getMonth(), 0)
  return { data_ini: localISO(first), data_fim: localISO(last) }
}
const DIAS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
function diaSemana(iso) { return DIAS_PT[new Date(iso + 'T12:00:00').getDay()] }

// ─── Gauge SVG ────────────────────────────────────────────────────────────────
function GaugeChart({ pct = 0 }) {
  const r = 72, cx = 100, cy = 100
  const clamp = Math.min(Math.max(pct, 0), 100)
  const color = clamp >= 80 ? '#2dd4a0' : clamp >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <svg viewBox="0 0 200 110" className="w-full">
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
        fill="none" stroke="#1a2235" strokeWidth="18" strokeLinecap="round"/>
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
        fill="none" stroke={color} strokeWidth="18" strokeLinecap="round"
        pathLength="100" strokeDasharray={`${clamp} 100`}/>
      <text x={cx} y={cy-10} textAnchor="middle" fill={color} fontSize="28" fontWeight="700" fontFamily="inherit">
        {pct.toFixed(1)}%
      </text>
      <text x={cx} y={cy+10} textAnchor="middle" fill="#7a8fa8" fontSize="10" fontFamily="inherit" letterSpacing="2">
        OCUPADO
      </text>
    </svg>
  )
}

// ─── Painel Ocupação Hoje ─────────────────────────────────────────────────────
function OcupacaoHojePanel({ kpi }) {
  if (!kpi) return (
    <div className="flex items-center justify-center h-full text-xs text-muted">Sem dados para hoje</div>
  )
  const rows = [
    { label:'Taxa Ocup.', real:`${kpi.taxa.toFixed(2)}%`,                            trend:kpi.taxaTrend,    unit:' p.p.' },
    { label:'ADR (R$)',   real:`R$${Math.round(kpi.adr).toLocaleString('pt-BR')}`,   trend:kpi.adrTrend,     unit:'%' },
    { label:'RevPAR',     real:`R$${Math.round(kpi.revpar).toLocaleString('pt-BR')}`,trend:kpi.revparTrend,  unit:'%' },
    { label:'Rec. Dia',   real:curK(kpi.receita),                                    trend:kpi.receitaTrend, unit:'%' },
    { label:'Rec. MTD',   real:curK(kpi.mtdReceita),                                 trend:null },
  ]
  return (
    <div className="flex flex-col text-xs h-full">
      <div className="flex items-center justify-between px-3 pt-3 pb-1 flex-shrink-0">
        <span className="text-[11px] font-bold uppercase tracking-widest text-primary">Ocupação Hoje</span>
        <span className="text-[11px] text-muted font-semibold">{num(kpi.disp)} UHs</span>
      </div>
      <div className="px-4 py-0.5 flex-shrink-0">
        <GaugeChart pct={kpi.taxa}/>
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-3 pb-3 flex-shrink-0">
        {[
          {label:'Ocup.',    value:num(kpi.ocup),              color:'text-teal-400'},
          {label:'Livres',   value:num(kpi.livre>0?kpi.livre:0),color:'text-dim'},
          {label:'Check-in', value:num(kpi.checkIn),           color:'text-primary'},
          {label:'Check-out',value:num(kpi.checkOut),          color:'text-rose-400'},
        ].map(({label,value,color})=>(
          <div key={label} className="bg-bg3 rounded-xl p-2 text-center border border-white/[0.05]">
            <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-[10px] text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>
      <div className="mx-3 border-t border-white/[0.05] flex-shrink-0"/>
      <div className="px-3 pt-2 pb-2 overflow-auto flex-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">KPIs vs D-1</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">HOJE</span>
        </div>
        <div className="flex text-[10px] text-muted/50 font-semibold uppercase tracking-wider mb-1">
          <span className="flex-1">Indicador</span>
          <span className="w-16 text-right">Real</span>
          <span className="w-14 text-right">Var.</span>
        </div>
        {rows.map(({label,real,trend,unit})=>(
          <div key={label} className="flex items-center py-1 border-t border-white/[0.04]">
            <span className="flex-1 text-muted">{label}</span>
            <span className="w-16 text-right font-semibold text-dim tabular-nums">{real}</span>
            <span className="w-14 text-right flex items-center justify-end">
              {trend!=null&&trend!==undefined?<Trend value={trend} unit={unit}/>:<span className="text-muted/40">—</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Trend badge ──────────────────────────────────────────────────────────────
function Trend({ value, unit='%', invert=false }) {
  if (value===null||value===undefined||isNaN(value)) return null
  const up = invert?value<0:value>0
  if (Math.abs(value)<0.01) return <span className="text-[10px] text-muted tabular-nums">—</span>
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${up?'text-primary':'text-rose-400'}`}>
      {up
        ?<svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
        :<svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>}
      {Math.abs(value).toFixed(1)}{unit}
    </span>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const CARD_COLORS = {
  primary:{bg:'bg-primary/10',   icon:'text-primary',   border:'border-primary/20'   },
  teal:  {bg:'bg-teal-500/10',  icon:'text-teal-400',  border:'border-teal-500/20'  },
  blue:  {bg:'bg-blue-500/10',  icon:'text-blue-400',  border:'border-blue-500/20'  },
  amber: {bg:'bg-amber-500/10', icon:'text-amber-400', border:'border-amber-500/20' },
  rose:  {bg:'bg-rose-500/10',  icon:'text-rose-400',  border:'border-rose-500/20'  },
  violet:{bg:'bg-violet-500/10',icon:'text-violet-400',border:'border-violet-500/20'},
  green: {bg:'bg-emerald-500/10',icon:'text-emerald-400',border:'border-emerald-500/20'},
}
function KpiCard({ label, value, sub, trend, trendUnit='%', color='primary', icon }) {
  const c = CARD_COLORS[color]||CARD_COLORS.primary
  return (
    <div className={`rounded-2xl border ${c.border} bg-bg2 p-2.5 flex flex-col gap-1 min-w-0`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted truncate">{label}</span>
        {icon&&<div className={`flex-shrink-0 w-6 h-6 rounded-lg ${c.bg} flex items-center justify-center ${c.icon}`}>{icon}</div>}
      </div>
      <span className="text-lg font-bold text-dim tabular-nums leading-none">{value??'—'}</span>
      <div className="flex items-center justify-between gap-1 min-h-[14px]">
        <span className="text-[10px] text-muted truncate">{sub}</span>
        {trend!==undefined&&<Trend value={trend} unit={trendUnit}/>}
      </div>
    </div>
  )
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────
function CTooltip({ active, payload, label, fmt=v=>v }) {
  if (!active||!payload?.length) return null
  return (
    <div className="bg-bg3 border border-white/[0.08] rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p,i)=>(
        <p key={i} style={{color:p.color}} className="font-semibold">{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  )
}

// ─── Períodos ─────────────────────────────────────────────────────────────────
const PERIODOS = [
  {key:'hoje',  label:'Hoje'  },
  {key:'MTD',   label:'MTD'   },
  {key:'YTD',   label:'YTD'   },
  {key:'M-1',   label:'M-1'   },
  {key:'12M',   label:'12M'   },
  {key:'custom',label:'Custom'},
]

function periodoRange(key, cIni, cFim) {
  const hoje = todayISO()
  switch (key) {
    case 'hoje':   return { data_ini: hoje,                                data_fim: hoje }
    case 'MTD':    return { data_ini: firstOfMonthISO(),                    data_fim: hoje }
    case 'YTD':    return { data_ini: `${new Date().getFullYear()}-01-01`,  data_fim: hoje }
    case 'M-1':    return prevMonthRange()
    case '12M':    return { data_ini: addDays(hoje,-364),                   data_fim: hoje }
    case 'custom': return { data_ini: cIni||addDays(hoje,-29), data_fim: cFim||hoje }
    default:       return {}
  }
}

function pLabel(key, cIni, cFim) {
  if (key==='custom') return `${fmtDtShort(cIni)} → ${fmtDtShort(cFim)}`
  return PERIODOS.find(p=>p.key===key)?.label??key
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Ocupacao() {
  const { tema } = useTheme()
  const C = useMemo(()=>({
    grid: tema==='light'?'#e2e8f0':'#1e2535',
    tick: tema==='light'?'#475569':'#7a8fa8',
    l1:'#2dd4a0', l2:'#0ea5e9',
  }),[tema])

  const [periodo,   setPeriodo]   = useState('MTD')
  const [customIni, setCustomIni] = useState(addDays(todayISO(),-29))
  const [customFim, setCustomFim] = useState(addDays(todayISO(), 30))
  const [rotulos,   setRotulos]   = useState(false)

  const [dadosHoje,    setDadosHoje]    = useState(null)
  const [dadosOntem,   setDadosOntem]   = useState(null)
  const [dadosGrafico, setDadosGrafico] = useState([])
  const [carregandoHoje,    setCarregandoHoje]    = useState(true)
  const [carregandoGrafico, setCarregandoGrafico] = useState(true)

  const [importModal, setImportModal] = useState(false)
  const [fileUpload,  setFileUpload]  = useState(null)
  const [uploading,   setUploading]   = useState(false)
  const [uploadMsg,   setUploadMsg]   = useState('')
  const [substituir,  setSubstituir]  = useState(false)
  const [limparModal, setLimparModal] = useState(false)
  const [limpando,    setLimpando]    = useState(false)
  const fileRef = useRef()

  useEffect(()=>{
    if (document.getElementById('ocupacao-ticker-style')) return
    const s = document.createElement('style')
    s.id = 'ocupacao-ticker-style'
    s.textContent = `
      @keyframes tickerScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
      .ticker-track{animation:tickerScroll 40s linear infinite;}
      .ticker-track:hover{animation-play-state:paused;}
    `
    document.head.appendChild(s)
    return ()=>document.getElementById('ocupacao-ticker-style')?.remove()
  },[])

  const carregarHoje = useCallback(async()=>{
    setCarregandoHoje(true)
    try {
      const hoje=todayISO(),ontem=yesterdayISO()
      const [rH,rO]=await Promise.all([
        api.get('/ocupacao/',{params:{data_ini:hoje, data_fim:hoje}}),
        api.get('/ocupacao/',{params:{data_ini:ontem,data_fim:ontem}}),
      ])
      setDadosHoje( (Array.isArray(rH.data)?rH.data:[])[0]||null)
      setDadosOntem((Array.isArray(rO.data)?rO.data:[])[0]||null)
    } catch {}
    finally{setCarregandoHoje(false)}
  },[])

  const carregarGrafico = useCallback(async()=>{
    setCarregandoGrafico(true)
    try {
      const res=await api.get('/ocupacao/',{params:periodoRange(periodo,customIni,customFim)})
      setDadosGrafico(Array.isArray(res.data)?res.data:[])
    } catch{setDadosGrafico([])}
    finally{setCarregandoGrafico(false)}
  },[periodo,customIni,customFim])

  useEffect(()=>{carregarHoje()},   [carregarHoje])
  useEffect(()=>{carregarGrafico()},[carregarGrafico])

  useEffect(()=>{
    const t=setInterval(carregarHoje,60_000)
    return()=>clearInterval(t)
  },[carregarHoje])

  const kpi = useMemo(()=>{
    const h=dadosHoje,o=dadosOntem
    if (!h) return null
    const ocup=+h.ocup_n||0,disp=+h.uh_disp_venda||0,receita=+h.diaria_n||0,hosps=+h.hosp_n||0
    const taxa=disp>0?(ocup/disp)*100:0,adr=ocup>0?receita/ocup:0,revpar=disp>0?receita/disp:0
    const oOcup=o?+o.ocup_n||0:null,oDisp=o?+o.uh_disp_venda||0:null
    const oReceita=o?+o.diaria_n||0:null,oHosps=o?+o.hosp_n||0:null
    const oTaxa  =(oOcup!==null&&oDisp)?(oOcup/oDisp)*100:null
    const oAdr   =(oOcup!==null&&oOcup>0)?oReceita/oOcup:null
    const oRevpar=(oDisp!==null&&oDisp>0)?oReceita/oDisp:null
    const mtdReceita=dadosGrafico.filter(r=>r.data>=firstOfMonthISO()&&r.data<=todayISO()).reduce((s,r)=>s+(+r.diaria_n||0),0)
    return {
      taxa,taxaTrend:oTaxa!==null?taxa-oTaxa:null,
      ocup,ocupTrend:oOcup!==null?ocup-oOcup:null,
      disp,livre:disp-ocup,
      adr, adrTrend:  oAdr!==null&&oAdr>0?((adr-oAdr)/oAdr)*100:null,
      revpar,revparTrend:oRevpar!==null&&oRevpar>0?((revpar-oRevpar)/oRevpar)*100:null,
      receita,receitaTrend:oReceita!==null&&oReceita>0?((receita-oReceita)/oReceita)*100:null,
      hosps,hospsTrend:oHosps!==null?hosps-oHosps:null,
      mtdReceita,checkIn:+h.check_in||0,checkOut:+h.check_out||0,data:h.data,
    }
  },[dadosHoje,dadosOntem,dadosGrafico])

  const tickerItems = useMemo(()=>{
    if (!kpi) return []
    return [
      {label:'Taxa Ocup.', value:`${kpi.taxa.toFixed(1)}%`,                            color:'#2dd4a0'},
      {label:'UHs Ocup.',  value:num(kpi.ocup),                                         color:'#0ea5e9'},
      {label:'Livres',     value:num(kpi.livre>0?kpi.livre:0),                          color:'#7a8fa8'},
      {label:'ADR',        value:`R$${Math.round(kpi.adr).toLocaleString('pt-BR')}`,    color:'#f59e0b'},
      {label:'RevPAR',     value:`R$${Math.round(kpi.revpar).toLocaleString('pt-BR')}`, color:'#a78bfa'},
      {label:'Check-in',   value:num(kpi.checkIn),                                      color:'#2dd4a0'},
      {label:'Check-out',  value:num(kpi.checkOut),                                     color:'#ef4444'},
      {label:'Rec. Dia',   value:curK(kpi.receita),                                     color:'#10b981'},
      {label:'Rec. MTD',   value:curK(kpi.mtdReceita),                                  color:'#0ea5e9'},
      {label:'Hóspedes',   value:num(kpi.hosps),                                        color:'#7a8fa8'},
    ]
  },[kpi])

  const chartTrend = useMemo(()=>dadosGrafico.map(r=>{
    const ocup=+r.ocup_n||0,disp=+r.uh_disp_venda||0
    return {d:fmtMesAbr(r.data),taxa:disp>0?+((ocup/disp)*100).toFixed(2):0}
  }),[dadosGrafico])

  const chartADR = useMemo(()=>dadosGrafico.map(r=>{
    const ocup=+r.ocup_n||0,disp=+r.uh_disp_venda||0,rec=+r.diaria_n||0
    return {d:fmtMesAbr(r.data),adr:ocup>0?+(rec/ocup).toFixed(2):0,revpar:disp>0?+(rec/disp).toFixed(2):0}
  }),[dadosGrafico])

  const showLabels = rotulos && dadosGrafico.length <= 20

  async function importar() {
    if (!fileUpload) return
    setUploading(true);setUploadMsg('')
    try {
      const buf=await fileUpload.arrayBuffer()
      const wb=XLSX.read(buf,{type:'array',cellDates:true})
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:null})
      const registros=rows.map(r=>({...r,Data:normDateXlsx(r.Data||r.data)}))
      const res=await api.post('/ocupacao/importar/',{registros,substituir})
      const d=res.data
      setUploadMsg(`✓ ${d.criados} criados · ${d.atualizados} atualizados · ${d.ignorados} ignorados`)
      setTimeout(()=>{
        setImportModal(false);setFileUpload(null);setUploadMsg('')
        carregarHoje();carregarGrafico()
      },1800)
    } catch(e){setUploadMsg(e.response?.data?.erro||'Erro ao importar')}
    finally{setUploading(false)}
  }

  async function limpar() {
    setLimpando(true)
    try {
      await api.delete('/ocupacao/limpar/',{})
      setLimparModal(false);carregarHoje();carregarGrafico()
    } catch(e){alert(e.response?.data?.erro||'Erro ao limpar')}
    finally{setLimpando(false)}
  }

  function TickerSet({prefix}) {
    return tickerItems.map((item,i)=>(
      <span key={`${prefix}-${i}`} className="inline-flex items-center gap-1.5 px-4 whitespace-nowrap h-full">
        <span className="text-[10px] text-muted/70 font-medium">{item.label}</span>
        <span className="text-[11px] font-bold tabular-nums" style={{color:item.color}}>{item.value}</span>
        {i<tickerItems.length-1&&<span className="ml-2 text-border/60 text-[10px] select-none">·</span>}
      </span>
    ))
  }

  // ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── toolbar ───────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 bg-bg2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted font-semibold uppercase tracking-widest">Período</span>
          <div className="flex rounded-xl overflow-hidden border border-white/[0.07] text-xs">
            {PERIODOS.map(p=>(
              <button key={p.key} onClick={()=>setPeriodo(p.key)}
                className={`px-3 py-1.5 font-semibold transition-colors flex items-center gap-1 ${
                  periodo===p.key?'bg-primary/20 text-primary':'text-muted hover:text-dim'
                }`}>
                {p.key==='custom'&&(
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                )}
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {periodo==='custom'&&(
          <div className="flex items-center gap-1.5">
            <input type="date" value={customIni} onChange={e=>setCustomIni(e.target.value)}
              className="bg-bg3 border border-white/[0.07] rounded-lg px-2 py-1 text-xs text-dim focus:outline-none focus:border-primary/40"/>
            <span className="text-muted text-xs">→</span>
            <input type="date" value={customFim} onChange={e=>setCustomFim(e.target.value)}
              className="bg-bg3 border border-white/[0.07] rounded-lg px-2 py-1 text-xs text-dim focus:outline-none focus:border-primary/40"/>
          </div>
        )}
        <div className="flex-1"/>
        <button onClick={()=>setImportModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Importar Excel
        </button>
        <button onClick={()=>setLimparModal(true)}
          className="px-3 py-1.5 rounded-xl border border-rose-500/20 text-rose-400 text-xs font-semibold hover:bg-rose-500/10 transition-colors">
          Limpar dados
        </button>
      </div>

      {/* ── live ticker ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 relative flex items-stretch h-7 bg-bg3 border-b border-white/[0.05] overflow-hidden">
        <div className="flex-shrink-0 flex items-center gap-1.5 px-3 h-full bg-bg3 border-r border-white/[0.06] z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"/>
          <span className="text-[10px] font-black tracking-widest text-rose-400 select-none">LIVE</span>
        </div>
        <div className="absolute left-[72px] top-0 h-full w-8 z-[5] pointer-events-none bg-gradient-to-r from-bg3 to-transparent"/>
        <div className="flex-1 overflow-hidden flex items-center">
          {tickerItems.length>0?(
            <div className="ticker-track flex items-center h-full">
              <TickerSet prefix="a"/><TickerSet prefix="b"/>
            </div>
          ):<span className="text-[10px] text-muted/50 px-4">Sem dados</span>}
        </div>
        <div className="absolute right-0 top-0 h-full w-12 z-[5] pointer-events-none bg-gradient-to-l from-bg3 to-transparent"/>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 px-4 pt-2 pb-1.5">
        {carregandoHoje?(
          Array.from({length:7}).map((_,i)=>(
            <div key={i} className="rounded-2xl border border-white/[0.05] bg-bg2 p-2.5 h-20 animate-pulse"/>
          ))
        ):kpi?(<>
          <KpiCard label="Taxa Ocup." value={`${kpi.taxa.toFixed(2)}%`} sub={fmtDtShort(kpi.data)} trend={kpi.taxaTrend} trendUnit=" p.p." color="primary"
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>}/>
          <KpiCard label="UHs Ocup." value={num(kpi.ocup)} sub={`Livre: ${num(kpi.livre>0?kpi.livre:0)}`} trend={kpi.ocupTrend} trendUnit=" UH" color="teal"
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}/>
          <KpiCard label="ADR" value={`R$${Math.round(kpi.adr).toLocaleString('pt-BR')}`} sub="Diária média" trend={kpi.adrTrend} color="amber"
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}/>
          <KpiCard label="RevPAR" value={`R$${Math.round(kpi.revpar).toLocaleString('pt-BR')}`} sub="p/ UH disponível" trend={kpi.revparTrend} color="violet"
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}/>
          <KpiCard label="Receita Dia" value={curK(kpi.receita)} sub={fmtDtShort(kpi.data)} trend={kpi.receitaTrend} color="green"
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>}/>
          <KpiCard label="Receita MTD" value={curK(kpi.mtdReceita)} sub={`Acum. ${mesAbr[new Date().getMonth()]}`} color="blue"
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}/>
          <KpiCard label="Hóspedes" value={num(kpi.hosps)} sub={`In: ${num(kpi.checkIn)} · Out: ${num(kpi.checkOut)}`} trend={kpi.hospsTrend} trendUnit=" hósp." color="rose"
            icon={<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>}/>
        </>):(
          <div className="col-span-7 py-4 text-center text-xs text-muted">Sem dados para hoje</div>
        )}
      </div>

      {/* ── área principal: tabela | gráficos | painel ────────────── */}
      <div className="flex-1 min-h-0 flex gap-2 px-4 pb-3">

        {/* ── esquerda: tabela compacta ──────────────────────────── */}
        <div className="w-[248px] flex-shrink-0 flex flex-col bg-bg2 rounded-2xl border border-white/[0.06] overflow-hidden">

          {/* cabeçalho da tabela */}
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              {pLabel(periodo,customIni,customFim)}
            </span>
            <span className="text-[10px] text-muted">{dadosGrafico.length} dias</span>
          </div>

          {/* colunas fixas */}
          <div className="flex-shrink-0 flex text-[10px] text-muted/60 font-semibold uppercase tracking-wider border-b border-white/[0.04] px-2 py-1.5 bg-bg2">
            <span className="w-10">Data</span>
            <span className="w-8">Dia</span>
            <span className="flex-1">Ocup.</span>
            <span className="w-7 text-right">UHs</span>
            <span className="w-7 text-right">CI</span>
            <span className="w-7 text-right">CO</span>
          </div>

          {/* linhas com scroll */}
          <div className="flex-1 overflow-auto">
            {dadosGrafico.length===0?(
              <div className="flex items-center justify-center h-20 text-xs text-muted/50">
                {carregandoGrafico?'Carregando...':'Sem dados'}
              </div>
            ):dadosGrafico.map((r,i)=>{
              const ocup=+r.ocup_n||0,disp=+r.uh_disp_venda||0
              const taxa=disp>0?(ocup/disp)*100:0
              const isHoje=r.data===todayISO()
              const barColor=taxa>=80?'#2dd4a0':taxa>=60?'#f59e0b':'#ef4444'
              const taxaCls =taxa>=80?'text-teal-400':taxa>=60?'text-amber-400':'text-rose-400'
              return (
                <div key={r.id??i}
                  className={`flex items-center px-2 py-1 border-b border-white/[0.03] hover:bg-white/[0.025] transition-colors text-[11px] ${isHoje?'bg-primary/5':''}`}>
                  <span className="w-10 text-amber-400 font-semibold tabular-nums whitespace-nowrap">{fmtDtShort(r.data)}</span>
                  <span className="w-8 text-muted">{diaSemana(r.data)}</span>
                  <span className="flex-1 flex items-center gap-1">
                    <span className={`font-bold tabular-nums text-[10px] w-9 text-right ${taxaCls}`}>{taxa.toFixed(1)}%</span>
                    <div className="h-[3px] rounded-full bg-bg3 overflow-hidden flex-1">
                      <div className="h-full rounded-full" style={{width:`${taxa}%`,background:barColor}}/>
                    </div>
                  </span>
                  <span className="w-7 text-right text-dim tabular-nums">{num(ocup)}</span>
                  <span className="w-7 text-right text-teal-400 tabular-nums">{num(r.check_in)}</span>
                  <span className="w-7 text-right text-rose-400 tabular-nums">{num(r.check_out)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── centro: gráficos ───────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">

          {/* Taxa de Ocupação */}
          <div className="flex-1 min-h-0 bg-bg2 rounded-2xl border border-white/[0.06] p-3 flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Taxa de Ocupação (%)</p>
              <button onClick={()=>setRotulos(r=>!r)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition-colors ${
                  rotulos?'bg-primary/15 border-primary/25 text-primary':'border-white/[0.08] text-muted hover:text-dim'
                }`}>
                Rótulos
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {chartTrend.length>0?(
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartTrend} margin={{top:showLabels?16:4,right:8,bottom:0,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid}/>
                    <XAxis dataKey="d" tick={{fontSize:10,fill:C.tick}} interval="preserveStartEnd"/>
                    <YAxis tick={{fontSize:10,fill:C.tick}} domain={[0,100]} unit="%"/>
                    <Tooltip content={<CTooltip fmt={v=>`${v.toFixed(1)}%`}/>}/>
                    <Line type="monotone" dataKey="taxa" name="Taxa Ocup." stroke={C.l1} strokeWidth={2}
                      dot={rotulos?{r:2.5,fill:C.l1,strokeWidth:0}:false} activeDot={{r:4}}>
                      {showLabels&&<LabelList dataKey="taxa" position="top" style={{fontSize:9,fill:C.tick}} formatter={v=>`${v.toFixed(0)}%`}/>}
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              ):(
                <div className="flex items-center justify-center h-full text-xs text-muted/50">
                  {carregandoGrafico?'Carregando...':'Sem dados'}
                </div>
              )}
            </div>
          </div>

          {/* ADR e RevPAR */}
          <div className="flex-1 min-h-0 bg-bg2 rounded-2xl border border-white/[0.06] p-3 flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">ADR e RevPAR (R$)</p>
              <button onClick={()=>setRotulos(r=>!r)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition-colors ${
                  rotulos?'bg-primary/15 border-primary/25 text-primary':'border-white/[0.08] text-muted hover:text-dim'
                }`}>
                Rótulos
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {chartADR.length>0?(
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartADR} margin={{top:showLabels?16:4,right:8,bottom:0,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid}/>
                    <XAxis dataKey="d" tick={{fontSize:10,fill:C.tick}} interval="preserveStartEnd"/>
                    <YAxis tick={{fontSize:10,fill:C.tick}}/>
                    <Tooltip content={<CTooltip fmt={v=>cur(v)}/>}/>
                    <Line type="monotone" dataKey="adr" name="ADR" stroke={C.l1} strokeWidth={2}
                      dot={rotulos?{r:2.5,fill:C.l1,strokeWidth:0}:false} activeDot={{r:4}}>
                      {showLabels&&<LabelList dataKey="adr" position="top" style={{fontSize:9,fill:C.tick}} formatter={v=>curK(v)}/>}
                    </Line>
                    <Line type="monotone" dataKey="revpar" name="RevPAR" stroke={C.l2} strokeWidth={2}
                      dot={rotulos?{r:2.5,fill:C.l2,strokeWidth:0}:false} activeDot={{r:4}} strokeDasharray="4 2">
                      {showLabels&&<LabelList dataKey="revpar" position="bottom" style={{fontSize:9,fill:C.tick}} formatter={v=>curK(v)}/>}
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              ):(
                <div className="flex items-center justify-center h-full text-xs text-muted/50">
                  {carregandoGrafico?'Carregando...':'Sem dados'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── direita: painel hoje ───────────────────────────────── */}
        <div className="w-[240px] flex-shrink-0 bg-bg2 rounded-2xl border border-white/[0.06] overflow-hidden">
          <OcupacaoHojePanel kpi={kpi}/>
        </div>
      </div>

      {/* ── modal importar ────────────────────────────────────────── */}
      {importModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg2 border border-white/[0.08] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-bold text-dim mb-4">Importar Dados de Ocupação</h3>
            <label className="block mb-4 cursor-pointer">
              <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${fileUpload?'border-primary/40 bg-primary/5':'border-white/[0.08] hover:border-primary/30'}`}>
                <svg className="w-8 h-8 mx-auto mb-2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                {fileUpload?<p className="text-xs text-primary font-semibold">{fileUpload.name}</p>
                  :<p className="text-xs text-muted">Clique para selecionar<br/><span className="text-[10px]">.xlsx · .xls · .csv</span></p>}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>setFileUpload(e.target.files[0]||null)}/>
            </label>
            <label className="flex items-center gap-2 mb-4 cursor-pointer text-xs text-muted">
              <input type="checkbox" checked={substituir} onChange={e=>setSubstituir(e.target.checked)} className="rounded accent-primary"/>
              Substituir registros existentes
            </label>
            {uploadMsg&&<p className={`text-xs mb-3 font-semibold ${uploadMsg.startsWith('✓')?'text-primary':'text-rose-400'}`}>{uploadMsg}</p>}
            <div className="flex gap-2">
              <button onClick={()=>{setImportModal(false);setFileUpload(null);setUploadMsg('')}} className="flex-1 py-2 rounded-xl border border-white/[0.08] text-xs text-muted hover:text-dim">Cancelar</button>
              <button onClick={importar} disabled={!fileUpload||uploading} className="flex-1 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/30 disabled:opacity-40">{uploading?'Importando...':'Importar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── modal limpar ──────────────────────────────────────────── */}
      {limparModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg2 border border-white/[0.08] rounded-2xl p-6 w-full max-w-xs shadow-2xl">
            <h3 className="text-sm font-bold text-dim mb-2">Limpar dados</h3>
            <p className="text-xs text-muted mb-6">Isso apagará <strong className="text-rose-400">todos</strong> os registros desta empresa. Não há como desfazer.</p>
            <div className="flex gap-2">
              <button onClick={()=>setLimparModal(false)} className="flex-1 py-2 rounded-xl border border-white/[0.08] text-xs text-muted hover:text-dim">Cancelar</button>
              <button onClick={limpar} disabled={limpando} className="flex-1 py-2 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400 text-xs font-semibold hover:bg-rose-500/25 disabled:opacity-40">{limpando?'Limpando...':'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
