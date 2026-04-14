'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense, Component, type ErrorInfo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Download, QrCode, Trash2, Minus, Check, FolderOpen, Save, X, ZoomIn, Share2, Lock, Sparkles, Edit3, Users, ScanLine, Upload } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls, TransformControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getDefaultTables, setTables as setSharedTables, type Table } from '@/data/sharedData';
import { useAuth } from '@/context/AuthContext';
import { useRestaurant } from '@/hooks/useRestaurant';
import { ProFeatureGate, ProBadge } from '@/components/dashboard/ProFeatureGate';
import { adminAuth, db, tenantAuth } from '@/lib/firebase';
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';

const MENU_CUSTOMER_PATH = process.env.NEXT_PUBLIC_MENU_CUSTOMER_PATH ?? '/customer';
const PRODUCTION_MENU_BASE_URL = 'https://nexresto.in';

function isLocalHostname(hostname: string): boolean {
    const value = (hostname || '').toLowerCase();
    return value === 'localhost' || value === '127.0.0.1' || value === '0.0.0.0' || value.endsWith('.local');
}

function normalizeOrigin(value: string): string | null {
    const raw = (value || '').trim();
    if (!raw) return null;
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    try {
        const parsed = new URL(withProtocol);
        if (isLocalHostname(parsed.hostname)) return null;
        return parsed.origin;
    } catch {
        return null;
    }
}

function normalizeOriginAllowLocal(value: string): string | null {
    const raw = (value || '').trim();
    if (!raw) return null;
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    try {
        const parsed = new URL(withProtocol);
        return parsed.origin;
    } catch {
        return null;
    }
}

function resolveMenuBaseUrl() {
    const configuredBase =
        normalizeOrigin(process.env.NEXT_PUBLIC_MENU_BASE_URL ?? '') ||
        normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? '') ||
        normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL ?? '');

    return configuredBase || PRODUCTION_MENU_BASE_URL;
}

function getTableMenuUrl(baseUrl: string, tableId: string, restaurantId?: string | null) {
    const normalizedBase = normalizeOriginAllowLocal(baseUrl || '') || resolveMenuBaseUrl();
    const normalizedPath = restaurantId
        ? `/${encodeURIComponent(restaurantId)}/menu`
        : (MENU_CUSTOMER_PATH.startsWith('/') ? MENU_CUSTOMER_PATH : `/${MENU_CUSTOMER_PATH}`);

    try {
        const url = new URL(normalizedPath, normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`);
        url.searchParams.set('table', tableId);
        return url.toString();
    } catch {
        const params = new URLSearchParams();
        params.set('table', tableId);
        return `${normalizedBase}${normalizedPath}?${params.toString()}`;
    }
}

interface Wall { id: string; x: number; y: number; width: number; height: number; orientation: 'horizontal' | 'vertical' }
interface Desk { id: string; x: number; y: number; width: number; height: number }
interface FloorPlan { id: string; name: string; tables: Table[]; walls: Wall[]; desks: Desk[] }
type AiLayoutTable = { id: string; type: 'standard' | 'booth' | 'high-top'; x: number; y: number };
type TableShape = 'round' | 'rectangle';
type TableColor = '#8b5e3c' | '#334155' | '#1f3b5c' | '#4f6f52' | '#6b2d3e';
type DetectedTable3D = AiLayoutTable & {
    seats: number;
    elevation?: number;
    rotationY?: number;
    tableShape?: TableShape;
    tableColor?: TableColor;
};
type ValidatedLayoutItem = {
    id: string;
    shape: 'round' | 'rectangle';
    capacity: number;
    coordinates: { x: number; y: number };
    clearance_buffer: number;
};

const VALIDATED_LAYOUT_JSON: { metadata: { status: 'success'; error: null; gridSize: '100x100' }; layout: ValidatedLayoutItem[] } = {
    metadata: {
        status: 'success',
        error: null,
        gridSize: '100x100',
    },
    layout: [
        { id: 'T1', shape: 'round', capacity: 8, coordinates: { x: 18, y: 74 }, clearance_buffer: 10 },
        { id: 'T2', shape: 'round', capacity: 8, coordinates: { x: 42, y: 74 }, clearance_buffer: 10 },
        { id: 'T3', shape: 'round', capacity: 8, coordinates: { x: 66, y: 74 }, clearance_buffer: 10 },
        { id: 'T4', shape: 'round', capacity: 6, coordinates: { x: 22, y: 46 }, clearance_buffer: 10 },
        { id: 'T5', shape: 'round', capacity: 8, coordinates: { x: 46, y: 46 }, clearance_buffer: 10 },
        { id: 'T6', shape: 'round', capacity: 6, coordinates: { x: 70, y: 46 }, clearance_buffer: 10 },
        { id: 'T7', shape: 'round', capacity: 8, coordinates: { x: 84, y: 20 }, clearance_buffer: 10 },
    ],
};

const TABLE_COLOR_OPTIONS: Array<{ value: TableColor; label: string }> = [
    { value: '#8b5e3c', label: 'Walnut' },
    { value: '#334155', label: 'Charcoal' },
    { value: '#1f3b5c', label: 'Navy' },
    { value: '#4f6f52', label: 'Sage' },
    { value: '#6b2d3e', label: 'Burgundy' },
];

function resolveTableShape(table: DetectedTable3D): TableShape {
    if (table.tableShape) return table.tableShape;
    return table.type === 'booth' ? 'rectangle' : 'round';
}

function resolveTableColor(table: DetectedTable3D): TableColor {
    return table.tableColor ?? '#8b5e3c';
}

function hexToRgba(hex: string, alpha: number) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function QRPreviewModal({ table, onClose, baseUrl, restaurantId }: { table: Table; onClose: () => void; baseUrl: string; restaurantId?: string | null }) {
    const url = getTableMenuUrl(baseUrl, table.id, restaurantId);
    const downloadQR = useCallback(() => {
        const canvas = document.getElementById(`qr-preview-${table.id}`) as HTMLCanvasElement;
        if (!canvas) return;
        const SIZE = 512, PADDING = 48, HEADER = 64, FOOTER = 72;
        const totalH = SIZE + PADDING * 2 + HEADER + FOOTER;
        const out = document.createElement('canvas');
        out.width = SIZE + PADDING * 2; out.height = totalH;
        const ctx = out.getContext('2d')!;
        ctx.fillStyle = '#ffffff'; ctx.roundRect(0, 0, out.width, out.height, 24); ctx.fill();
        const grad = ctx.createLinearGradient(0, 0, out.width, 0);
        grad.addColorStop(0, '#2563eb'); grad.addColorStop(1, '#4f46e5');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.roundRect(0, 0, out.width, HEADER, [24, 24, 0, 0]); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`Table ${table.id}`, out.width / 2, HEADER / 2 + 10);
        ctx.drawImage(canvas, PADDING, HEADER + PADDING, SIZE, SIZE);
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, HEADER + PADDING + SIZE + PADDING, out.width, FOOTER);
        ctx.fillStyle = '#64748b'; ctx.font = '15px system-ui, sans-serif';
        ctx.fillText('Scan to order • Pay at counter', out.width / 2, HEADER + PADDING + SIZE + PADDING + FOOTER / 2 - 4);
        ctx.fillStyle = '#94a3b8'; ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(url.slice(0, 55) + (url.length > 55 ? '…' : ''), out.width / 2, HEADER + PADDING + SIZE + PADDING + FOOTER / 2 + 16);
        const link = document.createElement('a'); link.download = `qr-${table.id}.png`; link.href = out.toDataURL('image/png'); link.click();
    }, [table, url]);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
            <motion.div initial={{ scale: 0.9, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 24 }} onClick={e => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 flex items-center justify-between">
                    <div><h3 className="text-white font-bold text-lg">Table {table.id}</h3><p className="text-blue-200 text-xs mt-0.5">{table.seats} seats</p></div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"><X className="w-5 h-5 text-white" /></button>
                </div>
                <div className="p-8 flex flex-col items-center">
                    <div className="p-4 bg-white rounded-2xl shadow-lg border border-slate-100">
                        <QRCodeCanvas id={`qr-preview-${table.id}`} value={url} size={240} level="H" includeMargin={false} bgColor="#ffffff" fgColor="#1e293b" />
                    </div>
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 text-xs text-blue-600 hover:text-blue-700 underline text-center break-all px-2"
                    >
                        {url}
                    </a>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mt-6 w-full">
                        <motion.a
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1.5 px-3 h-11 border border-blue-200 rounded-xl text-sm font-medium leading-none text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                            <ZoomIn className="w-4 h-4 shrink-0" />
                            <span className="whitespace-nowrap">Open Link</span>
                        </motion.a>
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => navigator.clipboard?.writeText(url)} className="flex items-center justify-center gap-1.5 px-3 h-11 border border-slate-200 rounded-xl text-sm font-medium leading-none text-slate-600 hover:bg-slate-50 transition-colors">
                            <Share2 className="w-4 h-4 shrink-0" />
                            <span className="whitespace-nowrap">Copy URL</span>
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={downloadQR} className="flex items-center justify-center gap-1.5 px-3 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium leading-none shadow-lg shadow-blue-500/25">
                            <Download className="w-4 h-4 shrink-0" />
                            <span className="whitespace-nowrap">Download PNG</span>
                        </motion.button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

function TableManagementModal({
    tables,
    onClose,
    onAddTable,
    onEditTable,
    onDeleteTables,
    isPro
}: {
    tables: Table[];
    onClose: () => void;
    onAddTable: (name: string, seats: number) => void;
    onEditTable: (id: string, name: string, seats: number) => void;
    onDeleteTables: (ids: string[]) => void;
    isPro: boolean;
}) {
    const [newTableName, setNewTableName] = useState('');
    const [newTableSeats, setNewTableSeats] = useState(4);
    const [editingTable, setEditingTable] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editSeats, setEditSeats] = useState(4);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);

    const handleAdd = () => {
        if (newTableName.trim()) {
            onAddTable(newTableName.trim(), newTableSeats);
            setNewTableName('');
            setNewTableSeats(4);
        }
    };

    const startEdit = (table: Table) => {
        setEditingTable(table.id);
        setEditName(table.name);
        setEditSeats(table.seats);
    };

    const saveEdit = () => {
        if (editingTable && editName.trim()) {
            onEditTable(editingTable, editName.trim(), editSeats);
            setEditingTable(null);
        }
    };

    const confirmDelete = (id: string) => {
        onDeleteTables([id]);
        setShowDeleteConfirm(null);
    };

    const toggleSelectMode = () => {
        setSelectMode(prev => {
            const next = !prev;
            if (!next) setSelectedTableIds([]);
            return next;
        });
        setEditingTable(null);
        setShowDeleteConfirm(null);
    };

    const toggleSelectTable = (id: string) => {
        setSelectedTableIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const deleteSelected = () => {
        if (selectedTableIds.length === 0) return;
        onDeleteTables(selectedTableIds);
        setSelectedTableIds([]);
        setSelectMode(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, y: 24 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 24 }}
                onClick={e => e.stopPropagation()}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                            <Edit3 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-lg">Manage Tables</h3>
                            <p className="text-blue-200 text-xs mt-0.5">{tables.length} tables configured</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                        <X className="w-5 h-5 text-white" />
                    </button>
                </div>

                {/* Add New Table Section */}
                <div className="p-5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-slate-700">Add New Table</h4>
                        <button
                            onClick={toggleSelectMode}
                            className={cn(
                                'h-9 px-3 rounded-lg text-xs font-medium transition-colors border',
                                selectMode
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            )}
                        >
                            {selectMode ? 'Cancel Select' : 'Select'}
                        </button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1">
                            <input
                                type="text"
                                placeholder="Table name (e.g., Table 12, VIP Room)"
                                value={newTableName}
                                onChange={e => setNewTableName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                                className="w-full h-11 px-4 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 h-11">
                                <Users className="w-4 h-4 text-slate-400" />
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={newTableSeats}
                                    onChange={e => setNewTableSeats(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                                    className="w-12 text-sm text-center focus:outline-none"
                                />
                                <span className="text-xs text-slate-400">seats</span>
                            </div>
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleAdd}
                                disabled={!newTableName.trim()}
                                className="h-11 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Add Table
                            </motion.button>
                        </div>
                    </div>
                </div>

                {/* Tables List */}
                <div className="flex-1 overflow-y-auto p-5">
                    {selectMode && (
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                            <p className="text-sm text-blue-700">{selectedTableIds.length} selected</p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSelectedTableIds(tables.map(t => t.id))}
                                    className="h-8 px-3 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                                >
                                    Select All
                                </button>
                                <button
                                    onClick={() => setSelectedTableIds([])}
                                    className="h-8 px-3 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={deleteSelected}
                                    disabled={selectedTableIds.length === 0}
                                    className="h-8 px-3 rounded-lg text-xs font-medium bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Delete Selected
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="space-y-2">
                        {tables.map((table, index) => (
                            <motion.div
                                key={table.id || `table-${index}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.02 }}
                                className={cn(
                                    "bg-white border rounded-xl p-4 transition-all",
                                    editingTable === table.id ? "border-blue-400 shadow-lg shadow-blue-500/10" : "border-slate-200 hover:border-slate-300"
                                )}
                            >
                                {editingTable === table.id ? (
                                    /* Edit Mode */
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            autoFocus
                                            className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                                        />
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 h-10">
                                                <Users className="w-4 h-4 text-slate-400" />
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={20}
                                                    value={editSeats}
                                                    onChange={e => setEditSeats(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                                                    className="w-10 text-sm text-center bg-transparent focus:outline-none"
                                                />
                                            </div>
                                            <button
                                                onClick={saveEdit}
                                                className="h-10 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                                            >
                                                <Check className="w-4 h-4" />
                                                Save
                                            </button>
                                            <button
                                                onClick={() => setEditingTable(null)}
                                                className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : showDeleteConfirm === table.id ? (
                                    /* Delete Confirmation */
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center">
                                                <Trash2 className="w-5 h-5 text-rose-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-900">Delete {table.name}?</p>
                                                <p className="text-xs text-slate-500">This action cannot be undone</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => confirmDelete(table.id)}
                                                className="h-9 px-4 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-sm font-medium transition-colors"
                                            >
                                                Delete
                                            </button>
                                            <button
                                                onClick={() => setShowDeleteConfirm(null)}
                                                className="h-9 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* Normal View */
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {selectMode && (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTableIds.includes(table.id)}
                                                    onChange={() => toggleSelectTable(table.id)}
                                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            )}
                                            <div className={cn(
                                                "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm",
                                                table.status === 'available' ? "bg-emerald-100 text-emerald-700" :
                                                    table.status === 'busy' ? "bg-rose-100 text-rose-700" :
                                                        "bg-amber-100 text-amber-700"
                                            )}>
                                                {table.id.replace('T-', '')}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-900">{table.name}</p>
                                                <p className="text-xs text-slate-500">{table.seats} seats • {table.status}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {!selectMode && (
                                                <>
                                                    <button
                                                        onClick={() => startEdit(table)}
                                                        className="h-9 px-3 bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-600 rounded-lg text-sm transition-colors flex items-center gap-1"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => setShowDeleteConfirm(table.id)}
                                                        className="h-9 w-9 bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors flex items-center justify-center"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </div>

                    {tables.length === 0 && (
                        <div className="text-center py-12">
                            <QrCode className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 font-medium">No tables yet</p>
                            <p className="text-slate-400 text-sm mt-1">Add your first table above</p>
                        </div>
                    )}
                </div>

                {/* Footer with Pro Feature Hint */}
                {!isPro && (
                    <div className="p-4 border-t border-slate-200 bg-gradient-to-br from-slate-50 to-purple-50 flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-slate-700">Unlock Drag & Drop Layout</p>
                                <p className="text-xs text-slate-500">Pro users can visually arrange their floor plan</p>
                            </div>
                            <div className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                                Pro Feature
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}

function QRCard({ table, onPreview, baseUrl, restaurantId }: { table: Table; onPreview: (t: Table) => void; baseUrl: string; restaurantId?: string | null }) {
    const url = getTableMenuUrl(baseUrl, table.id, restaurantId);
    const canvasId = `qr-grid-${table.id}`;
    const downloadQR = (e: React.MouseEvent) => {
        e.stopPropagation();
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) return;
        const SIZE = 400, PAD = 32, HDR = 52, FTR = 56, W = SIZE + PAD * 2, H = SIZE + PAD * 2 + HDR + FTR;
        const out = document.createElement('canvas'); out.width = W; out.height = H;
        const ctx = out.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 20); ctx.fill();
        const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#2563eb'); g.addColorStop(1, '#4f46e5');
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(0, 0, W, HDR, [20, 20, 0, 0]); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`Table ${table.id}`, W / 2, HDR / 2 + 8);
        ctx.drawImage(canvas, PAD, HDR + PAD, SIZE, SIZE);
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, HDR + PAD + SIZE + PAD, W, FTR);
        ctx.fillStyle = '#64748b'; ctx.font = '13px system-ui'; ctx.fillText('Scan to order', W / 2, HDR + PAD + SIZE + PAD + FTR / 2 + 5);
        const a = document.createElement('a'); a.download = `qr-${table.id}.png`; a.href = out.toDataURL('image/png'); a.click();
    };
    return (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} whileHover={{ y: -6 }} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-xl transition-all overflow-hidden group cursor-pointer" onClick={() => onPreview(table)}>
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center justify-between">
                <span className="text-white font-bold text-sm">Table {table.id}</span>
                <span className="text-blue-200 text-xs">{table.seats} seats</span>
            </div>
            <div className="p-5 flex flex-col items-center">
                <div className="p-3 bg-white rounded-xl shadow-inner border border-slate-100 group-hover:shadow-lg transition-all">
                    <QRCodeCanvas id={canvasId} value={url || 'https://placeholder.com'} size={160} level="H" includeMargin={false} bgColor="#ffffff" fgColor="#1e293b" />
                </div>
                <div className="flex items-center gap-1.5 mt-3">
                    <span className={cn('w-2 h-2 rounded-full', table.status === 'available' ? 'bg-emerald-500' : table.status === 'busy' ? 'bg-rose-500' : 'bg-amber-500')} />
                    <span className="text-xs text-slate-500 capitalize">{table.status}</span>
                </div>
            </div>
            <div className="px-4 pb-4 grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); onPreview(table); }} className="min-w-0 flex items-center justify-center gap-1 px-2 h-9 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-medium leading-none transition-colors">
                    <ZoomIn className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">Preview</span>
                </motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={downloadQR} className="min-w-0 flex items-center justify-center gap-1 px-2 h-9 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-medium leading-none shadow-md shadow-blue-500/25 transition-all">
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">Download</span>
                </motion.button>
            </div>
        </motion.div>
    );
}

const statusConfig = {
    available: { color: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700' },
    busy: { color: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-700' },
    reserved: { color: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700' },
};

function DraggableTable({
    table,
    onPlaceAtPoint,
    isActive,
    onActivate,
}: {
    table: Table;
    onPlaceAtPoint: (id: string, pointX: number, pointY: number, anchor?: { offsetX: number; offsetY: number }) => void;
    isActive?: boolean;
    onActivate?: (id: string) => void;
}) {
    const cfg = statusConfig[table.status];
    const [isDragging, setIsDragging] = useState(false);
    const dragAnchorRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

    const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging(true);
        onActivate?.(table.id);
        const rect = e.currentTarget.getBoundingClientRect();
        dragAnchorRef.current = {
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        };
    };

    const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        onPlaceAtPoint(table.id, e.clientX, e.clientY, dragAnchorRef.current || undefined);
    };

    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        setIsDragging(false);
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // no-op for browsers that auto-release capture
        }
        dragAnchorRef.current = null;
    };

    return (
        <motion.div
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ position: 'absolute', left: table.x, top: table.y, cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}
            whileHover={{ scale: 1.05 }}
            animate={{ scale: isDragging ? 1.08 : 1, opacity: isDragging ? 0.92 : 1 }}
            className={cn(
                'w-20 h-20 rounded-lg border-2 flex flex-col items-center justify-center shadow-md transition-colors',
                cfg.color,
                cfg.border,
                cfg.text,
                isActive && 'border-orange-500 ring-2 ring-orange-300/80 shadow-md shadow-orange-500/25'
            )}
        >
            <span className="text-xs font-bold pointer-events-none">{table.id}</span>
            <span className="text-[10px] opacity-70 pointer-events-none">{table.seats}🪑</span>
        </motion.div>
    );
}

