// The game's own page as a friend's weekly link (meta/invite.ts): `?w=<code>` on the address the
// game was opened at, nothing else of it kept. A release reads it on purpose (it only names a
// target to beat, never bends a run), so it is not one of the dev switches releaseSwitches.mjs
// keeps out of releases, and is read without URLSearchParams to stay out of that scan.

/** `href`'s page with only the invite code in its query. */
export function inviteUrl(href: string, code: string): string {
  const page = href.replace(/[?#].*$/, '');
  return `${page}?w=${encodeURIComponent(code)}`;
}

/** The invite code in the query `search` (`?a=1&w=…`), or null. */
export function inviteParam(search: string): string | null {
  const m = /[?&]w=([^&#]*)/.exec(search);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]) || null;
  } catch {
    return null;
  }
}
