import { useState } from "react";
import toast from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { updateProfile } from "../features/doctor/doctorSlice";

import DoctorProfileCard from "../components/Profile/DoctorProfileCard";
import PersonalInfo from "../components/Profile/PersonalInfo";

export default function Profile() {

    const dispatch = useDispatch();

    const doctor = useSelector(
        (state) => state.doctor.profile
    );

    const [profile, setProfile] = useState(doctor);

    const [isEditing, setIsEditing] = useState(false);

    const handleSave = () => {

        dispatch(updateProfile(profile));

        toast.success("Profile updated successfully!");

        setIsEditing(false);

    };

    return (

        <div className="space-y-8">

            {/* Header */}

            <div>

                {/* <h1 className="text-3xl font-bold text-slate-800">
                    Profile
                </h1> */}

                <p className="text-gray-500 mt-2">
                    Manage your personal information and account settings.
                </p>

            </div>

            {/* Profile Card */}

            <DoctorProfileCard doctor={profile} />

            {/* Personal Information */}

            <PersonalInfo
                profile={profile}
                setProfile={setProfile}
                isEditing={isEditing}
            />

            {/* Buttons */}

            <div className="flex justify-end gap-4">

                {!isEditing ? (

                    <button
                        onClick={() => setIsEditing(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold"
                    >
                        Edit Profile
                    </button>

                ) : (

                    <button
                        onClick={handleSave}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold"
                    >
                        Save Changes
                    </button>

                )}

            </div>

        </div>

    );

}