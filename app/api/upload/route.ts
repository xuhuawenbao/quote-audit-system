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

    // 遍历所有 Sheet，优先选择可见的 Sheet 中数据行最多的来审核
    // 支持同一 xlsx 文件包含隐藏的报价单+可见的结算单等场景
    let bestSheet = { items: [] as any[], doc: {} as any, rawText: '', sheetName: '', headerRowIndex: 0 as number, columnMap: {} as Record<string, number> }
    let bestDataCount = 0
    // 同时收集所有可见Sheet的原始文本（用于占位符等全文件检查）
    let allSheetsRawText = ''
    const sheetTypes: { name: string; type: '报价单' | '结算单' | '其他' }[] = []
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      // 跳过隐藏的 Sheet（如用户模板中隐藏的报价单底稿）
      if (sheet['!hidden'] || (sheet as any).sheet_state === 'hidden') continue
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as any[][]
      const { items, doc, headerRowIndex, columnMap } = parseExcelData(rows)
      // 记录该Sheet的类型（判断前三行是否含报价单/结算单标题）
      const sheetRawText = rows.slice(0, 5).map(r => r.join(' ')).join(' ')
      const isQuote = /报价[单表书]/.test(doc.title || '') || /报价[单表书]/.test(sheetRawText)
      const isSettle = /结算[单表书]/.test(doc.title || '') || /结算[单表书]/.test(sheetRawText)
      if (isQuote && !isSettle) sheetTypes.push({ name: sheetName, type: '报价单' })
      else if (isSettle && !isQuote) sheetTypes.push({ name: sheetName, type: '结算单' })
      else sheetTypes.push({ name: sheetName, type: '其他' })

      // 累加所有可见Sheet的原始文本（给DOC003做全文件占位符检查）
      allSheetsRawText += rows.map(r => r.join('\t')).join('\n') + '\n'

      // 跳过完全无法解析出数据行的 Sheet
      const dataItems = items.filter((i: any) => !i.isTotalRow && (i.name || i.quantity !== undefined))
      if (dataItems.length > bestDataCount) {
        bestDataCount = dataItems.length
        bestSheet = { items, doc, rawText: rows.map(r => r.join('\t')).join('\n'), sheetName, headerRowIndex: headerRowIndex ?? 0, columnMap: columnMap ?? {} }
      }
    }

    // 检查是否有混用（报价单文件附带了结算单Sheet，或反之）
    const selectedType = sheetTypes.find(t => t.name === bestSheet.sheetName)
    const oppositeTypes = sheetTypes.filter(t =>
      t.name !== bestSheet.sheetName &&
      ((selectedType?.type === '报价单' && t.type === '结算单') ||
       (selectedType?.type === '结算单' && t.type === '报价单'))
    )
    // 仅在主文档类型明确（报价单或结算单）、且确实存在反类型Sheet时报错
    const hasMixedSheets = oppositeTypes.length > 0 && (selectedType?.type === '报价单' || selectedType?.type === '结算单')

    const { items, doc } = bestSheet
    // 用所有可见Sheet的合并文本传给审核引擎（让DOC003等全文件检查能发现其他Sheet中的问题）
    const rawText = allSheetsRawText

    // 第一步：用原始数据审核（修正前，让审核引擎看到真实值）
    const auditResult = auditQuote(items, doc, rawText)

    // 过滤含税价/含税金额的公式缓存误报
    // Excel公式列（如含税单价=不含税单价*(1+税率)、含税金额=数量*含税单价）内部用未舍入精度计算，
    // 显示值经过四舍五入，用显示值反推必然产生微小差异（如6.102显示为6.10，50*6.102=305.10 vs 50*6.10=305.00）。
    // 因此：公式单元格的结果不校验（公式算出的值必然正确），只校验手动输入的单元格（真实计算错误保留）。
    const auditSheet = workbook.Sheets[bestSheet.sheetName]
    const isFormulaCell = (row: number, col: number | undefined): boolean => {
      if (col === undefined || col < 0) return false
      const addr = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = auditSheet[addr]
      return !!cell && typeof (cell as any).f === 'string'
    }
    auditResult.lineItems.errors = auditResult.lineItems.errors.filter(e => {
      if (e.code !== 'CALC002' && e.code !== 'CALC003') return true
      // 对应字段列号（CALC002校验含税单价列，CALC003校验含税金额列）
      const field = e.code === 'CALC002' ? 'priceWithTax' : 'amountWithTax'
      const col = bestSheet.columnMap[field]
      // CALC003的期望值依赖含税单价，含税单价若是公式列（未舍入精度），也会导致CALC003误报
      const priceWithTaxCol = bestSheet.columnMap['priceWithTax']
      // 该行对应的Excel实际行号（item.rowIndex从1开始，表头行偏移）
      const excelRow = bestSheet.headerRowIndex + (e.rowIndex ?? 0)
      // 公式单元格：结果为Excel自身计算，必然正确，过滤
      if (isFormulaCell(excelRow, col) || (e.code === 'CALC003' && isFormulaCell(excelRow, priceWithTaxCol))) {
        return false
      }
      // 手动输入单元格：按差异大小判断，差异 >= 0.1 视为真实计算错误，保留
      if (e.expected && e.actual) {
        const diff = Math.abs(parseFloat(e.actual) - parseFloat(e.expected))
        return diff >= 0.1
      }
      // 没有expected/actual信息的也过滤掉（无法判断是否为误报）
      return false
    })

    // DOC009: 文件包含混用的其他类型单据表（报价单+结算单混用）
    if (hasMixedSheets) {
      const oppositeNames = oppositeTypes.map(t => t.name).join('、')
      auditResult.documentLevel?.errors.push({
        code: 'DOC009',
        field: 'multiSheet',
        message: `文件包含${selectedType?.type === '报价单' ? '结算单' : '报价单'}表（${oppositeNames}），可能为误传或混用，请确认并移除`,
        severity: 'minor',
      })
    }
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
      // 明细行一并落库（2026-10-03）：只有结论没有明细，后面做不了
      // "同一物料跨项目价差"这类分析报告，所以把解析出的行都存下来。
      auditResult: {
        ...auditResult,
        id: auditResult.id || generateId(),
        items: items
          .filter((it: any) => !it.isTotalRow && (it.name || it.quantity !== undefined))
          .map((it: any) => ({
            rowIndex: it.rowIndex,
            name: it.name || '',
            spec: it.spec || '',
            brand: it.brand || '',
            unit: it.unit || '',
            quantity: it.quantity ?? null,
            priceWithoutTax: it.priceWithoutTax ?? null,
            taxRate: it.taxRate ?? null,
            priceWithTax: it.priceWithTax ?? null,
            amountWithTax: it.amountWithTax ?? null,
          })),
      },
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
