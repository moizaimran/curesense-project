import { createSlice } from "@reduxjs/toolkit";
import doctor from "../../data/doctor";

const initialState = {
    profile: doctor,
};

const doctorSlice = createSlice({
    name: "doctor",

    initialState,

    reducers: {
        updateProfile: (state, action) => {
            state.profile = action.payload;
        },
    },
});

export const { updateProfile } = doctorSlice.actions;

export default doctorSlice.reducer;