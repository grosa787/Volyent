/**
 * Volyent — Google Apps Script for the spreadsheet.
 * 
 * Copy this code into your Google Sheet's Apps Script editor.
 * Deploy as Web App (Execute as: Me, Access: Anyone).
 *
 * Sheet structure:
 * Row 1: Headers
 * Column A: Telegram ID
 * Column B: Username (@handle)
 * Column C: Display Name
 * Column D: Total Keys
 * Column E: Subscription Until
 * Column F: Allowed (1/0)
 * Column G: Last Purchase Date
 * Column H onwards: Keys (one key per column)
 */

const SHEET_NAME = 'Users';

// ─── Web App entry points ───────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action;
  
  switch (action) {
    case 'getUser':
      return jsonResponse(getUser(e.parameter.telegram_id));
    case 'getUserKeys':
      return jsonResponse(getUserKeys(e.parameter.telegram_id));
    case 'getAllUsers':
      return jsonResponse(getAllUsers());
    default:
      return jsonResponse({ error: 'Unknown action', actions: ['getUser', 'getUserKeys', 'getAllUsers'] });
  }
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  
  switch (action) {
    case 'upsertUser':
      return jsonResponse(upsertUser(data));
    case 'addKey':
      return jsonResponse(addKey(data));
    case 'grantSubscription':
      return jsonResponse(grantSubscription(data));
    case 'recordPayment':
      return jsonResponse(recordPayment(data));
    default:
      return jsonResponse({ error: 'Unknown action' });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Add headers
    sheet.getRange(1, 1, 1, 8).setValues([[
      'Telegram ID', 'Username', 'Display Name', 'Total Keys',
      'Subscription Until', 'Allowed', 'Last Purchase Date', 'Keys →'
    ]]);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findUserRow(telegramId) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(telegramId)) {
      return i + 1; // 1-indexed row
    }
  }
  return null;
}

// ─── User operations ────────────────────────────────────────────────────

function getUser(telegramId) {
  const sheet = getSheet();
  const row = findUserRow(telegramId);
  if (!row) return { found: false };
  
  const values = sheet.getRange(row, 1, 1, 7).getValues()[0];
  return {
    found: true,
    telegram_id: String(values[0]),
    username: values[1] || '',
    display_name: values[2] || '',
    total_keys: values[3] || 0,
    subscription_until: values[4] || '',
    allowed: values[5] ? 1 : 0,
    last_purchase_date: values[6] || '',
  };
}

function getUserKeys(telegramId) {
  const sheet = getSheet();
  const row = findUserRow(telegramId);
  if (!row) return { found: false, keys: [] };
  
  const lastCol = sheet.getLastColumn();
  if (lastCol < 8) return { found: true, keys: [] };
  
  const values = sheet.getRange(row, 8, 1, lastCol - 7).getValues()[0];
  const keys = values.filter(v => v !== '' && v !== null && v !== undefined);
  
  return { found: true, keys: keys };
}

function getAllUsers() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const users = [];
  
  for (let i = 1; i < data.length; i++) {
    users.push({
      telegram_id: String(data[i][0]),
      username: data[i][1] || '',
      display_name: data[i][2] || '',
      total_keys: data[i][3] || 0,
      subscription_until: data[i][4] || '',
      allowed: data[i][5] ? 1 : 0,
    });
  }
  
  return { users };
}

function upsertUser(data) {
  const sheet = getSheet();
  const row = findUserRow(data.telegram_id);
  
  if (row) {
    // Update existing
    sheet.getRange(row, 2).setValue(data.username || '');
    sheet.getRange(row, 3).setValue(data.display_name || '');
    return { status: 'updated', row: row };
  }
  
  // Insert new user
  const newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1).setValue(String(data.telegram_id));
  sheet.getRange(newRow, 2).setValue(data.username || '');
  sheet.getRange(newRow, 3).setValue(data.display_name || '');
  sheet.getRange(newRow, 4).setValue(0); // total keys
  sheet.getRange(newRow, 5).setValue(''); // subscription until
  sheet.getRange(newRow, 6).setValue(0); // allowed
  sheet.getRange(newRow, 7).setValue(''); // last purchase
  
  return { status: 'created', row: newRow };
}

// ─── Key operations ─────────────────────────────────────────────────────

function addKey(data) {
  const sheet = getSheet();
  let row = findUserRow(data.telegram_id);
  
  if (!row) {
    // Create user first
    upsertUser(data);
    row = findUserRow(data.telegram_id);
  }
  
  // Find next empty key column (starting from column 8)
  const lastCol = Math.max(sheet.getLastColumn(), 7);
  const existingKeys = lastCol >= 8 
    ? sheet.getRange(row, 8, 1, lastCol - 7).getValues()[0].filter(v => v !== '' && v !== null)
    : [];
  
  const nextKeyCol = 8 + existingKeys.length;
  sheet.getRange(row, nextKeyCol).setValue(data.key);
  
  // Update total keys count
  sheet.getRange(row, 4).setValue(existingKeys.length + 1);
  
  // Update last purchase date
  sheet.getRange(row, 7).setValue(new Date().toISOString().split('T')[0]);
  
  return { status: 'key_added', total_keys: existingKeys.length + 1 };
}

// ─── Subscription operations ────────────────────────────────────────────

function grantSubscription(data) {
  const sheet = getSheet();
  let row = findUserRow(data.telegram_id);
  
  if (!row) {
    upsertUser(data);
    row = findUserRow(data.telegram_id);
  }
  
  // Calculate new subscription end date
  const currentUntil = sheet.getRange(row, 5).getValue();
  let baseDate = new Date();
  if (currentUntil) {
    const existing = new Date(currentUntil);
    if (existing > baseDate) {
      baseDate = existing;
    }
  }
  baseDate.setDate(baseDate.getDate() + (data.days || 30));
  const newUntil = baseDate.toISOString().split('T')[0];
  
  sheet.getRange(row, 5).setValue(newUntil); // subscription until
  sheet.getRange(row, 6).setValue(1);         // allowed = 1
  sheet.getRange(row, 7).setValue(new Date().toISOString().split('T')[0]); // last purchase
  
  return { status: 'granted', subscription_until: newUntil };
}

function recordPayment(data) {
  // Record payment and grant subscription in one call
  const result = grantSubscription(data);
  
  // If a key was provided, add it too
  if (data.key) {
    addKey(data);
  }
  
  return { status: 'payment_recorded', ...result };
}
