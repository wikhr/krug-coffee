import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git('status', '--porcelain')) throw new Error('Сначала зафиксируйте изменения: деплой должен указывать на конкретный коммит.');
const build = git('rev-parse', 'HEAD');
const cli = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const output = execFileSync(process.execPath, [cli, 'deploy', '--var', `BUILD_ID:${build}`], { cwd: root, encoding: 'utf8' });
process.stdout.write(output);
const url = output.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0];
if (!url) throw new Error('Wrangler не вернул адрес публикации.');
let health;
for (let attempt = 0; attempt < 6; attempt++) {
  try {
    health = await fetch(`${url}/api/health?v=${build}`).then(result => result.json());
    if (health.build === build && health.database === 'ready') break;
  } catch { /* Deployment may still be propagating. */ }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!health.ok || health.build !== build || health.database !== 'ready') throw new Error('Проверка опубликованной версии или БД не прошла.');
for (const path of ['index.html', 'app.js', 'styles.css']) {
  const local = await readFile(resolve(root, 'dist', path));
  const live = Buffer.from(await fetch(`${url}/${path}?v=${build}`).then(result => result.arrayBuffer()));
  const hash = value => createHash('sha256').update(value).digest('hex');
  if (hash(local) !== hash(live)) throw new Error(`Опубликованный ${path} отличается от текущего коммита.`);
}
console.info(`Проверено: ${url} — коммит ${build}, БД и актуальные файлы сайта.`);
