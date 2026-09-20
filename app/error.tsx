"use client"

import Link from "next/link"

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="card narrow stack">
    <h1>処理を完了できませんでした</h1>
    <p className="muted">時間をおいて再度お試しください。解決しない場合は support@tool.owtell.com までご連絡ください。</p>
    <button className="button" type="button" onClick={reset}>やり直す</button>
    <Link href="/dashboard">ダッシュボードへ戻る</Link>
  </section>
}
