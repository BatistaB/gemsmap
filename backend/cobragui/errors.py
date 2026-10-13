"""Errors the UI can explain to a scientist (title + message + what to check), plus JSON-safe numbers."""
import math
from typing import Any, Optional


class ScienceError(Exception):
    """An error with a meaningful explanation. Rendered as {"error": {...}} with the given HTTP status."""

    def __init__(self, title: str, message: str = "", *, status: int = 400,
                 hints: Optional[list[str]] = None, detail: Any = None):
        super().__init__(f"{title}: {message}" if message else title)
        self.title = title
        self.message = message
        self.status = status
        self.hints = hints or []
        self.detail = detail

    def payload(self) -> dict:
        return {"error": {"title": self.title, "message": self.message, "hints": self.hints, "detail": self.detail}}


def num(x: Any) -> Optional[float]:
    """Float or None (JSON has no NaN/Infinity; None means 'no value' or 'unbounded')."""
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def bound_in(x: Optional[float], side: str) -> float:
    """None from the client means unbounded on that side."""
    if x is None:
        return -math.inf if side == "lower" else math.inf
    return float(x)
