import { createBrowserRouter } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";
import  Dashboard from '../pages/Dashboard';
import Notifications from  '../pages/Notifications'
import Patients from '../pages/Patients'
import Profile from '../pages/Profile'
import DoctorLogin from "../pages/auth/DoctorLogin";
import DoctorSignup from "../pages/auth/DoctorSignup";
import ForgotPassword from "../pages/auth/ForgotPassword";
import CaseDiagnosis from "../pages/CaseDiagnosis";
import Availability from "../pages/Availability";
import AdminLayout from "../layouts/AdminLayout";

import AdminDashboard from "../pages/admin/AdminDashboard";
import ManageDoctors from "../pages/admin/ManageDoctors";
import ManagePatients from "../pages/admin/ManagePatients";
import Reports from "../pages/admin/Reports";
import Settings from "../pages/admin/Settings";
import DoctorDetails from "../pages/admin/DoctorDetails"
import PatientDetail from "../pages/admin/PatientDetail";
import AdminProfile from "../pages/admin/AdminProfile";
import AppointmentReview from "../pages/admin/AppointmentReview";
import ManageAdmins from "../pages/admin/ManageAdmins";
import AdminLogin from "../pages/adminAuth/AdminLogin";
import AdminForgotPassword from "../pages/adminAuth/AdminForgotPassword"
const router = createBrowserRouter([
       // Authentication Routes (NO SIDEBAR / NO NAVBAR)
      
       {
        path: "/admin/login",
        element:<AdminLogin/>
       },
       {
        path:"/admin/forgot-password",
        element:<AdminForgotPassword/>
       },

    {
        path: "/doctor/login",
        element: <DoctorLogin />
    },


    {
        path: "/doctor/signup",
        element: <DoctorSignup />
    },
    {
    path:"/doctor/forgot-password",
    element:<ForgotPassword/>
},

    {
        path:'/',
        element:<DashboardLayout/>,
        children : [
            {
                path: "",
                element:<Dashboard/>
            },
            {
                path: "notifications",
                element:<Notifications/>
            },
            {
                path: 'patients',
                element:<Patients/>
            },
            {
                path:'profile',
                element: <Profile/>
            },
            {
                path: 'cases/:appointmentId',
                element: <CaseDiagnosis />
            },
            {
                path: 'availability',
                element: <Availability />
            },
            
            

        
        
        
        ]

},
{
    path: '/admin',
    element : <AdminLayout/>,
    children: [
        {
            index: true,
            element:<AdminDashboard/>
        },
        {
            path:"doctors",
            element:<ManageDoctors/>
        },
        {
            path:"patients",
            element:<ManagePatients/>
        },
        {
            path:"reports",
            element:<Reports/>
        },
        {
            path:"settings",
            element:<Settings/>
        },
        {
            path: "doctors/:id",
            element:<DoctorDetails/>
        },
        {
            path: "patients/:id",
            element: <PatientDetail/>
        },
        {
          path: "profile",
          element: <AdminProfile />
        },
        {
          path: "appointments",
          element: <AppointmentReview />
        },
        {
          path: "admins",
          element: <ManageAdmins />
        }
       
    ]

}
])

export default router;