import { describe, test, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PatientTable from "../components/Patients/PatientTable";
import { renderWithProviders } from "../test-utils";

// PatientTable loads the doctor's appointments from the API (it no longer reads fake Redux data)
vi.mock("../utils/api", () => ({ api: { get: vi.fn() } }));
import { api } from "../utils/api";

const TOKEN = "fake-token";

// Appointment fixtures — shape matches GET /api/appointments/doctor (patient_id is populated)
const slot = { date: "2026-10-20T00:00:00Z", start_time: "09:00", end_time: "09:30" };
const appointments = [
  { _id: "a1", status: "confirmed", requested_slot: slot, patient_id: { name: "Alice Smith",   gender: "female", dob: "1996-01-01" } },
  { _id: "a2", status: "completed", requested_slot: slot, patient_id: { name: "Bob Jones",     gender: "male",   dob: "1981-01-01" } },
  { _id: "a3", status: "cancelled", requested_slot: slot, patient_id: { name: "Carol Winters", gender: "female", dob: "1966-01-01" } },
  { _id: "a4", status: "no_show",   requested_slot: slot, patient_id: { name: "Dave Kim",      gender: "male",   dob: "2001-01-01" } },
  { _id: "a5", status: "confirmed", requested_slot: null, patient_id: { name: "Eve Ali",       gender: "female", dob: null } },
  { _id: "a6", status: "completed", requested_slot: slot, patient_id: { name: "Frank Hassan",  gender: "male",   dob: "1986-01-01" } },
];

const preloadedState = { auth: { token: TOKEN, user: { role: "doctor" } } };

const NO_FILTERS = { status: "All", gender: "", dateFrom: "", dateTo: "", needsAttention: false, sort: "newest" };

function mountTable(props = {}, data = appointments) {
  api.get.mockResolvedValue(data);
  const { filters, ...rest } = props;
  const defaults = { search: "", currentPage: 1, setCurrentPage: vi.fn() };
  return renderWithProviders(
    <PatientTable {...defaults} filters={{ ...NO_FILTERS, ...filters }} {...rest} />,
    { initialState: preloadedState }
  );
}

beforeEach(() => vi.clearAllMocks());

describe("PatientTable — loading data", () => {
  test("fetches the doctor's appointments with the auth token", async () => {
    mountTable();
    await screen.findByText("Alice Smith");
    expect(api.get).toHaveBeenCalledWith("/api/appointments/doctor", TOKEN);
  });

  test("status filter is applied client-side — API is called without a status", async () => {
    mountTable({ filters: { status: "Completed" } });
    await screen.findByText("Bob Jones");
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/api/appointments/doctor", TOKEN);
  });

  test("shows the API error message when loading fails", async () => {
    api.get.mockRejectedValueOnce(new Error("Server unavailable"));
    renderWithProviders(
      <PatientTable search="" currentPage={1} setCurrentPage={vi.fn()} />,
      { initialState: preloadedState }
    );
    expect(await screen.findByText("Server unavailable")).toBeInTheDocument();
  });

  test("shows an empty state when the doctor has no patients", async () => {
    mountTable({}, []);
    expect(await screen.findByText("No patients found.")).toBeInTheDocument();
  });
});

describe("PatientTable — filtering and rendering", () => {
  test("renders the first 5 of 6 patients on page 1", async () => {
    mountTable();
    expect(await screen.findByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Eve Ali")).toBeInTheDocument();
    expect(screen.queryByText("Frank Hassan")).not.toBeInTheDocument();
  });

  test("search by name narrows the list", async () => {
    mountTable({ search: "Alice" });
    expect(await screen.findByText("Alice Smith")).toBeInTheDocument();
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
  });

  test("search is case-insensitive", async () => {
    mountTable({ search: "alice" });
    expect(await screen.findByText("Alice Smith")).toBeInTheDocument();
  });

  test("status 'confirmed' shows a blue 'Ongoing' badge", async () => {
    mountTable({ search: "Alice" });
    expect((await screen.findByText("Ongoing")).className).toMatch(/blue/);
  });

  test("status 'completed' shows a green 'Completed' badge", async () => {
    mountTable({ search: "Bob" });
    expect((await screen.findByText("Completed")).className).toMatch(/green/);
  });

  test("status 'cancelled' shows a red 'Cancelled' badge", async () => {
    mountTable({ search: "Carol" });
    expect((await screen.findByText("Cancelled")).className).toMatch(/red/);
  });

  test("slot is shown as date · start–end", async () => {
    mountTable({ search: "Alice" });
    expect(await screen.findByText(/09:00–09:30/)).toBeInTheDocument();
  });

  test("missing date of birth and slot show an em-dash", async () => {
    mountTable({ search: "Eve" });
    await screen.findByText("Eve Ali");
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});

describe("PatientTable — case filters", () => {
  test("status 'Ongoing' shows only confirmed cases", async () => {
    mountTable({ filters: { status: "Ongoing" } });
    expect(await screen.findByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Eve Ali")).toBeInTheDocument();
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
  });

  test("status 'No Show' shows only no-show cases", async () => {
    mountTable({ filters: { status: "No Show" } });
    expect(await screen.findByText("Dave Kim")).toBeInTheDocument();
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
  });

  test("gender filter", async () => {
    mountTable({ filters: { gender: "male" } });
    expect(await screen.findByText("Bob Jones")).toBeInTheDocument();
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
  });

  test("slot date range", async () => {
    const data = [
      { _id: "d1", status: "confirmed", requested_slot: { date: "2026-01-05", start_time: "09:00", end_time: "09:30" }, patient_id: { name: "January Pt" } },
      { _id: "d2", status: "confirmed", requested_slot: { date: "2026-03-05", start_time: "09:00", end_time: "09:30" }, patient_id: { name: "March Pt" } },
    ];
    mountTable({ filters: { dateFrom: "2026-02-01", dateTo: "2026-03-31" } }, data);
    expect(await screen.findByText("March Pt")).toBeInTheDocument();
    expect(screen.queryByText("January Pt")).not.toBeInTheDocument();
  });

  test("needs attention shows cases with unread queries or new uploads, with a label", async () => {
    const data = [
      { ...appointments[0], has_unread_patient_query: true },
      { ...appointments[1], has_new_test_upload: true },
      appointments[2],
    ];
    mountTable({ filters: { needsAttention: true } }, data);
    expect(await screen.findByText("New query")).toBeInTheDocument();
    expect(screen.getByText("New test upload")).toBeInTheDocument();
    expect(screen.queryByText("Carol Winters")).not.toBeInTheDocument();
  });

  test("sort by patient name", async () => {
    mountTable({ filters: { sort: "name" } }, [appointments[3], appointments[0]]);
    await screen.findByText("Alice Smith");
    const names = screen.getAllByText(/Alice Smith|Dave Kim/).map(el => el.textContent);
    expect(names).toEqual(["Alice Smith", "Dave Kim"]);
  });

  test("search also matches patient email", async () => {
    const data = [{ ...appointments[0], patient_id: { ...appointments[0].patient_id, contact: { email: "alice@mail.com" } } }, appointments[1]];
    mountTable({ search: "alice@mail" }, data);
    expect(await screen.findByText("Alice Smith")).toBeInTheDocument();
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
  });
});

describe("PatientTable — pagination", () => {
  test("Previous button disabled on page 1", async () => {
    mountTable({ currentPage: 1 });
    expect(await screen.findByRole("button", { name: "Previous" })).toBeDisabled();
  });

  test("Next button disabled on last page", async () => {
    // 6 patients / 5 per page = 2 pages; page 2 is last
    mountTable({ currentPage: 2 });
    expect(await screen.findByRole("button", { name: "Next" })).toBeDisabled();
  });

  test("clicking Next moves to page + 1", async () => {
    const user = userEvent.setup();
    const setCurrentPage = vi.fn();
    mountTable({ currentPage: 1, setCurrentPage });
    await user.click(await screen.findByRole("button", { name: "Next" }));
    // setCurrentPage receives an updater function
    const updater = setCurrentPage.mock.calls[0][0];
    expect(updater(1)).toBe(2);
  });

  test("clicking Previous moves to page - 1", async () => {
    const user = userEvent.setup();
    const setCurrentPage = vi.fn();
    mountTable({ currentPage: 2, setCurrentPage });
    await user.click(await screen.findByRole("button", { name: "Previous" }));
    const updater = setCurrentPage.mock.calls[0][0];
    expect(updater(2)).toBe(1);
  });

  test("page number buttons are rendered and the current one is blue", async () => {
    mountTable({ currentPage: 1 });
    expect((await screen.findByRole("button", { name: "1" })).className).toMatch(/bg-blue-600/);
    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
  });

  test("clicking a page number calls setCurrentPage", async () => {
    const user = userEvent.setup();
    const setCurrentPage = vi.fn();
    mountTable({ currentPage: 1, setCurrentPage });
    await user.click(await screen.findByRole("button", { name: "2" }));
    expect(setCurrentPage).toHaveBeenCalledWith(2);
  });

  test("single-page result disables both Previous and Next", async () => {
    mountTable({ search: "Alice", currentPage: 1 });
    expect(await screen.findByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
