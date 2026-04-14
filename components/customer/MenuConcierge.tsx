'use client';

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bot, MessageCircle, SendHorizontal, Sparkles, X } from 'lucide-react';

type ConciergeMenuItem = {
    id: string;
    name: string;
    description: string;
    category: string;
    price: number;
    type?: 'veg' | 'non-veg';
    image?: string;
    available?: boolean;
};

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    streaming?: boolean;
    recommendationItem?: ConciergeMenuItem | null;
    pairingItem?: ConciergeMenuItem | null;
};

type MenuConciergeProps = {
    restaurantId: string;
    menuItems: ConciergeMenuItem[];
    onAddToCart: (item: ConciergeMenuItem) => void;
};

const MOOD_CHIPS = [
    { label: 'Hungry', emoji: '🍕', prompt: 'I am very hungry and want something filling right now.' },
    { label: 'Comforting', emoji: '😌', prompt: 'I feel a bit stressed and want comforting food.' },
    { label: 'Healthy', emoji: '🌱', prompt: 'I want a healthy and light meal.' },
    { label: 'Spicy', emoji: '🌶️', prompt: 'I am craving something spicy and bold.' },
    { label: 'Quick Bite', emoji: '⚡', prompt: 'I need something quick, tasty, and not too heavy.' },
] as const;

function inr(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
    }).format(value || 0);
}

