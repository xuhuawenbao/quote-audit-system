import { NextRequest, NextResponse } from 'next/server'
import { extractStructuredData } from '@/lib/bailian'

export async function POST(request: NextRequest) {
  try {
    const { ocrText } = await request.json()
    if (!ocrText) {
      return NextResponse.json({ error: '缺少OCR文本' }, { status: 400 })
    }

    const structuredJson = await extractStructuredData(ocrText)

    return NextResponse.json({ success: true, structuredJson })
  } catch (error: any) {
    console.error('[Extract] 失败:', error)
    return NextResponse.json(
      { error: '数据提取失败，请确认图片中的表格清晰可读' },
      { status: 500 }
    )
  }
}
