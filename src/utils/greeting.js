// "Good morning/afternoon/evening" from the viewer's local clock.
export function greetingFor(date = new Date()) {
    const hour = date.getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
}

// Names may already be saved as "Dr. Sara Ahmed" — don't print "Dr. Dr.".
export function doctorDisplayName(name) {
    const clean = (name || "").replace(/^\s*dr\.?\s+/i, "").trim();
    return clean ? `Dr. ${clean}` : "Doctor";
}
