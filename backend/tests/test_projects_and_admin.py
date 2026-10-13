def test_project_crud_and_isolation(client, make_user):
    alice = make_user("alice@example.com")
    bob = make_user("bob@example.com")

    resp = client.post("/api/v1/projects", json={"name": "  Demo  ", "description": "d"}, headers=alice)
    assert resp.status_code == 201
    project = resp.json()
    assert project["name"] == "Demo"

    assert [p["id"] for p in client.get("/api/v1/projects", headers=alice).json()] == [project["id"]]
    assert client.get("/api/v1/projects", headers=bob).json() == []
    assert client.get(f"/api/v1/projects/{project['id']}", headers=bob).status_code == 404
    assert client.delete(f"/api/v1/projects/{project['id']}", headers=bob).status_code == 404
    assert client.post("/api/v1/projects", json={"name": ""}, headers=alice).status_code == 422


def test_deleting_project_keeps_its_jobs(client, auth_headers):
    project_id = client.post("/api/v1/projects", json={"name": "P"}, headers=auth_headers).json()["id"]
    job_id = client.post(
        "/api/v1/jobs",
        json={"language": "python", "source_code": "print(1)", "project_id": project_id},
        headers=auth_headers,
    ).json()["job_id"]

    assert client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers).status_code == 204
    job = client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers).json()
    assert job["project_id"] is None


def test_admin_endpoints_require_admin(client, auth_headers, make_admin):
    assert client.get("/api/v1/users", headers=auth_headers).status_code == 403

    admin = make_admin()
    users = client.get("/api/v1/users", headers=admin).json()
    assert {u["email"] for u in users} == {"user@example.com", "admin@example.com"}

    target = next(u for u in users if u["email"] == "user@example.com")
    resp = client.patch(f"/api/v1/users/{target['id']}/role", json={"role": "admin"}, headers=admin)
    assert resp.status_code == 200 and resp.json()["role"] == "admin"
    # The promoted user's existing token now carries admin rights (role is read per request).
    assert client.get("/api/v1/users", headers=auth_headers).status_code == 200


def test_admin_cannot_demote_self(client, make_admin):
    admin = make_admin()
    me = client.get("/api/v1/users/me", headers=admin).json()
    resp = client.patch(f"/api/v1/users/{me['id']}/role", json={"role": "user"}, headers=admin)
    assert resp.status_code == 400
