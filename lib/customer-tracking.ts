import {
    arrayUnion,
    doc,
    runTransaction,
    serverTimestamp,
    type Firestore,
} from 'firebase/firestore';

export type CapturedCustomer = {
    name: string;
    phone: string;
    tableNumber?: string;
};

export function normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').slice(-10);
}

export function isValidPhone(phone: string): boolean {
    return /^\d{10}$/.test(normalizePhone(phone));
}

export function isValidCustomerName(name: string): boolean {
    return name.trim().length >= 2;
}

function getCustomerRef(db: Firestore, restaurantId: string, phone: string) {
    const normalizedPhone = normalizePhone(phone);
    return doc(db, 'restaurants', restaurantId, 'customers', normalizedPhone);
}

export async function upsertCustomerVisit(
    db: Firestore,
    restaurantId: string,
    customer: CapturedCustomer,
    options?: { incrementVisit?: boolean }
): Promise<{ phone: string; name: string }> {
    const normalizedPhone = normalizePhone(customer.phone);
    const cleanedName = customer.name.trim().slice(0, 80);
    const tableNumber = String(customer.tableNumber || '').trim().slice(0, 20);
    const incrementVisit = options?.incrementVisit ?? true;

    if (!restaurantId.trim()) throw new Error('Missing restaurant id');
    if (!isValidCustomerName(cleanedName)) throw new Error('Please enter a valid name');
    if (!isValidPhone(normalizedPhone)) throw new Error('Please enter a valid 10-digit phone number');

    const customerRef = getCustomerRef(db, restaurantId, normalizedPhone);

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(customerRef);
        const existing = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        const existingCount = Number(existing?.visitCount || 0);

        const nextCount = snap.exists()
            ? (incrementVisit ? existingCount + 1 : Math.max(existingCount, 1))
            : 1;

        tx.set(
            customerRef,
            {
                name: cleanedName,
                phone: normalizedPhone,
                lastTableNumber: tableNumber || null,
                lastVisited: serverTimestamp(),
                visitCount: nextCount,
                orders: Array.isArray(existing?.orders) ? existing?.orders : [],
                totalSpend: Number(existing?.totalSpend || 0),
            },
            { merge: true }
        );
    });

    return { phone: normalizedPhone, name: cleanedName };
}

export async function attachOrderToCustomer(
    db: Firestore,
    restaurantId: string,
    phone: string,
    orderId: string,
    orderTotal: number,
    customerName?: string,
    tableNumber?: string
): Promise<void> {
    const normalizedPhone = normalizePhone(phone);
    const sanitizedTableNumber = String(tableNumber || '').trim().slice(0, 20);
    if (!restaurantId.trim() || !normalizedPhone || !orderId) return;

    const customerRef = getCustomerRef(db, restaurantId, normalizedPhone);

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(customerRef);
        const existing = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        const existingSpend = Number(existing?.totalSpend || 0);
        const existingCount = Number(existing?.visitCount || 0);

        tx.set(
            customerRef,
            {
                name: (customerName || String(existing?.name || 'Guest')).trim().slice(0, 80),
                phone: normalizedPhone,
                lastTableNumber: sanitizedTableNumber || null,
                lastVisited: serverTimestamp(),
                visitCount: Math.max(existingCount, 1),
                orders: arrayUnion(orderId),
                totalSpend: existingSpend + Math.max(0, Number(orderTotal || 0)),
            },
            { merge: true }
        );
    });
}
