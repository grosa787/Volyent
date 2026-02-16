/**
 * Volyent Bot — Internationalization (i18n)
 * Supports: ru (default), en
 */

const strings = {
    ru: {
        // /start
        welcome: (name) => `👋 Привет, ${name}!\n\n🛡 *Volyent VPN* — быстрый и безопасный VPN.`,
        active_until: (date) => `\n✅ Подписка активна до: *${date}*\n`,
        choose_plan: '\nВыбери план подписки:',
        referral_welcome: (name, refName) => `👋 Привет, ${name}!\n\n🛡 *Volyent VPN* — быстрый и безопасный VPN.\n\n🎉 Тебя пригласил *${refName}*!`,

        // Buttons
        btn_my_account: '📊 Мой аккаунт',
        btn_get_key: '🔑 Получить VPN ключ',
        btn_try_free: '🎁 Попробовать бесплатно',
        btn_invite: '👥 Пригласить друга',
        btn_help: '❓ Помощь',
        btn_get_more_key: '🔑 Получить ещё ключ',
        btn_open_app: '🚀 Открыть в приложении',
        btn_download: '📥 Скачать приложение',
        btn_all_keys: '🔑 Все мои ключи',
        btn_how_download: '📥 Как скачать',
        btn_how_connect: '🔗 Как подключиться',
        btn_troubleshoot: '🔧 Не работает?',
        btn_back: '◀️ Назад',
        btn_buy_plan: 'Выбери план:',
        btn_renew: '🔄 Продлить подписку',

        // Account
        account_title: '👤 *Мой аккаунт*\n',
        account_id: (id) => `Telegram ID: \`${id}\``,
        account_status: (active) => `Статус: ${active ? '✅ Активна' : '❌ Неактивна'}`,
        account_until: (date) => `Подписка до: ${date || '—'}`,
        account_referrals: (count) => `Рефералов: ${count || 0}`,
        account_not_found: '❌ Аккаунт не найден. Отправь /start',

        // Status
        status_active: (date) => `✅ *Подписка активна*\n📅 До: *${date}*`,
        status_inactive: '❌ *Подписка неактивна*\n\nКупи план через /start чтобы начать.',
        status_no_account: '❌ Аккаунт не найден. Отправь /start',

        // Keys
        keys_list: (count) => `🔑 *Твои VPN ключи (${count}):*\n`,
        keys_copy_hint: '👆 Нажми на ключ чтобы скопировать.\nВставь его в приложение Volyent.',
        key_received: '✅ *VPN ключ получен!*\n',
        key_label: (key) => `🔑 \`${key}\``,
        no_keys: '❌ Нет доступных ключей. Попробуй позже.',
        no_subscription: '❌ У тебя нет активной подписки. Купи план через /start',

        // New key
        new_key_title: '🔑 *Получить ещё один ключ*\n\nДля получения нового VPN ключа оплати подписку.\nКлюч будет выдан автоматически после оплаты.\n',

        // Trial
        trial_title: '🎁 *Бесплатный пробный период*\n\n1 день бесплатного VPN!\nКлюч будет выдан автоматически.',
        trial_activated: (date, key) => `🎉 *Пробный период активирован!*\n\n📅 Подписка до: *${date}*\n\n🔑 Твой VPN ключ:\n\`${key}\`\n\n👆 Нажми на ключ чтобы скопировать.\nВставь его в приложение Volyent.`,
        trial_already_used: '❌ Ты уже использовал пробный период.\nКупи подписку через /start',
        trial_no_keys: '🎁 Пробный период активирован, но ключи закончились.\nОбратись в поддержку.',

        // Referral
        invite_text: (link) => `👥 *Пригласи друга!*\n\nПоделись ссылкой — ты получишь *+3 дня* подписки за каждого нового пользователя:\n\n\`${link}\`\n\n👆 Нажми чтобы скопировать ссылку.`,
        referral_bonus: (name) => `🎉 Новый реферал! *${name}* зарегистрировался по твоей ссылке.\n\n✅ Тебе начислено *+3 дня* подписки!`,

        // Payment
        payment_success: '✅ *Оплата прошла успешно!*\n',
        payment_plan: (label) => `📋 План: ${label}`,
        payment_until: (date) => `📅 Подписка до: *${date}*`,
        payment_key: (key) => `\n🔑 Твой VLESS ключ:\n\`${key}\`\n\n👆 Нажми на ключ чтобы скопировать.\nВставь его в приложение Volyent для подключения.`,
        payment_no_key: '\n⚠️ Не удалось получить ключ автоматически.\nНажми «Все мои ключи» или обратись в поддержку.',
        plan_not_found: 'План не найден',

        // Help / FAQ
        help_title: `❓ *Помощь — Volyent VPN*\n\nВыбери раздел:`,
        help_download: `📥 *Как скачать Volyent*\n\n1. Перейди на сайт: volyent.vercel.app\n2. Нажми «Скачать» — выбери macOS или Windows\n3. Установи приложение\n4. На macOS: может потребоваться разрешить в Системных настройках → Конфиденциальность`,
        help_connect: `🔗 *Как подключиться*\n\n1. Открой приложение Volyent\n2. Перейди в бота → нажми «Получить VPN ключ»\n3. Скопируй ключ (нажми на него)\n4. Вставь ключ в приложение\n5. Нажми «Подключить» ✅`,
        help_troubleshoot: `🔧 *Не работает?*\n\n• *Ключ не вставляется* — убедись что скопирован полностью (начинается с \`vless://\`)\n• *Нет подключения* — проверь интернет, попробуй другой сервер\n• *Приложение не открывается* — на macOS: Системные настройки → Конфиденциальность → разрешить\n• *Подписка истекла* — купи новый план через /start\n\nЕсли ничего не помогает — напиши @volyent_support`,

        // Expiry reminders
        expiry_3days: (date) => `⏰ *Напоминание*\n\nТвоя подписка Volyent VPN истекает через 3 дня (*${date}*).\n\nПродли подписку чтобы не потерять доступ!`,
        expiry_today: '⚠️ *Подписка истекает сегодня!*\n\nПродли подписку прямо сейчас чтобы сохранить доступ к VPN.',

        // Invoice
        invoice_title: (label) => `Volyent VPN — ${label}`,
        invoice_desc: (label) => `Подписка на Volyent VPN на ${label}. VPN-ключ выдаётся автоматически.`,
    },
    en: {
        // /start
        welcome: (name) => `👋 Hi, ${name}!\n\n🛡 *Volyent VPN* — fast and secure VPN.`,
        active_until: (date) => `\n✅ Subscription active until: *${date}*\n`,
        choose_plan: '\nChoose a plan:',
        referral_welcome: (name, refName) => `👋 Hi, ${name}!\n\n🛡 *Volyent VPN* — fast and secure VPN.\n\n🎉 You were invited by *${refName}*!`,

        // Buttons
        btn_my_account: '📊 My Account',
        btn_get_key: '🔑 Get VPN Key',
        btn_try_free: '🎁 Try for Free',
        btn_invite: '👥 Invite a Friend',
        btn_help: '❓ Help',
        btn_get_more_key: '🔑 Get Another Key',
        btn_open_app: '🚀 Open in App',
        btn_download: '📥 Download App',
        btn_all_keys: '🔑 All My Keys',
        btn_how_download: '📥 How to Download',
        btn_how_connect: '🔗 How to Connect',
        btn_troubleshoot: '🔧 Troubleshoot',
        btn_back: '◀️ Back',
        btn_buy_plan: 'Choose a plan:',
        btn_renew: '🔄 Renew Subscription',

        // Account
        account_title: '👤 *My Account*\n',
        account_id: (id) => `Telegram ID: \`${id}\``,
        account_status: (active) => `Status: ${active ? '✅ Active' : '❌ Inactive'}`,
        account_until: (date) => `Subscription until: ${date || '—'}`,
        account_referrals: (count) => `Referrals: ${count || 0}`,
        account_not_found: '❌ Account not found. Send /start',

        // Status
        status_active: (date) => `✅ *Subscription active*\n📅 Until: *${date}*`,
        status_inactive: '❌ *Subscription inactive*\n\nBuy a plan via /start to get started.',
        status_no_account: '❌ Account not found. Send /start',

        // Keys
        keys_list: (count) => `🔑 *Your VPN keys (${count}):*\n`,
        keys_copy_hint: '👆 Tap the key to copy.\nPaste it into the Volyent app.',
        key_received: '✅ *VPN key received!*\n',
        key_label: (key) => `🔑 \`${key}\``,
        no_keys: '❌ No keys available. Try again later.',
        no_subscription: '❌ You don\'t have an active subscription. Buy a plan via /start',

        // New key
        new_key_title: '🔑 *Get Another Key*\n\nPurchase a subscription to get a new VPN key.\nThe key will be issued automatically after payment.\n',

        // Trial
        trial_title: '🎁 *Free Trial*\n\n1 day of free VPN!\nThe key will be issued automatically.',
        trial_activated: (date, key) => `🎉 *Trial activated!*\n\n📅 Subscription until: *${date}*\n\n🔑 Your VPN key:\n\`${key}\`\n\n👆 Tap the key to copy.\nPaste it into the Volyent app.`,
        trial_already_used: '❌ You\'ve already used the free trial.\nBuy a subscription via /start',
        trial_no_keys: '🎁 Trial activated but no keys available.\nContact support.',

        // Referral
        invite_text: (link) => `👥 *Invite a Friend!*\n\nShare the link — you'll get *+3 days* of subscription for each new user:\n\n\`${link}\`\n\n👆 Tap to copy the link.`,
        referral_bonus: (name) => `🎉 New referral! *${name}* signed up via your link.\n\n✅ You received *+3 days* of subscription!`,

        // Payment
        payment_success: '✅ *Payment successful!*\n',
        payment_plan: (label) => `📋 Plan: ${label}`,
        payment_until: (date) => `📅 Subscription until: *${date}*`,
        payment_key: (key) => `\n🔑 Your VLESS key:\n\`${key}\`\n\n👆 Tap the key to copy.\nPaste it into the Volyent app to connect.`,
        payment_no_key: '\n⚠️ Failed to get key automatically.\nTap "All My Keys" or contact support.',
        plan_not_found: 'Plan not found',

        // Help / FAQ
        help_title: `❓ *Help — Volyent VPN*\n\nChoose a topic:`,
        help_download: `📥 *How to Download Volyent*\n\n1. Go to: volyent.vercel.app\n2. Click "Download" — choose macOS or Windows\n3. Install the app\n4. On macOS: you may need to allow it in System Settings → Privacy`,
        help_connect: `🔗 *How to Connect*\n\n1. Open the Volyent app\n2. Go to the bot → tap "Get VPN Key"\n3. Copy the key (tap on it)\n4. Paste the key in the app\n5. Tap "Connect" ✅`,
        help_troubleshoot: `🔧 *Troubleshooting*\n\n• *Key won't paste* — make sure it's fully copied (starts with \`vless://\`)\n• *No connection* — check your internet, try a different server\n• *App won't open* — on macOS: System Settings → Privacy → allow\n• *Subscription expired* — buy a new plan via /start\n\nIf nothing helps — contact @volyent_support`,

        // Expiry reminders
        expiry_3days: (date) => `⏰ *Reminder*\n\nYour Volyent VPN subscription expires in 3 days (*${date}*).\n\nRenew to keep your access!`,
        expiry_today: '⚠️ *Subscription expires today!*\n\nRenew now to keep your VPN access.',

        // Invoice
        invoice_title: (label) => `Volyent VPN — ${label}`,
        invoice_desc: (label) => `Volyent VPN subscription for ${label}. VPN key issued automatically.`,
    },
};

/**
 * Get translated string.
 * @param {string} lang - 'ru' or 'en'
 * @param {string} key - String key
 * @param  {...any} args - Arguments for template functions
 */
function t(lang, key, ...args) {
    const locale = strings[lang] || strings.ru;
    const val = locale[key] || strings.ru[key];
    if (typeof val === 'function') return val(...args);
    return val || key;
}

/**
 * Detect language from Telegram user object.
 */
function detectLanguage(from) {
    const code = (from?.language_code || '').toLowerCase();
    return code.startsWith('en') ? 'en' : 'ru';
}

module.exports = { t, detectLanguage };
