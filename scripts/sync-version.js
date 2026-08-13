// Keeps public/sw.js's APP_VERSION constant in sync with the single
// source of truth, public/version.json.
//
// This is a plain build-time convenience script — it does not run at
// request time and is not part of the Service Worker's runtime
// architecture in any way. It just does one string replace.
//
// Run with: npm run sync-version
// (run this, then commit both files, before every deploy that changes
// any file the Service Worker precaches or the API allowlist covers)

const fs = require('fs');
const path = require('path');

const VERSION_JSON_PATH = path.join(__dirname, '..', 'public', 'version.json');
const SW_PATH = path.join(__dirname, '..', 'public', 'sw.js');

function main() {
  const { version } = JSON.parse(fs.readFileSync(VERSION_JSON_PATH, 'utf8'));
  if (!version || typeof version !== 'string') {
    throw new Error(`public/version.json is missing a valid "version" string field.`);
  }

  const swSource = fs.readFileSync(SW_PATH, 'utf8');
  const pattern = /const APP_VERSION = '[^']*';/;
  if (!pattern.test(swSource)) {
    throw new Error(`Could not find "const APP_VERSION = '...';" in public/sw.js — sync-version.js may need updating if sw.js's structure changed.`);
  }

  const updated = swSource.replace(pattern, `const APP_VERSION = '${version}';`);
  if (updated === swSource) {
    console.log(`public/sw.js already matches version.json (${version}). Nothing to do.`);
    return;
  }

  fs.writeFileSync(SW_PATH, updated);
  console.log(`Synced public/sw.js APP_VERSION -> '${version}'.`);
}

main();
