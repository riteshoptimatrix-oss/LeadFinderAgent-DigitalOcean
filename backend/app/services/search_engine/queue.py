import asyncio
import logging
from typing import Callable, Any

logger = logging.getLogger(__name__)

class QueueManager:
    """
    Handles task distribution and rate limiting for the Search Engine.
    """
    
    def __init__(self, max_concurrent: int = 5):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        
    async def enqueue(self, task_func: Callable, *args: Any, **kwargs: Any):
        """
        Enqueues a background task, executing it when a slot is available.
        """
        async def _worker():
            async with self.semaphore:
                try:
                    await task_func(*args, **kwargs)
                except Exception as e:
                    logger.error(f"[QUEUE] Task failed: {e}")
                    
        # Fire and forget
        asyncio.create_task(_worker())
        
# Global instance for the search engine
search_queue = QueueManager(max_concurrent=5)
