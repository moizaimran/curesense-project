import { FileText, CheckCircle2, Pencil } from "lucide-react";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { confirmCase ,saveDoctorNotes} from "../../features/patients/patientSlice";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { updateDiagnosis } from "../../features/patients/patientSlice";

export default function DoctorNotes({patient}) {

    const [notes, setNotes] = useState("");
    const [editingDiagnosis, setEditingDiagnosis] = useState(false);

const [newDiagnosis, setNewDiagnosis] = useState(
    patient.aiDiagnosis?.disease || ""
);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const handleConfirmCase=()=>{
        dispatch(
        saveDoctorNotes({
            patientId: patient.id,
            notes: notes,
        })
    );
        dispatch(confirmCase(patient.id));
        toast.success("Case confirmed successfully!");
        setTimeout(()=>{navigate('/')},2000);
    }

    return (

        <div id="doctor-review" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mt-6 mb-8">

            {/* Header */}

            <div className="flex items-center gap-3 mb-6">

                <FileText
                    size={28}
                    className="text-blue-600"
                />

                <div>

                    <h2 className="text-2xl font-bold text-slate-800">

                        Doctor Review

                    </h2>

                    <p className="text-gray-500 mt-1">

                        Review the AI findings, record your observations, and complete the case.

                    </p>

                </div>

            </div>

            {/* Notes */}

            <div>

                <label className="block text-sm font-semibold text-slate-700 mb-3">

                    Clinical Notes

                </label>

                <textarea

                    value={notes}

                    onChange={(e) => setNotes(e.target.value)}

                    rows={8}

                    placeholder="Enter your observations, treatment recommendations, or explain why you agree or disagree with the AI diagnosis..."

                    className="w-full border border-gray-300 rounded-xl p-4 resize-none outline-none focus:ring-2 focus:ring-blue-500"

                />

            </div>
            {editingDiagnosis && (

    <div className="mt-8">

        <label className="block text-sm font-semibold text-slate-700 mb-3">

            Updated Diagnosis

        </label>

        <input
            type="text"
            value={newDiagnosis}
            onChange={(e) => setNewDiagnosis(e.target.value)}
            className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
        />

        <button
            onClick={() => {

                dispatch(
                    updateDiagnosis({
                        patientId: patient.id,
                        disease: newDiagnosis,
                    })
                );

                toast.success("Diagnosis updated successfully!");

                setEditingDiagnosis(false);
                setTimeout(()=>{navigate('/')},2000);

            }}

            className="mt-4 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700"
        >
            Save Diagnosis
        </button>

    </div>

)}

            {/* Footer */}

            <div className="flex justify-between items-center mt-8 border-t pt-6">

                <div>

                    <p className="text-sm text-gray-500">

                        AI diagnosis will be finalized after your decision.

                    </p>

                </div>

                <div className="flex gap-4">

                    

                    <button
    onClick={() => setEditingDiagnosis(true)}
    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-white font-medium transition"
>
    <Pencil size={18} />
    Modify Diagnosis
</button>

                    <button onClick={handleConfirmCase}

                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium transition"

                    >

                        <CheckCircle2 size={18} />

                        Confirm Case

                    </button>

                </div>

            </div>

        </div>

    );

}