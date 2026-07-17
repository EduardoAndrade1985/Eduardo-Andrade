import { useState, useEffect, useCallback } from 'react'
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
        headers: { 'Content-Type': 'multipart/form-data' },
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

      {/* Filtros */}
      <div className="bg-bg2 border border-white/[0.06] rounded-xl p-4 flex flex-wrap gap-3">
        <input className={`${inp} flex-1 min-w-[180px]`}
          placeholder="Buscar plaqueta, descrição ou NF…"
          value={filtros.q} onChange={e => setFiltros(p => ({ ...p, q: e.target.value }))}/>
        <select className={`${sel} w-36`} value={filtros.situacao}
          onChange={e => setFiltros(p => ({ ...p, situacao: e.target.value }))}>
          <option value="">Situação</option>
          <option value="EM_USO">Em Uso</option>
          <option value="MANUTENCAO">Manutenção</option>
          <option value="BAIXADO">Baixado</option>
        </select>
        <select className={`${sel} w-44`} value={filtros.categoria_id}
          onChange={e => setFiltros(p => ({ ...p, categoria_id: e.target.value }))}>
          <option value="">Categoria</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className={`${sel} w-44`} value={filtros.departamento_id}
          onChange={e => setFiltros(p => ({ ...p, departamento_id: e.target.value }))}>
          <option value="">Departamento</option>
          {departamentos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-dim cursor-pointer select-none">
          <input type="checkbox" checked={!!filtros.pendente}
            onChange={e => setFiltros(p => ({ ...p, pendente: e.target.checked ? '1' : '' }))}
            className="accent-primary"/>
          Só pendentes
        </label>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-muted">Carregando…</div>
      ) : bens.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="text-4xl mb-2">📦</p>
          <p>Nenhum bem encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {bens.map(b => (
            <div key={b.id} onClick={() => abrirEditar(b)}
              className="bg-bg2 border border-white/[0.06] rounded-xl p-4 hover:border-primary/30 hover:bg-bg3/30 cursor-pointer transition">
              <div className="flex items-start gap-3">
                {b.foto_url ? (
                  <img src={b.foto_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-border"/>
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-bg3 border border-border flex items-center justify-center text-2xl flex-shrink-0">📦</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {b.plaqueta}
                    </span>
                    <SituacaoBadge s={b.situacao}/>
                    {!b.cadastro_completo && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        pendente
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-dim mt-1 truncate">{b.descricao}</p>
                  <p className="text-xs text-muted mt-0.5">{b.categoria?.nome} · {b.departamento?.nome}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
                {b.localizacao         && <span className="truncate">📍 {b.localizacao}</span>}
                {b.nota_fiscal         && <span className="truncate">NF {b.nota_fiscal}</span>}
                {b.valor_aquisicao != null && <span className="font-semibold text-dim">{fmtR(b.valor_aquisicao)}</span>}
                {b.data_aquisicao      && <span>{fmtDt(b.data_aquisicao)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de edição */}
      {editando && bemSel && (
        <Modal title={`Bem ${bemSel.plaqueta}`} onClose={() => { setEditando(false); setBemSel(null) }} wide>
          <div className="space-y-4">
            {erros.length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-sm text-rose-400">
                {erros.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Descrição" required>
                <input className={inp} value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}/>
              </Field>
              <Field label="Situação">
                <select className={sel} value={form.situacao} onChange={e => setForm(p => ({ ...p, situacao: e.target.value }))}>
                  <option value="EM_USO">Em Uso</option>
                  <option value="MANUTENCAO">Em Manutenção</option>
                </select>
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
                <select className={sel} value={form.localizacao}
                  onChange={e => setForm(p => ({ ...p, localizacao: e.target.value }))}>
                  <option value="">Selecione ou deixe em branco</option>
                  {localizacoes.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                  {form.localizacao && !localizacoes.find(l => l.nome === form.localizacao) && (
                    <option value={form.localizacao}>{form.localizacao} (atual)</option>
                  )}
                </select>
              </Field>
              <Field label="Nota Fiscal">
                <input className={inp} value={form.nota_fiscal} onChange={e => setForm(p => ({ ...p, nota_fiscal: e.target.value }))}/>
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
            <Field label="Observações">
              <textarea className={`${inp} h-20 resize-none`} value={form.observacoes}
                onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}/>
            </Field>
            <Field label="Foto">
              <div className="flex items-center gap-3">
                {bemSel.foto_url && !fotoFile && (
                  <img src={bemSel.foto_url} alt="" className="w-16 h-16 rounded-lg object-cover border border-border"/>
                )}
                {fotoFile && (
                  <img src={URL.createObjectURL(fotoFile)} alt="" className="w-16 h-16 rounded-lg object-cover border border-border"/>
                )}
                <input type="file" accept="image/*"
                  onChange={e => setFotoFile(e.target.files[0] || null)}
                  className="text-xs text-muted"/>
              </div>
            </Field>
            <div className="flex gap-3 pt-2 flex-wrap">
              <button onClick={salvarEdicao} disabled={salvando}
                className="bg-primary text-bg text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
              <button onClick={() => { setEditando(false); setBaixando(true) }}
                className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-sm font-semibold px-5 py-2 rounded-lg hover:bg-rose-500/20 transition">
                Dar Baixa
              </button>
              <button onClick={() => { setEditando(false); setBemSel(null) }}
                className="text-muted text-sm px-4 py-2 rounded-lg hover:bg-bg3 transition">
                Cancelar
              </button>
            </div>
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
  const linhaVazia = () => ({ plaqueta: '', descricao: '', valor: '', localizacao: '' })

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
      const { data } = await api.post('/imobilizado/lancamento/', {
        cabecalho: cab,
        itens: itens.filter(it => it.plaqueta.trim() || it.descricao.trim()),
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
        <div className="hidden md:grid grid-cols-[1fr_2fr_1fr_1fr_auto] gap-2 px-1 mb-1">
          {['Plaqueta *', 'Descrição *', 'Valor', 'Localização', ''].map(h => (
            <p key={h} className="text-[10px] font-bold text-muted uppercase tracking-wider">{h}</p>
          ))}
        </div>

        <div className="space-y-2">
          {itens.map((it, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr_1fr_auto] gap-2 items-center">
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
function RelatorioPanel({ relatorio: r, onClose }) {
  const grupos = [
    { key: 'localizados',     cor: 'teal',  emoji: '✅', label: 'Localizados',     items: r.localizados     },
    { key: 'divergentes',     cor: 'amber', emoji: '⚠️', label: 'Local Divergente',items: r.divergentes     },
    { key: 'nao_cadastrados', cor: 'blue',  emoji: '🆕', label: 'Não Cadastrados', items: r.nao_cadastrados },
    { key: 'fantasmas',       cor: 'rose',  emoji: '👻', label: 'Não Localizados', items: r.fantasmas       },
  ]
  const corMap = {
    teal:  { text: 'text-teal-400',  bg: 'bg-teal-500/10'  },
    amber: { text: 'text-amber-400', bg: 'bg-amber-500/10' },
    blue:  { text: 'text-blue-400',  bg: 'bg-blue-500/10'  },
    rose:  { text: 'text-rose-400',  bg: 'bg-rose-500/10'  },
  }

  return (
    <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Relatório de Reconciliação</p>
        <button onClick={onClose} className="text-xs text-muted hover:text-dim px-2 py-1 rounded hover:bg-bg3 transition">✕ fechar</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { l: 'Esperados',  v: r.total_esperados,    c: 'text-dim'      },
          { l: 'Contados',   v: r.total_contados,     c: 'text-teal-400' },
          { l: 'Índice',     v: `${r.indice_localizacao}%`, c: 'text-primary' },
          { l: 'Val. Fantasmas', v: fmtR(r.valor_fantasmas), c: 'text-rose-400' },
        ].map(k => (
          <div key={k.l} className="bg-bg3 border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-muted">{k.l}</p>
            <p className={`text-xl font-bold ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {grupos.map(g => {
          if (!g.items.length) return null
          const c = corMap[g.cor]
          return (
            <details key={g.key} open={g.key !== 'localizados'}>
              <summary className={`cursor-pointer text-sm font-semibold ${c.text} flex items-center gap-2 py-1`}>
                {g.emoji} {g.label}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${c.bg} ml-1`}>{g.items.length}</span>
              </summary>
              <div className="mt-2 space-y-1 pl-5">
                {g.items.map((item, i) => {
                  const isBem = !!item.plaqueta
                  const plq   = isBem ? item.plaqueta : item.plaqueta_lida
                  const desc  = isBem ? item.descricao : (item.bem?.descricao || '—')
                  const loc   = isBem ? item.localizacao : item.localizacao_encontrada
                  const val   = isBem ? item.valor_aquisicao : null
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs text-dim py-1 border-b border-border/30 last:border-0">
                      <span className="font-mono text-primary font-bold w-20 flex-shrink-0">{plq}</span>
                      <span className="flex-1 truncate text-muted">{desc}</span>
                      {loc && <span className="text-muted truncate max-w-[100px]">📍 {loc}</span>}
                      {val != null && <span className="text-muted">{fmtR(val)}</span>}
                    </div>
                  )
                })}
              </div>
            </details>
          )
        })}
      </div>
      <p className="text-[10px] text-muted italic">
        * Baixa e incorporação são sempre decisões manuais — o relatório apenas propõe.
      </p>
    </div>
  )
}

function InventariosTab({ departamentos }) {
  const navigate = useNavigate()
  const [invs, setInvs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [criando, setCriando]     = useState(false)
  const [novoForm, setNovoForm]   = useState({ data: today(), local_area: '', responsavel: '', observacoes: '' })
  const [salvando, setSalvando]   = useState(false)
  const [relatorio, setRelatorio] = useState(null)
  const [invRelId, setInvRelId]   = useState(null)
  const [loadingRel, setLoadingRel] = useState(false)

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
    setRelatorio(null)
    try { const { data } = await api.get(`/imobilizado/inventarios/${inv.id}/relatorio/`); setRelatorio(data) }
    finally { setLoadingRel(false) }
  }

  const finalizar = async inv => {
    if (!window.confirm(`Finalizar inventário de ${fmtDt(inv.data)}?`)) return
    await api.post(`/imobilizado/inventarios/${inv.id}/finalizar/`)
    carregar()
  }

  const STATUS_COR = {
    ABERTO:     { bg: 'bg-teal-500/10', text: 'text-teal-400', label: 'Aberto'     },
    FINALIZADO: { bg: 'bg-bg3',         text: 'text-muted',    label: 'Finalizado' },
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
        <div className="space-y-3">
          {invs.map(inv => {
            const c = STATUS_COR[inv.status] || STATUS_COR.ABERTO
            return (
              <div key={inv.id} className="bg-bg2 border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-dim">{fmtDt(inv.data)}</span>
                      {inv.local_area && <span className="text-xs text-muted">— {inv.local_area}</span>}
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>{c.label}</span>
                    </div>
                    <p className="text-xs text-muted mt-1">
                      {inv.total_itens} leitura{inv.total_itens !== 1 ? 's' : ''}
                      {inv.responsavel && ` · ${inv.responsavel}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {inv.status === 'ABERTO' && (
                      <button onClick={() => navigate(`/imobilizado/${inv.id}/contagem`)}
                        className="text-xs bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition font-medium">
                        📱 Contagem
                      </button>
                    )}
                    <button onClick={() => invRelId === inv.id && relatorio ? (setRelatorio(null), setInvRelId(null)) : verRelatorio(inv)}
                      className="text-xs bg-bg3 border border-border text-dim px-3 py-1.5 rounded-lg hover:border-primary/40 hover:text-primary transition">
                      {invRelId === inv.id && loadingRel ? '…' : '📊 Relatório'}
                    </button>
                    {inv.status === 'ABERTO' && (
                      <button onClick={() => finalizar(inv)}
                        className="text-xs bg-bg3 border border-border text-muted px-3 py-1.5 rounded-lg hover:border-amber-500/40 hover:text-amber-400 transition">
                        Finalizar
                      </button>
                    )}
                  </div>
                </div>
                {invRelId === inv.id && relatorio && (
                  <RelatorioPanel relatorio={relatorio} onClose={() => { setRelatorio(null); setInvRelId(null) }}/>
                )}
              </div>
            )
          })}
        </div>
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
      {aba === 'inventarios' && <InventariosTab departamentos={departamentos}/>}

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
