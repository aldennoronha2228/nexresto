'use client';

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { Bot, MessageCircle, SendHorizontal, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    pending?: boolean;
};

type DashboardContext = Record<string, unknown> | null;

type Usage = {
    remaining?: number;
    used?: number;
    limit?: number;
};

type SupportChatWidgetProps = {
    restaurantId: string;
    accessToken?: string | null;
};

const QUICK_PROMPTS = [
    'How can I increase orders today?',
    'Show me what to improve in my menu.',
    'How do I reduce slow prep times?',
    'Give me a growth plan for this week.',
] as const;

function cleanText(value: unknown): string {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function makeId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildWelcomeMessage(): ChatMessage {
    return {
        id: makeId('welcome'),
        role: 'assistant',
        text: 'Hi, I am Nexo, your restaurant growth assistant. Ask me anything about operations, menu, tables, or sales.',
    };
}

function TypingDots() {
    return (
        <div className="inline-flex items-center gap-1.5" aria-label="Assistant is typing">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
        </div>
    );
}

export function SupportChatWidget({ restaurantId, accessToken }: SupportChatWidgetProps) {
    const pathname = usePathname();
    const [open, setOpen] = React.useState(false);
    const [input, setInput] = React.useState('');
    const [sending, setSending] = React.useState(false);
    const [loadingContext, setLoadingContext] = React.useState(false);
    const [messages, setMessages] = React.useState<ChatMessage[]>([buildWelcomeMessage()]);
    const [dashboardContext, setDashboardContext] = React.useState<DashboardContext>(null);
    const [usage, setUsage] = React.useState<Usage | null>(null);
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const hasFetchedContext = React.useRef(false);

    React.useEffect(() => {
        const node = scrollRef.current;
        if (!node) return;
        node.scrollTop = node.scrollHeight;
    }, [messages, open]);

    const fetchContext = React.useCallback(async () => {
        if (!restaurantId || !accessToken || hasFetchedContext.current) return;

        hasFetchedContext.current = true;
        setLoadingContext(true);

        try {
            const response = await fetch(`/api/support/context?restaurantId=${encodeURIComponent(restaurantId)}`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
                cache: 'no-store',
            });

            const payload = await response.json().catch(() => ({}));
            if (response.ok) {
                setDashboardContext(payload || null);
            }
        } catch {
            setDashboardContext(null);
        } finally {
            setLoadingContext(false);
        }
    }, [restaurantId, accessToken]);

    React.useEffect(() => {
        if (!open) return;
        void fetchContext();
    }, [open, fetchContext]);

    const sendMessage = React.useCallback(async (prompt: string) => {
        const userText = cleanText(prompt);
        if (!userText || !restaurantId || !accessToken || sending) return;

        const userMessage: ChatMessage = {
            id: makeId('user'),
            role: 'user',
            text: userText,
        };

        const assistantId = makeId('assistant');
        const assistantPlaceholder: ChatMessage = {
            id: assistantId,
            role: 'assistant',
            text: '',
            pending: true,
        };

        const nextMessages = [...messages, userMessage];
        setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
        setInput('');
        setSending(true);

        try {
            const response = await fetch('/api/support/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    restaurantId,
                    messages: nextMessages.map((msg) => ({
                        role: msg.role,
                        content: msg.text,
                    })),
                    dashboardContext,
                    currentPath: pathname,
                }),
            });

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                const errText = cleanText(payload?.error) || 'Chat request failed. Please try again.';
                setMessages((prev) =>
                    prev.map((msg) => (msg.id === assistantId ? { ...msg, text: errText, pending: false } : msg))
                );
                if (payload?.usage && typeof payload.usage === 'object') {
                    setUsage(payload.usage as Usage);
                }
                return;
            }

            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === assistantId
                        ? {
                            ...msg,
                            text: cleanText(payload?.reply) || 'I am ready to help. Ask another question.',
                            pending: false,
                        }
                        : msg
                )
            );

            if (payload?.usage && typeof payload.usage === 'object') {
                setUsage(payload.usage as Usage);
            }
        } catch {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === assistantId
                        ? {
                            ...msg,
                            text: 'I could not connect right now. Please try again in a moment.',
                            pending: false,
                        }
                        : msg
                )
            );
        } finally {
            setSending(false);
        }
    }, [restaurantId, accessToken, sending, messages, dashboardContext, pathname]);

    const usageLabel = React.useMemo(() => {
        if (!usage || typeof usage.remaining !== 'number' || typeof usage.limit !== 'number') return '';
        if (usage.limit >= Number.MAX_SAFE_INTEGER / 2) return 'Unlimited today';
        return `${usage.remaining}/${usage.limit} left today`;
    }, [usage]);

    const hasStartedConversation = React.useMemo(
        () => messages.some((message) => message.role === 'user'),
        [messages]
    );

    const clearChat = React.useCallback(() => {
        if (sending) return;
        setMessages([buildWelcomeMessage()]);
        setInput('');
    }, [sending]);

    const isTablesPage = pathname?.includes('/dashboard/tables');
    const floatingPositionClass = isTablesPage
        ? 'bottom-36 right-4 md:bottom-10 md:right-10'
        : 'bottom-24 right-4 md:bottom-10 md:right-10';

    const mobileSheetPositionClass = isTablesPage
        ? 'left-2 right-2 bottom-[calc(env(safe-area-inset-bottom)+6rem)] md:left-auto md:right-10 md:bottom-10 md:w-[min(94vw,450px)]'
        : 'left-2 right-2 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] md:left-auto md:right-10 md:bottom-10 md:w-[min(94vw,450px)]';

    return (
        <>
            <motion.button
                type="button"
                onClick={() => setOpen(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                    'fixed z-50 flex h-14 w-14 items-center justify-center rounded-full border border-sky-300/30 bg-gradient-to-br from-sky-400 via-blue-500 to-cyan-300 text-slate-950 shadow-xl shadow-sky-500/25 ring-1 ring-sky-200/20',
                    floatingPositionClass
                )}
                style={{ boxShadow: '0 8px 32px 0 rgba(22, 131, 255, 0.28)' }}
                aria-label="Open Nexo chatbot"
                title="Open Nexo chatbot"
            >
                <MessageCircle className="h-6 w-6" />
            </motion.button>

            <AnimatePresence>
                {open ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                        className={cn(
                            'fixed z-[60] flex h-[68vh] min-h-[360px] max-h-[680px] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-3xl border border-sky-200/10 bg-[#030714] shadow-2xl shadow-black/55 md:h-[74vh] md:min-h-0',
                            mobileSheetPositionClass
                        )}
                    >
                        <div className="relative flex items-center justify-between border-b border-slate-800/80 bg-gradient-to-r from-slate-900/95 via-[#0a1025]/95 to-slate-900/95 px-4 py-3">
                            <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(56,189,248,0.35), transparent 55%)' }} />
                            <div className="flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-300 text-white ring-1 ring-white/20">
                                    <Bot className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/70">Support Assistant</p>
                                    <p className="text-base font-semibold text-slate-100">Nexo</p>
                                    <p className="mt-0.5 text-[11px] text-emerald-300/90">Online and ready</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={clearChat}
                                    disabled={!hasStartedConversation || sending}
                                    className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                                    aria-label="Clear chat"
                                    title="Clear chat"
                                >
                                    Clear
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-300 transition hover:border-slate-500 hover:bg-slate-800"
                                    aria-label="Close chatbot"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        <div className="border-b border-slate-800/80 bg-slate-900/50 px-3 py-2.5">
                            {!hasStartedConversation ? (
                                <div className="flex flex-wrap gap-2">
                                    {QUICK_PROMPTS.map((prompt) => (
                                        <button
                                            key={prompt}
                                            type="button"
                                            disabled={sending || !accessToken}
                                            onClick={() => {
                                                void sendMessage(prompt);
                                            }}
                                            className="rounded-full border border-slate-700/80 bg-slate-800/95 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 disabled:opacity-50"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                                <span className="inline-flex items-center gap-1">
                                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                                    {loadingContext ? 'Loading dashboard context...' : 'Using your live dashboard context'}
                                </span>
                                {usageLabel ? <span>{usageLabel}</span> : null}
                            </div>
                        </div>

                        <div
                            ref={scrollRef}
                            className="flex-1 space-y-3 overflow-y-auto bg-[#020617] px-3 py-3"
                            style={{ backgroundImage: 'radial-gradient(circle at top right, rgba(56, 189, 248, 0.08), transparent 35%)' }}
                        >
                            {messages.map((message) => {
                                const assistant = message.role === 'assistant';
                                return (
                                    <div key={message.id} className={cn('flex items-end gap-2', assistant ? 'justify-start' : 'justify-end')}>
                                        {assistant ? (
                                            <div className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-500/10 text-cyan-200">
                                                <Bot className="h-3.5 w-3.5" />
                                            </div>
                                        ) : null}
                                        <div
                                            className={cn(
                                                'w-fit max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px] font-medium leading-relaxed shadow-lg',
                                                assistant
                                                    ? 'border border-slate-600/90 bg-slate-800 text-slate-50 shadow-black/35'
                                                    : 'bg-blue-600 text-white shadow-blue-900/40'
                                            )}
                                        >
                                            {message.text ? <p className="whitespace-pre-wrap break-words text-current">{message.text}</p> : null}
                                            {message.pending ? <div className="mt-1.5"><TypingDots /></div> : null}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {!accessToken ? (
                            <div className="border-t border-rose-900/60 bg-rose-950/40 px-4 py-2 text-xs text-rose-300">
                                Session token not available yet. Reload this page or sign in again.
                            </div>
                        ) : null}

                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void sendMessage(input);
                            }}
                            className="border-t border-slate-800/80 bg-slate-900/70 p-3"
                        >
                            <div className="flex items-center gap-2 rounded-2xl border border-slate-700/90 bg-[#040b1f] px-3 py-2 shadow-inner shadow-slate-950/40">
                                <input
                                    value={input}
                                    onChange={(event) => setInput(event.target.value)}
                                    placeholder="Ask about growth, menu, tables, or support..."
                                    className="h-9 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                                    disabled={sending || !accessToken}
                                />
                                <button
                                    type="submit"
                                    disabled={sending || !accessToken || cleanText(input).length === 0}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
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
