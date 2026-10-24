// Runs after build.mjs: replaces the old gold icon and splash with the new Zon logo (zon-logo.png).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd(), LOGO = path.join(root, 'zon-logo.png');
if (!fs.existsSync(LOGO)) throw new Error('zon-logo.png is missing from the repo main folder.');
const out = f => path.join(root, 'assets', f), S = 1024, W = 2732, BG = '#0b0c10';
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
const logo = px => sharp(LOGO).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const canvas = (n, bg) => sharp({ create: { width: n, height: n, channels: 4, background: bg } });

await canvas(S, { r: 0, g: 0, b: 0, alpha: 0 }).composite([{ input: await logo(S) }]).png().toFile(out('icon-only.png'));
await canvas(S, BG).png().toFile(out('icon-background.png'));
await canvas(S, { r: 0, g: 0, b: 0, alpha: 0 }).composite([{ input: await logo(620) }]).png().toFile(out('icon-foreground.png'));
const splash = await canvas(W, BG).png().toBuffer(); // plain dark screen, no animation or logo
fs.writeFileSync(out('splash.png'), splash); fs.writeFileSync(out('splash-dark.png'), splash);
console.log('New Zon logo icon and splash written.');
