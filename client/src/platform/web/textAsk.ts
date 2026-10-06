import type { TextAsk } from '../types';

// The browser's text box for a problem report: a plain DOM dialog over the canvas (Pixi has no
// text input). Keys typed into it stop there, so WASD does not also reach the game's keys.

const CSS = `
.hk-ask{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(11,14,12,.75);font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif}
.hk-ask>div{box-sizing:border-box;width:min(92vw,560px);background:#2c3631;border:4px solid #0b0e0c;border-radius:20px;padding:20px;color:#fff}
.hk-ask h2{margin:0 0 8px;font-size:22px}
.hk-ask p{margin:0 0 12px;font-size:15px;color:#8f9a94}
.hk-ask textarea{box-sizing:border-box;width:100%;height:150px;resize:none;border-radius:10px;border:3px solid #0b0e0c;padding:10px;font-family:inherit;font-size:16px;background:#fff;color:#0b0e0c}
.hk-ask .row{display:flex;gap:12px;margin-top:14px}
.hk-ask button{flex:1;padding:12px;border-radius:12px;border:3px solid #0b0e0c;font-family:inherit;font-size:18px;font-weight:bold;cursor:pointer;background:#232a26;color:#fff}
.hk-ask button.go{background:#f0a020;color:#0b0e0c}`;

export function askTextDom(o: TextAsk): Promise<string | null> {
  return new Promise((resolve) => {
    if (!document.getElementById('hk-ask-css')) {
      const style = document.createElement('style');
      style.id = 'hk-ask-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'hk-ask';
    const box = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = o.title;
    const prompt = document.createElement('p');
    prompt.textContent = o.prompt;
    const area = document.createElement('textarea');
    area.placeholder = o.placeholder;
    area.maxLength = o.max;
    const row = document.createElement('div');
    row.className = 'row';
    const cancel = document.createElement('button');
    cancel.textContent = o.cancel;
    const send = document.createElement('button');
    send.className = 'go';
    send.textContent = o.send;
    row.append(cancel, send);
    box.append(title, prompt, area, row);
    root.append(box);
    const done = (text: string | null) => {
      root.remove();
      resolve(text);
    };
    cancel.onclick = () => done(null);
    send.onclick = () => done(area.value.trim());
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') done(null);
    });
    root.addEventListener('keyup', (e) => e.stopPropagation());
    // taps on the dialog never reach the canvas behind it
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend']) root.addEventListener(type, (e) => e.stopPropagation());
    document.body.append(root);
    area.focus();
  });
}
