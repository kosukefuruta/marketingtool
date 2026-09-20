import Link from "next/link"
import { AuditForm } from "@/components/audit-form"

export default function HomePage() {
  return <>
    <section className="hero">
      <h1>自社サイトのSEOを、分かりやすく診断</h1>
      <p className="muted">URLを入力すると、ページごとのSEO項目を無料で確認できます。</p>
      <p><Link href="/pricing">施策と効果を継続管理する有料版を見る</Link></p>
    </section>
    <AuditForm />
  </>
}
