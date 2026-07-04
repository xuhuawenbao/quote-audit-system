import { supabase } from './supabase'
import { QuoteItem, PriceDeviation } from '@/types'

/** 价格偏差阈值：10% */
const DEVIATION_THRESHOLD = 0.10

/**
 * 价格比对主函数
 * 对报价单每一行进行价格参考比对
 */
export async function checkPrices(items: QuoteItem[]): Promise<PriceDeviation[]> {
  // 从Supabase获取所有价格参考数据
  const { data: references, error } = await supabase
    .from('price_reference')
    .select('*')

  if (error || !references || references.length === 0) {
    console.log('[PriceCheck] 价格参考表为空或查询失败')
    return []
  }

  const results: PriceDeviation[] = []

  for (const item of items) {
    // 跳过合计行和空行
    if (item.isTotalRow || !item.name || item.priceWithoutTax === undefined) {
      continue
    }

    const quotedPrice = item.priceWithoutTax

    // Step 1: 名称模糊匹配
    const nameMatches = findByName(references, item.name)
    if (nameMatches.length === 0) {
      // 未匹配到，生成搜索链接
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

    // Step 2: 品牌+规格型号精确匹配
    const exactMatch = findExactMatch(nameMatches, item.brand || '', item.spec || '')

    if (exactMatch) {
      const referencePrice = exactMatch.price
      const deviation = (quotedPrice - referencePrice) / referencePrice
      const deviationPercent = Math.round(deviation * 100)

      if (Math.abs(deviation) > DEVIATION_THRESHOLD) {
        // 偏差超过10%
        results.push({
          rowIndex: item.rowIndex,
          name: item.name,
          spec: item.spec || '',
          brand: item.brand || '',
          quotedPrice,
          referencePrice,
          deviationPercent,
          searchUrl: generateSearchUrl(item.name, item.spec, item.brand),
          status: 'deviation',
        })
      } else {
        // 价格在正常范围内
        results.push({
          rowIndex: item.rowIndex,
          name: item.name,
          spec: item.spec || '',
          brand: item.brand || '',
          quotedPrice,
          referencePrice,
          deviationPercent,
          searchUrl: generateSearchUrl(item.name, item.spec, item.brand),
          status: 'matched',
        })
      }
    } else {
      // 名称匹配但品牌/规格不匹配
      results.push({
        rowIndex: item.rowIndex,
        name: item.name,
        spec: item.spec || '',
        brand: item.brand || '',
        quotedPrice,
        searchUrl: generateSearchUrl(item.name, item.spec, item.brand),
        status: 'unmatched',
      })
    }
  }

  return results
}

/** 按名称模糊匹配 */
function findByName(references: any[], queryName: string): any[] {
  const query = queryName.toLowerCase().replace(/\s+/g, '')
  return references.filter(ref => {
    const refName = (ref.name || '').toLowerCase().replace(/\s+/g, '')
    // 互相包含即算匹配
    return refName.includes(query) || query.includes(refName)
  })
}

/** 品牌+规格精确匹配 */
function findExactMatch(matches: any[], brand: string, spec: string): any | null {
  const brandNorm = brand.toLowerCase().replace(/\s+/g, '')
  const specNorm = spec.toLowerCase().replace(/\s+/g, '')

  for (const match of matches) {
    const matchBrand = (match.brand || '').toLowerCase().replace(/\s+/g, '')
    const matchSpec = (match.spec || '').toLowerCase().replace(/\s+/g, '')

    // 品牌匹配（互相包含）
    const brandMatch = !brandNorm || matchBrand.includes(brandNorm) || brandNorm.includes(matchBrand)
    // 规格匹配（互相包含）
    const specMatch = !specNorm || matchSpec.includes(specNorm) || specNorm.includes(matchSpec)

    if (brandMatch && specMatch) {
      return match
    }
  }

  return null
}

/** 生成天猫/京东搜索链接 */
function generateSearchUrl(name: string, spec?: string, brand?: string): string {
  const keywords = [name, spec, brand].filter(Boolean).join(' ')
  const encoded = encodeURIComponent(keywords)
  // 返回京东搜索链接（天猫链接也可以）
  return `https://search.jd.com/Search?keyword=${encoded}&enc=utf-8`
}
