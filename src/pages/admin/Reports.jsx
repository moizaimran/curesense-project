import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Brain, Share2, AlertTriangle, ClipboardCheck, TrendingUp, Stethoscope, Activity, Table2, BarChart3 } from "lucide-react";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

// Validated categorical slots 1–2; single-series bars use slot 1.
const SERIES_1 = "#2a78d6";
const SERIES_2 = "#eb6834";
const GRID     = "#E2E8F0";
const AXIS_INK = "#64748B";

const RANGES = [
    { key: "30d", label: "Last 30 days" },
    { key: "90d", label: "Last 90 days" },
    { key: "12m", label: "Last 12 months" },
    { key: "all", label: "All time" },
];

function Kpi({ label, value, sub, icon, tone = "text-blue-600 bg-blue-100" }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex justify-between items-start gap-3">
            <div className="min-w-0">
                <p className="text-gray-500 text-sm font-medium">{label}</p>
                <p className="text-3xl font-semibold text-slate-800 mt-1">{value}</p>
                {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
            </div>
            <div className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center ${tone}`}>{icon}</div>
        </div>
    );
}

function Card({ title, icon, subtitle, action, children }) {
    return (
        <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">{icon} {title}</h2>
                    {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}

// Horizontal bars as HTML rows so long condition names never get clipped.
// Each bar carries its value at the tip; the list itself is the table view.
function RankedBars({ rows, emptyText }) {
    if (!rows.length) return <p className="text-sm text-slate-400 py-6 text-center">{emptyText}</p>;
    const max = Math.max(...rows.map((r) => r.count));
    return (
        <ol className="space-y-3">
            {rows.map((r, i) => (
                <li key={r.name} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 items-center">
                    <span className="text-xs text-slate-400 tabular-nums text-right">{i + 1}</span>
                    <div className="min-w-0">
                        <p className="text-sm text-slate-700 truncate" title={r.name}>{r.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-3 bg-slate-100 rounded">
                                <div
                                    className="h-3 rounded-r"
                                    style={{ width: `${Math.max(4, (r.count / max) * 100)}%`, background: SERIES_1 }}
                                    role="img"
                                    aria-label={`${r.name}: ${r.count}`}
                                />
                            </div>
                            <span className="text-sm font-semibold text-slate-900 tabular-nums w-8 text-right">{r.count}</span>
                        </div>
                    </div>
                </li>
            ))}
        </ol>
    );
}

function TrendTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm space-y-1">
            <p className="text-slate-500 text-xs">{new Date(`${row.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" })}</p>
            {[["AI consultations", row.consultations, SERIES_1], ["New patients", row.new_patients, SERIES_2]].map(([name, v, c]) => (
                <div key={name} className="flex items-center gap-2">
                    <span className="inline-block w-3 h-0.5 rounded" style={{ background: c }} />
                    <span className="font-semibold text-slate-900 tabular-nums">{v}</span>
                    <span className="text-slate-500">{name}</span>
                </div>
            ))}
        </div>
    );
}

function MonthlyTrend({ monthly }) {
    const [table, setTable] = useState(false);
    const axis = { tickLine: false, axisLine: false, tick: { fill: AXIS_INK, fontSize: 12 } };
    return (
        <Card
            title="Monthly Activity"
            icon={<TrendingUp size={20} className="text-blue-600" />}
            subtitle="Last 12 months"
            action={
                <button type="button" onClick={() => setTable((v) => !v)} aria-pressed={table}
                    title={table ? "Show chart" : "Show as table"}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300">
                    {table ? <BarChart3 size={18} /> : <Table2 size={18} />}
                    <span className="sr-only">{table ? "Show chart" : "Show as table"}</span>
                </button>
            }
        >
            <div className="flex items-center gap-5 text-sm text-slate-600 mb-3">
                <span className="flex items-center gap-2"><span className="inline-block w-4 h-0.5 rounded" style={{ background: SERIES_1 }} /> AI consultations</span>
                <span className="flex items-center gap-2"><span className="inline-block w-4 h-0.5 rounded" style={{ background: SERIES_2 }} /> New patients</span>
            </div>
            {table ? (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500">
                            <th className="py-2 font-medium">Month</th>
                            <th className="py-2 font-medium text-right">AI consultations</th>
                            <th className="py-2 font-medium text-right">New patients</th>
                        </tr>
                    </thead>
                    <tbody>
                        {monthly.map((m) => (
                            <tr key={m.month} className="border-b border-slate-100">
                                <td className="py-2 text-slate-700">{m.label}</td>
                                <td className="py-2 text-right tabular-nums text-slate-900">{m.consultations}</td>
                                <td className="py-2 text-right tabular-nums text-slate-900">{m.new_patients}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className="h-64" role="img" aria-label={`Monthly AI consultations and new patients: ${monthly.map((m) => `${m.label} ${m.consultations} and ${m.new_patients}`).join("; ")}`}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthly} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                            <XAxis dataKey="label" padding={{ left: 16, right: 16 }} {...axis} />
                            <YAxis allowDecimals={false} domain={[0, (max) => Math.max(4, max)]} {...axis} />
                            <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#94A3B8", strokeWidth: 1 }} />
                            <Line type="linear" dataKey="consultations" stroke={SERIES_1} strokeWidth={2} dot={{ r: 4, fill: SERIES_1, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                            <Line type="linear" dataKey="new_patients" stroke={SERIES_2} strokeWidth={2} dot={{ r: 4, fill: SERIES_2, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}

export default function Reports() {
    const token = useSelector(selectToken);
    const [range, setRange] = useState("90d");
    const [data,  setData]  = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        api.get(`/api/stats/reports?range=${range}`, token)
            .then((d) => { if (!cancelled) { setData(d); setError(null); } })
            .catch((err) => { if (!cancelled) setError(err.message); });
        return () => { cancelled = true; };
    }, [token, range]);

    const d = data?.range === range ? data : null;   // never show the previous range's numbers
    const rangeLabel = RANGES.find((r) => r.key === range)?.label.toLowerCase();
    const dash = "…";

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-800">Reports & Analytics</h1>
                <p className="text-gray-500 mt-2">What patients are coming in with — from CureSense AI consultations.</p>
            </div>

            {/* Range filter — one row above everything it scopes */}
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Date range">
                {RANGES.map((r) => (
                    <button key={r.key} type="button" role="radio" aria-checked={range === r.key} onClick={() => setRange(r.key)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${range === r.key ? "bg-[#264296] text-white" : "bg-white border border-gray-200 text-slate-600 hover:bg-slate-50"}`}>
                        {r.label}
                    </button>
                ))}
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                <Kpi label="AI consultations" value={d ? d.consultations.total : dash}
                    sub={d ? `from ${d.consultations.patients} patient${d.consultations.patients === 1 ? "" : "s"}` : null}
                    icon={<Brain size={24} />} />
                <Kpi label="Shared with a doctor" value={d ? `${d.consultations.shared_percent}%` : dash}
                    sub={d ? `${d.consultations.shared_with_doctor} reports led to a booking` : null}
                    icon={<Share2 size={24} />} tone="text-green-700 bg-green-100" />
                <Kpi label="Emergency flags" value={d ? d.consultations.emergency_flags : dash}
                    sub={d ? `${d.consultations.emergency_percent}% of consultations` : null}
                    icon={<AlertTriangle size={24} />} tone="text-red-600 bg-red-100" />
                <Kpi label="Interviews completed" value={d ? d.interviews.completed : dash}
                    sub={d ? `${d.interviews.abandoned} abandoned · ${d.interviews.failed} failed` : null}
                    icon={<ClipboardCheck size={24} />} />
            </div>

            {d && <MonthlyTrend monthly={d.monthly} />}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card title="Top Suspected Conditions" icon={<Activity size={20} className="text-blue-600" />}
                    subtitle={`Most likely condition per AI report, ${rangeLabel}`}>
                    {d ? <RankedBars rows={d.top_conditions} emptyText={`No AI reports in the ${rangeLabel}.`} /> : <p className="text-slate-400 text-sm">Loading…</p>}
                </Card>
                <Card title="Recommended Specialists" icon={<Stethoscope size={20} className="text-blue-600" />}
                    subtitle={`Where the AI referred patients, ${rangeLabel}`}>
                    {d ? <RankedBars rows={d.top_specialties} emptyText={`No referrals in the ${rangeLabel}.`} /> : <p className="text-slate-400 text-sm">Loading…</p>}
                </Card>
            </div>

            <p className="text-xs text-slate-400">
                Conditions are AI suggestions from patient interviews, not confirmed diagnoses.
            </p>
        </div>
    );
}
