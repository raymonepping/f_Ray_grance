// GTIN handling (spec/DATA_MODEL.md §3). A valid check digit proves only that the
// digits are well-formed — never which fragrance it is (catalog confirmation is separate).

export type GtinResult =
  | { ok: true; gtin14: string; raw: string }
  | { ok: false; reason: 'NON_NUMERIC' | 'BAD_LENGTH' | 'BAD_CHECK_DIGIT'; raw: string };

const LENGTHS = new Set([8, 12, 13, 14]);

export function checkDigitValid(digits: string): boolean {
  const body = digits.slice(0, -1);
  let sum = 0;
  // Weights 3,1,3,... from the rightmost body digit.
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === digits.charCodeAt(digits.length - 1) - 48;
}

/** Normalize EAN-8 / UPC-A / EAN-13 / GTIN-14 to a 14-character GTIN, preserving leading zeros. */
export function normalizeGtin(input: string): GtinResult {
  const raw = input;
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return { ok: false, reason: 'NON_NUMERIC', raw };
  if (!LENGTHS.has(digits.length)) return { ok: false, reason: 'BAD_LENGTH', raw };
  if (!checkDigitValid(digits)) return { ok: false, reason: 'BAD_CHECK_DIGIT', raw };
  return { ok: true, gtin14: digits.padStart(14, '0'), raw };
}
