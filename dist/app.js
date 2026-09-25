const menuToggle = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('#mobile-nav');
function closeNavigation() {
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Открыть навигацию');
  mobileNav.hidden = true;
  document.body.classList.remove('nav-open');
}
menuToggle.addEventListener('click', () => {
  const opening = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(opening));
  menuToggle.setAttribute('aria-label', opening ? 'Закрыть навигацию' : 'Открыть навигацию');
  mobileNav.hidden = !opening;
  document.body.classList.toggle('nav-open', opening);
});
mobileNav.addEventListener('click', (event) => { if (event.target.closest('a')) closeNavigation(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !mobileNav.hidden) { closeNavigation(); menuToggle.focus(); } });
window.matchMedia('(min-width: 761px)').addEventListener('change', (event) => { if (event.matches) closeNavigation(); });

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = kopeks => `${new Intl.NumberFormat('ru-RU').format(kopeks / 100)} ₽`;
const api = async (path, method = 'GET', data) => {
  const result = await fetch(path, { method, credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(payload.error || 'Не удалось выполнить запрос.');
  return payload;
};
const state = { menu: { categories: [], items: [] }, user: null, config: null, cart: new Map(), category: 'coffee', pendingOrder: null, checkoutKey: null, paymentKey: null };
const $ = selector => document.querySelector(selector);
const feedback = (selector, message) => { $(selector).textContent = message; };
const handle = async (selector, action) => { try { await action(); } catch (error) { feedback(selector, error.message); } };

function renderMenu() {
  const categories = state.menu.categories;
  if (!categories.some(category => category.id === state.category)) state.category = categories[0]?.id;
  $('.menu-tabs').innerHTML = categories.map(category => `<button class="menu-tab ${category.id === state.category ? 'active' : ''}" role="tab" aria-selected="${category.id === state.category}" tabindex="${category.id === state.category ? 0 : -1}" data-category="${escapeHtml(category.id)}">${escapeHtml(category.name)}</button>`).join('');
  const items = state.menu.items.filter(item => item.category_id === state.category);
  $('.menu-list').innerHTML = items.length ? items.map(item => `<article class="menu-item"><div><h3><button class="product-title" type="button" data-product-id="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button></h3><p>${escapeHtml(item.description)}</p></div><div class="menu-item-actions"><strong>${money(item.price_kopeks)}</strong><button class="add-button add-button-light" type="button" data-add-product="${escapeHtml(item.id)}" aria-label="Добавить ${escapeHtml(item.name)} в корзину">В корзину <span aria-hidden="true">+</span></button></div></article>`).join('') : '<p>В этой категории пока нет доступных позиций.</p>';
  const popular = ['coffee-cappuccino', 'cold-iced-latte', 'coffee-flat-white'];
  $('.popular-grid').querySelectorAll('.drink-card').forEach((card, index) => {
    const product = state.menu.items.find(item => item.id === popular[index]);
    card.hidden = !product;
    if (!product) return;
    card.querySelector('.product-title').textContent = product.name;
    card.querySelector('.drink-info p').textContent = product.description;
    card.querySelector('.drink-info strong').textContent = money(product.price_kopeks);
  });
}
$('.menu-tabs').addEventListener('click', event => {
  const tab = event.target.closest('[data-category]');
  if (!tab) return;
  state.category = tab.dataset.category;
  renderMenu();
});
$('.menu-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const tabs = [...$('.menu-tabs').querySelectorAll('[data-category]')];
  const current = tabs.indexOf(document.activeElement);
  if (current < 0) return;
  event.preventDefault();
  const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].click(); tabs[next].focus();
});
function saveCart() {
  try { localStorage.setItem('milo-demo-cart', JSON.stringify(Object.fromEntries(state.cart))); } catch { /* Cart still works for this page. */ }
  renderCart();
}
function reconcileCart() {
  const valid = new Set(state.menu.items.map(item => item.id));
  for (const id of state.cart.keys()) if (!valid.has(id)) state.cart.delete(id);
  saveCart();
}
function renderCart() {
  const rows = [...state.cart].map(([id, quantity]) => ({ product: state.menu.items.find(item => item.id === id), quantity })).filter(row => row.product);
  $('#cart-list').innerHTML = rows.length ? rows.map(({ product, quantity }) => `<div class="cart-row"><div><strong>${escapeHtml(product.name)}</strong><small>${money(product.price_kopeks)} за шт.</small></div><div class="quantity-control"><button type="button" data-quantity="${escapeHtml(product.id)}" data-delta="-1" aria-label="Уменьшить количество ${escapeHtml(product.name)}">−</button><span>${quantity}</span><button type="button" data-quantity="${escapeHtml(product.id)}" data-delta="1" aria-label="Увеличить количество ${escapeHtml(product.name)}">+</button></div></div>`).join('') : 'Выбери что-нибудь из меню.';
  $('#cart-total').textContent = money(rows.reduce((total, row) => total + row.product.price_kopeks * row.quantity, 0));
  const count = rows.reduce((total, row) => total + row.quantity, 0);
  $('.cart-count').textContent = String(count);
  $('.cart-button').setAttribute('aria-label', `Открыть корзину, товаров: ${count}`);
  $('.cart-button').classList.toggle('has-items', count > 0);
  $('.cart-summary .cart-total').textContent = money(rows.reduce((total, row) => total + row.product.price_kopeks * row.quantity, 0));
  $('.cart-summary').hidden = !count;
  $('.cart-order').hidden = !count;
  $('.cart-items').innerHTML = rows.length ? rows.map(({ product, quantity }) => `<article class="cart-item"><div><h3>${escapeHtml(product.name)}</h3><p>${money(product.price_kopeks)} · ${escapeHtml(product.description)}</p><button class="cart-remove" type="button" data-cart-action="remove" data-product="${escapeHtml(product.id)}">Убрать</button></div><div class="quantity"><button type="button" data-cart-action="decrease" data-product="${escapeHtml(product.id)}" aria-label="Уменьшить количество ${escapeHtml(product.name)}">−</button><span>${quantity}</span><button type="button" data-cart-action="increase" data-product="${escapeHtml(product.id)}" aria-label="Увеличить количество ${escapeHtml(product.name)}">+</button></div></article>`).join('') : '<div class="cart-empty"><span aria-hidden="true">◉</span><h3>Пока пусто</h3><p>Добавьте напиток или что-нибудь к нему.</p></div>';
  $('#checkout-form').hidden = !rows.length || state.user?.role !== 'customer' || Boolean(state.user?.mustChangePassword);
  if (rows.length && !state.user) feedback('#checkout-feedback', 'Войди в тестовый аккаунт, чтобы оформить демозаказ.');
}
$('#cart-list').addEventListener('click', event => {
  const button = event.target.closest('[data-quantity]');
  if (!button) return;
  const id = button.dataset.quantity;
  const next = (state.cart.get(id) || 0) + Number(button.dataset.delta);
  if (next <= 0) state.cart.delete(id); else state.cart.set(id, Math.min(20, next));
  saveCart();
});
$('#fulfillment').addEventListener('change', () => { $('#table-wrap').hidden = $('#fulfillment').value !== 'dine_in'; $('#table-number').required = !$('#table-wrap').hidden; });

