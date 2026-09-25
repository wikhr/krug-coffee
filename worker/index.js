const BUILD_ID = 'krug-db-v1';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const now = () => Math.floor(Date.now() / 1000);
const uid = () => crypto.randomUUID();
const bytes = value => new Uint8Array(value);
const hex = value => [...bytes(value)].map(n => n.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

async function passwordHash(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(saltHex.match(/.{2}/g), byte => Number.parseInt(byte, 16)), iterations: 210000 }, key, 256));
}
function secureEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
const response = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const bad = (message, status = 400) => { throw new HttpError(status, message); };
const emailValue = value => String(value || '').trim().toLowerCase();
const cleanText = (value, max) => String(value || '').trim().slice(0, max);
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
function ingredientsValue(value) {
  if (!Array.isArray(value) || value.length > 12 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 80)) bad('Состав: до 12 ингредиентов, каждый до 80 символов.');
  return value.map(item => item.trim());
}
const publicUser = row => row && ({ id: row.id, email: row.email, displayName: row.display_name, role: row.role, mustChangePassword: Boolean(row.must_change_password), emailVerified: Boolean(row.email_verified) });

async function bodyOf(request) {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) bad('Ожидается JSON.');
  const text = await request.text();
  if (text.length > 32768) bad('Слишком большой запрос.', 413);
  try { return JSON.parse(text); } catch { bad('Некорректный JSON.'); }
}
function sameOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) bad('Недопустимый источник запроса.', 403);
}
function sessionCookie(request, token, maxAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `krug_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
async function currentUser(request, env) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)krug_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  const hash = await sha256(token);
  return env.DB.prepare(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.disabled = 0`).bind(hash, now()).first();
}
function needUser(user, roles = []) {
  if (!user) bad('Сначала войдите в аккаунт.', 401);
  if (user.must_change_password) bad('Сначала смените временный пароль.', 403);
  if (roles.length && !roles.includes(user.role)) bad('Недостаточно прав.', 403);
  return user;
}
async function issueSession(request, env, user) {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), user.id, now() + SESSION_SECONDS, now()).run();
  return sessionCookie(request, token);
}
async function audit(env, actor, action, subject) {
  await env.DB.prepare('INSERT INTO audit_log (id, actor_id, action, subject_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(uid(), actor.id, action, subject, now()).run();
}
async function menu(env, includeUnavailable = false) {
  const categories = (await env.DB.prepare('SELECT id, name, sort_order FROM categories ORDER BY sort_order, name').all()).results;
  const items = (await env.DB.prepare(`SELECT id, category_id, name, description, ingredients_json, price_kopeks, sort_order, available
    FROM menu_items ${includeUnavailable ? '' : 'WHERE available = 1'} ORDER BY sort_order, name`).all()).results;
  return { categories, items: items.map(({ ingredients_json, ...item }) => ({ ...item, ingredients: JSON.parse(ingredients_json), available: Boolean(item.available) })) };
}
async function loadOrders(env, sql, args = []) {
  const orders = (await env.DB.prepare(sql).bind(...args).all()).results;
  if (!orders.length) return [];
  const placeholders = orders.map(() => '?').join(',');
  const items = (await env.DB.prepare(`SELECT order_id, menu_item_id, name_snapshot, price_kopeks, quantity FROM order_items WHERE order_id IN (${placeholders})`).bind(...orders.map(o => o.id)).all()).results;
  return orders.map(order => ({ ...order, demo: true, items: items.filter(item => item.order_id === order.id) }));
}
async function sendEmail(env, to, subject, html, text) {
  if (env.EMAIL_ENABLED !== 'true' || !env.EMAIL || !env.EMAIL_FROM) bad('Отправка почты пока недоступна.', 503);
  await env.EMAIL.send({ from: env.EMAIL_FROM, to, subject, html, text });
}
async function createEmailToken(env, user, purpose, ttl) {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), user.id, purpose, now() + ttl).run();
  return token;
}
async function authRoutes(request, env, path, user) {
  if (request.method === 'GET' && path === '/api/auth/me') return response({ user: publicUser(user) });
  if (request.method !== 'POST') return null;
  if (path === '/api/auth/login') {
    const body = await bodyOf(request);
    const email = emailValue(body.email);
    const password = String(body.password || '');
    if (!validEmail(email) || !password) bad('Неверная почта или пароль.', 401);
    const attemptKey = await sha256(`${email}|${request.headers.get('CF-Connecting-IP') || 'local'}`);
    const attempt = await env.DB.prepare('SELECT * FROM login_attempts WHERE key = ?').bind(attemptKey).first();
    if (attempt?.blocked_until > now()) bad('Слишком много попыток. Повторите позже.', 429);
    const found = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    const valid = found && !found.disabled && secureEqual(await passwordHash(password, found.password_salt), found.password_hash);
    if (!valid || !found.email_verified) {
      const start = attempt && now() - attempt.window_started_at < 900 ? attempt.window_started_at : now();
      const count = start === attempt?.window_started_at ? attempt.failures + 1 : 1;
      await env.DB.prepare(`INSERT INTO login_attempts (key, failures, window_started_at, blocked_until) VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until`)
        .bind(attemptKey, count, start, count >= 5 ? now() + 900 : 0).run();
      bad('Неверная почта или пароль.', 401);
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(attemptKey).run();
    const cookie = await issueSession(request, env, found);
    return response({ user: publicUser(found) }, 200, { 'Set-Cookie': cookie });
  }
  if (path === '/api/auth/logout') {
    const token = request.headers.get('cookie')?.match(/(?:^|;\s*)krug_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return response({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
  }
  if (path === '/api/auth/change-password') {
    if (!user) bad('Сначала войдите в аккаунт.', 401);
    const body = await bodyOf(request);
    const oldPassword = String(body.oldPassword || '');
    const newPassword = String(body.newPassword || '');
    if (newPassword.length < 12 || newPassword.length > 128) bad('Новый пароль: от 12 до 128 символов.');
    if (!secureEqual(await passwordHash(oldPassword, user.password_salt), user.password_hash)) bad('Старый пароль неверен.', 403);
    const salt = randomToken().slice(0, 32);
    await env.DB.prepare('UPDATE users SET password_salt = ?, password_hash = ?, must_change_password = 0 WHERE id = ?')
      .bind(salt, await passwordHash(newPassword, salt), user.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
    return response({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
  }
  if (path === '/api/auth/register') {
    if (env.EMAIL_ENABLED !== 'true' || !env.EMAIL || !env.EMAIL_FROM) bad('Регистрация откроется после подключения почты.', 503);
    const body = await bodyOf(request);
    const email = emailValue(body.email);
    const name = cleanText(body.displayName, 80);
    const password = String(body.password || '');
    if (!validEmail(email) || name.length < 2 || password.length < 12 || password.length > 128) bad('Проверьте имя, почту и пароль от 12 символов.');
    const salt = randomToken().slice(0, 32);
    const newUser = { id: uid(), email };
    try {
      await env.DB.prepare(`INSERT INTO users (id, email, display_name, password_salt, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?, 'customer', ?)`).bind(newUser.id, email, name, salt, await passwordHash(password, salt), now()).run();
    } catch { bad('Эта почта уже используется.', 409); }
    const token = await createEmailToken(env, newUser, 'verify', 24 * 3600);
    const link = `${new URL(request.url).origin}/?verify=${token}`;
    await sendEmail(env, email, 'Подтвердите почту — milo', `<p>Подтвердите почту: <a href="${link}">${link}</a></p>`, `Подтвердите почту: ${link}`);
    return response({ ok: true, message: 'Проверьте почту для подтверждения аккаунта.' }, 201);
  }
  if (path === '/api/auth/verify') {
    const body = await bodyOf(request);
    const token = String(body.token || '');
    if (!/^[a-f0-9]{64}$/.test(token)) bad('Ссылка недействительна.');
    const row = await env.DB.prepare("SELECT * FROM email_tokens WHERE token_hash = ? AND purpose = 'verify' AND used_at IS NULL AND expires_at > ?").bind(await sha256(token), now()).first();
    if (!row) bad('Ссылка недействительна или устарела.');
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(row.user_id),
      env.DB.prepare('UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').bind(now(), row.token_hash)
    ]);
    return response({ ok: true });
  }
  if (path === '/api/auth/forgot') {
    if (env.EMAIL_ENABLED !== 'true' || !env.EMAIL || !env.EMAIL_FROM) bad('Восстановление откроется после подключения почты.', 503);
    const body = await bodyOf(request);
    const email = emailValue(body.email);
    const found = validEmail(email) ? await env.DB.prepare('SELECT * FROM users WHERE email = ? AND disabled = 0 AND email_verified = 1').bind(email).first() : null;
    if (found) {
      const token = await createEmailToken(env, found, 'reset', 3600);
      const link = `${new URL(request.url).origin}/?reset=${token}`;
      await sendEmail(env, email, 'Сброс пароля — milo', `<p>Создайте новый пароль: <a href="${link}">${link}</a></p>`, `Создайте новый пароль: ${link}`);
    }
    return response({ ok: true, message: 'Если аккаунт найден, письмо отправлено.' });
  }
  if (path === '/api/auth/reset') {
    if (env.EMAIL_ENABLED !== 'true') bad('Восстановление пока недоступно.', 503);
    const body = await bodyOf(request);
    const token = String(body.token || '');
    const password = String(body.newPassword || '');
    if (!/^[a-f0-9]{64}$/.test(token) || password.length < 12 || password.length > 128) bad('Проверьте ссылку и новый пароль.');
    const row = await env.DB.prepare("SELECT * FROM email_tokens WHERE token_hash = ? AND purpose = 'reset' AND used_at IS NULL AND expires_at > ?").bind(await sha256(token), now()).first();
    if (!row) bad('Ссылка недействительна или устарела.');
    const salt = randomToken().slice(0, 32);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_salt = ?, password_hash = ?, must_change_password = 0 WHERE id = ?').bind(salt, await passwordHash(password, salt), row.user_id),
      env.DB.prepare('UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').bind(now(), row.token_hash),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id)
    ]);
    return response({ ok: true });
  }
  return null;
}

async function orderRoutes(request, env, path, user) {
  if (path === '/api/orders' && request.method === 'GET') {
    needUser(user, ['customer']);
    return response({ orders: await loadOrders(env, 'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [user.id]) });
  }
  if (path === '/api/orders' && request.method === 'POST') {
    needUser(user, ['customer']);
    const body = await bodyOf(request);
    const key = String(body.idempotencyKey || '');
    if (!/^[a-f0-9-]{36}$/.test(key)) bad('Некорректный идентификатор запроса.');
    const existing = await env.DB.prepare('SELECT id FROM orders WHERE user_id = ? AND idempotency_key = ?').bind(user.id, key).first();
    if (existing) return response({ order: (await loadOrders(env, 'SELECT * FROM orders WHERE id = ?', [existing.id]))[0] });
    if (!['pickup', 'dine_in'].includes(body.fulfillmentType)) bad('Выберите способ получения.');
    const table = body.fulfillmentType === 'dine_in' ? cleanText(body.tableNumber, 10) : null;
    if (body.fulfillmentType === 'dine_in' && !/^[1-9][0-9]{0,2}$/.test(table)) bad('Укажите номер столика от 1 до 999.');
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 20) bad('Корзина пуста или слишком велика.');
    const requested = new Map();
    for (const item of body.items) {
      if (typeof item.id !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 || requested.has(item.id)) bad('Проверьте состав корзины.');
      requested.set(item.id, item.quantity);
    }
    const ids = [...requested.keys()];
    const products = (await env.DB.prepare(`SELECT id, name, price_kopeks FROM menu_items WHERE available = 1 AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results;
    if (products.length !== ids.length) bad('Часть позиций недоступна. Обновите меню.', 409);
    const total = products.reduce((sum, product) => sum + product.price_kopeks * requested.get(product.id), 0);
    if (total > 50000000) bad('Сумма заказа слишком велика.');
    const orderId = uid();
    const timestamp = now();
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO orders (id, user_id, fulfillment_type, table_number, status, payment_status, total_kopeks, idempotency_key, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'awaiting_demo_payment', 'pending', ?, ?, ?, ?)`).bind(orderId, user.id, body.fulfillmentType, table, total, key, timestamp, timestamp),
        ...products.map(product => env.DB.prepare(`INSERT INTO order_items (id, order_id, menu_item_id, name_snapshot, price_kopeks, quantity)
          VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), orderId, product.id, product.name, product.price_kopeks, requested.get(product.id)))
      ]);
    } catch (error) {
      const previous = await env.DB.prepare('SELECT id FROM orders WHERE user_id = ? AND idempotency_key = ?').bind(user.id, key).first();
      if (!previous) throw error;
      return response({ order: (await loadOrders(env, 'SELECT * FROM orders WHERE id = ?', [previous.id]))[0] });
    }
    return response({ order: (await loadOrders(env, 'SELECT * FROM orders WHERE id = ?', [orderId]))[0] }, 201);
  }
  const paymentMatch = path.match(/^\/api\/orders\/([a-f0-9-]{36})\/mock-payment$/);
  if (paymentMatch && request.method === 'POST') {
    needUser(user, ['customer']);
    const body = await bodyOf(request);
    const scenario = { '0000 0000 0000 0001': 'success', '0000 0000 0000 0002': 'decline', '0000 0000 0000 0003': 'cancel' }[String(body.testCard || '')];
    const requestId = String(body.requestId || '');
    if (!scenario || !/^[a-f0-9-]{36}$/.test(requestId)) bad('Выберите тестовую карту. Реальные карты не принимаются.');
    const orderId = paymentMatch[1];
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').bind(orderId, user.id).first();
    if (!order) bad('Заказ не найден.', 404);
    const duplicate = await env.DB.prepare('SELECT order_id FROM mock_payments WHERE request_id = ?').bind(requestId).first();
    if (duplicate) {
      if (duplicate.order_id !== orderId) bad('Идентификатор уже использован.', 409);
      return response({ order: (await loadOrders(env, 'SELECT * FROM orders WHERE id = ?', [orderId]))[0] });
    }
    if (order.status !== 'awaiting_demo_payment') bad('Тестовая оплата для этого заказа закрыта.', 409);
    const paymentStatus = scenario === 'success' ? 'simulated_paid' : scenario === 'decline' ? 'declined' : 'canceled';
    const status = scenario === 'success' ? 'new' : scenario === 'cancel' ? 'canceled' : 'awaiting_demo_payment';
    await env.DB.batch([
      env.DB.prepare('INSERT INTO mock_payments (id, order_id, request_id, scenario, created_at) VALUES (?, ?, ?, ?, ?)').bind(uid(), orderId, requestId, scenario, now()),
      env.DB.prepare("UPDATE orders SET status = ?, payment_status = ?, updated_at = ? WHERE id = ? AND status = 'awaiting_demo_payment'").bind(status, paymentStatus, now(), orderId)
    ]);
    return response({ order: (await loadOrders(env, 'SELECT * FROM orders WHERE id = ?', [orderId]))[0] });
  }
  return null;
}

async function staffRoutes(request, env, path, user) {
  if (path === '/api/staff/orders' && request.method === 'GET') {
    needUser(user, ['staff', 'admin']);
    return response({ orders: await loadOrders(env, `SELECT orders.*, users.display_name AS customer_name FROM orders JOIN users ON users.id = orders.user_id
      WHERE orders.status != 'awaiting_demo_payment' ORDER BY orders.created_at DESC LIMIT 100`) });
  }
  const match = path.match(/^\/api\/staff\/orders\/([a-f0-9-]{36})$/);
  if (match && request.method === 'PATCH') {
    needUser(user, ['staff', 'admin']);
    const body = await bodyOf(request);
    const order = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(match[1]).first();
    if (!order) bad('Заказ не найден.', 404);
    const next = { new: ['preparing', 'canceled'], preparing: ['ready', 'canceled'], ready: ['completed', 'canceled'] }[order.status] || [];
    if (!next.includes(body.status)) bad('Недопустимый переход статуса.', 409);
    const result = await env.DB.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?')
      .bind(body.status, now(), match[1], order.status).run();
    if (!result.meta.changes) bad('Заказ изменился. Обновите очередь.', 409);
    await audit(env, user, `order.${body.status}`, match[1]);
    return response({ order: (await loadOrders(env, 'SELECT * FROM orders WHERE id = ?', [match[1]]))[0] });
  }
  return null;
}

async function adminRoutes(request, env, path, user) {
  if (!path.startsWith('/api/admin/')) return null;
  needUser(user, ['admin']);
  if (path === '/api/admin/menu' && request.method === 'GET') return response(await menu(env, true));
  if (path === '/api/admin/items' && request.method === 'POST') {
    const body = await bodyOf(request);
    const category = await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(String(body.categoryId || '')).first();
    const name = cleanText(body.name, 80);
    const description = cleanText(body.description, 240);
    const ingredients = ingredientsValue(body.ingredients || []);
    const price = Number(body.priceKopeks);
    if (!category || !name || !Number.isInteger(price) || price < 0 || price > 10000000) bad('Проверьте категорию, название и цену.');
    const id = uid();
    await env.DB.prepare(`INSERT INTO menu_items (id, category_id, name, description, ingredients_json, price_kopeks, sort_order, available, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(id, category.id, name, description, JSON.stringify(ingredients), price, Number.isInteger(body.sortOrder) ? body.sortOrder : 100, now(), now()).run();
    await audit(env, user, 'menu.create', id);
    return response({ id }, 201);
  }
  const itemMatch = path.match(/^\/api\/admin\/items\/([a-z0-9-]{1,80})$/);
  if (itemMatch && request.method === 'PATCH') {
    const body = await bodyOf(request);
    const existing = await env.DB.prepare('SELECT * FROM menu_items WHERE id = ?').bind(itemMatch[1]).first();
    if (!existing) bad('Позиция не найдена.', 404);
    const category = String(body.categoryId ?? existing.category_id);
    if (!(await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(category).first())) bad('Категория не найдена.');
    const name = cleanText(body.name ?? existing.name, 80);
    const description = cleanText(body.description ?? existing.description, 240);
    const ingredients = ingredientsValue(body.ingredients ?? JSON.parse(existing.ingredients_json));
    const price = Number(body.priceKopeks ?? existing.price_kopeks);
    const available = body.available === undefined ? existing.available : body.available === true ? 1 : body.available === false ? 0 : null;
    if (!name || !Number.isInteger(price) || price < 0 || price > 10000000 || available === null) bad('Проверьте данные позиции.');
    await env.DB.prepare(`UPDATE menu_items SET category_id = ?, name = ?, description = ?, ingredients_json = ?, price_kopeks = ?, available = ?, updated_at = ? WHERE id = ?`)
      .bind(category, name, description, JSON.stringify(ingredients), price, available, now(), existing.id).run();
    await audit(env, user, 'menu.update', existing.id);
    return response({ ok: true });
  }
  if (path === '/api/admin/staff' && request.method === 'GET') {
    const staff = (await env.DB.prepare("SELECT id, email, display_name, disabled FROM users WHERE role = 'staff' ORDER BY created_at DESC").all()).results;
    return response({ staff: staff.map(person => ({ ...person, disabled: Boolean(person.disabled) })) });
  }
  if (path === '/api/admin/staff' && request.method === 'POST') {
    const body = await bodyOf(request);
    const email = emailValue(body.email);
    const name = cleanText(body.displayName, 80);
    if (!validEmail(email) || name.length < 2) bad('Проверьте имя и почту сотрудника.');
    const temporaryPassword = randomToken().slice(0, 20);
    const salt = randomToken().slice(0, 32);
    const id = uid();
    try {
      await env.DB.prepare(`INSERT INTO users (id, email, display_name, password_salt, password_hash, role, email_verified, must_change_password, created_at)
        VALUES (?, ?, ?, ?, ?, 'staff', 1, 1, ?)`).bind(id, email, name, salt, await passwordHash(temporaryPassword, salt), now()).run();
    } catch { bad('Эта почта уже используется.', 409); }
    await audit(env, user, 'staff.create', id);
    return response({ id, temporaryPassword }, 201);
  }
  const staffMatch = path.match(/^\/api\/admin\/staff\/([a-f0-9-]{36})$/);
  if (staffMatch && request.method === 'PATCH') {
    const body = await bodyOf(request);
    if (typeof body.disabled !== 'boolean') bad('Укажите состояние сотрудника.');
    const result = await env.DB.prepare("UPDATE users SET disabled = ? WHERE id = ? AND role = 'staff'").bind(body.disabled ? 1 : 0, staffMatch[1]).run();
    if (!result.meta.changes) bad('Сотрудник не найден.', 404);
    if (body.disabled) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(staffMatch[1]).run();
    await audit(env, user, body.disabled ? 'staff.disable' : 'staff.enable', staffMatch[1]);
    return response({ ok: true });
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      sameOrigin(request);
      if (request.method === 'GET' && url.pathname === '/api/health') {
        await env.DB.prepare('SELECT 1').first();
        return response({ ok: true, build: env.BUILD_ID || BUILD_ID, database: 'ready', demo: true });
      }
      if (request.method === 'GET' && url.pathname === '/api/config') return response({ demo: true, registrationEnabled: env.EMAIL_ENABLED === 'true' && Boolean(env.EMAIL && env.EMAIL_FROM), emailEnabled: env.EMAIL_ENABLED === 'true' && Boolean(env.EMAIL && env.EMAIL_FROM) });
      if (request.method === 'GET' && url.pathname === '/api/menu') return response(await menu(env));
      const user = await currentUser(request, env);
      const result = await authRoutes(request, env, url.pathname, user)
        || await orderRoutes(request, env, url.pathname, user)
        || await staffRoutes(request, env, url.pathname, user)
        || await adminRoutes(request, env, url.pathname, user);
      return result || response({ error: 'Маршрут не найден.' }, 404);
    } catch (error) {
      if (error instanceof HttpError) return response({ error: error.message }, error.status);
      console.error('API error', error);
      return response({ error: 'Внутренняя ошибка. Повторите позже.' }, 500);
    }
  }
};
