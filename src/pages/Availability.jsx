import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { ChevronLeft, ChevronRight, X, Clock, CalendarDays, Save, Trash2, CheckSquare, Square } from "lucide-react";
import toast from "react-hot-toast";
import { selectToken, selectUser } from "../features/auth/authSlice";
import { api } from "../utils/api";

const DAY_NAMES   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
];

function toIsoDate(date) { return date.toISOString().split("T")[0]; }

function getDayInfo(date, avail) {
    if (!avail) return { available: false, start_time: "09:00", end_time: "17:00", source: "none" };
    const isoDate   = toIsoDate(date);
    const exception = avail.exceptions?.find(ex => toIsoDate(new Date(ex.date)) === isoDate);
    if (exception) {
        return {
            available:  exception.available,
            start_time: exception.custom_hours?.start_time || "09:00",
            end_time:   exception.custom_hours?.end_time   || "17:00",
            source: "exception",
        };
    }
    return { available: false, start_time: "09:00", end_time: "17:00", source: "none" };
}

function calendarDays(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    return [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: lastDate }, (_, i) => new Date(year, month, i + 1)),
    ];
}

// ── Day cell ──────────────────────────────────────────────────────────────────
function DayCell({ date, avail, selectedSet, today, onClick }) {
    if (!date) return <div />;
    const info       = getDayInfo(date, avail);
    const iso        = toIsoDate(date);
    const isToday    = today && toIsoDate(today) === iso;
    const isSelected = selectedSet.has(iso);

    let bg;
    if (isSelected)                                      bg = "bg-blue-600 text-white ring-2 ring-blue-400";
    else if (isToday)                                    bg = "bg-blue-50 text-blue-700 ring-1 ring-blue-300";
    else if (info.available && info.source === "exception") bg = "bg-emerald-50 text-emerald-800";
    else if (!info.available && info.source === "exception") bg = "bg-red-50 text-red-400";
    else                                                 bg = "text-slate-500 hover:bg-slate-50";

    return (
        <button type="button" onClick={() => onClick(date)}
            className={`rounded-xl p-2 flex flex-col items-center min-h-[58px] transition border border-transparent hover:opacity-90 ${bg}`}>
            <span className={`text-sm font-bold ${isSelected ? "text-white" : ""}`}>{date.getDate()}</span>
            {info.available && (
                <span className={`text-[10px] mt-0.5 font-medium leading-tight ${isSelected ? "text-blue-100" : ""}`}>
                    {info.start_time}–{info.end_time}
                </span>
            )}
            {!info.available && info.source === "exception" && (
                <span className="text-[10px] mt-0.5 font-medium text-red-400">Off</span>
            )}
        </button>
    );
}

