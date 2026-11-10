import fs from 'node:fs';
import type { Browser } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';
import { env } from './env.js';
import { ApiError } from './errors.js';

const LOCAL_CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export async function launchBrowser(): Promise<Browser> {
  if (env.isVercel) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const exe = env.chromePath || LOCAL_CHROME.find((p) => fs.existsSync(p));
  if (!exe) throw new ApiError(500, 'NO_BROWSER', 'No Chrome or Edge found. Set CHROME_PATH in .env.');
  return puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}