function DraggableWall({ wall, onDelete, onUpdate }: { wall: Wall; onDelete: (id: string) => void; onUpdate: (id: string, x: number, y: number) => void }) {
    return (
        <motion.div
            drag
            dragMomentum={false}
            onDragEnd={(_, info) => onUpdate(wall.id, Math.max(0, wall.x + info.offset.x), Math.max(0, wall.y + info.offset.y))}
            onPanEnd={(_, info) => onUpdate(wall.id, Math.max(0, wall.x + info.offset.x), Math.max(0, wall.y + info.offset.y))}
            animate={{ x: wall.x, y: wall.y }}
            transition={{ type: 'spring', bounce: 0, duration: 0.1 }}
            whileDrag={{ zIndex: 50, opacity: 0.8 }}
            style={{ position: 'absolute', left: 0, top: 0, width: wall.width, height: wall.height, cursor: 'grab' }}
            className="bg-slate-700 hover:bg-slate-600 transition-colors group"
            onClick={e => { if (e.shiftKey) onDelete(wall.id); }}
        >
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <Trash2 className="w-3 h-3 text-white" />
            </div>
        </motion.div>
    );
}

function DraggableDesk({ desk, onDelete, onUpdate }: { desk: Desk; onDelete: (id: string) => void; onUpdate: (id: string, x: number, y: number) => void }) {
    return (
        <motion.div
            drag
            dragMomentum={false}
            onDragEnd={(_, info) => onUpdate(desk.id, Math.max(0, desk.x + info.offset.x), Math.max(0, desk.y + info.offset.y))}
            onPanEnd={(_, info) => onUpdate(desk.id, Math.max(0, desk.x + info.offset.x), Math.max(0, desk.y + info.offset.y))}
            animate={{ x: desk.x, y: desk.y }}
            transition={{ type: 'spring', bounce: 0, duration: 0.1 }}
            whileDrag={{ zIndex: 50, opacity: 0.8 }}
            style={{ position: 'absolute', left: 0, top: 0, width: desk.width, height: desk.height, cursor: 'grab' }}
            className="bg-blue-100 border-2 border-blue-400 rounded-lg flex items-center justify-center group transition-colors"
            onClick={e => { if (e.shiftKey) onDelete(desk.id); }}
        >
            <span className="text-xs text-blue-700 font-medium pointer-events-none">DESK</span>
            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <Trash2 className="w-3 h-3 text-blue-600" />
            </div>
        </motion.div>
    );
}

