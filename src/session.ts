import { chromium, BrowserContext, Page } from "playwright";

export interface SessionOptions {
  headed?: boolean;
}

export interface Session {
  page: Page;
  context: BrowserContext;
}

export async function createSession(url: string, options: SessionOptions = {}): Promise<Session> {
  const browser = await chromium.launch({
    args: ["--window-size=1366,768"],
    headless: !options.headed,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  if (!page) {
    throw new Error("No page found");
  }

  await page.goto(url);

  return { page, context };
}
