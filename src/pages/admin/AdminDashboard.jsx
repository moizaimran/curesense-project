import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { UserCheck, Clock3, Users, CalendarCheck } from "lucide-react";
import SummaryCard from "../../components/Dashboard/SummaryCard";
import PendingDoctorApproval from "../../components/admin/Doctors/PendingDoctorApproval";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

export default function AdminDashboard() {
    const token    = useSelector(selectToken);
    const navigate = useNavigate();

    const [stats,         setStats]         = useState({ totalDoctors: 0, pendingDoctors: 0, totalPatients: 0, pendingAppts: 0 });
    const [statsLoading,  setStatsLoading]  = useState(true);

    useEffect(() => {
        if (!token) return;
        Promise.all([
            api.get("/api/doctors/admin/all?limit=1",               token),
            api.get("/api/doctors/admin/all?status=pending&limit=1", token),
            api.get("/api/patients?limit=1",                         token),
            api.get("/api/appointments/admin?limit=1",               token),
        ])
            .then(([doctors, pending, patients, appts]) => {
                setStats({
                    totalDoctors:   doctors.total  ?? 0,
                    pendingDoctors: pending.total  ?? 0,
                    totalPatients:  patients.total ?? 0,
                    pendingAppts:   appts.total    ?? 0,
                });
            })
            .catch(() => {})
            .finally(() => setStatsLoading(false));
    }, [token]);

    return (
        <div>
            <div>
                <h1 className="text-4xl font-bold text-slate-800">Good Afternoon, Admin 👋</h1>
                <p className="text-gray-500 mt-2">Here's an overview of today's system activities.</p>
            </div>

            <div className="grid grid-cols-4 gap-6 mt-10">
                <SummaryCard
                    title="Total Doctors"
                    value={statsLoading ? "…" : stats.totalDoctors}
                    icon={<UserCheck size={32} />}
                />
                <SummaryCard
                    title="Pending Approvals"
                    value={statsLoading ? "…" : stats.pendingDoctors}
                    icon={<Clock3 size={32} />}
                />
                <SummaryCard
                    title="Registered Patients"
                    value={statsLoading ? "…" : stats.totalPatients}
                    icon={<Users size={32} />}
                />
                <SummaryCard
                    title="Pending Reviews"
                    value={statsLoading ? "…" : stats.pendingAppts}
                    icon={<CalendarCheck size={32} />}
                    onClick={() => navigate("/admin/appointments")}
                />
            </div>

            <PendingDoctorApproval />
        </div>
    );
}
