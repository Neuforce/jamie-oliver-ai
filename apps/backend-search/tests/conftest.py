"""Pytest path setup for backend-search tests."""

import sys
from pathlib import Path

app_root = Path(__file__).parent.parent
if str(app_root) not in sys.path:
    sys.path.insert(0, str(app_root))
