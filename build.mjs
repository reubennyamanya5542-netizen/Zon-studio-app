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
const APP_ID = 'com.zongroupdev.zonstudio';

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
// The supplied app icon is kept in the repository root as app-icon.png.
// It is used for launcher, adaptive-icon, and splash assets on every build.
const ICON_SOURCE = path.join(root, 'app-icon.png');
if (!fs.existsSync(ICON_SOURCE)) throw new Error('Missing app-icon.png');
const S = 1024, W = 2732, out = f => path.join(root, 'assets', f);
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });

const icon = sharp(ICON_SOURCE).resize(S, S, { fit: 'cover' });
await icon.clone().png().toFile(out('icon-only.png'));
await icon.clone().png().toFile(out('icon-foreground.png'));
await sharp({
  create: { width: S, height: S, channels: 4, background: '#06152e' }
}).png().toFile(out('icon-background.png'));

const splashBg = sharp({
  create: { width: W, height: W, channels: 4, background: '#06152e' }
});
const splashIcon = await sharp(ICON_SOURCE).resize(1500, 1500, { fit: 'contain' }).png().toBuffer();
await splashBg.composite([{ input: splashIcon, gravity: 'center' }]).png().toFile(out('splash.png'));
await sharp(out('splash.png')).png().toFile(out('splash-dark.png'));
console.log('Blue globe app icon and splash images written.');

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
