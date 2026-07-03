import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()
    const correctPassword = process.env.ADMIN_PASSWORD

    if (!correctPassword) {
      return NextResponse.json(
        { error: '管理员密码未配置' },
        { status: 500 }
      )
    }

    if (password === correctPassword) {
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: '密码错误' },
      { status: 401 }
    )
  } catch {
    return NextResponse.json(
      { error: '请求格式错误' },
      { status: 400 }
    )
  }
}
