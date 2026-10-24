// Prints the newest @capacitor-community/media version that fits the installed Capacitor version.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const core = Number(JSON.parse(fs.readFileSync('node_modules/@capacitor/core/package.json', 'utf8')).version.split('.')[0]);
const run = c => { try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const versions = JSON.parse(run('npm view @capacitor-community/media versions --json') || '[]').filter(v => !v.includes('-')).reverse();
for (const v of versions) {
  const raw = run(`npm view @capacitor-community/media@${v} peerDependencies --json`);
  let range = ''; try { range = (JSON.parse(raw || '{}')['@capacitor/core']) || ''; } catch { /* none */ }
  const m = range.match(/(\d+)/); if (!m) continue;
  const n = Number(m[1]);
  if (range.trim().startsWith('>=') ? core >= n : core === n) { console.log(v); process.exit(0); }
}
process.exit(1);
