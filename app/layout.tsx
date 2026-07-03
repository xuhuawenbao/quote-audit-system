import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '报价单AI审核系统',
  description: '智能报价单审核工具',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
