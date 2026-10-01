import { Resident, FloorConfig, UnitHistoryRecord, UnitActivityRecord } from '../types';

export const floorTypeLabels: Record<FloorConfig['type'], string> = {
  basement: 'دور البدروم',
  ground: 'الدور الأرضي',
  mezzanine: 'الدور الميزانين',
  typical: 'الدور المتكرر',
  roof: 'دور الروف',
};

const ordinalArabicFloorNames: Record<number, string> = {
  0: 'الدور الأرضي',
  1: 'الدور الأول',
  2: 'الدور الثاني',
  3: 'الدور الثالث',
  4: 'الدور الرابع',
  5: 'الدور الخامس',
  6: 'الدور السادس',
  7: 'الدور السابع',
  8: 'الدور الثامن',
  9: 'الدور التاسع',
  10: 'الدور العاشر',
  11: 'الدور الحادي عشر',
  12: 'الدور الثاني عشر',
  13: 'الدور الثالث عشر',
  14: 'الدور الرابع عشر',
  15: 'الدور الخامس عشر',
};

export function getFloorName(floorNum: number): string {
  if (ordinalArabicFloorNames[floorNum]) {
    return ordinalArabicFloorNames[floorNum];
  }
  return `الدور ${floorNum}`;
}

/**
 * Parses flat number strings like "502-2" into main unit (502) and sub unit (2) for precise floor grouping and ordering.
 */
export function parseFlatNumber(flat: number | string | undefined | null): { main: number; sub: number; original: string } {
  if (flat === undefined || flat === null || flat === '') {
    return { main: 999999, sub: 0, original: '' };
  }
  let str = String(flat).trim();
  const standardDigits: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };
  str = str.replace(/[٠-٩۰-۹]/g, (char) => standardDigits[char] || char);

  const match = str.match(/^(\d+)(?:[\-\/\_\.](\d+))?$/);
  if (match) {
    const main = parseInt(match[1], 10);
    const sub = match[2] ? parseInt(match[2], 10) : 0;
    return { main, sub, original: str };
  }
  const numMatch = str.match(/^(\d+)/);
  if (numMatch) {
    const main = parseInt(numMatch[1], 10);
    return { main, sub: 999, original: str };
  }
  return { main: 999999, sub: 0, original: str };
}

/**
 * Sorts flat numbers naturally: 501, 502, 502-1, 502-2, 503.
 */
export function compareFlatNumbers(a: number | string | undefined | null, b: number | string | undefined | null): number {
  const parsedA = parseFlatNumber(a);
  const parsedB = parseFlatNumber(b);

  if (parsedA.main !== parsedB.main) {
    return parsedA.main - parsedB.main;
  }
  if (parsedA.sub !== parsedB.sub) {
    return parsedA.sub - parsedB.sub;
  }
  return parsedA.original.localeCompare(parsedB.original, 'ar', { numeric: true });
}

/**
 * Checks if two flat numbers are equal.
 */
export function isSameFlatNumber(a: number | string | undefined | null, b: number | string | undefined | null): boolean {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  const strA = String(a).trim();
  const strB = String(b).trim();
  if (strA === strB) return true;
  const parsedA = parseFlatNumber(a);
  const parsedB = parseFlatNumber(b);
  if (parsedA.main !== 999999 && parsedB.main !== 999999) {
    return parsedA.main === parsedB.main && parsedA.sub === parsedB.sub;
  }
  return false;
}

/**
 * Automatically infers and derives a complete FloorConfig array from a list of registered residents.
 */
export function deriveFloorConfigsFromResidents(residents: Resident[]): FloorConfig[] {
  if (!residents || residents.length === 0) {
    return [];
  }

  const validResidents = [...residents].sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));

  const floorGroups = new Map<number, Resident[]>();

  validResidents.forEach((res) => {
    const parsed = parseFlatNumber(res.flatNumber);
    const mainNum = parsed.main;
    const floorIndex = mainNum >= 100 ? Math.floor(mainNum / 100) : (mainNum > 0 ? Math.floor((mainNum - 1) / 4) + 1 : 0);
    if (!floorGroups.has(floorIndex)) {
      floorGroups.set(floorIndex, []);
    }
    floorGroups.get(floorIndex)!.push(res);
  });

  const sortedFloorIndices = Array.from(floorGroups.keys()).sort((a, b) => a - b);
  const configs: FloorConfig[] = [];

  sortedFloorIndices.forEach((floorIdx) => {
    const floorResidents = floorGroups.get(floorIdx)!;
    const flatNums = Array.from(new Set(floorResidents.map(r => r.flatNumber))).sort(compareFlatNumbers);
    const minFlat = flatNums.length > 0 ? flatNums[0] : (floorIdx * 100 + 1);
    
    const predominantActivity = floorResidents[0]?.activityType || 'سكني';
    const isGround = floorIdx === 0;

    configs.push({
      id: `derived_floor_${floorIdx}_${Date.now()}`,
      type: isGround ? 'ground' : 'typical',
      floorLabel: getFloorName(floorIdx),
      unitsCount: flatNums.length,
      activityType: predominantActivity,
      startUnitNumber: minFlat,
      unitNumbers: flatNums,
    });
  });

  return configs;
}

/**
 * Returns all unit numbers for a floor, respecting explicit unitNumbers or existing residents.
 */
