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

const products = {
  espresso: { name: 'Эспрессо', description: 'Плотный и выразительный', price: 190, ingredients: ['100% арабика', 'вода'] },
  americano: { name: 'Американо', description: 'Эспрессо и горячая вода', price: 220, ingredients: ['эспрессо', 'горячая вода'] },
  cappuccino: { name: 'Капучино', description: 'Мягкий баланс кофе и молока', price: 290, ingredients: ['эспрессо', 'молоко', 'молочная пена'] },
  'flat-white': { name: 'Флэт уайт', description: 'Двойной эспрессо, тонкая пена', price: 320, ingredients: ['двойной эспрессо', 'молоко', 'тонкая молочная пена'] },
  latte: { name: 'Латте', description: 'Много молока, мягкий вкус', price: 310, ingredients: ['эспрессо', 'молоко', 'микропена'] },
  'vanilla-raf': { name: 'Раф ванильный', description: 'Сливочный и нежный', price: 360, ingredients: ['эспрессо', 'сливки 10%', 'ванильный сахар'] },
  'iced-latte': { name: 'Айс-латте', description: 'Прохладный, сливочный, в меру бодрый', price: 340, ingredients: ['эспрессо', 'молоко', 'лёд'] },
  bumble: { name: 'Бамбл', description: 'Кофе и свежий апельсин', price: 390, ingredients: ['эспрессо', 'апельсиновый фреш', 'карамельный сироп', 'лёд'] },
  'cold-brew': { name: 'Колд брю', description: 'Настаиваем 16 часов', price: 320, ingredients: ['100% арабика', 'вода', 'лёд'] },
  'espresso-tonic': { name: 'Эспрессо-тоник', description: 'Яркий и освежающий', price: 370, ingredients: ['эспрессо', 'тоник', 'лайм', 'лёд'] },
  'earl-grey': { name: 'Эрл Грей', description: 'Бергамот и чёрный чай', price: 280, ingredients: ['чёрный чай', 'бергамот', 'горячая вода'] },
  sencha: { name: 'Сенча', description: 'Свежий зелёный чай', price: 280, ingredients: ['зелёный чай сенча', 'горячая вода'] },
  'sea-buckthorn': { name: 'Облепиха — апельсин', description: 'Пряный ягодный чай', price: 360, ingredients: ['облепиха', 'апельсин', 'мёд', 'корица', 'вода'] },
  matcha: { name: 'Матча-латте', description: 'Японская матча и молоко', price: 380, ingredients: ['чай матча', 'молоко', 'вода'] },
  croissant: { name: 'Круассан классический', description: 'Сливочное масло, хрустящие слои', price: 240, ingredients: ['пшеничная мука', 'сливочное масло', 'молоко', 'дрожжи', 'сахар', 'соль'] },
  syrniki: { name: 'Сырники', description: 'Сметана и ягодный соус', price: 420, ingredients: ['творог', 'яйцо', 'рисовая мука', 'сметана', 'ягодный соус'] },
  'avocado-toast': { name: 'Тост с авокадо', description: 'Яйцо пашот и микрозелень', price: 510, ingredients: ['зерновой хлеб', 'авокадо', 'яйцо', 'творожный сыр', 'микрозелень'] },
  'carrot-cake': { name: 'Морковный торт', description: 'Орехи и крем-чиз', price: 330, ingredients: ['морковь', 'пшеничная мука', 'грецкий орех', 'корица', 'крем-чиз'] }
};

const menu = {
  coffee: ['espresso', 'americano', 'cappuccino', 'flat-white', 'latte', 'vanilla-raf'],
  cold: ['iced-latte', 'bumble', 'cold-brew', 'espresso-tonic'],
  tea: ['earl-grey', 'sencha', 'sea-buckthorn', 'matcha'],
  food: ['croissant', 'syrniki', 'avocado-toast', 'carrot-cake']
};

const menuList = document.querySelector('.menu-list');
const menuTabs = [...document.querySelectorAll('.menu-tab')];
function renderMenu(category) {
  menuList.innerHTML = menu[category].map(id => {
    const product = products[id];
    return `<article class="menu-item"><div><h3><button class="product-title" type="button" data-product-id="${id}">${product.name}</button></h3><p>${product.description}</p></div><div class="menu-item-actions"><strong>${product.price} ₽</strong><button class="add-button add-button-light" type="button" data-add-product="${id}" aria-label="Добавить ${product.name} в корзину">В корзину <span aria-hidden="true">+</span></button></div></article>`;
  }).join('');
}
menuTabs.forEach((tab, index) => tab.addEventListener('click', () => {
  menuTabs.forEach(item => { item.classList.remove('active'); item.setAttribute('aria-selected', 'false'); item.tabIndex = -1; });
  tab.classList.add('active'); tab.setAttribute('aria-selected', 'true'); tab.tabIndex = 0;
  renderMenu(tab.dataset.category);
}));
document.querySelector('.menu-tabs').addEventListener('keydown', event => {
  const current = menuTabs.indexOf(document.activeElement);
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || current < 0) return;
  event.preventDefault();
  const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + menuTabs.length) % menuTabs.length;
  menuTabs[next].click(); menuTabs[next].focus();
});
renderMenu('coffee');

