import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'

// ── paleta por situação ───────────────────────────────────────────────────────
const COR = {
  LOCALIZADO:       { bg: '#052e16', border: '#16a34a', text: '#4ade80', label: 'Localizado',      emoji: '✅' },
  LOCAL_DIVERGENTE: { bg: '#431407', border: '#d97706', text: '#fbbf24', label: 'Local Divergente', emoji: '⚠️' },
  NAO_CADASTRADO:   { bg: '#1c0a17', border: '#9333ea', text: '#c084fc', label: 'Não Cadastrado',  emoji: '🆕' },
}

// ── formata moeda BR ──────────────────────────────────────────────────────────
const fmtR = v => v == null ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ════════════════════════════════════════════════════════════════════════════════
// SCANNER DE CÂMERA (BarcodeDetector API nativa)
// ════════════════════════════════════════════════════════════════════════════════
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
        detector = new window.BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'],
        })
      } catch {
        setErro('Scanner não disponível neste navegador.')
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
              onDetected(barcodes[0].rawValue.trim().toUpperCase())
              return
            }
          } catch { /* frame com erro, continua */ }
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#111' }}>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>📷 Aponte para a plaqueta</p>
        <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>
      {erro ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <p style={{ color: '#f87171', textAlign: 'center', fontSize: 14 }}>{erro}</p>
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: 230, height: 230, border: '3px solid #2dd4a0', borderRadius: 18, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}/>
          </div>
          <p style={{ position: 'absolute', bottom: 28, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 13, opacity: 0.7 }}>
            Escaneando automaticamente…
          </p>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// CARD DE CONFIRMAÇÃO
