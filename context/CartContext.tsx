'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { getTenantOrderHistoryStorageKey, resolveRestaurantIdFromSearch } from '@/lib/client/storage/tenantKeys';

export interface MenuItem {
    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    category: string;
}

export interface CartItem extends MenuItem {
    quantity: number;
    contributors?: Array<{
        name: string;
        phone: string;
        quantity: number;
    }>;
}

export interface Order {
    id: string;
    orderNumber: number;
    items: CartItem[];
    totalPrice: number;
    date: string;
    time: string;
}

interface CartContextType {
    cart: CartItem[];
    addToCart: (item: MenuItem) => void;
    removeFromCart: (id: string) => void;
    updateQuantity: (id: string, quantity: number) => void;
    clearCart: () => void;
    totalItems: number;
    totalPrice: number;
    isCartOpen: boolean;
    setIsCartOpen: (open: boolean) => void;
    orderHistory: Order[];
    saveOrder: (order: Order) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function resolveRestaurantScope(): string {
    return resolveRestaurantIdFromSearch('default');
}

function orderHistoryKey(): string {
    return getTenantOrderHistoryStorageKey(resolveRestaurantScope());
}

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [orderHistory, setOrderHistory] = useState<Order[]>(() => {
        if (typeof window === 'undefined') return [];
        const savedHistory = localStorage.getItem(orderHistoryKey());
        if (!savedHistory) return [];
        try {
            return JSON.parse(savedHistory) as Order[];
        } catch {
            return [];
        }
    });

    const addToCart = (item: MenuItem) => {
        setCart((prevCart) => {
            const existingItem = prevCart.find((cartItem) => cartItem.id === item.id);
            if (existingItem) {
                return prevCart.map((cartItem) =>
                    cartItem.id === item.id
                        ? { ...cartItem, quantity: cartItem.quantity + 1 }
                        : cartItem
                );
            }
            return [...prevCart, { ...item, quantity: 1 }];
        });
    };

    const removeFromCart = (id: string) => {
        setCart((prevCart) => prevCart.filter((item) => item.id !== id));
    };

    const updateQuantity = (id: string, quantity: number) => {
        if (quantity <= 0) {
            removeFromCart(id);
            return;
        }
        setCart((prevCart) =>
            prevCart.map((item) =>
                item.id === id ? { ...item, quantity } : item
            )
        );
    };

    const clearCart = () => {
        setCart([]);
    };

    const saveOrder = (order: Order) => {
        const updatedHistory = [order, ...orderHistory];
        setOrderHistory(updatedHistory);
        localStorage.setItem(orderHistoryKey(), JSON.stringify(updatedHistory));
    };

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return (
        <CartContext.Provider
            value={{
                cart,
                addToCart,
                removeFromCart,
                updateQuantity,
                clearCart,
                totalItems,
                totalPrice,
                isCartOpen,
                setIsCartOpen,
                orderHistory,
                saveOrder,
            }}
        >
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
};
