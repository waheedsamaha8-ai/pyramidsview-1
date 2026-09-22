/**
 * Utility functions for Egyptian and International mobile phone numbers normalization and formatting.
 * Supports:
 * - International numbers (e.g. Saudi Arabia +966539313467, UAE +971..., Kuwait +965..., etc.)
 * - Egyptian mobile numbers with standard leading zero: 01007911777 (not 1007911777).
 * - BiDi display safety for RTL rendering.
 */

// Common international country calling codes (Middle East, Arab world, and major international)
const INTERNATIONAL_COUNTRY_CODES = [
  '966', // Saudi Arabia
  '971', // UAE
  '965', // Kuwait
  '968', // Oman
  '974', // Qatar
  '973', // Bahrain
  '962', // Jordan
  '964', // Iraq
  '963', // Syria
  '961', // Lebanon
  '970', // Palestine
  '972', // Palestine / Israel
  '218', // Libya
  '249', // Sudan
  '216', // Tunisia
  '213', // Algeria
  '212', // Morocco
  '967', // Yemen
  '90',  // Turkey
  '44',  // UK
  '49',  // Germany
  '33',  // France
  '39',  // Italy
  '1',   // USA / Canada
];

/**
 * Formats a phone number cleanly.
 * - If international (e.g. +966539313467, 00966539313467, 966539313467), formats as: "+966539313467"
 * - If Egyptian (+2010..., 002010..., 1007911777), formats as: "01007911777"
 * - Cleans Arabic-Indic numerals, spaces, hyphens, and Excel/Sheets escape apostrophes.
 */
