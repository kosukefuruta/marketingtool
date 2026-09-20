import type { Metadata } from "next"
import Link from "next/link"
import "./globals.css"

export const metadata: Metadata = {
  title: "Owtell SEO診断ツール",
  description: "サイトを診断し、SEO施策と効果を管理するツール",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>
    <header className="shell nav">
      <Link className="brand" href="/">Owtell SEO診断ツール</Link>
      <nav className="nav-links" aria-label="メインナビゲーション">
        <Link href="/pricing">料金</Link>
        <Link href="/login">ログイン</Link>
      </nav>
    </header>
    <main className="shell main">{children}</main>
    <footer className="footer"><div className="shell">© Owtell</div></footer>
  </body></html>
}
