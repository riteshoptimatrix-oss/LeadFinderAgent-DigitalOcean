import logging
from typing import Tuple
import numpy as np

logger = logging.getLogger(__name__)

try:
    from sentence_transformers import SentenceTransformer
except Exception as exc:
    SentenceTransformer = None
    logger.warning("[VALIDATOR] sentence_transformers unavailable: %s", exc)

class RelevanceEngine:
    """
    Uses semantic matching to evaluate if a business category matches the search keyword.
    """
    def __init__(self, threshold: float = 0.4):
        self.threshold = threshold
        self.model = None
        self.is_ready = False

        if SentenceTransformer is None:
            logger.warning("[VALIDATOR] Semantic model support disabled because sentence_transformers could not be imported.")
            return

        # Load a small, fast, local embedding model
        logger.info("[VALIDATOR] Loading semantic model 'all-MiniLM-L6-v2'...")
        
        try:
            self.model = SentenceTransformer('all-MiniLM-L6-v2')
            self.is_ready = True
            logger.info("[VALIDATOR] Semantic model loaded successfully.")
        except Exception as e:
            logger.error(f"[VALIDATOR] Failed to load semantic model: {e}")
            logger.warning("[VALIDATOR] Continuing without semantic validation (will use simple text matching).")
            self.is_ready = False

    def evaluate_relevance(self, keyword: str, category: str, name: str) -> Tuple[bool, str]:
        """
        Returns (is_relevant, rejection_reason).
        """
        if not self.is_ready or self.model is None:
            # Fallback to simple inclusion if model failed
            if not category:
                return True, ""
            return keyword.lower() in category.lower() or keyword.lower() in name.lower(), "Semantic model unavailable; simple match failed"

        if not category:
            return True, "" # Can't reject if we don't know the category

        # We encode the keyword and the category
        # If the semantic similarity is above the threshold, it's relevant
        embeddings = self.model.encode([keyword.lower(), category.lower()])
        
        # Calculate cosine similarity
        vec1 = embeddings[0]
        vec2 = embeddings[1]
        similarity = np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))
        
        if similarity >= self.threshold:
            return True, ""
            
        return False, f"Category '{category}' is semantically unrelated to keyword '{keyword}' (score: {similarity:.2f})"

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
