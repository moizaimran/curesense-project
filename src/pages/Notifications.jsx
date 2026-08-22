import { useSelector } from "react-redux";
import NotificationCard from "../components/Notification/NotificationCard";

export default function Notifications() {
    const notifications = useSelector(
    state => state.notifications.notifications
);

    return (

        <div className="p-8">

            {/* Page Header */}

            <div className="mb-8">

                <h1 className="text-3xl font-bold text-slate-800">

                    All Notifications

                </h1>

                <p className="text-gray-500 mt-2">

                    View all patient activities, AI updates, doctor reviews and alerts.

                </p>

            </div>

            {/* Notification Cards */}

            <div className="space-y-6">

                {notifications.map((notification) => (

                    <NotificationCard
                        key={notification.id}
                        notification={notification}
                    />

                ))}

            </div>

        </div>

    );

}