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
 * - Supports and preserves international format (e.g. +966539313467, 00966539313467, +201007911777, 00201007911777).
 * - Converts Egyptian local missing zero (e.g. 1007911777) to "01007911777".
 * - Cleans Arabic-Indic numerals, spaces, hyphens, and Excel/Sheets escape apostrophes.
 * - Supports multiple phone numbers separated by comma, slash, semicolon, or newline.
 */
export function formatMobileNumber(phone: string | number | null | undefined): string {
  if (phone === null || phone === undefined) return '';
  let str = String(phone).trim();
  if (!str) return '';

  // Handle multiple phone numbers separated by comma, slash, semicolon, or newline
  const separators = /[,/;|\n]+/;
  if (separators.test(str)) {
    return str
      .split(separators)
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => formatSingleMobileNumber(part))
      .filter(Boolean)
      .join(', ');
  }

  return formatSingleMobileNumber(str);
}

function formatSingleMobileNumber(str: string): string {
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
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶٧٨٩'.indexOf(d).toString());

  // 2. Check if original string explicitly starts with '+' or '00'
  const trimmed = str.replace(/[\s\-()]/g, '');
  const hasPlus = trimmed.startsWith('+');
  const hasDoubleZero = trimmed.startsWith('00');

  // Extract all digits
  const allDigits = trimmed.replace(/\D/g, '');
  if (!allDigits) return '';

  // 3. Handle explicit country key preservation:
  if (hasPlus) {
    return '+' + allDigits;
  }
  if (hasDoubleZero) {
    return '00' + allDigits.substring(2);
  }

  // 4. Default Egyptian local formats if no country key is specified:
  if (allDigits.startsWith('01') && allDigits.length === 11) {
    return allDigits;
  }

  // Egyptian 10-digit number missing leading zero (e.g. 1007911777):
  if (allDigits.length === 10 && allDigits.startsWith('1')) {
    return '0' + allDigits;
  }

  // Saudi local mobile number (10 digits starting with 05, e.g. 0539313467):
  if (allDigits.startsWith('05') && allDigits.length === 10) {
    return '+966' + allDigits.substring(1);
  }

  // Kuwait local mobile numbers (8 digits starting with 5, 6, or 9)
  if ((allDigits.startsWith('5') || allDigits.startsWith('6') || allDigits.startsWith('9')) && allDigits.length === 8) {
    return '+965' + allDigits;
  }

  // 5. Check if it starts with an international country code without '+' or '00', e.g., "966539313467" or "201007911777"
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
 * - Allows typing '+' or '00' at the start for international numbers.
 * - Converts Arabic-Indic numerals in real-time.
 * - Auto-prepends '0' for 10-digit Egyptian numbers missing leading zero.
 * - Supports comma/slash/space separators for multiple numbers.
 */
export function normalizePhoneInput(input: string): string {
  if (!input) return '';

  // Convert Arabic-Indic & Persian digits
  let str = input
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶٧٨٩'.indexOf(d).toString());

  // Remove leading Excel/Sheets text apostrophe
  str = str.replace(/^['"]+/, '').trim();

  // Handle multiple phone numbers separated by comma, slash, semicolon, or space
  const separators = /[,/;|\n]+/;
  if (separators.test(str)) {
    return str
      .split(separators)
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => normalizeSinglePhoneInput(part))
      .filter(Boolean)
      .join(', ');
  }

  return normalizeSinglePhoneInput(str);
}

function normalizeSinglePhoneInput(str: string): string {
  const startsWithPlus = str.startsWith('+');
  const startsWithDoubleZero = str.startsWith('00');
  
  // Extract digits
  const digits = str.replace(/\D/g, '');

  if (startsWithPlus) {
    return '+' + digits;
  }
  if (startsWithDoubleZero) {
    return '00' + digits.substring(2);
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
 * Adds a Left-to-Right Mark (\u200E) before '+' or '00' so RTL engines don't flip it.
 */
export function formatPhoneForText(phone: string | number | null | undefined): string {
  const formatted = formatMobileNumber(phone);
  if (!formatted) return '';
  if (formatted.startsWith('+') || formatted.startsWith('00')) {
    return '\u200E' + formatted;
  }
  return formatted;
}

/**
 * Formats a phone number for visual display in RTL Arabic user interfaces.
 * Wraps the formatted number with Left-to-Right Embedding (\u202A) and Pop Directional Formatting (\u202C)
 * so that the number and its symbols (+ / 00) always visually stay in correct order in both mobile and desktop browsers,
 * regardless of parent RTL context or font rendering quirks.
 * Supports multiple phone numbers.
 */
export function formatPhoneForDisplay(phone: string | number | null | undefined): string {
  if (phone === null || phone === undefined) return '';
  const str = String(phone).trim();
  if (!str) return '';

  const separators = /[,/;|\n]+/;
  if (separators.test(str)) {
    return str
      .split(separators)
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => formatSinglePhoneForDisplay(part))
      .filter(Boolean)
      .join('\n');
  }

  return formatSinglePhoneForDisplay(str);
}

function formatSinglePhoneForDisplay(part: string): string {
  const formatted = formatMobileNumber(part);
  if (!formatted) return '';
  if (formatted.startsWith('+') || formatted.startsWith('00') || formatted.match(/^\d+$/)) {
    return '\u202A' + formatted + '\u202C';
  }
  return formatted;
}

export interface DeviceContactResult {
  tel?: string;
  name?: string;
  supported: boolean;
}

/**
 * Picks a contact from the device's native contacts book using the Web Contact Picker API.
 * Supported in modern mobile browsers (such as Google Chrome on Android).
 */
export async function pickContactFromDevice(): Promise<DeviceContactResult | null> {
  const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
  if (!nav || !('contacts' in nav) || typeof nav.contacts.select !== 'function') {
    return { supported: false };
  }
  try {
    let supportedProps: string[] = ['tel'];
    if (typeof nav.contacts.getProperties === 'function') {
      try {
        const available = await nav.contacts.getProperties();
        if (Array.isArray(available) && available.includes('name')) {
          supportedProps.push('name');
        }
      } catch (e) {
        // fallback to tel
      }
    }
    const contacts = await nav.contacts.select(supportedProps, { multiple: false });
    if (contacts && contacts.length > 0) {
      const c = contacts[0];
      const rawTel = (c.tel && c.tel.length > 0 ? c.tel[0] : '') || '';
      const rawName = (c.name && c.name.length > 0 ? c.name[0] : '') || '';
      return {
        tel: formatMobileNumber(rawTel),
        name: String(rawName).trim(),
        supported: true,
      };
    }
    return null; // User cancelled
  } catch (err: any) {
    if (err && err.name === 'AbortError') {
      return null;
    }
    console.warn('Contact picker error:', err);
    return null;
  }
}

/**
 * Formats multiple phone numbers separated by separators into clean international format separated by ' / '.
 * Example: "01007911777, 01115409940" -> "+201007911777 / +201115409940"
 */
export function formatPhoneListForOccupant(phone: string | number | null | undefined): string {
  if (phone === null || phone === undefined) return '';
  const str = String(phone).trim();
  if (!str) return '';

  const separators = /[,/;|\n]+/;
  const parts = str.split(separators).map(p => p.trim()).filter(Boolean);

  return parts
    .map(part => {
      // Convert Arabic-Indic & Persian numerals
      let clean = part
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
        .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶٧٨٩'.indexOf(d).toString())
        .replace(/^['"]+/, '')
        .trim();

      const digits = clean.replace(/\D/g, '');
      if (!digits) return '';

      // If original starts with '+'
      if (clean.startsWith('+')) {
        return '+' + digits;
      }
      // If original starts with '00'
      if (clean.startsWith('00')) {
        return '+' + digits.substring(2);
      }
      // Egyptian mobile 11 digits (01...)
      if (digits.startsWith('01') && digits.length === 11) {
        return '+20' + digits.substring(1);
      }
      // Egyptian 10 digits starting with 1
      if (digits.startsWith('1') && digits.length === 10) {
        return '+20' + digits;
      }
      // Egyptian international 12 digits starting with 201
      if (digits.startsWith('201') && digits.length === 12) {
        return '+' + digits;
      }
      // Saudi local 10 digits (05...)
      if (digits.startsWith('05') && digits.length === 10) {
        return '+966' + digits.substring(1);
      }
      // Check known international codes
      for (const code of INTERNATIONAL_COUNTRY_CODES) {
        if (digits.startsWith(code) && digits.length >= code.length + 7) {
          return '+' + digits;
        }
      }
      if (digits.length >= 11 && !digits.startsWith('0')) {
        return '+' + digits;
      }
      return digits;
    })
    .filter(Boolean)
    .join(' / ');
}

export interface OccupantDataSources {
  residentName?: string;
  tenantName?: string;
  phone?: string;
  tenantPhone?: string;
  occupancyType?: string;
  unitNumber?: number | string;
}

export interface OccupantStructuredInfo {
  ownerName: string;
  ownerRole: string;
  ownerPhones: string;
  ownerLine: string;
  hasTenant: boolean;
  tenantName: string;
  tenantRole: string;
  tenantPhones: string;
  tenantLine: string;
  lines: string[];
  singleLine: string;
}

/**
 * Returns structured information for Owner and Tenant with lines formatted as requested:
 * Owner Line: "وحيد سماحة - مالك ( +201007911777 / +201115409940 )"
 * Tenant Line: "عيد مهدي - مستأجر ( +201007222776 / +2011145008840 )"
 */
export function getOccupantStructuredInfo(
  data: OccupantDataSources,
  residentRecord?: any | null
): OccupantStructuredInfo {
  // 1. Owner info
  let rawOwnerName = (data.residentName || residentRecord?.name || '').trim();
  rawOwnerName = rawOwnerName.replace(/\s*-\s*(مالك|مستأجر|ساكن)\s*$/i, '').trim();

  const rawOwnerPhone = data.phone || residentRecord?.phone || '';
  const ownerPhones = formatPhoneListForOccupant(rawOwnerPhone);

  // 2. Tenant info
  let rawTenantName = (data.tenantName || residentRecord?.tenantName || '').trim();
  rawTenantName = rawTenantName.replace(/\s*-\s*(مالك|مستأجر|ساكن)\s*$/i, '').trim();

  const rawTenantPhone = data.tenantPhone || residentRecord?.tenantPhone || '';
  const tenantPhones = formatPhoneListForOccupant(rawTenantPhone);

  // 3. Ownership / Occupancy type
  const rawOccupancy = data.occupancyType || residentRecord?.ownershipType || 'تمليك';
  const isRental = rawOccupancy === 'إيجار' || rawOccupancy.includes('إيجار') || rawOccupancy.includes('مستأجر');

  let ownerRole = 'مالك';
  let tenantRole = 'مستأجر';
  let ownerLine = '';
  let tenantLine = '';
  const lines: string[] = [];

  const hasTenant = Boolean(rawTenantName && rawTenantName !== rawOwnerName);

  if (hasTenant) {
    ownerRole = 'مالك';
    ownerLine = `${rawOwnerName || 'المالك'} - مالك` + (ownerPhones ? ` ( ${ownerPhones} )` : '');
    tenantRole = 'مستأجر';
    tenantLine = `${rawTenantName} - مستأجر` + (tenantPhones ? ` ( ${tenantPhones} )` : '');
    lines.push(ownerLine);
    lines.push(tenantLine);
  } else if (rawTenantName) {
    tenantRole = 'مستأجر';
    tenantLine = `${rawTenantName} - مستأجر` + (tenantPhones ? ` ( ${tenantPhones} )` : '');
    lines.push(tenantLine);
  } else if (rawOwnerName) {
    if (isRental) {
      ownerRole = 'مستأجر';
      ownerLine = `${rawOwnerName} - مستأجر` + (ownerPhones ? ` ( ${ownerPhones} )` : '');
    } else {
      ownerRole = 'مالك';
      ownerLine = `${rawOwnerName} - مالك` + (ownerPhones ? ` ( ${ownerPhones} )` : '');
    }
    lines.push(ownerLine);
  } else {
    ownerLine = `الوحدة ${data.unitNumber || ''}`.trim();
    lines.push(ownerLine);
  }

  const singleLine = lines.join(' - ');

  return {
    ownerName: rawOwnerName,
    ownerRole,
    ownerPhones,
    ownerLine,
    hasTenant,
    tenantName: rawTenantName,
    tenantRole,
    tenantPhones,
    tenantLine,
    lines,
    singleLine,
  };
}

/**
 * Formats full occupant description including Owner, Tenant, Roles and Phone numbers.
 * Example format:
 * "وحيد سماحة - مالك ( +201007911777 / +201115409940 ) - عيد مهدي - مستأجر ( +201007222776 / +2011145008840 )"
 */
export function formatFullOccupantDescription(
  data: OccupantDataSources,
  residentRecord?: any | null
): string {
  const info = getOccupantStructuredInfo(data, residentRecord);
  return info.singleLine;
}

