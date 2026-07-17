import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'

// ── paleta por situação ───────────────────────────────────────────────────────
const COR = {
  LOCALIZADO:       { bg: '#052e16', border: '#16a34a', text: '#4ade80', label: 'Localizado',      emoji: '✅' },
  LOCAL_DIVERGENTE: { bg: '#431407', border: '#d97706', text: '#fbbf24', label: 'Local Divergente', emoji: '⚠️' },
  NAO_CADASTRADO:   { bg: '#1c0a17', border: '#9333ea', text: '#c084fc', label: 'Não Cadastrado',  emoji: '🆕' },
}

const fmtR = v => v == null ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ── estilos inline reutilizáveis ──────────────────────────────────────────────
const inpStyle = (border = '#374151') => ({
  width: '100%', boxSizing: 'border-box',
  background: '#1f2937', border: `1.5px solid ${border}`,
  borderRadius: 10, padding: '11px 14px',
  color: '#f1f5f9', fontSize: 15, outline: 'none',
})

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

  const [scanLine, setScanLine] = useState(0)
  useEffect(() => {
    if (erro) return
    const id = setInterval(() => setScanLine(p => (p + 2) % 100), 16)
    return () => clearInterval(id)
  }, [erro])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#111' }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>📷 Aponte para a plaqueta</p>
          <p style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>Centralize o código de barras na faixa verde</p>
        </div>
        <button onClick={onClose} style={{ color: '#9ca3af', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>
      {erro ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <p style={{ color: '#f87171', textAlign: 'center', fontSize: 14 }}>{erro}</p>
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>

          {/* Overlay: 4 faixas escuras deixando janela central livre */}
          {/* Topo */}
          <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 'calc(50% - 55px)', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }}/>
          {/* Base */}
          <div style={{ position: 'absolute', inset: 'auto 0 0 0', height: 'calc(50% - 55px)', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }}/>
          {/* Esquerda */}
          <div style={{ position: 'absolute', top: 'calc(50% - 55px)', bottom: 'calc(50% - 55px)', left: 0, width: '10%', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }}/>
          {/* Direita */}
          <div style={{ position: 'absolute', top: 'calc(50% - 55px)', bottom: 'calc(50% - 55px)', right: 0, width: '10%', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }}/>

          {/* Borda da janela + linha de scan animada */}
          <div style={{
            position: 'absolute', left: '10%', right: '10%',
            top: '50%', transform: 'translateY(-55px)',
            height: 110, pointerEvents: 'none',
            border: '2px solid #2dd4a044', borderRadius: 10,
            overflow: 'hidden',
          }}>
            {/* cantos verdes */}
            {[
              { top: 0, left: 0, borderTop: '3px solid #2dd4a0', borderLeft: '3px solid #2dd4a0', borderRadius: '10px 0 0 0' },
              { top: 0, right: 0, borderTop: '3px solid #2dd4a0', borderRight: '3px solid #2dd4a0', borderRadius: '0 10px 0 0' },
              { bottom: 0, left: 0, borderBottom: '3px solid #2dd4a0', borderLeft: '3px solid #2dd4a0', borderRadius: '0 0 0 10px' },
              { bottom: 0, right: 0, borderBottom: '3px solid #2dd4a0', borderRight: '3px solid #2dd4a0', borderRadius: '0 0 10px 0' },
            ].map((s, i) => (
              <div key={i} style={{ position: 'absolute', width: 22, height: 22, ...s }}/>
            ))}
            {/* linha animada de scan */}
            <div style={{
              position: 'absolute', left: 0, right: 0,
              top: `${scanLine}%`,
              height: 2,
              background: 'linear-gradient(90deg, transparent, #2dd4a0cc, transparent)',
              boxShadow: '0 0 6px #2dd4a0',
            }}/>
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
function CardConfirmacao({
  busca, localAtual, onLocalChange,
  onConfirmar, onCancelar, salvando,
  categorias, departamentos, invDepartamentoNome,
}) {
  const { encontrado, bem, plaqueta } = busca

  const [cadastrarPendente, setCadastrarPendente] = useState(false)
  const [novaDesc, setNovaDesc]   = useState('')
  const [novaCatId, setNovaCatId] = useState('')
  const [novaDepId, setNovaDepId] = useState(() => {
    const d = departamentos.find(d => d.nome === invDepartamentoNome)
    return d ? String(d.id) : ''
  })

  let situacaoPrevista = 'LOCALIZADO'
  if (!encontrado) {
    situacaoPrevista = 'NAO_CADASTRADO'
  } else if (bem.localizacao && localAtual && bem.localizacao.toLowerCase() !== localAtual.toLowerCase()) {
    situacaoPrevista = 'LOCAL_DIVERGENTE'
  }
  const cor = COR[situacaoPrevista]

  const podeCadastrar = novaDesc.trim() && novaCatId && novaDepId

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
        padding: '20px 20px 28px',
        boxShadow: `0 -8px 40px ${cor.border}33`,
        maxHeight: '90dvh', overflowY: 'auto',
      }}>

        {/* Foto + plaqueta */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
          {encontrado && bem.foto_url ? (
            <img src={bem.foto_url} alt=""
              style={{ width: 76, height: 76, borderRadius: 12, objectFit: 'cover', border: `2px solid ${cor.border}`, flexShrink: 0 }}/>
          ) : (
            <div style={{
              width: 76, height: 76, borderRadius: 12, flexShrink: 0,
              background: '#1f2937', border: `2px solid ${cor.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
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
                background: `${cor.bg}aa`, padding: '2px 8px', borderRadius: 999,
              }}>
                {cor.emoji} {cor.label}
              </span>
            </div>

            {encontrado ? (
              <>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.2, marginBottom: 3 }}>
                  {bem.descricao}
                </p>
                <p style={{ fontSize: 12, color: '#6b7280' }}>
                  {bem.categoria?.nome} · {bem.departamento?.nome}
                </p>
              </>
            ) : (
              <p style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Plaqueta não cadastrada</p>
            )}
          </div>
        </div>

        {/* Info do sistema — só quando encontrado */}
        {encontrado && (
          <div style={{ background: '#1f2937', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            {bem.localizacao && (
              <div style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: '#6b7280', width: 90, flexShrink: 0 }}>Local no sist.</span>
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>📍 {bem.localizacao}</span>
              </div>
            )}
            {bem.valor_aquisicao != null && (
              <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <span style={{ color: '#6b7280', width: 90, flexShrink: 0 }}>Valor</span>
                <span style={{ color: '#e2e8f0' }}>{fmtR(bem.valor_aquisicao)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── ITEM NÃO CADASTRADO: opção de cadastrar como pendente ── */}
        {!encontrado && (
          <div style={{ marginBottom: 14 }}>
            {/* Toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setCadastrarPendente(false)}
                style={{
                  flex: 1, padding: '9px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: !cadastrarPendente ? '#9333ea22' : 'transparent',
                  border: `1.5px solid ${!cadastrarPendente ? '#9333ea' : '#374151'}`,
                  color: !cadastrarPendente ? '#c084fc' : '#6b7280',
                }}>
                🆕 Só registrar
              </button>
              <button onClick={() => setCadastrarPendente(true)}
                style={{
                  flex: 1, padding: '9px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: cadastrarPendente ? '#2dd4a022' : 'transparent',
                  border: `1.5px solid ${cadastrarPendente ? '#2dd4a0' : '#374151'}`,
                  color: cadastrarPendente ? '#2dd4a0' : '#6b7280',
                }}>
                ✏️ Cadastrar pendente
              </button>
            </div>

            {!cadastrarPendente && (
              <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                Será registrado como não catalogado. Trate depois no desktop.
              </p>
            )}

            {/* Mini-formulário de cadastro rápido */}
            {cadastrarPendente && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
                  Preencha o mínimo — valor e NF completam no desktop depois.
                </p>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>
                    Descrição *
                  </label>
                  <input
                    value={novaDesc}
                    onChange={e => setNovaDesc(e.target.value)}
                    placeholder="Ex: Cadeira giratória preta"
                    style={inpStyle()}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>
                    Categoria *
                  </label>
                  <select value={novaCatId} onChange={e => setNovaCatId(e.target.value)} style={inpStyle()}>
                    <option value="">Selecione…</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>
                    Departamento *
                  </label>
                  <select value={novaDepId} onChange={e => setNovaDepId(e.target.value)} style={inpStyle()}>
                    <option value="">Selecione…</option>
                    {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Local encontrado */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Local onde foi encontrado
            {situacaoPrevista === 'LOCAL_DIVERGENTE' && <span style={{ color: '#fbbf24' }}> ⚠️ diverge do cadastro</span>}
          </label>
          <input
            value={localAtual}
            onChange={e => onLocalChange(e.target.value)}
            placeholder={encontrado && bem.localizacao ? bem.localizacao : 'Ex: Bancada 2, Depósito…'}
            style={inpStyle(situacaoPrevista === 'LOCAL_DIVERGENTE' ? '#d97706' : '#374151')}
          />
        </div>

        {/* Confirmar */}
        <button
          onClick={() => onConfirmar({ cadastrarPendente, novaDesc, novaCatId, novaDepId })}
          disabled={salvando || (cadastrarPendente && !podeCadastrar)}
          style={{
            width: '100%', padding: '15px', borderRadius: 14,
            background: cor.border, border: 'none',
            color: '#000', fontWeight: 900, fontSize: 17,
            cursor: (salvando || (cadastrarPendente && !podeCadastrar)) ? 'not-allowed' : 'pointer',
            opacity: (salvando || (cadastrarPendente && !podeCadastrar)) ? 0.5 : 1,
            marginBottom: 10,
          }}
        >
          {salvando ? 'Registrando…' : (encontrado ? `${cor.emoji} Confirmar` : (cadastrarPendente ? '✏️ Cadastrar e confirmar' : '🆕 Registrar como não catalogado'))}
        </button>

        <button
          onClick={onCancelar}
          disabled={salvando}
          style={{
            width: '100%', padding: '11px', borderRadius: 14,
            background: 'transparent', border: '1.5px solid #374151',
            color: '#6b7280', fontWeight: 700, fontSize: 14, cursor: 'pointer',
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
  const [categorias, setCategorias]   = useState([])
  const [departamentos, setDepartamentos] = useState([])

  const [step, setStep]               = useState('scan')
  const [plaqueta, setPlaqueta]       = useState('')
  const [buscaResult, setBuscaResult] = useState(null)
  const [localEncontrado, setLocalEncontrado] = useState('')
  const [operador, setOperador]       = useState(() => localStorage.getItem('imob_operador') || '')
  const [salvando, setSalvando]       = useState(false)
  const [flash, setFlash]             = useState(null)
  const [showScanner, setShowScanner] = useState(false)
  const [linkCopiado, setLinkCopiado] = useState(false)

  const inputRef = useRef(null)
  const temCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window

  // ── carrega inventário + listas ──────────────────────────────────────────────
  const carregarInventario = useCallback(async () => {
    try {
      const [invRes, catRes, depRes] = await Promise.all([
        api.get(`/imobilizado/inventarios/${id}/`),
        api.get('/imobilizado/categorias/'),
        api.get('/imobilizado/departamentos/'),
      ])
      setInventario(invRes.data)
      setItens([...(invRes.data.itens || [])].reverse())
      setCategorias(catRes.data)
      setDepartamentos(depRes.data)
    } catch {
      setInventario(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { carregarInventario() }, [carregarInventario])
  useEffect(() => { if (operador) localStorage.setItem('imob_operador', operador) }, [operador])
  useEffect(() => { if (step === 'scan') setTimeout(() => inputRef.current?.focus(), 150) }, [step])

  // ── busca sem registrar ──────────────────────────────────────────────────────
  const buscarPlaqueta = useCallback(async (plq) => {
    const p = plq.trim().toUpperCase()
    if (!p) return
    setPlaqueta('')
    setStep('buscando')
    try {
      const { data } = await api.get('/imobilizado/bens/buscar/', { params: { plaqueta: p } })
      setLocalEncontrado(data.encontrado ? (data.bem.localizacao || '') : '')
      setBuscaResult(data)
      setStep('confirmar')
    } catch {
      setStep('scan')
      mostrarFlash({ bg: '#1c0a17', border: '#dc2626', text: '#f87171', msg: '✗ Erro ao buscar plaqueta' })
    }
  }, [])

  // ── confirma leitura (com ou sem cadastro prévio) ────────────────────────────
  const confirmar = useCallback(async ({ cadastrarPendente, novaDesc, novaCatId, novaDepId }) => {
    setSalvando(true)
    let plq = buscaResult.encontrado ? buscaResult.bem.plaqueta : buscaResult.plaqueta

    try {
      // Se não cadastrado e usuário quer cadastrar como pendente → cria o Bem primeiro
      if (!buscaResult.encontrado && cadastrarPendente) {
        const { data: bemData } = await api.post('/imobilizado/bens/', {
          plaqueta:        plq,
          descricao:       novaDesc.trim(),
          categoria_id:    novaCatId,
          departamento_id: novaDepId,
          localizacao:     localEncontrado.trim(),
        })
        if (!bemData.ok) throw new Error('Falha ao cadastrar bem')
      }

      // Registra a leitura (agora o bem existe se foi cadastrado)
      const { data } = await api.post(`/imobilizado/inventarios/${id}/leitura/`, {
        plaqueta:               plq,
        localizacao_encontrada: localEncontrado.trim(),
        contado_por:            operador.trim(),
      })
      const item = data.item
      setItens(prev => {
        const idx = prev.findIndex(i => i.plaqueta_lida === item.plaqueta_lida)
        if (idx >= 0) { const n = [...prev]; n[idx] = item; return n }
        return [item, ...prev]
      })
      const cor = COR[item.situacao] || COR.LOCALIZADO
      mostrarFlash({ bg: cor.bg, border: cor.border, text: cor.text, msg: `${cor.emoji} ${cor.label}` })
    } catch (e) {
      const msg = e.response?.data?.erro || e.message || 'Erro ao registrar'
      mostrarFlash({ bg: '#1c0a17', border: '#dc2626', text: '#f87171', msg: `✗ ${msg}` })
    } finally {
      setSalvando(false)
      setBuscaResult(null)
      setLocalEncontrado('')
      setStep('scan')
    }
  }, [id, buscaResult, localEncontrado, operador])

  const mostrarFlash = (f) => { setFlash(f); setTimeout(() => setFlash(null), 2200) }
  const onSubmit     = (e) => { e.preventDefault(); buscarPlaqueta(plaqueta) }
  const onQRDetected = useCallback((raw) => { setShowScanner(false); buscarPlaqueta(raw) }, [buscarPlaqueta])

  const copiarLink = async () => {
    const url = `${window.location.origin}/imobilizado/${id}/contagem`
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopiado(true)
      setTimeout(() => setLinkCopiado(false), 2500)
    } catch {
      prompt('Copie o link abaixo:', url)
    }
  }

  const finalizarInventario = async () => {
    if (!window.confirm('Finalizar inventário? Não aceitará mais leituras.')) return
    await api.post(`/imobilizado/inventarios/${id}/finalizar/`)
    navigate('/imobilizado')
  }

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

  const emAberto    = inventario.status === 'ABERTO'
  const totalLidos  = itens.length
  const localizados = itens.filter(i => i.situacao === 'LOCALIZADO').length
  const divergentes = itens.filter(i => i.situacao === 'LOCAL_DIVERGENTE').length
  const nCadastrado = itens.filter(i => i.situacao === 'NAO_CADASTRADO').length

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
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copiarLink}
            style={{
              color: linkCopiado ? '#2dd4a0' : '#9ca3af',
              background: 'none', border: `1px solid ${linkCopiado ? '#2dd4a0' : '#374151'}`,
              fontSize: 13, cursor: 'pointer', padding: '6px 10px', borderRadius: 8, transition: 'all .2s',
            }}>
            {linkCopiado ? '✓ Copiado' : '🔗 Link'}
          </button>
          <button onClick={() => navigate('/imobilizado')}
            style={{ color: '#9ca3af', background: 'none', border: '1px solid #374151', fontSize: 13, cursor: 'pointer', padding: '6px 12px', borderRadius: 8 }}>
            ← Voltar
          </button>
        </div>
      </div>

      {/* ── Contadores ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid #1f2937', flexShrink: 0 }}>
        {[
          { n: totalLidos,  l: 'Lidos',       c: '#e2e8f0' },
          { n: localizados, l: 'Localiz.',    c: '#4ade80' },
          { n: divergentes, l: 'Divergentes', c: '#fbbf24' },
          { n: nCadastrado, l: 'Não Cad.',    c: '#c084fc' },
        ].map((k, i) => (
          <div key={i} style={{ padding: '10px 8px', textAlign: 'center', borderRight: i < 3 ? '1px solid #1f2937' : 'none' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: k.c, lineHeight: 1 }}>{k.n}</p>
            <p style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>{k.l}</p>
          </div>
        ))}
      </div>

      {/* ── Área de scan ── */}
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
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>Operador:</span>
                <input value={operador} onChange={e => setOperador(e.target.value)}
                  placeholder="Seu nome"
                  style={{ flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '7px 12px', color: '#9ca3af', fontSize: 13, outline: 'none' }}/>
              </div>
              {temCamera && (
                <button onClick={() => setShowScanner(true)}
                  style={{
                    marginTop: 10, width: '100%', padding: '13px',
                    background: '#2dd4a010', border: '1.5px solid #2dd4a030',
                    borderRadius: 12, color: '#2dd4a0', fontWeight: 700, fontSize: 16,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  📷 Escanear pela câmera
                </button>
              )}
              {!temCamera && (
                <p style={{ fontSize: 11, color: '#4b5563', marginTop: 8, textAlign: 'center' }}>
                  Scanner de câmera não disponível — use o campo acima.
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
          const cor  = COR[item.situacao] || COR.LOCALIZADO
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
                <p style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{item.plaqueta_lida}</p>
                <p style={{ fontSize: 13, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{desc}</p>
                {item.localizacao_encontrada && (
                  <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📍 {item.localizacao_encontrada}</p>
                )}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, color: cor.text,
                background: `${cor.bg}cc`, border: `1px solid ${cor.border}`,
                padding: '3px 8px', borderRadius: 999, flexShrink: 0,
              }}>
                {cor.emoji}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Footer ── */}
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

      {/* ── Flash ── */}
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
          categorias={categorias}
          departamentos={departamentos}
          invDepartamentoNome={inventario.local_area || ''}
        />
      )}

      {/* ── Scanner ── */}
      {showScanner && (
        <QRScanner onDetected={onQRDetected} onClose={() => setShowScanner(false)}/>
      )}
    </div>
  )
}
