import logging
from typing import Tuple
import numpy as np

logger = logging.getLogger(__name__)

SentenceTransformer = None
_st_load_attempted = False

def _get_sentence_transformer():
    """Lazy-load sentence_transformers so backend startup is instantaneous."""
    global SentenceTransformer, _st_load_attempted
    if not _st_load_attempted:
        _st_load_attempted = True
        try:
            from sentence_transformers import SentenceTransformer as ST
            SentenceTransformer = ST
            logger.info("[VALIDATOR] sentence_transformers library loaded on demand.")
        except Exception as exc:
            logger.warning("[VALIDATOR] sentence_transformers unavailable: %s", exc)
    return SentenceTransformer

class RelevanceEngine:
    """
    Uses fast rule-based matching and cached semantic embeddings to evaluate
    if a business category matches the search keyword with near-zero latency.
    """
    def __init__(self, threshold: float = 0.4):
        self.threshold = threshold
        self.model = None
        self.is_ready = False
        self._model_initialized = False
        self._embedding_cache = {}
        self._decision_cache = {}

    def _ensure_model(self):
        """Initializes model on-demand only when rule-based fast-paths are exhausted."""
        if self._model_initialized:
            return
        self._model_initialized = True
        ST = _get_sentence_transformer()
        if ST is None:
            self.is_ready = False
            return
        try:
            logger.info("[VALIDATOR] Loading semantic model 'all-MiniLM-L6-v2' on demand...")
            self.model = ST('all-MiniLM-L6-v2')
            self.is_ready = True
            logger.info("[VALIDATOR] Semantic model loaded successfully.")
        except Exception as e:
            logger.error(f"[VALIDATOR] Failed to load semantic model: {e}")
            self.is_ready = False

    def _get_embedding(self, text: str) -> np.ndarray:
        """Cached single-string embedding computation."""
        cleaned = text.strip().lower()
        emb = self._embedding_cache.get(cleaned)
        if emb is None:
            self._ensure_model()
            if self.model is not None:
                emb = self.model.encode(cleaned)
                if len(self._embedding_cache) > 2000:
                    self._embedding_cache.clear()
                self._embedding_cache[cleaned] = emb
        return emb

    def evaluate_relevance(self, keyword: str, category: str, name: str) -> Tuple[bool, str]:
        """
        Returns (is_relevant, rejection_reason).
        Prioritizes ultra-fast (0.001ms) string, root-stem, and synonym rules,
        falling back to cached PyTorch embeddings only when necessary.
        """
        if not category:
            return True, ""  # Can't reject if category is absent

        kw = keyword.strip().lower()
        cat = category.strip().lower()
        nm = (name or "").strip().lower()

        # Fast-Path 1: Exact / substring match in category or name
        if kw in cat or cat in kw or (kw and kw in nm):
            return True, ""

        # Fast-Path 2: Token intersection (e.g. "software development" & "software engineer")
        kw_tokens = set(kw.split())
        cat_tokens = set(cat.split())
        if kw_tokens & cat_tokens:
            return True, ""

        # Fast-Path 3: Common root stem / prefix match (>= 4 chars, e.g. "dent" in "dentist" & "dental")
        for k_tok in kw_tokens:
            if len(k_tok) >= 4:
                prefix = k_tok[:4]
                if any(prefix in c_tok for c_tok in cat_tokens):
                    return True, ""

        # Fast-Path 4: Industry ontology synonyms from QueryExpander
        try:
            from .query_expander import QueryExpander
            synonyms = QueryExpander.get_synonyms_for_keyword(kw)
            for s in synonyms:
                s_low = s.lower()
                if s_low in cat or cat in s_low or (set(s_low.split()) & cat_tokens):
                    return True, ""
        except Exception:
            pass

        # Fast-Path 5: Cached semantic decision
        cache_key = (kw, cat)
        if cache_key in self._decision_cache:
            return self._decision_cache[cache_key]

        # Semantic embedding evaluation (using cached vector lookups)
        self._ensure_model()
        if not self.is_ready or self.model is None:
            # Fallback when model is not available
            return True, ""

        vec1 = self._get_embedding(kw)
        vec2 = self._get_embedding(cat)

        if vec1 is None or vec2 is None:
            return True, ""

        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if norm1 == 0 or norm2 == 0:
            return True, ""

        similarity = float(np.dot(vec1, vec2) / (norm1 * norm2))

        if len(self._decision_cache) > 3000:
            self._decision_cache.clear()

        if similarity >= self.threshold:
            decision = (True, "")
        else:
            decision = (False, f"Category '{category}' is semantically unrelated to keyword '{keyword}' (score: {similarity:.2f})")

        self._decision_cache[cache_key] = decision
        return decision

class Validator:
    """
    Validates data quality of extracted leads.
    """
    def __init__(self):
        self.relevance_engine = RelevanceEngine()
        
    def validate(self, keyword: str, data: dict) -> Tuple[bool, str]:
        """
        Returns (is_valid, reason).
        """
        category = data.get("category", "")
        name = data.get("name", "")
        
        return self.relevance_engine.evaluate_relevance(keyword, category, name)
