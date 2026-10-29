from .base_provider import BaseWhatsAppProvider
from .official_provider import OfficialWhatsAppProvider
from .browser_provider import BrowserWhatsAppProvider

class WAProviderFactory:
    @staticmethod
    def get_provider(settings: dict, campaign_id: str = None) -> BaseWhatsAppProvider:
        """
        Returns the appropriate WhatsApp Provider instance based on user settings.
        """
        provider_type = settings.get("wa_provider_type", "BROWSER")
        
        if provider_type == "OFFICIAL":
            return OfficialWhatsAppProvider(settings)
        else:
            return BrowserWhatsAppProvider(settings, campaign_id=campaign_id)
