// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ManageAppointment from "@/components/manage/ManageAppointment";

describe("ManageAppointment Component", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders loading state initially while fetching appointment", () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // pending
    const { container } = render(
      <ManageAppointment appointmentId="appt_1" token="valid_token" />
    );
    expect(container.querySelector(".manage-loading-spinner")).toBeInTheDocument();
  });

  it("renders error state when appointment fails to load", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Appointment not found" }),
    });

    render(<ManageAppointment appointmentId="appt_1" token="invalid_token" />);

    await waitFor(() => {
      expect(screen.getByText(/unable to load appointment/i)).toBeInTheDocument();
    });
  });

  it("displays appointment details and enabled action buttons when canModify is true", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        appointment: {
          id: "appt_1",
          barberId: "imran",
          barberName: "Imran (Anees)",
          customerName: "Alice Smith",
          date: "2026-05-20",
          time: "14:00",
          duration: 20,
          status: "confirmed",
        },
        canModify: true,
        reason: null,
      }),
    });

    render(<ManageAppointment appointmentId="appt_1" token="valid_token" />);

    await waitFor(() => {
      expect(screen.getByText("Imran (Anees)")).toBeInTheDocument();
      expect(screen.getByText(/confirmed/i)).toBeInTheDocument();
    });

    const rescheduleBtn = screen.getByRole("button", { name: /reschedule/i });
    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });

    expect(rescheduleBtn).not.toBeDisabled();
    expect(cancelBtn).not.toBeDisabled();
  });

  it("disables modification buttons when canModify is false (e.g. less than 1 hour away)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        appointment: {
          id: "appt_1",
          barberId: "imran",
          barberName: "Imran (Anees)",
          customerName: "Alice Smith",
          date: "2026-05-20",
          time: "14:00",
          duration: 20,
          status: "confirmed",
        },
        canModify: false,
        reason: "Appointment is less than 1 hour away",
      }),
    });

    render(<ManageAppointment appointmentId="appt_1" token="valid_token" />);

    await waitFor(() => {
      expect(screen.getByText(/less than 1 hour away/i)).toBeInTheDocument();
    });

    const rescheduleBtn = screen.getByRole("button", { name: /reschedule/i });
    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });

    expect(rescheduleBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
  });

  it("handles cancellation confirmation modal and confirms cancellation", async () => {
    global.fetch = vi.fn((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/manage-appointment?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            appointment: {
              id: "appt_1",
              barberId: "imran",
              barberName: "Imran (Anees)",
              customerName: "Alice",
              date: "2026-05-20",
              time: "15:00",
              duration: 20,
              status: "confirmed",
            },
            canModify: true,
            reason: null,
          }),
        });
      }

      if (urlStr.includes("/api/manage-appointment/cancel")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<ManageAppointment appointmentId="appt_1" token="valid_token" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    });

    // 1. Click "Cancel" to open modal
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.getByText(/cancel appointment\?/i)).toBeInTheDocument();

    // 2. Click "Yes, Cancel"
    const confirmCancelBtn = screen.getByRole("button", { name: /yes, cancel/i });
    fireEvent.click(confirmCancelBtn);

    // 3. Verifies success state
    await waitFor(() => {
      expect(screen.getByText("Appointment Cancelled")).toBeInTheDocument();
    });
  });
});
