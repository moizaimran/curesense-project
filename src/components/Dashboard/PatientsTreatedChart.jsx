import { useEffect, useState } from "react";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from "recharts";
import { Activity, Table2, BarChart3 } from "lucide-react";
import { api } from "../../utils/api";

// Single series → one hue, no legend (the title names it). Validated for
// contrast against the white card surface.
const SERIES   = "#2563EB"; // blue-600
const HOVER    = "#1D4ED8"; // blue-700 — the hovered bar "lifts"
const GRID     = "#E2E8F0"; // slate-200, hairline
const AXIS_INK = "#64748B"; // slate-500

const PERIODS = [
    { key: "daily",   label: "Daily",   range: "last 7 days",   form: "bar"  },
    { key: "weekly",  label: "Weekly",  range: "last 8 weeks",  form: "bar"  },
    { key: "monthly", label: "Monthly", range: "last 12 months", form: "line" },
];

function fullLabel(bucket, period) {
    const d = new Date(`${bucket.start}T00:00:00Z`);
    const opts = { timeZone: "UTC" };
    if (period === "daily")  return d.toLocaleDateString("en-GB", { ...opts, weekday: "long", day: "numeric", month: "short" });
    if (period === "weekly") return `Week of ${d.toLocaleDateString("en-GB", { ...opts, day: "numeric", month: "short", year: "numeric" })}`;
    return d.toLocaleDateString("en-GB", { ...opts, month: "long", year: "numeric" });
}

// Value leads, label follows; short line key instead of a box.
function ChartTooltip({ active, payload, period }) {
    if (!active || !payload?.length) return null;
    const bucket = payload[0].payload;
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm">
            <p className="text-slate-500 text-xs mb-1">{fullLabel(bucket, period)}</p>
            <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-0.5 rounded" style={{ background: SERIES }} />
                <span className="font-semibold text-slate-900">{bucket.count}</span>
                <span className="text-slate-500">treated</span>
            </div>
        </div>
    );
}

// "Patients treated" — only completed cases count.
// Doctor dashboard: pass doctorId. Admin dashboard: pass endpoint (e.g.
// "/api/stats/treated?doctor_id=…" or "/api/stats/treated" for everyone).
export default function PatientsTreatedChart({ doctorId, token, endpoint, title = "Patients Treated" }) {
    const base = endpoint || (doctorId ? `/api/doctors/${doctorId}/stats/treated` : null);
    const [period,    setPeriod]    = useState("daily");
    const [data,      setData]      = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState(null);
    const [showTable, setShowTable] = useState(false);

    useEffect(() => {
        if (!base || !token) return;
        let cancelled = false;
        api.get(`${base}${base.includes("?") ? "&" : "?"}period=${period}`, token)
            .then((d) => { if (!cancelled) { setData(d); setError(null); } })
            .catch((err) => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [base, token, period]);

    function choosePeriod(key) {
        if (key === period) return;
        setLoading(true);
        setPeriod(key);
    }

    const meta    = PERIODS.find((p) => p.key === period);
    const buckets = data?.period === period ? data.buckets : [];
    const total   = data?.period === period ? data.total : 0;
    const isEmpty = !loading && !error && total === 0;

    const axisProps = {
        tickLine: false,
        axisLine: false,
        tick: { fill: AXIS_INK, fontSize: 12 },
    };

    return (
        <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-6" aria-labelledby="treated-title">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                    <h2 id="treated-title" className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Activity size={20} className="text-blue-600" /> {title}
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        {loading
                            ? "Loading…"
                            : <>Completed cases, {meta.range}: <span className="font-semibold text-slate-800">{total}</span></>}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <div role="radiogroup" aria-label="Time period" className="inline-flex bg-slate-100 rounded-xl p-1">
                        {PERIODS.map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                role="radio"
                                aria-checked={period === p.key}
                                onClick={() => choosePeriod(p.key)}
                                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                                    period === p.key ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowTable((v) => !v)}
                        aria-pressed={showTable}
                        title={showTable ? "Show chart" : "Show as table"}
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 transition"
                    >
                        {showTable ? <BarChart3 size={18} /> : <Table2 size={18} />}
                        <span className="sr-only">{showTable ? "Show chart" : "Show as table"}</span>
                    </button>
                </div>
            </div>

            {error && <p className="text-red-500 text-sm py-10 text-center">{error}</p>}

            {!error && showTable && (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500">
                            <th className="py-2 font-medium">{period === "daily" ? "Day" : period === "weekly" ? "Week" : "Month"}</th>
                            <th className="py-2 font-medium text-right">Patients treated</th>
                        </tr>
                    </thead>
                    <tbody>
                        {buckets.map((b) => (
                            <tr key={b.start} className="border-b border-slate-100">
                                <td className="py-2 text-slate-700">{fullLabel(b, period)}</td>
                                <td className="py-2 text-right font-semibold text-slate-900 tabular-nums">{b.count}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {!error && !showTable && (
                <div
                    className="relative h-64"
                    role="img"
                    aria-label={`Patients treated, ${meta.range}: ${buckets.map((b) => `${b.label} ${b.count}`).join(", ")}`}
                >
                    {isEmpty && (
                        <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 z-10 pointer-events-none">
                            No completed cases in the {meta.range}.
                        </p>
                    )}
                    {!loading && (
                        <ResponsiveContainer width="100%" height="100%">
                            {meta.form === "bar" ? (
                                <BarChart data={buckets} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                    <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                                    <XAxis dataKey="label" {...axisProps} />
                                    <YAxis allowDecimals={false} domain={[0, (max) => Math.max(4, max)]} {...axisProps} />
                                    <Tooltip
                                        content={<ChartTooltip period={period} />}
                                        cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
                                    />
                                    <Bar
                                        dataKey="count"
                                        name="Patients treated"
                                        fill={SERIES}
                                        maxBarSize={24}
                                        radius={[4, 4, 0, 0]}
                                        activeBar={{ fill: HOVER }}
                                        isAnimationActive={false}
                                    />
                                </BarChart>
                            ) : (
                                <LineChart data={buckets} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                                    <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                                    {/* padding keeps the first/last month labels inside the card */}
                                    <XAxis dataKey="label" padding={{ left: 20, right: 20 }} {...axisProps} />
                                    <YAxis allowDecimals={false} domain={[0, (max) => Math.max(4, max)]} {...axisProps} />
                                    <Tooltip
                                        content={<ChartTooltip period={period} />}
                                        cursor={{ stroke: "#94A3B8", strokeWidth: 1 }}
                                    />
                                    <Line
                                        type="linear"
                                        dataKey="count"
                                        name="Patients treated"
                                        stroke={SERIES}
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        dot={{ r: 4, fill: SERIES, stroke: "#fff", strokeWidth: 2 }}
                                        activeDot={{ r: 6, fill: HOVER, stroke: "#fff", strokeWidth: 2 }}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            )}
                        </ResponsiveContainer>
                    )}
                </div>
            )}
        </section>
    );
}
