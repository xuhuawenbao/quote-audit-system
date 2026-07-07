import { QuoteItem, DocumentInfo, AuditResult, AuditError } from '@/types'

// ========== 常量定义 ==========

/** 精度容差：差值 ≥ 0.005 视为计算错误 */
const PRECISION_TOLERANCE = 0.005

/** 列映射关键词（支持多种表头写法） */
const COLUMN_KEYWORDS: Record<string, string[]> = {
  serialNo: ['序号', '编号', 'No', 'NO', '项次'],
  name: ['名称', '商品名称', '项目名称', '材料名称', '品名', '内容', '工程内容'],
  spec: ['规格型号', '规格', '型号'],
  brand: ['品牌', '厂家', '厂商', '产地', '生产厂家', '品牌/厂家', '品牌产地'],
  unit: ['单位', '计量单位'],
  quantity: ['数量', '工程量', 'Qty'],
  priceWithoutTax: ['不含税单价', '未税单价', '单价(不含税)'],
  taxRate: ['税率', '税点', '税额'],
  priceWithTax: ['含税单价', '含税价', '单价(含税)'],
  amountWithoutTax: ['不含税金额', '未税金额', '不含税合价', '金额(不含税)'],
  amountWithTax: ['含税金额', '合价', '含税合价', '含税总价', '金额(含税)'],
}

/** 占位符关键词 */
const PLACEHOLDERS = ['***', 'xxx', 'XXX', '某某', '待定', '待填', '未填写']

/** 合计行关键词 */
const TOTAL_KEYWORDS = ['合计', '总计', '小计', 'SUM']

// ========== 主审核函数 ==========

