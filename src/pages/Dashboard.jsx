import React from 'react'
import WelcomeSection from '../components/Dashboard/WelcomeSection'
import SummaryCard from '../components/Dashboard/SummaryCard';
import RecentPatients from '../components/Dashboard/RecentPatients';
import {Users,Brain,TriangleAlert,FileCheck} from "lucide-react";
import PendingDiagnoses from '../components/Dashboard/PendindDiagnosis';
import { useSelector } from "react-redux";


export default function Dashboard() {
    const patients = useSelector(
    (state) => state.patients.patients
);
const totalPatients = patients.length;

const pendingCases = patients.filter(
    (patient) => patient.status === "Pending"
).length;

const reviewedCases = patients.filter(
    (patient) => patient.status === "Reviewed"
).length;

const criticalCases = patients.filter(
    (patient) => patient.severity === "High"
).length;
  return (
    <div className="p-8">
      <WelcomeSection />
      <div className="grid grid-cols-4 gap-6 mt-8">

    <SummaryCard
        title="Total Patients"
        value={totalPatients}
        icon={<Users size={32} />}
    />

    <SummaryCard
        title="Pending AI Reviews"
        value={pendingCases}
        icon={<Brain size={32} />}
    />

    <SummaryCard
        title="Critical Cases"
        value={criticalCases}
        icon={<TriangleAlert size={32} />}
    />

    <SummaryCard
        title="Reports Reviewed"
        value={reviewedCases}
        icon={<FileCheck size={32} />}
    />

</div>
<RecentPatients/>
<PendingDiagnoses/>


    </div>
  );
}