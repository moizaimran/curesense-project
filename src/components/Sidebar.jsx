import { LayoutDashboard, Users, Bell, User, LogOut, CalendarDays } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { HeartPulse } from "lucide-react";

const menuItems = [
    { title: 'Dashboard',    icon: LayoutDashboard, path: '/'              },
    { title: 'Patients',     icon: Users,           path: '/patients'      },
    { title: 'Availability', icon: CalendarDays,    path: '/availability'  },
    { title: 'Notifications',icon: Bell,            path: '/notifications' },
    { title: 'Profile',      icon: User,            path: '/profile'       },
];


export default function Sidebar() {
    const navigate = useNavigate();
  return (
    <aside className="fixed left-0 top-0 w-64 h-screen bg-blue-900 border-r border-gray-200 flex flex-col shadow-sm">
        
         <div className="p-6 border-b border-gray-200">
    <div className="flex items-center gap-3">

        <div
            className="
                bg-white
                text-blue-600
                p-3
                rounded-2xl
                shadow-lg
            "
        >
            <HeartPulse size={35}/>
        </div>

        <h1 className="text-2xl font-bold text-white">
            CureSense
        </h1>

    </div>

    <p className="text-sm text-white mt-4 ml-1">
        Doctor Dashboard
    </p>
</div>



      <nav className="mt-6 flex-1">
        <ul className="space-y-2 px-4">
          {menuItems.map((menuItem)=>{

            const Icon = menuItem.icon;

            return(
              <li key={menuItem.title}>
                <NavLink
                  to={menuItem.path}
                  className={({isActive}) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium ${
                      isActive
                      ? "bg-blue-50 text-black border-r-4 border-blue-600"
                      : "text-white hover:bg-blue-50 hover:text-blue-700"
                    }`
                  }
                >
                  <Icon size={21}/>
                  <span>{menuItem.title}</span>
                </NavLink>
              </li>
            )

          })}
        </ul>
      </nav>


      <div className="p-4 border-t border-gray-200">
        <button  onClick={()=>navigate('/doctor/login')} className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-white hover:bg-red-50 hover:text-red-600 transition">
          <LogOut size={21}/>
          Logout
        </button>
      </div>

    </aside>
  );
}