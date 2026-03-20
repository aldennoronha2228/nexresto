'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Download, QrCode, Trash2, Minus, Check, FolderOpen, Save, X, ZoomIn, Share2, Lock, Sparkles, Edit3, Users, Camera, ScanLine, Video, Upload } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { cn } from '@/lib/utils';
import { setTables as setSharedTables, type Table } from '@/data/sharedData';
import { useAuth } from '@/context/AuthContext';
import { useRestaurant } from '@/hooks/useRestaurant';
import { ProFeatureGate, ProBadge } from '@/components/dashboard/ProFeatureGate';
import { adminAuth, db, tenantAuth } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

const MENU_CUSTOMER_PATH = process.env.NEXT_PUBLIC_MENU_CUSTOMER_PATH ?? '/customer';

function resolveMenuBaseUrl() {
    if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_MENU_BASE_URL ?? '';

    const configured = (process.env.NEXT_PUBLIC_MENU_BASE_URL ?? '').trim();
    const origin = window.location.origin;
    if (!configured) return origin;

    try {
        const cfg = new URL(configured);
        const current = new URL(origin);
        const cfgIsLocal = cfg.hostname === 'localhost' || cfg.hostname === '127.0.0.1';
        const currentIsLocal = current.hostname === 'localhost' || current.hostname === '127.0.0.1';

        // In local dev, prefer the actual running origin if configured localhost URL
        // has a different protocol or port (common with Next auto-switching to 3001).
        if (cfgIsLocal && currentIsLocal) {
            if (cfg.protocol !== current.protocol || cfg.port !== current.port) {
                return origin;
            }
        }

        return cfg.origin;
    } catch {
        return origin;
    }
}

