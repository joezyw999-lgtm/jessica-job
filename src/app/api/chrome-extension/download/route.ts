import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function GET() {
  try {
    const extDir = join(
      process.env.COZE_WORKSPACE_PATH || "/workspace/projects",
      "chrome-extension"
    );
    const tmpZip = "/tmp/mianjing-chrome-extension.zip";

    // Use python3 to create zip (zip command not available)
    execSync(
      `python3 -c "import zipfile, os; ` +
        `z = zipfile.ZipFile('${tmpZip}', 'w', zipfile.ZIP_DEFLATED); ` +
        `base = '${extDir}'; ` +
        `[z.write(os.path.join(root, f), os.path.relpath(os.path.join(root, f), base)) ` +
        `for root, dirs, files in os.walk(base) for f in files if not f.startswith('.')]; ` +
        `z.close()"`,
      { stdio: "pipe" }
    );

    if (!existsSync(tmpZip)) {
      throw new Error("ZIP file not created");
    }

    const zipBuffer = readFileSync(tmpZip);

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
    const message = error instanceof Error ? error.message : "打包失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
