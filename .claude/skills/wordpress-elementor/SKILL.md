---
name: wordpress-elementor
description: "Use this whenever the user is working on a WordPress site built with Elementor — creating or restructuring landing pages, comparison/vs pages, service-area or location pages, blog post templates, or a Learning Center/hub page; implementing schema markup (FAQPage, Article, LocalBusiness, Product) inside Elementor; fixing on-page SEO in Yoast (title, meta description, slug, cornerstone/pillar linking); auditing why a WordPress+Elementor page isn't ranking, isn't getting rich results, or isn't showing up right in Google/AI search; or publishing new pages/posts on a client's WordPress site. Trigger on mentions of 'WordPress', 'Elementor', 'Yoast', 'página en el sitio', 'landing page', 'schema en Elementor', 'FAQ schema', 'plantilla de Elementor', or when the user references a WP site by URL and wants pages built, fixed, or published. This is the go-to skill any time SEO/content strategy work needs to actually be implemented on a WordPress+Elementor site, not just planned."
metadata:
  author: Crabsense
  version: "1.0.0"
  category: seo
---

# WordPress + Elementor

Implementation skill: turns SEO/content strategy into actual pages published on a WordPress site built with Elementor. Use this after a content strategy (see `content-strategy`, `seo-audit`, `ai-seo`) has decided *what* to build — this skill covers *how* to build it correctly in Elementor so it ranks, gets rich results, and gets cited by AI engines.

Default SEO plugin assumed: **Yoast SEO**. If the site uses Rank Math or another plugin instead, the same fields exist under different labels — ask the user to confirm which plugin before giving exact menu paths, and adapt using [references/seo-plugin-equivalents.md](references/seo-plugin-equivalents.md).

## Before building anything

