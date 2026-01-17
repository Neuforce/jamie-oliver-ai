"""
Tests for custom exception classes.

Validates proper exception creation, serialization, and inheritance.
"""

import pytest
from src.exceptions import (
    JamieBackendError,
    SessionNotFoundError,
    SessionExpiredError,
    SessionAlreadyActiveError,
    RecipeEngineError,
    RecipeNotFoundError,
    RecipeNotLoadedError,
    RecipeValidationError,
    StepNotFoundError,
    StepNotReadyError,
    StepBlockedError,
    StepAlreadyActiveError,
    StepAlreadyCompletedError,
    TimerNotFoundError,
    TimerAlreadyRunningError,
    TimerNotRunningError,
    TimerActiveError,
    ToolExecutionError,
    ToolInvalidArgumentError,
    ToolPreconditionError,
    WebSocketError,
    WebSocketConnectionError,
    WebSocketMessageError,
)


class TestExceptionHierarchy:
    """Tests for exception class hierarchy."""
    
    def test_all_inherit_from_base(self):
        """All custom exceptions inherit from JamieBackendError."""
        exceptions = [
            SessionNotFoundError("sess123"),
            RecipeNotFoundError("recipe123"),
            StepNotFoundError("step123"),
            TimerNotFoundError("timer123"),
            ToolInvalidArgumentError("tool", "arg", "reason"),
            WebSocketConnectionError("reason"),
        ]
        
        for exc in exceptions:
            assert isinstance(exc, JamieBackendError)
            assert isinstance(exc, Exception)
    
    def test_session_errors_hierarchy(self):
        """Session errors inherit from SessionError."""
        from src.exceptions import SessionError
        
        assert issubclass(SessionNotFoundError, SessionError)
        assert issubclass(SessionExpiredError, SessionError)
        assert issubclass(SessionAlreadyActiveError, SessionError)
    
    def test_step_errors_hierarchy(self):
        """Step errors inherit from StepError."""
        from src.exceptions import StepError
        
        assert issubclass(StepNotFoundError, StepError)
        assert issubclass(StepNotReadyError, StepError)
        assert issubclass(StepBlockedError, StepError)
        assert issubclass(StepAlreadyActiveError, StepError)
        assert issubclass(StepAlreadyCompletedError, StepError)


class TestExceptionSerialization:
    """Tests for exception to_dict() method."""
    
    def test_base_exception_to_dict(self):
        """Base exception serializes correctly."""
        exc = JamieBackendError(
            message="Something went wrong",
            error_code="CUSTOM_ERROR",
            context={"key": "value"}
        )
        
        result = exc.to_dict()
        
        assert result["error"] == "CUSTOM_ERROR"
        assert result["message"] == "Something went wrong"
        assert result["context"] == {"key": "value"}
    
    def test_session_not_found_to_dict(self):
        """SessionNotFoundError includes session_id in context."""
        exc = SessionNotFoundError("sess_12345")
        result = exc.to_dict()
        
        assert result["error"] == "SESSION_NOT_FOUND"
        assert "sess_12345" in result["message"]
        assert result["context"]["session_id"] == "sess_12345"
    
    def test_step_blocked_to_dict(self):
        """StepBlockedError includes blocking steps in context."""
        exc = StepBlockedError(
            step_id="cook_risotto",
            blocked_by=["roast_squash", "prep_veg"]
        )
        result = exc.to_dict()
        
        assert result["error"] == "STEP_BLOCKED"
        assert result["context"]["blocked_by"] == ["roast_squash", "prep_veg"]
    
    def test_timer_active_to_dict(self):
        """TimerActiveError includes timer details."""
        exc = TimerActiveError(
            step_id="roast_squash",
            timer_id="timer_roast_squash",
            remaining_secs=1500
        )
        result = exc.to_dict()
        
        assert result["error"] == "TIMER_ACTIVE"
        assert result["context"]["remaining_secs"] == 1500


class TestExceptionMessages:
    """Tests for exception message formatting."""
    
    def test_session_not_found_message(self):
        """SessionNotFoundError has clear message."""
        exc = SessionNotFoundError("sess123")
        assert "sess123" in str(exc)
        assert exc.session_id == "sess123"
    
    def test_recipe_not_loaded_message(self):
        """RecipeNotLoadedError suggests calling start_recipe()."""
        exc = RecipeNotLoadedError()
        assert "start_recipe()" in str(exc)
    
    def test_step_not_ready_message(self):
        """StepNotReadyError includes status information."""
        exc = StepNotReadyError(
            step_id="cook_risotto",
            current_status="pending",
            required_status="ready"
        )
        
        assert "pending" in str(exc)
        assert "ready" in str(exc)
        assert exc.current_status == "pending"
    
    def test_custom_message_override(self):
        """Custom message overrides default."""
        exc = StepNotFoundError(
            step_id="unknown",
            message="Custom error message"
        )
        
        assert str(exc) == "Custom error message"


class TestToolExceptions:
    """Tests for tool-related exceptions."""
    
    def test_tool_invalid_argument(self):
        """ToolInvalidArgumentError captures argument details."""
        exc = ToolInvalidArgumentError(
            tool_name="start_step",
            argument="step_id",
            reason="Step ID cannot be empty"
        )
        
        assert exc.tool_name == "start_step"
        assert exc.argument == "step_id"
        assert "empty" in str(exc)
    
    def test_tool_precondition_with_state(self):
        """ToolPreconditionError can include current state."""
        exc = ToolPreconditionError(
            tool_name="confirm_step_done",
            precondition="Step must be ACTIVE",
            current_state={
                "step_status": "pending",
                "active_step": None
            }
        )
        
        result = exc.to_dict()
        assert result["context"]["current_state"]["step_status"] == "pending"


class TestExceptionUsagePatterns:
    """Tests for common exception usage patterns."""
    
    def test_exception_can_be_raised_and_caught(self):
        """Exceptions can be used in try/except blocks."""
        def risky_function():
            raise SessionNotFoundError("sess123")
        
        with pytest.raises(SessionNotFoundError) as exc_info:
            risky_function()
        
        assert exc_info.value.session_id == "sess123"
    
    def test_exception_can_be_caught_by_parent(self):
        """Specific exceptions can be caught by parent class."""
        def risky_function():
            raise StepNotFoundError("step_1")
        
        # Can catch by specific type
        with pytest.raises(StepNotFoundError):
            risky_function()
        
        # Can also catch by parent type
        try:
            risky_function()
        except JamieBackendError as e:
            assert isinstance(e, StepNotFoundError)
    
    def test_exception_attributes_accessible(self):
        """Exception attributes are accessible for error handling."""
        exc = StepBlockedError(
            step_id="cook_risotto",
            blocked_by=["roast_squash", "prep_veg"]
        )
        
        # Attributes are accessible
        assert exc.step_id == "cook_risotto"
        assert "roast_squash" in exc.blocked_by
        
        # Can iterate blockers
        for blocker in exc.blocked_by:
            assert isinstance(blocker, str)
