// Banner shown after a password-reset request: green on success, red on error.
export default function ResetStatus({ result }) {
    if (!result) return null;
    const cls = result.ok
        ? "bg-green-50 border-green-200 text-green-700"
        : "bg-red-50 border-red-200 text-red-700";
    return (
        <div role="status" className={`mb-4 p-3 border rounded-xl text-sm ${cls}`}>
            {result.message}
        </div>
    );
}