export function getUnitNumbersForFloor(floor: FloorConfig, allResidents: Resident[] = []): (number | string)[] {
  const defaultStart = floor.type === 'ground' ? 1 : 101;
  const startParsed = parseFlatNumber(floor.startUnitNumber ?? (floor.unitNumbers?.[0] ?? defaultStart));
  const floorHundred = startParsed.main >= 100 ? Math.floor(startParsed.main / 100) : null;

  const baseUnits: (number | string)[] = Array.isArray(floor.unitNumbers) && floor.unitNumbers.length > 0
    ? [...floor.unitNumbers]
    : [];

  if (baseUnits.length === 0) {
    const count = floor.unitsCount || 0;
    for (let i = 0; i < count; i++) {
      baseUnits.push(startParsed.main + i);
    }
  }

  // Also include any registered resident flat numbers that belong to this floor
  if (allResidents && allResidents.length > 0) {
    allResidents.forEach(r => {
      if (r.flatNumber === undefined || r.flatNumber === null || String(r.flatNumber).trim() === '') return;
      const fnParsed = parseFlatNumber(r.flatNumber);
      const matchesFloor = floorHundred !== null
        ? Math.floor(fnParsed.main / 100) === floorHundred
        : (fnParsed.main >= startParsed.main && fnParsed.main < startParsed.main + Math.max(floor.unitsCount || 1, 10));

      if (matchesFloor && !baseUnits.some(u => isSameFlatNumber(u, r.flatNumber))) {
        baseUnits.push(r.flatNumber);
      }
    });
  }

  // Strict deduplication using isSameFlatNumber
  const uniqueUnits: (number | string)[] = [];
  baseUnits.forEach(u => {
    if (!uniqueUnits.some(existing => isSameFlatNumber(existing, u))) {
      uniqueUnits.push(u);
    }
  });

  return uniqueUnits.sort(compareFlatNumbers);
}

/**
 * Surgically removes a unit number from the building layout, updating unit count and unit list.
 */
export function removeUnitFromBuildingLayout(
  layout: FloorConfig[], 
  flatNumberToRemove: number | string, 
  currentResidents: Resident[] = []
): FloorConfig[] {
  const baseLayout = (layout && layout.length > 0)
    ? layout
    : deriveFloorConfigsFromResidents(currentResidents);

  if (baseLayout.length === 0) return [];

  const updated = baseLayout.map((floor) => {
    const currentUnits = getUnitNumbersForFloor(floor, currentResidents);
    if (currentUnits.some(u => isSameFlatNumber(u, flatNumberToRemove))) {
      const remainingUnits = currentUnits.filter(u => !isSameFlatNumber(u, flatNumberToRemove));
      return {
        ...floor,
        unitNumbers: remainingUnits,
        unitsCount: remainingUnits.length,
        startUnitNumber: remainingUnits.length > 0 ? remainingUnits[0] : floor.startUnitNumber,
      };
    }
    return {
      ...floor,
      unitNumbers: currentUnits,
      unitsCount: currentUnits.length,
    };
  });

  // Filter out completely empty floors if other floors still exist
  const nonEmptyFloors = updated.filter(f => f.unitsCount > 0);
  return nonEmptyFloors.length > 0 ? nonEmptyFloors : updated;
}

/**
 * Adds a unit number to the matching floor in building layout, preserving order.
 */
export function addUnitToBuildingLayout(
  layout: FloorConfig[], 
  flatNumberToAdd: number | string, 
  activityType: string = 'سكني',
  currentResidents: Resident[] = []
): FloorConfig[] {
  const baseLayout = (layout && layout.length > 0)
    ? layout
    : deriveFloorConfigsFromResidents(currentResidents);

  // If unit is already present in layout or residents, do NOT create or duplicate it
  const alreadyExists = baseLayout.some(floor => {
    const currentUnits = getUnitNumbersForFloor(floor, currentResidents);
    return currentUnits.some(u => isSameFlatNumber(u, flatNumberToAdd));
  });

  if (alreadyExists) {
    return baseLayout;
  }

  const parsedAdd = parseFlatNumber(flatNumberToAdd);

  if (baseLayout.length === 0) {
    const isGround = parsedAdd.main < 100 || Math.floor(parsedAdd.main / 100) === 0;
    return [{
      id: `floor_${Date.now()}`,
      type: isGround ? 'ground' : 'typical',
      floorLabel: isGround ? 'الدور الأرضي' : getFloorName(Math.floor(parsedAdd.main / 100)),
      unitsCount: 1,
      activityType: activityType || 'سكني',
      startUnitNumber: flatNumberToAdd,
      unitNumbers: [flatNumberToAdd],
    }];
  }

  const targetFloorHundred = parsedAdd.main >= 100 ? Math.floor(parsedAdd.main / 100) : null;
  let targetFloorFound = false;

  const updated = baseLayout.map((floor) => {
    const currentUnits = getUnitNumbersForFloor(floor, currentResidents);
    const floorStart = floor.startUnitNumber ?? (currentUnits.length > 0 ? currentUnits[0] : 0);
    const startParsed = parseFlatNumber(floorStart);
    const floorHundred = startParsed.main >= 100 ? Math.floor(startParsed.main / 100) : null;

    const matchesFloor = targetFloorHundred !== null 
      ? (floorHundred === targetFloorHundred)
      : (startParsed.main <= parsedAdd.main && parsedAdd.main <= startParsed.main + Math.max(floor.unitsCount || 1, 10));

    if (matchesFloor && !targetFloorFound) {
      targetFloorFound = true;
      const combined = [...currentUnits, flatNumberToAdd];
      const uniqueCombined: (number | string)[] = [];
      combined.forEach(u => {
        if (!uniqueCombined.some(existing => isSameFlatNumber(existing, u))) {
          uniqueCombined.push(u);
        }
      });
      const newUnits = uniqueCombined.sort(compareFlatNumbers);
      return {
        ...floor,
        unitNumbers: newUnits,
        unitsCount: newUnits.length,
        startUnitNumber: newUnits[0],
      };
    }

    return {
      ...floor,
      unitNumbers: currentUnits,
      unitsCount: currentUnits.length,
    };
  });

  if (!targetFloorFound) {
    const floorIdx = targetFloorHundred !== null ? targetFloorHundred : Math.floor((parsedAdd.main - 1) / 4) + 1;
    const isGround = floorIdx === 0;
    updated.push({
      id: `floor_${floorIdx}_${Date.now()}`,
      type: isGround ? 'ground' : 'typical',
      floorLabel: getFloorName(floorIdx),
      unitsCount: 1,
      activityType: activityType || 'سكني',
      startUnitNumber: flatNumberToAdd,
      unitNumbers: [flatNumberToAdd],
    });
  }

  return updated.sort((a, b) => {
    const aStart = a.startUnitNumber ?? (a.unitNumbers?.[0] ?? 0);
    const bStart = b.startUnitNumber ?? (b.unitNumbers?.[0] ?? 0);
    return compareFlatNumbers(aStart, bStart);
  });
}

