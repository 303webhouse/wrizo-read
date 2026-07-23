import { expect, test } from "@playwright/test";

// Plateau ground color per regime — must track packages/tokens/tokens.json.
// #F2EEE3 -> rgb(242, 238, 227) ; #211E17 -> rgb(33, 30, 23)
const GROUND = { day: "rgb(242, 238, 227)", night: "rgb(33, 30, 23)" };

test.describe("rendered geometry — token-driven, both regimes (brief §6)", () => {
  test("renders from tokens, resolves lexicon, flips regime, lays out at this width", async ({
    page,
  }) => {
    await page.goto("/");

    const html = page.locator("html");
    const shell = page.locator(".shell");
    const header = page.locator("header.door");
    const floor = page.locator(".floor");

    // Token-driven render: the day ground color resolves through the token layer, not a literal.
    await expect(html).toHaveAttribute("data-regime", "day");
    await expect(shell).toHaveCSS("background-color", GROUND.day);

    // Copy resolves through lex(): the queue name renders as its Plateau lexicon entry.
    await expect(page.locator(".queue")).toHaveText("The Pile");

    // Presence is not composition: real, non-zero, well-ordered boxes at this reference width.
    const h = await header.boundingBox();
    const f = await floor.boundingBox();
    const viewport = page.viewportSize();
    expect(h).not.toBeNull();
    expect(f).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(h!.height).toBeGreaterThan(0);
    expect(f!.width).toBeGreaterThan(0);
    expect(f!.y).toBeGreaterThanOrEqual(h!.y + h!.height - 1); // main sits below the header
    expect(f!.width).toBeLessThanOrEqual(viewport!.width); // never overflows the reference width

    // Flip to night: the SAME token key resolves to the night value — zero component change.
    await page.locator(".btn").click();
    await expect(html).toHaveAttribute("data-regime", "night");
    await expect(shell).toHaveCSS("background-color", GROUND.night);
  });
});
