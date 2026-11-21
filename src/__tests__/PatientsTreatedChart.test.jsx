import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PatientsTreatedChart from "../components/Dashboard/PatientsTreatedChart";

vi.mock("../utils/api", () => ({ api: { get: vi.fn() } }));
import { api } from "../utils/api";

function response(period, counts) {
    const buckets = counts.map((count, i) => ({ start: `2026-11-${String(10 + i).padStart(2, "0")}`, label: `L${i}`, count }));
    return { period, buckets, total: counts.reduce((a, b) => a + b, 0) };
}

beforeEach(() => vi.clearAllMocks());

describe("PatientsTreatedChart", () => {
    test("loads daily stats for this doctor and shows the total", async () => {
        api.get.mockResolvedValue(response("daily", [0, 1, 0, 2, 0, 0, 3]));
        render(<PatientsTreatedChart doctorId="doc1" token="tok" />);
        expect(await screen.findByText("6")).toBeInTheDocument();
        expect(screen.getByText(/last 7 days/)).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith("/api/doctors/doc1/stats/treated?period=daily", "tok");
    });

    test("switching to Weekly and Monthly requests that period", async () => {
        const user = userEvent.setup();
        api.get.mockImplementation((url) => {
            const p = new URL(url, "http://x").searchParams.get("period");
            return Promise.resolve(response(p, p === "weekly" ? [1, 1, 1, 1, 1, 1, 1, 1] : [2]));
        });
        render(<PatientsTreatedChart doctorId="doc1" token="tok" />);
        await screen.findByText(/last 7 days/);

        await user.click(screen.getByRole("radio", { name: "Weekly" }));
        expect(await screen.findByText(/last 8 weeks/)).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: "Weekly" })).toHaveAttribute("aria-checked", "true");

        await user.click(screen.getByRole("radio", { name: "Monthly" }));
        expect(await screen.findByText(/last 12 months/)).toBeInTheDocument();
        expect(api.get).toHaveBeenLastCalledWith("/api/doctors/doc1/stats/treated?period=monthly", "tok");
    });

    test("table view lists every bucket with its count", async () => {
        const user = userEvent.setup();
        api.get.mockResolvedValue(response("daily", [0, 1, 0, 2, 0, 0, 3]));
        render(<PatientsTreatedChart doctorId="doc1" token="tok" />);
        await screen.findByText(/last 7 days/);
        await user.click(screen.getByRole("button", { name: "Show as table" }));
        const rows = screen.getAllByRole("row");
        expect(rows).toHaveLength(8); // header + 7 days
        expect(rows[7]).toHaveTextContent("3");
    });

    test("empty state when no completed cases", async () => {
        api.get.mockResolvedValue(response("daily", [0, 0, 0, 0, 0, 0, 0]));
        render(<PatientsTreatedChart doctorId="doc1" token="tok" />);
        expect(await screen.findByText("No completed cases in the last 7 days.")).toBeInTheDocument();
    });

    test("shows API errors", async () => {
        api.get.mockRejectedValue(new Error("Access denied"));
        render(<PatientsTreatedChart doctorId="doc1" token="tok" />);
        expect(await screen.findByText("Access denied")).toBeInTheDocument();
    });
});
