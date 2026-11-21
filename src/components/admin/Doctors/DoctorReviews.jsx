import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import StarRating, { RatingBadge } from "../../common/StarRating";
import { api } from "../../../utils/api";

const PAGE_SIZE = 5;

function fmtDate(iso) {
    return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
}

// Patient reviews of a verified doctor (admin Doctor Details page).
export default function DoctorReviews({ doctorId }) {
    const [data,    setData]    = useState(null);
    const [page,    setPage]    = useState(1);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        let cancelled = false;
        api.get(`/api/doctors/${doctorId}/reviews?page=${page}&limit=${PAGE_SIZE}`)
            .then((d) => { if (!cancelled) { setData(d); setError(null); } })
            .catch((err) => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [doctorId, page]);

    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Star size={24} className="text-[#264296]" />
                    <h3 className="text-xl font-bold text-slate-800">Patient Reviews</h3>
                </div>
                {data && <RatingBadge rating={data.rating} />}
            </div>

            {loading && <p className="text-gray-400 text-sm">Loading reviews…</p>}
            {!loading && error && <p className="text-red-500 text-sm">{error}</p>}
            {!loading && !error && data?.results.length === 0 && (
                <p className="text-gray-400 text-sm">No patient reviews yet.</p>
            )}

            {!loading && !error && data?.results.length > 0 && (
                <>
                    <ul className="divide-y divide-gray-100">
                        {data.results.map((r) => (
                            <li key={r._id} className="py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <StarRating value={r.rating} size={16} />
                                        <span className="font-semibold text-slate-700 text-sm">{r.patient_first_name}</span>
                                    </div>
                                    <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>
                                </div>
                                {r.comment && <p className="text-slate-600 text-sm mt-2 whitespace-pre-line">{r.comment}</p>}
                            </li>
                        ))}
                    </ul>
                    {totalPages > 1 && (
                        <div className="flex justify-end items-center gap-3 mt-4 text-sm">
                            <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                                className="px-3 py-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50">Previous</button>
                            <span className="text-gray-500">Page {page} of {totalPages}</span>
                            <button type="button" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
                                className="px-3 py-1.5 rounded-lg border disabled:opacity-40 hover:bg-gray-50">Next</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
