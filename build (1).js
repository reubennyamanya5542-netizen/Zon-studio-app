// Prepares the files required for the Android build:
//  1. capacitor.config.json
//  2. Android icon and splash images
//  3. www/ with the offline web app and bundled fonts
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const FIXTURE = process.env.ZON_FONT_FIXTURE;
const MIN_FONTS = Number(process.env.ZON_MIN_FONTS || 40);

// This ID must never change after the first installed release.
const APP_ID = 'com.zonstudio.editor';

/* ---------- 1. Capacitor config ---------- */
fs.writeFileSync(path.join(root, 'capacitor.config.json'), JSON.stringify({
  appId: APP_ID,
  appName: 'Zon Studio',
  webDir: 'www',
  backgroundColor: '#0b0c10',
  android: { backgroundColor: '#0b0c10' },
  server: { androidScheme: 'https' }
}, null, 2) + '\n');

/* ---------- 2. Icon and splash ---------- */
const gold = '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2cc"/><stop offset=".45" stop-color="#e2b04f"/><stop offset="1" stop-color="#8f5d1b"/></linearGradient>';
const bgGrad = '<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#262a37"/><stop offset="1" stop-color="#07080b"/></linearGradient>';
const mark = '<g fill="none" stroke="url(#g)" stroke-width="2.2"><rect x="21" y="26" width="62" height="68" rx="13" opacity=".18"/><rect x="37" y="26" width="62" height="68" rx="13" opacity=".3"/><rect x="29" y="22" width="62" height="76" rx="14" opacity=".7"/></g>'
  + '<path d="M40 43H80L40 77H80" fill="none" stroke="url(#g)" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>'
  + '<path d="M93 18l1.7 4.6 4.6 1.7-4.6 1.7L93 30.6l-1.7-4.6L86.7 24.3l4.6-1.7z" fill="#fff2cc"/>';
const place = (px, size) => { const k = px / 78; return `<g transform="translate(${size / 2 - 60 * k},${size / 2 - 60 * k}) scale(${k})">${mark}</g>`; };
const svg = (w, h, inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${gold}${bgGrad}<radialGradient id="r" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#181b26"/><stop offset="1" stop-color="#090a0e"/></radialGradient></defs>${inner}</svg>`);
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
const S = 1024, W = 2732, out = f => path.join(root, 'assets', f);
await sharp(svg(S, S, `<rect width="${S}" height="${S}" fill="url(#b)"/><rect x="14" y="14" width="${S - 28}" height="${S - 28}" rx="230" fill="none" stroke="url(#g)" stroke-opacity=".55" stroke-width="10"/>${place(640, S)}`)).png().toFile(out('icon-only.png'));
await sharp(svg(S, S, `<rect width="${S}" height="${S}" fill="url(#b)"/>`)).png().toFile(out('icon-background.png'));
await sharp(svg(S, S, place(520, S))).png().toFile(out('icon-foreground.png'));
const splash = svg(W, W, `<rect width="${W}" height="${W}" fill="url(#r)"/>${place(560, W)}`);
await sharp(splash).png().toFile(out('splash.png'));
await sharp(splash).png().toFile(out('splash-dark.png'));
console.log('Icon and splash images written.');

/* ---------- 3. Offline web app ---------- */
const www = path.join(root, 'www');
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(path.join(www, 'fonts'), { recursive: true });
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const block = src.match(/const FONT_CATS = \{([\s\S]*?)\n\};/);
if (!block) throw new Error('Could not find FONT_CATS in index.html');
const cats = new Function('return {' + block[1] + '}')();
const SYSTEM = new Set(['Sans', 'Serif', 'Mono']);
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function getBytes(s, w) {
  const file = `${s}-latin-${w}-normal.woff2`;
  if (FIXTURE) {
    const f = path.join(FIXTURE, file);
    return fs.existsSync(f) ? fs.readFileSync(f) : null;
  }
  for (const url of [`https://cdn.jsdelivr.net/npm/@fontsource/${s}@5/files/${file}`, `https://unpkg.com/@fontsource/${s}@5/files/${file}`]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(url);
        if (r.ok) return Buffer.from(await r.arrayBuffer());
        if (r.status === 404) return null;
      } catch { /* retry */ }
    }
  }
  return null;
}

const names = [...new Set(Object.values(cats).flat())].filter(n => !SYSTEM.has(n));
const bundled = new Map();
let css = '/* Open Font License fonts from Fontsource, bundled so the app works offline. */\n';
for (let i = 0; i < names.length; i += 8) {
  await Promise.all(names.slice(i, i + 8).map(async name => {
    const s = slug(name), got = [];
    for (const w of [400, 700]) {
      const buf = await getBytes(s, w);
      if (buf) {
        fs.writeFileSync(path.join(www, 'fonts', `${s}-${w}.woff2`), buf);
        got.push(w);
      }
    }
    if (got.length) bundled.set(name, got);
    else console.warn('  skipped (not found):', name);
  }));
}
for (const name of names) {
  for (const w of bundled.get(name) || []) {
    css += `@font-face{font-family:"${name}";font-style:normal;font-weight:${w};font-display:swap;src:url(fonts/${slug(name)}-${w}.woff2) format("woff2")}\n`;
  }
}
fs.writeFileSync(path.join(www, 'fonts.css'), css);
console.log(`Bundled ${bundled.size} of ${names.length} fonts.`);
if (bundled.size < MIN_FONTS) throw new Error(`Only ${bundled.size} fonts could be downloaded (need ${MIN_FONTS}). Run the build again.`);

const filtered = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, v.filter(n => SYSTEM.has(n) || bundled.has(n))]));
const newBlock = 'const FONT_CATS = {\n' + Object.entries(filtered).map(([k, v]) => `  ${k}: [${v.map(n => JSON.stringify(n)).join(', ')}]`).join(',\n') + '\n};';
const html = src
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '')
  .replace(/const FONT_CATS = \{[\s\S]*?\n\};/, () => newBlock)
  .replace('<style>', () => '<link rel="stylesheet" href="fonts.css">\n<style>');
if (/fonts\.googleapis|fonts\.gstatic/.test(html)) throw new Error('A Google Fonts reference is still in the page, so the app would not work offline.');
const head = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">'
  + '<meta name="theme-color" content="#121317">'
  + '<style>:root{color-scheme:dark;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>'
  + '</head><body>';
fs.writeFileSync(path.join(www, 'index.html'), head + html + '</body></html>');
console.log('Wrote www/index.html');
