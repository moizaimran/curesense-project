import { useLocation, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import patientPlaceholder from "../../../assets/images/patient-avatar.jpg";
import { useSignOut } from "../../../features/auth/useSignOut";

const pageTitles = {
    "/admin": "Dashboard",
    "/admin/doctors": "Manage Doctors",
    "/admin/patients": "Manage Patients",
    "/admin/reports": "Reports & Analytics",
    "/admin/settings": "Settings",
};

export default function AdminNavbar() {
    const location = useLocation();
    const navigate = useNavigate();
    const signOut = useSignOut("/admin/login");

    const pageTitle = pageTitles[location.pathname] || "Admin Panel";

    return (
        <nav className="bg-white border-b border-slate-200 px-8 py-5 shadow-sm flex justify-between items-center">

            {/* Left */}
            <div>
                <h1 className="text-3xl font-bold text-slate-800">
                    {pageTitle}
                </h1>

                <p className="text-sm text-gray-500 mt-1">
                    Welcome back, Administrator 👋
                </p>
            </div>

            {/* Right */}
            <div className="flex items-center gap-4">
            <div
                onClick={() => navigate("/admin/profile")}
                className="flex items-center gap-4 cursor-pointer hover:bg-gray-100 rounded-xl p-2 transition"
            >
                <img
                    src={patientPlaceholder}
                    alt="Admin"
                    className="w-14 h-14 rounded-full object-cover"
                />

                <div>
                    <h3 className="font-bold text-lg">
                        System Admin
                    </h3>

                    <p className="text-gray-500">
                        Administrator
                    </p>
                </div>
            </div>

            <button
                type="button"
                onClick={signOut}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-red-600 font-medium hover:bg-red-50 transition"
            >
                <LogOut size={18} />
                Sign Out
            </button>
            </div>

        </nav>
    );
}