import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { BellOff } from "lucide-react";
import NotificationCard from "../components/Notification/NotificationCard";
import { NOTIFICATION_TYPES } from "../utils/notificationTypes";
import {
    fetchNotifications,
    markAllNotificationsRead,
    selectNotifications,
    selectNotificationsLoaded,
    selectUnreadCount,
} from "../features/notifications/notificationSlice";
import { selectToken } from "../features/auth/authSlice";

export default function Notifications() {
    const dispatch      = useDispatch();
    const token         = useSelector(selectToken);
    const notifications = useSelector(selectNotifications);
    const unreadCount   = useSelector(selectUnreadCount);
    const loaded        = useSelector(selectNotificationsLoaded);

    const [show, setShow] = useState("all");   // "all" | "unread" | a type

    useEffect(() => {
        if (token) dispatch(fetchNotifications({ token, limit: 100 }));
    }, [dispatch, token]);

    const visible = notifications.filter((n) =>
        show === "all" ? true : show === "unread" ? !n.read : n.type === show);

    return (
        <div className="p-8">
            <div className="mb-6 flex flex-wrap justify-between items-end gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">All Notifications</h1>
                    <p className="text-gray-500 mt-2">New cases, patient messages, test results and images — newest first.</p>
                </div>
                <button
                    type="button"
                    onClick={() => dispatch(markAllNotificationsRead({ token }))}
                    disabled={unreadCount === 0}
                    className="px-4 py-2 rounded-xl border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-40 text-sm font-semibold"
                >
                    Mark all as read ({unreadCount})
                </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Filter notifications">
                {[["all", "All"], ["unread", `Unread (${unreadCount})`], ...Object.entries(NOTIFICATION_TYPES).map(([k, v]) => [k, v.label])].map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={show === key}
                        onClick={() => setShow(key)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${show === key ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {!loaded ? (
                <p className="text-gray-400">Loading…</p>
            ) : visible.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center text-gray-400">
                    <BellOff size={36} className="mx-auto mb-3" />
                    <p>{show === "all" ? "No notifications yet." : "Nothing here."}</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {visible.map((n) => <NotificationCard key={n._id} notification={n} />)}
                </div>
            )}
        </div>
    );
}
