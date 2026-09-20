"use client"

import { signOut } from "@/lib/auth-client"

export function SignOutButton() {
  return <button className="button secondary" onClick={async () => {
    await signOut()
    window.location.href = "/"
  }}>ログアウト</button>
}