/**
 * Generates a normalized canonical key for a unit/flat number.
 */
export function getCanonicalFlatKey(flat: number | string | undefined | null): string {
  if (flat === undefined || flat === null || String(flat).trim() === '') return '';
  const parsed = parseFlatNumber(flat);
  if (parsed.main !== 999999) {
    return `unit_${parsed.main}_${parsed.sub}`;
  }
  return String(flat).trim().toLowerCase();
}

/**
 * Deduplicates a list of residents strictly by unit number (flatNumber).
 * Guarantees that every unit appears at most once and unit numbers can NEVER be duplicated.
 * If duplicate records exist (e.g. an auto-registered 'res_president_...' alongside a manual record),
 * it preserves the manual record, merges any missing phone/notes, and discards auto/ghost duplicates.
 */
export function deduplicateResidents(list: Resident[]): Resident[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const map = new Map<string, Resident>();
  
  for (const r of list) {
    if (!r || r.flatNumber === undefined || r.flatNumber === null || String(r.flatNumber).trim() === '') {
      continue;
    }
    const key = getCanonicalFlatKey(r.flatNumber);
    if (!key) continue;

    const existing = map.get(key);
    
    if (!existing) {
      map.set(key, r);
    } else {
      // Prioritize the manual/real resident over auto-generated 'res_president_' or 'res_gen_'
      const isExistingAuto = String(existing.id).startsWith('res_president_') || String(existing.id).startsWith('res_gen_');
      const isCurrentAuto = String(r.id).startsWith('res_president_') || String(r.id).startsWith('res_gen_');
      
      if (isExistingAuto && !isCurrentAuto) {
        map.set(key, { 
          ...r, 
          notes: r.notes || existing.notes,
          phone: r.phone || existing.phone,
          ownershipType: r.ownershipType || existing.ownershipType,
          tenantName: r.tenantName || existing.tenantName,
          tenantPhone: r.tenantPhone || existing.tenantPhone,
        });
      } else if (!isExistingAuto && isCurrentAuto) {
        map.set(key, { 
          ...existing, 
          notes: existing.notes || r.notes,
          phone: existing.phone || r.phone,
          ownershipType: existing.ownershipType || r.ownershipType,
          tenantName: existing.tenantName || r.tenantName,
          tenantPhone: existing.tenantPhone || r.tenantPhone,
        });
      } else {
        // Keep the one with more complete details (e.g. phone or name)
        const existingHasPhone = Boolean(existing.phone && existing.phone.trim());
        const currentHasPhone = Boolean(r.phone && r.phone.trim());
        if (!existingHasPhone && currentHasPhone) {
          map.set(key, { 
            ...r, 
            notes: r.notes || existing.notes,
            tenantName: r.tenantName || existing.tenantName,
            tenantPhone: r.tenantPhone || existing.tenantPhone,
          });
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
}

/**
 * Identifies IDs of duplicate resident records that should be permanently deleted from Firestore.
 */
export function getDuplicateResidentIds(rawList: Resident[]): string[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  const uniqueList = deduplicateResidents(rawList);
  const keptIds = new Set(uniqueList.map(r => r.id));
  return rawList
    .filter(r => r && r.id && !keptIds.has(r.id))
    .map(r => r.id);
}

export interface HistoricalOccupantResult {
  ownerName: string;
  ownerPhone?: string;
  tenantName?: string;
  tenantPhone?: string;
  occupantName: string;
  occupantPhone?: string;
}

const MONTH_NAME_MAP: Record<string, string> = {
  // Arabic Month Names
  'يناير': '01',
  'فبراير': '02',
  'مارس': '03',
  'أبريل': '04', 'ابريل': '04',
  'مايو': '05',
  'يونيو': '06',
  'يوليو': '07',
  'أغسطس': '08', 'اغسطس': '08',
  'سبتمبر': '09',
  'أكتوبر': '10', 'اكتوبر': '10',
  'نوفمبر': '11',
  'ديسمبر': '12',
  // Levantine Arabic Month Names
  'كانون الثاني': '01', 'كانون ثاني': '01',
  'شباط': '02',
  'آذار': '03', 'اذار': '03',
  'نيسان': '04',
  'أيار': '05', 'ايار': '05',
  'حزيران': '06',
  'تموز': '07',
  'آب': '08', 'اب': '08',
  'أيلول': '09', 'ايلول': '09',
  'تشرين الأول': '10', 'تشرين اول': '10',
  'تشرين الثاني': '11', 'تشرين ثاني': '11',
  'كانون الأول': '12', 'كانون اول': '12',
  // English Month Names
  'jan': '01', 'january': '01',
  'feb': '02', 'february': '02',
  'mar': '03', 'march': '03',
  'apr': '04', 'april': '04',
  'may': '05',
  'jun': '06', 'june': '06',
  'jul': '07', 'july': '07',
  'aug': '08', 'august': '08',
  'sep': '09', 'september': '09',
  'oct': '10', 'october': '10',
  'nov': '11', 'november': '11',
  'dec': '12', 'december': '12',
};

/**
 * Normalizes Eastern Arabic digits (٠-٩) to standard ASCII digits (0-9).
 */
function normalizeDigits(str: string): string {
  return str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

/**
 * Normalizes any string date (e.g. "يناير 2022", "أبريل 2026", "1/2022", "01/2022", "2022-01", "2026-7", "7/2026", "1/10/2026", "2026-10-01")
 * into normalized year (YYYY), month (YYYY-MM), and full date (YYYY-MM-DD).
 */
export function parseToStandardDate(raw?: string | number): { year: string; month: string; dateStr: string } | null {
  if (raw === undefined || raw === null) return null;
  let str = normalizeDigits(String(raw)).trim().toLowerCase();
  if (!str) return null;

  // Check for ongoing / open-ended keywords (these signify open-ended dates, not a fixed calendar boundary)
  const ongoingKeywords = [
    'حتى الآن', 'حتي الان', 'حتى الان', 'حتي الآن',
    'إلى الآن', 'الي الان', 'الى الان',
    'الآن', 'الان',
    'الوقت الحالي', 'الفترة الحالية', 'حتى الوقت الحالي',
    'حتى تاريخه', 'تاريخه', 'حاضر',
    'مستمر', 'ساري', 'حالي', 'الحالي',
    'current', 'ongoing', 'present', 'now', 'today'
  ];
  if (ongoingKeywords.some(kw => str.includes(kw))) {
    return null;
  }

  // 1. Check for ISO or YYYY-MM-DD or YYYY/MM/DD or YYYY-MM
  const yFirstMatch = str.match(/^(\d{4})[-\/\.](\d{1,2})(?:[-\/\.](\d{1,2}))?$/);
  if (yFirstMatch) {
    const y = yFirstMatch[1];
    const m = String(parseInt(yFirstMatch[2], 10)).padStart(2, '0');
    const d = yFirstMatch[3] ? String(parseInt(yFirstMatch[3], 10)).padStart(2, '0') : '';
    const month = `${y}-${m}`;
    const dateStr = d ? `${y}-${m}-${d}` : month;
    return { year: y, month, dateStr };
  }

  // 2. Check for DD/MM/YYYY or DD-MM-YYYY (Egyptian / Arab standard date format)
  const dmyMatch = str.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})$/);
  if (dmyMatch) {
    const d = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
    const m = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
    const y = dmyMatch[3];
    const month = `${y}-${m}`;
    const dateStr = `${y}-${m}-${d}`;
    return { year: y, month, dateStr };
  }

  // 3. Check for MM/YYYY or MM-YYYY
  const myMatch = str.match(/^(\d{1,2})[-\/\.](\d{4})$/);
  if (myMatch) {
    const m = String(parseInt(myMatch[1], 10)).padStart(2, '0');
    const y = myMatch[2];
    const month = `${y}-${m}`;
    return { year: y, month, dateStr: month };
  }

  // 4. Check for 4-digit year (19xx or 20xx)
  let y = '';
  const yearMatch = str.match(/\b(19\d\d|20\d\d)\b/);
  if (yearMatch) {
    y = yearMatch[1];
    str = str.replace(yearMatch[1], ' ').trim();
  }

  // 5. Check if remaining string contains a named month
  let m = '';
  for (const [key, val] of Object.entries(MONTH_NAME_MAP)) {
    if (str.includes(key.toLowerCase())) {
      m = val;
      break;
    }
  }

  // 6. If numeric day/month remains
  let d = '';
  const parts = str.split(/[\/\-\.\s]+/).filter(Boolean);
  if (!m && parts.length >= 1) {
    const num = parseInt(parts[0], 10);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      m = String(num).padStart(2, '0');
      if (parts.length >= 2) {
        const dayNum = parseInt(parts[1], 10);
        if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
          d = String(dayNum).padStart(2, '0');
        }
      }
    }
  } else if (m && parts.length >= 1) {
    const dayNum = parseInt(parts[0], 10);
    if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
      d = String(dayNum).padStart(2, '0');
    }
  }

  if (!y) {
    y = String(new Date().getFullYear());
  }

  const month = m ? `${y}-${m}` : y;
  const dateStr = d ? `${y}-${m}-${d}` : month;

  return { year: y, month, dateStr };
}

