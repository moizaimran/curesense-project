import { createBrowserRouter } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";
import  Dashboard from '../pages/Dashboard';
import Notifications from  '../pages/Notifications'
import PatientDetails from '../pages/PatientDetails'
import Patients from '../pages/Patients'
import Profile from '../pages/Profile'
import DoctorLogin from "../pages/auth/DoctorLogin";
import DoctorSignup from "../pages/auth/DoctorSignup";
import ForgotPassword from "../pages/auth/ForgotPassword";
const router = createBrowserRouter([
       // Authentication Routes (NO SIDEBAR / NO NAVBAR)

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
                path: "patients/:id",
                element:<PatientDetails/>
            },
            {
                path: 'patients',
                element:<Patients/>
            },
            {
                path:'profile',
                element: <Profile/>
            },
            

        
        
        
        ]

}
])

export default router;