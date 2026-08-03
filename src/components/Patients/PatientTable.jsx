import React from 'react'
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";

export default function PatientTable({search, statusFilter,currentPage,setCurrentPage}) {
    const navigate = useNavigate();
    const patients = useSelector(
        (state)=> state.patients.patients
    )
    
  const filteredPatients = patients.filter((patient) => {

    const matchesSearch =
        patient.name.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
        statusFilter === "All" ||
        patient.status === statusFilter;

    return matchesSearch && matchesStatus;

});
 const patientsPerPage = 5 ;
 const lastPatientIndex = currentPage * patientsPerPage;

const firstPatientIndex = lastPatientIndex - patientsPerPage;
 const currentPatients = filteredPatients.slice(firstPatientIndex,lastPatientIndex);
 const totalPages = Math.ceil(
    filteredPatients.length / patientsPerPage
);


    return (

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 ml-5">

    <div className="flex justify-between items-center mb-6">

        <div>

            <h2 className="text-2xl font-bold text-slate-800">
                All Patients
            </h2>

            <p className="text-gray-500 mt-1">
                Manage and review patient records.
            </p>

        </div>

    </div>

    <div className="overflow-x-auto">

        <table className="w-full">

            <thead>

                <tr className="border-b border-gray-200 text-left">

                    <th className="py-4">Patient</th>

                    <th className="py-4">Age</th>

                    <th className="py-4">Gender</th>

                    <th className="py-4">AI Diagnosis</th>

                    <th className="py-4">Severity</th>

                    <th className="py-4">Status</th>

                    <th className="py-4">Medical Image</th>

                    <th className="py-4">Uploaded</th>

                    <th className="py-4">Action</th>

                </tr>

            </thead>

            <tbody>

    {currentPatients.map((patient) => {

        return (

            <tr
                key={patient.id}
                className="border-b border-gray-100 hover:bg-slate-50 transition"
            >

                <td className="py-5">

                <div className="flex items-center gap-3">

                   <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">

                            👤

                    </div>

                 <div>

                <p className="font-semibold text-slate-800">

                {patient.name}

               </p>

               </div>

    </div>

</td>

                <td className="py-5 text-gray-600">
                    {patient.age}

                </td>

                <td className="py-5 text-gray-600">
                    {patient.gender}


                </td>

                <td className="py-5">
                    <span className="font-medium text-slate-700">
                        {patient.diagnosis}
                    </span>

                </td>

                <td className="py-5">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                            patient.severity === "High"
                          ? "bg-red-100 text-red-700"
                          : patient.severity === "Medium"
                          ? "bg-orange-100 text-orange-700"
                           : "bg-green-100 text-green-700"
        }`}
      >
        {patient.severity}
    </span>

                </td>

                <td className="py-5">
                    <span
        className={`px-3 py-1 rounded-full text-sm font-medium ${
            patient.status === "Pending"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-green-100 text-green-700"
        }`}
    >
        {patient.status}
    </span>

                </td>

                <td className="py-5">
                    {
        patient.hasImage ? (

            <span className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">

                🩻

                Available

            </span>

        ) : (

            <span className="text-gray-400">

                —

            </span>

        )
    }

                </td>

                <td className="py-5 text-gray-500">
                    {patient.uploaded}

                </td>

                <td className="py-5">
                    <button
                       onClick={() => navigate(`/patients/${patient.id}`)}
                       className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
>
                            View Details
                    </button>

                </td>

            </tr>

        );

    })}

</tbody>

        </table>

    </div>
    <div className="flex justify-between items-center mt-6">

    <button
        onClick={() => setCurrentPage(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
    >
        Previous
    </button>

    <div className="flex gap-2">

        {[...Array(totalPages)].map((_, index) => (

            <button
                key={index}
                onClick={() => setCurrentPage(index + 1)}
                className={`w-10 h-10 rounded-lg font-medium transition ${
                    currentPage === index + 1
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 hover:bg-gray-200"
                }`}
            >
                {index + 1}
            </button>

        ))}

    </div>

    <button
        onClick={() => setCurrentPage(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
    >
        Next
    </button>

</div>

</div>

    );

}