import React from 'react'
import { useNavigate } from 'react-router-dom';

import {UserRound,Clock3,Brain,Image,ArrowRight} from "lucide-react";

export default function DiagnosisCard({ diagnosis }) {
    const image = diagnosis.medicalImages?.[0];
    const navigate = useNavigate();
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 hover:shadow-lg transition duration-300">

            {/* Patient */}
            <div className="flex items-center gap-4">

    <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">

        <UserRound
            size={28}
            className="text-blue-600"
        />

    </div>

    <div>

        <h3 className="font-bold text-lg text-slate-800">

            {diagnosis.name}

        </h3>

        <p className="text-gray-500">

            {diagnosis.gender} • {diagnosis.age} Years

        </p>

    </div>

</div>


            {/* Symptoms */}
            <div className="mt-6">

    <p className="font-semibold text-slate-700 mb-3">

        Symptoms

    </p>

    <div className="flex flex-wrap gap-2">

        {diagnosis.symptoms.map((symptom) => (

            <span
                key={symptom}
                className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm"
            >

                {symptom}

            </span>

        ))}

    </div>

</div>

            {/* AI Diagnosis */}
            <div className="mt-6">

    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">

        <div className="flex items-center gap-2 mb-2">

            <Brain
                size={18}
                className="text-blue-600"
            />

            <p className="text-sm font-semibold text-blue-700">
                AI Prediction
            </p>

        </div>

        <h3 className="text-xl font-bold text-slate-800">
            {diagnosis.aiDiagnosis.disease}
        </h3>

        <p className="text-sm text-gray-500 mt-1">
            AI generated diagnosis awaiting doctor validation.
        </p>

    </div>

</div>

            {/* Confidence */}
            <div className="mt-6">

    <div className="flex justify-between mb-2">

        <p className="font-semibold text-slate-700">
            AI Confidence
        </p>

        <span className="font-semibold text-blue-600">

            {diagnosis.aiDiagnosis.confidence}%

        </span>

    </div>

    <div className="w-full bg-slate-200 rounded-full h-3">

        <div
            className="bg-blue-600 h-3 rounded-full"
            style={{
                width: `${diagnosis.aiDiagnosis.confidence}%`
            }}
        ></div>

    </div>

</div>

            {/* Severity */}
            <div className="mt-6">

    <p className="font-semibold text-slate-700 mb-2">
        Severity
    </p>

    <span
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
            diagnosis.aiDiagnosis.severity === "High"
                ? "bg-red-100 text-red-700"
                : diagnosis.aiDiagnosis.severity === "Medium"
                ? "bg-orange-100 text-orange-700"
                : "bg-green-100 text-green-700"
        }`}
    >

        <span className="w-2 h-2 rounded-full bg-current"></span>

        {diagnosis.aiDiagnosis.severity}

    </span>

</div>
               {/* recommended test section*/}
               <div className="mt-6">

    <p className="font-semibold text-slate-700 mb-3">

        Recommended Tests

    </p>

    <div className="flex flex-wrap gap-2">

        {diagnosis.aiDiagnosis.recommendedTests.map((test) => (

            <span
                key={test}
                className="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded-lg text-sm"
            >

                {test}

            </span>

        ))}

    </div>

</div>
              {/* medical image section*/}
              <div className="mt-6">

    <p className="font-semibold text-slate-700 mb-3">
        Medical Image
    </p>

    {
        diagnosis.hasImage ? (

            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">

                <div className="flex items-center gap-3">

                    <Image
                        size={22}
                        className="text-blue-600"
                    />

                    <div>

                        <p className="font-medium text-slate-700">
                            {image?.type}
                        </p>

                        <p className="text-sm text-gray-500">
                            Medical image attached
                        </p>

                    </div>

                </div>

                <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full">
                    Available
                </span>

            </div>

        ) : (

            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl px-4 py-4 text-gray-500 text-sm">

                No medical image uploaded.

            </div>

        )
    }

</div>

            {/* Uploaded */}
            <div className="flex items-center gap-2 mt-6 text-gray-500 text-sm">

    <Clock3
        size={18}
    />

    <span>

        Uploaded {diagnosis.uploaded}

    </span>

</div>

            {/* Button */}
            <button onClick={()=>navigate(`patients/${diagnosis.id}`)}
    className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-semibold flex justify-center items-center gap-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
>

    Review Case

    <ArrowRight size={18} />

</button>

        </div>
    );
}