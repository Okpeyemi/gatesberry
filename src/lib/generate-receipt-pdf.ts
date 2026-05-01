import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const formatPrice = (n: number) =>
  new Intl.NumberFormat('fr-FR').format(n).replace(/[\u00A0\u202F]/g, ' ')

interface ReceiptData {
  fedapay_transaction_id: number | null
  amount: number
  amount_charged: number | null
  customer_phone: string
  customer_firstname: string | null
  customer_lastname: string | null
  customer_country: string | null
  provider: string | null
  created_at: string
  products: { name: string } | null
  payment_pages: { title: string } | null
}

const GRAY = rgb(140 / 255, 134 / 255, 128 / 255)
const BLACK = rgb(26 / 255, 22 / 255, 20 / 255)
const GREEN = rgb(22 / 255, 163 / 255, 74 / 255)
const LIGHT_GREEN_BG = rgb(236 / 255, 253 / 255, 245 / 255)
const LINE_COLOR = rgb(240 / 255, 237 / 255, 232 / 255)
const LINE_LIGHT = rgb(245 / 255, 243 / 255, 240 / 255)

export async function generateReceiptPdf(tx: ReceiptData, merchantName: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595.28, 841.89]) // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const { width, height } = page.getSize()
  const margin = 50
  const contentWidth = width - margin * 2
  let y = height - 60

  const customerName =
    [tx.customer_firstname, tx.customer_lastname].filter(Boolean).join(' ') || tx.customer_phone
  const dateStr = new Date(tx.created_at).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const timeStr = new Date(tx.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const product = (tx.products as any)?.name ?? '-'
  const pageName = (tx.payment_pages as any)?.title ?? '-'

  // ── Helper: centered text ──
  const drawCentered = (text: string, size: number, f: typeof font, color: typeof BLACK) => {
    const tw = f.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (width - tw) / 2, y, size, font: f, color })
  }

  // ── Header ──
  drawCentered('Recu de paiement', 20, fontBold, BLACK)
  y -= 22

  drawCentered(`${merchantName} - via Gatesberry`, 10, font, GRAY)
  y -= 20

  // Badge "Approuve"
  const badgeText = 'Approuve'
  const badgeFontSize = 9
  const badgeTw = fontBold.widthOfTextAtSize(badgeText, badgeFontSize)
  const badgePadX = 10
  const badgeW = badgeTw + badgePadX * 2
  const badgeH = 16
  const badgeX = (width - badgeW) / 2
  page.drawRectangle({ x: badgeX, y: y - 4, width: badgeW, height: badgeH, color: LIGHT_GREEN_BG, borderColor: LIGHT_GREEN_BG })
  page.drawText(badgeText, { x: badgeX + badgePadX, y: y, size: badgeFontSize, font: fontBold, color: GREEN })
  y -= 28

  // Separator
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: LINE_COLOR })
  y -= 20

  // ── Helpers ──
  const drawSectionTitle = (title: string) => {
    page.drawText(title.toUpperCase(), { x: margin, y, size: 8, font: fontBold, color: GRAY })
    y -= 16
  }

  const drawRow = (label: string, value: string) => {
    page.drawText(label, { x: margin, y, size: 10, font, color: GRAY })
    const vw = fontBold.widthOfTextAtSize(value, 10)
    page.drawText(value, { x: width - margin - vw, y, size: 10, font: fontBold, color: BLACK })
    y -= 6
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.3, color: LINE_LIGHT })
    y -= 12
  }

  // ── Transaction ──
  drawSectionTitle('Transaction')
  drawRow('Reference', `#${tx.fedapay_transaction_id ?? '-'}`)
  drawRow('Date', `${dateStr} a ${timeStr}`)
  drawRow('Produit', product)
  drawRow('Page de paiement', pageName)
  y -= 8

  // ── Client ──
  drawSectionTitle('Client')
  drawRow('Nom', customerName)
  drawRow('Telephone', tx.customer_phone)
  if (tx.customer_country) drawRow('Pays', tx.customer_country.toUpperCase())
  if (tx.provider) drawRow('Operateur', tx.provider.toUpperCase())
  y -= 8

  // ── Montant ──
  drawSectionTitle('Montant')
  drawRow('Prix du produit', `${formatPrice(tx.amount)} FCFA`)
  if (tx.amount_charged) {
    drawRow('Montant total (frais inclus)', `${formatPrice(tx.amount_charged)} FCFA`)
  }

  // Total line
  y -= 2
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: BLACK })
  y -= 20

  const totalLabel = 'Total paye'
  const totalValue = `${formatPrice(tx.amount_charged ?? tx.amount)} FCFA`
  page.drawText(totalLabel, { x: margin, y, size: 14, font: fontBold, color: BLACK })
  const tvw = fontBold.widthOfTextAtSize(totalValue, 14)
  page.drawText(totalValue, { x: width - margin - tvw, y, size: 14, font: fontBold, color: BLACK })
  y -= 40

  // ── Footer ──
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: LINE_COLOR })
  y -= 16

  const footer1 = 'Recu genere automatiquement par Gatesberry'
  const footer2 = 'Ce document fait foi de preuve de paiement.'
  drawCentered(footer1, 9, font, GRAY)
  y -= 14
  drawCentered(footer2, 9, font, GRAY)

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}
