// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import DatePicker from "@/components/booking/DatePicker";

// Mock Firebase Firestore doc/getDoc
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    doc: vi.fn(),
    getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  };
});

describe("DatePicker Component", () => {
  beforeEach(() => {
    // Freeze time at Monday May 18, 2026
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 18, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders 14 days booking window starting from today", () => {
    const { container } = render(
      <DatePicker barberId="imran" selectedDate={null} onSelectDate={vi.fn()} />
    );

    const dateButtons = container.querySelectorAll("button[id^='date-']");
    expect(dateButtons.length).toBe(14);
  });

  it("disables Tuesdays and Sundays for Imran", () => {
    const handleSelectDate = vi.fn();
    const { container } = render(
      <DatePicker barberId="imran" selectedDate={null} onSelectDate={handleSelectDate} />
    );

    // May 18, 2026 is a Monday (working)
    const monBtn = container.querySelector("#date-2026-05-18");
    expect(monBtn).not.toBeDisabled();
    fireEvent.click(monBtn);
    expect(handleSelectDate).toHaveBeenCalled();

    // May 19, 2026 is a Tuesday (Imran off -> disabled)
    const tueBtn = container.querySelector("#date-2026-05-19");
    expect(tueBtn).toBeDisabled();

    // May 24, 2026 is a Sunday (shop closed -> disabled)
    const sunBtn = container.querySelector("#date-2026-05-24");
    expect(sunBtn).toBeDisabled();
  });

  it("disables Wednesdays and enables Tuesdays for Ali", () => {
    const { container } = render(
      <DatePicker barberId="ali" selectedDate={null} onSelectDate={vi.fn()} />
    );

    // May 19 is Tuesday (Ali works -> enabled)
    const tueBtn = container.querySelector("#date-2026-05-19");
    expect(tueBtn).not.toBeDisabled();

    // May 20 is Wednesday (Ali off -> disabled)
    const wedBtn = container.querySelector("#date-2026-05-20");
    expect(wedBtn).toBeDisabled();
  });

  it("disables Tuesdays and enables Sundays for Mudni", () => {
    const handleSelectDate = vi.fn();
    const { container } = render(
      <DatePicker barberId="mudni" selectedDate={null} onSelectDate={handleSelectDate} />
    );

    // May 18 is Monday (Mudni works -> enabled)
    const monBtn = container.querySelector("#date-2026-05-18");
    expect(monBtn).not.toBeDisabled();
    fireEvent.click(monBtn);
    expect(handleSelectDate).toHaveBeenCalled();

    // May 19 is Tuesday (Mudni off -> disabled)
    const tueBtn = container.querySelector("#date-2026-05-19");
    expect(tueBtn).toBeDisabled();

    // May 24 is Sunday (Mudni works 10am-4pm -> enabled)
    const sunBtn = container.querySelector("#date-2026-05-24");
    expect(sunBtn).not.toBeDisabled();
  });

  it("highlights the currently selected date", () => {
    const selected = new Date(2026, 4, 18);
    const { container } = render(
      <DatePicker barberId="imran" selectedDate={selected} onSelectDate={vi.fn()} />
    );

    const monBtn = container.querySelector("#date-2026-05-18");
    expect(monBtn.className).toContain("bg-[var(--gold)]");
  });
});
