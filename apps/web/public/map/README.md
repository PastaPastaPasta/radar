# Map basemap data

Self-hosted, so the map loads nothing from a third-party CDN or tile server. Copied unchanged from
[dash-nodes](https://github.com/PastaPastaPasta/dash-nodes) (`web/assets/map/`, MIT).

- `world-low.json`, `world-high.json`, `places.json`: built from [Natural Earth](https://www.naturalearthdata.com)
  (public domain) by dash-nodes' `tools/basemap.py`. `world-low.json` (1:110m) draws below zoom 3.2; `world-high.json`
  (1:50m, with lakes and state lines) loads once someone zooms in; `places.json` holds the country and city labels.
- `glyphs/`: Noto Sans map label glyphs from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets),
  SIL Open Font License 1.1.
