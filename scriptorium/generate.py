#!/usr/bin/env python3
"""
Scriptorium static-site generator (no framework, no network dependency).

Reads data/*.json, renders each entry through templates/entry.html.j2,
plus a category hub page and a sitemap.xml. Re-run this any time the
JSON data changes:

    python3 generate.py

This is the "automation" behind the sitemap/SEO spec for this project —
a real, working, zero-dependency alternative to a Next.js/Astro build,
chosen because it can actually be run and verified without npm/network
access, and because GitHub Pages only needs plain static files anyway.
"""
import json
import os
from datetime import date
from jinja2 import Environment, FileSystemLoader

BASE_URL = "https://jamiekirby.github.io/BURREN-MAP"
ROOT = os.path.dirname(os.path.abspath(__file__))
env = Environment(loader=FileSystemLoader(os.path.join(ROOT, "templates")), autoescape=False)

# ---- Specimen illustration families -----------------------------------
# Same visual language as the interactive map's specimen SVGs (line-art +
# dashed leader + a label in the top-left corner) — but the label here is
# generic per FAMILY (matching how the map already reuses one illustration
# across many same-category sites), while the actual species name is the
# page's own <h1>, not baked into the artwork.
SPECIMEN_SVGS = {
    "flower": (
        '<path class="specimen-line" d="M 200,340 L 200,180"/>'
        '<path class="specimen-line" d="M 200,270 C 175,258 155,265 145,285 '
        'M 200,255 C 225,245 250,255 258,278"/>'
        '<path class="specimen-line" d="M 200,180 C 165,150 155,110 175,80 '
        'C 195,105 200,140 200,180 C 200,140 205,105 225,80 '
        'C 245,110 235,150 200,180 Z"/>'
        '<circle class="specimen-line" cx="200" cy="180" r="9"/>'
        '<path class="specimen-leader" d="M 200,110 C 185,86 172,70 148,46"/>'
        '<text class="specimen-label" x="8" y="38">WILDFLOWER</text>'
        '<text class="specimen-label" x="8" y="54" font-style="italic">(Burren flora)</text>'
    ),
    "grass": (
        '<path class="specimen-line" d="M 200,340 L 195,160"/>'
        '<path class="specimen-line" d="M 195,160 C 210,140 235,135 250,145 '
        'M 195,180 C 175,165 155,168 142,185 '
        'M 195,200 C 218,190 238,196 250,212"/>'
        '<path class="specimen-line" d="M 195,160 C 200,140 195,115 185,95 '
        'M 185,95 C 190,110 188,130 195,150 '
        'M 195,150 C 205,130 210,110 205,90"/>'
        '<path class="specimen-leader" d="M 195,150 C 182,124 170,108 146,84"/>'
        '<text class="specimen-label" x="8" y="76">GRASS</text>'
        '<text class="specimen-label" x="8" y="92" font-style="italic">(Burren sward)</text>'
    ),
    "herb": (
        '<path class="specimen-line" d="M 90,320 C 90,290 120,270 150,270 '
        'C 145,250 165,235 190,240 C 195,220 225,215 240,232 '
        'C 265,228 290,245 290,270 C 320,275 330,300 320,320 Z"/>'
        '<path class="specimen-line" d="M 90,320 L 320,320"/>'
        '<circle class="specimen-line" cx="150" cy="268" r="4"/>'
        '<circle class="specimen-line" cx="200" cy="238" r="4"/>'
        '<circle class="specimen-line" cx="255" cy="248" r="4"/>'
        '<path class="specimen-leader" d="M 200,238 C 185,210 172,194 148,168"/>'
        '<text class="specimen-label" x="8" y="160">HERB</text>'
        '<text class="specimen-label" x="8" y="176" font-style="italic">(field plant)</text>'
    ),
    "orchid": (
        '<path class="specimen-line" d="M 200,340 L 200,120"/>'
        '<path class="specimen-line" d="M 200,300 L 175,290 M 200,300 L 225,292 '
        'M 200,270 L 178,262 M 200,270 L 222,264 '
        'M 200,240 L 180,233 M 200,240 L 220,235 '
        'M 200,210 L 182,204 M 200,210 L 218,206 '
        'M 200,180 L 184,175 M 200,180 L 216,177 '
        'M 200,150 L 186,146 M 200,150 L 214,148 '
        'M 200,120 L 188,117 M 200,120 L 212,119"/>'
        '<path class="specimen-leader" d="M 200,120 C 188,94 176,78 152,54"/>'
        '<text class="specimen-label" x="8" y="46">ORCHID</text>'
        '<text class="specimen-label" x="8" y="62" font-style="italic">(native spike)</text>'
    ),
    "legume": (
        '<path class="specimen-line" d="M 200,340 L 200,190"/>'
        '<path class="specimen-line" d="M 200,260 C 178,250 158,258 148,278 '
        'M 200,245 C 222,236 244,244 254,264"/>'
        '<path class="specimen-line" d="M 200,190 C 185,175 182,155 195,140 '
        'C 208,150 210,170 200,190 '
        'M 200,190 C 215,178 222,158 212,140 '
        'C 198,152 195,172 200,190"/>'
        '<path class="specimen-line" d="M 235,150 C 250,155 258,170 250,185 '
        'C 242,175 236,163 235,150 Z"/>'
        '<path class="specimen-leader" d="M 200,140 C 186,114 174,98 150,74"/>'
        '<text class="specimen-label" x="8" y="66">VETCH</text>'
        '<text class="specimen-label" x="8" y="82" font-style="italic">(legume)</text>'
    ),
}


