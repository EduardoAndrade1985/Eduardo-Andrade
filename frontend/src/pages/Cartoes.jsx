import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import api from '../services/api'
import { useEmpresa } from '../contexts/EmpresaContext'

// ─── Constants ────────────────────────────────────────────────────────────────
const RT = 0.10
const PS = 50
const lsKey = (empId) => `cc-cards-info-${empId || 'default'}`

const BAND_MAP = {
  'visanet':'visa','visanet pa':'visa','visa elect':'visa','cielo visa':'visa',
  'master':'mastercard','master pa':'mastercard','master 12x':'mastercard','maestro':'mastercard',
  'elo credit':'elo','elo debito':'elo','elo parcel':'elo','elo':'elo',
  'amex':'amex','amex pa':'amex','american':'amex',
  'diners':'diners','diners pa':'diners',
  'rede visa':'visa','rede v cre':'visa','rede parc':'visa','rede pa 6+':'visa',
  'rede cred':'mastercard','rede pa 6x':'mastercard','redecar pa':'mastercard','rede debit':'mastercard',
  'rede elo c':'elo','rede elo p':'elo','rede elo 6+':'elo','red elo de':'elo',
  'rede-amex':'amex','redeamexpa':'amex','redeamex6':'amex',
  'rede h c':'hipercard','rede hip par':'hipercard',
  'rede din c':'diners','rede din p':'diners',
}

// ─── Pure utilities ───────────────────────────────────────────────────────────
function cur(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDt(d) {
  if (!d) return ''
  if (d.includes('-')) { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }
  return d
}
function normDate(v) {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString().substring(0, 10)
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) { const p = s.split('/'); return `${p[2]}-${p[1]}-${p[0]}` }
  const n = Number(s)
  if (!isNaN(n) && n > 40000 && n < 60000) return new Date((n - 25569) * 86400000).toISOString().substring(0, 10)
  if (/^\d{4}/.test(s) && s.length >= 10) return s.substring(0, 10)
  return s
}
function normBand(inst) {
  if (!inst) return ''
  return BAND_MAP[inst.toLowerCase().trim()] || inst.toLowerCase().trim()
}
function normOpBand(b) {
  if (!b) return ''
  const k = b.toLowerCase().trim()
  if (k === 'american express') return 'amex'
  if (k.startsWith('elo')) return 'elo'
  if (k === 'visa electron') return 'visa'
  return k
}
function normColName(s) {
  return String(s).toLowerCase()
    .replace(/[àáâãä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/ç/g, 'c').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]/g, '')
}
function findColKey(keys, ...patterns) {
  for (const pat of patterns) {
    const k = keys.find(k => normColName(k).includes(pat))
    if (k !== undefined) return k
  }
  return null
}
function findColIdx(headers, ...patterns) {
  for (const pat of patterns) {
    const i = headers.findIndex(h => normColName(h).includes(pat))
    if (i !== -1) return i
  }
  return null
}
function cst(r) {
  if (r.ajuste) return r.ajuste.stResult || 'ajustado'
  if (r.st === 'agrupado') return 'agrupado'
  if (r.vs === 0 && r.vo > 0) return 'somente_op'
  if (r.vb === false || r.vn === false || r.va === false) return 'divergente'
  if (Math.abs(r.df) === 0) return 'conciliado'
  if (Math.abs(r.df) <= RT) return 'arredondavel'
  return 'divergente'
}
function isParcelas(entries) {
  if (entries.length <= 1) return false
  const parcs = entries.map(e => e.p).sort((a, b) => a - b)
  return parcs[0] >= 1 && parcs[parcs.length - 1] === entries.length && new Set(parcs).size === entries.length
}
function todayISO() { return new Date().toISOString().split('T')[0] }
function nId() { return Math.random().toString(36).slice(2, 9) }

// ─── Sub-components ───────────────────────────────────────────────────────────
function Pill({ status }) {
  const map = {
    conciliado:   'bg-primary/10 text-primary border-primary/25 ✓ OK',
    arredondado:  'bg-cyan-500/10 text-cyan-400 border-cyan-500/25 ↻ Arr',
    divergente:   'bg-danger/10 text-danger border-danger/25 ✕ Div',
    arredondavel: 'bg-danger/10 text-danger border-danger/25 ✕ Arr',
    ajustado:     'bg-warn/10 text-warn border-warn/25 ⚡ Aj',
    somente_op:   'bg-purple-500/10 text-purple-400 border-purple-500/25 ◎ S/Op',
  }
  const entry = map[status] || `bg-bg3 text-muted border-border ${status}`
  const parts = entry.split(' ')
  const cls = parts.slice(0, 3).join(' ')
  const label = parts.slice(3).join(' ')
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold font-sans border ${cls}`}>
      {label}
    </span>
  )
}

function StatCard({ label, value, sub, bar }) {
  return (
    <div className="bg-bg2 border border-border rounded-xl p-4 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${bar}`} />
      <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="font-mono text-xl font-bold text-dim">{value}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

function UpCard({ label, icon, loaded, info, onClick }) {
  return (
    <div onClick={onClick}
      className={`relative border-2 rounded-xl p-3 text-center cursor-pointer transition-all group select-none
        ${loaded
          ? 'border-primary/60 border-solid bg-primary/5 hover:bg-primary/10'
          : 'border-border border-dashed bg-bg2 hover:border-primary/40 hover:bg-primary/5'}`}>
      {loaded && (
        <span className="absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">✓</span>
      )}
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-[11px] font-bold text-dim">{label}</div>
      <div className="text-[9px] text-muted">.xlsx .csv</div>
      {info && <div className="text-[9px] text-primary mt-1 font-mono truncate max-w-full">{info}</div>}
    </div>
  )
}

function Modal({ show, onClose, title, width = 'max-w-md', children }) {
  if (!show) return null
  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`bg-bg2 border border-border rounded-xl p-5 w-full ${width} max-h-[90vh] overflow-y-auto shadow-2xl`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm text-dim">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-dim w-6 h-6 flex items-center justify-center rounded hover:bg-bg3">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Confirm({ show, title, body, okText, okClass, onOk, onCancel }) {
  if (!show) return null
  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-bg2 border border-border rounded-xl p-5 w-full max-w-sm shadow-2xl">
        <h3 className="font-bold text-sm text-dim mb-3">{title}</h3>
        <div className="text-xs text-muted leading-relaxed mb-4" dangerouslySetInnerHTML={{ __html: body }} />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-bg3 border border-border text-xs text-dim hover:bg-bg">Cancelar</button>
          <button onClick={onOk} className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${okClass || 'bg-primary'}`}>{okText}</button>
        </div>
      </div>
    </div>
  )
}

function Toasts({ list }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {list.map(t => (
        <div key={t.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-semibold shadow-lg
          ${t.type === 'ok' ? 'bg-primary/10 border-primary/30 text-primary'
          : t.type === 'er' ? 'bg-danger/10 border-danger/30 text-danger'
          : 'bg-bg2 border-border text-dim'}`}>
          {t.type === 'ok' ? '✓' : t.type === 'er' ? '✕' : 'ℹ'} {t.msg}
        </div>
      ))}
    </div>
  )
}

function Lbl({ children }) {
  return <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mt-3 mb-1">{children}</label>
}
function Inp({ ...p }) {
  return <input className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-dim font-mono focus:outline-none focus:border-primary" {...p} />
}
function Sel({ children, ...p }) {
  return <select className="w-full bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-dim focus:outline-none focus:border-primary" {...p}>{children}</select>
}
function Btn({ children, onClick, variant = 'default', className = '', ...p }) {
  const base = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all'
  const v = {
    default: 'bg-bg3 border-border text-dim hover:bg-bg hover:text-primary',
    primary: 'bg-primary text-bg border-primary hover:opacity-90',
    green:   'bg-primary text-bg border-primary hover:opacity-90',
    danger:  'bg-danger/10 border-danger/40 text-danger hover:bg-danger/20',
    warn:    'bg-warn/10 border-warn/40 text-warn hover:bg-warn/20',
    ghost:   'bg-transparent border-border text-muted hover:text-dim hover:bg-bg3',
  }
  return <button onClick={onClick} className={`${base} ${v[variant] || v.default} ${className}`} {...p}>{children}</button>
}

// ─── Conversões DB ↔ frontend ────────────────────────────────────────────────
function dbToFrontend(r) {
  return {
    i: r.id, id: r.id,
    o: r.operadora, d: r.data, h: r.hora || '',
    a: r.autorizacao, n: r.nsu || '', b: r.bandeira || '',
    m: r.modalidade || '', c: r.num_cartao || '',
    vo: parseFloat(r.valor_operadora) || 0,
    tx: parseFloat(r.taxa) || 0,
    vl: parseFloat(r.valor_liquido) || 0,
    p: r.parcelas || 0, sv: r.status_venda || '',
    vs: parseFloat(r.valor_sistema) || 0,
    df: parseFloat(r.diferenca) || 0,
    nOp: r.qtd_operadora || 1, nSis: r.qtd_sistema || 0,
    ag: r.agrupamento || '', mt: r.tipo_match || '',
    gt: r.tipo_grupo || '',
    stP: parseFloat(r.soma_positivos) || 0,
    stN: parseFloat(r.soma_negativos) || 0,
    sd: r.num_controle || '', sn: r.num_doc_sis || '',
    bi: r.bandeira_sistema || '', hp: r.hospede || '',
    usr: r.usuario_sistema || '', si: r.info_sistema || '',
    va: r.valida_auth !== false, vn: r.valida_nsu !== false, vb: r.valida_bandeira !== false,
    st: r.status || 'pendente', locked: !!r.locked,
    ajuste: r.ajuste || null,
  }
}

function dbSisToRaw(r) {
  // Converte registro do banco de volta ao formato raw que o runRecon espera
  return {
    'Cod_Autorizacao_Cartao': r.cod_autorizacao,
    'Valor_Pago': parseFloat(r.valor_pago) || 0,
    'Num_Parcela': r.num_parcela || 0,
    'Num_Doc_Pagto': r.num_doc || '',
    'Seq_NF': r.seq_nf || '',
    'Obs': r.obs || '',
    'Hospede': r.hospede || '',
    'Inst_Pagto': r.inst_pagto || '',
    'Codinome': r.codinome || '',
    'Data': r.data || '',
    'Status': '', // nunca cancelado (já filtrado no import)
  }
}

// ─── Reconciliation engine (pure) ────────────────────────────────────────────
function runRecon(D_in, SR) {
  const D = D_in.map(r => ({ ...r, ajuste: r.ajuste ? { ...r.ajuste } : null }))

  const sisAuth = {}
  for (const r of SR) {
    const a = String(r['Cod_Autorizacao_Cartao'] || '').trim()
    const v = parseFloat(r['Valor_Pago'] || 0)
    if (!a) continue
    const k = (a.replace(/^0+/, '') || '0').toLowerCase()
    if (!sisAuth[k]) sisAuth[k] = []
    sisAuth[k].push({
      v, p: parseFloat(r['Num_Parcela'] || 0),
      doc: String(r['Num_Doc_Pagto'] || '').trim(),
      seq: String(r['Seq_NF'] || '').trim(),
      obs: String(r['Obs'] || '').substring(0, 80),
      hp:  String(r['Hospede'] || ''),
      inst: String(r['Inst_Pagto'] || ''),
      usr: String(r['Codinome'] || '').trim(),
    })
  }

  for (const r of D) {
    if (r.ajuste) continue
    if (r.b && r.b.toLowerCase() === 'pix') { r.st = 'pix_ignorado'; continue }

    const opAuth = (r.a.replace(/^0+/, '') || '0').toLowerCase()
    const hasAuth = r.a && r.a !== 'nan' && r.a !== ''
    let sisEntries = hasAuth ? sisAuth[opAuth] : null
    let mt = hasAuth ? 'auth' : ''

    if (!sisEntries && hasAuth) {
      const pk = (r.a.padStart(6, '0').replace(/^0+/, '') || '0').toLowerCase()
      sisEntries = sisAuth[pk]; if (sisEntries) mt = 'auth_pad'
    }
    if (!sisEntries && r.n) {
      const nsuNorm = r.n.replace(/^0+/, '') || '0'
      for (const [, entries] of Object.entries(sisAuth)) {
        for (const e of entries) {
          const dn = (e.doc || '').replace(/^0+/, '') || '0'
          if (dn === nsuNorm && Math.abs(e.v - r.vo) <= RT) { sisEntries = [e]; mt = 'nsu_fallback'; break }
        }
        if (sisEntries) break
      }
    }

    if (!sisEntries) {
      Object.assign(r, { vs:0, df:r.vo, nSis:0, mt:'sem_match', ag:'', gt:'', stP:0, stN:0, si:'', hp:'', sd:'', sn:'', bi:'', usr:'', vb:false, vn:false, va:false })
      r.st = cst(r); continue
    }

    const all = sisEntries
    const matchedVal = Math.round(all.reduce((s, e) => s + e.v, 0) * 100) / 100
    const hasP = isParcelas(all)
    const hasE = all.some(e => e.v < 0)
    const gType = hasP ? 'parcela' : hasE ? 'estorno' : all.length > 1 ? 'multiplo' : 'simples'
    const matchedInst = all[0]?.inst || ''

    const chkBand = normBand(matchedInst) && normOpBand(r.b) ? normBand(matchedInst) === normOpBand(r.b) : true
    const matchedDoc = all.map(e => e.doc).filter(Boolean).join(',')
    const chkNsu = matchedDoc && r.n
      ? matchedDoc.split(',').some(d => (d.replace(/^0+/, '') || '0') === (r.n.replace(/^0+/, '') || '0'))
      : !r.n

    Object.assign(r, {
      vs: matchedVal,
      df: Math.round((r.vo - matchedVal) * 100) / 100,
      nSis: all.length, mt, gt: gType,
      ag: all.length > 1 ? `${all.length}x sis (${gType})` : '',
      stP: Math.round(all.filter(e => e.v > 0).reduce((s, e) => s + e.v, 0) * 100) / 100,
      stN: Math.round(all.filter(e => e.v < 0).reduce((s, e) => s + e.v, 0) * 100) / 100,
      si: all.find(e => e.obs)?.obs || '',
      hp: all.find(e => e.hp && e.hp !== 'Nao Informado')?.hp || all[0]?.hp || '',
      sd: all.map(e => e.seq).filter(Boolean).join(','),
      sn: matchedDoc,
      bi: matchedInst,
      usr: all[0]?.usr || '',
      vb: chkBand, vn: chkNsu, va: mt !== 'nsu_fallback',
    })
    r.st = cst(r)
  }
  return D
}

