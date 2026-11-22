import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils";

vi.mock("../utils/api", () => ({ api: { get: vi.fn(), patch: vi.fn() } }));
import { api } from "../utils/api";
import Notifications from "../pages/Notifications";
import Reports from "../pages/admin/Reports";
import { timeAgo } from "../utils/notificationTypes";

const auth = { auth: { token: "tok", user: { role: "doctor" } } };
const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();

const notifications = [
    { _id: "n1", type: "emergency_case", title: "Urgent case: Sara", message: "Chest pain", link: "/cases/a1", read: false, created_at: iso(2) },
    { _id: "n2", type: "patient_message", title: "New message from Ali", message: "", link: "/cases/a2", read: false, created_at: iso(90) },
    { _id: "n3", type: "test_upload", title: "Ali uploaded a test result", message: "Test: CBC", link: "/cases/a2", read: true, created_at: iso(3000) },
];

beforeEach(() => vi.clearAllMocks());

describe("doctor Notifications page", () => {
    test("loads real notifications, shows unread count and labels", async () => {
        api.get.mockResolvedValue({ results: notifications, unread_count: 2 });
        renderWithProviders(<Notifications />, { initialState: auth });
        expect(await screen.findByText("Urgent case: Sara")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/api/notifications?limit=100", "tok");
        expect(screen.getByRole("button", { name: "Mark all as read (2)" })).toBeEnabled();
        expect(screen.getByText("Urgent", { selector: "p" })).toBeInTheDocument();
    });

    test("filter tabs: unread and by type", async () => {
        const user = userEvent.setup();
        api.get.mockResolvedValue({ results: notifications, unread_count: 2 });
        renderWithProviders(<Notifications />, { initialState: auth });
        await screen.findByText("Urgent case: Sara");

        await user.click(screen.getByRole("tab", { name: "Unread (2)" }));
        expect(screen.queryByText("Ali uploaded a test result")).not.toBeInTheDocument();

        await user.click(screen.getByRole("tab", { name: "Test result" }));
        expect(screen.getByText("Ali uploaded a test result")).toBeInTheDocument();
        expect(screen.queryByText("Urgent case: Sara")).not.toBeInTheDocument();
    });

    test("mark all as read updates immediately and calls the API", async () => {
        const user = userEvent.setup();
        api.get.mockResolvedValue({ results: notifications, unread_count: 2 });
        api.patch.mockResolvedValue({ updated: 2 });
        renderWithProviders(<Notifications />, { initialState: auth });
        await user.click(await screen.findByRole("button", { name: "Mark all as read (2)" }));
        expect(api.patch).toHaveBeenCalledWith("/api/notifications/read-all", {}, "tok");
        expect(screen.getByRole("button", { name: "Mark all as read (0)" })).toBeDisabled();
    });

    test("empty state", async () => {
        api.get.mockResolvedValue({ results: [], unread_count: 0 });
        renderWithProviders(<Notifications />, { initialState: auth });
        expect(await screen.findByText("No notifications yet.")).toBeInTheDocument();
    });

    test("timeAgo", () => {
        expect(timeAgo(iso(0), now)).toBe("just now");
        expect(timeAgo(iso(5), now)).toBe("5 min ago");
        expect(timeAgo(iso(180), now)).toBe("3 h ago");
        expect(timeAgo(iso(60 * 48), now)).toBe("2 days ago");
    });
});

const reports = (range) => ({
    range,
    consultations: { total: 14, patients: 5, shared_with_doctor: 5, shared_percent: 35.7, emergency_flags: 1, emergency_percent: 7.1 },
    interviews: { completed: 14, abandoned: 2, failed: 0, in_progress: 0 },
    top_conditions: [{ name: "Back Pain", count: 4 }, { name: "Acute viral pharyngitis", count: 2 }],
    top_specialties: [{ name: "General Physician", count: 5 }],
    monthly: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, label: `M${i + 1}`, consultations: i, new_patients: 1 })),
});

describe("admin Reports page", () => {
    test("shows real KPIs, ranked conditions and specialists", async () => {
        api.get.mockImplementation((url) => Promise.resolve(reports(new URL(url, "http://x").searchParams.get("range"))));
        renderWithProviders(<Reports />, { initialState: { auth: { token: "tok", user: { role: "admin" } } } });
        expect(await screen.findByText("35.7%")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/api/stats/reports?range=90d", "tok");
        expect(screen.getByText("from 5 patients")).toBeInTheDocument();

        const conditions = screen.getByRole("heading", { name: /Top Suspected Conditions/ }).closest("section");
        const items = within(conditions).getAllByRole("listitem");
        expect(items[0]).toHaveTextContent("Back Pain");
        expect(items[0]).toHaveTextContent("4");
    });

    test("changing the range refetches", async () => {
        const user = userEvent.setup();
        api.get.mockImplementation((url) => Promise.resolve(reports(new URL(url, "http://x").searchParams.get("range"))));
        renderWithProviders(<Reports />, { initialState: { auth: { token: "tok", user: { role: "admin" } } } });
        await screen.findByText("35.7%");
        await user.click(screen.getByRole("radio", { name: "All time" }));
        expect(api.get).toHaveBeenLastCalledWith("/api/stats/reports?range=all", "tok");
    });
});
