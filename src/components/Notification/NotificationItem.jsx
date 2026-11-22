import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { markNotificationRead } from "../../features/notifications/notificationSlice";
import { selectToken } from "../../features/auth/authSlice";
import NotificationIcon from "./NotificationIcon";
import { timeAgo } from "../../utils/notificationTypes";

// One row in the bell dropdown. Click → mark read + open the case.
export default function NotificationItem({ notification, onNavigate }) {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const token    = useSelector(selectToken);

    function open() {
        if (!notification.read) dispatch(markNotificationRead({ token, id: notification._id }));
        if (notification.link) {
            navigate(notification.link);
            onNavigate?.();
        }
    }

    return (
        <button
            type="button"
            onClick={open}
            className={`w-full text-left flex gap-3 p-4 border-b border-gray-100 hover:bg-gray-50 transition ${!notification.read ? "bg-blue-50" : "bg-white"}`}
        >
            <NotificationIcon type={notification.type} />
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800">{notification.title}</p>
                {notification.message && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{notification.message}</p>}
                <p className="text-xs text-gray-400 mt-2">{timeAgo(notification.created_at)}</p>
            </div>
            {!notification.read && <span className="w-2.5 h-2.5 rounded-full bg-blue-600 mt-2 shrink-0" aria-label="Unread" />}
        </button>
    );
}
