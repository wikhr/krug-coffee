import { randomBytes, randomUUID, webcrypto } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const remote = process.argv.includes('--remote');
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

await mkdir(artifactDir, { recursive: true });
const rows = [];
for (const account of accounts) {
  const salt = randomBytes(16);
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(account.password), 'PBKDF2', false, ['deriveBits']);
  const hash = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210000 }, key, 256);
  rows.push(`(${[randomUUID(), account.email, account.name, hex(salt), hex(hash), account.role].map(sqlQuote).join(', ')}, 1, ${account.forceChange}, ${timestamp})`);
}
const sql = `INSERT INTO users (id, email, display_name, password_salt, password_hash, role, email_verified, must_change_password, created_at) VALUES\n${rows.join(',\n')};\n`;
await writeFile(sqlPath, sql, { mode: 0o600 });
try {
  const result = spawnSync(process.execPath, [cli, 'd1', 'execute', 'krug-coffee-db', state, `--file=${sqlPath}`], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Не удалось создать тестовые аккаунты. Возможно, они уже существуют.');
  await writeFile(credentialsPath, accounts.map(account => `${account.role}: ${account.email} / ${account.password}`).join('\n') + '\n', { mode: 0o600, flag: remote ? 'wx' : 'w' });
  console.info(`Тестовые учётные данные сохранены локально: ${credentialsPath}`);
} finally {
  await rm(sqlPath, { force: true });
}
