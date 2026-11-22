import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { markNotificationRead } from "../../features/notifications/notificationSlice";
import { selectToken } from "../../features/auth/authSlice";
import NotificationIcon from "./NotificationIcon";
import { NOTIFICATION_TYPES, timeAgo } from "../../utils/notificationTypes";

// Full-width card on the Notifications page.
export default function NotificationCard({ notification }) {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const token    = useSelector(selectToken);
    const meta     = NOTIFICATION_TYPES[notification.type];

    function open() {
        if (!notification.read) dispatch(markNotificationRead({ token, id: notification._id }));
        if (notification.link) navigate(notification.link);
    }

    return (
        <div className={`rounded-2xl shadow-sm border p-6 transition hover:shadow-md ${notification.read ? "bg-white border-gray-100" : "bg-blue-50/60 border-blue-100"}`}>
            <div className="flex justify-between gap-4">
                <div className="flex gap-4 min-w-0">
                    <NotificationIcon type={notification.type} size={22} />
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{meta?.label}</p>
                        <h2 className="text-lg font-semibold text-slate-800 mt-0.5">{notification.title}</h2>
                        {notification.message && <p className="text-gray-600 mt-1">{notification.message}</p>}
                        <p className="text-sm text-gray-400 mt-2">{timeAgo(notification.created_at)}</p>
                    </div>
                </div>
                {!notification.read && <span className="w-3 h-3 rounded-full bg-blue-600 mt-2 shrink-0" aria-label="Unread" />}
            </div>

            <div className="flex justify-end gap-4 mt-4">
                {!notification.read && (
                    <button
                        type="button"
                        onClick={() => dispatch(markNotificationRead({ token, id: notification._id }))}
                        className="text-sm font-medium text-gray-500 hover:text-gray-700"
                    >
                        Mark as read
                    </button>
                )}
                {notification.link && (
                    <button type="button" onClick={open}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                        Open case <ArrowRight size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}
