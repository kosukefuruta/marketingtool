export const CTA_PAGE_LIMIT = 20
const CTA_PAGE_URL_LIMIT = 2_048
const CTA_PAGE_INPUT_LIMIT = CTA_PAGE_LIMIT * (CTA_PAGE_URL_LIMIT + 1)

export function parseCtaPagePaths(input: string, siteOrigin: string): { paths: string[]; error?: string } {
  if (input.length > CTA_PAGE_INPUT_LIMIT) return { paths: [], error: "CTAページURLの入力が長すぎます。" }
  let origin: URL
  try {
    origin = new URL(siteOrigin)
  } catch {
    return { paths: [], error: "登録サイトのURLが正しくありません。" }
  }

  const paths: string[] = []
  for (const value of input.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    if (value.length > CTA_PAGE_URL_LIMIT) return { paths: [], error: "CTAページURLは2,048文字以内で入力してください。" }
    let url: URL
    try {
      url = new URL(value, origin)
    } catch {
      return { paths: [], error: `正しいCTAページURLを入力してください: ${value}` }
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== origin.origin) {
      return { paths: [], error: "CTAページには登録サイトと同じサイトのURLを入力してください。" }
    }
    const path = url.pathname || "/"
    if (!paths.includes(path)) paths.push(path)
  }
  if (paths.length > CTA_PAGE_LIMIT) return { paths: [], error: `CTAページは${CTA_PAGE_LIMIT}件まで登録できます。` }
  return { paths }
}
