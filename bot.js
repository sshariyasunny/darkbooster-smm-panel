const fs = require('fs');
const path = require('path');
require('dotenv').config();
const db = require('./db');
const telegramBot = require('./telegramBot');

const { getUsers, saveUsers, getDeposits, saveDeposits, getOrders, saveOrders, defaultAdmin } = db;

const API_URL = process.env.SMM_API_URL || 'https://bestfollows.com/api/v2';
const API_KEY = process.env.SMM_API_KEY || '5c5315c5a80c0758b866af2b5f6c40af';


// SMM Provider API Connector
async function callSmmApi(payload) {
  try {
    const params = new URLSearchParams({ key: API_KEY, ...payload });
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    if (!response.ok) {
      return { error: `Provider API HTTP error status: ${response.status}` };
    }
    return await response.json();
  } catch (err) {
    console.error('callSmmApi error:', err.message);
    return { error: 'Failed to connect to SMM API provider' };
  }
}

// Sync Admin user balance with live SMM Provider balance
async function syncAdminLiveBalance() {
  try {
    const data = await callSmmApi({ action: 'balance' });
    if (data && data.balance) {
      const liveBal = parseFloat(data.balance);
      const users = getUsers();
      const adminIndex = users.findIndex(u => u.role === 'admin' || u.username === 'admin');
      if (adminIndex !== -1) {
        users[adminIndex].balance = liveBal;
        saveUsers(users);
      }
      return liveBal;
    }
  } catch (err) {
    console.error('Sync admin live balance error:', err.message);
  }
  return null;
}

// Deposit Approval & Rejection Helpers
function approveDeposit(depositId) {
  const deposits = getDeposits();
  const depIndex = deposits.findIndex(d => d.id === depositId);

  if (depIndex === -1) {
    return { success: false, error: 'Deposit request not found' };
  }

  const deposit = deposits[depIndex];
  if (deposit.status === 'Approved') {
    return { success: false, error: 'Deposit request is already approved' };
  }

  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === deposit.user_id);
  if (userIndex !== -1) {
    users[userIndex].balance += deposit.amount_usd;
    saveUsers(users);
  }

  deposits[depIndex].status = 'Approved';
  saveDeposits(deposits);

  return { success: true, deposit: deposits[depIndex] };
}

function rejectDeposit(depositId) {
  const deposits = getDeposits();
  const depIndex = deposits.findIndex(d => d.id === depositId);

  if (depIndex === -1) {
    return { success: false, error: 'Deposit request not found' };
  }

  deposits[depIndex].status = 'Rejected';
  saveDeposits(deposits);

  return { success: true, deposit: deposits[depIndex] };
}

// Bind Telegram Bot Handlers
telegramBot.setHandlers({
  onApproveDeposit: async (depositId) => {
    return approveDeposit(depositId);
  },
  onRejectDeposit: async (depositId) => {
    return rejectDeposit(depositId);
  },
  getStats: async () => {
    const users = getUsers().filter(u => !u.is_deleted);
    const deposits = getDeposits();
    const approvedDeps = deposits.filter(d => d.status === 'Approved');
    const pendingDeps = deposits.filter(d => d.status === 'Pending');
    const orders = getOrders();
    const liveBal = await syncAdminLiveBalance();

    const totalDepositedUsd = approvedDeps.reduce((sum, d) => sum + (d.amount_usd || 0), 0);
    const totalDepositedBdt = approvedDeps.reduce((sum, d) => sum + (d.amount_bdt || 0), 0);

    return {
      totalUsers: users.length,
      totalDeposits: deposits.length,
      pendingDeposits: pendingDeps.length,
      totalDepositedUsd,
      totalDepositedBdt,
      totalOrders: orders.length,
      providerBalance: liveBal
    };
  },
  getPendingDeposits: async () => {
    return getDeposits().filter(d => d.status === 'Pending');
  },
  getUsers: async () => {
    return getUsers().filter(u => !u.is_deleted).map(({ password, ...u }) => u);
  },
  getBalance: async () => {
    return await callSmmApi({ action: 'balance' });
  }
});

// Start Polling
console.log('====================================================');
console.log('  🚀 DARKBOOSTER TELEGRAM BOT - LOCAL HOSTING ACTIVE');
console.log('====================================================');
console.log('  Status : ONLINE & POLLING TELEGRAM API');
console.log('  Host   : Local Laptop');
console.log('  Time   : ' + new Date().toLocaleString());
console.log('----------------------------------------------------');
console.log('  Press Ctrl + C in this window to stop the bot.');
console.log('====================================================\n');

telegramBot.startPolling();
