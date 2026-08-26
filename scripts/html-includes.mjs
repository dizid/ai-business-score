// Shared by vite.config.ts's html-includes plugin and scripts/build-blog.mjs:
// expands `<!--#include:name-->` markers into the contents of
// partials/name.html, reindenting every line of the partial with the
// marker's own leading whitespace so composed HTML keeps the indentation
// style of whichever file the marker sits in. Single-level only (partials
// cannot themselves contain include markers) — not needed here, kept
// intentionally simple.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const INCLUDE_RE = /^([ \t]*)<!--#include:([\w-]+)-->[ \t]*$/gm;

export function resolveIncludes(html, partialsDir) {
  return html.replace(INCLUDE_RE, (_match, indent, name) => {
    const raw = readFileSync(path.join(partialsDir, `${name}.html`), 'utf8');
    const trimmed = raw.replace(/\s+$/, ''); // drop the partial file's own trailing newline
    return trimmed
      .split('\n')
      .map((line) => indent + line)
      .join('\n');
  });
}
