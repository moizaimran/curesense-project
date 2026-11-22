import { useMemo, useState } from "react";
import { Star, Trophy, Search, ChevronUp, ChevronDown } from "lucide-react";
import { formatPKR } from "../../../utils/payment";

const SORTS = {
    rating_desc: { label: "Highest rated",       fn: (a, b) => b.rating.average - a.rating.average || b.rating.count - a.rating.count },
    rating_asc:  { label: "Lowest rated",        fn: (a, b) => unrated(a) - unrated(b) || a.rating.average - b.rating.average || b.rating.count - a.rating.count },
    reviews:     { label: "Most reviews",        fn: (a, b) => b.rating.count - a.rating.count },
    treated:     { label: "Most patients treated", fn: (a, b) => b.patients_treated - a.patients_treated },
    revenue:     { label: "Highest revenue",     fn: (a, b) => b.revenue - a.revenue },
    name:        { label: "Name (A–Z)",          fn: (a, b) => a.name.localeCompare(b.name) },
};

// Doctors with no reviews sort last in "lowest rated" (no rating ≠ a bad rating)
function unrated(d) {
    return d.rating.count ? 0 : 1;
}

function Stars({ value }) {
    return (
        <span className="inline-flex items-center gap-1 font-semibold text-slate-800 tabular-nums">
            <Star size={14} className="text-amber-400" fill="currentColor" aria-hidden="true" />
            {value.toFixed(1)}
        </span>
    );
}

// Per-doctor ratings table (+ top performers). `onSelectDoctor(id)` lets the
// admin jump the dashboard filter to that doctor.
export default function DoctorRatingsTable({ doctors, topPerformers, selectedId, onSelectDoctor }) {
    const [sort,   setSort]   = useState("rating_desc");
    const [search, setSearch] = useState("");

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return doctors
            .filter((d) => !q || `${d.name} ${d.specialty} ${d.city}`.toLowerCase().includes(q))
            .sort(SORTS[sort].fn);
    }, [doctors, sort, search]);

    const top = topPerformers
        .map((id) => doctors.find((d) => String(d._id) === id))
        .filter(Boolean);

    const toggleRatingSort = () => setSort((s) => (s === "rating_desc" ? "rating_asc" : "rating_desc"));

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Ratings table */}
            <section className="xl:col-span-2 bg-white rounded-2xl shadow-md border border-slate-200 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Star size={20} className="text-blue-600" /> Doctor Ratings
                    </h2>
                    <div className="flex gap-2">
                        <label className="relative">
                            <span className="sr-only">Search doctors</span>
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search doctor, specialty…"
                                className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#264296]"
                            />
                        </label>
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value)}
                            aria-label="Sort doctors"
                            className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#264296]"
                        >
                            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-left text-slate-500">
                                <th className="py-2 font-medium">Doctor</th>
                                <th className="py-2 font-medium">
                                    <button type="button" onClick={toggleRatingSort} className="inline-flex items-center gap-1 hover:text-slate-800">
                                        Avg rating
                                        {sort === "rating_desc" ? <ChevronDown size={14} /> : sort === "rating_asc" ? <ChevronUp size={14} /> : null}
                                    </button>
                                </th>
                                <th className="py-2 font-medium text-right">Reviews</th>
                                <th className="py-2 font-medium text-right">Patients treated</th>
                                <th className="py-2 font-medium text-right">Revenue</th>
                                <th className="py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={6} className="py-8 text-center text-slate-400">No doctors match.</td></tr>
                            )}
                            {rows.map((d) => {
                                const selected = String(d._id) === String(selectedId);
                                return (
                                    <tr key={d._id} className={`border-b border-slate-100 ${selected ? "bg-blue-50" : ""}`}>
                                        <td className="py-3">
                                            <p className="font-semibold text-slate-800">{d.name}</p>
                                            <p className="text-xs text-slate-500">{[d.specialty, d.city].filter(Boolean).join(" · ")}</p>
                                        </td>
                                        <td className="py-3">
                                            {d.rating.count ? <Stars value={d.rating.average} /> : <span className="text-xs text-slate-400">No ratings</span>}
                                        </td>
                                        <td className="py-3 text-right tabular-nums text-slate-900">{d.rating.count}</td>
                                        <td className="py-3 text-right tabular-nums text-slate-900">{d.patients_treated}</td>
                                        <td className="py-3 text-right tabular-nums text-slate-900">{formatPKR(d.revenue)}</td>
                                        <td className="py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => onSelectDoctor(selected ? "" : String(d._id))}
                                                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                                            >
                                                {selected ? "Show all" : "View charts"}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Top performers */}
            <section className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-1">
                    <Trophy size={20} className="text-blue-600" /> Top Performers
                </h2>
                <p className="text-xs text-slate-500 mb-4">Most patients treated, then best rating.</p>
                {top.length === 0 ? (
                    <p className="text-sm text-slate-400">No completed cases yet.</p>
                ) : (
                    <ol className="space-y-3">
                        {top.map((d, i) => (
                            <li key={d._id} className="flex items-center gap-3">
                                <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 text-sm font-bold flex items-center justify-center">
                                    {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-800 truncate">{d.name}</p>
                                    <p className="text-xs text-slate-500">
                                        {d.patients_treated} treated
                                        {d.rating.count ? <> · ★ {d.rating.average.toFixed(1)} ({d.rating.count})</> : null}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </section>
        </div>
    );
}
