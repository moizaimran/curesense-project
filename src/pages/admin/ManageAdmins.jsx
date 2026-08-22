import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { ShieldCheck, Plus, X } from "lucide-react";
import { selectToken } from "../../features/auth/authSlice";
import { api } from "../../utils/api";

function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const EMPTY_FORM = { name: "", email: "", password: "", role: "admin" };

export default function ManageAdmins() {
    const token = useSelector(selectToken);

    const [admins,      setAdmins]      = useState([]);
    const [total,       setTotal]       = useState(0);
    const [loading,     setLoading]     = useState(true);
    const [fetchError,  setFetchError]  = useState(null);

    const [showForm,    setShowForm]    = useState(false);
    const [form,        setForm]        = useState(EMPTY_FORM);
    const [submitting,  setSubmitting]  = useState(false);
    const [formError,   setFormError]   = useState("");
    const [successMsg,  setSuccessMsg]  = useState("");

    useEffect(() => {
        if (!token) return;
        setLoading(true);
        api.get("/api/auth/staff", token)
            .then(data => { setAdmins(data.results ?? []); setTotal(data.total ?? 0); })
            .catch(err  => setFetchError(err.message))
            .finally(() => setLoading(false));
    }, [token]);

    function handleChange(e) {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    }

    async function handleCreate(e) {
        e.preventDefault();
        setFormError("");
        setSuccessMsg("");
        setSubmitting(true);
        try {
            const result = await api.post("/api/auth/staff", form, token);
            setAdmins(prev => [result.user, ...prev]);
            setTotal(prev => prev + 1);
            setForm(EMPTY_FORM);
            setShowForm(false);
            setSuccessMsg(`${result.user.role === "admin" ? "Admin" : "Staff"} account created for ${result.user.name}.`);
        } catch (err) {
            setFormError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">Manage Admins</h1>
                    <p className="text-gray-500 mt-1">Create and view administrator accounts.</p>
                </div>
                <button
                    type="button"
                    onClick={() => { setShowForm(s => !s); setFormError(""); setSuccessMsg(""); }}
                    className="flex items-center gap-2 bg-[#264296] hover:bg-[#1e3480] text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
                >
                    {showForm ? <X size={16} /> : <Plus size={16} />}
                    {showForm ? "Cancel" : "Add Admin"}
                </button>
            </div>

            {successMsg && (
                <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-5 py-3 text-sm font-medium">
                    {successMsg}
                </div>
            )}

            {/* Create form */}
            {showForm && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                    <h2 className="text-xl font-bold text-slate-800 mb-6">New Staff Account</h2>
                    <form onSubmit={handleCreate} className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Full Name</label>
                            <input
                                type="text" name="name" value={form.name}
                                onChange={handleChange} required
                                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#264296]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Email</label>
                            <input
                                type="email" name="email" value={form.email}
                                onChange={handleChange} required
                                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#264296]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Password</label>
                            <input
                                type="password" name="password" value={form.password}
                                onChange={handleChange} required minLength={8}
                                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#264296]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Role</label>
                            <select
                                name="role" value={form.role} onChange={handleChange}
                                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#264296]"
                            >
                                <option value="admin">Admin</option>
                            </select>
                        </div>

                        {formError && (
                            <p className="col-span-2 text-red-500 text-sm">{formError}</p>
                        )}

                        <div className="col-span-2 flex justify-end">
                            <button
                                type="submit" disabled={submitting}
                                className="bg-[#264296] hover:bg-[#1e3480] disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition"
                            >
                                {submitting ? "Creating…" : "Create Account"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Admin list */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-800">All Admins</h2>
                    {!loading && <span className="text-sm text-gray-400">{total} total</span>}
                </div>

                {loading && <div className="py-12 text-center text-gray-400">Loading…</div>}
                {!loading && fetchError && <div className="py-12 text-center text-red-500">{fetchError}</div>}
                {!loading && !fetchError && admins.length === 0 && (
                    <div className="py-12 text-center text-gray-400">No admin accounts found.</div>
                )}

                {!loading && !fetchError && admins.length > 0 && (
                    <table className="w-full">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Name</th>
                                <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Email</th>
                                <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Role</th>
                                <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-gray-500">Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {admins.map(admin => (
                                <tr key={admin._id || admin.id} className="border-t border-gray-100 hover:bg-slate-50 transition">
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                                <ShieldCheck size={16} className="text-[#264296]" />
                                            </div>
                                            <span className="font-semibold text-slate-800 text-sm">{admin.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-gray-600">{admin.email}</td>
                                    <td className="px-5 py-4">
                                        <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full capitalize">
                                            {admin.role}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-gray-500">{fmtDate(admin.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
