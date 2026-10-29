from pydantic_settings import BaseSettings

class SearchSettings(BaseSettings):
    # Timeouts
    BROWSER_TIMEOUT_MS: int = 30000
    NAVIGATION_TIMEOUT_MS: int = 60000
    ACTION_TIMEOUT_MS: int = 10000
    
    # Browser Options
    HEADLESS_MODE: bool = True
    CONCURRENCY: int = 1
    
    # Scroll Configuration
    SCROLL_SPEED_MS: int = 500
    MAX_NO_NEW_CARDS: int = 5
    # Number of consecutive discovery cycles that return no new unique businesses
    # before the feed is declared genuinely exhausted.
    MAX_CONSECUTIVE_EMPTY_CYCLES: int = 6
    # Number of consecutive cycles during which the feed scroll position does not
    # move (used as a secondary exhaustion signal).
    MIN_UNMOVED_CYCLES: int = 3
    
    # Retry Logic
    MAX_RETRIES: int = 3
    RETRY_DELAY_MS: int = 2000

search_config = SearchSettings()
