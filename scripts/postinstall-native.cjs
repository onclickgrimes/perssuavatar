const { spawnSync } = require('child_process');

function run(command) {
  const result = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });
  return result.status === 0;
}

const installDepsOk = run('electron-builder install-app-deps');

if (!installDepsOk) {
  console.warn('[postinstall] electron-builder install-app-deps failed. Applying sqlite3 fallback...');
  const sqliteOk = run('npm rebuild sqlite3 --verbose');
  if (!sqliteOk) {
    console.warn('[postinstall] sqlite3 fallback also failed.');
  }
}

process.exit(0);
