import { LIMITS } from './protocol';

// The server's guard on a portal account's name, re-exported by protocol.ts so the client reads
// it as @hk/protocol. Pure, like the rest of the protocol.

export type NameCheck = { ok: true; name: string } | { ok: false; why: 'length' | 'chars' | 'rude' };

// Names nobody should wear, matched inside the name with spaces and punctuation taken out and
// digits read as letters (f4ck): rude words in the game's languages, politics a Chinese host
// refuses, and names that pass for staff. Short or common-looking ones are in WORDS instead,
// matched only as a whole word, so "glass" and "computer" stay fine.
const INSIDE = [
  'fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'bitch', 'whore', 'slut', 'rapist', 'hitler', 'porn', 'pussy', 'penis',
  'dildo', 'retard', 'asshole', 'bastard', 'wanker', 'twat', 'arschloch', 'fotze', 'wichser', 'schlampe', 'hurensohn',
  'putain', 'salope', 'connard', 'encule', 'mierda', 'cabron', 'pendejo', 'maricon', 'caralho', 'buceta', 'cazzo', 'stronzo',
  'vaffanculo', 'puttana', 'kurwa', 'pierdol', 'jebac', 'pizda', 'хуй', 'пизд', 'бляд', 'ебат', 'ебан', 'сука', 'мудак', 'пидор',
  'ちんこ', 'まんこ', '死ね', 'きちがい', '씨발', '시발', '병신', '좆', '개새끼', '傻逼', '煞笔', '操你', '草泥马', '你妈', '妈的',
  '他妈', '尼玛', '日你', '鸡巴', '屌', '婊子', '贱人', '去死', '狗日', '王八蛋', '习近平', '共产党', '法轮', '六四', '台独',
  '毛泽东', 'admin', 'moderator', 'crazygames', '官方', '客服', '管理员',
];
const WORDS = ['ass', 'cock', 'dick', 'fag', 'kys', 'nazi', 'puta', 'pute', 'merde', 'porra', 'troia', 'chuj', 'hure', 'sb', 'gm', 'poki', 'staff', 'dev'];
/** Digits read as letters: any digit for a vowel (f4ck, sh1t), and the usual ones for consonants. */
const LEET: Record<string, string> = { s: '5', t: '7', g: '69', b: '8', l: '1', z: '2' };
const looseLetters = (w: string) => [...w].map((c) => (/[aeiouy]/.test(c) ? `[${c}0-9]` : LEET[c] ? `[${c}${LEET[c]}]` : c)).join('');
const RUDE_INSIDE = new RegExp(INSIDE.map(looseLetters).join('|'));
const RUDE_WORD = new RegExp(`^(${WORDS.map(looseLetters).join('|')})$`);

/**
 * A portal account's name, cleaned (spaces folded, compatibility forms unified), or why it is
 * refused: its length, characters other than letters, digits, spaces and _ . -, or a word above.
 * The portal moderates its names already; this is the server's guard against a client that
 * sends something else as one.
 */
export function checkName(raw: string): NameCheck {
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const n = [...name].length;
  if (n < LIMITS.nameMin || n > LIMITS.nameMax) return { ok: false, why: 'length' };
  if (!/^[\p{L}\p{M}\p{N} _.-]+$/u.test(name)) return { ok: false, why: 'chars' };
  const lower = name.toLowerCase();
  if (RUDE_INSIDE.test(lower.replace(/[ _.-]/g, '')) || lower.split(/[ _.-]+/).some((w) => RUDE_WORD.test(w))) return { ok: false, why: 'rude' };
  return { ok: true, name };
}
