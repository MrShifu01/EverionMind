import { expect, test } from "@playwright/test";

test.describe("landing mobile polish", () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 360, height: 800 },
    isMobile: true,
  });

  test("keeps visible landing controls at a 44px tap-target floor", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("everion_analytics_consent", "declined");
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /everion/i })).toBeVisible();

    const offenders = await page.locator("a, button").evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const element = node as HTMLElement;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            rect.width > 0 &&
            rect.height > 0
          );
        })
        .map((node) => {
          const element = node as HTMLElement;
          const rect = element.getBoundingClientRect();
          return {
            label:
              element.getAttribute("aria-label") ||
              element.textContent?.replace(/\s+/g, " ").trim() ||
              element.getAttribute("href") ||
              element.tagName,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((target) => target.height < 44 || target.width < 44),
    );

    expect(offenders).toEqual([]);
  });
});
