
## SEO audit — 2026-08-31 (PHB-20260831-001)

Ran `new-seo-90-days` (Day 0 of the 90-day arc). **58 → 80.5 / 100.**
Both endpoints scored by independent agents against one identical rubric on the
same source files — never self-scored. Client report is a Gmail **draft**
(`r1764463387395723691`) to Jim, BCC WES admins; pending Justin's review.

### Two defects that were live and are now fixed
1. **Silent lead loss on all 4 forms.** `form-notify` answers HTTP 200 with
   `{accepted:false}` on rejection; the handler checked only `res.ok`, so a real
   visitor with a low reCAPTCHA score saw the thank-you while the lead went to
   `form_rejections` and never reached `leads`. Reproduced live (`low_score:0.00`
   → /thank-you/ still shown). Success is now gated on `json.accepted`.
2. **Map coordinates 1.41 miles off** (27.823,-82.722 → 27.8303,-82.7004),
   verified against the US Census geocoder and OSM. Was wrong in 26 links across
   12 pages plus schema `geo`/`hasMap`/`sameAs`.

### Gotchas worth remembering here
- `components.js` is un-hashed and was on `max-age=86400`, so the lead-capture fix
  kept serving stale from browser cache. Assets are now versioned
  (`?v=20260831`) and css/js cache cut to 10 min. **Verify JS fixes in a browser,
  not with curl** — curl showed the fix live while the browser still ran the old file.
- The automated sitemap updater re-adds `/thank-you/` and `/waiver/`, which are
  `noindex` AND robots-disallowed. Removed again here; **it will come back** until
  the generator is fixed at the source.
- A file-reading-only audit scored this site 82.5; a pass that ran real Lighthouse
  + live endpoint probes + geocoder checks scored it 62.5 and caught everything
  above. Don't report a number from a files-only pass.

### Open / not done
- Mobile LCP measured 11.0s (desktop is 100). Fix = self-host fonts, defer
  reCAPTCHA + GTM to first interaction. Worth roughly +4 points.
- No Google Search Console verification on any page; sitemap not yet submitted.
- Thin content: /Beer-list/ (~95 words, tap list is a third-party embed),
  /tip/ (~74), /group-events/ (~191 vs the 500 target for a commercial page).
- `/Beer-list/` keeps its uppercase B (consistent across all refs + sitemap;
  changing a live indexed URL needs redirects — deliberately left alone).
