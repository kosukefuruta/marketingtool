"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { authClient, signIn } from "@/lib/auth-client"

export function LoginForm() {
  const router = useRouter()
  const [step, setStep] = useState<"email" | "otp">("email")
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode() {
    setLoading(true); setError(null)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })
      if (result.error) throw new Error(result.error.message ?? "認証コードを送信できませんでした。")
      setStep("otp")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "認証コードを送信できませんでした。")
    } finally { setLoading(false) }
  }

  async function verifyCode() {
    setLoading(true); setError(null)
    try {
      const result = await signIn.emailOtp({ email, otp })
      if (result.error) throw new Error("認証コードが正しくないか、有効期限が切れています。")
      router.push("/dashboard"); router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ログインできませんでした。")
    } finally { setLoading(false) }
  }

  return <div className="card narrow stack">
    <div><h1>ログイン・新規登録</h1><p className="muted">メールで届く6桁の認証コードを使用します。</p></div>
    {step === "email" ? <>
      <label className="field">メールアドレス<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <button className="button" type="button" disabled={loading || !email} onClick={sendCode}>{loading ? "送信中…" : "認証コードを送る"}</button>
    </> : <>
      <p className="muted">{email} に認証コードを送りました。</p>
      <label className="field">6桁の認証コード<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} /></label>
      <button className="button" type="button" disabled={loading || otp.length !== 6} onClick={verifyCode}>{loading ? "確認中…" : "ログイン"}</button>
      <button className="button secondary" type="button" onClick={() => { setStep("email"); setOtp(""); setError(null) }}>メールアドレスを変更</button>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    <p className="muted">利用を開始すると、利用規約とプライバシーポリシーに同意したものとみなします。</p>
  </div>
}
