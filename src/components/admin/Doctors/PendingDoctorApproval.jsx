
import { UserCircle, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";

export default function PendingDoctorApprovals() {

    const doctors = useSelector(
        (state) => state.admin.doctors
    );

    const navigate = useNavigate();

    const pendingDoctors = doctors
        .filter((doctor) => doctor.status === "Pending")
        .slice(0, 5);

    return (

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mt-8">

            {/* Header */}

            <div className="flex justify-between items-center mb-8">

                <div>

                    <h2 className="text-2xl font-bold text-slate-800">
                        Pending Doctor Approval Requests
                    </h2>

                    <p className="text-gray-500 mt-1">
                        Review newly registered doctors before granting access.
                    </p>

                </div>

                <button
                    onClick={() => navigate("/admin/doctors")}
                    className="text-[#264296] font-semibold hover:underline"
                >
                    View All →
                </button>

            </div>

            {/* Doctors */}

            <div className="space-y-5">

                {pendingDoctors.length === 0 ? (

                    <div className="text-center py-12">

                        <h3 className="text-xl font-semibold text-slate-700">
                            No Pending Approval Requests
                        </h3>

                        <p className="text-gray-500 mt-2">
                            All registered doctors have been reviewed.
                        </p>

                    </div>

                ) : (

                    pendingDoctors.map((doctor) => (

                        <div
                            key={doctor.id}
                            className="border border-gray-200 rounded-2xl p-6 flex justify-between items-center hover:shadow-md transition"
                        >

                            {/* Left Side */}

                            <div className="flex items-center gap-5">

                                <UserCircle
                                    size={60}
                                    className="text-[#264296]"
                                />

                                <div>

                                    <h3 className="text-xl font-semibold text-slate-800">
                                        {doctor.name}
                                    </h3>

                                    <p className="text-gray-500">
                                        {doctor.specialization}
                                    </p>

                                    <p className="text-gray-500">
                                        {doctor.hospital}
                                    </p>

                                    <p className="text-sm text-blue-700 mt-1">
                                        License No: {doctor.licenseNumber}
                                    </p>

                                </div>

                            </div>

                            {/* Right Side */}

                            <div className="flex items-center gap-3">

                                <span
                                    className={`px-4 py-2 rounded-full text-sm font-semibold ${
                                        doctor.status === "Pending"
                                            ? "bg-yellow-100 text-yellow-700"
                                            : doctor.status === "Approved"
                                            ? "bg-green-100 text-green-700"
                                            : "bg-red-100 text-red-700"
                                    }`}
                                >
                                    {doctor.status}
                                </span>

                                <button
                                    onClick={() =>
                                        navigate(`/admin/doctors/${doctor.id}`)
                                    }
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl"
                                >

                                    <Eye size={18} />

                                    View

                                </button>

                            </div>

                        </div>

                    ))

                )}

            </div>

        </div>

    );

}