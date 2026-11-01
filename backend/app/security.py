"""API authentication.

The server is a single-player System, but once it's on the public internet
anyone with the URL could complete quests, rename the hunter, or wipe progress.
A shared bearer token gates every endpoint except /health.

Set ARISE_API_TOKEN in the server's environment to enable auth. Left unset
(local development), auth is disabled so the dev loop stays frictionless.

The deployed server runs tokenless with Tailscale as the boundary, but uvicorn
binds 0.0.0.0 — so without `is_trusted_client` anyone on the same Wi-Fi reached
the whole API with no auth at all. Binding to the tailnet IP instead would fail
whenever launchd starts the backend before Tailscale is up, and would break the
`curl localhost:8000` recipes in DEPLOY.md, so the filter happens per request.
"""

import ipaddress
import os
import secrets

from fastapi import Header, HTTPException

API_TOKEN = os.environ.get("ARISE_API_TOKEN", "")

# Tailscale hands out addresses from the CGNAT range and its own ULA prefix.
TRUSTED_NETWORKS = (
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("fd7a:115c:a1e0::/48"),
)


def is_trusted_client(host: str | None) -> bool:
    """Whether a peer address is this Mac itself or a device on the tailnet.

    Anything that isn't a parseable IP is refused: uvicorn always reports one for
    a TCP peer, so a missing or odd host means we can't tell where it came from."""
    if not host:
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_loopback or any(ip in net for net in TRUSTED_NETWORKS)


def verify_token(authorization: str | None = Header(default=None)) -> None:
    if not API_TOKEN:
        return  # auth disabled (local dev)

    expected = f"Bearer {API_TOKEN}"
    # constant-time compare so a wrong token can't be guessed by timing.
    if authorization is None or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing API token")
