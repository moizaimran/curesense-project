import SummaryCard from "../../components/Dashboard/SummaryCard";
import { UserCheck, Clock3, Users, Brain } from "lucide-react";
import { useSelector } from "react-redux";

import MonthlyChart from "../../components/admin/Reports/MonthlyChart";
import DiseaseChart from "../../components/admin/Reports/DiseaseChart";
import SeverityChart from "../../components/admin/Reports/SeverityChart";
import TopDiseaseTable from "../../components/admin/Reports/TopDiseaseTable";

export default function Reports() {

    const doctors = useSelector((state) => state.admin.doctors);
    const patients = useSelector((state) => state.admin.patients);

    const totalDoctors = doctors.length;

    const pendingApprovals = doctors.filter(
        (doctor) => doctor.status === "Pending"
    ).length;

    const registeredPatients = patients.length;

    const totalDiagnoses = patients.filter(
        (patient) => patient.aiDiagnosis
    ).length;

    return (

        <div className="space-y-8">

            <div>

                <h1 className="text-3xl font-bold text-slate-800">
                    Reports & Analytics
                </h1>

                <p className="text-gray-500 mt-2">
                    System insights and healthcare analytics.
                </p>

            </div>

            <div className="grid grid-cols-4 gap-6">

                <SummaryCard
                    title="Total Doctors"
                    value={totalDoctors}
                    icon={<UserCheck size={32} />}
                />

                <SummaryCard
                    title="Pending Approvals"
                    value={pendingApprovals}
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

            <div className="grid grid-cols-2 gap-8">

                <MonthlyChart />

                <DiseaseChart />

            </div>

            <div className="grid grid-cols-2 gap-8">

                <SeverityChart />

                <TopDiseaseTable />

            </div>

        </div>

    );
}