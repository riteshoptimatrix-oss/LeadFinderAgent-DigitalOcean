"""
services/template_helpers.py - Email template management and seeding.
"""
import config


def ensure_templates_table(conn) -> None:
    """Ensure email_templates table exists and has default starter templates."""
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS `email_templates` (
                `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `name`        VARCHAR(150) NOT NULL,
                `subject`     VARCHAR(255) NOT NULL,
                `body_html`   MEDIUMTEXT   NOT NULL,
                `body_text`   TEXT         DEFAULT NULL,
                `is_default`  TINYINT(1)   NOT NULL DEFAULT 0,
                `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_is_default` (`is_default`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        cur.execute("SELECT COUNT(*) AS cnt FROM email_templates")
        count = int(cur.fetchone()["cnt"])
        if count == 0:
            default_html = ""
            if config.EMAIL_TEMPLATE_PATH.exists():
                default_html = config.EMAIL_TEMPLATE_PATH.read_text(encoding="utf-8")

            if default_html:
                cur.execute(
                    "INSERT INTO email_templates (name, subject, body_html, is_default) VALUES (%s, %s, %s, 1)",
                    (
                        "Official AI WhatsApp Marketing Pitch (Default)",
                        "Grow Your Business with WhatsApp Marketing 🚀",
                        default_html,
                    ),
                )

            cur.execute(
                "INSERT INTO email_templates (name, subject, body_html, is_default) VALUES (%s, %s, %s, 0)",
                (
                    "Video Demo & Interactive Walkthrough Template",
                    "See How Easy Message Sender Automates Your WhatsApp in 2 Mins 🎥",
                    build_starter_video_template(),
                ),
            )


def get_all_templates(conn) -> list[dict]:
    ensure_templates_table(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, subject, is_default, updated_at, created_at, LENGTH(body_html) AS html_length
            FROM email_templates
            ORDER BY is_default DESC, id DESC
            """
        )
        return cur.fetchall()


def get_template_by_id(conn, template_id: int) -> dict | None:
    ensure_templates_table(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM email_templates WHERE id = %s LIMIT 1", (template_id,))
        return cur.fetchone()


def get_default_template(conn) -> dict:
    ensure_templates_table(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM email_templates WHERE is_default = 1 ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row:
            return row
        cur.execute("SELECT * FROM email_templates ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row:
            return row

    html = ""
    if config.EMAIL_TEMPLATE_PATH.exists():
        html = config.EMAIL_TEMPLATE_PATH.read_text(encoding="utf-8")
    return {
        "id": 0,
        "name": "Default File Template",
        "subject": "Grow Your Business with WhatsApp Marketing 🚀",
        "body_html": html,
    }


def build_starter_video_template() -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f6f8;">
<tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
            <td style="background:#091322;padding:22px 28px;border-bottom:2px solid #25d366;">
                <p style="margin:0;font-size:19px;font-weight:700;color:#ffffff;">Easy Message Sender</p>
                <p style="margin:3px 0 0;font-size:11px;color:#25d366;font-weight:600;text-transform:uppercase;">By Optimatrix Solutions &bull; Official Meta Partner</p>
            </td>
        </tr>
        <tr>
            <td style="padding:32px;color:#1e293b;">
                <p style="margin:0 0 14px;font-size:16px;font-weight:700;">Hi {{first_name}} 👋</p>
                <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;">See How to Automate {{company}}'s WhatsApp Marketing in Under 2 Minutes 🎥</h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#475569;">
                    We put together a quick walkthrough demonstrating how businesses send bulk campaigns, set up 24/7 AI chat automations, and track outcomes effortlessly.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr><td align="center">
                    <a href="{{cta_url}}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#25d366,#128c7e);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:15px 36px;border-radius:50px;">
                        ▶ Watch Video Demo &amp; Pricing →
                    </a>
                </td></tr>
                </table>
            </td>
        </tr>
        <tr>
            <td style="background:#f8fafc;padding:24px 32px;border-top:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:12px;">
                <p style="margin:0;"><a href="{{unsub_url}}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a></p>
            </td>
        </tr>
    </table>
    <img src="{{pixel_url}}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">
</td></tr>
</table>
</body>
</html>"""