function FloorPlanEditor({ tables, setTables, walls, setWalls, desks, setDesks, scanning, floorPlanRef }: {
    tables: Table[]; setTables: React.Dispatch<React.SetStateAction<Table[]>>;
    walls: Wall[]; setWalls: React.Dispatch<React.SetStateAction<Wall[]>>;
    desks: Desk[]; setDesks: React.Dispatch<React.SetStateAction<Desk[]>>;
    scanning: boolean;
    floorPlanRef: React.RefObject<HTMLDivElement | null>;
}) {
    const [activeTableId, setActiveTableId] = useState<string | null>(null);

    const updateTable = (id: string, x: number, y: number) => setTables(prev => prev.map(t => t.id === id ? { ...t, x, y } : t));
    const updateWall = (id: string, x: number, y: number) => setWalls(prev => prev.map(w => w.id === id ? { ...w, x, y } : w));
    const updateDesk = (id: string, x: number, y: number) => setDesks(prev => prev.map(d => d.id === id ? { ...d, x, y } : d));
    const placeTableAtPoint = (id: string, pointX: number, pointY: number, anchor?: { offsetX: number; offsetY: number }) => {
        const grid = floorPlanRef.current;
        if (!grid) return;
        const rect = grid.getBoundingClientRect();
        const tableSize = 80;
        const offsetX = anchor?.offsetX ?? tableSize / 2;
        const offsetY = anchor?.offsetY ?? tableSize / 2;
        const nextX = Math.max(0, Math.min(rect.width - tableSize, pointX - rect.left - offsetX));
        const nextY = Math.max(0, Math.min(rect.height - tableSize, pointY - rect.top - offsetY));
        updateTable(id, nextX, nextY);
    };

    return (
        <div ref={floorPlanRef} className="relative bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl overflow-hidden touch-none" style={{ height: 'min(600px, 72vh)', backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            {walls.map((w, index) => <DraggableWall key={w.id || `wall-${index}`} wall={w} onUpdate={updateWall} onDelete={id => setWalls(prev => prev.filter(x => x.id !== id))} />)}
            {desks.map((d, index) => <DraggableDesk key={d.id || `desk-${index}`} desk={d} onUpdate={updateDesk} onDelete={id => setDesks(prev => prev.filter(x => x.id !== id))} />)}
            {tables.map((t, index) => (
                <DraggableTable
                    key={t.id || `floor-table-${index}`}
                    table={t}
                    onPlaceAtPoint={placeTableAtPoint}
                    isActive={activeTableId === t.id}
                    onActivate={setActiveTableId}
                />
            ))}

            {scanning && (
                <div className="absolute inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px]">
                    <div className="absolute inset-0 animate-pulse" style={{ backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.25) 50%, transparent 100%)', backgroundSize: '200% 100%', animationDuration: '1.2s' }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="px-4 py-2.5 rounded-xl bg-white/85 border border-blue-200 shadow-md text-sm font-medium text-blue-700">
                            Scanning...
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const REVIEW_WORLD_WIDTH = 12;
const REVIEW_WORLD_DEPTH = 8;
const REVIEW_GRID_SNAP = 0.5;

function normalizedToWorld(x: number, y: number) {
    return {
        x: (Math.max(0, Math.min(100, x)) / 100 - 0.5) * REVIEW_WORLD_WIDTH,
        z: (Math.max(0, Math.min(100, y)) / 100 - 0.5) * REVIEW_WORLD_DEPTH,
    };
}

function worldToNormalized(x: number, z: number) {
    return {
        x: Math.max(0, Math.min(100, Number((((x / REVIEW_WORLD_WIDTH) + 0.5) * 100).toFixed(2)))),
        y: Math.max(0, Math.min(100, Number((((z / REVIEW_WORLD_DEPTH) + 0.5) * 100).toFixed(2)))),
    };
}

function useOptionalGlb(path: string) {
    const [scene, setScene] = useState<THREE.Group | null>(null);

    useEffect(() => {
        let active = true;
        const loader = new GLTFLoader();
        loader.load(
            path,
            (gltf) => {
                if (!active) return;
                setScene(gltf.scene);
            },
            undefined,
            () => {
                if (!active) return;
                setScene(null);
            }
        );

        return () => {
            active = false;
        };
    }, [path]);

    return scene;
}

function GlbOrFallback({
    modelPath,
    scale,
    fallback,
}: {
    modelPath: string;
    scale: [number, number, number];
    fallback: React.ReactNode;
}) {
    const loadedScene = useOptionalGlb(modelPath);
    const cloned = useMemo(() => (loadedScene ? loadedScene.clone(true) : null), [loadedScene]);

    if (!cloned) return <>{fallback}</>;

    cloned.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        }
    });

    return <primitive object={cloned} scale={scale} />;
}

function buildChairOffsets(seats: number, shape: TableShape) {
    const radius = shape === 'rectangle' ? 0.94 : 0.82;
    const count = Math.max(2, Math.min(12, seats));

    if (shape === 'rectangle') {
        const halfW = 0.95;
        const halfD = 0.62;
        if (count <= 4) {
            return [
                [0, 0, -halfD],
                [halfW, 0, 0],
                [0, 0, halfD],
                [-halfW, 0, 0],
            ].slice(0, count) as Array<[number, number, number]>;
        }

        const perimeter: Array<[number, number, number]> = [];
        const sideCount = Math.max(2, Math.ceil((count - 2) / 2));
        for (let i = 0; i < sideCount; i++) {
            const t = sideCount === 1 ? 0.5 : i / (sideCount - 1);
            const z = -halfD + t * (halfD * 2);
            perimeter.push([halfW, 0, z]);
            if (perimeter.length < count) perimeter.push([-halfW, 0, z]);
            if (perimeter.length >= count) break;
        }
        if (perimeter.length < count) perimeter.push([0, 0, -halfD - 0.1]);
        if (perimeter.length < count) perimeter.push([0, 0, halfD + 0.1]);
        return perimeter.slice(0, count);
    }

    if (count === 4) {
        return [
            [0, 0, -radius],
            [radius, 0, 0],
            [0, 0, radius],
            [-radius, 0, 0],
        ] as Array<[number, number, number]>;
    }

    return Array.from({ length: count }).map((_, index) => {
        const angle = (Math.PI * 2 * index) / count;
        return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] as [number, number, number];
    });
}

function RealisticChairFallback() {
    const legPositions: Array<[number, number, number]> = [
        [0.1, -0.16, 0.1],
        [-0.1, -0.16, 0.1],
        [0.1, -0.16, -0.1],
        [-0.1, -0.16, -0.1],
    ];

    return (
        <group>
            <mesh castShadow receiveShadow position={[0, 0.06, 0]}>
                <boxGeometry args={[0.34, 0.08, 0.32]} />
                <meshStandardMaterial color="#8b5a3c" roughness={0.48} metalness={0.06} />
            </mesh>
            <mesh castShadow receiveShadow position={[0, 0.3, -0.13]}>
                <boxGeometry args={[0.34, 0.42, 0.06]} />
                <meshStandardMaterial color="#6f4630" roughness={0.48} metalness={0.06} />
            </mesh>
            {legPositions.map((pos, idx) => (
                <mesh key={`leg-${idx}`} castShadow receiveShadow position={[pos[0] * 1.15, -0.2, pos[2] * 1.15]}>
                    <cylinderGeometry args={[0.018, 0.022, 0.42, 12]} />
                    <meshStandardMaterial color="#4b2e22" roughness={0.5} metalness={0.12} />
                </mesh>
            ))}
        </group>
    );
}

function TableTopFallback({ rectangular, color }: { rectangular: boolean; color: TableColor }) {
    const accent = color;
    const baseTone = '#334155';

    if (rectangular) {
        return (
            <group>
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[1.38, 0.12, 0.78]} />
                    <meshStandardMaterial color={accent} roughness={0.35} metalness={0.1} />
                </mesh>
                {[
                    [0.58, -0.24, 0.28],
                    [-0.58, -0.24, 0.28],
                    [0.58, -0.24, -0.28],
                    [-0.58, -0.24, -0.28],
                ].map((pos, idx) => (
                    <mesh key={`table-leg-${idx}`} castShadow receiveShadow position={pos as [number, number, number]}>
                        <boxGeometry args={[0.09, 0.48, 0.09]} />
                        <meshStandardMaterial color={baseTone} roughness={0.5} metalness={0.28} />
                    </mesh>
                ))}
            </group>
        );
    }

    return (
        <group>
            <mesh castShadow receiveShadow>
                <cylinderGeometry args={[0.72, 0.72, 0.12, 46]} />
                <meshStandardMaterial color={accent} roughness={0.38} metalness={0.08} />
            </mesh>
            <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.26, 0.26, 0.02, 36]} />
                <meshStandardMaterial color="#fed7aa" roughness={0.72} metalness={0.02} />
            </mesh>
            <mesh position={[0, -0.24, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.19, 0.24, 0.46, 24]} />
                <meshStandardMaterial color="#c2410c" roughness={0.46} metalness={0.08} />
            </mesh>
            <mesh position={[0, -0.48, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.33, 0.33, 0.05, 28]} />
                <meshStandardMaterial color="#9a3412" roughness={0.48} metalness={0.1} />
            </mesh>
        </group>
    );
}

function TableFurnitureGroup({
    table,
    selected,
    onSelect,
    setRef,
}: {
    table: DetectedTable3D;
    selected: boolean;
    onSelect: (id: string) => void;
    setRef: (id: string, obj: THREE.Group | null) => void;
}) {
    const groupRef = useRef<THREE.Group | null>(null);
    const world = normalizedToWorld(table.x, table.y);
    const tableShape = resolveTableShape(table);
    const tableColor = resolveTableColor(table);
    const isRectangular = tableShape === 'rectangle';
    const chairOffsets = useMemo(() => buildChairOffsets(table.seats, tableShape), [table.seats, tableShape]);

    useEffect(() => {
        setRef(table.id, groupRef.current);
        return () => setRef(table.id, null);
    }, [table.id, setRef]);

    return (
        <group
            ref={groupRef}
            position={[world.x, table.elevation ?? 0, world.z]}
            rotation={[0, table.rotationY ?? 0, 0]}
            onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(table.id);
            }}
        >
            <group position={[0, 0.38, 0]}>
                <TableTopFallback rectangular={isRectangular} color={tableColor} />
            </group>

            {chairOffsets.map((offset, index) => {
                const facingToCenter = Math.atan2(-offset[0], -offset[2]);
                const angle = facingToCenter;
                return (
                    <group key={`${table.id}-chair-${index}`} position={offset} rotation={[0, angle, 0]}>
                        <group position={[0, 0.23, 0]}>
                            <GlbOrFallback
                                modelPath="/assets/models/chair_simple.glb"
                                scale={[0.5, 0.5, 0.5]}
                                fallback={<RealisticChairFallback />}
                            />
                        </group>
                    </group>
                );
            })}

            {selected && (
                isRectangular ? (
                    <mesh position={[0, 0.42, 0]}>
                        <boxGeometry args={[1.54, 0.02, 0.92]} />
                        <meshBasicMaterial color="#22d3ee" wireframe />
                    </mesh>
                ) : (
                    <mesh position={[0, 0.42, 0]}>
                        <cylinderGeometry args={[0.92, 0.92, 0.02, 48]} />
                        <meshBasicMaterial color="#22d3ee" wireframe />
                    </mesh>
                )
            )}
        </group>
    );
}

