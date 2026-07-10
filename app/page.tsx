'use client'

import { useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, FileImage, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

export default function UploadPage() {
  const [submitterName, setSubmitterName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
      setError('')
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError('')
    }
  }

  const handleSubmit = async () => {
    if (!submitterName.trim()) {
      setError('请填写您的姓名')
      return
    }
    if (!projectName.trim()) {
      setError('请填写项目名称')
      return
    }
    if (!file) {
      setError('请选择要上传的报价单文件')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const ext = file.name.split('.').pop()?.toLowerCase()

      if (ext === 'xlsx' || ext === 'xls') {
        // Excel: 直接上传（代码引擎，秒出结果）
        const formData = new FormData()
        formData.append('file', file)
        formData.append('submitterName', submitterName)
        formData.append('projectName', projectName)

        const resp = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        const data = await resp.json()
        if (!resp.ok) throw new Error(data.error || '上传失败')
        setResult(data)

      } else {
        // 图片: 2步串联，每步独立API，避免Vercel 10秒超时
        const fileBuffer = await file.arrayBuffer()
        const base64 = Buffer.from(fileBuffer).toString('base64')
        const mimeType = file.type || 'image/png'
        const imageDataUri = `data:${mimeType};base64,${base64}`

        // Step 1: OCR + 结构化JSON（一步到位，约5-8秒）
        setLoading(true)
        const ocrResp = await fetch('/api/audit-image/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageDataUri }),
        })
        const ocrData = await ocrResp.json()
        if (!ocrResp.ok) throw new Error(ocrData.error || 'OCR识别失败')

        // Step 2: 规则审核+保存（约1-2秒）
        const finalResp = await fetch('/api/audit-image/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            structuredJson: ocrData.structuredJson,
            ocrText: ocrData.ocrText,
            submitterName,
            projectName,
            fileName: file.name,
          }),
        })
        const data = await finalResp.json()
        if (!finalResp.ok) throw new Error(data.error || '审核失败')
        setResult(data)
      }
    } catch (err: any) {
      setError(err.message || '处理失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const getFileIcon = () => {
    if (!file) return <Upload className="w-12 h-12 text-accent" />
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'xlsx' || ext === 'xls') return <FileSpreadsheet className="w-12 h-12 text-success" />
    if (ext === 'pdf') return <FileText className="w-12 h-12 text-danger" />
    return <FileImage className="w-12 h-12 text-warning" />
  }

  const resetForm = () => {
    setFile(null)
    setResult(null)
    setError('')
  }

  const renderErrorItem = (err: any, i: number) => {
    const isMajor = err.severity === 'major'
    return (
      <div
        key={i}
        className={`border-l-4 p-3 rounded ${
          isMajor
            ? 'bg-red-50 border-red-500 text-red-700'
            : 'bg-yellow-50 border-yellow-400 text-yellow-800'
        }`}
      >
        <p className="text-sm font-medium">{err.message}</p>
        {err.code && (
          <p className={`text-xs mt-1 ${isMajor ? 'text-red-400' : 'text-yellow-600'}`}>
            代码：{err.code}
          </p>
        )}
      </div>
    )
  }

  const auditResult = result?.auditResult
  const docErrors = auditResult?.documentLevel?.errors || []
  const lineErrors = auditResult?.lineItems?.errors || []
  const majorCount = [...docErrors, ...lineErrors].filter((e: any) => e.severity === 'major').length
  const minorCount = [...docErrors, ...lineErrors].filter((e: any) => e.severity === 'minor').length
  const hasMajor = majorCount > 0

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">报价单AI审核</h1>
          <p className="text-gray-600">上传报价单，自动审核数据完整性</p>
          <div className="mt-4 p-3 bg-white rounded-lg inline-block border border-gray-200">
            <img 
              src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://www.huazaizaojiashi.cn" 
              alt="扫码访问报价单审核"
              className="w-36 h-36 mx-auto"
            />
            <p className="text-xs text-gray-500 mt-2">扫码直接访问</p>
          </div>
        </div>

        {result?.debug && (
          <div className="mt-4 bg-gray-50 p-3 rounded-lg text-xs text-gray-500">
            <p>调试: 文件大小 {result.debug.fileSize} bytes | 类型: {result.debug.fileType}</p>
            <p className="mt-1">识别预览: {result.debug.extractedDataPreview || '(空)'}</p>
          </div>
        )}

        {!result ? (
          <div className="bg-white rounded-2xl shadow-xl p-6 animate-fade-in">
            {/* 信息填写 */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">您的姓名 *</label>
                <input
                  type="text"
                  value={submitterName}
                  onChange={e => setSubmitterName(e.target.value)}
                  placeholder="请输入您的姓名"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">项目名称 *</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="请输入项目名称"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition"
                />
              </div>
            </div>

            {/* 文件上传区域 */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragActive ? 'border-accent bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input
                id="file-input"
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv,.png,.jpg,.jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,image/png,image/jpeg"
                onChange={handleFileChange}
              />
              <div className="flex flex-col items-center">
                {getFileIcon()}
                {file ? (
                  <div className="mt-3">
                    <p className="font-medium text-gray-800">{file.name}</p>
                    <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <>
                    <p className="mt-3 font-medium text-gray-700">点击或拖拽上传报价单</p>
                    <p className="mt-1 text-sm text-gray-500">支持 Excel、图片格式（推荐Excel）</p>
                  </>
                )}
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="mt-4 flex items-center gap-2 text-danger bg-red-50 px-4 py-3 rounded-lg">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            )}

            {/* 提交按钮 */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full mt-6 bg-accent hover:bg-primary text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  AI审核中，图片识别需要15-30秒，请耐心等待...
                </>
              ) : (
                <>开始审核</>
              )}
            </button>
          </div>
        ) : (
          /* 审核结果展示 */
          <div className="bg-white rounded-2xl shadow-xl p-6 animate-fade-in">
            <div className="text-center mb-6">
              {!hasMajor && auditResult?.status === 'passed' ? (
                <div className="inline-flex items-center gap-2 bg-green-100 text-success px-4 py-2 rounded-full">
                  <CheckCircle className="w-6 h-6" />
                  <span className="font-bold text-lg">审核通过</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 bg-red-100 text-danger px-4 py-2 rounded-full">
                  <AlertCircle className="w-6 h-6" />
                  <span className="font-bold text-lg">审核未通过</span>
                </div>
              )}
              <p className="mt-2 text-gray-600">{auditResult?.summary}</p>
              {(majorCount > 0 || minorCount > 0) && (
                <div className="flex justify-center gap-4 mt-3">
                  {majorCount > 0 && (
                    <span className="text-sm text-red-600 font-medium">
                      {majorCount} 个重大错误
                    </span>
                  )}
                  {minorCount > 0 && (
                    <span className="text-sm text-yellow-600 font-medium">
                      {minorCount} 个轻微提醒
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 文档级问题 */}
            {docErrors.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-800 mb-2">📄 文档级问题</h3>
                <div className="space-y-2">
                  {docErrors.map(renderErrorItem)}
                </div>
              </div>
            )}

            {/* 行级问题 */}
            {lineErrors.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-800 mb-2">📋 明细行问题</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {lineErrors.map(renderErrorItem)}
                </div>
              </div>
            )}

            {/* 价格提醒 */}
            {auditResult?.priceCheck?.items && auditResult.priceCheck.items.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-800 mb-2">💰 价格参考（仅提醒，不退回）</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {auditResult.priceCheck.items
                    .filter((item: any) => item.status !== 'matched')
                    .map((item: any, i: number) => (
                      <div
                        key={i}
                        className={`border-l-4 p-3 rounded text-sm ${
                          item.status === 'deviation'
                            ? 'bg-yellow-50 border-yellow-400 text-yellow-800'
                            : 'bg-blue-50 border-blue-400 text-blue-800'
                        }`}
                      >
                        <p className="font-medium">
                          第{item.rowIndex}行：{item.name}
                          {item.status === 'deviation' ? (
                            <span>
                              {' '}报价 {item.quotedPrice.toFixed(2)} 元/件，内部参考价 {item.referencePrice.toFixed(2)} 元/件
                              ，{item.deviationPercent > 0 ? '偏高' : '偏低'} {Math.abs(item.deviationPercent)}%，请核实
                            </span>
                          ) : (
                            <span> 未在内部指导价表中找到匹配，请通过下方链接查询市场价进行比对</span>
                          )}
                        </p>
                        <a
                          href={item.searchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs underline mt-1 inline-block"
                        >
                          点击查询京东/天猫参考价 →
                        </a>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={resetForm}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                重新上传
              </button>
              <a
                href={`/result/${result.recordId}`}
                className="flex-1 bg-accent hover:bg-primary text-white font-semibold py-3 px-4 rounded-lg transition-colors text-center"
              >
                查看详情
              </a>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-center gap-4 mt-6">
          <p className="text-center text-xs text-gray-400">
            报价单AI审核系统 v2.0 · 数据安全存储
          </p>
          <a href="/qrcode" className="text-xs text-blue-600 hover:underline">
            生成二维码 →
          </a>
        </div>
      </div>
    </main>
  )
}