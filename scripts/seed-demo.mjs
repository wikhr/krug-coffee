import { randomBytes, randomUUID, webcrypto } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const remote = process.argv.includes('--remote');
const rehash = process.argv.includes('--rehash');
const state = remote ? '--remote' : '--local';
const cli = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const artifactDir = resolve(root, 'artifacts');
const sqlPath = resolve(artifactDir, 'seed-demo.sql');
const credentialsPath = resolve(artifactDir, remote ? 'demo-credentials-remote.txt' : 'demo-credentials-local.txt');
const guestPassword = 'KrugDemo2026!';
const secretPassword = () => randomBytes(24).toString('base64url');
const accounts = [
  { role: 'customer', email: 'guest@demo.krug.invalid', name: 'Тестовый гость', password: guestPassword, forceChange: 0 },
  { role: 'staff', email: 'staff@demo.krug.invalid', name: 'Тестовый сотрудник', password: secretPassword(), forceChange: 1 },
  { role: 'admin', email: 'admin@demo.krug.invalid', name: 'Тестовый администратор', password: secretPassword(), forceChange: 1 }
];
const sqlQuote = value => `'${String(value).replaceAll("'", "''")}'`;
const hex = array => Buffer.from(array).toString('hex');
const timestamp = Math.floor(Date.now() / 1000);
const passwordHash = async (password, salt) => {
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
};

await mkdir(artifactDir, { recursive: true });
let sql;
if (rehash) {
  const saved = await readFile(credentialsPath, 'utf8');
  const savedAccounts = saved.trim().split(/\r?\n/).map(line => {
    const match = line.match(/^(customer|staff|admin): ([^ ]+) \/ (.+)$/);
    if (!match) throw new Error('Некорректный локальный файл тестовых учётных данных.');
    return { role: match[1], email: match[2], password: match[3] };
  });
  if (savedAccounts.length !== 3 || savedAccounts.some((account, index) => account.role !== accounts[index].role || account.email !== accounts[index].email)) {
    throw new Error('Файл тестовых учётных данных не соответствует ожидаемым аккаунтам.');
  }
  const updates = [];
  for (const account of savedAccounts) {
    const salt = randomBytes(16);
    updates.push(`UPDATE users SET password_salt = ${sqlQuote(hex(salt))}, password_hash = ${sqlQuote(await passwordHash(account.password, salt))}, must_change_password = ${account.role === 'customer' ? 0 : 1} WHERE email = ${sqlQuote(account.email)} AND role = ${sqlQuote(account.role)};`);
  }
  sql = updates.join('\n') + '\n';
} else {
  const rows = [];
  for (const account of accounts) {
    const salt = randomBytes(16);
    rows.push(`(${[randomUUID(), account.email, account.name, hex(salt), await passwordHash(account.password, salt), account.role].map(sqlQuote).join(', ')}, 1, ${account.forceChange}, ${timestamp})`);
  }
  sql = `INSERT INTO users (id, email, display_name, password_salt, password_hash, role, email_verified, must_change_password, created_at) VALUES\n${rows.join(',\n')};\n`;
}
await writeFile(sqlPath, sql, { mode: 0o600 });
try {
  const result = spawnSync(process.execPath, [cli, 'd1', 'execute', 'krug-coffee-db', state, `--file=${sqlPath}`], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Не удалось обновить тестовые аккаунты.');
  if (!rehash) await writeFile(credentialsPath, accounts.map(account => `${account.role}: ${account.email} / ${account.password}`).join('\n') + '\n', { mode: 0o600, flag: remote ? 'wx' : 'w' });
  console.info(rehash ? 'Хеши тестовых аккаунтов обновлены.' : `Тестовые учётные данные сохранены локально: ${credentialsPath}`);
} finally {
  await rm(sqlPath, { force: true });
}
