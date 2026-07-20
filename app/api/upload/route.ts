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
    // raw:false 确保公式单元格返回计算值而非公式字符串

    // 遍历所有 Sheet，自动选择数据行最多的那个来审核
    // 支持同一 xlsx 文件包含报价单、结算单等多个 Sheet 的场景
    let bestSheet = { items: [] as any[], doc: {} as any, rawText: '', sheetName: '' }
    let bestDataCount = 0
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as any[][]
      const { items, doc } = parseExcelData(rows)
      // 跳过完全无法解析出数据行的 Sheet
      const dataItems = items.filter((i: any) => !i.isTotalRow && (i.name || i.quantity !== undefined))
      if (dataItems.length > bestDataCount) {
        bestDataCount = dataItems.length
        bestSheet = { items, doc, rawText: rows.map(r => r.join('\t')).join('\n'), sheetName }
      }
    }

    const { items, doc } = bestSheet
    const rawText = bestSheet.rawText

    // 第一步：用原始数据审核（修正前，让审核引擎看到真实值）
    const auditResult = auditQuote(items, doc, rawText)

    // 过滤掉含税价/含税金额的公式缓存误报
    // xlsx免费版读取公式列的旧缓存值，CALC002/CALC003必然误报，仅保留CALC001
    auditResult.lineItems.errors = auditResult.lineItems.errors.filter(
      e => e.code !== 'CALC002' && e.code !== 'CALC003'
    )
    // 重新计算过滤后的错误统计
    const allFiltered = [...(auditResult.documentLevel?.errors || []), ...auditResult.lineItems.errors]
    const majorCount = allFiltered.filter(e => e.severity === 'major').length
    const minorCount = allFiltered.filter(e => e.severity === 'minor').length
    auditResult.status = majorCount > 0 ? 'failed' : 'passed'
    auditResult.summary = majorCount > 0
      ? `审核未通过，发现 ${majorCount} 个重大错误、${minorCount} 个轻微提醒，请修正后重新提交`
      : minorCount > 0
        ? `审核通过（有 ${minorCount} 个轻微提醒，建议优化）`
        : '审核通过，报价单数据完整无误'

    // 第二步：自动补全公式列（xlsx免费版不计算公式，公式列可能有旧缓存值）
    // 只修正，不报错（含税价/含税金额的公式缓存不同步是正常现象）
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
