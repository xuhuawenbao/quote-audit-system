import { supabase } from './supabase'
import { QuoteItem, PriceDeviation } from '@/types'

/** 价格偏差阈值：10% */
const DEVIATION_THRESHOLD = 0.10

/**
 * 价格比对主函数
 */
export async function checkPrices(items: QuoteItem[]): Promise<PriceDeviation[]> {
  // 从Supabase获取所有价格参考数据
  const { data: references, error } = await supabase
    .from('price_reference')
    .select('*')

  if (error) {
    console.error('[PriceCheck] 查询失败:', error.message)
    return []
  }
  if (!references || references.length === 0) {
    console.log('[PriceCheck] 价格参考表为空')
    return []
  }

  console.log(`[PriceCheck] 参考表共 ${references.length} 条记录，报价单 ${items.filter(i => !i.isTotalRow && i.name).length} 行`)

  const results: PriceDeviation[] = []

  for (const item of items) {
    if (item.isTotalRow || !item.name || item.priceWithoutTax === undefined) continue

    const quotedPrice = item.priceWithoutTax

    // Step 1: 名称模糊匹配（多重策略）
    const nameMatches = findByName(references, item.name)

    if (nameMatches.length === 0) {
      console.log(`[PriceCheck] 第${item.rowIndex}行"${item.name}"未匹配到`)
      results.push({
        rowIndex: item.rowIndex,
        name: item.name,
        spec: item.spec || '',
        brand: item.brand || '',
        quotedPrice,
        searchUrl: generateSearchUrl(item.name, item.spec, item.brand),
        status: 'unmatched',
      })
      continue
    }

    console.log(`[PriceCheck] 第${item.rowIndex}行"${item.name}"匹配到 ${nameMatches.length} 条`)

    // Step 2: 品牌+规格匹配
    const exactMatch = findExactMatch(nameMatches, item.brand || '', item.spec || '')

    if (exactMatch) {
      const referencePrice = exactMatch.price
      const deviation = (quotedPrice - referencePrice) / referencePrice
      const deviationPercent = Math.round(deviation * 100)

      console.log(`[PriceCheck] 第${item.rowIndex}行: 报价=${quotedPrice}, 参考价=${referencePrice}, 偏差=${deviationPercent}%`)

      results.push({
        rowIndex: item.rowIndex,
        name: item.name,
        spec: item.spec || '',
        brand: item.brand || '',
        quotedPrice,
        referencePrice,
        deviationPercent,
        searchUrl: generateSearchUrl(item.name, item.spec, item.brand),
        status: Math.abs(deviation) > DEVIATION_THRESHOLD ? 'deviation' : 'matched',
      })
    } else {
      // 名称匹配但品牌/规格未精确匹配 → 取第一个匹配的价格做粗略比对
      const firstRef = nameMatches[0]
      const referencePrice = firstRef.price
      const deviation = (quotedPrice - referencePrice) / referencePrice
      const deviationPercent = Math.round(deviation * 100)

      console.log(`[PriceCheck] 第${item.rowIndex}行: 品牌/规格不精确匹配，用参考价格${referencePrice}比对，偏差${deviationPercent}%`)

      results.push({
        rowIndex: item.rowIndex,
        name: item.name,
        spec: item.spec || '',
        brand: item.brand || '',
        quotedPrice,
        referencePrice,
        deviationPercent,
        searchUrl: generateSearchUrl(item.name, item.spec, item.brand),
        status: Math.abs(deviation) > DEVIATION_THRESHOLD ? 'deviation' : 'unmatched',
      })
    }
  }

  const matched = results.filter(r => r.status === 'matched').length
  const deviated = results.filter(r => r.status === 'deviation').length
  const unmatched = results.filter(r => r.status === 'unmatched').length
  console.log(`[PriceCheck] 完成: ${matched}匹配, ${deviated}偏差, ${unmatched}未匹配`)

  return results
}

/** 按名称模糊匹配（多重策略） */
function findByName(references: any[], queryName: string): any[] {
  const query = queryName.toLowerCase().replace(/\s+/g, '')

  // 策略1：互相包含
  let matches = references.filter(ref => {
    const refName = (ref.name || '').toLowerCase().replace(/\s+/g, '')
    return refName.includes(query) || query.includes(refName)
  })

  if (matches.length > 0) return matches

  // 策略2：去掉常见前后缀后匹配（如"双头记号笔" → "记号笔"）
  const suffixes = ['笔', '器', '机', '线', '带', '灯', '纸', '管', '板', '阀', '盖', '套', '条', '架', '箱', '盒', '瓶']
  for (const s of suffixes) {
    if (query.endsWith(s) && query.length > 2) {
      const shortQuery = query.slice(0, -1)
      matches = references.filter(ref => {
        const refName = (ref.name || '').toLowerCase().replace(/\s+/g, '')
        return refName.includes(shortQuery)
      })
      if (matches.length > 0) return matches
    }
  }

  // 策略3：逐个字符匹配（较长名称拆解）
  if (query.length >= 2) {
    for (let len = query.length - 1; len >= Math.ceil(query.length / 2); len--) {
      for (let start = 0; start <= query.length - len; start++) {
        const sub = query.substring(start, start + len)
        matches = references.filter(ref => {
          const refName = (ref.name || '').toLowerCase().replace(/\s+/g, '')
          return refName.includes(sub) || sub.includes(refName)
        })
        if (matches.length > 0) return matches
      }
    }
  }

  return []
}

/** 品牌+规格精确匹配 */
function findExactMatch(matches: any[], brand: string, spec: string): any | null {
  const brandNorm = brand.toLowerCase().replace(/\s+/g, '')
  const specNorm = spec.toLowerCase().replace(/\s+/g, '')

  // 有品牌时：优先品牌匹配
  if (brandNorm) {
    for (const match of matches) {
      const matchBrand = (match.brand || '').toLowerCase().replace(/\s+/g, '')
      if (matchBrand.includes(brandNorm) || brandNorm.includes(matchBrand)) {
        return match
      }
    }
  }

  // 有规格时：次优规格匹配
  if (specNorm) {
    for (const match of matches) {
      const matchSpec = (match.spec || '').toLowerCase().replace(/\s+/g, '')
      if (matchSpec.includes(specNorm) || specNorm.includes(matchSpec)) {
        return match
      }
    }
  }

  // 两者都没有或都匹配不上：返回第一个
  return matches[0] || null
}

/** 生成京东搜索链接 */
function generateSearchUrl(name: string, spec?: string, brand?: string): string {
  const keywords = [name, spec, brand].filter(Boolean).join(' ')
  const encoded = encodeURIComponent(keywords)
  return `https://search.jd.com/Search?keyword=${encoded}&enc=utf-8`
}
