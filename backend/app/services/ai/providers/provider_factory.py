from .base_provider import BaseAIProvider
from .openai_provider import OpenAIProvider

class AIProviderFactory:
    @staticmethod
    def get_provider(settings: dict) -> BaseAIProvider:
        provider_type = settings.get("ai_provider", "OPENAI")
        
        # In the future, you could add CLAUDE, GEMINI, etc.
        if provider_type == "OPENAI":
            return OpenAIProvider(settings)
        else:
            return OpenAIProvider(settings) # Default fallback
