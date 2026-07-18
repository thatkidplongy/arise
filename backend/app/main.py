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

    @app.get("/{path:path}")
    def web_app(path: str):
        candidate = WEB_DIR / path
        if path and candidate.is_file():
            # version.json is polled to detect new builds — never cache it.
            if path == "version.json":
                return FileResponse(candidate, headers={"Cache-Control": "no-cache"})
            return FileResponse(candidate)
        # The SPA shell must always revalidate so a reload (or the app's own
        # pull-to-reload) picks up a fresh build — the JS bundles it points to are
        # content-hashed and safe to cache forever.
        return FileResponse(WEB_DIR / "index.html", headers={"Cache-Control": "no-cache"})
