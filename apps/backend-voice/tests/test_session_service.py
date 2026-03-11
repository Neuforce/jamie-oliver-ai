"""Tests for session service functionality."""

import pytest
from src.services import session_service
from src.services.session_service import SessionService
from unittest.mock import MagicMock


def test_assistant_registration_and_retrieval(session_id, mock_assistant):
    """Test assistant registration and retrieval."""
    # Register assistant
    session_service.register_assistant(session_id, mock_assistant)
    
    # Retrieve assistant
    retrieved = session_service.get_assistant(session_id)
    
    assert retrieved is mock_assistant
    assert retrieved == mock_assistant


def test_get_assistant_returns_none_when_not_registered():
    """Test that get_assistant returns None when assistant not registered."""
    # Use a unique session ID that hasn't been used
    unique_session_id = "test-session-unique-999"
    retrieved = session_service.get_assistant(unique_session_id)
    
    assert retrieved is None


@pytest.mark.asyncio
async def test_cleanup_removes_assistant_reference(session_id, mock_assistant):
    """Test that cleanup removes assistant reference."""
    # Register assistant
    session_service.register_assistant(session_id, mock_assistant)
    
    # Verify it's registered
    assert session_service.get_assistant(session_id) is mock_assistant
    
    # Cleanup session
    await session_service.cleanup_session(session_id)
    
    # Verify assistant reference is removed
    assert session_service.get_assistant(session_id) is None


class FakePersistedSessionRepository:
    def __init__(self):
        self.created_payload = None
        self.updated_payload = None
        self.session = None

    def find_active_session(self, user_id, recipe_id):
        return self.session

    def create_session(self, payload):
        self.created_payload = payload
        self.session = payload | {"status": "active"}
        return self.session

    def get_session(self, session_id):
        if self.session and self.session["id"] == session_id:
            return self.session
        return None

    def update_session(self, session_id, updates):
        self.updated_payload = (session_id, updates)
        if not self.session or self.session["id"] != session_id:
            return None
        self.session = self.session | updates
        return self.session


def test_create_or_resume_persisted_session_reuses_existing_record():
    repository = FakePersistedSessionRepository()
    repository.session = {"id": "existing-session", "user_id": "user-1", "recipe_id": "recipe-1", "status": "paused"}
    service = SessionService(persisted_session_repository=repository)

    session = service.create_or_resume_persisted_session(user_id="user-1", recipe_id="recipe-1")

    assert session["id"] == "existing-session"
    assert repository.created_payload is None


def test_create_or_resume_persisted_session_creates_new_record():
    repository = FakePersistedSessionRepository()
    service = SessionService(persisted_session_repository=repository)

    session = service.create_or_resume_persisted_session(user_id="user-1", recipe_id="recipe-1", entitlement_id="ent-1")

    assert session["user_id"] == "user-1"
    assert session["recipe_id"] == "recipe-1"
    assert session["entitlement_id"] == "ent-1"
    assert repository.created_payload is not None


def test_save_session_snapshot_updates_repository():
    repository = FakePersistedSessionRepository()
    repository.session = {"id": "sess-1", "user_id": "user-1", "recipe_id": "recipe-1", "status": "active"}
    service = SessionService(persisted_session_repository=repository)

    updated = service.save_session_snapshot(
        "sess-1",
        current_step_index=3,
        completed_step_ids=["prep", "cook"],
        timer_state={"running": True},
        status="paused",
    )

    assert updated["status"] == "paused"
    assert repository.updated_payload is not None