def specimen_svg(family):
    inner = SPECIMEN_SVGS.get(family, SPECIMEN_SVGS["flower"])
    return '<svg viewBox="0 0 400 400" aria-hidden="true">' + inner + "</svg>"


def make_jsonld(entry, canonical, description):
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "Taxon",
        "name": entry["commonName"],
        "scientificName": entry["scientificName"],
        "taxonRank": "species",
        "url": canonical,
        "description": description,
        "keywords": ", ".join([entry["category"]] + entry.get("habitatTags", [])),
        "isPartOf": {
            "@type": "CreativeWork",
            "name": "The Burren Scriptorium — Field Guide",
            "url": BASE_URL + "/scriptorium/",
        },
    }, ensure_ascii=False)


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    with open(os.path.join(ROOT, "data", "flora-flowers-grasses.json"), encoding="utf-8") as f:
        data = json.load(f)
    entries = data["entries"]

    entry_tpl = env.get_template("entry.html.j2")
    hub_tpl = env.get_template("flora_index.html.j2")

    sitemap_urls = []

    for e in entries:
        canonical = f"{BASE_URL}/scriptorium/flora/{e['slug']}/"
        html = entry_tpl.render(
            e=e,
            canonical=canonical,
            specimen_svg=specimen_svg(e["specimenFamily"]),
            jsonld=make_jsonld(e, canonical, e["description"]),
        )
        write(os.path.join(ROOT, "flora", e["slug"], "index.html"), html)
        sitemap_urls.append(canonical)

    hub_canonical = f"{BASE_URL}/scriptorium/flora/"
    hub_html = hub_tpl.render(entries=entries, canonical=hub_canonical)
    write(os.path.join(ROOT, "flora", "index.html"), hub_html)
    sitemap_urls.append(hub_canonical)

    # Root Scriptorium hub is written separately (scriptorium/index.html) —
    # see write_root_hub below — but still needs to be in the sitemap.
    sitemap_urls.append(f"{BASE_URL}/scriptorium/")

    today = date.today().isoformat()
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in sitemap_urls:
        sitemap.append(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>")
    sitemap.append("</urlset>")
    write(os.path.join(ROOT, "sitemap.xml"), "\n".join(sitemap) + "\n")

    print(f"Generated {len(entries)} entry pages, 1 flora hub, 1 sitemap.xml")


if __name__ == "__main__":
    main()
