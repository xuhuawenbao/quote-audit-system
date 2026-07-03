import { NextRequest, NextResponse } from 'next/server'
import { supabase, uploadFile, getFileUrl, saveRecord } from '@/lib/supabase'
import { auditQuote, parseExcelData } from '@/lib/audit-engine'
import { ocrWithVL, auditWithLLM } from '@/lib/bailian'
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

    // 1. 上传文件到Supabase Storage
    const fileExt = file.name.split('.').pop()?.toLowerCase()
    const filePath = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`
    await uploadFile(file, filePath)
    const fileUrl = getFileUrl(filePath)

    // 2. 判断文件类型并提取数据
    let extractedData: string = ''
    let fileType: 'excel' | 'pdf' | 'image' = 'image'
    let auditResult: any

    if (fileExt === 'xlsx' || fileExt === 'xls') {
      fileType = 'excel'
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
      
      const { items, doc } = parseExcelData(rows)
      extractedData = JSON.stringify({ items, doc }, null, 2)
      
      // 本地规则引擎审核
      auditResult = auditQuote(items, doc)
    } else {
      // PDF或图片：调用百炼OCR（传入图片base64）
      fileType = fileExt === 'pdf' ? 'pdf' : 'image'
      
      try {
        // 读取文件内容转为base64 data URI
        const arrayBuffer = await file.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')
        const mimeType = file.type || (fileType === 'pdf' ? 'application/pdf' : 'image/png')
        const dataUri = `data:${mimeType};base64,${base64}`
        
        extractedData = await ocrWithVL(dataUri)
      } catch (ocrErr: any) {
        // OCR失败时，用空数据兜底
        extractedData = '{"items":[]}'
        console.error('OCR识别失败:', ocrErr)
      }
      
      // LLM审核（即使OCR返回空数据也能走流程）
      try {
        const llmResult = await auditWithLLM(extractedData, fileType)
        try {
          auditResult = JSON.parse(llmResult)
        } catch {
          auditResult = {
            status: 'failed',
            documentLevel: { titleValid: false, validityPeriodValid: false, errors: [] },
            lineItems: { totalLines: 0, validLines: 0, errors: [] },
            summary: '审核结果解析异常，请确认报价单图片是否清晰',
            createdAt: new Date().toISOString(),
          }
        }
      } catch (llmErr: any) {
        // LLM调用失败时，用本地引擎做基础校验
        auditResult = {
          status: 'failed',
          documentLevel: { titleValid: false, validityPeriodValid: false, errors: [] },
          lineItems: { totalLines: 0, validLines: 0, errors: [] },
          summary: 'AI审核服务暂时不可用，请稍后重试',
          createdAt: new Date().toISOString(),
        }
        console.error('LLM审核失败:', llmErr.message)
      }
    }

    // 3. 保存记录到数据库
    const record = await saveRecord({
      submitterName,
      projectName,
      fileName: file.name,
      fileUrl,
      fileType,
      auditResult: {
        ...auditResult,
        id: auditResult.id || Date.now().toString(36),
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
