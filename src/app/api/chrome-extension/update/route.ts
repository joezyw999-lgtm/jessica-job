import { NextResponse } from "next/server";

export async function GET() {
  const domain = process.env.COZE_PROJECT_DOMAIN_DEFAULT || "localhost:5000";
  const baseUrl = domain.includes("://")
    ? domain
    : domain.includes("localhost")
    ? `http://${domain}`
    : `https://${domain}`;

  // Read current version from manifest
  const { readFileSync } = await import("fs");
  const { join } = await import("path");
  const manifestPath = join(
    process.env.COZE_WORKSPACE_PATH || "/workspace/projects",
    "chrome-extension",
    "manifest.json"
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const version = manifest.version || "2.1.0";

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
