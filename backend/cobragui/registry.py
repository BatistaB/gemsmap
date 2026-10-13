"""In-memory registry of imported COBRA models, backed by an on-disk cache of the original files.

Model states never modify the imported cobra.Model: every computation applies a state inside
`with model:` (see model_service.applied), which COBRApy reverts on exit. Structural edits
(edit_service) do modify it, as a logged, reversible layer that is re-applied on load. Access to one
model is serialized with a per-model lock because cobra contexts are not thread-safe.
"""
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import cobra


def cache_dir() -> Path:
    base = os.environ.get("COBRAGUI_CACHE")
    if base:
        p = Path(base)
    else:
        root = os.environ.get("LOCALAPPDATA") or os.path.join(Path.home(), ".cache")
        p = Path(root) / "cobragui" / "models"
    p.mkdir(parents=True, exist_ok=True)
    return p


@dataclass
class ModelEntry:
    id: str
    checksum: str
    filename: str
    fmt: str
    model: cobra.Model
    original_bounds: dict[str, tuple[float, float]]
    original_objective: dict[str, float]
    original_direction: str
    original_medium: dict[str, float]
    validation: dict[str, Any] = field(default_factory=dict)
    catalog: Optional[dict] = None
    search: Any = None
    lock: threading.RLock = field(default_factory=threading.RLock)
    # structural edits (edit_service): the saved log, genes of the file, and edits that failed to re-apply
    edits: Optional[dict] = None
    base_genes: set = field(default_factory=set)
    edit_errors: list = field(default_factory=list)


_entries: dict[str, ModelEntry] = {}
_registry_lock = threading.Lock()


def put(entry: ModelEntry) -> None:
    with _registry_lock:
        _entries[entry.id] = entry


def get(model_id: str) -> Optional[ModelEntry]:
    with _registry_lock:
        return _entries.get(model_id)


def cached_file(model_id: str) -> Optional[Path]:
    """Original file saved at import time: <cache>/<id>__<filename>."""
    for p in cache_dir().glob(f"{model_id}__*"):
        if p.is_file():
            return p
    return None