export function auditQuote(items: QuoteItem[], doc: DocumentInfo, rawText?: string, skipCalcChecks?: boolean): AuditResult {
  const docErrors: AuditError[] = []
  const lineErrors: AuditError[] = []

  // ===== 文档级校验 =====

  // DOC001: 客户名称缺失（重大）
  // 校验：空值 或 提取的值明显不是公司名称（太短、含占位符）
  const customerName = (doc.customerName || '').trim()
  const isInvalidName = customerName === '' ||
    PLACEHOLDERS.some(p => customerName.includes(p)) ||
    customerName.length <= 1
  if (isInvalidName) {
    docErrors.push({
      code: 'DOC001',
      field: 'customerName',
      message: '客户名称未填写，请补充',
      severity: 'major',
    })
  }

  // DOC002: 项目名称缺失（重大）
  if (!doc.projectName || doc.projectName.trim() === '') {
    docErrors.push({
      code: 'DOC002',
      field: 'projectName',
      message: '项目名称未填写，请补充',
      severity: 'major',
    })
  }

  // DOC003: 占位符未替换（重大）
  // 同时检查结构化字段和原始OCR文本，防止LLM漏提取
  const allDocText = [
    doc.customerName, doc.projectName, doc.title,
    doc.editorName, doc.contactName, doc.contactPhone, doc.validityPeriod
  ].filter(Boolean).join(' ')
  const fullText = rawText ? `${allDocText} ${rawText}` : allDocText
  if (PLACEHOLDERS.some(p => fullText.includes(p))) {
    docErrors.push({
      code: 'DOC003',
      message: '报价单中存在占位符（***、xxx、某某等）未替换，请填写真实信息',
      severity: 'major',
    })
  }

  // DOC004: 报价有效期缺失（轻微）
  // 检查：字段为空，或提取的值明显不对（不含"有效"和天/月单位），且原始文本中也找不到有效表达
  const validityValue = (doc.validityPeriod || '').trim()
  const validityLooksValid = validityValue.length > 0 &&
    validityValue.includes('有效') &&
    /[天日月周年]/.test(validityValue)
  const hasValidityInRawText = rawText ? /有效[期内].{0,10}[\d一二三四五六七八九十]+\s*[天日月周年]/.test(rawText) : false

  if (!validityLooksValid && !hasValidityInRawText) {
    docErrors.push({
      code: 'DOC004',
      field: 'validityPeriod',
      message: '报价有效期未填写，建议补充',
      severity: 'minor',
    })
  }

  // DOC005: 编制人缺失（重大）
  if (!doc.editorName || doc.editorName.trim() === '') {
    docErrors.push({
      code: 'DOC005',
      field: 'editorName',
      message: '编制人未填写，请补充',
      severity: 'major',
    })
  }

  // DOC006: 联系人/电话缺失（重大）
  const hasContact = (doc.contactName && doc.contactName.trim() !== '') ||
                     (doc.contactPhone && doc.contactPhone.trim() !== '')
  if (!hasContact) {
    docErrors.push({
      code: 'DOC006',
      field: 'contactInfo',
      message: '联系人或联系电话未填写，请至少补充一项',
      severity: 'major',
    })
  }

  // DOC007: 填报日期缺失（重大）
  if (!doc.filingDate || doc.filingDate.trim() === '') {
    docErrors.push({
      code: 'DOC007',
      field: 'filingDate',
      message: '填报日期未填写，请补充',
      severity: 'major',
    })
  }

  // DOC008: 联系电话缺失（轻微提醒）
  // 独立校验，即使联系人已填，电话没填也应提醒
  // 增加 rawText 兜底：可能在合并单元格中，结构化提取遗漏了
  const phoneValue = (doc.contactPhone || '').trim()
  const hasPhoneInRawText = rawText ? /[电话手机Tel]\s*[：:]?\s*1[3-9]\d{9}/.test(rawText) : false
  if (!phoneValue && !hasPhoneInRawText) {
    docErrors.push({
      code: 'DOC008',
      field: 'contactPhone',
      message: '联系电话未填写，建议补充',
      severity: 'minor',
    })
  }

  // ===== 行级校验 =====

  let validLineCount = 0
  const dataItems = items.filter(item => !isEmptyRow(item) && !item.isTotalRow)
  const totalRow = items.find(item => item.isTotalRow)

  // 校验序号连续性
  const seqErrors = checkSequence(dataItems)
  lineErrors.push(...seqErrors)

  // 逐行校验
  for (const item of dataItems) {
    validLineCount++
    const rowIdx = item.rowIndex
    const rowErrors: AuditError[] = []

    // ITEM001: 名称缺失（重大）
    if (!item.name || item.name.trim() === '') {
      rowErrors.push({
        code: 'ITEM001',
        rowIndex: rowIdx,
        field: 'name',
        message: `第${rowIdx}行：名称未填写`,
        severity: 'major',
      })
    }

    // ITEM002: 品牌缺失（重大）—— 合并列时跳过，改为轻微提醒
    if (!item.brand || item.brand.trim() === '') {
      if (item.brandMerged) {
        rowErrors.push({
          code: 'ITEM002',
          rowIndex: rowIdx,
          field: 'brand',
          message: `第${rowIdx}行：品牌与规格共用一列，无法单独确认品牌信息，请核实`,
          severity: 'minor',
        })
      } else {
        rowErrors.push({
          code: 'ITEM002',
          rowIndex: rowIdx,
          field: 'brand',
          message: `第${rowIdx}行：品牌未填写`,
          severity: 'major',
        })
      }
    }

    // ITEM003: 规格型号缺失（重大）
    if (!item.spec || item.spec.trim() === '') {
      rowErrors.push({
        code: 'ITEM003',
        rowIndex: rowIdx,
        field: 'spec',
        message: `第${rowIdx}行：规格型号未填写`,
        severity: 'major',
      })
    }

    // ITEM004: 单位缺失（重大）
    if (!item.unit || item.unit.trim() === '') {
      rowErrors.push({
        code: 'ITEM004',
        rowIndex: rowIdx,
        field: 'unit',
        message: `第${rowIdx}行：单位未填写`,
        severity: 'major',
      })
    }

    // ITEM005: 数量缺失（重大）
    if (item.quantity === undefined || item.quantity === null || isNaN(item.quantity)) {
      rowErrors.push({
        code: 'ITEM005',
        rowIndex: rowIdx,
        field: 'quantity',
        message: `第${rowIdx}行：数量未填写或不是有效数字`,
        severity: 'major',
      })
    }

    // ITEM006: 不含税单价缺失（重大）
    if (item.priceWithoutTax === undefined || item.priceWithoutTax === null || isNaN(item.priceWithoutTax)) {
      rowErrors.push({
        code: 'ITEM006',
        rowIndex: rowIdx,
        field: 'priceWithoutTax',
        message: `第${rowIdx}行：不含税单价未填写或不是有效数字`,
        severity: 'major',
      })
    }

    // ITEM007: 税率缺失（无论能否反推都要报错）
    let effectiveTaxRate = item.taxRate
    if (item.taxRate === undefined || item.taxRate === null || isNaN(item.taxRate)) {
      // 尝试自动反推
      if (item.priceWithTax !== undefined && item.priceWithoutTax !== undefined &&
          !isNaN(item.priceWithTax) && !isNaN(item.priceWithoutTax) && item.priceWithoutTax !== 0) {
        effectiveTaxRate = item.priceWithTax / item.priceWithoutTax - 1
      }
      rowErrors.push({
        code: 'ITEM007',
        rowIndex: rowIdx,
        field: 'taxRate',
        message: `第${rowIdx}行：税率未填写`,
        severity: 'major',
      })
    }

    // ===== 计算校验（仅限Excel场景，OCR图片跳过因为数字精度不够）=====
    if (!skipCalcChecks) {
      const qty = item.quantity ?? 0
      const priceNoTax = item.priceWithoutTax ?? 0
      const priceTax = item.priceWithTax ?? 0
      const amountNoTax = item.amountWithoutTax ?? 0
      const amountTax = item.amountWithTax ?? 0
      const taxRate = effectiveTaxRate ?? 0

      // CALC001: 不含税金额 = 数量 × 不含税单价
      if (qty !== 0 && priceNoTax !== 0 && item.amountWithoutTax !== undefined) {
        const expected = qty * priceNoTax
        if (hasPrecisionError(expected, amountNoTax)) {
          rowErrors.push({
            code: 'CALC001',
            rowIndex: rowIdx,
            field: 'amountWithoutTax',
            message: `第${rowIdx}行：不含税金额计算错误，应为 ${expected.toFixed(2)}，实际为 ${amountNoTax.toFixed(2)}`,
            severity: 'major',
            expected: expected.toFixed(2),
            actual: amountNoTax.toFixed(2),
          })
        }
      }

      // CALC002: 含税单价 = 不含税单价 × (1+税率)
      if (priceNoTax !== 0 && taxRate !== 0 && item.priceWithTax !== undefined) {
        const expected = priceNoTax * (1 + taxRate)
        if (hasPrecisionError(expected, priceTax)) {
          rowErrors.push({
            code: 'CALC002',
            rowIndex: rowIdx,
            field: 'priceWithTax',
            message: `第${rowIdx}行：含税单价计算错误，应为 ${expected.toFixed(2)}，实际为 ${priceTax.toFixed(2)}`,
            severity: 'major',
            expected: expected.toFixed(2),
            actual: priceTax.toFixed(2),
          })
        }
      }

      // CALC003: 含税金额 = 数量 × 含税单价
      if (qty !== 0 && priceTax !== 0 && item.amountWithTax !== undefined) {
        const expected = qty * priceTax
        if (hasPrecisionError(expected, amountTax)) {
          rowErrors.push({
            code: 'CALC003',
            rowIndex: rowIdx,
            field: 'amountWithTax',
            message: `第${rowIdx}行：含税金额计算错误，应为 ${expected.toFixed(2)}，实际为 ${amountTax.toFixed(2)}`,
            severity: 'major',
            expected: expected.toFixed(2),
            actual: amountTax.toFixed(2),
          })
        }
      }
    }

    lineErrors.push(...rowErrors)
  }

  // ===== 合计行校验（仅Excel场景做合计校验，OCR跳过）=====
  if (totalRow) {
    const totalErrors = checkTotalRow(totalRow, dataItems, skipCalcChecks)
    lineErrors.push(...totalErrors)
  }

  // ===== 汇总 =====
  const allErrors = [...docErrors, ...lineErrors]
  const majorCount = allErrors.filter(e => e.severity === 'major').length
  const minorCount = allErrors.filter(e => e.severity === 'minor').length
  const hasMajor = majorCount > 0

  let summary: string
  if (hasMajor) {
    summary = `审核未通过，发现 ${majorCount} 个重大错误、${minorCount} 个轻微提醒，请修正后重新提交`
  } else if (minorCount > 0) {
    summary = `审核通过（有 ${minorCount} 个轻微提醒，建议优化）`
  } else {
    summary = '审核通过，报价单数据完整无误'
  }

  return {
    id: generateId(),
    status: hasMajor ? 'failed' : 'passed',
    documentLevel: {
      customerNameValid: !docErrors.some(e => e.code === 'DOC001'),
      projectNameValid: !docErrors.some(e => e.code === 'DOC002'),
      validityPeriodValid: !docErrors.some(e => e.code === 'DOC004'),
      editorNameValid: !docErrors.some(e => e.code === 'DOC005'),
      contactValid: !docErrors.some(e => e.code === 'DOC006'),
      contactPhoneValid: !docErrors.some(e => e.code === 'DOC008'),
      placeholderReplaced: !docErrors.some(e => e.code === 'DOC003'),
      filingDateValid: !docErrors.some(e => e.code === 'DOC007'),
      errors: docErrors,
    },
    lineItems: {
      totalLines: validLineCount,
      validLines: validLineCount - lineErrors.filter(e => e.severity === 'major' && e.rowIndex !== undefined).length,
      errors: lineErrors,
    },
    summary,
    createdAt: new Date().toISOString(),
  }
}

