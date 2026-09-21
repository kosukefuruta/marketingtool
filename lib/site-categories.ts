export const siteCategories = {
  news: { label: "ニュース・時事", rpm: [300, 500, 800] },
  entertainment: { label: "エンタメ", rpm: [200, 400, 700] },
  lifestyle: { label: "ライフスタイル", rpm: [300, 600, 1000] },
  technology: { label: "IT・テクノロジー", rpm: [500, 900, 1500] },
  business: { label: "ビジネス", rpm: [600, 1100, 1800] },
  finance: { label: "金融・投資", rpm: [1000, 2000, 3500] },
  health: { label: "健康・医療", rpm: [500, 1000, 1800] },
  education: { label: "教育", rpm: [400, 800, 1400] },
  travel: { label: "旅行", rpm: [300, 700, 1200] },
  other: { label: "その他", rpm: [300, 600, 1000] },
} as const

export type SiteCategory = keyof typeof siteCategories

export function isSiteCategory(value: string): value is SiteCategory {
  return Object.hasOwn(siteCategories, value)
}
