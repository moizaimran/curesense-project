import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import NavBar from "../components/NavBar/Navbar";

export default function DashboardLayout() {
    return (

        <div className="flex bg-slate-100">

            {/* Sidebar */}

            <Sidebar />

            {/* Main Content */}

            <div className="flex-1 ml-64 min-h-screen">

                <NavBar />

                <main >

                    <Outlet />

                </main>

            </div>

        </div>

    );
}