import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CaseOverview from "../components/Dashboard/CaseOverview";

vi.mock("../utils/api", () => ({ api: { get: vi.fn() } }));
import { api } from "../utils/api";

function overview({ thisTreated = 3, lastTreated = 1, change = 200 } = {}) {
    return {
        status: {
            total: 8,
            completed: { count: 5, percent: 62.5 },
            ongoing:   { count: 2, percent: 25 },
            pending:   { count: 1, percent: 12.5 },
        },
        monthly: {
            this_month: { month: "2026-11", label: "November 2026", patients_treated: thisTreated, completed: 4, pending: 1, ongoing: 1 },
            last_month: { month: "2026-10", label: "October 2026",  patients_treated: lastTreated, completed: 1, pending: 0, ongoing: 1 },
            change: { patients_treated: change, completed: 300, pending: null, ongoing: 0 },
        },
    };
}

beforeEach(() => vi.clearAllMocks());

describe("CaseOverview", () => {
    test("loads this doctor's overview", async () => {
        api.get.mockResolvedValue(overview());
        render(<CaseOverview doctorId="doc1" token="tok" />);
        await screen.findByText("Case Status");
        expect(api.get).toHaveBeenCalledWith("/api/doctors/doc1/stats/overview", "tok");
    });

    test("status legend shows count and percentage for every state", async () => {
        api.get.mockResolvedValue(overview());
        render(<CaseOverview doctorId="doc1" token="tok" />);
        await screen.findByText("Case Status");
        expect(screen.getByText("62.5%")).toBeInTheDocument();
        expect(screen.getByText("25%")).toBeInTheDocument();
        expect(screen.getByText("12.5%")).toBeInTheDocument();
        expect(screen.getByText("8")).toBeInTheDocument(); // total in the donut hole
    });

    test.each([
        [{ thisTreated: 3, lastTreated: 1, change: 200 }, "+200% more patients", "3 this month vs 1 in October"],
        [{ thisTreated: 1, lastTreated: 4, change: -75 }, "75% fewer patients", "1 this month vs 4 in October"],
        [{ thisTreated: 2, lastTreated: 2, change: 0 },   "Same as last month", "2 this month vs 2 in October"],
        [{ thisTreated: 2, lastTreated: 0, change: null }, "2 patients treated", "None in October — a fresh start this month"],
    ])("summary card %o", async (args, headline, detail) => {
        api.get.mockResolvedValue(overview(args));
        render(<CaseOverview doctorId="doc1" token="tok" />);
        expect(await screen.findByText(headline)).toBeInTheDocument();
        expect(screen.getByText(detail)).toBeInTheDocument();
    });

    test("comparison has a two-series legend and a table view", async () => {
        const user = userEvent.setup();
        api.get.mockResolvedValue(overview());
        render(<CaseOverview doctorId="doc1" token="tok" />);
        await screen.findByText("This Month vs Last Month");
        expect(screen.getByText("October 2026")).toBeInTheDocument();
        expect(screen.getByText("November 2026 (so far)")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Show as table" }));
        const rows = screen.getAllByRole("row");
        expect(rows).toHaveLength(5); // header + 4 metrics
        expect(rows[2]).toHaveTextContent(/Completed\s*1\s*4/);
    });

    test("shows API errors", async () => {
        api.get.mockRejectedValue(new Error("Access denied"));
        render(<CaseOverview doctorId="doc1" token="tok" />);
        expect(await screen.findByText("Access denied")).toBeInTheDocument();
    });
});
