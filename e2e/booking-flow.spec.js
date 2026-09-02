import { test, expect } from "@playwright/test";

test.describe("Barber Booking System - End-to-End User Journey", () => {
  test("User navigates from landing page, selects barber, picks date/time, and fills customer details", async ({
    page,
  }) => {
    // Mock available slots API
    await page.route("**/api/available-slots*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          slots: [
            { time: "10:00", available: true },
            { time: "10:20", available: false },
            { time: "14:00", available: true },
          ],
          barberId: "imran",
          date: "2026-05-18",
        }),
      });
    });

    // Mock create-setup-intent API for payment step
    await page.route("**/api/create-setup-intent*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          clientSecret: "seti_mock_secret_123",
          customerId: "cus_mock_123",
          savedCard: null,
        }),
      });
    });

    // 1. Visit homepage
    await page.goto("/");
    await expect(page).toHaveTitle(/Anees Hairdressers/i);

    // Verify both barbers are displayed
    await expect(page.locator("text=Imran (Anees)").first()).toBeVisible();
    await expect(page.locator("text=Ali").first()).toBeVisible();

    // 2. Select Imran
    const bookImranLink = page.locator("#book-imran");
    await bookImranLink.click();

    // 3. Verify on /booking/imran wizard
    await expect(page).toHaveURL(/\/booking\/imran/);
    await expect(page.locator("text=Pick a Date")).toBeVisible();

    // 4. Click the first available date
    const availableDateBtn = page
      .locator("button[id^='date-']:not([disabled])")
      .first();
    await expect(availableDateBtn).toBeVisible();
    await availableDateBtn.click();

    // 5. Verify auto-advances to Step 2: Pick a Time
    await expect(page.locator("text=Pick a Time")).toBeVisible({ timeout: 5000 });

    // Verify unavailable slot is disabled
    const disabledSlot = page.locator("#slot-10\\:20");
    await expect(disabledSlot).toBeDisabled();

    // Click available slot (10:00 AM)
    const availableSlot = page.locator("#slot-10\\:00");
    await expect(availableSlot).toBeEnabled();
    await availableSlot.click();

    // 6. Verify auto-advances to Step 3: Your Details
    await expect(page.locator("text=Your Details")).toBeVisible({ timeout: 5000 });

    // Fill customer form
    await page.fill("#customer-name", "John Smith");
    await page.fill("#customer-email", "john@example.com");
    await page.fill("#customer-phone", "07123456789");

    // Click continue to payment
    await page.click("#submit-details");

    // 7. Verify advances to Step 4 (Card payment step)
    await expect(page.locator("text=Secure Your Booking")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=Add a card for no-show protection")).toBeVisible();
  });

  test("Manage Appointment page handles invalid links with error UI and back button", async ({
    page,
  }) => {
    // Mock the manage appointment API to return 404
    await page.route("**/api/manage-appointment*", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Appointment not found" }),
      });
    });

    await page.goto("/manage/nonexistent_id?token=invalid_token");

    await expect(page.locator("text=Unable to Load Appointment")).toBeVisible({
      timeout: 5000,
    });
    const backHomeBtn = page.locator("#manage-error-home");
    await expect(backHomeBtn).toBeVisible();
    await backHomeBtn.click();
    await expect(page).toHaveURL("/");
  });
});
