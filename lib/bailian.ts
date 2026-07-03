/**
 * 阿里云百炼 API 封装
 * OCR: Qwen-VL-Plus 视觉模型识别图片/PDF中的表格
 * LLM审核: qwen-plus 按规则审核
 */

const API_KEY = process.env.BAILIAN_API_KEY!
const BASE_URL = 'https://dashscope.aliyuncs.com/api/v1'

interface BailianMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: string; text?: string; image?: string }>
}

async function callBailian(model: string, messages: BailianMessage[], temperature = 0.1) {
  const resp = await fetch(`${BASE_URL}/services/aigc/text-generation/generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: { messages },
      parameters: { temperature, result_format: 'message' },
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`百炼API错误: ${err}`)
  }

  const data = await resp.json()
  return data.output?.choices?.[0]?.message?.content || ''
}

/**
 * 用Qwen-VL识别图片/PDF中的表格数据
 * 将图片转为base64传入
 */
export async function ocrWithVL(imageBase64: string, mimeType: string = 'image/png'): Promise<string> {
  const messages: BailianMessage[] = [
    {
      role: 'system',
      content: '你是一个专业的文档识别助手。请仔细识别图片中的报价单表格数据，以JSON格式输出所有行数据。输出格式：{"items":[{"序号":"","商品名称":"","规格型号":"","品牌":"","单位":"","数量":"","不含税单价":"","税率":"","含税单价":"","含税金额":""}]}。如果某字段为空，输出空字符串。'
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: '请识别这张报价单图片中的所有表格数据，输出标准JSON格式：' },
        { type: 'image', image: `data:${mimeType};base64,${imageBase64}` },
      ],
    },
  ]

  const result = await callBailian('qwen-vl-plus', messages, 0.1)
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

  const messages: BailianMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请审核以下从${fileType}文件中提取的报价单数据：\n\n${extractedData}` },
  ]

  return await callBailian('qwen-plus', messages, 0.1)
}

/**
 * 从文本中提取JSON
 */
function extractJsonFromText(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }
  return text
}
