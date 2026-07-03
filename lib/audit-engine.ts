import { QuoteItem, AuditResult, AuditError, DocumentCheck } from '@/types'

/**
 * 报价单本地规则引擎
 * 严格按照 V1.0 规则文档执行审核
 * 作为LLM审核的兜底和校验层
 */

export function auditQuote(items: QuoteItem[], doc: DocumentCheck): AuditResult {
  const errors: AuditError[] = []
  const docErrors: AuditError[] = []

  // ========== 文档级校验 ==========
  
  // E004: 标题无效
  if (!doc.title || doc.title === '***' || doc.title.trim() === '') {
    docErrors.push({
      code: 'E004',
      message: '报价单标题为***或空，请填写有效标题',
      severity: 'error',
    })
  }

  // E005: 报价有效期未填
  if (!doc.validityPeriod || doc.validityPeriod.trim() === '') {
    docErrors.push({
      code: 'E005',
      message: '报价有效期未填写，请补充',
      severity: 'error',
    })
  }

  // ========== 行级校验 ==========
  
  let validLineCount = 0
  const lineErrors: AuditError[] = []

  for (const item of items) {
    // 跳过空行
    if (isEmptyRow(item)) {
      continue
    }

    validLineCount++
    const rowIdx = item.rowIndex

    // E006: 核心字段缺失
    const requiredFields = [
      { key: 'name', label: '商品名称', value: item.name },
      { key: 'spec', label: '规格型号', value: item.spec },
      { key: 'brand', label: '品牌', value: item.brand },
      { key: 'unit', label: '单位', value: item.unit },
      { key: 'quantity', label: '数量', value: item.quantity },
      { key: 'priceWithoutTax', label: '不含税单价', value: item.priceWithoutTax },
      { key: 'taxRate', label: '税率', value: item.taxRate },
      { key: 'priceWithTax', label: '含税单价', value: item.priceWithTax },
      { key: 'amountWithTax', label: '含税金额', value: item.amountWithTax },
    ]

    for (const field of requiredFields) {
      if (field.value === undefined || field.value === null || field.value === '') {
        lineErrors.push({
          code: 'E006',
          rowIndex: rowIdx,
          field: field.key,
          message: `第${rowIdx}行：${field.label}未填写`,
          severity: 'error',
        })
      }
    }

    // E003: 品牌未填写（单独校验，强调品牌独立性）
    if (!item.brand || item.brand.trim() === '') {
      // 检查是否已有E006报过错，避免重复
      const alreadyReported = lineErrors.some(
        e => e.rowIndex === rowIdx && e.field === 'brand' && e.code === 'E006'
      )
      if (!alreadyReported) {
        lineErrors.push({
          code: 'E003',
          rowIndex: rowIdx,
          field: 'brand',
          message: `第${rowIdx}行：品牌未填写，品牌字段必须独立填写，不能将规格型号内容误填`,
          severity: 'error',
        })
      }
    }

    // E001: 税率为空或非数字
    if (item.taxRate !== undefined && item.taxRate !== null) {
      const taxRateNum = parseFloat(String(item.taxRate))
      if (isNaN(taxRateNum)) {
        lineErrors.push({
          code: 'E001',
          rowIndex: rowIdx,
          field: 'taxRate',
          message: `第${rowIdx}行：税率识别为非数字，请确认`,
          severity: 'error',
        })
      }
    }

    // 税率自动反推（容错机制）
    let effectiveTaxRate = item.taxRate
    if ((item.taxRate === undefined || item.taxRate === null || isNaN(Number(item.taxRate))) 
        && item.priceWithTax && item.priceWithoutTax 
        && Number(item.priceWithoutTax) !== 0) {
      effectiveTaxRate = (Number(item.priceWithTax) / Number(item.priceWithoutTax)) - 1
    }

    // E002: 含税单价计算不符
    if (item.priceWithoutTax !== undefined && effectiveTaxRate !== undefined && item.priceWithTax !== undefined) {
      const expectedPriceWithTax = Number(item.priceWithoutTax) * (1 + Number(effectiveTaxRate))
      const actualPriceWithTax = Number(item.priceWithTax)
      
      if (Math.abs(expectedPriceWithTax - actualPriceWithTax) > 0.02) {
        lineErrors.push({
          code: 'E002',
          rowIndex: rowIdx,
          field: 'priceWithTax',
          message: `第${rowIdx}行：含税单价应为 ${expectedPriceWithTax.toFixed(2)}，实际为 ${actualPriceWithTax.toFixed(2)}`,
          severity: 'error',
        })
      }
    }

    // 含税金额验算
    if (item.priceWithTax !== undefined && item.quantity !== undefined && item.amountWithTax !== undefined) {
      const expectedAmount = Number(item.priceWithTax) * Number(item.quantity)
      const actualAmount = Number(item.amountWithTax)
      
      if (Math.abs(expectedAmount - actualAmount) > 0.02) {
        lineErrors.push({
          code: 'E002',
          rowIndex: rowIdx,
          field: 'amountWithTax',
          message: `第${rowIdx}行：含税金额应为 ${expectedAmount.toFixed(2)}，实际为 ${actualAmount.toFixed(2)}`,
          severity: 'error',
        })
      }
    }

    // 不含税金额验算（补充规则）
    if (item.priceWithoutTax !== undefined && item.quantity !== undefined) {
      const expectedAmountNoTax = Number(item.priceWithoutTax) * Number(item.quantity)
      // 如果存在不含税金额字段，也可以校验
    }
  }

  // 汇总
  const allErrors = [...docErrors, ...lineErrors]
  const hasErrors = allErrors.filter(e => e.severity === 'error').length > 0

  return {
    id: generateId(),
    status: hasErrors ? 'failed' : 'passed',
    documentLevel: {
      titleValid: !docErrors.some(e => e.code === 'E004'),
      validityPeriodValid: !docErrors.some(e => e.code === 'E005'),
      errors: docErrors,
    },
    lineItems: {
      totalLines: validLineCount,
      validLines: validLineCount - lineErrors.filter(e => e.severity === 'error').length,
      errors: lineErrors,
    },
    summary: hasErrors 
      ? `审核未通过，发现 ${allErrors.filter(e => e.severity === 'error').length} 个问题，请修正后重新提交`
      : '审核通过，报价单数据完整无误',
    createdAt: new Date().toISOString(),
  }
}

