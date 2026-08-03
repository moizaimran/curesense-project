import { createSlice } from "@reduxjs/toolkit";
import notificationsData from "../../data/notifications";

const initialState = {
    notifications: notificationsData,
};

const notificationSlice = createSlice({
    name: "notifications",
    initialState,

    reducers: {

        markAsRead: (state, action) => {

            const notification = state.notifications.find(
                (item) => item.id === action.payload
            );

            if (notification) {
                notification.read = true;
            }

        },
        markAllAsRead: (state) => {

    state.notifications.forEach((item) => {
        item.read = true;
    });

},

    },

});

export const { markAsRead,markAllAsRead } = notificationSlice.actions;

export default notificationSlice.reducer;