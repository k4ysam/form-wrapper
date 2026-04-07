import * as fs from "fs";
import * as path from "path";
import { Cookie } from "playwright";

const COOKIES_DIR = path.join(process.cwd(), ".cookies");

function cookiePath(workflowName: string): string {
  return path.join(COOKIES_DIR, `${workflowName}.json`);
}

export async function saveCookies(workflowName: string, cookies: Cookie[]): Promise<void> {
  fs.mkdirSync(COOKIES_DIR, { recursive: true });
  fs.writeFileSync(cookiePath(workflowName), JSON.stringify(cookies, null, 2), "utf-8");
}

export async function loadCookies(workflowName: string): Promise<Cookie[] | null> {
  const filePath = cookiePath(workflowName);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Cookie[];
}
