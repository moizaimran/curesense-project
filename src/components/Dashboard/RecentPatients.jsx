import { UserRound } from "lucide-react";

import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
export default function RecentPatients() {
    const navigate = useNavigate();
    const patients = useSelector(
        (state)=> state.patients.patients
    )
    const recentPatients = patients.slice(0, 3);

    return (

        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 mt-8">

            <div className="flex justify-between items-center mb-6">

                <div>

                    <h2 className="text-2xl font-bold text-slate-800">
                        Recent Patient Activity
                    </h2>

                    <p className="text-gray-500 text-sm mt-1">
                        Review the latest patients and AI diagnosis requests.
                    </p>

                </div>

                <button onClick={()=>navigate('/patients')} className="text-blue-600 font-semibold hover:text-blue-700">
                    View All →
                </button>

            </div>

            <table className="w-full">

                <thead className="bg-slate-50">

                    <tr>

                        <th className="text-left px-5 py-4 text-xs uppercase tracking-wider text-gray-500">
                            Patient
                        </th>

                        <th className="text-center px-5 py-4 text-xs uppercase tracking-wider text-gray-500">
                            Age
                        </th>

                        <th className="text-center px-5 py-4 text-xs uppercase tracking-wider text-gray-500">
                            Status
                        </th>

                        <th className="text-center px-5 py-4 text-xs uppercase tracking-wider text-gray-500">
                            Severity
                        </th>

                        <th className="text-center px-5 py-4 text-xs uppercase tracking-wider text-gray-500">
                            Action
                        </th>

                    </tr>

                </thead>

                <tbody>

                    {recentPatients.map((patient) => (

                        <tr
                            key={patient.id}
                            className="border-b border-slate-100 hover:bg-blue-50 transition duration-200"
                        >

                            <td className="px-5 py-5">

                                <div className="flex items-center gap-4">

                                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">

                                    <UserRound size={24} className="text-blue-600" />

                                     </div>

                                    <div>

                                        <h4 className="font-semibold text-slate-800">

                                            {patient.name}

                                        </h4>

                                        <p className="text-sm text-gray-500">

                                            {patient.gender} • Patient #{patient.id.toString().padStart(3, "0")}

                                        </p>

                                    </div>

                                </div>

                            </td>

                            <td className="text-center font-medium">

                                {patient.age}

                            </td>

                            <td className="text-center">

                                <span
                                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                                        patient.status === "Reviewed"
                                            ? "bg-green-100 text-green-700"
                                            : "bg-yellow-100 text-yellow-700"
                                    }`}
                                >

                                    <span className="w-2 h-2 rounded-full bg-current"></span>

                                    {patient.status}

                                </span>

                            </td>

                            <td className="text-center">

                                <span
                                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                                        patient.severity === "High"
                                            ? "bg-red-100 text-red-700"
                                            : patient.severity === "Medium"
                                            ? "bg-orange-100 text-orange-700"
                                            : "bg-green-100 text-green-700"
                                    }`}
                                >

                                    <span className="w-2 h-2 rounded-full bg-current"></span>

                                    {patient.severity}

                                </span>

                            </td>

                            <td className="text-center">

                                <button onClick={() => navigate(`/patients/${patient.id}`)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200">

                              {patient.status === "Pending" ? "Review Case →" : "Open Record"}

                                </button>

                            </td>

                        </tr>

                    ))}

                </tbody>

            </table>

        </div>

    );

}