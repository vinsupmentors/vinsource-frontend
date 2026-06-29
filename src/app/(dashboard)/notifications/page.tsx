'use client';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchNotifications, markRead, markAllRead } from '@/store/slices/notificationSlice';
import { RootState, AppDispatch } from '@/store';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';

const notifIcon: Record<string, string> = {
  LEAVE_REQUEST: '📋',
  LEAVE_APPROVED: '✅',
  LEAVE_REJECTED: '❌',
  PAYROLL_GENERATED: '💰',
  BIRTHDAY: '🎂',
  ANNIVERSARY: '🎉',
  SYSTEM: '🔔',
};

export default function NotificationsPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { items, unreadCount, loading } = useSelector((s: RootState) => s.notifications);

  useEffect(() => { dispatch(fetchNotifications()); }, [dispatch]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="w-6 h-6" /> Notifications</h1>
          <p className="text-muted-foreground text-sm">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={() => dispatch(markAllRead())} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border divide-y overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No notifications</p>
          </div>
        ) : items.map((n) => (
          <div
            key={n.id}
            onClick={() => !n.isRead && dispatch(markRead(n.id))}
            className={cn(
              'flex items-start gap-4 px-5 py-4 transition-colors cursor-pointer',
              !n.isRead ? 'bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-50' : 'hover:bg-muted/30'
            )}
          >
            <div className="text-2xl flex-shrink-0">{notifIcon[n.type] || '🔔'}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{n.title}</p>
                {!n.isRead && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
              <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
