import { configureStore } from "@reduxjs/toolkit";
import notificationReducer from "../features/notifications/notificationSlice"
import patientReducer from "../features/patients/patientSlice"
import doctorReducer from "../features/doctor/doctorSlice";

export const store = configureStore({

    reducer: {
        notifications: notificationReducer,
        patients: patientReducer,
        doctor: doctorReducer,

    },

});