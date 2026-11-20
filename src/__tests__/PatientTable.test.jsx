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

function mountTable(props = {}, data = appointments) {
  api.get.mockResolvedValue(data);
  const defaults = { search: "", statusFilter: "All", currentPage: 1, setCurrentPage: vi.fn() };
  return renderWithProviders(
    <PatientTable {...defaults} {...props} />,
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

  test("statusFilter 'Ongoing' asks the API for confirmed appointments", async () => {
    mountTable({ statusFilter: "Ongoing" });
    await screen.findByText("Alice Smith");
    expect(api.get).toHaveBeenCalledWith("/api/appointments/doctor?status=confirmed", TOKEN);
  });

  test("statusFilter 'Completed' asks the API for completed appointments", async () => {
    mountTable({ statusFilter: "Completed" });
    await screen.findByText("Alice Smith");
    expect(api.get).toHaveBeenCalledWith("/api/appointments/doctor?status=completed", TOKEN);
  });

  test("shows the API error message when loading fails", async () => {
    api.get.mockRejectedValueOnce(new Error("Server unavailable"));
    renderWithProviders(
      <PatientTable search="" statusFilter="All" currentPage={1} setCurrentPage={vi.fn()} />,
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
