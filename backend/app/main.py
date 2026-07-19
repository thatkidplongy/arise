import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import Base, SessionLocal, engine, ensure_schema
from .routes import router
from .security import verify_token
from .seed import seed_quests

# The exported web app (../../dist relative to this file: arise/dist).
WEB_DIR = Path(__file__).resolve().parents[2] / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    ensure_schema()
    with SessionLocal() as db:
        seed_quests(db)
    yield


app = FastAPI(
    title="Arise — The System API",
    description="The brain behind the System. Interactive docs below.",
    version="1.0.0",
    lifespan=lifespan,
)

# The app is served from Expo (different origin), so allow cross-origin calls.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    """Open, unauthenticated — for uptime checks and reachability probes."""
    return {"status": "ok", "system": "arise"}


@app.get("/version")
def version() -> dict:
    """The build id (the content-hashed entry bundle) currently served. The web app
    polls this on open and silently reloads its code when it differs from what's
    running, so a new build reaches you without a manual refresh. Open, like /health."""
    idx = WEB_DIR / "index.html"
    if not idx.is_file():
        return {"build": ""}
    m = re.search(r"entry-[a-f0-9]+\.js", idx.read_text())
    return {"build": m.group(0) if m else ""}


# Everything else requires the bearer token (when ARISE_API_TOKEN is set).
app.include_router(router, dependencies=[Depends(verify_token)])

# Serve the built web app, if it's been exported. The app is same-origin with
# the API here, so it auto-connects with no setup. Assets are served from their
# real paths; every other GET falls back to index.html so client-side routes
# (/quests, /settings, …) survive a refresh or deep link (SPA fallback).
if WEB_DIR.is_dir():
    for sub in ("_expo", "assets"):
        if (WEB_DIR / sub).is_dir():
            app.mount(f"/{sub}", StaticFiles(directory=WEB_DIR / sub), name=sub)

    web_root = WEB_DIR.resolve()

    def _within_root(p: Path) -> Path | None:
        """Resolve a candidate under the web dir, or None if it escapes it."""
        rp = (WEB_DIR / p).resolve()
        return rp if rp == web_root or web_root in rp.parents else None

    @app.get("/{path:path}")
    def web_app(path: str):
        # A real file (favicon, manifest, …); hashed JS/CSS is served by the mounts.
        asset = _within_root(Path(path)) if path else None
        if asset and asset.is_file():
            return FileResponse(asset)
        # A statically-exported route page: /quests -> quests.html. Serving the
        # right shell means a refresh or deep link boots on that screen — so the
        # active tab matches the URL instead of always resetting to Status.
        if path:
            page = _within_root(Path(f"{path.rstrip('/')}.html"))
            if page and page.is_file():
                return FileResponse(page, headers={"Cache-Control": "no-cache"})
        # Unknown route: the SPA shell (client router resolves it). Always
        # revalidates so a fresh launch picks up a new build — the JS bundles it
        # points to are content-hashed and safe to cache.
        return FileResponse(WEB_DIR / "index.html", headers={"Cache-Control": "no-cache"})
