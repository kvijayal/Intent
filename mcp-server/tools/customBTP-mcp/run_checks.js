import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import path from "node:path";
import { exists, readText } from "../../lib/fs-utils.js";
import { localBin, runNodeBin, notInstalled } from "../../lib/local-bin.js";
import { jsonText, errText } from "../_util.js";

const exec = promisify(execCb);

function tail(s, n = 50) {
  return (s || "").split(/\r?\n/).slice(-n).join("\n");
}

/** Run a fixed npm command (constant string — no caller input reaches the shell). */
async function run(cmd, cwd) {
  try {
    const { stdout, stderr } = await exec(cmd, { cwd, timeout: 240000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    return { cmd, ok: true, output: tail(stdout + stderr) };
  } catch (e) {
    return { cmd, ok: false, output: tail((e.stdout || "") + (e.stderr || "") + "\n" + (e.message || "")) };
  }
}

/** Run a CLI from the project's node_modules (no shell, nothing downloaded). */
async function runLocal(label, dir, pkg, binName, args) {
  const bin = localBin(dir, pkg, binName);
  if (!bin) return { cmd: label, ok: false, output: notInstalled(pkg, dir) };
  const r = await runNodeBin(bin, args, { cwd: dir });
  return { cmd: label, ok: r.ok, output: tail(r.stdout + r.stderr + (r.error ? "\n" + r.error : "")) };
}

export default {
  name: "run_checks",
  description:
    "Run the standard SAP quality gates in an app folder and return structured pass/fail + output. Detects CAP vs UI5 from package.json/ui5.yaml. CAP: cds build (+ npm test). UI5: lint (npm run lint or ui5lint) + TypeScript typecheck. Use this instead of an external linter MCP.",
  inputSchema: {
    type: "object",
    properties: {
      appDir: { type: "string" },
      stack: { type: "string", enum: ["auto", "cap", "ui5"], default: "auto" },
      skipLint: { type: "boolean", default: false, description: "Skip the UI5 lint step (use when ui5_run_ui5_linter already ran — avoids a second lint run)." }
    },
    required: ["appDir"]
  },
  async handler({ appDir, stack = "auto", skipLint = false }) {
    if (!(await exists(appDir))) return errText("appDir not found: " + appDir);
    let pkg = {};
    try { pkg = JSON.parse(await readText(path.join(appDir, "package.json"))); } catch { /* no package.json */ }

    const isCap = stack === "cap" || (stack === "auto" && (pkg.dependencies?.["@sap/cds"] || (await exists(path.join(appDir, "db")))));
    const isUi5 = stack === "ui5" || (stack === "auto" && (await exists(path.join(appDir, "ui5.yaml"))));

    const results = [];
    if (isCap) {
      results.push(await runLocal("cds build (local @sap/cds-dk)", appDir, "@sap/cds-dk", "cds", ["build"]));
      if (pkg.scripts?.test) results.push(await run("npm test", appDir));
    }
    if (isUi5) {
      if (skipLint) { /* ui5_run_ui5_linter covers lint */ }
      else if (pkg.scripts?.lint) results.push(await run("npm run lint", appDir));
      else results.push(await runLocal("ui5lint (local @ui5/linter)", appDir, "@ui5/linter", "ui5lint", []));
      if (pkg.scripts?.["ts-typecheck"]) results.push(await run("npm run ts-typecheck", appDir));
      else if (pkg.devDependencies?.typescript) results.push(await runLocal("tsc --noEmit (local typescript)", appDir, "typescript", "tsc", ["--noEmit"]));
    }

    if (!results.length) return errText("Could not detect stack (no @sap/cds, db/, or ui5.yaml). Pass stack=cap|ui5.");
    return jsonText({ appDir, pass: results.every((r) => r.ok), ran: results.length, results });
  }
};
