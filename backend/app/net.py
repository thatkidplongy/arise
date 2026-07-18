"""Tiny stdlib HTTP helpers — the one place the app talks to the network.

Every outbound call (Open Food/Beauty Facts, Open Library, Supadata, Gemini) went
through the same urllib dance: build a Request, urlopen with a timeout, json.load
the response. That boilerplate lived in five modules; it lives here now. Only the
standard library is used, so this runs under launchd with no extra dependencies.

Callers still own their URLs, params, headers and parsing — and still let any
transport/parse error propagate, so each route can turn it into a clean message.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request


def get_json(url: str, params: dict | None = None, headers: dict | None = None,
             timeout: float = 8.0) -> dict:
    """GET `url` (with optional query `params`) and decode the JSON body."""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def post_json(url: str, body: dict, headers: dict | None = None,
              timeout: float = 20.0, retries: int = 0, backoff: float = 2.0) -> dict:
    """POST `body` as JSON to `url` and decode the JSON response.

    `retries` > 0 retries only on HTTP 429 (Too Many Requests) with a linear
    backoff — Gemini's free tier rate-limits bursts, and a short wait clears it."""
    merged = {"content-type": "application/json", **(headers or {})}
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            url, data=json.dumps(body).encode(), headers=merged, method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries:
                time.sleep(backoff * (attempt + 1))
                continue
            raise
