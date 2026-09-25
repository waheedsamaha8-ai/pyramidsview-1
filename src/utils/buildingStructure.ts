import { Resident, FloorConfig } from '../types';

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
  const startParsed = parseFlatNumber(floor.startUnitNumber ?? (floor.unitNumbers?.[0] ?? 101));
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
