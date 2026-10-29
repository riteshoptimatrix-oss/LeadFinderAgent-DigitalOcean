from abc import ABC, abstractmethod

class BaseAIProvider(ABC):
    def __init__(self, settings: dict):
        self.settings = settings
        
    @abstractmethod
    async def generate_analysis(self, prompt: str) -> str:
        """
        Executes the prompt against the AI provider and returns the raw JSON string response.
        """
        pass
    
    @abstractmethod
    async def test_connection(self) -> bool:
        """
        Verifies the API key and provider connection.
        """
        pass
