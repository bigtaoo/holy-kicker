// The keyboard on the level-up and shrine cards (cardPanel.ts), for desktop players: up and down
// (arrows or W/S), or left and right (A/D) along a landscape run's row, move a highlight, Enter or
// Space takes the highlighted card, and 1, 2, 3 take a card at once. Key repeats count for nothing, so a movement key still held from the fight when
// the cards open neither runs the highlight round nor picks. Pure, so it is tested without Pixi.

export type CardKey = { focus: number } | { pick: number } | null;

const UP = new Set(['ArrowUp', 'KeyW', 'ArrowLeft', 'KeyA']);
const DOWN = new Set(['ArrowDown', 'KeyS', 'ArrowRight', 'KeyD']);
const TAKE = new Set(['Enter', 'NumpadEnter', 'Space']);

/** What key `code` does to `count` cards with card `focus` highlighted. */
export function cardKey(code: string, repeat: boolean, focus: number, count: number): CardKey {
  if (repeat || count <= 0) return null;
  if (UP.has(code)) return { focus: (focus - 1 + count) % count };
  if (DOWN.has(code)) return { focus: (focus + 1) % count };
  if (TAKE.has(code)) return { pick: focus };
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (digit && Number(digit[1]) <= count) return { pick: Number(digit[1]) - 1 };
  return null;
}
