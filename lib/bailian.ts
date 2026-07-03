/**
 * 阿里云百炼 API 封装（OpenAI兼容模式）
 * 与WorkBuddy中的调用方式保持一致
 */

const API_KEY = process.env.BAILIAN_API_KEY!
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

async function callChat(model: string, messages: ChatMessage[], temperature = 0.1) {
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
 * 用Qwen-VL识别图片/PDF中的表格数据
 * 传入图片的base64 data URI
 */
export async function ocrWithVL(imageDataUri: string): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: '你是一个专业的文档表格识别助手。请识别图片中的报价单表格，只输出JSON数据，不要任何解释。'
    },
    {
      role: 'user',
      content: [
        { 
          type: 'text', 
          text: '请识别这张报价单图片中的所有表格数据，以JSON格式输出。要求：1）每个单元格都要识别 2）税率如果是百分比（如13%）转为小数0.13 3）输出格式：{"items":[{"序号":"","商品名称":"","规格型号":"","品牌":"","单位":"","数量":"","不含税单价":"","税率":"","含税单价":"","含税金额":""}]} 4）只输出JSON，不要任何解释文字。'
        },
        { 
          type: 'image_url', 
          image_url: { url: imageDataUri }
        },
      ],
    },
  ]

  const result = await callChat('qwen-vl-plus', messages, 0.1)
  return extractJsonFromText(result)
}

/**
 * 用qwen-plus按规则审核报价单数据
 */
export async function auditWithLLM(extractedData: string, fileType: string): Promise<string> {
  const systemPrompt = `你是一位严格的核价工程师，请按以下规则审核报价单数据：

【文档级必填项】
1. 报价单标题不能为"***"或空
2. 报价有效期必须填写
3. 需识别报价人姓名

【明细行级必填项 - 每条商品行】
4. 序号、商品名称、规格型号、品牌、单位、数量、不含税单价、税率、含税单价、含税金额 - 全部必须填写
5. 品牌字段必须独立填写，不能将规格型号中的文字误识别为品牌

【计算校验规则】
6. 含税单价 = 不含税单价 × (1 + 税率)，保留两位小数
7. 含税金额 = 含税单价 × 数量
8. 如果税率缺失，但含税单价和不含税单价都有，自动反推税率

【输出格式要求】
请以JSON格式输出审核结果：
{
  "status": "passed" 或 "failed",
  "documentLevel": {
    "titleValid": true/false,
    "validityPeriodValid": true/false,
    "errors": [{"code":"E001","message":"..."}]
  },
  "lineItems": {
    "totalLines": 数字,
    "validLines": 数字,
    "errors": [{"code":"E002","rowIndex":1,"field":"税率","message":"..."}]
  },
  "summary": "审核通过" 或 "发现X个问题，请修正"
}

注意：空行（核心字段全部为空）应跳过，不报错。`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请审核以下从${fileType}文件中提取的报价单数据：\n\n${extractedData}` },
  ]

  return await callChat('qwen-plus', messages, 0.1)
}

/**
 * 从文本中提取JSON
 */
function extractJsonFromText(text: string): string {
  if (typeof text !== 'string' || !text) return '{}'
  
  // 尝试从markdown代码块中提取
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    const jsonStr = codeBlockMatch[1].trim()
    if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
      return jsonStr
    }
  }
  
  // 尝试直接匹配JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }
  
  return '{}'
}
