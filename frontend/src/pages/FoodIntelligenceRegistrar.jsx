import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../services/api'
import { useTheme } from '../contexts/ThemeContext'

const TOKEN_KEY = 'fi_dispositivo_token'

// ordena/sugere por palavra-chave no nome (funciona mesmo com nomes customizados pelo hotel)
const ORDEM_REFEICAO = ['manh', 'almo', 'jant']

function ordenarRefeicoes(refeicoes) {
  const rank = nome => {
    const idx = ORDEM_REFEICAO.findIndex(k => nome.toLowerCase().includes(k))
    return idx === -1 ? ORDEM_REFEICAO.length : idx
  }
  return [...refeicoes].sort((a, b) => rank(a.nome) - rank(b.nome))
}

// sugere a refeição mais provável pelo horário atual
function sugerirRefeicao(refeicoes) {
  if (!refeicoes.length) return null
  const hora = new Date().getHours()
  const alvo = hora < 11 ? 'manh' : hora < 16 ? 'almo' : 'jant'
  const match = refeicoes.find(r => r.nome.toLowerCase().includes(alvo))
  return match || refeicoes[0]
}

// ordem fixa: Sobra de Buffet, Erro de Produção, Vencido/Validade, (Outro fica de fora dos chips)
const ORDEM_TIPO_PERDA = ['sobra', 'produ', 'vencido']

function ordenarTiposPerda(tipos) {
  const visiveis = tipos.filter(t => !t.nome.toLowerCase().includes('outro'))
  const rank = nome => {
    const idx = ORDEM_TIPO_PERDA.findIndex(k => nome.toLowerCase().includes(k))
    return idx === -1 ? ORDEM_TIPO_PERDA.length : idx
  }
  return [...visiveis].sort((a, b) => rank(a.nome) - rank(b.nome))
}

function Section({ icon, title, children }) {
  return (
    <div className="bg-bg2 border border-white/[0.06] rounded-xl p-3.5">
      <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
        <span>{icon}</span>{title}
      </p>
      {children}
    </div>
  )
}

// ── Tela de pareamento (sem login) ───────────────────────────────────────────
function TelaPareamento({ onPareado }) {
  const [code, setCode]     = useState('')
  const [status, setStatus] = useState('Gerando código...')
  const pollRef = useRef()

  const solicitarCodigo = useCallback(async () => {
    setStatus('Gerando código...')
    try {
      const { data } = await api.post('/desperdicio/dispositivos/pair/request/')
      setCode(data.code)
      setStatus('Aguardando pareamento pelo painel de gestão...')
    } catch {
      setStatus('Erro ao gerar código. Tentando novamente...')
      setTimeout(solicitarCodigo, 4000)
    }
  }, [])

  useEffect(() => { solicitarCodigo() }, [solicitarCodigo])

  useEffect(() => {
    if (!code) return
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get('/desperdicio/dispositivos/pair/status/', { params: { code } })
        if (data.paired) {
          clearInterval(pollRef.current)
          localStorage.setItem(TOKEN_KEY, data.token)
          onPareado(data.token)
        } else if (data.expired) {
          clearInterval(pollRef.current)
          setStatus('Código expirado.')
          setTimeout(solicitarCodigo, 1500)
        }
      } catch {}
    }, 3000)
    return () => clearInterval(pollRef.current)
  }, [code, onPareado, solicitarCodigo])

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="text-sm font-bold text-primary uppercase tracking-widest">🍽️ Food Intelligence</p>
      <p className="text-base text-muted">Peça ao gestor para parear este dispositivo no painel</p>
      <div className="px-10 py-6 rounded-3xl bg-bg2 border-2 border-primary/30">
        <p className="text-5xl font-bold tracking-[0.2em] text-primary">{code || '...'}</p>
      </div>
      <p className="text-xs text-muted/70">{status}</p>
    </div>
  )
}

