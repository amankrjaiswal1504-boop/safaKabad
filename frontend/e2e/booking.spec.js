import { test, expect } from '@playwright/test';

// Main flow: a guest picks items, enters an address, chooses a slot, verifies
// their phone with an OTP, and books. Then they can track the pickup.
test('guest books a pickup with phone OTP and sees the tracking page', async ({ page }) => {
  const phone = `98${String(Date.now()).slice(-8)}`;

  await page.goto('/schedule-pickup');
  // First load of a cold dev server pre-bundles dependencies; allow time for it.
  await expect(page.getByRole('heading', { name: 'Book a pickup' })).toBeVisible({ timeout: 60_000 });

  // Step 1: items
  await page.getByRole('button', { name: /^Newspaper/ }).click();
  await page.getByRole('button', { name: /^Copper/ }).click();
  await expect(page.getByText('Your items')).toBeVisible();
  await expect(page.getByText(/Rs\. \d[\d,]* – Rs\. \d/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2: address. City, municipality and ward come from the admin-managed
  // service areas; district, province and postal code are filled in for us.
  await page.getByRole('radio', { name: 'Kathmandu', exact: true }).click();
  await page.getByRole('radio', { name: 'Kirtipur', exact: true }).click();
  await page.getByRole('combobox', { name: /^Ward/ }).selectOption('5');
  await expect(page.getByText(/We pick up in Kirtipur/)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Postal code' })).toHaveValue('44618');
  await page.getByRole('textbox', { name: /^Tole/ }).fill('Naya Bazar');
  await page.getByRole('button', { name: 'Use this address' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 3: first open day is preselected; pick the first available slot
  await page.getByRole('radio', { name: /AM|PM/ }).and(page.locator(':not([disabled])')).first().click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 4: verify phone (test mode shows the code on screen) and confirm
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  const hint = page.getByText(/your code is/i);
  await expect(hint).toBeVisible();
  const code = (await hint.textContent()).match(/(\d{6})/)[1];
  await page.getByLabel('Digit 1').fill(code);
  await page.getByLabel('Full name').fill('E2E Tester');
  await page.getByRole('button', { name: 'Confirm booking' }).click();

  await expect(page.getByRole('heading', { name: 'Pickup booked!' })).toBeVisible();
  const pickupId = await page.getByText(/SM-\d{4}-\d{6}/).first().textContent();
  await expect(page.getByText('Door code', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Track pickup' }).click();
  await expect(page).toHaveURL(new RegExp(`/pickups/${pickupId}`));
  await expect(page.getByText('Collector assigned').first()).toBeVisible();
});
