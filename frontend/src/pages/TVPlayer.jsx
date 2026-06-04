import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'

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

// ── Slide Ocupação ─────────────────────────────────────────────────────────────
function OcupacaoSlide({ dados, cor }) {
  if (!dados) return (
    <div className="w-full h-full flex flex-col items-center justify-center text-white">
      <div className="text-7xl mb-6">🏨</div>
      <h2 className="text-5xl font-bold mb-2" style={{ color: cor }}>Ocupação</h2>
      <p className="text-xl text-white/40 mt-4">Sem dados disponíveis</p>
    </div>
  )

  const taxa = parseFloat(dados.taxa_ocupacao || 0)
  const taxaColor = taxa >= 80 ? '#22c55e' : taxa >= 50 ? '#f59e0b' : taxa >= 30 ? '#2dd4a0' : '#ef4444'

  return (
    <div className="w-full h-full flex flex-col p-8 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <span className="text-5xl">🏨</span>
          <div>
            <h2 className="text-4xl font-bold" style={{ color: cor }}>Ocupação</h2>
            <p className="text-white/40 text-lg">{dados.data || 'Hoje'}</p>
          </div>
        </div>
        {/* Taxa grande */}
        <div className="text-right">
          <p className="text-8xl font-black" style={{ color: taxaColor }}>
            {taxa.toFixed(1)}%
          </p>
          <p className="text-white/40 text-xl">ocupado</p>
        </div>
      </div>

      {/* KPIs em grid */}
      <div className="grid grid-cols-3 gap-4 flex-1">
        <KpiBox label="UHs Ocupadas" value={dados.uhs_ocupadas} cor={taxaColor} big />
        <KpiBox label="UHs Livres"   value={dados.uhs_livres}   cor="#7a8fa8"   big />
        <KpiBox label="ADR"          value={cur(dados.adr)}     cor={cor}       big />
        <KpiBox label="RevPAR"       value={cur(dados.revpar)}  cor="#0ea5e9"       />
        <KpiBox
          label="Check-in"
          value={dados.checkins}
          cor="#22c55e"
          sub="entradas hoje"
        />
        <KpiBox
          label="Check-out"
          value={dados.checkouts}
          cor="#f59e0b"
          sub="saídas hoje"
        />
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
