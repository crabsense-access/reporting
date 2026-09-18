# SEO plugin field equivalents

The main SKILL.md assumes Yoast SEO. If the site uses a different plugin, map the same concepts to these locations.

## Rank Math

| Concept | Yoast location | Rank Math location |
|---|---|---|
| SEO title / meta description | Yoast meta box, "Google preview" | Rank Math meta box, "General" tab |
| Focus keyword | Yoast meta box | Rank Math meta box, "General" tab (supports multiple keywords natively) |
| Schema | Automatic Article/Post graph; FAQ block for FAQPage | Rank Math has a built-in **Schema generator** with an FAQ schema type — this is often easier than Yoast's approach since it doesn't require a Gutenberg block; check Rank Math's "Schema" tab in the meta box first before falling back to manual JSON-LD |
| Cornerstone content | Advanced tab toggle | Rank Math's "Pillar Content" toggle, same tab area |
| Internal link suggestions | Sidebar during editing | Rank Math's Content AI / link suggestions (Pro feature) |
| Local SEO / LocalBusiness schema | Yoast Local SEO add-on (paid) | Rank Math's Schema generator includes a LocalBusiness type natively in the free tier |

Rank Math generally has stronger native schema support than Yoast, including for FAQPage — if the site has Rank Math, prefer its built-in Schema generator over manual JSON-LD injection whenever the schema type is supported.

## No SEO plugin installed

If the site has neither, everything in Section 3 (schema) and Section 4 (on-page fields) of the main skill must be handled manually:
- Title/meta description: WordPress doesn't have a distinct SEO title field by default — check the theme for one, otherwise this needs a plugin (recommend installing Yoast or Rank Math rather than hand-coding meta tags per page).
- Schema: manual JSON-LD via Elementor's Custom Code/HTML widget only (Method 2 in the main skill).
- Flag this to the user — recommending a lightweight SEO plugin is usually the right first step before doing per-page manual work at scale.
