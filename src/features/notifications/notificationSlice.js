import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "../../utils/api";

// In-app notifications from GET /api/notifications. Shared by the navbar bell,
// its dropdown and the Notifications page so read state stays in sync.

export const fetchNotifications = createAsyncThunk(
    "notifications/fetch",
    async ({ token, limit = 50 }) => api.get(`/api/notifications?limit=${limit}`, token)
);

export const markNotificationRead = createAsyncThunk(
    "notifications/markRead",
    async ({ token, id }) => api.patch(`/api/notifications/${id}/read`, {}, token)
);

export const markAllNotificationsRead = createAsyncThunk(
    "notifications/markAllRead",
    async ({ token }) => api.patch("/api/notifications/read-all", {}, token)
);

const initialState = {
    notifications: [],
    unreadCount: 0,
    loaded: false,
    error: null,
};

const notificationSlice = createSlice({
    name: "notifications",
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchNotifications.fulfilled, (state, action) => {
                state.notifications = action.payload.results ?? [];
                state.unreadCount   = action.payload.unread_count ?? 0;
                state.loaded = true;
                state.error  = null;
            })
            .addCase(fetchNotifications.rejected, (state, action) => {
                state.loaded = true;
                state.error  = action.error.message;
            })
            // Optimistic: mark read immediately, server confirms
            .addCase(markNotificationRead.pending, (state, action) => {
                const n = state.notifications.find((x) => x._id === action.meta.arg.id);
                if (n && !n.read) {
                    n.read = true;
                    state.unreadCount = Math.max(0, state.unreadCount - 1);
                }
            })
            .addCase(markAllNotificationsRead.pending, (state) => {
                state.notifications.forEach((n) => { n.read = true; });
                state.unreadCount = 0;
            });
    },
});

export const selectNotifications = (state) => state.notifications.notifications;
export const selectUnreadCount   = (state) => state.notifications.unreadCount;
export const selectNotificationsLoaded = (state) => state.notifications.loaded;

export default notificationSlice.reducer;
