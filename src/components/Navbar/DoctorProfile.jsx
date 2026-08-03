import { useSelector } from "react-redux";
import { useState, useRef, useEffect } from "react";
import { User, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function DoctorProfile() {

    const doctor = useSelector(
        (state) => state.doctor.profile
    );

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

                <img
                    src={doctor.profileImage}
                    alt={doctor.name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-blue-100"
                />

                <div>

                    <h3 className="font-semibold text-slate-800">
                        {doctor.name}
                    </h3>

                    <p className="text-sm text-gray-500">
                        {doctor.specialization}
                    </p>

                </div>

            </div>

            {/* Dropdown */}

            {showMenu && (

    <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-50">

        {/* Header */}

        <div className="px-5 py-4 border-b border-gray-100 bg-slate-50">

            <p className="font-semibold text-slate-800">
                {doctor.name}
            </p>

            <p className="text-sm text-gray-500">
                {doctor.specialization}
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