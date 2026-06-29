import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import { fetchNotifications, markRead, markAllRead } from '@/store/slices/notificationSlice';
import { Notification } from '@/types';
import { timeAgo } from '@/lib/utils';
import { Bell, CheckCheck, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<string, string> = {
  LEAVE_REQUEST: '📋',
  LEAVE_APPROVED: '✅',
  LEAVE_REJECTED: '❌',
  PAYROLL_GENERATED: '💰',
  BIRTHDAY: '🎂',
  ANNIVERSARY: '🎉',
  SYSTEM: '🔔',
  ATTENDANCE: '⏰',
  TASK: '📌',
};

const TYPE_COLORS: Record<string, string> = {
  LEAVE_REQUEST: 'border-l-amber-400',
  LEAVE_APPROVED: 'border-l-green-400',
  LEAVE_REJECTED: 'border-l-red-400',
  PAYROLL_GENERATED: 'border-l-blue-400',
  BIRTHDAY: 'border-l-pink-400',
  ANNIVERSARY: 'border-l-purple-400',
  SYSTEM: 'border-l-gray-400',
};

export default function NotificationsPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { items, loading, unreadCount } = useSelector((s: RootState) => s.notifications);

  useEffect(() => {
    dispatch(fetchNotifications());
  }, [dispatch]);

  const handleMarkRead = (n: Notification) => {
    if (!n.isRead) dispatch(markRead(n.id));
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  const grouped = items.reduce<Record<string, Notification[]>>((acc, n) => {
    const key = n.isRead ? 'Earlier' : 'Unread';
    acc[key] = [...(acc[key] ?? []), n];
    return acc;
  }, {});

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-muted-foreground text-sm">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => dispatch(markAllRead())}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="font-medium">No notifications yet</p>
          <p className="text-sm mt-1">We'll notify you when something happens</p>
        </div>
      ) : (
        Object.entries(grouped).map(([group, notifs]) => (
          <div key={group}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{group}</p>
            <div className="space-y-2">
              {notifs.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleMarkRead(n)}
                  className={cn(
                    'bg-card border rounded-xl p-4 flex items-start gap-4 cursor-pointer hover:shadow-sm transition-all border-l-4',
                    TYPE_COLORS[n.type] ?? 'border-l-gray-200 dark:border-l-gray-700',
                    !n.isRead && 'bg-blue-50/40 dark:bg-blue-950/10'
                  )}
                >
                  <span className="text-2xl flex-shrink-0">{TYPE_ICONS[n.type] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{n.title}</p>
                      {!n.isRead && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                    <p className="text-[11px] text-muted-foreground mt-1.5">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && (
                    <button
                      onClick={(e) => { e.stopPropagation(); dispatch(markRead(n.id)); }}
                      className="flex-shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors"
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
