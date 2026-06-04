import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const DASHBOARD_OPTS = [
  { tipo: 'ocupacao', label: 'Ocupação',  icon: '🏨', cor: '#2dd4a0' },
  { tipo: 'custos',   label: 'Custos',    icon: '📊', cor: '#0ea5e9' },
  { tipo: 'cartoes',  label: 'Cartões',   icon: '💳', cor: '#a855f7' },
  { tipo: 'estoque',  label: 'Estoque',   icon: '📦', cor: '#f59e0b' },
]

function Badge({ tipo }) {
  const d = DASHBOARD_OPTS.find(x => x.tipo === tipo)
  if (!d) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: d.cor + '20', color: d.cor }}>
      {d.icon} {d.label}
    </span>
  )
}

export default function TVManager() {
  const [config,    setConfig]    = useState(null)
  const [midias,    setMidias]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [salvando,  setSalvando]  = useState(false)
  const [copiado,   setCopiado]   = useState(false)
  const [erro,      setErro]      = useState('')
  const [msg,       setMsg]       = useState('')

  // Novo item de playlist
  const [addTipo,   setAddTipo]   = useState('ocupacao')
  const [addDur,    setAddDur]    = useState(30)
  const [addMidia,  setAddMidia]  = useState('')

  // Nova mídia
  const [mUrl,   setMUrl]   = useState('')
  const [mTitulo,setMTitulo]= useState('')
  const [mTipo,  setMTipo]  = useState('imagem')
  const [mDur,   setMDur]   = useState(15)
  const [addingM,setAddingM]= useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/tv/config/')
      setConfig(res.data)
      setMidias(res.data.midias || [])
    } catch { setErro('Erro ao carregar configuração.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function salvarPlaylist(newPlaylist) {
    setSalvando(true); setErro(''); setMsg('')
    try {
      await api.patch('/tv/config/', { playlist: newPlaylist })
      setConfig(c => ({ ...c, playlist: newPlaylist }))
      setMsg('Salvo!')
      setTimeout(() => setMsg(''), 2000)
    } catch { setErro('Erro ao salvar.') }
    finally { setSalvando(false) }
  }

  function addToPlaylist() {
    const item = addTipo === 'midia'
      ? { tipo: 'midia', midia_id: Number(addMidia), duracao: Number(addDur) }
      : { tipo: addTipo, duracao: Number(addDur) }
    if (addTipo === 'midia' && !addMidia) { setErro('Selecione uma mídia.'); return }
    const nova = [...(config?.playlist || []), item]
    salvarPlaylist(nova)
    setAddMidia('')
  }

  function removeItem(idx) {
    const nova = config.playlist.filter((_, i) => i !== idx)
    salvarPlaylist(nova)
  }

  function moveItem(idx, dir) {
    const pl = [...config.playlist]
    const dest = idx + dir
    if (dest < 0 || dest >= pl.length) return
    const tmp = pl[idx]; pl[idx] = pl[dest]; pl[dest] = tmp
    salvarPlaylist(pl)
  }

  async function addMidia() {
    if (!mUrl.trim()) { setErro('URL obrigatória.'); return }
    setAddingM(true); setErro('')
    try {
      await api.post('/tv/midia/', { url: mUrl.trim(), titulo: mTitulo.trim(), tipo: mTipo, duracao: Number(mDur) })
      setMUrl(''); setMTitulo(''); setMTipo('imagem'); setMDur(15)
      await carregar()
    } catch { setErro('Erro ao adicionar mídia.') }
    finally { setAddingM(false) }
  }

  async function deleteMidia(id) {
    if (!confirm('Remover esta mídia?')) return
    try {
      await api.delete(`/tv/midia/${id}/`)
      await carregar()
    } catch { setErro('Erro ao remover.') }
  }

  async function regenerarToken() {
    if (!confirm('Regenerar token invalida o link atual da TV. Confirma?')) return
    try {
      const res = await api.post('/tv/config/')
      setConfig(c => ({ ...c, token: res.data.token, tv_url: `/tv/${res.data.token}` }))
    } catch { setErro('Erro ao regenerar token.') }
  }

  function copiarLink() {
    const url = `${window.location.origin}/tv/${config.token}`
    navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  function abrirTV() {
    window.open(`/tv/${config.token}`, '_blank')
  }

  const getMidiaLabel = (id) => {
    const m = midias.find(x => x.id === id)
    return m ? (m.titulo || m.url.slice(0, 40)) : `Mídia #${id}`
  }

  if (loading) return <div className="p-8 text-muted text-sm">Carregando...</div>

  const tvUrl = `${window.location.origin}/tv/${config?.token}`

  return (
    <div className="p-6 fade-up max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-dim">TV Manager</h1>
          <p className="text-xs text-muted mt-0.5">Configure o conteúdo exibido nas TVs da empresa.</p>
        </div>
        <button onClick={abrirTV}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-bg text-sm font-semibold hover:opacity-90 transition">
          📺 Abrir TV
        </button>
      </div>

      {/* Link da TV */}
      <div className="bg-bg2 border border-border rounded-xl p-4 mb-6">
        <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">Link da TV</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-bg3 border border-border rounded-lg px-3 py-2 text-xs text-primary truncate">
            {tvUrl}
          </code>
          <button onClick={copiarLink}
            className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/20 transition flex-shrink-0">
            {copiado ? '✓ Copiado!' : 'Copiar'}
          </button>
          <button onClick={regenerarToken}
            className="px-3 py-2 rounded-lg bg-bg3 border border-border text-muted text-xs hover:text-danger hover:border-danger/40 transition flex-shrink-0">
            Regenerar
          </button>
        </div>
        <p className="text-[10px] text-muted mt-2">Cole este link no navegador da TV. Funciona sem login.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Playlist ── */}
        <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold text-dim">Playlist</h2>
            <p className="text-[10px] text-muted">Ordem de exibição na TV</p>
          </div>

          {/* Itens existentes */}
          <div className="divide-y divide-border/60">
            {(!config?.playlist || config.playlist.length === 0) && (
              <p className="px-4 py-6 text-xs text-muted text-center">Nenhum item na playlist ainda.</p>
            )}
            {config?.playlist?.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveItem(i, -1)} disabled={i === 0}
                    className="text-muted hover:text-dim disabled:opacity-20 text-xs leading-none">▲</button>
                  <button onClick={() => moveItem(i, 1)} disabled={i === config.playlist.length - 1}
                    className="text-muted hover:text-dim disabled:opacity-20 text-xs leading-none">▼</button>
                </div>
                <div className="flex-1 min-w-0">
                  {item.tipo === 'midia'
                    ? <span className="text-sm text-dim truncate block">🖼 {getMidiaLabel(item.midia_id)}</span>
                    : <Badge tipo={item.tipo} />
                  }
                  <span className="text-[10px] text-muted">{item.duracao}s</span>
                </div>
                <button onClick={() => removeItem(i)}
                  className="text-muted hover:text-danger transition text-lg leading-none flex-shrink-0">×</button>
              </div>
            ))}
          </div>

          {/* Adicionar item */}
          <div className="px-4 py-4 border-t border-border bg-bg3/50">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-3">Adicionar item</p>
            <div className="space-y-2">
              <select value={addTipo} onChange={e => { setAddTipo(e.target.value); setAddMidia('') }}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary">
                <optgroup label="Dashboards">
                  {DASHBOARD_OPTS.map(d => <option key={d.tipo} value={d.tipo}>{d.icon} {d.label}</option>)}
                </optgroup>
                <option value="midia">🖼 Mídia (imagem/vídeo)</option>
              </select>
              {addTipo === 'midia' && (
                <select value={addMidia} onChange={e => setAddMidia(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary">
                  <option value="">— selecione a mídia —</option>
                  {midias.map(m => <option key={m.id} value={m.id}>{m.titulo || m.url.slice(0,40)}</option>)}
                </select>
              )}
              <div className="flex gap-2">
                <input type="number" value={addDur} onChange={e => setAddDur(e.target.value)}
                  min={5} max={300} placeholder="Duração (s)"
                  className="w-28 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary" />
                <span className="text-xs text-muted self-center">segundos</span>
                <button onClick={addToPlaylist} disabled={salvando}
                  className="ml-auto px-4 py-2 rounded-lg bg-primary text-bg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50">
                  + Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Biblioteca de Mídia ── */}
        <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold text-dim">Biblioteca de Mídia</h2>
            <p className="text-[10px] text-muted">Imagens e vídeos para exibir na TV</p>
          </div>

          {/* Lista */}
          <div className="divide-y divide-border/60 max-h-64 overflow-y-auto">
            {midias.length === 0 && (
              <p className="px-4 py-6 text-xs text-muted text-center">Nenhuma mídia adicionada ainda.</p>
            )}
            {midias.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg flex-shrink-0">{m.tipo === 'video' ? '🎬' : '🖼'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-dim truncate">{m.titulo || 'Sem título'}</p>
                  <p className="text-[10px] text-muted truncate">{m.url}</p>
                  <p className="text-[10px] text-muted">{m.duracao}s</p>
                </div>
                <button onClick={() => deleteMidia(m.id)}
                  className="text-muted hover:text-danger transition text-lg leading-none flex-shrink-0">×</button>
              </div>
            ))}
          </div>

          {/* Adicionar mídia */}
          <div className="px-4 py-4 border-t border-border bg-bg3/50">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-3">Adicionar mídia</p>
            <div className="space-y-2">
              <input value={mUrl} onChange={e => setMUrl(e.target.value)}
                placeholder="URL da imagem ou vídeo (https://...)"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary" />
              <input value={mTitulo} onChange={e => setMTitulo(e.target.value)}
                placeholder="Título (opcional)"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary" />
              <div className="flex gap-2">
                <select value={mTipo} onChange={e => setMTipo(e.target.value)}
                  className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary">
                  <option value="imagem">🖼 Imagem</option>
                  <option value="video">🎬 Vídeo</option>
                </select>
                <input type="number" value={mDur} onChange={e => setMDur(e.target.value)}
                  min={5} max={300} placeholder="Seg."
                  className="w-20 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-dim focus:outline-none focus:border-primary" />
                <button onClick={addMidia} disabled={addingM}
                  className="ml-auto px-4 py-2 rounded-lg bg-primary text-bg text-xs font-semibold hover:opacity-90 transition disabled:opacity-50">
                  {addingM ? '...' : '+ Adicionar'}
                </button>
              </div>
              <p className="text-[10px] text-muted">
                Suporta links diretos de imagens (.jpg, .png), vídeos (.mp4) ou embeds do YouTube.
              </p>
            </div>
          </div>
        </div>
      </div>

      {erro && <p className="mt-4 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{erro}</p>}
      {msg  && <p className="mt-4 text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">{msg}</p>}
    </div>
  )
}