/**
 * Checks if a date string represents an ongoing or current period (e.g. "حتى الآن", empty end date, or date >= current month/year).
 */
export function isOngoingOrCurrentDate(raw?: string | number): boolean {
  if (!raw) return true; // Open-ended date (empty/undefined) means ongoing/current!
  const str = normalizeDigits(String(raw)).trim().toLowerCase();
  if (!str) return true;

  const ongoingKeywords = [
    'حتى الآن', 'حتي الان', 'حتى الان', 'حتي الآن',
    'إلى الآن', 'الي الان', 'الى الان',
    'الآن', 'الان',
    'الوقت الحالي', 'الفترة الحالية', 'حتى الوقت الحالي',
    'حتى تاريخه', 'تاريخه', 'حاضر',
    'مستمر', 'ساري', 'حالي', 'الحالي',
    'current', 'ongoing', 'present', 'now', 'today'
  ];

  if (ongoingKeywords.some(kw => str.includes(kw))) {
    return true;
  }

  const parsed = parseToStandardDate(str);
  if (parsed?.dateStr) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const thisMonthStr = `${currentYear}-${currentMonth}`;

    if (parsed.dateStr >= thisMonthStr || parseInt(parsed.year, 10) > currentYear) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether an interval (fromDateRaw -> toDateRaw) covers the target normalized period (month/date/year).
 * - If fromDateRaw is specified: target cannot be before fromDate (e.g. future contracts return false).
 * - If toDateRaw is specified (and not open-ended / 'حتى الآن'): target cannot be after toDate (expired contracts return false).
 */
export function isPeriodMatchingTarget(
  targetNorm: { year: string; month: string; dateStr: string },
  fromDateRaw?: string,
  toDateRaw?: string
): boolean {
  const fromNorm = parseToStandardDate(fromDateRaw);
  const toNorm = parseToStandardDate(toDateRaw);

  if (fromNorm) {
    if (targetNorm.dateStr.length === 10 && fromNorm.dateStr.length === 10) {
      if (targetNorm.dateStr < fromNorm.dateStr) return false;
    } else if (targetNorm.month && fromNorm.month && targetNorm.month.length === 7 && fromNorm.month.length === 7) {
      if (targetNorm.month < fromNorm.month) return false;
    } else if (targetNorm.year && fromNorm.year) {
      if (targetNorm.year < fromNorm.year) return false;
    }
  }

  if (toNorm) {
    if (targetNorm.dateStr.length === 10 && toNorm.dateStr.length === 10) {
      if (targetNorm.dateStr > toNorm.dateStr) return false;
    } else if (targetNorm.month && toNorm.month && targetNorm.month.length === 7 && toNorm.month.length === 7) {
      if (targetNorm.month > toNorm.month) return false;
    } else if (targetNorm.year && toNorm.year) {
      if (targetNorm.year > toNorm.year) return false;
    }
  }

  return true;
}

/**
 * Returns historical owner/tenant names and phones for a given resident at a specific date, year, or period.
 * Accurately delegates to getLatestOccupantFromHistory to resolve the exact occupant for that period.
 */
export function getHistoricalOccupantForDate(
  resident: Resident,
  dateOrPeriod?: string | number
): HistoricalOccupantResult {
  if (!resident) {
    return { ownerName: '', occupantName: '' };
  }
  return getLatestOccupantFromHistory(resident, dateOrPeriod);
}

/**
 * Computes an effective start date string (YYYY-MM-DD or YYYY-MM) for sorting a history record.
 */
function getRecordEffectiveStartDate(rec: UnitHistoryRecord): string {
  const normTenant = parseToStandardDate(rec.tenantFromDate);
  const normOwner = parseToStandardDate(rec.ownerFromDate);
  if (normTenant?.dateStr && normOwner?.dateStr) {
    return normTenant.dateStr > normOwner.dateStr ? normTenant.dateStr : normOwner.dateStr;
  }
  return normTenant?.dateStr || normOwner?.dateStr || '';
}

/**
 * Computes an effective end date string for sorting a history record.
 * Ongoing / current records return '9999-99-99' so they sort to the very end as active records.
 */
function getRecordEffectiveEndDate(rec: UnitHistoryRecord): string {
  if (rec.tenantName && rec.tenantName.trim()) {
    if (isOngoingOrCurrentDate(rec.tenantToDate)) return '9999-99-99';
    const norm = parseToStandardDate(rec.tenantToDate);
    if (norm?.dateStr) return norm.dateStr;
  }
  if (isOngoingOrCurrentDate(rec.ownerToDate)) return '9999-99-99';
  const norm = parseToStandardDate(rec.ownerToDate);
  return norm?.dateStr || '';
}

/**
 * Sorts unit history records chronologically (oldest to newest).
 * Records marked with "حتى الآن" or ongoing into current time period are placed at the end as current/active records.
 */
export function sortHistoryRecordsChronologically(records: UnitHistoryRecord[]): UnitHistoryRecord[] {
  if (!records || records.length <= 1) return records ? [...records] : [];
  return [...records].sort((a, b) => {
    const aEnd = getRecordEffectiveEndDate(a);
    const bEnd = getRecordEffectiveEndDate(b);
    const aIsCurrent = aEnd === '9999-99-99';
    const bIsCurrent = bEnd === '9999-99-99';

    if (aIsCurrent && !bIsCurrent) return 1;
    if (!aIsCurrent && bIsCurrent) return -1;

    const startA = getRecordEffectiveStartDate(a);
    const startB = getRecordEffectiveStartDate(b);
    if (startA && startB && startA !== startB) {
      return startA.localeCompare(startB);
    }
    if (aEnd !== bEnd) {
      return aEnd.localeCompare(bEnd);
    }
    const cA = a.createdAt || '';
    const cB = b.createdAt || '';
    return cA.localeCompare(cB);
  });
}

/**
 * Extracts all known tenant phone numbers associated with a resident (from resident.tenantPhone or any history record).
 */
export function getAllTenantPhones(resident: Resident): Set<string> {
  const set = new Set<string>();
  if (!resident) return set;
  if (resident.tenantPhone) {
    resident.tenantPhone.split(/[,/;|\n]+/).forEach(p => {
      const clean = p.trim().replace(/\D/g, '');
      if (clean.length >= 6) set.add(clean);
    });
  }
  if (resident.history && Array.isArray(resident.history)) {
    resident.history.forEach(h => {
      if (h.tenantPhone) {
        h.tenantPhone.split(/[,/;|\n]+/).forEach(p => {
          const clean = p.trim().replace(/\D/g, '');
          if (clean.length >= 6) set.add(clean);
        });
      }
    });
  }
  return set;
}

/**
 * Checks if a given phone string belongs to a tenant of this unit.
 */
export function isTenantPhone(phone: string | undefined, tenantPhonesSet: Set<string>): boolean {
  if (!phone) return false;
  const digits = phone.trim().replace(/\D/g, '');
  if (digits.length < 6) return false;
  return Array.from(tenantPhonesSet).some(tp => digits.includes(tp) || tp.includes(digits));
}

/**
 * Resolves the occupant (owner and tenant) for the current active month/period
 * (خلال الشهر الحالي في الوقت الذي يتم فيه عمل كشف الحساب)
 * from the unit's ownership and occupancy register (سجل الملكية والحيازة).
 * 
 * If in the current month the apartment has no active tenant (e.g. contract not started yet or expired),
 * tenantName is strictly returned as undefined (owner occupied / without tenant).
 * If no owner phone is registered in history for that period, ownerPhone is undefined (never leaks tenant's phone).
 */
export function getLatestOccupantFromHistory(
  resident: Resident,
  targetDateOrPeriod?: string | number
): {
  ownerName: string;
  ownerPhone?: string;
  tenantName?: string;
  tenantPhone?: string;
  occupantName: string;
  occupantPhone?: string;
} {
  if (!resident) {
    return { ownerName: '', tenantName: undefined, occupantName: '' };
  }

  const tenantPhonesSet = getAllTenantPhones(resident);
  const fallbackSafeOwnerPhone = isTenantPhone(resident.phone, tenantPhonesSet) ? undefined : resident.phone;

  const fallback = {
    ownerName: (resident.name || '').trim(),
    ownerPhone: fallbackSafeOwnerPhone,
    tenantName: (resident.tenantName || '').trim() || undefined,
    tenantPhone: resident.tenantPhone,
    occupantName: (resident.tenantName || resident.name || '').trim(),
    occupantPhone: resident.tenantName ? resident.tenantPhone : fallbackSafeOwnerPhone,
  };

  if (!resident.history || !Array.isArray(resident.history) || resident.history.length === 0) {
    return fallback;
  }

  // Current calendar month and date at the time the account statement is run
  const now = new Date();
  const currentY = String(now.getFullYear());
  const currentM = String(now.getMonth() + 1).padStart(2, '0');
  const currentD = String(now.getDate()).padStart(2, '0');
  const currentMonthStr = `${currentY}-${currentM}`;
  const currentDateStr = `${currentMonthStr}-${currentD}`;

  let targetNorm: { year: string; month: string; dateStr: string };
  if (targetDateOrPeriod && targetDateOrPeriod !== 'latest' && targetDateOrPeriod !== 'current') {
    const parsed = parseToStandardDate(targetDateOrPeriod);
    targetNorm = parsed || { year: currentY, month: currentMonthStr, dateStr: currentDateStr };
  } else {
    targetNorm = { year: currentY, month: currentMonthStr, dateStr: currentDateStr };
  }

  // Sorted history chronologically
  const historyList = sortHistoryRecordsChronologically(resident.history);
  if (historyList.length === 0) {
    return fallback;
  }

  // 1. Resolve Owner for the target/current month
  let resolvedOwnerName = '';
  let resolvedOwnerPhone: string | undefined = undefined;
  let ownerMatched = false;

  for (let i = historyList.length - 1; i >= 0; i--) {
    const rec = historyList[i];
    if (rec.ownerName && rec.ownerName.trim()) {
      if (isPeriodMatchingTarget(targetNorm, rec.ownerFromDate, rec.ownerToDate)) {
        resolvedOwnerName = rec.ownerName.trim();
        // Use explicitly registered ownerPhone for that period in history. If empty, it's undefined.
        resolvedOwnerPhone = rec.ownerPhone && rec.ownerPhone.trim() ? rec.ownerPhone.trim() : undefined;
        ownerMatched = true;
        break;
      }
    }
  }

  // If no owner matched specifically by date, take the latest owner in history
  if (!ownerMatched) {
    for (let i = historyList.length - 1; i >= 0; i--) {
      const rec = historyList[i];
      if (rec.ownerName && rec.ownerName.trim()) {
        resolvedOwnerName = rec.ownerName.trim();
        resolvedOwnerPhone = rec.ownerPhone && rec.ownerPhone.trim() ? rec.ownerPhone.trim() : undefined;
        ownerMatched = true;
        break;
      }
    }
  }

  if (!resolvedOwnerName) {
    resolvedOwnerName = fallback.ownerName;
    resolvedOwnerPhone = fallback.ownerPhone;
  }

  // Double check resolvedOwnerPhone never matches any tenant's phone
  if (resolvedOwnerPhone && isTenantPhone(resolvedOwnerPhone, tenantPhonesSet)) {
    resolvedOwnerPhone = undefined;
  }

  // 2. Resolve Tenant strictly for the target/current month (الشهر الحالي):
  // Check if any record in history has an active tenant whose period covers this exact month.
  let resolvedTenantName: string | undefined = undefined;
  let resolvedTenantPhone: string | undefined = undefined;
  let tenantMatched = false;

  for (let i = historyList.length - 1; i >= 0; i--) {
    const rec = historyList[i];
    const hasTenant = Boolean(rec.tenantName && rec.tenantName.trim());
    if (hasTenant) {
      if (isPeriodMatchingTarget(targetNorm, rec.tenantFromDate, rec.tenantToDate)) {
        resolvedTenantName = rec.tenantName!.trim();
        resolvedTenantPhone = rec.tenantPhone && rec.tenantPhone.trim() ? rec.tenantPhone.trim() : undefined;
        tenantMatched = true;
        break;
      }
    }
  }

  // If history exists but NO tenant matched for this month (e.g. apartment is vacant/owner-occupied in this month):
  // resolvedTenantName is strictly undefined! Do NOT leak past or future tenant!
  const finalTenant = tenantMatched && resolvedTenantName ? resolvedTenantName : undefined;
  const finalTenantPhone = finalTenant ? resolvedTenantPhone : undefined;

  return {
    ownerName: resolvedOwnerName,
    ownerPhone: resolvedOwnerPhone,
    tenantName: finalTenant,
    tenantPhone: finalTenantPhone,
    occupantName: finalTenant || resolvedOwnerName,
    occupantPhone: finalTenant ? finalTenantPhone : resolvedOwnerPhone,
  };
}

/**
 * Synchronizes a resident's top-level fields (name, phone, tenantName, tenantPhone, ownershipType)
 * with the active occupant for the current month/period from their history records (سجل الملكية والحيازة).
 */
export function syncResidentCurrentOccupant(r: Resident, targetDateOrPeriod?: string | number): Resident {
  if (!r || !r.history || !Array.isArray(r.history) || r.history.length === 0) return r;
  const occ = getLatestOccupantFromHistory(r, targetDateOrPeriod);
  const tenantPhonesSet = getAllTenantPhones(r);

  // If r.phone matches a tenant number, strip it so owner phone is clean
  const cleanFallbackPhone = isTenantPhone(r.phone, tenantPhonesSet) ? '' : (r.phone || '');
  const cleanPhone = occ.ownerPhone !== undefined ? (occ.ownerPhone || '') : cleanFallbackPhone;

  return {
    ...r,
    name: occ.ownerName || r.name,
    phone: cleanPhone,
    tenantName: occ.tenantName || '',
    tenantPhone: occ.tenantPhone || '',
    ownershipType: occ.tenantName ? 'إيجار' : 'تمليك',
  };
}

export interface FloorResidentGroup {
  floorLabel: string;
  residents: Resident[];
}

/**
 * Groups residents by floor for unit dropdowns, sorted naturally by floor and flat number.
 */
export function groupResidentsByFloor(
  residents: Resident[],
  floorConfigs?: FloorConfig[]
): FloorResidentGroup[] {
  if (!residents || residents.length === 0) return [];

  const groupsMap = new Map<string, { label: string; floorNum: number; residents: Resident[] }>();

  residents.forEach((res) => {
    if (!res || res.flatNumber === undefined || res.flatNumber === null) return;
    const parsed = parseFlatNumber(res.flatNumber);
    const mainNum = parsed.main;
    const floorIndex = mainNum >= 100 ? Math.floor(mainNum / 100) : (mainNum > 0 ? Math.floor((mainNum - 1) / 4) + 1 : 0);
    const label = getFloorName(floorIndex);
    const key = `floor_${floorIndex}`;

    if (!groupsMap.has(key)) {
      groupsMap.set(key, { label, floorNum: floorIndex, residents: [] });
    }
    groupsMap.get(key)!.residents.push(res);
  });

  const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => {
    return groupsMap.get(a)!.floorNum - groupsMap.get(b)!.floorNum;
  });

  return sortedKeys.map((key) => {
    const grp = groupsMap.get(key)!;
    grp.residents.sort((a, b) => compareFlatNumbers(a.flatNumber, b.flatNumber));
    return {
      floorLabel: grp.label,
      residents: grp.residents,
    };
  });
}

