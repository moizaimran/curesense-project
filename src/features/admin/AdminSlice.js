import { createSlice } from "@reduxjs/toolkit";
import adminDoctor from "../../data/adminDoctor";
import doctor from "../../data/doctor";
import patients from "../../data/patients";
import adminProfile from "../../data/adminProfile";
const initialState ={
    doctors : adminDoctor,
    patients: patients,
    profile: adminProfile,
    settings: {
        systemName: "CureSense",
        supportEmail: "support@curesense.com",
        supportPhone: "+92 300 1234567",

        aiConfidence: 85,
        aiDiagnosis: true,
        imageAnalysis: true,

        sessionTimeout: 30,
        twoFactorAuth: false,

        doctorApprovalEmails: true,
        patientRegistrationEmails: true,
        systemAlerts: true,
    },
};

const adminSlice= createSlice({
    name: "admin",
    initialState,
    reducers:{
        approveDoctor:(state,action)=>{
            const doctor = state.doctors.find(
                (d)=> d.id === action.payload
            );
            if(doctor){
                doctor.status ="Approved";
            }
        },
        rejectDoctor:(state,action)=>{
            const doctor = state.doctors.find(
                (d)=> d.id === action.payload.id
            );
            if(doctor){
                doctor.status = "Rejected";
                doctor.rejectReason = action.payload.reason
            }
        },
        activatePatient:(state,action)=>{
            const patient = state.patients.find(
                (p)=> p.id === action.payload
            );
            if(patient){
                patient.accountStatus = "Active";
            }
        },
        suspendPatient:(state,action)=>{
            const patient = state.patients.find(
                (p)=> p.id=== action.payload
            );
            if(patient){
                patient.accountStatus = "Suspended";
            }
        },
        updateSettings: (state, action) => {
             state.settings = action.payload;
           },
           updateProfile: (state, action) => {
                     state.profile = {
                   ...state.profile,
                   ...action.payload,
    };
},
       

    }
})
export const {approveDoctor,rejectDoctor,activatePatient,suspendPatient,updateSettings,updateProfile}=adminSlice.actions
export default adminSlice.reducer