import { Bell } from "lucide-react";

export default function NotificationBell({
    showNotifications,
    setShowNotifications, unreadCount
}) {

   

    return (

        <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-3 rounded-full hover:bg-gray-100 transition"
        >

            <Bell size={24} />

            {unreadCount > 0 && (

                <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-semibold">

                    {unreadCount}

                </span>

            )}

        </button>

    );

}