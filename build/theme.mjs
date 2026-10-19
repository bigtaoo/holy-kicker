// One game, two art sets (docs/reskin.md "Builds"). `monk` is Holy Kicker: its files are
// client/public, and every existing build ships it. `corgi` is the reskin: client/themes/corgi.json
// maps each file of client/public (the reference set: same paths, same formats) to the corgi's own
// file in the repo, or null while it is not drawn. A corgi build takes no file from client/public
// (unless the list names one there on purpose) and fails while any entry is null or missing, so the
// two sets never mix in a release. `npm run check:theme` keeps the list in step with client/public.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { themeHtml } from './themeHtml.mjs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PUBLIC = join(ROOT, 'client/public');

/**
 * Per theme: its backend and its asset list. Both games share one backend, each naming itself on
 * every request (server/src/game.ts), so their numbers, boards and reports stay apart there.
 */
export const THEMES = {
  monk: { api: 'https://hk.gamestao.com' },
  corgi: { api: 'https://hk.gamestao.com', list: 'client/themes/corgi.json' },
};

export function themeOf(name) {
  if (!THEMES[name]) throw new Error(`unknown theme "${name}" (${Object.keys(THEMES).join(', ')})`);
  return THEMES[name];
}

/** Every file of client/public, as the game asks for it ('art/hero/atlas.png'), sorted. */
export function publicFiles(dir = PUBLIC) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

export const listPath = (name) => join(ROOT, themeOf(name).list);

/** The theme's list: game path → source path from the repo root, or null while not drawn. */
export function readList(name) {
  return JSON.parse(readFileSync(listPath(name), 'utf8'));
}

/**
 * What keeps a list from building: `unlisted` files of client/public without an entry, `unknown`
 * entries for files the game does not have, `todo` entries still null, `gone` sources that are not
 * there.
 */
export function listState(list, files = publicFiles()) {
  const have = new Set(files);
  const keys = Object.keys(list);
  return {
    unlisted: files.filter((f) => !(f in list)),
    unknown: keys.filter((k) => !have.has(k)),
    todo: keys.filter((k) => list[k] === null),
    gone: keys.filter((k) => list[k] !== null && !existsSync(join(ROOT, list[k]))),
  };
}

const show = (label, paths) => (paths.length ? [`${paths.length} ${label}:`, ...paths.slice(0, 40).map((p) => `  ${p}`), ...(paths.length > 40 ? [`  … ${paths.length - 40} more`] : [])] : []);

/** Why the list cannot build yet, as lines, or [] when it can. */
export function listErrors(state) {
  return [
    ...show('files of client/public missing from the list (npm run check:theme -- --sync)', state.unlisted),
    ...show('entries for files the game does not have', state.unknown),
    ...show('files not drawn yet (null)', state.todo),
    ...show('sources that do not exist', state.gone),
  ];
}

const TYPES = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.mp3': 'audio/mpeg' };

/**
 * The Vite plugin that ships a theme's files in place of client/public. Monk: nothing to do.
 * Others: no public dir; the build emits exactly the listed files and fails while the list is
 * incomplete. The dev server serves the listed files and, for development only, falls back to
 * the monk file for an entry still null, so the game runs while the art comes in. index.html gets
 * the theme's title and loading screen (build/themeHtml.mjs).
 */
export function themeAssets(name) {
  themeOf(name);
  if (name === 'monk') return { name: 'hk-theme' };
  let list;
  let build = false;
  return {
    name: 'hk-theme',
    config: () => ({ publicDir: false }),
    configResolved(config) {
      build = config.command === 'build';
    },
    transformIndexHtml(html, ctx) {
      return /(^|[\\/])index\.html$/.test(ctx.filename) ? themeHtml(name, html) : html;
    },
    buildStart() {
      if (!build) return;
      list = readList(name);
      const errors = listErrors(listState(list));
      if (errors.length) this.error(`theme ${name}: ${themeOf(name).list} is not complete\n${errors.join('\n')}`);
    },
    generateBundle() {
      if (!build) return;
      for (const [fileName, src] of Object.entries(list)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(join(ROOT, src)) });
      }
    },
    configureServer(server) {
      let fallbacks = 0;
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const now = readList(name);
        if (!(path in now)) return next();
        const drawn = now[path] !== null && existsSync(join(ROOT, now[path]));
        if (!drawn && fallbacks++ === 0) {
          server.config.logger.warn(`theme ${name}: serving monk files for entries not drawn yet (dev only; a build refuses them)`);
        }
        res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
        res.end(readFileSync(drawn ? join(ROOT, now[path]) : join(PUBLIC, path)));
      });
    },
  };
}