function renderAccount() {
  const user = state.user;
  $('#guest-panel').hidden = Boolean(user);
  $('#member-panel').hidden = !user;
  $('#history-panel').hidden = user?.role !== 'customer' || Boolean(user?.mustChangePassword);
  $('#staff-panel').hidden = !['staff', 'admin'].includes(user?.role) || Boolean(user?.mustChangePassword);
  $('#admin-panel').hidden = user?.role !== 'admin' || Boolean(user?.mustChangePassword);
  $('#email-actions').hidden = !state.config?.emailEnabled;
  if (user) {
    $('#member-name').textContent = user.displayName;
    $('#member-role').textContent = `${user.email} · ${user.role === 'admin' ? 'Администратор' : user.role === 'staff' ? 'Сотрудник' : 'Клиент'} · деморежим`;
    $('#change-password-form').hidden = !user.mustChangePassword;
  }
  renderCart();
}
const statusLabel = { awaiting_demo_payment: 'Ожидает тестовую оплату', new: 'Новый', preparing: 'Готовится (демо)', ready: 'Готов (демо)', completed: 'Завершён (демо)', canceled: 'Отменён', pending: 'Ожидает', simulated_paid: 'Оплачен условно', declined: 'Тестовый отказ' };
function orderCard(order, staff = false) {
  const choices = { new: ['preparing', 'canceled'], preparing: ['ready', 'canceled'], ready: ['completed', 'canceled'] }[order.status] || [];
  return `<article class="order-card"><div class="panel-head"><strong>Заказ ${escapeHtml(order.id.slice(0, 8))}</strong><span>${escapeHtml(statusLabel[order.status] || order.status)}</span></div><p>${order.fulfillment_type === 'dine_in' ? `В зале · столик ${escapeHtml(order.table_number)}` : 'Самовывоз'}${staff ? ` · ${escapeHtml(order.customer_name || '')}` : ''}<br>${new Date(order.created_at * 1000).toLocaleString('ru-RU')}</p><ul>${order.items.map(item => `<li>${escapeHtml(item.name_snapshot)} × ${item.quantity} — ${money(item.price_kopeks * item.quantity)}</li>`).join('')}</ul><strong>${money(order.total_kopeks)}</strong><p class="shop-note">${escapeHtml(statusLabel[order.payment_status] || order.payment_status)} · только демонстрация</p>${staff && choices.length ? `<div class="status-actions">${choices.map(choice => `<button type="button" class="small-action" data-order-status="${escapeHtml(order.id)}" data-next-status="${choice}">${escapeHtml(statusLabel[choice])}</button>`).join('')}</div>` : ''}</article>`;
}
async function loadHistory() {
  if (state.user?.role !== 'customer' || state.user.mustChangePassword) return;
  const result = await api('/api/orders');
  $('#history-list').innerHTML = result.orders.length ? result.orders.map(order => orderCard(order)).join('') : '<p>Тестовых заказов пока нет.</p>';
  const pending = result.orders.find(order => order.status === 'awaiting_demo_payment');
  if (pending && !state.pendingOrder) state.pendingOrder = pending;
  $('#payment-form').hidden = !state.pendingOrder;
}
async function loadStaff() {
  if (!['staff', 'admin'].includes(state.user?.role) || state.user.mustChangePassword) return;
  const result = await api('/api/staff/orders');
  $('#staff-list').innerHTML = result.orders.length ? result.orders.map(order => orderCard(order, true)).join('') : '<p>Демозаказов пока нет.</p>';
}
async function loadAdmin() {
  if (state.user?.role !== 'admin' || state.user.mustChangePassword) return;
  const [data, team] = await Promise.all([api('/api/admin/menu'), api('/api/admin/staff')]);
  const options = data.categories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('');
  $('#item-category').innerHTML = options;
  $('#admin-items').innerHTML = data.items.map(item => `<form class="admin-item" data-edit-item="${escapeHtml(item.id)}"><label>Название<input name="name" maxlength="80" required value="${escapeHtml(item.name)}"></label><label>Описание<input name="description" maxlength="240" value="${escapeHtml(item.description)}"></label><label>Ингредиенты через запятую<input name="ingredients" maxlength="400" value="${escapeHtml(item.ingredients.join(', '))}"></label><label>Категория<select name="categoryId">${data.categories.map(category => `<option value="${escapeHtml(category.id)}" ${category.id === item.category_id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}</select></label><label>Цена, ₽<input name="price" type="number" min="0" max="100000" step="1" required value="${item.price_kopeks / 100}"></label><label class="inline-label"><input name="available" type="checkbox" ${item.available ? 'checked' : ''}> В меню</label><button class="small-action" type="submit">Сохранить</button></form>`).join('');
  $('#staff-accounts').innerHTML = `<h4>Сотрудники</h4>${team.staff.length ? team.staff.map(person => `<div class="staff-row"><span>${escapeHtml(person.display_name)} · ${escapeHtml(person.email)} ${person.disabled ? '(отключён)' : ''}</span><button type="button" class="small-action" data-staff-id="${escapeHtml(person.id)}" data-staff-disabled="${!person.disabled}">${person.disabled ? 'Включить' : 'Отключить'}</button></div>`).join('') : '<p>Сотрудников нет.</p>'}`;
}
async function refreshAccount() {
  state.user = (await api('/api/auth/me')).user;
  renderAccount();
  await Promise.all([loadHistory(), loadStaff(), loadAdmin()]);
}

$('#checkout-form').addEventListener('submit', event => { event.preventDefault(); handle('#checkout-feedback', async () => {
  const button = $('#checkout-form button[type="submit"]'); button.disabled = true;
  try {
    state.checkoutKey ||= crypto.randomUUID();
    const result = await api('/api/orders', 'POST', { idempotencyKey: state.checkoutKey, fulfillmentType: $('#fulfillment').value, tableNumber: $('#table-number').value, items: [...state.cart].map(([id, quantity]) => ({ id, quantity })) });
    state.pendingOrder = result.order; state.checkoutKey = null;
    $('#payment-form').hidden = false;
    $('#payment-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    feedback('#checkout-feedback', 'Демозаказ создан. Выбери тестовый сценарий оплаты.');
    await loadHistory();
  } finally { button.disabled = false; }
}); });
$('#payment-form').addEventListener('submit', event => { event.preventDefault(); handle('#checkout-feedback', async () => {
  if (!state.pendingOrder) return;
  const button = $('#payment-form button[type="submit"]'); button.disabled = true;
  try {
    state.paymentKey ||= crypto.randomUUID();
    const result = await api(`/api/orders/${state.pendingOrder.id}/mock-payment`, 'POST', { testCard: $('#test-card').value, requestId: state.paymentKey });
    state.paymentKey = null;
    if (result.order.status === 'new') {
      state.pendingOrder = null; state.cart.clear(); saveCart(); $('#payment-form').hidden = true;
      feedback('#checkout-feedback', 'Тестовая оплата успешна. Деньги не списаны, заказ не будет приготовлен.');
    } else if (result.order.status === 'canceled') {
      state.pendingOrder = null; $('#payment-form').hidden = true;
      feedback('#checkout-feedback', 'Тестовый платёж и заказ отменены.');
    } else feedback('#checkout-feedback', 'Тестовый отказ. Можно выбрать другую вымышленную карту и повторить.');
    await loadHistory();
  } finally { button.disabled = false; }
}); });

$('#login-form').addEventListener('submit', event => { event.preventDefault(); handle('#account-feedback', async () => {
  const result = await api('/api/auth/login', 'POST', { email: $('#login-email').value, password: $('#login-password').value });
  state.user = result.user; renderAccount();
  feedback('#account-feedback', `Вы вошли как ${result.user.displayName}.`);
  await Promise.all([loadHistory(), loadStaff(), loadAdmin()]);
}); });
$('#logout-button').addEventListener('click', () => handle('#account-feedback', async () => {
  await api('/api/auth/logout', 'POST', {}); state.user = null; state.pendingOrder = null; $('#payment-form').hidden = true; renderAccount(); feedback('#account-feedback', 'Вы вышли из аккаунта.');
}));
$('#change-password-form').addEventListener('submit', event => { event.preventDefault(); handle('#account-feedback', async () => {
  await api('/api/auth/change-password', 'POST', { oldPassword: $('#old-password').value, newPassword: $('#new-password').value });
  state.user = null; renderAccount(); feedback('#account-feedback', 'Пароль изменён. Войдите с новым паролем.');
}); });
$('#refresh-history').addEventListener('click', () => handle('#account-feedback', loadHistory));
$('#refresh-staff').addEventListener('click', () => handle('#account-feedback', loadStaff));
$('#staff-list').addEventListener('click', event => {
  const button = event.target.closest('[data-order-status]'); if (!button) return;
  handle('#account-feedback', async () => { await api(`/api/staff/orders/${button.dataset.orderStatus}`, 'PATCH', { status: button.dataset.nextStatus }); await loadStaff(); feedback('#account-feedback', 'Статус демозаказа обновлён.'); });
});
$('#admin-items').addEventListener('submit', event => { event.preventDefault(); const form = event.target.closest('[data-edit-item]'); if (!form) return; handle('#account-feedback', async () => {
  const data = new FormData(form);
  await api(`/api/admin/items/${form.dataset.editItem}`, 'PATCH', { name: data.get('name'), description: data.get('description'), ingredients: String(data.get('ingredients')).split(',').map(value => value.trim()).filter(Boolean), categoryId: data.get('categoryId'), priceKopeks: Number(data.get('price')) * 100, available: data.has('available') });
  state.menu = await api('/api/menu'); reconcileCart(); renderMenu(); await loadAdmin(); feedback('#account-feedback', 'Позиция обновлена.');
}); });
$('#new-item-form').addEventListener('submit', event => { event.preventDefault(); handle('#account-feedback', async () => {
  await api('/api/admin/items', 'POST', { categoryId: $('#item-category').value, name: $('#item-name').value, description: $('#item-description').value, ingredients: $('#item-ingredients').value.split(',').map(value => value.trim()).filter(Boolean), priceKopeks: Number($('#item-price').value) * 100 });
  $('#new-item-form').reset(); state.menu = await api('/api/menu'); renderMenu(); await loadAdmin(); feedback('#account-feedback', 'Позиция добавлена.');
}); });
$('#new-staff-form').addEventListener('submit', event => { event.preventDefault(); handle('#account-feedback', async () => {
  const result = await api('/api/admin/staff', 'POST', { displayName: $('#staff-name').value, email: $('#staff-email').value });
  $('#staff-credentials').textContent = `Временный пароль сотрудника (показан один раз): ${result.temporaryPassword}`;
  $('#new-staff-form').reset(); await loadAdmin(); feedback('#account-feedback', 'Сотрудник создан. Передайте временный пароль лично.');
}); });
$('#staff-accounts').addEventListener('click', event => { const button = event.target.closest('[data-staff-id]'); if (!button) return; handle('#account-feedback', async () => {
  await api(`/api/admin/staff/${button.dataset.staffId}`, 'PATCH', { disabled: button.dataset.staffDisabled === 'true' }); await loadAdmin(); feedback('#account-feedback', 'Доступ сотрудника обновлён.');
}); });

$('#show-register').addEventListener('click', () => { $('#register-form').hidden = !$('#register-form').hidden; $('#forgot-form').hidden = true; });
$('#show-forgot').addEventListener('click', () => { $('#forgot-form').hidden = !$('#forgot-form').hidden; $('#register-form').hidden = true; });
$('#register-form').addEventListener('submit', event => { event.preventDefault(); handle('#account-feedback', async () => { const result = await api('/api/auth/register', 'POST', { displayName: $('#register-name').value, email: $('#register-email').value, password: $('#register-password').value }); feedback('#account-feedback', result.message); $('#register-form').hidden = true; }); });
$('#forgot-form').addEventListener('submit', event => { event.preventDefault(); handle('#account-feedback', async () => { const result = await api('/api/auth/forgot', 'POST', { email: $('#forgot-email').value }); feedback('#account-feedback', result.message); }); });
$('#reset-form').addEventListener('submit', event => { event.preventDefault(); handle('#account-feedback', async () => { await api('/api/auth/reset', 'POST', { token: new URL(location.href).searchParams.get('reset'), newPassword: $('#reset-password').value }); history.replaceState({}, '', location.pathname); $('#reset-form').hidden = true; feedback('#account-feedback', 'Пароль изменён. Теперь войдите.'); }); });

async function initializeShop() {
  try {
    const [menuData, config, session] = await Promise.all([api('/api/menu'), api('/api/config'), api('/api/auth/me')]);
    state.menu = menuData; state.config = config; state.user = session.user;
    try {
      const saved = JSON.parse(localStorage.getItem('milo-demo-cart') || '{}');
      state.cart = new Map(Object.entries(saved).filter(([id, quantity]) => menuData.items.some(item => item.id === id) && Number.isInteger(quantity) && quantity > 0 && quantity <= 20));
    } catch { state.cart = new Map(); }
    renderMenu(); renderAccount();
    await Promise.all([loadHistory(), loadStaff(), loadAdmin()]);
    const params = new URL(location.href).searchParams;
    if (params.has('verify')) {
      await api('/api/auth/verify', 'POST', { token: params.get('verify') });
      history.replaceState({}, '', location.pathname); feedback('#account-feedback', 'Почта подтверждена. Теперь войдите.');
    }
    if (params.has('reset')) { $('#reset-form').hidden = false; $('#account').scrollIntoView(); }
  } catch (error) {
    $('.menu-list').textContent = 'Не удалось загрузить меню. Обновите страницу.';
    feedback('#account-feedback', error.message);
  }
}
initializeShop();

const productDialog = $('#product-dialog');
const cartDialog = $('#cart-dialog');
const cartToast = $('.cart-toast');
let toastTimer;
function showProduct(id) {
  const product = state.menu.items.find(item => item.id === id);
  if (!product) return;
  $('#product-dialog-title').textContent = product.name;
  $('.dialog-description').textContent = product.description;
  $('.dialog-price').textContent = money(product.price_kopeks);
  $('.ingredients').innerHTML = product.ingredients?.length ? product.ingredients.map(item => `<span>${escapeHtml(item)}</span>`).join('') : '<span>Состав уточняется</span>';
  $('.dialog-add').dataset.addProduct = id;
  productDialog.showModal();
}
function showToast(message) {
  clearTimeout(toastTimer);
  cartToast.textContent = message;
  cartToast.classList.add('show');
  toastTimer = setTimeout(() => cartToast.classList.remove('show'), 2200);
}
function addToCart(id) {
  const product = state.menu.items.find(item => item.id === id);
  if (!product) return;
  state.cart.set(id, Math.min(20, (state.cart.get(id) || 0) + 1));
  saveCart();
  showToast(`${product.name} добавлен в корзину`);
  feedback('#checkout-feedback', `${product.name} добавлен в корзину.`);
}
document.addEventListener('click', event => {
  const productButton = event.target.closest('[data-product-id]');
  if (productButton) showProduct(productButton.dataset.productId);
  const addButton = event.target.closest('[data-add-product]');
  if (addButton) addToCart(addButton.dataset.addProduct);
});
$('.product-dialog .dialog-close').addEventListener('click', () => productDialog.close());
$('.cart-close').addEventListener('click', () => cartDialog.close());
$('.cart-button').addEventListener('click', () => { renderCart(); cartDialog.showModal(); });
$('.cart-order').addEventListener('click', () => cartDialog.close());
[productDialog, cartDialog].forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
$('.cart-items').addEventListener('click', event => {
  const control = event.target.closest('[data-cart-action]');
  if (!control) return;
  const id = control.dataset.product;
  const action = control.dataset.cartAction;
  const next = (state.cart.get(id) || 0) + (action === 'increase' ? 1 : -1);
  if (action === 'remove' || next <= 0) state.cart.delete(id);
  else state.cart.set(id, Math.min(20, next));
  saveCart();
});


if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion-ready');
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
  }), { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(section => observer.observe(section));
}
