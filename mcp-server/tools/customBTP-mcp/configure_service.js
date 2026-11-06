import path from "node:path";
import { exists, readText, writeText, walk } from "../../lib/fs-utils.js";
import { okText, errText } from "../_util.js";

function snippets({ serviceName, url, proxyPath, destinationName, backendUrl }) {
  const dest = destinationName || "<DESTINATION_NAME>";
  const host = backendUrl || "https://<your-backend-host>";
  return "# Service configuration — " + serviceName + "\n\nThis app is wired for BOTH offline mock and the real backend. Flip with the npm scripts:\n\n    npm run start:mock     # offline, generated mock data (sap-fe-mockserver)\n    npm run start:proxy    # real service via the proxy/destination below\n\nOData service path used by the app: " + url + "\n\n## 1. ui5.yaml / ui5-local.yaml — fiori-tools-proxy backend (real backend)\n\n    server:\n      customMiddleware:\n        - name: fiori-tools-proxy\n          afterMiddleware: compression\n          configuration:\n            backend:\n              - path: " + proxyPath + "\n                url: " + host + "          # VS Code: a reachable URL\n                # destination: " + dest + "   # BAS: use a BTP destination instead of url\n\n## 2. Approuter xs-app.json — route to the destination (deploy)\n\n    {\n      \"source\": \"" + proxyPath + "(.*)\",\n      \"target\": \"$1\",\n      \"destination\": \"" + dest + "\",\n      \"authenticationType\": \"xsuaa\",\n      \"csrfProtection\": true\n    }\n\n## 3. mta.yaml — destination & html5 wiring (deploy)\n\n    resources:\n      - name: app-destination-service\n        type: org.cloudfoundry.managed-service\n        parameters:\n          service: destination\n          service-plan: lite\n      # Bind app-destination-service + xsuaa to the approuter module.\n\nClean Core note: the backend service must be a RELEASED/public OData service. Do not point the\ndestination at a modified or non-released core service.\n";
}

export default {
  name: "configure_service",
  description:
    "Wire a Fiori app to its OData service for BOTH local mock and the real backend. Patches manifest.json dataSources and writes service-config.snippets.md with the ui5.yaml/ui5-local.yaml proxy backend block, the approuter xs-app.json route, and the mta.yaml destination resource to merge for deployment.",
  inputSchema: {
    type: "object",
    properties: {
      appDir: { type: "string" },
      source: { type: "string", enum: ["cap", "edmx", "destination"], default: "edmx" },
      serviceName: { type: "string", default: "mainService" },
      serviceUrl: { type: "string", description: "Service path, e.g. /odata/v4/po or /sap/opu/odata4/sap/.../srvd/.../0001/." },
      destinationName: { type: "string", description: "BTP destination name for the real backend (BAS/CF)." },
      backendUrl: { type: "string", description: "Backend host URL for the local VS Code proxy." },
      manifestPath: { type: "string", description: "Explicit webapp/manifest.json to patch. Defaults to <appDir>/webapp/manifest.json." },
      odataVersion: { type: "string", enum: ["2.0", "4.0"], description: "Only used when the dataSource does not exist yet." },
      force: { type: "boolean", default: false, description: "Overwrite uri of an already-wired dataSource." }
    },
    required: ["appDir", "source", "serviceUrl"]
  },
  async handler({ appDir, source, serviceName = "mainService", serviceUrl, destinationName, backendUrl, manifestPath, odataVersion, force = false }) {
    if (!(await exists(appDir))) return errText("appDir not found: " + appDir);
    // No guessed default: a guessed CAP path (/odata/v4/<serviceName>) is a 404 for any real service.
    if (!serviceUrl) return errText("serviceUrl is required — read it from `cds compile srv --to serviceinfo` (CAP) or the backend service path.");
    const url = serviceUrl.endsWith("/") ? serviceUrl : serviceUrl + "/";
    const proxyPath = "/" + url.replace(/^\//, "").split("/")[0];

    let target = manifestPath;
    if (!target) {
      const conventional = path.join(appDir, "webapp", "manifest.json");
      target = (await exists(conventional)) ? conventional : (await walk(appDir)).find((f) => f.endsWith("manifest.json"));
    }
    let manifestNote = "manifest.json not found — add the dataSource manually.";
    if (target) {
      try {
        const j = JSON.parse(await readText(target));
        j["sap.app"] = j["sap.app"] || {};
        j["sap.app"].dataSources = j["sap.app"].dataSources || {};
        const existing = j["sap.app"].dataSources[serviceName];
        const rel = path.relative(appDir, target);
        if (existing?.uri && !force) {
          // Generator / wizard already wired it — never touch annotations, localUri or odataVersion.
          manifestNote = existing.uri === url
            ? "" + rel + ": dataSources." + serviceName + " already wired (" + url + ") — left unchanged."
            : "" + rel + ": dataSources." + serviceName + " already wired with " + existing.uri + " (requested " + url + ") — left unchanged; pass force:true to change the uri only.";
        } else {
          // Merge: keep every existing key/setting, only set what is missing.
          const settings = { ...(existing?.settings || {}) };
          settings.odataVersion ??= odataVersion || "4.0";
          if (source !== "cap") settings.localUri ??= "localService/" + serviceName + "/metadata.xml";
          j["sap.app"].dataSources[serviceName] = { ...(existing || {}), uri: url, type: existing?.type || "OData", settings };
          await writeText(target, JSON.stringify(j, null, 2) + "\n");
          manifestNote = "Patched " + rel + " → dataSources." + serviceName + ".uri = " + url + " (existing settings preserved).";
        }
      } catch (e) {
        manifestNote = "Could not patch manifest automatically: " + e.message;
      }
    }

    await writeText(path.join(appDir, "service-config.snippets.md"), snippets({ serviceName, url, proxyPath, destinationName, backendUrl }));

    return okText(
      "" + manifestNote + "\n" +
        `Wrote service-config.snippets.md (proxy + approuter + mta).\n` +
        "Local run: npm run start:mock (offline) or start:proxy (real backend via " + (destinationName ? "destination \"" + destinationName + "\"" : backendUrl || "the proxy URL") + ")."
    );
  }
};
