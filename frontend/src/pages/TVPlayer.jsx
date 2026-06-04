import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

const BASE = import.meta.env.VITE_API_BASE_URL || ''

function cur(v) {
  const n = +(v) || 0
  if (Math.abs(n) >= 1_000_000) return `R$${(n/1_000_000).toFixed(1).replace('.',',')}M`
  if (Math.abs(n) >= 1_000)     return `R$${(n/1_000).toFixed(0)}k`
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── KPI box ───────────────────────────────────────────────────────────────────
function KpiBox({ label, value, sub, cor, big }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur flex flex-col justify-center">
      <p className="text-sm text-white/50 mb-1">{label}</p>
      <p className={`font-bold ${big ? 'text-5xl' : 'text-3xl'}`} style={{ color: cor }}>{value}</p>
      {sub && <p className="text-xs text-white/30 mt-1">{sub}</p>}
    </div>
  )
}

// ── Variação ──────────────────────────────────────────────────────────────────
function Var({ v, unit = '%' }) {
  if (v == null) return null
  const up = v >= 0
  return (
    <span className={`text-xs font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(v).toFixed(1)}{unit}
    </span>
  )
}

// ── Gauge simples SVG ─────────────────────────────────────────────────────────
function Gauge({ pct, cor }) {
  const r = 80, cx = 100, cy = 100
  const angle = (pct / 100) * 180
  const rad   = (a) => (a - 180) * Math.PI / 180
  const ex    = cx + r * Math.cos(rad(angle))
  const ey    = cy + r * Math.sin(rad(angle))
  return (
    <svg viewBox="0 0 200 120" className="w-full max-w-[200px]">
      <path d={`M ${cx-r},${cy} A ${r},${r} 0 0 1 ${cx+r},${cy}`}
        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="18" strokeLinecap="round"/>
      {pct > 0 && (
        <path d={`M ${cx-r},${cy} A ${r},${r} 0 0 1 ${ex},${ey}`}
          fill="none" stroke={cor} strokeWidth="18" strokeLinecap="round"/>
      )}
      <text x={cx} y={cy-10} textAnchor="middle" fill={cor} fontSize="28" fontWeight="900">
        {pct.toFixed(1)}%
      </text>
      <text x={cx} y={cy+12} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="12" letterSpacing="2">
        OCUPADO
      </text>
    </svg>
  )
}

// ── Cor da taxa ───────────────────────────────────────────────────────────────
function taxaColor(t) {
  const v = parseFloat(t || 0)
  if (v >= 80) return '#2dd4a0'
  if (v >= 50) return '#f59e0b'
  if (v >= 30) return '#ef4444'
  return '#ef4444'
}

// ── Slide Ocupação idêntico ao dashboard ──────────────────────────────────────
function OcupacaoSlide({ dados, cor }) {
  if (!dados) return (
    <div className="w-full h-full flex flex-col items-center justify-center text-white">
      <div className="text-7xl mb-6">🏨</div>
      <h2 className="text-5xl font-bold" style={{ color: cor }}>Ocupação</h2>
      <p className="text-xl text-white/40 mt-4">Sem dados disponíveis</p>
    </div>
  )

  const taxa   = parseFloat(dados.taxa_ocupacao || 0)
  const tColor = taxaColor(taxa)
  const hist   = dados.historico || []
  const tabela = dados.tabela    || []
  const hoje   = dados.data      || ''

  const fmtISO = (s) => { if (!s) return ''; const [,m,d] = s.split('-'); return `${d}/${m}` }

  // KPI cards topo
  const kpis = [
    { label: 'TAXA OCUP.',   value: `${taxa.toFixed(2)}%`,       sub: fmtISO(hoje), var: dados.var_taxa,    color: tColor },
    { label: 'UHs OCUP.',    value: dados.uhs_ocupadas,          sub: `Livre: ${dados.uhs_livres}`,          color: cor },
    { label: 'ADR',          value: cur(dados.adr),              sub: 'Diária média', var: dados.var_adr,    color: cor },
    { label: 'REVPAR',       value: cur(dados.revpar),           sub: 'p/ UH disp.',  var: dados.var_revpar, color: cor },
    { label: 'RECEITA DIA',  value: cur(dados.receita_dia),      sub: fmtISO(hoje), var: dados.var_receita,  color: cor },
    { label: 'RECEITA MTD',  value: cur(dados.receita_mtd || 0), sub: 'Acum.',                               color: cor },
    { label: 'HÓSPEDES',     value: dados.hospedes,              sub: `In: ${dados.checkins} · Out: ${dados.checkouts}`, color: cor },
  ]

  const C = { grid: '#1e2535', tick: '#7a8fa8' }

  return (
    <div className="w-full h-full flex flex-col bg-[#0d1117] text-white overflow-hidden">

      {/* KPI cards */}
      <div className="flex gap-1.5 px-3 pt-2 pb-1.5 flex-shrink-0">
        {kpis.map((k, i) => (
          <div key={i} className="flex-1 bg-[#161b27] border border-white/[0.06] rounded-xl px-3 py-2 min-w-0">
            <p className="text-[9px] text-white/40 uppercase tracking-wider truncate">{k.label}</p>
            <p className="text-lg font-bold leading-tight" style={{ color: k.color }}>{k.value}</p>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {k.var != null && <Var v={k.var} />}
              <span className="text-[9px] text-white/30 truncate">{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Corpo principal */}
      <div className="flex gap-2 px-3 pb-2 flex-1 min-h-0">

        {/* Tabela lateral — mais larga */}
        <div className="w-[260px] flex-shrink-0 bg-[#161b27] border border-white/[0.06] rounded-xl overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-white/[0.06] flex-shrink-0">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">
              {tabela[0]?.data || ''} → {tabela[tabela.length-1]?.data || ''}
            </p>
            <p className="text-[10px] text-white/30">{tabela.length} dias</p>
          </div>
          <div className="flex-shrink-0 grid grid-cols-5 gap-0 px-3 py-1.5 border-b border-white/[0.04]">
            {['DATA','DIA','OCUP','UHS','CI/CO'].map(h => (
              <span key={h} className="text-[9px] text-white/30 font-bold uppercase text-center">{h}</span>
            ))}
          </div>
          <div className="overflow-y-auto flex-1">
            {tabela.map((row, i) => {
              const isHoje = row.iso === hoje
              const tc     = taxaColor(row.taxa)
              return (
                <div key={i}
                  className={`grid grid-cols-5 gap-0 px-3 py-1 border-b border-white/[0.025]
                    ${isHoje ? 'bg-primary/10' : ''}`}>
                  <span className={`text-[11px] font-bold ${isHoje ? 'text-primary' : 'text-white/60'}`}>{row.data}</span>
                  <span className="text-[10px] text-white/40 text-center">{row.dia}</span>
                  <span className="text-[11px] font-bold text-center" style={{ color: tc }}>{row.taxa.toFixed(1)}%</span>
                  <span className="text-[11px] text-white/70 text-center font-semibold">{row.uhs}</span>
                  <span className="text-[10px] text-center">
                    <span className="text-green-400 font-semibold">{row.ci}</span>
                    <span className="text-white/20">/</span>
                    <span className="text-red-400 font-semibold">{row.co}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Gráficos — menores */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {/* Gráfico Taxa de Ocupação */}
          <div className="flex-1 bg-[#161b27] border border-white/[0.06] rounded-xl p-2 flex flex-col min-h-0">
            <p className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">
              Taxa de Ocupação (%)
            </p>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hist} margin={{ top: 4, right: 8, bottom: 0, left: -15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="data" tick={{ fill: C.tick, fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: C.tick, fontSize: 9 }} unit="%" domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v) => [`${v.toFixed(1)}%`, 'Taxa Ocup.']}
                  />
                  <Line type="monotone" dataKey="taxa" stroke={cor} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico ADR e RevPAR */}
          <div className="flex-1 bg-[#161b27] border border-white/[0.06] rounded-xl p-2 flex flex-col min-h-0">
            <p className="text-[9px] font-semibold text-white/50 uppercase tracking-wider mb-1">
              ADR e RevPAR (R$)
            </p>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hist} margin={{ top: 4, right: 8, bottom: 0, left: -15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="data" tick={{ fill: C.tick, fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: C.tick, fontSize: 9 }} />
                  <Tooltip
                    contentStyle={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v, n) => [cur(v), n === 'adr' ? 'ADR' : 'RevPAR']}
                  />
                  <Line type="monotone" dataKey="adr"    stroke={cor}      strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="revpar" stroke="#0ea5e9"   strokeWidth={2} dot={false} strokeDasharray="5 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Painel direito — mais largo */}
        <div className="w-[280px] flex-shrink-0 flex flex-col gap-2">
          {/* Gauge */}
          <div className="bg-[#161b27] border border-white/[0.06] rounded-xl p-3 flex flex-col items-center flex-shrink-0">
            <p className="text-[10px] text-primary uppercase tracking-wider font-semibold mb-1">
              OCUPAÇÃO HOJE · {dados.total_uhs} UHs
            </p>
            <Gauge pct={taxa} cor={tColor} />
            <div className="grid grid-cols-2 gap-2 w-full mt-2">
              {[
                { l: 'Ocup.',    v: dados.uhs_ocupadas, c: tColor },
                { l: 'Livres',   v: dados.uhs_livres,   c: '#7a8fa8' },
                { l: 'Check-in', v: dados.checkins,     c: '#22c55e' },
                { l: 'Check-out',v: dados.checkouts,    c: '#f59e0b' },
              ].map((x, i) => (
                <div key={i} className="bg-[#0d1117] rounded-xl p-2 text-center">
                  <p className="text-[10px] text-white/40">{x.l}</p>
                  <p className="text-3xl font-bold" style={{ color: x.c }}>{x.v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* KPIs vs D-1 */}
          <div className="bg-[#161b27] border border-white/[0.06] rounded-xl p-3 flex-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-white/40 uppercase tracking-wider">KPIs vs D-1</p>
              <span className="text-[9px] bg-bg3 border border-border text-primary px-2 py-0.5 rounded font-semibold">HOJE</span>
            </div>
            <div className="grid grid-cols-3 text-[9px] text-white/30 uppercase mb-1.5 border-b border-white/[0.06] pb-1">
              <span>Indicador</span><span className="text-center">Real</span><span className="text-right">Var.</span>
            </div>
            {[
              { l: 'Taxa Ocup.', v: `${taxa.toFixed(2)}%`, var: dados.var_taxa,    unit: ' p.p.' },
              { l: 'ADR (R$)',   v: cur(dados.adr),        var: dados.var_adr },
              { l: 'RevPAR',     v: cur(dados.revpar),     var: dados.var_revpar },
              { l: 'Rec. Dia',   v: cur(dados.receita_dia),var: dados.var_receita },
              { l: 'Rec. MTD',   v: cur(dados.receita_mtd || 0) },
            ].map((k, i) => (
              <div key={i} className="grid grid-cols-3 items-center py-1.5 border-b border-white/[0.04] last:border-0">
                <span className="text-[11px] text-white/50">{k.l}</span>
                <span className="text-[11px] font-bold text-white/90 text-center">{k.v}</span>
                <div className="text-right">
                  {k.var != null ? <Var v={k.var} unit={k.unit || '%'} /> : <span className="text-[9px] text-white/20">—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Slide Custos ──────────────────────────────────────────────────────────────
function CustosSlide({ dados, cor }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-12 text-white">
      <div className="text-7xl mb-6">📊</div>
      <h2 className="text-5xl font-bold mb-2" style={{ color: cor }}>Custos</h2>
      <p className="text-xl text-white/50 mb-10">Mês atual</p>
      {dados ? (
        <div className="flex flex-col items-center gap-4">
          <KpiBox label="Total do Mês" value={cur(dados.total_mes)} cor={cor} big />
          <p className="text-white/40 text-lg">{dados.mes}</p>
        </div>
      ) : (
        <p className="text-white/40 text-xl">Sem dados disponíveis</p>
      )}
    </div>
  )
}

// ── Slide de Mídia ────────────────────────────────────────────────────────────
function MidiaSlide({ midia, onEnded }) {
  if (!midia) return null

  // YouTube embed
  const ytMatch = midia.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  if (ytMatch) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&loop=1&playlist=${ytMatch[1]}&controls=0`}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen"
      />
    )
  }

  if (midia.tipo === 'video') {
    return (
      <video
        key={midia.url}
        src={midia.url}
        autoPlay
        playsInline
        onEnded={onEnded}
        className="w-full h-full object-contain bg-black"
      />
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <img src={midia.url} alt={midia.titulo}
        className="max-w-full max-h-full object-contain" />
    </div>
  )
}

