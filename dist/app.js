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

const menu = {
  coffee: [
    ['Эспрессо', 'Плотный и выразительный', '190 ₽'], ['Американо', 'Эспрессо и горячая вода', '220 ₽'],
    ['Капучино', 'Мягкий баланс кофе и молока', '290 ₽'], ['Флэт уайт', 'Двойной эспрессо, тонкая пена', '320 ₽'],
    ['Латте', 'Много молока, мягкий вкус', '310 ₽'], ['Раф ванильный', 'Сливки, эспрессо, ваниль', '360 ₽']
  ],
  cold: [
    ['Айс-латте', 'Эспрессо, молоко и лёд', '340 ₽'], ['Бамбл', 'Эспрессо и свежий апельсин', '390 ₽'],
    ['Колд брю', 'Настаиваем 16 часов', '320 ₽'], ['Эспрессо-тоник', 'Яркий и освежающий', '370 ₽']
  ],
  tea: [
    ['Эрл Грей', 'Бергамот и чёрный чай', '280 ₽'], ['Сенча', 'Свежий зелёный чай', '280 ₽'],
    ['Облепиха — апельсин', 'Пряный ягодный чай', '360 ₽'], ['Матча-латте', 'Японская матча и молоко', '380 ₽']
  ],
  food: [
    ['Круассан классический', 'Сливочное масло, хрустящие слои', '240 ₽'], ['Сырники', 'Сметана и ягодный соус', '420 ₽'],
    ['Тост с авокадо', 'Яйцо пашот и микрозелень', '510 ₽'], ['Морковный торт', 'Орехи и крем-чиз', '330 ₽']
  ]
};

const menuList = document.querySelector('.menu-list');
const menuTabs = [...document.querySelectorAll('.menu-tab')];
function renderMenu(category) {
  menuList.innerHTML = menu[category].map(([name, description, price]) => `
    <article class="menu-item"><div><h3>${name}</h3><p>${description}</p></div><strong>${price}</strong></article>`).join('');
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

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion-ready');
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
  }), { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(section => observer.observe(section));
}
