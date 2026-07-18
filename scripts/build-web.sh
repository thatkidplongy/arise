#!/usr/bin/env bash
# Build the static web app and make it installable to an iOS/Android home screen.
# Run from the repo root:  ./scripts/build-web.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▸ Exporting web build…"
npx expo export --platform web

echo "▸ Generating home-screen icon…"
# 180x180 is the size iOS uses for apple-touch-icon.
sips -z 180 180 assets/images/icon.png --out dist/apple-touch-icon.png >/dev/null

echo "▸ Injecting PWA meta tags…"
python3 - <<'PY'
import pathlib, re

META = """
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<meta name="apple-mobile-web-app-title" content="Arise"/>
<meta name="theme-color" content="#05070D"/>
<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
"""

for html in pathlib.Path("dist").glob("**/*.html"):
    text = html.read_text()
    if "apple-mobile-web-app-capable" in text:
        continue  # already injected
    # Insert right after the opening <head> tag.
    new = re.sub(r"(<head[^>]*>)", r"\1" + META, text, count=1)
    html.write_text(new)
PY

echo "✔ Web app built to dist/ (installable). The always-on backend serves it."
