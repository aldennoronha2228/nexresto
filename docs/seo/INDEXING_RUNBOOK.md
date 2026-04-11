# NexResto Indexing & Search Console Runbook

## Why SEO Can Fail Even When Meta Tags Exist
Meta tags are necessary but not sufficient. Pages can still be excluded if crawl/indexing signals conflict.

Common failure modes:
- Wrong canonical host: canonical URLs point to localhost, preview domains, or mixed domains.
- Robots conflict: robots.txt allows/disallows patterns that are ambiguous or too broad.
- Private routes leak indexability: auth/admin/customer pages return indexable responses.
- Sitemap quality issues: sitemap includes non-indexable pages (private, empty, preview, duplicate).
- Header conflicts: `X-Robots-Tag` or `Cache-Control: no-store` on public pages reduces crawl efficiency.
- Status/redirect issues: soft-404s, broken redirects, 3xx chains, or unstable URL variants.
- Low site trust (non-code): weak backlinks, new domain age, low crawl demand, sparse content.

## Search Console Setup (Production)
1. Verify the property
- Prefer Domain property (covers all protocols/subdomains).
- Add DNS TXT record exactly as provided by Search Console.
- Wait for DNS propagation, then verify.

2. Add verification meta token in app config
- Set `GOOGLE_SITE_VERIFICATION` (or `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`) in production env.
- Redeploy app.
- Confirm HTML contains `<meta name="google-site-verification" ...>`.

3. Submit sitemap
- In Search Console > Sitemaps, submit `https://nexresto.in/sitemap.xml`.
- Verify status is Success and that discovered URLs are increasing.

4. URL inspection for key pages
- Inspect `/`, one tenant home `/{storeId}`, one tenant menu `/{storeId}/menu`.
- Check canonical selected by Google matches expected URL.

5. Request indexing (selective)
- Request indexing for homepage and top tenant pages after major SEO fixes.
- Avoid bulk repeated requests; use sparingly for priority URLs.

## Troubleshooting Search Console Exclusions
### Excluded by `noindex`
- Check `X-Robots-Tag` headers and route metadata.
- Confirm private routes are intentionally noindex and public pages are not.

### Discovered - currently not indexed
- Improve internal linking and external authority signals.
- Ensure sitemap freshness and content uniqueness.
- Avoid very low-value thin pages.

### Crawled - currently not indexed
- Improve content quality, uniqueness, and intent match.
- Verify canonical and deduplicate near-identical pages.

### Alternate page with proper canonical
- Expected only for intentional duplicates.
- If unexpected, fix canonical path/origin inconsistencies.

## 14-Day Monitoring Checklist
Run daily for 14 days after deployment.

Day 1-3:
- [ ] Confirm `robots.txt` and `sitemap.xml` are reachable and correct.
- [ ] Validate canonical URL in page source for `/`, `/{storeId}`, `/{storeId}/menu`.
- [ ] Confirm private routes return `X-Robots-Tag: noindex, nofollow`.
- [ ] Inspect index coverage for key URLs.

Day 4-7:
- [ ] Check crawl stats trend in Search Console.
- [ ] Validate no spike in excluded private URLs.
- [ ] Re-inspect top tenant pages and request indexing if needed.

Day 8-14:
- [ ] Track indexed URL count delta.
- [ ] Track impressions/clicks trend for branded and menu queries.
- [ ] Check sitemap discovered vs indexed ratio.
- [ ] Review canonical mismatch or duplicate reports.

## KPI Targets (first 14 days)
- Indexed key URLs: Homepage + priority tenant menus indexed.
- Coverage quality: No private/admin/auth routes indexed.
- Crawl efficiency: Stable crawl activity, no broad `no-store` impact on public pages.
- Canonical correctness: 100% of inspected priority URLs show correct canonical host.

## Operational Notes
- Keep tenant pages indexable only when public and menu is available.
- Keep preview URLs noindex.
- Keep security controls intact; noindex private surfaces via metadata and headers.
