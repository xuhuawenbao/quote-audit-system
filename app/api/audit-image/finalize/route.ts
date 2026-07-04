import { NextRequest, NextResponse } from 'next/server'
import { auditQuote } from '@/lib/audit-engine'
import { checkPrices } from '@/lib/price-check'
import { extractJsonFromText, extractDocFromRawText } from '@/lib/bailian'
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
    let doc = parsed.doc || {}

    for (const item of items) {
      item.quantity = toNumber(item.quantity)
      item.priceWithoutTax = toNumber(item.priceWithoutTax)
      item.taxRate = toNumber(item.taxRate)
      item.priceWithTax = toNumber(item.priceWithTax)
      item.amountWithoutTax = toNumber(item.amountWithoutTax)
      item.amountWithTax = toNumber(item.amountWithTax)
    }

    // 兜底：如果LLM提取的doc字段为空，从原始OCR文本中直接提取
    if (ocrText) {
      const rawDoc = extractDocFromRawText(ocrText, doc)
      // 仅当LLM取不到时用OCR兜底结果覆盖
      const fields = ['customerName', 'projectName', 'title', 'editorName', 'contactName', 'contactPhone', 'validityPeriod']
      for (const field of fields) {
        if ((!doc[field] || !doc[field].trim()) && rawDoc[field] && rawDoc[field].trim()) {
          doc[field] = rawDoc[field]
        }
      }
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
