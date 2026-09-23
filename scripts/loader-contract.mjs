import ts from "typescript";

// Mirrors runtime-loader.ts at Hermes 8e221d12a84dd98772e53854121214d10d2ef1a4.
// Keep the host scanner as-is, including its regex-literal limitation.
function codeRanges(source) {
  const ranges = [];
  const stack = [];
  let state = "code";
  let codeStart = 0;
  let i = 0;
  const closeCode = (end) => {
    if (end > codeStart) {
      ranges.push([codeStart, end]);
    }
  };
  while (i < source.length) {
    const ch = source[i];
    const next = i + 1 < source.length ? source[i + 1] : "";
    if (state === "code") {
      if (ch === "/" && next === "/") {
        closeCode(i);
        state = "line-comment";
        i += 2;
      } else if (ch === "/" && next === "*") {
        closeCode(i);
        state = "block-comment";
        i += 2;
      } else if (ch === "'") {
        closeCode(i);
        state = "single";
        i += 1;
      } else if (ch === '"') {
        closeCode(i);
        state = "double";
        i += 1;
      } else if (ch === "`") {
        closeCode(i);
        stack.push("template");
        state = "template";
        i += 1;
      } else if (ch === "}" && stack[stack.length - 1] === "expr") {
        closeCode(i);
        stack.pop();
        state = "template";
        i += 1;
      } else {
        i += 1;
      }
      continue;
    }
    if (state === "line-comment") {
      if (ch === "\n") {
        state = "code";
        codeStart = i;
      }
      i += 1;
      continue;
    }
    if (state === "block-comment") {
      if (ch === "*" && next === "/") {
        i += 2;
        state = "code";
        codeStart = i;
      } else {
        i += 1;
      }
      continue;
    }
    if (state === "single" || state === "double") {
      if (ch === "\\") {
        i += 2;
      } else if (ch === (state === "single" ? "'" : '"')) {
        i += 1;
        state = "code";
        codeStart = i;
      } else if (ch === "\n") {
        // Unterminated literal — recover as code so one stray quote cannot
        // swallow the rest of the file.
        i += 1;
        state = "code";
        codeStart = i;
      } else {
        i += 1;
      }
      continue;
    }
    // Template-literal text.
    if (ch === "\\") {
      i += 2;
    } else if (ch === "$" && next === "{") {
      stack.push("expr");
      state = "code";
      i += 2;
      codeStart = i;
    } else if (ch === "`") {
      stack.pop();
      state = "code";
      i += 1;
      codeStart = i;
    } else {
      i += 1;
    }
  }
  closeCode(source.length);
  return ranges;
}
/** True when *at* sits inside a code range (ordered, non-overlapping). */
function inCode(ranges, at) {
  for (const [start, end] of ranges) {
    if (at < start) {
      return false;
    }
    if (at < end) {
      return true;
    }
  }
  return false;
}

export const hostImportPattern = () =>
  /(from\s*|import\s*\(\s*|import\s+)(['"])([^'"]+)\2/g;

const allowed = new Set(["@hermes/plugin-sdk", "react", "react/jsx-runtime"]);
export function rewriteHostImports(source, map) {
  const ranges = codeRanges(source);
  return source.replace(
    hostImportPattern(),
    (whole, pre, quote, spec, offset) =>
      map[spec] && inCode(ranges, offset)
        ? pre + quote + map[spec] + quote
        : whole,
  );
}

export function assertLoaderCompatible(source) {
  const ranges = codeRanges(source);
  const matches = [...source.matchAll(hostImportPattern())].filter((match) =>
    inCode(ranges, match.index),
  );
  const invalid = matches
    .map((match) => match[3])
    .filter((spec) => !allowed.has(spec));
  if (invalid.length) {
    throw new Error(
      "Hermes runtime loader rejects import match: " +
        JSON.stringify([...new Set(invalid)]),
    );
  }
  // Parse independently so an import swallowed by the host scanner cannot pass.
  const file = ts.createSourceFile(
    "plugin.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  function visit(node) {
    const specifier =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : undefined;
    if (specifier && ts.isStringLiteralLike(specifier)) {
      const start = specifier.getStart(file);
      if (!matches.some((match) => match.index + match[1].length === start)) {
        throw new Error(
          "Hermes runtime loader misses real import: " + specifier.text,
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}
