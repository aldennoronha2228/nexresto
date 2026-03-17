'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, Sparkles, Send, Trash2, X } from 'lucide-react';
import { tenantAuth, adminAuth } from '@/lib/firebase';
import { useRestaurant } from '@/hooks/useRestaurant';

const SESSION_KEY = 'nexresto_gemini_support_chat_v1';

const STARTER_MESSAGE = {
    role: 'assistant',
    content: 'I can help with operations, growth, and technical issues across your dashboard.\n- Ask about menu, orders, QR, or staff and I will keep it concise.',
};

function toUsageState(payload) {
    const tier = payload?.tier === 'pro' ? 'pro' : 'free';
    const limit = Number(payload?.limit) > 0 ? Number(payload.limit) : (tier === 'pro' ? 30 : 5);
    const usedRaw = Number(payload?.used);
    const used = Number.isFinite(usedRaw) ? Math.max(0, Math.floor(usedRaw)) : 0;
    const remaining = Math.max(0, limit - used);
    return {
        tier,
        used,
        limit,
        remaining,
        isLimitReached: Boolean(payload?.isLimitReached) || used >= limit,
        resetsAt: typeof payload?.resetsAt === 'string' ? payload.resetsAt : null,
    };
}

function buildAsciiMeter(used, limit) {
    const slots = 10;
    const fill = limit > 0 ? Math.min(slots, Math.round((used / limit) * slots)) : 0;
    return `[ ${'|'.repeat(fill)}${' '.repeat(slots - fill)} ]`;
}

function renderInlineMarkdown(text) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) {
            const value = part.slice(2, -2);
            return <strong key={`b-${idx}`} className="font-semibold text-white">{value}</strong>;
        }
        return <span key={`t-${idx}`}>{part}</span>;
    });
}

function renderAssistantMarkdown(content) {
    const lines = content.replace(/\r/g, '').split('\n');
    const blocks = [];
    let bullets = [];
    let key = 0;

    const flushBullets = () => {
        if (bullets.length === 0) return;
        blocks.push(
            <ul key={`ul-${key++}`} className="list-disc list-outside pl-5 space-y-1.5 mt-2">
                {bullets.map((item, idx) => (
                    <li key={`li-${idx}`} className="text-slate-100 leading-relaxed">
                        {renderInlineMarkdown(item)}
                    </li>
                ))}
            </ul>
        );
        bullets = [];
    };

    lines.forEach((raw) => {
        const line = raw.trim();
        if (!line) {
            flushBullets();
            return;
        }

        const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
        if (bulletMatch) {
            bullets.push(bulletMatch[1]);
            return;
        }

        flushBullets();
        blocks.push(
            <p key={`p-${key++}`} className="text-slate-100 leading-relaxed">
                {renderInlineMarkdown(line)}
            </p>
        );
    });

    flushBullets();
    return blocks;
}

