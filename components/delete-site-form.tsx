"use client"

import { deleteSite } from "@/app/actions"

export function DeleteSiteForm({ siteId, siteName }: { siteId: string; siteName: string }) {
  return <form action={deleteSite} onSubmit={(event) => {
    if (!window.confirm(`サイト「${siteName}」を削除しますか？\n目標と診断履歴もすべて削除され、元に戻せません。`)) event.preventDefault()
  }}>
    <input name="siteId" type="hidden" value={siteId} />
    <button className="button danger" type="submit">サイトを削除</button>
  </form>
}
