import { CircleAlert } from "lucide-react";
import patients from "../../data/patients";


export default function Symptoms({patient}) {

    return (

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mt-6">

            <h2 className="text-2xl font-bold text-slate-800 mb-6">

                Reported Symptoms

            </h2>

            <div className="flex flex-wrap gap-3">

                {patient.symptoms.map((symptom, index) => (

                    <div
                        key={index}
                        className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-2 rounded-full"
                    >

                        <CircleAlert size={16} />

                        <span>{symptom}</span>

                    </div>

                ))}

            </div>

        </div>

    );

}