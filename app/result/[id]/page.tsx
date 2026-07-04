'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, AlertCircle, ArrowLeft, Calendar, User, FileText } from 'lucide-react'

export default function ResultPage() {
  const params = useParams()
  const id = params.id as string
  const [record, setRecord] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    fetch(`/api/records?id=${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setRecord(data.record)
        } else {
          setError(data.error || '记录不存在')
        }
      })
      .catch(() => setError('加载失败'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">加载中...</p>
        </div>
      </main>
    )
  }

  if (error || !record) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-danger mx-auto mb-4" />
          <p className="text-gray-600">{error || '记录不存在'}</p>
          <a href="/" className="mt-4 inline-block text-accent hover:underline">返回首页</a>
        </div>
      </main>
    )
  }

  const auditResult = record.audit_result
  const passed = auditResult?.status === 'passed'
  const docLevel = auditResult?.documentLevel || {}
  const docErrors = docLevel.errors || []
  const lineErrors = auditResult?.lineItems?.errors || []
  const majorCount = [...docErrors, ...lineErrors].filter((e: any) => e.severity === 'major').length
  const minorCount = [...docErrors, ...lineErrors].filter((e: any) => e.severity === 'minor').length

  const renderCheckItem = (label: string, valid: boolean) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      {valid ? (
        <span className="text-green-600 text-sm font-medium">✓ 已填写</span>
      ) : (
        <span className="text-red-500 text-sm font-medium">✗ 未填写</span>
      )}
    </div>
  )

  const renderErrorItem = (err: any, i: number) => {
    const isMajor = err.severity === 'major'
    return (
      <div
        key={i}
        className={`border-l-4 p-3 rounded text-sm ${
          isMajor
            ? 'bg-red-50 border-red-500 text-red-700'
            : 'bg-yellow-50 border-yellow-400 text-yellow-800'
        }`}
      >
        <p className="font-medium">{err.message}</p>
        {err.code && (
          <p className={`text-xs mt-1 ${isMajor ? 'text-red-400' : 'text-yellow-600'}`}>
            代码：{err.code}
          </p>
        )}
        {err.expected && err.actual && (
          <p className="text-xs mt-1">
            期望值：{err.expected} | 实际值：{err.actual}
          </p>
        )}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <a href="/" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" />
          返回上传页
        </a>

        {/* 审核结果卡片 */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* 顶部状态栏 */}
          <div className={`p-6 text-center ${passed ? 'bg-green-50' : 'bg-red-50'}`}>
            {passed ? (
              <CheckCircle className="w-16 h-16 text-success mx-auto mb-3" />
            ) : (
              <AlertCircle className="w-16 h-16 text-danger mx-auto mb-3" />
            )}
            <h1 className={`text-2xl font-bold ${passed ? 'text-success' : 'text-danger'}`}>
              {passed ? '审核通过' : '审核未通过'}
            </h1>
            <p className="mt-2 text-gray-600">{auditResult?.summary}</p>
            {(majorCount > 0 || minorCount > 0) && (
              <div className="flex justify-center gap-4 mt-3">
                {majorCount > 0 && (
                  <span className="text-sm text-red-600 font-medium">{majorCount} 个重大错误</span>
                )}
                {minorCount > 0 && (
                  <span className="text-sm text-yellow-600 font-medium">{minorCount} 个轻微提醒</span>
                )}
              </div>
            )}
          </div>

          {/* 基本信息 */}
          <div className="p-6 border-b">
            <h2 className="font-semibold text-gray-800 mb-4">提交信息</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">提交人：</span>
                <span className="text-sm font-medium">{record.submitter_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">项目：</span>
                <span className="text-sm font-medium">{record.project_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">时间：</span>
                <span className="text-sm font-medium">
                  {new Date(record.created_at).toLocaleString('zh-CN')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">文件：</span>
                <span className="text-sm font-medium">{record.file_name}</span>
              </div>
            </div>
          </div>

          {/* 文档级审核详情 */}
          <div className="p-6 border-b">
            <h2 className="font-semibold text-gray-800 mb-4">📄 文档级审核</h2>
            <div className="space-y-1">
              {renderCheckItem('客户名称', docLevel.customerNameValid)}
              {renderCheckItem('项目名称', docLevel.projectNameValid)}
              {renderCheckItem('报价有效期', docLevel.validityPeriodValid)}
              {renderCheckItem('编制人', docLevel.editorNameValid)}
              {renderCheckItem('联系人/电话', docLevel.contactValid)}
              {renderCheckItem('占位符已替换', docLevel.placeholderReplaced)}
            </div>
            {docErrors.length > 0 && (
              <div className="mt-3 space-y-2">
                {docErrors.map(renderErrorItem)}
              </div>
            )}
          </div>

          {/* 行级审核详情 */}
          <div className="p-6 border-b">
            <h2 className="font-semibold text-gray-800 mb-4">
              📋 明细行审核
              <span className="text-sm font-normal text-gray-500 ml-2">
                共 {auditResult?.lineItems?.totalLines || 0} 行
              </span>
            </h2>
            {lineErrors.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {lineErrors.map(renderErrorItem)}
              </div>
            ) : (
              <p className="text-success text-sm">所有明细行数据完整，计算正确</p>
            )}
          </div>

          {/* 价格参考 */}
          {auditResult?.priceCheck?.items && auditResult.priceCheck.items.length > 0 && (
            <div className="p-6">
              <h2 className="font-semibold text-gray-800 mb-4">💰 价格参考（仅提醒，不退回）</h2>
              <div className="space-y-2 max-h-80 overflow-y-auto">
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
                        {item.brand && `（${item.brand}）`}
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
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          报价单AI审核系统 v2.0 · 记录ID: {record.id}
        </p>
      </div>
    </main>
  )
}