/**
 * Formats option text for resident select dropdowns: shows Owner Name and Tenant Name underneath/if existing.
 * When yearOrPeriod is 'latest' or omitted, uses getLatestOccupantFromHistory to display the latest names from سجل الملكية والحيازة.
 */
export function formatResidentOptionLabel(res: Resident, yearOrPeriod?: string | number): string {
  if (!res) return '';
  const flatStr = String(res.flatNumber || '').trim();
  
  const occupant = (yearOrPeriod && yearOrPeriod !== 'latest' && yearOrPeriod !== 'current')
    ? getHistoricalOccupantForDate(res, yearOrPeriod)
    : getLatestOccupantFromHistory(res);

  const ownerName = (occupant.ownerName || res.name || '').trim();
  const hasHistory = Boolean(res.history && Array.isArray(res.history) && res.history.length > 0);
  const tenantName = (hasHistory 
    ? (occupant.tenantName || '') 
    : (occupant.tenantName !== undefined ? occupant.tenantName : (res.tenantName || ''))
  ).trim();
  
  if (tenantName) {
    return `وحدة ${flatStr} — المالك: ${ownerName} 👤 (المستأجر: ${tenantName})`;
  }
  return `وحدة ${flatStr} — المالك: ${ownerName}`;
}

/**
 * Computes an effective start date string for sorting an activity record.
 */
