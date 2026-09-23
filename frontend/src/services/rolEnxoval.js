/**
 * Rol de rouparia — o documento que acompanha a remessa e a lavanderia assina.
 *
 * Agrupa por tipo de peça, não por etiqueta: uma saída de 200 lençóis precisa
 * virar uma linha de "Lençol Casal — 200", que dá para conferir no balcão.
 * A lista de EPCs vai só para o Excel, numa aba separada, para auditoria.
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const SEM_TIPO = 'Não identificado'

export function agruparPorTipo(itens = []) {
  const mapa = new Map()
  for (const it of itens) {
    const nome = it.tipo_nome || SEM_TIPO
    mapa.set(nome, (mapa.get(nome) || 0) + 1)
  }
  return Array.from(mapa, ([item, quantidade]) => ({ item, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.item.localeCompare(b.item))
}

function rotulo(mov) {
  return mov.tipo_mov === 'SAIDA' ? 'SAÍDA PARA LAVANDERIA' : 'ENTRADA DA LAVANDERIA'
}

function nomeArquivo(mov, ext) {
  const tipo = mov.tipo_mov === 'SAIDA' ? 'saida' : 'entrada'
  const num  = String(mov.numero).padStart(4, '0')
  const data = (mov.criado_em || '').slice(0, 10).split('/').reverse().join('')
  return `rol_${tipo}_${num}_${data}.${ext}`
}

export function exportarRolPdf(mov, empresaNome = '') {
  const linhas = agruparPorTipo(mov.itens)
  const total  = linhas.reduce((s, l) => s + l.quantidade, 0)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const M = 16

  doc.setFontSize(14); doc.setFont('helvetica', 'bold')
  doc.text(`ROL DE ROUPARIA — ${rotulo(mov)}`, M, 18)

  doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  if (empresaNome) doc.text(empresaNome.toUpperCase(), M, 25)

  doc.setFontSize(9)
  doc.text(`Rol nº ${String(mov.numero).padStart(4, '0')}`, M, 32)
  doc.text(`Data: ${mov.criado_em || '—'}`, M + 45, 32)
  if (mov.responsavel) doc.text(`Responsável: ${mov.responsavel}`, M + 100, 32)

  autoTable(doc, {
    startY: 38,
    margin: { left: M, right: M },
    head: [['Item', 'Quantidade']],
    body: linhas.map(l => [l.item, l.quantidade]),
    foot: [['TOTAL', total]],
    styles:      { fontSize: 10, cellPadding: 2.5 },
    headStyles:  { fillColor: [30, 30, 40], textColor: 255 },
    footStyles:  { fillColor: [240, 240, 245], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 35 } },
    alternateRowStyles: { fillColor: [248, 248, 252] },
  })

  let y = doc.lastAutoTable.finalY + 10

  if (mov.observacoes) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold')
    doc.text('Observações:', M, y); y += 5
    doc.setFont('helvetica', 'normal')
    doc.text(doc.splitTextToSize(mov.observacoes, 180 - M), M, y)
    y += 12
  }

  // assinaturas: o comprovante de que a remessa foi entregue e recebida
  y = Math.max(y, 210)
  const largura = (210 - M * 2 - 20) / 2
  doc.setDrawColor(120)
  doc.line(M, y, M + largura, y)
  doc.line(M + largura + 20, y, M + largura * 2 + 20, y)
  doc.setFontSize(8)
  doc.text('Entregue por (nome e data)', M, y + 5)
  doc.text('Recebido por (nome e data)', M + largura + 20, y + 5)

  doc.setFontSize(7); doc.setTextColor(130)
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, M, 287)

  doc.save(nomeArquivo(mov, 'pdf'))
}

export function exportarRolExcel(mov, empresaNome = '') {
  const linhas = agruparPorTipo(mov.itens)
  const total  = linhas.reduce((s, l) => s + l.quantidade, 0)

  const resumo = [
    [`ROL DE ROUPARIA — ${rotulo(mov)}`],
    [empresaNome],
    [`Rol nº`, String(mov.numero).padStart(4, '0')],
    ['Data', mov.criado_em || ''],
    ['Responsável', mov.responsavel || ''],
    ['Observações', mov.observacoes || ''],
    [],
    ['Item', 'Quantidade'],
    ...linhas.map(l => [l.item, l.quantidade]),
    ['TOTAL', total],
  ]

  const wb = XLSX.utils.book_new()
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
  wsResumo['!cols'] = [{ wch: 34 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Rol')

  // aba de auditoria: etiqueta a etiqueta
  const etiquetas = [
    ['EPC', 'Item', 'Situação'],
    ...(mov.itens || []).map(it => [
      it.epc_lido,
      it.tipo_nome || SEM_TIPO,
      it.status_item === 'RECONHECIDA' ? 'Reconhecida' : 'Não cadastrada',
    ]),
  ]
  const wsEtiq = XLSX.utils.aoa_to_sheet(etiquetas)
  wsEtiq['!cols'] = [{ wch: 28 }, { wch: 34 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, wsEtiq, 'Etiquetas')

  XLSX.writeFile(wb, nomeArquivo(mov, 'xlsx'))
}
