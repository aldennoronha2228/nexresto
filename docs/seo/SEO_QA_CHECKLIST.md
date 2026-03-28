# SEO QA Checklist (Multi-Tenant Safe)

## 1) Metadata per tenant
- [ ] Visit `/{storeId}` and confirm title/description/OG/canonical are tenant-specific.
- [ ] Visit `/{storeId}/menu` and confirm metadata remains scoped to the same `storeId`.
- [ ] Visit `/customer?restaurant={storeId}` and confirm canonical points to `/{storeId}/menu`.
- [ ] Visit invalid tenant route and confirm fallback/noindex metadata (or 404) without leaking another tenant.

## 2) Canonical + indexability
- [ ] Canonical URL has no query string for indexable tenant pages.
- [ ] Preview route (`/{storeId}/menu?preview=1`) is noindex.
- [ ] Tenant pages with no menu resolve to noindex.
- [ ] Internal routes (`/dashboard`, `/super-admin`, `/login`, `/customer/*`) are noindex.

## 3) Structured data
- [ ] `/{storeId}` emits `WebSite`, `Restaurant`, `BreadcrumbList`.
- [ ] `/{storeId}/menu` emits `Restaurant`, `Menu`, `BreadcrumbList`.
- [ ] JSON-LD values (name/url/menu/logo/contact) match the active tenant only.

## 4) Crawl controls
- [ ] `/robots.txt` disallows admin/dashboard/auth/internal APIs.
- [ ] `/robots.txt` includes sitemap reference.
- [ ] `/sitemap.xml` includes `/` and only public tenants with menu content.

## 5) On-page + performance
- [ ] Exactly one meaningful `h1` on each indexable page.
- [ ] Heading order follows `h1 -> h2 -> h3`.
- [ ] Public menu and tenant hero images use `next/image` with proper `sizes`.
- [ ] LCP hero image uses `priority` only where justified.

## Recommended commands
```bash
npm run lint
npm run build
```
