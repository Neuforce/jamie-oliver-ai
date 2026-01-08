import logging
from contextvars import ContextVar
import uuid

# Define a context variable for the trace ID
trace_id_var = ContextVar("trace_id", default=None)

class TraceIDFilter(logging.Filter):
    def filter(self, record):
        trace_id = trace_id_var.get()
        record.trace_id = trace_id if trace_id else str(uuid.uuid4())
        return True

def configure_logger(name: str) -> logging.Logger:
    """Configs logger with a custom name and trace ID

    Args:
        name (str): A name for the logger

    Returns:
        logging.Logger: A configured logger object
    """
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter(
        "%(asctime)s [%(processName)s: %(process)d] "
        "[%(threadName)s: %(thread)d] [%(levelname)s] "
        "[Trace: %(trace_id)s] "
        "%(name)s: %(message)s"
    )
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)
    
    # Add the TraceIDFilter to the logger
    trace_filter = TraceIDFilter()
    logger.addFilter(trace_filter)
    
    return logger

def set_trace_id(trace_id: str = None):
    """Set a trace ID for the current context"""
    trace_id_var.set(trace_id or str(uuid.uuid4()))