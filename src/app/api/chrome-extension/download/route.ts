import { NextResponse } from "next/server";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import * as archiver from "archiver";

export async function GET() {
  try {
    // Try multiple possible paths for the chrome-extension directory
    const candidates = [
      join(process.env.COZE_WORKSPACE_PATH || "/workspace/projects", "chrome-extension"),
      join(process.cwd(), "chrome-extension"),
      join(process.cwd(), "public", "chrome-extension"),
    ];

    let extDir = "";
    for (const dir of candidates) {
      if (existsSync(dir)) {
        extDir = dir;
        break;
      }
    }

    if (!extDir) {
      throw new Error("chrome-extension directory not found");
    }

    // Build the update URL dynamically based on current domain
    const domain =
      process.env.COZE_PROJECT_DOMAIN_DEFAULT ||
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "localhost:5000";
    const baseUrl = domain.includes("://")
      ? domain
      : domain.includes("localhost")
      ? `http://${domain}`
      : `https://${domain}`;
    const updateUrl = `${baseUrl}/api/chrome-extension/update`;

    // Replace placeholder in manifest.json with actual update URL
    const manifestPath = join(extDir, "manifest.json");
    const originalManifest = readFileSync(manifestPath, "utf-8");
    const patchedManifest = originalManifest.replace(
      "__UPDATE_URL_PLACEHOLDER__",
      updateUrl
    );
    // Write patched manifest temporarily
    writeFileSync(manifestPath, patchedManifest, "utf-8");

    try {
      // Use archiver (pure Node.js) to create zip - works on Vercel
      const archive = archiver("zip", { zlib: { level: 9 } });
      const chunks: Buffer[] = [];

      archive.on("data", (chunk: Buffer) => chunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        archive.on("end", resolve);
        archive.on("error", reject);
        archive.directory(extDir, false);
        archive.finalize();
      });

      const zipBuffer = Buffer.concat(chunks);

      return new NextResponse(zipBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition":
            'attachment; filename="mianjing-chrome-extension.zip"',
          "Content-Length": zipBuffer.length.toString(),
        },
      });
    } finally {
      // Always restore original manifest with placeholder
      writeFileSync(manifestPath, originalManifest, "utf-8");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "打包失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
