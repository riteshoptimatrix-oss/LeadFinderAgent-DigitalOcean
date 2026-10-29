from abc import ABC, abstractmethod

class BaseWhatsAppProvider(ABC):
    """
    Abstract Base Class for WhatsApp Providers.
    All future providers (Official API, Browser Automation, Twilio, etc.) must implement this interface.
    """
    
    def __init__(self, settings: dict):
        self.settings = settings

    @abstractmethod
    async def validate_configuration(self) -> tuple[bool, str]:
        """
        Validates the configuration.
        Returns a tuple (is_valid: bool, error_message: str).
        """
        pass

    @abstractmethod
    async def is_ready(self) -> bool:
        """
        Checks if the provider is ready and connected.
        Returns True if ready.
        """
        pass

    @abstractmethod
    async def send_message(self, phone: str, text: str, metadata: dict = None) -> bool:
        """
        Sends a WhatsApp message to the specified phone number.
        Returns True if successful, False otherwise.
        """
        pass
