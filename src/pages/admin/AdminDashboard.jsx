import { useSelector } from "react-redux";

import SummaryCard from "../../components/Dashboard/SummaryCard";
import PendingDoctorApproval from "../../components/admin/Doctors/PendingDoctorApproval";

import {
    UserCheck,
    Clock3,
    Users,
    Brain,
} from "lucide-react";

export default function AdminDashboard() {

    const doctors = useSelector(
        (state) => state.admin.doctors
    );

    const patients = useSelector(
        (state) => state.admin.patients
    );

    const totalDoctors = doctors.length;

    const pendingDoctors = doctors.filter(
        (doctor) => doctor.status === "Pending"
    ).length;

    const registeredPatients = patients.length;

    const totalDiagnoses = patients.filter(
        (patient) => patient.aiDiagnosis
    ).length;



    return (

        <div>

            {/* Welcome */}

            <div>

                <h1 className="text-4xl font-bold text-slate-800">

                    Good Afternoon, Admin 👋

                </h1>

                <p className="text-gray-500 mt-2">

                    Here's an overview of today's system activities.

                </p>

            </div>

            {/* Summary Cards */}

            <div className="grid grid-cols-4 gap-6 mt-10">

                <SummaryCard
                    title="Total Doctors"
                    value={totalDoctors}
                    icon={<UserCheck size={32} />}
                />

                <SummaryCard
                    title="Pending Approvals"
                    value={pendingDoctors}
                    icon={<Clock3 size={32} />}
                />

                <SummaryCard
                    title="Registered Patients"
                    value={registeredPatients}
                    icon={<Users size={32} />}
                />

                <SummaryCard
                    title="AI Diagnoses"
                    value={totalDiagnoses}
                    icon={<Brain size={32} />}
                />

            </div>

            <PendingDoctorApproval />

        </div>

    );

}