'use client';

/**
 * Custom Branding Settings (Pro-only feature)
 * Allows restaurants to customize their menu colors, logo, and styling
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { 
    Palette, Upload, Eye, Save, RefreshCw,
    Type, Image, Sparkles, SlidersHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import { ProFeatureGate } from '@/components/dashboard/ProFeatureGate';
import { RoleGuard } from '@/components/dashboard/RoleGuard';
import { useRestaurant } from '@/hooks/useRestaurant';
import { adminAuth, tenantAuth } from '@/lib/firebase';

const colorPresets = [
    { name: 'Ocean Blue', primary: '#3B82F6', secondary: '#0EA5E9' },
    { name: 'Forest Green', primary: '#22C55E', secondary: '#10B981' },
    { name: 'Royal Purple', primary: '#8B5CF6', secondary: '#A855F7' },
    { name: 'Sunset Orange', primary: '#F97316', secondary: '#FB923C' },
    { name: 'Rose Pink', primary: '#EC4899', secondary: '#F472B6' },
    { name: 'Slate Gray', primary: '#475569', secondary: '#64748B' },
];

type BrandingSettings = {
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    logoUrl: string;
    heroImageUrl: string;
    heroOverlayOpacity: number;
    heroHeadline: string;
    heroTagline: string;
    showHeroSection: boolean;
};

const DEFAULT_SETTINGS: BrandingSettings = {
    primaryColor: '#3B82F6',
    secondaryColor: '#6366F1',
    fontFamily: 'Inter',
    logoUrl: '',
    heroImageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80',
    heroOverlayOpacity: 60,
    heroHeadline: 'Culinary Excellence',
    heroTagline: 'Discover our exquisite menu crafted by world-class chefs',
    showHeroSection: true,
};

function BrandingContent() {
    const { storeId } = useRestaurant();
    const [settings, setSettings] = useState<BrandingSettings>(DEFAULT_SETTINGS);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingHero, setUploadingHero] = useState(false);
    const [loadingSettings, setLoadingSettings] = useState(true);
    const logoInputRef = useRef<HTMLInputElement | null>(null);
    const heroInputRef = useRef<HTMLInputElement | null>(null);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    const getActiveToken = async () => {
        if (tenantAuth.currentUser) return tenantAuth.currentUser.getIdToken(true);
        if (adminAuth.currentUser) return adminAuth.currentUser.getIdToken(true);
        throw new Error('Missing active session');
    };

    useEffect(() => {
        let cancelled = false;

        const loadBranding = async () => {
            if (!storeId) {
                setLoadingSettings(false);
                return;
            }

            try {
                setLoadingSettings(true);
                const token = await getActiveToken();
                const res = await fetch(`/api/branding/settings?restaurantId=${encodeURIComponent(storeId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(payload?.error || 'Failed to load branding settings');
                if (cancelled) return;

                setSettings({
                    primaryColor: payload.primaryColor || DEFAULT_SETTINGS.primaryColor,
                    secondaryColor: payload.secondaryColor || DEFAULT_SETTINGS.secondaryColor,
                    fontFamily: payload.fontFamily || DEFAULT_SETTINGS.fontFamily,
                    logoUrl: payload.logoUrl || '',
                    heroImageUrl: payload.heroImageUrl || DEFAULT_SETTINGS.heroImageUrl,
                    heroOverlayOpacity: Number.isFinite(payload.heroOverlayOpacity) ? payload.heroOverlayOpacity : DEFAULT_SETTINGS.heroOverlayOpacity,
                    heroHeadline: payload.heroHeadline || DEFAULT_SETTINGS.heroHeadline,
                    heroTagline: payload.heroTagline || DEFAULT_SETTINGS.heroTagline,
                    showHeroSection: typeof payload.showHeroSection === 'boolean' ? payload.showHeroSection : DEFAULT_SETTINGS.showHeroSection,
                });
            } catch (error: any) {
                if (!cancelled) {
                    toast.error(error?.message || 'Failed to load branding settings');
                }
            } finally {
                if (!cancelled) setLoadingSettings(false);
            }
        };

        loadBranding();
        return () => {
            cancelled = true;
        };
    }, [storeId]);

    const handleSave = async () => {
        if (!storeId) {
            toast.error('Restaurant context missing');
            return;
        }

        try {
            setSaving(true);
            const token = await getActiveToken();
            const res = await fetch('/api/branding/settings', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    restaurantId: storeId,
                    ...settings,
                }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.error || 'Failed to save branding');
            toast.success('Branding settings saved');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to save branding');
        } finally {
            setSaving(false);
        }
    };

    const handleAssetUpload = async (file: File | null, assetType: 'logo' | 'hero') => {
        if (!file) return;
        if (!storeId) {
            toast.error('Restaurant context missing');
            return;
        }

        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!allowed.includes(file.type)) {
            toast.error('Please upload PNG, JPG, JPEG, or WEBP image');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Logo must be 2MB or smaller');
            return;
        }

        try {
            if (assetType === 'logo') setUploadingLogo(true);
            else setUploadingHero(true);

            const token = await getActiveToken();
            const formData = new FormData();
            formData.append('restaurantId', storeId);
            formData.append('file', file);
            formData.append('assetType', assetType);

            const res = await fetch('/api/branding/upload', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.error || 'Failed to upload logo');

            const nextLogoUrl = payload.logoUrl || '';
            setSettings(prev => ({
                ...prev,
                ...(assetType === 'logo' ? { logoUrl: nextLogoUrl } : { heroImageUrl: nextLogoUrl }),
            }));
            toast.success(assetType === 'logo' ? 'Logo uploaded' : 'Hero image uploaded');
        } catch (error: any) {
            toast.error(error?.message || (assetType === 'logo' ? 'Failed to upload logo' : 'Failed to upload hero image'));
        } finally {
            if (assetType === 'logo') setUploadingLogo(false);
            else setUploadingHero(false);
        }
    };

    const handlePreview = () => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleOpenPreviewMenu = () => {
        if (!storeId) {
            toast.error('Restaurant context missing');
            return;
        }
        const href = `/${encodeURIComponent(storeId)}/menu?preview=1`;
        window.open(href, '_blank', 'noopener,noreferrer');
    };

    const previewPayload = useMemo(() => ({
        ...settings,
    }), [settings]);

    const sendPreviewMessage = () => {
        const frame = iframeRef.current?.contentWindow;
        if (!frame) return;
        frame.postMessage({ type: 'NEXRESTO_BRANDING_PREVIEW', payload: previewPayload }, window.location.origin);
    };

    useEffect(() => {
        sendPreviewMessage();
    }, [previewPayload]);

    if (loadingSettings) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                <span className="ml-2 text-slate-600">Loading branding settings...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Custom Branding</h1>
                    <p className="text-slate-500 text-sm mt-1">Personalize your restaurant's digital menu appearance</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleOpenPreviewMenu} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        <Eye className="w-4 h-4" />
                        Preview Menu
                    </button>
                    <button onClick={handlePreview} className="px-3 py-2 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">Jump to Live Panel</button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </motion.button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Color Settings */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl border border-slate-200 p-6"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <Palette className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Brand Colors</h2>
                            <p className="text-sm text-slate-500">Choose your primary and secondary colors</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Primary Color</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={settings.primaryColor}
                                    onChange={(e) => setSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                                    className="w-12 h-12 rounded-xl border border-slate-200 cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={settings.primaryColor}
                                    onChange={(e) => setSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm uppercase"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Secondary Color</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={settings.secondaryColor}
                                    onChange={(e) => setSettings(prev => ({ ...prev, secondaryColor: e.target.value }))}
                                    className="w-12 h-12 rounded-xl border border-slate-200 cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={settings.secondaryColor}
                                    onChange={(e) => setSettings(prev => ({ ...prev, secondaryColor: e.target.value }))}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm uppercase"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-3">Color Presets</label>
                            <div className="grid grid-cols-3 gap-2">
                                {colorPresets.map((preset) => (
                                    <button
                                        key={preset.name}
                                        onClick={() => {
                                            setSettings(prev => ({
                                                ...prev,
                                                primaryColor: preset.primary,
                                                secondaryColor: preset.secondary,
                                            }));
                                        }}
                                        className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
                                    >
                                        <div className="flex gap-1">
                                            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.primary }} />
                                            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.secondary }} />
                                        </div>
                                        <span className="text-xs text-slate-600">{preset.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Logo & Font */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-6"
                >
                    {/* Logo Upload */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                                <Image className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Restaurant Logo</h2>
                                <p className="text-sm text-slate-500">Upload your logo (PNG, JPG, max 2MB)</p>
                            </div>
                        </div>

                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                                void handleAssetUpload(e.target.files?.[0] || null, 'logo');
                                e.currentTarget.value = '';
                            }}
                        />

                        <div
                            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
                            onClick={() => logoInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                void handleAssetUpload(e.dataTransfer.files?.[0] || null, 'logo');
                            }}
                        >
                            {uploadingLogo ? (
                                <>
                                    <RefreshCw className="w-10 h-10 mx-auto text-blue-500 mb-3 animate-spin" />
                                    <p className="text-sm text-slate-600 mb-1">Uploading logo...</p>
                                </>
                            ) : settings.logoUrl ? (
                                <>
                                    <img src={settings.logoUrl} alt="Restaurant Logo" className="w-24 h-24 mx-auto rounded-xl object-cover border border-slate-200 mb-3" />
                                    <p className="text-sm text-slate-700 mb-1">Logo uploaded. Click to replace</p>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-10 h-10 mx-auto text-slate-400 mb-3" />
                                    <p className="text-sm text-slate-600 mb-1">Drop your logo here or click to browse</p>
                                </>
                            )}
                            <p className="text-xs text-slate-400">Recommended: 512x512px</p>
                        </div>
                    </div>

                    {/* Hero Section Settings */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                                <SlidersHorizontal className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Hero Section Settings</h2>
                                <p className="text-sm text-slate-500">Customize customer menu hero image and content</p>
                            </div>
                        </div>

                        <input
                            ref={heroInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                                void handleAssetUpload(e.target.files?.[0] || null, 'hero');
                                e.currentTarget.value = '';
                            }}
                        />

                        <div
                            className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-blue-400 transition-colors cursor-pointer"
                            onClick={() => heroInputRef.current?.click()}
                        >
                            {uploadingHero ? (
                                <div className="py-6"><RefreshCw className="w-8 h-8 mx-auto text-blue-500 animate-spin" /></div>
                            ) : (
                                <img src={settings.heroImageUrl} alt="Hero" className="w-full h-36 object-cover rounded-lg border border-slate-200" />
                            )}
                            <p className="text-xs text-slate-500 mt-3">Click to upload hero image</p>
                        </div>

                        <div className="mt-4 space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-slate-700">Overlay Opacity</label>
                                    <span className="text-xs text-slate-500">{settings.heroOverlayOpacity}%</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={settings.heroOverlayOpacity}
                                    onChange={(e) => setSettings(prev => ({ ...prev, heroOverlayOpacity: Number(e.target.value) }))}
                                    className="w-full"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Headline</label>
                                <input
                                    type="text"
                                    value={settings.heroHeadline}
                                    onChange={(e) => setSettings(prev => ({ ...prev, heroHeadline: e.target.value.slice(0, 120) }))}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Tagline</label>
                                <input
                                    type="text"
                                    value={settings.heroTagline}
                                    onChange={(e) => setSettings(prev => ({ ...prev, heroTagline: e.target.value.slice(0, 220) }))}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                />
                            </div>

                            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer">
                                <span className="text-sm text-slate-700">Show Hero Section</span>
                                <input
                                    type="checkbox"
                                    checked={settings.showHeroSection}
                                    onChange={(e) => setSettings(prev => ({ ...prev, showHeroSection: e.target.checked }))}
                                    className="h-4 w-4"
                                />
                            </label>
                        </div>
                    </div>

                    {/* Font Selection */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                                <Type className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Typography</h2>
                                <p className="text-sm text-slate-500">Choose your menu font style</p>
                            </div>
                        </div>

                        <select
                            value={settings.fontFamily}
                            onChange={(e) => setSettings(prev => ({ ...prev, fontFamily: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        >
                            <option value="Inter">Inter (Modern)</option>
                            <option value="Playfair Display">Playfair Display (Elegant)</option>
                            <option value="Poppins">Poppins (Friendly)</option>
                            <option value="Roboto">Roboto (Clean)</option>
                            <option value="Lora">Lora (Classic)</option>
                        </select>

                        <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                            <p className="text-xs text-slate-400 mb-2">Preview:</p>
                            <p className="text-xl font-bold text-slate-900" style={{ fontFamily: settings.fontFamily }}>
                                Your Restaurant Name
                            </p>
                            <p className="text-sm text-slate-600 mt-1" style={{ fontFamily: settings.fontFamily }}>
                                Delicious food, unforgettable experience
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Live Preview */}
            <motion.div
                ref={previewRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-2xl border border-slate-200 p-6"
            >
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Live Menu Preview</h2>
                        <p className="text-sm text-slate-500">Changes sync in real time to customer menu preview</p>
                    </div>
                </div>

                {storeId ? (
                    <iframe
                        ref={iframeRef}
                        title="Customer Menu Preview"
                        src={`/${encodeURIComponent(storeId)}/menu?preview=1`}
                        onLoad={sendPreviewMessage}
                        className="w-full h-[760px] rounded-xl border border-slate-200"
                    />
                ) : (
                    <div className="h-48 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-500">
                        Restaurant context missing for preview
                    </div>
                )}
            </motion.div>
        </div>
    );
}

export default function BrandingPage() {
    return (
        <RoleGuard requiredPermission="can_view_branding">
            <ProFeatureGate 
                feature="Custom Branding" 
                description="Create a unique look for your digital menu with custom colors, logo, and typography that matches your restaurant's identity."
            >
                <BrandingContent />
            </ProFeatureGate>
        </RoleGuard>
    );
}
