import {
    UserPlus,
    Brain,
    AlertTriangle,
    Image,
    CheckCircle,
    CalendarClock,
    ArrowRight,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

export default function NotificationCard({ notification }) {

    const navigate = useNavigate();

    const getIcon = () => {

        switch (notification.type) {

            case "new_patient":
                return <UserPlus size={24} className="text-blue-600" />;

            case "ai_completed":
                return <Brain size={24} className="text-purple-600" />;

            case "high_severity":
                return <AlertTriangle size={24} className="text-red-600" />;

            case "image_uploaded":
                return <Image size={24} className="text-green-600" />;

            case "doctor_review":
                return <CheckCircle size={24} className="text-emerald-600" />;

            case "follow_up":
                return <CalendarClock size={24} className="text-orange-600" />;

            default:
                return <Brain size={24} />;
        }

    };

    return (

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition">

            {/* Top */}

            <div className="flex justify-between">

                <div className="flex gap-4">

                    <div className="mt-1">

                        {getIcon()}

                    </div>

                    <div>

                        <h2 className="text-xl font-semibold text-slate-800">

                            {notification.title}

                        </h2>

                        <p className="text-gray-600 mt-1">

                            {notification.message}

                        </p>

                    </div>

                </div>

                {!notification.read && (

                    <span className="w-3 h-3 rounded-full bg-blue-600 mt-2"></span>

                )}

            </div>

            {/* Details */}

            <div className="grid grid-cols-2 gap-6 mt-6">

                <div>

                    <p className="text-sm text-gray-500">

                        Patient

                    </p>

                    <p className="font-semibold">

                        {notification.patientName}

                    </p>

                </div>

                <div>

                    <p className="text-sm text-gray-500">

                        Time

                    </p>

                    <p className="font-semibold">

                        {notification.createdAt}

                    </p>

                </div>

                {notification.severity && (

                    <div>

                        <p className="text-sm text-gray-500">

                            Severity

                        </p>

                        <p className="font-semibold">

                            {notification.severity}

                        </p>

                    </div>

                )}

                {notification.confidence && (

                    <div>

                        <p className="text-sm text-gray-500">

                            Confidence

                        </p>

                        <p className="font-semibold text-green-600">

                            {notification.confidence}%

                        </p>

                    </div>

                )}

            </div>

            {/* Button */}

            <div className="mt-8 flex justify-end">

                <button
                    onClick={() =>
                        navigate(`/patients/${notification.patientId}`)
                    }
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl transition"
                >

                    Open Patient

                    <ArrowRight size={18} />

                </button>

            </div>

        </div>

    );

}