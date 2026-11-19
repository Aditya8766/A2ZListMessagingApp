import * as SQLite from 'expo-sqlite';
import { parseSms, SmsInput, Transaction } from './parser';
let connection: Promise<SQLite.SQLiteDatabase> | undefined;
async function database() {
  if (!connection) connection = (async () => {
    const db = await SQLite.openDatabaseAsync('a2z-finance.db');
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version || 0) > 1) throw new Error('Finance database requires a newer app version.');
    if (version?.user_version === 1) return db;
    await db.withExclusiveTransactionAsync(async migration => {
    await migration.execAsync(`
      CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, amount REAL NOT NULL, transaction_type TEXT NOT NULL, transaction_status TEXT NOT NULL, bank_name TEXT, account_number TEXT, merchant_name TEXT, upi_reference TEXT, transaction_date TEXT, category TEXT, sender_id TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS processed_sms (id TEXT PRIMARY KEY, message_hash TEXT UNIQUE NOT NULL, sender_id TEXT, received_at TEXT, processing_status TEXT);
      CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT, icon TEXT, transaction_type TEXT);
      INSERT OR IGNORE INTO categories VALUES ('uncategorized','Uncategorized','receipt','BOTH'),('cash','Cash','cash','DEBIT'),('food','Food','restaurant','DEBIT'),('shopping','Shopping','bag','DEBIT'),('salary','Salary','wallet','CREDIT');
      PRAGMA user_version = 1;`);
    });
    await db.execAsync('PRAGMA journal_mode = WAL');
    return db;
  })().catch(error => { connection = undefined; throw error; });
  return connection;
}
export async function listTransactions() { return (await database()).getAllAsync<Transaction>('SELECT * FROM transactions ORDER BY transaction_date DESC'); }
export async function ingestSms(messages: SmsInput[]) {
  const db = await database();
  let count = 0;
  await db.withExclusiveTransactionAsync(async tx => {
    for (const sms of messages) {
      const parsed = parseSms(sms);
      if (!parsed) continue;
      // Native SHA-256 ID includes sender, body and timestamp; raw SMS is never stored here.
      if (await tx.getFirstAsync('SELECT id FROM processed_sms WHERE message_hash = ?', sms.id)) continue;
      const existing = parsed.upi_reference ? await tx.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE upi_reference = ? AND amount = ? AND (account_number = ? OR account_number = ? OR ? = ?) LIMIT 1', parsed.upi_reference, parsed.amount, parsed.account_number, '', parsed.account_number, '') : null;
      if (existing) {
        const terminal = ['SUCCESSFUL', 'FAILED', 'REVERSED'];
        if (parsed.transaction_status !== 'UNKNOWN' && (!terminal.includes(existing.transaction_status) || parsed.transaction_status === 'REVERSED')) {
          await tx.runAsync('UPDATE transactions SET transaction_status = ?, updated_at = ? WHERE id = ?', parsed.transaction_status, parsed.updated_at, existing.id);
        }
      } else {
        const keys = Object.keys(parsed) as (keyof Transaction)[];
        await tx.runAsync(`INSERT INTO transactions (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map(key => parsed[key]));
        count++;
      }
      await tx.runAsync('INSERT INTO processed_sms VALUES (?, ?, ?, ?, ?)', sms.id, sms.id, sms.sender, new Date(sms.timestamp).toISOString(), 'PROCESSED');
    }
  });
  return count;
}
export async function setCategory(id: string, category: string) { await (await database()).runAsync('UPDATE transactions SET category = ?, updated_at = ? WHERE id = ?', category, new Date().toISOString(), id); }
export async function deleteTransaction(id: string) { await (await database()).runAsync('DELETE FROM transactions WHERE id = ?', id); }
export async function clearFinance() { await (await database()).withExclusiveTransactionAsync(async tx => { await tx.runAsync('DELETE FROM transactions'); await tx.runAsync('DELETE FROM processed_sms'); }); }
