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
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm">报价单标题</span>
                {auditResult?.documentLevel?.titleValid ? (
                  <span className="text-success text-sm font-medium">✓ 有效</span>
                ) : (
                  <span className="text-danger text-sm font-medium">✗ 无效</span>
                )}
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm">报价有效期</span>
                {auditResult?.documentLevel?.validityPeriodValid ? (
                  <span className="text-success text-sm font-medium">✓ 已填写</span>
                ) : (
                  <span className="text-danger text-sm font-medium">✗ 未填写</span>
                )}
              </div>
            </div>
            {auditResult?.documentLevel?.errors?.length > 0 && (
              <div className="mt-3 space-y-2">
                {auditResult.documentLevel.errors.map((err: any, i: number) => (
                  <div key={i} className="bg-red-50 border-l-4 border-danger p-3 rounded text-sm text-danger">
                    {err.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 行级审核详情 */}
          <div className="p-6">
            <h2 className="font-semibold text-gray-800 mb-4">
              📋 明细行审核 
              <span className="text-sm font-normal text-gray-500 ml-2">
                共 {auditResult?.lineItems?.totalLines || 0} 行
              </span>
            </h2>
            {auditResult?.lineItems?.errors?.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {auditResult.lineItems.errors.map((err: any, i: number) => (
                  <div key={i} className="bg-red-50 border-l-4 border-danger p-3 rounded">
                    <p className="text-sm text-danger">{err.message}</p>
                    <p className="text-xs text-gray-500 mt-1">错误代码：{err.code}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-success text-sm">所有明细行数据完整，计算正确</p>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          报价单AI审核系统 v1.0 · 记录ID: {record.id}
        </p>
      </div>
    </main>
  )
}
