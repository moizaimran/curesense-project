import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { BellOff } from "lucide-react";
import NotificationItem from "./NotificationItem";
import { markAllNotificationsRead } from "../../features/notifications/notificationSlice";
import { selectToken } from "../../features/auth/authSlice";

// Bell dropdown: latest 8 notifications, mark all, link to the full page.
export default function NotificationDropdown({ notifications, unreadCount, onClose }) {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const token    = useSelector(selectToken);
    const latest   = notifications.slice(0, 8);

    return (
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-96 z-50">
            <div className="flex justify-between items-center p-5 border-b">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Notifications</h2>
                    <p className="text-sm text-gray-500">{unreadCount} unread</p>
                </div>
                <button
                    type="button"
                    onClick={() => dispatch(markAllNotificationsRead({ token }))}
                    disabled={unreadCount === 0}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-300"
                >
                    Mark all read
                </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
                {latest.length === 0 ? (
                    <div className="py-10 text-center text-gray-400">
                        <BellOff size={28} className="mx-auto mb-2" />
                        <p className="text-sm">You're all caught up.</p>
                    </div>
                ) : (
                    latest.map((n) => <NotificationItem key={n._id} notification={n} onNavigate={onClose} />)
                )}
            </div>

            <div className="p-4 border-t text-center">
                <button
                    type="button"
                    onClick={() => { navigate("/notifications"); onClose?.(); }}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                    View all notifications
                </button>
            </div>
        </div>
    );
}
