import { test as base, expect, type Locator } from "@playwright/test";

type ViewerEvent = {
  type: string;
  origin: string;
  format?: string;
  nodeCount?: number;
  message?: string;
};

declare global {
  interface Window {
    __komfyflowViewerEvents?: ViewerEvent[];
  }
}

export const test = base.extend<{ browserHealth: void }>({
  browserHealth: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      const serverErrors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 500)
          serverErrors.push(`${response.status()} ${response.url()}`);
      });
      await page.addInitScript(() => {
        if (window.top !== window) return;
        window.__komfyflowViewerEvents = [];
        window.addEventListener("message", (event) => {
          if (event.data?.channel !== "komfyflow-viewer") return;
          window.__komfyflowViewerEvents?.push({
            type: event.data.type,
            origin: event.origin,
            format: event.data.format,
            nodeCount: event.data.nodeCount,
            message: event.data.message,
          });
        });
      });
      await use();
      await testInfo.attach("browser-health", {
        body: JSON.stringify({ uncaughtErrors: errors, serverErrors }, null, 2),
        contentType: "application/json",
      });
      expect(
        errors,
        "No uncaught browser errors, including in the native iframe",
      ).toEqual([]);
      expect(
        serverErrors,
        "No unexpected application HTTP 5xx responses",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function expectRenderedGraph(canvas: Locator) {
  await expect(canvas).toBeVisible();
  // A canvas element alone is not evidence of native rendering. Sample actual
  // raster output and require more than the blank/grid background color palette.
  await expect
    .poll(
      async () =>
        canvas.evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          const context = canvas.getContext("2d");
          if (!context || canvas.width < 200 || canvas.height < 200) return 0;
          const { data } = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
          const colors = new Set<number>();
          for (let y = 0; y < canvas.height; y += 5) {
            for (let x = 0; x < canvas.width; x += 5) {
              const i = (y * canvas.width + x) * 4;
              if (data[i + 3] > 0)
                colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
            }
          }
          return colors.size;
        }),
      {
        message:
          "Native canvas must contain painted nodes, links, and widget text",
      },
    )
    .toBeGreaterThan(16);
}
