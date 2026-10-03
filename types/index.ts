export interface QuoteItem {
  rowIndex: number
  serialNo?: string
  name?: string
  spec?: string
  brand?: string
  unit?: string
  quantity?: number
  priceWithoutTax?: number
  taxRate?: number
  priceWithTax?: number
  amountWithoutTax?: number
  amountWithTax?: number
  isTotalRow?: boolean
  /** 品牌与规格共用一列（如"品牌/规格型号"），不单独报品牌缺失 */
  brandMerged?: boolean
}

export interface DocumentInfo {
  customerName?: string
  projectName?: string
  validityPeriod?: string
  editorName?: string
  contactName?: string
  contactPhone?: string
  title?: string
  filingDate?: string
}

export interface AuditError {
  code: string
  rowIndex?: number
  field?: string
  message: string
  severity: 'major' | 'minor'
  expected?: string
  actual?: string
}

export interface PriceDeviation {
  rowIndex: number
  name: string
  spec: string
  brand: string
  quotedPrice: number
  referencePrice?: number
  deviationPercent?: number
  searchUrl: string
  status: 'matched' | 'unmatched' | 'deviation'
}

export interface AuditResult {
  id: string
  status: 'passed' | 'failed'
  documentLevel: {
    customerNameValid: boolean
    projectNameValid: boolean
    validityPeriodValid: boolean
    editorNameValid: boolean
    contactValid: boolean
    contactPhoneValid: boolean
    placeholderReplaced: boolean
    filingDateValid: boolean
    errors: AuditError[]
  }
  lineItems: {
    totalLines: number
    validLines: number
    errors: AuditError[]
  }
  priceCheck?: {
    checked: boolean
    items: PriceDeviation[]
  }
  /**
   * 明细行（2026-10-03 起落库）。
   * 有了它才能做"同一物料跨项目价差"这类分析报告；
   * 更早的记录没有这个字段，明细补不回来。
   */
  items?: StoredQuoteItem[]
  summary: string
  createdAt: string
}

/** 落库保存的报价单明细行 */
export interface StoredQuoteItem {
  rowIndex: number
  name: string
  spec: string
  brand: string
  unit: string
  quantity: number | null
  priceWithoutTax: number | null
  taxRate: number | null
  priceWithTax: number | null
  amountWithTax: number | null
}

export interface QuoteRecord {
  id: string
  submitterName: string
  projectName: string
  fileName: string
  fileUrl?: string
  fileType: 'excel' | 'pdf' | 'image'
  auditResult: AuditResult
  createdAt: string
}

export interface PriceReference {
  id?: string
  category: string
  name: string
  spec: string
  brand: string
  unit: string
  price: number
  source: string
}
