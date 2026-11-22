import { useState } from "react";
import toast from "react-hot-toast";
import { Banknote } from "lucide-react";
import { api } from "../../utils/api";
import { formatPKR } from "../../utils/payment";

const MAX_FEE = 100000;

// Doctor sets their own consultation fee (PKR). Patients see it before booking
// and pay it in advance to the CureSense admin account.
export default function ConsultationFee({ fee = 0, token, onSaved }) {
    const [editing, setEditing] = useState(false);
    const [value,   setValue]   = useState(String(fee ?? 0));
    const [saving,  setSaving]  = useState(false);

    const n = Number(value);
    const valid = value.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= MAX_FEE;

    async function save() {
        if (!valid) return;
        setSaving(true);
        try {
            const updated = await api.patch("/api/doctors/me/profile", { consultation_fee: n }, token);
            onSaved?.(updated);
            setEditing(false);
            toast.success(n === 0 ? "Consultations are now free" : `Fee set to ${formatPKR(n)}`);
        } catch (err) {
            toast.error(err.message || "Could not save fee");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Banknote size={24} className="text-blue-600" /> Consultation Fee
                    </h2>
                    <p className="text-gray-500 text-sm mt-1 max-w-xl">
                        Patients see this fee before booking and pay it in advance. Payments are collected by
                        CureSense and verified by an admin before your appointment is confirmed.
                    </p>
                </div>

                {!editing ? (
                    <div className="flex items-center gap-4">
                        <span className="text-3xl font-bold text-slate-800">{fee > 0 ? formatPKR(fee) : "Free"}</span>
                        <button
                            type="button"
                            onClick={() => { setValue(String(fee ?? 0)); setEditing(true); }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm"
                        >
                            Change fee
                        </button>
                    </div>
                ) : (
                    <div className="flex items-start gap-3">
                        <div>
                            <label htmlFor="consultation-fee" className="sr-only">Consultation fee in rupees</label>
                            <div className="flex items-center border border-blue-500 rounded-xl focus-within:ring-2 focus-within:ring-blue-300">
                                <span className="pl-4 text-slate-500 font-semibold">Rs</span>
                                <input
                                    id="consultation-fee"
                                    type="number"
                                    min="0"
                                    max={MAX_FEE}
                                    step="1"
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && save()}
                                    className="w-36 px-3 py-3 rounded-xl outline-none text-lg font-semibold"
                                    autoFocus
                                />
                            </div>
                            <p className={`text-xs mt-1 ${valid ? "text-gray-400" : "text-red-600"}`}>
                                {valid ? "Enter 0 for free consultations." : `Whole rupees from 0 to ${MAX_FEE.toLocaleString()}.`}
                            </p>
                        </div>
                        <button type="button" onClick={() => setEditing(false)}
                            className="px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-700">
                            Cancel
                        </button>
                        <button type="button" onClick={save} disabled={!valid || saving}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-semibold text-sm">
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
