import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const domain = process.env.REPLIT_DEV_DOMAIN;
if (!domain) throw new Error("REPLIT_DEV_DOMAIN is required to load the rendered agreement page.");

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, "../../generated-artifacts");
const pageUrl = `https://${domain}/maydango-web/corporate-agreement-draft`;
const templateUrl = `https://${domain}/api/public/corporate-agreement-template`;
const browser = await puppeteer.launch({
  executablePath: "/repl/tools/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  await mkdir(outputDirectory, { recursive: true });
  const templateResponse = await fetch(templateUrl);
  if (!templateResponse.ok) throw new Error(`Could not load the agreement template: ${templateResponse.status}`);
  const template = await templateResponse.json() as { agreementText?: unknown };
  if (typeof template.agreementText !== "string" || template.agreementText.length < 100) {
    throw new Error("The public agreement template response was incomplete.");
  }
  await writeFile(
    path.join(outputDirectory, "corporate-agreement-template.json"),
    JSON.stringify(template, null, 2),
  );

  const page = await browser.newPage();
  await page.setViewport({ width: 816, height: 1056 });
  await page.goto(pageUrl, { waitUntil: "networkidle0" });
  await page.waitForFunction("document.querySelector('.agreement-content')?.textContent?.includes('NOT FOR SIGNATURE') === true");
  await page.evaluate("document.title = 'MaydanGo Corporate Employee Enrolment Agreement — Draft 0.1'");
  await page.pdf({
    path: path.join(outputDirectory, "maydango-corporate-enrollment-agreement-draft-0.1.pdf"),
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
  });
  await page.close();
} finally {
  await browser.close();
}
