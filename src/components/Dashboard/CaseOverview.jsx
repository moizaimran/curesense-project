import { useEffect, useState } from "react";
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";
import { PieChart as PieIcon, BarChart3, Table2, TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { api } from "../../utils/api";

// Validated categorical slots 1–3 (pass all-pairs CVD + normal-vision checks).
// Fixed per entity, never per rank. Aqua is < 3:1 on white, so every segment
// is also named with its count + % in the visible legend.
const STATUS_SERIES = [
    { key: "ongoing",   label: "Ongoing",   color: "#2a78d6" },
    { key: "pending",   label: "Pending",   color: "#eb6834" },
    { key: "completed", label: "Completed", color: "#1baf7a" },
];

// Two-period comparison: slots 1–2 of the same validated palette.
const THIS_MONTH = "#2a78d6";
const LAST_MONTH = "#eb6834";
const GRID       = "#E2E8F0";
const AXIS_INK   = "#64748B";

const METRICS = [
    { key: "patients_treated", label: "Patients treated" },
    { key: "completed",        label: "Completed" },
    { key: "pending",          label: "Pending" },
    { key: "ongoing",          label: "Ongoing" },
];

function Card({ title, icon, children, action }) {
    return (
        <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">{icon} {title}</h2>
                {action}
            </div>
            {children}
        </section>
    );
}

function TableToggle({ on, onToggle }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={on}
            title={on ? "Show chart" : "Show as table"}
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 transition"
        >
            {on ? <BarChart3 size={18} /> : <Table2 size={18} />}
            <span className="sr-only">{on ? "Show chart" : "Show as table"}</span>
        </button>
    );
}

// ── Summary: change in patients treated vs last month ───────────────────────

function ChangeSummary({ monthly }) {
    const now  = monthly.this_month.patients_treated;
    const prev = monthly.last_month.patients_treated;
    const pct  = monthly.change.patients_treated;
    const lastName = monthly.last_month.label.split(" ")[0];

    let Icon = Minus, tone = "text-slate-600", headline, detail;
    if (pct === null) {
        Icon = Sparkles; tone = "text-green-700";
        headline = `${now} patient${now === 1 ? "" : "s"} treated`;
        detail = `None in ${lastName} — a fresh start this month`;
    } else if (pct > 0) {
        Icon = TrendingUp; tone = "text-green-700";
        headline = `+${pct}% more patients`;
        detail = `${now} this month vs ${prev} in ${lastName}`;
    } else if (pct < 0) {
        Icon = TrendingDown; tone = "text-red-700";
        headline = `${Math.abs(pct)}% fewer patients`;
        detail = `${now} this month vs ${prev} in ${lastName}`;
    } else {
        headline = now ? "Same as last month" : "No patients treated yet";
        detail = `${now} this month vs ${prev} in ${lastName}`;
    }

    return (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6 flex items-center gap-5">
            <div className={`w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center ${tone}`}>
                <Icon size={26} />
            </div>
            <div>
                <p className="text-sm text-slate-500">Patients treated · {monthly.this_month.label} (so far)</p>
                <p className={`text-2xl font-semibold ${tone}`}>{headline}</p>
                <p className="text-sm text-slate-500">{detail}</p>
            </div>
        </div>
    );
}

// ── Status donut ────────────────────────────────────────────────────────────

function DonutTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-0.5 rounded" style={{ background: d.color }} />
                <span className="font-semibold text-slate-900">{d.count}</span>
                <span className="text-slate-500">{d.label} ({d.percent}%)</span>
            </div>
        </div>
    );
}

