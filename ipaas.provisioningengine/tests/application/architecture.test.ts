import assert from "node:assert/strict";
import { it } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import ts from "typescript";
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : entry.name.endsWith(".ts")
        ? [path]
        : [];
  });
}
const root = resolve("src");
it("enforces inward imports and prevents platform/environment primitives in domain/application", () => {
  for (const layer of ["domain", "application"])
    for (const file of files(resolve(root, layer))) {
      const source = readFileSync(file, "utf8");
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node): void {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const name = node.moduleSpecifier.text;
          assert.ok(
            name.startsWith("."),
            `External dependency ${name} in ${file}`,
          );
          const destination = relative(
            root,
            resolve(dirname(file), name),
          ).replaceAll("\\", "/");
          assert.ok(
            destination.startsWith("domain/") ||
              (layer === "application" &&
                destination.startsWith("application/")),
            `Outward dependency ${destination}`,
          );
        }
        ts.forEachChild(node, visit);
      }
      visit(parsed);
      assert.doesNotMatch(
        source,
        /process\.|\bfetch\(|\brequire\(|import\s*\(|\bBuffer\b|console\./,
      );
    }
});
it("keeps legacy metadata, direct environment reads, and polling out of production paths", () => {
  for (const file of files(root)) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /INTEGRATION_ID|SOURCE_CONNECTOR|DESTINATION_CONNECTOR|SYNC_MODE|integrationId|sourceConnector|destinationConnector/,
    );
    assert.doesNotMatch(source, /setInterval\(|SKIP LOCKED/);
    if (!relative(root, file).replaceAll("\\", "/").startsWith("config/"))
      assert.doesNotMatch(source, /process\.env/);
    if (!relative(root, file).replaceAll("\\", "/").startsWith("scripts/"))
      assert.doesNotMatch(source, /console\.log|debugger/);
  }
});