function getActivityRecordEffectiveStartDate(rec: UnitActivityRecord): string {
  const norm = parseToStandardDate(rec.fromDate);
  return norm?.dateStr || '';
}

/**
 * Computes an effective end date string for sorting an activity record.
 * Ongoing / current records return '9999-99-99'.
 */
function getActivityRecordEffectiveEndDate(rec: UnitActivityRecord): string {
  if (isOngoingOrCurrentDate(rec.toDate)) return '9999-99-99';
  const norm = parseToStandardDate(rec.toDate);
  return norm?.dateStr || '';
}

/**
 * Sorts unit activity records chronologically (oldest to newest).
 * Records marked with "حتى الآن" or ongoing into current time period are placed at the end as current/active records.
 */
export function sortActivityRecordsChronologically(records: UnitActivityRecord[]): UnitActivityRecord[] {
  if (!records || records.length <= 1) return records ? [...records] : [];
  return [...records].sort((a, b) => {
    const aEnd = getActivityRecordEffectiveEndDate(a);
    const bEnd = getActivityRecordEffectiveEndDate(b);
    const aIsCurrent = aEnd === '9999-99-99';
    const bIsCurrent = bEnd === '9999-99-99';

    if (aIsCurrent && !bIsCurrent) return 1;
    if (!aIsCurrent && bIsCurrent) return -1;

    const startA = getActivityRecordEffectiveStartDate(a);
    const startB = getActivityRecordEffectiveStartDate(b);
    if (startA && startB && startA !== startB) {
      return startA.localeCompare(startB);
    }
    if (aEnd !== bEnd) {
      return aEnd.localeCompare(bEnd);
    }
    const cA = a.createdAt || '';
    const cB = b.createdAt || '';
    return cA.localeCompare(cB);
  });
}

