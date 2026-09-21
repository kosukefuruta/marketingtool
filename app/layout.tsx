import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import "./globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "http://localhost:8000"),
  title: { default: "Owtell SEO診断ツール", template: "%s | Owtell" },
  description: "サイトを診断し、SEO施策と効果を管理するツール",
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "Owtell",
    title: "Owtell SEO診断ツール",
    description: "サイトを診断し、SEO施策と効果を管理するツール",
  },
  twitter: { card: "summary_large_image" },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>
    <header className="shell nav">
      <Link className="brand" href="/" aria-label="Owtell SEO診断ツール ホーム">
        <Image className="brand-mark" src="/owtell-logo.png" width={40} height={40} alt="" priority />
        <span><strong>Owtell</strong><small>SEO診断ツール</small></span>
      </Link>
      <nav className="nav-links" aria-label="メインナビゲーション">
        <Link href="/pricing">料金</Link>
        <Link href="/login">ログイン</Link>
      </nav>
    </header>
    <main className="shell main">{children}</main>
    <footer className="footer"><div className="shell">© Owtell</div></footer>
  </body></html>
}
