import { useState } from "react";
import { Star } from "lucide-react";

// Read-only when `onChange` is not given; interactive (hover + click) otherwise.
export default function StarRating({ value = 0, onChange, size = 22, label = "Rating" }) {
    const [hover, setHover] = useState(0);
    const interactive = typeof onChange === "function";
    const shown = hover || value;

    return (
        <div
            className="flex items-center gap-1"
            role={interactive ? "radiogroup" : "img"}
            aria-label={interactive ? label : `${label}: ${value} out of 5`}
            onMouseLeave={() => setHover(0)}
        >
            {[1, 2, 3, 4, 5].map((n) => {
                const filled = n <= Math.round(shown);
                const icon = (
                    <Star
                        size={size}
                        className={filled ? "text-amber-400" : "text-gray-300"}
                        fill={filled ? "currentColor" : "none"}
                    />
                );
                return interactive ? (
                    <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={value === n}
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        onMouseEnter={() => setHover(n)}
                        onClick={() => onChange(n)}
                        className="p-0.5 rounded hover:scale-110 transition"
                    >
                        {icon}
                    </button>
                ) : (
                    <span key={n}>{icon}</span>
                );
            })}
        </div>
    );
}

// Compact "★ 4.6 (12)" badge; renders "No ratings yet" when count is 0.
export function RatingBadge({ rating, className = "" }) {
    if (!rating?.count) {
        return <span className={`text-xs text-gray-400 ${className}`}>No ratings yet</span>;
    }
    return (
        <span className={`inline-flex items-center gap-1 text-sm font-semibold text-slate-700 ${className}`}>
            <Star size={14} className="text-amber-400" fill="currentColor" />
            {rating.average.toFixed(1)}
            <span className="text-gray-400 font-normal">({rating.count})</span>
        </span>
    );
}