function applySnapping(
    proposed: { x: number; y: number; z: number },
    options: {
        enabled: boolean;
        tableId: string;
        allTables: DetectedTable3D[];
        walls: Wall[];
    }
) {
    const margin = 0.7;
    const halfW = REVIEW_WORLD_WIDTH / 2;
    const halfD = REVIEW_WORLD_DEPTH / 2;
    let x = Math.max(-halfW + margin, Math.min(halfW - margin, proposed.x));
    let z = Math.max(-halfD + margin, Math.min(halfD - margin, proposed.z));

    if (!options.enabled) {
        return { x, y: proposed.y, z };
    }

    x = Math.round(x / REVIEW_GRID_SNAP) * REVIEW_GRID_SNAP;
    z = Math.round(z / REVIEW_GRID_SNAP) * REVIEW_GRID_SNAP;

    const threshold = 0.35;
    const others = options.allTables.filter((t) => t.id !== options.tableId);
    for (const table of others) {
        const pos = normalizedToWorld(table.x, table.y);
        if (Math.abs(pos.x - x) <= threshold) x = pos.x;
        if (Math.abs(pos.z - z) <= threshold) z = pos.z;
    }

    const boundaryLinesX = [-halfW + margin, halfW - margin];
    const boundaryLinesZ = [-halfD + margin, halfD - margin];

    for (const lineX of boundaryLinesX) {
        if (Math.abs(lineX - x) <= threshold) x = lineX;
    }
    for (const lineZ of boundaryLinesZ) {
        if (Math.abs(lineZ - z) <= threshold) z = lineZ;
    }

    const sourceWidth = 1000;
    const sourceHeight = 600;
    for (const wall of options.walls) {
        const startX = (wall.x / sourceWidth - 0.5) * REVIEW_WORLD_WIDTH;
        const startZ = (wall.y / sourceHeight - 0.5) * REVIEW_WORLD_DEPTH;
        const endX = ((wall.x + wall.width) / sourceWidth - 0.5) * REVIEW_WORLD_WIDTH;
        const endZ = ((wall.y + wall.height) / sourceHeight - 0.5) * REVIEW_WORLD_DEPTH;

        if (wall.orientation === 'horizontal') {
            const minX = Math.min(startX, endX) - 0.8;
            const maxX = Math.max(startX, endX) + 0.8;
            if (x >= minX && x <= maxX && Math.abs(z - startZ) <= threshold) z = startZ;
        } else {
            const minZ = Math.min(startZ, endZ) - 0.8;
            const maxZ = Math.max(startZ, endZ) + 0.8;
            if (z >= minZ && z <= maxZ && Math.abs(x - startX) <= threshold) x = startX;
        }
    }

    return { x, y: proposed.y, z };
}

class SceneErrorBoundary extends Component<{
    fallback: ReactNode;
    children: ReactNode;
}, {
    hasError: boolean;
}> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('3D scene failed to render', error, info);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }
        return this.props.children;
    }
}

function InteractiveReview3DScene({
    detectedTables,
    walls,
    snapEnabled,
    transformMode,
    onUpdateTable,
}: {
    detectedTables: DetectedTable3D[];
    walls: Wall[];
    snapEnabled: boolean;
    transformMode: 'translate' | 'rotate';
    onUpdateTable: (id: string, patch: Partial<DetectedTable3D>) => void;
}) {
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
    const [isTransforming, setIsTransforming] = useState(false);
    const refs = useRef<Record<string, THREE.Group | null>>({});

    const setTableRef = useCallback((id: string, obj: THREE.Group | null) => {
        refs.current[id] = obj;
    }, []);

    const selectedObject = selectedTableId ? refs.current[selectedTableId] : null;

    const handleTransformChange = useCallback(() => {
        if (!selectedTableId) return;
        const object = refs.current[selectedTableId];
        if (!object) return;

        // Keep rotation constrained to the vertical axis for restaurant floor planning.
        object.rotation.x = 0;
        object.rotation.z = 0;

        const snapped = applySnapping(
            { x: object.position.x, y: object.position.y, z: object.position.z },
            {
                enabled: snapEnabled && transformMode === 'translate',
                tableId: selectedTableId,
                allTables: detectedTables,
                walls,
            }
        );

        object.position.set(snapped.x, Math.max(0, snapped.y), snapped.z);
        const normalized = worldToNormalized(object.position.x, object.position.z);
        onUpdateTable(selectedTableId, {
            x: normalized.x,
            y: normalized.y,
            elevation: Number(object.position.y.toFixed(3)),
            rotationY: Number(object.rotation.y.toFixed(3)),
        });
    }, [detectedTables, onUpdateTable, selectedTableId, snapEnabled, transformMode, walls]);

    return (
        <Canvas
            shadows
            camera={{ position: [8, 8, 9], fov: 48 }}
            gl={{ antialias: true, alpha: false }}
            className="h-full w-full"
            onPointerMissed={() => setSelectedTableId(null)}
        >
            <color attach="background" args={['#f8fafc']} />
            <ambientLight intensity={0.55} />
            <directionalLight
                position={[6, 10, 4]}
                intensity={1}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-near={1}
                shadow-camera-far={35}
                shadow-camera-left={-12}
                shadow-camera-right={12}
                shadow-camera-top={12}
                shadow-camera-bottom={-12}
            />

            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[REVIEW_WORLD_WIDTH, REVIEW_WORLD_DEPTH]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.9} metalness={0.05} />
            </mesh>

            <gridHelper args={[REVIEW_WORLD_WIDTH, 24, '#94a3b8', '#cbd5e1']} position={[0, 0.01, 0]} />

            <ContactShadows
                opacity={0.35}
                scale={Math.max(REVIEW_WORLD_WIDTH, REVIEW_WORLD_DEPTH) * 1.15}
                blur={2}
                far={9}
                resolution={1024}
                color="#0f172a"
                position={[0, 0.02, 0]}
            />

            <Suspense fallback={null}>
                {detectedTables.map((table, index) => (
                    <TableFurnitureGroup
                        key={table.id || `three-table-${index}`}
                        table={table}
                        selected={selectedTableId === table.id}
                        onSelect={setSelectedTableId}
                        setRef={setTableRef}
                    />
                ))}
            </Suspense>

            {selectedObject && (
                <TransformControls
                    object={selectedObject}
                    mode={transformMode}
                    showX={transformMode === 'translate'}
                    showY
                    showZ={transformMode === 'translate'}
                    onObjectChange={handleTransformChange}
                    onMouseDown={() => setIsTransforming(true)}
                    onMouseUp={() => setIsTransforming(false)}
                />
            )}

            <OrbitControls
                enablePan
                enableZoom
                enableRotate
                enabled={!isTransforming && !selectedObject}
                target={[0, 0.6, 0]}
                minDistance={5}
                maxDistance={22}
                minPolarAngle={Math.PI / 6}
                maxPolarAngle={Math.PI / 2.02}
                mouseButtons={{
                    LEFT: THREE.MOUSE.ROTATE,
                    MIDDLE: THREE.MOUSE.DOLLY,
                    RIGHT: THREE.MOUSE.PAN,
                }}
            />
        </Canvas>
    );
}

