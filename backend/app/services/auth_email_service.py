import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings
from app.core.logger import logger

def _send_email_sync(to_email: str, subject: str, html_body: str):
    if not settings.smtp_is_configured:
        logger.warning(f"SMTP is not configured. Mock sending email to {to_email}. Subject: {subject}")
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USERNAME}>"
    msg["To"] = to_email

    msg.attach(MIMEText(html_body, "html"))

    try:
        if settings.SMTP_ENCRYPTION == "SSL":
            server = smtplib.SMTP_SSL(settings.SMTP_SERVER, settings.SMTP_PORT, timeout=15)
        else:
            server = smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT, timeout=15)
            if settings.SMTP_ENCRYPTION == "TLS":
                server.starttls()
        
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_USERNAME, to_email, msg.as_string())
        server.quit()
        logger.info(f"Successfully sent email to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False

async def send_password_reset_email(email: str, user_name: str, reset_token: str):
    # Retrieve frontend URL from CORS origins or a dedicated setting. Using the first local origin for dev if not set
    # Assuming frontend runs on localhost:3000 by default for dev
    frontend_url = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")

    reset_link = f"{frontend_url}/reset-password?token={reset_token}"
    
    subject = "Reset Your Lead Finder Agent Password"
    
    html_body = f"""
    <html>
      <head></head>
      <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <p>Hello {user_name},</p>
        <p>We received a request to reset your password.</p>
        <p>Click the button below to reset it.</p>
        <div style="margin: 30px 0;">
            <a href="{reset_link}" style="background-color: #c1121f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p>This link will expire in 15 minutes.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <br/>
        <p>Regards,<br/>Lead Finder Agent Team</p>
      </body>
    </html>
    """
    
    await asyncio.to_thread(_send_email_sync, email, subject, html_body)