function line(text: string): string {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function fallbackForError(): string {
    return 'I could not reach the kitchen brain right now, but I can still help. Try a mood chip and I will recommend quickly.';
}

function buildAssistantText(payload: any): string {
    const empath = line(payload?.response?.empatheticLine);
    const recName = line(payload?.response?.recommendation?.name);
    const recWhy = line(payload?.response?.recommendation?.reason);
    const pairName = line(payload?.response?.pairing?.name);
    const pairWhy = line(payload?.response?.pairing?.reason);

    return [
        empath || 'I have got a great pick for your mood.',
        recName ? `I would recommend ${recName} because ${recWhy || 'it fits exactly what you are craving.'}` : '',
        pairName ? `Pairing suggestion: ${pairName}${pairWhy ? ` - ${pairWhy}` : ''}` : '',
    ]
        .filter(Boolean)
        .join('\n\n');
}

export function MenuConcierge({ restaurantId, menuItems, onAddToCart }: MenuConciergeProps) {
    const [open, setOpen] = React.useState(false);
    const [input, setInput] = React.useState('');
    const [sending, setSending] = React.useState(false);
    const [messages, setMessages] = React.useState<ChatMessage[]>([]);
    const scrollRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        if (messages.length === 0) return;
        const node = scrollRef.current;
        if (!node) return;
        node.scrollTop = node.scrollHeight;
    }, [messages]);

    const streamAssistant = React.useCallback(async (messageId: string, fullText: string) => {
        const chunks = fullText.match(/.{1,4}/g) || [fullText];
        let current = '';

        for (const chunk of chunks) {
            current += chunk;
            setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, text: current } : msg)));
            await new Promise((resolve) => setTimeout(resolve, 18));
        }

        setMessages((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, streaming: false } : msg)));
    }, []);

    const askConcierge = React.useCallback(async (prompt: string) => {
        const cleanedPrompt = line(prompt);
        if (!cleanedPrompt || sending || !restaurantId || menuItems.length === 0) return;

        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            text: cleanedPrompt,
        };

        const assistantId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const assistantPlaceholder: ChatMessage = {
            id: assistantId,
            role: 'assistant',
            text: '',
            streaming: true,
        };

        setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
        setInput('');
        setSending(true);

        try {
            const response = await fetch('/api/concierge/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantId,
                    message: cleanedPrompt,
                    menuItems: menuItems.map((item) => ({
                        id: item.id,
                        name: item.name,
                        description: item.description,
                        category: item.category,
                        price: item.price,
                        type: item.type,
                        image: item.image,
                        available: item.available !== false,
                    })),
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(line(payload?.error) || 'Concierge request failed.');
            }

            const finalText = buildAssistantText(payload);

            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === assistantId
                        ? {
                            ...msg,
                            recommendationItem: payload?.recommendationItem || null,
                            pairingItem: payload?.pairingItem || null,
                        }
                        : msg
                )
            );

            await streamAssistant(assistantId, finalText);
        } catch {
            await streamAssistant(assistantId, fallbackForError());
        } finally {
            setSending(false);
        }
    }, [sending, restaurantId, menuItems, streamAssistant]);

    return (
        <>
            <motion.button
                type="button"
                onClick={() => setOpen(true)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="fixed bottom-24 right-4 z-[80] flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2b2f32] bg-[#14181b] text-[#e6e8e7] shadow-[0_18px_40px_rgba(0,0,0,0.55)] transition hover:border-[#3c4347] hover:bg-[#1a1f23] sm:bottom-8 sm:right-6"
                aria-label="Open Nexie menu concierge"
            >
                <MessageCircle className="h-6 w-6" />
            </motion.button>

            <AnimatePresence>
                {open ? (
                    <motion.div
                        initial={{ opacity: 0, y: 28, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 28, scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                        className="fixed bottom-24 right-4 z-[85] flex h-[72vh] w-[min(92vw,420px)] flex-col overflow-hidden rounded-3xl border border-[#2a2f33] bg-[#101416] shadow-[0_24px_65px_rgba(0,0,0,0.62)] sm:bottom-8 sm:right-6"
                    >
                        <div className="flex items-center justify-between border-b border-[#262d30] bg-[#12181b] px-4 py-3">
                            <div className="flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#2f373b] bg-[#1a2023]">
                                    <Bot className="h-5 w-5 text-[#f97316]" />
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-[0.18em] text-[#97a3a8]">Menu Concierge</p>
                                    <p className="text-base font-semibold text-[#f3f4f4]">Nexie</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-lg border border-[#30383c] bg-[#1a2024] p-1.5 text-[#c9d0d3] transition hover:border-[#3e484d] hover:bg-[#222a2f]"
                                aria-label="Close concierge"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="border-b border-[#252c30] bg-[#11171a] px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                                {MOOD_CHIPS.map((chip) => (
                                    <button
                                        key={chip.label}
                                        type="button"
                                        disabled={sending}
                                        onClick={() => {
                                            void askConcierge(chip.prompt);
                                        }}
                                        className="rounded-full border border-[#30393e] bg-[#1a2226] px-3 py-1.5 text-xs font-medium text-[#dde2e4] transition hover:border-[#3f4b51] hover:bg-[#222b30] disabled:opacity-50"
                                    >
                                        <span className="mr-1">{chip.emoji}</span>
                                        {chip.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-[#0f1417] px-3 py-3">
                            {messages.length === 0 ? (
                                <div className="rounded-2xl border border-[#2f363a] bg-[#171e22] p-3 text-sm text-[#cfd5d8]">
                                    Tell me your mood or craving and I will curate the best plate and pairing for right now.
                                </div>
                            ) : null}

                            {messages.map((message) => {
                                const assistant = message.role === 'assistant';
                                return (
                                    <motion.div
                                        key={message.id}
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                                        className={assistant ? 'mr-6' : 'ml-6'}
                                    >
                                        <div
                                            className={
                                                assistant
                                                    ? 'rounded-2xl border border-[#31393d] bg-[#171e22] p-3 text-sm text-[#d2d8db]'
                                                    : 'rounded-2xl border border-[#483219] bg-[#f97316] p-3 text-sm text-[#1f1409]'
                                            }
                                        >
                                            <p className="whitespace-pre-wrap">{message.text}</p>
                                            {message.streaming ? (
                                                <span className="ml-1 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-[#f97316]" />
                                            ) : null}
                                        </div>

                                        {assistant && (message.recommendationItem || message.pairingItem) ? (
                                            <div className="mt-2 space-y-2">
                                                {message.recommendationItem ? (
                                                    <div className="overflow-hidden rounded-2xl border border-[#30383d] bg-[#141b1f]">
                                                        <div className="flex gap-3 p-3">
                                                            {message.recommendationItem.image ? (
                                                                <img
                                                                    src={message.recommendationItem.image}
                                                                    alt={message.recommendationItem.name}
                                                                    className="h-16 w-16 rounded-xl object-cover"
                                                                />
                                                            ) : (
                                                                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#1e2529] text-xl">🍽️</div>
                                                            )}
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-sm font-semibold text-[#edf0f1]">{message.recommendationItem.name}</p>
                                                                <p className="mt-0.5 text-xs text-[#95a0a5]">{message.recommendationItem.category}</p>
                                                                <p className="mt-1 text-sm font-semibold text-[#f8b26d]">{inr(message.recommendationItem.price)}</p>
                                                            </div>
                                                        </div>
                                                        <div className="border-t border-[#283136] px-3 py-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => onAddToCart(message.recommendationItem as ConciergeMenuItem)}
                                                                className="inline-flex items-center gap-1 rounded-xl bg-[#f97316] px-3 py-1.5 text-xs font-semibold text-[#1d1409] transition hover:bg-[#fb8a3e]"
                                                            >
                                                                <Sparkles className="h-3.5 w-3.5" />
                                                                Add to Cart
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : null}

                                                {message.pairingItem ? (
                                                    <div className="rounded-xl border border-[#2e373c] bg-[#161d20] px-3 py-2 text-xs text-[#b6c0c4]">
                                                        Pairing match: <span className="font-semibold">{message.pairingItem.name}</span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </motion.div>
                                );
                            })}
                        </div>

                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void askConcierge(input);
                            }}
                            className="border-t border-[#252d31] bg-[#11181b] p-3"
                        >
                            <div className="flex items-center gap-2 rounded-2xl border border-[#2f383d] bg-[#171f23] px-3 py-2">
                                <input
                                    value={input}
                                    onChange={(event) => setInput(event.target.value)}
                                    placeholder="Tell Nexie your mood or craving..."
                                    className="h-9 flex-1 bg-transparent text-sm text-[#dce2e4] placeholder:text-[#819096] outline-none"
                                    disabled={sending}
                                />
                                <button
                                    type="submit"
                                    disabled={sending || line(input).length === 0}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#f97316] text-[#1d1409] transition hover:bg-[#fb8a3e] disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label="Send message"
                                >
                                    <SendHorizontal className="h-4 w-4" />
                                </button>
                            </div>
                        </form>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </>
    );
}
