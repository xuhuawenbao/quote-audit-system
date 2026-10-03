import { NextRequest, NextResponse } from 'next/server'
import { getAllRecords, getRecordById } from '@/lib/supabase'

/**
 * 权限说明（2026-10-03 加固）：
 * - 带 id 的单条查询保持开放：上传人提交后要能立刻看到自己的审核结果，
 *   且 id 是随机 UUID，猜不到。
 * - 列表查询（后台用）必须带管理员密码，否则返回 401。
 *   之前 /api/records 无任何校验，任何人拿到网址就能拉走全部记录。
 */
function isAdmin(request: NextRequest): boolean {
  const key = request.headers.get('x-admin-key') || ''
  const expected = process.env.ADMIN_PASSWORD || ''
  return expected.length > 0 && key === expected
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      const record = await getRecordById(id)
      return NextResponse.json({ success: true, record })
    }

    if (!isAdmin(request)) {
      return NextResponse.json(
        { error: '需要管理员密码' },
        { status: 401 }
      )
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
