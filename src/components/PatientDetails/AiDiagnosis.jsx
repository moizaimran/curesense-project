import { Brain, TestTube, ShieldAlert } from "lucide-react";
import patients from "../../data/patients";



export default function AiDiagnosis({patient}) {

    return (

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mt-6">

            <div className="flex items-center gap-3 mb-6">

                <Brain className="text-blue-600" size={28} />

                <h2 className="text-2xl font-bold text-slate-800">

                    AI Diagnosis

                </h2>

            </div>

            <div className="grid grid-cols-3 gap-6">

                <div className="bg-blue-50 rounded-xl p-5">

                    <p className="text-gray-500 text-sm">

                        Primary Diagnosis

                    </p>

                    <h3 className="text-xl font-bold text-blue-700 mt-2">

                        {patient.aiDiagnosis.disease}

                    </h3>

                </div>

                <div className="bg-green-50 rounded-xl p-5">

                    <p className="text-gray-500 text-sm">

                        Confidence

                    </p>

                    <h3 className="text-xl font-bold text-green-700 mt-2">

                        {patient.aiDiagnosis.confidence}%

                    </h3>

                </div>

                <div className="bg-red-50 rounded-xl p-5">

                    <p className="text-gray-500 text-sm">

                        Severity

                    </p>

                    <h3 className="text-xl font-bold text-red-700 mt-2">

                        {patient.aiDiagnosis.severity}

                    </h3>

                </div>

            </div>

            <div className="grid grid-cols-2 gap-8 mt-8">

                <div>

                    <div className="flex items-center gap-2 mb-4">

                        <TestTube className="text-blue-600" size={20} />

                        <h3 className="font-semibold text-lg">

                            Recommended Tests

                        </h3>

                    </div>

                    <ul className="space-y-2">

                        {patient.aiDiagnosis.recommendedTests.map((test, index) => (

                            <li
                                key={index}
                                className="bg-slate-100 rounded-lg px-4 py-3"
                            >

                                {test}

                            </li>

                        ))}

                    </ul>

                </div>

                <div>

                    <div className="flex items-center gap-2 mb-4">

                        <ShieldAlert className="text-orange-500" size={20} />

                        <h3 className="font-semibold text-lg">

                            Differential Diagnosis

                        </h3>

                    </div>

                    <ul className="space-y-2">

                        {patient.aiDiagnosis.differentialDiagnosis.map((item, index) => (

                            <li
                                key={index}
                                className="bg-orange-50 rounded-lg px-4 py-3"
                            >

                                {item}

                            </li>

                        ))}

                    </ul>

                </div>

            </div>

            <div className="mt-8 flex justify-end">

                <button onClick={() => {
    document
        .getElementById("doctor-review")
        ?.scrollIntoView({
            behavior: "smooth",
        });
}} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium transition">

                    Review & Approve

                </button>

            </div>

        </div>

    );

}

