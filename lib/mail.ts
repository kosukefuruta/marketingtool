import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2"

let client: SESv2Client | null = null

function getClient(): SESv2Client {
  const region = process.env.SES_REGION ?? process.env.AWS_REGION
  const accessKeyId = process.env.SES_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("Amazon SES is not configured")
  }
  client ??= new SESv2Client({ region, credentials: { accessKeyId, secretAccessKey } })
  return client
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim()
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const from = process.env.MAIL_FROM ?? "Owtell <no-reply@owtell.com>"
  const subject = `${otp} はOwtell SEO診断ツールの認証コードです`
  const text = `Owtell SEO診断ツールの認証コードは ${otp} です。このコードは10分間有効です。心当たりがない場合は、このメールを無視してください。`
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px"><h1 style="font-size:20px">Owtell SEO診断ツール</h1><p>ログイン用の認証コードです。</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;padding:20px;background:#f5f5f5;border-radius:8px">${otp}</p><p style="color:#666;font-size:13px">このコードは10分間有効です。心当たりがない場合は、このメールを無視してください。</p></div>`

  try {
    await getClient().send(new SendEmailCommand({
      FromEmailAddress: safeHeader(from),
      Destination: { ToAddresses: [safeHeader(to)] },
      ConfigurationSetName: process.env.AWS_SES_CONFIGURATION_SET || undefined,
      EmailTags: [{ Name: "application", Value: "owtell-seo-tool" }],
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: text, Charset: "UTF-8" },
            Html: { Data: html, Charset: "UTF-8" },
          },
        },
      },
    }))
  } catch (error) {
    const detail = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
    console.error("[mail] SES send failed", {
      name: detail.name,
      status: detail.$metadata?.httpStatusCode,
      message: detail.message?.slice(0, 200),
    })
    throw error
  }
}
