export function getTenantTableStorageKey(restaurantId: string): string {
    return `nexresto:last-table-id:${restaurantId}`;
}

export function getTenantOrderHistoryStorageKey(restaurantId: string): string {
    return `nexresto:order-history:${restaurantId}`;
}

export function getTenantCustomerStorageKey(restaurantId: string): string {
    return `nexresto:customer-profile:${restaurantId}`;
}

export function resolveRestaurantIdFromSearch(defaultValue = 'default'): string {
    if (typeof window === 'undefined') return defaultValue;
    const params = new URLSearchParams(window.location.search);
    const restaurantId = (params.get('restaurant') || '').trim();
    return restaurantId || defaultValue;
}
