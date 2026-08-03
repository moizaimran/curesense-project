import DiagnosisCard from "./DiagnosisCard";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

export default function PendingDiagnoses() {
    const navigate = useNavigate();
    const patients = useSelector(
        (state)=> state.patients.patients
    );

    const diagnoses = patients.filter(
        (patient)=> patient.aiDiagnosis && patient.status === 'Pending'
    ).slice(0,2);
    return (
        <div className="mt-8">

            <div className="flex justify-between items-center mb-6">

                <div>

                    <h2 className="text-2xl font-bold text-slate-800">
                        Pending AI Diagnoses
                    </h2>

                    <p className="text-gray-500">
                        AI-generated diagnoses waiting for doctor review.
                    </p>

                </div>

                <button onClick={()=>navigate("/patients?status=Pending")} className="text-blue-600 font-semibold hover:text-blue-700">
                    View All →
                </button>

            </div>

            <div className="grid grid-cols-2 gap-6">

                {diagnoses.map((diagnosis) => (

                    <DiagnosisCard
                        key={diagnosis.id}
                        diagnosis={diagnosis}
                    />

                ))}

            </div>

        </div>
    );
}