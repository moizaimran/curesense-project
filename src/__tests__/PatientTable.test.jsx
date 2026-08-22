import { describe, test, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PatientTable from "../components/Patients/PatientTable";
import { renderWithProviders } from "../test-utils";

// Minimal patient fixtures — shape must match what PatientTable renders
const patients = [
  { id: 1, name: "Alice Smith",   age: 30, gender: "Female", diagnosis: "Hypertension", severity: "High",   status: "Pending",  hasImage: true,  uploaded: "2026-01-01" },
  { id: 2, name: "Bob Jones",     age: 45, gender: "Male",   diagnosis: "Diabetes",     severity: "Medium", status: "Reviewed", hasImage: false, uploaded: "2026-01-02" },
  { id: 3, name: "Carol Winters", age: 60, gender: "Female", diagnosis: "Asthma",       severity: "Low",    status: "Pending",  hasImage: true,  uploaded: "2026-01-03" },
  { id: 4, name: "Dave Kim",      age: 25, gender: "Male",   diagnosis: "Flu",          severity: "Low",    status: "Reviewed", hasImage: false, uploaded: "2026-01-04" },
  { id: 5, name: "Eve Ali",       age: 55, gender: "Female", diagnosis: "Migraine",     severity: "High",   status: "Pending",  hasImage: true,  uploaded: "2026-01-05" },
  { id: 6, name: "Frank Hassan",  age: 40, gender: "Male",   diagnosis: "Back pain",    severity: "Medium", status: "Reviewed", hasImage: false, uploaded: "2026-01-06" },
];

const preloadedState = { patients: { patients } };

function mountTable(props = {}) {
  const defaults = { search: "", statusFilter: "All", currentPage: 1, setCurrentPage: vi.fn() };
  return renderWithProviders(
    <PatientTable {...defaults} {...props} />,
    { initialState: preloadedState }
  );
}

describe("PatientTable — filtering and rendering", () => {
  test("renders all patients on page 1 (first 5 of 6)", () => {
    mountTable();
    // Page 1 shows the first patientsPerPage (5) patients
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.queryByText("Frank Hassan")).not.toBeInTheDocument();
  });

  test("search by name narrows the list", () => {
    mountTable({ search: "Alice" });
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
  });

  test("search is case-insensitive", () => {
    mountTable({ search: "alice" });
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });

  test("statusFilter 'Pending' shows only Pending patients", () => {
    mountTable({ statusFilter: "Pending" });
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
  });

  test("statusFilter 'Reviewed' shows only Reviewed patients", () => {
    mountTable({ statusFilter: "Reviewed" });
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
  });

  test("statusFilter 'All' shows every patient (up to page size)", () => {
    mountTable({ statusFilter: "All" });
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  test("severity badge 'High' gets red styling", () => {
    mountTable({ search: "Alice" });
    const badge = screen.getByText("High");
    expect(badge.className).toMatch(/red/);
  });

  test("severity badge 'Medium' gets orange styling", () => {
    mountTable({ search: "Bob" });
    const badge = screen.getByText("Medium");
    expect(badge.className).toMatch(/orange/);
  });

  test("severity badge 'Low' gets green styling", () => {
    mountTable({ search: "Carol" });
    const badge = screen.getByText("Low");
    expect(badge.className).toMatch(/green/);
  });

  test("patient with hasImage shows 'Available'", () => {
    mountTable({ search: "Alice" });
    expect(screen.getByText(/Available/)).toBeInTheDocument();
  });

  test("patient without hasImage shows em-dash placeholder", () => {
    mountTable({ search: "Bob" });
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("PatientTable — pagination", () => {
  test("Previous button disabled on page 1", () => {
    mountTable({ currentPage: 1 });
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  test("Next button disabled on last page", () => {
    // 6 patients / 5 per page = 2 pages; page 2 is last
    mountTable({ currentPage: 2 });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  test("clicking Next calls setCurrentPage with page + 1", async () => {
    const user = userEvent.setup();
    const setCurrentPage = vi.fn();
    mountTable({ currentPage: 1, setCurrentPage });
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(setCurrentPage).toHaveBeenCalledWith(2);
  });

  test("clicking Previous calls setCurrentPage with page - 1", async () => {
    const user = userEvent.setup();
    const setCurrentPage = vi.fn();
    mountTable({ currentPage: 2, setCurrentPage });
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(setCurrentPage).toHaveBeenCalledWith(1);
  });

  test("page number buttons are rendered", () => {
    mountTable({ currentPage: 1 });
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
  });

  test("current page button has blue background class", () => {
    mountTable({ currentPage: 1 });
    expect(screen.getByRole("button", { name: "1" }).className).toMatch(/bg-blue-600/);
  });

  test("clicking a page number calls setCurrentPage", async () => {
    const user = userEvent.setup();
    const setCurrentPage = vi.fn();
    mountTable({ currentPage: 1, setCurrentPage });
    await user.click(screen.getByRole("button", { name: "2" }));
    expect(setCurrentPage).toHaveBeenCalledWith(2);
  });

  test("single-page result hides both navigation buttons (no Next/Prev needed)", () => {
    // With only one patient and 5 per page, there's only 1 page
    mountTable({ search: "Alice", currentPage: 1 });
    // Both buttons exist but Prev is disabled, Next is disabled
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
