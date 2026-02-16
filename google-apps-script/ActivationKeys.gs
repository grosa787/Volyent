/**
 * Volyent — Activation Keys Google Apps Script.
 * 
 * Sheet structure:
 *   Row 1: Header (optional, auto-skipped)
 *   Column A: VLESS URIs (vless:// or https://)
 *   Column B: Claimed users (comma-separated telegram_ids, max 5 per key)
 *   Column C: Usernames (comma-separated)
 *   Column D: Claim dates (comma-separated)
 *
 * Each key can be shared by up to MAX_USERS_PER_KEY users.
 * When a key reaches the limit, the next available key is assigned.
 *
 * GET requests:
 *   ?action=getKeys                    — returns ALL available keys (unclaimed or not full)
 *   ?action=getMyKeys&telegram_id=123  — returns keys claimed by this user
 *   ?action=claimKey&telegram_id=123&username=john — claims a key (existing or new)
 *
 * Deploy as Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Supported key formats: vless:// and https://
 */

var MAX_USERS_PER_KEY = 5;

function doGet(e) {
  var action = (e.parameter.action || 'getKeys');
  
  switch (action) {
    case 'getKeys':
      return jsonResponse(getAllAvailableKeys());
    case 'getMyKeys':
      return jsonResponse(getMyKeys(e.parameter.telegram_id));
    case 'claimKey':
      return jsonResponse(claimKey(e.parameter.telegram_id, e.parameter.username));
    default:
      return jsonResponse({ error: 'Unknown action', keys: [] });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || '';
    
    switch (action) {
      case 'claimKey':
        return jsonResponse(claimKey(data.telegram_id, data.username));
      default:
        return jsonResponse({ error: 'Unknown action' });
    }
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ─── Parse comma-separated field into array ─────────────────────────────

function parseList(val) {
  var s = String(val || '').trim();
  if (!s || s === 'undefined') return [];
  return s.split(',').map(function(x) { return x.trim(); }).filter(function(x) { return x.length > 0; });
}

// ─── Get all available keys (not full) ──────────────────────────────────

function getAllAvailableKeys() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  
  if (lastRow < 1) return { keys: [] };
  
  var data = sheet.getRange(1, 1, lastRow, 2).getValues();
  var keys = [];
  
  for (var i = 0; i < data.length; i++) {
    var keyUri = String(data[i][0]).trim();
    var claimedIds = parseList(data[i][1]);
    
    // Return keys that still have room (less than MAX_USERS_PER_KEY users)
    if (isValidKey(keyUri) && claimedIds.length < MAX_USERS_PER_KEY) {
      keys.push(keyUri);
    }
  }
  
  return { keys: keys };
}

// ─── Get keys claimed by a specific user ────────────────────────────────

function getMyKeys(telegramId) {
  if (!telegramId) return { error: 'telegram_id required', keys: [] };
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  
  if (lastRow < 1) return { keys: [] };
  
  var data = sheet.getRange(1, 1, lastRow, 2).getValues();
  var keys = [];
  var tgStr = String(telegramId);
  
  for (var i = 0; i < data.length; i++) {
    var keyUri = String(data[i][0]).trim();
    var claimedIds = parseList(data[i][1]);
    
    if (isValidKey(keyUri) && claimedIds.indexOf(tgStr) !== -1) {
      keys.push(keyUri);
    }
  }
  
  return { keys: keys, telegram_id: tgStr };
}

// ─── Claim a NEW key (shared, max 5 users per key) ──────────────────────
// Always assigns a new key the user doesn't already have.
// Each key can be shared by up to MAX_USERS_PER_KEY users.

function claimKey(telegramId, username) {
  if (!telegramId) return { error: 'telegram_id required' };
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  
  if (lastRow < 1) return { error: 'No keys available' };
  
  var data = sheet.getRange(1, 1, lastRow, 4).getValues();
  var tgStr = String(telegramId);
  
  // Find first available key that:
  // 1. Has room (< MAX_USERS_PER_KEY)
  // 2. User does NOT already have
  for (var j = 0; j < data.length; j++) {
    var keyUri = String(data[j][0]).trim();
    var ids = parseList(data[j][1]);
    var usernames = parseList(data[j][2]);
    var dates = parseList(data[j][3]);
    
    // Skip if not a valid key
    if (!isValidKey(keyUri)) continue;
    // Skip if key is full
    if (ids.length >= MAX_USERS_PER_KEY) continue;
    // Skip if user already has this specific key
    if (ids.indexOf(tgStr) !== -1) continue;
    
    var row = j + 1;
    var now = new Date().toISOString().split('T')[0];
    
    // Append this user to the lists
    ids.push(tgStr);
    usernames.push(username || 'Unknown');
    dates.push(now);
    
    // Write updated comma-separated values
    sheet.getRange(row, 2).setValue(ids.join(', '));
    sheet.getRange(row, 3).setValue(usernames.join(', '));
    sheet.getRange(row, 4).setValue(dates.join(', '));
    
    return { 
      status: 'claimed', 
      key: keyUri,
      username: username || 'Unknown',
      date: now,
      users: ids.length,
      maxUsers: MAX_USERS_PER_KEY
    };
  }
  
  return { error: 'No available keys (all keys at max capacity or already assigned)', status: 'no_keys' };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function isValidKey(uri) {
  return uri.indexOf('vless://') === 0 || uri.indexOf('https://') === 0;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