/**
 * Resolves standard default monthly fee for a given activity type
 */
export function getDefaultFeeForActivity(
  activityType: string,
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>
): number {
  if (!activityType) return defaultMonthlyFee || 400;
  const cleanType = activityType.trim();
  if (activityDefaultFees && activityDefaultFees[cleanType] !== undefined) {
    return activityDefaultFees[cleanType];
  }
  switch (cleanType) {
    case 'بدون تحصيل': return 0;
    case 'بدون تشطيب': return 0;
    case 'تحت التشطيب': return 200;
    case 'سكني': return 400;
    case 'سكني مغلق': return 200;
    case 'مفروش': return 600;
    case 'إداري': return 800;
    case 'تجاري': return 500;
    default:
      if (cleanType.includes('بدون تحصيل') || cleanType.includes('بدون تشطيب')) return 0;
      if (cleanType.includes('تشطيب')) return 200;
      return defaultMonthlyFee || 400;
  }
}

/**
 * Resolves the unit's activity and monthly fee for the given target date or period from its activityHistory records.
 * If targetDateOrPeriod is given, matches against the period. Otherwise returns the latest active activity.
 */
export function getLatestActivityFromHistory(
  resident: Resident,
  targetDateOrPeriod?: string | number,
  defaultMonthlyFee: number = 400,
  activityDefaultFees?: Record<string, number>
): {
  activityType: string;
  monthlyFee: number;
  fromDate?: string;
  toDate?: string;
} {
  const fallbackActivity = (resident.activityType || 'سكني').trim();
  const fallbackFee = (resident.monthlyFee !== undefined && !isNaN(resident.monthlyFee) && resident.monthlyFee >= 0)
    ? resident.monthlyFee
    : getDefaultFeeForActivity(fallbackActivity, defaultMonthlyFee, activityDefaultFees);

  const fallback = {
    activityType: fallbackActivity,
    monthlyFee: fallbackFee,
  };

  if (!resident.activityHistory || !Array.isArray(resident.activityHistory) || resident.activityHistory.length === 0) {
    return fallback;
  }

  const historyList = sortActivityRecordsChronologically(resident.activityHistory);
  if (historyList.length === 0) {
    return fallback;
  }

  // Parse target date
  const now = new Date();
  const currentY = String(now.getFullYear());
  const currentM = String(now.getMonth() + 1).padStart(2, '0');
  const currentD = String(now.getDate()).padStart(2, '0');
  const currentMonthStr = `${currentY}-${currentM}`;
  const currentDateStr = `${currentMonthStr}-${currentD}`;

  let targetNorm: { year: string; month: string; dateStr: string };
  if (targetDateOrPeriod && targetDateOrPeriod !== 'latest' && targetDateOrPeriod !== 'current') {
    const parsed = parseToStandardDate(targetDateOrPeriod);
    targetNorm = parsed || { year: currentY, month: currentMonthStr, dateStr: currentDateStr };
  } else {
    targetNorm = { year: currentY, month: currentMonthStr, dateStr: currentDateStr };
  }

  // Find record matching target period (from newest to oldest)
  let matchedRecord: UnitActivityRecord | undefined = undefined;
  for (let i = historyList.length - 1; i >= 0; i--) {
    const rec = historyList[i];
    if (rec.activityType && rec.activityType.trim()) {
      if (isPeriodMatchingTarget(targetNorm, rec.fromDate, rec.toDate)) {
        matchedRecord = rec;
        break;
      }
    }
  }

  // If none matched specifically by date, only take latest if requesting 'latest' or 'current', otherwise return fallback
  if (!matchedRecord) {
    if (targetDateOrPeriod === 'latest' || targetDateOrPeriod === 'current' || !targetDateOrPeriod) {
      matchedRecord = historyList[historyList.length - 1];
    } else {
      return fallback;
    }
  }

  if (matchedRecord && matchedRecord.activityType) {
    const actType = matchedRecord.activityType.trim();
    const fee = (matchedRecord.monthlyFee !== undefined && !isNaN(matchedRecord.monthlyFee) && matchedRecord.monthlyFee >= 0)
      ? matchedRecord.monthlyFee
      : getDefaultFeeForActivity(actType, defaultMonthlyFee, activityDefaultFees);

    return {
      activityType: actType,
      monthlyFee: fee,
      fromDate: matchedRecord.fromDate,
      toDate: matchedRecord.toDate,
    };
  }

  return fallback;
}

