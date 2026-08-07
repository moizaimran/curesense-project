import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateSettings } from "../../features/admin/adminSlice";

export default function Settings() {

    const dispatch = useDispatch();

    const settings = useSelector(
        (state) => state.admin.settings
    );

    const [formData, setFormData] = useState(settings);

    const handleChange = (e) => {

        const { name, value, type, checked } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));

    };

    const handleSave = () => {

        dispatch(updateSettings(formData));

        alert("Settings updated successfully!");

    };

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

            {/* Save Button */}

            <div className="flex justify-end">

                <button
                    onClick={handleSave}
                    className="bg-[#264296] hover:bg-[#1f3678] text-white px-8 py-3 rounded-xl font-semibold transition"
                >
                    Save Changes
                </button>

            </div>

        </div>

    );

}