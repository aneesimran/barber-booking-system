// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TimeSlotPicker from "@/components/booking/TimeSlotPicker";

describe("TimeSlotPicker Component", () => {
  const mockDate = new Date(2026, 4, 18); // Monday May 18, 2026
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders loading state initially while fetching slots", () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // pending promise
    const { container } = render(
      <TimeSlotPicker
        barberId="imran"
        selectedDate={mockDate}
        selectedTime={null}
        onSelectTime={vi.fn()}
      />
    );

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders error message if API fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server error" }),
    });

    render(
      <TimeSlotPicker
        barberId="imran"
        selectedDate={mockDate}
        selectedTime={null}
        onSelectTime={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/could not load available times/i)
      ).toBeInTheDocument();
    });
  });

  it("renders empty state message when slots array is empty", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ slots: [] }),
    });

    render(
      <TimeSlotPicker
        barberId="imran"
        selectedDate={mockDate}
        selectedTime={null}
        onSelectTime={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/no available slots for this day/i)
      ).toBeInTheDocument();
    });
  });

  it("renders morning and afternoon slots, disallowing clicks on unavailable slots", async () => {
    const mockSlots = [
      { time: "10:00", available: true },
      { time: "10:20", available: false }, // Booked / Blocked
      { time: "14:00", available: true },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ slots: mockSlots }),
    });

    const handleSelectTime = vi.fn();

    render(
      <TimeSlotPicker
        barberId="imran"
        selectedDate={mockDate}
        selectedTime="14:00"
        onSelectTime={handleSelectTime}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Morning")).toBeInTheDocument();
      expect(screen.getByText("Afternoon")).toBeInTheDocument();
    });

    // 10:00 AM (available)
    const slot1000 = screen.getByRole("button", { name: "10:00 AM" });
    expect(slot1000).not.toBeDisabled();
    fireEvent.click(slot1000);
    expect(handleSelectTime).toHaveBeenCalledWith("10:00");

    // 10:20 AM (unavailable)
    const slot1020 = screen.getByRole("button", { name: "10:20 AM" });
    expect(slot1020).toBeDisabled();
    fireEvent.click(slot1020);
    // Should NOT trigger callback
    expect(handleSelectTime).not.toHaveBeenCalledWith("10:20");

    // 2:00 PM (selected)
    const slot1400 = screen.getByRole("button", { name: "2:00 PM" });
    expect(slot1400.className).toContain("bg-[var(--gold)]");
  });
});
