import { NextRequest, NextResponse } from 'next/server'
import { getAllRecords, getRecordById } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      const record = await getRecordById(id)
      return NextResponse.json({ success: true, record })
    }

    const records = await getAllRecords(100)
    return NextResponse.json({ success: true, records })

  } catch (error: any) {
    console.error('Records API error:', error)
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    )
  }
}
