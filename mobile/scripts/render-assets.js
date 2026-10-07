// Renders the app icon and splash PNGs (mobile/assets) from the SafaKabad mark
// with headless Chrome. Run: node scripts/render-assets.js  (then
// npx capacitor-assets generate --android). Re-run only when the logo changes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '..', 'assets');
fs.mkdirSync(OUT, { recursive: true });

const MARK = `<path d="M27.5 15.5a9 9 0 1 0 1.4 8.2" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
<path d="M29.6 10.5v6.2h-6.2" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="20" cy="20" r="3" fill="#E9D9B4"/>`;
const BG = 'radial-gradient(circle at 30% 25%, #1F8A63 0%, #0F6247 55%, #0B4A35 100%)';

const pages = {
  // Legacy square icon: full-bleed emerald with the mark.
  'icon-only.png': [1024, `<body style="margin:0;width:1024px;height:1024px;background:${BG};display:grid;place-items:center">
    <svg viewBox="0 0 40 40" width="700" height="700">${MARK}</svg></body>`],
  // Adaptive icon foreground: mark inside the 66% safe zone, transparent.
  'icon-foreground.png': [1024, `<body style="margin:0;width:1024px;height:1024px;background:transparent;display:grid;place-items:center">
    <svg viewBox="0 0 40 40" width="560" height="560">${MARK}</svg></body>`],
  'icon-background.png': [1024, `<body style="margin:0;width:1024px;height:1024px;background:${BG}"></body>`],
  'splash.png': [2732, splash()],
  'splash-dark.png': [2732, splash()],
};

function splash() {
  return `<body style="margin:0;width:2732px;height:2732px;background:radial-gradient(1400px 900px at 75% 10%, rgba(34,150,108,.35), transparent 60%),#0E1F1A;display:grid;place-items:center;font-family:'Segoe UI',Arial,sans-serif">
  <div style="display:flex;flex-direction:column;align-items:center;gap:56px">
    <div style="width:420px;height:420px;border-radius:110px;background:${BG};display:grid;place-items:center;box-shadow:0 60px 120px -40px rgba(0,0,0,.7);outline:6px solid rgba(217,182,106,.45);outline-offset:-6px">
      <svg viewBox="0 0 40 40" width="300" height="300">${MARK}</svg>
    </div>
    <div style="font-size:150px;font-weight:700;color:#fff;letter-spacing:-3px">Safa<span style="color:#D9B66A">Kabad</span></div>
  </div></body>`;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-assets-'));
for (const [name, [size, html]] of Object.entries(pages)) {
  const file = path.join(tmp, name.replace('.png', '.html'));
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"></head>${html}</html>`);
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--user-data-dir=${path.join(tmp, 'profile')}`,
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${path.join(OUT, name)}`,
    `file:///${file.replace(/\\/g, '/')}`,
  ]);
  console.log('rendered', name);
}
