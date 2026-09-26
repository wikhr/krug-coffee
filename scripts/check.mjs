import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../dist');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const required = ['id="menu"', 'id="about"', 'id="atmosphere"', 'id="visit"', 'id="product-dialog"', 'id="cart-dialog"', 'data-product-id=', 'lang="ru"'];
for (const marker of required) {
  if (!html.includes(marker)) throw new Error(`Missing required marker: ${marker}`);
}
const sources = [...html.matchAll(/(?:src|href)="\.\/(?!#)([^"?]+)"/g)].map(match => match[1]);
for (const source of sources) await access(resolve(root, source));
if (html.includes('Lorem ipsum')) throw new Error('Placeholder copy found');
for (const staleCopy of ['ходит к нам с открытия', 'наш постоянный гость', 'заходит по выходным', 'В твоём ритме', 'Твой утренний ритуал', '01 / 03', 'Первая чашка']) {
  if (html.includes(staleCopy)) throw new Error(`Stale copy found: ${staleCopy}`);
}
console.info(`Checked ${sources.length} local references and ${required.length} required sections.`);
