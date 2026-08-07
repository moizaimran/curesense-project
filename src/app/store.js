import { configureStore } from "@reduxjs/toolkit";
import notificationReducer from "../features/notifications/notificationSlice"
import patientReducer from "../features/patients/patientSlice"
import doctorReducer from "../features/doctor/doctorSlice";
import adminReducer from "../features/admin/AdminSlice"

export const store = configureStore({

    reducer: {
        notifications: notificationReducer,
        patients: patientReducer,
        doctor: doctorReducer,
        admin : adminReducer,

    },

});