/**
 * Volyent — Subscription Expiry Reminder Cron Job
 * 
 * Runs daily to notify users about expiring subscriptions.
 * - 3 days before expiry → reminder
 * - Day of expiry → urgent notice
 */

const { getUsersExpiringOn } = require('./db');
const { getBot } = require('./bot');
const { t } = require('./i18n');

/**
 * Check and notify users with expiring subscriptions.
 */
async function checkExpiringSubscriptions() {
    const bot = getBot();
    if (!bot) {
        console.log('[Cron] Bot not initialized, skipping');
        return { sent: 0 };
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const in3days = new Date(today);
    in3days.setDate(in3days.getDate() + 3);
    const in3daysStr = in3days.toISOString().split('T')[0];

    let sent = 0;

    // Users expiring in 3 days
    const expiring3 = await getUsersExpiringOn(in3daysStr);
    for (const user of expiring3) {
        try {
            const lang = user.language || 'ru';
            await bot.sendMessage(user.telegram_id,
                t(lang, 'expiry_3days', user.subscription_until),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: t(lang, 'btn_renew'), callback_data: 'claim_new_key' }],
                        ]
                    }
                }
            );
            sent++;
        } catch (e) {
            console.error(`[Cron] Failed to notify ${user.telegram_id}:`, e.message);
        }
    }

    // Users expiring today
    const expiringToday = await getUsersExpiringOn(todayStr);
    for (const user of expiringToday) {
        try {
            const lang = user.language || 'ru';
            await bot.sendMessage(user.telegram_id,
                t(lang, 'expiry_today'),
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: t(lang, 'btn_renew'), callback_data: 'claim_new_key' }],
                        ]
                    }
                }
            );
            sent++;
        } catch (e) {
            console.error(`[Cron] Failed to notify ${user.telegram_id}:`, e.message);
        }
    }

    console.log(`[Cron] Sent ${sent} expiry notifications (3-day: ${expiring3.length}, today: ${expiringToday.length})`);
    return { sent, expiring3: expiring3.length, expiringToday: expiringToday.length };
}

module.exports = { checkExpiringSubscriptions };
