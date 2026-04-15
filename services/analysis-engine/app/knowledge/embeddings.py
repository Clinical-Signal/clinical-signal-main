"""Local sentence-transformers embeddings. 384-dim, CPU."""
from __future__ import annotations

import threading
from functools import lru_cache
from typing import Iterable

MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

_load_lock = threading.Lock()


@lru_cache(maxsize=1)
def _model():
    # Deferred import so scripts that don't need embeddings don't pay the
    # cost of loading torch.
    from sentence_transformers import SentenceTransformer

    with _load_lock:
        return SentenceTransformer(MODEL_ID)


def embed(texts: str | Iterable[str]) -> list[list[float]]:
    """Return a list of 384-dim vectors. Accepts a single string or an iterable."""
    if isinstance(texts, str):
        texts = [texts]
    else:
        texts = list(texts)
    if not texts:
        return []
    arr = _model().encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return [vec.tolist() for vec in arr]


def embed_one(text: str) -> list[float]:
    return embed(text)[0]
