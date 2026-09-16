// Mirrors the public runtime-loader.ts import matcher at Hermes 3c3ab69.
// The host scans raw source rather than parsing JavaScript, so ordinary string
// literals can also match. Validate its interpretation, not just ESM imports.
export const hostImportPattern = () =>
  /(from\s*|import\s*\(\s*|import\s+)(['"])([^'"]+)\2/g;

const allowed = new Set(["@hermes/plugin-sdk", "react", "react/jsx-runtime"]);
export function assertLoaderCompatible(source) {
  const invalid = [...source.matchAll(hostImportPattern())]
    .map((match) => match[3])
    .filter(
      (spec) =>
        !/^[./]/.test(spec) &&
        !/^[a-z][a-z0-9+.-]*:/i.test(spec) &&
        !allowed.has(spec),
    );
  if (invalid.length) {
    throw new Error(
      `Hermes runtime loader rejects import match: ${JSON.stringify([...new Set(invalid)])}`,
    );
  }
}