export default function TablesQRCodesPage() {
    const [tables, setTables] = useState<Table[]>([]);
    const [walls, setWalls] = useState<Wall[]>([]);
    const [desks, setDesks] = useState<Desk[]>([]);
    const [viewMode, setViewMode] = useState<'floor' | 'qr'>('qr');
    const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
    const [hasChanges, setHasChanges] = useState(false);
    const [showSaveMsg, setShowSaveMsg] = useState(false);
    const [previewTable, setPreviewTable] = useState<Table | null>(null);
    const [showManageModal, setShowManageModal] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [isAiScanning, setIsAiScanning] = useState(false);
    const [autoLayoutStep, setAutoLayoutStep] = useState<'idle' | 'scanning' | 'review3d'>('idle');
    const [reviewViewMode, setReviewViewMode] = useState<'3d' | '2d'>('3d');
    const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate');
    const [snapEnabled, setSnapEnabled] = useState(true);
    const [draggingDetectedId, setDraggingDetectedId] = useState<string | null>(null);
    const [selectedDetectedTableId, setSelectedDetectedTableId] = useState<string | null>(null);
    const [mobileNudgeStep, setMobileNudgeStep] = useState<2 | 5>(5);
    const [showDetectedPanelMobile, setShowDetectedPanelMobile] = useState(false);
    const detectedDragOffsetRef = useRef<{ x: number; y: number } | null>(null);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [capturedImagePreview, setCapturedImagePreview] = useState<string | null>(null);
    const [detectedTables, setDetectedTables] = useState<DetectedTable3D[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoaded, setIsLoaded] = useState(false);
    // baseUrl is computed client-side only to avoid SSR/hydration mismatch
    const [baseUrl, setBaseUrl] = useState('');
    const floorPlanRef = useRef<HTMLDivElement | null>(null);
    const photoInputRef = useRef<HTMLInputElement | null>(null);
    const { storeId: tenantId, subscriptionTier } = useRestaurant();
    const scopedKey = useCallback((baseKey: string) => {
        if (!tenantId) return baseKey;
        return `${baseKey}:${tenantId}`;
    }, [tenantId]);

    const getActiveToken = useCallback(async (): Promise<string> => {
        if (tenantAuth.currentUser) return tenantAuth.currentUser.getIdToken(true);
        if (adminAuth.currentUser) return adminAuth.currentUser.getIdToken(true);
        throw new Error('Missing active session');
    }, []);

    const isSameJson = useCallback((a: unknown, b: unknown) => {
        return JSON.stringify(a) === JSON.stringify(b);
    }, []);

    const getNextTableId = useCallback((ids: string[]) => {
        const highest = ids.reduce((max, id) => {
            const match = String(id).match(/(\d+)/);
            if (!match) return max;
            const n = Number(match[1]);
            return Number.isFinite(n) ? Math.max(max, n) : max;
        }, 0);

        return `T-${String(highest + 1).padStart(2, '0')}`;
    }, []);

    const saveLayoutToServer = useCallback(async (nextTables: Table[], nextWalls: Wall[], nextDesks: Desk[], nextPlans: FloorPlan[]) => {
        if (!tenantId) return;
        const token = await getActiveToken();
        const response = await fetch('/api/tables/layout', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                restaurantId: tenantId,
                tables: nextTables,
                walls: nextWalls,
                desks: nextDesks,
                floorPlans: nextPlans,
            }),
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload?.error || 'Failed to save table layout');
        }
    }, [tenantId, getActiveToken]);
    // Normalize tier to avoid casing/spacing mismatches from profile docs.
    const normalizedTier = String(subscriptionTier || '').trim().toLowerCase();
    // Pro tier can be 'pro', '2k', or '2.5k' (backwards compatibility)
    const isPro = normalizedTier === 'pro' || normalizedTier === '2k' || normalizedTier === '2.5k';
    // 3D spatial mapping should be available to all Pro users.
    const isSpatialPro = isPro;
    const userSubscription = useMemo(() => (isPro ? 'pro' : 'starter'), [isPro]);
    const reviewGridRef = useRef<HTMLDivElement | null>(null);

    const generateLayoutFromImage = useCallback(async (imageFile: Blob): Promise<AiLayoutTable[]> => {
        if (!tenantId) throw new Error('Restaurant context is missing');

        const token = await getActiveToken();
        const imageName = imageFile instanceof File && imageFile.name ? imageFile.name : 'layout-scan.jpg';
        const formData = new FormData();
        formData.append('restaurantId', tenantId);
        formData.append('hintTableCount', String(Math.max(1, tables.length)));
        formData.append('image', imageFile, imageName);

        const response = await fetch('/api/tables/analyze-image', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: formData,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error || 'AI image analysis failed');
        }

        const parsedTables = Array.isArray(payload?.tables) ? payload.tables : [];
        const normalized = parsedTables
            .map((item: any, idx: number) => {
                const type = item?.type === 'booth' || item?.type === 'high-top' ? item.type : 'standard';
                return {
                    id: String(item?.id || `T-${String(idx + 1).padStart(2, '0')}`),
                    type,
                    x: Math.max(0, Math.min(100, Number(item?.x ?? 0))),
                    y: Math.max(0, Math.min(100, Number(item?.y ?? 0))),
                } as AiLayoutTable;
            })
            .filter((item: AiLayoutTable) => Number.isFinite(item.x) && Number.isFinite(item.y));

        if (normalized.length === 0) {
            throw new Error('AI could not detect tables from this image. Try a clearer top-angle photo.');
        }

        return normalized;
    }, [tenantId, getActiveToken, tables.length]);

    const mapNormalizedToAbsolute = useCallback((x: number, y: number) => {
        const node = floorPlanRef.current;
        const width = node?.clientWidth ?? 1000;
        const height = node?.clientHeight ?? 600;
        const clampedX = Math.max(0, Math.min(100, x));
        const clampedY = Math.max(0, Math.min(100, y));
        return {
            x: Math.round((clampedX / 100) * width),
            y: Math.round((clampedY / 100) * height),
        };
    }, []);

    const mapAbsoluteToNormalized = useCallback((x: number, y: number) => {
        const node = floorPlanRef.current;
        const width = node?.clientWidth ?? 1000;
        const height = node?.clientHeight ?? 600;
        return {
            x: Math.max(0, Math.min(100, Number(((x / Math.max(width, 1)) * 100).toFixed(2)))),
            y: Math.max(0, Math.min(100, Number(((y / Math.max(height, 1)) * 100).toFixed(2)))),
        };
    }, []);

    const applyAiLayout = useCallback(async (imageFile: Blob, previewUrl?: string) => {
        if (userSubscription !== 'pro') {
            setShowUpgradeModal(true);
            return;
        }

        if (previewUrl) setCapturedImagePreview(previewUrl);
        setAutoLayoutStep('scanning');
        setIsAiScanning(true);
        try {
            const aiTables = await generateLayoutFromImage(imageFile);

            const nextDetected: DetectedTable3D[] = aiTables.map((item, idx) => ({
                ...item,
                seats: tables[idx]?.seats || 4,
                elevation: 0,
                rotationY: 0,
                tableShape: (item.type === 'booth' ? 'rectangle' : 'round') as TableShape,
                tableColor: '#8b5e3c' as TableColor,
            }));

            setDetectedTables(nextDetected);
            setReviewViewMode('3d');
            setAutoLayoutStep('review3d');
        } catch (error: any) {
            setAutoLayoutStep('idle');
            toast.error(error?.message || 'AI analysis failed. Try another image with clearer table visibility.');
        } finally {
            setIsAiScanning(false);
            if (photoInputRef.current) photoInputRef.current.value = '';
        }
    }, [userSubscription, generateLayoutFromImage, tables]);

    const onPhotoPicked = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await applyAiLayout(file);
    }, [applyAiLayout]);

    const updateDetectedTable = useCallback((id: string, patch: Partial<DetectedTable3D>) => {
        setDetectedTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    }, []);

    const renderValidated3DLayout = useCallback(() => {
        const mapped = VALIDATED_LAYOUT_JSON.layout.map((item) => ({
            id: item.id,
            type: 'standard' as const,
            x: Math.max(0, Math.min(100, Number(item.coordinates.x.toFixed(2)))),
            y: Math.max(0, Math.min(100, Number(item.coordinates.y.toFixed(2)))),
            seats: Math.max(2, Math.min(12, item.capacity)),
            elevation: 0,
            rotationY: 0,
            tableShape: item.shape,
            tableColor: '#8b5e3c' as TableColor,
        }));

        setDetectedTables(mapped);
        setReviewViewMode(isMobileViewport ? '2d' : '3d');
        setAutoLayoutStep('review3d');
        toast.success(`AI Analysis Complete: ${mapped.length} Tables synchronized`);
    }, [isMobileViewport]);

    const open3DReviewFromCurrentLayout = useCallback(() => {
        if (userSubscription !== 'pro') {
            setShowUpgradeModal(true);
            return;
        }

        const source = detectedTables.length > 0
            ? detectedTables
            : tables.map((table, idx) => {
                const normalized = mapAbsoluteToNormalized(table.x, table.y);
                return {
                    id: table.id || `T-${String(idx + 1).padStart(2, '0')}`,
                    type: 'standard' as const,
                    x: normalized.x,
                    y: normalized.y,
                    seats: table.seats || 4,
                    elevation: 0,
                    rotationY: 0,
                    tableShape: 'round' as const,
                    tableColor: '#8b5e3c' as TableColor,
                } as DetectedTable3D;
            });

        if (source.length === 0) {
            toast.info('Add at least one table to open 3D review.');
            return;
        }

        setDetectedTables(source);
        setReviewViewMode(isMobileViewport ? '2d' : '3d');
        setAutoLayoutStep('review3d');
    }, [userSubscription, detectedTables, tables, mapAbsoluteToNormalized, isMobileViewport]);

    useEffect(() => {
        if (viewMode !== 'floor') return;
        if (autoLayoutStep === 'scanning') return;
        if (detectedTables.length > 0) return;
        if (tables.length === 0) return;

        const seeded = tables.map((table, idx) => {
            const normalized = mapAbsoluteToNormalized(table.x, table.y);
            return {
                id: table.id || `T-${String(idx + 1).padStart(2, '0')}`,
                type: 'standard' as const,
                x: normalized.x,
                y: normalized.y,
                seats: table.seats || 4,
                elevation: 0,
                rotationY: 0,
                tableShape: 'round' as const,
                tableColor: '#8b5e3c' as TableColor,
            } as DetectedTable3D;
        });

        setDetectedTables(seeded);
        setReviewViewMode(isMobileViewport ? '2d' : '3d');
    }, [viewMode, autoLayoutStep, detectedTables.length, tables, mapAbsoluteToNormalized, isMobileViewport]);

    const saveReviewedLayoutToFirebase = useCallback(async () => {
        if (!tenantId) return;

        const existingById = new Map(tables.map((table) => [table.id, table]));

        const updatedTables = detectedTables.map((item, idx) => {
            const prev = existingById.get(item.id);
            const abs = mapNormalizedToAbsolute(item.x, item.y);
            return {
                id: prev?.id || item.id,
                name: prev?.name || `Table ${idx + 1}`,
                seats: item.seats,
                status: prev?.status || 'available',
                x: abs.x,
                y: abs.y,
            } as Table;
        });

        setTables(updatedTables);
        setHasChanges(true);
        await saveLayoutToServer(updatedTables, walls, desks, floorPlans);
        toast.success('Floor plan saved for this hotel');
    }, [tenantId, detectedTables, tables, mapNormalizedToAbsolute, saveLayoutToServer, walls, desks, floorPlans]);

    const addDetectedTable = useCallback(() => {
        setDetectedTables((prev) => {
            const allKnownIds = [
                ...tables.map((t) => t.id),
                ...prev.map((t) => t.id),
            ];
            const nextId = getNextTableId(allKnownIds);
            const nextIndex = prev.length;
            const col = nextIndex % 4;
            const row = Math.floor(nextIndex / 4);
            const nextX = Number((18 + col * 20).toFixed(2));
            const nextY = Number((20 + row * 18).toFixed(2));

            return [
                ...prev,
                {
                    id: nextId,
                    type: 'standard',
                    x: Math.max(8, Math.min(92, nextX)),
                    y: Math.max(10, Math.min(90, nextY)),
                    seats: 4,
                    elevation: 0,
                    rotationY: 0,
                    tableShape: 'round',
                    tableColor: '#8b5e3c' as TableColor,
                },
            ];
        });
        toast.success('Added table to AI review');
    }, [tables, getNextTableId]);

    const autoAlignDetectedTables = useCallback(() => {
        if (detectedTables.length === 0) {
            toast.info('No tables to align.');
            return;
        }

        const sorted = [...detectedTables].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
        const count = sorted.length;
        const cols = Math.max(2, Math.ceil(Math.sqrt(count)));
        const rows = Math.ceil(count / cols);
        const xPadding = 14;
        const yPadding = 14;
        const usableW = 100 - xPadding * 2;
        const usableH = 100 - yPadding * 2;

        const aligned = sorted.map((item, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            return {
                ...item,
                x: Number((xPadding + (col + 0.5) * (usableW / cols)).toFixed(2)),
                y: Number((yPadding + (row + 0.5) * (usableH / Math.max(rows, 1))).toFixed(2)),
            };
        });

        setDetectedTables(aligned);
        toast.success('Auto align applied');
    }, [detectedTables]);

    const placeDetectedTableAtPoint = useCallback((id: string, pointX: number, pointY: number) => {
        const grid = reviewGridRef.current;
        if (!grid) return;
        const rect = grid.getBoundingClientRect();
        const nextX = ((pointX - rect.left) / Math.max(rect.width, 1)) * 100;
        const nextY = ((pointY - rect.top) / Math.max(rect.height, 1)) * 100;

        setDetectedTables((prev) => prev.map((t) => {
            if (t.id !== id) return t;
            return {
                ...t,
                x: Math.max(0, Math.min(100, Number(nextX.toFixed(2)))),
                y: Math.max(0, Math.min(100, Number(nextY.toFixed(2)))),
            };
        }));
    }, []);

    const nudgeDetectedTable = useCallback((id: string, dx: number, dy: number) => {
        setDetectedTables((prev) => prev.map((t) => {
            if (t.id !== id) return t;
            return {
                ...t,
                x: Math.max(0, Math.min(100, Number((t.x + dx).toFixed(2)))),
                y: Math.max(0, Math.min(100, Number((t.y + dy).toFixed(2)))),
            };
        }));
    }, []);

    const selectedDetectedTable = useMemo(
        () => detectedTables.find((table) => table.id === selectedDetectedTableId) || null,
        [detectedTables, selectedDetectedTableId],
    );

    useEffect(() => {
        if (!selectedDetectedTableId) return;
        const exists = detectedTables.some((table) => table.id === selectedDetectedTableId);
        if (!exists) setSelectedDetectedTableId(null);
    }, [detectedTables, selectedDetectedTableId]);

    const endDetectedDrag = useCallback(() => {
        setDraggingDetectedId(null);
        detectedDragOffsetRef.current = null;
    }, []);

    const confirmAndSync3D = useCallback(async () => {
        if (!tenantId) return;

        const existingById = new Map(tables.map((table) => [table.id, table]));

        const updated = detectedTables.map((item, idx) => {
            const prev = existingById.get(item.id);
            const abs = mapNormalizedToAbsolute(item.x, item.y);
            return {
                id: prev?.id || item.id,
                name: prev?.name || `Table ${idx + 1}`,
                seats: item.seats,
                status: prev?.status || 'available',
                x: abs.x,
                y: abs.y,
            } as Table;
        });

        setTables(updated);
        setHasChanges(true);

        await saveLayoutToServer(updated, walls, desks, floorPlans);

        await addDoc(collection(db, 'restaurants', tenantId, 'floor_plans'), {
            source: 'ai_auto_layout_3d',
            createdAt: serverTimestamp(),
            capturedImagePreview,
            tablesNormalized: detectedTables,
            tablesAbsolute: updated,
            walls,
            desks,
        }).catch(() => {
            // Server layout is already saved via API, so this collection write is best-effort.
        });

        setAutoLayoutStep('idle');
    }, [tenantId, detectedTables, tables, mapNormalizedToAbsolute, saveLayoutToServer, walls, desks, floorPlans, capturedImagePreview]);

    useEffect(() => {
        let active = true;

        const loadState = async () => {
        if (typeof window !== 'undefined' && isLocalHostname(window.location.hostname)) {
            setBaseUrl(window.location.origin);
        } else {
            setBaseUrl(resolveMenuBaseUrl());
        }

        const defaultSeedTables: Table[] = getDefaultTables();
        const defaultSeedWalls: Wall[] = [];
        const defaultSeedDesks: Desk[] = [];
        const defaultSeedPlans: FloorPlan[] = [{
            id: '1',
            name: 'Default Layout',
            tables: defaultSeedTables,
            walls: defaultSeedWalls,
            desks: defaultSeedDesks,
        }];

        if (tenantId) {
            try {
                const token = await getActiveToken();
                const response = await fetch(`/api/tables/layout?restaurantId=${encodeURIComponent(tenantId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (response.ok) {
                    const payload = await response.json();
                    if (payload?.found && payload?.layout) {
                        const serverTables = Array.isArray(payload.layout.tables) ? payload.layout.tables as Table[] : [];
                        const serverWalls = Array.isArray(payload.layout.walls) ? payload.layout.walls as Wall[] : [];
                        const serverDesks = Array.isArray(payload.layout.desks) ? payload.layout.desks as Desk[] : [];
                        const serverPlans = Array.isArray(payload.layout.floorPlans) ? payload.layout.floorPlans as FloorPlan[] : [];

                        if (!active) return;
                        setTables(serverTables);
                        setWalls(serverWalls);
                        setDesks(serverDesks);
                        setFloorPlans(serverPlans.length > 0 ? serverPlans : [{ id: '1', name: 'Default Layout', tables: serverTables, walls: serverWalls, desks: serverDesks }]);
                        setSharedTables(serverTables, tenantId);
                        setIsLoaded(true);
                        return;
                    }

                    if (!payload?.found) {
                        if (!active) return;
                        setTables(defaultSeedTables);
                        setWalls(defaultSeedWalls);
                        setDesks(defaultSeedDesks);
                        setFloorPlans(defaultSeedPlans);
                        setSharedTables(defaultSeedTables, tenantId);

                        await saveLayoutToServer(defaultSeedTables, defaultSeedWalls, defaultSeedDesks, defaultSeedPlans);
                        setIsLoaded(true);
                        return;
                    }
                }
            } catch {
                // fall through to deterministic defaults when server layout is unavailable
            }
        }

        const resolvedTables: Table[] = getDefaultTables();
        if (!active) return;
        setTables(resolvedTables);
        setWalls(defaultSeedWalls);
        setDesks(defaultSeedDesks);

        setFloorPlans(defaultSeedPlans);
        setSharedTables(resolvedTables, tenantId || undefined);
        setIsLoaded(true);
        };

        loadState();
        return () => {
            active = false;
        };
    }, [tenantId, scopedKey, getActiveToken, saveLayoutToServer]);

    useEffect(() => {
        if (!tenantId || !isLoaded) return;

        const layoutRef = doc(db, 'restaurants', tenantId, 'settings', 'floor_layout');
        const unsubscribe = onSnapshot(
            layoutRef,
            (snapshot) => {
                if (!snapshot.exists()) return;
                const data = snapshot.data() as Record<string, unknown>;

                const incomingTables = Array.isArray(data?.tables) ? (data.tables as Table[]) : [];
                const incomingWalls = Array.isArray(data?.walls) ? (data.walls as Wall[]) : [];
                const incomingDesks = Array.isArray(data?.desks) ? (data.desks as Desk[]) : [];
                const incomingPlans = Array.isArray(data?.floorPlans) ? (data.floorPlans as FloorPlan[]) : [];

                setTables((prev) => (isSameJson(prev, incomingTables) ? prev : incomingTables));
                setWalls((prev) => (isSameJson(prev, incomingWalls) ? prev : incomingWalls));
                setDesks((prev) => (isSameJson(prev, incomingDesks) ? prev : incomingDesks));
                setFloorPlans((prev) => {
                    const normalizedIncoming = incomingPlans.length > 0
                        ? incomingPlans
                        : [{ id: '1', name: 'Default Layout', tables: incomingTables, walls: incomingWalls, desks: incomingDesks }];
                    return isSameJson(prev, normalizedIncoming) ? prev : normalizedIncoming;
                });

                setSharedTables(incomingTables, tenantId);
            },
            () => {
                // Keep existing local layout if real-time listener temporarily fails.
            }
        );

        return () => unsubscribe();
    }, [tenantId, isLoaded, isSameJson]);

    useEffect(() => {
        const syncViewport = () => {
            setIsMobileViewport(window.innerWidth < 768);
        };

        syncViewport();
        window.addEventListener('resize', syncViewport);
        return () => window.removeEventListener('resize', syncViewport);
    }, []);

    // Autosave whenever the floor plan components change, but ONLY after initial load
    useEffect(() => {
        if (!isLoaded) return;
        setSharedTables(tables, tenantId || undefined);
        // Explicitly write tables to localStorage ourselves to absolutely guarantee it saves
        localStorage.setItem(scopedKey('hotelmenu_floorplan_tables'), JSON.stringify(tables));
        localStorage.setItem(scopedKey('hotelmenu_walls'), JSON.stringify(walls));
        localStorage.setItem(scopedKey('hotelmenu_desks'), JSON.stringify(desks));
        localStorage.setItem(scopedKey('hotelmenu_floorPlans'), JSON.stringify(floorPlans));
    }, [tables, walls, desks, floorPlans, isLoaded, tenantId, scopedKey]);

    useEffect(() => {
        if (!isLoaded || !tenantId) return;

        const timer = setTimeout(() => {
            saveLayoutToServer(tables, walls, desks, floorPlans).catch(() => {
                // local state remains available even if network save fails
            });
        }, 500);

        return () => clearTimeout(timer);
    }, [tables, walls, desks, floorPlans, isLoaded, tenantId, saveLayoutToServer]);

    useEffect(() => {
        if (!isLoaded || !tenantId) return;

        let active = true;

        const syncStatusFromOrders = async () => {
            try {
                const token = await getActiveToken();
                const response = await fetch(`/api/orders/live?restaurantId=${encodeURIComponent(tenantId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!response.ok) return;
                const payload = await response.json();
                const liveOrders = Array.isArray(payload?.orders) ? payload.orders : [];

                const activeTableIds = new Set(
                    liveOrders
                        .filter((o: any) => ['new', 'preparing', 'done'].includes(String(o?.status || '')) && o?.table)
                        .map((o: any) => String(o.table).trim().toLowerCase())
                );

                if (!active) return;

                setTables(prevTables => {
                    let changed = false;
                    const nextTables = prevTables.map((t) => {
                        const strippedId = t.id.replace('T-', '');
                        const numStr = parseInt(strippedId, 10).toString();
                        const hasActiveOrder = activeTableIds.has(t.id.toLowerCase()) ||
                            activeTableIds.has(t.name.toLowerCase()) ||
                            activeTableIds.has(strippedId.toLowerCase()) ||
                            activeTableIds.has(numStr.toLowerCase()) ||
                            activeTableIds.has(`table ${numStr}`);

                        const targetStatus: Table['status'] = hasActiveOrder ? 'busy' : 'available';
                        if (t.status !== targetStatus) {
                            changed = true;
                            return { ...t, status: targetStatus };
                        }
                        return t;
                    });

                    if (changed) {
                        setSharedTables(nextTables, tenantId || undefined);
                    }
                    return nextTables;
                });
            } catch {
                // keep table editor usable if order sync is temporarily unavailable
            }
        };

        syncStatusFromOrders();
        const interval = setInterval(syncStatusFromOrders, 15000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [tenantId, isLoaded, getActiveToken]);

    const addTable = () => { const newT: Table = { id: `T-${String(tables.length + 1).padStart(2, '0')}`, name: `Table ${tables.length + 1}`, seats: 4, x: 100, y: 100, status: 'available' }; setTables([...tables, newT]); setHasChanges(true); };
    const removeTable = () => {
        if (tables.length > 0) {
            const newTables = tables.slice(0, -1);
            setTables(newTables);
            setHasChanges(true);
            // Force immediate save for delete specifically
            localStorage.setItem(scopedKey('hotelmenu_floorplan_tables'), JSON.stringify(newTables));
            setSharedTables(newTables, tenantId || undefined);
        }
    };

    // Modal-based table management handlers
    const addTableWithDetails = (name: string, seats: number) => {
        const newId = `T-${String(tables.length + 1).padStart(2, '0')}`;
        const newT: Table = { id: newId, name, seats, x: 100 + (tables.length % 5) * 120, y: 100 + Math.floor(tables.length / 5) * 120, status: 'available' };
        const newTables = [...tables, newT];
        setTables(newTables);
        setHasChanges(true);
        localStorage.setItem(scopedKey('hotelmenu_floorplan_tables'), JSON.stringify(newTables));
        setSharedTables(newTables, tenantId || undefined);
    };

    const editTable = (id: string, name: string, seats: number) => {
        const newTables = tables.map(t => t.id === id ? { ...t, name, seats } : t);
        setTables(newTables);
        setHasChanges(true);
        localStorage.setItem(scopedKey('hotelmenu_floorplan_tables'), JSON.stringify(newTables));
        setSharedTables(newTables, tenantId || undefined);
    };

    const deleteTables = (ids: string[]) => {
        const idSet = new Set(ids);
        const newTables = tables.filter(t => !idSet.has(t.id));
        setTables(newTables);
        setHasChanges(true);
        localStorage.setItem(scopedKey('hotelmenu_floorplan_tables'), JSON.stringify(newTables));
        setSharedTables(newTables, tenantId || undefined);
    };

    const addWall = () => { setWalls([...walls, { id: `W-${walls.length + 1}`, x: 50, y: 50, width: 200, height: 8, orientation: 'horizontal' }]); setHasChanges(true); };
    const addDesk = () => { setDesks([...desks, { id: `D-${desks.length + 1}`, x: 150, y: 150, width: 80, height: 120 }]); setHasChanges(true); };
    const saveLayout = () => { setFloorPlans(prev => [...prev, { id: `plan-${Date.now()}`, name: `Layout ${prev.length + 1}`, tables, walls, desks }]); setHasChanges(false); setShowSaveMsg(true); setTimeout(() => setShowSaveMsg(false), 2000); };
    const loadFloorPlan = (plan: FloorPlan) => { setTables(plan.tables); setWalls(plan.walls); setDesks(plan.desks); setHasChanges(false); };

    const downloadAllQRs = async () => {
        for (let i = 0; i < tables.length; i++) {
            const t = tables[i];
            const canvas = document.getElementById(`qr-grid-${t.id}`) as HTMLCanvasElement;
            if (!canvas) continue;
            const SIZE = 400, PAD = 32, HDR = 52, FTR = 56, W = SIZE + PAD * 2, H = SIZE + PAD * 2 + HDR + FTR;
            const out = document.createElement('canvas'); out.width = W; out.height = H;
            const ctx = out.getContext('2d')!;
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 20); ctx.fill();
            const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#2563eb'); g.addColorStop(1, '#4f46e5');
            ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(0, 0, W, HDR, [20, 20, 0, 0]); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`Table ${t.id}`, W / 2, HDR / 2 + 8);
            ctx.drawImage(canvas, PAD, HDR + PAD, SIZE, SIZE);
            ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, HDR + PAD + SIZE + PAD, W, FTR);
            ctx.fillStyle = '#64748b'; ctx.font = '13px system-ui'; ctx.fillText('Scan to order', W / 2, HDR + PAD + SIZE + PAD + FTR / 2 + 5);
            const a = document.createElement('a'); a.download = `qr-${t.id}.png`; a.href = out.toDataURL('image/png'); a.click();
            if (i < tables.length - 1) await new Promise(r => setTimeout(r, 200));
        }
    };

    const filteredTables = tables.filter(t => t.id.toLowerCase().includes(searchQuery.toLowerCase()) || t.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const localhostMenuUrl = useMemo(() => getTableMenuUrl('http://localhost:3000', 'T-XX', tenantId), [tenantId]);
    const loopbackMenuUrl = useMemo(() => getTableMenuUrl('http://127.0.0.1:3000', 'T-XX', tenantId), [tenantId]);
    const reviewCanvasHeightClass = isMobileViewport
        ? 'h-[76vh] min-h-[460px] max-h-none'
        : 'h-[68vh] min-h-[360px] max-h-[560px]';

    return (
        <div className="relative">
            <div className="space-y-4 lg:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
                            Tables & QR Codes
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Engine v2</span>
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">Generate and download QR codes for every table</p>
                    </div>
                    <div className="flex items-center gap-2 bg-white rounded-xl p-1 border border-slate-200/60 w-full sm:w-auto">
                        {[{ key: 'qr', label: 'QR Codes', icon: <QrCode className="w-4 h-4" />, proOnly: false }, { key: 'floor', label: 'Floor Plan', icon: <span className="text-sm">📐</span>, proOnly: true }].map(({ key, label, icon, proOnly }) => (
                            <button
                                key={key}
                                onClick={() => !proOnly || isPro ? setViewMode(key as 'qr' | 'floor') : null}
                                disabled={proOnly && !isPro}
                                className={cn(
                                    'flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 sm:flex-initial',
                                    viewMode === key ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25' : 'text-slate-600 hover:bg-slate-50',
                                    proOnly && !isPro && 'opacity-50 cursor-not-allowed'
                                )}
                            >
                                {icon}
                                <span className="hidden sm:inline">{label}</span>
                                {proOnly && !isPro && <ProBadge className="ml-1" />}
                            </button>
                        ))}
                    </div>
                </div>

                {viewMode === 'qr' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                        <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="relative flex-1">
                                <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="text" placeholder="Search tables…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" />
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-500 flex-shrink-0">
                                <span><strong className="text-slate-900">{tables.length}</strong> tables</span>
                                <span className="text-slate-300">|</span>
                                <span><strong className="text-emerald-600">{tables.filter(t => t.status === 'available').length}</strong> free · <strong className="text-rose-600">{tables.filter(t => t.status === 'busy').length}</strong> busy</span>
                            </div>
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setShowManageModal(true)} className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-50 hover:border-slate-300 transition-all whitespace-nowrap">
                                <Edit3 className="w-4 h-4" />Manage Tables
                            </motion.button>
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={downloadAllQRs} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium text-sm shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-shadow whitespace-nowrap">
                                <Download className="w-4 h-4" />Download All
                            </motion.button>
                        </div>
                        {filteredTables.length === 0 ? (
                            <div className="bg-white rounded-2xl p-16 border border-slate-200/60 text-center"><QrCode className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No tables found</p></div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {filteredTables.map((table, i) => (
                                    <motion.div key={table.id || `qr-table-${i}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}>
                                        <QRCard table={table} onPreview={setPreviewTable} baseUrl={baseUrl} restaurantId={tenantId} />
                                    </motion.div>
                                ))}
                            </div>
                        )}
                        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
                            <QrCode className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <div className="space-y-2">
                                <div>
                                    <span className="font-medium">QR codes link to: </span>
                                    <code className="text-xs bg-blue-100 px-1.5 py-0.5 rounded font-mono">{baseUrl}{MENU_CUSTOMER_PATH}?table=T-XX</code>
                                    <span className="ml-2 text-blue-500 text-xs">Set <code className="font-mono">NEXT_PUBLIC_MENU_BASE_URL</code> in .env.local for production</span>
                                </div>
                                <div className="text-xs text-blue-600">
                                    <span className="font-medium">Temporary localhost links:</span>
                                    <div className="mt-1 space-y-1">
                                        <code className="block bg-blue-100/80 px-1.5 py-0.5 rounded font-mono break-all">{localhostMenuUrl}</code>
                                        <code className="block bg-blue-100/80 px-1.5 py-0.5 rounded font-mono break-all">{loopbackMenuUrl}</code>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {viewMode === 'floor' && (
                    <>
                        <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-3 lg:gap-4">
                                    <input
                                        ref={photoInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={onPhotoPicked}
                                    />
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => photoInputRef.current?.click()}
                                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium"
                                    >
                                        <Upload className="w-4 h-4" />
                                        Upload Photo
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={open3DReviewFromCurrentLayout}
                                        className="flex items-center gap-2 px-4 py-2 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-sm font-medium"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        Open 3D Review
                                    </motion.button>
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <AnimatePresence mode="wait">
                                        {showSaveMsg ? (
                                            <motion.div key="saved" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium"><Check className="w-4 h-4" />Saved!</motion.div>
                                        ) : hasChanges ? (
                                            <div className="flex items-center gap-2 px-3 py-2 text-amber-700 text-sm"><div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />Unsaved changes</div>
                                        ) : (
                                            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium"><Check className="w-4 h-4" />All saved</div>
                                        )}
                                    </AnimatePresence>
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={saveLayout} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-emerald-500/25 transition-all"><Save className="w-4 h-4" />Save Layout</motion.button>
                                    <div className="relative group">
                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-sm font-medium transition-colors border border-amber-200"><FolderOpen className="w-4 h-4" />Load ({floorPlans.length})</motion.button>
                                        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200/60 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                                            <div className="p-2 space-y-1">{floorPlans.map((plan, index) => <button key={plan.id || `plan-${index}`} onClick={() => loadFloorPlan(plan)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-sm text-slate-700 transition-colors">{plan.name}</button>)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            {autoLayoutStep === 'scanning' && capturedImagePreview ? (
                                <motion.div
                                    key="ai-scanning"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="bg-white rounded-2xl p-4 lg:p-6 border border-slate-200/60 shadow-sm"
                                >
                                    <div className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                                        <ScanLine className="w-4 h-4 text-orange-500" />
                                        3D Analysis In Progress
                                    </div>
                                    <div className="relative rounded-xl overflow-hidden border border-slate-200">
                                        <img src={capturedImagePreview} alt="Captured restaurant" className="w-full max-h-[480px] object-cover" />
                                        <motion.div
                                            initial={{ y: 0 }}
                                            animate={{ y: ['0%', '100%', '0%'] }}
                                            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                                            className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_20px_rgba(249,115,22,0.8)]"
                                        />
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="ai-3d-review"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="bg-white rounded-2xl p-3 lg:p-6 border border-slate-200/60 shadow-sm"
                                >
                                    <div className="flex flex-col lg:flex-row gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                                                <h3 className="text-sm font-semibold text-slate-800">3D Review</h3>
                                                <div className="flex items-center gap-3">
                                                    {reviewViewMode === '3d' && (
                                                        <>
                                                            <span className="text-xs text-slate-500">Select a table to move or rotate</span>
                                                            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1">
                                                                <button
                                                                    onClick={() => setTransformMode('translate')}
                                                                    className={cn(
                                                                        'px-2.5 py-1 text-xs rounded-md transition-colors',
                                                                        transformMode === 'translate' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                                                                    )}
                                                                >
                                                                    Move
                                                                </button>
                                                                <button
                                                                    onClick={() => setTransformMode('rotate')}
                                                                    className={cn(
                                                                        'px-2.5 py-1 text-xs rounded-md transition-colors',
                                                                        transformMode === 'rotate' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                                                                    )}
                                                                >
                                                                    Rotate Y
                                                                </button>
                                                            </div>
                                                            <button
                                                                onClick={() => setSnapEnabled((prev) => !prev)}
                                                                className={cn(
                                                                    'px-2.5 py-1 text-xs rounded-md border transition-colors',
                                                                    snapEnabled
                                                                        ? 'border-orange-200 bg-orange-50 text-orange-700'
                                                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                                                )}
                                                            >
                                                                Snap {snapEnabled ? 'On (0.5m)' : 'Off'}
                                                            </button>
                                                        </>
                                                    )}
                                                    <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1">
                                                        <button
                                                            onClick={() => setReviewViewMode('3d')}
                                                            className={cn(
                                                                'px-2.5 py-1 text-xs rounded-md transition-colors',
                                                                reviewViewMode === '3d' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                                                            )}
                                                        >
                                                            3D
                                                        </button>
                                                        <button
                                                            onClick={() => setReviewViewMode('2d')}
                                                            className={cn(
                                                                'px-2.5 py-1 text-xs rounded-md transition-colors',
                                                                reviewViewMode === '2d' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                                                            )}
                                                        >
                                                            2D
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="relative">
                                                <div className={cn('relative rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden', !isSpatialPro && 'blur-[2px] pointer-events-none')}>
                                                    {reviewViewMode === '3d' ? (
                                                        <div className={cn('relative', reviewCanvasHeightClass)}>
                                                            <SceneErrorBoundary
                                                                fallback={
                                                                    <div className="h-full w-full flex items-center justify-center bg-slate-50 p-5">
                                                                        <div className="max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                                                                            <p className="text-sm font-semibold text-amber-900">3D view is unavailable on this device right now.</p>
                                                                            <p className="mt-1 text-xs text-amber-700">You can continue safely in 2D review and still save this floor plan.</p>
                                                                            <button
                                                                                onClick={() => setReviewViewMode('2d')}
                                                                                className="mt-3 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium"
                                                                            >
                                                                                Switch to 2D Review
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                }
                                                            >
                                                                <InteractiveReview3DScene
                                                                    detectedTables={detectedTables}
                                                                    walls={walls}
                                                                    snapEnabled={snapEnabled}
                                                                    transformMode={transformMode}
                                                                    onUpdateTable={updateDetectedTable}
                                                                />
                                                            </SceneErrorBoundary>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            ref={reviewGridRef}
                                                            className={cn('relative bg-slate-50 touch-none', reviewCanvasHeightClass)}
                                                            onPointerDown={(e) => {
                                                                if (!isMobileViewport || !selectedDetectedTableId) return;
                                                                if (e.target !== e.currentTarget) return;
                                                                placeDetectedTableAtPoint(selectedDetectedTableId, e.clientX, e.clientY);
                                                            }}
                                                            onPointerUp={endDetectedDrag}
                                                            onPointerLeave={endDetectedDrag}
                                                            onPointerCancel={endDetectedDrag}
                                                            style={{
                                                                backgroundImage: 'radial-gradient(circle, rgba(100,116,139,0.38) 1px, transparent 1.2px)',
                                                                backgroundSize: '24px 24px',
                                                            }}
                                                        >
                                                            {detectedTables.map((table, index) => (
                                                                <motion.div
                                                                    key={(table.id || `detected-${index}`) + '-2d'}
                                                                    onPointerDown={(e) => {
                                                                        e.currentTarget.setPointerCapture(e.pointerId);
                                                                        setSelectedDetectedTableId(table.id);
                                                                        setDraggingDetectedId(table.id);
                                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                                        detectedDragOffsetRef.current = {
                                                                            x: rect.left + rect.width / 2 - e.clientX,
                                                                            y: rect.top + rect.height / 2 - e.clientY,
                                                                        };
                                                                    }}
                                                                    onPointerMove={(e) => {
                                                                        if (draggingDetectedId !== table.id) return;
                                                                        const dx = detectedDragOffsetRef.current?.x ?? 0;
                                                                        const dy = detectedDragOffsetRef.current?.y ?? 0;
                                                                        placeDetectedTableAtPoint(table.id, e.clientX + dx, e.clientY + dy);
                                                                    }}
                                                                    onPointerUp={(e) => {
                                                                        try {
                                                                            e.currentTarget.releasePointerCapture(e.pointerId);
                                                                        } catch {
                                                                            // no-op for browsers that auto-release capture
                                                                        }
                                                                        endDetectedDrag();
                                                                    }}
                                                                    onPointerCancel={endDetectedDrag}
                                                                    className={cn(
                                                                        'absolute rounded-2xl cursor-grab border-2 shadow-[0_4px_12px_rgba(15,23,42,0.16)] text-slate-900 flex flex-col items-center justify-center touch-none',
                                                                        selectedDetectedTableId === table.id && 'ring-2 ring-blue-500/70 ring-offset-2 ring-offset-slate-50',
                                                                        resolveTableShape(table) === 'rectangle' ? 'w-28 h-20' : 'w-24 h-24'
                                                                    )}
                                                                    style={{
                                                                        left: `${table.x}%`,
                                                                        top: `${table.y}%`,
                                                                        transform: 'translate(-50%, -50%)',
                                                                        borderColor: resolveTableColor(table),
                                                                        backgroundColor: hexToRgba(resolveTableColor(table), 0.22),
                                                                    }}
                                                                    animate={{ scale: draggingDetectedId === table.id ? 1.04 : 1 }}
                                                                >
                                                                    <div className="text-xl leading-none">🍽️</div>
                                                                    <div className="mt-0.5 text-sm font-semibold tracking-wide">{table.id}</div>
                                                                    <div className="text-[11px] text-slate-700">{table.seats} seats</div>
                                                                </motion.div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {reviewViewMode === '2d' && isMobileViewport ? (
                                                        <div className="absolute left-2 right-2 bottom-2 rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-sm">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-xs font-medium text-slate-700">
                                                                    {selectedDetectedTable ? `Selected: ${selectedDetectedTable.id}` : 'Tap a table to select'}
                                                                </span>
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setMobileNudgeStep(2)}
                                                                        className={cn(
                                                                            'h-6 px-2 rounded-md text-[10px] font-semibold border transition-colors',
                                                                            mobileNudgeStep === 2
                                                                                ? 'bg-slate-900 text-white border-slate-900'
                                                                                : 'bg-white text-slate-600 border-slate-200'
                                                                        )}
                                                                    >
                                                                        Fine
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setMobileNudgeStep(5)}
                                                                        className={cn(
                                                                            'h-6 px-2 rounded-md text-[10px] font-semibold border transition-colors',
                                                                            mobileNudgeStep === 5
                                                                                ? 'bg-slate-900 text-white border-slate-900'
                                                                                : 'bg-white text-slate-600 border-slate-200'
                                                                        )}
                                                                    >
                                                                        Fast
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div className="mt-1 text-[11px] text-slate-500">Tip: tap empty grid space to place selected table.</div>
                                                            <div className="mt-2 grid grid-cols-3 gap-2 w-[168px] mx-auto">
                                                                <div />
                                                                <button
                                                                    type="button"
                                                                    disabled={!selectedDetectedTable}
                                                                    onClick={() => selectedDetectedTable && nudgeDetectedTable(selectedDetectedTable.id, 0, -mobileNudgeStep)}
                                                                    className="h-11 rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    aria-label="Move selected table up"
                                                                >
                                                                    ↑
                                                                </button>
                                                                <div />
                                                                <button
                                                                    type="button"
                                                                    disabled={!selectedDetectedTable}
                                                                    onClick={() => selectedDetectedTable && nudgeDetectedTable(selectedDetectedTable.id, -mobileNudgeStep, 0)}
                                                                    className="h-11 rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    aria-label="Move selected table left"
                                                                >
                                                                    ←
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={!selectedDetectedTable}
                                                                    onClick={() => selectedDetectedTable && nudgeDetectedTable(selectedDetectedTable.id, 0, mobileNudgeStep)}
                                                                    className="h-11 rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    aria-label="Move selected table down"
                                                                >
                                                                    ↓
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={!selectedDetectedTable}
                                                                    onClick={() => selectedDetectedTable && nudgeDetectedTable(selectedDetectedTable.id, mobileNudgeStep, 0)}
                                                                    className="h-11 rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    aria-label="Move selected table right"
                                                                >
                                                                    →
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>

                                                {!isSpatialPro && (
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <div className="max-w-sm rounded-xl border border-purple-200 bg-white/95 p-4 shadow-xl text-center">
                                                            <p className="text-sm font-semibold text-slate-800">Pro Feature: 3D Spatial Mapping</p>
                                                            <p className="text-xs text-slate-500 mt-1">Upgrade to ₹2,000 tier to unlock full interactive 3D review and sync.</p>
                                                            <button
                                                                onClick={() => setShowUpgradeModal(true)}
                                                                className="mt-3 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-medium"
                                                            >
                                                                Upgrade Plan
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {isMobileViewport ? (
                                            <button
                                                type="button"
                                                onClick={() => setShowDetectedPanelMobile((prev) => !prev)}
                                                className="w-full h-10 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium"
                                            >
                                                {showDetectedPanelMobile ? 'Hide Detected Tables' : `Show Detected Tables (${detectedTables.length})`}
                                            </button>
                                        ) : null}

                                        {(!isMobileViewport || showDetectedPanelMobile) && (
                                            <div className="w-full lg:w-80 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <h4 className="text-sm font-semibold text-slate-800 mb-2">Detected Tables</h4>
                                            <div className="mb-3 grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={addDetectedTable}
                                                    className="h-9 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium shadow-sm"
                                                >
                                                    Add Table
                                                </button>
                                                <button
                                                    onClick={renderValidated3DLayout}
                                                    className="h-9 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium shadow-sm"
                                                >
                                                    Render Validated 3D
                                                </button>
                                                <button
                                                    onClick={saveReviewedLayoutToFirebase}
                                                    disabled={!tenantId || detectedTables.length === 0}
                                                    className="h-9 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium shadow-sm"
                                                >
                                                    Save to Firebase
                                                </button>
                                                <button
                                                    onClick={autoAlignDetectedTables}
                                                    disabled={detectedTables.length === 0}
                                                    className="col-span-2 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium shadow-sm"
                                                >
                                                    Auto Align
                                                </button>
                                            </div>
                                            <div className="space-y-2 max-h-[430px] overflow-y-auto pr-1">
                                                {detectedTables.map((table, index) => (
                                                    <div
                                                        key={table.id ? `meta-${table.id}` : `meta-${index}`}
                                                        onClick={() => setSelectedDetectedTableId(table.id)}
                                                        className={cn(
                                                            'rounded-lg border bg-white p-2.5 cursor-pointer transition-colors',
                                                            selectedDetectedTableId === table.id
                                                                ? 'border-blue-400 ring-1 ring-blue-200'
                                                                : 'border-slate-200 hover:border-slate-300'
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-xs font-medium text-slate-700">{table.id}</span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setDetectedTables((prev) => prev.filter((x) => x.id !== table.id));
                                                                }}
                                                                className="w-7 h-7 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center"
                                                                title="Delete detected table"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                                            <label className="text-slate-500">Capacity</label>
                                                            <select
                                                                value={table.seats}
                                                                onChange={(e) => updateDetectedTable(table.id, { seats: Number(e.target.value) })}
                                                                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-slate-700"
                                                            >
                                                                {[2, 4, 6, 8, 10, 12].map((n) => <option key={table.id ? `${table.id}-cap-${n}` : `cap-${index}-${n}`} value={n}>{n}</option>)}
                                                            </select>

                                                            <label className="text-slate-500">Shape</label>
                                                            <select
                                                                value={resolveTableShape(table)}
                                                                onChange={(e) => updateDetectedTable(table.id, { tableShape: e.target.value as TableShape })}
                                                                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-slate-700"
                                                            >
                                                                <option value="round">Round</option>
                                                                <option value="rectangle">Rectangle</option>
                                                            </select>

                                                            <label className="text-slate-500">Color</label>
                                                            <div className="flex items-center gap-1.5">
                                                                {TABLE_COLOR_OPTIONS.map((option) => {
                                                                    const activeColor = resolveTableColor(table);
                                                                    const active = activeColor === option.value;
                                                                    return (
                                                                        <button
                                                                            key={`${table.id}-${option.value}`}
                                                                            type="button"
                                                                            title={option.label}
                                                                            onClick={() => updateDetectedTable(table.id, { tableColor: option.value })}
                                                                            className={cn(
                                                                                'w-6 h-6 rounded-full border transition-all',
                                                                                active ? 'border-slate-900 ring-2 ring-slate-300' : 'border-slate-200'
                                                                            )}
                                                                            style={{ backgroundColor: option.value }}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mt-3 flex gap-2">
                                                <button
                                                    onClick={() => setViewMode('qr')}
                                                    className="flex-1 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm"
                                                >
                                                    Back to QR
                                                </button>
                                                <button
                                                    onClick={confirmAndSync3D}
                                                    disabled={!isSpatialPro || detectedTables.length === 0}
                                                    className="flex-1 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium shadow-md shadow-orange-500/25"
                                                >
                                                    Confirm & Sync
                                                </button>
                                            </div>
                                        </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </div>

            <AnimatePresence>
                {previewTable && <QRPreviewModal table={previewTable} onClose={() => setPreviewTable(null)} baseUrl={baseUrl} restaurantId={tenantId} />}
                {showManageModal && (
                    <TableManagementModal
                        tables={tables}
                        onClose={() => setShowManageModal(false)}
                        onAddTable={addTableWithDetails}
                        onEditTable={editTable}
                        onDeleteTables={deleteTables}
                        isPro={isPro}
                    />
                )}
                {showUpgradeModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setShowUpgradeModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md shadow-purple-500/25">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-semibold text-slate-900">Upgrade to Pro</h3>
                                    <p className="text-sm text-slate-500 mt-1">
                                        AI Auto-Layout is a Pro feature. Upgrade to scan your restaurant photo and auto-arrange tables.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 flex justify-end gap-2">
                                <button
                                    onClick={() => setShowUpgradeModal(false)}
                                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium"
                                >
                                    Maybe Later
                                </button>
                                <button
                                    onClick={() => setShowUpgradeModal(false)}
                                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium shadow-md"
                                >
                                    Upgrade to Pro
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