function isEmptyRow(item: QuoteItem): boolean {
  const coreFields = [
    item.name, item.spec, item.brand, item.unit,
    item.quantity, item.priceWithoutTax, item.priceWithTax, item.amountWithTax
  ]
  return coreFields.every(v => v === undefined || v === null || v === '')
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

/**
 * 解析Excel数据为标准格式
 */
export function parseExcelData(rows: any[][]): { items: QuoteItem[], doc: DocumentCheck } {
  const items: QuoteItem[] = []
  const doc: DocumentCheck = {}

  // 尝试识别标题（通常在前面几行）
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const row = rows[i]
    if (row && row[0] && typeof row[0] === 'string' && row[0].includes('报价')) {
      doc.title = row[0]
    }
  }

  // 找表头行
  let headerRowIndex = -1
  const headerKeywords = ['序号', '商品名称', '规格型号', '品牌', '单位', '数量', '单价']
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const rowText = row.join('')
    if (headerKeywords.every(k => rowText.includes(k))) {
      headerRowIndex = i
      break
    }
  }

  if (headerRowIndex === -1) {
    return { items, doc }
  }

  // 解析数据行
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(v => v === undefined || v === null || v === '')) continue

    items.push({
      rowIndex: i - headerRowIndex,
      serialNo: String(row[0] || ''),
      name: String(row[1] || ''),
      spec: String(row[2] || ''),
      brand: String(row[3] || ''),
      unit: String(row[4] || ''),
      quantity: parseNumeric(row[5]),
      priceWithoutTax: parseNumeric(row[6]),
      taxRate: parseNumeric(row[7]),
      priceWithTax: parseNumeric(row[8]),
      amountWithTax: parseNumeric(row[9]),
    })
  }

  return { items, doc }
}

function parseNumeric(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined
  const num = parseFloat(String(val).replace(/[,%]/g, ''))
  return isNaN(num) ? undefined : num
}
