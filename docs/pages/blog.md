# Blog (`/blog`, `/blog/:slug`)

**Components:** `client/src/views/BlogIndex.jsx`, `client/src/views/BlogPost.jsx`
**Layout:** `client/src/components/BlogLayout.jsx`
**Nav group:** *(bottom utility group)*

## Purpose
Editorial content hub. Long-form articles on healthcare transparency, data methodology, policy analysis, and MediCosts feature explanations.

## Routes
| Route | Component | Description |
|-------|-----------|-------------|
| `/blog` | BlogIndex | Article listing page |
| `/blog/:slug` | BlogPost | Individual article reader |

## Article Storage
Articles live as JSX components in `client/src/views/blog/`:
- `HealthcarePriceTransparency.jsx` — slug: `healthcare-price-transparency`

## Features
- Article index with metadata (title, date, reading time, category)
- Individual article reader with BlogLayout wrapper
- Public routes — no authentication required
- Markdown-style rich content via JSX

## Adding New Articles
1. Create `client/src/views/blog/YourArticle.jsx` using the `article.module.css` styles
2. Register in `BlogIndex.jsx` article manifest
3. Register slug → component mapping in `BlogPost.jsx`

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Initial build — BlogIndex, BlogPost, BlogLayout, first article |
