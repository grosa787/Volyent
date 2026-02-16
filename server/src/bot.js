/**
 * Telegram bot — Volyent VPN (Webhook mode for Vercel)
 * 
 * Features:
 * 1. /start → show VPN plans with Stars pricing
 * 2. /start ref_<userId> → referral tracking + bonus days
 * 3. Trial period (1 day free, once per user)
 * 4. /status → quick subscription check
 * 5. /help → FAQ with setup instructions
 * 6. Multilingual (RU/EN)
 * 7. Post-payment → immediately show VLESS key
 */

const TelegramBot = require('node-telegram-bot-api');
const {
    upsertUser, grantSubscription, recordPayment, findUserByTelegramId,
    markTrialUsed, setUserLanguage, addReferral,
} = require('./db');
const { sheetsUpsertUser, sheetsRecordPayment } = require('./sheets');
const { t, detectLanguage } = require('./i18n');

const PLANS = [
    { id: '7days', label_ru: '7 дней', label_en: '7 days', stars: 50, days: 7, rub: '~55₽' },
    { id: '30days', label_ru: '1 месяц', label_en: '1 month', stars: 150, days: 30, rub: '~160₽' },
    { id: '90days', label_ru: '3 месяца', label_en: '3 months', stars: 350, days: 90, rub: '~380₽' },
    { id: '180days', label_ru: '6 месяцев', label_en: '6 months', stars: 600, days: 180, rub: '~650₽' },
    { id: '365days', label_ru: '1 год', label_en: '1 year', stars: 1000, days: 365, rub: '~1080₽' },
];

function planLabel(plan, lang) {
    return lang === 'en' ? plan.label_en : plan.label_ru;
}

const ACTIVATION_KEYS_URL = 'https://script.google.com/macros/s/AKfycbz_54oXTlMDtt0PKxwix4ghMHAx0X0t4AlKYT3rjhbMdZU_unw6dXtVUfQUB7aRDuZM3A/exec';
const BOT_USERNAME = 'Volyent_bot';
const REFERRAL_BONUS_DAYS = 3;

// ── Fetch from GAS with redirect handling ──
async function fetchGAS(url) {
    try {
        const res = await fetch(url, { redirect: 'manual' });
        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get('location');
            if (location) {
                const followRes = await fetch(location, { redirect: 'follow' });
                return await followRes.json();
            }
        }
        const text = await res.text();
        try { return JSON.parse(text); } catch { return null; }
    } catch (err) {
        console.error('GAS fetch error:', err.message);
        return null;
    }
}

// ── Singleton bot instance ──
let _bot;
function getBot() {
    if (!_bot) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) { console.warn('TELEGRAM_BOT_TOKEN not set'); return null; }
        _bot = new TelegramBot(token, { polling: false });
    }
    return _bot;
}

async function registerWebhook(webhookUrl) {
    const bot = getBot();
    if (!bot) return;
    const fullUrl = `${webhookUrl}/api/bot-webhook`;
    await bot.setWebHook(fullUrl);
    await setupCommands();
    console.log(`Webhook set to: ${fullUrl}`);
}

// ── Set bot command menu ──
async function setupCommands() {
    const bot = getBot();
    if (!bot) return;
    // Russian commands
    await bot.setMyCommands([
        { command: 'start', description: 'Главное меню / Купить подписку' },
        { command: 'status', description: 'Статус подписки' },
        { command: 'help', description: 'Помощь и инструкции' },
    ], { language_code: 'ru' });
    // English commands
    await bot.setMyCommands([
        { command: 'start', description: 'Main menu / Buy subscription' },
        { command: 'status', description: 'Subscription status' },
        { command: 'help', description: 'Help & instructions' },
    ], { language_code: 'en' });
    // Default (fallback)
    await bot.setMyCommands([
        { command: 'start', description: 'Главное меню / Main menu' },
        { command: 'status', description: 'Статус / Status' },
        { command: 'help', description: 'Помощь / Help' },
    ]);
    console.log('Bot commands menu set');
}

// ── Helper: get user language ──
async function getLang(telegramId, from) {
    const user = await findUserByTelegramId(telegramId);
    if (user && user.language) return user.language;
    const detected = detectLanguage(from);
    // Save detected language
    if (user) setUserLanguage(telegramId, detected).catch(() => { });
    return detected;
}

