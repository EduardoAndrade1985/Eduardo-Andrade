import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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
    <svg viewBox="0 0 200 110" className="w-full max-w-[200px]">
      <path d={`M ${cx-r},${cy} A ${r},${r} 0 0 1 ${cx+r},${cy}`}
        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="18" strokeLinecap="round"/>
      {pct > 0 && (
        <path d={`M ${cx-r},${cy} A ${r},${r} 0 0 1 ${ex},${ey}`}
          fill="none" stroke={cor} strokeWidth="18" strokeLinecap="round"/>
      )}
      <text x={cx} y={cy-8} textAnchor="middle" fill={cor} fontSize="28" fontWeight="900">
        {pct.toFixed(1)}%
      </text>
      <text x={cx} y={cy+16} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11">
        OCUPADO
      </text>
    </svg>
  )
}

// ── Slide Ocupação completo ───────────────────────────────────────────────────
function OcupacaoSlide({ dados, cor }) {
  if (!dados) return (
    <div className="w-full h-full flex flex-col items-center justify-center text-white">
      <div className="text-7xl mb-6">🏨</div>
      <h2 className="text-5xl font-bold" style={{ color: cor }}>Ocupação</h2>
      <p className="text-xl text-white/40 mt-4">Sem dados disponíveis</p>
    </div>
  )

  const taxa = parseFloat(dados.taxa_ocupacao || 0)
  const taxaColor = taxa >= 80 ? '#22c55e' : taxa >= 50 ? '#f59e0b' : taxa >= 30 ? '#2dd4a0' : '#ef4444'
  const hist = dados.historico || []

  const fmtData = (s) => {
    if (!s) return ''
    const [y, m, d] = s.split('-')
    return `${d}/${m}`
  }

  const kpis = [
    { label: 'TAXA OCUP.',  value: `${taxa.toFixed(2)}%`,    var: dados.var_taxa,    sub: fmtData(dados.data) },
    { label: 'UHs OCUP.',   value: dados.uhs_ocupadas,       sub: `Livre: ${dados.uhs_livres}` },
    { label: 'ADR',         value: cur(dados.adr),           var: dados.var_adr,     sub: 'Diária média' },
    { label: 'REVPAR',      value: cur(dados.revpar),        var: dados.var_revpar,  sub: 'p/ UH disp.' },
    { label: 'RECEITA DIA', value: cur(dados.receita_dia),   var: dados.var_receita, sub: fmtData(dados.data) },
    { label: 'HÓSPEDES',    value: dados.hospedes,           sub: `In: ${dados.checkins} · Out: ${dados.checkouts}` },
  ]

  return (
    <div className="w-full h-full flex flex-col p-4 text-white bg-[#0d1117]">

      {/* KPI cards no topo */}
      <div className="grid grid-cols-6 gap-2 mb-3">
        {kpis.map((k, i) => (
          <div key={i} className="bg-[#161b27] border border-white/[0.06] rounded-xl px-3 py-2">
            <p className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">{k.label}</p>
            <p className="text-xl font-bold" style={{ color: i === 0 ? taxaColor : cor }}>{k.value}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {k.var != null && <Var v={k.var} />}
              <span className="text-[9px] text-white/30">{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Área principal */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Gráfico Taxa de Ocupação */}
        <div className="flex-1 bg-[#161b27] border border-white/[0.06] rounded-xl p-3 flex flex-col min-w-0">
          <p className="text-xs font-semibold text-white/50 mb-2 uppercase tracking-wider">
            Taxa de Ocupação (%) — {hist[0]?.data || ''} → {hist[hist.length-1]?.data || ''}
          </p>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hist} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="data" tick={{ fill: '#7a8fa8', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#7a8fa8', fontSize: 10 }} unit="%" />
                <Tooltip
                  contentStyle={{ background: '#161b27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  labelStyle={{ color: '#dde3ed' }}
                  formatter={(v) => [`${v.toFixed(1)}%`, 'Taxa']}
                />
                <Line type="monotone" dataKey="taxa" stroke={cor} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Painel direito — Ocupação hoje + KPIs D-1 */}
        <div className="w-56 flex flex-col gap-2 flex-shrink-0">
          <div className="bg-[#161b27] border border-white/[0.06] rounded-xl p-3 flex flex-col items-center">
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
              Ocupação Hoje · {dados.total_uhs} UHs
            </p>
            <Gauge pct={taxa} cor={taxaColor} />
            <div className="grid grid-cols-2 gap-2 w-full mt-2">
              <div className="bg-[#0d1117] rounded-lg p-2 text-center">
                <p className="text-[9px] text-white/40">Ocup.</p>
                <p className="text-lg font-bold" style={{ color: taxaColor }}>{dados.uhs_ocupadas}</p>
              </div>
              <div className="bg-[#0d1117] rounded-lg p-2 text-center">
                <p className="text-[9px] text-white/40">Livres</p>
                <p className="text-lg font-bold text-white/60">{dados.uhs_livres}</p>
              </div>
              <div className="bg-[#0d1117] rounded-lg p-2 text-center">
                <p className="text-[9px] text-white/40">Check-in</p>
                <p className="text-lg font-bold text-green-400">{dados.checkins}</p>
              </div>
              <div className="bg-[#0d1117] rounded-lg p-2 text-center">
                <p className="text-[9px] text-white/40">Check-out</p>
                <p className="text-lg font-bold text-yellow-400">{dados.checkouts}</p>
              </div>
            </div>
          </div>

          {/* KPIs vs D-1 */}
          <div className="bg-[#161b27] border border-white/[0.06] rounded-xl p-3 flex-1">
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">KPIs vs D-1</p>
            {[
              { label: 'Taxa Ocup.', value: `${taxa.toFixed(2)}%`, var: dados.var_taxa },
              { label: 'ADR',        value: cur(dados.adr),        var: dados.var_adr },
              { label: 'RevPAR',     value: cur(dados.revpar),     var: dados.var_revpar },
              { label: 'Rec. Dia',   value: cur(dados.receita_dia),var: dados.var_receita },
            ].map((k, i) => (
              <div key={i} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
                <span className="text-[10px] text-white/50">{k.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-white/80">{k.value}</span>
                  <Var v={k.var} />
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
