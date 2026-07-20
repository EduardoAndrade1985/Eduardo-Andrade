import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

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

  const [novaDesc, setNovaDesc]       = useState('')
  const [novaCatId, setNovaCatId]     = useState('')
  const [novaDepId, setNovaDepId]     = useState(() => {
    const d = departamentos.find(d => d.nome === invDepartamentoNome)
    return d ? String(d.id) : ''
  })
  const [quantidade, setQuantidade]       = useState(1)
  const [foto, setFoto]                   = useState(null)
  const [fotoPreview, setFotoPreview]     = useState(null)
  const [fotoLeitura, setFotoLeitura]         = useState(null)
  const [fotoLeituraPreview, setFotoLeituraPreview] = useState(null)
  const fotoRef        = useRef(null)
  const fotoLeituraRef = useRef(null)

  const handleFoto = e => {
    const file = e.target.files?.[0]
    if (!file) return
    setFoto(file)
    setFotoPreview(URL.createObjectURL(file))
  }

  const handleFotoLeitura = e => {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoLeitura(file)
    setFotoLeituraPreview(URL.createObjectURL(file))
  }

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
          {/* input de foto para itens encontrados sem foto no sistema */}
          <input ref={fotoLeituraRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={handleFotoLeitura} />

          {encontrado && bem.foto_url ? (
            <img src={bem.foto_url} alt=""
              style={{ width: 76, height: 76, borderRadius: 12, objectFit: 'cover', border: `2px solid ${cor.border}`, flexShrink: 0 }}/>
          ) : encontrado && !bem.foto_url ? (
            /* item encontrado mas sem foto — clicável para tirar foto */
            fotoLeituraPreview ? (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={fotoLeituraPreview} alt=""
                  style={{ width: 76, height: 76, borderRadius: 12, objectFit: 'cover', border: `2px solid ${cor.border}` }}/>
                <button onClick={() => fotoLeituraRef.current?.click()} style={{
                  position: 'absolute', bottom: 2, right: 2,
                  background: 'rgba(0,0,0,0.75)', border: 'none',
                  color: '#e2e8f0', fontSize: 10, padding: '2px 5px',
                  borderRadius: 5, cursor: 'pointer', lineHeight: 1.4,
                }}>📷</button>
              </div>
            ) : (
              <button onClick={() => fotoLeituraRef.current?.click()} style={{
                width: 76, height: 76, borderRadius: 12, flexShrink: 0,
                background: '#1f2937', border: `2px dashed ${cor.border}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 2, cursor: 'pointer',
              }}>
                <span style={{ fontSize: 24 }}>📷</span>
                <span style={{ fontSize: 9, color: '#6b7280' }}>+ Foto</span>
              </button>
            )
          ) : (
            /* NAO_CADASTRADO — placeholder fixo (foto capturada na seção abaixo) */
            <div style={{
              width: 76, height: 76, borderRadius: 12, flexShrink: 0,
              background: '#1f2937', border: `2px solid ${cor.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
            }}>❓</div>
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

        {/* ── ITEM NÃO CADASTRADO: registrar pendente com foto ── */}
        {!encontrado && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
              Preencha o mínimo — valor e NF completam no desktop depois.
            </p>

            {/* Captura de foto */}
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFoto} />
            {fotoPreview ? (
              <div style={{ position: 'relative' }}>
                <img src={fotoPreview} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 10, border: '2px solid #9333ea' }} />
                <button onClick={() => fotoRef.current?.click()} style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#d1d5db', fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}>
                  📷 Trocar
                </button>
              </div>
            ) : (
              <button onClick={() => fotoRef.current?.click()} style={{
                width: '100%', padding: '14px', borderRadius: 10,
                background: '#1f2937', border: '1.5px dashed #4b5563',
                color: '#9ca3af', fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                📷 Tirar foto do item (recomendado)
              </button>
            )}

            <div>
              <label style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>Descrição *</label>
              <input value={novaDesc} onChange={e => setNovaDesc(e.target.value)} placeholder="Ex: Cadeira giratória preta" style={inpStyle()} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>Categoria *</label>
              <select value={novaCatId} onChange={e => setNovaCatId(e.target.value)} style={inpStyle()}>
                <option value="">Selecione…</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>Departamento *</label>
              <select value={novaDepId} onChange={e => setNovaDepId(e.target.value)} style={inpStyle()}>
                <option value="">Selecione…</option>
                {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>
                Quantidade encontrada
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setQuantidade(q => Math.max(1, q - 1))}
                  style={{ width: 40, height: 40, borderRadius: 10, background: '#374151', border: 'none', color: '#e2e8f0', fontSize: 20, cursor: 'pointer', flexShrink: 0 }}>−</button>
                <input
                  type="number" min="1" max="999"
                  value={quantidade}
                  onChange={e => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ ...inpStyle(), textAlign: 'center', fontWeight: 800, fontSize: 18, flex: 1 }}
                />
                <button onClick={() => setQuantidade(q => q + 1)}
                  style={{ width: 40, height: 40, borderRadius: 10, background: '#374151', border: 'none', color: '#e2e8f0', fontSize: 20, cursor: 'pointer', flexShrink: 0 }}>+</button>
              </div>
              {quantidade > 1 && (
                <p style={{ fontSize: 11, color: '#c084fc', marginTop: 4 }}>
                  ⚠ {quantidade} unidades — plaquetas serão atribuídas na conciliação
                </p>
              )}
            </div>
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
          onClick={() => onConfirmar({ novaDesc, novaCatId, novaDepId, foto, quantidade, fotoLeitura })}
          disabled={salvando || (!encontrado && !podeCadastrar)}
          style={{
            width: '100%', padding: '15px', borderRadius: 14,
            background: cor.border, border: 'none',
            color: '#000', fontWeight: 900, fontSize: 17,
            cursor: (salvando || (!encontrado && !podeCadastrar)) ? 'not-allowed' : 'pointer',
            opacity: (salvando || (!encontrado && !podeCadastrar)) ? 0.5 : 1,
            marginBottom: 10,
          }}
        >
          {salvando ? 'Registrando…' : (encontrado ? `${cor.emoji} Confirmar` : '🆕 Registrar pendente')}
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
  const { token } = useParams()

  const invApi = useMemo(() => {
    const BASE = import.meta.env.VITE_API_BASE_URL || ''
    return axios.create({
      baseURL: BASE + '/api',
      headers: { 'Content-Type': 'application/json', 'X-Inventario-Token': token },
    })
  }, [token])

  const [inventario, setInventario]       = useState(null)
  const [invId, setInvId]                 = useState(null)
  const [loading, setLoading]             = useState(true)
  const [itens, setItens]                 = useState([])
  const [categorias, setCategorias]       = useState([])
  const [departamentos, setDepartamentos] = useState([])

  const [step, setStep]               = useState('scan')
  const [plaqueta, setPlaqueta]       = useState('')
  const [buscaResult, setBuscaResult] = useState(null)
  const [localEncontrado, setLocalEncontrado] = useState('')
  const [operador, setOperador]       = useState(() => localStorage.getItem('imob_operador') || '')
  const [salvando, setSalvando]       = useState(false)
  const [flash, setFlash]             = useState(null)
  const [showScanner, setShowScanner] = useState(false)

  const inputRef = useRef(null)
  const temCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window

  // ── carrega inventário + listas ──────────────────────────────────────────────
  const carregarInventario = useCallback(async () => {
    try {
      const [invRes, catRes, depRes] = await Promise.all([
        invApi.get(`/imobilizado/inventarios/token/${token}/`),
        invApi.get('/imobilizado/categorias/'),
        invApi.get('/imobilizado/departamentos/'),
      ])
      setInventario(invRes.data)
      setInvId(invRes.data.id)
      setItens([...(invRes.data.itens || [])].reverse())
      setCategorias(catRes.data)
      setDepartamentos(depRes.data)
    } catch {
      setInventario(null)
    } finally {
      setLoading(false)
    }
  }, [token, invApi])

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
      const { data } = await invApi.get('/imobilizado/bens/buscar/', { params: { plaqueta: p } })
      setLocalEncontrado(data.encontrado ? (data.bem.localizacao || '') : '')
      setBuscaResult(data)
      setStep('confirmar')
    } catch {
      setStep('scan')
      mostrarFlash({ bg: '#1c0a17', border: '#dc2626', text: '#f87171', msg: '✗ Erro ao buscar plaqueta' })
    }
  }, [invApi])

  // ── confirma leitura (com ou sem cadastro prévio) ────────────────────────────
  const confirmar = useCallback(async ({ novaDesc, novaCatId, novaDepId, foto, quantidade, fotoLeitura }) => {
    setSalvando(true)
    const plq = buscaResult.encontrado ? buscaResult.bem.plaqueta : buscaResult.plaqueta

    try {
      let leituraData

      if (!buscaResult.encontrado) {
        // NAO_CADASTRADO: envia dados provisionais via FormData
        const formData = new FormData()
        formData.append('plaqueta',                  plq)
        formData.append('localizacao_encontrada',    localEncontrado.trim())
        formData.append('contado_por',               operador.trim())
        if (novaDesc)       formData.append('descricao_provisoria',       novaDesc.trim())
        if (novaCatId)      formData.append('categoria_provisoria_id',    novaCatId)
        if (novaDepId)      formData.append('departamento_provisorio_id', novaDepId)
        if (foto)           formData.append('foto_provisoria',            foto)
        if (quantidade > 1) formData.append('quantidade',                 quantidade)
        const { data } = await invApi.post(`/imobilizado/inventarios/${invId}/leitura/`, formData, {
          headers: { 'Content-Type': undefined },
        })
        leituraData = data
      } else if (fotoLeitura) {
        // LOCALIZADO/DIVERGENTE com foto tirada no ato — envia como FormData
        const formData = new FormData()
        formData.append('plaqueta',               plq)
        formData.append('localizacao_encontrada', localEncontrado.trim())
        formData.append('contado_por',            operador.trim())
        formData.append('foto_leitura',           fotoLeitura)
        const { data } = await invApi.post(`/imobilizado/inventarios/${invId}/leitura/`, formData, {
          headers: { 'Content-Type': undefined },
        })
        leituraData = data
      } else {
        const { data } = await invApi.post(`/imobilizado/inventarios/${invId}/leitura/`, {
          plaqueta:               plq,
          localizacao_encontrada: localEncontrado.trim(),
          contado_por:            operador.trim(),
        })
        leituraData = data
      }

      const item = leituraData.item
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
  }, [invId, buscaResult, localEncontrado, operador, invApi])

  const mostrarFlash = (f) => { setFlash(f); setTimeout(() => setFlash(null), 2200) }
  const onSubmit     = (e) => { e.preventDefault(); buscarPlaqueta(plaqueta) }
  const onQRDetected = useCallback((raw) => { setShowScanner(false); buscarPlaqueta(raw) }, [buscarPlaqueta])

  const finalizarInventario = async () => {
    if (!window.confirm('Finalizar contagem? A conciliação e encerramento são feitos pelo administrador no desktop.')) return
    try {
      await invApi.post(`/imobilizado/inventarios/${invId}/finalizar/`)
      setInventario(prev => ({ ...prev, status: 'AGUARDANDO' }))
    } catch {
      mostrarFlash({ bg: '#1c0a17', border: '#dc2626', text: '#f87171', msg: '✗ Erro ao finalizar' })
    }
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
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0d1117', gap: 12, padding: 24 }}>
        <p style={{ fontSize: 40, lineHeight: 1 }}>🔒</p>
        <p style={{ color: '#f87171', fontSize: 16, fontWeight: 700, textAlign: 'center' }}>Link de contagem inativo</p>
        <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center' }}>A contagem pode ter sido finalizada ou o link foi alterado pelo administrador.</p>
      </div>
    )
  }

  const emAberto     = inventario.status === 'ABERTO'
  const aguardando   = inventario.status === 'AGUARDANDO'
  const totalLidos  = itens.length
  const localizados = itens.filter(i => i.situacao === 'LOCALIZADO').length
  const divergentes = itens.filter(i => i.situacao === 'LOCAL_DIVERGENTE').length
  const nCadastrado = itens.filter(i => i.situacao === 'NAO_CADASTRADO').length

  return (
    <div style={{ minHeight: '100dvh', background: '#0d1117', color: '#e2e8f0', fontFamily: 'system-ui,sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <div style={{ background: '#111827', borderBottom: '1px solid #1f2937', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
        <div>
          <p style={{ fontWeight: 800, fontSize: 16, color: '#f1f5f9' }}>
            {inventario.local_area || `Inventário ${inventario.data}`}
          </p>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {inventario.data} · {emAberto ? '🟢 Em andamento' : aguardando ? '⏳ Aguardando conciliação' : '🔒 Encerrado'}
          </p>
        </div>
        <button
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen?.().catch(() => {})
            } else {
              document.exitFullscreen?.().catch(() => {})
            }
          }}
          style={{ color: '#6b7280', background: 'none', border: '1px solid #374151', fontSize: 20, cursor: 'pointer', padding: '4px 10px', borderRadius: 8, lineHeight: 1 }}
          title="Tela cheia">
          ⛶
        </button>
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>Operador:</span>
                <input value={operador} onChange={e => setOperador(e.target.value)}
                  placeholder="Seu nome"
                  style={{ flex: 1, background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '7px 12px', color: '#9ca3af', fontSize: 13, outline: 'none' }}/>
              </div>
              <form onSubmit={onSubmit}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    ref={inputRef}
                    autoFocus
                    value={plaqueta}
                    onChange={e => setPlaqueta(e.target.value.toUpperCase())}
                    placeholder="Plaqueta…"
                    disabled={step !== 'scan'}
                    style={{
                      flex: 1, boxSizing: 'border-box',
                      background: '#1f2937', border: '1.5px solid #374151',
                      borderRadius: 12, padding: '14px 16px',
                      color: '#f1f5f9', fontSize: 18, outline: 'none',
                      letterSpacing: 2, fontFamily: 'monospace', fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  />
                  <button type="submit" disabled={step !== 'scan' || !plaqueta.trim()}
                    style={{
                      background: '#2dd4a0', border: 'none', borderRadius: 12,
                      color: '#000', fontSize: 22, fontWeight: 900,
                      padding: '0 16px', cursor: 'pointer', flexShrink: 0,
                      opacity: (step !== 'scan' || !plaqueta.trim()) ? 0.35 : 1,
                    }}>
                    🔍
                  </button>
                </div>
              </form>
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

      {aguardando && (
        <div style={{ padding: '12px 16px', background: '#1e1b3a', borderBottom: '1px solid #4338ca', textAlign: 'center', flexShrink: 0 }}>
          <p style={{ color: '#818cf8', fontSize: 14, fontWeight: 700 }}>⏳ Contagem finalizada — administrador fará a conciliação no desktop</p>
        </div>
      )}
      {!emAberto && !aguardando && (
        <div style={{ padding: '12px 16px', background: '#431407', borderBottom: '1px solid #92400e', textAlign: 'center', flexShrink: 0 }}>
          <p style={{ color: '#fbbf24', fontSize: 14, fontWeight: 700 }}>🔒 Inventário encerrado — somente visualização</p>
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
            Finalizar Contagem ({totalLidos} leitura{totalLidos !== 1 ? 's' : ''})
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
