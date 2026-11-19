export type Status = 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' | 'PENDING' | 'REVERSED' | 'UNKNOWN';
export type SmsInput = { id: string; sender: string; body: string; timestamp: number };
export type Transaction = { id: string; amount: number; transaction_type: 'DEBIT' | 'CREDIT'; transaction_status: Status; bank_name: string; account_number: string; merchant_name: string; upi_reference: string; transaction_date: string; category: string; sender_id: string; created_at: string; updated_at: string };
export function parseSms(sms: SmsInput): Transaction | null {
  const text = sms.body;
  if (/\b(otp|one[ -]time password|verification code|offer|cashback offer|pre-approved)\b/i.test(text)) return null;
  if (!/\b(debited|credited|paid|received|withdrawn|withdrawal|refund|refunded|reversed|reversal|failed|declined|pending|processing|completed|successful|successfully)\b/i.test(text)) return null;
  if (!/\b(upi|account|a\/c|acct|bank|neft|imps|atm|txn|transaction)\b/i.test(text)) return null;
  const match = text.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const status: Status = /\b(reversed|reversal|refunded)\b/i.test(text) ? 'REVERSED' : /\b(failed|declined|unsuccessful)\b/i.test(text) ? 'FAILED' : /\bpending\b/i.test(text) ? 'PENDING' : /\bprocessing\b/i.test(text) ? 'PROCESSING' : /\b(successful|successfully|completed)\b/i.test(text) ? 'SUCCESSFUL' : 'UNKNOWN';
  const bank = ['HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK', 'PNB', 'BOB', 'IDFC'].find(name => (sms.sender + ' ' + text).toUpperCase().includes(name)) || 'Unknown bank';
  const account = text.match(/(?:a\/c|acct|account)(?:\s*(?:no\.?|number))?\s*[:.-]?\s*([xX*\d]*\d{4})/i)?.[1];
  const reference = text.match(/(?:UPI\s*(?:ref(?:erence)?(?:\s*no\.?)?|txn(?:\s*id)?)|(?:ref(?:erence)?|rrn)(?:\s*(?:no\.?|id))?)\s*[:#.-]?\s*(\d{6,22})/i)?.[1] || '';
  const merchant = text.match(/\b(?:to|from|at)\s+([a-z][a-z\d .@_-]{1,60}?)(?=\s+(?:on|via|ref|upi|a\/c|account)|[;,]|$)/i)?.[1]?.trim() || '';
  const date = new Date(sms.timestamp).toISOString();
  return { id: sms.id, amount, transaction_type: /\b(credited|received|refund|refunded|reversed|reversal)\b/i.test(text) ? 'CREDIT' : 'DEBIT', transaction_status: status, bank_name: bank, account_number: account ? '••••' + account.slice(-4) : '', merchant_name: merchant, upi_reference: reference, transaction_date: date, category: /\batm|withdraw/i.test(text) ? 'Cash' : 'Uncategorized', sender_id: sms.sender, created_at: date, updated_at: date };
}
export const statusLabel = (status: Status) => status === 'UNKNOWN' ? 'Recorded · settlement unknown' : status.charAt(0) + status.slice(1).toLowerCase();
