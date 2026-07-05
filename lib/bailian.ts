const API_KEY = process.env.BAILIAN_API_KEY!
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

async function callChat(model: string, messages: ChatMessage[], temperature = 0.05, maxTokens = 4096) {
  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`百炼API错误: ${err}`)
  }
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || ''
}

/**
 * 一步到位：qwen-vl-ocr 直接识别图片并输出结构化JSON
 * 不再分 OCR + 提取两步，减少中间环节丢失文档信息
 */
export async function ocrToStructured(imageDataUri: string): Promise<{
  ocrText: string
  structuredJson: string
}> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一个报价单识别专家。请你直接看图片，输出JSON格式的识别结果。

【JSON格式要求】
{
  "doc": {
    "title": "报价单顶部标题，例如***报价单（保留***）",
    "customerName": "客户名称/甲方名称",
    "projectName": "项目名称",
    "validityPeriod": "报价有效期，如30天",
    "editorName": "编制人姓名",
    "contactName": "联系人姓名",
    "contactPhone": "联系电话"
  },
  "items": [
    {
      "rowIndex": 1,
      "serialNo": "序号",
      "name": "名称/商品名称",
      "spec": "规格型号",
      "brand": "品牌",
      "unit": "单位",
      "quantity": 数量（数字）,
      "priceWithoutTax": 不含税单价（数字）,
      "taxRate": 税率（0.13表示13%）,
      "priceWithTax": 含税单价（数字）,
      "amountWithoutTax": 不含税金额（数字）,
      "amountWithTax": 含税金额（数字）,
      "isTotalRow": 是否是合计行
    }
  ]
}

【要求】
- doc中每个字段：看图片，有什么填什么。没找到填空字符串""
- customerName：在表头找"客户""甲方""致"后面的文字，或者表头区域看起来像公司名称的文字都行
- projectName：在表头找"项目"后面的文字
- editorName：找"编制""制表""报价人"后面的文字
- contactName：找"联系人"后面的文字
- contactPhone：找"电话""手机""Tel"后面的数字
- validityPeriod：找"有效期"后面的文字，如"30天"
- items的每个字段：数字填数字(不要加引号)，找不到填null
- 不要编造数据
- 只输出JSON，不要任何解释文字`
    },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: imageDataUri }
        },
      ],
    },
  ]

  const raw = await callChat('qwen-vl-ocr', messages, 0.05, 4096)
  const clean = extractJsonFromText(raw)

  return {
    ocrText: raw,
    structuredJson: clean,
  }
}

/**
 * 兜底：从LLM原始输出或ocrText中直接提取文档信息
 * 当JSON里的doc字段为空时，用这个补充
 */
export function extractDocFromRawText(rawText: string, doc: Record<string, any>): Record<string, any> {
  const result = { ...doc }

  // 如果doc已经有完整信息，直接返回
  const allFilled = ['customerName', 'projectName'].every(f => result[f] && result[f].trim())
  if (allFilled) return result

  const text = rawText

  // 客户名称：找冒号后面的内容
  if (!result.customerName || !result.customerName.trim()) {
    const m = text.match(/(?:客户|甲方|致)[：:]\s*([^\n\r]{2,20})/)
    if (m) result.customerName = m[1].trim()
  }

  // 项目名称
  if (!result.projectName || !result.projectName.trim()) {
    const m = text.match(/(?:项目|工程)[名称]*[：:]\s*([^\n\r]{2,30})/)
    if (m) {
      const v = m[1].trim()
      if (!v.includes('项目') && !v.includes('名称')) result.projectName = v
    }
  }

  // 标题
  if (!result.title || !result.title.trim()) {
    const lines = text.split('\n')
    for (const line of lines) {
      if (line.includes('报价单') || line.includes('报价表')) {
        result.title = line.trim().substring(0, 50)
        break
      }
    }
  }

  // 编制人
  if (!result.editorName || !result.editorName.trim()) {
    const m = text.match(/(?:编制|制表|报价人)[：:]\s*([^\s，,。、\n\r]{1,8})/)
    if (m) result.editorName = m[1].trim()
  }

  // 联系人
  if (!result.contactName || !result.contactName.trim()) {
    const m = text.match(/(?:联系|联络)人[：:]\s*([^\s，,。、\d\n\r]{1,8})/)
    if (m) result.contactName = m[1].trim()
  }

  // 电话
  if (!result.contactPhone || !result.contactPhone.trim()) {
    const m = text.match(/(?:电话|手机|Tel)[：:]\s*([\d\-]{7,15})/)
    if (m) result.contactPhone = m[1].trim()
  }

  // 有效期 - 严格匹配，必须有"有效"二字
  if (!result.validityPeriod || !result.validityPeriod.trim()) {
    // 完整句子匹配
    const m = text.match(/(?:报价)?有效[期内到].{0,8}[\d一二三四五六七八九十]+\s*[天日月周年]/)
    if (m) {
      result.validityPeriod = m[0].trim().substring(0, 30)
    }
  }

  // 兜底校验：如果提取出来的值不含"有效"或不是天/月表达，清空
  if (result.validityPeriod && result.validityPeriod.trim()) {
    const v = result.validityPeriod.trim()
    const hasValid = v.includes('有效')
    const hasTimeUnit = /[天日月周年]/.test(v)
    if (!hasValid || !hasTimeUnit) {
      result.validityPeriod = ''
    }
  }

  return result
}

export function extractJsonFromText(text: string): string {
  if (typeof text !== 'string' || !text) return '{}'
  const cb = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (cb) {
    const j = cb[1].trim()
    if (j.startsWith('{') || j.startsWith('[')) return j
  }
  const jm = text.match(/\{[\s\S]*\}/)
  if (jm) return jm[0]
  return '{}'
}
