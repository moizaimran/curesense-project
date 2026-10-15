import { Navigate, Outlet } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectToken, selectUser } from "../features/auth/authSlice";

import AdminSidebar from "../components/admin/Sidebar/AdminSidebar";
import AdminNavbar from "../components/admin/NavBar/AdminNavbar";

export default function AdminLayout() {
    const token = useSelector(selectToken);
    const user = useSelector(selectUser);

    if (!token || user?.role !== "admin") {
        return <Navigate to="/admin/login" replace />;
    }

    return (

        <div className="h-screen flex overflow-hidden bg-slate-100">

            {/* Fixed Sidebar */}

            <AdminSidebar />

            {/* Right Side */}

            <div className="flex-1 flex flex-col overflow-hidden">

                {/* Fixed Navbar */}

                <AdminNavbar />

                {/* Scrollable Content */}

                <main className="flex-1 overflow-y-auto p-8">

                    <Outlet />

                </main>

            </div>

        </div>

    );

}