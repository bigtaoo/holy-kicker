// The page around the game per theme (build/theme.mjs): client/index.html is Holy Kicker's, with
// its title and the loading screen painted before any script (a cuju ball and HOLY KICKER). The
// corgi build swaps those for its own: the title, a corgi's head hopping over its shadow in the
// same sticker style, a night-sky backdrop. Each swap names the exact text it replaces and fails
// when index.html no longer has it, so a change there cannot quietly ship the monk's page.

const CORGI_HEAD = `<svg viewBox="0 0 120 140" aria-hidden="true">
        <ellipse class="shade" cx="60" cy="132" rx="34" ry="7" fill="#000" />
        <g class="ball" stroke="#2a1a10" stroke-linecap="round" stroke-linejoin="round">
          <path d="M30 52L20 8l36 26z" fill="#e8892f" stroke-width="7" />
          <path d="M90 52l10-44-36 26z" fill="#e8892f" stroke-width="7" />
          <path d="M31 40l-5-22 17 13z" fill="#f8c9a8" stroke="none" />
          <path d="M89 40l5-22-17 13z" fill="#f8c9a8" stroke="none" />
          <ellipse cx="60" cy="68" rx="44" ry="38" fill="#f0973a" stroke-width="7" />
          <path d="M23 86a44 38 0 0 0 76-6a48 40 0 0 1-76 6z" fill="#c96f24" stroke="none" />
          <path d="M55 32c3-2 7-2 10 0l5 34c10 2 20 8 21 18c-4 14-17 20-31 20s-27-6-31-20c1-10 11-16 21-18z" fill="#fbe8cc" stroke="none" />
          <ellipse cx="60" cy="68" rx="44" ry="38" fill="none" stroke-width="7" />
          <circle cx="42" cy="62" r="7" fill="#2a1a10" stroke="none" />
          <circle cx="78" cy="62" r="7" fill="#2a1a10" stroke="none" />
          <circle cx="44.5" cy="59.5" r="2.5" fill="#fff" stroke="none" />
          <circle cx="80.5" cy="59.5" r="2.5" fill="#fff" stroke="none" />
          <ellipse cx="60" cy="77" rx="7" ry="5" fill="#2a1a10" stroke="none" />
          <path d="M51 85q4.5 5 9 0q4.5 5 9 0" fill="none" stroke-width="3.5" />
          <ellipse cx="32" cy="80" rx="6" ry="3.5" fill="#f29a8a" stroke="none" opacity="0.8" />
          <ellipse cx="88" cy="80" rx="6" ry="3.5" fill="#f29a8a" stroke="none" opacity="0.8" />
        </g>
      </svg>`;

/** Each theme's swaps: [the text in client/index.html, what replaces it]. */
const SWAPS = {
  corgi: [
    ['<title>Holy Kicker</title>', '<title>Corgi Commando</title>'],
    ['background: #141816; touch-action: none;', 'background: #10122a; touch-action: none;'],
    ['radial-gradient(circle at 50% 42%, #3a3020 0, #1f2219 38%, #141816 72%)', 'radial-gradient(circle at 50% 42%, #33305a 0, #1c1d3c 38%, #10122a 72%)'],
    ['repeating-conic-gradient(rgba(242, 182, 50, 0.07)', 'repeating-conic-gradient(rgba(160, 180, 255, 0.07)'],
    ['background: #2a302c; overflow: hidden;', 'background: #262a48; overflow: hidden;'],
    [/<svg viewBox="0 0 120 140" aria-hidden="true">[\s\S]*?<\/svg>/, CORGI_HEAD],
    ['<b>HOLY KICKER</b>', '<b>CORGI<br />COMMANDO</b>'],
    // two lines of title, a little smaller than the monk's one line
    ['    </style>', '      #boot b { font-size: min(10vmin, 68px); line-height: 1.05; text-align: center; }\n    </style>'],
  ],
};

/** client/index.html as `theme` ships it; throws when a swap no longer finds its text. */
export function themeHtml(theme, html) {
  let out = html;
  for (const [from, to] of SWAPS[theme] ?? []) {
    const found = typeof from === 'string' ? out.includes(from) : from.test(out);
    if (!found) throw new Error(`theme ${theme}: client/index.html no longer has ${from} (build/themeHtml.mjs)`);
    out = out.replace(from, () => to);
  }
  return out;
}