export function formatMobileNumber(phone: string | number | null | undefined): string {
  if (phone === null || phone === undefined) return '';
  let str = String(phone).trim();
  if (!str) return '';

  // Remove leading Excel/Sheets text apostrophe if present: ' +966... or '+966...
  str = str.replace(/^['"]+/, '').trim();

  // Handle scientific notation e.g. "9.66539E+11" or "9.66539313467e+11" from Excel/Sheets
  if (/[eE][+-]?\d+/.test(str)) {
    const num = Number(str.replace(/,/g, ''));
    if (!isNaN(num) && isFinite(num)) {
      str = BigInt(Math.round(num)).toString();
    }
  }

  // Remove trailing decimal zeroes like "966539313467.0" from Excel float parsing
  if (/\.\d+$/.test(str)) {
    str = str.replace(/\.0+$/, '').replace(/\.\d+$/, '');
  }

  // 1. Convert Arabic-Indic (٠-٩) and Persian (۰-۹) numerals to Western digits (0-9)
  str = str
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());

  // 2. Check if original string explicitly starts with '+' or '00'
  const trimmed = str.replace(/[\s\-()]/g, '');
  const hasPlus = trimmed.startsWith('+');
  const hasDoubleZero = trimmed.startsWith('00');

  // Extract all digits
  const allDigits = trimmed.replace(/\D/g, '');
  if (!allDigits) return '';

  // 3. Handle Egyptian numbers with international prefix: +20, 0020, or 20 followed by 1
  if (trimmed.startsWith('+201') || trimmed.startsWith('00201')) {
    const local = allDigits.substring(allDigits.startsWith('00201') ? 4 : 2);
    return '0' + local;
  }
  if (allDigits.startsWith('201') && allDigits.length === 12) {
    return '0' + allDigits.substring(2);
  }

  // 4. Handle International numbers:
  // If explicitly started with '+' (and not Egyptian +20):
  if (hasPlus) {
    return '+' + allDigits;
  }

  // If started with '00' (international call prefix) and not Egyptian 0020:
  if (hasDoubleZero && allDigits.length > 4) {
    return '+' + allDigits.substring(2);
  }

  // 5. Check if it's an Egyptian local mobile number:
  // Egyptian mobile numbers are 11 digits starting with 010, 011, 012, 015
  if (allDigits.startsWith('01') && allDigits.length === 11) {
    return allDigits;
  }

  // Egyptian 10-digit number missing leading zero (e.g. 1007911777):
  if (allDigits.length === 10 && allDigits.startsWith('1')) {
    return '0' + allDigits;
  }

  // Saudi local mobile number (10 digits starting with 05, e.g. 0539313467):
  // Convert directly to international format: +966539313467
  if (allDigits.startsWith('05') && allDigits.length === 10) {
    return '+966' + allDigits.substring(1);
  }

  // Kuwait local mobile numbers (8 digits starting with 5, 6, or 9)
  if ((allDigits.startsWith('5') || allDigits.startsWith('6') || allDigits.startsWith('9')) && allDigits.length === 8) {
    return '+965' + allDigits;
  }

  // 6. Check if it starts with an international country code without '+'
  // E.g., user entered or imported "966539313467" (12 digits, starts with 966)
  for (const code of INTERNATIONAL_COUNTRY_CODES) {
    if (allDigits.startsWith(code) && allDigits.length >= code.length + 7) {
      return '+' + allDigits;
    }
  }

  // If number is 11-15 digits and does NOT start with 0, treat as international:
  if (allDigits.length >= 11 && !allDigits.startsWith('0')) {
    return '+' + allDigits;
  }

  return allDigits;
}

/**
 * Sanitizes and normalizes phone input while typing or pasting into text fields.
 * - Allows typing '+' at the start for international numbers.
 * - Converts '00' international prefix into '+'.
 * - Converts Arabic-Indic numerals in real-time.
 * - Auto-prepends '0' for 10-digit Egyptian numbers missing leading zero.
 */
export function normalizePhoneInput(input: string): string {
  if (!input) return '';

  // 1. Convert Arabic-Indic & Persian digits
  let str = input
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());

  // Remove leading Excel/Sheets text apostrophe
  str = str.replace(/^['"]+/, '').trim();

  // If user pasted/typed '00' at start (e.g. 00966...), convert to '+'
  if (str.startsWith('00')) {
    const rawDigits = str.replace(/\D/g, '');
    if (rawDigits.startsWith('00201') && rawDigits.length >= 14) {
      return '0' + rawDigits.substring(4);
    } else if (!rawDigits.startsWith('0020')) {
      str = '+' + str.substring(2);
    }
  }

  const startsWithPlus = str.startsWith('+');
  const digits = str.replace(/\D/g, '');

  // If starts with +201... (Egypt with +20) and complete:
  if (startsWithPlus && digits.startsWith('201') && digits.length >= 12) {
    return '0' + digits.substring(2);
  }

  // If starts with +, keep + followed by digits
  if (startsWithPlus) {
    return '+' + digits;
  }

  // If user typed 10 digits starting with 1 (e.g. 1007911777), prepend '0'
  if (digits.length === 10 && digits.startsWith('1')) {
    return '0' + digits;
  }

  return digits;
}

/**
 * Returns phone number formatted for WhatsApp API (e.g. "966539313467" or "201007911777").
 * WhatsApp API requires country code + local digits with NO leading '+' and NO '00'.
 */
export function toWhatsAppNumber(phone: string | number | null | undefined): string {
  if (!phone) return '';
  const formatted = formatMobileNumber(phone);
  if (!formatted) return '';

  let digits = formatted.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.substring(2);
  }

  // Egyptian mobile numbers (010, 011, 012, 015) -> prepend 2 (Egypt country code: 20)
  if (digits.startsWith('01') && digits.length === 11) {
    return '2' + digits; // 0100... -> 20100...
  }

  // Egyptian 10 digits starting with 1 -> 20 + digits
  if (digits.startsWith('1') && digits.length === 10) {
    return '20' + digits;
  }

  // If Egyptian with 201... (12 digits)
  if (digits.startsWith('201') && digits.length === 12) {
    return digits;
  }

  // For all international numbers (e.g. 966539313467, 9715..., etc.)
  return digits;
}

/**
 * Formats a phone number for inclusion in RTL text messages (e.g. WhatsApp / Reports).
 * Adds a Left-to-Right Mark (\u200E) before '+' so RTL engines don't flip the '+' to the right.
 */
export function formatPhoneForText(phone: string | number | null | undefined): string {
  const formatted = formatMobileNumber(phone);
  if (!formatted) return '';
  if (formatted.startsWith('+')) {
    return '\u200E' + formatted;
  }
  return formatted;
}

/**
 * Formats a phone number for visual display in RTL Arabic user interfaces.
 * Wraps the formatted number with Left-to-Right Embedding (\u202A) and Pop Directional Formatting (\u202C)
 * so that '+' always visually stays on the extreme left in both mobile and desktop browsers,
 * regardless of parent RTL context or font rendering quirks.
 */
export function formatPhoneForDisplay(phone: string | number | null | undefined): string {
  const formatted = formatMobileNumber(phone);
  if (!formatted) return '';
  if (formatted.startsWith('+')) {
    return '\u202A' + formatted + '\u202C';
  }
  return formatted;
}

