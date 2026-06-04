import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'

const BASE = import.meta.env.VITE_API_BASE_URL || ''

function cur(v) {
  const n = +(v) || 0
  if (Math.abs(n) >= 1_000_000) return `R$${(n/1_000_000).toFixed(1).replace('.',',')}M`
  if (Math.abs(n) >= 1_000)     return `R$${(n/1_000).toFixed(0)}k`
  return (n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Slide de Dashboard ────────────────────────────────────────────────────────
function DashboardSlide({ tipo, dados, cor }) {
  const LABELS = {
    ocupacao: { icon: '🏨', title: 'Ocupação', subtitle: 'Hoje' },
    custos:   { icon: '📊', title: 'Custos',   subtitle: 'Mês atual' },
    cartoes:  { icon: '💳', title: 'Cartões',  subtitle: 'Conciliação' },
    estoque:  { icon: '📦', title: 'Estoque',  subtitle: 'Suprimentos' },
  }
  const meta = LABELS[tipo] || { icon: '📺', title: tipo, subtitle: '' }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-12 text-white">
      <div className="text-7xl mb-6">{meta.icon}</div>
      <h2 className="text-5xl font-bold mb-2" style={{ color: cor }}>{meta.title}</h2>
      <p className="text-xl text-white/50 mb-10">{meta.subtitle}</p>

      {tipo === 'ocupacao' && dados && (
        <div className="grid grid-cols-2 gap-6 w-full max-w-2xl">
          <KpiBox label="Taxa de Ocupação" value={`${dados.taxa_ocupacao}%`} cor={cor} big />
          <KpiBox label="UHs Ocupadas / Livres" value={`${dados.uhs_ocupadas} / ${dados.uhs_livres}`} cor={cor} big />
          <KpiBox label="ADR" value={cur(dados.adr)} cor={cor} />
          <KpiBox label="RevPAR" value={cur(dados.revpar)} cor={cor} />
          <KpiBox label="Check-in Hoje" value={dados.checkins} cor="#22c55e" />
          <KpiBox label="Check-out Hoje" value={dados.checkouts} cor="#f59e0b" />
        </div>
      )}

      {tipo === 'custos' && dados && (
        <div className="flex flex-col items-center gap-4">
          <KpiBox label="Total do Mês" value={cur(dados.total_mes)} cor={cor} big />
          <p className="text-white/40 text-lg">{dados.mes}</p>
        </div>
      )}

      {(tipo === 'cartoes' || tipo === 'estoque') && (
        <div className="text-white/40 text-2xl mt-4">Em breve</div>
      )}

      {!dados && tipo !== 'cartoes' && tipo !== 'estoque' && (
        <p className="text-white/40 text-xl">Sem dados disponíveis</p>
      )}
    </div>
  )
}

function KpiBox({ label, value, cor, big }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur">
      <p className="text-sm text-white/50 mb-1">{label}</p>
      <p className={`font-bold ${big ? 'text-4xl' : 'text-3xl'}`} style={{ color: cor }}>{value}</p>
    </div>
  )
}

// ── Slide de Mídia ────────────────────────────────────────────────────────────
function MidiaSlide({ midia }) {
  if (!midia) return null

  // YouTube embed
  const ytMatch = midia.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  if (ytMatch) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&loop=1&playlist=${ytMatch[1]}&controls=0`}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen"
      />
    )
  }

  if (midia.tipo === 'video') {
    return (
      <video src={midia.url} autoPlay muted loop
        className="w-full h-full object-cover" />
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
function ProgressBar({ duracao, playing }) {
  const [pct, setPct] = useState(0)
  const start = useRef(Date.now())

  useEffect(() => {
    if (!playing) return
    start.current = Date.now()
    setPct(0)
    const id = setInterval(() => {
      const elapsed = (Date.now() - start.current) / 1000
      setPct(Math.min(100, (elapsed / duracao) * 100))
    }, 100)
    return () => clearInterval(id)
  }, [duracao, playing])

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
  const { token } = useParams()
  const [data,     setData]     = useState(null)
  const [current,  setCurrent]  = useState(0)
  const [playing,  setPlaying]  = useState(false)
  const [fade,     setFade]     = useState(true)
  const [erro,     setErro]     = useState('')
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
    // Recarrega dados a cada 5 minutos
    const id = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchData])

  useEffect(() => {
    if (!playing || !data?.playlist?.length) return
    const item = data.playlist[current]
    const dur  = (item?.duracao || 15) * 1000

    timerRef.current = setTimeout(() => {
      setFade(false)
      setTimeout(() => {
        setCurrent(c => (c + 1) % data.playlist.length)
        setFade(true)
      }, 600)
    }, dur)

    return () => clearTimeout(timerRef.current)
  }, [current, playing, data])

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

  const item = playlist[current]
  const cor  = data.empresa_cor || '#2dd4a0'

  return (
    <div className="w-screen h-screen bg-[#0a0f1a] overflow-hidden flex flex-col select-none">

      {/* Conteúdo */}
      <div className={`flex-1 transition-opacity duration-500 ${fade ? 'opacity-100' : 'opacity-0'}`}>
        {item.tipo === 'midia'
          ? <MidiaSlide midia={item.midia} />
          : <DashboardSlide tipo={item.tipo} dados={item.dados} cor={cor} />
        }
      </div>

      {/* Rodapé */}
      <div className="flex-shrink-0">
        <ProgressBar duracao={item?.duracao || 15} playing={playing && fade} />
        <div className="flex items-center justify-between px-6 py-2 bg-black/50">
          <span className="text-white/50 text-sm font-semibold truncate">{data.empresa_nome}</span>
          <div className="flex items-center gap-4">
            <span className="text-white/30 text-xs">
              {current + 1} / {playlist.length}
            </span>
            <Clock />
          </div>
        </div>
      </div>
    </div>
  )
}
