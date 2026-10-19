# Line diagram (v3)

The city's diagram `schema-linek-MHD.pdf` → `pdftocairo -svg schema-linek-MHD.pdf schema.svg`, then:

- `python3 clean.py schema.svg ../../public/schema/linky.svg` strips it to lines, stops and names
  (legend, logo, QR code, pictograms, roads, railway, water, landmarks and other towns go).
- `python3 lines.py schema.svg ../.. ../../src/v3/schemaPaths.json` traces each route between consecutive stops
  along the diagram's strokes of its colour (pairs it cannot trace are drawn straight by the app).

Stop positions (`src/v3/schemaStops.json`) were read from the stop dots and checked by eye.
