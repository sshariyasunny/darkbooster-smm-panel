const fs = require('fs');
const path = require('path');
const db = require('./db');

function getTelegramConfig() {
  return db.getTelegramConfig();
}

function saveTelegramConfig(config) {
  return db.saveTelegramConfig(config);
}


class TelegramBotService {
  constructor() {
    this.polling = false;
    this.updateOffset = 0;
    this.onApproveDepositHandler = null;
    this.onRejectDepositHandler = null;
    this.getStatsHandler = null;
    this.getPendingDepositsHandler = null;
    this.getUsersHandler = null;
    this.getBalanceHandler = null;
  }

  // Register Handlers from server.js
  setHandlers({ onApproveDeposit, onRejectDeposit, getStats, getPendingDeposits, getUsers, getBalance }) {
    this.onApproveDepositHandler = onApproveDeposit;
    this.onRejectDepositHandler = onRejectDeposit;
    this.getStatsHandler = getStats;
    this.getPendingDepositsHandler = getPendingDeposits;
    this.getUsersHandler = getUsers;
    this.getBalanceHandler = getBalance;
  }

  // Raw API request to Telegram
  async apiCall(method, payload = {}) {
    const config = getTelegramConfig();
    if (!config.bot_token) return null;

    const url = `https://api.telegram.org/bot${config.bot_token}/${method}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.error_code !== 409) {
          console.error(`Telegram API error (${method}):`, data.description);
        }
      }
      return data;
    } catch (err) {
      console.error(`Telegram API network error (${method}):`, err.message);
      return null;
    }
  }

  // Send Markdown/HTML Message to Admin
  async sendMessage(chatId, text, extra = {}) {
    const config = getTelegramConfig();
    const targetChatId = chatId || config.admin_chat_id || process.env.TELEGRAM_ADMIN_CHAT_ID || '6555898303';
    if (!targetChatId) {
      console.log('⚠️ Telegram Alert Skipped: TELEGRAM_ADMIN_CHAT_ID is not configured yet.');
      return null;
    }

    const result = await this.apiCall('sendMessage', {
      chat_id: targetChatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra
    });

    if (result && result.ok) {
      console.log(`✅ Telegram real-time notification sent successfully to Admin (${targetChatId}).`);
    } else {
      console.error(`❌ Failed to send Telegram notification to Admin (${targetChatId}).`);
    }

    return result;
  }

  // Edit Existing Telegram Message (e.g. after approval/rejection)
  async editMessageText(chatId, messageId, text, extra = {}) {
    return await this.apiCall('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra
    });
  }

  // Answer Inline Callback Queries (Toast notification in Telegram app)
  async answerCallbackQuery(callbackQueryId, text, showAlert = false) {
    return await this.apiCall('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text,
      show_alert: showAlert
    });
  }

  // -----------------------------------------------------------
  // OUTBOUND NOTIFICATIONS
  // -----------------------------------------------------------

  // Send Alert on New User Registration
  async sendNewUserNotification(user) {
    const message = 
`🆕 <b>New User Registered!</b>

👤 <b>Name:</b> ${this.escapeHtml(user.name)}
🆔 <b>Username:</b> <code>${this.escapeHtml(user.username)}</code>
📧 <b>Email:</b> ${this.escapeHtml(user.email)}
📱 <b>Phone:</b> ${this.escapeHtml(user.phone || 'N/A')}
📅 <b>Date:</b> ${user.created_at || new Date().toLocaleString()}`;

    return await this.sendMessage(null, message);
  }

  // Send Alert on Deposit Request with Inline Approve/Reject Buttons
  async sendDepositNotification(deposit) {
    const message = 
`💰 <b>NEW DEPOSIT REQUEST!</b>

🆔 <b>Deposit ID:</b> <code>${deposit.id}</code>
👤 <b>Username:</b> <code>${this.escapeHtml(deposit.username)}</code>
💳 <b>Method:</b> <b>${this.escapeHtml(deposit.method)}</b>
📱 <b>Sender No:</b> <code>${this.escapeHtml(deposit.sender_number)}</code>
🧾 <b>Trx ID:</b> <code>${this.escapeHtml(deposit.trx_id)}</code>
💵 <b>Amount (BDT):</b> ৳${deposit.amount_bdt}
💲 <b>Amount (USD):</b> $${deposit.amount_usd.toFixed(4)}
📅 <b>Date:</b> ${deposit.date}
⏳ <b>Status:</b> 🟡 Pending`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: `✅ Approve ($${deposit.amount_usd.toFixed(2)})`, callback_data: `approve_dep_${deposit.id}` },
          { text: `❌ Reject`, callback_data: `reject_dep_${deposit.id}` }
        ]
      ]
    };

    const res = await this.sendMessage(null, message, { reply_markup: keyboard });
    if (res && res.ok && res.result) {
      return res.result.message_id;
    }
    return null;
  }

  // Update Deposit Message status in Telegram UI
  async updateDepositMessageStatus(chatId, messageId, deposit, status, adminNote = '') {
    const statusEmoji = status === 'Approved' ? '✅' : '❌';
    const statusText = status === 'Approved' ? '🟢 APPROVED' : '🔴 REJECTED';

    const message = 
`💰 <b>DEPOSIT REQUEST ${statusText}</b>

🆔 <b>Deposit ID:</b> <code>${deposit.id}</code>
👤 <b>Username:</b> <code>${this.escapeHtml(deposit.username)}</code>
💳 <b>Method:</b> <b>${this.escapeHtml(deposit.method)}</b>
📱 <b>Sender No:</b> <code>${this.escapeHtml(deposit.sender_number)}</code>
🧾 <b>Trx ID:</b> <code>${this.escapeHtml(deposit.trx_id)}</code>
💵 <b>Amount (BDT):</b> ৳${deposit.amount_bdt}
💲 <b>Amount (USD):</b> $${deposit.amount_usd.toFixed(4)}
📅 <b>Date:</b> ${deposit.date}
${statusEmoji} <b>Status:</b> ${statusText} ${adminNote ? `(${adminNote})` : ''}`;

    // Remove buttons upon completion
    return await this.editMessageText(chatId, messageId, message, { reply_markup: { inline_keyboard: [] } });
  }

  getMainMenuKeyboard() {
    return {
      keyboard: [
        [{ text: '📊 System Stats' }, { text: '⏳ Pending Deposits' }],
        [{ text: '👥 Recent Users' }, { text: '💳 Provider Balance' }],
        [{ text: 'ℹ️ Help & Menu' }]
      ],
      resize_keyboard: true,
      is_persistent: true
    };
  }

  // -----------------------------------------------------------
  // LONG POLLING & COMMAND ENGINE
  // -----------------------------------------------------------

  async registerBotCommands() {
    await this.apiCall('setMyCommands', {
      commands: [
        { command: 'start', description: 'Show main Admin Menu & Keyboard' },
        { command: 'stats', description: 'View system statistics & overview' },
        { command: 'pending', description: 'View pending deposit requests' },
        { command: 'users', description: 'View recent registered users' },
        { command: 'balance', description: 'Check SMM Provider API balance' },
        { command: 'help', description: 'Bot commands help' }
      ]
    });
  }

  startPolling() {
    const config = getTelegramConfig();
    if (!config.bot_token) {
      console.log('⚠️  Telegram Bot Token missing. Add TELEGRAM_BOT_TOKEN in .env or Telegram Admin Config.');
      return;
    }

    if (this.polling) return;
    this.polling = true;
    console.log('🤖 Telegram Bot Service started long polling updates...');
    this.registerBotCommands().catch(() => {});
    this.pollLoop();
  }

  stopPolling() {
    this.polling = false;
  }

  restartPolling() {
    this.stopPolling();
    setTimeout(() => {
      this.startPolling();
    }, 1000);
  }

  async pollLoop() {
    let conflictWarned = false;

    while (this.polling) {
      try {
        const config = getTelegramConfig();
        if (!config.bot_token) {
          this.polling = false;
          break;
        }

        const data = await this.apiCall('getUpdates', {
          offset: this.updateOffset,
          timeout: 10
        });

        if (data && data.ok && Array.isArray(data.result)) {
          conflictWarned = false;
          for (const update of data.result) {
            this.updateOffset = update.update_id + 1;
            await this.handleUpdate(update);
          }
        } else if (data && !data.ok && data.error_code === 409) {
          if (!conflictWarned) {
            console.log('⚠️ Telegram Bot Notice: Another bot instance is active (e.g. Render Cloud or another window). Local bot waiting 15s before auto-reconnect retry...');
            conflictWarned = true;
          }
          await new Promise(resolve => setTimeout(resolve, 15000));
          continue;
        }
      } catch (err) {
        console.error('Telegram Poll Loop Error:', err.message);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      // Small delay between polls
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async handleUpdate(update) {
    // 1. Handle Inline Keyboard Callbacks (Approve / Reject buttons)
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    // 2. Handle Direct Messages / Commands
    if (update.message && update.message.text) {
      await this.handleMessage(update.message);
    }
  }

  // Process Approve / Reject Button Clicks from Telegram
  async handleCallbackQuery(cb) {
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    if (data.startsWith('approve_dep_')) {
      const depositId = data.replace('approve_dep_', '');
      if (this.onApproveDepositHandler) {
        const result = await this.onApproveDepositHandler(depositId);
        if (result.success) {
          await this.answerCallbackQuery(cb.id, `✅ Approved Deposit ${depositId}! Balance credited to user.`, true);
          await this.updateDepositMessageStatus(chatId, messageId, result.deposit, 'Approved', 'Via Telegram Bot');
        } else {
          await this.answerCallbackQuery(cb.id, `⚠️ Error: ${result.error}`, true);
        }
      }
    } else if (data.startsWith('reject_dep_')) {
      const depositId = data.replace('reject_dep_', '');
      if (this.onRejectDepositHandler) {
        const result = await this.onRejectDepositHandler(depositId);
        if (result.success) {
          await this.answerCallbackQuery(cb.id, `❌ Rejected Deposit ${depositId}.`, true);
          await this.updateDepositMessageStatus(chatId, messageId, result.deposit, 'Rejected', 'Via Telegram Bot');
        } else {
          await this.answerCallbackQuery(cb.id, `⚠️ Error: ${result.error}`, true);
        }
      }
    }
  }

  // Process Admin Commands & Bottom Menu Button Clicks
  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // Automatically register Chat ID if Admin sends /start or any first command
    const config = getTelegramConfig();
    if (!config.admin_chat_id) {
      config.admin_chat_id = String(chatId);
      saveTelegramConfig(config);
      await this.sendMessage(chatId, `🎉 <b>Admin Chat ID set successfully!</b>\nYour Chat ID is: <code>${chatId}</code>\nYou will now receive all user & deposit notifications here.`, { reply_markup: this.getMainMenuKeyboard() });
    }

    const isStart = text.startsWith('/start');
    const isStats = text === '/stats' || text.includes('System Stats');
    const isPending = text === '/pending' || text.includes('Pending Deposits');
    const isUsers = text === '/users' || text.includes('Recent Users');
    const isBalance = text === '/balance' || text.includes('Provider Balance');
    const isHelp = text === '/help' || text.includes('Help & Menu');

    if (isStart) {
      const welcome = 
`🤖 <b>Welcome to DarkBooster SMM Admin Panel Bot!</b>

You are connected as <b>Super Admin</b>. 

<b>Notifications Enabled:</b>
1. 👤 <b>New User Registration:</b> Live alert when a user creates an account.
2. 💰 <b>Deposit Requests:</b> Live alert with instant <b>[ ✅ Approve ]</b> & <b>[ ❌ Reject ]</b> buttons.

Use the bottom menu buttons below to navigate and manage your panel easily:`;
      await this.sendMessage(chatId, welcome, { reply_markup: this.getMainMenuKeyboard() });

    } else if (isStats) {
      if (this.getStatsHandler) {
        const stats = await this.getStatsHandler();
        const msg = 
`📊 <b>DARKBOOSTER SYSTEM STATISTICS</b>

👥 <b>Total Active Users:</b> ${stats.totalUsers}
💰 <b>Total Deposits:</b> ${stats.totalDeposits} (${stats.pendingDeposits} Pending)
💵 <b>Total Approved Balance:</b> $${stats.totalDepositedUsd.toFixed(2)} (৳${stats.totalDepositedBdt.toFixed(2)})
📦 <b>Total Orders Placed:</b> ${stats.totalOrders}
💸 <b>Provider Balance:</b> $${stats.providerBalance !== null ? stats.providerBalance.toFixed(4) : 'N/A'}`;
        await this.sendMessage(chatId, msg, { reply_markup: this.getMainMenuKeyboard() });
      }

    } else if (isPending) {
      if (this.getPendingDepositsHandler) {
        const pending = await this.getPendingDepositsHandler();
        if (pending.length === 0) {
          await this.sendMessage(chatId, '✅ <b>No pending deposit requests!</b> All caught up.', { reply_markup: this.getMainMenuKeyboard() });
        } else {
          await this.sendMessage(chatId, `⏳ <b>Found ${pending.length} pending deposit request(s):</b>`, { reply_markup: this.getMainMenuKeyboard() });
          for (const dep of pending) {
            await this.sendDepositNotification(dep);
          }
        }
      }

    } else if (isUsers) {
      if (this.getUsersHandler) {
        const users = await this.getUsersHandler();
        let msg = `👥 <b>RECENT REGISTERED USERS (${users.length}):</b>\n\n`;
        users.slice(0, 10).forEach((u, i) => {
          msg += `${i+1}. <b>${this.escapeHtml(u.name)}</b> (@${this.escapeHtml(u.username)})\n   📧 ${this.escapeHtml(u.email)} | 💵 Bal: $${u.balance.toFixed(2)}\n`;
        });
        await this.sendMessage(chatId, msg, { reply_markup: this.getMainMenuKeyboard() });
      }

    } else if (isBalance) {
      if (this.getBalanceHandler) {
        const bal = await this.getBalanceHandler();
        if (bal && bal.balance) {
          await this.sendMessage(chatId, `💳 <b>SMM Provider API Balance:</b> $${parseFloat(bal.balance).toFixed(4)} USD`, { reply_markup: this.getMainMenuKeyboard() });
        } else {
          await this.sendMessage(chatId, `⚠️ Could not fetch provider balance: ${bal ? bal.error : 'Unknown error'}`, { reply_markup: this.getMainMenuKeyboard() });
        }
      }

    } else if (isHelp) {
      const help = 
`ℹ️ <b>Admin Bot Menu & Commands:</b>

📊 <b>System Stats</b> (/stats) - View users, deposits, and order stats
⏳ <b>Pending Deposits</b> (/pending) - Interactive list of pending deposits with Approve/Reject buttons
👥 <b>Recent Users</b> (/users) - View registered user accounts
💳 <b>Provider Balance</b> (/balance) - Check live SMM provider main balance`;
      await this.sendMessage(chatId, help, { reply_markup: this.getMainMenuKeyboard() });
    } else {
      // Default fallback showing keyboard menu
      await this.sendMessage(chatId, `👇 Select an option from the menu buttons below:`, { reply_markup: this.getMainMenuKeyboard() });
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

const telegramBot = new TelegramBotService();
module.exports = telegramBot;