// ── Barra de progresso ────────────────────────────────────────────────────────
function ProgressBar({ duracao, playing, isVideo }) {
  const [pct, setPct] = useState(0)
  const start = useRef(Date.now())

  useEffect(() => {
    if (!playing || isVideo) { setPct(isVideo ? 100 : 0); return }
    start.current = Date.now()
    setPct(0)
    const id = setInterval(() => {
      const elapsed = (Date.now() - start.current) / 1000
      setPct(Math.min(100, (elapsed / duracao) * 100))
    }, 100)
    return () => clearInterval(id)
  }, [duracao, playing, isVideo])

  return (
    <div className="h-1 w-full bg-white/10">
      <div className="h-full bg-primary transition-none" style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Relógio ───────────────────────────────────────────────────────────────────
function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="text-white/60 text-sm font-mono tabular-nums">
      {time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

// ── Player principal ──────────────────────────────────────────────────────────
export default function TVPlayer() {
  const { token }  = useParams()
  const [data,    setData]    = useState(null)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [fade,    setFade]    = useState(true)
  const [erro,    setErro]    = useState('')
  const timerRef = useRef(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/tv/public/${token}/`)
      if (!res.ok) { setErro('TV não encontrada ou inativa.'); return }
      const json = await res.json()
      setData(json)
      setPlaying(true)
    } catch { setErro('Erro ao carregar dados da TV.') }
  }, [token])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchData])

  const avancar = useCallback(() => {
    clearTimeout(timerRef.current)
    setFade(false)
    setTimeout(() => {
      setCurrent(c => (c + 1) % (data?.playlist?.length || 1))
      setFade(true)
    }, 600)
  }, [data])

  useEffect(() => {
    if (!playing || !data?.playlist?.length) return
    const item = data.playlist[current]
    // Vídeos avançam via onEnded — não usa timer
    if (item?.tipo === 'midia' && item?.midia?.tipo === 'video') return
    const dur = (item?.duracao || 15) * 1000
    timerRef.current = setTimeout(avancar, dur)
    return () => clearTimeout(timerRef.current)
  }, [current, playing, data, avancar])

  if (erro) return (
    <div className="w-screen h-screen bg-black flex items-center justify-center">
      <p className="text-white/60 text-xl">{erro}</p>
    </div>
  )

  if (!data) return (
    <div className="w-screen h-screen bg-black flex items-center justify-center">
      <p className="text-white/30 text-2xl animate-pulse">Carregando...</p>
    </div>
  )

  const playlist = data.playlist || []
  if (!playlist.length) return (
    <div className="w-screen h-screen bg-black flex items-center justify-center">
      <div className="text-center text-white/40">
        <p className="text-6xl mb-4">📺</p>
        <p className="text-2xl">Playlist vazia</p>
        <p className="text-sm mt-2">Configure itens no TV Manager</p>
      </div>
    </div>
  )

  const item    = playlist[current]
  const cor     = data.empresa_cor || '#2dd4a0'
  const isVideo = item?.tipo === 'midia' && item?.midia?.tipo === 'video'

  return (
    <div className="w-screen h-screen bg-[#0a0f1a] overflow-hidden flex flex-col select-none">

      {/* Conteúdo */}
      <div className={`flex-1 transition-opacity duration-500 ${fade ? 'opacity-100' : 'opacity-0'}`}>
        {item?.tipo === 'midia' ? (
          <MidiaSlide midia={item.midia} onEnded={avancar} />
        ) : item?.tipo === 'ocupacao' ? (
          <OcupacaoSlide dados={item.dados} cor={cor} />
        ) : item?.tipo === 'custos' ? (
          <CustosSlide dados={item.dados} cor={cor} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40 text-3xl">
            Em breve
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="flex-shrink-0">
        <ProgressBar duracao={item?.duracao || 15} playing={playing && fade} isVideo={isVideo} />
        <div className="flex items-center justify-between px-6 py-2 bg-black/50">
          <div className="min-w-0">
            <span className="text-white/50 text-sm font-semibold truncate block">{data.empresa_nome}</span>
            {data.dispositivo && (
              <span className="text-white/30 text-xs truncate block">
                {data.dispositivo}{data.local ? ` · ${data.local}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <span className="text-white/30 text-xs">{current + 1} / {playlist.length}</span>
            <Clock />
          </div>
        </div>
      </div>
    </div>
  )
}
