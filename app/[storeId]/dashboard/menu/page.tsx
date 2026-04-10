'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, Edit, Trash2, RefreshCw, AlertCircle, X, Save, Upload, FileSpreadsheet, Download, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { fetchMenuItems, fetchCategories, toggleMenuItemAvailability, deleteMenuItem, createMenuItem, updateMenuItem } from '@/lib/firebase-api';
import type { MenuItem, Category } from '@/lib/types';
import { setItemAvailability, seedAvailabilityMap, applyAvailabilityOverrides } from '@/lib/menuAvailability';
import { useRestaurant } from '@/hooks/useRestaurant';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { tenantAuth, adminAuth } from '@/lib/firebase';

interface ItemFormData { name: string; price: string; category_id: string; type: 'veg' | 'non-veg'; image_url: string; }

interface ImportResult {
    success: boolean;
    message: string;
    imported: number;
    skipped: number;
    errors: string[];
    categoriesCreated: string[];
}

function ExcelUploadModal({ open, onClose, tenantId, onImportComplete }: { open: boolean; onClose: () => void; tenantId: string | null; onImportComplete: () => void; }) {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
        else if (e.type === 'dragleave') setDragActive(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files?.[0]) {
            const f = e.dataTransfer.files[0];
            if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')) {
                setFile(f);
                setResult(null);
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const handleUpload = async () => {
        if (!file || !tenantId) return;
        setUploading(true);
        setResult(null);
        try {
            const activeUser = adminAuth.currentUser || tenantAuth.currentUser;
            if (!activeUser) {
                throw new Error('Missing active session');
            }
            const idToken = await activeUser.getIdToken(true);

            const formData = new FormData();
            formData.append('file', file);
            formData.append('tenantId', tenantId);
            formData.append('restaurantId', tenantId);

            const res = await fetch('/api/menu/import', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                },
                body: formData,
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Import failed');

            setResult(data);
            if (data.imported > 0) onImportComplete();
        } catch (err: any) {
            setResult({ success: false, message: err.message, imported: 0, skipped: 0, errors: [err.message], categoriesCreated: [] });
        } finally {
            setUploading(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setResult(null);
        onClose();
    };

    const downloadTemplate = () => {
        const csvContent = 'Name,Price,Category,Type,Image URL\nButter Chicken,350,Main Course,non-veg,\nPaneer Tikka,280,Starters,veg,\nMango Lassi,120,Beverages,veg,';
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'menu-template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!open) return null;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="p-6 border-b border-slate-200/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                            <FileSpreadsheet className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Import Menu from Excel</h3>
                            <p className="text-xs text-slate-500">Upload .xlsx, .xls, or .csv file</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
                </div>

                <div className="p-6 space-y-4">
                    {!result ? (
                        <>
                            <div
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                onClick={() => inputRef.current?.click()}
                                className={cn(
                                    'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                                    dragActive ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50',
                                    file && 'border-emerald-500 bg-emerald-50'
                                )}
                            >
                                <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                                {file ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle className="w-12 h-12 text-emerald-500" />
                                        <p className="font-medium text-slate-900">{file.name}</p>
                                        <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <Upload className="w-12 h-12 text-slate-400" />
                                        <p className="font-medium text-slate-700">Drop your Excel file here</p>
                                        <p className="text-sm text-slate-500">or click to browse</p>
                                    </div>
                                )}
                            </div>

                            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                                <p className="text-sm font-medium text-slate-700">Expected Columns:</p>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-500"></span><span className="text-slate-600">Name <span className="text-rose-500">*</span></span></div>
                                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-500"></span><span className="text-slate-600">Price <span className="text-rose-500">*</span></span></div>
                                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-500"></span><span className="text-slate-600">Category <span className="text-rose-500">*</span></span></div>
                                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-400"></span><span className="text-slate-600">Type (veg/non-veg)</span></div>
                                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-400"></span><span className="text-slate-600">Image URL</span></div>
                                </div>
                                <button onClick={downloadTemplate} className="mt-2 flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 font-medium">
                                    <Download className="w-3.5 h-3.5" /> Download Template
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className={cn('p-4 rounded-xl', result.success && result.imported > 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200')}>
                                <div className="flex items-center gap-3">
                                    {result.success && result.imported > 0 ? (
                                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                                    ) : (
                                        <AlertCircle className="w-6 h-6 text-amber-600" />
                                    )}
                                    <div>
                                        <p className="font-medium text-slate-900">{result.message}</p>
                                        <p className="text-sm text-slate-600">{result.imported} imported, {result.skipped} skipped</p>
                                    </div>
                                </div>
                            </div>

                            {result.categoriesCreated.length > 0 && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                                    <p className="text-sm font-medium text-blue-700 mb-1">New categories created:</p>
                                    <p className="text-sm text-blue-600">{result.categoriesCreated.join(', ')}</p>
                                </div>
                            )}

                            {result.errors.length > 0 && (
                                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 max-h-40 overflow-y-auto">
                                    <p className="text-sm font-medium text-rose-700 mb-1">Errors:</p>
                                    <ul className="text-xs text-rose-600 space-y-1">
                                        {result.errors.slice(0, 10).map((err, i) => <li key={i}>• {err}</li>)}
                                        {result.errors.length > 10 && <li className="text-rose-500">...and {result.errors.length - 10} more</li>}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 pt-0 flex gap-3">
                    <button onClick={handleClose} className="flex-1 h-11 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                        {result ? 'Close' : 'Cancel'}
                    </button>
                    {!result && (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleUpload}
                            disabled={uploading || !file}
                            className="flex-1 h-11 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {uploading ? 'Importing...' : 'Import Items'}
                        </motion.button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

function CategoryModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (name: string) => Promise<void>; }) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    if (!open) return null;
    const handleSubmit = async () => {
        if (!name) return;
        setSaving(true);
        try { await onSave(name); onClose(); setName(''); } finally { setSaving(false); }
    };
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200/60 flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-slate-900">New Category</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Category Name</label><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sushi" className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                </div>
                <div className="p-6 pt-0 flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSubmit} disabled={saving || !name} className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
}

function ItemModal({ open, onClose, categories, editItem, onSave }: { open: boolean; onClose: () => void; categories: Category[]; editItem?: MenuItem | null; onSave: (data: ItemFormData) => Promise<void>; }) {
    const [form, setForm] = useState<ItemFormData>({ name: '', price: '', category_id: categories[0]?.id ?? '', type: 'veg', image_url: '' });
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (editItem) { setForm({ name: editItem.name, price: String(editItem.price), category_id: editItem.category_id, type: editItem.type, image_url: editItem.image_url ?? '' }); }
        else { setForm({ name: '', price: '', category_id: categories[0]?.id ?? '', type: 'veg', image_url: '' }); }
    }, [editItem, categories]);
    const handleSubmit = async () => {
        if (!form.name || !form.price || !form.category_id) return;
        setSaving(true);
        try { await onSave(form); onClose(); } finally { setSaving(false); }
    };
    if (!open) return null;
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-6 border-b border-slate-200/60 flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-slate-900">{editItem ? 'Edit Item' : 'Add Menu Item'}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Item Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Butter Chicken" className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Price (₹)</label><input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="e.g. 280" className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Category</label><select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-2">Type</label><div className="flex gap-3">{(['veg', 'non-veg'] as const).map(t => (<button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} className={cn('flex-1 h-10 rounded-xl text-sm font-medium border transition-all', form.type === t ? t === 'veg' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-rose-500 text-white border-rose-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>{t === 'veg' ? '🟢 Veg' : '🔴 Non-Veg'}</button>))}</div></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Image URL (optional)</label><input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="Leave blank if you don't want to add a photo" className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
                </div>
                <div className="p-6 pt-0 flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSubmit} disabled={saving || !form.name || !form.price} className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {editItem ? 'Save Changes' : 'Add Item'}
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
}

export default function MenuManagementPage() {
    const [items, setItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showExcelModal, setShowExcelModal] = useState(false);
    const [editItem, setEditItem] = useState<MenuItem | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const { storeId: tenantId, db: contextDb, loading: tenantLoading } = useRestaurant();

    const loadDataViaServer = async () => {
        if (!tenantId) {
            throw new Error('Missing tenant context');
        }

        let idToken: string | null = null;
        const activeUser = adminAuth.currentUser || tenantAuth.currentUser;
        if (activeUser) {
            idToken = await activeUser.getIdToken(true);
        }

        if (!idToken) {
            throw new Error('Missing active session');
        }

        const response = await fetch(`/api/menu/list?restaurantId=${encodeURIComponent(tenantId)}`, {
            headers: { Authorization: `Bearer ${idToken}` },
        });

        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.error || 'Failed to load menu via server');
        }

        const menuData = (payload.menuItems || []) as MenuItem[];
        const catData = (payload.categories || []) as Category[];
        seedAvailabilityMap(menuData.map(i => ({ id: i.id, available: i.available ?? true })), tenantId);
        setItems(applyAvailabilityOverrides(menuData, tenantId));
        setCategories(catData);
    };

    const loadData = async () => {
        if (!tenantId || !contextDb) {
            setLoading(false);
            return;
        }
        try {
            setError(null);
            try {
                await loadDataViaServer();
                return;
            } catch {
                // Fall back to direct Firestore reads if server endpoint is unavailable.
                const [menuData, catData] = await Promise.all([
                    fetchMenuItems(tenantId, contextDb),
                    fetchCategories(tenantId, contextDb)
                ]);
                seedAvailabilityMap(menuData.map(i => ({ id: i.id, available: i.available ?? true })), tenantId);
                setItems(applyAvailabilityOverrides(menuData, tenantId));
                setCategories(catData);
            }
        } catch (err: any) {
            setError(err?.message || 'Access denied for this restaurant menu. Please sign out and sign in again, then verify your role/restaurant access.');
        }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, [tenantId, contextDb]);

    const filteredItems = items.filter(item => {
        const matchesCat = selectedCategory === 'all' || item.category_id === selectedCategory;
        return matchesCat && item.name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const handleToggleAvailability = async (itemId: string, current: boolean) => {
        if (!tenantId || !contextDb) return;
        const next = !current;
        setActionLoading(itemId);
        // Optimistic local update
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, available: next } : i));
        // Persist to localStorage immediately
        setItemAvailability(itemId, next, tenantId);
        try { await toggleMenuItemAvailability(tenantId, itemId, next, contextDb); }
        catch { setItems(prev => prev.map(i => i.id === itemId ? { ...i, available: current } : i)); }
        setActionLoading(null);
    };

    const handleDelete = async (itemId: string) => {
        if (!tenantId || !contextDb) return;
        if (!confirm('Delete this menu item? This cannot be undone.')) return;
        setActionLoading(itemId);
        setItems(prev => prev.filter(i => i.id !== itemId));
        try { await deleteMenuItem(tenantId, itemId, contextDb); } catch { loadData(); }
        setActionLoading(null);
    };

    const handleSaveItem = async (form: ItemFormData) => {
        if (!tenantId || !contextDb) return;
        const payload = { name: form.name, price: parseFloat(form.price), category_id: form.category_id, type: form.type, image_url: form.image_url || undefined };
        if (editItem) { await updateMenuItem(tenantId, editItem.id, payload, contextDb); } else { await createMenuItem(tenantId, payload, contextDb); }
        await loadData();
    };

    const handleSaveCategory = async (name: string) => {
        if (!tenantId || !contextDb) return;
        const activeUser = adminAuth.currentUser || tenantAuth.currentUser;
        if (!activeUser) throw new Error('Missing active session');

        const idToken = await activeUser.getIdToken(true);
        const res = await fetch('/api/menu/categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ restaurantId: tenantId, name }),
        });
        const payload = await res.json();
        if (!res.ok) {
            throw new Error(payload?.error || 'Failed to create category');
        }
        await loadData();
    };

    const handleDeleteCategory = async (categoryId: string, categoryName: string, categoryItemCount: number) => {
        if (!tenantId || !contextDb) return;
        if (categories.length <= 1) {
            setError('At least one category is required.');
            return;
        }

        const confirmMessage = categoryItemCount > 0
            ? `Delete "${categoryName}"? ${categoryItemCount} item(s) will be moved to another category.`
            : `Delete "${categoryName}"?`;

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            setActionLoading(categoryId);
            const activeUser = adminAuth.currentUser || tenantAuth.currentUser;
            if (!activeUser) throw new Error('Missing active session');

            const idToken = await activeUser.getIdToken(true);
            const res = await fetch(`/api/menu/categories?restaurantId=${encodeURIComponent(tenantId)}&categoryId=${encodeURIComponent(categoryId)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${idToken}` },
            });

            const payload = await res.json();
            if (!res.ok) {
                throw new Error(payload?.error || 'Failed to delete category');
            }

            if (selectedCategory === categoryId) {
                setSelectedCategory('all');
            }

            await loadData();
        } catch (err: any) {
            setError(err?.message || 'Failed to delete category');
        } finally {
            setActionLoading(null);
        }
    };

    const categoryList = [
        { id: 'all', name: 'All Items', count: items.length },
        ...categories.map(c => ({ id: c.id, name: c.name, count: items.filter(i => i.category_id === c.id).length })),
    ];

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
            <span className="ml-3 text-slate-500">Loading menu from Firebase…</span>
        </div>
    );

    return (
        <RoleGuard requiredPermission="can_view_menu">
            <div className="space-y-6 lg:space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl lg:text-4xl font-bold text-slate-900 tracking-tight">Menu Management</h1>
                        <p className="text-sm text-slate-500 mt-1">Manage your restaurant menu items and availability</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <button onClick={loadData} className="p-2.5 rounded-xl bg-white/70 border border-white/40 hover:bg-white transition-colors shadow-sm shrink-0" title="Refresh"><RefreshCw className="w-4 h-4 text-rose-500" /></button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setShowExcelModal(true)} className="flex-1 sm:flex-none min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 premium-glass text-slate-700 rounded-xl font-medium text-sm hover:bg-white transition-colors">
                            <FileSpreadsheet className="w-4 h-4" />Import Excel
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setEditItem(null); setShowModal(true); }} className="flex-1 sm:flex-none min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#ff4757] to-[#ff6b81] text-white rounded-xl font-medium text-sm shadow-lg shadow-rose-500/35 hover:shadow-rose-500/50 transition-shadow">
                            <Plus className="w-4 h-4" />Add Item
                        </motion.button>
                    </div>
                </div>

                {error && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{error}</span></motion.div>}

                <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:w-64 flex-shrink-0">
                        <div className="premium-glass p-5">
                            <h3 className="text-sm font-semibold text-slate-900 mb-3">Categories</h3>
                            <div className="lg:space-y-1 flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0">
                                {categoryList.map(cat => (
                                    <div key={cat.id} className="flex items-center group shrink-0 lg:shrink">
                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setSelectedCategory(cat.id)} className={cn('flex items-center gap-2 px-3 py-2 rounded-2xl text-sm font-medium transition-all whitespace-nowrap min-w-fit lg:w-full', selectedCategory === cat.id ? 'bg-gradient-to-r from-rose-50 to-orange-50 text-rose-600 border border-rose-200/60 shadow-sm' : 'text-slate-600 hover:bg-white/70')}>
                                            <span className={cn('inline-block w-2.5 h-2.5 rounded-full', selectedCategory === cat.id ? 'bg-rose-500' : 'bg-slate-300')} />
                                            <span className="text-left truncate max-w-[120px] lg:max-w-none lg:flex-1">{cat.name}</span>
                                            <span className={cn('px-2 py-0.5 rounded-md text-[11px] font-medium', selectedCategory === cat.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600')}>{cat.count}</span>
                                        </motion.button>
                                        {cat.id !== 'all' && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    void handleDeleteCategory(cat.id, cat.name, cat.count);
                                                }}
                                                title={`Delete ${cat.name}`}
                                                className="ml-1 p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors shrink-0"
                                                disabled={actionLoading === cat.id}
                                            >
                                                {actionLoading === cat.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-200/60">
                                <motion.button onClick={() => setShowCategoryModal(true)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-xl text-sm font-medium text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/50 transition-colors">
                                    <Plus className="w-4 h-4" /> Add Category
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>

                    <div className="flex-1 space-y-4">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input type="text" placeholder="Search menu items…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-12 pl-12 pr-4 bg-white/75 border border-white/40 rounded-2xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500/40 transition-all shadow-sm backdrop-blur" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                            {filteredItems.map((item, i) => {
                                const catName = item.categories?.name ?? categories.find(c => c.id === item.category_id)?.name ?? 'Unknown';
                                const isDeleting = actionLoading === item.id;
                                return (
                                    <motion.div key={item.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }} whileHover={{ y: -6 }} className={cn('premium-glass rounded-2xl p-5 hover:scale-[1.02] border transition-all', item.available ? 'border-white/40' : 'border-white/30 opacity-60', isDeleting && 'opacity-40')}>
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-100 to-emerald-50 border border-white/60 flex items-center justify-center overflow-hidden shadow-sm">
                                                {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover rounded-xl" /> : <span className="text-sm font-semibold text-slate-500">{catName.trim().charAt(0).toUpperCase() || 'M'}</span>}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span title={item.type} className={cn('w-3 h-3 rounded-full border-2', item.type === 'veg' ? 'bg-emerald-500 border-emerald-600' : 'bg-rose-500 border-rose-600')} />
                                                <Switch checked={item.available ?? true} onCheckedChange={() => handleToggleAvailability(item.id, item.available ?? true)} disabled={isDeleting} />
                                            </div>
                                        </div>
                                        <h3 className="font-semibold text-slate-900 mb-1 tracking-tight">{item.name}</h3>
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg font-medium">{catName}</span>
                                            <span className="text-xl font-extrabold text-slate-900">₹{item.price}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { setEditItem(item); setShowModal(true); }} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium transition-colors"><Edit className="w-3.5 h-3.5" /> Edit</motion.button>
                                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleDelete(item.id)} disabled={isDeleting} className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></motion.button>
                                        </div>
                                        {!(item.available ?? true) && <div className="mt-3 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg"><p className="text-xs text-amber-700 font-medium">Currently Unavailable</p></div>}
                                    </motion.div>
                                );
                            })}
                        </div>
                        {filteredItems.length === 0 && <div className="premium-glass p-12 text-center"><div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center"><Search className="w-5 h-5 text-slate-500" /></div><p className="text-slate-600 font-medium">No menu items found</p><p className="text-slate-500 text-sm mt-1">Try a different category or add your next signature dish.</p></div>}
                    </div>
                </div>

                <AnimatePresence>
                    {showModal && <ItemModal open={showModal} onClose={() => { setShowModal(false); setEditItem(null); }} categories={categories} editItem={editItem} onSave={handleSaveItem} />}
                    {showCategoryModal && <CategoryModal open={showCategoryModal} onClose={() => setShowCategoryModal(false)} onSave={handleSaveCategory} />}
                    {showExcelModal && <ExcelUploadModal open={showExcelModal} onClose={() => setShowExcelModal(false)} tenantId={tenantId} onImportComplete={loadData} />}
                </AnimatePresence>
            </div>
        </RoleGuard>
    );
}