// ════════════════════════════════════════════════════════════════════════════════
function CardConfirmacao({ busca, localAtual, onLocalChange, onConfirmar, onCancelar, salvando }) {
  const { encontrado, bem, plaqueta } = busca

  // calcula situação prevista para mostrar a cor do card
  let situacaoPrevista = 'LOCALIZADO'
  if (!encontrado) {
    situacaoPrevista = 'NAO_CADASTRADO'
  } else if (bem.localizacao && localAtual && bem.localizacao.toLowerCase() !== localAtual.toLowerCase()) {
    situacaoPrevista = 'LOCAL_DIVERGENTE'
  }
  const cor = COR[situacaoPrevista]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 800,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0 0 env(safe-area-inset-bottom,0)',
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: '#111827', borderRadius: '20px 20px 0 0',
        border: `2px solid ${cor.border}`, borderBottom: 'none',
        padding: '20px 20px 32px',
        boxShadow: `0 -8px 40px ${cor.border}33`,
      }}>

        {/* Foto + plaqueta */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          {encontrado && bem.foto_url ? (
            <img src={bem.foto_url} alt=""
              style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover', border: `2px solid ${cor.border}`, flexShrink: 0 }}/>
          ) : (
            <div style={{
              width: 80, height: 80, borderRadius: 12, flexShrink: 0,
              background: '#1f2937', border: `2px solid ${cor.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32,
            }}>
              {encontrado ? '📦' : '❓'}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{
                fontFamily: 'monospace', fontWeight: 900, fontSize: 15,
                color: cor.text, background: `${cor.bg}cc`,
                border: `1px solid ${cor.border}`, padding: '3px 10px', borderRadius: 999,
              }}>
                {encontrado ? bem.plaqueta : plaqueta}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, color: cor.text,
                background: `${cor.bg}aa`, border: `1px solid ${cor.border}33`,
                padding: '2px 8px', borderRadius: 999,
              }}>
                {cor.emoji} {cor.label}
              </span>
            </div>

            {encontrado ? (
              <>
                <p style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.2, marginBottom: 4 }}>
                  {bem.descricao}
                </p>
                <p style={{ fontSize: 12, color: '#6b7280' }}>
                  {bem.categoria?.nome} · {bem.departamento?.nome}
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9' }}>Plaqueta não cadastrada</p>
                <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  Será registrada como item não catalogado.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Info do sistema */}
        {encontrado && (
          <div style={{
            background: '#1f2937', borderRadius: 10, padding: '10px 14px',
            marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {bem.localizacao && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: '#6b7280', width: 90, flexShrink: 0 }}>Local no sist.</span>
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>📍 {bem.localizacao}</span>
              </div>
            )}
            {bem.responsavel && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: '#6b7280', width: 90, flexShrink: 0 }}>Responsável</span>
                <span style={{ color: '#e2e8f0' }}>{bem.responsavel}</span>
              </div>
            )}
            {bem.valor_aquisicao != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: '#6b7280', width: 90, flexShrink: 0 }}>Valor</span>
                <span style={{ color: '#e2e8f0' }}>{fmtR(bem.valor_aquisicao)}</span>
              </div>
            )}
          </div>
        )}

        {/* Local encontrado */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Local onde foi encontrado {situacaoPrevista === 'LOCAL_DIVERGENTE' && <span style={{ color: '#fbbf24' }}>⚠️ diverge do cadastro</span>}
          </label>
          <input
            value={localAtual}
            onChange={e => onLocalChange(e.target.value)}
            placeholder={encontrado && bem.localizacao ? bem.localizacao : 'Ex: Bancada 2, Depósito…'}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#1f2937', border: `1.5px solid ${situacaoPrevista === 'LOCAL_DIVERGENTE' ? '#d97706' : '#374151'}`,
              borderRadius: 10, padding: '12px 14px',
              color: '#f1f5f9', fontSize: 15, outline: 'none',
            }}
          />
        </div>

        {/* Botões */}
        <button
          onClick={onConfirmar}
          disabled={salvando}
          style={{
            width: '100%', padding: '16px', borderRadius: 14,
            background: cor.border, border: 'none',
            color: '#000', fontWeight: 900, fontSize: 18,
            cursor: salvando ? 'not-allowed' : 'pointer',
            opacity: salvando ? 0.6 : 1,
            marginBottom: 10,
            letterSpacing: 0.5,
          }}
        >
          {salvando ? 'Registrando…' : `${cor.emoji} Confirmar`}
        </button>

        <button
          onClick={onCancelar}
          disabled={salvando}
          style={{
            width: '100%', padding: '12px', borderRadius: 14,
            background: 'transparent', border: '1.5px solid #374151',
            color: '#6b7280', fontWeight: 700, fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Cancelar — escanear outra
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL DE CONTAGEM
// ════════════════════════════════════════════════════════════════════════════════
export default function ImobilizadoContagem() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [inventario, setInventario]   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [itens, setItens]             = useState([])

  // step: 'scan' | 'buscando' | 'confirmar' | 'resultado'
  const [step, setStep]               = useState('scan')
  const [plaqueta, setPlaqueta]       = useState('')
  const [buscaResult, setBuscaResult] = useState(null)   // { encontrado, bem?, plaqueta }
  const [localEncontrado, setLocalEncontrado] = useState('')
  const [operador, setOperador]       = useState(() => localStorage.getItem('imob_operador') || '')
  const [salvando, setSalvando]       = useState(false)
  const [flash, setFlash]             = useState(null)
  const [showScanner, setShowScanner] = useState(false)

  const inputRef = useRef(null)
  const temCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window

  // ── carrega inventário ───────────────────────────────────────────────────────
  const carregarInventario = useCallback(async () => {
    try {
      const { data } = await api.get(`/imobilizado/inventarios/${id}/`)
      setInventario(data)
      setItens([...(data.itens || [])].reverse())
    } catch {
      setInventario(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { carregarInventario() }, [carregarInventario])
  useEffect(() => { if (operador) localStorage.setItem('imob_operador', operador) }, [operador])

  // foca o input sempre que volta ao modo scan
  useEffect(() => {
    if (step === 'scan') setTimeout(() => inputRef.current?.focus(), 150)
  }, [step])

  // ── busca sem registrar ──────────────────────────────────────────────────────
  const buscarPlaqueta = useCallback(async (plq) => {
    const p = plq.trim().toUpperCase()
    if (!p) return
    setPlaqueta('')
    setStep('buscando')

    try {
      const { data } = await api.get('/imobilizado/bens/buscar/', { params: { plaqueta: p } })
      // pré-preenche com a localização do bem (o operador pode ajustar)
      setLocalEncontrado(data.encontrado ? (data.bem.localizacao || '') : '')
      setBuscaResult(data)
      setStep('confirmar')
    } catch {
      setStep('scan')
      mostrarFlash({ bg: '#1c0a17', border: '#dc2626', text: '#f87171', msg: '✗ Erro ao buscar plaqueta' })
    }
  }, [])

  // ── confirma leitura ─────────────────────────────────────────────────────────
  const confirmar = useCallback(async () => {
    setSalvando(true)
    const plq = buscaResult.encontrado ? buscaResult.bem.plaqueta : buscaResult.plaqueta
    try {
      const { data } = await api.post(`/imobilizado/inventarios/${id}/leitura/`, {
        plaqueta:               plq,
        localizacao_encontrada: localEncontrado.trim(),
        contado_por:            operador.trim(),
      })
      const item = data.item
      // upsert na lista local
      setItens(prev => {
        const idx = prev.findIndex(i => i.plaqueta_lida === item.plaqueta_lida)
        if (idx >= 0) { const n = [...prev]; n[idx] = item; return n }
        return [item, ...prev]
      })
      const cor = COR[item.situacao] || COR.LOCALIZADO
      mostrarFlash({ bg: cor.bg, border: cor.border, text: cor.text, msg: `${cor.emoji} ${cor.label}` })
    } catch (e) {
      const msg = e.response?.data?.erro || 'Erro ao registrar'
      mostrarFlash({ bg: '#1c0a17', border: '#dc2626', text: '#f87171', msg: `✗ ${msg}` })
    } finally {
      setSalvando(false)
      setBuscaResult(null)
      setLocalEncontrado('')
      setStep('scan')
    }
  }, [id, buscaResult, localEncontrado, operador])

  const mostrarFlash = (f) => {
    setFlash(f)
    setTimeout(() => setFlash(null), 2200)
  }

  const onSubmit = (e) => { e.preventDefault(); buscarPlaqueta(plaqueta) }
  const onQRDetected = useCallback((raw) => { setShowScanner(false); buscarPlaqueta(raw) }, [buscarPlaqueta])

  const finalizarInventario = async () => {
    if (!window.confirm('Finalizar inventário? Não aceitará mais leituras.')) return
    await api.post(`/imobilizado/inventarios/${id}/finalizar/`)
    navigate('/imobilizado')
  }

  // ── loading / erro ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
        <p style={{ color: '#9ca3af', fontSize: 15 }}>Carregando inventário…</p>
      </div>
    )
  }
  if (!inventario) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0d1117', gap: 16, padding: 24 }}>
        <p style={{ color: '#f87171', fontSize: 16 }}>Inventário não encontrado.</p>
        <button onClick={() => navigate('/imobilizado')}
          style={{ color: '#2dd4a0', background: 'none', border: '1px solid #2dd4a0', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          ← Voltar
        </button>
      </div>
    )
  }

  const emAberto  = inventario.status === 'ABERTO'
  const totalLidos    = itens.length
  const localizados   = itens.filter(i => i.situacao === 'LOCALIZADO').length
  const divergentes   = itens.filter(i => i.situacao === 'LOCAL_DIVERGENTE').length
  const nCadastrado   = itens.filter(i => i.situacao === 'NAO_CADASTRADO').length

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: '#0d1117', color: '#e2e8f0', fontFamily: 'system-ui,sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <div style={{ background: '#111827', borderBottom: '1px solid #1f2937', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
        <div>
          <p style={{ fontWeight: 800, fontSize: 16, color: '#f1f5f9' }}>
            {inventario.local_area || `Inventário ${inventario.data}`}
          </p>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {inventario.data} · {emAberto ? '🟢 Em andamento' : '🔒 Finalizado'}
          </p>
        </div>
        <button onClick={() => navigate('/imobilizado')}
          style={{ color: '#9ca3af', background: 'none', border: '1px solid #374151', fontSize: 13, cursor: 'pointer', padding: '6px 12px', borderRadius: 8 }}>
          ← Voltar
        </button>
      </div>

      {/* ── Contadores ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
        {[
          { n: totalLidos,  l: 'Lidos',        c: '#e2e8f0' },
          { n: localizados, l: 'Localizados',  c: '#4ade80' },
          { n: divergentes, l: 'Divergentes',  c: '#fbbf24' },
          { n: nCadastrado, l: 'Não Cad.',     c: '#c084fc' },
        ].map((k, i) => (
          <div key={i} style={{ padding: '10px 8px', textAlign: 'center', borderRight: i < 3 ? '1px solid #1f2937' : 'none' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: k.c, lineHeight: 1 }}>{k.n}</p>
            <p style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>{k.l}</p>
          </div>
        ))}
      </div>

      {/* ── Área de scan (só quando aberto) ── */}
      {emAberto && (
        <div style={{ background: '#111827', borderBottom: '1px solid #1f2937', padding: '14px 16px', flexShrink: 0 }}>

          {step === 'buscando' ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ color: '#9ca3af', fontSize: 15, fontWeight: 600 }}>🔍 Buscando plaqueta…</p>
            </div>
          ) : (
            <>
              <form onSubmit={onSubmit}>
                <input
                  ref={inputRef}
                  autoFocus
                  value={plaqueta}
                  onChange={e => setPlaqueta(e.target.value.toUpperCase())}
                  placeholder="Digite ou escaneie a plaqueta…"
                  disabled={step !== 'scan'}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#1f2937', border: '1.5px solid #374151',
                    borderRadius: 12, padding: '14px 16px',
                    color: '#f1f5f9', fontSize: 18, outline: 'none',
                    letterSpacing: 2, fontFamily: 'monospace', fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                />
              </form>

              {/* Operador */}
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>Operador:</span>
                <input value={operador} onChange={e => setOperador(e.target.value)}
                  placeholder="Seu nome"
                  style={{ flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '7px 12px', color: '#9ca3af', fontSize: 13, outline: 'none' }}/>
              </div>

              {/* Botão câmera */}
              {temCamera && (
                <button onClick={() => setShowScanner(true)}
                  style={{
                    marginTop: 10, width: '100%', padding: '13px',
                    background: '#2dd4a010', border: '1.5px solid #2dd4a030',
                    borderRadius: 12, color: '#2dd4a0', fontWeight: 700, fontSize: 16,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  📷 Escanear QR Code pela câmera
                </button>
              )}

              {!temCamera && (
                <p style={{ fontSize: 11, color: '#4b5563', marginTop: 8, textAlign: 'center' }}>
                  Scanner de câmera não disponível — use o campo acima (funciona com leitores USB/Bluetooth também).
                </p>
              )}
            </>
          )}
        </div>
      )}

      {!emAberto && (
        <div style={{ padding: '12px 16px', background: '#431407', borderBottom: '1px solid #92400e', textAlign: 'center', flexShrink: 0 }}>
          <p style={{ color: '#fbbf24', fontSize: 14, fontWeight: 700 }}>🔒 Inventário finalizado — somente visualização</p>
        </div>
      )}

      {/* ── Lista de leituras ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {itens.length === 0 && (
          <div style={{ textAlign: 'center', padding: '52px 24px', color: '#4b5563' }}>
            <p style={{ fontSize: 44, lineHeight: 1 }}>📡</p>
            <p style={{ marginTop: 12, fontSize: 14 }}>
              {emAberto ? 'Escaneie a primeira plaqueta para começar.' : 'Nenhuma leitura neste inventário.'}
            </p>
          </div>
        )}

        {itens.map((item, i) => {
          const cor = COR[item.situacao] || COR.LOCALIZADO
          const desc = item.bem?.descricao || '(sem cadastro)'
          return (
            <div key={item.id || i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 16px', margin: '4px 10px',
              background: `${cor.bg}88`, borderLeft: `3px solid ${cor.border}`,
              borderRadius: '0 10px 10px 0',
            }}>
              {item.bem?.foto_url ? (
                <img src={item.bem.foto_url} alt=""
                  style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: `1.5px solid ${cor.border}` }}/>
              ) : (
                <div style={{ width: 42, height: 42, borderRadius: 8, background: '#1f2937', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  {item.situacao === 'NAO_CADASTRADO' ? '❓' : '📦'}
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>
                  {item.plaqueta_lida}
                </p>
                <p style={{ fontSize: 13, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                  {desc}
                </p>
                {item.localizacao_encontrada && (
                  <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    📍 {item.localizacao_encontrada}
                  </p>
                )}
              </div>

              <span style={{
                fontSize: 11, fontWeight: 700, color: cor.text,
                background: `${cor.bg}cc`, border: `1px solid ${cor.border}`,
                padding: '3px 8px', borderRadius: 999, flexShrink: 0,
              }}>
                {cor.emoji} {cor.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Footer (finalizar) ── */}
      {emAberto && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #1f2937', background: '#111827', flexShrink: 0 }}>
          <button onClick={finalizarInventario}
            style={{
              width: '100%', padding: '13px',
              background: '#1f2937', border: '1px solid #374151',
              borderRadius: 12, color: '#9ca3af', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>
            Finalizar Inventário ({totalLidos} leitura{totalLidos !== 1 ? 's' : ''})
          </button>
        </div>
      )}

      {/* ── Flash feedback ── */}
      {flash && (
        <div style={{
          position: 'fixed', bottom: 90, left: 16, right: 16, zIndex: 700,
          background: flash.bg, border: `2px solid ${flash.border}`,
          borderRadius: 14, padding: '16px 20px',
          color: flash.text, fontWeight: 800, fontSize: 16, textAlign: 'center',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}>
          {flash.msg}
        </div>
      )}

      {/* ── Card de confirmação ── */}
      {step === 'confirmar' && buscaResult && (
        <CardConfirmacao
          busca={buscaResult}
          localAtual={localEncontrado}
          onLocalChange={setLocalEncontrado}
          onConfirmar={confirmar}
          onCancelar={() => { setBuscaResult(null); setLocalEncontrado(''); setStep('scan') }}
          salvando={salvando}
        />
      )}

      {/* ── Scanner QR ── */}
      {showScanner && (
        <QRScanner onDetected={onQRDetected} onClose={() => setShowScanner(false)}/>
      )}
    </div>
  )
}
