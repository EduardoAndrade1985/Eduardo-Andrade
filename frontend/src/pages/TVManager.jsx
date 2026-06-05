import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const DASHBOARD_OPTS = [
  { tipo: 'ocupacao', label: 'Ocupação',  icon: '🏨', cor: '#2dd4a0' },
  { tipo: 'custos',   label: 'Custos',    icon: '📊', cor: '#0ea5e9' },
  { tipo: 'cartoes',  label: 'Cartões',   icon: '💳', cor: '#a855f7' },
  { tipo: 'estoque',  label: 'Estoque',   icon: '📦', cor: '#f59e0b' },
]

const TABS = ['Dispositivos', 'Biblioteca de Mídia', 'Monitoramento']

// ── Aba Dispositivos ──────────────────────────────────────────────────────────
function AbaDispositivos({ midias }) {
  const [dispositivos, setDispositivos] = useState([])
  const [loading, setLoading]           = useState(true)
  const [selecionado, setSelecionado]   = useState(null)
  const [novoNome, setNovoNome]         = useState('')
  const [novoLocal, setNovoLocal]       = useState('')
  const [criando, setCriando]           = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [erro, setErro]                 = useState('')
  const [msg, setMsg]                   = useState('')
  const [pairCode, setPairCode]         = useState('')
  const [pairMsg,  setPairMsg]          = useState('')
  const [pareando, setPareando]         = useState(false)
  const [copiado, setCopiado]           = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/tv/config/')
      setDispositivos(res.data)
      if (res.data.length > 0 && !selecionado) setSelecionado(res.data[0])
    } catch { setErro('Erro ao carregar dispositivos.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function parearTV() {
    if (!pairCode.trim()) { setPairMsg('Digite o código exibido na TV.'); return }
    if (!selecionado) { setPairMsg('Selecione um dispositivo para vincular.'); return }
    setPareando(true); setPairMsg('')
    try {
      const res = await api.post('/tv/pair/confirm/', {
        code: pairCode.trim().toUpperCase(),
        tv_config_id: selecionado.id,
      })
      setPairMsg(`✓ TV pareada com "${res.data.dispositivo}"!`)
      setPairCode('')
      setTimeout(() => setPairMsg(''), 4000)
    } catch (e) {
      setPairMsg(e.response?.data?.error || 'Erro ao parear.')
    } finally { setPareando(false) }
  }

  async function criarDispositivo() {
    if (!novoNome.trim()) { setErro('Nome obrigatório.'); return }
    setCriando(true); setErro('')
    try {
      const res = await api.post('/tv/config/', { nome: novoNome.trim(), local: novoLocal.trim() })
      setDispositivos(d => [...d, res.data])
      setSelecionado(res.data)
      setNovoNome(''); setNovoLocal('')
      setShowForm(false)
    } catch { setErro('Erro ao criar dispositivo.') }
    finally { setCriando(false) }
  }

  async function deletarDispositivo(id) {
    if (!confirm('Remover este dispositivo? A playlist será perdida.')) return
    try {
      await api.delete(`/tv/config/${id}/`)
      const restante = dispositivos.filter(d => d.id !== id)
      setDispositivos(restante)
      setSelecionado(restante[0] || null)
    } catch { setErro('Erro ao remover dispositivo.') }
  }

  async function regenerarToken(id) {
    if (!confirm('Regenerar token invalida o link atual desta TV. Confirma?')) return
    try {
      const res = await api.post(`/tv/config/${id}/token/`)
      setDispositivos(d => d.map(x => x.id === id ? { ...x, token: res.data.token, tv_url: res.data.tv_url } : x))
      if (selecionado?.id === id) setSelecionado(s => ({ ...s, token: res.data.token, tv_url: res.data.tv_url }))
    } catch { setErro('Erro ao regenerar token.') }
  }

  function copiarLink(token) {
    const url = `${window.location.origin}/tv/${token}`
    navigator.clipboard.writeText(url)
    setCopiado(token)
    setTimeout(() => setCopiado(null), 2000)
  }

  if (loading) return <div className="py-12 text-center text-muted text-sm">Carregando...</div>

  async function desparearTV(id) {
    if (!confirm('Desparear esta TV? Ela voltará para a tela de código de pareamento.')) return
    try {
      const res = await api.post(`/tv/config/${id}/token/`)
      setDispositivos(d => d.map(x => x.id === id ? { ...x, token: res.data.token, tv_url: res.data.tv_url } : x))
      if (selecionado?.id === id) setSelecionado(s => ({ ...s, token: res.data.token, tv_url: res.data.tv_url }))
      setMsg('TV despareada. Ela solicitará um novo código.')
      setTimeout(() => setMsg(''), 4000)
    } catch { setErro('Erro ao desparear.') }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

      {/* Col 1: Lista de dispositivos */}
      <div className="lg:col-span-1 flex flex-col">
        <div className="bg-bg2 border border-border rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <div>
              <h3 className="text-sm font-bold text-dim">Dispositivos</h3>
              <p className="text-[10px] text-muted">{dispositivos.length} TV{dispositivos.length !== 1 ? 's' : ''} cadastrada{dispositivos.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={() => setShowForm(s => !s)}
              className="px-3 py-1.5 rounded-lg bg-primary text-bg text-xs font-semibold hover:opacity-90 transition">
              + Nova TV
            </button>
          </div>

          {showForm && (
            <div className="px-4 py-3 border-b border-border bg-bg3/50 space-y-2 flex-shrink-0">
              <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
                placeholder="Nome (ex: TV Recepção)"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary" />
              <input value={novoLocal} onChange={e => setNovoLocal(e.target.value)}
                placeholder="Local (ex: Lobby, Sala de reunião)"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary" />
              <div className="flex gap-2">
                <button onClick={() => { setShowForm(false); setNovoNome(''); setNovoLocal('') }}
                  className="flex-1 py-1.5 rounded-lg border border-border text-xs text-muted hover:text-dim transition">
                  Cancelar
                </button>
                <button onClick={criarDispositivo} disabled={criando}
                  className="flex-1 py-1.5 rounded-lg bg-primary text-bg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50">
                  {criando ? '...' : 'Criar'}
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-border/60 overflow-y-auto">
            {dispositivos.length === 0 && (
              <p className="px-4 py-8 text-xs text-muted text-center">Nenhum dispositivo cadastrado.</p>
            )}
            {dispositivos.map(d => (
              <button key={d.id} onClick={() => setSelecionado(d)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition
                  ${selecionado?.id === d.id ? 'bg-primary/8 border-l-2 border-primary' : 'hover:bg-bg3'}`}>
                <span className="text-lg">📺</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-dim truncate">{d.nome}</p>
                  {d.local && <p className="text-[10px] text-muted truncate">{d.local}</p>}
                  <p className="text-[10px] text-muted">{d.playlist?.length || 0} itens</p>
                </div>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.ativo ? 'bg-primary' : 'bg-muted'}`} />
              </button>
            ))}
          </div>
        </div>

        {erro && <div className="mt-3 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{erro}</div>}
        {msg  && <div className="mt-3 text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">{msg}</div>}
      </div>

      {/* Col 2: Parear nova TV */}
      <div className="lg:col-span-1">
        <div className="bg-bg2 border border-primary/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📲</span>
            <div>
              <h3 className="text-sm font-bold text-dim">Parear nova TV</h3>
              <p className="text-[10px] text-muted">
                Abra <span className="text-primary font-semibold">{window.location.origin}/tv</span> na TV
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Código exibido na TV</label>
              <input
                value={pairCode}
                onChange={e => setPairCode(e.target.value.toUpperCase())}
                placeholder="AAA-123"
                maxLength={7}
                className="w-full bg-bg3 border border-border rounded-lg px-3 py-2.5 text-xl font-mono font-bold text-primary placeholder-muted/50 focus:outline-none focus:border-primary tracking-widest uppercase text-center"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Vincular ao dispositivo</label>
              <select value={selecionado?.id || ''} onChange={e => setSelecionado(dispositivos.find(d => d.id === Number(e.target.value)) || null)}
                className="w-full bg-bg3 border border-border rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary">
                <option value="">— selecione —</option>
                {dispositivos.map(d => <option key={d.id} value={d.id}>📺 {d.nome}{d.local ? ` · ${d.local}` : ''}</option>)}
              </select>
            </div>
            <button onClick={parearTV} disabled={pareando || !pairCode || !selecionado}
              className="w-full py-2.5 rounded-lg bg-primary text-bg text-sm font-bold hover:opacity-90 transition disabled:opacity-40">
              {pareando ? 'Pareando...' : 'Parear TV'}
            </button>
          </div>
          {pairMsg && (
            <p className={`text-xs mt-3 ${pairMsg.startsWith('✓') ? 'text-primary' : 'text-danger'}`}>{pairMsg}</p>
          )}
        </div>
      </div>

      {/* Col 3-4: Editor do dispositivo */}
      <div className="lg:col-span-2">
        {!selecionado ? (
          <div className="bg-bg2 border border-border rounded-xl py-16 text-center h-full flex flex-col items-center justify-center">
            <p className="text-4xl mb-3">📺</p>
            <p className="text-sm text-muted">Selecione ou crie um dispositivo</p>
          </div>
        ) : (
          <DispositivoEditor
            dispositivo={selecionado}
            midias={midias}
            onUpdate={updated => {
              setDispositivos(d => d.map(x => x.id === updated.id ? updated : x))
              setSelecionado(updated)
            }}
            onDelete={() => deletarDispositivo(selecionado.id)}
            onTokenRegen={() => regenerarToken(selecionado.id)}
            onDesparear={() => desparearTV(selecionado.id)}
            onCopiar={() => copiarLink(selecionado.token)}
            copiado={copiado === selecionado.token}
          />
        )}
      </div>

    </div>
  )
}

function DispositivoEditor({ dispositivo, midias, onUpdate, onDelete, onTokenRegen, onDesparear, onCopiar, copiado }) {
  const [playlist, setPlaylist] = useState(dispositivo.playlist || [])
  const [salvando, setSalvando] = useState(false)
  const [addTipo, setAddTipo]   = useState('ocupacao')
  const [addDur, setAddDur]     = useState(30)
  const [addMidiaId, setAddMidiaId] = useState('')
  const [erro, setErro]         = useState('')

  useEffect(() => {
    setPlaylist(dispositivo.playlist || [])
  }, [dispositivo.id])

  async function salvar(nova) {
    setSalvando(true); setErro('')
    try {
      const res = await api.patch(`/tv/config/${dispositivo.id}/`, { playlist: nova })
      setPlaylist(nova)
      onUpdate({ ...dispositivo, playlist: nova })
    } catch { setErro('Erro ao salvar.') }
    finally { setSalvando(false) }
  }

  function addItem() {
    if (addTipo === 'midia' && !addMidiaId) { setErro('Selecione uma mídia.'); return }
    const item = addTipo === 'midia'
      ? { tipo: 'midia', midia_id: Number(addMidiaId), duracao: Number(addDur) }
      : { tipo: addTipo, duracao: Number(addDur) }
    salvar([...playlist, item])
    setAddMidiaId('')
  }

  function removeItem(idx) { salvar(playlist.filter((_, i) => i !== idx)) }

  function moveItem(idx, dir) {
    const pl = [...playlist]
    const dest = idx + dir
    if (dest < 0 || dest >= pl.length) return
    const tmp = pl[idx]; pl[idx] = pl[dest]; pl[dest] = tmp
    salvar(pl)
  }

  function getMidiaLabel(id) {
    const m = midias.find(x => x.id === id)
    return m ? (m.titulo || m.url.slice(0, 35)) : `Mídia #${id}`
  }

  const tvUrl = `${window.location.origin}/tv/${dispositivo.token}`

  return (
    <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
      {/* Header do dispositivo */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-dim">{dispositivo.nome}</h3>
            {dispositivo.local && <p className="text-[10px] text-muted">{dispositivo.local}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.open(`/tv/${dispositivo.token}`, '_blank')}
              className="px-3 py-1.5 rounded-lg bg-primary text-bg text-xs font-semibold hover:opacity-90 transition">
              📺 Abrir TV
            </button>
            <button onClick={onDesparear}
              className="px-2 py-1.5 rounded-lg border border-warn/40 text-warn hover:bg-warn/10 text-xs transition">
              Desparear
            </button>
            <button onClick={onDelete}
              className="px-2 py-1.5 rounded-lg border border-border text-muted hover:text-danger hover:border-danger/40 text-xs transition">
              Remover
            </button>
          </div>
        </div>

        {/* Link */}
        <div className="flex items-center gap-2 mt-3">
          <code className="flex-1 bg-bg3 border border-border rounded-lg px-3 py-1.5 text-[11px] text-primary truncate">
            {tvUrl}
          </code>
          <button onClick={onCopiar}
            className="px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[10px] font-semibold hover:bg-primary/20 transition flex-shrink-0">
            {copiado ? '✓' : 'Copiar'}
          </button>
          <button onClick={onTokenRegen}
            className="px-2.5 py-1.5 rounded-lg bg-bg3 border border-border text-muted text-[10px] hover:text-danger transition flex-shrink-0">
            Regenerar
          </button>
        </div>
      </div>

      {/* Playlist */}
      <div className="p-4">
        <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-3">
          Playlist — {playlist.length} {playlist.length === 1 ? 'item' : 'itens'}
          {salvando && <span className="ml-2 text-primary normal-case">Salvando...</span>}
        </p>

        <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
          {playlist.length === 0 && (
            <p className="text-xs text-muted text-center py-4">Nenhum item. Adicione abaixo.</p>
          )}
          {playlist.map((item, i) => {
            const dash = DASHBOARD_OPTS.find(d => d.tipo === item.tipo)
            return (
              <div key={i} className="flex items-center gap-2 bg-bg3 rounded-lg px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveItem(i, -1)} disabled={i === 0}
                    className="text-muted hover:text-dim disabled:opacity-20 text-[10px] leading-none">▲</button>
                  <button onClick={() => moveItem(i, 1)} disabled={i === playlist.length - 1}
                    className="text-muted hover:text-dim disabled:opacity-20 text-[10px] leading-none">▼</button>
                </div>
                <span className="text-base">{dash?.icon || '🖼'}</span>
                <div className="flex-1 min-w-0">
                  {item.tipo === 'midia'
                    ? <span className="text-xs text-dim truncate block">{getMidiaLabel(item.midia_id)}</span>
                    : <span className="text-xs font-semibold" style={{ color: dash?.cor || '#7a8fa8' }}>{dash?.label}</span>
                  }
                  <span className="text-[10px] text-muted">{item.duracao}s</span>
                </div>
                <button onClick={() => removeItem(i)}
                  className="text-muted hover:text-danger transition text-base leading-none flex-shrink-0">×</button>
              </div>
            )
          })}
        </div>

        {/* Adicionar item */}
        <div className="border-t border-border/60 pt-3 space-y-2">
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">Adicionar item</p>
          <select value={addTipo} onChange={e => { setAddTipo(e.target.value); setAddMidiaId('') }}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary">
            <optgroup label="Dashboards">
              {DASHBOARD_OPTS.map(d => <option key={d.tipo} value={d.tipo}>{d.icon} {d.label}</option>)}
            </optgroup>
            <option value="midia">🖼 Mídia (imagem/vídeo)</option>
          </select>
          {addTipo === 'midia' && (
            <select value={addMidiaId} onChange={e => setAddMidiaId(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary">
              <option value="">— selecione a mídia —</option>
              {midias.map(m => <option key={m.id} value={m.id}>{m.titulo || m.url.slice(0, 40)}</option>)}
            </select>
          )}
          <div className="flex gap-2">
            <input type="number" value={addDur} onChange={e => setAddDur(e.target.value)}
              min={5} max={300}
              className="w-24 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary" />
            <span className="text-xs text-muted self-center">seg.</span>
            <button onClick={addItem} disabled={salvando}
              className="ml-auto px-4 py-2 rounded-lg bg-primary text-bg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50">
              + Adicionar
            </button>
          </div>
          {erro && <p className="text-xs text-danger">{erro}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Aba Biblioteca de Mídia ───────────────────────────────────────────────────
function AbaMidia({ midias, onMidiasChange }) {
  const [modo,    setModo]    = useState('url')   // 'url' | 'upload'
  const [mUrl,    setMUrl]    = useState('')
  const [mFile,   setMFile]   = useState(null)
  const [mTitulo, setMTitulo] = useState('')
  const [mTipo,   setMTipo]   = useState('imagem')
  const [mDur,    setMDur]    = useState(15)
  const [mIni,    setMIni]    = useState('')
  const [mFim,    setMFim]    = useState('')
  const [devsSel, setDevsSel] = useState([])    // IDs de dispositivos selecionados
  const [dispositivos, setDispositivos] = useState([])
  const [adding,  setAdding]  = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [erro,    setErro]    = useState('')

  useEffect(() => {
    api.get('/tv/config/').then(r => setDispositivos(r.data)).catch(() => {})
  }, [])

  function toggleDev(id) {
    setDevsSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function salvarMidia() {
    setErro(''); setAdding(true)
    try {
      let url = mUrl.trim()

      // Upload de arquivo
      if (modo === 'upload') {
        if (!mFile) { setErro('Selecione um arquivo.'); setAdding(false); return }
        const fd = new FormData()
        fd.append('arquivo', mFile)
        setUploadPct(30)
        const up = await api.post('/tv/midia/upload/', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: e => setUploadPct(Math.round((e.loaded / e.total) * 80)),
        })
        url = up.data.url
        setUploadPct(90)
      } else {
        if (!url) { setErro('URL obrigatória.'); setAdding(false); return }
      }

      const res = await api.post('/tv/midia/', {
        url, titulo: mTitulo.trim(), tipo: mTipo,
        duracao: Number(mDur), data_inicio: mIni || null, data_fim: mFim || null,
      })
      const midiaId = res.data.id

      // Adiciona automaticamente nos dispositivos selecionados
      for (const devId of devsSel) {
        const dev = dispositivos.find(d => d.id === devId)
        if (!dev) continue
        const nova = [...(dev.playlist || []), { tipo: 'midia', midia_id: midiaId, duracao: Number(mDur) }]
        await api.patch(`/tv/config/${devId}/`, { playlist: nova })
        setDispositivos(ds => ds.map(d => d.id === devId ? { ...d, playlist: nova } : d))
      }

      setMUrl(''); setMFile(null); setMTitulo(''); setMTipo('imagem')
      setMDur(15); setMIni(''); setMFim(''); setDevsSel([])
      setUploadPct(0)
      onMidiasChange()
    } catch { setErro('Erro ao adicionar mídia.') }
    finally { setAdding(false); setUploadPct(0) }
  }

  async function deletar(id) {
    if (!confirm('Remover esta mídia?')) return
    try {
      await api.delete(`/tv/midia/${id}/`)
      onMidiasChange()
    } catch { setErro('Erro ao remover.') }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Lista */}
      <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-bold text-dim">Mídias cadastradas</h3>
          <p className="text-[10px] text-muted">{midias.length} item{midias.length !== 1 ? 's' : ''} · compartilhado entre todos os dispositivos</p>
        </div>
        <div className="divide-y divide-border/60 max-h-[500px] overflow-y-auto">
          {midias.length === 0 && (
            <p className="px-4 py-8 text-xs text-muted text-center">Nenhuma mídia cadastrada.</p>
          )}
          {midias.map(m => (
            <div key={m.id} className="flex items-start gap-3 px-4 py-3">
              <span className="text-xl flex-shrink-0">{m.tipo === 'video' ? '🎬' : '🖼'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-dim font-medium truncate">{m.titulo || 'Sem título'}</p>
                <p className="text-[10px] text-muted truncate">{m.url}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[10px] text-muted">{m.duracao}s</span>
                  {m.data_inicio && <span className="text-[10px] text-primary">De {m.data_inicio}</span>}
                  {m.data_fim    && <span className="text-[10px] text-warn">Até {m.data_fim}</span>}
                  {!m.ativo      && <span className="text-[10px] text-danger">Inativa</span>}
                </div>
              </div>
              <button onClick={() => deletar(m.id)}
                className="text-muted hover:text-danger transition text-lg leading-none flex-shrink-0">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Formulário */}
      <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-bold text-dim">Adicionar mídia</h3>
          {/* Toggle URL / Upload */}
          <div className="flex gap-1 mt-2">
            {['url', 'upload'].map(m => (
              <button key={m} onClick={() => setModo(m)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition
                  ${modo === m ? 'bg-primary text-bg' : 'bg-bg3 text-muted hover:text-dim'}`}>
                {m === 'url' ? '🔗 Link (URL)' : '📁 Upload de arquivo'}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 py-4 space-y-3 overflow-y-auto max-h-[560px]">

          {/* Fonte */}
          {modo === 'url' ? (
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">URL *</label>
              <input value={mUrl} onChange={e => setMUrl(e.target.value)}
                placeholder="https://... (imagem, vídeo, YouTube)"
                className="w-full bg-bg3 border border-border rounded-lg px-3 py-2.5 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary" />
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Arquivo *</label>
              <label className={`flex items-center gap-3 w-full bg-bg3 border-2 border-dashed rounded-lg px-3 py-4 cursor-pointer transition
                ${mFile ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                <span className="text-2xl">{mFile ? '✅' : '📁'}</span>
                <div className="flex-1 min-w-0">
                  {mFile
                    ? <p className="text-sm text-dim font-medium truncate">{mFile.name}</p>
                    : <p className="text-sm text-muted">Clique para selecionar</p>
                  }
                  <p className="text-[10px] text-muted">JPG, PNG, GIF, MP4, WebM</p>
                </div>
                <input type="file" className="hidden"
                  accept="image/*,video/*"
                  onChange={e => {
                    const f = e.target.files[0]
                    if (!f) return
                    setMFile(f)
                    if (!mTitulo) setMTitulo(f.name.replace(/\.[^.]+$/, ''))
                    const isVideo = f.type.startsWith('video')
                    setMTipo(isVideo ? 'video' : 'imagem')
                    if (isVideo) {
                      const vid = document.createElement('video')
                      vid.preload = 'metadata'
                      vid.onloadedmetadata = () => {
                        URL.revokeObjectURL(vid.src)
                        if (vid.duration && isFinite(vid.duration)) {
                          setMDur(Math.ceil(vid.duration))
                        }
                      }
                      vid.src = URL.createObjectURL(f)
                    }
                  }} />
              </label>
              {adding && uploadPct > 0 && (
                <div className="mt-1.5 h-1.5 bg-bg3 rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${uploadPct}%` }} />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Título</label>
            <input value={mTitulo} onChange={e => setMTitulo(e.target.value)}
              placeholder="Nome para identificar (opcional)"
              className="w-full bg-bg3 border border-border rounded-lg px-3 py-2.5 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Tipo</label>
              <select value={mTipo} onChange={e => setMTipo(e.target.value)}
                className="w-full bg-bg3 border border-border rounded-lg px-3 py-2.5 text-sm text-dim focus:outline-none focus:border-primary">
                <option value="imagem">🖼 Imagem</option>
                <option value="video">🎬 Vídeo</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">Duração (seg.)</label>
              <input type="number" value={mDur} onChange={e => setMDur(e.target.value)}
                min={5} max={300}
                className="w-full bg-bg3 border border-border rounded-lg px-3 py-2.5 text-sm text-dim focus:outline-none focus:border-primary" />
            </div>
          </div>

          {/* Agendamento */}
          <div className="rounded-lg border border-border/60 bg-bg3/50 p-3">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">Agendamento (opcional)</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-muted mb-1">Exibir a partir de</label>
                <input type="date" value={mIni} onChange={e => setMIni(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-1">Exibir até</label>
                <input type="date" value={mFim} onChange={e => setMFim(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary" />
              </div>
            </div>
            <p className="text-[10px] text-muted mt-1.5">Ex: campanha de Natal de 01/12 a 31/12</p>
          </div>

          {/* Adicionar aos dispositivos */}
          {dispositivos.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-bg3/50 p-3">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">
                Adicionar à playlist dos dispositivos
              </p>
              <div className="space-y-1.5">
                {dispositivos.map(d => (
                  <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={devsSel.includes(d.id)}
                      onChange={() => toggleDev(d.id)}
                      className="accent-primary w-3.5 h-3.5" />
                    <span className="text-sm text-dim">📺 {d.nome}</span>
                    {d.local && <span className="text-[10px] text-muted">· {d.local}</span>}
                  </label>
                ))}
              </div>
              {devsSel.length > 0 && (
                <p className="text-[10px] text-primary mt-1.5">
                  Será adicionado automaticamente em {devsSel.length} dispositivo{devsSel.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          {erro && <p className="text-xs text-danger">{erro}</p>}

          <button onClick={salvarMidia} disabled={adding}
            className="w-full py-2.5 rounded-lg bg-primary text-bg text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
            {adding ? (uploadPct > 0 ? `Enviando ${uploadPct}%...` : 'Salvando...') : '+ Adicionar à biblioteca'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Aba Monitoramento ─────────────────────────────────────────────────────────
function AbaMonitoramento() {
  const [dispositivos, setDispositivos] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [agora,        setAgora]        = useState(new Date())

  const carregar = useCallback(async () => {
    try {
      const res = await api.get('/tv/config/')
      setDispositivos(res.data)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    carregar()
    const id = setInterval(() => { carregar(); setAgora(new Date()) }, 30000)
    return () => clearInterval(id)
  }, [carregar])

  function fmtLastSeen(iso) {
    if (!iso) return 'Nunca conectou'
    const d = new Date(iso)
    const diff = Math.floor((agora - d) / 1000)
    if (diff < 60)   return `há ${diff}s`
    if (diff < 3600) return `há ${Math.floor(diff / 60)}min`
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return <div className="py-12 text-center text-muted text-sm">Carregando...</div>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-dim">Status das TVs</h3>
          <p className="text-[10px] text-muted">Atualiza a cada 30 segundos · {dispositivos.filter(d => d.online).length}/{dispositivos.length} online</p>
        </div>
        <button onClick={() => { carregar(); setAgora(new Date()) }}
          className="px-3 py-1.5 rounded-lg bg-bg3 border border-border text-xs text-muted hover:text-dim transition">
          Atualizar
        </button>
      </div>

      {dispositivos.length === 0 && (
        <div className="bg-bg2 border border-border rounded-xl py-12 text-center">
          <p className="text-3xl mb-2">📺</p>
          <p className="text-sm text-muted">Nenhum dispositivo cadastrado.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {dispositivos.map(d => (
          <div key={d.id} className={`bg-bg2 border rounded-xl p-4 transition
            ${d.online ? 'border-primary/30' : 'border-border'}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📺</span>
                <div>
                  <p className="text-sm font-bold text-dim">{d.nome}</p>
                  {d.local && <p className="text-[10px] text-muted">{d.local}</p>}
                </div>
              </div>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold
                ${d.online
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted/10 text-muted'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${d.online ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
                {d.online ? 'Online' : 'Offline'}
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-muted">
                <span>Última conexão</span>
                <span className={d.online ? 'text-primary' : 'text-muted'}>{fmtLastSeen(d.last_seen)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Playlist</span>
                <span className="text-dim">{d.playlist?.length || 0} itens</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Status</span>
                <span className={d.ativo ? 'text-primary' : 'text-danger'}>{d.ativo ? 'Ativo' : 'Inativo'}</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-border/60">
              <button onClick={() => window.open(`/tv/${d.token}`, '_blank')}
                className="w-full py-1.5 rounded-lg bg-bg3 border border-border text-xs text-muted hover:text-dim transition">
                Abrir TV
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function TVManager() {
  const [abaAtiva, setAbaAtiva] = useState(0)
  const [midias,   setMidias]   = useState([])
  const [loadM,    setLoadM]    = useState(true)

  const carregarMidias = useCallback(async () => {
    setLoadM(true)
    try {
      const res = await api.get('/tv/midia/')
      setMidias(res.data)
    } catch {}
    finally { setLoadM(false) }
  }, [])

  useEffect(() => { carregarMidias() }, [carregarMidias])

  return (
    <div className="p-6 fade-up">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-bold text-dim">TV Manager</h1>
        <p className="text-xs text-muted mt-0.5">Gerencie dispositivos de TV corporativa da empresa.</p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map((tab, i) => (
          <button key={i} onClick={() => setAbaAtiva(i)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px
              ${abaAtiva === i
                ? 'text-primary border-primary'
                : 'text-muted border-transparent hover:text-dim'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {abaAtiva === 0 && <AbaDispositivos midias={midias} />}
      {abaAtiva === 1 && !loadM && <AbaMidia midias={midias} onMidiasChange={carregarMidias} />}
      {abaAtiva === 1 && loadM && <div className="py-12 text-center text-muted text-sm">Carregando...</div>}
      {abaAtiva === 2 && <AbaMonitoramento />}
    </div>
  )
}
