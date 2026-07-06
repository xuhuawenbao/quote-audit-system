'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Download, ArrowLeft } from 'lucide-react'

const DOMAIN = 'https://www.huazaizaojiashi.cn'

export default function QRCodePage() {
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    generateQR(DOMAIN)
  }, [])

  const generateQR = async (url: string) => {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: '#1e40af', light: '#ffffff' },
      })
      setQrDataUrl(dataUrl)
    } catch {
      // ignore
    }
  }

  const downloadQR = () => {
    if (!qrDataUrl) return
    const link = document.createElement('a')
    link.download = '报价单审核系统_二维码.png'
    link.href = qrDataUrl
    link.click()
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* 返回链接 */}
        <a href="/" className="inline-flex items-center gap-2 text-blue-600 hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" />
          返回上传页
        </a>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* 标题区 */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-center text-white">
            <h1 className="text-2xl font-bold">报价单AI审核系统</h1>
            <p className="mt-1 text-blue-100 text-sm">扫一扫 · 快速自核报价单</p>
          </div>

          {/* 二维码展示区 */}
          <div className="p-8 flex flex-col items-center">
            <div className="bg-white p-4 rounded-xl shadow-md border border-gray-200">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="系统二维码"
                  className="w-64 h-64"
                />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            <p className="mt-4 text-gray-500 text-sm text-center">
              当前二维码指向：{DOMAIN}
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="px-8 pb-8 flex gap-3">
            <button
              onClick={downloadQR}
              disabled={!qrDataUrl}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              下载二维码
            </button>
            <a
              href="/"
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors text-center"
            >
              返回首页
            </a>
          </div>

          {/* 使用说明 */}
          <div className="px-8 pb-8">
            <h3 className="font-semibold text-gray-800 mb-3 text-sm">使用说明</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">1.</span>
                <span>将二维码打印或发送给项目人员</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">2.</span>
                <span>对方扫码后打开报价单上传页面</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">3.</span>
                <span>上传报价单即可自动审核，结果实时反馈</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">4.</span>
                <span>支持 Excel 和图片格式，推荐使用 Excel</span>
              </li>
            </ul>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          报价单AI审核系统 v2.0
        </p>
      </div>
    </main>
  )
}