import { createClient } from '@supabase/supabase-js'
import { QuoteRecord } from '@/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function saveRecord(record: Omit<QuoteRecord, 'id' | 'createdAt'>) {
  const { data, error } = await supabase
    .from('quote_records')
    .insert({
      submitter_name: record.submitterName,
      project_name: record.projectName,
      file_name: record.fileName,
      file_url: record.fileUrl,
      file_type: record.fileType,
      audit_result: record.auditResult,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getRecordById(id: string) {
  const { data, error } = await supabase
    .from('quote_records')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function getAllRecords(limit: number = 100, offset: number = 0) {
  // 支持翻页：工作台要把一年的记录拉下来做分析报告
  const { data, error } = await supabase
    .from('quote_records')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + Math.max(1, limit) - 1)

  if (error) throw error
  return data || []
}

export async function uploadFile(file: File, path: string) {
  const { data, error } = await supabase.storage
    .from('quote-files')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) throw error
  return data
}

export function getFileUrl(path: string) {
  const { data } = supabase.storage
    .from('quote-files')
    .getPublicUrl(path)
  return data.publicUrl
}
