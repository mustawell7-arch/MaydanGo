import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

export const PUBLIC_ROUTES = [
  "/",
  "/how-it-works",
  "/membership-plans",
  "/facilities",
  "/events",
  "/online-training",
  "/partner",
  "/instructor",
  "/corporate",
  "/help",
  "/contact",
  "/legal",
  "/privacy",
];

export function normalizePublicSiteUrl(value) {
  if (!value?.trim()) return null;
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("PUBLIC_SITE_URL must be a public HTTPS URL without credentials, query, or hash.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function routeUrl(baseUrl, route) {
  return route === "/" ? `${baseUrl}/` : `${baseUrl}${route}`;
}

export function createSitemap(baseUrl) {
  const urls = PUBLIC_ROUTES.map(route => `  <url><loc>${routeUrl(baseUrl, route)}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

export function createRobots(baseUrl) {
  return [
    "User-agent: *",
    "Allow: /",
    ...(baseUrl ? [`Sitemap: ${baseUrl}/sitemap.xml`] : []),
    "",
  ].join("\n");
}

export function writeSeoFiles(publicDir, publicSiteUrl) {
  const baseUrl = normalizePublicSiteUrl(publicSiteUrl);
  writeFileSync(join(publicDir, "robots.txt"), createRobots(baseUrl));
  const sitemapPath = join(publicDir, "sitemap.xml");
  if (baseUrl) {
    writeFileSync(sitemapPath, createSitemap(baseUrl));
  } else if (existsSync(sitemapPath)) {
    unlinkSync(sitemapPath);
  }
  return { baseUrl, sitemapGenerated: Boolean(baseUrl) };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const publicDir = join(dirname(scriptPath), "../public");
  const result = writeSeoFiles(publicDir, process.env.PUBLIC_SITE_URL);
  console.info(result.sitemapGenerated
    ? "Generated sitemap.xml and robots.txt for the configured public site."
    : "PUBLIC_SITE_URL is not configured; robots.txt will allow crawling without a sitemap.");
}
