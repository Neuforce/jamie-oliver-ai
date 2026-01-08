"""Tests for session service functionality."""

import pytest
from src.services import session_service
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

