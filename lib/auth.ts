import { betterAuth } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { emailOTP } from "better-auth/plugins"
import { generateRandomString } from "better-auth/crypto"
import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { normalizeEmail } from "@/lib/email-normalize"
import { sendOtpEmail } from "@/lib/mail"
import { SlidingWindowLimiter } from "@/lib/rate-limit"

const otpLimiter = new SlidingWindowLimiter(60 * 60 * 1000, 5)
// A service-wide ceiling: an address-keyed limit alone cannot stop a caller that cycles through addresses,
// and unbounded SES sending to third parties would damage the sending identity the whole login flow needs.
const otpServiceLimiter = new SlidingWindowLimiter(60 * 60 * 1000, 100)
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build"
const baseURL = process.env.BETTER_AUTH_URL ?? process.env.APP_BASE_URL ?? (isProductionBuild ? "http://localhost:8000" : undefined)

if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  if (!baseURL) throw new Error("BETTER_AUTH_URL or APP_BASE_URL is required in production")
  if (!process.env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required in production")
}

function generateOtpOrThrottle({ email }: { email: string }): string {
  const result = otpLimiter.checkAndRecord(normalizeEmail(email))
  if (!result.allowed) {
    throw new APIError("TOO_MANY_REQUESTS", { message: "認証コードの送信回数が上限に達しました。しばらく待ってからお試しください。" })
  }
  const service = otpServiceLimiter.checkAndRecord("service")
  if (!service.allowed) {
    console.error("[auth] hourly OTP ceiling reached; no further codes are being sent", { retryAfter: service.retryAfter })
    throw new APIError("TOO_MANY_REQUESTS", { message: "現在、認証コードを送信できません。しばらく待ってからお試しください。" })
  }
  return generateRandomString(6, "0-9")
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET || (isProductionBuild ? "build-only-secret-that-is-never-used-at-runtime" : undefined),
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },
  rateLimit: { enabled: false },
  socialProviders: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      accessType: "offline",
      prompt: "select_account",
    },
  } : undefined,
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/email-otp/send-verification-otp") return
      const type = (ctx.body as { type?: unknown } | undefined)?.type
      if (type !== "sign-in") throw new APIError("BAD_REQUEST", { message: "Unsupported OTP type." })
    }),
  },
  disabledPaths: [
    "/email-otp/check-verification-otp",
    "/email-otp/verify-email",
    "/email-otp/reset-password",
    "/email-otp/request-password-reset",
    "/forget-password/email-otp",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  plugins: [emailOTP({
    expiresIn: 10 * 60,
    allowedAttempts: 5,
    otpLength: 6,
    generateOTP: generateOtpOrThrottle,
    storeOTP: "encrypted",
    sendVerificationOTP: async ({ email, otp }) => sendOtpEmail(email, otp),
  })],
})
