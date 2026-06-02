import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useEmpresa } from '../contexts/EmpresaContext'

const PAPEIS = {
  admin:        { label: 'Administrador', cor: 'text-primary bg-primary/10 border-primary/30' },
  gerente:      { label: 'Gerente',       cor: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  operacional:  { label: 'Operacional',   cor: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
  visualizador: { label: 'Visualizador',  cor: 'text-muted bg-bg3 border-border' },
}

const MODULOS = [
  { key: 'custos',    label: 'Custos'    },
  { key: 'cartoes',   label: 'Cartões'   },
  { key: 'compras',   label: 'Compras'   },
  { key: 'gerencial', label: 'Gerencial' },
  { key: 'estoque',   label: 'Estoque'   },
]

const FORM_VAZIO = {
  username: '', senha: '',
  papel: 'operacional', modulos_permitidos: [], ativo: true,
}

export default function Usuarios() {
  const { user }                         = useAuth()
  const { minhasEmpresas, empresaAtiva } = useEmpresa()

  const ehAdmin  = user?.papel === 'admin' || user?.is_staff
  const ehSuper  = !!user?.is_staff

  const [usuarios,        setUsuarios]        = useState([])
  const [carregando,      setCarregando]       = useState(true)
  const [busca,           setBusca]            = useState('')
  const [modalAberto,     setModalAberto]      = useState(false)
  const [editando,        setEditando]         = useState(null)
  const [form,            setForm]             = useState(FORM_VAZIO)
  const [empresasSel,     setEmpresasSel]      = useState([])
  const [empresasUsuario, setEmpresasUsuario]  = useState([])
  const [loadingEmps,     setLoadingEmps]      = useState(false)
  const [novaSenha,       setNovaSenha]        = useState('')
  const [erro,            setErro]             = useState('')
  const [salvando,        setSalvando]         = useState(false)
  const [confirmRemover,  setConfirmRemover]   = useState(null) // { usr, empId }
  const [removendo,       setRemovendo]        = useState(false)
  const [copiarDe,        setCopiarDe]         = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      if (ehAdmin) {
        // Admin: lista global de usuários com todas as suas empresas
        const res = await api.get('/empresas/admin/todos-usuarios/')
        setUsuarios(res.data)
      } else {
        // Outros papéis: lista apenas membros da empresa ativa (somente leitura)
        const res = await api.get('/empresas/membros/')
        setUsuarios(res.data.map(m => ({
          id: m.id, username: m.username, email: m.email || '',
          empresas: [{ empresa_id: empresaAtiva?.id, empresa_nome: empresaAtiva?.nome_fantasia || empresaAtiva?.nome, membro_id: m.id, papel: m.papel, ativo: m.ativo }],
        })))
      }
    } catch {
      setErro('Erro ao carregar usuários.')
    } finally {
      setCarregando(false)
    }
  }, [ehAdmin, empresaAtiva])

  useEffect(() => { carregar() }, [carregar])

  function abrirNovoUsuario() {
    setEditando(null)
    setForm(FORM_VAZIO)
    setEmpresasSel(empresaAtiva ? [empresaAtiva.id] : [])
    setEmpresasUsuario([])
    setNovaSenha('')
    setErro('')
    setModalAberto(true)
  }

  async function abrirEditar(usr) {
    // Usa o vínculo da empresa ativa — sem fallback para outra empresa
    const vinculo = usr.empresas?.find(e => e.empresa_id === empresaAtiva?.id)
    setEditando({ ...usr, _membroId: vinculo?.membro_id, _empresaId: vinculo?.empresa_id })
    setForm({
      username:           usr.username,
      senha:              '',
      papel:              vinculo?.papel || 'operacional',
      modulos_permitidos: [],
      ativo:              vinculo?.ativo !== false,
    })
    setNovaSenha('')
    setCopiarDe('')
    setEmpresasUsuario([])
    setErro('')
    setModalAberto(true)
    setLoadingEmps(true)
    try {
      const res = await api.get(`/empresas/admin/usuario-empresas/?username=${usr.username}`)
      setEmpresasUsuario(res.data)
      const vinculoAtual = res.data.find(e => e.empresa_id === empresaAtiva?.id)
      if (vinculoAtual?.modulos_permitidos) {
        setForm(f => ({ ...f, modulos_permitidos: vinculoAtual.modulos_permitidos }))
      }
    } catch { /* sem permissão */ }
    finally { setLoadingEmps(false) }
  }

  function toggleModulo(key) {
    setForm(f => ({
      ...f,
      modulos_permitidos: f.modulos_permitidos.includes(key)
        ? f.modulos_permitidos.filter(m => m !== key)
        : [...f.modulos_permitidos, key],
    }))
  }

  async function salvar() {
    setErro(''); setSalvando(true)
    try {
      if (editando) {
        const payload = { papel: form.papel, modulos_permitidos: form.modulos_permitidos, ativo: form.ativo, username: form.username.trim() }
        if (novaSenha.trim()) payload.senha = novaSenha.trim()

        // Atualiza vínculo na empresa ativa (com X-Empresa-ID correto)
        if (editando._membroId && editando._empresaId) {
          await api.patch(`/empresas/membros/${editando._membroId}/`, payload, {
            headers: { 'X-Empresa-ID': String(editando._empresaId) },
          })
        }

        // Sincroniza vínculos — cada operação usa o X-Empresa-ID da empresa alvo
        for (const emp of empresasUsuario) {
          const estava  = emp.tem_acesso
          const checked = emp._selecionado !== undefined ? emp._selecionado : emp.tem_acesso
          if (!estava && checked) {
            await api.post('/empresas/membros/',
              { username: editando.username, papel: form.papel, modulos_permitidos: form.modulos_permitidos },
              { headers: { 'X-Empresa-ID': String(emp.empresa_id) } })
          } else if (estava && !checked && emp.membro_id) {
            await api.delete(`/empresas/membros/${emp.membro_id}/`,
              { headers: { 'X-Empresa-ID': String(emp.empresa_id) } })
          }
        }
      } else {
        if (!form.username.trim()) { setErro('Nome obrigatório.'); setSalvando(false); return }
        if (!form.senha.trim())    { setErro('Senha obrigatória.'); setSalvando(false); return }
        if (!empresasSel.length)   { setErro('Selecione ao menos uma empresa.'); setSalvando(false); return }
        const payload = { username: form.username.trim(), senha: form.senha, papel: form.papel, modulos_permitidos: form.modulos_permitidos }
        for (const empId of empresasSel) {
          await api.post('/empresas/membros/', payload, { headers: { 'X-Empresa-ID': String(empId) } })
        }
      }
      setModalAberto(false)
      carregar()
    } catch (e) {
      setErro(e.response?.data?.error || 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  function abrirRemover(usr) {
    const empId = usr.empresas?.length === 1
      ? usr.empresas[0].empresa_id
      : empresaAtiva?.id
    setConfirmRemover({ usr, empId: empId || usr.empresas?.[0]?.empresa_id })
  }

  async function confirmarRemover() {
    if (!confirmRemover) return
    const { usr, empId } = confirmRemover
    const vinculo = usr.empresas?.find(e => e.empresa_id === empId)
    if (!vinculo?.membro_id) { setConfirmRemover(null); return }
    setRemovendo(true)
    try {
      await api.delete(`/empresas/membros/${vinculo.membro_id}/`, {
        headers: { 'X-Empresa-ID': String(empId) },
      })
      setConfirmRemover(null)
      carregar()
    } catch { alert('Erro ao remover usuário.') }
    finally { setRemovendo(false) }
  }

  const filtrados = usuarios.filter(u =>
    u.username?.toLowerCase().includes(busca.toLowerCase()) ||
    u.email?.toLowerCase().includes(busca.toLowerCase()) ||
    u.empresas?.some(e => e.empresa_nome?.toLowerCase().includes(busca.toLowerCase()))
  )

  return (
    <div className="p-6 fade-up">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-dim">Usuários & Alçadas</h1>
          <p className="text-xs text-muted mt-0.5">
            {ehAdmin ? 'Todos os usuários do sistema.' : 'Membros da empresa ativa.'}
          </p>
        </div>
        {ehAdmin && (
          <button onClick={abrirNovoUsuario}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-bg text-sm font-semibold hover:opacity-90 transition">
            + Adicionar usuário
          </button>
        )}
      </div>

      {/* Busca */}
      <div className="mb-4">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, e-mail ou empresa..."
          className="w-full bg-bg2 border border-border rounded-lg px-4 py-2.5 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary transition" />
      </div>

      {/* Tabela */}
      <div className="bg-bg2 rounded-xl border border-border overflow-hidden">
        {carregando ? (
          <div className="py-16 text-center text-muted text-sm">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center text-muted text-sm">
            {busca ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] text-muted/80 uppercase tracking-wider">
                <th className="px-5 py-3.5 text-left">Usuário</th>
                <th className="px-5 py-3.5 text-left">Empresas</th>
                <th className="px-5 py-3.5 text-left">Papel atual</th>
                {ehAdmin && <th className="px-5 py-3.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(usr => {
                const vinculoAtual = usr.empresas?.find(e => e.empresa_id === empresaAtiva?.id)
                const papelAtual   = vinculoAtual?.papel
                const papelInfo    = PAPEIS[papelAtual] || PAPEIS.operacional
                return (
                  <tr key={usr.id ?? usr.username} className="border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors">

                    {/* Usuário */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-[11px] font-bold text-primary flex-shrink-0">
                          {usr.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-semibold text-dim text-sm">{usr.username}</p>
                          {usr.email && <p className="text-xs text-muted">{usr.email}</p>}
                        </div>
                      </div>
                    </td>

                    {/* Empresas */}
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {usr.empresas?.map(emp => (
                          <span key={emp.empresa_id}
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border
                              ${emp.empresa_id === empresaAtiva?.id
                                ? 'bg-primary/10 border-primary/30 text-primary'
                                : 'bg-bg3 border-border text-dim'}`}>
                            {emp.empresa_id === empresaAtiva?.id && <span>●</span>}
                            {emp.empresa_nome}
                          </span>
                        ))}
                        {(!usr.empresas || usr.empresas.length === 0) && (
                          <span className="text-[10px] text-muted">—</span>
                        )}
                      </div>
                    </td>

                    {/* Papel na empresa ativa */}
                    <td className="px-5 py-3.5">
                      {papelAtual ? (
                        <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border ${papelInfo.cor}`}>
                          {papelInfo.label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted">—</span>
                      )}
                    </td>

                    {/* Ações */}
                    {ehAdmin && (
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => abrirEditar(usr)}
                          className="text-muted hover:text-primary transition text-xs mr-3">
                          Editar
                        </button>
                        {usr.username !== user?.username && (usr.empresas?.length ?? 0) > 0 && (
                          <button onClick={() => abrirRemover(usr)}
                            className="text-muted hover:text-danger transition text-xs">
                            Remover
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal remover */}
      {confirmRemover && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-bg2 border border-border rounded-xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-sm text-dim mb-1">Remover usuário</h3>
            <p className="text-xs text-muted mb-4">
              Selecione de qual empresa remover <strong className="text-dim">{confirmRemover.usr.username}</strong>.
            </p>
            {confirmRemover.usr.empresas?.length > 1 && (
              <div className="mb-4">
                <label className="block text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5">Empresa</label>
                <select
                  value={confirmRemover.empId}
                  onChange={e => setConfirmRemover(p => ({ ...p, empId: Number(e.target.value) }))}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-dim focus:outline-none focus:border-primary">
                  {confirmRemover.usr.empresas.map(e => (
                    <option key={e.empresa_id} value={e.empresa_id}>{e.empresa_nome}</option>
                  ))}
                </select>
              </div>
            )}
            {confirmRemover.usr.empresas?.length === 1 && (
              <p className="text-xs text-dim mb-4 bg-bg3 border border-border rounded-lg px-3 py-2">
                🏨 {confirmRemover.usr.empresas[0].empresa_nome}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmRemover(null)}
                className="px-3 py-1.5 rounded-lg bg-bg3 border border-border text-xs text-dim hover:bg-bg">
                Cancelar
              </button>
              <button onClick={confirmarRemover} disabled={removendo}
                className="px-3 py-1.5 rounded-lg bg-danger/10 border border-danger/40 text-danger text-xs font-semibold hover:bg-danger/20 disabled:opacity-50">
                {removendo ? 'Removendo...' : 'Confirmar remoção'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal editar/criar */}
      {modalAberto && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm overflow-y-auto"
          onClick={() => setModalAberto(false)}>
          <div className="flex justify-center px-4 py-10 min-h-full">
          <div className="bg-bg2 border border-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col fade-up h-fit"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <div>
                <h2 className="font-bold text-dim text-base">
                  {editando ? `Editar — ${editando.username}` : 'Adicionar usuário'}
                </h2>
                <p className="text-[11px] text-muted mt-0.5">
                  {editando ? 'Altere papel, empresas ou redefina a senha.' : 'Preencha os dados do novo usuário.'}
                </p>
              </div>
              <button onClick={() => setModalAberto(false)}
                className="text-muted hover:text-dim text-2xl leading-none ml-4">×</button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto px-6 py-5 space-y-5">

              {/* Nome */}
              <div>
                <label className="block text-[10px] font-semibold text-muted mb-1.5 uppercase tracking-wide">Nome</label>
                <input type="text" value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="nome.usuario"
                  className="w-full bg-bg3 border border-border rounded-lg px-3 py-2.5 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary transition" />
              </div>

              {/* Copiar permissões de outro usuário */}
              {editando && form.papel === 'operacional' && usuarios.filter(u => u.username !== editando.username).length > 0 && (
                <div>
                  <label className="block text-[10px] font-semibold text-muted mb-1.5 uppercase tracking-wide">
                    Copiar permissões de
                  </label>
                  <select value={copiarDe}
                    onChange={e => {
                      const origem = e.target.value
                      setCopiarDe(origem)
                      if (!origem) return
                      const usr = usuarios.find(u => u.username === origem)
                      if (!usr) return
                      const vinculo = usr.empresas?.find(v => v.empresa_id === empresaAtiva?.id)
                      if (vinculo?.papel) setForm(f => ({ ...f, papel: vinculo.papel }))
                      // busca modulos do usuário de origem
                      api.get(`/empresas/admin/usuario-empresas/?username=${origem}`)
                        .then(res => {
                          const v = res.data.find(e => e.empresa_id === empresaAtiva?.id)
                          if (v) setForm(f => ({ ...f, modulos_permitidos: v.modulos_permitidos || [] }))
                        }).catch(() => {})
                    }}
                    className="w-full bg-bg3 border border-border rounded-lg px-3 py-2.5 text-sm text-dim focus:outline-none focus:border-primary transition">
                    <option value="">— selecione um usuário —</option>
                    {usuarios.filter(u => u.username !== editando.username).map(u => (
                      <option key={u.username} value={u.username}>{u.username}</option>
                    ))}
                  </select>
                  {copiarDe && (
                    <p className="text-[10px] text-primary mt-1">Permissões copiadas de <strong>{copiarDe}</strong> — revise e salve.</p>
                  )}
                </div>
              )}

              {/* Senha (criação) */}
              {!editando && (
                <div>
                  <label className="block text-[10px] font-semibold text-muted mb-1.5 uppercase tracking-wide">Senha</label>
                  <input type="password" value={form.senha}
                    onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full bg-bg3 border border-border rounded-lg px-3 py-2.5 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary transition" />
                </div>
              )}

              {/* Papel */}
              <div>
                <label className="block text-[10px] font-semibold text-muted mb-1.5 uppercase tracking-wide">Papel</label>
                <select value={form.papel}
                  onChange={e => setForm(f => ({ ...f, papel: e.target.value, modulos_permitidos: [] }))}
                  className="w-full bg-bg3 border border-border rounded-lg px-3 py-2.5 text-sm text-dim focus:outline-none focus:border-primary transition">
                  {Object.entries(PAPEIS).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted mt-1">
                  {form.papel === 'admin'        && 'Acesso total. Gerencia usuários e empresas.'}
                  {form.papel === 'gerente'       && 'Visualiza e edita todos os módulos.'}
                  {form.papel === 'operacional'   && 'Acessa apenas os módulos selecionados abaixo.'}
                  {form.papel === 'visualizador'  && 'Somente leitura em todos os módulos.'}
                </p>
              </div>

              {/* Módulos */}
              {form.papel === 'operacional' && (
                <div>
                  <label className="block text-[10px] font-semibold text-muted mb-2 uppercase tracking-wide">
                    Módulos permitidos <span className="normal-case font-normal">(vazio = todos)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {MODULOS.map(mod => (
                      <label key={mod.key} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.modulos_permitidos.includes(mod.key)}
                          onChange={() => toggleModulo(mod.key)} className="accent-primary w-4 h-4" />
                        <span className="text-sm text-dim">{mod.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Empresas */}
              <div>
                <label className="block text-[10px] font-semibold text-muted mb-2 uppercase tracking-wide">
                  Acesso às empresas
                </label>

                {/* Criação */}
                {!editando && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    {minhasEmpresas.map(emp => (
                      <label key={emp.id}
                        className={`flex items-center gap-2.5 cursor-pointer px-3 py-2.5 transition
                          ${empresasSel.includes(emp.id) ? 'bg-primary/5' : 'hover:bg-bg3'}`}>
                        <input type="checkbox" checked={empresasSel.includes(emp.id)}
                          onChange={() => setEmpresasSel(prev =>
                            prev.includes(emp.id) ? prev.filter(e => e !== emp.id) : [...prev, emp.id]
                          )}
                          className="accent-primary w-4 h-4 flex-shrink-0" />
                        <span className={`text-sm flex-1 truncate ${empresasSel.includes(emp.id) ? 'text-primary font-medium' : 'text-dim'}`}>
                          {emp.nome_fantasia || emp.nome}
                        </span>
                        {emp.id === empresaAtiva?.id && (
                          <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">atual</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}

                {/* Edição */}
                {editando && (
                  loadingEmps ? (
                    <p className="text-xs text-muted py-2">Carregando...</p>
                  ) : empresasUsuario.length === 0 ? (
                    <p className="text-xs text-muted py-2">Sem empresas disponíveis.</p>
                  ) : (
                    <div className="rounded-lg border border-border overflow-hidden">
                      {empresasUsuario.map(emp => {
                        const checked = emp._selecionado !== undefined ? emp._selecionado : emp.tem_acesso
                        return (
                          <label key={emp.empresa_id}
                            className={`flex items-center gap-2.5 cursor-pointer px-3 py-2.5 transition
                              ${checked ? 'bg-primary/5' : 'hover:bg-bg3'}`}>
                            <input type="checkbox" checked={checked}
                              onChange={() => setEmpresasUsuario(prev => prev.map(e =>
                                e.empresa_id === emp.empresa_id ? { ...e, _selecionado: !checked } : e
                              ))}
                              className="accent-primary w-4 h-4 flex-shrink-0" />
                            <span className={`text-sm flex-1 truncate ${checked ? 'text-primary font-medium' : 'text-dim'}`}>
                              {emp.empresa_nome}
                            </span>
                            {emp.tem_acesso && emp.papel && (
                              <span className="text-[9px] text-muted bg-bg3 border border-border px-1.5 py-0.5 rounded">
                                {emp.papel}
                              </span>
                            )}
                            {emp.empresa_id === empresaAtiva?.id && (
                              <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">atual</span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  )
                )}
              </div>

              {/* Ativo (edição) */}
              {editando && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.ativo}
                    onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
                    className="accent-primary w-4 h-4" />
                  <span className="text-sm text-dim">Usuário ativo nesta empresa</span>
                </label>
              )}

              {/* Redefinir senha (edição) */}
              {editando && (
                <div className="rounded-xl border border-border bg-bg3 p-4">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-3">Redefinir senha</p>
                  <input type="password" value={novaSenha}
                    onChange={e => setNovaSenha(e.target.value)}
                    placeholder="Nova senha (deixe vazio para não alterar)"
                    className="w-full bg-bg2 border border-border rounded-lg px-3 py-2.5 text-sm text-dim placeholder-muted focus:outline-none focus:border-primary transition" />
                  {novaSenha && <p className="text-[11px] text-muted mt-1.5">Será redefinida ao salvar.</p>}
                </div>
              )}

              {erro && (
                <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{erro}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setModalAberto(false)}
                className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted hover:text-dim transition">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando}
                className="flex-1 py-2.5 rounded-lg bg-primary text-bg text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
                {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Adicionar'}
              </button>
            </div>
          </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
