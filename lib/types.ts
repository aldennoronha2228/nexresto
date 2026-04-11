// ========================================
// TYPE DEFINITIONS (matching Hotel-Menu0001 Supabase schema)
// ========================================

export interface MenuItem {
    id: string;
    name: string;
    price: number;
    category_id: string;
    type: 'veg' | 'non-veg';
    image_url?: string | null;
    available?: boolean;
    categories?: { id: string; name: string } | null;
}

export interface Category {
    id: string;
    name: string;
    display_order?: number;
}

export interface OrderItem {
    id: string;
    order_id: string;
    menu_item_id: string | null;
    item_name: string;
    item_price: number;
    quantity: number;
}

export interface Order {
    id: string;
    daily_order_number?: number;
    restaurant_id: string;
    table_number: string;
    total: number;
    status: 'new' | 'preparing' | 'done' | 'paid' | 'cancelled';
    created_at: string;
    user_id?: string | null;
    order_items?: OrderItem[];
}

export interface Restaurant {
    id: string;
    name: string;
    logo?: string;
}

// Flat order shape used internally in the dashboard
export interface DashboardOrder {
    id: string;
    daily_order_number?: number;
    table: string;
    items: { id: string; name: string; quantity: number; price: number }[];
    status: 'new' | 'preparing' | 'done' | 'paid' | 'cancelled';
    total: number;
    time: string;
    created_at: string;
}
