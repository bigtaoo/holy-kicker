import { describe, expect, it } from 'vitest';
import { engineSources } from './lintFiles.mjs';

// Enforces the sim rules from README.md: no call whose result can differ between JS engines
// or between runs, and nothing from the render side. Comments and strings are blanked before
// scanning, so prose quoting a rule does not trip it. The allowlist carries a reason per
// entry and must stay minimal: an exception that stops being needed fails the test.

const BANNED: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /\bMath\.random\s*\(/, why: 'use the state Prng streams' },
  { pattern: /\bMath\.sqrt\s*\(/, why: 'use isqrt (math/fixed.ts)' },
  { pattern: /\bMath\.(?:sin|cos|tan|asin|acos|atan2?)\s*\(/, why: 'use sinB/cosB/atan2B (math/trig.ts)' },
  { pattern: /\bMath\.hypot\s*\(/, why: 'use dist (math/fixed.ts)' },
  { pattern: /\bMath\.(?:log2?|log10|exp|pow|cbrt)\s*\(/, why: 'transcendental: not bit-identical across engines' },
  { pattern: /\*\*/, why: 'exponentiation goes through pow: multiply instead' },
  { pattern: /\bDate\b|\bperformance\b|\bsetTimeout\b|\brequestAnimationFrame\b/, why: 'clocks: the sim advances on ticks' },
  { pattern: /\bwindow\b|\bdocument\b|\bnavigator\b/, why: 'browser: the sim knows nothing of the host' },
  // iteration order: each of these is spec'd, but by a history the sim neither hashes nor
  // snapshots (insertion order, key kinds), so a resumed run could walk in another order
  { pattern: /\bfor\s*\(\s*(?:const|let|var)\s+[\w$]+\s+in\b/, why: 'for…in walks keys in insertion order: loop over an array' },
  { pattern: /\bObject\.(?:keys|values|entries)\s*\(/, why: 'key order is insertion order: loop over an array, or allowlist a fixed table' },
  { pattern: /\.(?:keys|values|entries)\s*\(\s*\)/, why: 'Map/Set iteration is insertion order, which a snapshot does not keep' },
  { pattern: /\.sort\s*\(/, why: 'a sort needs a comparator with a total order (a last tiebreak): allowlist it with the reason' },
];

const ALLOWED: readonly { file: string; pattern: RegExp; why: string }[] = [
  { file: 'input.ts', pattern: /\bMath\.(?:hypot|atan2)\s*\(/, why: 'the input edge: the float sample becomes integers here and never enters the sim' },
  { file: 'math/fixed.ts', pattern: /\bMath\.sqrt\s*\(/, why: 'first guess of isqrt, corrected to the exact integer root' },
  { file: 'Engine.ts', pattern: /\[\.\.\.cmds\]\.sort\(\(a, b\) => a\.owner - b\.owner\)/, why: 'one command per owner and tick, so owner is a total order' },
  { file: 'systems/talismans.ts', pattern: /found\.sort\(\(a, b\) => a\.d - b\.d \|\| a\.i - b\.i\)/, why: 'ties broken by mob index' },
  { file: 'hash.ts', pattern: /Object\.keys\(v\)\.sort\(\)/, why: 'the state hash orders the keys itself (string keys, code-unit order)' },
  { file: 'mutators.ts', pattern: /Object\.entries\(MUTATORS\.glass\.bonus\)/, why: 'a constant table, summed: the order cannot change the result' },
  { file: 'bot/balance.ts', pattern: /Object\.entries\(bonus\)|\[\.\.\.xs\]\.sort\(\(a, b\) => a - b\)/, why: 'the balance report (a label, numbers sorted for a median), not the sim' },
];

/** Names a file declares as a Map or Set (`x = new Map`, `x: Map<…>`). */
export function collections(code: string): string[] {
  return [...code.matchAll(/([\w$]+)\s*(?::\s*(?:Readonly)?(?:Map|Set)\s*<|=\s*new\s+(?:Map|Set)\b)/g)].map((m) => m[1]);
}

/** Lines that walk one of `names` (for…of, spread, forEach, Array.from) instead of looking a key up. */
export function walksOf(code: string, names: readonly string[]): string[] {
  if (names.length === 0) return [];
  const n = `(?:[\\w$.]*\\.)?(?:${names.join('|')})\\b`;
  const walk = new RegExp(`\\bof\\s+${n}|\\.\\.\\.\\s*${n}|\\b(?:${names.join('|')})\\.forEach\\s*\\(|Array\\.from\\(\\s*${n}`);
  return code.split('\n').filter((line) => walk.test(line));
}

/** Blanks comments and string literals, keeping line breaks so line numbers stay true. */
export function strip(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) out += src[i++] === '\n' ? '\n' : ' ';
      i++;
    } else if (c === "'" || c === '"' || c === '`') {
      out += c;
      for (i++; i < src.length && src[i] !== c; i++) {
        if (src[i] === '\\') i++;
        out += src[i] === '\n' ? '\n' : ' ';
      }
      out += c;
    } else out += c;
  }
  return out;
}

const files = engineSources().map((f) => ({ rel: f.rel, text: f.text, code: strip(f.text) }));

describe('determinism lint', () => {
  it('scans the sim sources', () => {
    expect(files.map((f) => f.rel)).toContain('Engine.ts');
    expect(files.length).toBeGreaterThan(10);
  });

  it('finds no banned call outside the allowlist', () => {
    const found: string[] = [];
    for (const f of files) {
      f.code.split('\n').forEach((line, i) => {
        for (const b of BANNED) {
          if (!b.pattern.test(line)) continue;
          if (ALLOWED.some((a) => a.file === f.rel && a.pattern.test(line))) continue;
          found.push(`${f.rel}:${i + 1} ${line.trim()}  (${b.why})`);
        }
      });
    }
    expect(found).toEqual([]);
  });

  it('imports nothing outside the engine (no Pixi, no client code)', () => {
    const outside = files.flatMap((f) =>
      [...f.text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((m) => !m.startsWith('.')).map((m) => `${f.rel}: ${m}`));
    expect(outside).toEqual([]);
  });

  it('walks no Map or Set (insertion order, which a snapshot does not keep)', () => {
    // across files: a field declared in state.ts (gemCells) is used elsewhere
    const names = [...new Set(files.flatMap((f) => collections(f.code)))];
    const found = files.flatMap((f) => walksOf(f.code, names).map((line) => `${f.rel}: ${line.trim()}`));
    expect(found).toEqual([]);
  });

  it('spots a walk over a Map or Set but not a lookup', () => {
    const code = 'const m = new Map<number, X>();\nm.get(1);\nfor (const [k, v] of m) {}\nconst a = [...s.cells];\nm.forEach(f);\nconst mm = 1;';
    expect(collections(code + '\ncells: Map<number, Gem>;')).toEqual(['m', 'cells']);
    expect(walksOf(code, ['m', 'cells'])).toEqual(['for (const [k, v] of m) {}', 'const a = [...s.cells];', 'm.forEach(f);']);
  });

  it('keeps every allowlist entry in use', () => {
    for (const a of ALLOWED) expect(files.find((f) => f.rel === a.file)?.code).toMatch(a.pattern);
  });

  it('strips comments and strings but keeps code', () => {
    expect(strip("a(); // Math.random()\nb('Math.sqrt(')")).toBe("a(); \nb('          ')");
  });
});