Confirm with the user (don't assume):
1. **Elementor Free or Elementor Pro?** Pro unlocks Theme Builder (header/footer/archive templates), Custom Code, popup builder, and more form/dynamic widgets. Free is limited to page-level building with the standard widget set. This changes what's possible for schema injection and global templates (see below).
2. **Which SEO plugin** — Yoast (default assumption), Rank Math, or none.
3. **Does the page type already have a template**, or is this the first of its kind on the site? If a comparable page exists (e.g. another comparison page, another city landing page), replicate its structure rather than inventing a new one — consistency matters more than novelty for both users and Google.

If the user hasn't specified a page type, infer it from what they're asking for and confirm briefly: a comparison/vs page, a service/surface/product-type page, a city or service-area landing page, a blog post, or a hub/pillar page. Each has a different recommended structure below.

---

## 1. Elementor structure fundamentals

Elementor pages are built as **Sections → Columns → Widgets**. Before building any page type, keep these rules — they affect both SEO and Core Web Vitals:

- **One H1 per page**, set via a Heading widget with HTML tag = H1. Elementor does NOT enforce this automatically — it's common to find pages with zero H1s (if the H1 was set in a hero widget with a different tag) or multiple H1s (if a template header also includes one). Check both.
- **Heading hierarchy must be sequential** (H1 → H2 → H3, no skipping). Elementor's Heading widget lets you pick any tag for any visual size — visual size and semantic tag are independent. Never pick a tag based on how big the text should look; pick it based on document structure, then style the size separately.
- **Alt text goes on the image in the Media Library, not as a caption in Elementor.** Elementor image widgets have an "Alt" field pulled from the attachment's metadata by default — set it there once and it propagates everywhere that image is reused.
- **Global widgets/templates** (Elementor Pro Theme Builder, or saved global sections) are efficient but risky: editing a global header/footer/CTA affects every page using it instantly. Never edit a global template to fix a one-page problem — create a page-specific override instead.
- **Avoid widget bloat**: nested sections, unused Motion Effects, and stacking multiple heavy widgets (sliders, countdown timers, particle backgrounds) hurts LCP/INP. If the user is diagnosing slow Core Web Vitals, check for these first — see `seo-audit`'s `seo-performance` findings for the technical measurement side.

---

## 2. Page type templates

For each type, build in this order: **structure → copy → schema → internal links → SEO fields → publish checklist** (Section 5).

### Comparison / "vs" page
Highest AI-citation format (~33% citation share) — prioritize these when a content strategy calls for them.

Structure:
1. H1 stating the comparison directly ("Rhino Shield vs. Traditional Paint")
2. Short intro (2-3 sentences) stating the verdict up front — AI engines and skimming users both reward this
3. Comparison table widget (Elementor's native Table widget, or a Pricing Table widget repurposed) with the SAME row labels used consistently — this becomes the extractable block AI engines lift directly
4. Expanded sections per comparison factor (H2 each), each with a short paragraph, not just a repeat of the table
5. FAQ section (Accordion/Toggle widget) — see schema requirements in Section 3
6. CTA block linking to quote/contact form
7. Internal links to: the product/service page being defended, and at least one related comparison or pillar page

### Service / surface / product-type page (e.g. "Rhino Shield on Stucco")
Structure:
1. H1 naming the specific surface/service + brand
2. Problem framing: what typically goes wrong with this surface/material specifically
3. How the product/service solves it (process-specific detail, not generic marketing copy)
4. Gallery widget with real project photos of that surface — filename and alt text should describe the surface, not just the brand
5. FAQ section
6. Internal links to: the comparison page, the relevant city/service-area page, and the main product/service page

### City / service-area landing page
Structure:
1. H1 with city/region + service ("Exterior Painting in [City], NY")
2. Local relevance paragraph — what's specific to that area's climate, housing stock, or regulations (this is what differentiates it from a templated duplicate of every other city page — thin, swapped-city-name pages get flagged as doorway pages)
3. Service summary (can reuse core copy, but the local paragraph must be unique per page)
4. Local trust signals: service area map or list of neighborhoods covered, local reviews if available
5. LocalBusiness or Service schema (Section 3) with the correct `areaServed`
6. CTA + contact form
7. Internal link to nearest other city pages and to the main service page — build a local page cluster, don't leave each city page orphaned

### Blog post
Structure:
1. H1 = post title, matching search intent (validate against real keyword data before writing — a calendar-driven title with no search volume produces impressions without clicks)
2. Featured image set and alt text confirmed BEFORE publishing — broken/empty featured images kill CTR in search and social previews; this is a common and easy-to-miss failure
3. Author byline visible and linked to an author page (E-E-A-T signal)
4. Body with real H2/H3 structure matching sub-questions a reader (and an AI fan-out query) would have
5. FAQ block if the topic has 2+ natural follow-up questions
6. Category assigned to an ACTUAL relevant category (not a catch-all) — check the category taxonomy already in use on the site before publishing, and use it
7. Internal links to at least one pillar/hub page and one comparison or service page — blog posts should feed the permanent page structure, not dead-end

### Hub / Learning Center / pillar page
Structure:
1. H1 = the pillar topic, comprehensive framing
2. Short overview answering the core question directly
3. Card/grid widget linking out to each spoke page (comparison pages, service pages, blog posts under this pillar)
4. This page should itself rank for the broad head-term while spokes rank for long-tail — don't duplicate spoke content here, summarize and link

---

## 3. Schema markup in Elementor

Elementor does not generate structured data on its own — schema always comes from either the SEO plugin or manual injection. This is the single most common gap on Elementor sites: FAQ accordions that look correct visually but emit no `FAQPage` JSON-LD, so the rich result never appears and AI engines can't extract the Q&A as structured data.

### Method 1 — SEO plugin (preferred, use whenever possible)
**Yoast SEO**: Article/Post schema is automatic. For FAQPage schema, use Yoast's own **FAQ block** (Gutenberg) if the site allows Gutenberg blocks inside Elementor content, or install **Yoast's structured data content blocks**. If the page is built entirely in Elementor with no Gutenberg block available, fall back to Method 2 for the FAQPage piece specifically — Yoast's automatic schema graph will still handle the page-level `WebPage`/`Article` schema in parallel.

Check what's actually in the schema graph, don't assume: view page source or use the Google Rich Results Test on the live URL. If an Accordion/Toggle widget is being used for a visual FAQ, that widget's content is NOT automatically added to Yoast's schema graph — this is exactly the kind of gap to check for.

### Method 2 — Custom Code / manual JSON-LD (Elementor Pro, or any plan with a code-capable widget)
For FAQPage schema not covered by the SEO plugin, add a **HTML widget** (or Elementor Pro's Custom Code feature, inserted in the page `<head>` or before `</body>`) containing hand-written JSON-LD:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Exact question text, matching what's visible on the page",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Exact answer text, matching what's visible on the page"
      }
    }
  ]
}
</script>
```

Critical rule: **every question in the JSON-LD must also be visibly present on the page**, and vice versa — every visible FAQ question needs an entry in the JSON-LD. A common failure mode (seen in the wild) is an accordion with 3 visible questions but a schema block that only captures 1 — Google and AI engines will only credit what's in the structured data, so an incomplete block wastes the two missing questions entirely.

For LocalBusiness/Service schema on city pages, same approach: Yoast's Local SEO add-on if installed, otherwise manual JSON-LD via Custom Code with accurate `areaServed`, `address`, and `telephone`.

### Validating schema
Always validate before calling a page done:
1. Google's Rich Results Test (`https://search.google.com/test/rich-results`) on the live URL — confirms Google can parse it and shows which rich result types are eligible.
2. Schema.org validator for anything Rich Results Test doesn't cover.
3. View page source and manually confirm every visible Q&A pair has a matching JSON-LD entry — don't trust the plugin blindly.

