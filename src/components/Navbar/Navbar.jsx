// import { useLocation } from "react-router-dom";

import SearchBar from "./SearchBar";
import NotificationBell from "./NotificationBell";
import DoctorProfile from "./DoctorProfile";
import { useLocation } from "react-router-dom";
import NotificationDropdown from "../Notification/NotificationDropdown";

import { useState,useEffect,useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchNotifications, selectNotifications, selectUnreadCount } from "../../features/notifications/notificationSlice";
import { selectToken } from "../../features/auth/authSlice";

const POLL_MS = 60_000; // check for new notifications every minute
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
    const dispatch      = useDispatch();
    const token         = useSelector(selectToken);
    const notifications = useSelector(selectNotifications);
    const unreadCount   = useSelector(selectUnreadCount);

    // Load now, then poll while the tab is visible
    useEffect(() => {
        if (!token) return;
        const load = () => { if (document.visibilityState === "visible") dispatch(fetchNotifications({ token })); };
        load();
        const t = setInterval(load, POLL_MS);
        return () => clearInterval(t);
    }, [dispatch, token]);
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

            <NotificationDropdown
                notifications={notifications}
                unreadCount={unreadCount}
                onClose={() => setShowNotifications(false)}
            />

        </div>

    )}

</div>
               

                <DoctorProfile />
            </div>

        </nav>
    );
}