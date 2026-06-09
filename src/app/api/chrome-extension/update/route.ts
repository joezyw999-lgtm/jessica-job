import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function GET() {
  const domain =
    process.env.COZE_PROJECT_DOMAIN_DEFAULT ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "localhost:5000";
  const baseUrl = domain.includes("://")
    ? domain
    : domain.includes("localhost")
    ? `http://${domain}`
    : `https://${domain}`;

  // Try multiple possible paths for manifest
  // Prefer the copy in public/ (works on Vercel), fallback to source dir
  const candidates = [
    join(
      process.env.COZE_WORKSPACE_PATH || "/workspace/projects",
      "public",
      "chrome-extension-manifest.json"
    ),
    join(process.cwd(), "public", "chrome-extension-manifest.json"),
    join(
      process.env.COZE_WORKSPACE_PATH || "/workspace/projects",
      "chrome-extension",
      "manifest.json"
    ),
    join(process.cwd(), "chrome-extension", "manifest.json"),
  ];

  let version = "2.1.0";
  for (const p of candidates) {
    if (existsSync(p)) {
      const manifest = JSON.parse(readFileSync(p, "utf-8"));
      version = manifest.version || version;
      break;
    }
  }

  const updateXml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='mianjing-chrome-extension'>
    <updatecheck codebase='${baseUrl}/api/chrome-extension/download' version='${version}' />
  </app>
</gupdate>`;

  return new NextResponse(updateXml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "no-cache",
    },
  });
}
