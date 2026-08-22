import { Outlet } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectUser } from "../features/auth/authSlice";
import Sidebar from "../components/Sidebar";
import NavBar from "../components/NavBar/Navbar";

export default function DashboardLayout() {
    const user = useSelector(selectUser);
    const status = user?.doctor_profile?.status;

    if (status && status !== "verified") {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md text-center">
                    <div className="text-5xl mb-4">⏳</div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">
                        {status === "pending" ? "Awaiting Verification" : "Account Rejected"}
                    </h2>
                    <p className="text-gray-500 text-sm leading-relaxed">
                        {status === "pending"
                            ? "Your PMDC licence is being reviewed by our admin team. You'll receive access once verified."
                            : "Your account was not approved. Please contact support for more information."}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex bg-slate-100">
            <Sidebar />
            <div className="flex-1 ml-64 min-h-screen">
                <NavBar />
                <main>
                    <Outlet />
                </main>
            </div>
        </div>
    );
}