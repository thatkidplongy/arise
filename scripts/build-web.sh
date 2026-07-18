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

# maximum-scale=1 + user-scalable=no stop iOS Safari from auto-zooming into any
# input/button whose font is under 16px (our compact fields). We deliberately do
# NOT set viewport-fit=cover — it extends the page under the home indicator and
# exposes the white document background below the tab bar.
VIEWPORT = ('<meta name="viewport" content="width=device-width, initial-scale=1, '
            'maximum-scale=1, user-scalable=no"/>')

for html in pathlib.Path("dist").glob("**/*.html"):
    text = html.read_text()
    if re.search(r'<meta[^>]*name="viewport"[^>]*/?>', text):
        text = re.sub(r'<meta[^>]*name="viewport"[^>]*/?>', VIEWPORT, text, count=1)
    elif re.search(r"<head[^>]*>", text):
        text = re.sub(r"(<head[^>]*>)", r"\1" + VIEWPORT, text, count=1)
    if "apple-mobile-web-app-capable" not in text:
        text = re.sub(r"(<head[^>]*>)", r"\1" + META, text, count=1)
    html.write_text(text)
PY

echo "✔ Web app built to dist/ (installable). The always-on backend serves it."
