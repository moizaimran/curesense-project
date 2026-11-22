import { describe, test, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DoctorRatingsTable from "../components/admin/Dashboard/DoctorRatingsTable";

const doctors = [
    { _id: "a", name: "Dr Ayesha", specialty: "Dermatology", city: "Lahore",  rating: { average: 4.8, count: 10 }, patients_treated: 3,  revenue: 6000, consultation_fee: 2000 },
    { _id: "b", name: "Dr Bilal",  specialty: "Cardiology",  city: "Karachi", rating: { average: 3.1, count: 4 },  patients_treated: 12, revenue: 9000, consultation_fee: 1500 },
    { _id: "c", name: "Dr Chand",  specialty: "Neurology",   city: "Lahore",  rating: { average: 0,   count: 0 },  patients_treated: 0,  revenue: 0,    consultation_fee: 0 },
];

function names() {
    const table = screen.getAllByRole("table")[0];
    return within(table).getAllByRole("row").slice(1).map((r) => within(r).getByText(/^Dr /).textContent);
}

function mount(props = {}) {
    const onSelectDoctor = vi.fn();
    render(<DoctorRatingsTable doctors={doctors} topPerformers={["b", "a"]} selectedId="" onSelectDoctor={onSelectDoctor} {...props} />);
    return { onSelectDoctor };
}

describe("DoctorRatingsTable", () => {
    test("default sort: highest rated first", () => {
        mount();
        expect(names()).toEqual(["Dr Ayesha", "Dr Bilal", "Dr Chand"]);
    });

    test("lowest rated puts unrated doctors last", async () => {
        const user = userEvent.setup();
        mount();
        await user.selectOptions(screen.getByLabelText("Sort doctors"), "rating_asc");
        expect(names()).toEqual(["Dr Bilal", "Dr Ayesha", "Dr Chand"]);
    });

    test("rating column header toggles highest/lowest", async () => {
        const user = userEvent.setup();
        mount();
        await user.click(screen.getByRole("button", { name: /avg rating/i }));
        expect(names()[0]).toBe("Dr Bilal");
    });

    test("search filters by name, specialty or city", async () => {
        const user = userEvent.setup();
        mount();
        await user.type(screen.getByPlaceholderText(/search doctor/i), "karachi");
        expect(names()).toEqual(["Dr Bilal"]);
    });

    test("shows reviews count and 'No ratings' for unrated doctors", () => {
        mount();
        expect(screen.getByText("No ratings")).toBeInTheDocument();
        expect(screen.getByText("10")).toBeInTheDocument();
    });

    test("View charts filters the dashboard to that doctor; selected row offers Show all", async () => {
        const user = userEvent.setup();
        const { onSelectDoctor } = mount();
        await user.click(screen.getAllByRole("button", { name: "View charts" })[0]);
        expect(onSelectDoctor).toHaveBeenCalledWith("a");
    });

    test("top performers listed in server order", () => {
        mount();
        const list = screen.getByRole("list");
        expect(within(list).getAllByRole("listitem").map((li) => within(li).getByText(/^Dr /).textContent)).toEqual(["Dr Bilal", "Dr Ayesha"]);
    });
});
