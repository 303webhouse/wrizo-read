import { type APIRequestContext, expect, test } from "@playwright/test";

// The reading economy, end to end (brief §8): login -> claim -> Reading Table -> paste blocked
// with the rail note -> type past the floor -> file -> the seal opens on two pre-filed readings ->
// rate one -> the credit chip ticks to 1. Both reference widths (projects). The suite seeds its own
// piece + pre-filed readings via API + faucet with a per-run nonce.
const API = "http://127.0.0.1:8080";
const LONG = Array.from({ length: 140 }, (_, i) => `word${i}`).join(" ");

async function writer(request: APIRequestContext, who: string, nonce: string, fund = false): Promise<string> {
  const email = `${who}-${nonce}@e2e.test`;
  const reg = await request.post(`${API}/api/v1/auth/register`, { data: { email, password: "password123" } });
  const { token } = await reg.json();
  await request.post(`${API}/api/v1/auth/writer`, { headers: { authorization: `Bearer ${token}` }, data: {} });
  if (fund) await request.post(`${API}/api/v1/dev/credits`, { headers: { authorization: `Bearer ${token}` }, data: { amount: 100 } });
  return token;
}

test("compose → file → the seal opens → rate → the credit chip ticks", async ({ page, request }, testInfo) => {
  const nonce = `${testInfo.project.name}${Date.now()}`;
  const room = `poetry-${nonce}`;
  const author = await writer(request, "author", nonce, true);

  const piece = (
    await (
      await request.post(`${API}/api/v1/workshop/submissions`, {
        headers: { authorization: `Bearer ${author}` },
        data: {
          contract: "wrizo-bridge/1",
          kind: "queue",
          title: `Salt ${nonce}`,
          text: "All that year we ate salt and called it grief.\n",
          rooms: [room],
          hands: ["spare"],
          provenance: { sessions: 3, span_weeks: 2, composed_in_wrizo: true },
        },
      })
    ).json()
  ).submission_id as string;

  // Two other readers pre-file readings, so the opened seal shows more than the reader's own.
  for (const who of ["pre1", "pre2"]) {
    const t = await writer(request, who, nonce);
    await request.post(`${API}/api/v1/workshop/claims`, { headers: { authorization: `Bearer ${t}` }, data: { submission_id: piece } });
    await request.post(`${API}/api/v1/workshop/pieces/${piece}/readings`, { headers: { authorization: `Bearer ${t}` }, data: { body: LONG } });
  }

  // The reader enters via the Door; the credit chip starts at zero.
  await page.goto("/");
  await page.getByLabel("Email").fill(`reader-${nonce}@e2e.test`);
  await page.getByLabel("Passphrase").fill("password123");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByText("0 credits")).toBeVisible();

  // Claim our piece and open the Reading Table.
  await page.getByRole("button", { name: room, exact: true }).click();
  const card = page.locator(".qcard", { hasText: `Salt ${nonce}` });
  await card.getByRole("button", { name: /Claim/ }).click();
  await card.getByRole("button", { name: "Read" }).click();

  // The seal is closed; the composer is present. Paste is blocked and the rail note flares.
  await expect(page.locator(".sealbox")).toBeVisible();
  const composer = page.locator(".composer-input");
  await composer.click();
  await composer.evaluate((el: HTMLTextAreaElement) => {
    const data = new DataTransfer();
    data.setData("text/plain", "PASTED PROSE");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText(/Paste is closed/)).toBeVisible();
  await expect(composer).toHaveValue("");

  // Type past the floor and file.
  await composer.fill(LONG);
  await page.getByRole("button", { name: "File your reading" }).click();

  // The seal opens: two pre-filed readings plus our own; the credit chip ticks to 1.
  await expect(page.getByRole("heading", { name: "Readings" })).toBeVisible();
  await expect(page.locator(".reading")).toHaveCount(3);
  await expect(page.locator(".reading.own")).toHaveCount(1);
  await expect(page.getByText("1 credit", { exact: true })).toBeVisible();

  // Rate another reader's reading — a filed peer is eligible.
  const others = page.locator(".reading:not(.own)");
  await others.first().getByRole("button", { name: "Useful" }).click();
  await expect(page.locator(".notice")).toHaveCount(0); // no error surfaced
});
