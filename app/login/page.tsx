import { redirect } from "next/navigation"
import { LoginForm } from "@/components/login-form"
import { getSession } from "@/lib/session"

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard")
  return <LoginForm />
}