// ========== Excel 解析 ==========

export function parseExcelData(rows: any[][]): { items: QuoteItem[], doc: DocumentInfo } {
  const items: QuoteItem[] = []
  const doc: DocumentInfo = {}

  // 1. 识别文档级信息（逐格查找，不拼行）
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i]
    if (!row) continue

    // 找标题
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').trim()
      if (!cell) continue
      if (cell.includes('报价单') || cell.includes('报价表')) {
        if (!doc.title) doc.title = cell.slice(0, 50).replace(/[\r\n]+/g, '')
      }
    }

    // 找标签-值对：标签在某一列，值在右侧相邻列或同标签后冒号内
    for (let c = 0; c < row.length - 1; c++) {
      const cell = String(row[c] || '').trim()
      if (!cell) continue
      const nextCell = String(row[c + 1] || '').trim()

      // 客户名称：匹配"客户"或"甲方"或"业主"（去掉换行符）
      const cellClean = cell.replace(/[\r\n]+/g, '')
      if (/^(?:客户|甲方|业主)/.test(cellClean) && !doc.customerName) {
        // 优先级1: 冒号后的文字（如"客户名称：离公司"在同一单元格）
        const colonMatch = cellClean.match(/(?:客户|甲方|业主)(?:名称)?[：:]\s*(.{2,20})/)
        if (colonMatch) {
          const val = colonMatch[1].trim()
          if (val.length >= 2 && !PLACEHOLDERS.some(p => val.includes(p))) {
            doc.customerName = val
            continue
          }
        }
        // 优先级2: 右侧相邻单元格的值（如A1="客户名称", B1="离公司"）
        if (nextCell && nextCell.length >= 2 && !PLACEHOLDERS.some(p => nextCell.includes(p))) {
          doc.customerName = nextCell
          continue
        }
      }

      // 项目名称
      if (/^(?:项目|工程)/.test(cellClean) && !doc.projectName) {
        const colonMatch = cellClean.match(/(?:项目|工程)(?:名称)?[：:]\s*(.{2,30})/)
        if (colonMatch) {
          doc.projectName = colonMatch[1].trim()
          continue
        }
        if (nextCell && nextCell.length >= 2) {
          doc.projectName = nextCell
          continue
        }
      }

      // 有效期 — 支持"有效期10天"、"本报价单有效期10天"等混合写法
      if (/(?:有效[期内到]|截止日[期到])/.test(cellClean) && !doc.validityPeriod) {
        // 冒号格式：有效期：10天
        const colonMatch = cellClean.match(/(?:有效[期内到]|截止日[期到])[：:]\s*(.{1,20})/)
        if (colonMatch) {
          doc.validityPeriod = colonMatch[1].trim()
          continue
        }
        // 连续文字格式：有效期10天 / 本报价单有效期10天 → 提取后段
        const textMatch = cellClean.match(/有效[期内到]\s*(\d+[\.\d]*\s*[天日月周年])/)
        if (textMatch) {
          doc.validityPeriod = textMatch[0]
          continue
        }
        if (nextCell) {
          doc.validityPeriod = nextCell
          continue
        }
      }

      // 编制人
      if (/(?:编制|报价|制表)人/.test(cellClean) && !doc.editorName) {
        const colonMatch = cellClean.match(/(?:编制|报价|制表)人[：:]\s*(.{1,8})/)
        if (colonMatch) {
          doc.editorName = colonMatch[1].trim()
          continue
        }
        if (nextCell) {
          doc.editorName = nextCell
          continue
        }
      }

      // 联系人
      if (/联系人/.test(cellClean) && !doc.contactName) {
        const colonMatch = cellClean.match(/联系人[：:]\s*(.{1,8})/)
        if (colonMatch) {
          doc.contactName = colonMatch[1].trim()
          continue
        }
        if (nextCell) {
          doc.contactName = nextCell
          continue
        }
      }

      // 电话 — 同时检查当前单元格和右侧相邻单元格含数字的情况
      if (/(?:电话|手机|Tel|联系电话)/.test(cellClean) && !doc.contactPhone) {
        // 同一单元格冒号后
        const colonMatch = cellClean.match(/(?:电话|手机|Tel|联系电话)[：:]\s*([\d\-]{7,15})/)
        if (colonMatch) {
          doc.contactPhone = colonMatch[1].trim()
          continue
        }
        // 同一单元格内连续数字（无冒号，如"电话13026713315"）
        const bareMatch = cellClean.match(/(?:电话|手机|Tel|联系电话)\s*([\d\-]{7,15})/)
        if (bareMatch) {
          doc.contactPhone = bareMatch[1].trim()
          continue
        }
        if (nextCell) {
          const phoneVal = nextCell.replace(/[\s\-]/g, '')
          if (/[\d]{7,15}/.test(phoneVal)) {
            doc.contactPhone = nextCell
            continue
          }
        }
      }

      // 填报日期 — 同时匹配"日期"、"填报日期"、"报价日期"等
      if (/(?:填报|报价|编制)?日[期到]|日[期到]/.test(cellClean) && !doc.filingDate) {
        // 先尝试带前缀的（填报日期：）
        let colonMatch = cellClean.match(/(?:填报|报价|编制)日[期到]?[：:]\s*(.{2,20})/)
        if (colonMatch) {
          doc.filingDate = colonMatch[1].trim()
          continue
        }
        // 再尝试裸日期（日期：2026.7.6）
        colonMatch = cellClean.match(/日[期到]?[：:]\s*(.{2,20})/)
        if (colonMatch) {
          doc.filingDate = colonMatch[1].trim()
          continue
        }
        if (nextCell) {
          doc.filingDate = nextCell
          continue
        }
      }
    }
  }

  // 全文本回退：有效期可能在底部（如"本报价有效期7天"写在说明行），前10行没找到时全文搜索
  if (!doc.validityPeriod) {
    const fullText = rows.map(r => r.join(' ')).join('\n')
    const validityMatch = fullText.match(/(?:有效[期内到])[：:]?\s*(\d+[\.\d]*\s*[天日月周年])/)
    if (validityMatch) {
      doc.validityPeriod = validityMatch[0].trim()
    }
  }

  // 2. 找表头行
  const headerResult = findHeaderRow(rows)
  if (!headerResult) {
    return { items, doc }
  }

  const { headerRowIndex, columnMap } = headerResult

  // 3. 解析数据行
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(v => v === undefined || v === null || v === '')) continue

    // 判断是否为合计行
    const firstCell = String(row[0] || '').trim()
    const isTotalRow = TOTAL_KEYWORDS.some(k => firstCell.includes(k))

    // 解析各列
    const rawSpec = getCell(row, columnMap.spec)
    let rawBrand = getCell(row, columnMap.brand)

    // 品牌规格合并列（brand=-1）: 不设置品牌值，标记为合并列
    if (columnMap.brand === -1) {
      rawBrand = ''  // 不把规格值当品牌
    }

    const item: QuoteItem = {
      rowIndex: i - headerRowIndex,
      serialNo: getCell(row, columnMap.serialNo),
      name: getCell(row, columnMap.name),
      spec: rawSpec,
      brand: rawBrand,
      brandMerged: columnMap.brand === -1,
      unit: getCell(row, columnMap.unit),
      quantity: parseNumeric(getCell(row, columnMap.quantity)),
      priceWithoutTax: parseNumeric(getCell(row, columnMap.priceWithoutTax)),
      taxRate: parseNumeric(getCell(row, columnMap.taxRate)),
      priceWithTax: parseNumeric(getCell(row, columnMap.priceWithTax)),
      amountWithoutTax: parseNumeric(getCell(row, columnMap.amountWithoutTax)),
      amountWithTax: parseNumeric(getCell(row, columnMap.amountWithTax)),
      isTotalRow,
    }

    items.push(item)
  }

  return { items, doc }
}