/**
 * Convenience wrapper returning historical activity and monthly fee for a resident at a specific date/period.
 */
export function getHistoricalActivityForDate(
  resident: Resident,
  dateOrPeriod?: string | number,
  defaultMonthlyFee?: number,
  activityDefaultFees?: Record<string, number>
): { activityType: string; monthlyFee: number } {
  if (!resident) {
    return { activityType: 'سكني', monthlyFee: defaultMonthlyFee || 400 };
  }
  return getLatestActivityFromHistory(resident, dateOrPeriod, defaultMonthlyFee, activityDefaultFees);
}

/**
 * Synchronizes resident top-level activityType and monthlyFee with the active activity record from activityHistory.
 */
export function syncResidentCurrentActivity(
  r: Resident,
  targetDateOrPeriod?: string | number,
  defaultMonthlyFee?: number,
  activityDefaultFees?: Record<string, number>
): Resident {
  if (!r || !r.activityHistory || !Array.isArray(r.activityHistory) || r.activityHistory.length === 0) return r;
  const act = getLatestActivityFromHistory(r, targetDateOrPeriod, defaultMonthlyFee, activityDefaultFees);
  return {
    ...r,
    activityType: act.activityType || r.activityType,
    monthlyFee: act.monthlyFee !== undefined ? act.monthlyFee : r.monthlyFee,
  };
}

