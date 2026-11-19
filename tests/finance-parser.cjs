const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const compiled = ts.transpileModule(fs.readFileSync('src/finance/parser.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleUnderTest = new Module('finance-parser');
moduleUnderTest._compile(compiled, 'finance-parser.js');
const { parseSms } = moduleUnderTest.exports;
const parse = body => parseSms({ id: 'synthetic', sender: 'AD-HDFCBK', body, timestamp: Date.UTC(2026, 10, 17) });
const fixtures = [
  ['HDFC Bank: Rs. 1,250.00 debited from a/c XX1234 to TEST SHOP via UPI ref 123456789012', 'DEBIT', 'UNKNOWN', 1250],
  ['ICICI Bank: INR 800 credited to account XX4321 from TEST PERSON via IMPS ref 223456789012', 'CREDIT', 'UNKNOWN', 800],
  ['SBI UPI payment Rs 90 failed. Ref 323456789012', 'DEBIT', 'FAILED', 90],
  ['AXIS Bank: INR 90 refunded to account XX1234 UPI ref 323456789012', 'CREDIT', 'REVERSED', 90],
  ['HDFC UPI transaction Rs 25 reversed ref 423456789012', 'CREDIT', 'REVERSED', 25],
  ['Kotak UPI transaction INR 33 pending ref 523456789012', 'DEBIT', 'PENDING', 33],
  ['PNB UPI transaction INR 44 processing ref 623456789012', 'DEBIT', 'PROCESSING', 44],
  ['HDFC UPI payment Rs 55 completed successfully ref 723456789012', 'DEBIT', 'SUCCESSFUL', 55],
  ['SBI ATM withdrawal INR 600 from account XX2345', 'DEBIT', 'UNKNOWN', 600],
  ['HDFC NEFT INR 2000 credited to account XX1234', 'CREDIT', 'UNKNOWN', 2000],
];
for (const [body, direction, status, amount] of fixtures) {
  const result = parse(body);
  assert.ok(result, body);
  assert.equal(result.transaction_type, direction);
  assert.equal(result.transaction_status, status);
  assert.equal(result.amount, amount);
  assert.ok(!JSON.stringify(result).includes(body));
}
for (const body of ['OTP 123456 for UPI payment Rs 200 debited', 'Your bank balance is INR 1000', 'Offer: UPI paid INR 50 cashback', 'hello INR 55', 'UPI transaction pending', 'Bank paid INR 0', 'Bank transaction Rs NaN debited']) assert.equal(parse(body), null, body);
assert.deepEqual(parse(fixtures[0][0]), parse(fixtures[0][0]));
assert.equal(parse(fixtures[0][0]).account_number, '••••1234');
assert.equal(parse(fixtures[0][0]).upi_reference, '123456789012');
console.log('Finance parser: 10 financial formats and 7 rejection cases passed.');
