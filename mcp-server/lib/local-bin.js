// Run a project's locally installed CLI without a shell and without npx.
//
// A one-off download through npx (--yes) executes whatever version npm resolves (and, for cds, it resolves
// an unrelated npm package named "cds" when @sap/cds-dk is not installed). Building the command as
// a string for child_process.exec also lets a crafted argument run extra shell commands. Every
// tool that runs a CLI goes through here instead: find the bin inside node_modules, run it with
// the current node binary and an argument array.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

/** Absolute path of `<pkg>`'s bin `binName` installed in `dir` or an ancestor; null when not installed. */
export function localBin(dir, pkg, binName) {
  let d = path.resolve(dir);
  for (;;) {
    const pkgFile = path.join(d, "node_modules", ...pkg.split("/"), "package.json");
    if (fs.existsSync(pkgFile)) {
      try {
        const bin = JSON.parse(fs.readFileSync(pkgFile, "utf8")).bin;
        const rel = typeof bin === "string" ? bin : bin?.[binName || Object.keys(bin || {})[0]];
        if (rel) return path.join(path.dirname(pkgFile), rel);
      } catch { /* unreadable package.json → treat as not installed */ }
      return null;
    }
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/** Run a JS bin with the current node — no shell. Resolves { ok, code, stdout, stderr }. */
export function runNodeBin(binPath, args, { cwd, timeout = 240000, maxBuffer = 16 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [binPath, ...args], { cwd, timeout, maxBuffer, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: stdout || "", stderr: stderr || "", error: err && !stdout ? err.message : "" });
    });
  });
}

/** A caller-supplied glob must stay inside the project: relative, no "..", no option or shell characters. */
export function checkPattern(p) {
  const s = String(p ?? "");
  if (!s || s.length > 200) return "empty or too long";
  if (path.isAbsolute(s) || /^[a-zA-Z]:/.test(s)) return "must be relative to projectDir";
  if (s.split(/[\\/]/).includes("..")) return "must not contain ..";
  if (s.startsWith("-")) return "must not start with -";
  if (!/^[\w\-./*?{}[\],@!]+$/.test(s)) return "only letters, digits and the glob characters * ? { } [ ] , . / - _ @ ! are allowed";
  return null;
}

/** One-line hint for a CLI that is missing from node_modules. */
export const notInstalled = (pkg, dir) =>
  "" + pkg + " is not installed in " + dir + " (or a parent). Run npm install there — it is a devDependency pinned by stack.json (stack.mjs apply adds it). Nothing was downloaded.";
