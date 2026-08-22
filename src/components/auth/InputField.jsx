const InputField = ({ 
    label, 
    type = "text", 
    placeholder, 
    value,
    onChange ,name
}) => {

    return (
        <div className="mb-4">

            <label className="block text-sm font-medium text-gray-700 mb-2">
                {label}
            </label>

            <input
                type={type}
                name={name}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                className="
                    w-full 
                    px-4 
                    py-3
                    border 
                    border-gray-300
                    rounded-xl
                    outline-none
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-transparent
                    transition
                "
            />

        </div>
    )
}

export default InputField;