import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { useEmpresa } from '../contexts/EmpresaContext'
import { useTheme } from '../contexts/ThemeContext'
import { SkeletonCustos } from '../components/Skeleton'
import { getCached, setCached, invalidateCache } from '../services/dataCache'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts'
import api from '../services/api'

// ── constants ────────────────────────────────────────────────────
const CORES = [
  '#2dd4a0','#3b82f6','#f59e0b','#ef4444','#8b5cf6',
  '#ec4899','#06b6d4','#84cc16','#f97316','#a855f7',
  '#14b8a6','#eab308','#6366f1','#10b981','#f43f5e',
  '#38b6e8','#22c55e','#d946ef','#fb923c','#facc15',
]
const CC_MAP = {
  'Cozinha Central':'#2dd4a0','Café da Manhã':'#a78bfa',
  'Refeitorio de Empregados':'#84cc16','Governança':'#f97316',
  'Banquetes A&B':'#ec4899','Restaurante Amati':'#14b8a6',
  'Manutenção':'#f59e0b','Lobby Bar':'#38b6e8',
  'Frigobar':'#60a5fa','Recepção':'#e879f9',
  'Room Service':'#22d3ee',
}
const MES_NOME = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const fmtBRL  = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(v)
const fmtK    = v => v>=1e6?`R$${(v/1e6).toFixed(1)}M`:v>=1e3?`R$${(v/1e3).toFixed(0)}K`:fmtBRL(v)
const fmtN2   = v => v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtP    = v => `R$ ${v.toFixed(2).replace('.',',')}`
const mesLbl  = m => m ? MES_NOME[+m.slice(5,7)-1]+'/'+m.slice(2,4) : ''
const mMeses  = () => MES_NOME.map((n,i)=>({v:String(i+1).padStart(2,'0'),n}))

function ccCor(cc) {
  if (CC_MAP[cc]) return CC_MAP[cc]
  let h = 0
  for (const c of cc) h = (h*31 + c.charCodeAt(0)) >>> 0
  return CORES[h % CORES.length]
}

// Exact original HTML color scale: primary (#2dd4a0) → orange-red at full intensity
function heatColor(intensity) {
  if (intensity < 0.01) return {bg:'rgba(37,43,59,0.4)', fg:'#64748b'}
  const r = Math.round(45 + (235-45)*intensity)
  const g = Math.round(212 + (100-212)*intensity)
  const b = Math.round(160 + (80-160)*intensity)
  const alpha = (0.2 + intensity*0.8).toFixed(2)
  return {bg:`rgba(${r},${g},${b},${alpha})`, fg:'#fff'}
}

function exportCSV(filename, rows) {
  const bom = '﻿'
  const csv = bom + rows.map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(';')).join('\n')
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'})
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click()
}

function CustomYTick({ x, y, payload, maxChars = 20 }) {
  const full  = payload.value ?? ''
  const label = full.length > maxChars ? full.slice(0, maxChars) + '…' : full
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text x={-4} y={0} dy={4} textAnchor="end" fill="var(--color-dim)"
        fontSize={10} fontFamily="inherit" style={{whiteSpace:'nowrap'}}>
        {label}
      </text>
    </g>
  )
}

// ── sub-components ───────────────────────────────────────────────
function Sparkline({vals, w=80, h=28, color='var(--color-primary)'}) {
  if (!vals?.length||vals.length<2) return null
  const max=Math.max(...vals), min=Math.min(...vals), range=max-min||1
  const pts=vals.map((v,i)=>[(i/(vals.length-1))*w, h-((v-min)/range)*(h*0.8)-h*0.1])
  let d=`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i=1;i<pts.length;i++) {
    const [x0,y0]=pts[i-1],[x1,y1]=pts[i],cx=(x0+x1)/2
    d+=` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
  }
  return (
    <svg width={w} height={h} style={{overflow:'visible'}}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round"/>
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r={2.5} fill={color}/>
    </svg>
  )
}

function Tip({active, payload, label}) {
  if (!active||!payload?.length) return null
  return (
    <div className="bg-bg border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-dim font-semibold mb-1">{label}</p>}
      {payload.map((p,i)=>(
        <p key={i} style={{color:p.color||'var(--color-primary)'}}>{p.name?`${p.name}: `:''}{fmtBRL(p.value)}</p>
      ))}
    </div>
  )
}

function Card({title, note, onExpand, lblOn, onLbl, hidden, onHide, children}) {
  return (
    <div className="bg-bg2 rounded-xl border border-border p-4 hover:border-primary/20 transition">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-[10px] font-bold text-muted uppercase tracking-widest">{title}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {note && <span className="text-[9px] text-muted hidden lg:inline">{note}</span>}
          {onExpand && <button onClick={onExpand} className="text-[10px] px-2 py-1 border border-border rounded text-muted hover:border-primary hover:text-primary transition">⛶</button>}
          {onLbl && <button onClick={onLbl} className={`text-[10px] px-2 py-1 border rounded transition ${lblOn?'border-primary text-primary bg-primary/10':'border-border text-muted hover:border-primary hover:text-primary'}`}>🏷 Rótulos</button>}
          {onHide && <button onClick={onHide} className="text-[10px] px-2 py-1 border border-border rounded text-muted hover:border-primary hover:text-primary transition">{hidden?'▼':'▲'}</button>}
        </div>
      </div>
      {!hidden && children}
    </div>
  )
}

function ExpandModal({title, onClose, children}) {
  useEffect(()=>{
    const fn=e=>e.key==='Escape'&&onClose()
    window.addEventListener('keydown',fn)
    return ()=>window.removeEventListener('keydown',fn)
  },[onClose])
  return (
    <div className="fixed inset-0 z-[9000] bg-black/95 backdrop-blur-sm flex flex-col p-5 fade-up">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className="font-bold text-dim">{title}</span>
        <div className="flex gap-2">
          <button onClick={()=>window.print()} className="text-xs px-4 py-1.5 border border-border rounded text-muted hover:border-primary hover:text-primary transition">🖨 Imprimir</button>
          <button onClick={onClose} className="text-xs px-4 py-1.5 border border-border rounded text-muted hover:border-danger hover:text-danger transition">✕ Fechar</button>
        </div>
      </div>
      <div className="flex-1 bg-bg2 border border-border rounded-xl p-5 overflow-hidden flex flex-col">{children}</div>
    </div>
  )
}

