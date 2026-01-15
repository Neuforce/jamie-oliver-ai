"""
OpenTelemetry tracing for Jamie Oliver AI.

This module provides tracing instrumentation for tool calls, enabling:
- Production observability and debugging
- Performance monitoring
- Error tracking
- Session-level trace correlation

Usage:
    from src.observability import trace_tool_call, get_tracer
    
    @trace_tool_call("start_step")
    async def start_step(step_id: str) -> str:
        ...
"""

import os
import functools
from typing import Optional, Callable, Any
from contextlib import contextmanager

from ccai.core.logger import configure_logger

logger = configure_logger(__name__)

# Global tracer instance
_tracer = None
_tracing_enabled = False


def init_tracing(
    service_name: str = "jamie-voice",
    otlp_endpoint: Optional[str] = None,
    enabled: bool = True
) -> bool:
    """
    Initialize OpenTelemetry tracing.
    
    Args:
        service_name: Name of the service for traces
        otlp_endpoint: OTLP exporter endpoint (e.g., "http://localhost:4317")
                      If None, uses OTEL_EXPORTER_OTLP_ENDPOINT env var
        enabled: Whether to enable tracing (can be disabled for tests)
        
    Returns:
        True if tracing was initialized, False otherwise
    """
    global _tracer, _tracing_enabled
    
    if not enabled:
        logger.info("Tracing disabled")
        _tracing_enabled = False
        return False
    
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
        from opentelemetry.sdk.resources import Resource
        
        # Create resource with service info
        resource = Resource.create({
            "service.name": service_name,
            "service.version": os.getenv("APP_VERSION", "dev"),
        })
        
        # Create tracer provider
        provider = TracerProvider(resource=resource)
        
        # Add OTLP exporter if endpoint is configured
        endpoint = otlp_endpoint or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
        
        if endpoint:
            try:
                from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
                otlp_exporter = OTLPSpanExporter(endpoint=endpoint)
                provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
                logger.info(f"OTLP exporter configured: {endpoint}")
            except ImportError:
                logger.warning("OTLP exporter not available, install opentelemetry-exporter-otlp")
        
        # Add console exporter for development (if DEBUG)
        if os.getenv("OTEL_DEBUG", "").lower() == "true":
            provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
            logger.info("Console span exporter enabled (debug mode)")
        
        # Set the global tracer provider
        trace.set_tracer_provider(provider)
        
        # Get our tracer
        _tracer = trace.get_tracer(service_name)
        _tracing_enabled = True
        
        logger.info(f"OpenTelemetry tracing initialized for {service_name}")
        return True
        
    except ImportError as e:
        logger.warning(f"OpenTelemetry not available: {e}. Tracing disabled.")
        _tracing_enabled = False
        return False
    except Exception as e:
        logger.error(f"Failed to initialize tracing: {e}")
        _tracing_enabled = False
        return False


def get_tracer():
    """Get the global tracer instance."""
    global _tracer
    
    if _tracer is None and _tracing_enabled:
        try:
            from opentelemetry import trace
            _tracer = trace.get_tracer("jamie-voice")
        except ImportError:
            pass
    
    return _tracer


@contextmanager
def trace_span(name: str, attributes: Optional[dict] = None):
    """
    Context manager for creating a trace span.
    
    Args:
        name: Span name (e.g., "tool.start_step")
        attributes: Optional attributes to set on the span
        
    Usage:
        with trace_span("tool.start_step", {"step_id": "preheat_oven"}):
            # do work
            pass
    """
    tracer = get_tracer()
    
    if tracer is None or not _tracing_enabled:
        # No-op if tracing is disabled
        yield None
        return
    
    with tracer.start_as_current_span(name) as span:
        if attributes:
            for key, value in attributes.items():
                if value is not None:
                    span.set_attribute(key, str(value) if not isinstance(value, (int, float, bool)) else value)
        yield span


def trace_tool_call(tool_name: str):
    """
    Decorator to trace tool calls.
    
    Captures:
    - Tool name and arguments
    - Session ID
    - Result status (DONE, BLOCKED, ERROR, etc.)
    - Execution time
    - Errors
    
    Args:
        tool_name: Name of the tool being traced
        
    Usage:
        @trace_tool_call("start_step")
        async def start_step(step_id: str) -> str:
            ...
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            tracer = get_tracer()
            
            if tracer is None or not _tracing_enabled:
                return await func(*args, **kwargs)
            
            span_name = f"tool.{tool_name}"
            
            with tracer.start_as_current_span(span_name) as span:
                # Set basic attributes
                span.set_attribute("tool.name", tool_name)
                
                # Capture arguments (be careful with sensitive data)
                for key, value in kwargs.items():
                    if value is not None and key not in ("password", "token", "secret"):
                        span.set_attribute(f"tool.arg.{key}", str(value)[:100])
                
                # Try to get session_id from context
                try:
                    from ccai.core import context_variables
                    session_id = context_variables.get("session_id")
                    if session_id:
                        span.set_attribute("session.id", session_id)
                except Exception:
                    pass
                
                try:
                    result = await func(*args, **kwargs)
                    
                    # Extract status from result
                    if isinstance(result, str):
                        status = _extract_status(result)
                        span.set_attribute("tool.result_status", status)
                        span.set_attribute("tool.success", status not in ("ERROR", "BLOCKED"))
                    else:
                        span.set_attribute("tool.success", True)
                    
                    return result
                    
                except Exception as e:
                    span.set_attribute("tool.success", False)
                    span.set_attribute("tool.error", str(e)[:200])
                    span.record_exception(e)
                    raise
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            tracer = get_tracer()
            
            if tracer is None or not _tracing_enabled:
                return func(*args, **kwargs)
            
            span_name = f"tool.{tool_name}"
            
            with tracer.start_as_current_span(span_name) as span:
                span.set_attribute("tool.name", tool_name)
                
                try:
                    result = func(*args, **kwargs)
                    span.set_attribute("tool.success", True)
                    return result
                except Exception as e:
                    span.set_attribute("tool.success", False)
                    span.set_attribute("tool.error", str(e)[:200])
                    span.record_exception(e)
                    raise
        
        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


def _extract_status(result: str) -> str:
    """Extract status code from tool result string."""
    if not result:
        return "UNKNOWN"
    
    # Match [STATUS] pattern
    if result.startswith("["):
        end = result.find("]")
        if end > 0:
            return result[1:end]
    
    return "OK"


def add_span_attribute(key: str, value: Any) -> None:
    """
    Add an attribute to the current span.
    
    Args:
        key: Attribute key
        value: Attribute value
    """
    if not _tracing_enabled:
        return
    
    try:
        from opentelemetry import trace
        span = trace.get_current_span()
        if span:
            span.set_attribute(key, str(value) if not isinstance(value, (int, float, bool)) else value)
    except Exception:
        pass


def record_exception(exception: Exception) -> None:
    """
    Record an exception on the current span.
    
    Args:
        exception: The exception to record
    """
    if not _tracing_enabled:
        return
    
    try:
        from opentelemetry import trace
        span = trace.get_current_span()
        if span:
            span.record_exception(exception)
    except Exception:
        pass
