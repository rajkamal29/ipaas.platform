/**
 * Switches @rajkamal29/adapter-connectwise and @rajkamal29/adapter-keka back to
 * their real, registry-installed versions — the opposite of
 * `npm run providers:link` (plain `npm link @rajkamal29/adapter-connectwise
 * @rajkamal29/adapter-keka`, see package.json).
 *
 * Deliberately does NOT use `npm unlink` here: in current npm, `npm
 * unlink <pkg>` run inside a project is an alias for `npm uninstall
 * <pkg>`, which removes the package from package.json's dependencies
 * unless you remember `--no-save` every time — an easy way to
 * accidentally lose the real dependency declaration. Removing the
 * symlinked node_modules entries directly and letting `npm install`
 * reconcile against package.json/package-lock.json instead is safer,
 * simpler, and never touches package.json.
 *
 * Requires @rajkamal29/* to actually be installable from the registry —
 * see .npmrc (this folder) and docs/setup/DEVELOPER_SETUP.md for the
 * one-time NODE_AUTH_TOKEN setup this depends on.
 *
 * Usage: node scripts/unlink-providers.js
 *   (or: npm run providers:unlink)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGES = ['@rajkamal29/adapter-connectwise', '@rajkamal29/adapter-keka'];
const ROOT = path.join(__dirname, '..');

for (const pkg of PACKAGES) {
  const dir = path.join(ROOT, 'node_modules', pkg);
  if (fs.existsSync(dir)) {
    const isSymlink = fs.lstatSync(dir).isSymbolicLink();
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Removed ${isSymlink ? 'linked' : 'installed'} node_modules/${pkg}.`);
  } else {
    console.log(`node_modules/${pkg} wasn't present — nothing to remove.`);
  }
}

console.log('Running npm install to restore the real (registry) versions from package.json...');
execSync('npm install', { stdio: 'inherit', cwd: ROOT });
console.log('Done — now running on the published @rajkamal29/* packages, not local npm link symlinks.');
