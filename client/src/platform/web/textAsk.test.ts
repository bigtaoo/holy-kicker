import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserStubs, fakeBrowser, type FakeBrowser, type FakeElement } from '../../testkit/fakeBrowser';
import type { TextAsk } from '../types';
import { askTextDom } from './textAsk';

// The browser's text box (the player's name, a problem report) over the canvas.

const ASK: TextAsk = { title: 'Your name', prompt: 'Shown on the boards', placeholder: 'Monk', send: 'Save', cancel: 'Cancel', max: 12 };

let b: FakeBrowser;
beforeEach(() => {
  b = fakeBrowser();
  for (const [k, v] of Object.entries(browserStubs(b))) vi.stubGlobal(k, v);
});
afterEach(() => vi.unstubAllGlobals());

const dialog = () => b.document.body.find((e) => e.className === 'hk-ask');
const area = () => dialog()!.find((e) => e.tagName === 'textarea')!;
const button = (label: string) => dialog()!.find((e) => e.tagName === 'button' && e.textContent === label)!;

describe('askTextDom', () => {
  it('shows the title, prompt and limits, focuses the box, and answers the trimmed text', async () => {
    const answer = askTextDom(ASK);
    const box = area();
    expect(dialog()!.all().map((e: FakeElement) => e.textContent).filter(Boolean)).toEqual(['Your name', 'Shown on the boards', 'Cancel', 'Save']);
    expect([box.placeholder, box.maxLength, b.document.activeElement]).toEqual(['Monk', 12, box]);
    box.value = '  Dao Ming \n';
    button('Save').click();
    expect(await answer).toBe('Dao Ming');
    expect(dialog()).toBeUndefined();
  });

  it('answers null on Cancel and on Escape, and takes the dialog down', async () => {
    const cancelled = askTextDom(ASK);
    button('Cancel').click();
    expect(await cancelled).toBeNull();
    const escaped = askTextDom(ASK);
    area().dispatch('keydown', { key: 'Escape' });
    expect(await escaped).toBeNull();
    expect(dialog()).toBeUndefined();
  });

  it('keeps typed keys and taps from reaching the game behind it', async () => {
    const game = vi.fn();
    b.document.body.addEventListener('keydown', game);
    b.document.body.addEventListener('pointerdown', game);
    void askTextDom(ASK);
    area().dispatch('keydown', { key: 'w' });
    area().dispatch('keyup', { key: 'w' });
    dialog()!.dispatch('pointerdown');
    expect(game).not.toHaveBeenCalled();
    expect(dialog()).toBeDefined();
  });

  it('adds its style sheet once however often it is asked', () => {
    void askTextDom(ASK);
    void askTextDom(ASK);
    expect(b.document.head.children.filter((e) => e.id === 'hk-ask-css')).toHaveLength(1);
  });
});