function MultiPopup({label, open, onToggle, items, sel, onToggleItem, onAll, onNone, getColor}) {
  const ref=useRef(null)
  useEffect(()=>{
    if (!open) return
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))onToggle()}
    document.addEventListener('mousedown',fn)
    return ()=>document.removeEventListener('mousedown',fn)
  },[open,onToggle])
  const count=sel===null?items.length:sel.size
  const isAll=sel===null||sel.size>=items.length
  return (
    <div ref={ref} className="relative">
      <button onClick={onToggle} className="flex items-center gap-1.5 px-4 py-1.5 bg-bg2 border border-border rounded-full text-xs font-semibold text-dim hover:border-primary transition whitespace-nowrap">
        {isAll?label:`${count} de ${items.length}`}
        <span className="text-muted text-[9px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 bg-bg2 border border-border rounded-xl z-[500] min-w-[220px] shadow-2xl">
          <div className="flex gap-2 px-3 py-2 border-b border-border">
            <button onClick={onAll} className="text-[10px] px-2 py-1 border border-border rounded text-muted hover:border-primary hover:text-primary transition">✓ Todos</button>
            <button onClick={onNone} className="text-[10px] px-2 py-1 border border-border rounded text-muted hover:border-danger hover:text-danger transition">✗ Nenhum</button>
          </div>
          <div className="overflow-y-auto max-h-60 py-1">
            {items.map(it=>{
              const active=sel===null||sel.has(it)
              const c=getColor?getColor(it):'#64748b'
              return (
                <div key={it} onClick={()=>onToggleItem(it)} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition text-[11px] ${active?'bg-primary/10':'hover:bg-bg3'}`}>
                  <span style={{width:7,height:7,borderRadius:'50%',background:c,flexShrink:0}}/>
                  <span className={active?'text-primary':'text-dim'}>{it}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ISel({label, value, onChange, children, style}) {
  return (
    <div style={style}>
      <div className="text-[9px] font-bold uppercase tracking-wide text-muted mb-1">{label}</div>
      <select value={value} onChange={e=>onChange(e.target.value)} className="bg-bg3 border border-border rounded-lg px-2.5 py-1.5 text-xs text-dim focus:outline-none focus:border-primary cursor-pointer appearance-none">
        {children}
      </select>
    </div>
  )
}

// ── main component ───────────────────────────────────────────────
export default function Custos() {
  const { empresaAtiva } = useEmpresa()
  const { tema } = useTheme()

  const [dados,       setDados]       = useState([])
  const [carregando,  setCarregando]  = useState(true)
  const [semDados,    setSemDados]    = useState(false)

  // global period + multi-select filters
  const [anoIni,  setAnoIni]  = useState('')
  const [mesIni,  setMesIni]  = useState('')
  const [anoFim,  setAnoFim]  = useState('')
  const [mesFim,  setMesFim]  = useState('')
  const [selCCs,  setSelCCs]  = useState(null)
  const [selCats, setSelCats] = useState(null)
  const [ccPop,   setCcPop]   = useState(false)
  const [catPop,  setCatPop]  = useState(false)

  // upload
  const [importModal, setImportModal] = useState(false)
  const [fileUpload,  setFileUpload]  = useState(null)
  const [uploading,   setUploading]   = useState(false)
  const [uploadMsg,   setUploadMsg]   = useState('')

  // card controls
  const [hidden, setHidden] = useState({line:false,stacked:false,heatmap:false,tcc:false,grp:false,abc:false,pm:false})
  const [lbls,   setLbls]   = useState({bar:false,line:false,pie:false,catbar:false,stacked:false})
  const tog    = key => setHidden(p=>({...p,[key]:!p[key]}))
  const togLbl = key => setLbls(p=>({...p,[key]:!p[key]}))

  // expand + export menu
  const [expandInfo, setExpandInfo] = useState(null)
  const [expMenu,    setExpMenu]    = useState(false)
  const expMenuRef = useRef(null)

  // heatmap drill
  const [hmDrill, setHmDrill] = useState(null)

  // ABC independent filters
  const [abcFil,    setAbcFil]    = useState({anoIni:'',mesIni:'',anoFim:'',mesFim:'',cat:'',curva:'',search:''})
  const [abcSelCCs, setAbcSelCCs] = useState(null)
  const [abcCcPop,  setAbcCcPop]  = useState(false)

  // PM independent filters (extended)
  const [pmFil,  setPmFil]  = useState({anoIni:'',mesIni:'',anoFim:'',mesFim:'',cat:'',cc:'',curva:'',search:'',showVariacao:true,showQtde:false,onlyAllMeses:false})
  const [pmSort, setPmSort] = useState({col:'totalval',dir:-1})

  // Grupo independent filters
  const [grpFil,       setGrpFil]       = useState({anoIni:'',mesIni:'',anoFim:'',mesFim:''})
  const [grpCC,        setGrpCC]        = useState('')
  const [grpShowDelta, setGrpShowDelta] = useState(true)
  const [grpDrill,     setGrpDrill]     = useState(null)

  const fileRef  = useRef(null)
  const initRef  = useRef(false)

  // theme-reactive colors for SVG/Recharts attributes
  const C = useMemo(()=>({
    grid:    tema==='light'?'#e2e8f0':'#252b3b',
    tick:    tema==='light'?'#64748b':'#64748b',
    dim:     tema==='light'?'#475569':'#dde3ed',
    bg2:     tema==='light'?'#ffffff':'#161922',
    bg3:     tema==='light'?'#f8fafc':'#1c2030',
    primary: tema==='light'?'#0ea574':'#2dd4a0',
    border:  tema==='light'?'#e2e8f0':'#252b3b',
    muted:   tema==='light'?'#64748b':'#64748b',
  }),[tema])

  // ── load ─────────────────────────────────────────────────────
  const CACHE_KEY = 'movimentacoes'
  const carregar = useCallback(async ()=>{
    const cached = getCached(CACHE_KEY, empresaAtiva?.id)
    if (cached) {
      setDados(cached); setSemDados(cached.length === 0); setCarregando(false); return
    }
    try {
      setCarregando(true)
      const res = await api.get('/movimentacoes/')
      setCached(CACHE_KEY, res.data, empresaAtiva?.id)
      if (!res.data.length) { setSemDados(true); setDados([]) }
      else { setSemDados(false); setDados(res.data) }
    } catch { setSemDados(true) }
    finally { setCarregando(false) }
  },[empresaAtiva?.id])
  useEffect(()=>{ carregar() },[carregar])

  // reset filter initialization when company changes so dates re-initialize
  useEffect(()=>{ initRef.current = false },[empresaAtiva?.id])

  const lsKey = `filters_custos_${empresaAtiva?.id||'default'}`

  useEffect(()=>{
    if (!dados.length||initRef.current) return
    initRef.current=true
    try {
      const saved=localStorage.getItem(lsKey)
      if (saved) {
        const s=JSON.parse(saved)
        if (s.anoIni) setAnoIni(s.anoIni)
        if (s.mesIni) setMesIni(s.mesIni)
        if (s.anoFim) setAnoFim(s.anoFim)
        if (s.mesFim) setMesFim(s.mesFim)
        setSelCCs(s.selCCs!=null?new Set(s.selCCs):null)
        setSelCats(s.selCats!=null?new Set(s.selCats):null)
        return
      }
    } catch {}
    const meses=[...new Set(dados.map(d=>d.mes))].sort()
    if (meses.length) {
      setAnoIni(meses[0].slice(0,4));  setMesIni(meses[0].slice(5,7))
      setAnoFim(meses[meses.length-1].slice(0,4)); setMesFim(meses[meses.length-1].slice(5,7))
    }
  },[dados])

  useEffect(()=>{
    if (!initRef.current) return
    localStorage.setItem(lsKey,JSON.stringify({
      anoIni,mesIni,anoFim,mesFim,
      selCCs:selCCs?[...selCCs]:null,
      selCats:selCats?[...selCats]:null,
    }))
  },[anoIni,mesIni,anoFim,mesFim,selCCs,selCats,lsKey])

  useEffect(()=>{
    if (!expMenu) return
    const fn=e=>{if(expMenuRef.current&&!expMenuRef.current.contains(e.target))setExpMenu(false)}
    document.addEventListener('mousedown',fn); return ()=>document.removeEventListener('mousedown',fn)
  },[expMenu])

  // ── derived ──────────────────────────────────────────────────
  const selMesIni = anoIni&&mesIni?`${anoIni}-${mesIni}`:''
  const selMesFim = anoFim&&mesFim?`${anoFim}-${mesFim}`:''

  const allCCs   = useMemo(()=>[...new Set(dados.map(d=>d.cc))].sort(),[dados])
  const allCats  = useMemo(()=>[...new Set(dados.map(d=>d.grupo))].sort(),[dados])
  const allMeses = useMemo(()=>[...new Set(dados.map(d=>d.mes))].sort(),[dados])
  const allAnos  = useMemo(()=>[...new Set(dados.map(d=>d.mes.slice(0,4)))].sort(),[dados])

  const effCCs  = selCCs  !==null ? selCCs  : new Set(allCCs)
  const effCats = selCats !==null ? selCats : new Set(allCats)
  const temFiltro = selCCs!==null||selCats!==null||selMesIni||selMesFim

  const df = useMemo(()=>dados.filter(d=>{
    if (!effCCs.has(d.cc))     return false
    if (!effCats.has(d.grupo)) return false
    if (selMesIni&&d.mes<selMesIni) return false
    if (selMesFim&&d.mes>selMesFim) return false
    return true
  }),[dados,effCCs,effCats,selMesIni,selMesFim])

  // ── KPI computations ─────────────────────────────────────────
  const totalGasto = useMemo(()=>df.reduce((s,d)=>s+d.valor,0),[df])
  const totalQtde  = useMemo(()=>df.reduce((s,d)=>s+d.qtde,0),[df])
  const mesesUniq  = useMemo(()=>[...new Set(df.map(d=>d.mes))].sort(),[df])
  const ccsUniq    = useMemo(()=>[...new Set(df.map(d=>d.cc))].sort(),[df])

  // monthly series for sparklines
  const mesSeriesValor = useMemo(()=>{
    const m={}; df.forEach(d=>{m[d.mes]=(m[d.mes]||0)+d.valor})
    return allMeses.map(mes=>m[mes]||0)
  },[df,allMeses])
  const mesSeriesQtde = useMemo(()=>{
    const m={}; df.forEach(d=>{m[d.mes]=(m[d.mes]||0)+d.qtde})
    return allMeses.map(mes=>m[mes]||0)
  },[df,allMeses])
  const mesSeriesPreco = useMemo(()=>{
    const mv={},mq={}
    df.forEach(d=>{mv[d.mes]=(mv[d.mes]||0)+d.valor;mq[d.mes]=(mq[d.mes]||0)+d.qtde})
    return allMeses.map(mes=>mq[mes]>0?(mv[mes]||0)/mq[mes]:0)
  },[df,allMeses])

  const trend = useCallback((series)=>{
    const vals=series.filter(v=>v>0)
    if (vals.length<2) return null
    const last=vals[vals.length-1], prev=vals[vals.length-2]
    const pct=prev>0?(last-prev)/prev*100:0
    return {pct:Math.abs(pct).toFixed(1),up:pct>1,dn:pct<-1}
  },[])

  // top CCs for KPI "Maior Centro"
  const topCCs = useMemo(()=>{
    const m={}; df.forEach(d=>{m[d.cc]=(m[d.cc]||0)+d.valor})
    return Object.entries(m).sort(([,a],[,b])=>b-a).slice(0,3).map(([cc,v])=>({cc,v}))
  },[df])

  // ── chart data ────────────────────────────────────────────────
  const porCC = useMemo(()=>{
    const m={}; df.forEach(d=>{m[d.cc]=(m[d.cc]||0)+d.valor})
    return Object.entries(m).sort(([,a],[,b])=>b-a).map(([cc,total])=>({cc,total}))
  },[df])

  // Evolução mensal: top 5 CCs as separate lines
  const {multiLineData,top5CCs} = useMemo(()=>{
    const ccTot={}; df.forEach(d=>{ccTot[d.cc]=(ccTot[d.cc]||0)+d.valor})
    const top5=Object.entries(ccTot).sort(([,a],[,b])=>b-a).slice(0,5).map(([cc])=>cc)
    const byMes={}
    df.forEach(d=>{
      if (!top5.includes(d.cc)) return
      if (!byMes[d.mes]) byMes[d.mes]={mes:mesLbl(d.mes)}
      byMes[d.mes][d.cc]=(byMes[d.mes][d.cc]||0)+d.valor
    })
    return {multiLineData:Object.entries(byMes).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v),top5CCs:top5}
  },[df])

  const porGrupo = useMemo(()=>{
    const m={}; df.forEach(d=>{m[d.grupo]=(m[d.grupo]||0)+d.valor})
    return Object.entries(m).sort(([,a],[,b])=>b-a).map(([nome,valor])=>({nome,valor}))
  },[df])

  const pieData = useMemo(()=>{
    const top = porGrupo.slice(0,10)
    const rest = porGrupo.slice(10)
    if (!rest.length) return top
    return [...top, {nome:`Outros (${rest.length})`, valor:rest.reduce((s,r)=>s+r.valor,0)}]
  },[porGrupo])

  const {stackData,stackCCs} = useMemo(()=>{
    const ccTot={}; df.forEach(d=>{ccTot[d.cc]=(ccTot[d.cc]||0)+d.valor})
    const top10=Object.entries(ccTot).sort(([,a],[,b])=>b-a).slice(0,10).map(([cc])=>cc)
    const map={}
    df.forEach(d=>{
      if (!top10.includes(d.cc)) return
      if (!map[d.mes]) map[d.mes]={mes:mesLbl(d.mes)}
      map[d.mes][d.cc]=(map[d.mes][d.cc]||0)+d.valor
    })
    const stackData=Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>{
      v._total=top10.reduce((s,cc)=>s+(v[cc]||0),0)
      return v
    })
    return {stackData,stackCCs:top10}
  },[df])

  // ── heatmap ──────────────────────────────────────────────────
  const hmData = useMemo(()=>{
    const m={}
    df.forEach(d=>{
      if (!m[d.cc]) m[d.cc]={}
      m[d.cc][d.mes]=(m[d.cc][d.mes]||0)+d.valor
    })
    return m
  },[df])

  const hmDrillData = useMemo(()=>{
    if (!hmDrill) return null
    const {type,cc,mes,cat}=hmDrill
    if (type==='cc-cats') {
      const m={}; df.filter(d=>d.cc===cc).forEach(d=>{m[d.grupo]=(m[d.grupo]||0)+d.valor})
      return {type,cc,items:Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({label:k,value:v}))}
    }
    if (type==='cc-items') {
      const m={}; df.filter(d=>d.cc===cc).forEach(d=>{if(!m[d.item])m[d.item]={value:0,qtde:0};m[d.item].value+=d.valor;m[d.item].qtde+=d.qtde})
      return {type,cc,items:Object.entries(m).sort((a,b)=>b[1].value-a[1].value).map(([k,v])=>({label:k,...v}))}
    }
    if (type==='cell-cats') {
      const m={}; df.filter(d=>d.cc===cc&&d.mes===mes).forEach(d=>{m[d.grupo]=(m[d.grupo]||0)+d.valor})
      return {type,cc,mes,items:Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({label:k,value:v}))}
    }
    if (type==='cell-items') {
      const m={}; df.filter(d=>d.cc===cc&&d.mes===mes&&d.grupo===cat).forEach(d=>{if(!m[d.item])m[d.item]={value:0,qtde:0};m[d.item].value+=d.valor;m[d.item].qtde+=d.qtde})
      return {type,cc,mes,cat,items:Object.entries(m).sort((a,b)=>b[1].value-a[1].value).map(([k,v])=>({label:k,...v}))}
    }
    return null
  },[hmDrill,df])

  // ── tabela CC ─────────────────────────────────────────────────
  const tabelaCC = useMemo(()=>{
    const m={}
    df.forEach(d=>{
      if (!m[d.cc]) m[d.cc]={cc:d.cc,total:0,qtde:0,itens:new Set(),entradas:0}
      m[d.cc].total+=d.valor;m[d.cc].qtde+=d.qtde;m[d.cc].itens.add(d.item);m[d.cc].entradas++
    })
    return Object.values(m).sort((a,b)=>b.total-a.total).map(r=>({
      ...r,itens:r.itens.size,
      pct:totalGasto>0?(r.total/totalGasto*100).toFixed(1):'0',
      pm:r.qtde>0?r.total/r.qtde:0,
    }))
  },[df,totalGasto])

  // ── ABC (raw dados, independent) ──────────────────────────────
  const abcData = useMemo(()=>{
    const ini=abcFil.anoIni&&abcFil.mesIni?`${abcFil.anoIni}-${abcFil.mesIni}`:''
    const fim=abcFil.anoFim&&abcFil.mesFim?`${abcFil.anoFim}-${abcFil.mesFim}`:''
    const effAbc=abcSelCCs!==null?abcSelCCs:new Set(allCCs)
    const search=abcFil.search.toLowerCase()
    const m={}
    dados.forEach(d=>{
      if (!effAbc.has(d.cc)) return
      if (abcFil.cat&&d.grupo!==abcFil.cat) return
      if (ini&&d.mes<ini) return
      if (fim&&d.mes>fim) return
      if (search&&!d.item.toLowerCase().includes(search)) return
      if (!m[d.item]) m[d.item]={item:d.item,grupo:d.grupo,total:0,qtde:0,entradas:0}
      m[d.item].total+=d.valor;m[d.item].qtde+=d.qtde;m[d.item].entradas++
    })
    const rows=Object.values(m).sort((a,b)=>b.total-a.total)
    const totalV=rows.reduce((s,r)=>s+r.total,0)
    let acc=0
    rows.forEach(r=>{const prevP=totalV>0?acc/totalV:0;acc+=r.total;r.abc=prevP<0.80?'A':prevP<0.95?'B':'C';r.pm=r.qtde>0?r.total/r.qtde:0})
    return abcFil.curva?rows.filter(r=>r.abc===abcFil.curva):rows
  },[dados,abcFil,abcSelCCs,allCCs])

  // ── PM Mensal (raw dados, fully independent) ──────────────────
  const {pmRows,pmMeses} = useMemo(()=>{
    const ini=pmFil.anoIni&&pmFil.mesIni?`${pmFil.anoIni}-${pmFil.mesIni}`:''
    const fim=pmFil.anoFim&&pmFil.mesFim?`${pmFil.anoFim}-${pmFil.mesFim}`:''
    const search=pmFil.search.toLowerCase()

    const filtered=dados.filter(d=>{
      if (!d.mes) return false
      if (pmFil.cat&&d.grupo!==pmFil.cat) return false
      if (pmFil.cc&&d.cc!==pmFil.cc) return false
      if (ini&&d.mes<ini) return false
      if (fim&&d.mes>fim) return false
      if (search&&!d.item.toLowerCase().includes(search)) return false
      return true
    })

    const byItem={}, mSet=new Set()
    filtered.forEach(d=>{
      mSet.add(d.mes)
      const key=`${d.item}|||${d.grupo}`
      if (!byItem[key]) byItem[key]={item:d.item,grupo:d.grupo,meses:{},totalVal:0,totalQtde:0}
      if (!byItem[key].meses[d.mes]) byItem[key].meses[d.mes]={t:0,q:0}
      byItem[key].meses[d.mes].t+=d.valor
      byItem[key].meses[d.mes].q+=d.qtde
      byItem[key].totalVal+=d.valor
      byItem[key].totalQtde+=d.qtde
    })

    const meses=[...mSet].sort()

    let rows=Object.values(byItem).map(r=>{
      const precos={},qtdes={}
      meses.forEach(m=>{
        const v=r.meses[m]
        if (v&&v.q>0){precos[m]=v.t/v.q;qtdes[m]=v.q}
        else{precos[m]=null;qtdes[m]=null}
      })
      return {...r,precos,qtdes,totalPM:r.totalQtde>0?r.totalVal/r.totalQtde:0,presentMeses:meses.filter(m=>precos[m]!=null).length}
    })

    if (pmFil.onlyAllMeses&&meses.length>0) rows=rows.filter(r=>r.presentMeses===meses.length)

    // ABC for this filtered set
    const totalV=rows.reduce((s,r)=>s+r.totalVal,0)
    const sortedByV=[...rows].sort((a,b)=>b.totalVal-a.totalVal)
    let acc=0; const abcMap={}
    sortedByV.forEach(r=>{const prevP=totalV>0?acc/totalV:0;acc+=r.totalVal;abcMap[`${r.item}|||${r.grupo}`]=prevP<0.80?'A':prevP<0.95?'B':'C'})
    rows=rows.map(r=>({...r,abc:abcMap[`${r.item}|||${r.grupo}`]||'C'}))
    if (pmFil.curva) rows=rows.filter(r=>r.abc===pmFil.curva)

    const {col,dir}=pmSort
    rows.sort((a,b)=>{
      if (col==='item') return dir*a.item.localeCompare(b.item)
      if (col==='grupo') return dir*a.grupo.localeCompare(b.grupo)
      if (col==='abc') return dir*a.abc.localeCompare(b.abc)
      if (col==='totalval') return dir*(b.totalVal-a.totalVal)
      if (col==='totalpm') return dir*(b.totalPM-a.totalPM)
      if (col.startsWith('d_')) {
        const m=col.slice(2), mi=meses.indexOf(m), prevM=mi>0?meses[mi-1]:null
        if (!prevM) return 0
        const calc=r=>r.precos[m]!=null&&r.precos[prevM]!=null&&r.precos[prevM]>0?(r.precos[m]-r.precos[prevM])/r.precos[prevM]*100:null
        const ad=calc(a)??-Infinity, bd=calc(b)??-Infinity
        return dir*(bd-ad)
      }
      const av=a.precos[col]??-1,bv=b.precos[col]??-1
      return dir*(bv-av)
    })
    return {pmRows:rows,pmMeses:meses}
  },[dados,pmFil,pmSort])

  // ── Custo por Grupo (raw dados, independent) ──────────────────
  const {grpRows,grpMeses,grpDrillItems} = useMemo(()=>{
    const ini=grpFil.anoIni&&grpFil.mesIni?`${grpFil.anoIni}-${grpFil.mesIni}`:''
    const fim=grpFil.anoFim&&grpFil.mesFim?`${grpFil.anoFim}-${grpFil.mesFim}`:''
    const byGrupo={},mSet=new Set()
    dados.forEach(d=>{
      if (!d.mes) return
      if (grpCC&&d.cc!==grpCC) return
      if (ini&&d.mes<ini) return
      if (fim&&d.mes>fim) return
      mSet.add(d.mes)
      if (!byGrupo[d.grupo]) byGrupo[d.grupo]={grupo:d.grupo,total:0}
      byGrupo[d.grupo][d.mes]=(byGrupo[d.grupo][d.mes]||0)+d.valor
      byGrupo[d.grupo].total+=d.valor
    })
    const meses=[...mSet].sort()
    const rows=Object.values(byGrupo).sort((a,b)=>b.total-a.total)
    let drillItems=[]
    if (grpDrill) {
      const m={}
      dados.forEach(d=>{
        if (d.grupo!==grpDrill) return
        if (grpCC&&d.cc!==grpCC) return
        if (ini&&d.mes<ini) return
        if (fim&&d.mes>fim) return
        if (!m[d.item]) m[d.item]={item:d.item,total:0,qtde:0}
        m[d.item].total+=d.valor;m[d.item].qtde+=d.qtde
      })
      drillItems=Object.values(m).sort((a,b)=>b.total-a.total)
    }
    return {grpRows:rows,grpMeses:meses,grpDrillItems:drillItems}
  },[dados,grpFil,grpCC,grpDrill])

  // ── upload ────────────────────────────────────────────────────
  async function fazerUpload() {
    if (!fileUpload) return
    const fd=new FormData(); fd.append('arquivo',fileUpload)
    try {
      setUploading(true);setUploadMsg('')
      const res=await api.post('/upload/',fd,{headers:{'Content-Type':'multipart/form-data'}})
      if (res.data.ok) {
        setUploadMsg(`✓ ${res.data.total_registros.toLocaleString('pt-BR')} registros importados`)
        invalidateCache(CACHE_KEY)
        setTimeout(()=>{setImportModal(false);setFileUpload(null);setUploadMsg('');initRef.current=false;carregar()},1500)
      } else setUploadMsg(`Erro: ${res.data.erro}`)
    } catch(e){setUploadMsg(e.response?.data?.erro||'Erro ao conectar com o servidor.')}
    finally{setUploading(false)}
  }

  function doExportCSVCC(){
    exportCSV('custos_por_cc.csv',[['Centro de Custo','Valor Total','%','Qtde','Preço Médio','Itens','Entradas'],...tabelaCC.map(r=>[r.cc,r.total.toFixed(2),r.pct+'%',r.qtde.toFixed(2),r.pm.toFixed(2),r.itens,r.entradas])])
  }
  function doExportCSVPM(){
    exportCSV('preco_medio_mensal.csv',[['Item','Grupo','Curva',...pmMeses.map(mesLbl),'Qtde Total','Total'],...pmRows.map(r=>[r.item,r.grupo,r.abc,...pmMeses.map(m=>r.precos[m]!=null?r.precos[m].toFixed(2):''),r.totalQtde.toFixed(2),r.totalVal.toFixed(2)])])
  }

  function clearGlobalFilters(){
    localStorage.removeItem(lsKey)
    setSelCCs(null);setSelCats(null)
    const meses=[...new Set(dados.map(d=>d.mes))].sort()
    if (meses.length){setAnoIni(meses[0].slice(0,4));setMesIni(meses[0].slice(5,7));setAnoFim(meses[meses.length-1].slice(0,4));setMesFim(meses[meses.length-1].slice(5,7))}
  }

  if (carregando) return <SkeletonCustos />

  const custoMedioMensal = mesesUniq.length>0?totalGasto/mesesUniq.length:0
  const precoMedioUnit   = totalQtde>0?totalGasto/totalQtde:0

  // ── render ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── filter bar ── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 bg-bg2 border-b border-border">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-xs font-bold text-primary whitespace-nowrap">⚡ Filtros</span>

        <MultiPopup label="Todos os CCs" open={ccPop} onToggle={()=>setCcPop(p=>!p)}
          items={allCCs} sel={selCCs} getColor={ccCor}
          onAll={()=>setSelCCs(null)} onNone={()=>setSelCCs(new Set())}
          onToggleItem={cc=>{const next=selCCs===null?new Set(allCCs):new Set(selCCs);next.has(cc)?next.delete(cc):next.add(cc);setSelCCs(next.size===allCCs.length?null:next)}}/>

        <MultiPopup label="Todos os grupos" open={catPop} onToggle={()=>setCatPop(p=>!p)}
          items={allCats} sel={selCats} getColor={c=>{let h=0;for(const x of c)h=(h*31+x.charCodeAt(0))>>>0;return CORES[h%CORES.length]}}
          onAll={()=>setSelCats(null)} onNone={()=>setSelCats(new Set())}
          onToggleItem={cat=>{const next=selCats===null?new Set(allCats):new Set(selCats);next.has(cat)?next.delete(cat):next.add(cat);setSelCats(next.size===allCats.length?null:next)}}/>

        <div className="flex items-center gap-1.5">
          <select value={anoIni} onChange={e=>setAnoIni(e.target.value)} className="bg-bg3 border border-border rounded-full px-3 py-1.5 text-xs font-semibold text-dim focus:outline-none focus:border-primary cursor-pointer appearance-none">
            <option value="">Ano</option>{allAnos.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
          <select value={mesIni} onChange={e=>setMesIni(e.target.value)} className="bg-bg3 border border-border rounded-full px-3 py-1.5 text-xs font-semibold text-dim focus:outline-none focus:border-primary cursor-pointer appearance-none">
            <option value="">Mês</option>{mMeses().map(m=><option key={m.v} value={m.v}>{m.n}</option>)}
          </select>
          <span className="text-muted text-xs">→</span>
          <select value={anoFim} onChange={e=>setAnoFim(e.target.value)} className="bg-bg3 border border-border rounded-full px-3 py-1.5 text-xs font-semibold text-dim focus:outline-none focus:border-primary cursor-pointer appearance-none">
            <option value="">Ano</option>{allAnos.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
          <select value={mesFim} onChange={e=>setMesFim(e.target.value)} className="bg-bg3 border border-border rounded-full px-3 py-1.5 text-xs font-semibold text-dim focus:outline-none focus:border-primary cursor-pointer appearance-none">
            <option value="">Mês</option>{mMeses().map(m=><option key={m.v} value={m.v}>{m.n}</option>)}
          </select>
        </div>

        {temFiltro && <button onClick={clearGlobalFilters} className="text-xs text-muted hover:text-danger transition px-2">✕ Limpar</button>}
        <div className="flex-1"/>

        <button onClick={()=>window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-bg3 text-xs font-medium text-dim hover:border-primary hover:text-primary transition">🖨 Imprimir</button>

        <div ref={expMenuRef} className="relative">
          <button onClick={()=>setExpMenu(p=>!p)} className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-xs font-bold text-primary hover:bg-primary/20 transition">📥 Exportar ▾</button>
          {expMenu && (
            <div className="absolute right-0 top-full mt-2 bg-bg2 border border-border rounded-xl shadow-2xl min-w-[200px] z-50 overflow-hidden">
              <div className="text-[9px] font-bold uppercase tracking-wide text-muted px-4 pt-2.5 pb-1">Dados</div>
              <button onClick={()=>{setExpMenu(false);doExportCSVCC()}} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-dim hover:bg-bg3 transition text-left">📊 CSV resumo por CC</button>
              <button onClick={()=>{setExpMenu(false);doExportCSVPM()}} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-dim hover:bg-bg3 transition text-left">📝 CSV preço médio mensal</button>
            </div>
          )}
        </div>

        <button onClick={()=>{setImportModal(true);setUploadMsg('');setFileUpload(null)}} className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-bg text-xs font-bold hover:bg-primary/90 transition">↑ Importar Excel</button>
      </div>

      {semDados ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 fade-up">
          <div className="text-5xl">📊</div>
          <p className="text-dim font-semibold">Nenhum dado importado ainda</p>
          <p className="text-muted text-sm">Importe uma planilha Excel ou CSV para visualizar o dashboard.</p>
          <button onClick={()=>setImportModal(true)} className="px-5 py-2.5 rounded-lg bg-primary text-bg text-sm font-semibold hover:bg-primary/90 transition">Importar Excel</button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 fade-up">

          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {/* 1 Total Movimentado */}
            {(()=>{const t=trend(mesSeriesValor);return(
              <div className="bg-bg2 rounded-xl border border-border px-4 py-3 hover:border-primary/30 transition">
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">🔶 Total Movimentado</p>
                <p className="text-xl font-extrabold text-primary font-mono leading-tight">{fmtBRL(totalGasto)}</p>
                <p className="text-[10px] text-muted mt-1">{ccsUniq.length} CCs · {mesesUniq.length} meses</p>
                <div className="mt-2"><Sparkline vals={mesSeriesValor} w={80} h={24}/></div>
                {t&&<div className="flex items-center gap-1 mt-1"><span className={`text-xs font-bold ${t.up?'text-danger':t.dn?'text-primary':'text-muted'}`}>{t.up?'↑':t.dn?'↓':'→'} {t.pct}%</span><span className="text-[9px] text-muted">vs mês ant.</span></div>}
              </div>
            )})()}
            {/* 2 Qtde Movimentada */}
            {(()=>{const t=trend(mesSeriesQtde);return(
              <div className="bg-bg2 rounded-xl border border-border px-4 py-3 hover:border-primary/30 transition">
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">🔷 Qtde Movimentada</p>
                <p className="text-xl font-extrabold text-primary font-mono leading-tight">{fmtN2(totalQtde)}</p>
                <p className="text-[10px] text-muted mt-1">unidades no período</p>
                <div className="mt-2"><Sparkline vals={mesSeriesQtde} w={80} h={24}/></div>
                {t&&<div className="flex items-center gap-1 mt-1"><span className={`text-xs font-bold ${t.up?'text-danger':t.dn?'text-primary':'text-muted'}`}>{t.up?'↑':t.dn?'↓':'→'} {t.pct}%</span><span className="text-[9px] text-muted">vs mês ant.</span></div>}
              </div>
            )})()}
            {/* 3 Preço Médio / Un */}
            {(()=>{const t=trend(mesSeriesPreco);return(
              <div className="bg-bg2 rounded-xl border border-border px-4 py-3 hover:border-primary/30 transition">
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">💲 Preço Médio / Un</p>
                <p className="text-xl font-extrabold text-primary font-mono leading-tight">{precoMedioUnit>0?fmtP(precoMedioUnit):'—'}</p>
                <p className="text-[10px] text-muted mt-1">custo unitário médio</p>
                <div className="mt-2"><Sparkline vals={mesSeriesPreco} w={80} h={24}/></div>
                {t&&<div className="flex items-center gap-1 mt-1"><span className={`text-xs font-bold ${t.up?'text-danger':t.dn?'text-primary':'text-muted'}`}>{t.up?'↑':t.dn?'↓':'→'} {t.pct}%</span><span className="text-[9px] text-muted">vs mês ant.</span></div>}
              </div>
            )})()}
            {/* 4 Custo Médio Período */}
            {(()=>{const t=trend(mesSeriesValor);return(
              <div className="bg-bg2 rounded-xl border border-border px-4 py-3 hover:border-primary/30 transition">
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">📅 Custo Médio Período</p>
                <p className="text-xl font-extrabold text-primary font-mono leading-tight">{fmtBRL(custoMedioMensal)}</p>
                <p className="text-[10px] text-muted mt-1">média mensal · {mesesUniq.length} meses</p>
                <div className="mt-2"><Sparkline vals={mesSeriesValor} w={80} h={24}/></div>
                {t&&<div className="flex items-center gap-1 mt-1"><span className={`text-xs font-bold ${t.up?'text-danger':t.dn?'text-primary':'text-muted'}`}>{t.up?'↑':t.dn?'↓':'→'} {t.pct}%</span><span className="text-[9px] text-muted">vs mês ant.</span></div>}
              </div>
            )})()}
            {/* 5 Maior Centro */}
            <div className="bg-bg2 rounded-xl border border-border px-4 py-3 hover:border-primary/30 transition">
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">🏆 Maior Centro</p>
              {topCCs[0] ? <>
                <p className="text-base font-extrabold text-primary leading-tight truncate">{topCCs[0].cc}</p>
                <p className="text-[10px] text-muted mt-1">{fmtK(topCCs[0].v)} · {totalGasto>0?(topCCs[0].v/totalGasto*100).toFixed(1):'0'}%</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {topCCs.map(({cc})=>(
                    <span key={cc} style={{background:ccCor(cc)+'22',border:`1px solid ${ccCor(cc)}55`,color:ccCor(cc),fontSize:9,padding:'1px 6px',borderRadius:4,whiteSpace:'nowrap',maxWidth:90,overflow:'hidden',textOverflow:'ellipsis'}}>
                      {cc.split(' ')[0]}…
                    </span>
                  ))}
                </div>
              </> : <p className="text-muted text-sm">—</p>}
            </div>
          </div>

          {/* ── Barras CC + Evolução Mensal top 5 ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Custo por Centro de Custo" onExpand={()=>setExpandInfo({title:'Custo por CC',key:'bar'})} lblOn={lbls.bar} onLbl={()=>togLbl('bar')}>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={porCC} layout="vertical" margin={{top:0,right:70,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
                  <XAxis type="number" tickFormatter={fmtK} tick={{fill:C.tick,fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="cc" tick={<CustomYTick maxChars={20}/>} axisLine={false} tickLine={false} width={135} interval={0}/>
                  <Tooltip content={<Tip/>} cursor={{fill:C.bg3}}/>
                  <Bar dataKey="total" radius={[0,4,4,0]} maxBarSize={22}>
                    {porCC.map((_,i)=><Cell key={i} fill={ccCor(porCC[i].cc)}/>)}
                    {lbls.bar&&<LabelList dataKey="total" position="right" formatter={fmtK} style={{fill:C.tick,fontSize:9,fontWeight:700}}/>}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Evolução Mensal — Top 5 Centros de Custo" onExpand={()=>setExpandInfo({title:'Evolução Mensal',key:'line'})} lblOn={lbls.line} onLbl={()=>togLbl('line')} hidden={hidden.line} onHide={()=>tog('line')}>
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={multiLineData} margin={{top:4,right:16,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
                  <XAxis dataKey="mes" tick={{fill:C.tick,fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={fmtK} tick={{fill:C.tick,fontSize:10}} axisLine={false} tickLine={false} width={60}/>
                  <Tooltip content={<Tip/>}/>
                  <Legend iconSize={8} formatter={v=><span style={{fontSize:10,color:C.tick}}>{v.length>18?v.slice(0,18)+'…':v}</span>}/>
                  {top5CCs.map(cc=>(
                    <Line key={cc} type="monotone" dataKey={cc} stroke={ccCor(cc)} strokeWidth={2} dot={false} activeDot={{r:4}}>
                      {lbls.line&&<LabelList dataKey={cc} position="top" formatter={fmtK} style={{fill:C.tick,fontSize:8,fontWeight:700}}/>}
                    </Line>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* ── Donut + Ranking Categoria ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Distribuição por Categoria" onExpand={()=>setExpandInfo({title:'Distribuição por Categoria',key:'pie'})} lblOn={lbls.pie} onLbl={()=>togLbl('pie')}>
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie data={pieData} dataKey="valor" nameKey="nome" cx="50%" cy="46%" outerRadius={110} innerRadius={58} paddingAngle={2}
                    label={lbls.pie ? ({cx,cy,midAngle,innerRadius,outerRadius,percent}) => {
                      if (percent < 0.03) return null
                      const RADIAN=Math.PI/180, r=innerRadius+(outerRadius-innerRadius)*0.55
                      const x=cx+r*Math.cos(-midAngle*RADIAN), y=cy+r*Math.sin(-midAngle*RADIAN)
                      return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700}>{`${(percent*100).toFixed(1)}%`}</text>
                    } : false}
                    labelLine={false}
                    onClick={(entry,i)=>{
                      if (entry.nome.startsWith('Outros')) return
                      const cur=selCats
                      if (cur!==null&&cur.size===1&&[...cur][0]===entry.nome) setSelCats(null)
                      else setSelCats(new Set([entry.nome]))
                    }}>
                    {pieData.map((d,i)=>{
                      const isOtros=d.nome.startsWith('Outros')
                      const base=isOtros?'#64748b':CORES[i%10]
                      const dimmed=selCats!==null&&!selCats.has(d.nome)&&!isOtros
                      return <Cell key={i} fill={base} opacity={dimmed?0.35:1} cursor={isOtros?'default':'pointer'}/>
                    })}
                  </Pie>
                  <Tooltip formatter={(v,n)=>[fmtBRL(v),n]} contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,fontSize:11}}/>
                  <Legend iconSize={10} iconType="circle" layout="horizontal" verticalAlign="bottom" align="center"
                    formatter={v=><span style={{fontSize:10,color:C.dim}}>{v.length>30?v.slice(0,30)+'…':v}</span>}/>
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Ranking por Categoria (R$)" onExpand={()=>setExpandInfo({title:'Ranking por Categoria',key:'catbar'})} lblOn={lbls.catbar} onLbl={()=>togLbl('catbar')}>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={porGrupo.slice(0,14)} layout="vertical" margin={{top:0,right:70,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/>
                  <XAxis type="number" tickFormatter={fmtK} tick={{fill:C.tick,fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="nome" tick={{fill:C.dim,fontSize:10}} axisLine={false} tickLine={false} width={140}/>
                  <Tooltip content={<Tip/>} cursor={{fill:C.bg3}}/>
                  <Bar dataKey="valor" radius={[0,4,4,0]} maxBarSize={18}>
                    {porGrupo.slice(0,14).map((_,i)=><Cell key={i} fill={CORES[i%CORES.length]}/>)}
                    {lbls.catbar&&<LabelList dataKey="valor" position="right" formatter={fmtK} style={{fill:C.tick,fontSize:9,fontWeight:700}}/>}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* ── Stacked Mensal ── */}
          <Card title="Evolução Mensal por Centro de Custo" onExpand={()=>setExpandInfo({title:'Evolução Mensal por CC',key:'stacked'})} lblOn={lbls.stacked} onLbl={()=>togLbl('stacked')} hidden={hidden.stacked} onHide={()=>tog('stacked')}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={stackData} margin={{top:lbls.stacked?28:4,right:16,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/>
                <XAxis dataKey="mes" tick={{fill:C.tick,fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={fmtK} tick={{fill:C.tick,fontSize:10}} axisLine={false} tickLine={false} width={60}/>
                <Tooltip content={<Tip/>} cursor={{fill:C.bg3}}/>
                <Legend iconSize={8} formatter={v=><span style={{fontSize:10,color:C.tick}}>{v.length>18?v.slice(0,18)+'…':v}</span>}/>
                {stackCCs.map((cc,i)=>(
                  <Bar key={cc} dataKey={cc} stackId="a" fill={ccCor(cc)} maxBarSize={44}
                    radius={i===stackCCs.length-1?[3,3,0,0]:undefined}>
                    {i===stackCCs.length-1&&lbls.stacked&&(
                      <LabelList dataKey="_total" position="top" formatter={fmtK}
                        style={{fill:C.tick,fontSize:9,fontWeight:700}}/>
                    )}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* ── Heatmap ── */}
          <Card title="Heatmap — Centro de Custo × Mês (R$)" note="Análise individual por CC · cor por intensidade relativa" onExpand={()=>setExpandInfo({title:'Heatmap CC × Mês',key:'heatmap'})} hidden={hidden.heatmap} onHide={()=>tog('heatmap')}>
            {/* heat legend */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[9px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Baixo</span>
              <div style={{flex:1,height:9,borderRadius:5,background:'linear-gradient(to right,rgba(45,212,160,.25),rgba(93,184,140,.45),rgba(140,156,120,.62),rgba(188,128,100,.82),rgba(235,100,80,1))'}}/>
              <span className="text-[9px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Alto</span>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table style={{borderCollapse:'collapse',fontSize:11,minWidth:500,width:'100%'}}>
                <thead>
                  <tr>
                    <th style={{padding:'5px 10px',fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',color:'var(--color-muted)',textAlign:'left',background:'var(--color-bg3)',minWidth:140,position:'sticky',left:0,top:0,zIndex:20}}>Centro de Custo</th>
                    {mesesUniq.map(m=>(
                      <th key={m} style={{padding:'5px 7px',fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',color:'var(--color-muted)',textAlign:'center',background:'var(--color-bg3)',whiteSpace:'nowrap',position:'sticky',top:0,zIndex:10}}>{mesLbl(m)}</th>
                    ))}
                    <th style={{padding:'5px 7px',fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',color:'var(--color-primary)',textAlign:'right',background:'var(--color-bg3)',whiteSpace:'nowrap',position:'sticky',top:0,zIndex:10}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(hmData).sort((a,b)=>{
                    const ta=mesesUniq.reduce((s,m)=>s+(hmData[a][m]||0),0)
                    const tb=mesesUniq.reduce((s,m)=>s+(hmData[b][m]||0),0)
                    return tb-ta
                  }).map(cc=>{
                    const row=hmData[cc]
                    const rowVals=mesesUniq.map(m=>row[m]||0)
                    const maxVal=Math.max(...rowVals)||1
                    const rowTotal=rowVals.reduce((s,v)=>s+v,0)
                    const isDrillCC=hmDrill?.cc===cc
                    return (
                      <tr key={cc}>
                        <td onClick={()=>{if(!isDrillCC)setHmDrill({type:'cc-cats',cc});else if(hmDrill.type==='cc-cats')setHmDrill({type:'cc-items',cc});else setHmDrill(null)}}
                          style={{padding:'6px 10px',fontWeight:500,color:isDrillCC?'var(--color-primary)':'var(--color-dim)',background:'var(--color-bg2)',whiteSpace:'nowrap',fontSize:11,cursor:'pointer',position:'sticky',left:0,zIndex:1,borderLeft:isDrillCC?'2px solid var(--color-primary)':'2px solid transparent',transition:'color .15s'}}>
                          <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:ccCor(cc),marginRight:6}}/>
                          {cc}
                        </td>
                        {mesesUniq.map(m=>{
                          const val=row[m]||0
                          const intensity=maxVal>0?val/maxVal:0
                          const {bg,fg}=heatColor(intensity)
                          const selected=hmDrill?.cc===cc&&hmDrill?.mes===m
                          return (
                            <td key={m} onClick={()=>{if(!val)return;if(!hmDrill||hmDrill.cc!==cc||hmDrill.mes!==m)setHmDrill({type:'cell-cats',cc,mes:m});else setHmDrill(null)}}
                              style={{padding:0,border:'1px solid rgba(15,17,23,.5)',background:bg,cursor:val?'pointer':'default',outline:selected?'2.5px solid #fff':'none',outlineOffset:-2}}>
                              <div style={{minHeight:42,minWidth:66,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'4px 3px'}}>
                                {val>0&&<>
                                  <span style={{fontSize:9,fontWeight:700,color:fg,fontFamily:'monospace'}}>{fmtK(val)}</span>
                                  <span style={{fontSize:7,color:fg,opacity:.7,marginTop:1}}>{(intensity*100).toFixed(0)}%</span>
                                </>}
                              </div>
                            </td>
                          )
                        })}
                        <td style={{padding:'6px 10px',textAlign:'right',fontWeight:700,color:'var(--color-primary)',fontFamily:'monospace',fontSize:10,background:'var(--color-bg2)',whiteSpace:'nowrap',borderLeft:'1px solid var(--color-border)'}}>
                          {fmtK(rowTotal)}
                          <div style={{fontSize:7,color:'var(--color-muted)',fontWeight:400}}>{totalGasto>0?(rowTotal/totalGasto*100).toFixed(1)+'%':''}</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Drill panel */}
            {hmDrillData && (
              <div className="mt-4 bg-bg3 border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <p className="text-xs font-bold text-dim">
                    {hmDrillData.cc}{hmDrillData.mes&&` · ${mesLbl(hmDrillData.mes)}`}{hmDrillData.cat&&` · ${hmDrillData.cat}`}
                    {' — '}{hmDrillData.type==='cc-cats'?'Grupos':hmDrillData.type==='cc-items'?'Itens':hmDrillData.type==='cell-cats'?'Grupos do mês':'Itens do mês'}
                  </p>
                  <div className="flex items-center gap-2">
                    {hmDrillData.type==='cell-cats'&&<span className="text-[9px] text-muted">Clique em um grupo para ver itens</span>}
                    <button onClick={()=>setHmDrill(null)} className="text-[10px] text-muted hover:text-danger transition">✕ fechar</button>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {hmDrillData.items.slice(0,40).map((r,i)=>{
                    const maxV=hmDrillData.items[0]?.value||1
                    const drillTotal=hmDrillData.items.reduce((s,x)=>s+x.value,0)
                    return (
                      <div key={i} onClick={()=>{if(hmDrillData.type==='cell-cats')setHmDrill({type:'cell-items',cc:hmDrillData.cc,mes:hmDrillData.mes,cat:r.label})}}
                        className={`flex items-center gap-2 text-[11px] ${hmDrillData.type==='cell-cats'?'cursor-pointer hover:bg-bg/40 rounded px-1':''}`}>
                        <span className="text-dim truncate" style={{minWidth:160,maxWidth:220}}>{r.label}</span>
                        <div className="flex-1 h-1.5 bg-bg rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{width:`${(r.value/maxV*100).toFixed(0)}%`}}/></div>
                        {(hmDrillData.type==='cc-items'||hmDrillData.type==='cell-items')&&<span className="text-muted font-mono" style={{minWidth:55,textAlign:'right'}}>{r.qtde>0?fmtN2(r.qtde):'—'}</span>}
                        <span className="text-primary font-bold font-mono" style={{minWidth:80,textAlign:'right'}}>{fmtBRL(r.value)}</span>
                        <span className="text-muted" style={{minWidth:38,textAlign:'right'}}>{drillTotal>0?((r.value/drillTotal)*100).toFixed(1)+'%':''}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* ── Tabela CC ── */}
          <Card title="Resumo por Centro de Custo" onExpand={()=>setExpandInfo({title:'Resumo por CC',key:'tcc'})} hidden={hidden.tcc} onHide={()=>tog('tcc')}>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs" style={{borderCollapse:'collapse'}}>
                <thead className="sticky top-0 bg-bg3 z-10">
                  <tr className="text-muted uppercase tracking-wide text-[9px]">
                    {['#','Centro de Custo','Valor Total','%','Qtde','Preço Médio','Itens','Entradas'].map((h,i)=>(
                      <th key={h} className={`px-3 py-2.5 font-bold ${i<=1?'text-left':'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tabelaCC.map((r,i)=>{
                    const maxV=tabelaCC[0]?.total||1
                    return (
                      <tr key={r.cc} className="row-sep hover:bg-bg3/50 transition">
                        <td className="px-3 py-2 text-muted">{i+1}</td>
                        <td className="px-3 py-2 text-dim font-medium max-w-[200px] truncate">
                          <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:ccCor(r.cc),marginRight:5}}/>
                          {r.cc}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-primary font-bold font-mono">{fmtBRL(r.total)}</span>
                            <div style={{width:40,height:3,background:'var(--color-bg3)',borderRadius:2,overflow:'hidden',flexShrink:0}}>
                              <div style={{width:`${(r.total/maxV*100).toFixed(0)}%`,height:'100%',background:'var(--color-primary)',borderRadius:2}}/>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-muted">{r.pct}%</td>
                        <td className="px-3 py-2 text-right text-muted font-mono">{fmtN2(r.qtde)}</td>
                        <td className="px-3 py-2 text-right text-muted font-mono">{fmtBRL(r.pm)}</td>
                        <td className="px-3 py-2 text-right text-muted">{r.itens}</td>
                        <td className="px-3 py-2 text-right text-muted">{r.entradas}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 bg-bg2">
                  <tr className="border-t-2 border-primary/30 bg-primary/5">
                    <td colSpan={2} className="px-3 py-2 text-xs font-bold text-primary">Total</td>
                    <td className="px-3 py-2 text-right font-bold text-primary font-mono">{fmtBRL(totalGasto)}</td>
                    <td className="px-3 py-2 text-right font-bold text-primary">100%</td>
                    <td className="px-3 py-2 text-right font-bold text-primary font-mono">{fmtN2(totalQtde)}</td>
                    <td colSpan={3}/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* ── Custo Mensal por Grupo ── */}
          <Card title="Custo Mensal por Grupo" note="Dados completos · independente de filtros globais" onExpand={()=>setExpandInfo({title:'Custo Mensal por Grupo',key:'grp'})} hidden={hidden.grp} onHide={()=>tog('grp')}>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <ISel label="Ano Início" value={grpFil.anoIni} onChange={v=>setGrpFil(p=>({...p,anoIni:v}))}>
                <option value="">Todos</option>{allAnos.map(a=><option key={a} value={a}>{a}</option>)}
              </ISel>
              <ISel label="Mês Início" value={grpFil.mesIni} onChange={v=>setGrpFil(p=>({...p,mesIni:v}))}>
                <option value="">Todos</option>{mMeses().map(m=><option key={m.v} value={m.v}>{m.n}</option>)}
              </ISel>
              <span className="text-muted text-xs self-end pb-1.5">→</span>
              <ISel label="Ano Fim" value={grpFil.anoFim} onChange={v=>setGrpFil(p=>({...p,anoFim:v}))}>
                <option value="">Todos</option>{allAnos.map(a=><option key={a} value={a}>{a}</option>)}
              </ISel>
              <ISel label="Mês Fim" value={grpFil.mesFim} onChange={v=>setGrpFil(p=>({...p,mesFim:v}))}>
                <option value="">Todos</option>{mMeses().map(m=><option key={m.v} value={m.v}>{m.n}</option>)}
              </ISel>
              <ISel label="Centro de Custo" value={grpCC} onChange={v=>setGrpCC(v)} style={{minWidth:180}}>
                <option value="">Todos os CCs</option>{allCCs.map(c=><option key={c} value={c}>{c}</option>)}
              </ISel>
              <div className="self-end pb-1.5">
                <label className="flex items-center gap-2 text-xs text-dim cursor-pointer select-none">
                  <input type="checkbox" checked={grpShowDelta} onChange={e=>setGrpShowDelta(e.target.checked)} className="accent-primary"/>
                  Mostrar variação
                </label>
              </div>
              <span className="text-[10px] text-muted self-end pb-1.5 ml-auto">{grpRows.length} grupos · {grpMeses.length} meses</span>
            </div>
            <div className="overflow-auto max-h-96">
              <table className="text-xs" style={{borderCollapse:'separate',borderSpacing:0,minWidth:600,width:'100%'}}>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wide text-muted bg-bg3 sticky left-0 z-20 border-b border-border whitespace-nowrap" style={{minWidth:160}}>Grupo ↕</th>
                    {grpMeses.map((m,i)=>(
                      <Fragment key={m}>
                        <th className="px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wide text-muted bg-bg3 border-b border-border whitespace-nowrap" style={{minWidth:85}}>{mesLbl(m)}</th>
                        {grpShowDelta&&i>0&&<th className="px-2 py-2 text-center text-[9px] font-bold uppercase tracking-wide text-muted bg-bg3 border-b border-border whitespace-nowrap" style={{minWidth:56}}>Δ</th>}
                      </Fragment>
                    ))}
                    <th className="px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wide text-primary bg-bg3 border-b border-border whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grpRows.map(r=>{
                    const isOpen=grpDrill===r.grupo
                    return (
                      <Fragment key={r.grupo}>
                        <tr className="hover:bg-bg3/40 transition cursor-pointer" onClick={()=>setGrpDrill(isOpen?null:r.grupo)}>
                          <td className="px-3 py-2 text-dim font-medium sticky left-0 bg-bg2 cell-sep whitespace-nowrap z-10" style={{maxWidth:180}}>
                            <span className="mr-1 text-muted">{isOpen?'▾':'▸'}</span>
                            <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:CORES[grpRows.indexOf(r)%CORES.length],marginRight:5}}/>
                            {r.grupo}
                          </td>
                          {grpMeses.map((m,i)=>{
                            const v=r[m]||0
                            const prev=i>0?r[grpMeses[i-1]]||0:null
                            const delta=prev!==null&&prev>0?(v-prev)/prev*100:null
                            const maxV=Math.max(...grpRows.map(x=>x[m]||0))
                            return (
                              <Fragment key={m}>
                                <td className="px-3 py-2 text-right cell-sep">
                                  {v>0?<span className="text-dim font-mono text-[11px]" style={{opacity:0.4+0.6*(v/(maxV||1))}}>{fmtK(v)}</span>:<span className="text-muted opacity-30">—</span>}
                                </td>
                                {grpShowDelta&&i>0&&<td className="px-2 py-2 text-center cell-sep">
                                  {delta!=null?<span className={`text-[9px] font-bold px-1 py-0.5 rounded ${delta>2?'text-danger bg-danger/10':delta<-2?'text-primary bg-primary/10':'text-muted'}`}>{delta>0?'▲':'▼'} {Math.abs(delta).toFixed(1)}%</span>:<span className="text-muted opacity-30 text-[9px]">—</span>}
                                </td>}
                              </Fragment>
                            )
                          })}
                          <td className="px-3 py-2 text-right font-bold text-primary font-mono cell-sep">{fmtBRL(r.total)}</td>
                        </tr>
                        {isOpen&&grpDrillItems.map(it=>(
                          <tr key={it.item} className="bg-bg3/30">
                            <td className="px-3 py-1.5 text-[11px] text-muted sticky left-0 bg-bg3/20 cell-sep-xs z-10 pl-8 truncate" style={{maxWidth:200}}>{it.item}</td>
                            {grpMeses.map((m,i)=>(
                              <Fragment key={m}>
                                <td className="px-3 py-1.5 cell-sep-xs text-right text-[10px] text-muted font-mono"/>
                                {grpShowDelta&&i>0&&<td className="px-2 py-1.5 cell-sep-xs"/>}
                              </Fragment>
                            ))}
                            <td className="px-3 py-1.5 text-right text-[11px] text-dim font-mono cell-sep-xs">{fmtBRL(it.total)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Ranking ABC ── */}
          <Card title="Ranking de Itens — Curva ABC" note="Dados completos · independente de filtros globais" onExpand={()=>setExpandInfo({title:'Ranking ABC',key:'abc'})} hidden={hidden.abc} onHide={()=>tog('abc')}>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <ISel label="Ano Início" value={abcFil.anoIni} onChange={v=>setAbcFil(p=>({...p,anoIni:v}))}>
                <option value="">Todos</option>{allAnos.map(a=><option key={a} value={a}>{a}</option>)}
              </ISel>
              <ISel label="Mês Início" value={abcFil.mesIni} onChange={v=>setAbcFil(p=>({...p,mesIni:v}))}>
                <option value="">Todos</option>{mMeses().map(m=><option key={m.v} value={m.v}>{m.n}</option>)}
              </ISel>
              <span className="text-muted text-xs self-end pb-1.5">→</span>
              <ISel label="Ano Fim" value={abcFil.anoFim} onChange={v=>setAbcFil(p=>({...p,anoFim:v}))}>
                <option value="">Todos</option>{allAnos.map(a=><option key={a} value={a}>{a}</option>)}
              </ISel>
              <ISel label="Mês Fim" value={abcFil.mesFim} onChange={v=>setAbcFil(p=>({...p,mesFim:v}))}>
                <option value="">Todos</option>{mMeses().map(m=><option key={m.v} value={m.v}>{m.n}</option>)}
              </ISel>
              <ISel label="Grupo" value={abcFil.cat} onChange={v=>setAbcFil(p=>({...p,cat:v}))}>
                <option value="">Todos os grupos</option>{allCats.map(c=><option key={c} value={c}>{c}</option>)}
              </ISel>
              <ISel label="Curva" value={abcFil.curva} onChange={v=>setAbcFil(p=>({...p,curva:v}))}>
                <option value="">Todas</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
              </ISel>
              <MultiPopup label="Todos os CCs" open={abcCcPop} onToggle={()=>setAbcCcPop(p=>!p)}
                items={allCCs} sel={abcSelCCs} getColor={ccCor}
                onAll={()=>setAbcSelCCs(null)} onNone={()=>setAbcSelCCs(new Set())}
                onToggleItem={cc=>{const next=abcSelCCs===null?new Set(allCCs):new Set(abcSelCCs);next.has(cc)?next.delete(cc):next.add(cc);setAbcSelCCs(next.size===allCCs.length?null:next)}}/>
              <div className="ml-auto">
                <div className="text-[9px] font-bold uppercase tracking-wide text-muted mb-1">Buscar Item</div>
                <input type="text" value={abcFil.search} onChange={e=>setAbcFil(p=>({...p,search:e.target.value}))} placeholder="Filtra item..." className="bg-bg3 border border-border rounded-lg px-3 py-1.5 text-xs text-dim focus:outline-none focus:border-primary w-44"/>
              </div>
            </div>
            <p className="text-[10px] text-muted mb-2">{abcData.length} itens encontrados</p>
            <div className="overflow-auto max-h-[480px]">
              <table className="w-full text-xs" style={{tableLayout:'fixed',minWidth:860}}>
                <colgroup><col style={{width:32}}/><col style={{width:36}}/><col style={{width:280}}/><col style={{width:160}}/><col/><col/><col style={{width:100}}/><col style={{width:80}}/></colgroup>
                <thead className="sticky top-0 bg-bg3 z-10">
                  <tr className="text-muted uppercase tracking-wide text-[9px]">
                    {['#','ABC','Item','Categoria','Qtde','Preço Médio','Valor Total','Entradas'].map((h,i)=>(
                      <th key={h} className={`px-3 py-2.5 font-bold ${i<=2?'text-left':'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {abcData.map((r,i)=>(
                    <tr key={i} className="row-sep hover:bg-bg3/50 transition">
                      <td className="px-3 py-2 text-muted">{i+1}</td>
                      <td className="px-3 py-2 text-center font-bold text-sm"><span className={r.abc==='A'?'text-primary':r.abc==='B'?'text-warn':'text-muted'}>{r.abc}</span></td>
                      <td className="px-3 py-2 text-dim font-medium truncate">{r.item}</td>
                      <td className="px-3 py-2 text-muted truncate">{r.grupo}</td>
                      <td className="px-3 py-2 text-right text-muted font-mono">{fmtN2(r.qtde)}</td>
                      <td className="px-3 py-2 text-right text-muted font-mono">{fmtBRL(r.pm)}</td>
                      <td className="px-3 py-2 text-right font-bold text-dim font-mono">{fmtBRL(r.total)}</td>
                      <td className="px-3 py-2 text-right text-muted">{r.entradas}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-bg2">
                  <tr className="border-t-2 border-primary/30 bg-primary/5">
                    <td colSpan={6} className="px-3 py-2 font-bold text-primary text-xs">Total ({abcData.length} itens)</td>
                    <td className="px-3 py-2 text-right font-bold text-primary font-mono">{fmtBRL(abcData.reduce((s,r)=>s+r.total,0))}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* ── Preço Médio Mensal ── */}
          <Card title="Preço Médio Mensal por Item" note="Dados completos · independente de filtros globais · clique no cabeçalho para ordenar" onExpand={()=>setExpandInfo({title:'Preço Médio Mensal',key:'pm'})} hidden={hidden.pm} onHide={()=>tog('pm')}>
            {/* PM filters row 1 */}
            <div className="flex flex-wrap items-end gap-3 mb-2">
              <ISel label="Ano Início" value={pmFil.anoIni} onChange={v=>setPmFil(p=>({...p,anoIni:v}))}>
                <option value="">Todos</option>{allAnos.map(a=><option key={a} value={a}>{a}</option>)}
              </ISel>
              <ISel label="Mês Início" value={pmFil.mesIni} onChange={v=>setPmFil(p=>({...p,mesIni:v}))}>
                <option value="">Todos</option>{mMeses().map(m=><option key={m.v} value={m.v}>{m.n}</option>)}
              </ISel>
              <span className="text-muted text-xs self-end pb-1.5">→</span>
              <ISel label="Ano Fim" value={pmFil.anoFim} onChange={v=>setPmFil(p=>({...p,anoFim:v}))}>
                <option value="">Todos</option>{allAnos.map(a=><option key={a} value={a}>{a}</option>)}
              </ISel>
              <ISel label="Mês Fim" value={pmFil.mesFim} onChange={v=>setPmFil(p=>({...p,mesFim:v}))}>
                <option value="">Todos</option>{mMeses().map(m=><option key={m.v} value={m.v}>{m.n}</option>)}
              </ISel>
              <ISel label="Grupo" value={pmFil.cat} onChange={v=>setPmFil(p=>({...p,cat:v}))}>
                <option value="">Todos os grupos</option>{allCats.map(c=><option key={c} value={c}>{c}</option>)}
              </ISel>
              <ISel label="Centro de Custo" value={pmFil.cc} onChange={v=>setPmFil(p=>({...p,cc:v}))} style={{minWidth:180}}>
                <option value="">Todos os CCs</option>{allCCs.map(c=><option key={c} value={c}>{c}</option>)}
              </ISel>
              <ISel label="Curva" value={pmFil.curva} onChange={v=>setPmFil(p=>({...p,curva:v}))}>
                <option value="">Todas</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
              </ISel>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wide text-muted mb-1">Buscar Item</div>
                <input type="text" value={pmFil.search} onChange={e=>setPmFil(p=>({...p,search:e.target.value}))} placeholder="Filtra isso..." className="bg-bg3 border border-border rounded-lg px-3 py-1.5 text-xs text-dim focus:outline-none focus:border-primary w-36"/>
              </div>
            </div>
            {/* PM checkboxes */}
            <div className="flex items-center gap-5 mb-3">
              {[
                {key:'showVariacao',label:'Mostrar variação'},
                {key:'showQtde',label:'Mostrar quantidade'},
                {key:'onlyAllMeses',label:'Só itens com todos os meses'},
              ].map(({key,label})=>(
                <label key={key} className="flex items-center gap-1.5 text-xs text-dim cursor-pointer select-none">
                  <input type="checkbox" checked={pmFil[key]} onChange={e=>setPmFil(p=>({...p,[key]:e.target.checked}))} className="accent-primary"/>
                  {label}
                </label>
              ))}
              <span className="text-[10px] text-muted ml-auto">{pmRows.length} itens · {pmMeses.length} meses</span>
            </div>
            <div className="overflow-auto max-h-[480px]">
              <table className="text-xs" style={{borderCollapse:'separate',borderSpacing:0,minWidth:600,width:'100%'}}>
                <thead className="sticky top-0 z-10">
                  <tr>
                    {[
                      {key:'item',label:'Item',align:'left',sticky:true},
                      {key:'grupo',label:'Grupo',align:'left'},
                      {key:'abc',label:'Curva',align:'center'},
                      ...pmMeses.flatMap((m,i)=>[
                        ...(pmFil.showQtde?[{key:`q_${m}`,label:'Qtd',align:'right',noSort:true}]:[]),
                        {key:m,label:mesLbl(m),align:'right'},
                        ...(pmFil.showVariacao&&i>0?[{key:`d_${m}`,label:'Δ',align:'center'}]:[]),
                      ]),
                      ...(pmFil.showQtde?[{key:'totalqtde',label:'Qtde Total',align:'right',noSort:true}]:[]),
                      {key:'totalval',label:'Total',align:'right'},
                    ].map(col=>(
                      <th key={col.key} onClick={()=>!col.noSort&&setPmSort(p=>({col:col.key,dir:p.col===col.key?-p.dir:-1}))}
                        className={`px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-muted bg-bg3 border-b border-border whitespace-nowrap ${!col.noSort?'cursor-pointer hover:text-primary transition':''} ${col.align==='left'?'text-left':col.align==='center'?'text-center':'text-right'} ${col.sticky?'sticky left-0 z-20':''}`}
                        style={{minWidth:col.sticky?170:col.align==='left'?90:col.key.startsWith('d_')||col.key==='abc'?46:78}}>
                        {col.label}{!col.noSort&&pmSort.col===col.key&&<span className="ml-1 opacity-60">{pmSort.dir===1?'↑':'↓'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pmRows.map((r,i)=>(
                    <tr key={i} className="group hover:bg-primary/5 transition">
                      <td className="px-3 py-1.5 text-dim font-medium sticky left-0 bg-bg2 group-hover:bg-primary/5 cell-sep z-[2]" style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.item}</td>
                      <td className="px-3 py-1.5 cell-sep whitespace-nowrap" style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis'}}>
                        <span style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:`${CORES[allCats.indexOf(r.grupo)%CORES.length]}22`,color:CORES[allCats.indexOf(r.grupo)%CORES.length],border:`1px solid ${CORES[allCats.indexOf(r.grupo)%CORES.length]}44`}}>{r.grupo}</span>
                      </td>
                      <td className="px-3 py-1.5 cell-sep text-center font-bold text-sm">
                        <span className={r.abc==='A'?'text-primary':r.abc==='B'?'text-warn':'text-muted'}>{r.abc}</span>
                      </td>
                      {pmMeses.map((m,mi)=>{
                        const v=r.precos[m]
                        const q=r.qtdes[m]
                        const prevM=pmMeses[mi-1]
                        const prevV=prevM?r.precos[prevM]:null
                        const delta=v!=null&&prevV!=null&&prevV>0?(v-prevV)/prevV*100:null
                        return (
                          <Fragment key={m}>
                            {pmFil.showQtde&&<td className="px-2 py-1.5 text-right cell-sep text-muted font-mono text-[10px] opacity-60">
                              {q!=null?fmtN2(q):<span className="opacity-30">—</span>}
                            </td>}
                            <td className="px-3 py-1.5 text-right cell-sep">
                              {v!=null?<span className="font-mono text-dim text-[11px]">{fmtP(v)}</span>:<span className="text-muted opacity-30">—</span>}
                            </td>
                            {pmFil.showVariacao&&mi>0&&<td className="px-1 py-1.5 text-center cell-sep">
                              {delta!=null?<span className={`text-[8px] font-bold px-1 rounded ${delta>0?'text-danger bg-danger/10':delta<0?'text-primary bg-primary/10':'text-muted'}`}>{delta>0?'▲':'▼'}{Math.abs(delta).toFixed(1)}%</span>:<span className="text-muted opacity-20 text-[8px]">—</span>}
                            </td>}
                          </Fragment>
                        )
                      })}
                      {pmFil.showQtde&&<td className="px-3 py-1.5 text-right cell-sep text-muted font-mono text-[11px] font-semibold">{r.totalQtde>0?fmtN2(r.totalQtde):'—'}</td>}
                      <td className="px-3 py-1.5 text-right font-bold text-primary font-mono cell-sep">{fmtK(r.totalVal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>


        </div>
      )}

      {/* ── Expand Modal ── */}
      {expandInfo&&(
        <ExpandModal title={expandInfo.title} onClose={()=>setExpandInfo(null)}>
          {expandInfo.key==='bar'&&<ResponsiveContainer width="100%" height="100%" minHeight={400}><BarChart data={porCC} layout="vertical" margin={{top:0,right:80,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false}/><XAxis type="number" tickFormatter={fmtK} tick={{fill:C.tick,fontSize:11}} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="cc" tick={{fill:C.dim,fontSize:11}} axisLine={false} tickLine={false} width={150}/><Tooltip content={<Tip/>} cursor={{fill:C.bg3}}/><Bar dataKey="total" radius={[0,4,4,0]} maxBarSize={30}>{porCC.map((_,i)=><Cell key={i} fill={ccCor(porCC[i].cc)}/>)}<LabelList dataKey="total" position="right" formatter={fmtK} style={{fill:C.tick,fontSize:10,fontWeight:700}}/></Bar></BarChart></ResponsiveContainer>}
          {expandInfo.key==='line'&&<ResponsiveContainer width="100%" height="100%" minHeight={400}><LineChart data={multiLineData} margin={{top:4,right:16,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/><XAxis dataKey="mes" tick={{fill:C.tick,fontSize:12}} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{fill:C.tick,fontSize:11}} axisLine={false} tickLine={false} width={65}/><Tooltip content={<Tip/>}/><Legend iconSize={10}/>{top5CCs.map(cc=><Line key={cc} type="monotone" dataKey={cc} stroke={ccCor(cc)} strokeWidth={2.5} dot={{r:4}} activeDot={{r:6}}/>)}</LineChart></ResponsiveContainer>}
          {expandInfo.key==='stacked'&&<ResponsiveContainer width="100%" height="100%" minHeight={400}><BarChart data={stackData} margin={{top:32,right:16,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false}/><XAxis dataKey="mes" tick={{fill:C.tick,fontSize:12}} axisLine={false} tickLine={false}/><YAxis tickFormatter={fmtK} tick={{fill:C.tick,fontSize:11}} axisLine={false} tickLine={false} width={65}/><Tooltip content={<Tip/>} cursor={{fill:C.bg3}}/><Legend iconSize={10}/>{stackCCs.map((cc,i)=><Bar key={cc} dataKey={cc} stackId="a" fill={ccCor(cc)} maxBarSize={60} radius={i===stackCCs.length-1?[4,4,0,0]:undefined}>{i===stackCCs.length-1&&<LabelList dataKey="_total" position="top" formatter={fmtK} style={{fill:C.tick,fontSize:11,fontWeight:700}}/>}</Bar>)}</BarChart></ResponsiveContainer>}
          {expandInfo.key==='pm'&&(
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex flex-wrap items-end gap-3 mb-2 flex-shrink-0">
                <ISel label="Ano Início" value={pmFil.anoIni} onChange={v=>setPmFil(p=>({...p,anoIni:v}))}><option value="">Todos</option>{allAnos.map(a=><option key={a} value={a}>{a}</option>)}</ISel>
                <ISel label="Mês Início" value={pmFil.mesIni} onChange={v=>setPmFil(p=>({...p,mesIni:v}))}><option value="">Todos</option>{mMeses().map(m=><option key={m.v} value={m.v}>{m.n}</option>)}</ISel>
                <span className="text-muted text-xs self-end pb-1.5">→</span>
                <ISel label="Ano Fim" value={pmFil.anoFim} onChange={v=>setPmFil(p=>({...p,anoFim:v}))}><option value="">Todos</option>{allAnos.map(a=><option key={a} value={a}>{a}</option>)}</ISel>
                <ISel label="Mês Fim" value={pmFil.mesFim} onChange={v=>setPmFil(p=>({...p,mesFim:v}))}><option value="">Todos</option>{mMeses().map(m=><option key={m.v} value={m.v}>{m.n}</option>)}</ISel>
                <ISel label="Grupo" value={pmFil.cat} onChange={v=>setPmFil(p=>({...p,cat:v}))}><option value="">Todos os grupos</option>{allCats.map(c=><option key={c} value={c}>{c}</option>)}</ISel>
                <ISel label="Centro de Custo" value={pmFil.cc} onChange={v=>setPmFil(p=>({...p,cc:v}))} style={{minWidth:180}}><option value="">Todos os CCs</option>{allCCs.map(c=><option key={c} value={c}>{c}</option>)}</ISel>
                <ISel label="Curva" value={pmFil.curva} onChange={v=>setPmFil(p=>({...p,curva:v}))}><option value="">Todas</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></ISel>
                <div><div className="text-[9px] font-bold uppercase tracking-wide text-muted mb-1">Buscar Item</div><input type="text" value={pmFil.search} onChange={e=>setPmFil(p=>({...p,search:e.target.value}))} placeholder="Filtra isso..." className="bg-bg3 border border-border rounded-lg px-3 py-1.5 text-xs text-dim focus:outline-none focus:border-primary w-36"/></div>
              </div>
              <div className="flex items-center gap-5 mb-3 flex-shrink-0">
                {[{key:'showVariacao',label:'Mostrar variação'},{key:'showQtde',label:'Mostrar quantidade'},{key:'onlyAllMeses',label:'Só itens com todos os meses'}].map(({key,label})=>(
                  <label key={key} className="flex items-center gap-1.5 text-xs text-dim cursor-pointer select-none">
                    <input type="checkbox" checked={pmFil[key]} onChange={e=>setPmFil(p=>({...p,[key]:e.target.checked}))} className="accent-primary"/>
                    {label}
                  </label>
                ))}
                <span className="text-[10px] text-muted ml-auto">{pmRows.length} itens · {pmMeses.length} meses</span>
              </div>
              <div className="overflow-auto flex-1">
                <table className="text-xs" style={{borderCollapse:'separate',borderSpacing:0,minWidth:600,width:'100%'}}>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {[
                        {key:'item',label:'Item',align:'left',sticky:true},
                        {key:'grupo',label:'Grupo',align:'left'},
                        {key:'abc',label:'Curva',align:'center'},
                        ...pmMeses.flatMap((m,i)=>[
                          ...(pmFil.showQtde?[{key:`q_${m}`,label:'Qtd',align:'right',noSort:true}]:[]),
                          {key:m,label:mesLbl(m),align:'right'},
                          ...(pmFil.showVariacao&&i>0?[{key:`d_${m}`,label:'Δ',align:'center'}]:[]),
                        ]),
                        ...(pmFil.showQtde?[{key:'totalqtde',label:'Qtde Total',align:'right',noSort:true}]:[]),
                        {key:'totalval',label:'Total',align:'right'},
                      ].map(col=>(
                        <th key={col.key} onClick={()=>!col.noSort&&setPmSort(p=>({col:col.key,dir:p.col===col.key?-p.dir:-1}))}
                          className={`px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-muted bg-bg3 border-b border-border whitespace-nowrap ${!col.noSort?'cursor-pointer hover:text-primary transition':''} ${col.align==='left'?'text-left':col.align==='center'?'text-center':'text-right'} ${col.sticky?'sticky left-0 z-20':''}`}
                          style={{minWidth:col.sticky?200:col.align==='left'?90:col.key.startsWith('d_')||col.key==='abc'?46:78}}>
                          {col.label}{!col.noSort&&pmSort.col===col.key&&<span className="ml-1 opacity-60">{pmSort.dir===1?'↑':'↓'}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pmRows.map((r,i)=>(
                      <tr key={i} className="group hover:bg-primary/5 transition">
                        <td className="px-3 py-2 text-dim font-medium sticky left-0 bg-bg2 group-hover:bg-primary/5 cell-sep z-[2]" style={{maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.item}</td>
                        <td className="px-3 py-2 cell-sep whitespace-nowrap" style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis'}}>
                          <span style={{fontSize:9,padding:'1px 6px',borderRadius:4,background:`${CORES[allCats.indexOf(r.grupo)%CORES.length]}22`,color:CORES[allCats.indexOf(r.grupo)%CORES.length],border:`1px solid ${CORES[allCats.indexOf(r.grupo)%CORES.length]}44`}}>{r.grupo}</span>
                        </td>
                        <td className="px-3 py-2 cell-sep text-center font-bold text-sm">
                          <span className={r.abc==='A'?'text-primary':r.abc==='B'?'text-warn':'text-muted'}>{r.abc}</span>
                        </td>
                        {pmMeses.map((m,mi)=>{
                          const v=r.precos[m], q=r.qtdes[m], prevM=pmMeses[mi-1], prevV=prevM?r.precos[prevM]:null
                          const delta=v!=null&&prevV!=null&&prevV>0?(v-prevV)/prevV*100:null
                          return (
                            <Fragment key={m}>
                              {pmFil.showQtde&&<td className="px-2 py-2 text-right cell-sep text-muted font-mono text-[10px] opacity-60">{q!=null?fmtN2(q):<span className="opacity-30">—</span>}</td>}
                              <td className="px-3 py-2 text-right cell-sep">{v!=null?<span className="font-mono text-dim text-[11px]">{fmtP(v)}</span>:<span className="text-muted opacity-30">—</span>}</td>
                              {pmFil.showVariacao&&mi>0&&<td className="px-1 py-2 text-center cell-sep">{delta!=null?<span className={`text-[8px] font-bold px-1 rounded ${delta>0?'text-danger bg-danger/10':delta<0?'text-primary bg-primary/10':'text-muted'}`}>{delta>0?'▲':'▼'}{Math.abs(delta).toFixed(1)}%</span>:<span className="text-muted opacity-20 text-[8px]">—</span>}</td>}
                            </Fragment>
                          )
                        })}
                        {pmFil.showQtde&&<td className="px-3 py-2 text-right cell-sep text-muted font-mono text-[11px] font-semibold">{r.totalQtde>0?fmtN2(r.totalQtde):'—'}</td>}
                        <td className="px-3 py-2 text-right font-bold text-primary font-mono cell-sep">{fmtK(r.totalVal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {expandInfo.key==='heatmap'&&(
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center gap-3 mb-3 flex-shrink-0">
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Baixo</span>
                <div style={{flex:1,height:10,borderRadius:5,background:'linear-gradient(to right,rgba(45,212,160,.25),rgba(93,184,140,.45),rgba(140,156,120,.62),rgba(188,128,100,.82),rgba(235,100,80,1))'}}/>
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Alto</span>
              </div>
              <div className="overflow-auto flex-1">
                <table style={{borderCollapse:'collapse',fontSize:12,minWidth:500,width:'100%'}}>
                  <thead>
                    <tr>
                      <th style={{padding:'6px 12px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',color:'var(--color-muted)',textAlign:'left',background:'var(--color-bg3)',minWidth:160,position:'sticky',left:0,top:0,zIndex:20}}>Centro de Custo</th>
                      {mesesUniq.map(m=>(
                        <th key={m} style={{padding:'6px 10px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',color:'var(--color-muted)',textAlign:'center',background:'var(--color-bg3)',whiteSpace:'nowrap',position:'sticky',top:0,zIndex:10}}>{mesLbl(m)}</th>
                      ))}
                      <th style={{padding:'6px 10px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',color:'var(--color-primary)',textAlign:'right',background:'var(--color-bg3)',whiteSpace:'nowrap',position:'sticky',top:0,zIndex:10}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(hmData).sort((a,b)=>{
                      const ta=mesesUniq.reduce((s,m)=>s+(hmData[a][m]||0),0)
                      const tb=mesesUniq.reduce((s,m)=>s+(hmData[b][m]||0),0)
                      return tb-ta
                    }).map(cc=>{
                      const row=hmData[cc]
                      const rowVals=mesesUniq.map(m=>row[m]||0)
                      const maxVal=Math.max(...rowVals)||1
                      const rowTotal=rowVals.reduce((s,v)=>s+v,0)
                      const isDrillCC=hmDrill?.cc===cc
                      return (
                        <tr key={cc}>
                          <td onClick={()=>{if(!isDrillCC)setHmDrill({type:'cc-cats',cc});else if(hmDrill.type==='cc-cats')setHmDrill({type:'cc-items',cc});else setHmDrill(null)}}
                            style={{padding:'7px 12px',fontWeight:500,color:isDrillCC?'var(--color-primary)':'var(--color-dim)',background:'var(--color-bg2)',whiteSpace:'nowrap',fontSize:12,cursor:'pointer',position:'sticky',left:0,zIndex:1,borderLeft:isDrillCC?'2px solid var(--color-primary)':'2px solid transparent',transition:'color .15s'}}>
                            <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:ccCor(cc),marginRight:7}}/>
                            {cc}
                          </td>
                          {mesesUniq.map(m=>{
                            const val=row[m]||0
                            const intensity=maxVal>0?val/maxVal:0
                            const {bg,fg}=heatColor(intensity)
                            const selected=hmDrill?.cc===cc&&hmDrill?.mes===m
                            return (
                              <td key={m} onClick={()=>{if(!val)return;if(!hmDrill||hmDrill.cc!==cc||hmDrill.mes!==m)setHmDrill({type:'cell-cats',cc,mes:m});else setHmDrill(null)}}
                                style={{padding:0,border:'1px solid rgba(15,17,23,.5)',background:bg,cursor:val?'pointer':'default',outline:selected?'2.5px solid #fff':'none',outlineOffset:-2}}>
                                <div style={{minHeight:48,minWidth:80,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'5px 4px'}}>
                                  {val>0&&<>
                                    <span style={{fontSize:10,fontWeight:700,color:fg,fontFamily:'monospace'}}>{fmtK(val)}</span>
                                    <span style={{fontSize:8,color:fg,opacity:.7,marginTop:1}}>{(intensity*100).toFixed(0)}%</span>
                                  </>}
                                </div>
                              </td>
                            )
                          })}
                          <td style={{padding:'7px 12px',textAlign:'right',fontWeight:700,color:'var(--color-primary)',fontFamily:'monospace',fontSize:11,background:'var(--color-bg2)',whiteSpace:'nowrap',borderLeft:'1px solid var(--color-border)'}}>
                            {fmtK(rowTotal)}
                            <div style={{fontSize:8,color:'var(--color-muted)',fontWeight:400}}>{totalGasto>0?(rowTotal/totalGasto*100).toFixed(1)+'%':''}</div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!['bar','line','stacked','pm','heatmap'].includes(expandInfo.key)&&<p className="text-muted text-sm text-center py-8">Conteúdo expandido: {expandInfo.title}</p>}
        </ExpandModal>
      )}

      {/* ── Import Modal ── */}
      {importModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-bg2 border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 fade-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-bold text-dim text-sm">Importar planilha</h2>
              <button onClick={()=>setImportModal(false)} className="text-muted hover:text-dim text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5">
              <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed border-border hover:border-primary rounded-xl p-8 text-center cursor-pointer transition group">
                <div className="text-4xl mb-3">📂</div>
                <p className="text-sm text-dim group-hover:text-primary transition font-medium">{fileUpload?fileUpload.name:'Clique para selecionar o arquivo'}</p>
                <p className="text-xs text-muted mt-1">Excel (.xlsx, .xls) ou CSV (.csv)</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{setFileUpload(e.target.files[0]);setUploadMsg('')}}/>
              {uploadMsg&&<p className={`mt-3 text-xs text-center px-3 py-2 rounded-lg border ${uploadMsg.startsWith('✓')?'text-primary bg-primary/10 border-primary/30':'text-red-400 bg-red-400/10 border-red-400/20'}`}>{uploadMsg}</p>}
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
