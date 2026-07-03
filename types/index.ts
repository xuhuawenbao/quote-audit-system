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
  amountWithTax?: number
}

export interface DocumentCheck {
  title?: string
  validityPeriod?: string
  quoterName?: string
}

export interface AuditError {
  code: string
  rowIndex?: number
  field?: string
  message: string
  severity: 'error' | 'warning'
}

export interface AuditResult {
  id: string
  status: 'passed' | 'failed'
  documentLevel: {
    titleValid: boolean
    validityPeriodValid: boolean
    errors: AuditError[]
  }
  lineItems: {
    totalLines: number
    validLines: number
    errors: AuditError[]
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
