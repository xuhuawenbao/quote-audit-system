import { NextRequest, NextResponse } from 'next/server'
import { auditQuote } from '@/lib/audit-engine'
import { checkPrices } from '@/lib/price-check'
import { extractJsonFromText } from '@/lib/bailian'
import { saveRecord } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { structuredJson, ocrText, submitterName, projectName, fileName } = await request.json()

    if (!structuredJson || !submitterName || !projectName) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    const jsonStr = extractJsonFromText(structuredJson)
    const parsed = JSON.parse(jsonStr)
    const items = parsed.items || []
    const doc = parsed.doc || {}

    for (const item of items) {
      item.quantity = toNumber(item.quantity)
      item.priceWithoutTax = toNumber(item.priceWithoutTax)
      item.taxRate = toNumber(item.taxRate)
      item.priceWithTax = toNumber(item.priceWithTax)
      item.amountWithoutTax = toNumber(item.amountWithoutTax)
      item.amountWithTax = toNumber(item.amountWithTax)
    }

    const auditResult = auditQuote(items, doc, ocrText || '')

    try {
      const priceItems = await checkPrices(items)
      auditResult.priceCheck = { checked: true, items: priceItems }
    } catch {}

    const record = await saveRecord({
      submitterName,
      projectName,
      fileName: fileName || 'image.png',
      fileUrl: undefined,
      fileType: 'image',
      auditResult: { ...auditResult, id: auditResult.id || generateId() },
    })

    return NextResponse.json({ success: true, recordId: record.id, auditResult })
  } catch (error: any) {
    console.error('[Audit] 失败:', error)
    return NextResponse.json({ error: error.message || '审核失败' }, { status: 500 })
  }
}

function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 9) }

function toNumber(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined
  if (typeof val === 'number') return val
  const n = parseFloat(String(val).replace(/[,%\s]/g, ''))
  return isNaN(n) ? undefined : n
}
