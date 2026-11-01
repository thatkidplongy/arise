"""The per-request network guard: only this Mac and the tailnet reach the API."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.security import is_trusted_client


@pytest.mark.parametrize(
    "host",
    [
        "127.0.0.1",
        "::1",
        "100.72.240.79",
        "100.64.0.1",
        "100.127.255.254",
        "fd7a:115c:a1e0::d43b:f050",
        "::ffff:127.0.0.1",
    ],
)
def test_trusts_loopback_and_tailnet(host):
    assert is_trusted_client(host)


@pytest.mark.parametrize(
    "host",
    [
        "192.168.1.20",
        "10.0.0.5",
        "172.16.4.4",
        "100.128.0.1",
        "8.8.8.8",
        "fe80::1",
        "::ffff:192.168.1.20",
        "testclient",
        "",
        None,
    ],
)
def test_refuses_everything_else(host):
    assert not is_trusted_client(host)


def test_lan_peer_is_refused_before_any_route(client):
    with TestClient(app, client=("192.168.1.20", 50000)) as lan:
        assert lan.get("/health").status_code == 403
        assert lan.get("/state").status_code == 403


def test_local_peer_still_gets_through(client):
    assert client.get("/health").status_code == 200