function LegendItem({ color, label }) {
    return (
        <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded ${color}`} />
            <span className="text-xs text-gray-500">{label}</span>
        </div>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Availability() {
    const token     = useSelector(selectToken);
    const user      = useSelector(selectUser);
    const profileId = user?.doctor_profile?.id;

    const today = new Date();
    const [viewYear,  setViewYear]  = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());

    const [avail,   setAvail]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);

    const [selectedDates, setSelectedDates] = useState(new Set());
    const [multiSelect,   setMultiSelect]   = useState(false);

    const [panelStart, setPanelStart] = useState("09:00");
    const [panelEnd,       setPanelEnd]       = useState("17:00");
    const [slotDuration,   setSlotDuration]   = useState(30);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!token)     { setLoading(false); return; }
        if (!profileId) { setLoading(false); return; }
        setLoading(true);
        api.get(`/api/doctors/${profileId}/availability`, token)
            .then(data => { setAvail(data); setSlotDuration(data?.slot_duration_minutes ?? 30); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [profileId, token]);

    // ── Sync panel to first selected date ─────────────────────────────────────
    const firstIso = [...selectedDates][0];
    useEffect(() => {
        if (!firstIso) return;
        const info = getDayInfo(new Date(firstIso + "T12:00:00"), avail);
        setPanelStart(info.start_time || "09:00");
        setPanelEnd(info.end_time     || "17:00");
    }, [firstIso, avail]);

    function prevMonth() {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    }
    function nextMonth() {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    }

    function handleDayClick(date) {
        const iso = toIsoDate(date);
        if (multiSelect) {
            setSelectedDates(prev => {
                const next = new Set(prev);
                if (next.has(iso)) next.delete(iso); else next.add(iso);
                return next;
            });
        } else {
            setSelectedDates(new Set([iso]));
        }
    }

    // ── Patch helper ──────────────────────────────────────────────────────────
    async function patchAvailability(changes) {
        setSaving(true);
        try {
            const res = await api.patch("/api/doctors/me/availability", changes, token);
            setAvail(res);
            setSlotDuration(res?.slot_duration_minutes ?? 30);
            toast.success("Availability updated");
        } catch (err) {
            toast.error(err.message || "Failed to save");
        } finally {
            setSaving(false);
        }
    }

    // ── Save working hours for selected day(s) ────────────────────────────────
    async function saveForDays() {
        if (!selectedDates.size) return;
        const isoDates   = [...selectedDates];
        const isoSet     = new Set(isoDates);
        const existing   = (avail?.exceptions || []).filter(ex => !isoSet.has(toIsoDate(new Date(ex.date))));
        const newEntries = isoDates.map(date => ({
            date,
            available:    true,
            custom_hours: { start_time: panelStart, end_time: panelEnd },
        }));
        await patchAvailability({ exceptions: [...existing, ...newEntries] });
    }

    // ── Mark selected day(s) as off ───────────────────────────────────────────
    async function markAsOff() {
        if (!selectedDates.size) return;
        const isoDates  = [...selectedDates];
        const isoSet    = new Set(isoDates);
        const existing  = (avail?.exceptions || []).filter(ex => !isoSet.has(toIsoDate(new Date(ex.date))));
        const offEntries = isoDates.map(date => ({ date, available: false, custom_hours: null }));
        await patchAvailability({ exceptions: [...existing, ...offEntries] });
    }

    // ── Remove exceptions for selected day(s) ─────────────────────────────────
    async function removeExceptions() {
        if (!selectedDates.size) return;
        const isoSet = new Set([...selectedDates]);
        const filtered = (avail?.exceptions || []).filter(
            ex => !isoSet.has(toIsoDate(new Date(ex.date)))
        );
        await patchAvailability({ exceptions: filtered });
    }

    // ── Save slot duration ────────────────────────────────────────────────────
    async function saveSlotDuration() {
        const mins = Number.parseInt(slotDuration, 10);
        if (!mins || mins < 5) { toast.error("Minimum is 5 minutes"); return; }
        await patchAvailability({ slot_duration_minutes: mins });
    }

    const cells        = calendarDays(viewYear, viewMonth);
    const selCount     = selectedDates.size;
    const firstDate    = firstIso ? new Date(firstIso + "T12:00:00") : null;
    const firstHasException = firstIso && avail?.exceptions?.some(
        ex => toIsoDate(new Date(ex.date)) === firstIso
    );
    const anySelectedHasException = avail?.exceptions?.some(
        ex => selectedDates.has(toIsoDate(new Date(ex.date)))
    ) ?? false;

    return (
        <div className="p-8 flex gap-6 items-start">

            {/* ── Calendar ─────────────────────────────────────────────────── */}
            <div className="flex-1 space-y-6 min-w-0">

                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">Availability</h1>
                        <p className="text-gray-500 text-sm mt-1">Set your schedule for appointments</p>
                    </div>

                    <div className="flex items-center gap-3 bg-white rounded-2xl px-5 py-3 shadow-sm border border-slate-200">
                        <Clock size={18} className="text-blue-500 shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-slate-700 whitespace-nowrap">Appointment length (min)</p>
                            <p className="text-[11px] text-gray-400">Each booking slot is this long</p>
                        </div>
                        <input type="number" min={5} step={5} value={slotDuration}
                            onChange={e => setSlotDuration(e.target.value)}
                            className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center outline-none focus:ring-2 focus:ring-blue-500" />
                        <button type="button" onClick={saveSlotDuration} disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition">
                            <Save size={13} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
                        Loading availability…
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">

                        <div className="flex items-center justify-between mb-6">
                            <button type="button" onClick={prevMonth}
                                className="p-2 rounded-xl hover:bg-slate-100 text-gray-500 transition">
                                <ChevronLeft size={20} />
                            </button>

                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-slate-800">{MONTH_NAMES[viewMonth]} {viewYear}</h2>
                                <button
                                    type="button"
                                    onClick={() => { setMultiSelect(v => !v); setSelectedDates(new Set()); }}
                                    title="Select multiple days at once"
                                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                                        multiSelect
                                            ? "bg-blue-600 text-white border-blue-600"
                                            : "bg-white text-slate-600 border-slate-300 hover:border-blue-400 hover:text-blue-600"
                                    }`}>
                                    {multiSelect ? <CheckSquare size={13} /> : <Square size={13} />}
                                    Multi-select
                                </button>
                                {selCount > 1 && (
                                    <button type="button" onClick={() => setSelectedDates(new Set())}
                                        className="text-xs text-gray-400 hover:text-red-500 transition">
                                        Clear ({selCount})
                                    </button>
                                )}
                            </div>

                            <button type="button" onClick={nextMonth}
                                className="p-2 rounded-xl hover:bg-slate-100 text-gray-500 transition">
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        <div className="grid grid-cols-7 mb-2">
                            {DAY_NAMES.map(d => (
                                <div key={d} className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider py-1">{d}</div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1.5">
                            {cells.map((date, i) => (
                                <DayCell
                                    key={i}
                                    date={date}
                                    avail={avail}
                                    selectedSet={selectedDates}
                                    today={today}
                                    onClick={handleDayClick}
                                />
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-5 mt-6 pt-4 border-t border-slate-100">
                            <LegendItem color="bg-emerald-100" label="Available" />
                            <LegendItem color="bg-red-100"    label="Day off" />
                            <LegendItem color="bg-blue-600"   label="Selected" />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Side panel ───────────────────────────────────────────────── */}
            {selCount > 0 && (
                <div className="w-[340px] shrink-0">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-8 space-y-4">

                        {/* Header */}
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                                <CalendarDays size={20} className="text-blue-600 shrink-0 mt-0.5" />
                                <div>
                                    {selCount === 1 && firstDate ? (
                                        <>
                                            <h3 className="text-base font-bold text-slate-800 leading-tight">
                                                {firstDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                                            </h3>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {firstHasException ? "Custom hours set" : "No hours set"}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <h3 className="text-base font-bold text-slate-800">{selCount} days selected</h3>
                                            <p className="text-xs text-gray-400 mt-0.5">Settings apply to all selected days</p>
                                        </>
                                    )}
                                </div>
                            </div>
                            <button type="button" onClick={() => setSelectedDates(new Set())}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 shrink-0">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Time inputs */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1 font-medium">Start Time</label>
                                <input type="time" value={panelStart} onChange={e => setPanelStart(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1 font-medium">End Time</label>
                                <input type="time" value={panelEnd} onChange={e => setPanelEnd(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2.5">
                            <button type="button" onClick={saveForDays} disabled={saving}
                                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-3 rounded-xl transition">
                                <Save size={15} />
                                {selCount === 1 ? "Save hours for this day" : `Save hours for ${selCount} days`}
                            </button>

                            <button type="button" onClick={markAsOff} disabled={saving}
                                className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 border border-red-200 hover:border-red-400 text-red-500 text-sm font-medium py-2.5 rounded-xl transition disabled:opacity-50">
                                Mark {selCount === 1 ? "this day" : `${selCount} days`} as Off
                            </button>

                            {anySelectedHasException && (
                                <button type="button" onClick={removeExceptions} disabled={saving}
                                    className="w-full flex items-center justify-center gap-2 border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-500 text-sm font-medium py-2.5 rounded-xl transition bg-white disabled:opacity-50">
                                    <Trash2 size={14} />
                                    Remove {selCount === 1 ? "this day's setting" : "settings for selected days"}
                                </button>
                            )}
                        </div>

                        {/* Current status */}
                        {selCount === 1 && avail && firstDate && (
                            <div className="pt-3 border-t border-slate-100">
                                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1.5">Current Status</p>
                                {(() => {
                                    const info = getDayInfo(firstDate, avail);
                                    if (!info.available && info.source === "exception")
                                        return <p className="text-sm text-red-500 font-medium">Marked as Off</p>;
                                    if (info.available)
                                        return <p className="text-sm text-emerald-700 font-medium">{info.start_time} – {info.end_time}</p>;
                                    return <p className="text-sm text-gray-400">No hours set</p>;
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
