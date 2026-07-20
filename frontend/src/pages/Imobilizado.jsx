import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtR  = v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDt = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const today = () => new Date().toISOString().slice(0, 10)

const SITUACAO_COR = {
  EM_USO:     { bg: 'bg-teal-500/10',  text: 'text-teal-400',  label: 'Em Uso'     },
  MANUTENCAO: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Manutenção' },
  BAIXADO:    { bg: 'bg-rose-500/10',  text: 'text-rose-400',  label: 'Baixado'    },
}

function SituacaoBadge({ s }) {
  const c = SITUACAO_COR[s] || { bg: 'bg-bg3', text: 'text-muted', label: s }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

// ── campo de formulário ───────────────────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
const inp = 'bg-bg3 border border-border rounded-lg px-3 py-2 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary/60 transition w-full'
const sel = inp + ' cursor-pointer'

// ── modal genérico ────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const fn = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[900] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`bg-bg2 border border-border rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="font-semibold text-dim">{title}</h3>
          <button onClick={onClose}
            className="text-muted hover:text-danger transition p-1 rounded-lg hover:bg-danger/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  )
}

// ── lista gerenciável (categorias / departamentos / localizações) ──────────────
function ListaConfig({ titulo, itens, novoValor, onNovoValor, onAdicionar, onRemover }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-bold text-muted uppercase tracking-wider">{titulo}</p>
      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
        {itens.length === 0 && (
          <p className="text-xs text-muted italic px-2 py-3">Nenhum cadastrado ainda.</p>
        )}
        {itens.map(item => (
          <div key={item.id} className="flex items-center justify-between gap-2 bg-bg3 rounded-lg px-3 py-1.5">
            <span className="text-sm text-dim truncate">{item.nome}</span>
            {onRemover && (
              <button onClick={() => onRemover(item)}
                className="text-muted hover:text-danger transition text-xs flex-shrink-0">✕</button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className={`${inp} flex-1`} value={novoValor}
          onChange={e => onNovoValor(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onAdicionar()}
          placeholder={`Novo(a) ${titulo.toLowerCase()}…`}/>
        <button onClick={onAdicionar}
          className="bg-primary/10 text-primary border border-primary/20 px-3 py-2 rounded-lg text-sm hover:bg-primary/20 transition font-medium">
          +
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// ABA BENS
// ════════════════════════════════════════════════════════════════════════════════
function BensTab({ categorias, departamentos, localizacoes }) {
  const [bens, setBens]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [filtros, setFiltros]   = useState({ q: '', situacao: '', categoria_id: '', departamento_id: '', pendente: '' })
  const [bemSel, setBemSel]     = useState(null)
  const [editando, setEditando] = useState(false)
  const [baixando, setBaixando] = useState(false)
  const [form, setForm]         = useState({})
  const [fotoFile, setFotoFile] = useState(null)
  const [erros, setErros]       = useState([])
  const [salvando, setSalvando] = useState(false)
  const [baixaForm, setBaixaForm] = useState({ motivo_baixa: '', data_baixa: today(), observacoes: '' })
  const [confirmExcluir, setConfirmExcluir] = useState(false)
  const [fotoZoom, setFotoZoom] = useState(null)
  const [importando, setImportando] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const importRef = useRef(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filtros.q)               params.q               = filtros.q
      if (filtros.situacao)        params.situacao        = filtros.situacao
      if (filtros.categoria_id)    params.categoria_id    = filtros.categoria_id
      if (filtros.departamento_id) params.departamento_id = filtros.departamento_id
      if (filtros.pendente)        params.pendente        = '1'
      const { data } = await api.get('/imobilizado/bens/', { params })
      setBens(data)
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => { carregar() }, [carregar])

  const abrirEditar = bem => {
    setForm({
      descricao:       bem.descricao,
      categoria_id:    bem.categoria?.id   || '',
      departamento_id: bem.departamento?.id || '',
      localizacao:     bem.localizacao     || '',
      nota_fiscal:     bem.nota_fiscal     || '',
      fornecedor:      bem.fornecedor      || '',
      data_aquisicao:  bem.data_aquisicao  || '',
      valor_aquisicao: bem.valor_aquisicao != null ? String(bem.valor_aquisicao).replace('.', ',') : '',
      observacoes:     bem.observacoes     || '',
      situacao:        bem.situacao,
    })
    setFotoFile(null)
    setErros([])
    setBemSel(bem)
    setEditando(true)
  }

  const salvarEdicao = async () => {
    setSalvando(true)
    setErros([])
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      if (fotoFile) fd.append('foto', fotoFile)
      await api.patch(`/imobilizado/bens/${bemSel.id}/`, fd, {
        headers: { 'Content-Type': undefined },
      })
      setEditando(false)
      setBemSel(null)
      carregar()
    } catch (e) {
      setErros([e.response?.data?.erro || 'Erro ao salvar'])
    } finally {
      setSalvando(false)
    }
  }

  const excluirBem = async () => {
    setSalvando(true)
    try {
      await api.delete(`/imobilizado/bens/${bemSel.id}/`)
      setEditando(false)
      setBemSel(null)
      setConfirmExcluir(false)
      carregar()
    } catch (e) {
      setErros([e.response?.data?.erro || 'Erro ao excluir'])
    } finally {
      setSalvando(false)
    }
  }

  const exportar = async () => {
    try {
      const params = {}
      if (filtros.q)               params.q               = filtros.q
      if (filtros.situacao)        params.situacao        = filtros.situacao
      if (filtros.categoria_id)    params.categoria_id    = filtros.categoria_id
      if (filtros.departamento_id) params.departamento_id = filtros.departamento_id
      if (filtros.pendente)        params.pendente        = '1'
      const res = await api.get('/imobilizado/bens/exportar/', { params, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a   = document.createElement('a')
      a.href     = url
      a.download = 'bens_imobilizado.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Erro ao exportar lista de bens')
    }
  }

  const handleImportar = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      const { data } = await api.post('/imobilizado/bens/importar/', fd, {
        headers: { 'Content-Type': undefined },
      })
      setImportResult(data)
      carregar()
    } catch (err) {
      setImportResult({ ok: false, erros: [err.response?.data?.erro || 'Erro ao importar'] })
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  const executarBaixa = async () => {
    setSalvando(true)
    try {
      await api.post(`/imobilizado/bens/${bemSel.id}/baixar/`, baixaForm)
      setBaixando(false)
      setBemSel(null)
      carregar()
    } catch (e) {
      setErros([e.response?.data?.erro || 'Erro ao dar baixa'])
    } finally {
      setSalvando(false)
    }
  }

  const total    = bens.length
  const emUso    = bens.filter(b => b.situacao === 'EM_USO').length
  const pendente = bens.filter(b => !b.cadastro_completo).length
  const valorTotal = bens.filter(b => b.situacao !== 'BAIXADO').reduce((s, b) => s + (b.valor_aquisicao || 0), 0)

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted">{total} bem{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</p>
        <div className="flex gap-2 items-center">
          <button onClick={exportar}
            className="text-xs bg-bg3 border border-border text-dim px-3 py-1.5 rounded-lg hover:border-primary/40 hover:text-primary transition whitespace-nowrap">
            ⬇️ Exportar Excel
          </button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportar}/>
          <button onClick={() => importRef.current?.click()} disabled={importando}
            className="text-xs bg-bg3 border border-border text-dim px-3 py-1.5 rounded-lg hover:border-teal-500/40 hover:text-teal-400 transition whitespace-nowrap disabled:opacity-50">
            {importando ? '⏳ Importando…' : '⬆️ Importar Excel'}
          </button>
        </div>
      </div>

      {/* Resultado da importação */}
      {importResult && (
        <div className={`border rounded-xl p-3 text-sm ${importResult.ok ? 'bg-teal-500/10 border-teal-500/20 text-teal-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
          {importResult.ok ? (
            <p>✓ {importResult.criados} bem{importResult.criados !== 1 ? 's' : ''} criado{importResult.criados !== 1 ? 's' : ''}
              {importResult.ignorados > 0 ? `, ${importResult.ignorados} ignorado${importResult.ignorados !== 1 ? 's' : ''} (já existiam)` : ''}.
              {importResult.erros?.length > 0 && <span className="text-amber-400"> {importResult.erros.length} aviso{importResult.erros.length !== 1 ? 's' : ''}.</span>}
            </p>
          ) : (
            importResult.erros?.map((e, i) => <p key={i}>{e}</p>)
          )}
          <button onClick={() => setImportResult(null)} className="mt-1 text-xs opacity-60 hover:opacity-100">✕ fechar</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: 'Total de Bens',        v: total,          cor: 'text-dim'      },
          { l: 'Em Uso',               v: emUso,          cor: 'text-teal-400' },
          { l: 'Pendentes',            v: pendente,       cor: 'text-amber-400'},
          { l: 'Valor Total (Ativos)', v: fmtR(valorTotal), cor: 'text-primary' },
        ].map(k => (
          <div key={k.l} className="bg-bg2 border border-white/[0.06] rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{k.l}</p>
            <p className={`text-xl font-bold mt-1 ${k.cor}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Filtros — linha única com scroll horizontal em telas menores */}
      <div className="bg-bg2 border border-white/[0.06] rounded-xl px-4 py-3 overflow-x-auto">
        <div className="flex gap-2 items-center min-w-max">
          <input className={`${inp} w-56`}
            placeholder="Buscar plaqueta, descrição ou NF…"
            value={filtros.q} onChange={e => setFiltros(p => ({ ...p, q: e.target.value }))}/>
          <select className={`${sel} w-32`} value={filtros.situacao}
            onChange={e => setFiltros(p => ({ ...p, situacao: e.target.value }))}>
            <option value="">Situação</option>
            <option value="EM_USO">Em Uso</option>
            <option value="MANUTENCAO">Manutenção</option>
            <option value="BAIXADO">Baixado</option>
          </select>
          <select className={`${sel} w-36`} value={filtros.categoria_id}
            onChange={e => setFiltros(p => ({ ...p, categoria_id: e.target.value }))}>
            <option value="">Categoria</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select className={`${sel} w-36`} value={filtros.departamento_id}
            onChange={e => setFiltros(p => ({ ...p, departamento_id: e.target.value }))}>
            <option value="">Departamento</option>
            {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-dim cursor-pointer select-none whitespace-nowrap">
            <input type="checkbox" checked={!!filtros.pendente}
              onChange={e => setFiltros(p => ({ ...p, pendente: e.target.checked ? '1' : '' }))}
              className="accent-primary"/>
            Só pendentes
          </label>
        </div>
      </div>

      {/* Lista — tabela */}
      {loading ? (
        <div className="text-center py-12 text-muted">Carregando…</div>
      ) : bens.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="text-4xl mb-2">📦</p>
          <p>Nenhum bem encontrado.</p>
        </div>
      ) : (
        <div className="bg-bg2 border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['', 'Plaqueta', 'Descrição', 'Categoria', 'Departamento', 'Localização', 'Valor', 'Situação'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bens.map(b => (
                  <tr key={b.id} onClick={() => abrirEditar(b)}
                    className="border-b border-border/40 last:border-0 hover:bg-bg3/50 cursor-pointer transition">
                    <td className="px-4 py-1.5" onClick={b.foto_url ? e => { e.stopPropagation(); setFotoZoom(b.foto_url) } : undefined}>
                      {b.foto_url
                        ? <img src={b.foto_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-border cursor-zoom-in hover:ring-2 hover:ring-primary/50 transition"/>
                        : <div className="w-8 h-8 rounded-lg bg-bg3 border border-border flex items-center justify-center text-sm">📦</div>
                      }
                    </td>
                    <td className="px-4 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded whitespace-nowrap">{b.plaqueta}</span>
                        {!b.cadastro_completo && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">pendente</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-1.5 text-dim font-medium max-w-[200px]">
                      <span className="block truncate">{b.descricao}</span>
                    </td>
                    <td className="px-4 py-1.5 text-muted whitespace-nowrap">{b.categoria?.nome}</td>
                    <td className="px-4 py-1.5 text-muted whitespace-nowrap">{b.departamento?.nome}</td>
                    <td className="px-4 py-1.5 text-muted whitespace-nowrap">{b.localizacao || '—'}</td>
                    <td className="px-4 py-1.5 text-dim font-medium whitespace-nowrap text-right">
                      {b.valor_aquisicao != null ? fmtR(b.valor_aquisicao) : '—'}
                    </td>
                    <td className="px-4 py-1.5"><SituacaoBadge s={b.situacao}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lightbox de foto */}
      {fotoZoom && (
        <div className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setFotoZoom(null)}>
          <img src={fotoZoom} alt="" className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"/>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl leading-none">✕</button>
        </div>
      )}

      {/* Modal de edição */}
      {editando && bemSel && (
        <Modal title={`Bem ${bemSel.plaqueta}`} onClose={() => { setEditando(false); setBemSel(null); setConfirmExcluir(false) }} wide>
          <div className="space-y-3">
            {erros.length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 text-sm text-rose-400">
                {erros.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            {/* 3 colunas para caber sem scroll */}
            <div className="grid grid-cols-3 gap-2">
              <Field label="Descrição" required>
                <input className={inp} value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}/>
              </Field>
              <Field label="Situação">
                <select className={sel} value={form.situacao} onChange={e => setForm(p => ({ ...p, situacao: e.target.value }))}>
                  <option value="EM_USO">Em Uso</option>
                  <option value="MANUTENCAO">Em Manutenção</option>
                </select>
              </Field>
              <Field label="Nota Fiscal">
                <input className={inp} value={form.nota_fiscal} onChange={e => setForm(p => ({ ...p, nota_fiscal: e.target.value }))}/>
              </Field>
              <Field label="Categoria">
                <select className={sel} value={form.categoria_id} onChange={e => setForm(p => ({ ...p, categoria_id: e.target.value }))}>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Field>
              <Field label="Departamento">
                <select className={sel} value={form.departamento_id} onChange={e => setForm(p => ({ ...p, departamento_id: e.target.value }))}>
                  {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </Field>
              <Field label="Localização">
                <select className={sel} value={form.localizacao} onChange={e => setForm(p => ({ ...p, localizacao: e.target.value }))}>
                  <option value="">— sem localização —</option>
                  {localizacoes.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                  {form.localizacao && !localizacoes.find(l => l.nome === form.localizacao) && (
                    <option value={form.localizacao}>{form.localizacao}</option>
                  )}
                </select>
              </Field>
              <Field label="Fornecedor">
                <input className={inp} value={form.fornecedor} onChange={e => setForm(p => ({ ...p, fornecedor: e.target.value }))}/>
              </Field>
              <Field label="Data de Aquisição">
                <input type="date" className={inp} value={form.data_aquisicao} onChange={e => setForm(p => ({ ...p, data_aquisicao: e.target.value }))}/>
              </Field>
              <Field label="Valor de Aquisição">
                <input className={inp} value={form.valor_aquisicao}
                  onChange={e => setForm(p => ({ ...p, valor_aquisicao: e.target.value }))}
                  placeholder="Ex: 1.500,00"/>
              </Field>
            </div>
            {/* Observações + Foto lado a lado */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Observações">
                <textarea className={`${inp} h-16 resize-none`} value={form.observacoes}
                  onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}/>
              </Field>
              <Field label="Foto">
                <div className="flex items-center gap-3 h-16">
                  {(bemSel.foto_url && !fotoFile) && (
                    <img src={bemSel.foto_url} alt="" onClick={() => setFotoZoom(bemSel.foto_url)}
                      className="h-14 w-14 rounded-lg object-cover border border-border cursor-zoom-in hover:ring-2 hover:ring-primary/50 transition flex-shrink-0"/>
                  )}
                  {fotoFile && (
                    <img src={URL.createObjectURL(fotoFile)} alt=""
                      className="h-14 w-14 rounded-lg object-cover border border-border flex-shrink-0"/>
                  )}
                  <input type="file" accept="image/*"
                    onChange={e => setFotoFile(e.target.files[0] || null)}
                    className="text-xs text-muted"/>
                </div>
              </Field>
            </div>
            <div className="flex gap-2 pt-1 flex-wrap items-center border-t border-border/50">
              <button onClick={salvarEdicao} disabled={salvando}
                className="bg-primary text-bg text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
              <button onClick={() => { setEditando(false); setBaixando(true) }}
                className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-rose-500/20 transition">
                Dar Baixa
              </button>
              <button onClick={() => { setEditando(false); setBemSel(null); setConfirmExcluir(false) }}
                className="text-muted text-sm px-4 py-2 rounded-lg hover:bg-bg3 transition">
                Cancelar
              </button>
              <button onClick={() => setConfirmExcluir(true)} disabled={salvando}
                className="ml-auto text-xs text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 transition">
                🗑️ Excluir bem
              </button>
            </div>
            {confirmExcluir && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 flex items-center justify-between gap-3">
                <p className="text-sm text-rose-400">Confirmar exclusão de <strong>{bemSel.plaqueta}</strong>? Não pode ser desfeito.</p>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={excluirBem} disabled={salvando}
                    className="text-xs bg-rose-500 text-white px-3 py-1.5 rounded-lg hover:bg-rose-600 transition disabled:opacity-50">
                    {salvando ? '…' : 'Excluir'}
                  </button>
                  <button onClick={() => setConfirmExcluir(false)}
                    className="text-xs text-muted px-3 py-1.5 rounded-lg hover:bg-bg3 transition">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal de baixa */}
      {baixando && bemSel && (
        <Modal title={`Baixar: ${bemSel.plaqueta}`} onClose={() => { setBaixando(false); setBemSel(null) }}>
          <div className="space-y-4">
            {erros.length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-sm text-rose-400">
                {erros.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            <p className="text-sm text-muted">
              Confirme a baixa de <strong className="text-dim">{bemSel.descricao}</strong>.
            </p>
            <Field label="Motivo" required>
              <select className={sel} value={baixaForm.motivo_baixa}
                onChange={e => setBaixaForm(p => ({ ...p, motivo_baixa: e.target.value }))}>
                <option value="">Selecione…</option>
                {[['VENDA','Venda'],['PERDA','Perda/Sinistro'],['ROUBO','Roubo'],
                  ['SUCATA','Sucateamento'],['DOACAO','Doação'],['OUTRO','Outro']].map(([v,l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Data da Baixa">
              <input type="date" className={inp} value={baixaForm.data_baixa}
                onChange={e => setBaixaForm(p => ({ ...p, data_baixa: e.target.value }))}/>
            </Field>
            <Field label="Observações">
              <textarea className={`${inp} h-20 resize-none`} value={baixaForm.observacoes}
                onChange={e => setBaixaForm(p => ({ ...p, observacoes: e.target.value }))}
                placeholder="Nº do BO, justificativa…"/>
            </Field>
            <div className="flex gap-3 pt-2">
              <button onClick={executarBaixa} disabled={salvando || !baixaForm.motivo_baixa}
                className="bg-rose-500 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-rose-600 transition disabled:opacity-50">
                {salvando ? 'Aguarde…' : 'Confirmar Baixa'}
              </button>
              <button onClick={() => { setBaixando(false); setBemSel(null) }}
                className="text-muted text-sm px-4 py-2 rounded-lg hover:bg-bg3 transition">
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// ABA LANÇAMENTO
// ════════════════════════════════════════════════════════════════════════════════
function LancamentoTab({ categorias, departamentos, localizacoes, onSucesso }) {
  const linhaVazia = () => ({ plaqueta: '', descricao: '', valor: '', localizacao: '', foto: null })

  const [cab, setCab] = useState({
    categoria_id: '', departamento_id: '',
    nota_fiscal: '', fornecedor: '', data_aquisicao: today(), localizacao: '',
  })
  const [itens, setItens]       = useState([linhaVazia()])
  const [qtdNova, setQtdNova]   = useState(1)
  const [erros, setErros]       = useState([])
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk]             = useState(null)

  const addLinhas = () => {
    const n = Math.max(1, Math.min(Number(qtdNova) || 1, 50))
    setItens(p => [...p, ...Array.from({ length: n }, linhaVazia)])
  }

  const setItem = (i, campo, val) =>
    setItens(p => p.map((it, idx) => idx === i ? { ...it, [campo]: val } : it))

  const remItem = i => setItens(p => p.filter((_, idx) => idx !== i))

  const aplicarValor = () => {
    const v = itens[0]?.valor || ''
    if (!v) return
    setItens(p => p.map(it => ({ ...it, valor: v })))
  }

  const salvar = async () => {
    setSalvando(true)
    setErros([])
    setOk(null)
    try {
      const itensFiltrados = itens.filter(it => it.plaqueta.trim() || it.descricao.trim())
      const fd = new FormData()
      fd.append('cabecalho', JSON.stringify(cab))
      fd.append('itens', JSON.stringify(itensFiltrados.map(({ foto, ...rest }) => rest)))
      itensFiltrados.forEach((it, i) => { if (it.foto) fd.append(`foto_${i}`, it.foto) })
      const { data } = await api.post('/imobilizado/lancamento/', fd, {
        headers: { 'Content-Type': undefined },
      })
      if (data.ok) {
        setOk(data.total)
        setItens([linhaVazia()])
        onSucesso()
      }
    } catch (e) {
      setErros(e.response?.data?.erros || [e.response?.data?.erro || 'Erro ao salvar'])
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-5">
      {ok && (
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4 text-teal-400 text-sm font-medium">
          ✓ {ok} {ok === 1 ? 'bem criado' : 'bens criados'} com sucesso.
        </div>
      )}
      {erros.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-sm text-rose-400 space-y-1">
          {erros.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {/* Cabeçalho da nota */}
      <div className="bg-bg2 border border-white/[0.06] rounded-xl p-4">
        <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-4">Cabeçalho da Nota</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Categoria" required>
            <select className={sel} value={cab.categoria_id}
              onChange={e => setCab(p => ({ ...p, categoria_id: e.target.value }))}>
              <option value="">Selecione…</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field label="Departamento" required>
            <select className={sel} value={cab.departamento_id}
              onChange={e => setCab(p => ({ ...p, departamento_id: e.target.value }))}>
              <option value="">Selecione…</option>
              {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </Field>
          <Field label="Nota Fiscal">
            <input className={inp} value={cab.nota_fiscal}
              onChange={e => setCab(p => ({ ...p, nota_fiscal: e.target.value }))}
              placeholder="Nº da NF"/>
          </Field>
          <Field label="Fornecedor">
            <input className={inp} value={cab.fornecedor}
              onChange={e => setCab(p => ({ ...p, fornecedor: e.target.value }))}/>
          </Field>
          <Field label="Data de Aquisição">
            <input type="date" className={inp} value={cab.data_aquisicao}
              onChange={e => setCab(p => ({ ...p, data_aquisicao: e.target.value }))}/>
          </Field>
          <Field label="Localização Padrão">
            <select className={sel} value={cab.localizacao}
              onChange={e => setCab(p => ({ ...p, localizacao: e.target.value }))}>
              <option value="">Selecione ou deixe em branco</option>
              {localizacoes.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Itens */}
      <div className="bg-bg2 border border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center justify-between mb-4 gap-3">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider">
            Itens da Nota <span className="text-dim">({itens.length})</span>
          </p>
          {/* Todos os controles agrupados à direita */}
          <div className="flex items-center gap-2">
            <button onClick={aplicarValor}
              className="text-xs text-muted hover:text-dim border border-border px-3 py-1.5 rounded-lg hover:bg-bg3 transition whitespace-nowrap">
              = Mesmo valor
            </button>
            <input type="number" min={1} max={50} value={qtdNova}
              onChange={e => setQtdNova(e.target.value)}
              className="bg-bg3 border border-border rounded-lg text-sm text-dim text-center focus:outline-none focus:border-primary/60 w-14 py-1.5"/>
            <button onClick={addLinhas}
              className="bg-primary/10 text-primary border border-primary/20 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-primary/20 transition whitespace-nowrap">
              + {qtdNova} linha{qtdNova > 1 ? 's' : ''}
            </button>
          </div>
        </div>

        {/* Cabeçalho das colunas */}
        <div className="hidden md:grid grid-cols-[1fr_2fr_1fr_1fr_auto_auto] gap-2 px-1 mb-1">
          {['Plaqueta *', 'Descrição *', 'Valor', 'Localização', 'Foto', ''].map(h => (
            <p key={h} className="text-[10px] font-bold text-muted uppercase tracking-wider">{h}</p>
          ))}
        </div>

        <div className="space-y-2">
          {itens.map((it, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr_1fr_auto_auto] gap-2 items-center">
              <input className={inp} value={it.plaqueta}
                onChange={e => setItem(i, 'plaqueta', e.target.value.toUpperCase())}
                placeholder="P-001"/>
              <input className={inp} value={it.descricao}
                onChange={e => setItem(i, 'descricao', e.target.value)}
                placeholder="Descrição do bem"/>
              <input className={inp} value={it.valor}
                onChange={e => setItem(i, 'valor', e.target.value)}
                placeholder="1.500,00"/>
              <select className={sel} value={it.localizacao}
                onChange={e => setItem(i, 'localizacao', e.target.value)}>
                <option value="">Padrão do cab.</option>
                {localizacoes.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
              </select>
              {/* Upload de foto compacto */}
              <div className="flex-shrink-0">
                <input type="file" accept="image/*" id={`foto-linha-${i}`} className="hidden"
                  onChange={e => setItem(i, 'foto', e.target.files[0] || null)}/>
                <label htmlFor={`foto-linha-${i}`}
                  className="cursor-pointer flex items-center justify-center w-9 h-9 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition overflow-hidden">
                  {it.foto
                    ? <img src={URL.createObjectURL(it.foto)} alt="" className="w-full h-full object-cover rounded-lg"/>
                    : <span className="text-base">📷</span>
                  }
                </label>
              </div>
              <button onClick={() => remItem(i)} disabled={itens.length === 1}
                className="text-muted hover:text-danger transition p-1.5 rounded-lg hover:bg-danger/10 disabled:opacity-20 flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-3">
          <button onClick={salvar} disabled={salvando}
            className="bg-primary text-bg text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
            {salvando ? 'Salvando…' : `Cadastrar ${itens.length} bem${itens.length !== 1 ? 's' : ''}`}
          </button>
          <p className="text-xs text-muted">
            Itens sem valor ficam como <span className="text-amber-400 font-medium">pendentes</span>.
          </p>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// ABA INVENTÁRIOS
// ════════════════════════════════════════════════════════════════════════════════
function RelatorioPanel({ relatorio: r, invId, onClose }) {
  const [exportando, setExportando] = useState(false)

  const exportarRelatorio = async () => {
    setExportando(true)
    try {
      const res = await api.get(`/imobilizado/inventarios/${invId}/relatorio/exportar/`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = `relatorio_inventario.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Erro ao exportar relatório') }
    finally { setExportando(false) }
  }

  const SIT_INFO = {
    LOCALIZADO:       { label: 'Localizado',      emoji: '✅', cor: 'text-teal-400',   bg: 'bg-teal-500/10'   },
    LOCAL_DIVERGENTE: { label: 'Local Divergente', emoji: '⚠️', cor: 'text-amber-400',  bg: 'bg-amber-500/10'  },
    NAO_CADASTRADO:   { label: 'Não Cadastrado',   emoji: '🆕', cor: 'text-violet-400', bg: 'bg-violet-500/10' },
    NAO_LOCALIZADO:   { label: 'Não Localizado',   emoji: '👻', cor: 'text-rose-400',   bg: 'bg-rose-500/10'   },
  }

  const rows = [
    ...r.localizados.map(i     => ({ _sit: 'LOCALIZADO',       plq: i.plaqueta_lida,  desc: i.bem?.descricao || '—',            locSist: i.bem?.localizacao || '—',  locEnc: i.localizacao_encontrada || '—', valor: i.bem?.valor_aquisicao, op: i.contado_por })),
    ...r.divergentes.map(i     => ({ _sit: 'LOCAL_DIVERGENTE',  plq: i.plaqueta_lida,  desc: i.bem?.descricao || '—',            locSist: i.bem?.localizacao || '—',  locEnc: i.localizacao_encontrada || '—', valor: i.bem?.valor_aquisicao, op: i.contado_por })),
    ...r.nao_cadastrados.map(i => ({ _sit: 'NAO_CADASTRADO',    plq: i.plaqueta_lida,  desc: i.descricao_provisoria || '—',      locSist: '—',                         locEnc: i.localizacao_encontrada || '—', valor: null,                   op: i.contado_por })),
    ...r.fantasmas.map(b       => ({ _sit: 'NAO_LOCALIZADO',    plq: b.plaqueta,        desc: b.descricao,                        locSist: b.localizacao || '—',       locEnc: '—',                             valor: b.valor_aquisicao,      op: '—' })),
  ]

  const th = 'text-left text-[10px] font-bold text-muted uppercase tracking-wider px-3 py-2.5 whitespace-nowrap border-b border-border'
  const td = 'px-3 py-2 text-xs'

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { l: 'Esperados',      v: r.total_esperados,          c: 'text-dim'      },
          { l: 'Contados',       v: r.total_contados,           c: 'text-teal-400' },
          { l: 'Índice',         v: `${r.indice_localizacao}%`, c: 'text-primary'  },
          { l: 'Val. Fantasmas', v: fmtR(r.valor_fantasmas),    c: 'text-rose-400' },
        ].map(k => (
          <div key={k.l} className="bg-bg3 border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-muted">{k.l}</p>
            <p className={`text-xl font-bold ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Barra de ações */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{rows.length} item{rows.length !== 1 ? 's' : ''} no total</p>
        <button onClick={exportarRelatorio} disabled={exportando}
          className="text-xs bg-bg3 border border-border text-dim px-3 py-1.5 rounded-lg hover:border-primary/40 hover:text-primary transition disabled:opacity-50">
          {exportando ? '⏳ Exportando…' : '⬇️ Exportar Excel'}
        </button>
      </div>

      {/* Tabela unificada */}
      {rows.length > 0 ? (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Situação', 'Plaqueta', 'Descrição', 'Local Sistema', 'Local Encontrado', 'Valor', 'Operador'].map(h => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const s = SIT_INFO[row._sit]
                  return (
                    <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-bg3/50 transition">
                      <td className={td}>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.cor} whitespace-nowrap`}>
                          {s.emoji} {s.label}
                        </span>
                      </td>
                      <td className={`${td} font-mono font-bold text-primary whitespace-nowrap`}>{row.plq}</td>
                      <td className={`${td} text-dim max-w-[180px]`}><span className="block truncate">{row.desc}</span></td>
                      <td className={`${td} text-muted whitespace-nowrap`}>{row.locSist}</td>
                      <td className={`${td} whitespace-nowrap ${row._sit === 'LOCAL_DIVERGENTE' ? 'text-amber-400 font-semibold' : 'text-muted'}`}>{row.locEnc}</td>
                      <td className={`${td} text-dim whitespace-nowrap text-right`}>{row.valor != null ? fmtR(row.valor) : '—'}</td>
                      <td className={`${td} text-muted whitespace-nowrap`}>{row.op || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-center text-muted py-8 text-sm">Nenhum item registrado neste inventário.</p>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// MODAL DE CONCILIAÇÃO
// ════════════════════════════════════════════════════════════════════════════════
function ConciliacaoModal({ inv, categorias, departamentos, onConciliar, onClose }) {
  const [relatorio, setRelatorio]   = useState(null)
  const [loading, setLoading]       = useState(true)
  const [decisoes, setDecisoes]     = useState({})   // {[id]: {acao, descricao, categoria_id, departamento_id, valor, nf}}
  const [locUpdates, setLocUpdates] = useState({})   // {[id]: boolean}
  const [conciliando, setConciliando] = useState(false)
  const [erro, setErro]             = useState(null)

  useEffect(() => {
    api.get(`/imobilizado/inventarios/${inv.id}/relatorio/`)
      .then(({ data }) => {
        setRelatorio(data)
        const dec = {}
        data.nao_cadastrados.forEach(item => {
          dec[item.id] = {
            acao:            'incorporar',
            descricao:       item.descricao_provisoria || '',
            categoria_id:    item.categoria_provisoria_id    ? String(item.categoria_provisoria_id)    : '',
            departamento_id: item.departamento_provisorio_id ? String(item.departamento_provisorio_id) : '',
            valor:           '',
            nf:              '',
            // para sobras (quantidade > 1): lista de plaquetas a atribuir (texto, uma por linha)
            plaquetasTexto:  '',
          }
        })
        setDecisoes(dec)
      })
      .catch(() => setErro('Erro ao carregar relatório'))
      .finally(() => setLoading(false))
  }, [inv.id])

  const setDec = (id, campo, val) =>
    setDecisoes(prev => ({ ...prev, [id]: { ...prev[id], [campo]: val } }))

  const conciliar = async () => {
    setConciliando(true)
    setErro(null)
    try {
      // monta lista de plaquetas para itens de sobra (quantidade > 1)
      const naoCAd = relatorio.nao_cadastrados
      await api.post(`/imobilizado/inventarios/${inv.id}/conciliar/`, {
        nao_cadastrados: Object.entries(decisoes).map(([id, d]) => {
          const item = naoCAd.find(i => i.id === Number(id))
          const isSobra = item && (item.quantidade || 1) > 1
          const plaquetas = isSobra
            ? d.plaquetasTexto.split('\n').map(p => p.trim().toUpperCase()).filter(Boolean)
            : []
          return {
            item_id:         Number(id),
            acao:            d.acao,
            descricao:       d.descricao,
            categoria_id:    d.categoria_id    ? Number(d.categoria_id)    : null,
            departamento_id: d.departamento_id ? Number(d.departamento_id) : null,
            valor_aquisicao: d.valor,
            nota_fiscal:     d.nf,
            ...(plaquetas.length > 0 ? { plaquetas } : {}),
          }
        }),
        divergentes: Object.entries(locUpdates)
          .filter(([, v]) => v)
          .map(([id]) => ({ item_id: Number(id), atualizar_local: true })),
      })
      onConciliar()
      onClose()
    } catch (e) {
      setErro(e.response?.data?.erro || 'Erro ao conciliar')
    } finally {
      setConciliando(false)
    }
  }

  const temCamposFaltando = relatorio
    ? relatorio.nao_cadastrados.some(item => {
        const d = decisoes[item.id] || {}
        return d.acao === 'incorporar' && (!d.descricao?.trim() || !d.categoria_id || !d.departamento_id)
      })
    : false

  const th = 'text-left text-[10px] font-bold text-muted uppercase tracking-wider px-2 py-2 whitespace-nowrap border-b border-border'
  const tc = 'px-2 py-2 text-xs align-middle'

  return (
    <Modal title={`Conciliação: ${fmtDt(inv.data)}${inv.local_area ? ' — ' + inv.local_area : ''}`} wide onClose={onClose}>
      {loading && <p className="text-muted text-center py-8">Carregando…</p>}
      {erro && !loading && <p className="text-rose-400 text-sm">{erro}</p>}

      {relatorio && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'Lidos',            value: relatorio.total_contados,          cor: 'text-dim' },
              { label: 'Não Cadastrados',  value: relatorio.nao_cadastrados.length,  cor: 'text-violet-400' },
              { label: 'Local Divergente', value: relatorio.divergentes.length,      cor: 'text-amber-400' },
              { label: 'Não Localizados',  value: relatorio.fantasmas.length,        cor: 'text-rose-400' },
            ].map(({ label, value, cor }) => (
              <div key={label} className="bg-bg3 border border-border rounded-lg p-3 text-center">
                <p className="text-xs text-muted">{label}</p>
                <p className={`text-xl font-bold ${cor}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Não cadastrados unitários (quantidade = 1) — tabela */}
          {relatorio.nao_cadastrados.filter(i => (i.quantidade || 1) === 1).length > 0 && (() => {
            const unitarios = relatorio.nao_cadastrados.filter(i => (i.quantidade || 1) === 1)
            return (
              <div>
                <p className="text-[11px] font-bold text-violet-400 uppercase tracking-wider mb-2">
                  🆕 Não Cadastrados — definir ação para cada item
                </p>
                <div className="overflow-x-auto rounded-xl border border-violet-500/20">
                  <table className="w-full min-w-[860px] border-collapse text-sm">
                    <thead className="bg-bg3/60">
                      <tr>
                        <th className={th}>Foto</th>
                        <th className={th}>Plaqueta</th>
                        <th className={th}>Local Enc.</th>
                        <th className={`${th} min-w-[160px]`}>Descrição *</th>
                        <th className={`${th} min-w-[130px]`}>Categoria *</th>
                        <th className={`${th} min-w-[130px]`}>Departamento *</th>
                        <th className={`${th} min-w-[100px]`}>Valor Aquis.</th>
                        <th className={`${th} min-w-[90px]`}>NF</th>
                        <th className={th}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unitarios.map(item => {
                        const d = decisoes[item.id] || {}
                        const ignorar = d.acao === 'ignorar'
                        const faltando = !ignorar && (!d.descricao?.trim() || !d.categoria_id || !d.departamento_id)
                        return (
                          <tr key={item.id} className={`border-b border-border/40 last:border-0 transition ${ignorar ? 'opacity-40' : 'hover:bg-bg3/40'}`}>
                            <td className={tc}>
                              {item.foto_provisoria_url
                                ? <img src={item.foto_provisoria_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-border"/>
                                : <div className="w-10 h-10 rounded-lg bg-bg3 border border-border flex items-center justify-center text-base">❓</div>
                              }
                            </td>
                            <td className={`${tc} font-mono font-bold text-primary whitespace-nowrap`}>{item.plaqueta_lida}</td>
                            <td className={`${tc} text-muted whitespace-nowrap`}>{item.localizacao_encontrada || '—'}</td>
                            <td className={tc}>
                              <input className={`${inp} text-xs py-1 ${faltando && !d.descricao?.trim() ? 'border-rose-500/50' : ''}`}
                                value={d.descricao || ''} onChange={e => setDec(item.id, 'descricao', e.target.value)}
                                placeholder="Descrição do bem" disabled={ignorar}/>
                            </td>
                            <td className={tc}>
                              <select className={`${sel} text-xs py-1 ${faltando && !d.categoria_id ? 'border-rose-500/50' : ''}`}
                                value={d.categoria_id || ''} onChange={e => setDec(item.id, 'categoria_id', e.target.value)} disabled={ignorar}>
                                <option value="">Selecione…</option>
                                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                              </select>
                            </td>
                            <td className={tc}>
                              <select className={`${sel} text-xs py-1 ${faltando && !d.departamento_id ? 'border-rose-500/50' : ''}`}
                                value={d.departamento_id || ''} onChange={e => setDec(item.id, 'departamento_id', e.target.value)} disabled={ignorar}>
                                <option value="">Selecione…</option>
                                {departamentos.map(dep => <option key={dep.id} value={dep.id}>{dep.nome}</option>)}
                              </select>
                            </td>
                            <td className={tc}>
                              <input className={`${inp} text-xs py-1`} value={d.valor || ''}
                                onChange={e => setDec(item.id, 'valor', e.target.value)} placeholder="0,00" disabled={ignorar}/>
                            </td>
                            <td className={tc}>
                              <input className={`${inp} text-xs py-1`} value={d.nf || ''}
                                onChange={e => setDec(item.id, 'nf', e.target.value)} placeholder="Nº NF" disabled={ignorar}/>
                            </td>
                            <td className={tc}>
                              <select className={`${sel} text-xs py-1 ${ignorar ? 'border-rose-500/30 text-rose-400' : 'border-violet-500/30 text-violet-300'}`}
                                value={d.acao || 'incorporar'} onChange={e => setDec(item.id, 'acao', e.target.value)}>
                                <option value="incorporar">✓ Incorporar</option>
                                <option value="ignorar">✗ Ignorar</option>
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {temCamposFaltando && (
                  <p className="text-[11px] text-rose-400 mt-1.5">⚠ Preencha Descrição, Categoria e Departamento para todos os itens marcados como "Incorporar".</p>
                )}
              </div>
            )
          })()}

          {/* Sobras / Pendentes (quantidade > 1) */}
          {relatorio.nao_cadastrados.filter(i => (i.quantidade || 1) > 1).length > 0 && (() => {
            const sobras = relatorio.nao_cadastrados.filter(i => (i.quantidade || 1) > 1)
            return (
              <div>
                <p className="text-[11px] font-bold text-orange-400 uppercase tracking-wider mb-2">
                  📦 Sobras / Pendentes — lotes sem plaqueta individual
                </p>
                <div className="overflow-x-auto rounded-xl border border-orange-500/20">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead className="bg-bg3/60">
                      <tr>
                        <th className={th}>Foto</th>
                        <th className={th}>Ref. / Grupo</th>
                        <th className={th}>Local Enc.</th>
                        <th className={`${th} min-w-[150px]`}>Descrição *</th>
                        <th className={`${th} min-w-[120px]`}>Categoria *</th>
                        <th className={`${th} min-w-[120px]`}>Departamento *</th>
                        <th className={`${th} min-w-[90px]`}>Valor Unit.</th>
                        <th className={`${th} min-w-[80px]`}>NF</th>
                        <th className={`${th} text-center`}>Qtd Enc.</th>
                        <th className={`${th} min-w-[160px]`}>Plaquetas (1/linha)</th>
                        <th className={th}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sobras.map(item => {
                        const d = decisoes[item.id] || {}
                        const ignorar = d.acao === 'ignorar'
                        const qtdEncontrada = item.quantidade || 1
                        const plqs = (d.plaquetasTexto || '').split('\n').map(p => p.trim().toUpperCase()).filter(Boolean)
                        const atribuidas = plqs.length
                        const faltando = !ignorar && (!d.descricao?.trim() || !d.categoria_id || !d.departamento_id)
                        return (
                          <tr key={item.id} className={`border-b border-border/40 last:border-0 transition ${ignorar ? 'opacity-40' : 'hover:bg-bg3/40'}`}>
                            <td className={tc}>
                              {item.foto_provisoria_url
                                ? <img src={item.foto_provisoria_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-border"/>
                                : <div className="w-10 h-10 rounded-lg bg-bg3 border border-border flex items-center justify-center text-base">📦</div>
                              }
                            </td>
                            <td className={`${tc} font-mono font-bold text-orange-400 whitespace-nowrap`}>{item.plaqueta_lida}</td>
                            <td className={`${tc} text-muted whitespace-nowrap`}>{item.localizacao_encontrada || '—'}</td>
                            <td className={tc}>
                              <input className={`${inp} text-xs py-1 ${faltando && !d.descricao?.trim() ? 'border-rose-500/50' : ''}`}
                                value={d.descricao || ''} onChange={e => setDec(item.id, 'descricao', e.target.value)}
                                placeholder="Ex: Cadeira giratória" disabled={ignorar}/>
                            </td>
                            <td className={tc}>
                              <select className={`${sel} text-xs py-1 ${faltando && !d.categoria_id ? 'border-rose-500/50' : ''}`}
                                value={d.categoria_id || ''} onChange={e => setDec(item.id, 'categoria_id', e.target.value)} disabled={ignorar}>
                                <option value="">Selecione…</option>
                                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                              </select>
                            </td>
                            <td className={tc}>
                              <select className={`${sel} text-xs py-1 ${faltando && !d.departamento_id ? 'border-rose-500/50' : ''}`}
                                value={d.departamento_id || ''} onChange={e => setDec(item.id, 'departamento_id', e.target.value)} disabled={ignorar}>
                                <option value="">Selecione…</option>
                                {departamentos.map(dep => <option key={dep.id} value={dep.id}>{dep.nome}</option>)}
                              </select>
                            </td>
                            <td className={tc}>
                              <input className={`${inp} text-xs py-1`} value={d.valor || ''}
                                onChange={e => setDec(item.id, 'valor', e.target.value)} placeholder="0,00" disabled={ignorar}/>
                            </td>
                            <td className={tc}>
                              <input className={`${inp} text-xs py-1`} value={d.nf || ''}
                                onChange={e => setDec(item.id, 'nf', e.target.value)} placeholder="Nº NF" disabled={ignorar}/>
                            </td>
                            <td className={`${tc} text-center`}>
                              <span className="inline-flex flex-col items-center gap-0.5">
                                <span className="text-orange-400 font-bold text-sm">{qtdEncontrada}</span>
                                <span className="text-[10px] text-muted">un.</span>
                              </span>
                            </td>
                            <td className={tc}>
                              {!ignorar && (
                                <div>
                                  <textarea
                                    className={`${inp} text-xs py-1 font-mono resize-none`}
                                    style={{ minHeight: 72 }}
                                    value={d.plaquetasTexto || ''}
                                    onChange={e => setDec(item.id, 'plaquetasTexto', e.target.value)}
                                    placeholder={`P001\nP002\n...`}
                                    disabled={ignorar}
                                  />
                                  <p className={`text-[10px] mt-0.5 ${atribuidas >= qtdEncontrada ? 'text-teal-400' : atribuidas > 0 ? 'text-amber-400' : 'text-muted'}`}>
                                    {atribuidas}/{qtdEncontrada} atribuídas
                                  </p>
                                </div>
                              )}
                            </td>
                            <td className={tc}>
                              <select className={`${sel} text-xs py-1 ${ignorar ? 'border-rose-500/30 text-rose-400' : 'border-orange-500/30 text-orange-300'}`}
                                value={d.acao || 'incorporar'} onChange={e => setDec(item.id, 'acao', e.target.value)}>
                                <option value="incorporar">✓ Incorporar</option>
                                <option value="ignorar">✗ Ignorar</option>
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted mt-1.5">
                  💡 Insira as plaquetas definitivas (uma por linha) para criar os bens. Plaquetas já existentes serão ignoradas.
                </p>
              </div>
            )
          })()}

          {/* Local Divergente — tabela */}
          {relatorio.divergentes.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-2">
                ⚠️ Local Divergente — atualizar localização no sistema?
              </p>
              <div className="overflow-x-auto rounded-xl border border-amber-500/20">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-bg3/60">
                    <tr>
                      <th className={th}>Plaqueta</th>
                      <th className={th}>Descrição</th>
                      <th className={th}>Local no Sistema</th>
                      <th className={`${th} text-center`}>→</th>
                      <th className={th}>Local Encontrado</th>
                      <th className={`${th} text-center`}>Atualizar?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.divergentes.map(item => (
                      <tr key={item.id} className="border-b border-border/40 last:border-0 hover:bg-bg3/40 transition">
                        <td className={`${tc} font-mono font-bold text-primary whitespace-nowrap`}>{item.plaqueta_lida}</td>
                        <td className={`${tc} text-dim max-w-[180px]`}><span className="block truncate">{item.bem?.descricao || '—'}</span></td>
                        <td className={`${tc} text-muted whitespace-nowrap line-through opacity-60`}>{item.bem?.localizacao || '—'}</td>
                        <td className={`${tc} text-center text-muted`}>→</td>
                        <td className={`${tc} text-amber-400 font-semibold whitespace-nowrap`}>{item.localizacao_encontrada}</td>
                        <td className={`${tc} text-center`}>
                          <label className="flex items-center justify-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!locUpdates[item.id]}
                              onChange={e => setLocUpdates(prev => ({ ...prev, [item.id]: e.target.checked }))}
                              className="accent-primary w-4 h-4"
                            />
                            <span className={`text-xs font-semibold ${locUpdates[item.id] ? 'text-amber-400' : 'text-muted'}`}>
                              {locUpdates[item.id] ? 'Sim' : 'Não'}
                            </span>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fantasmas — tabela colapsável */}
          {relatorio.fantasmas.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-rose-400 flex items-center gap-2 py-1 select-none">
                👻 Não Localizados
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-rose-500/10 ml-1">{relatorio.fantasmas.length}</span>
                <span className="text-xs text-muted font-normal">(referência apenas)</span>
              </summary>
              <div className="mt-2 overflow-x-auto rounded-xl border border-rose-500/15">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-bg3/60">
                    <tr>
                      <th className={th}>Plaqueta</th>
                      <th className={th}>Descrição</th>
                      <th className={th}>Localização</th>
                      <th className={`${th} text-right`}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.fantasmas.map((b, i) => (
                      <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-bg3/30 transition">
                        <td className={`${tc} font-mono font-bold text-primary whitespace-nowrap`}>{b.plaqueta}</td>
                        <td className={`${tc} text-dim max-w-[200px]`}><span className="block truncate">{b.descricao}</span></td>
                        <td className={`${tc} text-muted whitespace-nowrap`}>{b.localizacao || '—'}</td>
                        <td className={`${tc} text-right text-muted whitespace-nowrap`}>{b.valor_aquisicao != null ? fmtR(b.valor_aquisicao) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {/* Localizados — apenas contagem */}
          {relatorio.localizados.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-teal-400 flex items-center gap-2 py-1 select-none">
                ✅ Localizados corretamente
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-teal-500/10 ml-1">{relatorio.localizados.length}</span>
              </summary>
              <div className="mt-2 overflow-x-auto rounded-xl border border-teal-500/15">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-bg3/60">
                    <tr>
                      <th className={th}>Plaqueta</th>
                      <th className={th}>Descrição</th>
                      <th className={th}>Localização</th>
                      <th className={th}>Operador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.localizados.slice(0, 50).map((item, i) => (
                      <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-bg3/30 transition">
                        <td className={`${tc} font-mono font-bold text-primary whitespace-nowrap`}>{item.plaqueta_lida}</td>
                        <td className={`${tc} text-dim max-w-[200px]`}><span className="block truncate">{item.bem?.descricao || '—'}</span></td>
                        <td className={`${tc} text-muted whitespace-nowrap`}>{item.localizacao_encontrada || '—'}</td>
                        <td className={`${tc} text-muted whitespace-nowrap`}>{item.contado_por || '—'}</td>
                      </tr>
                    ))}
                    {relatorio.localizados.length > 50 && (
                      <tr>
                        <td colSpan={4} className="text-center text-xs text-muted italic py-2">… e mais {relatorio.localizados.length - 50} itens</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {/* Footer */}
          <div className="border-t border-border/50 pt-4 space-y-3">
            {erro && <p className="text-sm text-rose-400">{erro}</p>}
            {temCamposFaltando && (
              <p className="text-sm text-amber-400">Preencha os campos obrigatórios nos itens marcados como "Incorporar".</p>
            )}
            <div className="flex gap-3">
              <button onClick={conciliar} disabled={conciliando || temCamposFaltando}
                className="bg-primary text-bg text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
                {conciliando ? 'Processando…' : '✓ Encerrar Inventário'}
              </button>
              <button onClick={onClose} disabled={conciliando}
                className="text-muted text-sm px-4 py-2 rounded-lg hover:bg-bg3 transition">
                Cancelar
              </button>
            </div>
            <p className="text-[10px] text-muted italic">
              Itens ignorados não criam bens. Após encerrar, o inventário fica disponível somente para consulta.
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}

function InventariosTab({ categorias, departamentos }) {
  const navigate = useNavigate()
  const [invs, setInvs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [criando, setCriando]     = useState(false)
  const [novoForm, setNovoForm]   = useState({ data: today(), local_area: '', responsavel: '', observacoes: '' })
  const [salvando, setSalvando]   = useState(false)
  const [relatorioModal, setRelatorioModal] = useState(null)
  const [loadingRel, setLoadingRel] = useState(false)
  const [invRelId, setInvRelId] = useState(null)
  const [conciliandoInv, setConciliandoInv] = useState(null)

  const carregar = async () => {
    setLoading(true)
    try { const { data } = await api.get('/imobilizado/inventarios/'); setInvs(data) }
    finally { setLoading(false) }
  }
  useEffect(() => { carregar() }, [])

  const criarInventario = async () => {
    setSalvando(true)
    try {
      await api.post('/imobilizado/inventarios/', novoForm)
      setCriando(false)
      setNovoForm({ data: today(), local_area: '', responsavel: '', observacoes: '' })
      carregar()
    } finally { setSalvando(false) }
  }

  const verRelatorio = async inv => {
    setInvRelId(inv.id)
    setLoadingRel(true)
    setRelatorioModal(null)
    try {
      const { data } = await api.get(`/imobilizado/inventarios/${inv.id}/relatorio/`)
      setRelatorioModal(data)
    } finally { setLoadingRel(false) }
  }

  const excluirInventario = async inv => {
    if (!window.confirm(`Excluir inventário de ${fmtDt(inv.data)}? Todas as leituras serão removidas.`)) return
    await api.delete(`/imobilizado/inventarios/${inv.id}/`)
    carregar()
  }

  const novoLink = async inv => {
    if (!window.confirm('Gerar novo link? O link atual deixará de funcionar.')) return
    const { data } = await api.post(`/imobilizado/inventarios/${inv.id}/novo-link/`)
    setInvs(prev => prev.map(i => i.id === inv.id ? { ...i, token: data.token } : i))
  }

  const finalizar = async inv => {
    if (!window.confirm(`Finalizar inventário de ${fmtDt(inv.data)}?`)) return
    await api.post(`/imobilizado/inventarios/${inv.id}/finalizar/`)
    carregar()
  }

  const reabrir = async inv => {
    if (!window.confirm(`Reabrir inventário de ${fmtDt(inv.data)} para ajustes? O status voltará para "Aguardando Conciliação".`)) return
    await api.post(`/imobilizado/inventarios/${inv.id}/reabrir/`)
    carregar()
  }

  const STATUS_COR = {
    ABERTO:     { bg: 'bg-teal-500/10',   text: 'text-teal-400',   label: 'Aberto'                  },
    AGUARDANDO: { bg: 'bg-violet-500/10', text: 'text-violet-400', label: 'Aguardando Conciliação'  },
    FINALIZADO: { bg: 'bg-bg3',           text: 'text-muted',      label: 'Finalizado'              },
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{invs.length} inventário{invs.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setCriando(true)}
          className="bg-primary text-bg text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition">
          + Novo Inventário
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted">Carregando…</div>
      ) : invs.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="text-4xl mb-2">📋</p>
          <p>Nenhum inventário. Crie o primeiro!</p>
        </div>
      ) : (
        <div className="bg-bg2 border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Data', 'Área / Local', 'Responsável', 'Leituras', 'Status', 'Ações'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invs.map(inv => {
                  const c = STATUS_COR[inv.status] || STATUS_COR.ABERTO
                  return (
                    <tr key={inv.id} className="border-b border-border/40 last:border-0 hover:bg-bg3/20 transition">
                      <td className="px-4 py-3 font-semibold text-dim whitespace-nowrap">{fmtDt(inv.data)}</td>
                      <td className="px-4 py-3 text-muted">{inv.local_area || '—'}</td>
                      <td className="px-4 py-3 text-muted">{inv.responsavel || '—'}</td>
                      <td className="px-4 py-3 text-dim">{inv.total_itens}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{c.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {inv.status === 'ABERTO' && (
                            <button onClick={() => navigate(`/imobilizado/${inv.token}/contagem`)}
                              className="text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition whitespace-nowrap">
                              📱 Contar
                            </button>
                          )}
                          {inv.status === 'ABERTO' && (
                            <button onClick={async () => {
                              const url = `${window.location.origin}/imobilizado/${inv.token}/contagem`
                              try { await navigator.clipboard.writeText(url) } catch { prompt('Copie o link:', url) }
                            }}
                              className="text-xs bg-bg3 border border-border text-muted px-2.5 py-1 rounded-lg hover:border-primary/40 hover:text-primary transition"
                              title="Copiar link público">
                              🔗
                            </button>
                          )}
                          {inv.status === 'ABERTO' && (
                            <button onClick={() => novoLink(inv)}
                              className="text-xs bg-bg3 border border-border text-muted px-2.5 py-1 rounded-lg hover:border-amber-500/40 hover:text-amber-400 transition"
                              title="Gerar novo link (invalida o anterior)">
                              🔄
                            </button>
                          )}
                          <button onClick={() => verRelatorio(inv)}
                            className="text-xs bg-bg3 border border-border text-dim px-2.5 py-1 rounded-lg hover:border-primary/40 hover:text-primary transition">
                            {invRelId === inv.id && loadingRel ? '…' : '📊'}
                          </button>
                          {inv.status === 'ABERTO' && (
                            <button onClick={() => finalizar(inv)}
                              className="text-xs bg-bg3 border border-border text-muted px-2.5 py-1 rounded-lg hover:border-amber-500/40 hover:text-amber-400 transition whitespace-nowrap">
                              ✓ Finalizar
                            </button>
                          )}
                          {inv.status === 'AGUARDANDO' && (
                            <button onClick={() => setConciliandoInv(inv)}
                              className="text-xs bg-violet-500/10 text-violet-400 border border-violet-500/30 px-2.5 py-1 rounded-lg hover:bg-violet-500/20 transition whitespace-nowrap">
                              📋 Conciliar
                            </button>
                          )}
                          {inv.status === 'FINALIZADO' && (
                            <button onClick={() => reabrir(inv)}
                              className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg hover:bg-amber-500/20 transition whitespace-nowrap">
                              🔓 Reabrir
                            </button>
                          )}
                          <button onClick={() => excluirInventario(inv)}
                            className="text-xs text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-lg hover:bg-rose-500/10 transition">
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de relatório */}
      {relatorioModal && (
        <Modal title="Relatório de Reconciliação" wide onClose={() => { setRelatorioModal(null); setInvRelId(null) }}>
          <RelatorioPanel relatorio={relatorioModal} invId={invRelId} onClose={() => { setRelatorioModal(null); setInvRelId(null) }}/>
        </Modal>
      )}

      {/* Modal de conciliação */}
      {conciliandoInv && (
        <ConciliacaoModal
          inv={conciliandoInv}
          categorias={categorias}
          departamentos={departamentos}
          onConciliar={carregar}
          onClose={() => setConciliandoInv(null)}
        />
      )}

      {criando && (
        <Modal title="Novo Inventário" onClose={() => setCriando(false)}>
          <div className="space-y-4">
            <Field label="Data" required>
              <input type="date" className={inp} value={novoForm.data}
                onChange={e => setNovoForm(p => ({ ...p, data: e.target.value }))}/>
            </Field>
            <Field label="Departamento / Área">
              <select className={sel} value={novoForm.local_area}
                onChange={e => setNovoForm(p => ({ ...p, local_area: e.target.value }))}>
                <option value="">Selecione…</option>
                {departamentos.map(d => <option key={d.id} value={d.nome}>{d.nome}</option>)}
              </select>
            </Field>
            <Field label="Responsável">
              <input className={inp} value={novoForm.responsavel}
                onChange={e => setNovoForm(p => ({ ...p, responsavel: e.target.value }))}/>
            </Field>
            <Field label="Observações">
              <textarea className={`${inp} h-20 resize-none`} value={novoForm.observacoes}
                onChange={e => setNovoForm(p => ({ ...p, observacoes: e.target.value }))}/>
            </Field>
            <div className="flex gap-3">
              <button onClick={criarInventario} disabled={salvando}
                className="bg-primary text-bg text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
                {salvando ? 'Criando…' : 'Criar Inventário'}
              </button>
              <button onClick={() => setCriando(false)}
                className="text-muted text-sm px-4 py-2 rounded-lg hover:bg-bg3 transition">
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════════
export default function Imobilizado() {
  const [aba, setAba]               = useState('bens')
  const [categorias, setCategorias] = useState([])
  const [departamentos, setDepartamentos] = useState([])
  const [localizacoes, setLocalizacoes]   = useState([])
  const [showConfig, setShowConfig] = useState(false)

  const [novaCat, setNovaCat]   = useState('')
  const [novaDep, setNovaDep]   = useState('')
  const [novaLoc, setNovaLoc]   = useState('')

  const carregarConfig = useCallback(async () => {
    const [cs, ds, ls] = await Promise.all([
      api.get('/imobilizado/categorias/'),
      api.get('/imobilizado/departamentos/'),
      api.get('/imobilizado/localizacoes/'),
    ])
    setCategorias(cs.data)
    setDepartamentos(ds.data)
    setLocalizacoes(ls.data)
  }, [])

  useEffect(() => { carregarConfig() }, [carregarConfig])

  const adicionarCat = async () => {
    if (!novaCat.trim()) return
    await api.post('/imobilizado/categorias/', { nome: novaCat.trim() })
    setNovaCat('')
    carregarConfig()
  }
  const adicionarDep = async () => {
    if (!novaDep.trim()) return
    await api.post('/imobilizado/departamentos/', { nome: novaDep.trim() })
    setNovaDep('')
    carregarConfig()
  }
  const adicionarLoc = async () => {
    if (!novaLoc.trim()) return
    await api.post('/imobilizado/localizacoes/', { nome: novaLoc.trim() })
    setNovaLoc('')
    carregarConfig()
  }
  const removerLoc = async item => {
    await api.delete(`/imobilizado/localizacoes/?id=${item.id}`)
    carregarConfig()
  }

  const tabs = [
    { id: 'bens',        label: '📦 Bens'        },
    { id: 'lancamento',  label: '📝 Lançamento'  },
    { id: 'inventarios', label: '📋 Inventários' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-dim">Imobilizado</h1>
          <p className="text-xs text-muted mt-0.5">Controle patrimonial · plaquetas · inventários</p>
        </div>
        <button onClick={() => setShowConfig(true)}
          className="text-xs text-muted border border-border px-3 py-1.5 rounded-lg hover:bg-bg3 hover:text-dim transition">
          ⚙️ Categorias &amp; Departamentos
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition border-b-2 -mb-px
              ${aba === t.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted hover:text-dim hover:border-border'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === 'bens' && (
        <BensTab categorias={categorias} departamentos={departamentos} localizacoes={localizacoes}/>
      )}
      {aba === 'lancamento' && (
        <LancamentoTab
          categorias={categorias}
          departamentos={departamentos}
          localizacoes={localizacoes}
          onSucesso={() => setAba('bens')}
        />
      )}
      {aba === 'inventarios' && <InventariosTab categorias={categorias} departamentos={departamentos}/>}

      {/* Modal de configuração */}
      {showConfig && (
        <Modal title="Configurações de Cadastro" wide onClose={() => setShowConfig(false)}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ListaConfig
              titulo="Categorias"
              itens={categorias}
              novoValor={novaCat}
              onNovoValor={setNovaCat}
              onAdicionar={adicionarCat}
            />
            <ListaConfig
              titulo="Departamentos"
              itens={departamentos}
              novoValor={novaDep}
              onNovoValor={setNovaDep}
              onAdicionar={adicionarDep}
            />
            <ListaConfig
              titulo="Localizações"
              itens={localizacoes}
              novoValor={novaLoc}
              onNovoValor={setNovaLoc}
              onAdicionar={adicionarLoc}
              onRemover={removerLoc}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
