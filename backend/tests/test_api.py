"""Integration tests for ZapCards API."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "zapcards-backend"
    assert "status" in data


@pytest.mark.asyncio
async def test_create_note(client: AsyncClient):
    response = await client.post(
        "/api/notes",
        json={"title": "Test Note", "content_md": "# Hello\nThis is a test.", "area": "Testing", "tags": ["python", "test"]},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Note"
    assert data["content_md"] == "# Hello\nThis is a test."
    assert data["area"] == "Testing"
    assert len(data["tags"]) == 2
    assert data["tags"][0]["name"] in ("python", "test")
    assert "id" in data


@pytest.mark.asyncio
async def test_list_notes(client: AsyncClient):
    await client.post("/api/notes", json={"title": "Note 1", "content_md": "Content 1"})
    await client.post("/api/notes", json={"title": "Note 2", "content_md": "Content 2", "area": "Science"})

    response = await client.get("/api/notes")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2

    response = await client.get("/api/notes", params={"area": "Science"})
    assert len(response.json()) == 1

    response = await client.get("/api/notes", params={"search": "Content 1"})
    assert len(response.json()) == 1


@pytest.mark.asyncio
async def test_get_note_not_found(client: AsyncClient):
    response = await client.get("/api/notes/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_note(client: AsyncClient):
    create_resp = await client.post("/api/notes", json={"title": "Original", "content_md": "Original content"})
    note_id = create_resp.json()["id"]

    response = await client.patch(
        f"/api/notes/{note_id}",
        json={"title": "Updated", "content_md": "Updated content", "area": "Updated Area"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated"
    assert data["content_md"] == "Updated content"
    assert data["area"] == "Updated Area"


@pytest.mark.asyncio
async def test_delete_note(client: AsyncClient):
    create_resp = await client.post("/api/notes", json={"title": "To Delete"})
    note_id = create_resp.json()["id"]

    response = await client.delete(f"/api/notes/{note_id}")
    assert response.status_code == 204

    response = await client.get(f"/api/notes/{note_id}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_tags(client: AsyncClient):
    await client.post("/api/notes", json={"title": "N", "tags": ["tag-a", "tag-b"]})
    await client.post("/api/notes", json={"title": "N2", "tags": ["tag-b", "tag-c"]})

    response = await client.get("/api/notes/tags")
    assert response.status_code == 200
    data = response.json()
    tag_names = {t["name"] for t in data}
    assert "tag-a" in tag_names
    assert "tag-b" in tag_names
    assert "tag-c" in tag_names


@pytest.mark.asyncio
async def test_link_notes(client: AsyncClient):
    n1 = await client.post("/api/notes", json={"title": "Note A"})
    n2 = await client.post("/api/notes", json={"title": "Note B"})
    id1 = n1.json()["id"]
    id2 = n2.json()["id"]

    response = await client.post(f"/api/notes/{id1}/link/{id2}")
    assert response.status_code == 201
    assert response.json()["status"] == "linked"

    response = await client.post(f"/api/notes/{id1}/link/{id2}")
    assert response.json()["status"] == "already_linked"

    response = await client.delete(f"/api/notes/{id1}/link/{id2}")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_graph_data(client: AsyncClient):
    n1 = await client.post("/api/notes", json={"title": "Node 1"})
    n2 = await client.post("/api/notes", json={"title": "Node 2"})
    id1 = n1.json()["id"]
    id2 = n2.json()["id"]
    await client.post(f"/api/notes/{id1}/link/{id2}")

    response = await client.get("/api/notes/graph/data")
    assert response.status_code == 200
    data = response.json()
    assert len(data["nodes"]) == 2
    assert len(data["edges"]) == 1


@pytest.mark.asyncio
async def test_chat_no_embeddings(client: AsyncClient):
    response = await client.post("/api/chat", json={"content": "What is this?"})
    assert response.status_code == 200
    data = response.json()
    assert "Nao encontrei" in data["content"] or "Nao tenho" in data["content"]
    assert "sources" in data


@pytest.mark.asyncio
async def test_auth_register(client: AsyncClient):
    response = await client.post(
        "/api/auth/register",
        json={"name": "Test User", "email": "test@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["name"] == "Test User"
    assert data["user"]["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_auth_login(client: AsyncClient):
    await client.post(
        "/api/auth/register",
        json={"name": "Login User", "email": "login@example.com", "password": "securepass"},
    )

    response = await client.post(
        "/api/auth/login",
        json={"email": "login@example.com", "password": "securepass"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "login@example.com"


@pytest.mark.asyncio
async def test_auth_login_wrong_password(client: AsyncClient):
    await client.post(
        "/api/auth/register",
        json={"name": "User", "email": "wrong@example.com", "password": "correct"},
    )

    response = await client.post(
        "/api/auth/login",
        json={"email": "wrong@example.com", "password": "incorrect"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_auth_me(client: AsyncClient):
    register_resp = await client.post(
        "/api/auth/register",
        json={"name": "Me User", "email": "me@example.com", "password": "test123"},
    )
    token = register_resp.json()["access_token"]

    response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"


@pytest.mark.asyncio
async def test_flashcards_list_empty(client: AsyncClient):
    response = await client.get("/api/flashcards")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_import_invalid_file(client: AsyncClient):
    response = await client.post("/api/notes/import")
    assert response.status_code in (400, 422)