---

## 4. On-page SEO fields (Yoast)

For every page/post, before publishing:

| Field | Where | Rule |
|---|---|---|
| SEO title | Yoast meta box, "Google preview" tab | Include the primary keyword near the front; keep under ~60 characters so it doesn't truncate |
| Meta description | Yoast meta box | Under ~155 characters, states the specific value prop of THIS page — never reuse the homepage description |
| Slug | Yoast meta box / Permalink | Short, keyword-relevant, matches the page's actual topic — don't leave WordPress's auto-generated slug if it's a generic string |
| Focus keyphrase | Yoast meta box | Set it — this drives Yoast's on-page checklist, not just a label |
| Canonical | Yoast Advanced tab | Leave default (self-referencing) unless this page is intentionally a duplicate of another (rare — confirm before setting) |
| Cornerstone content | Yoast Advanced tab | Mark pillar/hub pages as cornerstone — this changes how Yoast internally prioritizes them in its own suggestions |

Yoast's internal linking suggestions (in the sidebar while editing) are worth checking on every new page — they surface existing pages on the site that could/should link to the new one, which helps close the "orphan page" gap common on sites where content accumulated without a linking strategy.

---

## 5. Publishing checklist

Run through this before marking any page/post as done — this is the checklist that catches the errors most likely to silently waste the page's potential:

- [ ] One H1, correct sequential heading hierarchy below it
- [ ] Featured image set, displays correctly, has alt text (check on the live URL, not just the editor — Elementor previews can hide a broken image that the theme fails to render)
- [ ] All content images have alt text set on the attachment, not just a visual caption
- [ ] Yoast SEO title, meta description, slug, and focus keyphrase all set intentionally (not defaults)
- [ ] Category/tag assigned to an existing, relevant taxonomy term — check the site's actual category list first, don't create a new one-off category
- [ ] Schema validated via Rich Results Test if the page has FAQ, Article, LocalBusiness, or Product content
- [ ] At least 2-3 internal links out to other relevant pages (pillar, comparison, service, or related post) — and check Yoast's link suggestions
- [ ] At least 1 internal link IN from an existing relevant page (add it to that page if it doesn't exist yet)
- [ ] Mobile preview checked in Elementor's responsive mode — Elementor sections that look fine on desktop often overflow or stack badly on mobile
- [ ] Page loads and renders without layout shift — spot-check if the page uses sliders, countdown widgets, or dynamically-loaded content above the fold

---

## Common pitfalls specific to Elementor

- **JS-rendered content invisible to crawlers**: some Elementor widgets (certain sliders, popup-triggered content, tabs that lazy-load) render content only on interaction. If SEO-critical copy only appears after a click, it may not be indexed. Prefer content visible on load.
- **Global template edits breaking other pages**: covered above — always check what else uses a global template before editing it.
- **Duplicate content from page templates**: copying an existing page as a starting point (common for city/service pages) and forgetting to rewrite the locally-unique paragraph — this produces near-duplicate pages that dilute each other instead of each ranking independently. This is the single most common failure mode for location-page programs; the local paragraph in Section 2 is non-negotiable, not a nice-to-have.
- **Orphaned pages**: a new page built and published but never linked from anywhere else on the site. Elementor makes it easy to build a page in isolation — always close the loop with internal links per the checklist above.

---

## Related skills
- **content-strategy**: for deciding what pages/posts to build before implementing them here
- **seo-audit**: for diagnosing technical/on-page issues at a whole-site level
- **ai-seo**: for the broader GEO strategy this implementation supports
- **schema**: for schema markup guidance not specific to WordPress/Elementor
- **copywriting**: for writing the actual page copy referenced in each template above
