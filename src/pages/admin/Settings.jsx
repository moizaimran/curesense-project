import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
// Redux fake-data usage commented out — component now uses the real API.
// import { useDispatch } from "react-redux";
// import { updateSettings } from "../../features/admin/adminSlice";
// const settings = useSelector((state) => state.admin.settings);

import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

const DEFAULTS = {
    systemName: "CureSense", supportEmail: "", supportPhone: "",
    aiConfidence: 85, aiDiagnosis: true, imageAnalysis: true,
    sessionTimeout: 30, twoFactorAuth: false,
    doctorApprovalEmails: true, patientRegistrationEmails: true, systemAlerts: true,
};

export default function Settings() {
    const token = useSelector(selectToken);

    const [formData, setFormData] = useState(DEFAULTS);
    const [loading,  setLoading]  = useState(true);
    const [saving,   setSaving]   = useState(false);
    const [msg,      setMsg]      = useState(null);

    useEffect(() => {
        if (!token) return;
        api.get("/api/auth/settings", token)
            .then(data => setFormData(data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [token]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const updated = await api.patch("/api/auth/settings", formData, token);
            setFormData(updated);
            setMsg({ ok: true, text: "Settings saved." });
        } catch (err) {
            setMsg({ ok: false, text: err.message });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-gray-400">Loading settings…</div>;

    return (

        <div className="space-y-8">

            {/* Heading */}

            <div>

                <h1 className="text-3xl font-bold text-slate-800">
                    System Settings
                </h1>

                <p className="text-gray-500 mt-2">
                    Configure system, AI and notification settings.
                </p>

            </div>

            {/* General Information */}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

                <h2 className="text-2xl font-bold text-slate-800 mb-6">
                    General Information
                </h2>

                <div className="grid grid-cols-2 gap-6">

                    <div>

                        <label className="block mb-2 font-medium">
                            System Name
                        </label>

                        <input
                            type="text"
                            name="systemName"
                            value={formData.systemName}
                            onChange={handleChange}
                            className="w-full border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#264296]"
                        />

                    </div>

                    <div>

                        <label className="block mb-2 font-medium">
                            Support Email
                        </label>

                        <input
                            type="email"
                            name="supportEmail"
                            value={formData.supportEmail}
                            onChange={handleChange}
                            className="w-full border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#264296]"
                        />

                    </div>

                    <div>

                        <label className="block mb-2 font-medium">
                            Support Phone
                        </label>

                        <input
                            type="text"
                            name="supportPhone"
                            value={formData.supportPhone}
                            onChange={handleChange}
                            className="w-full border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#264296]"
                        />

                    </div>

                </div>

            </div>

            {/* Payment Accounts */}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

                <h2 className="text-2xl font-bold text-slate-800">
                    Payment Accounts
                </h2>
                <p className="text-gray-500 text-sm mt-1 mb-6">
                    Patients pay consultation fees into these CureSense accounts (never directly to the doctor).
                    Leave a wallet empty to hide it at checkout.
                </p>

                <div className="grid grid-cols-2 gap-6">
                    {[
                        ["easypaisaAccountTitle",  "EasyPaisa account title",  "e.g. CureSense Pvt Ltd"],
                        ["easypaisaAccountNumber", "EasyPaisa account number", "e.g. 03001234567"],
                        ["jazzcashAccountTitle",   "JazzCash account title",   "e.g. CureSense Pvt Ltd"],
                        ["jazzcashAccountNumber",  "JazzCash account number",  "e.g. 03001234567"],
                    ].map(([name, label, placeholder]) => (
                        <div key={name}>
                            <label htmlFor={name} className="block mb-2 font-medium">{label}</label>
                            <input
                                id={name}
                                type="text"
                                name={name}
                                value={formData[name] || ""}
                                placeholder={placeholder}
                                onChange={handleChange}
                                className="w-full border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#264296]"
                            />
                        </div>
                    ))}
                </div>

                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mt-6">
                    Card payments are running in <strong>sandbox (test) mode</strong>: only test cards such as
                    4242 4242 4242 4242 are accepted and no real money moves. Connect a payment gateway
                    with merchant keys to take real card payments. EasyPaisa/JazzCash payments are real
                    transfers to the numbers above — check each transaction ID before approving.
                </p>

            </div>

                        {/* AI Configuration */}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

                <h2 className="text-2xl font-bold text-slate-800 mb-6">
                    AI Configuration
                </h2>

                <div className="grid grid-cols-2 gap-6">

                    <div>

                        <label className="block mb-2 font-medium">
                            AI Confidence Threshold (%)
                        </label>

                        <input
                            type="number"
                            name="aiConfidence"
                            value={formData.aiConfidence}
                            onChange={handleChange}
                            className="w-full border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#264296]"
                        />

                    </div>

                    <div className="flex items-center gap-3 mt-8">

                        <input
                            type="checkbox"
                            name="aiDiagnosis"
                            checked={formData.aiDiagnosis}
                            onChange={handleChange}
                        />

                        <label>
                            Enable AI Diagnosis
                        </label>

                    </div>

                    <div className="flex items-center gap-3">

                        <input
                            type="checkbox"
                            name="imageAnalysis"
                            checked={formData.imageAnalysis}
                            onChange={handleChange}
                        />

                        <label>
                            Enable Image Analysis
                        </label>

                    </div>

                </div>

            </div>

            {/* Security */}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

                <h2 className="text-2xl font-bold text-slate-800 mb-6">
                    Security
                </h2>

                <div className="grid grid-cols-2 gap-6">

                    <div>

                        <label className="block mb-2 font-medium">
                            Session Timeout (Minutes)
                        </label>

                        <input
                            type="number"
                            name="sessionTimeout"
                            value={formData.sessionTimeout}
                            onChange={handleChange}
                            className="w-full border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#264296]"
                        />

                    </div>

                    <div className="flex items-center gap-3 mt-8">

                        <input
                            type="checkbox"
                            name="twoFactorAuth"
                            checked={formData.twoFactorAuth}
                            onChange={handleChange}
                        />

                        <label>
                            Enable Two-Factor Authentication
                        </label>

                    </div>

                </div>

            </div>

            {/* Notifications */}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

                <h2 className="text-2xl font-bold text-slate-800 mb-6">
                    Notifications
                </h2>

                <div className="space-y-4">

                    <div className="flex items-center gap-3">

                        <input
                            type="checkbox"
                            name="doctorApprovalEmails"
                            checked={formData.doctorApprovalEmails}
                            onChange={handleChange}
                        />

                        <label>
                            Doctor Approval Emails
                        </label>

                    </div>

                    <div className="flex items-center gap-3">

                        <input
                            type="checkbox"
                            name="patientRegistrationEmails"
                            checked={formData.patientRegistrationEmails}
                            onChange={handleChange}
                        />

                        <label>
                            Patient Registration Emails
                        </label>

                    </div>

                    <div className="flex items-center gap-3">

                        <input
                            type="checkbox"
                            name="systemAlerts"
                            checked={formData.systemAlerts}
                            onChange={handleChange}
                        />

                        <label>
                            System Alerts
                        </label>

                    </div>

                </div>

            </div>

            {msg && (
                <div className={`px-5 py-3 rounded-xl text-sm font-medium ${msg.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                    {msg.text}
                </div>
            )}

            {/* Save Button */}

            <div className="flex justify-end">

                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-[#264296] hover:bg-[#1f3678] disabled:opacity-50 text-white px-8 py-3 rounded-xl font-semibold transition"
                >
                    {saving ? "Saving…" : "Save Changes"}
                </button>

            </div>

        </div>

    );

}