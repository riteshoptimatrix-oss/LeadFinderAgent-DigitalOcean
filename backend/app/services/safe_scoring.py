"""
Safe Scoring Utilities
======================
Null-safe scoring helpers for the AI Analysis pipeline.

Every analyzer MUST use these helpers to ensure:
- No None values leak into scorecards
- All scores are integers in range [0, 100]
- Fallback values are applied consistently
- Missing data never crashes the pipeline
"""

from typing import Any, Optional, Union


def safe_score(value: Any, default: int = 0, min_val: int = 0, max_val: int = 100) -> int:
    """
    Safely convert a value to an integer score in [min_val, max_val].
    
    Args:
        value: The value to convert (int, float, str, None, etc.)
        default: Value to use if conversion fails
        min_val: Minimum allowed score
        max_val: Maximum allowed score
        
    Returns:
        Integer score clamped to [min_val, max_val]
    """
    if value is None:
        return default
    try:
        fval = float(value)
        if fval != fval or fval == float('inf') or fval == float('-inf'):
            return default
        result = int(fval)
        return max(min_val, min(max_val, result))
    except (TypeError, ValueError, OverflowError):
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    """Safely convert a value to float."""
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_int(value: Any, default: int = 0) -> int:
    """Safely convert a value to int (no clamping)."""
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_bool(value: Any, default: bool = False) -> bool:
    """Safely convert a value to bool."""
    if value is None:
        return default
    return bool(value)


def safe_str(value: Any, default: str = "") -> str:
    """Safely convert a value to string."""
    if value is None:
        return default
    return str(value)


def safe_list(value: Any, default: Optional[list] = None) -> list:
    """Safely convert a value to list."""
    if default is None:
        default = []
    if value is None:
        return default
    if isinstance(value, list):
        return value
    return default


def safe_dict(value: Any, default: Optional[dict] = None) -> dict:
    """Safely convert a value to dict."""
    if default is None:
        default = {}
    if value is None:
        return default
    if isinstance(value, dict):
        return value
    return default


def safe_get(data: Any, key: str, default: Any = None) -> Any:
    """Safely get a key from a dict or object."""
    if data is None:
        return default
    if isinstance(data, dict):
        return data.get(key, default)
    if hasattr(data, key):
        return getattr(data, key, default)
    if hasattr(data, "get"):
        try:
            return data.get(key, default)
        except Exception:
            return default
    return default


def compute_weighted_score(
    components: dict[str, tuple[int, float]],
    default: int = 0,
) -> int:
    """
    Compute a weighted average score from components.
    
    Args:
        components: Dict of {name: (score, weight)} where weights sum to ~1.0
        default: Value to return if no components
        
    Returns:
        Integer score in [0, 100]
    """
    if not components:
        return default
    
    total_weight = 0.0
    weighted_sum = 0.0
    
    for name, (score, weight) in components.items():
        s = safe_score(score)
        w = safe_float(weight, 0.0)
        weighted_sum += s * w
        total_weight += w
    
    if total_weight == 0:
        return default
    
    return safe_score(weighted_sum / total_weight)


# Singleton-like helpers for common patterns
def extract_score_from_scorecard(
    scorecard: Any,
    *keys: str,
    default: int = 0,
) -> int:
    """
    Extract a score from a scorecard object/dict, trying multiple keys.
    
    Args:
        scorecard: The scorecard dict or object
        *keys: Keys to try in order (e.g. "overall_score", "seo_score")
        default: Default if no key found
        
    Returns:
        Integer score
    """
    if scorecard is None:
        return default
    
    for key in keys:
        val = safe_get(scorecard, key)
        if val is not None:
            return safe_score(val, default)
    
    return default


def calculate_lead_score(
    overall_ai_score: int,
    seo_score: int,
    perf_score: int,
    sec_score: int,
    acc_score: int,
    business_opportunity: int
) -> int:
    """
    Calculate the final Lead Score based on a weighted formula.
    
    Weights:
    - Overall AI Score (Base website score): 30%
    - Business Opportunity (UI/UX + market): 20%
    - SEO Score: 15%
    - Performance Score: 15%
    - Security Score: 10%
    - Accessibility Score: 10%
    """
    components = {
        "overall_ai_score": (overall_ai_score, 0.30),
        "business_opportunity": (business_opportunity, 0.20),
        "seo_score": (seo_score, 0.15),
        "performance_score": (perf_score, 0.15),
        "security_score": (sec_score, 0.10),
        "accessibility_score": (acc_score, 0.10),
    }
    
    return compute_weighted_score(components, default=0)
