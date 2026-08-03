import { useState } from "react";


const PasswordInput = ({
    label = "Password",
    placeholder = "Enter your password",
    value,
    onChange
}) => {

    const [showPassword, setShowPassword] = useState(false);


    return (
        <div className="mb-4">

            <label className="block text-sm font-medium text-gray-700 mb-2">
                {label}
            </label>


            <div className="relative">

                <input
                    type={showPassword ? "text" : "password"}
                    placeholder={placeholder}
                    value={value}
                    onChange={onChange}
                    className="
                        w-full
                        px-4
                        py-3
                        pr-12
                        border
                        border-gray-300
                        rounded-xl
                        outline-none
                        focus:ring-2
                        focus:ring-blue-500
                        focus:border-transparent
                    "
                />


                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="
                        absolute
                        right-4
                        top-1/2
                        -translate-y-1/2
                        text-gray-500
                        hover:text-blue-600
                    "
                >
                    {showPassword ? "Hide" : "Show"}
                </button>


            </div>

        </div>
    )
}


export default PasswordInput;