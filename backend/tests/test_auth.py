from datetime import timedelta

from app.core.security import create_token
from tests.conftest import login, register


def test_register_and_login(client):
    resp = register(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "user@example.com"
    assert body["role"] == "user"
    assert "password_hash" not in body

    resp = login(client)
    assert resp.status_code == 200
    tokens = resp.json()
    assert tokens["token_type"] == "bearer"
    assert tokens["access_token"] and tokens["refresh_token"]


def test_duplicate_email_is_case_insensitive(client):
    assert register(client, email="Dup@Example.com").status_code == 201
    resp = register(client, email="dup@example.com")
    assert resp.status_code == 409
    # Logging in with different casing finds the same account.
    assert login(client, email="DUP@example.com").status_code == 200


def test_register_validation_does_not_echo_password(client):
    resp = register(client, password="Zq9#")
    assert resp.status_code == 422
    assert "Zq9#" not in resp.text
    assert resp.json()["detail"][0]["loc"] == ["body", "password"]

    assert register(client, name="   ").status_code == 422
    assert register(client, email="not-an-email").status_code == 422
    assert register(client, name="x" * 129).status_code == 422


def test_login_failures_are_indistinguishable(client):
    register(client)
    wrong_password = login(client, password="WrongPassword!")
    unknown_user = login(client, email="nobody@example.com")
    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()


def test_me_requires_valid_access_token(client, auth_headers):
    resp = client.get("/api/v1/users/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "user@example.com"

    assert client.get("/api/v1/users/me").status_code == 401
    assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_expired_access_token_is_rejected(client, auth_headers):
    me = client.get("/api/v1/users/me", headers=auth_headers).json()
    expired = create_token(me["id"], "access", expires_delta=timedelta(seconds=-1))
    assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_refresh_flow_and_token_type_separation(client):
    register(client)
    tokens = login(client).json()

    # A refresh token must not be usable as an access token, and vice versa.
    assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}).status_code == 401
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["access_token"]}).status_code == 401

    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 200
    new_access = resp.json()["access_token"]
    assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {new_access}"}).status_code == 200


def test_token_for_deleted_user_is_rejected(client):
    token = create_token("00000000-0000-0000-0000-000000000000", "access")
    assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_logout_revokes_access_and_refresh_tokens(client):
    register(client)
    first = login(client).json()
    second = login(client).json()  # e.g. another device
    headers = {"Authorization": f"Bearer {first['access_token']}"}

    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204

    for tokens in (first, second):
        assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}).status_code == 401
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
    # Logging in again issues working tokens.
    fresh = login(client).json()
    assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {fresh['access_token']}"}).status_code == 200
