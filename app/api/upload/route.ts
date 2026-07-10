import { NextRequest, NextResponse } from 'next/server'
import { saveRecord } from '@/lib/supabase'
import { auditQuote, parseExcelData } from '@/lib/audit-engine'
import { checkPrices } from '@/lib/price-check'
import * as XLSX from 'xlsx'

/**
 * 上传审核路由（仅处理Excel文件）
 * 图片审核请使用 /api/audit-image
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const submitterName = formData.get('submitterName') as string
    const projectName = formData.get('projectName') as string

    if (!file || !submitterName || !projectName) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase()
    const fileBuffer = await file.arrayBuffer()

    // 仅处理Excel/CSV
    if (fileExt !== 'xlsx' && fileExt !== 'xls' && fileExt !== 'csv') {
      return NextResponse.json({
        error: '该接口仅支持Excel/CSV文件，图片请使用图片上传方式',
      }, { status: 400 })
    }

    const workbook = XLSX.read(fileBuffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    // raw:false 确保公式单元格返回计算值而非公式字符串
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as any[][]

    const { items, doc } = parseExcelData(rows)

    // 生成全文 rawText（用于有效期等底部信息的回退检测）
    const rawText = rows.map(r => r.join('\t')).join('\n')

    // 自动补全公式列：xlsx免费版不计算公式，且公式列可能有旧缓存值
    // 只要有不含税单价和税率，含税单价、含税金额一律用计算值
    for (const item of items) {
      if (item.isTotalRow) continue
      const qty = item.quantity
      const priceNoTax = item.priceWithoutTax
      const taxRate = item.taxRate

      // 不含税金额 = 数量 × 不含税单价（公式列，覆盖）
      if (qty !== undefined && priceNoTax !== undefined) {
        item.amountWithoutTax = Math.round(qty * priceNoTax * 100) / 100
      }
      // 含税单价 = 不含税单价 × (1+税率)（公式列，覆盖）
      if (priceNoTax !== undefined && taxRate !== undefined) {
        item.priceWithTax = Math.round(priceNoTax * (1 + taxRate) * 100) / 100
      }
      // 含税金额 = 数量 × 含税单价（公式列，覆盖）
      if (qty !== undefined && item.priceWithTax !== undefined) {
        item.amountWithTax = Math.round(qty * item.priceWithTax * 100) / 100
      }
    }

    // 规则引擎审核（传入 rawText 用于全文回退检测）
    const auditResult = auditQuote(items, doc, rawText)

    // 价格比对
    try {
      const priceItems = await checkPrices(items)
      auditResult.priceCheck = { checked: true, items: priceItems }
    } catch {
      // 价格比对失败不影响主审核结果
    }

    // 保存记录
    const record = await saveRecord({
      submitterName,
      projectName,
      fileName: file.name,
      fileUrl: undefined,
      fileType: 'excel',
      auditResult: { ...auditResult, id: auditResult.id || generateId() },
    })

    return NextResponse.json({
      success: true,
      recordId: record.id,
      auditResult,
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