function getTableMenuUrl(baseUrl: string, tableId: string, restaurantId?: string | null) {
    const normalizedBase = (baseUrl || '').trim() || (typeof window !== 'undefined' ? window.location.origin : '');
    const normalizedPath = MENU_CUSTOMER_PATH.startsWith('/') ? MENU_CUSTOMER_PATH : `/${MENU_CUSTOMER_PATH}`;

    try {
        const url = new URL(normalizedPath, normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`);
        url.searchParams.set('table', tableId);
        if (restaurantId) url.searchParams.set('restaurant', restaurantId);
        return url.toString();
    } catch {
        const params = new URLSearchParams();
        params.set('table', tableId);
        if (restaurantId) params.set('restaurant', restaurantId);
        return `${normalizedBase}${normalizedPath}?${params.toString()}`;
    }
}

interface Wall { id: string; x: number; y: number; width: number; height: number; orientation: 'horizontal' | 'vertical' }
interface Desk { id: string; x: number; y: number; width: number; height: number }
interface FloorPlan { id: string; name: string; tables: Table[]; walls: Wall[]; desks: Desk[] }
type AiLayoutTable = { id: string; type: 'standard' | 'booth' | 'high-top'; x: number; y: number };
type DetectedTable3D = AiLayoutTable & { seats: number };

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
                    <div className="flex gap-3 mt-6 w-full">
                        <motion.a
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-2 h-11 border border-blue-200 rounded-xl text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                            <ZoomIn className="w-4 h-4" />Open Link
                        </motion.a>
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => navigator.clipboard?.writeText(url)} className="flex-1 flex items-center justify-center gap-2 h-11 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                            <Share2 className="w-4 h-4" />Copy URL
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={downloadQR} className="flex-1 flex items-center justify-center gap-2 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25">
                            <Download className="w-4 h-4" />Download PNG
                        </motion.button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

function CameraModal({
    open,
    onClose,
    onCapture,
    onUseUpload,
}: {
    open: boolean;
    onClose: () => void;
    onCapture: (payload: { blob: Blob; previewUrl: string }) => void;
    onUseUpload: () => void;
}) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [isStartingCamera, setIsStartingCamera] = useState(false);

    useEffect(() => {
        if (!open) return;

        let active = true;

        const stopExistingStream = () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
        };

        const startCamera = async () => {
            setCameraError(null);
            setIsStartingCamera(true);

            if (!window.isSecureContext) {
                setCameraError('Live camera requires a secure context (HTTPS or localhost). Please use HTTPS or choose photo upload.');
                setIsStartingCamera(false);
                return;
            }

            if (!navigator?.mediaDevices?.getUserMedia) {
                setCameraError('Camera access is not available in this browser/session. Use photo upload instead.');
                setIsStartingCamera(false);
                return;
            }

            try {
                stopExistingStream();
                let stream: MediaStream;

                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'environment' } },
                        audio: false,
                    });
                } catch {
                    // Retry with broad constraints for browsers/devices that reject facingMode.
                    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                }

                if (!active) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    const v = videoRef.current;
                    v.onloadedmetadata = () => {
                        v.play().catch(() => {
                            // no-op: user gesture may be required in some browsers
                        });
                    };
                }
            } catch (error: any) {
                const code = String(error?.name || '').trim();
                if (code === 'NotAllowedError' || code === 'PermissionDeniedError') {
                    setCameraError('Camera permission is blocked. Allow camera access in browser settings, then try again.');
                } else if (code === 'NotFoundError' || code === 'DevicesNotFoundError') {
                    setCameraError('No camera device was found on this system. You can continue with photo upload.');
                } else if (code === 'NotReadableError' || code === 'TrackStartError') {
                    setCameraError('Camera is currently in use by another app. Close that app and retry.');
                } else {
                    setCameraError('Camera failed to start. You can retry or continue with photo upload.');
                }
            } finally {
                if (active) {
                    setIsStartingCamera(false);
                }
            }
        };

        startCamera();

        return () => {
            active = false;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
        };
    }, [open, onClose]);

    const capture = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, width, height);

        const previewUrl = canvas.toDataURL('image/jpeg', 0.92);
        canvas.toBlob((blob) => {
            if (!blob) return;
            onCapture({ blob, previewUrl });
        }, 'image/jpeg', 0.92);
    }, [onCapture]);

    if (!open) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.96, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.96, y: 10 }}
                className="w-full max-w-4xl rounded-2xl border border-white/20 bg-slate-950 overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="h-14 px-4 border-b border-white/10 flex items-center justify-between text-white">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Video className="w-4 h-4" />
                        Live Camera Capture
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="relative aspect-video bg-black">
                    <video ref={videoRef} className={cn('w-full h-full object-cover', cameraError && 'opacity-30')} playsInline muted autoPlay />
                    {isStartingCamera && !cameraError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/35">
                            <div className="px-3 py-2 rounded-lg bg-slate-950/85 border border-white/10 text-white text-sm">
                                Starting camera...
                            </div>
                        </div>
                    )}
                    {cameraError && (
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                            <div className="max-w-md w-full rounded-xl border border-amber-300 bg-amber-50 text-amber-800 p-4 text-center">
                                <p className="text-sm font-medium">{cameraError}</p>
                                <div className="mt-3 flex items-center justify-center gap-2">
                                    <button
                                        onClick={onClose}
                                        className="px-3 py-2 rounded-lg border border-amber-400 text-amber-800 text-sm font-medium hover:bg-amber-100"
                                    >
                                        Close
                                    </button>
                                    <button
                                        onClick={onUseUpload}
                                        className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium"
                                    >
                                        Use Photo Upload
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2 bg-slate-900">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 text-sm">
                        Cancel
                    </button>
                    <button onClick={capture} disabled={!!cameraError} className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium shadow-md shadow-orange-500/30 flex items-center gap-2">
                        <Camera className="w-4 h-4" />
                        Capture
                    </button>
                </div>
                <canvas ref={canvasRef} className="hidden" />
            </motion.div>
        </motion.div>
    );
}

// ─── Table Management Modal ───────────────────────────────────────────────────

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
            <div className="px-4 pb-4 flex gap-2">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={e => { e.stopPropagation(); onPreview(table); }} className="flex-1 flex items-center justify-center gap-1.5 h-9 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-medium transition-colors">
                    <ZoomIn className="w-3.5 h-3.5" />Preview
                </motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={downloadQR} className="flex-1 flex items-center justify-center gap-1.5 h-9 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-medium shadow-md shadow-blue-500/25 transition-all">
                    <Download className="w-3.5 h-3.5" />Download
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

function DraggableTable({ table, onUpdate, isActive, onActivate }: { table: Table; onUpdate: (id: string, x: number, y: number) => void; isActive?: boolean; onActivate?: (id: string) => void }) {
    const cfg = statusConfig[table.status];
    return (
        <motion.div
            drag
            dragMomentum={false}
            onPointerDown={() => onActivate?.(table.id)}
            onDragEnd={(_, info) => onUpdate(table.id, Math.max(0, table.x + info.offset.x), Math.max(0, table.y + info.offset.y))}
            onPanEnd={(_, info) => {
                // Failsafe for if simple drag offset math breaks on zoomed Windows monitors
                const newX = Math.max(0, table.x + info.offset.x);
                const newY = Math.max(0, table.y + info.offset.y);
                onUpdate(table.id, newX, newY);
            }}
            animate={{ x: table.x, y: table.y }}
            transition={{ type: 'spring', bounce: 0, duration: 0.1 }}
            whileHover={{ scale: 1.05 }}
            whileDrag={{ scale: 1.1, zIndex: 50, opacity: 0.9 }}
            style={{ position: 'absolute', left: 0, top: 0, cursor: 'grab' }}
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

    return (
        <div ref={floorPlanRef} className="relative bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl overflow-hidden" style={{ height: 600, backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            {walls.map((w, index) => <DraggableWall key={w.id || `wall-${index}`} wall={w} onUpdate={updateWall} onDelete={id => setWalls(prev => prev.filter(x => x.id !== id))} />)}
            {desks.map((d, index) => <DraggableDesk key={d.id || `desk-${index}`} desk={d} onUpdate={updateDesk} onDelete={id => setDesks(prev => prev.filter(x => x.id !== id))} />)}
            {tables.map((t, index) => <DraggableTable key={t.id || `floor-table-${index}`} table={t} onUpdate={updateTable} isActive={activeTableId === t.id} onActivate={setActiveTableId} />)}

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
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [autoLayoutStep, setAutoLayoutStep] = useState<'idle' | 'scanning' | 'review3d'>('idle');
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
        // Mock multimodal processing call - replace with real endpoint when model is wired.
        await new Promise((resolve) => setTimeout(resolve, 1600));

        const count = Math.max(tables.length, 6);
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const xPadding = 12;
        const yPadding = 12;
        const usableW = 100 - xPadding * 2;
        const usableH = 100 - yPadding * 2;

        const aiJson = Array.from({ length: count }).map((_, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = xPadding + (col + 0.5) * (usableW / cols);
            const y = yPadding + (row + 0.5) * (usableH / rows);
            return {
                id: `T-${String(idx + 1).padStart(2, '0')}`,
                type: 'standard' as const,
                x: Math.max(0, Math.min(100, Number(x.toFixed(2)))),
                y: Math.max(0, Math.min(100, Number(y.toFixed(2)))),
            };
        });

        void imageFile;
        return aiJson;
    }, [tables.length]);

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

            const nextDetected = aiTables.map((item, idx) => ({
                ...item,
                seats: tables[idx]?.seats || 4,
            }));

            setDetectedTables(nextDetected);
            setAutoLayoutStep('review3d');
        } finally {
            setIsAiScanning(false);
            if (photoInputRef.current) photoInputRef.current.value = '';
        }
    }, [userSubscription, generateLayoutFromImage, tables]);

    const onScanButtonClick = useCallback(() => {
        if (userSubscription !== 'pro') {
            setShowUpgradeModal(true);
            return;
        }

        if (!navigator?.mediaDevices?.getUserMedia) {
            photoInputRef.current?.click();
            return;
        }

        setShowCameraModal(true);
    }, [userSubscription]);

    const onPhotoPicked = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await applyAiLayout(file);
    }, [applyAiLayout]);

    const onCameraCapture = useCallback(async ({ blob, previewUrl }: { blob: Blob; previewUrl: string }) => {
        setShowCameraModal(false);
        await applyAiLayout(blob, previewUrl);
    }, [applyAiLayout]);

    const updateDetectedTable = useCallback((id: string, patch: Partial<DetectedTable3D>) => {
        setDetectedTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    }, []);

    const handleDragDetectedTable = useCallback((id: string, deltaX: number, deltaY: number) => {
        const grid = reviewGridRef.current;
        if (!grid) return;
        const dx = (deltaX / Math.max(grid.clientWidth, 1)) * 100;
        const dy = (deltaY / Math.max(grid.clientHeight, 1)) * 100;

        setDetectedTables((prev) => prev.map((t) => {
            if (t.id !== id) return t;
            return {
                ...t,
                x: Math.max(0, Math.min(100, Number((t.x + dx).toFixed(2)))),
                y: Math.max(0, Math.min(100, Number((t.y + dy).toFixed(2)))),
            };
        }));
    }, []);

    const confirmAndSync3D = useCallback(async () => {
        if (!tenantId) return;

        const updated = detectedTables.map((item, idx) => {
            const prev = tables[idx];
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
        setBaseUrl(resolveMenuBaseUrl());

        const defaultSeedTables: Table[] = [];
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

        const resolvedTables: Table[] = [];
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
                            <div><span className="font-medium">QR codes link to: </span><code className="text-xs bg-blue-100 px-1.5 py-0.5 rounded font-mono">{baseUrl}{MENU_CUSTOMER_PATH}?table=T-XX</code><span className="ml-2 text-blue-500 text-xs">Set <code className="font-mono">NEXT_PUBLIC_MENU_BASE_URL</code> in .env.local for production</span></div>
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
                                        onClick={onScanButtonClick}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium shadow-md transition-all"
                                    >
                                        <Camera className="w-4 h-4" />
                                        Live Camera Scan (Pro)
                                        <ProBadge />
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => photoInputRef.current?.click()}
                                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium"
                                    >
                                        <Upload className="w-4 h-4" />
                                        Upload Photo
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
                            ) : autoLayoutStep === 'review3d' ? (
                                <motion.div
                                    key="ai-3d-review"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="bg-white rounded-2xl p-4 lg:p-6 border border-slate-200/60 shadow-sm"
                                >
                                    <div className="flex flex-col lg:flex-row gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-sm font-semibold text-slate-800">3D Review</h3>
                                                <span className="text-xs text-slate-500">Drag blocks to nudge placement</span>
                                            </div>

                                            <div className="relative">
                                                <div className={cn('relative rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden', !isSpatialPro && 'blur-[2px] pointer-events-none')}>
                                                    <div
                                                        ref={reviewGridRef}
                                                        className="relative h-[520px]"
                                                        style={{
                                                            transform: 'perspective(1000px) rotateX(45deg)',
                                                            transformStyle: 'preserve-3d',
                                                            backgroundImage: 'linear-gradient(to right, rgba(148,163,184,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.2) 1px, transparent 1px)',
                                                            backgroundSize: '36px 36px',
                                                        }}
                                                    >
                                                        {detectedTables.map((table, index) => (
                                                            <motion.div
                                                                key={table.id || `detected-${index}`}
                                                                drag
                                                                dragMomentum={false}
                                                                onDragEnd={(_, info) => handleDragDetectedTable(table.id, info.offset.x, info.offset.y)}
                                                                className="absolute w-16 h-16 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 border border-orange-700/40 shadow-md shadow-orange-500/40 cursor-grab"
                                                                style={{ left: `${table.x}%`, top: `${table.y}%`, transform: 'translate(-50%, -50%) translateZ(18px)' }}
                                                                whileDrag={{ scale: 1.06 }}
                                                            >
                                                                <div className="absolute inset-0 rounded-lg border-t border-white/35" />
                                                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] px-1.5 py-0.5 rounded bg-slate-900/75 text-white whitespace-nowrap">
                                                                    {table.id}
                                                                </div>
                                                            </motion.div>
                                                        ))}
                                                    </div>
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

                                        <div className="w-full lg:w-80 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <h4 className="text-sm font-semibold text-slate-800 mb-2">Detected Tables</h4>
                                            <div className="space-y-2 max-h-[430px] overflow-y-auto pr-1">
                                                {detectedTables.map((table, index) => (
                                                    <div key={table.id ? `meta-${table.id}` : `meta-${index}`} className="rounded-lg border border-slate-200 bg-white p-2.5">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-xs font-medium text-slate-700">{table.id}</span>
                                                            <button
                                                                onClick={() => setDetectedTables((prev) => prev.filter((x) => x.id !== table.id))}
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
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mt-3 flex gap-2">
                                                <button
                                                    onClick={() => setAutoLayoutStep('idle')}
                                                    className="flex-1 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm"
                                                >
                                                    Cancel
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
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl p-4 lg:p-6 border border-slate-200/60 shadow-sm">
                                    <FloorPlanEditor
                                        tables={tables} setTables={updater => { setTables(updater); setHasChanges(true); }}
                                        walls={walls} setWalls={updater => { setWalls(updater); setHasChanges(true); }}
                                        desks={desks} setDesks={updater => { setDesks(updater); setHasChanges(true); }}
                                        scanning={isAiScanning}
                                        floorPlanRef={floorPlanRef}
                                    />
                                    <p className="mt-4 text-sm text-slate-400">💡 <span className="font-medium">Drag</span> to move • <span className="font-medium">Shift + Click</span> to delete walls/desks</p>
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
                <CameraModal
                    open={showCameraModal}
                    onClose={() => setShowCameraModal(false)}
                    onCapture={onCameraCapture}
                    onUseUpload={() => {
                        setShowCameraModal(false);
                        photoInputRef.current?.click();
                    }}
                />
            </AnimatePresence>
        </div>
    );
}
