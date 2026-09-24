import ts from "typescript";

// Hermes's loader mistakes a raw backtick in a regex for a template literal.
// Escape only regex tokens, preserving strings, comments, and real templates.
export function escapeRegexBackticks(source) {
  const file = ts.createSourceFile(
    "plugin.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const replacements = [];
  function visit(node) {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const start = node.getStart(file);
      const text = source.slice(start, node.end);
      if (text.includes("`")) {
        replacements.push({
          start,
          end: node.end,
          text: text.replace(
            /(\\*)`/g,
            (_, slashes) =>
              slashes.slice(0, slashes.length - (slashes.length % 2)) + "\\x60",
          ),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const { start, end, text } of replacements.reverse()) {
    source = source.slice(0, start) + text + source.slice(end);
  }
  return source;
}
