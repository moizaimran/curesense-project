import { useSelector } from "react-redux";
import { useState, useRef, useEffect } from "react";
import { User, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { selectUser } from "../../features/auth/authSlice";

export default function DoctorProfile() {

    // FIX: previously this read from `state.doctor.profile`, a Redux slice
    // that is never populated anywhere — DoctorLogin.jsx only dispatches
    // to authSlice (loginSuccess({ token, user })). That left this
    // component always showing whatever placeholder/default values that
    // unused slice started with ("Dr. Ahmed Khan" / "Pulmonologist").
    // authSlice's `user` IS populated on login and already contains the
    // real doctor's name and specialty (see doctorController.js's login
    // response: { name, doctor_profile: { specialty, ... } }).
    const user = useSelector(selectUser);

    const doctorName = user?.name || "Doctor";
    const specialty  = user?.doctor_profile?.specialty || "";
    // The login response has no profile photo field — fall back to an
    // initials avatar instead of an <img> pointing at nothing.
    const initial = doctorName.charAt(0).toUpperCase();

    const [showMenu, setShowMenu] = useState(false);

    const menuRef = useRef();

    const navigate = useNavigate();

    useEffect(() => {

        function handleClickOutside(event) {

            if (
                menuRef.current &&
                !menuRef.current.contains(event.target)
            ) {
                setShowMenu(false);
            }

        }

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };

    }, []);

    return (

        <div
            ref={menuRef}
            className="relative"
        >

            {/* Profile */}

            <div
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-3 cursor-pointer"
            >

                <div className="w-12 h-12 rounded-full bg-blue-600 border-2 border-blue-100 flex items-center justify-center text-white font-bold text-lg">
                    {initial}
                </div>

                <div>

                    <h3 className="font-semibold text-slate-800">
                        {doctorName}
                    </h3>

                    <p className="text-sm text-gray-500">
                        {specialty}
                    </p>

                </div>

            </div>

            {/* Dropdown */}

            {showMenu && (

    <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-50">

        {/* Header */}

        <div className="px-5 py-4 border-b border-gray-100 bg-slate-50">

            <p className="font-semibold text-slate-800">
                {doctorName}
            </p>

            <p className="text-sm text-gray-500">
                {specialty}
            </p>

        </div>

        {/* Menu */}

        <div className="py-2">

            <button
                onClick={() => {
                    navigate("/profile");
                    setShowMenu(false);
                }}
                className="w-full flex items-center gap-3 px-5 py-3 text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition"
            >

                <User size={18} />

                <span className="font-medium">
                    View Profile
                </span>

            </button>

        </div>

        {/* Divider */}

        <div className="border-t border-gray-100"></div>

        {/* Logout */}

        <button
            onClick={() => {
                navigate("/doctor/login");
            }}
            className="w-full flex items-center gap-3 px-5 py-3 text-red-600 hover:bg-red-50 transition"
        >

            <LogOut size={18} />

            <span className="font-medium">
                Logout
            </span>

        </button>

    </div>

)}

        </div>

    );

}