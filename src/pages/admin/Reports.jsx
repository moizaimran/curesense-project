import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { UserCheck, Clock3, Users, CalendarCheck, BarChart2 } from "lucide-react";
import SummaryCard from "../../components/Dashboard/SummaryCard";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

export default function Reports() {
    const token = useSelector(selectToken);

    const [stats,        setStats]        = useState({ totalDoctors: 0, pendingDoctors: 0, totalPatients: 0, pendingAppts: 0 });
    const [statsLoading, setStatsLoading] = useState(true);

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
                    totalDoctors:  doctors.total  ?? 0,
                    pendingDoctors: pending.total ?? 0,
                    totalPatients: patients.total ?? 0,
                    pendingAppts:  appts.total    ?? 0,
                });
            })
            .catch(() => {})
            .finally(() => setStatsLoading(false));
    }, [token]);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-800">Reports & Analytics</h1>
                <p className="text-gray-500 mt-2">System insights and healthcare analytics.</p>
            </div>

            <div className="grid grid-cols-4 gap-6">
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
                />
            </div>

            {/* Analytics charts — coming soon */}
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                <BarChart2 size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-semibold">Detailed analytics coming soon</p>
                <p className="text-slate-400 text-sm mt-1">
                    Charts for monthly registrations, disease distribution, and appointment trends will appear here.
                </p>
            </div>
        </div>
    );
}
