import React from 'react'

import PatientInfo from "../components/PatientDetails/PatientInfo";
import Symptoms from '../components/PatientDetails/Symptoms';
import AiDiagnosis from '../components/PatientDetails/AiDiagnosis';
import MedicalImages from '../components/PatientDetails/MedicalImages';
import DoctorNotes from '../components/PatientDetails/DoctorNotes';
import { useParams } from "react-router-dom";
import { useSelector } from 'react-redux';

export default function PatientDetails() {
    const patients = useSelector(
        (state)=> state.patients.patients
    )
    const { id } = useParams();

    console.log(id);
    const patient = patients.find(
    (patient) => patient.id === Number(id)
);

console.log(patient);

    return (

        <div className="bg-slate-100 min-h-screen p-8">

            <PatientInfo patient={patient} />
            <Symptoms  patient={patient}/>
            <AiDiagnosis patient={patient}/>
            <MedicalImages patient={patient}/>
            <DoctorNotes patient={patient} />

        </div>

    );

}