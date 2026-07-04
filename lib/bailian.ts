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
  const systemPrompt = `你是一位数据提取专家。请将OCR识别到的报价单文本，整理成标准的JSON格式。

【输出格式要求】
必须输出以下格式的JSON，不要任何解释文字：
{
  "doc": {
    "title": "报价单标题（如'***报价单'，注意保留***等占位符）",
    "customerName": "客户名称",
    "projectName": "项目名称",
    "validityPeriod": "报价有效期（如'30天'，不要和报价日期混淆）",
    "editorName": "编制人",
    "contactName": "联系人",
    "contactPhone": "联系电话"
  },
  "items": [
    {
      "rowIndex": 1,
      "serialNo": "序号",
      "name": "商品名称",
      "spec": "规格型号",
      "brand": "品牌",
      "unit": "单位",
      "quantity": 数量,
      "priceWithoutTax": 不含税单价,
      "taxRate": 税率（小数，如0.13）,
      "priceWithTax": 含税单价,
      "amountWithoutTax": 不含税金额,
      "amountWithTax": 含税金额,
      "isTotalRow": false
    }
  ]
}

【字段说明】
- title: 报价单顶部的标题文字，如果有***、xxx、某某等占位符，必须原样保留
- validityPeriod: 只提取"有效期"相关内容，如"30天""有效期至2026-08-01"，不要填报价日期
- doc中的字段：如果在文本中找不到，留空字符串""
- items中的字段：每一行商品对应一个对象
- rowIndex: 从1开始递增
- 税率：如果是13%则输出0.13，如果是9%则输出0.09
- isTotalRow: 如果这一行是合计行（名称包含"合计"），设为true
- 数量、单价、金额等必须是数字，如果识别不到填null
- 不要编造数据，找不到就留空或null
- 只输出JSON，不要markdown代码块，不要解释文字`

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
