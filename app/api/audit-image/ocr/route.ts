import { NextRequest, NextResponse } from 'next/server'
import { ocrWithVL } from '@/lib/bailian'

export async function POST(request: NextRequest) {
  try {
    const { imageDataUri } = await request.json()
    if (!imageDataUri) {
      return NextResponse.json({ error: '缺少图片数据' }, { status: 400 })
    }

    const ocrText = await ocrWithVL(imageDataUri)

    return NextResponse.json({ success: true, ocrText })
  } catch (error: any) {
    console.error('[OCR] 失败:', error)
    return NextResponse.json(
      { error: '图片识别失败，请确认图片清晰后重试' },
      { status: 500 }
    )
  }
}
