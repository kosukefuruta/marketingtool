"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export function SiteNav({ siteId }: { siteId: string }) {
  const base = `/dashboard/sites/${siteId}`
  const pathname = usePathname()
  const items = [
    { href: base, label: "概要", exact: true },
    { href: `${base}/audits`, label: "サイト診断" },
    { href: `${base}/goals`, label: "目標" },
    { href: `${base}/settings`, label: "サイト設定" },
  ]
  return <nav className="site-menu" aria-label="サイトメニュー">
    {items.map((item) => {
      const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
      return <Link className={active ? "active" : undefined} aria-current={active ? "page" : undefined} href={item.href} key={item.href}>{item.label}</Link>
    })}
  </nav>
}
