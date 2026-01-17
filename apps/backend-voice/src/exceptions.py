"""
Custom exceptions for the Jamie Oliver AI backend.

Provides granular error handling for:
- Recipe engine operations
- Session management
- Timer operations
- Tool execution
"""

from typing import Optional, Dict, Any


class JamieBackendError(Exception):
    """Base exception for all Jamie backend errors."""
    
    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code or "BACKEND_ERROR"
        self.context = context or {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API responses."""
        return {
            "error": self.error_code,
            "message": self.message,
            "context": self.context
        }


# ============================================================
# Session Errors
# ============================================================

class SessionError(JamieBackendError):
    """Base exception for session-related errors."""
    pass


class SessionNotFoundError(SessionError):
    """Raised when a session ID cannot be found."""
    
    def __init__(self, session_id: str, message: Optional[str] = None):
        super().__init__(
            message=message or f"Session not found: {session_id}",
            error_code="SESSION_NOT_FOUND",
            context={"session_id": session_id}
        )
        self.session_id = session_id


class SessionExpiredError(SessionError):
    """Raised when a session has expired."""
    
    def __init__(self, session_id: str, message: Optional[str] = None):
        super().__init__(
            message=message or f"Session expired: {session_id}",
            error_code="SESSION_EXPIRED",
            context={"session_id": session_id}
        )
        self.session_id = session_id


class SessionAlreadyActiveError(SessionError):
    """Raised when trying to create a session that already exists."""
    
    def __init__(self, session_id: str, message: Optional[str] = None):
        super().__init__(
            message=message or f"Session already active: {session_id}",
            error_code="SESSION_ALREADY_ACTIVE",
            context={"session_id": session_id}
        )
        self.session_id = session_id


# ============================================================
# Recipe Engine Errors
# ============================================================

class RecipeEngineError(JamieBackendError):
    """Base exception for recipe engine errors."""
    pass


class RecipeNotFoundError(RecipeEngineError):
    """Raised when a recipe cannot be found."""
    
    def __init__(self, recipe_id: str, message: Optional[str] = None):
        super().__init__(
            message=message or f"Recipe not found: {recipe_id}",
            error_code="RECIPE_NOT_FOUND",
            context={"recipe_id": recipe_id}
        )
        self.recipe_id = recipe_id


class RecipeNotLoadedError(RecipeEngineError):
    """Raised when trying to operate on a recipe that hasn't been loaded."""
    
    def __init__(self, session_id: Optional[str] = None, message: Optional[str] = None):
        super().__init__(
            message=message or "No recipe loaded. Call start_recipe() first.",
            error_code="RECIPE_NOT_LOADED",
            context={"session_id": session_id} if session_id else {}
        )


class RecipeValidationError(RecipeEngineError):
    """Raised when recipe data fails validation."""
    
    def __init__(self, recipe_id: str, validation_errors: list, message: Optional[str] = None):
        super().__init__(
            message=message or f"Recipe validation failed: {', '.join(validation_errors)}",
            error_code="RECIPE_VALIDATION_ERROR",
            context={"recipe_id": recipe_id, "validation_errors": validation_errors}
        )
        self.recipe_id = recipe_id
        self.validation_errors = validation_errors


# ============================================================
# Step Errors
# ============================================================

class StepError(JamieBackendError):
    """Base exception for step-related errors."""
    pass


class StepNotFoundError(StepError):
    """Raised when a step cannot be found in the recipe."""
    
    def __init__(self, step_id: str, recipe_id: Optional[str] = None, message: Optional[str] = None):
        super().__init__(
            message=message or f"Step not found: {step_id}",
            error_code="STEP_NOT_FOUND",
            context={"step_id": step_id, "recipe_id": recipe_id} if recipe_id else {"step_id": step_id}
        )
        self.step_id = step_id
        self.recipe_id = recipe_id


class StepNotReadyError(StepError):
    """Raised when trying to start a step that isn't ready."""
    
    def __init__(
        self,
        step_id: str,
        current_status: str,
        required_status: str = "ready",
        message: Optional[str] = None
    ):
        super().__init__(
            message=message or f"Step '{step_id}' is not ready (current: {current_status}, required: {required_status})",
            error_code="STEP_NOT_READY",
            context={
                "step_id": step_id,
                "current_status": current_status,
                "required_status": required_status
            }
        )
        self.step_id = step_id
        self.current_status = current_status


class StepBlockedError(StepError):
    """Raised when a step is blocked by dependencies."""
    
    def __init__(
        self,
        step_id: str,
        blocked_by: list,
        message: Optional[str] = None
    ):
        super().__init__(
            message=message or f"Step '{step_id}' is blocked by: {', '.join(blocked_by)}",
            error_code="STEP_BLOCKED",
            context={"step_id": step_id, "blocked_by": blocked_by}
        )
        self.step_id = step_id
        self.blocked_by = blocked_by


class StepAlreadyActiveError(StepError):
    """Raised when trying to start a step that's already active."""
    
    def __init__(self, step_id: str, message: Optional[str] = None):
        super().__init__(
            message=message or f"Step already active: {step_id}",
            error_code="STEP_ALREADY_ACTIVE",
            context={"step_id": step_id}
        )
        self.step_id = step_id


class StepAlreadyCompletedError(StepError):
    """Raised when trying to complete a step that's already completed."""
    
    def __init__(self, step_id: str, message: Optional[str] = None):
        super().__init__(
            message=message or f"Step already completed: {step_id}",
            error_code="STEP_ALREADY_COMPLETED",
            context={"step_id": step_id}
        )
        self.step_id = step_id


# ============================================================
# Timer Errors
# ============================================================

class TimerError(JamieBackendError):
    """Base exception for timer-related errors."""
    pass


class TimerNotFoundError(TimerError):
    """Raised when a timer cannot be found."""
    
    def __init__(self, timer_id: str, step_id: Optional[str] = None, message: Optional[str] = None):
        super().__init__(
            message=message or f"Timer not found: {timer_id}",
            error_code="TIMER_NOT_FOUND",
            context={"timer_id": timer_id, "step_id": step_id} if step_id else {"timer_id": timer_id}
        )
        self.timer_id = timer_id
        self.step_id = step_id


class TimerAlreadyRunningError(TimerError):
    """Raised when trying to start a timer that's already running."""
    
    def __init__(self, timer_id: str, step_id: Optional[str] = None, message: Optional[str] = None):
        super().__init__(
            message=message or f"Timer already running: {timer_id}",
            error_code="TIMER_ALREADY_RUNNING",
            context={"timer_id": timer_id, "step_id": step_id} if step_id else {"timer_id": timer_id}
        )
        self.timer_id = timer_id


class TimerNotRunningError(TimerError):
    """Raised when trying to stop/pause a timer that isn't running."""
    
    def __init__(self, timer_id: str, message: Optional[str] = None):
        super().__init__(
            message=message or f"Timer not running: {timer_id}",
            error_code="TIMER_NOT_RUNNING",
            context={"timer_id": timer_id}
        )
        self.timer_id = timer_id


class TimerActiveError(TimerError):
    """Raised when an action requires no active timer but one exists."""
    
    def __init__(
        self,
        step_id: str,
        timer_id: str,
        remaining_secs: int,
        message: Optional[str] = None
    ):
        super().__init__(
            message=message or f"Timer still active for step '{step_id}' ({remaining_secs}s remaining)",
            error_code="TIMER_ACTIVE",
            context={
                "step_id": step_id,
                "timer_id": timer_id,
                "remaining_secs": remaining_secs
            }
        )
        self.step_id = step_id
        self.timer_id = timer_id
        self.remaining_secs = remaining_secs


# ============================================================
# Tool Execution Errors
# ============================================================

class ToolExecutionError(JamieBackendError):
    """Base exception for tool execution errors."""
    pass


class ToolInvalidArgumentError(ToolExecutionError):
    """Raised when a tool receives invalid arguments."""
    
    def __init__(self, tool_name: str, argument: str, reason: str, message: Optional[str] = None):
        super().__init__(
            message=message or f"Invalid argument '{argument}' for tool '{tool_name}': {reason}",
            error_code="TOOL_INVALID_ARGUMENT",
            context={"tool_name": tool_name, "argument": argument, "reason": reason}
        )
        self.tool_name = tool_name
        self.argument = argument


class ToolPreconditionError(ToolExecutionError):
    """Raised when a tool's preconditions are not met."""
    
    def __init__(
        self,
        tool_name: str,
        precondition: str,
        current_state: Optional[Dict[str, Any]] = None,
        message: Optional[str] = None
    ):
        super().__init__(
            message=message or f"Precondition not met for '{tool_name}': {precondition}",
            error_code="TOOL_PRECONDITION_FAILED",
            context={
                "tool_name": tool_name,
                "precondition": precondition,
                "current_state": current_state or {}
            }
        )
        self.tool_name = tool_name
        self.precondition = precondition


# ============================================================
# WebSocket Errors
# ============================================================

class WebSocketError(JamieBackendError):
    """Base exception for WebSocket-related errors."""
    pass


class WebSocketConnectionError(WebSocketError):
    """Raised when WebSocket connection fails."""
    
    def __init__(self, reason: str, message: Optional[str] = None):
        super().__init__(
            message=message or f"WebSocket connection error: {reason}",
            error_code="WEBSOCKET_CONNECTION_ERROR",
            context={"reason": reason}
        )


class WebSocketMessageError(WebSocketError):
    """Raised when processing a WebSocket message fails."""
    
    def __init__(self, message_type: str, reason: str, message: Optional[str] = None):
        super().__init__(
            message=message or f"Failed to process WebSocket message '{message_type}': {reason}",
            error_code="WEBSOCKET_MESSAGE_ERROR",
            context={"message_type": message_type, "reason": reason}
        )