// ── Helper: plan buttons ──
function planButtons(lang) {
    return PLANS.map(plan => ([
        { text: `${planLabel(plan, lang)} — ${plan.stars}⭐ (${plan.rub})`, callback_data: `buy_${plan.id}` }
    ]));
}

// ── Helper: main menu buttons ──
function mainMenuButtons(lang, hasSubscription) {
    const buttons = [
        ...planButtons(lang),
        [{ text: t(lang, 'btn_my_account'), callback_data: 'my_account' }],
        [{ text: t(lang, 'btn_get_key'), callback_data: 'get_key' }],
    ];
    if (!hasSubscription) {
        buttons.push([{ text: t(lang, 'btn_try_free'), callback_data: 'free_trial' }]);
    }
    buttons.push(
        [{ text: t(lang, 'btn_invite'), callback_data: 'invite_friend' }],
        [{ text: t(lang, 'btn_help'), callback_data: 'help_menu' }],
    );
    return buttons;
}

// ── Process incoming webhook update ──
async function handleUpdate(update) {
    const bot = getBot();
    if (!bot) return;

    const downloadUrl = process.env.DOWNLOAD_SITE_URL || 'https://volyent.vercel.app/#download';
    const backendUrl = process.env.BACKEND_URL || 'https://volyent.com';

    try {
        // ══════════════════════════════════════════
        // /start command (with optional referral)
        // ══════════════════════════════════════════
        if (update.message?.text?.startsWith('/start')) {
            const msg = update.message;
            const name = msg.from.first_name || 'User';
            const telegramId = msg.from.id;
            const displayName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');

            // Detect & save language
            const lang = detectLanguage(msg.from);

            // Check for referral parameter
            const args = (msg.text || '').split(' ');
            let referrerId = null;
            if (args.length > 1 && args[1].startsWith('ref_')) {
                referrerId = parseInt(args[1].replace('ref_', ''), 10);
                if (isNaN(referrerId) || referrerId === telegramId) referrerId = null;
            }

            // Check if user already exists
            const existingUser = await findUserByTelegramId(telegramId);

            // Upsert user
            await upsertUser({
                id: telegramId,
                username: msg.from.username,
                first_name: msg.from.first_name,
                last_name: msg.from.last_name,
            });

            // Save language
            await setUserLanguage(telegramId, lang);

            // Sheets sync
            sheetsUpsertUser({
                telegramId,
                username: msg.from.username || '',
                displayName,
            }).catch(err => console.error('Sheets upsert error:', err.message));

            // Process referral (only for NEW users)
            if (referrerId && !existingUser) {
                const referrer = await findUserByTelegramId(referrerId);
                if (referrer) {
                    await addReferral(telegramId, referrerId);
                    // Grant referrer bonus days
                    const newUntil = await grantSubscription(referrerId, REFERRAL_BONUS_DAYS);
                    // Notify referrer
                    try {
                        const refLang = referrer.language || 'ru';
                        await bot.sendMessage(referrerId,
                            t(refLang, 'referral_bonus', name),
                            {
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: t(refLang, 'btn_get_key'), callback_data: 'get_key' }],
                                    ]
                                }
                            }
                        );
                    } catch (e) { console.error('Referral notify error:', e.message); }
                }
            }

            // Build greeting
            const user = await findUserByTelegramId(telegramId);
            const hasSubscription = user && user.allowed && user.subscription_until && new Date(user.subscription_until) > new Date();
            let statusLine = '';
            if (hasSubscription) {
                statusLine = t(lang, 'active_until', user.subscription_until);
            }

            let greeting = t(lang, 'welcome', name);
            if (referrerId && !existingUser) {
                const referrer = await findUserByTelegramId(referrerId);
                if (referrer) greeting = t(lang, 'referral_welcome', name, referrer.display_name || 'User');
            }

            await bot.sendMessage(msg.chat.id,
                greeting + statusLine + t(lang, 'choose_plan'),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: mainMenuButtons(lang, hasSubscription)
                    }
                }
            );
            return;
        }

        // ══════════════════════════════════════════
        // /status command
        // ══════════════════════════════════════════
        if (update.message?.text?.startsWith('/status')) {
            const msg = update.message;
            const telegramId = msg.from.id;
            const lang = await getLang(telegramId, msg.from);
            const user = await findUserByTelegramId(telegramId);

            if (!user) {
                return bot.sendMessage(msg.chat.id, t(lang, 'status_no_account'), { parse_mode: 'Markdown' });
            }

            const active = user.allowed && user.subscription_until && new Date(user.subscription_until) > new Date();
            if (active) {
                await bot.sendMessage(msg.chat.id, t(lang, 'status_active', user.subscription_until), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: t(lang, 'btn_get_key'), callback_data: 'get_key' }],
                            [{ text: t(lang, 'btn_open_app'), url: `${backendUrl}/open` }],
                        ]
                    }
                });
            } else {
                await bot.sendMessage(msg.chat.id, t(lang, 'status_inactive'), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: t(lang, 'btn_try_free'), callback_data: 'free_trial' }],
                            ...planButtons(lang),
                        ]
                    }
                });
            }
            return;
        }

        // ══════════════════════════════════════════
        // /help command
        // ══════════════════════════════════════════
        if (update.message?.text?.startsWith('/help')) {
            const msg = update.message;
            const lang = await getLang(msg.from.id, msg.from);
            await bot.sendMessage(msg.chat.id, t(lang, 'help_title'), {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: t(lang, 'btn_how_download'), callback_data: 'help_download' }],
                        [{ text: t(lang, 'btn_how_connect'), callback_data: 'help_connect' }],
                        [{ text: t(lang, 'btn_troubleshoot'), callback_data: 'help_trouble' }],
                    ]
                }
            });
            return;
        }

        // ══════════════════════════════════════════
        // Callback queries
        // ══════════════════════════════════════════
        if (update.callback_query) {
            const query = update.callback_query;
            const chatId = query.message.chat.id;
            const data = query.data;
            const telegramId = query.from.id;
            const lang = await getLang(telegramId, query.from);

            // ── My account ──
            if (data === 'my_account') {
                await bot.answerCallbackQuery(query.id);
                const user = await findUserByTelegramId(telegramId);
                if (!user) return bot.sendMessage(chatId, t(lang, 'account_not_found'));

                const active = user.allowed && user.subscription_until && new Date(user.subscription_until) > new Date();
                const buttons = active ? {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: t(lang, 'btn_get_key'), callback_data: 'get_key' }],
                            [{ text: t(lang, 'btn_open_app'), url: `${backendUrl}/open` }],
                            [{ text: t(lang, 'btn_download'), url: downloadUrl }],
                            [{ text: t(lang, 'btn_invite'), callback_data: 'invite_friend' }],
                        ]
                    }
                } : {
                    reply_markup: {
                        inline_keyboard: [
                            ...planButtons(lang),
                        ]
                    }
                };

                await bot.sendMessage(chatId,
                    t(lang, 'account_title') +
                    t(lang, 'account_id', user.telegram_id) + '\n' +
                    t(lang, 'account_status', active) + '\n' +
                    t(lang, 'account_until', user.subscription_until) + '\n' +
                    t(lang, 'account_referrals', user.referral_count),
                    { parse_mode: 'Markdown', ...buttons }
                );
                return;
            }

            // ── Get VPN key ──
            if (data === 'get_key') {
                await bot.answerCallbackQuery(query.id);
                const user = await findUserByTelegramId(telegramId);
                if (!user || !user.allowed) {
                    return bot.sendMessage(chatId, t(lang, 'no_subscription'), { parse_mode: 'Markdown' });
                }

                const username = query.from.username || user.display_name || '';
                const myKeysUrl = `${ACTIVATION_KEYS_URL}?action=getMyKeys&telegram_id=${telegramId}`;
                const myKeysData = await fetchGAS(myKeysUrl);

                if (myKeysData && myKeysData.keys && myKeysData.keys.length > 0) {
                    const keyList = myKeysData.keys.map((k, i) => `${i + 1}. \`${k}\``).join('\n\n');
                    return bot.sendMessage(chatId,
                        t(lang, 'keys_list', myKeysData.keys.length) + '\n' + keyList + '\n\n' + t(lang, 'keys_copy_hint'),
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: t(lang, 'btn_get_more_key'), callback_data: 'claim_new_key' }],
                                    [{ text: t(lang, 'btn_open_app'), url: `${backendUrl}/open` }],
                                    [{ text: t(lang, 'btn_download'), url: downloadUrl }],
                                ]
                            }
                        }
                    );
                }

                // No keys yet — claim first one
                const claimUrl = `${ACTIVATION_KEYS_URL}?action=claimKey&telegram_id=${telegramId}&username=${encodeURIComponent(username)}`;
                const claimData = await fetchGAS(claimUrl);

                if (claimData && claimData.key) {
                    await bot.sendMessage(chatId,
                        t(lang, 'key_received') + '\n' + t(lang, 'key_label', claimData.key) + '\n\n' + t(lang, 'keys_copy_hint'),
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: t(lang, 'btn_open_app'), url: `${backendUrl}/open` }],
                                    [{ text: t(lang, 'btn_download'), url: downloadUrl }],
                                ]
                            }
                        }
                    );
                } else if (claimData && claimData.error) {
                    await bot.sendMessage(chatId, `❌ ${claimData.error}`);
                } else {
                    await bot.sendMessage(chatId, t(lang, 'no_keys'));
                }
                return;
            }

            // ── Claim new key → show plans ──
            if (data === 'claim_new_key') {
                await bot.answerCallbackQuery(query.id);
                await bot.sendMessage(chatId,
                    t(lang, 'new_key_title') + '\n' + t(lang, 'btn_buy_plan'),
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: planButtons(lang)
                        }
                    }
                );
                return;
            }

            // ── Free trial ──
            if (data === 'free_trial') {
                await bot.answerCallbackQuery(query.id);
                const user = await findUserByTelegramId(telegramId);

                if (user && user.trial_used) {
                    return bot.sendMessage(chatId, t(lang, 'trial_already_used'), {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: planButtons(lang)
                        }
                    });
                }

                // Grant 1 day
                const newUntil = await grantSubscription(telegramId, 1);
                await markTrialUsed(telegramId);

                // Claim a key
                const username = query.from.username || '';
                const claimUrl = `${ACTIVATION_KEYS_URL}?action=claimKey&telegram_id=${telegramId}&username=${encodeURIComponent(username)}`;
                const claimData = await fetchGAS(claimUrl);

                if (claimData && claimData.key) {
                    await bot.sendMessage(chatId, t(lang, 'trial_activated', newUntil, claimData.key), {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: t(lang, 'btn_open_app'), url: `${backendUrl}/open` }],
                                [{ text: t(lang, 'btn_download'), url: downloadUrl }],
                            ]
                        }
                    });
                } else {
                    await bot.sendMessage(chatId, t(lang, 'trial_no_keys'), { parse_mode: 'Markdown' });
                }

                // Sheets sync
                sheetsRecordPayment({
                    telegramId,
                    days: 1,
                    key: claimData?.key || '',
                    username: query.from.username || '',
                    displayName: [query.from.first_name, query.from.last_name].filter(Boolean).join(' '),
                }).catch(err => console.error('Sheets trial error:', err.message));

                return;
            }

            // ── Invite friend ──
            if (data === 'invite_friend') {
                await bot.answerCallbackQuery(query.id);
                const link = `https://t.me/${BOT_USERNAME}?start=ref_${telegramId}`;
                await bot.sendMessage(chatId, t(lang, 'invite_text', link), { parse_mode: 'Markdown' });
                return;
            }

            // ── Help menu ──
            if (data === 'help_menu') {
                await bot.answerCallbackQuery(query.id);
                await bot.sendMessage(chatId, t(lang, 'help_title'), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: t(lang, 'btn_how_download'), callback_data: 'help_download' }],
                            [{ text: t(lang, 'btn_how_connect'), callback_data: 'help_connect' }],
                            [{ text: t(lang, 'btn_troubleshoot'), callback_data: 'help_trouble' }],
                        ]
                    }
                });
                return;
            }

            // ── Help topics ──
            if (data === 'help_download') {
                await bot.answerCallbackQuery(query.id);
                await bot.sendMessage(chatId, t(lang, 'help_download'), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: t(lang, 'btn_download'), url: downloadUrl }],
                            [{ text: t(lang, 'btn_back'), callback_data: 'help_menu' }],
                        ]
                    }
                });
                return;
            }
            if (data === 'help_connect') {
                await bot.answerCallbackQuery(query.id);
                await bot.sendMessage(chatId, t(lang, 'help_connect'), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: t(lang, 'btn_get_key'), callback_data: 'get_key' }],
                            [{ text: t(lang, 'btn_back'), callback_data: 'help_menu' }],
                        ]
                    }
                });
                return;
            }
            if (data === 'help_trouble') {
                await bot.answerCallbackQuery(query.id);
                await bot.sendMessage(chatId, t(lang, 'help_troubleshoot'), {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: t(lang, 'btn_back'), callback_data: 'help_menu' }],
                        ]
                    }
                });
                return;
            }

            // ── Buy plan ──
            if (data.startsWith('buy_')) {
                const planId = data.replace('buy_', '');
                const plan = PLANS.find(p => p.id === planId);
                if (!plan) return bot.answerCallbackQuery(query.id, { text: t(lang, 'plan_not_found') });

                await bot.answerCallbackQuery(query.id);
                const label = planLabel(plan, lang);
                await bot.sendInvoice(
                    chatId,
                    t(lang, 'invoice_title', label),
                    t(lang, 'invoice_desc', label),
                    `volyent_${planId}_${telegramId}_${Date.now()}`,
                    '', 'XTR',
                    [{ label: label, amount: plan.stars }],
                );
                return;
            }
        }

        // ══════════════════════════════════════════
        // Pre-checkout
        // ══════════════════════════════════════════
        if (update.pre_checkout_query) {
            await bot.answerPreCheckoutQuery(update.pre_checkout_query.id, true);
            return;
        }

        // ══════════════════════════════════════════
        // Successful payment → show key immediately
        // ══════════════════════════════════════════
        if (update.message?.successful_payment) {
            const msg = update.message;
            const payment = msg.successful_payment;
            const telegramId = msg.from.id;
            const payload = payment.invoice_payload || '';
            const displayName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');
            const lang = await getLang(telegramId, msg.from);

            const parts = payload.split('_');
            const planId = parts[1] || '30days';
            const plan = PLANS.find(p => p.id === planId) || PLANS[1];
            const label = planLabel(plan, lang);

            // Save user
            await upsertUser({
                id: telegramId,
                username: msg.from.username,
                first_name: msg.from.first_name,
                last_name: msg.from.last_name,
            });

            // Grant subscription
            const newUntil = await grantSubscription(telegramId, plan.days);

            // Record payment
            await recordPayment({
                telegramId,
                telegramChargeId: payment.telegram_payment_charge_id,
                providerChargeId: payment.provider_payment_charge_id,
                amountStars: payment.total_amount,
                plan: plan.id,
                daysGranted: plan.days,
            });

            // Auto-claim VLESS key
            const username = msg.from.username || displayName || '';
            const claimUrl = `${ACTIVATION_KEYS_URL}?action=claimKey&telegram_id=${telegramId}&username=${encodeURIComponent(username)}`;
            const claimData = await fetchGAS(claimUrl).catch(() => null);
            const vlessKey = claimData && claimData.key ? claimData.key : null;

            // Sheets sync
            sheetsRecordPayment({
                telegramId,
                days: plan.days,
                key: vlessKey || '',
                username: msg.from.username || '',
                displayName,
            }).catch(err => console.error('Sheets payment error:', err.message));

            console.log(`[Payment] User ${telegramId} paid ${payment.total_amount}⭐ for ${plan.id}`);

            // Build message — show key immediately
            let keySection = '';
            if (vlessKey) {
                keySection = t(lang, 'payment_key', vlessKey);
            } else {
                keySection = t(lang, 'payment_no_key');
            }

            await bot.sendMessage(msg.chat.id,
                t(lang, 'payment_success') + '\n' +
                t(lang, 'payment_plan', label) + '\n' +
                t(lang, 'payment_until', newUntil) + '\n' +
                keySection,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: t(lang, 'btn_all_keys'), callback_data: 'get_key' }],
                            [{ text: t(lang, 'btn_open_app'), url: `${backendUrl}/open` }],
                            [{ text: t(lang, 'btn_download'), url: downloadUrl }],
                            [{ text: t(lang, 'btn_invite'), callback_data: 'invite_friend' }],
                        ]
                    }
                }
            );
        }
    } catch (err) {
        console.error('Bot update error:', err.message);
    }
}

module.exports = { getBot, handleUpdate, registerWebhook };
