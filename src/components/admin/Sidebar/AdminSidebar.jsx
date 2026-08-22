import {
    LayoutDashboard,
    UserCheck,
    Users,
    BarChart3,
    Settings,
    HeartPulse,
    CalendarCheck,
    ShieldCheck,
} from "lucide-react";

import { NavLink } from "react-router-dom";

const menuItems = [
    {
        name: "Dashboard",
        icon: <LayoutDashboard size={22} />,
        path: "/admin",
    },
    {
        name: "Manage Doctors",
        icon: <UserCheck size={22} />,
        path: "/admin/doctors",
    },
    {
        name: "Manage Patients",
        icon: <Users size={22} />,
        path: "/admin/patients",
    },
    {
        name: "Appointment Review",
        icon: <CalendarCheck size={22} />,
        path: "/admin/appointments",
    },
    {
        name: "Manage Admins",
        icon: <ShieldCheck size={22} />,
        path: "/admin/admins",
    },
    {
        name: "Reports",
        icon: <BarChart3 size={22} />,
        path: "/admin/reports",
    },
    {
        name: "Settings",
        icon: <Settings size={22} />,
        path: "/admin/settings",
    },
];

export default function AdminSidebar() {
    return (
        <aside className="w-72 h-screen bg-[#264296] text-white flex flex-col shrink-0">

            {/* Logo */}

             {/* Logo */}

<div className="p-8 border-b border-white/20">

    <div className="flex items-center gap-1">

        <div className="bg-white p-4 rounded-2xl">

            <HeartPulse
                size={40}
                className="text-[#264296]"
            />

        </div>
        <h1 className="text-4xl font-bold text-white">
                CureSense
            </h1>
            

        <div>

            

            

        </div>
        

    </div>
    <p className="text-blue-100 mt-5 ml-10">
                Admin Panel
            </p>

</div>
            {/* Menu */}

            <nav className="flex-1 mt-6">

                {menuItems.map((item) => (

                    <NavLink
                        key={item.name}
                        to={item.path}
                        end={item.path === "/admin"}
                        className={({ isActive }) =>
                            `flex items-center gap-4 mx-4 mb-2 px-5 py-4 rounded-xl transition ${
                                isActive
                                    ? "bg-white text-[#264296]"
                                    : "text-white hover:bg-[#3152b3]"
                            }`
                        }
                    >

                        {item.icon}

                        <span className="font-medium">
                            {item.name}
                        </span>

                    </NavLink>

                ))}

            </nav>

        </aside>
    );
}