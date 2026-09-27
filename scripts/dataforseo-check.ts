/**
 * DataForSEOとの疎通確認。実データで応答形式を確かめるために使う。
 *
 * 使い方:
 *   pnpm tsx --env-file=.env scripts/dataforseo-check.ts "seo ツール" "seo 対策"
 *
 * 認証情報は出力しない。取得したボリュームだけを表示する。
 */
import { fetchSearchVolumes } from "../lib/dataforseo.js"

const keywords = process.argv.slice(2)
if (keywords.length === 0) {
  console.error('キーワードを指定してください。例: pnpm tsx --env-file=.env scripts/dataforseo-check.ts "seo ツール"')
  process.exit(1)
}

try {
  const volumes = await fetchSearchVolumes(keywords)
  if (volumes.length === 0) {
    console.log("結果が空でした。キーワードとlocation_codeを確認してください。")
  }
  for (const { keyword, volume, competition } of volumes) {
    console.log(`${keyword}\t${volume ?? "不明"}\t競合指数 ${competition ?? "不明"}`)
  }
  console.log(`\n${volumes.length}件を取得しました。`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
