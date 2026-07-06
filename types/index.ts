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
  summary: string
  createdAt: string
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