const productDialog = document.querySelector('#product-dialog');
const cartDialog = document.querySelector('#cart-dialog');
const cartButton = document.querySelector('.cart-button');
const cartCount = document.querySelector('.cart-count');
const cartItems = document.querySelector('.cart-items');
const cartTotal = document.querySelector('.cart-total');
const cartSummary = document.querySelector('.cart-summary');
const cartOrder = document.querySelector('.cart-order');
const cartToast = document.querySelector('.cart-toast');
let toastTimer;
let cart = {};

try {
  const savedCart = JSON.parse(localStorage.getItem('krug-cart') || '{}');
  cart = Object.fromEntries(Object.entries(savedCart).filter(([id, quantity]) => products[id] && Number.isInteger(quantity) && quantity > 0));
} catch { cart = {}; }

function showProduct(id) {
  const product = products[id];
  if (!product) return;
  productDialog.querySelector('#product-dialog-title').textContent = product.name;
  productDialog.querySelector('.dialog-description').textContent = product.description;
  productDialog.querySelector('.dialog-price').textContent = `${product.price} ₽`;
  productDialog.querySelector('.ingredients').innerHTML = product.ingredients.map(item => `<span>${item}</span>`).join('');
  productDialog.querySelector('.dialog-add').dataset.addProduct = id;
  productDialog.showModal();
}

function showToast(message) {
  clearTimeout(toastTimer);
  cartToast.textContent = message;
  cartToast.classList.add('show');
  toastTimer = setTimeout(() => cartToast.classList.remove('show'), 2200);
}

function saveCart() {
  localStorage.setItem('krug-cart', JSON.stringify(cart));
  renderCart();
}

function addToCart(id) {
  const product = products[id];
  if (!product) return;
  cart[id] = (cart[id] || 0) + 1;
  saveCart();
  showToast(`${product.name} добавлен в корзину`);
}

function renderCart() {
  const entries = Object.entries(cart);
  const count = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
  const total = entries.reduce((sum, [id, quantity]) => sum + products[id].price * quantity, 0);
  cartCount.textContent = count;
  cartButton.setAttribute('aria-label', `Открыть корзину, товаров: ${count}`);
  cartButton.classList.toggle('has-items', count > 0);
  cartTotal.textContent = `${total} ₽`;
  cartSummary.hidden = count === 0;
  cartOrder.hidden = count === 0;
  if (!count) {
    cartItems.innerHTML = '<div class="cart-empty"><span aria-hidden="true">◉</span><h3>Пока пусто</h3><p>Добавьте напиток или что-нибудь к нему.</p></div>';
    return;
  }
  cartItems.innerHTML = entries.map(([id, quantity]) => {
    const product = products[id];
    return `<article class="cart-item"><div><h3>${product.name}</h3><p>${product.price} ₽ · ${product.description}</p><button class="cart-remove" type="button" data-cart-action="remove" data-product="${id}">Убрать</button></div><div class="quantity"><button type="button" data-cart-action="decrease" data-product="${id}" aria-label="Уменьшить количество ${product.name}">−</button><span>${quantity}</span><button type="button" data-cart-action="increase" data-product="${id}" aria-label="Увеличить количество ${product.name}">+</button></div></article>`;
  }).join('');
}

document.addEventListener('click', event => {
  const productTrigger = event.target.closest('[data-product-id]');
  if (productTrigger) showProduct(productTrigger.dataset.productId);
  const addTrigger = event.target.closest('[data-add-product]');
  if (addTrigger) addToCart(addTrigger.dataset.addProduct);
});
document.querySelector('.product-dialog .dialog-close').addEventListener('click', () => productDialog.close());
document.querySelector('.cart-close').addEventListener('click', () => cartDialog.close());
cartButton.addEventListener('click', () => { renderCart(); cartDialog.showModal(); });
[productDialog, cartDialog].forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
cartItems.addEventListener('click', event => {
  const control = event.target.closest('[data-cart-action]');
  if (!control) return;
  const { product: id, cartAction: action } = control.dataset;
  if (action === 'increase') cart[id] += 1;
  if (action === 'decrease') cart[id] -= 1;
  if (action === 'remove' || cart[id] <= 0) delete cart[id];
  saveCart();
});
renderCart();

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion-ready');
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
  }), { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(section => observer.observe(section));
}