// ── Tela de lançamento (dispositivo já pareado) ──────────────────────────────
function TelaLancamento({ token, dispositivo, onDesparear }) {
  const { tema, toggleTema } = useTheme()
  const [categorias, setCategorias] = useState([])
  const [tiposPerda, setTiposPerda] = useState([])
  const [tipoPerdaId, setTipoPerdaId] = useState('')
  const [refeicoes, setRefeicoes]   = useState([])
  const [refeicaoId, setRefeicaoId] = useState('')
  const [foto, setFoto]             = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [classificando, setClassificando] = useState(false)
  const [alimentoIa, setAlimentoIa] = useState('')
  const [confianca, setConfianca]   = useState(null)
  const [categoriaId, setCategoriaId] = useState('')
  const [pesoKg, setPesoKg]         = useState('')
  const [salvando, setSalvando]     = useState(false)
  const [mensagem, setMensagem]     = useState(null)
  const [nServidos, setNServidos]   = useState('')
  const [salvandoContagem, setSalvandoContagem] = useState(false)
  const [msgContagem, setMsgContagem] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    api.get('/desperdicio/categorias/', { params: { dispositivo_token: token } })
      .then(({ data }) => setCategorias(data)).catch(() => {})
    api.get('/desperdicio/tipos-perda/', { params: { dispositivo_token: token } })
      .then(({ data }) => {
        const ordenados = ordenarTiposPerda(data)
        setTiposPerda(ordenados)
        if (ordenados[0]) setTipoPerdaId(String(ordenados[0].id))
      }).catch(() => {})
    api.get('/desperdicio/refeicoes/', { params: { dispositivo_token: token } })
      .then(({ data }) => {
        const ordenadas = ordenarRefeicoes(data)
        setRefeicoes(ordenadas)
        const sugestao = sugerirRefeicao(ordenadas)
        if (sugestao) setRefeicaoId(String(sugestao.id))
      }).catch(() => {})
  }, [token])

  // manifest PWA específico — "Adicionar à Tela Inicial" abre direto em tela cheia, sem barra do navegador
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = '/manifest-desperdicio.json'
    document.head.appendChild(link)

    const metas = [
      ['apple-mobile-web-app-capable', 'yes'],
      ['mobile-web-app-capable', 'yes'],
      ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
      ['apple-mobile-web-app-title', 'Food Intel'],
    ].map(([name, content]) => {
      const m = document.createElement('meta')
      m.name = name
      m.content = content
      document.head.appendChild(m)
      return m
    })

    return () => {
      document.head.removeChild(link)
      metas.forEach(m => document.head.removeChild(m))
    }
  }, [])

  // busca a contagem já lançada hoje pra essa refeição (evita sobrescrever às cegas)
  useEffect(() => {
    if (!refeicaoId) { setNServidos(''); return }
    const hoje = new Date().toISOString().slice(0, 10)
    api.get('/desperdicio/contagem-clientes/', { params: { dispositivo_token: token, data: hoje, refeicao_id: refeicaoId } })
      .then(({ data }) => {
        const valor = data[0] ? String(data[0].n_clientes) : ''
        setNServidos(valor)
        ultimoSalvoRef.current = valor
      })
      .catch(() => {})
  }, [refeicaoId, token])

  const ultimoSalvoRef = useRef('')

  async function salvarContagem() {
    if (!refeicaoId || !nServidos || nServidos === ultimoSalvoRef.current) return
    setSalvandoContagem(true); setMsgContagem('')
    try {
      const hoje = new Date().toISOString().slice(0, 10)
      await api.post('/desperdicio/contagem-clientes/', {
        dispositivo_token: token, data: hoje, refeicao_id: refeicaoId, n_clientes: nServidos,
      })
      ultimoSalvoRef.current = nServidos
      setMsgContagem('✓ Salvo automaticamente')
      setTimeout(() => setMsgContagem(''), 3000)
    } catch {
      setMsgContagem('Erro ao salvar.')
    } finally {
      setSalvandoContagem(false)
    }
  }

  // mantém o campo focado visível quando o teclado do celular abre/fecha
  // (em telas pequenas o teclado cobre boa parte da tela e o campo some)
  useEffect(() => {
    if (!window.visualViewport) return
    const ajustar = () => {
      const el = document.activeElement
      if (el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    window.visualViewport.addEventListener('resize', ajustar)
    return () => window.visualViewport.removeEventListener('resize', ajustar)
  }, [])

  // heartbeat periódico — indica pro painel que o dispositivo está online
  useEffect(() => {
    const ping = () => api.post('/desperdicio/dispositivos/heartbeat/', { dispositivo_token: token }).catch(() => {})
    ping()
    const id = setInterval(ping, 60000)
    return () => clearInterval(id)
  }, [token])

  // reforço pro onFocus — espera o teclado abrir antes de rolar (visualViewport pode demorar)
  function scrollCampoVisivel(e) {
    const el = e.target
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
  }

  function selecionarFoto(file) {
    if (!file) return
    setFoto(file)
    setFotoPreview(URL.createObjectURL(file))
    setAlimentoIa('')
    setConfianca(null)
    setCategoriaId('')
  }

  async function classificarComIA() {
    if (!foto) return
    setClassificando(true)
    try {
      const form = new FormData()
      form.append('foto', foto)
      form.append('dispositivo_token', token)
      const { data } = await api.post('/desperdicio/classificar/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAlimentoIa(data.alimento_ia || '')
      setConfianca(data.confianca)
      if (data.categoria_sugerida_id) setCategoriaId(String(data.categoria_sugerida_id))
      if (!data.alimento_ia) {
        setMensagem({ tipo: 'erro', texto: data.erro ? `IA não identificou: ${data.erro}` : 'IA não identificou o prato. Digite o nome manualmente.' })
      }
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao classificar a foto. Digite o nome manualmente.' })
    } finally {
      setClassificando(false)
    }
  }

  function resetarLancamento() {
    setFoto(null)
    setFotoPreview(null)
    setAlimentoIa('')
    setConfianca(null)
    setCategoriaId('')
    setPesoKg('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const salvar = useCallback(async () => {
    const peso = parseFloat(String(pesoKg).replace(',', '.'))
    if (!peso || peso <= 0) { setMensagem({ tipo: 'erro', texto: 'Informe o peso em kg.' }); return }

    setSalvando(true)
    try {
      const form = new FormData()
      form.append('dispositivo_token', token)
      if (tipoPerdaId) form.append('tipo_perda_id', tipoPerdaId)
      if (refeicaoId) form.append('refeicao_id', refeicaoId)
      form.append('peso_kg', peso)
      form.append('alimento_ia', alimentoIa)
      if (confianca != null) form.append('confianca_ia', confianca)
      if (categoriaId) form.append('categoria_id', categoriaId)
      if (foto) form.append('foto', foto)

      const { data } = await api.post('/desperdicio/registros/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setMensagem({ tipo: 'ok', texto: `Registrado! Perda estimada: R$ ${(+data.valor_perda).toFixed(2).replace('.', ',')}` })
      resetarLancamento()
    } catch (err) {
      setMensagem({ tipo: 'erro', texto: err.response?.data?.erro || 'Erro ao salvar o lançamento.' })
    } finally {
      setSalvando(false)
    }
  }, [token, tipoPerdaId, refeicaoId, pesoKg, alimentoIa, confianca, categoriaId, foto])

  useEffect(() => {
    if (!mensagem) return
    const t = setTimeout(() => setMensagem(null), 4000)
    return () => clearTimeout(t)
  }, [mensagem])

  return (
    <div className="min-h-screen bg-bg flex flex-col">

      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-bg2 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-base font-bold text-primary truncate">🍽️ Food Intelligence</p>
          <p className="text-xs text-muted truncate">{dispositivo?.unidade_nome}{dispositivo?.setor_nome ? ` — ${dispositivo.setor_nome}` : ''}</p>
        </div>
        <div className="flex items-center gap-3.5 flex-shrink-0">
          <button onClick={toggleTema} title={tema === 'dark' ? 'Modo claro' : 'Modo escuro'}
            className="text-muted/60 hover:text-primary text-xl leading-none">{tema === 'dark' ? '☀️' : '🌙'}</button>
          <button onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
            title="Tela cheia" className="text-muted/60 hover:text-primary text-xl leading-none">⛶</button>
          <button onClick={onDesparear} className="text-xs text-muted/50 hover:text-rose-400">Trocar</button>
        </div>
      </div>

      {mensagem && (
        <div className={`px-4 py-1.5 text-xs font-semibold text-center flex-shrink-0 ${
          mensagem.tipo === 'ok' ? 'bg-primary/15 text-primary' : 'bg-rose-500/15 text-rose-400'
        }`}>
          {mensagem.texto}
        </div>
      )}

      <div className="flex-1 overflow-auto p-3.5 max-w-2xl w-full mx-auto flex flex-col gap-3">

        <Section icon="🍽️" title="Refeição">
          <div className="flex flex-wrap gap-2">
            {refeicoes.map(r => (
              <button key={r.id} onClick={() => setRefeicaoId(String(r.id))}
                className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition ${
                  refeicaoId === String(r.id)
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-bg3 border-white/[0.08] text-muted hover:border-primary/20'
                }`}>
                {r.nome}
              </button>
            ))}
            {refeicoes.length === 0 && (
              <p className="text-[11px] text-muted/50 py-1">Nenhuma refeição cadastrada — use a aba Cadastros no painel.</p>
            )}
          </div>
        </Section>

        <Section icon="👥" title="Refeições Servidas Hoje">
          <input type="number" inputMode="numeric" min="0" value={nServidos}
            onChange={e => setNServidos(e.target.value)} onBlur={salvarContagem} onFocus={scrollCampoVisivel}
            placeholder="Qtd. servida" disabled={!refeicaoId}
            className="w-full px-3 py-2.5 bg-bg3 border border-white/[0.08] rounded-lg text-base text-dim outline-none focus:border-primary/40 disabled:opacity-40"/>
          {(salvandoContagem || msgContagem) && (
            <p className={`text-[11px] mt-1.5 ${msgContagem.startsWith('✓') ? 'text-primary' : msgContagem ? 'text-rose-400' : 'text-muted'}`}>
              {salvandoContagem ? 'Salvando...' : msgContagem}
            </p>
          )}
        </Section>

        <Section icon="⚠️" title="Tipo de Perda">
          {tiposPerda.length > 0 ? (
            <select value={tipoPerdaId} onChange={e => setTipoPerdaId(e.target.value)}
              className="w-full px-3 py-2.5 bg-bg3 border border-white/[0.08] rounded-lg text-base text-dim outline-none focus:border-primary/40">
              {tiposPerda.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          ) : (
            <p className="text-[11px] text-muted/50 py-1">Nenhum tipo cadastrado — use a aba Cadastros no painel.</p>
          )}
        </Section>

        <Section icon="📷" title="Foto do Prato">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => selecionarFoto(e.target.files[0])}/>
          {!fotoPreview ? (
            <button onClick={() => fileRef.current?.click()}
              className="w-full py-3.5 rounded-lg border-2 border-dashed border-white/[0.12] text-muted hover:border-primary/30 hover:text-primary transition flex items-center justify-center gap-2">
              <span className="text-lg">📷</span>
              <span className="text-sm font-semibold">Tirar / Escolher Foto</span>
            </button>
          ) : (
            <div className="flex flex-col gap-2.5">
              <img src={fotoPreview} alt="Prato" className="w-full max-h-24 object-cover rounded-lg border border-white/[0.08]"/>
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()}
                  className="flex-1 py-2 rounded-lg border border-white/[0.08] text-muted text-sm hover:border-primary/30">
                  Trocar Foto
                </button>
                <button onClick={classificarComIA} disabled={classificando}
                  className="flex-1 py-2 rounded-lg bg-primary/15 border border-primary/40 text-primary text-sm font-semibold disabled:opacity-50">
                  {classificando ? 'Classificando...' : '✨ Classificar com IA'}
                </button>
              </div>
            </div>
          )}
        </Section>

        <Section icon="🥘" title="Alimento e Categoria">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted">
                Alimento {confianca != null && `(confiança da IA: ${(confianca*100).toFixed(0)}%)`}
              </span>
              <input type="text" value={alimentoIa} onChange={e => setAlimentoIa(e.target.value)} onFocus={scrollCampoVisivel}
                placeholder="Ex: Filé mignon grelhado"
                className="px-3 py-2.5 bg-bg3 border border-white/[0.08] rounded-lg text-base text-dim outline-none focus:border-primary/40"/>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted">Categoria de Custo</span>
              <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)}
                className="px-3 py-2.5 bg-bg3 border border-white/[0.08] rounded-lg text-base text-dim outline-none focus:border-primary/40">
                <option value="">Sem categoria (custo zerado)</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>
        </Section>

        <Section icon="⚖️" title="Peso (kg)">
          <input type="number" inputMode="decimal" step="0.001" min="0" value={pesoKg}
            onChange={e => setPesoKg(e.target.value)} onFocus={scrollCampoVisivel} placeholder="0,000"
            className="w-full px-3 py-3 bg-bg3 border border-white/[0.08] rounded-lg text-2xl font-bold text-dim text-center outline-none focus:border-primary/40"/>
        </Section>

        <button onClick={salvar} disabled={salvando}
          className="py-3.5 rounded-xl bg-primary text-bg font-bold text-base disabled:opacity-50 shadow-xl flex-shrink-0 sticky bottom-2">
          {salvando ? 'Salvando...' : 'Salvar Lançamento'}
        </button>

      </div>
    </div>
  )
}

// ── componente principal: resolve pareado x não pareado ──────────────────────
export default function FoodIntelligenceRegistrar() {
  const [token, setToken]           = useState(localStorage.getItem(TOKEN_KEY) || '')
  const [dispositivo, setDispositivo] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const carregarDispositivo = useCallback(async (tok) => {
    setCarregando(true)
    try {
      const { data } = await api.get(`/desperdicio/dispositivos/public/${tok}/`)
      setDispositivo(data)
      setToken(tok)
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      setToken('')
      setDispositivo(null)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (token) carregarDispositivo(token)
    else setCarregando(false)
  }, [token, carregarDispositivo])

  function desparear() {
    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setDispositivo(null)
  }

  if (carregando) return <div className="min-h-screen bg-bg"/>

  if (!token || !dispositivo) {
    return <TelaPareamento onPareado={(tok) => carregarDispositivo(tok)} />
  }

  return <TelaLancamento token={token} dispositivo={dispositivo} onDesparear={desparear} />
}
