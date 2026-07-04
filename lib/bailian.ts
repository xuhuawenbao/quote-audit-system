/**
 * 阿里云百炼 API 封装（OpenAI兼容模式）
 * OCR: qwen-vl-ocr（准确率更高的专用OCR模型）
 * 结构化: qwen-plus（只做文本→JSON转换，不做规则判断）
 */

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
 * 用 qwen-vl-ocr 识别图片中的报价单内容
 * 传入图片的 base64 data URI
 * 返回识别到的原始文本
 */
export async function ocrWithVL(imageDataUri: string): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: '你是一个专业的文档OCR识别助手。请准确识别图片中的文字和表格内容，保持原有格式输出。'
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `请识别这张报价单图片中的所有文字内容，包括表头、表尾信息、表格数据。要求：
1）保留表格的行列结构
2）识别所有数字（尤其是单价、数量、金额）
3）识别文档信息：报价单标题（注意是否有***、xxx、某某等占位符）、客户名称、项目名称、报价有效期（如"有效期30天""有效期至2026年8月1日"等）、编制人、联系人、联系电话
4）特别注意：有效期和报价日期是两个不同的字段，都要识别
5）直接输出识别到的文本，不要添加任何解释。`
        },
        {
          type: 'image_url',
          image_url: { url: imageDataUri }
        },
      ],
    },
  ]

  const result = await callChat('qwen-vl-ocr', messages, 0.05, 4096)
  return result
}

/**
 * 用 qwen-plus 将OCR文本整理为结构化JSON
 * 输出格式和 parseExcelData 完全一致：{ items: QuoteItem[], doc: DocumentInfo }
 */
export async function extractStructuredData(ocrText: string): Promise<string> {
  const systemPrompt = `你是一位报价单数据提取专家。你的任务是从OCR识别到的报价单文本中提取文档信息和明细数据，输出JSON。

【关键要求 - 必须遵守】
1. 客户名称(customerName) / 项目名称(projectName)：在报价单顶部的表头部分查找。客户名称通常在"客户""甲方""致"后面，项目名称通常在"项目""工程"后面。即使没有明确的关键词标签，只要看起来是客户名称或项目名都用。
2. 编制人(editorName)：在"编制""报价人""制表"等词后面查找。
3. 联系人(contactName) / 联系电话(contactPhone)：如果在表头区域出现"联系人"或名字+电话，提取出来。
4. 报价有效期(validityPeriod)：找"有效期""有效期为""有效日期"后面的文字，如"30天""2026年8月1日"等。如果没有独立的有效期字段但有一个报价日期，不要当有效期填。
5. title：报价单顶部第一行标题文字，如果包含***、xxx、某某等占位符，原样保留。
6. 每个doc字段如果找不到就留空字符串""，不要编造。

【输出格式 - 只输出JSON，不要任何解释、不要markdown代码块】
{
  "doc": {
    "title": "",
    "customerName": "",
    "projectName": "",
    "validityPeriod": "",
    "editorName": "",
    "contactName": "",
    "contactPhone": ""
  },
  "items": []
}

【items说明】
- 每一行商品对应一个对象
- rowIndex: 从1开始递增
- serialNo: 序号
- name: 名称/商品名称
- spec: 规格型号
- brand: 品牌
- unit: 单位
- quantity: 数量（数字）
- priceWithoutTax: 不含税单价（数字）
- taxRate: 税率（小数，如0.13）
- priceWithTax: 含税单价（数字）
- amountWithoutTax: 不含税金额（数字）
- amountWithTax: 含税金额（数字）
- isTotalRow: 如果此行是合计行设为true
- 数量/单价/金额如果识别不到填null
- 不要编造，找不到就留空或null`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请将以下OCR识别结果整理成JSON格式：\n\n${ocrText}` },
  ]

  const result = await callChat('qwen-plus', messages, 0.05, 4096)
  return extractJsonFromText(result)
}

/**
 * 从文本中提取JSON（支持markdown代码块）
 */
export function extractJsonFromText(text: string): string {
  if (typeof text !== 'string' || !text) return '{}'

  // 尝试从markdown代码块中提取
  const codeBlockMatch = text.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/)
  if (codeBlockMatch) {
    const jsonStr = codeBlockMatch[1].trim()
    if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
      return jsonStr
    }
  }

  // 尝试直接匹配JSON对象/数组
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }

  return '{}'
}

/**
 * 兜底函数：从原始OCR文本中提取文档字段
 * 当LLM提取结果中字段为空时，用此函数补充
 */
export function extractDocFromRawText(ocrText: string, doc: Record<string, any>): Record<string, any> {
  const result = { ...doc }
  const lines = ocrText.split('\n').filter(l => l.trim())

  // 客户名称
  if (!result.customerName || !result.customerName.trim()) {
    const match = ocrText.match(/(?:客户|甲方|业主|发包方)[：:\s]*([^\s，,。、\d]{2,10})/)
    if (match) result.customerName = match[1].trim()
  }

  // 项目名称（找"项目"后的内容，至少2个字）
  if (!result.projectName || !result.projectName.trim()) {
    const match = ocrText.match(/(?:项目|工程)[名称]*[：:\s]*([^\n]{2,30})/)
    if (match) {
      const val = match[1].trim()
      // 避免把"项目名称"本身当值
      if (!val.includes('项目') && !val.includes('名称')) {
        result.projectName = val
      }
    }
  }

  // title（找第一行有"报价单"字样的）
  if (!result.title || !result.title.trim()) {
    for (const line of lines) {
      if (line.includes('报价单') || line.includes('报价表')) {
        result.title = line.trim().substring(0, 50)
        break
      }
    }
  }

  // 编制人
  if (!result.editorName || !result.editorName.trim()) {
    const match = ocrText.match(/(?:编制|制表|报价人)[：:\s]*([^\s，,。、]{1,8})/)
    if (match) result.editorName = match[1].trim()
  }

  // 联系人
  if (!result.contactName || !result.contactName.trim()) {
    const match = ocrText.match(/(?:联系|联络)人[：:\s]*([^\s，,。、\d]{1,8})/)
    if (match) result.contactName = match[1].trim()
  }

  // 联系电话
  if (!result.contactPhone || !result.contactPhone.trim()) {
    const match = ocrText.match(/(?:电话|手机|Tel)[：:\s]*([\d\-]{7,15})/)
    if (match) result.contactPhone = match[1].trim()
  }

  // 有效期
  if (!result.validityPeriod || !result.validityPeriod.trim()) {
    const match = ocrText.match(/(?:有效[期内]|报价[期内])[：:\s]*([^\n]{2,20})/)
    if (match) result.validityPeriod = match[1].trim()
  }

  return result
}
