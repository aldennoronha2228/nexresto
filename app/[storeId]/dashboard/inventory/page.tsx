'use client';

/**
 * Inventory Management (Pro-only feature)
 * Track stock levels, get low-stock alerts, and manage suppliers
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Package, Plus, Search, AlertTriangle, TrendingDown,
    Filter, Download, RefreshCw, Edit2, Trash2, X, Loader2
} from 'lucide-react';
import { ProFeatureGate } from '@/components/dashboard/ProFeatureGate';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { cn } from '@/lib/utils';
import { useRestaurant } from '@/hooks/useRestaurant';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner';

type InventoryItem = {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    reorderLevel: number;
    costPerUnit: number;
    supplier: string;
    status: 'good' | 'low' | 'critical';
};

type InventoryFormState = {
    name: string;
    quantity: string;
    unit: string;
    reorderLevel: string;
    costPerUnit: string;
    supplier: string;
};

const defaultFormState: InventoryFormState = {
    name: '',
    quantity: '0',
    unit: 'pcs',
    reorderLevel: '0',
    costPerUnit: '0',
    supplier: '',
};

function InventoryContent() {
    const { storeId } = useRestaurant();
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'low' | 'critical'>('all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<InventoryFormState>(defaultFormState);

    const loadInventory = async () => {
        if (!storeId) return;
        setLoading(true);
        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) {
                setLoading(false);
                return;
            }

            const res = await fetch(`/api/inventory?restaurantId=${encodeURIComponent(storeId)}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Failed to load inventory');
            setInventory(Array.isArray(data?.items) ? data.items : []);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to load inventory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadInventory();
    }, [storeId]);

    const openAddModal = () => {
        setEditingId(null);
        setForm(defaultFormState);
        setShowAddModal(true);
    };

    const openEditModal = (item: InventoryItem) => {
        setEditingId(item.id);
        setForm({
            name: item.name,
            quantity: String(item.quantity),
            unit: item.unit,
            reorderLevel: String(item.reorderLevel),
            costPerUnit: String(item.costPerUnit),
            supplier: item.supplier,
        });
        setShowAddModal(true);
    };

    const closeModal = () => {
        setShowAddModal(false);
        setEditingId(null);
        setForm(defaultFormState);
    };

    const saveItem = async () => {
        if (!storeId) return;
        if (!form.name.trim()) {
            toast.error('Item name is required');
            return;
        }

        setSaving(true);
        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('Session expired. Please sign in again.');

            const body = {
                restaurantId: storeId,
                itemId: editingId,
                item: {
                    name: form.name.trim(),
                    quantity: Number(form.quantity || '0'),
                    unit: form.unit.trim() || 'pcs',
                    reorderLevel: Number(form.reorderLevel || '0'),
                    costPerUnit: Number(form.costPerUnit || '0'),
                    supplier: form.supplier.trim(),
                },
            };

            const res = await fetch('/api/inventory', {
                method: editingId ? 'PUT' : 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Failed to save item');

            const nextItem = data?.item as InventoryItem;
            if (editingId) {
                setInventory((prev) => prev.map((item) => (item.id === editingId ? nextItem : item)));
                toast.success('Item updated');
            } else {
                setInventory((prev) => [...prev, nextItem].sort((a, b) => a.name.localeCompare(b.name)));
                toast.success('Item added');
            }
            closeModal();
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save item');
        } finally {
            setSaving(false);
        }
    };

    const deleteItem = async (item: InventoryItem) => {
        if (!storeId) return;
        if (!confirm(`Delete ${item.name}?`)) return;

        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('Session expired. Please sign in again.');

            const res = await fetch(
                `/api/inventory?restaurantId=${encodeURIComponent(storeId)}&itemId=${encodeURIComponent(item.id)}`,
                {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Failed to delete item');

            setInventory((prev) => prev.filter((x) => x.id !== item.id));
            toast.success('Item deleted');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to delete item');
        }
    };

    const filteredInventory = inventory.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
                              item.supplier.toLowerCase().includes(search.toLowerCase());
        const matchesFilter = filterStatus === 'all' || item.status === filterStatus || 
                              (filterStatus === 'low' && item.status === 'critical');
        return matchesSearch && matchesFilter;
    });

    const lowStockCount = inventory.filter(i => i.status === 'low' || i.status === 'critical').length;
    const criticalCount = inventory.filter(i => i.status === 'critical').length;
    const totalValue = inventory.reduce((sum, i) => sum + (i.quantity * i.costPerUnit), 0);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'good': return 'bg-green-100 text-green-700';
            case 'low': return 'bg-yellow-100 text-yellow-700';
            case 'critical': return 'bg-red-100 text-red-700';
            default: return 'bg-slate-100 text-slate-700';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Inventory Management</h1>
                    <p className="text-slate-500 text-sm mt-1">Track stock levels and manage supplies</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                    <button
                        onClick={() => void loadInventory()}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                        Refresh
                    </button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={openAddModal}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Item
                    </motion.button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl border border-slate-200 p-5"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                            <Package className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{inventory.length}</p>
                            <p className="text-sm text-slate-500">Total Items</p>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white rounded-2xl border border-slate-200 p-5"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-yellow-50 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-yellow-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{lowStockCount}</p>
                            <p className="text-sm text-slate-500">Low Stock Items</p>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white rounded-2xl border border-slate-200 p-5"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
                            <TrendingDown className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">₹{totalValue.toLocaleString()}</p>
                            <p className="text-sm text-slate-500">Inventory Value</p>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Critical Stock Alert */}
            {criticalCount > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3"
                >
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="flex-1">
                        <p className="font-semibold text-red-800">Critical Stock Alert</p>
                        <p className="text-sm text-red-600">{criticalCount} item(s) need immediate restocking</p>
                    </div>
                    <button className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
                        View Items
                    </button>
                </motion.div>
            )}

            {/* Filters & Search */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search inventory..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-slate-400" />
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as any)}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                        <option value="all">All Items</option>
                        <option value="low">Low Stock</option>
                        <option value="critical">Critical Only</option>
                    </select>
                </div>
            </div>

            {/* Inventory Table */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden"
            >
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Item</th>
                                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Quantity</th>
                                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Supplier</th>
                                <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Value</th>
                                <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">
                                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                                        Loading inventory...
                                    </td>
                                </tr>
                            ) : filteredInventory.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">
                                        No inventory data yet
                                    </td>
                                </tr>
                            ) : (
                                filteredInventory.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4">
                                            <p className="font-medium text-slate-900">{item.name}</p>
                                            <p className="text-xs text-slate-500">Reorder at {item.reorderLevel} {item.unit}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-semibold text-slate-900">{item.quantity}</span>
                                            <span className="text-slate-500 ml-1">{item.unit}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "px-2.5 py-1 rounded-full text-xs font-medium capitalize",
                                                getStatusColor(item.status)
                                            )}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{item.supplier}</td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-900">
                                            ₹{(item.quantity * item.costPerUnit).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => openEditModal(item)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                                                    <Edit2 className="w-4 h-4 text-slate-400" />
                                                </button>
                                                <button onClick={() => void deleteItem(item)} className="p-2 hover:bg-red-50 rounded-lg transition-colors">
                                                    <Trash2 className="w-4 h-4 text-red-400" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </motion.div>

            <AnimatePresence>
                {showAddModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={closeModal}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 8 }}
                            className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Item' : 'Add Item'}</h3>
                                <button onClick={closeModal} className="p-2 rounded-lg hover:bg-slate-100">
                                    <X className="w-4 h-4 text-slate-500" />
                                </button>
                            </div>

                            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="sm:col-span-2">
                                    <span className="block text-xs text-slate-500 mb-1">Name</span>
                                    <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-slate-200" />
                                </label>
                                <label>
                                    <span className="block text-xs text-slate-500 mb-1">Quantity</span>
                                    <input type="number" min="0" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-slate-200" />
                                </label>
                                <label>
                                    <span className="block text-xs text-slate-500 mb-1">Unit</span>
                                    <input value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-slate-200" />
                                </label>
                                <label>
                                    <span className="block text-xs text-slate-500 mb-1">Reorder Level</span>
                                    <input type="number" min="0" value={form.reorderLevel} onChange={(e) => setForm((p) => ({ ...p, reorderLevel: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-slate-200" />
                                </label>
                                <label>
                                    <span className="block text-xs text-slate-500 mb-1">Cost Per Unit (INR)</span>
                                    <input type="number" min="0" value={form.costPerUnit} onChange={(e) => setForm((p) => ({ ...p, costPerUnit: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-slate-200" />
                                </label>
                                <label className="sm:col-span-2">
                                    <span className="block text-xs text-slate-500 mb-1">Supplier</span>
                                    <input value={form.supplier} onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-slate-200" />
                                </label>
                            </div>

                            <div className="px-5 pb-5 flex items-center justify-end gap-2">
                                <button onClick={closeModal} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700">Cancel</button>
                                <button onClick={() => void saveItem()} disabled={saving} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white disabled:opacity-60 inline-flex items-center gap-2">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {editingId ? 'Save Changes' : 'Add Item'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function InventoryPage() {
    return (
        <RoleGuard requiredPermission="can_view_inventory">
            <ProFeatureGate 
                feature="Inventory Management" 
                description="Keep track of your stock levels, get automatic low-stock alerts, and manage supplier information all in one place."
            >
                <InventoryContent />
            </ProFeatureGate>
        </RoleGuard>
    );
}
