"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

const INTERVAL_MS = 2_000
const MAX_ATTEMPTS = 30

export function BillingStatusRefresh({ withNotice }: { withNotice?: boolean }) {
  const router = useRouter()
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      if (attempts > MAX_ATTEMPTS) {
        window.clearInterval(timer)
        setGaveUp(true)
        return
      }
      router.refresh()
    }, INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [router])

  if (!withNotice) return null
  return gaveUp
    ? <p className="error" role="alert">まだ反映を確認できません。時間をおいて画面を再読み込みしてください。解決しない場合は support@tool.owtell.com までご連絡ください。</p>
    : <p className="status" role="status">Stripeからの確認を待っています。反映され次第、この画面が更新されます。</p>
}
