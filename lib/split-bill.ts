import type { CartItem } from '@/context/CartContext';

export type SplitLine = {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type SplitPerson = {
  key: string;
  name: string;
  phone: string;
  lines: SplitLine[];
  subtotal: number;
};

export type SplitBillResult = {
  hasContributorData: boolean;
  people: SplitPerson[];
  totalFromPeople: number;
};

const UNASSIGNED_KEY = '__unassigned__';

function normalizeName(name: string): string {
  return String(name || '').trim();
}

function personKey(name: string, phone: string): string {
  const n = normalizeName(name).toLowerCase() || 'guest';
  const p = String(phone || '').trim();
  return `${n}|${p}`;
}

export function buildSplitBill(items: CartItem[]): SplitBillResult {
  const personMap = new Map<string, SplitPerson>();
  let hasContributorData = false;

  const upsertLine = (
    pKey: string,
    name: string,
    phone: string,
    itemId: string,
    itemName: string,
    unitPrice: number,
    quantity: number
  ) => {
    if (quantity <= 0) return;

    if (!personMap.has(pKey)) {
      personMap.set(pKey, {
        key: pKey,
        name,
        phone,
        lines: [],
        subtotal: 0,
      });
    }

    const person = personMap.get(pKey)!;
    const existing = person.lines.find((line) => line.itemId === itemId);
    if (existing) {
      existing.quantity += quantity;
      existing.lineTotal = existing.quantity * unitPrice;
    } else {
      person.lines.push({
        itemId,
        itemName,
        quantity,
        unitPrice,
        lineTotal: quantity * unitPrice,
      });
    }

    person.subtotal = person.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  };

  for (const item of items) {
    const itemQty = Math.max(0, Math.floor(Number(item.quantity || 0)));
    if (itemQty <= 0) continue;

    let remaining = itemQty;
    const contributors = Array.isArray(item.contributors) ? item.contributors : [];

    if (contributors.length > 0) {
      hasContributorData = true;
    }

    for (const contributor of contributors) {
      const qty = Math.max(0, Math.floor(Number(contributor?.quantity || 0)));
      if (qty <= 0) continue;

      const contributorName = normalizeName(String(contributor?.name || 'Guest')) || 'Guest';
      const contributorPhone = String(contributor?.phone || '').trim();
      const key = personKey(contributorName, contributorPhone);

      upsertLine(key, contributorName, contributorPhone, item.id, item.name, item.price, qty);
      remaining -= qty;
    }

    if (remaining > 0) {
      upsertLine(UNASSIGNED_KEY, 'Unassigned', '', item.id, item.name, item.price, remaining);
    }
  }

  const people = Array.from(personMap.values()).sort((a, b) => {
    if (a.key === UNASSIGNED_KEY) return 1;
    if (b.key === UNASSIGNED_KEY) return -1;
    return a.name.localeCompare(b.name);
  });

  return {
    hasContributorData,
    people,
    totalFromPeople: people.reduce((sum, person) => sum + person.subtotal, 0),
  };
}
