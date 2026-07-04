import { NextRequest, NextResponse } from 'next/server'
import { saveRecord } from '@/lib/supabase'
import { auditQuote, parseExcelData } from '@/lib/audit-engine'
import { ocrWithVL, extractStructuredData, extractJsonFromText } from '@/lib/bailian'
import { checkPrices } from '@/lib/price-check'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const submitterName = formData.get('submitterName') as string
    const projectName = formData.get('projectName') as string

    if (!file || !submitterName || !projectName) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    // 1. 读取文件内容
    const fileExt = file.name.split('.').pop()?.toLowerCase()
    const fileBuffer = await file.arrayBuffer()

    // 2. 判断文件类型并提取数据
    let fileType: 'excel' | 'pdf' | 'image' = 'image'
    let auditResult: any
    let extractedDataPreview = ''

    if (fileExt === 'xlsx' || fileExt === 'xls') {
      // ========== Excel：纯代码引擎，零AI调用 ==========
      fileType = 'excel'
      const workbook = XLSX.read(fileBuffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

      const { items, doc } = parseExcelData(rows)
      extractedDataPreview = JSON.stringify({ items: items.slice(0, 3), doc }, null, 2).slice(0, 500)

      // 本地规则引擎审核（18条规则）
      auditResult = auditQuote(items, doc)

      // 价格比对
      try {
        const priceItems = await checkPrices(items)
        auditResult.priceCheck = { checked: true, items: priceItems }
      } catch {
        // 价格比对失败不影响主审核结果
      }

    } else if (fileExt === 'pdf') {
      // ========== PDF：暂不支持，提示用户 ==========
      return NextResponse.json({
        error: 'PDF格式识别效果有限，建议上传Excel文件或拍照上传图片',
      }, { status: 400 })

    } else {
      // ========== 图片：OCR → 结构化提取 → 代码审核 ==========
      fileType = 'image'
      const fileBytes = Buffer.from(fileBuffer)
      const base64 = fileBytes.toString('base64')
      const mimeType = file.type || 'image/png'
      const dataUri = `data:${mimeType};base64,${base64}`

      // Step 1: OCR识别（qwen-vl-ocr）
      let ocrText: string
      try {
        ocrText = await ocrWithVL(dataUri)
        extractedDataPreview = ocrText.slice(0, 300)
      } catch (ocrErr: any) {
        console.error('[OCR] 识别失败:', ocrErr)
        return NextResponse.json({
          error: '图片识别失败，请确认图片清晰后重试',
        }, { status: 500 })
      }

      // Step 2: 结构化提取（qwen-plus：文本→JSON）
      let structuredJson: string
      try {
        structuredJson = await extractStructuredData(ocrText)
      } catch (extractErr: any) {
        console.error('[Extract] 结构化提取失败:', extractErr)
        return NextResponse.json({
          error: '数据提取失败，请确认图片中的表格清晰可读',
        }, { status: 500 })
      }

      // Step 3: 解析JSON并审核
      try {
        const jsonStr = extractJsonFromText(structuredJson)
        const parsed = JSON.parse(jsonStr)
        const items = parsed.items || []
        const doc = parsed.doc || {}

        // 数据清洗：确保数值类型正确
        for (const item of items) {
          item.quantity = toNumber(item.quantity)
          item.priceWithoutTax = toNumber(item.priceWithoutTax)
          item.taxRate = toNumber(item.taxRate)
          item.priceWithTax = toNumber(item.priceWithTax)
          item.amountWithoutTax = toNumber(item.amountWithoutTax)
          item.amountWithTax = toNumber(item.amountWithTax)
        }

        // 传入原始OCR文本，用于检测LLM可能漏掉的占位符
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
    }

    // 3. 保存记录到数据库
    const record = await saveRecord({
      submitterName,
      projectName,
      fileName: file.name,
      fileUrl: undefined,
      fileType,
      auditResult: {
        ...auditResult,
        id: auditResult.id || generateId(),
      },
    })

    return NextResponse.json({
      success: true,
      recordId: record.id,
      auditResult,
      debug: {
        fileSize: fileBuffer.byteLength,
        fileType,
        extractedDataPreview: extractedDataPreview || undefined,
      },
    })

  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error.message || '上传处理失败' },
      { status: 500 }
    )
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
