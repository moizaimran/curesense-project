
import NotificationItem from "./NotificationItem";
import { useNavigate } from "react-router-dom";
import { markAllAsRead } from "../../features/notifications/notificationSlice";
import { useDispatch } from "react-redux";

export default function NotificationDropdown({notifications}) {
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const unreadCount = notifications.filter(
        (notification) => !notification.read
    ).length;

    const handleMarkAll = () => {
    dispatch(markAllAsRead());
};
    return (

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-96">

            {/* Header */}

            <div className="flex justify-between items-center p-5 border-b">

                <div>

                    <h2 className="text-lg font-bold text-slate-800">

                        Notifications

                    </h2>

                    <p className="text-sm text-gray-500">

                        {unreadCount} unread notifications

                    </p>

                </div>

                <button
    onClick={handleMarkAll}
    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
>

    Mark all

</button>

            </div>

            {/* Notifications */}

            <div className="max-h-96 overflow-y-auto">

                {notifications.map((notification) => (

                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                             />

                ))}

            </div>

            {/* Footer */}

            <div className="border-t p-4">

                <button onClick={()=> navigate("/notifications")}
                className="w-full text-center text-blue-600 hover:text-blue-700 font-medium">

                    View All Notifications

                </button>

            </div>

        </div>

    );

}