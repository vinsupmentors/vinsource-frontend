import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import api from '@/lib/api';
import { Notification } from '@/types';

interface NotificationState {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
}

const initialState: NotificationState = {
  items: [],
  unreadCount: 0,
  loading: false,
};

export const fetchNotifications = createAsyncThunk('notifications/fetch', async () => {
  const { data } = await api.get('/api/notifications?limit=50');
  // Backend: res.json({ success: true, ...result }) where result = { notifications: [...], meta }
  // So data = { success: true, notifications: [...], meta: {...} }
  const notifications: Notification[] = data.notifications ?? data.data ?? [];
  return notifications;
});

export const fetchUnreadCount = createAsyncThunk('notifications/unreadCount', async () => {
  const { data } = await api.get('/api/notifications/unread-count');
  return (data.data?.count ?? 0) as number;
});

export const markRead = createAsyncThunk('notifications/markRead', async (id: string) => {
  await api.put(`/api/notifications/${id}/read`);
  return id;
});

export const markAllRead = createAsyncThunk('notifications/markAllRead', async () => {
  await api.put('/api/notifications/read-all');
});

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification(state, action: PayloadAction<Notification>) {
      state.items.unshift(action.payload);
      state.unreadCount += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => { state.loading = true; })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        state.unreadCount = action.payload.filter((n) => !n.isRead).length;
      })
      .addCase(fetchNotifications.rejected, (state) => { state.loading = false; })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      .addCase(markRead.fulfilled, (state, action) => {
        const n = state.items.find((i) => i.id === action.payload);
        if (n && !n.isRead) {
          n.isRead = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markAllRead.fulfilled, (state) => {
        state.items.forEach((i) => { i.isRead = true; });
        state.unreadCount = 0;
      });
  },
});

export const { addNotification } = notificationSlice.actions;
export default notificationSlice.reducer;