// ========== 辅助函数 ==========

function findHeaderRow(rows: any[][]): { headerRowIndex: number; columnMap: Record<string, number> } | null {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i]
    if (!row) continue

    const columnMap: Record<string, number> = {}
    const matchedKeys = new Set<string>()
    let hasMergedBrandSpec = false

    for (let col = 0; col < row.length; col++) {
      const cellText = String(row[col] || '').trim()
      if (!cellText) continue

      // 清理换行符（表头可能有换行，如"税率\n(%)"）
      const cleanText = cellText.replace(/[\r\n]+/g, '')

      // 检测"品牌/规格型号"合并列
      if (cleanText.includes('品牌/规格') || cleanText.includes('品牌/型号')) {
        columnMap['spec'] = col
        hasMergedBrandSpec = true
        continue
      }

      for (const [key, keywords] of Object.entries(COLUMN_KEYWORDS)) {
        if (keywords.some(kw => cleanText.includes(kw))) {
          if (!columnMap[key]) {
            columnMap[key] = col
            matchedKeys.add(key)
          }
        }
      }
    }

    // 如果有"品牌/规格"合并列，标记brand为-1（表示无独立品牌列，不报缺失）
    if (hasMergedBrandSpec && !columnMap['brand']) {
      columnMap['brand'] = -1  // 特殊标记：品牌与规格合并在一列
    }

    // 至少匹配到核心列中的3个
    const coreColumns = ['name', 'spec', 'unit', 'quantity', 'priceWithoutTax']
    const matchedCore = coreColumns.filter(k => columnMap[k] !== undefined).length
    if (matchedCore >= 3) {
      return { headerRowIndex: i, columnMap }
    }
  }
  return null
}

