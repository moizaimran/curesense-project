import { createSlice } from "@reduxjs/toolkit";
import patientsData from "../../data/patients";

const initialState = {
    patients: patientsData,
};

const patientSlice = createSlice({

    name: "patients",

    initialState,

    reducers: {
        confirmCase: (state, action) => {

    const patient = state.patients.find(
        (patient) => patient.id === action.payload
    );

    if (patient) {

        patient.status = "Reviewed";

        if (patient.medicalImages) {

            patient.medicalImages.forEach((image) => {

                image.doctorReview = "Confirmed";

            });

        }

    }

},
        saveDoctorNotes: (state, action) => {

    const { patientId, notes } = action.payload;

    const patient = state.patients.find(
        (patient) => patient.id === patientId
    );

    if (patient) {
        patient.doctorNotes = notes;
    }

},
updateDiagnosis: (state, action) => {

    const { patientId, disease } = action.payload;

    const patient = state.patients.find(
        (p) => p.id === patientId
    );

    if (patient) {

        // Update AI Diagnosis
        patient.aiDiagnosis.disease = disease;

        // Update diagnosis shown everywhere else
        patient.diagnosis = disease;

        // Mark case reviewed
        patient.status = "Reviewed";

        // Mark image review confirmed
        if (patient.medicalImages) {

            patient.medicalImages.forEach((image) => {
                image.doctorReview = "Confirmed";
            });

        }

    }

},

    },

});
export const {confirmCase,saveDoctorNotes,updateDiagnosis}=patientSlice.actions;

export default patientSlice.reducer;