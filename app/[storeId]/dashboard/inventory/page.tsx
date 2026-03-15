'use client';

/**
 * Inventory Management (Pro-only feature)
 * Track stock levels, get low-stock alerts, and manage suppliers
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    Package, Plus, Search, AlertTriangle, TrendingDown,
    Filter, Download, RefreshCw, Edit2, Trash2, X
} from 'lucide-react';
import { ProFeatureGate } from '@/components/dashboard/ProFeatureGate';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { cn } from '@/lib/utils';

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

function InventoryContent() {
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'low' | 'critical'>('all');
    const [showAddModal, setShowAddModal] = useState(false);

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
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowAddModal(true)}
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
                            {filteredInventory.length === 0 ? (
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
                                                <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                                                    <Edit2 className="w-4 h-4 text-slate-400" />
                                                </button>
                                                <button className="p-2 hover:bg-red-50 rounded-lg transition-colors">
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
