export function parseRecipients(input: string) {
  const numbers = new Set<string>();
  const invalid: string[] = [];
  for (const entry of input.split(/[,;\r\n]+/)) {
    if (!entry.trim()) continue;
    const number = entry
      .normalize('NFKC')
      .replace(/^\s*tel:/i, '')
      .replace(/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f]/g, digit => String(digit.charCodeAt(0) - (digit >= '\u0966' ? 0x0966 : digit >= '\u06f0' ? 0x06f0 : 0x0660)))
      .replace(/[\s().\-\u2010-\u2015\u200e\u200f\u202a-\u202e]/g, '');
    if (/^\+?[0-9]{7,15}$/.test(number)) numbers.add(number);
    else invalid.push(entry.trim());
  }
  return { numbers: [...numbers], invalid };
}
