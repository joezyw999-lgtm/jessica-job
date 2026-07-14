import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function GET() {
  try {
    // Try multiple possible paths for the pre-built zip
    const candidates = [
      join(process.cwd(), "public", "mianjing-chrome-extension.zip"),
      join("/tmp", "public", "mianjing-chrome-extension.zip"),
    ];

    let zipPath = "";
    for (const p of candidates) {
      if (existsSync(p)) {
        zipPath = p;
        break;
      }
    }

    if (!zipPath) {
      return NextResponse.json(
        { error: "插件包未找到，请确认构建已完成" },
        { status: 404 }
      );
    }

    const zipBuffer = readFileSync(zipPath);

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition":
          'attachment; filename="mianjing-chrome-extension.zip"',
        "Content-Length": zipBuffer.length.toString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "下载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
