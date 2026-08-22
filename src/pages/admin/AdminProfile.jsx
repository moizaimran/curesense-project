import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
// Redux fake-data usage commented out — component now uses the real API.
// import { useDispatch } from "react-redux";
// import { updateProfile } from "../../features/admin/adminSlice";
// const profile = useSelector((state) => state.admin.profile);

import patientPlaceholder from "../../assets/images/patient-avatar.jpg";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export default function AdminProfile() {
    const navigate = useNavigate();
    const token    = useSelector(selectToken);

    const [user,      setUser]      = useState(null);
    const [formData,  setFormData]  = useState({ name: "" });
    const [saving,    setSaving]    = useState(false);
    const [saveMsg,   setSaveMsg]   = useState(null);
    const [loading,   setLoading]   = useState(true);

    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });

    useEffect(() => {
        if (!token) return;
        api.get("/api/auth/me", token)
            .then(data => { setUser(data); setFormData({ name: data.name || "" }); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [token]);

    const handleChange = e => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handlePasswordChange = e => setPasswordData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSave = async () => {
        setSaveMsg(null);
        setSaving(true);
        try {
            const updated = await api.patch("/api/auth/me", { name: formData.name }, token);
            setUser(updated);
            setSaveMsg({ ok: true, text: "Profile updated successfully." });
        } catch (err) {
            setSaveMsg({ ok: false, text: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordUpdate = () => {
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            alert("Passwords do not match");
            return;
        }
        // Password change endpoint not yet implemented — placeholder
        alert("Password update is not yet wired to the backend.");
        setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    };

    if (loading) return <div className="p-8 text-gray-400">Loading…</div>;
    if (!user) return null;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-800">My Profile</h1>
                <p className="text-gray-500 mt-2">Manage your administrator account.</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <div className="grid grid-cols-12 gap-10">

                    {/* LEFT */}
                    <div className="col-span-4 border-r border-gray-200 pr-8">
                        <div className="flex flex-col items-center">
                            <img
                                src={patientPlaceholder}
                                alt="Admin"
                                className="w-40 h-40 rounded-full object-cover border-4 border-blue-100"
                            />
                            <h2 className="text-2xl font-bold mt-6">{user.name}</h2>
                            <p className="text-gray-500 mt-2 capitalize">{user.role}</p>
                            <span className="mt-4 px-4 py-2 rounded-full bg-green-100 text-green-700 font-semibold text-sm">
                                Active
                            </span>
                        </div>
                    </div>

                    {/* RIGHT */}
                    <div className="col-span-8 space-y-8">

                        {/* Profile Information */}
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 mb-6">Profile Information</h2>

                            {saveMsg && (
                                <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium ${saveMsg.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                                    {saveMsg.text}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-2">Full Name</label>
                                    <input
                                        type="text" name="name" value={formData.name}
                                        onChange={handleChange}
                                        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-2">Email</label>
                                    <input
                                        type="email" value={user.email} disabled
                                        className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 text-gray-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-2">Role</label>
                                    <input
                                        type="text" value={user.role} disabled
                                        className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 capitalize"
                                    />
                                </div>
                            </div>

                            <button
                                type="button" onClick={handleSave} disabled={saving}
                                className="mt-8 bg-[#264296] hover:bg-blue-900 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-semibold"
                            >
                                {saving ? "Saving…" : "Save Changes"}
                            </button>
                        </div>

                        <hr className="border-gray-200" />

                        {/* Change Password */}
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 mb-6">Change Password</h2>
                            <div className="grid grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-2">Current Password</label>
                                    <input
                                        type="password" name="currentPassword"
                                        value={passwordData.currentPassword} onChange={handlePasswordChange}
                                        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-2">New Password</label>
                                    <input
                                        type="password" name="newPassword"
                                        value={passwordData.newPassword} onChange={handlePasswordChange}
                                        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-2">Confirm Password</label>
                                    <input
                                        type="password" name="confirmPassword"
                                        value={passwordData.confirmPassword} onChange={handlePasswordChange}
                                        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#264296]"
                                    />
                                </div>
                            </div>
                            <button
                                type="button" onClick={handlePasswordUpdate}
                                className="mt-8 bg-[#264296] hover:bg-blue-900 text-white px-8 py-3 rounded-xl font-semibold"
                            >
                                Update Password
                            </button>
                        </div>

                        <hr className="border-gray-200" />

                        {/* Account Info */}
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 mb-6">Account Information</h2>
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <p className="text-sm text-gray-500">Joined Date</p>
                                    <p className="font-semibold text-slate-800 mt-1">{fmtDate(user.created_at)}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Account Status</p>
                                    <p className="font-semibold text-green-600 mt-1">Active</p>
                                </div>
                            </div>
                        </div>

                        <hr className="border-gray-200" />

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => navigate("/admin/login")}
                                className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-xl font-semibold"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
