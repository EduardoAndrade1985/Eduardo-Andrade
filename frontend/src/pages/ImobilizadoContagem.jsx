import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'

// ── helpers ───────────────────────────────────────────────────────────────────
const COR = {
  LOCALIZADO:       { bg: '#052e16', border: '#16a34a', text: '#4ade80', label: 'Localizado',      emoji: '✅' },
  LOCAL_DIVERGENTE: { bg: '#431407', border: '#d97706', text: '#fbbf24', label: 'Local Divergente', emoji: '⚠️' },
  NAO_CADASTRADO:   { bg: '#1c0a17', border: '#9333ea', text: '#c084fc', label: 'Não Cadastrado',  emoji: '🆕' },
}

// ── Scanner QR com BarcodeDetector API ────────────────────────────────────────
function QRScanner({ onDetected, onClose }) {
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const rafRef    = useRef(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let detector
    let stopped = false

    const start = async () => {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'] })
      } catch {
        setErro('BarcodeDetector não disponível neste navegador.')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch {
        setErro('Sem permissão para acessar a câmera.')
        return
      }

      const scan = async () => {
        if (stopped || !videoRef.current) return
        if (videoRef.current.readyState >= 2) {
          try {
            const barcodes = await detector.detect(videoRef.current)
            if (barcodes.length > 0) {
              const raw = barcodes[0].rawValue.trim().toUpperCase()
              onDetected(raw)
              return  // pausa até o caller fechar ou chamar novamente
            }
          } catch { /* ignorar erros de frame */ }
        }
        rafRef.current = requestAnimationFrame(scan)
      }
      rafRef.current = requestAnimationFrame(scan)
    }

    start()

    return () => {
      stopped = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [onDetected])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#000', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#111' }}>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📷 Aponte para a plaqueta QR</p>
        <button onClick={onClose}
          style={{ color: '#9ca3af', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
      </div>
      {erro ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <p style={{ color: '#f87171', textAlign: 'center' }}>{erro}</p>
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative' }}>
          <video ref={videoRef} muted playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          {/* Mira */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              width: 220, height: 220, border: '3px solid #2dd4a0',
              borderRadius: 16, boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            }}/>
          </div>
          <p style={{
            position: 'absolute', bottom: 24, left: 0, right: 0,
            textAlign: 'center', color: '#fff', fontSize: 13, opacity: 0.7,
          }}>Escaneando automaticamente…</p>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL DE CONTAGEM
// ════════════════════════════════════════════════════════════════════════════════
export default function ImobilizadoContagem() {
  const { id }     = useParams()
  const navigate   = useNavigate()

  const [inventario, setInventario]   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [itens, setItens]             = useState([])       // leituras da sessão
  const [plaqueta, setPlaqueta]       = useState('')
  const [local, setLocal]             = useState('')
  const [operador, setOperador]       = useState(() => localStorage.getItem('imob_operador') || '')
  const [enviando, setEnviando]       = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [flash, setFlash]             = useState(null)     // { cor, msg } por 2 s
  const inputRef                      = useRef(null)

  const temBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window

  const carregarInventario = useCallback(async () => {
    try {
      const { data } = await api.get(`/imobilizado/inventarios/${id}/`)
      setInventario(data)
      // itens já lidos nesta sessão
      setItens(data.itens || [])
    } catch {
      setInventario(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { carregarInventario() }, [carregarInventario])

  useEffect(() => {
    if (operador) localStorage.setItem('imob_operador', operador)
  }, [operador])

  const registrar = useCallback(async (plq) => {
    if (!plq.trim()) return
    if (enviando) return
    setEnviando(true)
    try {
      const { data } = await api.post(`/imobilizado/inventarios/${id}/leitura/`, {
        plaqueta:               plq.trim().toUpperCase(),
        localizacao_encontrada: local.trim(),
        contado_por:            operador.trim(),
      })
      const item = data.item
      // atualiza lista (upsert por plaqueta_lida)
      setItens(prev => {
        const idx = prev.findIndex(i => i.plaqueta_lida === item.plaqueta_lida)
        if (idx >= 0) {
          const novo = [...prev]
          novo[idx] = item
          return novo
        }
        return [item, ...prev]
      })
      const cor = COR[item.situacao] || COR.LOCALIZADO
      setFlash({ bg: cor.bg, border: cor.border, text: cor.text, msg: `${cor.emoji} ${item.plaqueta_lida} — ${cor.label}` })
      setTimeout(() => setFlash(null), 2000)
    } catch (e) {
      const msg = e.response?.data?.erro || 'Erro ao registrar'
      setFlash({ bg: '#1c0a17', border: '#dc2626', text: '#f87171', msg: `✗ ${msg}` })
      setTimeout(() => setFlash(null), 3000)
    } finally {
      setEnviando(false)
      setPlaqueta('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [id, local, operador, enviando])

  const onQRDetected = useCallback((raw) => {
    setShowScanner(false)
    registrar(raw)
  }, [registrar])

  const onSubmit = (e) => {
    e.preventDefault()
    if (plaqueta.trim()) registrar(plaqueta)
  }

  const finalizar = async () => {
    if (!window.confirm('Finalizar inventário? Não aceitará mais leituras.')) return
    await api.post(`/imobilizado/inventarios/${id}/finalizar/`)
    navigate('/imobilizado')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
        <p style={{ color: '#9ca3af' }}>Carregando inventário…</p>
      </div>
    )
  }

  if (!inventario) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0d1117', gap: 16, padding: 24 }}>
        <p style={{ color: '#f87171', fontSize: 16 }}>Inventário não encontrado.</p>
        <button onClick={() => navigate('/imobilizado')}
          style={{ color: '#2dd4a0', background: 'none', border: '1px solid #2dd4a0', padding: '8px 20px', borderRadius: 8, cursor: 'pointer' }}>
          ← Voltar
        </button>
      </div>
    )
  }

  const emAberto = inventario.status === 'ABERTO'
  const totalLidos = itens.length
  const localizados  = itens.filter(i => i.situacao === 'LOCALIZADO').length
  const divergentes  = itens.filter(i => i.situacao === 'LOCAL_DIVERGENTE').length
  const nCadastrado  = itens.filter(i => i.situacao === 'NAO_CADASTRADO').length

  const S = {
    root:    { minHeight: '100dvh', background: '#0d1117', color: '#e2e8f0', fontFamily: 'system-ui,sans-serif', display: 'flex', flexDirection: 'column' },
    header:  { background: '#111827', borderBottom: '1px solid #1f2937', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 },
    title:   { fontWeight: 800, fontSize: 15, color: '#f1f5f9' },
    subtitle:{ fontSize: 12, color: '#6b7280', marginTop: 2 },
    back:    { color: '#9ca3af', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', padding: '4px 8px', borderRadius: 6 },
    body:    { flex: 1, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' },
    counter: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', borderBottom: '1px solid #1f2937', flexShrink: 0 },
    kpi:     (cor) => ({ padding: '10px 8px', textAlign: 'center', borderRight: '1px solid #1f2937' }),
    kpiN:    (cor) => ({ fontSize: 22, fontWeight: 800, color: cor }),
    kpiL:    { fontSize: 10, color: '#6b7280', marginTop: 2 },
    scan:    { padding: '12px 16px', background: '#111827', borderBottom: '1px solid #1f2937', flexShrink: 0 },
    inp:     { width: '100%', background: '#1f2937', border: '1.5px solid #374151', borderRadius: 10, padding: '12px 16px', color: '#f1f5f9', fontSize: 16, outline: 'none', boxSizing: 'border-box', letterSpacing: 2, fontFamily: 'monospace', textTransform: 'uppercase' },
    camBtn:  { width: '100%', marginTop: 8, padding: '12px', background: '#2dd4a010', border: '1.5px solid #2dd4a030', borderRadius: 10, color: '#2dd4a0', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
    list:    { flex: 1, overflowY: 'auto', padding: '8px 0' },
    item:    (cor) => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderLeft: `3px solid ${cor.border}`, background: cor.bg + '88', margin: '4px 8px', borderRadius: '0 8px 8px 0' }),
    plq:     { fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#e2e8f0', minWidth: 80 },
    desc:    { fontSize: 13, color: '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    tag:     (cor) => ({ fontSize: 11, fontWeight: 700, color: cor.text, background: cor.bg, border: `1px solid ${cor.border}`, padding: '2px 8px', borderRadius: 999, flexShrink: 0 }),
    footer:  { padding: '12px 16px', borderTop: '1px solid #1f2937', background: '#111827', flexShrink: 0 },
    finBtn:  { width: '100%', padding: '13px', background: '#1f2937', border: '1px solid #374151', borderRadius: 10, color: '#9ca3af', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
    flash:   (f) => ({
      position: 'fixed', bottom: 80, left: 16, right: 16, zIndex: 100,
      background: f.bg, border: `1.5px solid ${f.border}`, borderRadius: 12,
      padding: '14px 18px', color: f.text, fontWeight: 700, fontSize: 15, textAlign: 'center',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }),
    opRow: { display: 'flex', gap: 8, marginTop: 8 },
    opInp: { flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '8px 12px', color: '#9ca3af', fontSize: 12, outline: 'none' },
    locInp: { flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '8px 12px', color: '#9ca3af', fontSize: 12, outline: 'none' },
  }

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <p style={S.title}>
            {inventario.local_area || `Inventário ${inventario.data}`}
          </p>
          <p style={S.subtitle}>
            {inventario.data} · {emAberto ? '🟢 Em andamento' : '🔒 Finalizado'}
          </p>
        </div>
        <button onClick={() => navigate('/imobilizado')} style={S.back}>← Voltar</button>
      </div>

      <div style={S.body}>
        {/* Contadores */}
        <div style={S.counter}>
          {[
            { n: totalLidos,  l: 'Lidos',      c: '#e2e8f0' },
            { n: localizados, l: 'Localizados', c: '#4ade80' },
            { n: divergentes, l: 'Divergentes', c: '#fbbf24' },
            { n: nCadastrado, l: 'N.Cadastr.',  c: '#c084fc' },
          ].map((k, i) => (
            <div key={i} style={{ ...S.kpi(k.c), ...(i === 3 ? { borderRight: 'none' } : {}) }}>
              <p style={S.kpiN(k.c)}>{k.n}</p>
              <p style={S.kpiL}>{k.l}</p>
            </div>
          ))}
        </div>

        {/* Área de scan */}
        {emAberto && (
          <div style={S.scan}>
            <form onSubmit={onSubmit}>
              <input
                ref={inputRef}
                autoFocus
                style={S.inp}
                value={plaqueta}
                onChange={e => setPlaqueta(e.target.value.toUpperCase())}
                placeholder="PLAQUETA…"
                disabled={enviando}
              />
            </form>
            <div style={S.opRow}>
              <input style={S.locInp} value={local}
                onChange={e => setLocal(e.target.value)}
                placeholder="Local encontrado (opcional)"/>
              <input style={S.opInp} value={operador}
                onChange={e => setOperador(e.target.value)}
                placeholder="Seu nome"/>
            </div>
            {temBarcodeDetector && (
              <button style={S.camBtn} onClick={() => setShowScanner(true)}>
                📷 Escanear QR Code
              </button>
            )}
            {!temBarcodeDetector && (
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 8, textAlign: 'center' }}>
                Scanner de câmera não disponível neste navegador. Use o campo acima.
              </p>
            )}
          </div>
        )}

        {!emAberto && (
          <div style={{ padding: '12px 16px', background: '#431407', borderBottom: '1px solid #92400e', textAlign: 'center' }}>
            <p style={{ color: '#fbbf24', fontSize: 13, fontWeight: 700 }}>🔒 Este inventário foi finalizado</p>
          </div>
        )}

        {/* Lista de leituras */}
        <div style={S.list}>
          {itens.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: '#4b5563' }}>
              <p style={{ fontSize: 40 }}>📡</p>
              <p style={{ marginTop: 8, fontSize: 14 }}>
                {emAberto ? 'Escaneie a primeira plaqueta para começar.' : 'Nenhuma leitura registrada.'}
              </p>
            </div>
          )}
          {itens.map((item, i) => {
            const cor = COR[item.situacao] || COR.LOCALIZADO
            const desc = item.bem?.descricao || '(sem cadastro)'
            return (
              <div key={item.id || i} style={S.item(cor)}>
                {item.bem?.foto_url && (
                  <img src={item.bem.foto_url} alt=""
                    style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}/>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={S.plq}>{item.plaqueta_lida}</p>
                  <p style={S.desc}>{desc}</p>
                  {item.localizacao_encontrada && (
                    <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                      📍 {item.localizacao_encontrada}
                    </p>
                  )}
                </div>
                <span style={S.tag(cor)}>{cor.label}</span>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        {emAberto && (
          <div style={S.footer}>
            <button style={S.finBtn} onClick={finalizar}>
              Finalizar Inventário ({totalLidos} leituras)
            </button>
          </div>
        )}
      </div>

      {/* Flash feedback */}
      {flash && <div style={S.flash(flash)}>{flash.msg}</div>}

      {/* Scanner QR */}
      {showScanner && (
        <QRScanner onDetected={onQRDetected} onClose={() => setShowScanner(false)}/>
      )}
    </div>
  )
}
