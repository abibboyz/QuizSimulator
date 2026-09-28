// Resolve hooks for `node --test`: maps the app's "@/…" import alias (tsconfig
// `paths`) onto the project root and fills in the ".ts"/".tsx" extension, so
// tests can import modules that use the alias (timeline, factory, …).
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = (base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];

function probe(base) {
  for (const file of candidates(base)) if (existsSync(file) && statSync(file).isFile()) return file;
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const file = probe(path.join(root, specifier.slice(2)));
    if (file) return next(pathToFileURL(file).href, context);
  }
  // Relative imports inside the app omit extensions; add them for Node.
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const parent = path.dirname(fileURLToPath(context.parentURL));
    const target = path.resolve(parent, specifier);
    if (!existsSync(target) || !statSync(target).isFile()) {
      const file = probe(target);
      if (file) return next(pathToFileURL(file).href, context);
    }
  }
  return next(specifier, context);
}
