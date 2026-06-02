import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const ESTADOS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

const FUSOS = ['America/Sao_Paulo','America/Manaus','America/Belem','America/Fortaleza',
  'America/Recife','America/Porto_Velho','America/Boa_Vista','America/Cuiaba',
  'America/Campo_Grande','America/Rio_Branco','America/Noronha']

function inicial(nome) {
  return (nome || '?').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

const EMPTY_FORM = {
  nome:'', nome_fantasia:'', cnpj:'', endereco:'', cidade:'', estado:'SP',
  telefone:'', email:'', total_uhs:0, cor_primaria:'#2dd4a0',
  fuso_horario:'America/Sao_Paulo', moeda:'BRL', ativo:true,
}

function Modal({ show, onClose, title, children }) {
  if (!show) return null
  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-bg2 border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-sm text-dim">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-dim w-6 h-6 flex items-center justify-center rounded hover:bg-bg3 text-lg">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Lbl({ children }) {
  return <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">{children}</label>
}
function Inp({ ...p }) {
  return <input className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-dim focus:outline-none focus:border-primary transition" {...p} />
}
function Sel({ children, ...p }) {
  return <select className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-dim focus:outline-none focus:border-primary transition" {...p}>{children}</select>
}

function EmpresaForm({ form, onChange }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Lbl>Razão Social *</Lbl>
          <Inp value={form.nome} onChange={e => onChange('nome', e.target.value)} placeholder="Nome oficial da empresa" />
        </div>
        <div className="col-span-2">
          <Lbl>Nome Fantasia</Lbl>
          <Inp value={form.nome_fantasia} onChange={e => onChange('nome_fantasia', e.target.value)} placeholder="Como aparece no sistema" />
        </div>
        <div>
          <Lbl>CNPJ *</Lbl>
          <Inp value={form.cnpj} onChange={e => onChange('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
        </div>
        <div>
          <Lbl>Total de UHs</Lbl>
          <Inp type="number" min="0" value={form.total_uhs} onChange={e => onChange('total_uhs', e.target.value)} placeholder="0" />
        </div>
        <div>
          <Lbl>Telefone</Lbl>
          <Inp value={form.telefone} onChange={e => onChange('telefone', e.target.value)} placeholder="(11) 99999-9999" />
        </div>
        <div>
          <Lbl>E-mail</Lbl>
          <Inp type="email" value={form.email} onChange={e => onChange('email', e.target.value)} placeholder="contato@empresa.com" />
        </div>
        <div className="col-span-2">
          <Lbl>Endereço</Lbl>
          <Inp value={form.endereco} onChange={e => onChange('endereco', e.target.value)} placeholder="Rua, número, bairro" />
        </div>
        <div>
          <Lbl>Cidade</Lbl>
          <Inp value={form.cidade} onChange={e => onChange('cidade', e.target.value)} placeholder="São Paulo" />
        </div>
        <div>
          <Lbl>Estado</Lbl>
          <Sel value={form.estado} onChange={e => onChange('estado', e.target.value)}>
            {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </Sel>
        </div>
        <div>
          <Lbl>Fuso Horário</Lbl>
          <Sel value={form.fuso_horario} onChange={e => onChange('fuso_horario', e.target.value)}>
            {FUSOS.map(f => <option key={f} value={f}>{f.replace('America/', '')}</option>)}
          </Sel>
        </div>
        <div>
          <Lbl>Moeda</Lbl>
          <Sel value={form.moeda} onChange={e => onChange('moeda', e.target.value)}>
            <option value="BRL">BRL — Real</option>
            <option value="USD">USD — Dólar</option>
            <option value="EUR">EUR — Euro</option>
          </Sel>
        </div>
        <div>
          <Lbl>Cor Principal</Lbl>
          <div className="flex gap-2 items-center">
            <input type="color" value={form.cor_primaria}
              onChange={e => onChange('cor_primaria', e.target.value)}
              className="w-10 h-9 rounded cursor-pointer border border-border bg-bg p-0.5" />
            <Inp value={form.cor_primaria} onChange={e => onChange('cor_primaria', e.target.value)} placeholder="#2dd4a0" />
          </div>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.ativo}
              onChange={e => onChange('ativo', e.target.checked)}
              className="w-4 h-4 rounded accent-primary" />
            <span className="text-xs text-dim">Empresa ativa</span>
          </label>
        </div>
      </div>
    </div>
  )
}

export default function Empresas() {
  const [empresas, setEmpresas]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [erro, setErro]           = useState('')
  const [busca, setBusca]         = useState('')
  const [modal, setModal]         = useState(null) // null | 'criar' | {empresa}
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [formErro, setFormErro]   = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/empresas/admin/')
      setEmpresas(res.data)
    } catch {
      setErro('Sem permissão ou erro ao carregar empresas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function abrirCriar() {
    setForm(EMPTY_FORM); setFormErro(''); setModal('criar')
  }
  function abrirEditar(emp) {
    setForm({ ...EMPTY_FORM, ...emp }); setFormErro(''); setModal(emp)
  }
  function upd(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function salvar() {
    setFormErro(''); setSaving(true)
    try {
      if (modal === 'criar') {
        const res = await api.post('/empresas/admin/', form)
        setEmpresas(p => [res.data, ...p])
      } else {
        const res = await api.patch(`/empresas/admin/${modal.id}/`, form)
        setEmpresas(p => p.map(e => e.id === res.data.id ? res.data : e))
      }
      setModal(null)
    } catch (err) {
      setFormErro(err.response?.data?.error || 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function desativar(emp) {
    try {
      await api.delete(`/empresas/admin/${emp.id}/`)
      setEmpresas(p => p.map(e => e.id === emp.id ? { ...e, ativo: false } : e))
    } catch {
      alert('Erro ao desativar empresa.')
    }
    setConfirmDel(null)
  }

  async function reativar(emp) {
    try {
      const res = await api.patch(`/empresas/admin/${emp.id}/`, { ativo: true })
      setEmpresas(p => p.map(e => e.id === emp.id ? res.data : e))
    } catch {
      alert('Erro ao reativar empresa.')
    }
  }

  const filtradas = empresas.filter(e =>
    [e.nome, e.nome_fantasia, e.cnpj, e.cidade].some(v =>
      v?.toLowerCase().includes(busca.toLowerCase())
    )
  )

  const ativas   = filtradas.filter(e => e.ativo)
  const inativas = filtradas.filter(e => !e.ativo)

  if (loading) return (
    <div className="flex items-center justify-center h-full text-muted text-sm">Carregando...</div>
  )
  if (erro) return (
    <div className="flex items-center justify-center h-full text-danger text-sm">{erro}</div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-dim">Empresas</h1>
          <p className="text-xs text-muted mt-0.5">{ativas.length} ativa{ativas.length !== 1 ? 's' : ''} · {inativas.length} inativa{inativas.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={abrirCriar}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-bg text-xs font-bold hover:opacity-90 transition"
        >
          + Nova Empresa
        </button>
      </div>

      {/* Busca */}
      <div className="mb-4">
        <input
          value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, CNPJ ou cidade..."
          className="w-full bg-bg2 border border-border rounded-lg px-4 py-2.5 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary transition"
        />
      </div>

      {/* Grid de empresas ativas */}
      {ativas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {ativas.map(emp => <EmpresaCard key={emp.id} emp={emp} onEdit={abrirEditar} onToggle={() => setConfirmDel(emp)} />)}
        </div>
      )}

      {/* Inativas */}
      {inativas.length > 0 && (
        <>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3">Inativas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-50">
            {inativas.map(emp => <EmpresaCard key={emp.id} emp={emp} onEdit={abrirEditar} onToggle={() => reativar(emp)} inativa />)}
          </div>
        </>
      )}

      {filtradas.length === 0 && (
        <div className="text-center py-16 text-muted text-sm">
          {busca ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa cadastrada ainda.'}
        </div>
      )}

      {/* Modal criar/editar */}
      <Modal
        show={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'criar' ? '+ Nova Empresa' : `Editar — ${modal?.nome_fantasia || modal?.nome || ''}`}
      >
        <EmpresaForm form={form} onChange={upd} />
        {formErro && (
          <div className="mt-3 text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
            {formErro}
          </div>
        )}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setModal(null)}
            className="px-4 py-2 rounded-lg bg-bg3 border border-border text-xs text-dim hover:bg-bg">
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-bg text-xs font-bold hover:opacity-90 disabled:opacity-50">
            {saving ? 'Salvando...' : modal === 'criar' ? 'Criar Empresa' : 'Salvar Alterações'}
          </button>
        </div>
      </Modal>

      {/* Confirm desativar */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-bg2 border border-border rounded-xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-sm text-dim mb-2">Desativar empresa?</h3>
            <p className="text-xs text-muted mb-4">
              <strong className="text-dim">{confirmDel.nome_fantasia || confirmDel.nome}</strong> será
              desativada. Os dados permanecem no banco e pode ser reativada a qualquer momento.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDel(null)}
                className="px-3 py-1.5 rounded-lg bg-bg3 border border-border text-xs text-dim hover:bg-bg">
                Cancelar
              </button>
              <button onClick={() => desativar(confirmDel)}
                className="px-3 py-1.5 rounded-lg bg-danger/10 border border-danger/40 text-danger text-xs font-semibold hover:bg-danger/20">
                Desativar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmpresaCard({ emp, onEdit, onToggle, inativa }) {
  const nome = emp.nome_fantasia || emp.nome
  const cor  = emp.cor_primaria || '#2dd4a0'
  const ini  = inicial(nome)

  return (
    <div className="bg-bg2 border border-border rounded-xl overflow-hidden hover:border-border/80 transition-all group">
      <div className="h-1" style={{ background: inativa ? '#555' : cor }} />
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: cor + '22', border: `1.5px solid ${cor}44`, color: inativa ? '#777' : cor }}>
            {ini}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-xs text-dim truncate">{nome}</p>
            {emp.nome_fantasia && <p className="text-[10px] text-muted truncate">{emp.nome}</p>}
            <p className="text-[10px] text-muted font-mono mt-0.5">{emp.cnpj}</p>
          </div>
        </div>

        <div className="space-y-1 mb-4">
          {(emp.cidade || emp.estado) && (
            <p className="text-[11px] text-muted">📍 {[emp.cidade, emp.estado].filter(Boolean).join(', ')}</p>
          )}
          {emp.total_uhs > 0 && (
            <p className="text-[11px] text-muted">🛏 {emp.total_uhs} UHs</p>
          )}
          <p className="text-[11px] text-muted">👥 {emp.total_membros || 0} membro{emp.total_membros !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex gap-2">
          <button onClick={() => onEdit(emp)}
            className="flex-1 py-1.5 rounded-lg bg-bg3 border border-border text-[11px] text-dim hover:bg-bg hover:text-primary transition">
            Editar
          </button>
          <button onClick={onToggle}
            className={`flex-1 py-1.5 rounded-lg border text-[11px] font-medium transition
              ${inativa
                ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                : 'bg-danger/8 border-danger/30 text-danger hover:bg-danger/15'}`}>
            {inativa ? 'Reativar' : 'Desativar'}
          </button>
        </div>
      </div>
    </div>
  )
}
