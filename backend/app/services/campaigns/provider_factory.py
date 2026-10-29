import asyncio
from app.models.campaign import CampaignType
from app.core.logger import logger

from motor.motor_asyncio import AsyncIOMotorDatabase
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.services.campaigns.template_parser import TemplateParser

class BaseProvider:
    def __init__(self, db: AsyncIOMotorDatabase, user_id: str):
        self.db = db
        self.user_id = user_id

    async def send(self, target: str, subject: str, content: str, track_log_id: str = None) -> bool:
        raise NotImplementedError

class SMTPEmailProvider(BaseProvider):
    async def send(self, target: str, subject: str, content: str, track_log_id: str = None) -> bool:
        if not target:
            raise ValueError("Missing email address")
            
        settings = await self.db["user_settings"].find_one({"user_id": self.user_id})
        if not settings or not settings.get("smtp_host"):
            raise ValueError("SMTP settings not configured")
            
        host = settings["smtp_host"]
        port = settings.get("smtp_port", 587)
        user = settings.get("smtp_user")
        pwd = settings.get("smtp_pass")
        sender = settings.get("smtp_from_email", user)

        # Inject tracking pixel if log id exists
        if track_log_id:
            # 1. Wrap links
            content = TemplateParser.wrap_links_for_tracking(content, track_log_id)
            # 2. Inject pixel
            pixel = f'<img src="http://localhost:8000/api/v1/tracking/open/{track_log_id}" width="1" height="1" style="display:none;" />'
            if "</body>" in content.lower():
                # Case insensitive replace for body closing tag is trickier, let's just do simple replace for now or append if missing
                if "</body>" in content:
                    content = content.replace("</body>", f"{pixel}</body>")
                elif "</BODY>" in content:
                    content = content.replace("</BODY>", f"{pixel}</BODY>")
                else:
                    content += pixel
            else:
                content += pixel

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = target
        
        # We assume content could be HTML
        part = MIMEText(content, "html")
        msg.attach(part)
        
        def _send():
            with smtplib.SMTP(host, port) as server:
                server.starttls()
                server.login(user, pwd)
                server.send_message(msg)
                
        await asyncio.to_thread(_send)
        logger.info(f"[EMAIL] Sent to {target} | Subject: {subject}")
        return True

class MockWhatsAppProvider(BaseProvider):
    async def send(self, target: str, subject: str, content: str, track_log_id: str = None) -> bool:
        if not target:
            raise ValueError("Missing phone number")
        logger.info(f"[WHATSAPP] Sending to {target}")
        await asyncio.sleep(0.5)
        return True

class ProviderFactory:
    @staticmethod
    def get_provider(campaign_type: CampaignType, db: AsyncIOMotorDatabase, user_id: str) -> BaseProvider:
        if campaign_type == CampaignType.EMAIL:
            return SMTPEmailProvider(db, user_id)
        elif campaign_type == CampaignType.WHATSAPP:
            return MockWhatsAppProvider(db, user_id)
        else:
            # Future providers (SMS, LinkedIn, Telegram) can be added here
            raise ValueError(f"Provider for {campaign_type} is not yet implemented.")