function StatusDonut({ status }) {
    const data = STATUS_SERIES.map((s) => ({ ...s, count: status[s.key].count, percent: status[s.key].percent }));
    const empty = status.total === 0;

    return (
        <Card title="Case Status" icon={<PieIcon size={20} className="text-blue-600" />}>
            <div className="flex flex-col sm:flex-row items-center gap-6">
                <div
                    className="relative w-52 h-52 shrink-0"
                    role="img"
                    aria-label={`Case status: ${data.map((d) => `${d.label} ${d.count} (${d.percent}%)`).join(", ")}`}
                >
                    {empty ? (
                        <div className="w-full h-full rounded-full border-[18px] border-slate-100" />
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.filter((d) => d.count > 0)}
                                    dataKey="count"
                                    nameKey="label"
                                    innerRadius="62%"
                                    outerRadius="100%"
                                    stroke="#fff"
                                    strokeWidth={2}
                                    startAngle={90}
                                    endAngle={-270}
                                    isAnimationActive={false}
                                >
                                    {data.filter((d) => d.count > 0).map((d) => <Cell key={d.key} fill={d.color} />)}
                                </Pie>
                                <Tooltip content={<DonutTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-3xl font-semibold text-slate-900">{status.total}</span>
                        <span className="text-xs text-slate-500">total cases</span>
                    </div>
                </div>

                {/* Legend doubles as the table view: name, count and share for every segment */}
                <ul className="w-full space-y-3">
                    {data.map((d) => (
                        <li key={d.key} className="flex items-center justify-between gap-4 text-sm">
                            <span className="flex items-center gap-2 text-slate-700">
                                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: d.color }} aria-hidden="true" />
                                {d.label}
                            </span>
                            <span className="tabular-nums">
                                <span className="font-semibold text-slate-900">{d.count}</span>
                                <span className="text-slate-500 ml-2">{d.percent}%</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
            {empty && <p className="text-sm text-slate-400 mt-4 text-center">No cases yet.</p>}
        </Card>
    );
}

// ── Monthly comparison (grouped bars) ───────────────────────────────────────

function CompareTooltip({ active, payload, label, lastName, thisName }) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm space-y-1">
            <p className="text-slate-500 text-xs">{label}</p>
            {[
                { name: thisName, value: row.this_month, color: THIS_MONTH },
                { name: lastName, value: row.last_month, color: LAST_MONTH },
            ].map((r) => (
                <div key={r.name} className="flex items-center gap-2">
                    <span className="inline-block w-3 h-0.5 rounded" style={{ background: r.color }} />
                    <span className="font-semibold text-slate-900 tabular-nums">{r.value}</span>
                    <span className="text-slate-500">{r.name}</span>
                </div>
            ))}
        </div>
    );
}

function MonthlyComparison({ monthly }) {
    const [showTable, setShowTable] = useState(false);
    const thisName = monthly.this_month.label.split(" ")[0];
    const lastName = monthly.last_month.label.split(" ")[0];
    const data = METRICS.map((m) => ({
        metric: m.label,
        this_month: monthly.this_month[m.key],
        last_month: monthly.last_month[m.key],
    }));
    const axisProps = { tickLine: false, axisLine: false, tick: { fill: AXIS_INK, fontSize: 12 } };

    return (
        <Card
            title="This Month vs Last Month"
            icon={<BarChart3 size={20} className="text-blue-600" />}
            action={<TableToggle on={showTable} onToggle={() => setShowTable((v) => !v)} />}
        >
            {/* Legend — always present for two series */}
            <div className="flex items-center gap-5 text-sm text-slate-600 mb-3">
                <span className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: LAST_MONTH }} /> {monthly.last_month.label}
                </span>
                <span className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: THIS_MONTH }} /> {monthly.this_month.label} (so far)
                </span>
            </div>

            {showTable ? (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500">
                            <th className="py-2 font-medium" />
                            <th className="py-2 font-medium text-right">{lastName}</th>
                            <th className="py-2 font-medium text-right">{thisName}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((r) => (
                            <tr key={r.metric} className="border-b border-slate-100">
                                <td className="py-2 text-slate-700">{r.metric}</td>
                                <td className="py-2 text-right tabular-nums text-slate-900">{r.last_month}</td>
                                <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{r.this_month}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div
                    className="h-56"
                    role="img"
                    aria-label={`Last month vs this month: ${data.map((r) => `${r.metric} ${r.last_month} then ${r.this_month}`).join("; ")}`}
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2} barCategoryGap="28%">
                            <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                            <XAxis dataKey="metric" {...axisProps} />
                            <YAxis allowDecimals={false} domain={[0, (max) => Math.max(4, max)]} {...axisProps} />
                            <Tooltip
                                content={<CompareTooltip lastName={monthly.last_month.label} thisName={`${monthly.this_month.label} (so far)`} />}
                                cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
                            />
                            <Bar dataKey="last_month" name={monthly.last_month.label} fill={LAST_MONTH} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                            <Bar dataKey="this_month" name={monthly.this_month.label} fill={THIS_MONTH} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}

// ── Container: one request feeds all three ──────────────────────────────────

// Doctor dashboard: pass doctorId. Admin dashboard: pass endpoint
// ("/api/stats/overview" or "/api/stats/overview?doctor_id=…").
export default function CaseOverview({ doctorId, token, endpoint }) {
    const [data,    setData]    = useState(null);
    const [error,   setError]   = useState(null);
    const url = endpoint || (doctorId ? `/api/doctors/${doctorId}/stats/overview` : null);

    useEffect(() => {
        if (!url || !token) return;
        let cancelled = false;
        api.get(url, token)
            .then((d) => { if (!cancelled) setData(d); })
            .catch((err) => { if (!cancelled) setError(err.message); });
        return () => { cancelled = true; };
    }, [url, token]);

    if (error) return <p className="text-red-500 text-sm">{error}</p>;
    if (!data)  return <p className="text-slate-400 text-sm">Loading case overview…</p>;

    return (
        <div className="space-y-6">
            <ChangeSummary monthly={data.monthly} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <StatusDonut status={data.status} />
                <MonthlyComparison monthly={data.monthly} />
            </div>
        </div>
    );
}
