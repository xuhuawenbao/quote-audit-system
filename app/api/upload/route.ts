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

    // 仅处理Excel
    if (fileExt !== 'xlsx' && fileExt !== 'xls') {
      return NextResponse.json({
        error: '该接口仅支持Excel文件，图片请使用图片上传方式',
      }, { status: 400 })
    }

    const workbook = XLSX.read(fileBuffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

    const { items, doc } = parseExcelData(rows)

    // 规则引擎审核
    const auditResult = auditQuote(items, doc)

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
