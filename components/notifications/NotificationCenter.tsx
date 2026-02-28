'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Bell, BellDot, Check, CheckCheck, Trash2, X,
    Phone, Calendar, AlertTriangle, Info, CheckCircle,
    MessageSquare, Zap, ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';

// --- Types ---

interface Notification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'call' | 'appointment';
    icon?: string;
    link?: string;
    read: boolean;
    source: string;
    createdAt: string | null;
}

// --- Icon Map ---

const typeIcons: Record<string, React.ElementType> = {
    info: Info,
    success: CheckCircle,
    warning: AlertTriangle,
    error: AlertTriangle,
    call: Phone,
    appointment: Calendar,
};

const typeColors: Record<string, string> = {
    info: 'text-blue-500 bg-blue-500/10',
    success: 'text-emerald-500 bg-emerald-500/10',
    warning: 'text-amber-500 bg-amber-500/10',
    error: 'text-red-500 bg-red-500/10',
    call: 'text-indigo-500 bg-indigo-500/10',
    appointment: 'text-purple-500 bg-purple-500/10',
};

// --- Notification Center ---

export function NotificationCenter() {
    const authFetch = useAuthFetch();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Fetch notifications
    const fetchNotifications = useCallback(async () => {
        try {
            const res = await authFetch('/api/notifications?limit=20');
            if (!res.ok) return;
            const data = await res.json();
            setNotifications(data.notifications || []);
            setUnreadCount(data.unreadCount || 0);
        } catch {
            // Silently fail for polling
        }
    }, [authFetch]);

    // Initial fetch + polling
    useEffect(() => {
        fetchNotifications();

        // Poll every 30 seconds
        pollRef.current = setInterval(fetchNotifications, 30_000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [fetchNotifications]);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    // Mark single as read
    const markAsRead = async (id: string) => {
        try {
            await authFetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationId: id }),
            });
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, read: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch { /* ignore */ }
    };

    // Mark all as read
    const markAllAsRead = async () => {
        try {
            await authFetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAll: true }),
            });
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch { /* ignore */ }
    };

    // Delete notification
    const deleteNotification = async (id: string) => {
        try {
            await authFetch('/api/notifications', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationId: id }),
            });
            const removed = notifications.find(n => n.id === id);
            setNotifications(prev => prev.filter(n => n.id !== id));
            if (removed && !removed.read) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        } catch { /* ignore */ }
    };

    return (
        <div className="relative" ref={panelRef}>
            {/* Bell Button */}
            <button
                onClick={() => setOpen(!open)}
                className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Bildirimler"
            >
                {unreadCount > 0 ? (
                    <>
                        <BellDot className="h-5 w-5" />
                        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    </>
                ) : (
                    <Bell className="h-5 w-5" />
                )}
            </button>

            {/* Notification Panel */}
            {open && (
                <div className="absolute right-0 top-full mt-2 w-96 max-h-[480px] rounded-xl border bg-background shadow-xl z-50 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                        <h3 className="font-semibold text-sm">Bildirimler</h3>
                        <div className="flex items-center gap-1">
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    className="text-xs text-primary hover:underline flex items-center gap-1 px-2 py-1 rounded hover:bg-accent"
                                >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    Tümünü oku
                                </button>
                            )}
                            <button
                                onClick={() => setOpen(false)}
                                className="p-1 rounded hover:bg-accent text-muted-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Notification List */}
                    <div className="flex-1 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <Bell className="h-10 w-10 mb-3 opacity-30" />
                                <p className="text-sm">Henüz bildirim yok</p>
                            </div>
                        ) : (
                            notifications.map(notif => {
                                const Icon = typeIcons[notif.type] || Info;
                                const colorClass = typeColors[notif.type] || typeColors.info;

                                return (
                                    <div
                                        key={notif.id}
                                        className={`flex gap-3 px-4 py-3 border-b last:border-0 hover:bg-accent/50 transition-colors cursor-pointer ${!notif.read ? 'bg-primary/5' : ''}`}
                                        onClick={() => !notif.read && markAsRead(notif.id)}
                                    >
                                        <div className={`shrink-0 p-2 rounded-lg ${colorClass}`}>
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-sm leading-tight ${!notif.read ? 'font-semibold' : 'font-medium'}`}>
                                                    {notif.title}
                                                </p>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                                                    className="shrink-0 p-0.5 rounded hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 hover:opacity-100"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                {notif.message}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                {notif.createdAt && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: tr })}
                                                    </span>
                                                )}
                                                {!notif.read && (
                                                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                                )}
                                                {notif.link && (
                                                    <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
