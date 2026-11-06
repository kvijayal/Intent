import path from "node:path";
import { exists, readText, writeText } from "../../lib/fs-utils.js";
import { parseEdmx, buildMockData } from "../../lib/edmx.js";
import { findNamespaceSources } from "../../lib/namespace.js";
import { okText, errText } from "../_util.js";
import { loadStackSync } from "../../lib/stack.js";

function mockYaml({ name, urlPath, serviceName }) {
  return "# yaml-language-server: $schema=https://sap.github.io/ui5-tooling/schema/ui5.yaml.json\nspecVersion: \"" + (loadStackSync()?.ui5Tooling?.specVersion || "4.0") + "\"\nmetadata:\n  name: " + name + "\ntype: application\nserver:\n  customMiddleware:\n    - name: sap-fe-mockserver\n      beforeMiddleware: csp\n      configuration:\n        mountPath: /\n        services:\n          - urlPath: " + urlPath + "\n            metadataPath: ./webapp/localService/" + serviceName + "/metadata.xml\n            mockdataPath: ./webapp/localService/" + serviceName + "/data\n            generateMockData: true\n        annotations: []\n    - name: fiori-tools-appreload\n      afterMiddleware: compression\n      configuration:\n        port: 35729\n        path: webapp\n        delay: 300\n";
}

export default {
  name: "gen_mock_from_edmx",
  description:
    "Offline-first mock for a RAP/external OData service: parse the supplied $metadata/EDMX, copy it to webapp/localService/<service>/metadata.xml, generate sample mockdata per entity set, and write ui5-mock.yaml (sap-fe-mockserver). The app then runs fully offline via npm run start:mock.",
  inputSchema: {
    type: "object",
    properties: {
      appDir: { type: "string" },
      edmxPath: { type: "string", description: "Path to the service $metadata / EDMX file." },
      serviceName: { type: "string", default: "mainService" },
      urlPath: { type: "string", description: "OData service path the app calls, e.g. /odata/v4/po or /sap/opu/odata4/sap/.../srvd/.../0001/." },
      ui5YamlName: { type: "string", description: "metadata.name for ui5-mock.yaml (lowercase). Defaults to the app's namespace." }
    },
    required: ["appDir", "edmxPath"]
  },
  async handler({ appDir, edmxPath, serviceName = "mainService", urlPath, ui5YamlName }) {
    if (!(await exists(appDir))) return errText("appDir not found: " + appDir);
    if (!(await exists(edmxPath))) return errText("EDMX not found: " + edmxPath);

    const xml = await readText(edmxPath);
    const { entityTypes, entitySets } = parseEdmx(xml);
    if (!entitySets.length) return errText("No EntitySets found in EDMX. Is it a valid OData $metadata document?");

    const localDir = path.join(appDir, "webapp", "localService", serviceName);
    await writeText(path.join(localDir, "metadata.xml"), xml);
    const written = ["webapp/localService/" + serviceName + "/metadata.xml"];

    // FK-coordinated mock data: value-list/check entities are filled, and the main entity's foreign
    // keys draw from their real keys → filter dropdowns and F4 value helps are populated and match.
    const dataBySet = buildMockData({ entityTypes, entitySets }, 3);
    for (const set of entitySets) {
      const rows = dataBySet[set.name];
      if (!rows) continue;
      await writeText(path.join(localDir, "data", "" + set.name + ".json"), JSON.stringify(rows, null, 2) + "\n");
      written.push("webapp/localService/" + serviceName + "/data/" + set.name + ".json");
    }

    let name = ui5YamlName;
    if (!name) {
      const src = await findNamespaceSources(appDir);
      name = src.ui5Yaml?.value || src.manifest?.value || "com.intent2code.sample";
    }
    const resolvedUrl = urlPath || "/odata/v4/" + serviceName;
    await writeText(path.join(appDir, "ui5-mock.yaml"), mockYaml({ name, urlPath: resolvedUrl, serviceName }));
    written.push("ui5-mock.yaml");

    return okText(
      `Generated offline mock from EDMX:\n` +
        " - entity sets: " + entitySets.map((s) => s.name).join(", ") + "\n" +
        " - service path: " + resolvedUrl + "\n" +
        " - files: " + written.join(", ") + "\n\n" +
        "Ensure manifest dataSources." + serviceName + ".settings.localUri = localService/" + serviceName + "/metadata.xml (use configure_service), then run: npm run start:mock"
    );
  }
};
