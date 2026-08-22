import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
// Redux fake-data usage commented out — component now uses the real API.
// import { useDispatch } from "react-redux";
// import { updateProfile } from "../features/doctor/doctorSlice";

import DoctorProfileCard from "../components/Profile/DoctorProfileCard";
import PersonalInfo from "../components/Profile/PersonalInfo";
import { selectToken } from "../features/auth/authSlice";
import { api } from "../utils/api";
import doctorPlaceholder from "../assets/images/doctor-avatar.jpg";

// Map real DoctorProfile fields into the shape PersonalInfo expects
function toFormShape(profile) {
    return {
        name:           profile?.user_id?.name          || "",
        email:          profile?.contact?.email         || "",
        phone:          profile?.contact?.phone         || "",
        hospital:       profile?.hospital_clinic        || "",
        department:     profile?.sub_specialty          || "",
        specialization: profile?.specialty              || "",
        experience:     profile?.experience_years != null ? String(profile.experience_years) : "",
        licenseNumber:  profile?.pmdc_number            || "",
        username:       "",
        profileImage:   doctorPlaceholder,
    };
}

export default function Profile() {
    const token = useSelector(selectToken);

    const [rawProfile, setRawProfile] = useState(null);
    const [profile,    setProfile]    = useState(null);
    const [isEditing,  setIsEditing]  = useState(false);
    const [saving,     setSaving]     = useState(false);
    const [loading,    setLoading]    = useState(true);

    useEffect(() => {
        if (!token) return;
        api.get("/api/doctors/me/profile", token)
            .then(data => {
                setRawProfile(data);
                setProfile(toFormShape(data));
            })
            .catch(() => toast.error("Failed to load profile"))
            .finally(() => setLoading(false));
    }, [token]);

    const handleSave = async () => {
        setSaving(true);
        try {
            // Update name on the User model
            if (profile.name !== rawProfile?.user_id?.name) {
                await api.patch("/api/auth/me", { name: profile.name }, token);
            }
            // Update doctor profile fields
            const updated = await api.patch("/api/doctors/me/profile", {
                specialty:        profile.specialization,
                sub_specialty:    profile.department,
                hospital_clinic:  profile.hospital,
                experience_years: Number(profile.experience) || 0,
                contact:          { phone: profile.phone },
            }, token);
            setRawProfile(updated);
            setProfile(toFormShape(updated));
            toast.success("Profile updated successfully!");
            setIsEditing(false);
        } catch (err) {
            toast.error(err.message || "Failed to save profile");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-gray-400">Loading profile…</div>;
    if (!profile) return null;

    return (
        <div className="space-y-8">
            <div>
                <p className="text-gray-500 mt-2">
                    Manage your personal information and account settings.
                </p>
            </div>

            <DoctorProfileCard doctor={profile} />

            <PersonalInfo
                profile={profile}
                setProfile={setProfile}
                isEditing={isEditing}
            />

            <div className="flex justify-end gap-4">
                {!isEditing ? (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold"
                    >
                        Edit Profile
                    </button>
                ) : (
                    <>
                        <button
                            onClick={() => { setProfile(toFormShape(rawProfile)); setIsEditing(false); }}
                            className="bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 px-6 py-3 rounded-xl font-semibold"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-semibold"
                        >
                            {saving ? "Saving…" : "Save Changes"}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