function getCell(row: any[], colIndex: number | undefined): string {
  if (colIndex === undefined || colIndex < 0 || colIndex >= row.length) return ''
  const val = row[colIndex]
  return val === undefined || val === null ? '' : String(val).trim()
}

function parseNumeric(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined
  const str = String(val)
  // 百分比处理：如 "6%" → 0.06
  const hasPercent = str.includes('%')
  const cleaned = str.replace(/[,%\s]/g, '')
  const num = parseFloat(cleaned)
  if (isNaN(num)) return undefined
  return hasPercent ? Math.round((num / 100) * 10000) / 10000 : num
}

function isEmptyRow(item: QuoteItem): boolean {
  const coreFields = [item.name, item.spec, item.unit, item.priceWithoutTax]
  return coreFields.every(v => v === undefined || v === null || v === '')
}

function hasPrecisionError(expected: number, actual: number): boolean {
  // 先四舍五入到2位小数再比较，消除浮点运算误差
  const round2 = (n: number) => Math.round(n * 100) / 100
  return Math.abs(round2(expected) - round2(actual)) >= PRECISION_TOLERANCE
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

/** 校验序号连续性 */
function checkSequence(items: QuoteItem[]): AuditError[] {
  const errors: AuditError[] = []
  const validItems = items.filter(i => i.serialNo !== undefined && i.serialNo !== '')
  if (validItems.length === 0) return errors

  // 提取数字序号
  const seqNums: { rowIndex: number; num: number }[] = []
  for (const item of validItems) {
    const match = String(item.serialNo).match(/(\d+)/)
    if (match) {
      seqNums.push({ rowIndex: item.rowIndex, num: parseInt(match[1], 10) })
    }
  }

  if (seqNums.length === 0) return errors

  // 检查连续性
  seqNums.sort((a, b) => a.num - b.num)
  for (let i = 1; i < seqNums.length; i++) {
    if (seqNums[i].num !== seqNums[i - 1].num + 1) {
      // 找到断点
      const missingNums: number[] = []
      for (let n = seqNums[i - 1].num + 1; n < seqNums[i].num; n++) {
        missingNums.push(n)
      }
      if (missingNums.length > 0) {
        errors.push({
          code: 'SEQ001',
          message: `序号不连续，缺少序号：${missingNums.join('、')}`,
          severity: 'minor',
        })
      }
    }
  }

  return errors
}

/** 合计行校验 */
function checkTotalRow(totalRow: QuoteItem, dataItems: QuoteItem[], skipCalcCheck?: boolean): AuditError[] {
  const errors: AuditError[] = []

  // TOTAL001: 合计行缺少"合计"文字（轻微）
  const firstCell = totalRow.serialNo || ''
  if (!TOTAL_KEYWORDS.some(k => firstCell.includes(k))) {
    errors.push({
      code: 'TOTAL001',
      message: `合计行未标注"合计"字样，建议补充`,
      severity: 'minor',
    })
  }

  // CALC004/005: 合计校验（仅Excel场景）
  if (!skipCalcCheck) {
    // CALC004: 不含税合计校验
    if (totalRow.amountWithoutTax !== undefined) {
      const sumAmountNoTax = dataItems.reduce((sum, item) => {
        return sum + (item.amountWithoutTax || 0)
      }, 0)
      if (hasPrecisionError(sumAmountNoTax, totalRow.amountWithoutTax)) {
        errors.push({
          code: 'CALC004',
          message: `不含税合计错误：各行之和为 ${sumAmountNoTax.toFixed(2)}，合计行为 ${totalRow.amountWithoutTax.toFixed(2)}`,
          severity: 'major',
          expected: sumAmountNoTax.toFixed(2),
          actual: totalRow.amountWithoutTax.toFixed(2),
        })
      }
    }

    // CALC005: 含税合计校验
    if (totalRow.amountWithTax !== undefined) {
      const sumAmountTax = dataItems.reduce((sum, item) => {
        return sum + (item.amountWithTax || 0)
      }, 0)
      if (hasPrecisionError(sumAmountTax, totalRow.amountWithTax)) {
        errors.push({
          code: 'CALC005',
          message: `含税合计错误：各行之和为 ${sumAmountTax.toFixed(2)}，合计行为 ${totalRow.amountWithTax.toFixed(2)}`,
          severity: 'major',
          expected: sumAmountTax.toFixed(2),
          actual: totalRow.amountWithTax.toFixed(2),
        })
      }
    }
  }

  return errors
}
