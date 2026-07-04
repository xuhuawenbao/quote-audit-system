import { NextRequest, NextResponse } from 'next/server'
import { ocrWithVL, extractStructuredData, extractJsonFromText } from '@/lib/bailian'
import { auditQuote } from '@/lib/audit-engine'
import { checkPrices } from '@/lib/price-check'
import { saveRecord } from '@/lib/supabase'

/**
 * 图片审核专用路由
 * 流程：OCR识别 → 结构化提取 → 规则引擎审核 → 价格比对
 * 使用 maxDuration=60 突破Vercel免费版10秒限制
 */

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { imageDataUri, submitterName, projectName, fileName } = await request.json()

    if (!imageDataUri || !submitterName || !projectName) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    // Step 1: OCR识别
    let ocrText: string
    try {
      ocrText = await ocrWithVL(imageDataUri)
    } catch (ocrErr: any) {
      console.error('[OCR] 识别失败:', ocrErr)
      return NextResponse.json({ error: '图片识别失败，请确认图片清晰后重试' }, { status: 500 })
    }

    // Step 2: 结构化提取
    let structuredJson: string
    try {
      structuredJson = await extractStructuredData(ocrText)
    } catch (extractErr: any) {
      console.error('[Extract] 结构化提取失败:', extractErr)
      return NextResponse.json({ error: '数据提取失败，请确认图片中的表格清晰可读' }, { status: 500 })
    }

    // Step 3: 解析JSON并审核
    let auditResult: any
    try {
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

      auditResult = auditQuote(items, doc, ocrText)

      // 价格比对
      try {
        const priceItems = await checkPrices(items)
        auditResult.priceCheck = { checked: true, items: priceItems }
      } catch {
        // 价格比对失败不影响主审核结果
      }
    } catch (parseErr: any) {
      console.error('[Parse] JSON解析失败:', parseErr)
      auditResult = {
        id: generateId(),
        status: 'failed',
        documentLevel: {
          customerNameValid: false,
          projectNameValid: false,
          validityPeriodValid: false,
          editorNameValid: false,
          contactValid: false,
          placeholderReplaced: false,
          errors: [{
            code: 'SYS001',
            message: '图片内容解析异常，建议上传Excel文件以获得更准确的审核结果',
            severity: 'major',
          }],
        },
        lineItems: { totalLines: 0, validLines: 0, errors: [] },
        summary: '图片解析异常，建议上传Excel文件',
        createdAt: new Date().toISOString(),
      }
    }

    // 保存记录
    const record = await saveRecord({
      submitterName,
      projectName,
      fileName: fileName || 'image.png',
      fileUrl: undefined,
      fileType: 'image',
      auditResult: { ...auditResult, id: auditResult.id || generateId() },
    })

    return NextResponse.json({
      success: true,
      recordId: record.id,
      auditResult,
      debug: { ocrPreview: ocrText.slice(0, 300) },
    })

  } catch (error: any) {
    console.error('Image audit error:', error)
    return NextResponse.json({ error: error.message || '审核处理失败' }, { status: 500 })
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

function toNumber(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined
  if (typeof val === 'number') return val
  const cleaned = String(val).replace(/[,%\s]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? undefined : num
}
