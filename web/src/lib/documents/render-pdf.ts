import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// F6: render each page of a PDF to a PNG buffer server-side, so it can be sent to a vision model.
// Shells out to `pdftoppm` (poppler-utils) rather than a native npm module (node-canvas etc.) —
// the worker ships as a single esbuild bundle on node:24-alpine, which native bindings don't
// survive; Infra adds poppler-utils to that image.
export async function renderPdfToPngs(pdfBytes: Uint8Array, opts: { dpi?: number } = {}): Promise<Buffer[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "kettle-pdf-"));
  const pdfPath = path.join(dir, "input.pdf");
  const outPrefix = path.join(dir, "page");
  try {
    await writeFile(pdfPath, pdfBytes);
    await execFileAsync("pdftoppm", ["-png", "-r", String(opts.dpi ?? 150), pdfPath, outPrefix]);
    const files = (await readdir(dir)).filter((f) => f.startsWith("page") && f.endsWith(".png")).sort();
    if (files.length === 0) throw new Error("pdftoppm produced no output pages");
    return await Promise.all(files.map((f) => readFile(path.join(dir, f))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
