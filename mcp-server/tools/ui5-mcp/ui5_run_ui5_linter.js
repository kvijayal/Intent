// Replicated from https://github.com/UI5/mcp-server (Apache-2.0)
import path from "node:path";
import { exists } from "../../lib/fs-utils.js";
import { localBin, runNodeBin, checkPattern, notInstalled } from "../../lib/local-bin.js";
import { okText, errText } from "../_util.js";

function tail(s, n = 80) {
  return (s || "").split(/\r?\n/).slice(-n).join("\n");
}

export default {
  name: "ui5_run_ui5_linter",
  description:
    "Run @ui5/linter on a UI5 project to find deprecated API usage, accessibility issues, and other problems. Returns structured results (path, severity, message, rule). Optionally auto-fix some issues with fix=true — always confirm with the developer first.",
  inputSchema: {
    type: "object",
    properties: {
      projectDir: {
        type: "string",
        description: "Absolute path to the UI5 project directory"
      },
      filePatterns: {
        type: "array",
        items: { type: "string" },
        description: "Optional glob patterns to restrict linting (e.g. ['webapp/view/*.xml']). Lints all by default."
      },
      fix: {
        type: "boolean",
        description: "Auto-fix issues where possible. Confirm with the developer before setting true.",
        default: false
      }
    },
    required: ["projectDir"]
  },
  async handler({ projectDir, filePatterns = [], fix = false } = {}) {
    if (!projectDir) return errText("projectDir is required");
    const dir = path.resolve(projectDir);
    if (!(await exists(dir))) return errText("Directory not found: " + dir);

    // Patterns become plain arguments (no shell) and must stay inside the project.
    const patterns = Array.isArray(filePatterns) ? filePatterns : [];
    for (const p of patterns) { const bad = checkPattern(p); if (bad) return errText("filePatterns \"" + String(p).slice(0, 60) + "\": " + bad); }
    // The project's own @ui5/linter (devDependency from stack.json) — never npx, never a download.
    const bin = localBin(dir, "@ui5/linter", "ui5lint");
    if (!bin) return errText(notInstalled("@ui5/linter", dir));
    const args = ["--format", "json", ...(fix ? ["--fix"] : []), ...patterns];
    const { stdout, stderr, code: exitCode } = await runNodeBin(bin, args, { cwd: dir, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });

    // Try to parse structured JSON output from @ui5/linter.
    let structured = null;
    try {
      structured = JSON.parse(stdout.trim());
    } catch {
      // Linter may emit non-JSON on fatal errors.
    }

    if (structured) {
      // Normalise: @ui5/linter --format json returns an array of file results.
      const files = Array.isArray(structured) ? structured : [structured];
      const allMessages = files.flatMap(f =>
        (f.messages || []).map(m => ({
          file:     f.filePath || f.fileName || "?",
          line:     m.line,
          col:      m.column,
          severity: m.severity === 2 ? "error" : "warning",
          rule:     m.ruleId || m.rule || "",
          message:  m.message
        }))
      );
      const errors   = allMessages.filter(m => m.severity === "error");
      const warnings = allMessages.filter(m => m.severity === "warning");
      return okText(JSON.stringify({
        pass:     exitCode === 0,
        fixed:    fix,
        errors:   errors.length,
        warnings: warnings.length,
        summary:  "" + errors.length + " error(s), " + warnings.length + " warning(s)",
        messages: allMessages
      }, null, 2));
    }

    // Fallback: return raw text output.
    const rawOutput = tail(stdout + "\n" + stderr);
    return okText(JSON.stringify({
      pass:      exitCode === 0,
      exitCode,
      rawOutput,
      note: "Could not parse JSON output — raw linter output returned above."
    }, null, 2));
  }
};
