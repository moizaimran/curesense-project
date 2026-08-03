// import { useLocation } from "react-router-dom";

import SearchBar from "./SearchBar";
import NotificationBell from "./NotificationBell";
import DoctorProfile from "./DoctorProfile";
import { useLocation } from "react-router-dom";
import NotificationDropdown from "../Notifcation/NotificationDropdown";

import { useState,useEffect,useRef } from "react";
import { useSelector } from "react-redux";
const pageTitles = {
        "/": "Dashboard",
        "/patients": "Patients",
        "/notifications": "Notifications",
        "/profile": "Profile",
    };
    

export default function NavBar() {

    const location = useLocation();
    const [showNotifications, setShowNotifications] = useState(false);
    // 
    const notifications = useSelector(
    (state) => state.notifications.notifications
);
    const notificationRef = useRef();
    useEffect(() => {

    function handleClickOutside(event) {

        if (
            notificationRef.current &&
            !notificationRef.current.contains(event.target)
        ) {
            setShowNotifications(false);
        }

    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
        document.removeEventListener("mousedown", handleClickOutside);
    };

}, []);
const unreadCount = notifications.filter(
    (item) => !item.read
).length;

    

    const pageTitle =
        location.pathname.startsWith("/patient")
            ? "Patient Details"
            : pageTitles[location.pathname];

    return (
        <nav className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center shadow-sm">

            {/* Left */}
            <div>
               <h1 className="text-3xl font-bold text-slate-800">
                     {pageTitle}
                    </h1>
                

                <p className="text-sm text-gray-500 mt-1">
                     Welcome back, Doctor 👋
                 </p>
            </div>

            <div className="flex items-center gap-8">
                 {/* <SearchBar /> */}

               <div  ref={notificationRef} className="relative">

    <NotificationBell
        showNotifications={showNotifications}
        setShowNotifications={setShowNotifications}
        unreadCount={unreadCount}
    />

    {showNotifications && (

        <div className="absolute right-0 mt-3">

            <NotificationDropdown notifications={notifications}  />

        </div>

    )}

</div>
               

                <DoctorProfile />
            </div>

        </nav>
    );
}