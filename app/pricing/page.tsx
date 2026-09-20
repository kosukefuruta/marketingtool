import Link from "next/link"

export default function PricingPage() {
  return <section className="card narrow stack">
    <div><p className="muted">有料版</p><h1>月額 1,980円（税込）</h1></div>
    <ul>
      <li>SEO施策の登録と進捗管理</li>
      <li>修正前・修正後・実施日の記録</li>
      <li>Search Console連携と効果測定（順次提供）</li>
      <li>1サイトまで登録</li>
    </ul>
    <Link className="button" href="/login">利用を開始する</Link>
    <p className="muted">いつでも次回更新日で解約できます。</p>
  </section>
}
