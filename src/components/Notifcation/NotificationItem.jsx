import {
    UserPlus,
    Brain,
    AlertTriangle,
    Image,
    CheckCircle,
    CalendarClock,
} from "lucide-react";
import { useDispatch } from "react-redux";
import { markAsRead } from "../../features/notifications/notificationSlice";

import { useNavigate } from "react-router-dom";

export default function NotificationItem({ notification }) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
    const getIcon = () => {

        switch (notification.type) {

            case "new_patient":
                return <UserPlus size={20} className="text-blue-600" />;

            case "ai_completed":
                return <Brain size={20} className="text-purple-600" />;

            case "high_severity":
                return <AlertTriangle size={20} className="text-red-600" />;

            case "image_uploaded":
                return <Image size={20} className="text-green-600" />;

            case "doctor_review":
                return <CheckCircle size={20} className="text-emerald-600" />;

            case "follow_up":
                return <CalendarClock size={20} className="text-orange-600" />;

            default:
                return <Brain size={20} />;
        }

    };
    const handleClick = () => {

    if (!notification.read) {
        dispatch(markAsRead(notification.id));
    }

    navigate(`/patients/${notification.patientId}`);

};

    return (

        <div
    onClick={handleClick}
    className={`flex gap-3 p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition ${
        !notification.read ? "bg-blue-50" : "bg-white"
    }`}
>

            <div className="mt-1">

                {getIcon()}

            </div>

            <div className="flex-1">

                <h4 className="font-semibold text-slate-800">

                    {notification.title}

                </h4>

                <p className="text-sm text-gray-600 mt-1">

                    {notification.message}

                </p>

                <p className="text-xs text-gray-400 mt-2">

                    {notification.createdAt}

                </p>

            </div>

            {!notification.read && (

                <span className="w-2 h-2 rounded-full bg-blue-600 mt-2"></span>

            )}

        </div>

    );

}