"""Utility functions for recipe engine."""

import re


def parse_iso_duration(duration) -> int:
    """
    Parse duration to seconds. Handles:
    - ISO 8601 duration string (e.g., "PT50M", "PT1H30M", "PT90S")
    - Integer seconds
    - None/empty values
    
    Args:
        duration: ISO 8601 duration string, integer seconds, or None
        
    Returns:
        Total duration in seconds
        
    Examples:
        >>> parse_iso_duration("PT50M")
        3000
        >>> parse_iso_duration("PT1H30M")
        5400
        >>> parse_iso_duration("PT90S")
        90
        >>> parse_iso_duration(300)
        300
        >>> parse_iso_duration(None)
        0
    """
    # Handle None or empty
    if duration is None:
        return 0
    
    # Handle integer (already in seconds)
    if isinstance(duration, (int, float)):
        return int(duration)
    
    # Handle string
    if not isinstance(duration, str):
        return 0
    
    # Try ISO 8601 format
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration)
    if not match:
        # Try plain number string
        try:
            return int(duration)
        except ValueError:
            return 0
    
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def format_duration(seconds: int) -> str:
    """
    Format seconds into a human-readable duration string.
    
    Args:
        seconds: Duration in seconds
        
    Returns:
        Formatted duration string (e.g., "50 minutes", "1h 30m")
    """
    if seconds < 60:
        return f"{seconds} seconds"
    
    minutes = seconds // 60
    remaining_secs = seconds % 60
    
    if minutes < 60:
        if remaining_secs > 0:
            return f"{minutes}m {remaining_secs}s"
        return f"{minutes} minutes"
    
    hours = minutes // 60
    remaining_mins = minutes % 60
    
    if remaining_mins > 0:
        return f"{hours}h {remaining_mins}m"
    return f"{hours} hours"

