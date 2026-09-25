# milo

Адаптивный одностраничный сайт современной кофейни. Интерфейс на русском языке, фотографии созданы специально для проекта.

## Локальная разработка

```bash
pnpm install
pnpm exec wrangler d1 migrations apply krug-coffee-db --local
pnpm seed:demo:local
pnpm dev
```

Откройте адрес, выведенный Wrangler. Сайт, API и локальная D1 работают вместе. Демоданные сотрудника и администратора записываются в `artifacts/demo-credentials-local.txt`; файл исключён из Git. Открытая регистрация выключена, пока не настроена отправка писем.

## Проверка

```bash
pnpm check
```

## Публикация

1. Войти в Cloudflare (`pnpm exec wrangler login`), создать D1 `krug-coffee-db` и записать выданный `database_id` в `wrangler.jsonc`.
2. Применить миграции: `pnpm exec wrangler d1 migrations apply krug-coffee-db --remote`.
3. Создать тестовые аккаунты: `pnpm seed:demo:remote`. Пароли администратора и сотрудника будут в локальном `artifacts/demo-credentials-remote.txt`.
4. Зафиксировать изменения в Git и выполнить `pnpm deploy`. Скрипт проверит `/api/health` и контрольные суммы опубликованных HTML, JavaScript и CSS.

Тестовые карты на странице используют вымышленные номера. Реальные реквизиты не вводятся и не сохраняются; заказы не исполняются. Тестовый клиент общий для всех посетителей, его история видна всем вошедшим под этим аккаунтом: не вводите личные данные. Для будущей отправки писем нужен подтверждённый домен, `send_email` binding, `EMAIL_FROM` и `EMAIL_ENABLED=true` в Cloudflare Email Service. До этого регистрация и восстановление пароля остаются недоступными.
