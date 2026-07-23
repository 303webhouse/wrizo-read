import { type APIRequestContext, expect, test } from "@playwright/test";

// The floor, end to end (brief §6): login -> queue renders seeded cards from tokens -> filter
// narrows -> claim -> countdown -> Reading Table shows text + board bundle -> release returns the
// card. Runs at both reference widths (projects) and both regimes (toggle). Presence is not
// composition. The suite seeds its own pieces through the real publish API with a per-run nonce,
// so it is isolated within the shared database.
const API = "http://127.0.0.1:8080";

async function makeWriter(request: APIRequestContext, who: string, nonce: string): Promise<string> {
  const email = `${who}-${nonce}@e2e.test`;
  const reg = await request.post(`${API}/api/v1/auth/register`, { data: { email, password: "password123" } });
  const { token } = await reg.json();
  await request.post(`${API}/api/v1/auth/writer`, { headers: { authorization: `Bearer ${token}` }, data: {} });
  return token;
}

async function post(request: APIRequestContext, token: string, data: unknown) {
  await request.post(`${API}/api/v1/workshop/submissions`, {
    headers: { authorization: `Bearer ${token}` },
    data,
  });
}

test("login → browse → filter → claim → read → release", async ({ page, request }, testInfo) => {
  const nonce = `${testInfo.project.name}${Date.now()}`;
  const room = `poetry-${nonce}`;
  const otherRoom = `essay-${nonce}`;
  const author = await makeWriter(request, "author", nonce);

  await post(request, author, {
    contract: "wrizo-bridge/1",
    kind: "queue",
    title: `Salt ${nonce}`,
    text: "All that year we ate salt and called it grief.\n\nWe learned the difference between the salt that preserves and the salt that ruins.\n",
    rooms: [room],
    hands: ["spare"],
    provenance: { sessions: 3, span_weeks: 2, composed_in_wrizo: true },
    board_bundle: { format: "wrizo-board/1", cards: [{ title: "the turn", body: "preserve vs ruin" }] },
  });
  await post(request, author, {
    contract: "wrizo-bridge/1",
    kind: "queue",
    title: `Ferry ${nonce}`,
    text: "The ferry was late and the light was going.\n",
    rooms: [otherRoom],
    hands: ["plain"],
    provenance: { sessions: 2, span_weeks: 1, composed_in_wrizo: true },
  });

  // Reader enters via the Door.
  await page.goto("/");
  await page.getByLabel("Email").fill(`reader-${nonce}@e2e.test`);
  await page.getByLabel("Passphrase").fill("password123");
  await page.getByRole("button", { name: "Create an account" }).click();

  // The queue room renders, and its ground color resolves through the token layer — both regimes.
  await expect(page.getByRole("heading", { name: "The Pile" })).toBeVisible();
  const shell = page.locator(".shell");
  await expect(page.locator("html")).toHaveAttribute("data-regime", "day");
  await expect(shell).toHaveCSS("background-color", "rgb(242, 238, 227)"); // #F2EEE3
  await page.getByRole("button", { name: "Night" }).click();
  await expect(shell).toHaveCSS("background-color", "rgb(33, 30, 23)"); // #211E17
  await page.getByRole("button", { name: "Day" }).click();

  // Seeded cards are present with real, non-overflowing boxes.
  const salt = page.locator(".qcard", { hasText: `Salt ${nonce}` });
  const ferry = page.locator(".qcard", { hasText: `Ferry ${nonce}` });
  await expect(salt).toBeVisible();
  await expect(ferry).toBeVisible();
  const box = await salt.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.width).toBeLessThanOrEqual(viewport!.width);

  // Filter narrows to the poetry room.
  await page.getByRole("button", { name: room, exact: true }).click();
  await expect(salt).toBeVisible();
  await expect(ferry).toHaveCount(0);

  // Claim -> the card flips to its held state with a live countdown.
  await salt.getByRole("button", { name: /Claim/ }).click();
  await expect(salt.getByText(/You hold this/)).toBeVisible();
  await expect(salt.getByText(/left/)).toBeVisible();

  // Read -> the Reading Table serves the text and the board bundle.
  await salt.getByRole("button", { name: "Read" }).click();
  await expect(page.getByText("we ate salt")).toBeVisible();
  await page.getByRole("button", { name: /The Board/ }).click();
  await expect(page.getByText("the turn")).toBeVisible();

  // Release returns the hold to the floor.
  await page.getByRole("button", { name: "Release this hold" }).click();
  await expect(page.getByRole("heading", { name: "The Pile" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Claim/ }).first()).toBeVisible();
});
