import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from bson import ObjectId

from app.db.database import get_db
from app.services.worker_manager import log_job_event

MAX_RETRIES = 3

async def process_email_queue():
    """Background task to process QUEUED emails with retries."""
    db = get_db()
    if db is None:
        return
        
    # Fetch campaigns that are currently RUNNING
    cursor = db["campaigns"].find({"status": "RUNNING"})
    active_campaigns = await cursor.to_list(length=None)
    
    if not active_campaigns:
        return

    active_campaign_ids = [str(c["_id"]) for c in active_campaigns]
    
    # Find QUEUED logs belonging to RUNNING campaigns.
    # We also pick up FAILED logs that haven't exceeded MAX_RETRIES.
    queued_logs = await db["email_logs"].find({
        "$or": [
            {"status": "QUEUED"},
            {"status": "FAILED", "retry_count": {"$lt": MAX_RETRIES}}
        ],
        "campaign_id": {"$in": active_campaign_ids}
    }).limit(50).to_list(length=None)

    if not queued_logs:
        return
        
    user_ids = list(set([log["user_id"] for log in queued_logs]))
    settings_cursor = await db["user_settings"].find({"user_id": {"$in": user_ids}}).to_list(length=None)
    smtp_configs = {s["user_id"]: s for s in settings_cursor}
    
    template_ids = list(set([c["template_id"] for c in active_campaigns]))
    templates_cursor = await db["email_templates"].find({"_id": {"$in": [ObjectId(tid) for tid in template_ids]}}).to_list(length=None)
    templates = {str(t["_id"]): t for t in templates_cursor}
    
    for log in queued_logs:
        log_id_str = str(log["_id"])
        try:
            campaign = next((c for c in active_campaigns if str(c["_id"]) == log["campaign_id"]), None)
            if not campaign:
                continue
                
            template = templates.get(campaign["template_id"])
            if not template:
                raise Exception("Template not found")
                
            smtp_config = smtp_configs.get(log["user_id"])
            if not smtp_config or not smtp_config.get("smtp_host"):
                raise Exception("SMTP configuration missing")
                
            lead = await db["leads"].find_one({"_id": ObjectId(log["lead_id"])})
            lead_name = lead.get("name", "there") if lead else "there"
            
            html_content = template["html_content"].replace("{{name}}", lead_name)
            subject = template["subject"].replace("{{name}}", lead_name)
            
            pixel_url = f"http://localhost:8000/api/v1/tracking/open/{log_id_str}"
            html_content += f'<img src="{pixel_url}" width="1" height="1" style="display:none;" />'
            
            send_email(
                smtp_config,
                to_email=log["recipient_email"],
                subject=subject,
                html_body=html_content
            )
            
            # Update log as DELIVERED
            await db["email_logs"].update_one(
                {"_id": log["_id"]},
                {"$set": {"status": "DELIVERED", "sent_at": datetime.utcnow()}}
            )
            
            # Only increment processed count if it was QUEUED (not a retry that was already counted as processed during its failure)
            if log["status"] == "QUEUED":
                await db["campaigns"].update_one(
                    {"_id": ObjectId(campaign["_id"])},
                    {"$inc": {"processed_leads": 1}}
                )
                
            await log_job_event("EMAIL_QUEUE", "INFO", f"Successfully sent email to {log['recipient_email']}", log_id_str)
            
        except Exception as e:
            error_msg = str(e)
            retry_count = log.get("retry_count", 0) + 1
            
            # Determine if we should fail or fatal
            if retry_count >= MAX_RETRIES:
                await db["email_logs"].update_one(
                    {"_id": log["_id"]},
                    {"$set": {"status": "BOUNCED", "error_message": error_msg, "retry_count": retry_count, "sent_at": datetime.utcnow()}}
                )
                await log_job_event("EMAIL_QUEUE", "FATAL", f"Max retries reached for {log['recipient_email']}: {error_msg}", log_id_str)
            else:
                await db["email_logs"].update_one(
                    {"_id": log["_id"]},
                    {"$set": {"status": "FAILED", "error_message": error_msg, "retry_count": retry_count}}
                )
                await log_job_event("EMAIL_QUEUE", "WARNING", f"Retry {retry_count}/{MAX_RETRIES} for {log['recipient_email']}: {error_msg}", log_id_str)

            # If it was its first attempt (QUEUED), increment the processed_leads count.
            if log["status"] == "QUEUED":
                await db["campaigns"].update_one(
                    {"_id": ObjectId(log["campaign_id"])},
                    {"$inc": {"processed_leads": 1}}
                )

def send_email(config, to_email: str, subject: str, html_body: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = config.get("smtp_from_email", config.get("smtp_user"))
    msg["To"] = to_email

    part = MIMEText(html_body, "html")
    msg.attach(part)
    
    server = smtplib.SMTP(config.get("smtp_host"), config.get("smtp_port", 587))
    server.starttls()
    server.login(config.get("smtp_user"), config.get("smtp_pass"))
    server.send_message(msg)
    server.quit()
