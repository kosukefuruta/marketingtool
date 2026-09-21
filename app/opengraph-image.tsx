import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

export const alt = "Owtell SEO診断ツール"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "public", "owtell-logo.png"))
  const logoUrl = `data:image/png;base64,${logo.toString("base64")}`

  return new ImageResponse(
    <div style={{
      alignItems: "center",
      background: "linear-gradient(135deg, #f7f9ff 0%, #ffffff 58%, #eaf0ff 100%)",
      color: "#17191c",
      display: "flex",
      height: "100%",
      justifyContent: "center",
      padding: "72px 96px",
      width: "100%",
    }}>
      <div style={{ alignItems: "center", display: "flex", gap: 48 }}>
        {/* ImageResponse accepts binary image data at runtime. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} width={240} height={240} alt="" />
        <div style={{ display: "flex", flexDirection: "column", width: 650 }}>
          <div style={{ color: "#155eef", display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: "0.08em" }}>OWTELL</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 60, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.15, marginTop: 12 }}>
            <div style={{ display: "flex" }}>サイトの課題を、</div>
            <div style={{ display: "flex" }}>次の一手に。</div>
          </div>
          <div style={{ color: "#667085", display: "flex", fontSize: 28, marginTop: 24 }}>SEO診断・施策管理ツール</div>
        </div>
      </div>
    </div>,
    size,
  )
}
