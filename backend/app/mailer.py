"""Send one email via Resend's HTTP API — the digest's only way out of the Mac.

Resend is a hosted send API: we POST the message as JSON and it does the delivery.
The free tier is 100/day, and `onboarding@resend.dev` is their shared sender, so
this works without owning a domain. Three vars configure it — with any of them
missing, `enabled()` is False and the digest simply never sends, the same contract
as llm.py and transcript.py.

Home IPs get filtered hard, which is why this is an API call and not smtplib.
Network I/O goes through `net`; standard library only, so it runs under launchd
with no extra deps.
"""

import os

from . import net

_ENDPOINT = "https://api.resend.com/emails"

# Resend's shared testing sender — deliverable with no domain of your own. Set
# ARISE_DIGEST_FROM once you have a verified domain of your own to send from.
_DEFAULT_FROM = "Arise <onboarding@resend.dev>"

_USER_AGENT = "arise/1.0"


def _api_key() -> str:
    return os.environ.get("ARISE_RESEND_API_KEY", "")


def _to_address() -> str:
    return os.environ.get("ARISE_DIGEST_TO", "")


def _from_address() -> str:
    return os.environ.get("ARISE_DIGEST_FROM", "") or _DEFAULT_FROM


def enabled() -> bool:
    """True only when there's both a key and somewhere to send. Otherwise the
    digest feature hides and the nightly job exits quietly."""
    return bool(_api_key() and _to_address())


def send(subject: str, html: str, text: str, timeout: float = 20.0) -> dict:
    """Send one email. Returns Resend's response ({"id": ...}).

    Raises ValueError when unconfigured, and lets any transport error propagate so
    the caller can record why a digest didn't go out."""
    if not enabled():
        raise ValueError("no Resend key or recipient")
    body = {
        "from": _from_address(),
        "to": [_to_address()],
        "subject": subject,
        "html": html,
        "text": text,  # a plain-text part keeps it out of spam and readable anywhere
    }
    return net.post_json(
        _ENDPOINT,
        body,
        headers={
            "authorization": f"Bearer {_api_key()}",
            # Resend sits behind Cloudflare, which rejects urllib's default
            # "Python-urllib/3.x" agent outright (403, Cloudflare error 1010)
            # before the request reaches the API. Naming ourselves clears it.
            "user-agent": _USER_AGENT,
        },
        timeout=timeout,
        retries=2,
    )