function buildDS(D, SR) {
  const opAuth = {}
  for (const r of D) {
    if (r.st === 'agrupado' || r.st === 'pix_ignorado') continue
    const k = (r.a.replace(/^0+/, '') || '0').toLowerCase()
    if (!opAuth[k]) opAuth[k] = []
    opAuth[k].push(r)
  }
  const sisGrouped = {}
  for (const r of SR) {
    const a = String(r['Cod_Autorizacao_Cartao'] || '').trim()
    if (!a) continue
    const inst = String(r['Inst_Pagto'] || '')
    const bandSis = normBand(inst)
    if (bandSis === 'pix' || a.toLowerCase() === 'nan') continue
    const k = (a.replace(/^0+/, '') || '0').toLowerCase()
    if (!sisGrouped[k]) sisGrouped[k] = { entries: [], a, inst, bandSis }
    sisGrouped[k].entries.push({
      v: parseFloat(r['Valor_Pago'] || 0),
      d: normDate(r['Data']),
      doc: String(r['Num_Doc_Pagto'] || '').trim(),
      seq: String(r['Seq_NF'] || '').trim(),
      usr: String(r['Codinome'] || '').trim(),
      hp: String(r['Hospede'] || ''),
      obs: String(r['Obs'] || '').substring(0, 80),
      p: parseFloat(r['Num_Parcela'] || 0),
    })
  }
  const DS = []
  let dsId = 0
  for (const [k, grp] of Object.entries(sisGrouped)) {
    const all = grp.entries
    const totalVal = Math.round(all.reduce((s, e) => s + e.v, 0) * 100) / 100
    const hasP = isParcelas(all); const hasE = all.some(e => e.v < 0)
    const gType = hasP ? 'parcela' : hasE ? 'estorno' : all.length > 1 ? 'multiplo' : 'simples'
    const first = all[0]
    const docs = [...new Set(all.map(e => e.doc).filter(Boolean))]
    const seqs = [...new Set(all.map(e => e.seq).filter(Boolean))]
    let opMatch = opAuth[k]; let mt2 = opMatch ? 'auth' : ''
    if (!opMatch) {
      const pk = (grp.a.padStart(6, '0').replace(/^0+/, '') || '0').toLowerCase()
      opMatch = opAuth[pk]; if (opMatch) mt2 = 'auth_pad'
    }
    if (!opMatch && docs.length) {
      const docNorm = (docs[0] || '').replace(/^0+/, '') || '0'
      for (const entries2 of Object.values(opAuth)) {
        for (const e2 of entries2) {
          if (((e2.n || '').replace(/^0+/, '') || '0') === docNorm && Math.abs(e2.vo - totalVal) <= RT) {
            opMatch = [e2]; mt2 = 'nsu_fallback'; break
          }
        }
        if (opMatch) break
      }
    }
    const opVal = opMatch ? Math.round(opMatch.reduce((s, e) => s + e.vo, 0) * 100) / 100 : 0
    const rec = {
      i: dsId++, o: grp.inst, d: first.d, h: '', a: grp.a,
      n: docs.join(','), b: grp.bandSis, m: '', c: opMatch?.[0]?.c || '',
      vo: totalVal, vs: opVal, nOp: opMatch?.length || 0, nSis: all.length,
      sd: seqs.join(','), sn: docs.join(','), bi: grp.inst, usr: first.usr,
      hp: first.hp !== 'Nao Informado' ? first.hp : '', si: first.obs,
      tx: 0, vl: 0, p: 0, sv: 'Sistema',
      mt: mt2 || 'sem_match', gt: gType,
      ag: all.length > 1 ? `${all.length}x sis (${gType})` : '',
      stP: Math.round(all.filter(e => e.v > 0).reduce((s, e) => s + e.v, 0) * 100) / 100,
      stN: Math.round(all.filter(e => e.v < 0).reduce((s, e) => s + e.v, 0) * 100) / 100,
      va: mt2 !== '' && mt2 !== 'nsu_fallback',
      vn: opMatch ? opMatch.some(e => docs.some(d => (d.replace(/^0+/,'') || '0') === ((e.n||'').replace(/^0+/,'') || '0'))) : false,
      vb: opMatch ? normOpBand(opMatch[0].b) === grp.bandSis : false,
      ajuste: null, st: 'pendente', locked: false,
    }
    rec.df = Math.round((rec.vo - rec.vs) * 100) / 100
    if (!opMatch) rec.st = 'somente_op'
    else if (!rec.va || !rec.vn || !rec.vb) rec.st = 'divergente'
    else if (Math.abs(rec.df) === 0) rec.st = 'conciliado'
    else if (Math.abs(rec.df) <= RT) rec.st = 'arredondavel'
    else rec.st = 'divergente'
    DS.push(rec)
  }
  return DS
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Cartoes() {
  const { empresaAtiva } = useEmpresa()

  // ── State ──
  const [D, setD]           = useState([])
  const [DS, setDS]         = useState([])
  const [SR, setSR]         = useState([])
  const [AL, setAL]         = useState([])
  const [cards, setCards]   = useState({ sistema: null, cielo: null, rede: null })
  const [customOps, setCO]  = useState([])
  const [viewMode, setVM]   = useState('op2sis')
  const [lockedUntil, setLU]= useState('')
  const [savedPeriods, setSP] = useState([])
  const [undoStack, setUndo] = useState([])
  const [toasts, setToasts] = useState([])
  const [ctab, setCtab]     = useState('all')
  const [page, setPage]     = useState(1)
  const [sort, setSort]     = useState({ k: 'd', a: true })
  const [grpMode, setGrpMode]= useState(false)
  const [grpSel, setGrpSel] = useState(new Set())
  const [filters, setFilters] = useState({ op:'', bd:'', st:'', di:'', df:'', q:'' })
  const [modals, setModals] = useState({})  // { id: data }
  const [confirm, setConfirm] = useState(null)
  const [lastRecon, setLastRecon] = useState('')
  const [empresaCfg, setEmpresa] = useState({ nome:'Tower Anhanguera', cnpj:'43.731.587/0004-64', desc:'Conferência diária' })

  const fileRefs = useRef({})

  const [loading, setLoading] = useState(false)

  // ── Carrega dados do banco na montagem ──
  useEffect(() => {
    async function loadFromAPI() {
      setLoading(true)
      try {
        const [rT, rS, rP, rL] = await Promise.all([
          api.get('/cartoes/transacoes/'),
          api.get('/cartoes/sistema/'),
          api.get('/cartoes/periodos/'),
          api.get('/cartoes/log/'),
        ])

        // Transações de operadoras
        const transacoes = rT.data.map(dbToFrontend)
        setD(transacoes)

        // Registros do Sistema (ERP) convertidos de volta ao formato raw
        const sisRaw = rS.data.map(dbSisToRaw)
        setSR(sisRaw)

        // Períodos conciliados
        const periodos = rP.data
        setSP(periodos)
        if (periodos.length > 0) {
          const maxDt = periodos.reduce((m, p) => p.data_ate > m ? p.data_ate : m, '')
          setLU(maxDt)
          // Garante locked flag nos registros carregados
          if (maxDt) setD(p => p.map(r => ({ ...r, locked: r.locked || (r.d && r.d <= maxDt) })))
        }

        // Log de auditoria
        setAL(rL.data.map(l => ({ id: l.id || nId(), t: l.criado_em?.substring(11,16) || '', ic: l.icone, d: l.descricao })))

        // Info dos cards — localStorage tem prioridade; se não tiver, usa contagem do banco
        try {
          const ci = JSON.parse(localStorage.getItem(lsKey(empresaAtiva?.id)) || '{}')
          const opsCount = {}
          transacoes.forEach(r => { if (r.o) opsCount[r.o] = (opsCount[r.o] || 0) + 1 })
          const merged = { ...ci }
          if (rS.data.length) merged.sistema = `${rS.data.length} reg (banco)`
          Object.entries(opsCount).forEach(([op, cnt]) => {
            merged[op] = `${cnt} reg (banco)`
          })
          setCards(merged)
        } catch {}
      } catch (err) {
        console.warn('Erro ao carregar dados da API:', err)
        // Mostra toast de erro para o usuário saber que os dados não carregaram
        const msg = err?.response?.status
          ? `Erro ${err.response.status} ao carregar dados do servidor`
          : 'Sem conexão com o servidor — importe as planilhas para continuar'
        setToasts(p => [...p, { id: nId(), msg, type: 'er' }])
        setTimeout(() => setToasts(p => p.slice(1)), 5000)
      } finally {
        setLoading(false)
      }
    }
    loadFromAPI()
  }, []) // eslint-disable-line

  // Persiste info dos cards (só nome do arquivo) no localStorage — chave por empresa
  const saveCardInfo = useCallback((newCards) => {
    try { localStorage.setItem(lsKey(empresaAtiva?.id), JSON.stringify(newCards)) } catch {}
  }, [empresaAtiva?.id])

  // ── Toast ──
  const toast = useCallback((msg, type = 'in') => {
    const id = nId()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3200)
  }, [])

  // ── Audit log ──
  const lg = useCallback((ic, desc) => {
    const tm = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    setAL(p => [{ id: nId(), t: tm, ic, d: desc }, ...p].slice(0, 200))
    api.post('/cartoes/log/', [{ ic, d: desc }]).catch(() => {})
  }, [])

  // ── Undo ──
  const pushUndo = useCallback((label) => {
    setUndo(p => [...p.slice(-19), { label, D: JSON.parse(JSON.stringify(D)), DS: JSON.parse(JSON.stringify(DS)) }])
  }, [D, DS])

  const undo = useCallback(() => {
    if (!undoStack.length) { toast('Nada para desfazer', 'in'); return }
    const last = undoStack[undoStack.length - 1]
    setD(last.D); setDS(last.DS)
    setUndo(p => p.slice(0, -1))
    toast(`Desfeito: ${last.label}`, 'in')
    lg('↩', `Desfeito: ${last.label}`)
  }, [undoStack, toast, lg])

  // ── Locked check ──
  const isLocked = useCallback((r) => r.locked || (lockedUntil && r.d && r.d <= lockedUntil), [lockedUntil])

  // ── Active dataset ──
  const activeD = viewMode === 'sis2op' ? DS : D

  // ── File import ──
  const procSis = useCallback(async (js, fname) => {
    const fl = js.filter(r => String(r['Status'] || '') !== 'C')
    setSR(fl)
    const newCards = { ...cards, sistema: `${fname} • ${fl.length} reg` }
    setCards(newCards); saveCardInfo(newCards)
    lg('🖥️', `Sistema: <strong>${fname}</strong> — ${fl.length} reg`)
    toast(`Sistema: ${fl.length} registros`, 'ok')
    // Salva no banco (substitui todos os registros do ERP da empresa)
    try {
      await api.post('/cartoes/sistema/importar/', { registros: fl, arquivo: fname })
    } catch (err) {
      toast('Aviso: não foi possível salvar Sistema no banco', 'er')
      console.error(err)
    }
  }, [lg, toast, cards, saveCardInfo])

  const procOp = useCallback(async (src, fname, wb) => {
    const ws = wb.Sheets[wb.SheetNames[0]]
    const nw = []

    if (src === 'cielo') {
      // Detect header row: find first row containing both 'autorizac' and 'valor'
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 })
      let headerIdx = rawRows.findIndex(row =>
        (row || []).some(c => normColName(c).includes('autorizac')) &&
        (row || []).some(c => normColName(c).includes('valorbrut'))
      )
      if (headerIdx === -1) headerIdx = 9  // fallback para formato padrão Cielo

      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerIdx })
      const keys = rows.length ? Object.keys(rows[0]) : []
      const authK = findColKey(keys, 'autorizac')
      const valK  = findColKey(keys, 'valorbrut', 'valorbruto')
      const dtK   = findColKey(keys, 'data')
      const stK   = findColKey(keys, 'statusvenda', 'status')
      const bandK = findColKey(keys, 'bandeira')
      const horaK = findColKey(keys, 'horavenda', 'hora')
      const nsuK  = findColKey(keys, 'nsudoc', 'nsu')
      const pagK  = findColKey(keys, 'pagamento', 'formapag')
      const taxaK = findColKey(keys, 'taxatarifa', 'taxa')
      const vliqK = findColKey(keys, 'valorliquid', 'valliquid')
      const parcK = findColKey(keys, 'parcel')
      const cartK = findColKey(keys, 'numerodocartao', 'cartao')
      for (const r of rows) {
        const auth = String(r[authK] || '').trim()
        const val  = parseFloat(r[valK]) || 0
        const st   = String(r[stK] || '')
        const band = String(r[bandK] || '')
        if (!auth || auth === 'nan' || val === 0 || st.toLowerCase().includes('cancel')) continue
        if (band.toLowerCase() === 'pix') continue
        nw.push({ o:'cielo', d:normDate(r[dtK]), h:String(r[horaK]||''), a:auth,
          n:String(r[nsuK]||'').trim(), b:band, m:String(r[pagK]||''),
          vo:val, tx:parseFloat(r[taxaK])||0, vl:parseFloat(r[vliqK])||0,
          p:parseInt(r[parcK])||0, c:String(r[cartK]||''),
          sv:st, vs:0, df:val, nOp:1, nSis:0, ag:'', mt:'', gt:'', stP:0, stN:0,
          si:'', hp:'', sd:'', sn:'', bi:'', usr:'', vb:true, vn:true, va:true, ajuste:null, st:'pendente', locked:false })
      }
    } else if (src === 'rede') {
      const allRows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 })
      let headerIdx = allRows.findIndex(row =>
        (row || []).some(c => normColName(c).includes('autorizac') || normColName(c).includes('bandeira'))
      )
      if (headerIdx === -1) headerIdx = 1
      const headers = (allRows[headerIdx] || []).map(String)
      // Map header names to column indexes
      const iData  = findColIdx(headers, 'data') ?? 0
      const iHora  = findColIdx(headers, 'hora') ?? 1
      const iSt    = findColIdx(headers, 'status') ?? 2
      const iVal   = findColIdx(headers, 'valorbrut', 'valor') ?? 3
      const iMod1  = findColIdx(headers, 'produto', 'tipo') ?? 5
      const iMod2  = findColIdx(headers, 'captura') ?? 6
      const iParc  = findColIdx(headers, 'parcel') ?? 8
      const iBand  = findColIdx(headers, 'bandeira') ?? 9
      const iTaxa  = findColIdx(headers, 'taxa') ?? 11
      const iVliq  = findColIdx(headers, 'valorliquid', 'vliquid') ?? 16
      const iNsu   = findColIdx(headers, 'nsu', 'tid') ?? 17
      const iAuth  = findColIdx(headers, 'autorizac') ?? 20
      const iCart  = findColIdx(headers, 'cartao') ?? 24
      for (let i = headerIdx + 1; i < allRows.length; i++) {
        const row = allRows[i]
        if (!row) continue
        const val  = parseFloat(row[iVal]) || 0
        const auth = String(row[iAuth] || '').trim()
        if (!auth || val === 0) continue
        const stVal = String(row[iSt] || '').trim().toLowerCase()
        if (!stVal.includes('aprovad')) continue
        const mod = [String(row[iMod1]||''), String(row[iMod2]||'')].filter(Boolean).join(' ').trim()
        nw.push({ o:'rede', d:normDate(row[iData]), h:String(row[iHora]||''), a:auth,
          n:String(row[iNsu]||'').trim(), b:String(row[iBand]||''), m:mod,
          vo:val, tx:parseFloat(row[iTaxa])||0, vl:parseFloat(row[iVliq])||0,
          p:parseInt(row[iParc])||0, c:String(row[iCart]||''), sv:stVal,
          vs:0, df:val, nOp:1, nSis:0, ag:'', mt:'', gt:'', stP:0, stN:0,
          si:'', hp:'', sd:'', sn:'', bi:'', usr:'', vb:true, vn:true, va:true, ajuste:null, st:'pendente', locked:false })
      }
    } else {
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
      for (const r of rows) {
        const k = Object.keys(r)
        const authK = k.find(x => /autoriz|auth|codigo/i.test(x))
        const valK  = k.find(x => /valor.*brut|valor|amount/i.test(x))
        const dtK   = k.find(x => /data|date/i.test(x))
        const nsuK  = k.find(x => /nsu|doc/i.test(x))
        const bandK = k.find(x => /bandeira|brand/i.test(x))
        const modK  = k.find(x => /modal|forma|tipo/i.test(x))
        const auth = String(r[authK] || '').trim()
        const val = parseFloat(r[valK]) || 0
        if (!auth || val === 0) continue
        nw.push({ o:src, d:normDate(r[dtK]), h:'', a:auth, n:String(r[nsuK]||'').trim(),
          b:String(r[bandK]||''), m:String(r[modK]||''), vo:val, tx:0, vl:0, p:0, c:'', sv:'',
          vs:0, df:val, nOp:1, nSis:0, ag:'', mt:'', gt:'', stP:0, stN:0,
          si:'', hp:'', sd:'', sn:'', bi:'', usr:'', vb:true, vn:true, va:true, ajuste:null, st:'pendente', locked:false })
      }
    }

    if (nw.length === 0) {
      toast(`${src.toUpperCase()}: Nenhum registro encontrado no arquivo. Verifique o formato.`, 'er')
      return
    }

    // Envia ao banco → banco faz dedup e retorna apenas os registros criados com IDs
    try {
      const res = await api.post('/cartoes/transacoes/importar/', nw.map(r => ({
        o:r.o, d:r.d, h:r.h, a:r.a, n:r.n, b:r.b, m:r.m, c:r.c,
        vo:r.vo, tx:r.tx, vl:r.vl, p:r.p, sv:r.sv,
      })))
      const salvos = (res.data.registros || []).map(dbToFrontend)
      const ignorados = res.data.ignorados || 0
      setD(prev => {
        // Adiciona apenas os registros novos (que vieram do banco com ID)
        const existingIds = new Set(prev.map(r => r.id).filter(Boolean))
        const novos = salvos.filter(r => !existingIds.has(r.id))
        const next = [...prev, ...novos]
        const totalSrc = next.filter(r=>r.o===src).length
        lg('💳', `${src.toUpperCase()}: <strong>${fname}</strong> — ${salvos.length} novos, ${ignorados} dup., ${totalSrc} total`)
        toast(`${src}: ${salvos.length} novos`, salvos.length > 0 ? 'ok' : 'in')
        return next
      })
      const newCards = { ...cards, [src]: `${fname} • ${salvos.length + ignorados} reg` }
      setCards(newCards); saveCardInfo(newCards)
    } catch (err) {
      toast('Erro ao salvar no banco: ' + (err.response?.data?.erro || err.message), 'er')
      console.error(err)
    }
  }, [lg, toast, cards, saveCardInfo])

  const handleFile = useCallback((e, src) => {
    const file = e.target.files[0]; if (!file) return
    const rd = new FileReader()
    rd.onload = async ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
        if (src === 'sistema') {
          const ws = wb.Sheets[wb.SheetNames[0]]
          await procSis(XLSX.utils.sheet_to_json(ws, { defval: '' }), file.name)
        } else {
          await procOp(src, file.name, wb)
        }
      } catch (err) { toast('Erro: ' + err.message, 'er') }
    }
    rd.readAsArrayBuffer(file)
    e.target.value = ''
  }, [procSis, procOp, toast])

  // ── Reconciliation ──
  const recon = useCallback(async () => {
    if (!SR.length) { toast('Importe o Sistema primeiro', 'er'); return }
    if (!D.length)  { toast('Importe operadoras primeiro', 'er'); return }
    const newD  = runRecon(D, SR)
    const newDS = buildDS(newD, SR)
    const now = new Date().toLocaleString('pt-BR')
    setD(newD); setDS(newDS); setLastRecon(now)
    toast('Conciliação OK', 'ok')
    lg('⚡', `Conciliação — <strong>${newD.length}</strong> op→sis + <strong>${newDS.length}</strong> sis→op`)
    // Persiste resultados da conciliação no banco (fire-and-forget)
    const payload = newD
      .filter(r => r.id)
      .map(r => ({ id:r.id, vs:r.vs, df:r.df, nOp:r.nOp, nSis:r.nSis, ag:r.ag, mt:r.mt, gt:r.gt,
        stP:r.stP, stN:r.stN, sd:r.sd, sn:r.sn, bi:r.bi, hp:r.hp, usr:r.usr, si:r.si,
        va:r.va, vn:r.vn, vb:r.vb, st:r.st, locked:r.locked, ajuste:r.ajuste }))
    api.post('/cartoes/transacoes/conciliar/', payload).catch(err => console.warn('sync conciliar:', err))
  }, [D, SR, lg, toast])

  // ── Filters + sort + paginate ──
  const filtered = useMemo(() => {
    let d = activeD.filter(r => r.st !== 'agrupado' && r.st !== 'pix_ignorado')
    const { op, bd, st, di, df, q } = filters
    if (ctab === 'div') d = d.filter(r => r.st==='divergente' || r.st==='arredondavel')
    else if (ctab === 'sop') d = d.filter(r => r.st==='somente_op')
    else if (ctab === 'aj')  d = d.filter(r => r.st==='ajustado' || r.st==='arredondado')
    else if (ctab === 'ok')  d = d.filter(r => r.st==='conciliado')
    else if (ctab === 'ag')  d = d.filter(r => r.ag)
    if (op) d = d.filter(r => r.o === op)
    if (bd) d = d.filter(r => r.b?.includes(bd))
    if (st) d = d.filter(r => r.st === st)
    if (di) d = d.filter(r => r.d >= di)
    if (df) d = d.filter(r => r.d <= df)
    if (q)  d = d.filter(r => [r.a,r.n,r.hp].some(x => x?.toLowerCase().includes(q)))
    const { k, a } = sort
    d = [...d].sort((x, y) => {
      let va = x[k], vb = y[k]
      if (typeof va === 'number') return a ? va - vb : vb - va
      return a ? String(va||'').localeCompare(String(vb||'')) : String(vb||'').localeCompare(String(va||''))
    })
    return d
  }, [activeD, filters, ctab, sort])

  const totalPages = Math.ceil(filtered.length / PS) || 1
  const pageData   = filtered.slice((page-1)*PS, page*PS)

  const stats = useMemo(() => {
    const base = filtered
    return {
      t:   base.length,
      c:   base.filter(r => r.st==='conciliado'||r.st==='arredondado').length,
      d:   base.filter(r => r.st==='divergente'||r.st==='arredondavel').length,
      a:   base.filter(r => r.st==='ajustado'||r.st==='arredondado').length,
      so:  base.filter(r => r.st==='somente_op').length,
      dt:  base.reduce((s,r) => s+r.df, 0),
      sO:  base.reduce((s,r) => s+r.vo, 0),
      sS:  base.reduce((s,r) => s+r.vs, 0),
    }
  }, [filtered])

  // ── Adjust ──
  const openAdj = (id) => {
    const rec = activeD.find(r => r.i === id)
    if (!rec) return
    setModals(p => ({ ...p, adj: { id, rec } }))
  }
  const saveAdj = () => {
    const { id, tipo, valor, just } = modals.adj
    if (!just?.trim()) { toast('Justificativa obrigatória', 'er'); return }
    const update = r => {
      if (r.i !== id) return r
      const nr = { ...r }
      if (tipo === 'aceitar_sistema')   nr.vo = r.vs
      else if (tipo === 'aceitar_operadora') nr.vs = r.vo
      else if (tipo === 'arredondamento')    nr.vs = r.vo
      else if (tipo === 'manual')       { nr.vo = valor||r.vo; nr.vs = valor||r.vs }
      else if (tipo === 'estorno')      { nr.vo = 0; nr.vs = 0 }
      else nr.vs = nr.vo
      nr.df = Math.round((nr.vo - nr.vs)*100)/100
      nr.ajuste = { tp:tipo, justificativa:just, dt:new Date().toISOString(), vaj:r.df, ov:r.vo, os:r.vs, stResult:'ajustado' }
      nr.st = 'ajustado'
      return nr
    }
    pushUndo(`Ajuste ${modals.adj.rec.a}`)
    if (viewMode === 'sis2op') setDS(p => p.map(update))
    else setD(p => p.map(update))
    // Sincroniza com banco
    const recId = modals.adj.id
    setD(curr => {
      const updated = curr.find(r => r.i === recId)
      if (updated?.id) api.patch(`/cartoes/transacoes/${updated.id}/`, { st: updated.st, ajuste: updated.ajuste, vo: updated.vo, vs: updated.vs, df: updated.df }).catch(() => {})
      return curr
    })
    setModals(p => ({ ...p, adj: null }))
    toast('Ajuste aplicado', 'ok')
    lg('⚡', `Ajuste ${modals.adj.rec.a} (${tipo}) ${just}`)
  }

  const rnd1 = (id) => {
    const rec = activeD.find(r => r.i === id); if (!rec) return
    pushUndo(`Arred. ${rec.a}`)
    const update = r => r.i !== id ? r : {
      ...r, vs:r.vo, df:0,
      ajuste:{ tp:'arredondamento', justificativa:`Arred. (${cur(r.df)})`, dt:new Date().toISOString(), vaj:r.df, ov:r.vo, os:r.vs, stResult:'arredondado' },
      st:'arredondado'
    }
    if (viewMode === 'sis2op') setDS(p => p.map(update))
    else setD(p => p.map(update))
    toast('Arredondado', 'ok')
    lg('↻', `Arred. ${rec.a}`)
    if (rec.id) {
      const ajuste = { tp:'arredondamento', justificativa:`Arred. (${cur(rec.df)})`, dt:new Date().toISOString(), vaj:rec.df, ov:rec.vo, os:rec.vs, stResult:'arredondado' }
      api.patch(`/cartoes/transacoes/${rec.id}/`, { st:'arredondado', vs:rec.vo, df:0, ajuste }).catch(() => {})
    }
  }

  const autoRound = () => {
    pushUndo('Auto arredondamento')
    let c = 0
    setD(p => p.map(r => {
      if ((r.st==='divergente'||r.st==='arredondavel') && Math.abs(r.df)<=RT && Math.abs(r.df)>0) {
        c++
        return { ...r, vs:r.vo, df:0,
          ajuste:{ tp:'arredondamento', justificativa:`Auto (${cur(r.df)})`, dt:new Date().toISOString(), vaj:r.df, ov:r.vo, os:r.vs, stResult:'arredondado' },
          st:'arredondado' }
      }
      return r
    }))
    if (c > 0) {
      toast(`${c} arredondadas`, 'ok')
      lg('✦', `Auto arred. <strong>${c}</strong>`)
      // Sync rounded records with DB
      setD(curr => {
        const payload = curr
          .filter(r => r.st === 'arredondado' && r.id && r.ajuste?.tp === 'arredondamento')
          .map(r => ({ id:r.id, vs:r.vs, df:r.df, st:r.st, ajuste:r.ajuste, locked:r.locked }))
        if (payload.length) api.post('/cartoes/transacoes/conciliar/', payload).catch(() => {})
        return curr
      })
    } else { toast('Nenhuma dentro do limite', 'in') }
  }

  const revert = (id) => {
    const rec = activeD.find(r => r.i === id); if (!rec?.ajuste) return
    pushUndo(`Reverter ${rec.a}`)
    const update = r => r.i !== id ? r : {
      ...r, vo:r.ajuste.ov??r.vo, vs:r.ajuste.os??r.vs, ajuste:null,
      df: Math.round(((r.ajuste.ov??r.vo)-(r.ajuste.os??r.vs))*100)/100, st:cst({ ...r, ajuste:null })
    }
    if (viewMode === 'sis2op') setDS(p => p.map(update))
    else setD(p => p.map(update))
    toast('Revertido', 'in')
    lg('↩', `Revertido ${rec.a}`)
    if (rec.id) {
      const ov = rec.ajuste?.ov ?? rec.vo
      const os = rec.ajuste?.os ?? rec.vs
      api.patch(`/cartoes/transacoes/${rec.id}/`, {
        st: cst({ ...rec, ajuste: null, vo: ov, vs: os, df: Math.round((ov - os) * 100) / 100 }),
        vo: ov, vs: os, df: Math.round((ov - os) * 100) / 100, ajuste: null,
      }).catch(() => {})
    }
  }

  // ── Manual entry ──
  const saveManual = async () => {
    const { op, auth, nsu, band, mod, dvo, dvs, dt } = modals.manual || {}
    if (!auth?.trim()) { toast('Autorização obrigatória', 'er'); return }
    const vo = parseFloat(dvo) || 0
    const vs = parseFloat(dvs) || 0
    const payload = [{
      o:op||'cielo', d:dt||todayISO(), h:'', a:auth, n:nsu||'',
      b:band||'Visa', m:mod||'Crédito à vista', vo, tx:0, vl:0, p:0, c:'', sv:'Manual',
    }]
    try {
      const res = await api.post('/cartoes/transacoes/importar/', payload)
      const salvos = (res.data.registros || []).map(dbToFrontend)
      const rec = salvos[0] || { i: nId(), o:op||'cielo', d:dt||todayISO(), h:'', a:auth, n:nsu||'', b:band||'Visa', m:mod||'Crédito à vista', vo, vs:0, df:vo, tx:0, vl:0, p:0, c:'', sv:'Manual', si:'', hp:'', nOp:1, nSis:0, ag:'', mt:'sem_match', gt:'', stP:0, stN:0, sd:'', sn:'', bi:'', usr:'', vb:true, vn:true, va:true, ajuste:null, st:'pendente', locked:false }
      rec.vs = vs; rec.df = Math.round((vo - vs) * 100) / 100; rec.st = cst(rec)
      setD(p => [...p, rec])
      setModals(p => ({ ...p, manual: null }))
      toast('Registro adicionado', 'ok')
      lg('＋', `Manual ${auth}`)
    } catch (err) {
      toast('Erro ao salvar: ' + (err.response?.data?.erro || err.message), 'er')
    }
  }

  // ── Fechar dia ──
  const doFechar = async () => {
    const { dt, obs } = modals.fechar || {}
    if (!dt) { toast('Selecione a data', 'er'); return }
    if (lockedUntil && dt <= lockedUntil) { toast('Já conciliado até essa data', 'er'); return }
    const ac = activeD.filter(r => r.st!=='agrupado'&&r.st!=='pix_ignorado'&&r.d&&r.d<=dt&&(!lockedUntil||r.d>lockedUntil))
    const dv = ac.filter(r => r.st==='divergente'||r.st==='arredondavel').length
    const so = ac.filter(r => r.st==='somente_op').length
    if (dv+so > 0) { toast(`Resolva ${dv+so} pendência(s) antes de fechar`, 'er'); return }
    const ok = ac.filter(r => r.st==='conciliado'||r.st==='arredondado'||r.st==='ajustado').length
    try {
      await api.post('/cartoes/periodos/fechar/', { data_ate: dt, total: ac.length, ok, obs: obs || '' })
      const lock = r => ({ ...r, locked: r.d && r.d <= dt ? true : r.locked })
      setD(p => p.map(lock)); setDS(p => p.map(lock))
      setLU(dt)
      setSP(p => [...p, { data_ate: dt, total_transacoes: ac.length, total_ok: ok, observacao: obs || '' }])
      setModals(p => ({ ...p, fechar: null }))
      toast(`Conciliado até ${fmtDt(dt)}`, 'ok')
      lg('🔒', `Dia fechado até <strong>${fmtDt(dt)}</strong> — ${ac.length} trans travadas`)
    } catch (err) {
      toast('Erro ao fechar período: ' + (err.response?.data?.erro || err.message), 'er')
    }
  }

  // ── Abrir dia ──
  const doAbrir = async () => {
    const { dt } = modals.abrir || {}
    if (!dt || !lockedUntil || dt > lockedUntil) { toast('Data inválida', 'er'); return }
    try {
      await api.post('/cartoes/periodos/abrir/', { data_from: dt })
      const unlock = r => ({ ...r, locked: r.d && r.d >= dt ? false : r.locked })
      setD(p => p.map(unlock)); setDS(p => p.map(unlock))
      const newLocked = dt > '' ? prevDay(dt) : ''
      setLU(newLocked < dt ? newLocked : '')
      setSP(p => p.filter(x => (x.data_ate || x.dt) < dt))
      setModals(p => ({ ...p, abrir: null }))
      toast(`Dias a partir de ${fmtDt(dt)} abertos`, 'ok')
      lg('🔓', `Dia aberto a partir de <strong>${fmtDt(dt)}</strong>`)
    } catch (err) {
      toast('Erro ao abrir período: ' + (err.response?.data?.erro || err.message), 'er')
    }
  }
  function prevDay(d) {
    const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate()-1)
    return dt.toISOString().substring(0,10)
  }

  // ── Clear all ──
  const doClearAll = async () => {
    try {
      await api.delete('/cartoes/limpar/')
    } catch (err) {
      // Avisa mas continua limpando estado local
      toast('Aviso: erro ao limpar banco — dados locais removidos', 'er')
      console.error(err)
    }
    setD([]); setDS([]); setSR([]); setAL([]); setCards({ sistema:null, cielo:null, rede:null })
    setCO([]); setLU(''); setSP([]); setUndo([]); setLastRecon('')
    try { localStorage.removeItem(lsKey(empresaAtiva?.id)) } catch {}
    setModals({}); toast('Dados removidos', 'in')
    lg('🗑', 'TUDO limpo')
  }

  // ── Export helpers ──
  const _buildExportData = () => {
    const ex = modals.export || {}
    const dir = ex.dir ?? (viewMode === 'sis2op' ? 'sis2op' : 'op2sis')
    const src = dir === 'sis2op' ? DS : D
    const { di, df, soDiv, inclComp, inclResTot, inclResOp, inclResDia, inclLog, inclFech, opFilter } = ex
    let ac = src.filter(r => r.st!=='agrupado' && r.st!=='pix_ignorado')
    if (di) ac = ac.filter(r => r.d >= di)
    if (df) ac = ac.filter(r => r.d <= df)
    if (opFilter) ac = ac.filter(r => r.o === opFilter)
    if (soDiv) ac = ac.filter(r => r.st==='divergente'||r.st==='arredondavel'||r.st==='somente_op')
    const dirLabel = dir === 'sis2op' ? 'Sistema → Operadora' : 'Operadora → Sistema'
    return { ac, di, df, dirLabel, opFilter: opFilter || '', inclComp: inclComp !== false, inclResTot: inclResTot !== false, inclResOp: inclResOp !== false, inclResDia: inclResDia !== false, inclLog: !!inclLog, inclFech: inclFech !== false }
  }

  const exportXlsx = () => {
    const { ac, di, df, dirLabel, opFilter, inclComp, inclResTot, inclResOp, inclResDia, inclLog, inclFech } = _buildExportData()
    const opLabel = opFilter ? ` — ${opFilter.toUpperCase()}` : ''
    const rows = [
      [`CONCILIAÇÃO DE CARTÃO — ${empresaCfg.nome.toUpperCase()}${opLabel}`],
      ['Período:', `${fmtDt(di)} a ${fmtDt(df)}`, '', 'Direção:', dirLabel, '', 'Gerado:', new Date().toLocaleString('pt-BR')],
      [],
    ]
    if (inclComp) {
      rows.push(['Operadora','Data','Autorização','NSU','Bandeira','Modalidade','Vl.Operadora','Vl.Sistema','Diferença','Nº Cartão','Nº Controle','Status','Qtd.Sis','Ajuste','Justificativa'])
      for (const r of ac) rows.push([r.o?.toUpperCase(),r.d,r.a,r.n,r.b,r.m,r.vo,r.vs,r.df,r.c||'',r.sd||'',r.st?.toUpperCase(),r.nSis||0,r.ajuste?.tp||'',r.ajuste?.justificativa||''])
      rows.push([])
    }
    if (inclResTot) {
      rows.push(['RESUMO TOTAIS'])
      rows.push(['Conciliados', ac.filter(r=>r.st==='conciliado'||r.st==='arredondado').length])
      rows.push(['Divergentes', ac.filter(r=>r.st==='divergente'||r.st==='arredondavel').length])
      rows.push(['Ajustados',   ac.filter(r=>r.st==='ajustado').length])
      rows.push(['Só Operadora',ac.filter(r=>r.st==='somente_op').length])
      rows.push(['Total Vl.Op', ac.reduce((s,r)=>s+r.vo,0)])
      rows.push(['Total Vl.Sis',ac.reduce((s,r)=>s+r.vs,0)])
      rows.push(['Total Dif.',  Math.round(ac.reduce((s,r)=>s+r.df,0)*100)/100])
      rows.push([])
    }
    if (inclResOp) {
      rows.push(['RESUMO POR OPERADORA'])
      rows.push(['Operadora','Total','Conciliados','Divergentes','Ajustados','Só Op','Vl.Operadora','Vl.Sistema','Diferença'])
      const opsUniq = [...new Set(ac.map(r=>r.o).filter(Boolean))].sort()
      for (const op of opsUniq) {
        const opRows = ac.filter(r=>r.o===op)
        rows.push([op.toUpperCase(),opRows.length,
          opRows.filter(r=>r.st==='conciliado'||r.st==='arredondado').length,
          opRows.filter(r=>r.st==='divergente'||r.st==='arredondavel').length,
          opRows.filter(r=>r.st==='ajustado').length,
          opRows.filter(r=>r.st==='somente_op').length,
          opRows.reduce((s,r)=>s+r.vo,0),
          opRows.reduce((s,r)=>s+r.vs,0),
          Math.round(opRows.reduce((s,r)=>s+r.df,0)*100)/100])
      }
      rows.push([])
    }
    if (inclResDia) {
      rows.push(['RESUMO POR DIA'])
      rows.push(['Data','Total','Conciliados','Divergências','Só Op','Vl.Operadora','Vl.Sistema','Diferença'])
      for (const dt of [...new Set(ac.map(r=>r.d).filter(Boolean))].sort()) {
        const day = ac.filter(r=>r.d===dt)
        rows.push([fmtDt(dt),day.length,
          day.filter(r=>r.st==='conciliado'||r.st==='arredondado'||r.st==='ajustado').length,
          day.filter(r=>r.st==='divergente'||r.st==='arredondavel').length,
          day.filter(r=>r.st==='somente_op').length,
          day.reduce((s,r)=>s+r.vo,0), day.reduce((s,r)=>s+r.vs,0),
          Math.round((day.reduce((s,r)=>s+r.vo,0)-day.reduce((s,r)=>s+r.vs,0))*100)/100])
      }
      rows.push([])
    }
    if (inclLog && AL.length) {
      rows.push(['LOG DE OCORRÊNCIAS'])
      rows.push(['Hora','Ícone','Descrição'])
      for (const l of AL) rows.push([l.t, l.ic, l.d?.replace(/<[^>]+>/g,'') || ''])
      rows.push([])
    }
    if (inclFech && savedPeriods.length) {
      rows.push(['AUDITORIA DE FECHAMENTOS'])
      rows.push(['Data','Total','OK','Observação'])
      for (const p of savedPeriods) rows.push([fmtDt(p.data_ate||p.dt), p.total_transacoes||p.total||0, p.total_ok||p.ok||0, p.observacao||p.obs||''])
    }
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{wch:12},{wch:11},{wch:13},{wch:13},{wch:14},{wch:22},{wch:13},{wch:13},{wch:13},{wch:13},{wch:5},{wch:12}]
    XLSX.utils.book_append_sheet(wb, ws, 'Conciliação')
    XLSX.writeFile(wb, `conciliacao_${(di||'').replace(/-/g,'')}_${(df||'').replace(/-/g,'')}.xlsx`)
    toast('Excel exportado', 'ok')
    lg('📥', `Excel exportado (${ac.length} trans)`)
    setModals(p => ({ ...p, export: null }))
  }

  const exportPdf = () => {
    const { ac, di, df, dirLabel, opFilter, inclComp, inclResTot, inclResOp, inclResDia, inclLog, inclFech } = _buildExportData()
    const opLabel = opFilter ? ` — ${opFilter.toUpperCase()}` : ''
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const title = `CONCILIAÇÃO DE CARTÃO — ${empresaCfg.nome.toUpperCase()}${opLabel}`
    const sub = `Período: ${fmtDt(di)} a ${fmtDt(df)} · ${dirLabel} · Gerado: ${new Date().toLocaleString('pt-BR')}`
    doc.setFontSize(13); doc.setFont('helvetica', 'bold')
    doc.text(title, 14, 14)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    doc.text(sub, 14, 20)
    let y = 26
    if (inclComp) {
      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [['Operadora','Data','Auth','NSU','Bandeira','Modalidade','Vl.Op','Vl.Sis','Dif','Status','Qtd.Sis','Ajuste']],
        body: ac.map(r => [r.o?.toUpperCase(),r.d,r.a,r.n,r.b,r.m,cur(r.vo),cur(r.vs),cur(r.df),r.st?.toUpperCase(),r.nSis||0,r.ajuste?.tp||'']),
        styles: { fontSize: 6.5, cellPadding: 1.5 },
        headStyles: { fillColor: [30, 30, 40], textColor: 255, fontSize: 7 },
        alternateRowStyles: { fillColor: [245, 245, 250] },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const st = ac[data.row.index]?.st
            if (st === 'divergente' || st === 'arredondavel') data.cell.styles.textColor = [220, 50, 50]
            else if (st === 'conciliado' || st === 'arredondado') data.cell.styles.textColor = [30, 160, 80]
            else if (st === 'ajustado') data.cell.styles.textColor = [200, 140, 0]
          }
        },
      })
      y = doc.lastAutoTable.finalY + 6
    }
    if (inclResTot) {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('RESUMO TOTAIS', 14, y); y += 4
      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 }, tableWidth: 100,
        head: [['Status','Qtd']],
        body: [
          ['Conciliados', ac.filter(r=>r.st==='conciliado'||r.st==='arredondado').length],
          ['Divergentes', ac.filter(r=>r.st==='divergente'||r.st==='arredondavel').length],
          ['Ajustados', ac.filter(r=>r.st==='ajustado').length],
          ['Só Operadora', ac.filter(r=>r.st==='somente_op').length],
          ['Total Vl.Op', cur(ac.reduce((s,r)=>s+r.vo,0))],
          ['Total Vl.Sis', cur(ac.reduce((s,r)=>s+r.vs,0))],
          ['Total Dif.', cur(Math.round(ac.reduce((s,r)=>s+r.df,0)*100)/100)],
        ],
        styles: { fontSize: 7 }, headStyles: { fillColor: [30, 30, 40], textColor: 255 },
      })
      y = doc.lastAutoTable.finalY + 6
    }
    if (inclResOp) {
      if (y > 170) { doc.addPage(); y = 14 }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('RESUMO POR OPERADORA', 14, y); y += 4
      const opsUniq = [...new Set(ac.map(r=>r.o).filter(Boolean))].sort()
      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [['Operadora','Total','Conciliados','Divergentes','Ajustados','Só Op','Vl.Operadora','Vl.Sistema','Diferença']],
        body: opsUniq.map(op => {
          const opRows = ac.filter(r=>r.o===op)
          return [op.toUpperCase(), opRows.length,
            opRows.filter(r=>r.st==='conciliado'||r.st==='arredondado').length,
            opRows.filter(r=>r.st==='divergente'||r.st==='arredondavel').length,
            opRows.filter(r=>r.st==='ajustado').length,
            opRows.filter(r=>r.st==='somente_op').length,
            cur(opRows.reduce((s,r)=>s+r.vo,0)),
            cur(opRows.reduce((s,r)=>s+r.vs,0)),
            cur(Math.round(opRows.reduce((s,r)=>s+r.df,0)*100)/100)]
        }),
        styles: { fontSize: 7 }, headStyles: { fillColor: [30, 30, 40], textColor: 255 },
      })
      y = doc.lastAutoTable.finalY + 6
    }
    if (inclResDia) {
      if (y > 170) { doc.addPage(); y = 14 }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('RESUMO POR DIA', 14, y); y += 4
      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [['Data','Total','Conciliados','Divergências','Só Op','Vl.Operadora','Vl.Sistema','Diferença']],
        body: [...new Set(ac.map(r=>r.d).filter(Boolean))].sort().map(dt => {
          const day = ac.filter(r=>r.d===dt)
          return [fmtDt(dt),day.length,
            day.filter(r=>r.st==='conciliado'||r.st==='arredondado'||r.st==='ajustado').length,
            day.filter(r=>r.st==='divergente'||r.st==='arredondavel').length,
            day.filter(r=>r.st==='somente_op').length,
            cur(day.reduce((s,r)=>s+r.vo,0)), cur(day.reduce((s,r)=>s+r.vs,0)),
            cur(Math.round((day.reduce((s,r)=>s+r.vo,0)-day.reduce((s,r)=>s+r.vs,0))*100)/100)]
        }),
        styles: { fontSize: 7 }, headStyles: { fillColor: [30, 30, 40], textColor: 255 },
      })
      y = doc.lastAutoTable.finalY + 6
    }
    if (inclFech && savedPeriods.length) {
      if (y > 170) { doc.addPage(); y = 14 }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('AUDITORIA DE FECHAMENTOS', 14, y); y += 4
      autoTable(doc, {
        startY: y, margin: { left: 14, right: 14 },
        head: [['Data','Total','OK','Observação']],
        body: savedPeriods.map(p => [fmtDt(p.data_ate||p.dt), p.total_transacoes||p.total||0, p.total_ok||p.ok||0, p.observacao||p.obs||'']),
        styles: { fontSize: 7 }, headStyles: { fillColor: [30, 30, 40], textColor: 255 },
      })
    }
    doc.save(`conciliacao_${(di||'').replace(/-/g,'')}_${(df||'').replace(/-/g,'')}.pdf`)
    toast('PDF exportado', 'ok')
    lg('📄', `PDF exportado (${ac.length} trans)`)
    setModals(p => ({ ...p, export: null }))
  }

  const printExport = () => {
    const { ac, di, df, dirLabel, opFilter, inclComp, inclResTot, inclResOp, inclResDia, inclFech } = _buildExportData()
    const opLabel = opFilter ? ` — ${opFilter.toUpperCase()}` : ''
    const stLabel = { conciliado:'OK', arredondado:'OK(Arr)', divergente:'DIV', arredondavel:'DIV(Arr)', ajustado:'AJ', somente_op:'S/Op' }
    let html = `<html><head><title>Conciliação</title><style>
      body{font-family:Arial,sans-serif;font-size:10px;color:#111}
      h1{font-size:14px;margin:0 0 4px}
      h2{font-size:11px;margin:16px 0 4px;border-bottom:1px solid #ccc;padding-bottom:2px}
      p{margin:2px 0;color:#555}
      table{border-collapse:collapse;width:100%;margin-bottom:8px}
      th{background:#222;color:#fff;padding:4px 6px;text-align:left;font-size:9px}
      td{padding:3px 6px;border-bottom:1px solid #eee;font-size:9px}
      .ok{color:#1a7a40}.div{color:#cc2222}.aj{color:#b87a00}.so{color:#7048b8}
      @media print{body{margin:0}}
    </style></head><body>
    <h1>CONCILIAÇÃO DE CARTÃO — ${empresaCfg.nome.toUpperCase()}${opLabel}</h1>
    <p>Período: <b>${fmtDt(di)} a ${fmtDt(df)}</b> · ${dirLabel} · Gerado: ${new Date().toLocaleString('pt-BR')}</p>`
    if (inclComp) {
      html += `<h2>Conciliação Completa</h2><table><tr><th>Operadora</th><th>Data</th><th>Auth</th><th>NSU</th><th>Bandeira</th><th>Modalidade</th><th>Vl.Op</th><th>Vl.Sis</th><th>Dif</th><th>Status</th><th>Qtd.Sis</th><th>Ajuste</th></tr>`
      for (const r of ac) {
        const cls = r.st==='conciliado'||r.st==='arredondado'?'ok':r.st==='divergente'||r.st==='arredondavel'?'div':r.st==='ajustado'?'aj':r.st==='somente_op'?'so':''
        html += `<tr class="${cls}"><td>${r.o?.toUpperCase()}</td><td>${r.d}</td><td>${r.a}</td><td>${r.n}</td><td>${r.b}</td><td>${r.m}</td><td>${cur(r.vo)}</td><td>${cur(r.vs)}</td><td>${cur(r.df)}</td><td>${stLabel[r.st]||r.st}</td><td>${r.nSis||0}</td><td>${r.ajuste?.tp||''}</td></tr>`
      }
      html += '</table>'
    }
    if (inclResTot) {
      const ok = ac.filter(r=>r.st==='conciliado'||r.st==='arredondado').length
      const dv = ac.filter(r=>r.st==='divergente'||r.st==='arredondavel').length
      html += `<h2>Resumo Totais</h2><table style="width:300px">
        <tr><th>Status</th><th>Qtd</th></tr>
        <tr><td class="ok">Conciliados</td><td>${ok}</td></tr>
        <tr><td class="div">Divergentes</td><td>${dv}</td></tr>
        <tr><td class="aj">Ajustados</td><td>${ac.filter(r=>r.st==='ajustado').length}</td></tr>
        <tr><td class="so">Só Operadora</td><td>${ac.filter(r=>r.st==='somente_op').length}</td></tr>
        <tr><td><b>Total Vl.Op</b></td><td>${cur(ac.reduce((s,r)=>s+r.vo,0))}</td></tr>
        <tr><td><b>Total Vl.Sis</b></td><td>${cur(ac.reduce((s,r)=>s+r.vs,0))}</td></tr>
        <tr><td><b>Total Dif.</b></td><td>${cur(Math.round(ac.reduce((s,r)=>s+r.df,0)*100)/100)}</td></tr>
      </table>`
    }
    if (inclResOp) {
      const opsUniq = [...new Set(ac.map(r=>r.o).filter(Boolean))].sort()
      html += `<h2>Resumo por Operadora</h2><table><tr><th>Operadora</th><th>Total</th><th class="ok">Conciliados</th><th class="div">Divergentes</th><th class="aj">Ajustados</th><th class="so">Só Op</th><th>Vl.Op</th><th>Vl.Sis</th><th>Diferença</th></tr>`
      for (const op of opsUniq) {
        const opRows = ac.filter(r=>r.o===op)
        html += `<tr><td><b>${op.toUpperCase()}</b></td><td>${opRows.length}</td><td class="ok">${opRows.filter(r=>r.st==='conciliado'||r.st==='arredondado').length}</td><td class="div">${opRows.filter(r=>r.st==='divergente'||r.st==='arredondavel').length}</td><td class="aj">${opRows.filter(r=>r.st==='ajustado').length}</td><td class="so">${opRows.filter(r=>r.st==='somente_op').length}</td><td>${cur(opRows.reduce((s,r)=>s+r.vo,0))}</td><td>${cur(opRows.reduce((s,r)=>s+r.vs,0))}</td><td>${cur(Math.round(opRows.reduce((s,r)=>s+r.df,0)*100)/100)}</td></tr>`
      }
      html += '</table>'
    }
    if (inclResDia) {
      html += `<h2>Resumo por Dia</h2><table><tr><th>Data</th><th>Total</th><th>Conciliados</th><th>Divergências</th><th>Só Op</th><th>Vl.Op</th><th>Vl.Sis</th><th>Diferença</th></tr>`
      for (const dt of [...new Set(ac.map(r=>r.d).filter(Boolean))].sort()) {
        const day = ac.filter(r=>r.d===dt)
        html += `<tr><td>${fmtDt(dt)}</td><td>${day.length}</td><td class="ok">${day.filter(r=>r.st==='conciliado'||r.st==='arredondado'||r.st==='ajustado').length}</td><td class="div">${day.filter(r=>r.st==='divergente'||r.st==='arredondavel').length}</td><td class="so">${day.filter(r=>r.st==='somente_op').length}</td><td>${cur(day.reduce((s,r)=>s+r.vo,0))}</td><td>${cur(day.reduce((s,r)=>s+r.vs,0))}</td><td>${cur(Math.round((day.reduce((s,r)=>s+r.vo,0)-day.reduce((s,r)=>s+r.vs,0))*100)/100)}</td></tr>`
      }
      html += '</table>'
    }
    if (inclFech && savedPeriods.length) {
      html += `<h2>Auditoria de Fechamentos</h2><table style="width:500px"><tr><th>Data</th><th>Total</th><th>OK</th><th>Observação</th></tr>`
      for (const p of savedPeriods) html += `<tr><td>${fmtDt(p.data_ate||p.dt)}</td><td>${p.total_transacoes||p.total||0}</td><td>${p.total_ok||p.ok||0}</td><td>${p.observacao||p.obs||''}</td></tr>`
      html += '</table>'
    }
    html += '</body></html>'
    const w = window.open('', '_blank', 'width=1100,height=700')
    w.document.write(html); w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 400)
    setModals(p => ({ ...p, export: null }))
  }

  // ── Days summary ──
  const daysSummary = useMemo(() => {
    const ac = activeD.filter(r => r.st!=='agrupado'&&r.st!=='pix_ignorado')
    const dates = [...new Set(ac.map(r=>r.d).filter(Boolean))].sort()
    return dates.map(dt => {
      const day = ac.filter(r=>r.d===dt)
      return {
        dt, lk: isLocked({ d:dt }),
        total: day.length,
        ok:  day.filter(r=>r.st==='conciliado'||r.st==='arredondado'||r.st==='ajustado').length,
        div: day.filter(r=>r.st==='divergente'||r.st==='arredondavel').length,
        so:  day.filter(r=>r.st==='somente_op').length,
        sO:  day.reduce((s,r)=>s+r.vo,0),
        sS:  day.reduce((s,r)=>s+r.vs,0),
      }
    })
  }, [activeD, isLocked])

  // ── Tab counts ──
  const all = activeD.filter(r => r.st!=='agrupado'&&r.st!=='pix_ignorado')
  const tDiv = all.filter(r=>r.st==='divergente'||r.st==='arredondavel').length
  const tSO  = all.filter(r=>r.st==='somente_op').length
  const tAj  = all.filter(r=>r.st==='ajustado'||r.st==='arredondado').length
  const tOk  = all.filter(r=>r.st==='conciliado').length
  const tAg  = all.filter(r=>r.ag).length

  const ops = [...new Set(activeD.map(r=>r.o).filter(Boolean))].sort()

  // ── Grp selection ──
  const grpTotal = [...grpSel].map(id => D.find(r=>r.i===id)).filter(Boolean).reduce((s,r)=>s+r.vo,0)

  function sf(k) { setSort(p => p.k===k ? {...p,a:!p.a} : {k,a:true}); setPage(1) }
  function setF(k,v) { setFilters(p=>({...p,[k]:v})); setPage(1) }

  // ──────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-6 pb-10 min-h-full">

      {/* ── Top action bar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Workflow steps */}
        {[
          [SR.length>0,'① Sistema importado','① Importar Sistema'],
          [D.length>0, '② Operadoras importadas','② Importar Operadoras'],
          [D.some(r=>r.st==='conciliado'||r.st==='ajustado'),'③ Conciliado','③ Conciliar'],
          [!!lockedUntil,'④ Dia fechado','④ Fechar Dia'],
        ].map(([done,yes,no],i) => (
          <span key={i} className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${done
            ? 'bg-primary/10 text-primary border-primary/25'
            : i===0&&!SR.length ? 'bg-warn/10 text-warn border-warn/25 animate-pulse'
            : 'bg-bg3 text-muted border-border'}`}>
            {done ? yes : no}
          </span>
        ))}
        <div className="flex-1" />
        <Btn variant="ghost" onClick={undo} className={undoStack.length ? '' : 'opacity-30 pointer-events-none'}>↩ Desfazer</Btn>
        <div className="w-px h-5 bg-border" />
        <Btn variant="primary" onClick={recon}>⚡ Conciliar</Btn>
        <Btn variant="ghost" onClick={() => setModals(p=>({...p,fechar:{dt:'',obs:''}}))} className="border-primary/30 text-primary">🔒 Fechar Dia</Btn>
        <div className="w-px h-5 bg-border" />
        <select value={viewMode} onChange={e=>{setVM(e.target.value);setPage(1)}}
          className="bg-bg3 border border-border rounded-lg px-2 py-1.5 text-[11px] text-dim focus:outline-none">
          <option value="op2sis">↔ Operadora → Sistema</option>
          <option value="sis2op">↔ Sistema → Operadora</option>
        </select>
        <Btn variant="ghost" onClick={()=>setModals(p=>({...p,export:{di:'',df:'',dir:viewMode,opFilter:'',inclComp:true,soDiv:false,inclResTot:true,inclResOp:true,inclResDia:true,inclLog:false,inclFech:true}}))} >📥 Exportar</Btn>
        <Btn variant="ghost" className="border-danger/30 text-danger" onClick={()=>setConfirm({
          title:'🗑 Limpar todos os dados',
          body: `Tem certeza que deseja remover <strong>todos</strong> os dados?<br/><br/>` +
                `• <strong>${D.length}</strong> transações de operadoras<br/>` +
                `• <strong>${SR.length}</strong> registros do Sistema (ERP)<br/>` +
                `• Histórico de conciliação e fechamentos<br/><br/>` +
                `<span style="color:#ef4444">Esta ação é <strong>irreversível</strong>.</span>`,
          okText:'Sim, limpar tudo', okClass:'bg-danger',
          onOk:()=>{doClearAll();setConfirm(null)}, onCancel:()=>setConfirm(null)
        })}>🗑 Limpar</Btn>
        <Btn variant="ghost" onClick={()=>setModals(p=>({...p,cfg:true}))} className="px-2">⚙</Btn>
      </div>

      {/* ── Upload cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { src:'sistema', label:'Sistema (ERP)', icon:'🖥️' },
          { src:'cielo',   label:'Cielo',         icon:'💳' },
          { src:'rede',    label:'Rede',           icon:'💳' },
          ...customOps.map(o => ({ src:o.slug, label:o.name, icon:'💳' })),
        ].map(({ src, label, icon }) => (
          <div key={src}>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
              ref={el => { fileRefs.current[src] = el }}
              onChange={e => handleFile(e, src)} />
            <UpCard label={label} icon={icon}
              loaded={!!cards[src]}
              info={cards[src]}
              onClick={() => fileRefs.current[src]?.click()} />
          </div>
        ))}
        <div onClick={()=>setModals(p=>({...p,addOp:true}))}
          className="border-2 border-dashed border-border rounded-xl p-3 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition">
          <div className="text-xl mb-1">＋</div>
          <div className="text-[11px] font-bold text-muted">Operadora</div>
          <div className="text-[9px] text-muted">adicionar</div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Transações"  value={all.length} sub="registros" bar="bg-primary" />
        <StatCard label="Conciliados" value={<span className="text-primary">{tOk}</span>}
          sub={all.length ? `${(tOk/all.length*100).toFixed(1)}%` : '0%'} bar="bg-primary" />
        <StatCard label="Divergências" value={<span className="text-danger">{tDiv}</span>}
          sub={all.length ? `${(tDiv/all.length*100).toFixed(1)}%` : '0%'} bar="bg-danger" />
        <StatCard label="Ajustes"    value={<span className="text-warn">{tAj}</span>}  sub="manuais" bar="bg-warn" />
        <StatCard label={viewMode==='sis2op'?'Só Sistema':'Só Operadora'}
          value={<span className="text-purple-400">{tSO}</span>} sub="sem match" bar="bg-purple-500" />
        <StatCard label="Diferença Total"
          value={<span className="text-cyan-400 text-base">{cur(stats.dt)}</span>} sub="op − sistema" bar="bg-cyan-500" />
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-2 flex-wrap items-center">
        <select value={filters.op} onChange={e=>setF('op',e.target.value)}
          className="bg-bg2 border border-border rounded-lg px-2 py-1.5 text-xs text-dim focus:outline-none">
          <option value="">Todas Operadoras</option>
          {ops.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
        <select value={filters.bd} onChange={e=>setF('bd',e.target.value)}
          className="bg-bg2 border border-border rounded-lg px-2 py-1.5 text-xs text-dim focus:outline-none">
          <option value="">Todas Bandeiras</option>
          {['Visa','Mastercard','Elo','Amex','Hipercard'].map(b=><option key={b}>{b}</option>)}
        </select>
        <select value={filters.st} onChange={e=>setF('st',e.target.value)}
          className="bg-bg2 border border-border rounded-lg px-2 py-1.5 text-xs text-dim focus:outline-none">
          <option value="">Todos Status</option>
          <option value="conciliado">Conciliados</option>
          <option value="divergente">Divergentes</option>
          <option value="ajustado">Ajustados</option>
          <option value="somente_op">{viewMode==='sis2op'?'Só Sistema':'Só Operadora'}</option>
        </select>
        <span className="text-[10px] text-muted font-semibold">DE</span>
        <input type="date" value={filters.di} onChange={e=>setF('di',e.target.value)}
          className="bg-bg2 border border-border rounded-lg px-2 py-1.5 text-xs text-dim focus:outline-none" />
        <span className="text-[10px] text-muted font-semibold">ATÉ</span>
        <input type="date" value={filters.df} onChange={e=>setF('df',e.target.value)}
          className="bg-bg2 border border-border rounded-lg px-2 py-1.5 text-xs text-dim focus:outline-none" />
        <Btn variant="ghost" className="text-[11px] py-1 px-2.5" onClick={()=>{const t=todayISO();setFilters(p=>({...p,di:t,df:t}));setPage(1)}}>Hoje</Btn>
        <Btn variant="ghost" className="text-[11px] py-1 px-2.5" onClick={()=>{
          const t=new Date(),w=new Date(t);w.setDate(t.getDate()-7)
          setFilters(p=>({...p,di:w.toISOString().split('T')[0],df:t.toISOString().split('T')[0]}));setPage(1)
        }}>7 dias</Btn>
        <Btn variant="ghost" className="text-[11px] py-1 px-2.5" onClick={()=>{ setFilters({op:'',bd:'',st:'',di:'',df:'',q:''}); setCtab('all'); setPage(1) }}>Limpar</Btn>
        <div className="flex-1"/>
        <input value={filters.q} onChange={e=>setF('q',e.target.value.toLowerCase())} placeholder="Buscar auth, NSU..."
          className="bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-dim placeholder-muted focus:outline-none focus:border-primary w-48" />
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 bg-bg2 p-1 rounded-xl border border-border w-fit flex-wrap">
        {[
          ['all','Todos',all.length,'bg-primary'],
          ['div','Divergências',tDiv,'bg-danger'],
          ['sop',viewMode==='sis2op'?'Só Sistema':'Só Operadora',tSO,'bg-purple-500'],
          ['aj','Ajustados',tAj,'bg-warn'],
          ['ok','Conciliados',tOk,'bg-primary'],
          ['ag','Agrupados',tAg,'bg-cyan-500'],
        ].map(([id,label,count,cbg])=>(
          <button key={id} onClick={()=>{setCtab(id);setPage(1)}}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5
              ${ctab===id ? 'bg-primary text-bg' : 'text-muted hover:text-dim hover:bg-bg3'}`}>
            {label}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${ctab===id ? 'bg-white/20 text-white' : cbg+'/20 text-'+cbg.replace('bg-','')}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Main table ── */}
      <div className="bg-bg2 border border-border rounded-xl overflow-hidden flex flex-col">

        {/* Table actions bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
          <span className="text-xs font-semibold text-dim">{filtered.length} registros</span>
          {lastRecon && <span className="text-[10px] text-muted">• Última: {lastRecon}</span>}
          <div className="flex-1"/>
          <Btn variant="ghost" className="text-[11px] py-1" onClick={autoRound}>↻ Arredondar</Btn>
          <Btn variant="ghost" className={`text-[11px] py-1 ${grpMode ? 'border-primary/40 text-primary' : ''}`}
            onClick={()=>{setGrpMode(!grpMode);setGrpSel(new Set())}}>
            ☐ Agrupar
          </Btn>
          <Btn variant="primary" className="text-[11px] py-1" onClick={()=>setModals(p=>({...p,manual:{op:'cielo',auth:'',nsu:'',band:'Visa',mod:'Crédito à vista',dvo:'',dvs:'',dt:todayISO()}}))}>
            ＋ Manual
          </Btn>
        </div>

        {/* Grouping bar */}
        {grpMode && (
          <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b border-primary/20 text-xs">
            <span className="font-bold text-primary">☐ Modo agrupamento:</span>
            <span className="text-dim">{grpSel.size} selecionados</span>
            {grpSel.size > 0 && <span className="text-muted">Soma: {cur(grpTotal)}</span>}
            <div className="flex-1"/>
            <Btn variant="primary" className="py-1 text-[11px]" onClick={()=>{
              if (grpSel.size < 2) { toast('Selecione pelo menos 2', 'er'); return }
              const ids = [...grpSel]
              const rows = ids.map(id=>D.find(r=>r.i===id)).filter(Boolean)
              if (rows.some(r=>isLocked(r))) { toast('Linhas de dias fechados não podem ser agrupadas','er'); return }
              pushUndo('Agrupamento manual')
              const totalOp = rows.reduce((s,r)=>s+r.vo,0)
              const totalSis = rows.reduce((s,r)=>s+r.vs,0)
              const masterId = rows[0].i
              setD(p => p.map(r => {
                if (r.i === masterId) return { ...r, vo:Math.round(totalOp*100)/100, vs:Math.round(totalSis*100)/100, df:Math.round((totalOp-totalSis)*100)/100, nOp:rows.length, ag:`${rows.length}x manual`, gt:'manual', st:cst({...r,vo:totalOp,vs:totalSis,df:totalOp-totalSis}) }
                if (ids.includes(r.i) && r.i!==masterId) return { ...r, st:'agrupado', ag:`→ agrupado em ${rows[0].a}` }
                return r
              }))
              setGrpMode(false); setGrpSel(new Set())
              toast(`${rows.length} linhas agrupadas`, 'ok')
              lg('☐', `Agrupamento manual: ${rows.length} linhas → ${rows[0].a}`)
            }}>Agrupar selecionados</Btn>
            <Btn variant="ghost" className="py-1 text-[11px]" onClick={()=>{setGrpMode(false);setGrpSel(new Set())}}>Cancelar</Btn>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto" style={{maxHeight:'520px',overflowY:'auto'}}>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-bg sticky top-0 z-10">
                <th className="w-8 px-2 py-2 text-left">
                  {grpMode && <input type="checkbox" onChange={e=>{
                    const ids = pageData.map(r=>r.i)
                    setGrpSel(e.target.checked ? new Set([...grpSel,...ids]) : new Set([...grpSel].filter(id=>!ids.includes(id))))
                  }} />}
                </th>
                {[['o','Operadora'],['d','Data'],['a','Auth'],null,['n','NSU'],null,['b','Bandeira'],null,['m','Modalidade'],['c','Nº Cartão'],['vo','Vl.Op'],['vs','Vl.Sis'],['df','Dif.'],['st','Status']].map((col,i) => {
                  if (!col) return <th key={i} className="w-5 px-1 py-3" />
                  const [k,label] = col
                  return (
                    <th key={k} onClick={()=>sf(k)}
                      className={`px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted/80 cursor-pointer hover:text-dim whitespace-nowrap border-b border-white/[0.06] ${k==='vo'||k==='vs'||k==='df'?'text-right':''}`}>
  {label}{sort.k===k ? (sort.a?' ↑':' ↓') : ''}
                    </th>
                  )
                })}
                <th className="px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted/80 border-b border-white/[0.06]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr><td colSpan={16} className="py-16 text-center text-sm text-muted">
                  {activeD.length === 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-2xl">📂</span>
                      <span>Nenhuma transação carregada</span>
                      <span className="text-[11px] text-muted/60">
                        Importe a planilha da <strong className="text-dim">Cielo</strong> e/ou <strong className="text-dim">Rede</strong> e clique em ⚡ Conciliar
                      </span>
                    </div>
                  ) : 'Nenhum registro com esses filtros'}
                </td></tr>
              ) : pageData.map(r => {
                const lk = isLocked(r)
                const dc = r.df > 0 ? 'text-primary' : r.df < 0 ? 'text-danger' : 'text-muted'
                const rowBg = r.st==='divergente'||r.st==='arredondavel' ? 'bg-danger/[0.06] hover:bg-danger/[0.1]'
                  : r.st==='ajustado'||r.st==='arredondado' ? 'bg-warn/[0.06] hover:bg-warn/[0.1]'
                  : r.st==='somente_op' ? 'bg-purple-500/[0.06] hover:bg-purple-500/[0.1]'
                  : 'hover:bg-white/[0.025]'
                const chk = (v,ok) => v===undefined ? '' : ok
                  ? <span className="text-primary text-[10px]">✓</span>
                  : <span className="text-danger text-[10px]">✕</span>

                return (
                  <tr key={r.i} onDoubleClick={()=>setModals(p=>({...p,det:r}))}
                    className={`border-b border-white/[0.05] cursor-pointer transition-colors ${rowBg}`}>
                    <td className="px-3 py-2.5">
                      {grpMode ? <input type="checkbox" checked={grpSel.has(r.i)}
                        onChange={e=>{const s=new Set(grpSel);e.target.checked?s.add(r.i):s.delete(r.i);setGrpSel(s)}} />
                        : null}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-xs text-dim uppercase tracking-wide">{r.o}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-dim whitespace-nowrap">
                      {fmtDt(r.d)}
                      {lk && <span className="ml-1 text-muted text-[10px]">🔒</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">
                      {r.a}
                      {r.ag && r.nSis > 1 && (
                        <span className={`ml-1 text-[9px] font-bold px-1 py-0.5 rounded text-white ${r.gt==='parcela'?'bg-cyan-600':r.gt==='estorno'?'bg-danger':'bg-warn'}`}>
                          {r.nSis}x
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-2.5 text-center">{r.mt==='sem_match'?'':chk(r.va,r.va)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-dim">{r.n}</td>
                    <td className="px-1 py-2.5 text-center">{r.mt==='sem_match'?'':chk(r.vn,r.vn)}</td>
                    <td className="px-3 py-2.5 text-xs">{r.b}</td>
                    <td className="px-1 py-2.5 text-center">{r.mt==='sem_match'?'':chk(r.vb,r.vb)}</td>
                    <td className="px-3 py-2.5 text-xs text-dim max-w-[130px] truncate">{r.m?.substring(0,22)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-dim">{r.c?.slice(-4)&&`••••${r.c.slice(-4)}`}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-right text-dim">{cur(r.vo)}{r.nOp>1&&<span className="text-warn text-[10px]"> ({r.nOp}x)</span>}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-right text-dim">{cur(r.vs)}{r.nSis>1&&<span className="text-cyan-400 text-[10px]"> ({r.nSis}x)</span>}</td>
                    <td className={`px-3 py-2.5 font-mono text-xs text-right font-bold ${dc}`}>{cur(r.df)}</td>
                    <td className="px-2 py-2"><Pill status={r.st}/></td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1 items-center">
                        <button onClick={()=>setModals(p=>({...p,det:r}))} title="Detalhes"
                          className="w-7 h-7 rounded bg-bg3 border border-border text-muted hover:text-dim text-xs flex items-center justify-center">ℹ</button>
                        {!lk && (r.st==='divergente'||r.st==='arredondavel'||r.st==='somente_op') && (
                          <button onClick={()=>openAdj(r.i)} title="Ajustar"
                            className="w-7 h-7 rounded bg-warn/10 border border-warn/30 text-warn hover:bg-warn/20 text-xs flex items-center justify-center">⚡</button>
                        )}
                        {!lk && (r.st==='divergente'||r.st==='arredondavel') && (
                          <button onClick={()=>rnd1(r.i)} title="Arredondar"
                            className="w-7 h-7 rounded bg-bg3 border border-border text-muted hover:text-primary text-xs flex items-center justify-center">↻</button>
                        )}
                        {!lk && (r.st==='ajustado'||r.st==='arredondado') && (
                          <button onClick={()=>revert(r.i)} title="Reverter"
                            className="w-7 h-7 rounded bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 text-xs flex items-center justify-center">↩</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-bg border-t-2 border-border sticky bottom-0 z-10">
                  <td colSpan={11} className="px-3 py-2.5 font-semibold text-xs text-muted font-sans">
                    SUBTOTAL ({filtered.length} reg) · {stats.c} OK · {stats.d} div · {stats.so} s/op
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs font-bold text-right text-primary">{cur(stats.sO)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-bold text-right text-cyan-400">{cur(stats.sS)}</td>
                  <td className={`px-3 py-2.5 font-mono text-xs font-bold text-right ${stats.dt>0?'text-primary':stats.dt<0?'text-danger':'text-muted'}`}>{cur(stats.dt)}</td>
                  <td colSpan={2}/>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
          <span className="text-[10px] text-muted">{(page-1)*PS+1}–{Math.min(page*PS,filtered.length)} de {filtered.length}</span>
          <div className="flex gap-1">
            {page>1 && <button onClick={()=>setPage(p=>p-1)} className="px-2 py-1 rounded bg-bg3 border border-border text-xs text-muted hover:text-dim">‹</button>}
            {Array.from({length:Math.min(7,totalPages)},(_,i)=>{
              const p=Math.max(1,Math.min(page-3,totalPages-6))+i
              return p<=totalPages ? (
                <button key={p} onClick={()=>setPage(p)} className={`px-2 py-1 rounded border text-xs ${p===page?'bg-primary text-bg border-primary':'bg-bg3 border-border text-muted hover:text-dim'}`}>{p}</button>
              ) : null
            })}
            {page<totalPages && <button onClick={()=>setPage(p=>p+1)} className="px-2 py-1 rounded bg-bg3 border border-border text-xs text-muted hover:text-dim">›</button>}
          </div>
        </div>
      </div>

      {/* ── Summary bar ── */}
      <div className="grid grid-cols-5 gap-3 bg-bg2 border border-border rounded-xl p-4">
        {[
          ['Total Operadoras', cur(stats.sO), 'text-primary'],
          ['Total Sistema',    cur(stats.sS), 'text-cyan-400'],
          ['Diferença Bruta',  cur(stats.sO-stats.sS), 'text-danger'],
          ['Ajustes',          cur(D.filter(r=>r.ajuste).reduce((s,r)=>s+(r.ajuste?.vaj||0),0)), 'text-warn'],
          ['Dif. Final',       cur((stats.sO-stats.sS)-D.filter(r=>r.ajuste).reduce((s,r)=>s+(r.ajuste?.vaj||0),0)), 'text-primary'],
        ].map(([label,val,cls])=>(
          <div key={label} className="text-center">
            <div className="text-[9px] text-muted uppercase tracking-wider mb-1">{label}</div>
            <div className={`font-mono text-sm font-bold ${cls}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* ── Days summary ── */}
      <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-xs font-bold text-dim">📅 Resumo por Dia</h3>
          <div className="flex gap-2">
            {lockedUntil && (
              <span className="text-[10px] text-primary font-semibold">Conciliado até {fmtDt(lockedUntil)}</span>
            )}
            <Btn variant="ghost" className="text-[11px] py-0.5"
              onClick={()=>{ if(!lockedUntil){toast('Nenhum dia fechado','in');return} setModals(p=>({...p,abrir:{dt:lockedUntil}})) }}>
              🔓 Abrir Dia
            </Btn>
          </div>
        </div>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="bg-bg sticky top-0 z-10">
              {['Status','Data','Trans.','OK','Div.','S/Op','Vl.Op','Vl.Sis','Diferença'].map(h=>(
                <th key={h} className="px-3 py-2 text-left text-[9px] font-bold uppercase text-muted border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {daysSummary.length === 0
                ? <tr><td colSpan={9} className="py-8 text-center text-muted text-xs">Sem dados</td></tr>
                : daysSummary.map(d=>(
                  <tr key={d.dt} onClick={()=>setFilters(p=>({...p,di:d.dt,df:d.dt}))}
                    className={`border-b border-border/30 cursor-pointer hover:bg-bg3 transition-colors ${d.lk?'opacity-60':''}`}>
                    <td className="px-3 py-1.5 font-sans">
                      {d.lk ? <span className="text-primary text-[10px] font-bold">🔒 Fechado</span>
                        : d.div>0 ? <span className="text-danger text-[10px] font-bold">⏳ Pendente</span>
                        : <span className="text-muted text-[10px]">◯ Aberto</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono">{fmtDt(d.dt)}</td>
                    <td className="px-3 py-1.5 text-right">{d.total}</td>
                    <td className="px-3 py-1.5 text-right text-primary">{d.ok}</td>
                    <td className="px-3 py-1.5 text-right text-danger">{d.div}</td>
                    <td className="px-3 py-1.5 text-right text-purple-400">{d.so}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{cur(d.sO)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-muted">{cur(d.sS)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono font-bold ${d.sO-d.sS>0?'text-primary':d.sO-d.sS<0?'text-danger':'text-muted'}`}>{cur(d.sO-d.sS)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Audit log ── */}
      <div className="bg-bg2 border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-xs font-bold text-dim">📋 Auditoria</div>
        <div className="max-h-36 overflow-y-auto">
          {AL.length === 0
            ? <div className="py-6 text-center text-xs text-muted">Nenhuma ação registrada</div>
            : AL.map(l=>(
              <div key={l.id} className="flex items-center gap-3 px-4 py-1.5 hover:bg-bg3 text-xs">
                <span className="font-mono text-muted text-[10px] w-10 flex-shrink-0">{l.t}</span>
                <span>{l.ic}</span>
                <span className="text-muted" dangerouslySetInnerHTML={{__html:l.d}}/>
              </div>
            ))}
        </div>
      </div>

      {/* ═══════════════════════════════ MODALS ═══════════════════════════════ */}

      {/* Adjust modal */}
      <Modal show={!!modals.adj} onClose={()=>setModals(p=>({...p,adj:null}))} title="⚡ Ajuste">
        {modals.adj && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[['Op',modals.adj.rec.o.toUpperCase()],['Auth',modals.adj.rec.a],['Vl.Op',cur(modals.adj.rec.vo)],['Vl.Sis',cur(modals.adj.rec.vs)],['Dif.',cur(modals.adj.rec.df)],['Bandeira',modals.adj.rec.b]].map(([k,v])=>(
                <div key={k} className="bg-bg rounded-lg px-3 py-2">
                  <div className="text-[9px] text-muted uppercase">{k}</div>
                  <div className="font-mono text-xs font-semibold text-dim">{v}</div>
                </div>
              ))}
            </div>
            <Lbl>Tipo</Lbl>
            <Sel value={modals.adj.tipo||'aceitar_sistema'} onChange={e=>setModals(p=>({...p,adj:{...p.adj,tipo:e.target.value}}))}>
              <option value="aceitar_sistema">Aceitar Sistema</option>
              <option value="aceitar_operadora">Aceitar Operadora</option>
              <option value="arredondamento">Arredondamento</option>
              <option value="taxa">Ajuste Taxa</option>
              <option value="estorno">Estorno</option>
              <option value="manual">Valor Manual</option>
            </Sel>
            {(modals.adj.tipo||'aceitar_sistema')==='manual' && (
              <><Lbl>Valor</Lbl><Inp type="number" step="0.01" value={modals.adj.valor||''} onChange={e=>setModals(p=>({...p,adj:{...p.adj,valor:parseFloat(e.target.value)}}))} /></>
            )}
            <Lbl>Justificativa *</Lbl>
            <textarea value={modals.adj.just||''} onChange={e=>setModals(p=>({...p,adj:{...p.adj,just:e.target.value}}))}
              placeholder="Motivo do ajuste..."
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-dim focus:outline-none focus:border-primary resize-none h-16" />
            <div className="flex gap-2 justify-end mt-3">
              <Btn variant="ghost" onClick={()=>setModals(p=>({...p,adj:null}))}>Cancelar</Btn>
              <Btn variant="primary" onClick={saveAdj}>Aplicar</Btn>
            </div>
          </>
        )}
      </Modal>

      {/* Manual entry modal */}
      <Modal show={!!modals.manual} onClose={()=>setModals(p=>({...p,manual:null}))} title="＋ Lançamento Manual">
        {modals.manual && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl>Operadora</Lbl>
                <Sel value={modals.manual.op} onChange={e=>setModals(p=>({...p,manual:{...p.manual,op:e.target.value}}))}>
                  <option value="cielo">Cielo</option><option value="rede">Rede</option>
                  {customOps.map(o=><option key={o.slug} value={o.slug}>{o.name}</option>)}
                </Sel>
              </div>
              <div><Lbl>Data</Lbl><Inp type="date" value={modals.manual.dt} onChange={e=>setModals(p=>({...p,manual:{...p.manual,dt:e.target.value}}))}/></div>
              <div><Lbl>Autorização</Lbl><Inp value={modals.manual.auth} onChange={e=>setModals(p=>({...p,manual:{...p.manual,auth:e.target.value}}))}/></div>
              <div><Lbl>NSU</Lbl><Inp value={modals.manual.nsu} onChange={e=>setModals(p=>({...p,manual:{...p.manual,nsu:e.target.value}}))}/></div>
              <div><Lbl>Bandeira</Lbl>
                <Sel value={modals.manual.band} onChange={e=>setModals(p=>({...p,manual:{...p.manual,band:e.target.value}}))}>
                  {['Visa','Mastercard','Elo','Amex','Hipercard'].map(b=><option key={b}>{b}</option>)}
                </Sel>
              </div>
              <div><Lbl>Modalidade</Lbl><Inp value={modals.manual.mod} onChange={e=>setModals(p=>({...p,manual:{...p.manual,mod:e.target.value}}))}/></div>
              <div><Lbl>Vl. Operadora</Lbl><Inp type="number" step="0.01" value={modals.manual.dvo} onChange={e=>setModals(p=>({...p,manual:{...p.manual,dvo:e.target.value}}))}/></div>
              <div><Lbl>Vl. Sistema</Lbl><Inp type="number" step="0.01" value={modals.manual.dvs} onChange={e=>setModals(p=>({...p,manual:{...p.manual,dvs:e.target.value}}))}/></div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Btn variant="ghost" onClick={()=>setModals(p=>({...p,manual:null}))}>Cancelar</Btn>
              <Btn variant="primary" onClick={saveManual}>Adicionar</Btn>
            </div>
          </>
        )}
      </Modal>

      {/* Detail modal */}
      <Modal show={!!modals.det} onClose={()=>setModals(p=>({...p,det:null}))} title="ℹ Detalhes" width="max-w-lg">
        {modals.det && (() => { const r = modals.det; return (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[['Operadora',r.o.toUpperCase()],['Data',`${r.d} ${r.h}`],['Autorização',r.a],['NSU',r.n],
                ['Bandeira',r.b],['Modalidade',r.m||'-'],['Vl.Operadora',cur(r.vo)],['Vl.Sistema',cur(r.vs)],
                ['Diferença',cur(r.df)],['Taxa',cur(r.tx)],['Líquido',cur(r.vl)],['Nº Cartão',r.c||'-'],
                ['Nº Controle',r.sd||'-'],['Usuário',r.usr||'-'],['Hóspede',r.hp||'-'],['Match',r.mt||'-']].map(([k,v])=>(
                <div key={k} className="bg-bg rounded-lg px-3 py-2">
                  <div className="text-[9px] text-muted uppercase">{k}</div>
                  <div className="font-mono text-xs font-semibold text-dim truncate">{v}</div>
                </div>
              ))}
            </div>
            {r.bi && (
              <div className="mt-3 bg-bg rounded-lg p-3 text-xs">
                <div className="text-[9px] font-bold text-muted uppercase tracking-wider mb-2">🔍 Validação Cruzada</div>
                {[['Autorização',r.va],['NSU/Doc',r.vn],['Bandeira',r.vb],['Valor',r.df===0]].map(([k,ok])=>(
                  <div key={k} className="flex justify-between py-0.5">
                    <span className="text-muted">{k}</span>
                    <span className={ok?'text-primary font-bold':'text-danger font-bold'}>{ok?'✓ OK':'✕ Divergente'}</span>
                  </div>
                ))}
              </div>
            )}
            {r.ajuste && (
              <div className="mt-3 bg-warn/5 border border-warn/20 rounded-lg p-3 text-xs">
                <div className="text-warn font-bold text-[10px] mb-1">Ajuste aplicado</div>
                <div className="text-muted">{r.ajuste.tp} — {r.ajuste.justificativa}</div>
              </div>
            )}
            <div className="flex gap-2 justify-end mt-3">
              <Btn variant="ghost" onClick={()=>{
                const line=[r.o,r.d,r.a,r.n,r.b,r.m,r.vo,r.vs,r.df,r.c,r.sd,r.usr,r.st,r.hp].join('\t')
                navigator.clipboard?.writeText(line).then(()=>toast('Copiado','ok'))
              }}>📋 Copiar</Btn>
              <Btn variant="ghost" onClick={()=>setModals(p=>({...p,det:null}))}>Fechar</Btn>
            </div>
          </>
        )})()}
      </Modal>

      {/* Fechar dia modal */}
      <Modal show={!!modals.fechar} onClose={()=>setModals(p=>({...p,fechar:null}))} title="🔒 Fechar Dia">
        {modals.fechar && (() => {
          const dt = modals.fechar.dt
          const ac = activeD.filter(r=>r.st!=='agrupado'&&r.st!=='pix_ignorado'&&r.d&&r.d<=dt&&(!lockedUntil||r.d>lockedUntil))
          const dv = ac.filter(r=>r.st==='divergente'||r.st==='arredondavel').length
          const so = ac.filter(r=>r.st==='somente_op').length
          const ok = ac.filter(r=>r.st==='conciliado'||r.st==='arredondado'||r.st==='ajustado').length
          const canClose = ac.length > 0 && dv+so === 0
          return (
            <>
              <p className="text-xs text-muted mb-3">Ao fechar, as transações ficam travadas para edição.</p>
              <Lbl>Fechar até qual data?</Lbl>
              <Inp type="date" value={dt} onChange={e=>setModals(p=>({...p,fechar:{...p.fechar,dt:e.target.value}}))} />
              {dt && (
                <div className={`mt-2 p-3 rounded-lg text-xs border ${canClose?'bg-primary/5 border-primary/20':'bg-danger/5 border-danger/20'}`}>
                  <div>{ac.length} transações · <span className="text-primary">{ok} OK</span> · <span className="text-danger">{dv} div.</span> · <span className="text-purple-400">{so} s/match</span></div>
                  {dv+so > 0 && <div className="text-danger font-bold mt-1">⛔ Resolva {dv+so} pendência(s) antes de fechar</div>}
                  {canClose && <div className="text-primary font-bold mt-1">✓ Pronto para fechar</div>}
                </div>
              )}
              <Lbl>Observação</Lbl>
              <textarea value={modals.fechar.obs||''} onChange={e=>setModals(p=>({...p,fechar:{...p.fechar,obs:e.target.value}}))}
                placeholder="Ex: Dia OK, 2 ajustes..." rows={2}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-dim focus:outline-none focus:border-primary resize-none" />
              <div className="flex gap-2 justify-end mt-3">
                <Btn variant="ghost" onClick={()=>setModals(p=>({...p,fechar:null}))}>Cancelar</Btn>
                <Btn variant="primary" onClick={doFechar} className={canClose?'':'opacity-50 pointer-events-none'}>🔒 Confirmar</Btn>
              </div>
            </>
          )
        })()}
      </Modal>

      {/* Abrir dia modal */}
      <Modal show={!!modals.abrir} onClose={()=>setModals(p=>({...p,abrir:null}))} title="🔓 Abrir Dia Fechado">
        {modals.abrir && (
          <>
            <p className="text-xs text-muted mb-3">Desbloqueia dias fechados a partir da data selecionada.</p>
            <Lbl>Abrir a partir de qual data?</Lbl>
            <Inp type="date" value={modals.abrir.dt} onChange={e=>setModals(p=>({...p,abrir:{...p.abrir,dt:e.target.value}}))}
              min={(() => { const d = activeD.filter(r=>r.d).map(r=>r.d).sort(); return d[0]||'' })()}
              max={lockedUntil} />
            {modals.abrir.dt && (
              <div className="mt-2 p-3 bg-warn/5 border border-warn/20 rounded-lg text-xs text-warn">
                {activeD.filter(r=>r.d&&r.d>=modals.abrir.dt&&r.d<=lockedUntil).length} transações serão desbloqueadas
              </div>
            )}
            <div className="flex gap-2 justify-end mt-3">
              <Btn variant="ghost" onClick={()=>setModals(p=>({...p,abrir:null}))}>Cancelar</Btn>
              <Btn variant="warn" onClick={doAbrir}>🔓 Abrir</Btn>
            </div>
          </>
        )}
      </Modal>

      {/* Export modal */}
      <Modal show={!!modals.export} onClose={()=>setModals(p=>({...p,export:null}))} title="📥 Exportar Conciliação" width="max-w-lg">
        {modals.export && (() => {
          const ex = modals.export
          const dir = ex.dir ?? (viewMode === 'sis2op' ? 'sis2op' : 'op2sis')
          const src = dir === 'sis2op' ? DS : D
          const di = ex.di || '', df = ex.df || '', opFilter = ex.opFilter || ''
          const dates = src.filter(r=>r.d).map(r=>r.d).sort()
          const allOps = [...new Set(src.map(r=>r.o).filter(Boolean))].sort()
          let ac = src.filter(r=>r.st!=='agrupado'&&r.st!=='pix_ignorado')
          if (di) ac = ac.filter(r=>r.d>=di)
          if (df) ac = ac.filter(r=>r.d<=df)
          if (opFilter) ac = ac.filter(r=>r.o===opFilter)
          const nOk = ac.filter(r=>r.st==='conciliado'||r.st==='arredondado'||r.st==='ajustado').length
          const nDiv = ac.filter(r=>r.st==='divergente'||r.st==='arredondavel').length
          const dirLabel = dir === 'sis2op' ? 'Sistema → Operadora' : 'Operadora → Sistema'
          const upd = (k,v) => setModals(p=>({...p,export:{...p.export,[k]:v}}))
          const ChkBox = ({ k, label, icon }) => (
            <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all select-none
              ${ex[k]!==false ? 'border-primary/50 bg-primary/8 text-dim' : 'border-border bg-bg3 text-muted'}`}>
              <input type="checkbox" className="hidden" checked={ex[k]!==false} onChange={e=>upd(k,e.target.checked)} />
              <span className={`w-4 h-4 rounded border flex items-center justify-center text-[9px] font-bold flex-shrink-0
                ${ex[k]!==false ? 'bg-primary border-primary text-bg' : 'border-muted'}`}>{ex[k]!==false?'✓':'✗'}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide">{icon} {label}</span>
            </label>
          )
          return (
            <>
              <p className="text-xs text-muted mb-3">Escolha o período, conteúdo e formato.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Lbl>Direção da Conciliação</Lbl>
                  <Sel value={dir} onChange={e=>upd('dir',e.target.value)}>
                    <option value="op2sis">📋 Operadora → Sistema</option>
                    <option value="sis2op">🖥️ Sistema → Operadora</option>
                  </Sel>
                </div>
                <div>
                  <Lbl>Operadora</Lbl>
                  <Sel value={opFilter} onChange={e=>upd('opFilter',e.target.value)}>
                    <option value="">Todas operadoras</option>
                    {allOps.map(o=><option key={o} value={o}>{o.toUpperCase()}</option>)}
                  </Sel>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div><Lbl>Data Inicial</Lbl><Inp type="date" value={di} onChange={e=>upd('di',e.target.value)} /></div>
                <div><Lbl>Data Final</Lbl><Inp type="date" value={df} onChange={e=>upd('df',e.target.value)} /></div>
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {[
                  ['Hoje', ()=>{const t=todayISO();upd('di',t);setTimeout(()=>upd('df',t),0)}],
                  ['7 dias', ()=>{const t=todayISO();const s=new Date();s.setDate(s.getDate()-6);upd('di',s.toISOString().split('T')[0]);setTimeout(()=>upd('df',t),0)}],
                  ['Tudo', ()=>{upd('di',dates[0]||'');setTimeout(()=>upd('df',dates[dates.length-1]||''),0)}],
                  ['Usar filtros atuais', ()=>{upd('di',filters.di||dates[0]||'');setTimeout(()=>upd('df',filters.df||dates[dates.length-1]||''),0)}],
                ].map(([lbl,fn])=>(
                  <button key={lbl} onClick={fn} className="px-2.5 py-1 rounded-lg bg-bg3 border border-border text-[10px] text-dim hover:border-primary/50 hover:text-primary transition-all">{lbl}</button>
                ))}
              </div>
              <div className="mt-3 p-2.5 bg-bg rounded-lg border border-border text-[11px] text-muted leading-relaxed">
                <strong className="text-dim">{ac.length}</strong> transações ·{' '}
                <span className="text-primary">{nOk} OK</span> ·{' '}
                <span className="text-danger">{nDiv} diverg.</span> · {dirLabel} · período: {fmtDt(di) || '—'} a {fmtDt(df) || '—'}
              </div>
              <Lbl>Conteúdo do Arquivo</Lbl>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <ChkBox k="inclComp"   label="Conciliação Completa"  icon="📋" />
                <ChkBox k="soDiv"      label="Só Divergências"       icon="✕"  />
                <ChkBox k="inclResTot" label="Resumo Totais"         icon="📊" />
                <ChkBox k="inclResOp"  label="Resumo por Operadora"  icon="💳" />
                <ChkBox k="inclResDia" label="Resumo por Dia"        icon="📅" />
                <ChkBox k="inclFech"   label="Auditoria Fechamentos" icon="🔒" />
                <ChkBox k="inclLog"    label="Log de Ocorrências"    icon="📋" />
              </div>
              <div className="flex gap-2 justify-end">
                <Btn variant="ghost" onClick={()=>setModals(p=>({...p,export:null}))}>Cancelar</Btn>
                <Btn variant="primary" onClick={exportXlsx}>📊 Excel</Btn>
                <Btn variant="default" className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10" onClick={exportPdf}>📄 PDF</Btn>
                <Btn variant="default" onClick={printExport}>🖨️ Imprimir</Btn>
              </div>
            </>
          )
        })()}
      </Modal>

      {/* Add operadora modal */}
      <Modal show={!!modals.addOp} onClose={()=>setModals(p=>({...p,addOp:null}))} title="＋ Adicionar Operadora">
        <p className="text-xs text-muted mb-3">Cria um novo card de importação com parser genérico.</p>
        <Lbl>Nome da operadora</Lbl>
        <Inp value={modals.addOp?.name||''} placeholder="Ex: Stone, Getnet, PagSeguro..."
          onChange={e=>setModals(p=>({...p,addOp:{...p.addOp,name:e.target.value}}))} />
        <div className="flex gap-2 justify-end mt-4">
          <Btn variant="ghost" onClick={()=>setModals(p=>({...p,addOp:null}))}>Cancelar</Btn>
          <Btn variant="primary" onClick={()=>{
            const name = modals.addOp?.name?.trim()
            if (!name) { toast('Nome obrigatório','er'); return }
            const slug = name.toLowerCase().replace(/[^a-z0-9]/g,'')
            if (customOps.some(o=>o.slug===slug)) { toast('Já adicionada','er'); return }
            setCO(p=>[...p,{name,slug}])
            setModals(p=>({...p,addOp:null}))
            toast(`${name} adicionada`,'ok')
            lg('＋',`Operadora ${name} adicionada`)
          }}>Criar</Btn>
        </div>
      </Modal>

      {/* Empresa config modal */}
      <Modal show={!!modals.cfg} onClose={()=>setModals(p=>({...p,cfg:null}))} title="⚙ Configurações da Empresa">
        <Lbl>Nome da empresa</Lbl>
        <Inp value={empresaCfg.nome} onChange={e=>setEmpresa(p=>({...p,nome:e.target.value}))} />
        <Lbl>CNPJ</Lbl>
        <Inp value={empresaCfg.cnpj} onChange={e=>setEmpresa(p=>({...p,cnpj:e.target.value}))} />
        <Lbl>Descrição</Lbl>
        <Inp value={empresaCfg.desc} onChange={e=>setEmpresa(p=>({...p,desc:e.target.value}))} />
        <div className="flex gap-2 justify-end mt-4">
          <Btn variant="ghost" onClick={()=>setModals(p=>({...p,cfg:null}))}>Cancelar</Btn>
          <Btn variant="primary" onClick={()=>{setModals(p=>({...p,cfg:null}));toast('Configuração salva','ok')}}>Salvar</Btn>
        </div>
      </Modal>

      {/* Confirm dialog */}
      {confirm && <Confirm show {...confirm} />}

      {/* Toasts */}
      <Toasts list={toasts} />
    </div>
  )
}
