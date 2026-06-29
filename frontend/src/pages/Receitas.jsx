import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useEmpresa } from '../contexts/EmpresaContext'
import { useTheme } from '../contexts/ThemeContext'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { SkeletonReceitas } from '../components/Skeleton'
import { getCached, setCached, invalidateCache } from '../services/dataCache'
import {
  BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import api from '../services/api'

// ── constants ────────────────────────────────────────────────────
const MES_NOME       = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MES_NOME_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES = MES_NOME.map((n,i)=>[String(i+1).padStart(2,'0'), n])
const COR = { real:'#5B9DFF', orc:'#F4B740', fcst:'#2DD4A7', bar:'#7E93AC', add:'#A78BFA',
  up:'#2DD4A7', down:'#FB7070', gRed:'#E5544B', gYel:'#F4B740', gGreen:'#2FA86A',
  gGreenLt:'#52D48A', gGreenDk:'#1A7848' }

const fmtBRL  = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(v||0)
const fmtBRL2 = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2}).format(v||0)
const fmtPct  = v => (v*100).toFixed(1).replace('.',',')+'%'
const compact = v => {
  const a = Math.abs(v)
  if (a>=1e6) return (v/1e6).toFixed(1).replace('.',',')+' mi'
  if (a>=1e3) return Math.round(v/1e3)+' mil'
  return Math.round(v).toString()
}
const mesLblCurto = m => m ? `${MES_NOME[+m.slice(5,7)-1]}/${m.slice(2,4)}` : ''
const mesLblLongo = m => m ? `${MES_NOME_FULL[+m.slice(5,7)-1]} ${m.slice(0,4)}` : ''
const zoneColor = p => p>=1.20 ? COR.gGreenDk : p>=1.00 ? COR.gGreenLt : p>=0.70 ? COR.gYel : COR.gRed
const labelStep = n => Math.max(1, Math.ceil(n/10))

// só desenha 1 a cada `step` rótulos, com `offset` para intercalar séries
function thinnedLabel({color, fontSize=9, dy=-6, step=1, offset=0}) {
  return ({x, y, value, index}) => {
    if (value==null || (index - offset) % step !== 0) return null
    return (
      <text x={x} y={y+dy} textAnchor="middle" fontSize={fontSize} fontWeight={700} fill={color}>
        {compact(value)}
      </text>
    )
  }
}

function diasNoMes(mes) {
  const [y,m] = mes.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

// ── small chart sub-components ──────────────────────────────────
function Card({title, legend, onExpand, lblOn, onLbl, children}) {
  return (
    <div className="bg-bg2 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-[10px] font-bold text-muted uppercase tracking-widest">{title}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {legend && <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted">{legend}</div>}
          {onLbl && <button onClick={onLbl} className={`text-[10px] px-2 py-1 border rounded transition ${lblOn?'border-primary text-primary bg-primary/10':'border-border text-muted hover:border-primary hover:text-primary'}`}>🏷 Rótulos</button>}
          {onExpand && <button onClick={onExpand} className="text-[10px] px-2 py-1 border border-border rounded text-muted hover:border-primary hover:text-primary transition">⛶</button>}
        </div>
      </div>
      {children}
    </div>
  )
}

function ExpandModal({title, onClose, children}) {
  useEffect(()=>{
    const fn = e => e.key==='Escape' && onClose()
    window.addEventListener('keydown', fn)
    return ()=>window.removeEventListener('keydown', fn)
  },[onClose])
  return (
    <div className="fixed inset-0 z-[9000] bg-black/95 backdrop-blur-sm flex flex-col p-5 fade-up">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className="font-bold text-dim">{title}</span>
        <button onClick={onClose} className="text-xs px-4 py-1.5 border border-border rounded text-muted hover:border-danger hover:text-danger transition">✕ Fechar</button>
      </div>
      <div className="flex-1 bg-bg2 border border-border rounded-xl p-5 overflow-auto flex flex-col">{children}</div>
    </div>
  )
}

function Lg({color, label, dash}) {
  return (
    <span className="flex items-center gap-1.5">
      <span style={{width:12,height:dash?2:8,borderRadius:dash?0:'50%',background:color,display:'inline-block'}}/>
      {label}
    </span>
  )
}

function DiarioTip({active, payload, label}) {
  if (!active || !payload?.length) return null
  const diario    = payload.find(p=>p.dataKey==='diario')?.value
  const acumulado = payload.find(p=>p.dataKey==='acumulado')?.value
  return (
    <div className="bg-bg border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-dim font-semibold mb-1">Dia {label}</p>
      <p className="text-muted">Receita do dia: <b className="text-dim">{diario==null?'—':fmtBRL2(diario)}</b></p>
      <p style={{color:COR.real}}>Acumulado: <b>{acumulado==null?'—':fmtBRL2(acumulado)}</b></p>
    </div>
  )
}

function ComparativoTip({active, payload, label}) {
  if (!active || !payload?.length) return null
  const acumulado = payload.find(p=>p.dataKey==='acumulado')?.value
  const orcVal    = payload.find(p=>p.dataKey==='orcAcum')?.value
  const projVal   = payload.find(p=>p.dataKey==='projecao')?.value
  return (
    <div className="bg-bg border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-dim font-semibold mb-1">Dia {label}</p>
      {acumulado!=null && <p style={{color:COR.real}}>Realizado: <b>{fmtBRL2(acumulado)}</b></p>}
      {projVal!=null && acumulado==null && <p style={{color:COR.fcst}}>Projeção forecast: <b>{fmtBRL2(projVal)}</b></p>}
      {orcVal!=null  && <p style={{color:COR.orc}}>Orçado: <b>{fmtBRL2(orcVal)}</b></p>}
    </div>
  )
}

function WeekdayTip({active, payload, label}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-bg border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-dim font-semibold mb-1">{label}</p>
      <p style={{color:COR.real}}>Média/dia: <b>{fmtBRL(payload[0].value)}</b></p>
    </div>
  )
}

function BulletChart({rows, orcado, C}) {
  const W=960, H=175, L=14, R=165, T=8, B=30
  const trackW=W-L-R, rowH=46, gap=38
  const maxVal = Math.max(...rows.map(r=>r.val), 1)
  const scaleMax = Math.max(orcado>0 ? orcado/0.88 : 0, maxVal*1.12)
  const x = v => L + Math.max(0, Math.min(1, v/scaleMax))*trackW

  // Gradient stops as % of track width
  const pOrc = orcado>0 ? orcado/scaleMax : 0.80
  const s70  = `${(pOrc*0.70*100).toFixed(1)}%`
  const s100 = `${(pOrc*1.00*100).toFixed(1)}%`
  const s120 = `${Math.min(pOrc*1.20*100, 100).toFixed(1)}%`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{width:'100%', height:'auto', display:'block'}}>
      <defs>
        <linearGradient id="bulletBg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={COR.gRed}     stopOpacity="0.22"/>
          <stop offset={s70}  stopColor={COR.gYel}     stopOpacity="0.27"/>
          <stop offset={s100} stopColor={COR.gGreenLt} stopOpacity="0.27"/>
          <stop offset={s120} stopColor={COR.gGreenDk} stopOpacity="0.30"/>
          <stop offset="100%" stopColor={COR.gGreenDk} stopOpacity="0.30"/>
        </linearGradient>
        <linearGradient id="bulletBar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={COR.gRed}/>
          <stop offset={s70}  stopColor={COR.gYel}/>
          <stop offset={s100} stopColor={COR.gGreenLt}/>
          <stop offset={s120} stopColor={COR.gGreenDk}/>
          <stop offset="100%" stopColor={COR.gGreenDk}/>
        </linearGradient>
        {rows.map((row,i)=>{
          const trackY=T+i*(rowH+gap)+20, th=18
          return (
            <clipPath key={i} id={`barClip_${i}`}>
              <rect x={L} y={trackY+4} width={Math.max(x(row.val)-L,0)} height={th-8} rx={2}/>
            </clipPath>
          )
        })}
      </defs>
      {rows.map((row,i)=>{
        const y=T+i*(rowH+gap), trackY=y+20, th=18
        const zone = zoneColor(row.pct)
        return (
          <g key={row.nome}>
            <rect x={L} y={trackY} width={trackW} height={th} fill="url(#bulletBg)" rx={3}/>
            <rect x={L} y={trackY+4} width={trackW} height={th-8} fill="url(#bulletBar)" clipPath={`url(#barClip_${i})`} rx={2}/>
            {orcado>0 && (
              <line x1={x(orcado)} y1={trackY-4} x2={x(orcado)} y2={trackY+th+4} stroke={C.dim} strokeWidth={2.5}/>
            )}
            <text x={L} y={y+12} fontSize={13} fill={C.muted} fontFamily="Inter, sans-serif">{row.nome} · {row.sub}</text>
            <text x={W-R+12} y={trackY+13} fontSize={14} fontWeight={600} fill={C.dim} fontFamily="'JetBrains Mono', monospace">{fmtBRL(row.val)}</text>
            <text x={W-R+12} y={trackY+28} fontSize={10.5} fill={zone} fontFamily="'JetBrains Mono', monospace">{orcado?fmtPct(row.pct)+' da meta':''}</text>
            {orcado>0 && <text x={W-R+12} y={trackY+42} fontSize={10} fill={C.muted} fontFamily="'JetBrains Mono', monospace">meta {fmtBRL(orcado)}</text>}
          </g>
        )
      })}
      <text x={L} y={H-6} fontSize={10.5} fill={C.muted} fontFamily="'JetBrains Mono', monospace">0</text>
      {orcado>0 && (
        <text x={x(orcado)} y={H-6} fontSize={10.5} fill={C.muted} textAnchor="middle" fontFamily="'JetBrains Mono', monospace">meta</text>
      )}
      <text x={L+trackW} y={H-6} fontSize={10.5} fill={C.muted} textAnchor="end" fontFamily="'JetBrains Mono', monospace">{compact(scaleMax)}</text>
    </svg>
  )
}

