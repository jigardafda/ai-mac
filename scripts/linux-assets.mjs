// Gets the files the Linux terminal needs into public/linux/ before `dev` and `build`:
//  - the v86 engine, copied out of node_modules (it ships in the npm package), and
//  - the Linux kernel image, downloaded once and checked against a pinned SHA-256.
// The BIOS files are committed. Nothing here fails the build: without the kernel the
// Terminal's `linux` command says the image is missing and everything else works.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "linux");

const KERNEL = {
  file: "buildroot-bzimage68.bin",
  url: "https://i.copy.sh/buildroot-bzimage68.bin", // Buildroot Linux 6.8.12 (i686) published for v86
  size: 10068480,
  sha256: "507a759c70ab7a490a233be454d0b5b88bc667956a410b531cb4edc091e2eb1c",
};

const exists = (p) => stat(p).then(() => true, () => false);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

await mkdir(out, { recursive: true });

for (const f of ["libv86.mjs", "v86.wasm"]) {
  const src = path.join(root, "node_modules", "v86", "build", f);
  if (await exists(src)) await copyFile(src, path.join(out, f));
  else console.warn(`[linux] ${f} not found in node_modules/v86; run npm install`);
}

const dest = path.join(out, KERNEL.file);
if (await exists(dest) && sha(await readFile(dest)) === KERNEL.sha256) {
  process.exit(0);
}
try {
  console.log(`[linux] downloading ${KERNEL.file} (${(KERNEL.size / 1e6).toFixed(1)} MB) from ${new URL(KERNEL.url).host}`);
  const res = await fetch(KERNEL.url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length !== KERNEL.size || sha(buf) !== KERNEL.sha256) throw new Error("checksum mismatch, refusing to use it");
  await writeFile(dest + ".part", buf);
  await rename(dest + ".part", dest);
  console.log("[linux] kernel ready");
} catch (e) {
  console.warn(`[linux] could not get the kernel (${e instanceof Error ? e.message : e}). The Terminal's Linux mode will be unavailable.`);
}
