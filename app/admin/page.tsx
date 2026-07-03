'use client'

import { useEffect, useState } from 'react'
import { Shield, LogOut, FileSpreadsheet, FileImage, FileText, CheckCircle, AlertCircle, Calendar, User } from 'lucide-react'

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<any>(null)
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    if (authenticated) {
      loadRecords()
    }
  }, [authenticated])

  const loadRecords = async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/records')
      const data = await resp.json()
      if (data.success) {
        setRecords(data.records)
      }
    } catch (err) {
      console.error('Failed to load records:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    setLoginError('')
    try {
      const resp = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await resp.json()
      if (data.success) {
        setAuthenticated(true)
      } else {
        setLoginError(data.error || '密码错误')
      }
    } catch {
      setLoginError('登录请求失败')
    }
  }

  const getFileIcon = (type: string) => {
    if (type === 'excel') return <FileSpreadsheet className="w-5 h-5 text-success" />
    if (type === 'pdf') return <FileText className="w-5 h-5 text-danger" />
    return <FileImage className="w-5 h-5 text-warning" />
  }

  const getStatusBadge = (status: string) => {
    if (status === 'passed') {
      return <span className="inline-flex items-center gap-1 bg-green-100 text-success px-2 py-1 rounded-full text-xs"><CheckCircle className="w-3 h-3" />通过</span>
    }
    return <span className="inline-flex items-center gap-1 bg-red-100 text-danger px-2 py-1 rounded-full text-xs"><AlertCircle className="w-3 h-3" />未通过</span>
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <Shield className="w-12 h-12 text-accent mx-auto mb-3" />
            <h1 className="text-xl font-bold text-primary">管理后台</h1>
            <p className="text-sm text-gray-500 mt-1">请输入密码进入</p>
          </div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent outline-none mb-2"
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          {loginError && (
            <p className="text-danger text-sm mb-3">{loginError}</p>
          )}
          <button
            onClick={handleLogin}
            className="w-full bg-accent hover:bg-primary text-white font-semibold py-3 rounded-lg transition-colors"
          >
            登录
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-accent" />
            <h1 className="text-xl font-bold text-primary">报价单审核后台</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={loadRecords}
              className="text-sm text-accent hover:underline"
            >
              刷新数据
            </button>
            <button
              onClick={() => { setAuthenticated(false); setPassword('') }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <LogOut className="w-4 h-4" />
              退出
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">总提交数</p>
            <p className="text-2xl font-bold text-primary">{records.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">审核通过</p>
            <p className="text-2xl font-bold text-success">
              {records.filter(r => r.audit_result?.status === 'passed').length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">审核未通过</p>
            <p className="text-2xl font-bold text-danger">
              {records.filter(r => r.audit_result?.status === 'failed').length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">通过率</p>
            <p className="text-2xl font-bold text-accent">
              {records.length > 0
                ? Math.round((records.filter(r => r.audit_result?.status === 'passed').length / records.length) * 100)
                : 0}%
            </p>
          </div>
        </div>

        {/* 记录列表 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">审核记录</h2>
            <span className="text-sm text-gray-500">共 {records.length} 条</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">加载中...</div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-gray-400">暂无记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">提交人</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">项目</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">文件</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">问题数</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(record.created_at).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{record.submitter_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{record.project_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getFileIcon(record.file_type)}
                          <span className="text-sm text-gray-600 truncate max-w-[120px]">{record.file_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(record.audit_result?.status)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {(record.audit_result?.documentLevel?.errors?.length || 0) +
                          (record.audit_result?.lineItems?.errors?.length || 0)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedRecord(record)}
                          className="text-sm text-accent hover:underline"
                        >
                          查看
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 详情弹窗 */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">审核详情</h3>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">提交人：</span>{selectedRecord.submitter_name}</div>
                  <div><span className="text-gray-500">项目：</span>{selectedRecord.project_name}</div>
                  <div><span className="text-gray-500">文件：</span>{selectedRecord.file_name}</div>
                  <div><span className="text-gray-500">时间：</span>{new Date(selectedRecord.created_at).toLocaleString('zh-CN')}</div>
                </div>
                <div className={`p-3 rounded-lg ${selectedRecord.audit_result?.status === 'passed' ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className={`font-medium ${selectedRecord.audit_result?.status === 'passed' ? 'text-success' : 'text-danger'}`}>
                    {selectedRecord.audit_result?.summary}
                  </p>
                </div>
                {selectedRecord.audit_result?.documentLevel?.errors?.length > 0 && (
                  <div>
                    <p className="font-medium text-sm mb-2">文档级问题：</p>
                    {selectedRecord.audit_result.documentLevel.errors.map((err: any, i: number) => (
                      <p key={i} className="text-sm text-danger">• {err.message}</p>
                    ))}
                  </div>
                )}
                {selectedRecord.audit_result?.lineItems?.errors?.length > 0 && (
                  <div>
                    <p className="font-medium text-sm mb-2">明细行问题：</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {selectedRecord.audit_result.lineItems.errors.map((err: any, i: number) => (
                        <p key={i} className="text-sm text-danger">• {err.message}</p>
                      ))}
                    </div>
                  </div>
                )}
                {selectedRecord.file_url && (
                  <a
                    href={selectedRecord.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm text-accent hover:underline"
                  >
                    下载原始文件
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