function DiarioChart({data, C, labels, expanded, ajTotal=0}) {
  const step = labelStep(data.length)
  const lastDataIdx = data.reduce((acc, d, i) => d.acumulado != null ? i : acc, -1)

  const acumLbl = labels ? ({x, y, value, index}) => {
    if (value == null) return null
    const isLast = index === lastDataIdx
    if (!isLast && index % step !== 0) return null
    const hasAdj = isLast && ajTotal !== 0
    const txt = compact(value) + (hasAdj ? ' ✦' : '')
    const tw = txt.length * 5.4
    return (
      <g>
        <rect x={x - tw/2 - 3} y={y - 21} width={tw + 6} height={13} rx={2}
          fill="var(--color-bg)" fillOpacity={0.88} stroke={COR.real} strokeOpacity={0.35} strokeWidth={0.8}/>
        <text x={x} y={y - 11} textAnchor="middle" fontSize={9} fontWeight={700} fill={COR.real}>{txt}</text>
      </g>
    )
  } : false

  return (
    <ResponsiveContainer width="100%" height={expanded?'100%':440} minHeight={expanded?420:undefined}>
      <ComposedChart data={data} margin={{top:28,right:30,left:0,bottom:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
        <XAxis dataKey="dia" tick={{fill:C.muted, fontSize:11}} axisLine={{stroke:C.grid}} tickLine={false}/>
        <YAxis yAxisId="left" tickFormatter={compact} tick={{fill:COR.real, fontSize:11}} axisLine={false} tickLine={false} width={60}/>
        <YAxis yAxisId="right" orientation="right" tickFormatter={compact} tick={{fill:COR.bar, fontSize:11}} axisLine={false} tickLine={false} width={60}/>
        <Tooltip content={<DiarioTip/>}/>
        <Bar yAxisId="right" dataKey="diario" fill={COR.bar} radius={[2,2,0,0]} maxBarSize={20}>
          {labels && <LabelList dataKey="diario" isAnimationActive={false} content={thinnedLabel({color:C.muted, dy:-6, step:1})}/>}
        </Bar>
        <Line yAxisId="left" dataKey="acumulado" stroke={COR.real} strokeWidth={2.6} dot={false} connectNulls={false} label={acumLbl}/>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function ComparativoChart({data, C, orcado, forecast, labels, expanded}) {
  const step    = labelStep(data.length)
  const endIdx  = data.length - 1

  // último ponto com dado real
  const lastRealIdx = data.reduce((acc, d, i) => d.acumulado != null ? i : acc, -1)
  const lastRealVal = lastRealIdx >= 0 ? data[lastRealIdx].acumulado : 0
  const remainingDays = endIdx - lastRealIdx

  const enriched = data.map((d, i) => {
    let projecao = null
    if (forecast > 0 && lastRealIdx >= 0 && remainingDays > 0) {
      if (i === lastRealIdx) {
        projecao = lastRealVal
      } else if (i > lastRealIdx) {
        const t = (i - lastRealIdx) / remainingDays
        projecao = Math.round(lastRealVal + (forecast - lastRealVal) * t)
      }
    }
    return { ...d, orcAcum: orcado > 0 ? orcado : null, projecao }
  })

  const endLbl = (color, dy) => ({x, y, value, index}) =>
    index !== endIdx || value == null ? null :
    <text x={x} y={y+dy} textAnchor="end" fontSize={9} fontWeight={700} fill={color}>{compact(value)}</text>

  return (
    <ResponsiveContainer width="100%" height={expanded?'100%':400} minHeight={expanded?420:undefined}>
      <LineChart data={enriched} margin={{top:28,right:16,left:0,bottom:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
        <XAxis dataKey="dia" tick={{fill:C.muted, fontSize:11}} axisLine={{stroke:C.grid}} tickLine={false}/>
        <YAxis tickFormatter={compact} tick={{fill:C.muted, fontSize:11}} axisLine={false} tickLine={false} width={60}/>
        <Tooltip content={<ComparativoTip/>}/>
        <Line dataKey="orcAcum" stroke={COR.orc} strokeWidth={2} dot={false} strokeDasharray="6 4" connectNulls>
          {labels && <LabelList dataKey="orcAcum" isAnimationActive={false} content={endLbl(COR.orc, -8)}/>}
        </Line>
        <Line dataKey="projecao" stroke={COR.fcst} strokeWidth={2} dot={false} strokeDasharray="6 4" connectNulls={false}>
          {labels && <LabelList dataKey="projecao" isAnimationActive={false} content={endLbl(COR.fcst, 14)}/>}
        </Line>
        <Line dataKey="acumulado" stroke={COR.real} strokeWidth={2.8} dot={false} connectNulls={false}>
          {labels && <LabelList dataKey="acumulado" isAnimationActive={false} content={thinnedLabel({color:COR.real, dy:-10, step:step, offset:0})}/>}
        </Line>
      </LineChart>
    </ResponsiveContainer>
  )
}

function WeekdayChart({data, C, labels, expanded}) {
  return (
    <ResponsiveContainer width="100%" height={expanded?'100%':380} minHeight={expanded?400:undefined}>
      <BarChart data={data} margin={{top:24,right:16,left:0,bottom:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
        <XAxis dataKey="dia" tick={{fill:C.muted, fontSize:11}} axisLine={{stroke:C.grid}} tickLine={false}/>
        <YAxis tickFormatter={compact} tick={{fill:C.muted, fontSize:11}} axisLine={false} tickLine={false} width={60}/>
        <Tooltip content={<WeekdayTip/>} cursor={{fill:'transparent'}}/>
        <Bar dataKey="media" radius={[3,3,0,0]} maxBarSize={44}>
          {data.map((d,i)=><Cell key={i} fill={d.fds?COR.bar:COR.real}/>)}
          {labels && <LabelList dataKey="media" isAnimationActive={false} content={thinnedLabel({color:C.muted, dy:-6, step:1})}/>}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function MixRows({rows, total}) {
  return (
    <div className="space-y-3.5 mt-1">
      {rows.map(g=>{
        const p = g.valor/total
        return (
          <div key={g.nome} className="flex items-center gap-3">
            <div className="w-24 text-xs text-dim">{g.nome}</div>
            <div className="flex-1 h-2.5 rounded-full bg-bg3 overflow-hidden">
              <div style={{width:`${(p*100).toFixed(1)}%`, background:g.cor}} className="h-full rounded-full"/>
            </div>
            <div className="w-28 text-right font-mono text-xs text-dim">{fmtBRL(g.valor)}</div>
            <div className="w-10 text-right font-mono text-[11px] text-muted">{(p*100).toFixed(0)}%</div>
          </div>
        )
      })}
    </div>
  )
}

function DetalheTable({rows, diasDecorridos, orcado, noScroll}) {
  return (
    <div className={noScroll ? "mt-1" : "max-h-[344px] overflow-auto mt-1"}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted">
            <th className="text-left py-1.5 px-2 sticky top-0 bg-bg2 border-b border-border">Dia</th>
            <th className="text-right py-1.5 px-2 sticky top-0 bg-bg2 border-b border-border">Receita</th>
            <th className="text-right py-1.5 px-2 sticky top-0 bg-bg2 border-b border-border">Acumulado</th>
            <th className="text-right py-1.5 px-2 sticky top-0 bg-bg2 border-b border-border">% do orçado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r.dia} className={`border-b border-border/50 ${r.dia===diasDecorridos?'bg-primary/5':''}`}>
              <td className="py-1.5 px-2 text-left font-mono text-[12px] text-dim">{r.dia2}</td>
              <td className="py-1.5 px-2 text-right font-mono text-[12px] text-dim">{fmtBRL(r.receita)}</td>
              <td className="py-1.5 px-2 text-right font-mono text-[12px] text-dim">{fmtBRL(r.acumulado)}</td>
              <td className="py-1.5 px-2 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="w-14 h-1.5 rounded-full bg-bg3 overflow-hidden">
                    <div style={{width:`${Math.min(r.rel*100,100).toFixed(1)}%`, background:COR.orc}} className="h-full rounded-full"/>
                  </div>
                  <span className="font-mono text-[11px] text-dim">{orcado?fmtPct(r.rel):'—'}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── main component ───────────────────────────────────────────────
export default function Receitas() {
  const { empresaAtiva } = useEmpresa()
  const { tema } = useTheme()

  const [lancamentos, setLancamentos] = useState([])
  const [metas,       setMetas]       = useState({padrao:{orcado:0,forecast:0}, months:{}})
  const [ajustes,     setAjustes]     = useState([])
  const [carregando,  setCarregando]  = useState(true)
  const [semDados,    setSemDados]    = useState(false)
  const [mesAtual,    setMesAtual]    = useState('')

  const [importModal, setImportModal] = useState(false)
  const [fileUpload,  setFileUpload]  = useState(null)
  const [uploading,   setUploading]   = useState(false)
  const [uploadMsg,   setUploadMsg]   = useState('')

  const [metasOpen,   setMetasOpen]   = useState(false)
  const [padraoForm,  setPadraoForm]  = useState({orcado:'', forecast:''})
  const [mesDraft,    setMesDraft]    = useState({})
  const [anoMetas,    setAnoMetas]    = useState('')
  const [addDesc,      setAddDesc]      = useState('')
  const [addVal,       setAddVal]       = useState('')
  const [addCategoria, setAddCategoria] = useState('hosp')

  const [lbls,       setLbls]       = useState({diario:false, comparativo:false, weekday:false})
  const [expandInfo, setExpandInfo] = useState(null)
  const togLbl = key => setLbls(p=>({...p, [key]: !p[key]}))

  const [pdfModal,   setPdfModal]   = useState(false)
  const [pdfMes,     setPdfMes]     = useState('')
  const [exportando, setExportando] = useState(false)

  const fileRef    = useRef(null)
  const timersRef  = useRef({})
  const contentRef = useRef(null)
  const refPag1    = useRef(null)
  const refDiario  = useRef(null)
  const refPag2    = useRef(null)

  const C = useMemo(()=>({
    grid:  tema==='light'?'#e2e8f0':'#252b3b',
    dim:   tema==='light'?'#475569':'#dde3ed',
    muted: '#64748b',
  }),[tema])

  // ── load ─────────────────────────────────────────────────────
  const carregar = useCallback(async ()=>{
    const cL = getCached('receitas_lancamentos', empresaAtiva?.id)
    const cM = getCached('receitas_metas', empresaAtiva?.id)
    const cA = getCached('receitas_ajustes', empresaAtiva?.id)
    if (cL && cM && cA) {
      setLancamentos(cL); setMetas(cM); setAjustes(cA)
      setSemDados(cL.length===0); setCarregando(false); return
    }
    try {
      setCarregando(true)
      const [resL, resM, resA] = await Promise.all([
        api.get('/receitas/lancamentos/'),
        api.get('/receitas/metas/'),
        api.get('/receitas/ajustes/'),
      ])
      setCached('receitas_lancamentos', resL.data, empresaAtiva?.id)
      setCached('receitas_metas',       resM.data, empresaAtiva?.id)
      setCached('receitas_ajustes',     resA.data, empresaAtiva?.id)
      setLancamentos(resL.data); setMetas(resM.data); setAjustes(resA.data)
      setSemDados(resL.data.length===0)
    } catch { setSemDados(true) }
    finally { setCarregando(false) }
  },[empresaAtiva?.id])
  useEffect(()=>{ carregar() },[carregar])

  // meses disponíveis (ordenados)
  const mesesDisponiveis = useMemo(
    ()=>[...new Set(lancamentos.map(l=>l.mes))].sort(),
    [lancamentos]
  )

  useEffect(()=>{
    if (mesesDisponiveis.length && !mesesDisponiveis.includes(mesAtual)) {
      setMesAtual(mesesDisponiveis[mesesDisponiveis.length-1])
    }
  },[mesesDisponiveis]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    if (mesAtual) setAnoMetas(mesAtual.slice(0,4))
  },[mesAtual])

  useEffect(()=>{
    setPadraoForm({
      orcado:   metas.padrao?.orcado   != null ? String(metas.padrao.orcado)   : '',
      forecast: metas.padrao?.forecast != null ? String(metas.padrao.forecast) : '',
    })
  },[metas.padrao])

  // ── cálculos do mês selecionado ─────────────────────────────
  const dadosMes = useMemo(()=>{
    if (!mesAtual) return null
    const dim = diasNoMes(mesAtual)
    const porDia = {}
    lancamentos.filter(l=>l.mes===mesAtual).forEach(l=>{ porDia[Number(l.data.slice(8,10))] = l })
    const diario=[], acumulado=[]
    let acc=0, lastDay=0
    for (let k=1;k<=dim;k++){
      const row = porDia[k]
      const v = row ? row.total : null
      if (v!=null) { acc+=v; lastDay=k }
      diario.push(v); acumulado.push(v==null?null:acc)
    }
    const mix = {hosp:0, ab:0, outros:0}
    lancamentos.filter(l=>l.mes===mesAtual).forEach(l=>{
      mix.hosp+=l.hosp; mix.ab+=l.ab; mix.outros+=l.outros
    })
    const realizado = acc
    const diasDecorridos = lastDay
    const projecao = diasDecorridos ? realizado/diasDecorridos*dim : 0
    return {dim, diario, acumulado, realizado, diasDecorridos, projecao, mix}
  },[lancamentos, mesAtual])

  function metaOf(mes) {
    const ov = metas.months?.[mes] || {}
    const orcado   = ov.orcado   != null ? +ov.orcado   : (+metas.padrao?.orcado   || 0)
    const forecast = ov.forecast != null ? +ov.forecast : (+metas.padrao?.forecast || 0)
    return {orcado, forecast, orcOverride: ov.orcado!=null, fcOverride: ov.forecast!=null}
  }

  const ajustesMes = useMemo(()=>ajustes.filter(a=>a.mes===mesAtual),[ajustes, mesAtual])
  const ajTotal    = useMemo(()=>ajustesMes.reduce((s,a)=>s+(+a.valor||0),0),[ajustesMes])
  const ajustesMix = useMemo(()=>{
    const m = {hosp:0, ab:0, outros:0}
    ajustesMes.forEach(a=>{ const k = a.categoria||'outros'; m[k] = (m[k]||0) + (+a.valor||0) })
    return m
  },[ajustesMes])

  const meta = mesAtual ? metaOf(mesAtual) : {orcado:0, forecast:0, orcOverride:false, fcOverride:false}
  const realAjustado = (dadosMes?.realizado||0) + ajTotal
  const projAjustada = (dadosMes?.projecao||0) + ajTotal
  const completo  = dadosMes ? dadosMes.diasDecorridos>=dadosMes.dim : false
  const pctRealOrc  = meta.orcado   ? realAjustado/meta.orcado   : 0
  const pctFcstOrc  = meta.orcado   ? meta.forecast/meta.orcado  : 0
  const pctRealFcst = meta.forecast ? realAjustado/meta.forecast  : 0
  const deltaProj      = projAjustada - meta.orcado
  const orcadoEsperado = meta.orcado && dadosMes?.diasDecorridos && dadosMes?.dim
    ? meta.orcado * (dadosMes.diasDecorridos / dadosMes.dim) : 0
  const paceDelta      = orcadoEsperado ? realAjustado - orcadoEsperado : 0
  const pacePositivo   = paceDelta >= 0

  // ── séries para gráficos ────────────────────────────────────
  const diasData = useMemo(()=>{
    if (!dadosMes) return []
    const lastIdx = dadosMes.diasDecorridos - 1
    return Array.from({length:dadosMes.dim}, (_,i)=>({
      dia: i+1,
      diario: dadosMes.diario[i],
      acumulado: dadosMes.acumulado[i] != null
        ? dadosMes.acumulado[i] + (i === lastIdx ? ajTotal : 0)
        : null,
    }))
  },[dadosMes, ajTotal])

  // sem ajTotal — acumulação orgânica diária para o comparativo
  const comparativoDias = useMemo(()=>{
    if (!dadosMes) return []
    return Array.from({length:dadosMes.dim}, (_,i)=>({
      dia: i+1,
      acumulado: dadosMes.acumulado[i] ?? null,
    }))
  },[dadosMes])

  const weekdayData = useMemo(()=>{
    if (!mesAtual) return []
    const dows = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
    const sum=[0,0,0,0,0,0,0], cnt=[0,0,0,0,0,0,0]
    lancamentos.filter(l=>l.mes===mesAtual).forEach(l=>{
      const w = new Date(l.data+'T00:00:00').getDay()
      sum[w]+=l.total; cnt[w]++
    })
    const order=[1,2,3,4,5,6,0]
    return order.map(w=>({dia:dows[w], media: cnt[w]?sum[w]/cnt[w]:0, fds: w===0||w===6}))
  },[lancamentos, mesAtual])

  const bulletRows = useMemo(()=>([
    {nome:'Consolidado', sub:'realizado + adicional', val: realAjustado,  pct: pctRealOrc},
    {nome:'Forecast',    sub:'projeção do fechamento', val: meta.forecast, pct: pctFcstOrc},
  ]),[realAjustado, pctRealOrc, meta.forecast, pctFcstOrc])

  const mixTotal = dadosMes ? (dadosMes.mix.hosp+dadosMes.mix.ab+dadosMes.mix.outros+ajTotal)||1 : 1
  const mixRows = dadosMes ? [
    {nome:'Hospedagem', valor: dadosMes.mix.hosp   + (ajustesMix.hosp  ||0), cor: COR.real},
    {nome:'A&B',        valor: dadosMes.mix.ab     + (ajustesMix.ab    ||0), cor: COR.fcst},
    {nome:'Outros',     valor: dadosMes.mix.outros + (ajustesMix.outros||0), cor: COR.orc},
  ] : []

  const detalheRows = useMemo(()=>{
    if (!dadosMes) return []
    const rows=[]
    for (let k=1;k<=dadosMes.dim;k++){
      const dia = dadosMes.diario[k-1]
      if (dia==null) continue
      const acc = dadosMes.acumulado[k-1]
      rows.push({dia:k, dia2:String(k).padStart(2,'0'), receita:dia, acumulado:acc,
        rel: meta.orcado ? acc/meta.orcado : 0})
    }
    return rows
  },[dadosMes, meta.orcado])

  const realizadoPorMes = useMemo(()=>{
    const m={}
    lancamentos.forEach(l=>{ m[l.mes]=(m[l.mes]||0)+l.total })
    ajustes.forEach(a=>{ m[a.mes]=(m[a.mes]||0)+(+a.valor||0) })
    return m
  },[lancamentos, ajustes])

  // ── debounce util ────────────────────────────────────────────
  function debounced(key, fn, delay=600) {
    clearTimeout(timersRef.current[key])
    timersRef.current[key] = setTimeout(fn, delay)
  }

  // ── metas: padrão ────────────────────────────────────────────
  function onPadraoChange(field, raw) {
    const digits = raw.replace(/[^\d]/g,'')
    setPadraoForm(p=>({...p, [field]: digits}))
    debounced('padrao', async ()=>{
      try {
        await api.post('/receitas/metas/padrao/', {
          orcado:   field==='orcado'   ? (digits===''?0:Number(digits)) : (padraoForm.orcado===''?0:Number(padraoForm.orcado)),
          forecast: field==='forecast' ? (digits===''?0:Number(digits)) : (padraoForm.forecast===''?0:Number(padraoForm.forecast)),
        })
        setMetas(prev=>{
          const next = {...prev, padrao:{...prev.padrao, [field]: digits===''?0:Number(digits)}}
          setCached('receitas_metas', next, empresaAtiva?.id)
          return next
        })
      } catch {}
    })
  }

  // ── metas: override por mês ─────────────────────────────────
  function draftFor(mes) {
    if (mesDraft[mes]) return mesDraft[mes]
    const ov = metas.months?.[mes] || {}
    return { orcado: ov.orcado!=null?String(ov.orcado):'', forecast: ov.forecast!=null?String(ov.forecast):'' }
  }
  function onMetaMesChange(mes, field, raw) {
    const digits = raw.replace(/[^\d]/g,'')
    const next = {...draftFor(mes), [field]: digits}
    setMesDraft(p=>({...p, [mes]: next}))
    debounced(`meta-${mes}`, async ()=>{
      try {
        await api.post(`/receitas/metas/${mes}/`, {
          orcado:   next.orcado===''   ? null : Number(next.orcado),
          forecast: next.forecast==='' ? null : Number(next.forecast),
        })
        setMetas(prev=>{
          const months = {...prev.months}
          if (next.orcado===''&&next.forecast==='') delete months[mes]
          else months[mes] = {
            orcado:   next.orcado===''   ? null : Number(next.orcado),
            forecast: next.forecast==='' ? null : Number(next.forecast),
          }
          const out = {...prev, months}
          setCached('receitas_metas', out, empresaAtiva?.id)
          return out
        })
      } catch {}
    })
  }

  // ── lançamentos adicionais ──────────────────────────────────
  async function adicionarAjuste() {
    const v = parseFloat(addVal)||0
    const d = (addDesc||'').trim()
    if (!v && !d) return
    try {
      const res = await api.post('/receitas/ajustes/criar/', {mes: mesAtual, valor: v, descricao: d, categoria: addCategoria})
      setAjustes(prev=>{
        const next=[{id:res.data.id, mes:mesAtual, valor:v, descricao:d, categoria:addCategoria}, ...prev]
        setCached('receitas_ajustes', next, empresaAtiva?.id)
        return next
      })
      setAddDesc(''); setAddVal('')
    } catch {}
  }
  async function removerAjuste(id) {
    setAjustes(prev=>{
      const next = prev.filter(a=>a.id!==id)
      setCached('receitas_ajustes', next, empresaAtiva?.id)
      return next
    })
    try { await api.delete(`/receitas/ajustes/${id}/deletar/`) } catch {}
  }

  // ── upload ───────────────────────────────────────────────────
  async function fazerUpload() {
    if (!fileUpload) return
    const fd = new FormData(); fd.append('arquivo', fileUpload)
    try {
      setUploading(true); setUploadMsg('')
      const res = await api.post('/receitas/upload/', fd, {headers:{'Content-Type':'multipart/form-data'}})
      if (res.data.ok) {
        setUploadMsg(`✓ ${res.data.total_registros.toLocaleString('pt-BR')} lançamentos · ${res.data.dias_importados} dias`)
        invalidateCache('receitas_lancamentos')
        setTimeout(()=>{ setImportModal(false); setFileUpload(null); setUploadMsg(''); carregar() }, 1200)
      } else setUploadMsg(`Erro: ${res.data.erro}`)
    } catch (e) { setUploadMsg(e.response?.data?.erro || 'Erro ao conectar com o servidor.') }
    finally { setUploading(false) }
  }

  // ── export PDF ───────────────────────────────────────────────
  async function gerarPDF() {
    if (!refPag1.current || !refPag2.current) return
    setExportando(true)
    setPdfModal(false)

    if (pdfMes && pdfMes !== mesAtual) {
      setMesAtual(pdfMes)
      await new Promise(r => setTimeout(r, 400))
    }

    // Ativa todos os rótulos para o PDF e restaura depois
    const lblsOrig = lbls
    setLbls({ diario: true, comparativo: true, weekday: true })
    // LabelList com isAnimationActive={false} aparece imediatamente; 350ms garante re-render completo
    await new Promise(r => setTimeout(r, 350))

    try {
      const bgColor = tema === 'light' ? '#f1f5f9' : '#0d1117'
      const opts = { scale: 2, useCORS: true, allowTaint: true, logging: false, backgroundColor: bgColor }

      // Captura sequencial evita interferência entre clones DOM do html2canvas
      const canvas1      = await html2canvas(refPag1.current,   opts)
      const canvasDiario = await html2canvas(refDiario.current, opts)
      const canvas2      = await html2canvas(refPag2.current,   opts)

      const pdf     = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageW   = pdf.internal.pageSize.getWidth()
      const pageH   = pdf.internal.pageSize.getHeight()
      const margin  = 22
      const HDR_H   = 48
      const availW  = pageW - 2 * margin
      const availH  = pageH - HDR_H - margin - 8
      const empresa = empresaAtiva?.nome || 'RPHub'
      const periodo = mesLblLongo(mesAtual)
      const hoje    = new Date().toLocaleDateString('pt-BR')

      const drawHeader = (pg) => {
        // Fundo branco
        pdf.setFillColor(255, 255, 255)
        pdf.rect(0, 0, pageW, HDR_H, 'F')
        // Linha verde no rodapé do header
        pdf.setFillColor(45, 212, 160)
        pdf.rect(0, HDR_H - 2, pageW, 2, 'F')
        // Título
        pdf.setFontSize(14)
        pdf.setTextColor(45, 212, 160)
        pdf.text('Relatório de Receitas - Gerencial', margin, 20)
        // Subtítulo
        pdf.setFontSize(9)
        pdf.setTextColor(71, 85, 105)
        pdf.text(`${empresa} · ${periodo} · Gerado em ${hoje}`, margin, 35)
        // Paginação
        pdf.setFontSize(8)
        pdf.text(`Página ${pg} de 2`, pageW - margin, 35, { align: 'right' })
      }

      // Página 1: resumo/KPIs/bullet (canvas1) + diário (canvasDiario) empilhados
      drawHeader(1)
      const gap    = 8
      const scale1 = Math.min(
        availW / canvas1.width,
        (availH - gap) / (canvas1.height + canvasDiario.height)
      )
      const w1  = canvas1.width      * scale1
      const hh1 = canvas1.height     * scale1
      const hhD = canvasDiario.height * scale1
      pdf.addImage(canvas1.toDataURL('image/jpeg', 0.92),      'JPEG', margin, HDR_H + 4,        w1, hh1)
      pdf.addImage(canvasDiario.toDataURL('image/jpeg', 0.92), 'JPEG', margin, HDR_H + 4 + hh1 + gap, w1, hhD)

      // Página 2: comparativo + weekday + mix + detalhe
      pdf.addPage()
      drawHeader(2)
      const scale2 = Math.min(availW / canvas2.width, availH / canvas2.height)
      const w2  = canvas2.width  * scale2
      const hh2 = canvas2.height * scale2
      pdf.addImage(canvas2.toDataURL('image/jpeg', 0.92), 'JPEG', margin, HDR_H + 4, w2, hh2)

      pdf.save(`receitas_${mesAtual}_${empresa.replace(/\s+/g,'_').toLowerCase()}.pdf`)
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
    } finally {
      setLbls(lblsOrig)
      setExportando(false)
    }
  }

  if (carregando) return <SkeletonReceitas />

  // ── render ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── header ── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 bg-bg2 border-b border-border">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-xs font-bold text-primary whitespace-nowrap">📈 Receitas</span>
        {!semDados && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {mesesDisponiveis.map(m=>(
              <button key={m} onClick={()=>setMesAtual(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${m===mesAtual?'bg-primary/15 border border-primary/40 text-primary':'bg-bg3 border border-border text-dim hover:border-primary/40'}`}>
                {mesLblLongo(m)}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1"/>
        {!semDados && (
          <button
            onClick={() => { setPdfMes(mesAtual); setPdfModal(true) }}
            disabled={exportando}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-border text-xs font-semibold text-muted hover:text-dim hover:border-primary/40 transition disabled:opacity-40 whitespace-nowrap"
          >
            {exportando ? '⏳ Gerando...' : '⬇ Exportar PDF'}
          </button>
        )}
        <button onClick={()=>{setImportModal(true);setUploadMsg('');setFileUpload(null)}}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-bg text-xs font-bold hover:bg-primary/90 transition">↑ Importar planilha</button>
      </div>

      {semDados ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 fade-up">
          <div className="text-5xl">📈</div>
          <p className="text-dim font-semibold">Nenhum dado importado ainda</p>
          <p className="text-muted text-sm">Importe a planilha de consolidado (Débito/Crédito) para visualizar o dashboard de receitas.</p>
          <button onClick={()=>setImportModal(true)} className="px-5 py-2.5 rounded-lg bg-primary text-bg text-sm font-semibold hover:bg-primary/90 transition">Importar planilha</button>
        </div>
      ) : (
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4 space-y-4 fade-up">

          {/* ── PÁGINA 1: resumo + KPIs + bullet ── */}
          <div ref={refPag1} className="space-y-4">

          {/* ── cards de resumo ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-bg2 rounded-xl border border-border px-4 py-3">
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <span style={{width:8,height:8,borderRadius:'50%',background:COR.orc,display:'inline-block'}}/>
                Orçado do mês
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-bg3 border border-border text-muted normal-case font-medium">{meta.orcOverride?'override':'padrão'}</span>
              </p>
              <p className="text-xl font-extrabold text-dim font-mono leading-tight">{fmtBRL(meta.orcado)}</p>
              <p className="text-[11px] text-muted mt-1.5">{meta.orcOverride?'definido para este mês':'usando meta padrão'}</p>
            </div>
            <div className="bg-bg2 rounded-xl border border-border px-4 py-3">
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <span style={{width:8,height:8,borderRadius:'50%',background:COR.add,display:'inline-block'}}/>
                Receita adicional
              </p>
              <p className="text-xl font-extrabold font-mono leading-tight" style={{color: ajTotal<0?COR.down:(ajTotal>0?COR.up:'inherit')}}>
                {ajTotal<0?'− ':''}{fmtBRL(Math.abs(ajTotal))}
              </p>
              <p className="text-[11px] text-muted mt-1.5">{ajustesMes.length ? `${ajustesMes.length} lançamento${ajustesMes.length>1?'s':''}` : 'nenhum lançamento'}</p>
            </div>
            <div className="bg-bg2 rounded-xl border border-border px-4 py-3">
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <span style={{width:8,height:8,borderRadius:'50%',background:COR.fcst,display:'inline-block'}}/>
                Forecast do mês
              </p>
              <p className="text-xl font-extrabold text-dim font-mono leading-tight">{fmtBRL(meta.forecast)}</p>
              <p className="text-[11px] text-muted mt-1.5">{meta.fcOverride?'definido para este mês':'usando meta padrão'}{meta.orcado?` · ${fmtPct(pctFcstOrc)} do orçado`:''}</p>
            </div>
          </div>

          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-bg2 rounded-xl border border-border px-4 py-3 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{background:COR.real}}/>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Realizado acumulado</p>
              <p className="text-xl font-extrabold text-dim font-mono leading-tight mt-1.5">{fmtBRL(realAjustado)}</p>
              <p className="text-[11px] text-muted mt-1.5">
                {dadosMes?.diasDecorridos||0} de {dadosMes?.dim||0} dias
                {ajTotal ? <> · inclui adicional <b className="text-dim">{fmtBRL(ajTotal)}</b></> : <> · média/dia <b className="text-dim">{fmtBRL((dadosMes?.realizado||0)/(dadosMes?.diasDecorridos||1))}</b></>}
              </p>
            </div>
            <div className="bg-bg2 rounded-xl border border-border px-4 py-3 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{background:COR.orc}}/>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest">% realizado do orçado</p>
              <p className="text-xl font-extrabold text-dim font-mono leading-tight mt-1.5">{fmtPct(pctRealOrc)}</p>
              <p className="text-[11px] text-muted mt-1.5">{fmtBRL(realAjustado)} de {fmtBRL(meta.orcado)}</p>
            </div>
            <div className="bg-bg2 rounded-xl border border-border px-4 py-3 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{background:COR.fcst}}/>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest">% realizado do forecast</p>
              <p className="text-xl font-extrabold text-dim font-mono leading-tight mt-1.5">{meta.forecast ? fmtPct(pctRealFcst) : '—'}</p>
              <p className="text-[11px] text-muted mt-1.5">{meta.forecast ? <>{fmtBRL(realAjustado)} de {fmtBRL(meta.forecast)}</> : 'sem forecast definido'}</p>
            </div>
            <div className="bg-bg2 rounded-xl border border-border px-4 py-3 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{background: orcadoEsperado ? (pacePositivo?COR.up:COR.down) : COR.add}}/>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Pace vs. Orçado</p>
              <p className="text-xl font-extrabold font-mono leading-tight mt-1.5" style={{color: orcadoEsperado ? (pacePositivo?COR.up:COR.down) : 'var(--color-dim)'}}>
                {orcadoEsperado ? (pacePositivo?'+ ':' − ')+fmtBRL(Math.abs(paceDelta)) : '—'}
              </p>
              <p className="text-[11px] text-muted mt-1.5">
                {orcadoEsperado && dadosMes ? <>esperado até D{dadosMes.diasDecorridos}: <b className="text-dim">{fmtBRL(orcadoEsperado)}</b></> : 'sem orçado definido'}
              </p>
              {orcadoEsperado ? (
                <span className={`inline-block mt-1.5 font-mono font-bold text-xs px-2 py-0.5 rounded-full ${pacePositivo?'bg-primary/10':'bg-red-400/10'}`} style={{color: pacePositivo?COR.up:COR.down}}>
                  {pacePositivo?'▲':'▼'} {fmtPct(Math.abs(paceDelta/orcadoEsperado))} {pacePositivo?'à frente':'atrás'}
                </span>
              ) : null}
            </div>
          </div>

          {/* ── bullets: realizado/forecast vs meta ── */}
          <Card title="Realizado e forecast vs meta" legend={<>
            <Lg color={COR.gRed} label="<70%"/><Lg color={COR.gYel} label="70–99%"/><Lg color={COR.gGreenLt} label="100–119%"/><Lg color={COR.gGreenDk} label="≥120%"/><Lg color={C.dim} label="meta" dash/>
          </>} onExpand={()=>setExpandInfo({title:'Realizado e forecast vs meta', key:'bullets'})}>
            <BulletChart rows={bulletRows} orcado={meta.orcado} C={C}/>
          </Card>
          </div>{/* /refPag1 */}

          {/* ── metas mensais & lançamentos adicionais ── */}
          <div className="bg-bg2 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Metas mensais &amp; lançamentos adicionais</p>
              <button onClick={()=>setMetasOpen(p=>!p)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-muted hover:text-dim border border-border rounded-lg px-3 py-1.5 transition">
                <span style={{display:'inline-block', transition:'transform .15s', transform: metasOpen?'rotate(90deg)':'none'}}>▸</span>
                {metasOpen?'Ocultar':'Mostrar'}
              </button>
            </div>

            {metasOpen && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-3">

                {/* metas mensais */}
                <div className="bg-bg3 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-dim">Metas mensais · {anoMetas}</p>
                    <span className="text-[10px] text-muted">orçado e forecast por mês · vazio usa o padrão</span>
                  </div>
                  <div className="flex gap-3 mb-3">
                    <div className="flex-1 bg-bg2 border border-border rounded-lg px-3 py-2">
                      <label className="block text-[9px] font-bold uppercase tracking-wide text-muted mb-1">Orçado padrão · todos os meses</label>
                      <div className="flex items-baseline gap-1">
                        <span className="text-muted text-xs font-mono">R$</span>
                        <input value={padraoForm.orcado} onChange={e=>onPadraoChange('orcado', e.target.value)}
                          inputMode="numeric" className="bg-transparent outline-none text-dim font-mono font-semibold text-sm w-full"/>
                      </div>
                    </div>
                    <div className="flex-1 bg-bg2 border border-border rounded-lg px-3 py-2">
                      <label className="block text-[9px] font-bold uppercase tracking-wide text-muted mb-1">Forecast padrão · todos os meses</label>
                      <div className="flex items-baseline gap-1">
                        <span className="text-muted text-xs font-mono">R$</span>
                        <input value={padraoForm.forecast} onChange={e=>onPadraoChange('forecast', e.target.value)}
                          inputMode="numeric" className="bg-transparent outline-none text-dim font-mono font-semibold text-sm w-full"/>
                      </div>
                    </div>
                  </div>
                  <div className="max-h-[280px] overflow-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="text-[9px] uppercase tracking-wide text-muted">
                          <th className="text-left py-1.5 px-2 sticky top-0 bg-bg3 border-b border-border">Mês</th>
                          <th className="text-right py-1.5 px-2 sticky top-0 bg-bg3 border-b border-border">Orçado</th>
                          <th className="text-right py-1.5 px-2 sticky top-0 bg-bg3 border-b border-border">Forecast</th>
                          <th className="text-right py-1.5 px-2 sticky top-0 bg-bg3 border-b border-border">Realizado</th>
                          <th className="text-right py-1.5 px-2 sticky top-0 bg-bg3 border-b border-border">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MESES.map(([mm,lbl])=>{
                          const mes = `${anoMetas}-${mm}`
                          const draft = draftFor(mes)
                          const temDados = mesesDisponiveis.includes(mes)
                          const rr = realizadoPorMes[mes]
                          const eff = metaOf(mes)
                          return (
                            <tr key={mes} className={`border-b border-border/50 ${mes===mesAtual?'bg-primary/5':''}`}>
                              <td className="py-1 px-2 text-left">
                                <button disabled={!temDados} onClick={()=>temDados&&setMesAtual(mes)}
                                  className={`text-xs ${mes===mesAtual?'text-primary font-semibold':temDados?'text-dim hover:text-primary cursor-pointer':'text-muted cursor-default'}`}>{lbl}</button>
                              </td>
                              <td className="py-1 px-2 text-right">
                                <input value={draft.orcado} placeholder="padrão" onChange={e=>onMetaMesChange(mes,'orcado',e.target.value)}
                                  className="w-20 bg-bg2 border border-border rounded px-1.5 py-1 text-right font-mono text-[11px] text-dim outline-none focus:border-primary"/>
                              </td>
                              <td className="py-1 px-2 text-right">
                                <input value={draft.forecast} placeholder="padrão" onChange={e=>onMetaMesChange(mes,'forecast',e.target.value)}
                                  className="w-20 bg-bg2 border border-border rounded px-1.5 py-1 text-right font-mono text-[11px] text-dim outline-none focus:border-primary"/>
                              </td>
                              <td className="py-1 px-2 text-right font-mono text-[11px] text-dim">{rr!=null?fmtBRL(rr):'—'}</td>
                              <td className="py-1 px-2 text-right font-mono text-[11px] text-muted">{rr!=null&&eff.orcado?fmtPct(rr/eff.orcado):'—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* lançamentos adicionais */}
                <div className="bg-bg3 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-dim">Lançamentos adicionais · {mesLblLongo(mesAtual)}</p>
                    <span className="text-[10px] text-muted">acréscimos/decréscimos com observação</span>
                  </div>
                  <div className="flex gap-2 items-center mb-3 flex-wrap">
                    <input value={addDesc} onChange={e=>setAddDesc(e.target.value)} onKeyDown={e=>e.key==='Enter'&&adicionarAjuste()}
                      placeholder="A que se refere? (ex.: NF Locação Plaza)"
                      className="flex-1 min-w-[160px] bg-bg2 border border-border rounded-lg px-3 py-2 text-xs text-dim outline-none focus:border-primary"/>
                    <select value={addCategoria} onChange={e=>setAddCategoria(e.target.value)}
                      className="bg-bg2 border border-border rounded-lg px-2 py-2 text-xs text-dim outline-none focus:border-primary cursor-pointer">
                      <option value="hosp">Hospedagem</option>
                      <option value="ab">A&amp;B</option>
                      <option value="outros">Outros</option>
                    </select>
                    <div className="w-32 bg-bg2 border border-border rounded-lg px-2.5 py-2 flex items-baseline gap-1">
                      <span className="text-muted text-xs font-mono">R$</span>
                      <input value={addVal} onChange={e=>setAddVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&adicionarAjuste()}
                        type="number" step="100" placeholder="0,00"
                        className="bg-transparent outline-none text-dim font-mono text-xs w-full"/>
                    </div>
                    <button onClick={adicionarAjuste} className="px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap" style={{background:COR.add, color:'#16121f'}}>+ adicionar</button>
                  </div>
                  <div className="flex flex-col gap-2 max-h-[230px] overflow-auto">
                    {ajustesMes.length===0 ? (
                      <p className="text-[12px] text-muted px-1 py-2">Nenhum lançamento neste mês.</p>
                    ) : ajustesMes.map(a=>{
                      const cat = a.categoria||'outros'
                      const catLbl = cat==='hosp'?'Hosp.':cat==='ab'?'A&B':'Outros'
                      const catClr = cat==='hosp'?COR.real:cat==='ab'?COR.fcst:COR.orc
                      return (
                      <div key={a.id} className="flex items-center gap-2.5 bg-bg2 border border-border rounded-lg px-3 py-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0" style={{color:catClr,background:catClr+'22'}}>{catLbl}</span>
                        <span className="flex-1 text-xs text-dim">{a.descricao || <i className="text-muted">sem descrição</i>}</span>
                        <span className="font-mono font-semibold text-xs" style={{color: a.valor<0?COR.down:COR.up}}>{a.valor<0?'− ':'+ '}{fmtBRL(Math.abs(a.valor))}</span>
                        <button onClick={()=>removerAjuste(a.id)} className="text-muted hover:text-red-400 text-base leading-none px-1">×</button>
                      </div>
                    )})}
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-border text-xs text-muted">
                    <span>Total de adicionais</span>
                    <b className="font-mono text-sm" style={{color: ajTotal<0?COR.down:(ajTotal>0?COR.up:undefined)}}>{ajTotal<0?'− ':''}{fmtBRL(Math.abs(ajTotal))}</b>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── receita diária (página 1 no PDF) ── */}
          <div ref={refDiario}>
          <Card title={`Receita diária e acumulada · ${mesLblLongo(mesAtual)}`} legend={<>
            <Lg color={COR.bar} label="Receita do dia"/><Lg color={COR.real} label="Acumulado no mês" dash/>
          </>} lblOn={lbls.diario} onLbl={()=>togLbl('diario')}
             onExpand={()=>setExpandInfo({title:'Receita diária e acumulada', key:'diario'})}>
            <DiarioChart data={diasData} C={C} labels={lbls.diario} ajTotal={ajTotal}/>
          </Card>
          </div>{/* /refDiario */}

          {/* ── PÁGINA 2: comparativo + tabelas ── */}
          <div ref={refPag2} className="space-y-4">

          {/* ── comparativo + dia da semana ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Comparativo do mês · orçado × realizado × forecast" legend={<>
              <Lg color={COR.real} label="Realizado"/><Lg color={COR.orc} label="Orçado" dash/><Lg color={COR.fcst} label="Forecast" dash/>
            </>} lblOn={lbls.comparativo} onLbl={()=>togLbl('comparativo')}
               onExpand={()=>setExpandInfo({title:'Comparativo do mês', key:'comparativo'})}>
              <ComparativoChart data={diasData} C={C} orcado={meta.orcado} forecast={meta.forecast} labels={lbls.comparativo}/>
            </Card>
            <Card title="Receita média por dia da semana" lblOn={lbls.weekday} onLbl={()=>togLbl('weekday')}
               onExpand={()=>setExpandInfo({title:'Receita média por dia da semana', key:'weekday'})}>
              <WeekdayChart data={weekdayData} C={C} labels={lbls.weekday}/>
            </Card>
          </div>

          {/* ── composição + detalhe diário ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Composição da receita" onExpand={()=>setExpandInfo({title:'Composição da receita', key:'mix'})}>
              <MixRows rows={mixRows} total={mixTotal}/>
            </Card>
            <Card title="Detalhe diário" onExpand={()=>setExpandInfo({title:'Detalhe diário', key:'detalhe'})}>
              <DetalheTable rows={detalheRows} diasDecorridos={dadosMes?.diasDecorridos} orcado={meta.orcado} noScroll={exportando}/>
            </Card>
          </div>

          <p className="text-[11px] text-muted leading-relaxed">
            Receita líquida considerada = <b className="text-dim">Débito + Crédito</b> (estornos entram negativos).{' '}
            <b className="text-dim">% realizado do orçado</b> = realizado acumulado (com adicional) ÷ orçado do mês.
          </p>
          </div>{/* /refPag2 */}
        </div>
      )}

      {/* ── Expand Modal ── */}
      {expandInfo && (
        <ExpandModal title={expandInfo.title} onClose={()=>setExpandInfo(null)}>
          {expandInfo.key==='bullets'      && <BulletChart rows={bulletRows} orcado={meta.orcado} C={C}/>}
          {expandInfo.key==='diario'       && <DiarioChart data={diasData} C={C} labels={lbls.diario} expanded ajTotal={ajTotal}/>}
          {expandInfo.key==='comparativo'  && <ComparativoChart data={diasData} C={C} orcado={meta.orcado} forecast={meta.forecast} labels={lbls.comparativo} expanded/>}
          {expandInfo.key==='weekday'      && <WeekdayChart data={weekdayData} C={C} labels={lbls.weekday} expanded/>}
          {expandInfo.key==='mix'          && <MixRows rows={mixRows} total={mixTotal}/>}
          {expandInfo.key==='detalhe'      && <DetalheTable rows={detalheRows} diasDecorridos={dadosMes?.diasDecorridos} orcado={meta.orcado}/>}
        </ExpandModal>
      )}

      {/* ── Export PDF Modal ── */}
      {pdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg2 border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 fade-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-bold text-dim text-sm">⬇ Exportar PDF · Receitas</h2>
              <button onClick={() => setPdfModal(false)} className="text-muted hover:text-dim text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-muted uppercase tracking-widest mb-2">Período a exportar</label>
                <select
                  value={pdfMes}
                  onChange={e => setPdfMes(e.target.value)}
                  className="w-full bg-bg3 border border-border rounded-lg px-3 py-2.5 text-sm text-dim focus:outline-none focus:border-primary/50 transition"
                >
                  {[...mesesDisponiveis].reverse().map(m => (
                    <option key={m} value={m}>{mesLblLongo(m)}</option>
                  ))}
                </select>
                {pdfMes !== mesAtual && (
                  <p className="text-[11px] text-warn mt-2 flex items-center gap-1">
                    ⚠ A visualização mudará para {mesLblLongo(pdfMes)}
                  </p>
                )}
              </div>
              <div className="bg-bg3 rounded-lg border border-border px-4 py-3">
                <p className="text-[11px] text-muted leading-relaxed">
                  Inclui: <b className="text-dim">cards de resumo, KPIs, bullet chart, gráfico diário, comparativo mensal, composição de receita e detalhe diário</b>.
                </p>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button onClick={() => setPdfModal(false)} className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted hover:text-dim transition">Cancelar</button>
              <button
                onClick={gerarPDF}
                disabled={!pdfMes}
                className="flex-1 py-2.5 rounded-lg bg-primary text-bg text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-40"
              >
                Exportar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ── */}
      {importModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg2 border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 fade-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-bold text-dim text-sm">Importar planilha de receitas</h2>
              <button onClick={()=>setImportModal(false)} className="text-muted hover:text-dim text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5">
              <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed border-border hover:border-primary rounded-xl p-8 text-center cursor-pointer transition group">
                <div className="text-4xl mb-3">📂</div>
                <p className="text-sm text-dim group-hover:text-primary transition font-medium">{fileUpload?fileUpload.name:'Clique para selecionar o arquivo'}</p>
                <p className="text-xs text-muted mt-1">Excel (.xlsx, .xls) ou CSV (.csv) · consolidado Tower</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{setFileUpload(e.target.files[0]);setUploadMsg('')}}/>
              {uploadMsg && <p className={`mt-3 text-xs text-center px-3 py-2 rounded-lg border ${uploadMsg.startsWith('✓')?'text-primary bg-primary/10 border-primary/30':'text-red-400 bg-red-400/10 border-red-400/20'}`}>{uploadMsg}</p>}
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button onClick={()=>setImportModal(false)} className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted hover:text-dim transition">Cancelar</button>
              <button onClick={fazerUpload} disabled={!fileUpload||uploading} className="flex-1 py-2.5 rounded-lg bg-primary text-bg text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-40">{uploading?'Enviando...':'Importar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
