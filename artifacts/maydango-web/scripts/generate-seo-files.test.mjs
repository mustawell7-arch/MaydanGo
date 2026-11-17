import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createRobots,
  createSitemap,
  normalizePublicSiteUrl,
  PUBLIC_ROUTES,
  writeSeoFiles,
} from "./generate-seo-files.mjs";

test("sitemap lists public pages and excludes authenticated workspaces", () => {
  const sitemap = createSitemap("https://maydango.example");
  assert.match(sitemap, /<loc>https:\/\/maydango\.example\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/maydango\.example\/membership-plans<\/loc>/);
  assert.doesNotMatch(sitemap, /\/(account|partner-portal|corporate-portal|super-admin)(?:<|\/)/);
  assert.equal((sitemap.match(/<url>/g) ?? []).length, PUBLIC_ROUTES.length);
});

test("robots points crawlers to the sitemap only when a public URL is configured", () => {
  assert.equal(
    createRobots("https://maydango.example"),
    "User-agent: *\nAllow: /\nSitemap: https://maydango.example/sitemap.xml\n",
  );
  assert.equal(createRobots(null), "User-agent: *\nAllow: /\n");
});

test("public site URL must be HTTPS and cannot contain credentials or query data", () => {
  assert.equal(normalizePublicSiteUrl("https://maydango.example/base/"), "https://maydango.example/base");
  assert.equal(normalizePublicSiteUrl(""), null);
  assert.throws(() => normalizePublicSiteUrl("http://maydango.example"), /HTTPS/);
  assert.throws(() => normalizePublicSiteUrl("https://user:pass@maydango.example"), /HTTPS/);
  assert.throws(() => normalizePublicSiteUrl("https://maydango.example?preview=1"), /HTTPS/);
});

test("build output uses the configured site base and omits private account routes", () => {
  const publicDir = mkdtempSync(join(tmpdir(), "maydango-seo-"));
  try {
    const result = writeSeoFiles(publicDir, "https://maydango.example/site/");
    assert.deepEqual(result, { baseUrl: "https://maydango.example/site", sitemapGenerated: true });
    assert.match(readFileSync(join(publicDir, "robots.txt"), "utf8"), /Sitemap: https:\/\/maydango\.example\/site\/sitemap\.xml/);
    const sitemap = readFileSync(join(publicDir, "sitemap.xml"), "utf8");
    assert.match(sitemap, /https:\/\/maydango\.example\/site\/membership-plans/);
    assert.doesNotMatch(sitemap, /partner-portal|super-admin|corporate-portal/);
  } finally {
    rmSync(publicDir, { recursive: true, force: true });
  }
});

test("build output removes stale sitemap when the production URL is absent", () => {
  const publicDir = mkdtempSync(join(tmpdir(), "maydango-seo-"));
  try {
    writeSeoFiles(publicDir, "https://maydango.example");
    const result = writeSeoFiles(publicDir, "");
    assert.deepEqual(result, { baseUrl: null, sitemapGenerated: false });
    assert.equal(existsSync(join(publicDir, "sitemap.xml")), false);
    assert.equal(readFileSync(join(publicDir, "robots.txt"), "utf8"), "User-agent: *\nAllow: /\n");
  } finally {
    rmSync(publicDir, { recursive: true, force: true });
  }
});