export default function GeminiSupportChat() {
    const { storeId } = useRestaurant();
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([STARTER_MESSAGE]);
    const [isLoading, setIsLoading] = useState(false);
    const [dashboardContext, setDashboardContext] = useState(null);
    const [usage, setUsage] = useState(toUsageState({ tier: 'free', used: 0, limit: 5 }));
    const [lastContextAt, setLastContextAt] = useState(0);
    const bottomRef = useRef(null);

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                setMessages(parsed);
            }
        } catch {
            // ignore malformed session data
        }
    }, []);

    useEffect(() => {
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages));
        } catch {
            // ignore storage issues
        }
    }, [messages]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading, isOpen]);

    const canSend = useMemo(
        () => input.trim().length > 0 && !isLoading && !usage.isLimitReached,
        [input, isLoading, usage.isLimitReached],
    );

    const getActiveToken = async () => {
        if (tenantAuth.currentUser) return tenantAuth.currentUser.getIdToken(true);
        if (adminAuth.currentUser) return adminAuth.currentUser.getIdToken(true);
        return null;
    };

    const refreshDashboardContext = async (force = false) => {
        if (!storeId) return null;

        const now = Date.now();
        if (!force && dashboardContext && now - lastContextAt < 60_000) {
            return dashboardContext;
        }

        const token = await getActiveToken();
        if (!token) return dashboardContext;

        const res = await fetch(`/api/support/context?restaurantId=${encodeURIComponent(storeId)}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        });

        if (!res.ok) return dashboardContext;
        const payload = await res.json();
        setDashboardContext(payload);
        if (payload?.usage) {
            setUsage(toUsageState(payload.usage));
        }
        setLastContextAt(now);
        return payload;
    };

    useEffect(() => {
        if (isOpen) {
            refreshDashboardContext(false).catch(() => {
                // Non-blocking: chat still works without context snapshot.
            });
        }
    }, [isOpen]);

    const clearChat = () => {
        setMessages([STARTER_MESSAGE]);
        setInput('');
        setIsLoading(false);
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify([STARTER_MESSAGE]));
        } catch {
            // ignore storage issues
        }
    };

    const sendMessage = async (e) => {
        e?.preventDefault?.();
        const text = input.trim();
        if (!text || isLoading) return;

        const nextMessages = [...messages, { role: 'user', content: text }];
        setMessages(nextMessages);
        setInput('');
        setIsLoading(true);

        try {
            const contextSnapshot = await refreshDashboardContext(false);
            const token = await getActiveToken();
            if (!token) {
                throw new Error('Session expired. Please sign in again.');
            }

            const response = await fetch('/api/support/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    restaurantId: storeId,
                    messages: nextMessages,
                    dashboardContext: contextSnapshot || dashboardContext || undefined,
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                if (payload?.usage) {
                    setUsage(toUsageState(payload.usage));
                }

                if (response.status === 429 && payload?.code === 'daily_limit_reached') {
                    throw new Error('Daily prompt limit reached. It will reset at midnight.');
                }

                if (response.status === 429 || payload?.code === 'quota_exceeded') {
                    throw new Error('AI quota reached. Please enable/increase Gemini billing quota, or wait for reset and try again.');
                }

                const detail = typeof payload?.details === 'string' ? payload.details : '';
                const joined = [payload?.error || 'Unable to fetch AI response.', detail].filter(Boolean).join(' ');
                throw new Error(joined);
            }

            const reply = (payload?.reply || '').toString().trim();
            if (payload?.usage) {
                setUsage(toUsageState(payload.usage));
            }
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content:
                        reply ||
                        'I can help with menu optimization, metrics explanation, QR troubleshooting, and staff advice. What would you like to improve first?',
                },
            ]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: `I am having trouble connecting right now. ${error?.message || 'Please try again in a moment.'}`,
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 18, scale: 0.98 }}
                        transition={{ duration: 0.24, ease: 'easeOut' }}
                        className="fixed z-[60] bottom-0 left-0 right-0 h-[78vh] md:bottom-24 md:left-auto md:right-8 md:h-[560px] md:w-[390px]"
                    >
                        <div className="h-full rounded-t-3xl md:rounded-3xl border border-slate-700/50 bg-slate-900/75 backdrop-blur-2xl shadow-2xl shadow-black/35 overflow-hidden">
                            <div className="h-14 px-4 flex items-center justify-between bg-gradient-to-r from-[#08142f]/95 to-[#0b1a3d]/95 text-white border-b border-white/10">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                                        <Bot className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold leading-tight">Hotel AI Concierge</p>
                                        <p className="text-[10px] text-slate-300">Hospitality Expert</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={clearChat}
                                        className="h-8 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
                                        title="Clear chat"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Clear Chat
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsOpen(false)}
                                        className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                                        title="Close"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="h-[calc(100%-56px-120px)] overflow-y-auto px-3 py-3 space-y-2 bg-gradient-to-b from-slate-900/20 to-slate-950/25">
                                <AnimatePresence initial={false}>
                                    {messages.map((msg, idx) => {
                                        const isUser = msg.role === 'user';
                                        return (
                                            <motion.div
                                                key={`${msg.role}-${idx}-${msg.content.slice(0, 20)}`}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.18 }}
                                                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div
                                                    className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                                                        isUser
                                                            ? 'bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white'
                                                            : 'bg-white/10 text-slate-100 border border-white/15'
                                                    }`}
                                                >
                                                    {isUser ? msg.content : renderAssistantMarkdown(msg.content)}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>

                                {isLoading && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex justify-start"
                                    >
                                        <div className="rounded-2xl px-3 py-2 bg-white/10 border border-white/15 text-slate-200 text-sm flex items-center gap-1.5">
                                            <span className="text-xs text-slate-300">Concierge is typing</span>
                                            <span className="inline-flex gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce" />
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce [animation-delay:120ms]" />
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce [animation-delay:240ms]" />
                                            </span>
                                        </div>
                                    </motion.div>
                                )}
                                <div ref={bottomRef} />
                            </div>

                            <form onSubmit={sendMessage} className="h-[120px] px-3 py-2 border-t border-white/10 bg-slate-900/40 backdrop-blur-xl flex flex-col gap-2">
                                <div>
                                    <p className="text-[11px] text-slate-300">
                                        <span className="font-mono text-slate-200">{buildAsciiMeter(usage.used, usage.limit)}</span> {usage.used} / {usage.limit} prompts used
                                    </p>
                                    <div className="mt-1 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                                        <div
                                            className={usage.isLimitReached ? 'h-full bg-rose-500' : 'h-full bg-gradient-to-r from-cyan-400 to-blue-500'}
                                            style={{ width: `${Math.min(100, usage.limit > 0 ? (usage.used / usage.limit) * 100 : 0)}%` }}
                                        />
                                    </div>
                                    {usage.tier === 'free' && (
                                        <a
                                            href={`/${storeId}/dashboard/account`}
                                            className="mt-1 inline-block text-[11px] text-blue-300 hover:text-blue-200 underline"
                                        >
                                            Get 30 prompts with Pro
                                        </a>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="Ask about menu trends, metrics, QR issues..."
                                        className="flex-1 h-10 rounded-xl border border-white/15 bg-slate-950/40 px-3 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-500"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!canSend}
                                        className="h-10 px-3 rounded-xl bg-gradient-to-r from-[#0f172a] to-[#1e293b] border border-white/10 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/35 text-xs font-medium"
                                        title={usage.isLimitReached ? 'Daily limit reached. Resets at 12:00 AM.' : 'Send'}
                                    >
                                        {usage.isLimitReached ? 'Limit Reached' : <Send className="w-4 h-4" />}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => setIsOpen((v) => !v)}
                className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-[61] w-14 h-14 rounded-2xl bg-gradient-to-r from-[#0b1226] to-[#101a36] border border-white/10 text-white shadow-2xl shadow-black/40 flex items-center justify-center"
                aria-label="Toggle AI Concierge"
                title="Hotel AI Concierge"
            >
                {isOpen ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
            </motion.button>
        </>
    );
}
