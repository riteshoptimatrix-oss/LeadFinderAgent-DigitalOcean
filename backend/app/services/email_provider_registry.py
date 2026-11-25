"""
Centralized Email Provider Registry & Intelligent Detection Service.

Single source of truth for:
- Verified domain-to-provider mappings (25+ providers + multi-domain support)
- Accurate SMTP & IMAP server configurations
- Supported authentication methods (App Password, OAuth2, SMTP Auth, Bridge, Unsupported)
- Provider-specific step-by-step setup guides, security notes, troubleshooting, and docs links
"""

import asyncio
import copy
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

try:
    import dns.resolver
except ImportError:
    dns = None  # type: ignore

import httpx


PROVIDERS: Dict[str, Dict[str, Any]] = {
    "gmail": {
        "id": "gmail",
        "name": "Google Gmail",
        "logo_key": "gmail",
        "category": "consumer_and_workspace",
        "smtp": {"supported": True, "host": "smtp.gmail.com", "port": 587, "encryption": "TLS"},
        "imap": {"supported": True, "host": "imap.gmail.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.gmail.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password", "oauth2"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": True,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "Standard Google account passwords are blocked for SMTP/IMAP. You must enable 2-Step Verification and generate a 16-character App Password (or use OAuth2).",
        "setup_steps": [
            "Open your Google Account Security settings (myaccount.google.com/security).",
            "Turn ON 2-Step Verification if it is not already enabled.",
            "Search for 'App passwords' in the Google Account search bar (or under 2-Step Verification).",
            "Enter an app name (e.g., 'LeadFinder AI') and click Create.",
            "Copy the generated 16-character App Password.",
            "Paste the 16-character App Password into the configuration form and click Save & Test Connection."
        ],
        "troubleshooting": [
            {"issue": "535 5.7.8 Username and Password not accepted", "solution": "Ensure you are using a 16-character App Password, not your regular Gmail login password, and that 2-Step Verification is active."},
            {"issue": "App Passwords option missing", "solution": "If using Google Workspace, your Workspace Admin must allow 2-Step Verification and Less Secure/App Passwords, or use OAuth2."}
        ],
        "docs_url": "https://support.google.com/accounts/answer/185833"
    },
    "outlook": {
        "id": "outlook",
        "name": "Microsoft Outlook / 365",
        "logo_key": "outlook",
        "category": "consumer_and_workspace",
        "smtp": {"supported": True, "host": "smtp-mail.outlook.com", "port": 587, "encryption": "TLS"},
        "imap": {"supported": True, "host": "outlook.office365.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "outlook.office365.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["oauth2", "app_password"],
        "recommended_auth": "oauth2",
        "app_password_supported": True,
        "oauth2_supported": True,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "Microsoft has deprecated Basic Auth for many Outlook.com and Microsoft 365 accounts in favor of OAuth2 (Modern Auth). App Passwords work only if Basic Auth / Authenticated SMTP is enabled.",
        "setup_steps": [
            "For Microsoft 365 Work accounts, ensure your IT Admin enabled 'Authenticated SMTP' for your mailbox in Microsoft 365 Admin Center.",
            "Open Microsoft Account Security (account.microsoft.com/security) -> Advanced security options.",
            "Enable Two-step verification if disabled.",
            "Under 'App passwords', click 'Create a new app password' (if available for your account).",
            "Use smtp-mail.outlook.com (personal) or smtp.office365.com (Microsoft 365) on Port 587 with TLS (STARTTLS).",
            "If Microsoft blocks App Password with 'BasicAuthBlocked', configure OAuth2 Modern Authentication."
        ],
        "troubleshooting": [
            {"issue": "535 5.7.139 Authentication unsuccessful / BasicAuthBlocked", "solution": "Microsoft has disabled Basic Auth on this tenant/account. Enable Authenticated SMTP in M365 Admin Center or connect via OAuth2."},
            {"issue": "Client was not authenticated to send anonymous mail", "solution": "Verify that the Sender Email (From) exactly matches your authenticated Outlook/365 email address."}
        ],
        "docs_url": "https://support.microsoft.com/en-us/account-billing/using-app-passwords-with-apps-that-don-t-support-two-step-verification-5896ed9b-4263-e681-128a-a6f2979a7944"
    },
    "yahoo": {
        "id": "yahoo",
        "name": "Yahoo Mail",
        "logo_key": "yahoo",
        "category": "consumer",
        "smtp": {"supported": True, "host": "smtp.mail.yahoo.com", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.mail.yahoo.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.mail.yahoo.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "Yahoo Mail strictly requires a dedicated App Password for third-party SMTP/IMAP connections. Your regular Yahoo password will be rejected.",
        "setup_steps": [
            "Sign in to your Yahoo Account Security page (login.yahoo.com/account/security).",
            "Scroll to 'External connections' or 'Generate app password'.",
            "Click 'Generate app password' and name it (e.g., 'LeadFinder').",
            "Copy the generated password (without spaces).",
            "Keep SMTP Host as smtp.mail.yahoo.com, Port 465 (SSL) or 587 (TLS), and paste the App Password.",
            "Click Save & Test Connection."
        ],
        "troubleshooting": [
            {"issue": "535 5.7.0 (#AUTH005) Too many bad auth attempts", "solution": "Wait 15 minutes, generate a fresh Yahoo App Password, and ensure your full @yahoo.com email is used as the Username."}
        ],
        "docs_url": "https://help.yahoo.com/kb/generate-manage-third-party-passwords-sln15241.html"
    },
    "icloud": {
        "id": "icloud",
        "name": "Apple iCloud Mail",
        "logo_key": "icloud",
        "category": "consumer",
        "smtp": {"supported": True, "host": "smtp.mail.me.com", "port": 587, "encryption": "TLS"},
        "imap": {"supported": True, "host": "imap.mail.me.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": False, "host": "", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "Apple requires Two-Factor Authentication on your Apple ID and a unique App-Specific Password for SMTP/IMAP.",
        "setup_steps": [
            "Sign in to appleid.apple.com with Two-Factor Authentication enabled.",
            "Navigate to Sign-In and Security -> App-Specific Passwords.",
            "Click '+' or 'Generate an app-specific password', label it 'LeadFinder', and confirm.",
            "Copy the xxxx-xxxx-xxxx-xxxx password.",
            "Enter it into the Password field with smtp.mail.me.com (Port 587, TLS) and test the connection."
        ],
        "troubleshooting": [
            {"issue": "535 5.7.8 Authentication failed", "solution": "Use your full @icloud.com/@me.com address and an App-Specific Password from appleid.apple.com, not your Apple ID password."}
        ],
        "docs_url": "https://support.apple.com/en-us/102654"
    },
    "proton": {
        "id": "proton",
        "name": "Proton Mail",
        "logo_key": "proton",
        "category": "privacy_encrypted",
        "smtp": {"supported": False, "host": "127.0.0.1", "port": 1025, "encryption": "TLS"},
        "imap": {"supported": False, "host": "127.0.0.1", "port": 1143, "encryption": "TLS"},
        "pop": {"supported": False, "host": "", "port": 995, "encryption": "SSL"},
        "auth_methods": ["proton_bridge"],
        "recommended_auth": "proton_bridge",
        "app_password_supported": False,
        "oauth2_supported": False,
        "requires_paid_plan": True,
        "requires_bridge": True,
        "security_note": "Proton Mail uses end-to-end encryption and does NOT expose public cloud SMTP/IMAP servers. Direct cloud-to-Proton SMTP is not supported without a paid plan + Proton Mail Bridge.",
        "setup_steps": [
            "Ensure you have an active paid Proton Mail plan (Bridge is not available on free plans).",
            "Install and sign in to Proton Mail Bridge on the host machine.",
            "Copy the Bridge-generated SMTP/IMAP host (127.0.0.1), ports (1025 / 1143), and Bridge password.",
            "Note: Because this app runs on a remote cloud server, localhost Bridge will only work if Bridge or a custom SMTP relay is hosted on the same server."
        ],
        "troubleshooting": [
            {"issue": "Connection refused to 127.0.0.1:1025", "solution": "Proton Mail does not allow direct remote SMTP. Use a supported cloud SMTP provider or host Proton Bridge / a custom SMTP token on your server."}
        ],
        "docs_url": "https://proton.me/mail/bridge"
    },
    "zoho": {
        "id": "zoho",
        "name": "Zoho Mail",
        "logo_key": "zoho",
        "category": "business",
        "smtp": {"supported": True, "host": "smtp.zoho.com", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.zoho.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.zoho.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password", "smtp_auth"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": True,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "Zoho uses data-center specific hosts (smtp.zoho.com, smtp.zoho.in for India, smtp.zoho.eu for Europe). If 2FA is enabled, you must use an Application-Specific Password.",
        "setup_steps": [
            "Log in to Zoho Mail -> Settings -> Mail Accounts -> ensure IMAP/SMTP Access is enabled.",
            "If Two-Factor Authentication is ON, go to accounts.zoho.com -> Security -> App Passwords.",
            "Click 'Generate New Password', name it 'LeadFinder', and copy it.",
            "Verify your regional SMTP host: smtp.zoho.com (US/Global), smtp.zoho.in (India), or smtp.zoho.eu (EU).",
            "Use Port 465 (SSL) or 587 (TLS) and test the connection."
        ],
        "troubleshooting": [
            {"issue": "535 Authentication Failed", "solution": "Check if your Zoho account is hosted in India (.in) or EU (.eu) and update the SMTP Host accordingly. Use an App Password if 2FA is active."}
        ],
        "docs_url": "https://www.zoho.com/mail/help/imap-access.html"
    },
    "aol": {
        "id": "aol",
        "name": "AOL Mail",
        "logo_key": "aol",
        "category": "consumer",
        "smtp": {"supported": True, "host": "smtp.aol.com", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.aol.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.aol.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "AOL Mail requires a generated App Password for third-party SMTP/IMAP clients.",
        "setup_steps": [
            "Sign in to AOL Account Security (login.aol.com/account/security).",
            "Click 'Generate app password' (or 'Manage app passwords').",
            "Create a password for 'Other app' / 'LeadFinder' and copy it.",
            "Use smtp.aol.com on Port 465 (SSL) or 587 (TLS) and test the connection."
        ],
        "troubleshooting": [
            {"issue": "535 Authentication failed", "solution": "Regular AOL passwords are rejected by SMTP. Generate and paste an AOL App Password."}
        ],
        "docs_url": "https://help.aol.com/articles/Create-and-manage-app-password"
    },
    "gmx": {
        "id": "gmx",
        "name": "GMX Mail",
        "logo_key": "gmx",
        "category": "consumer",
        "smtp": {"supported": True, "host": "mail.gmx.com", "port": 587, "encryption": "TLS"},
        "imap": {"supported": True, "host": "imap.gmx.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.gmx.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["smtp_auth", "app_password"],
        "recommended_auth": "smtp_auth",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "GMX disables external POP3/IMAP/SMTP access by default. You must explicitly enable it inside GMX Mail Settings.",
        "setup_steps": [
            "Log in to GMX Mail webmail and open Settings -> POP3 & IMAP.",
            "Check 'Send and receive emails via external program (Outlook, Thunderbird, etc.)' and Save.",
            "If 2FA is enabled, create an application-specific password in GMX Security settings.",
            "Use mail.gmx.com on Port 587 (TLS) or 465 (SSL) and test the connection."
        ],
        "troubleshooting": [
            {"issue": "535 Authentication credentials invalid", "solution": "Confirm 'POP3 & IMAP' external access is enabled in GMX settings."}
        ],
        "docs_url": "https://support.gmx.com/pop-imap/imap/index.html"
    },
    "mail_com": {
        "id": "mail_com",
        "name": "Mail.com",
        "logo_key": "mail_com",
        "category": "consumer",
        "smtp": {"supported": True, "host": "smtp.mail.com", "port": 587, "encryption": "TLS"},
        "imap": {"supported": True, "host": "imap.mail.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.mail.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["smtp_auth"],
        "recommended_auth": "smtp_auth",
        "app_password_supported": False,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "External SMTP/IMAP access must be turned on inside Mail.com webmail settings before connecting.",
        "setup_steps": [
            "Log in to Mail.com -> E-mail -> Settings -> POP3 & IMAP.",
            "Enable 'Send and receive emails via external program' and click Save.",
            "Use smtp.mail.com on Port 587 (TLS) with your full Mail.com email and password.",
            "Click Save & Test Connection."
        ],
        "troubleshooting": [
            {"issue": "Authentication failed", "solution": "Ensure external POP3/IMAP access is enabled in Mail.com settings."}
        ],
        "docs_url": "https://support.mail.com/pop-imap/imap/server.html"
    },
    "tuta": {
        "id": "tuta",
        "name": "Tuta Mail (Tutanota)",
        "logo_key": "tuta",
        "category": "privacy_encrypted",
        "smtp": {"supported": False, "host": "", "port": 587, "encryption": "TLS"},
        "imap": {"supported": False, "host": "", "port": 993, "encryption": "SSL"},
        "pop": {"supported": False, "host": "", "port": 995, "encryption": "SSL"},
        "auth_methods": ["unsupported"],
        "recommended_auth": "unsupported",
        "app_password_supported": False,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "Tuta Mail does NOT support SMTP, IMAP, or App Passwords. Tuta uses a closed end-to-end encrypted protocol and blocks all third-party SMTP/IMAP integrations.",
        "setup_steps": [
            "Tuta Mail cannot be connected via SMTP or IMAP.",
            "To run automated email campaigns, please configure a supported provider (such as Gmail, Zoho, Fastmail, or a custom domain SMTP relay)."
        ],
        "troubleshooting": [
            {"issue": "Cannot connect Tuta Mail", "solution": "Tuta intentionally does not offer SMTP/IMAP servers. Use an alternative provider for automation."}
        ],
        "docs_url": "https://tuta.com/support"
    },
    "fastmail": {
        "id": "fastmail",
        "name": "Fastmail",
        "logo_key": "fastmail",
        "category": "business_and_privacy",
        "smtp": {"supported": True, "host": "smtp.fastmail.com", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.fastmail.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.fastmail.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": True,
        "requires_bridge": False,
        "security_note": "Fastmail requires an App Password with SMTP/IMAP permissions rather than your main account password.",
        "setup_steps": [
            "Open Fastmail Settings -> Privacy & Security -> Integrations.",
            "Under 'App passwords', click 'New app password'.",
            "Select 'Custom' and grant access to Mail (IMAP & SMTP).",
            "Copy the generated password and enter it with smtp.fastmail.com (Port 465 SSL or 587 TLS)."
        ],
        "troubleshooting": [
            {"issue": "535 Authentication failed", "solution": "Verify your App Password includes SMTP access scope and that you entered your full Fastmail email."}
        ],
        "docs_url": "https://www.fastmail.help/hc/en-us/articles/1500000278342-Server-names-and-ports"
    },
    "yandex": {
        "id": "yandex",
        "name": "Yandex Mail",
        "logo_key": "yandex",
        "category": "consumer",
        "smtp": {"supported": True, "host": "smtp.yandex.com", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.yandex.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.yandex.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "Yandex requires enabling IMAP/SMTP in Mail settings and creating a Mail App Password in Yandex ID.",
        "setup_steps": [
            "Open Yandex Mail -> All settings -> Email clients -> enable 'From the imap.yandex.com server via IMAP' and 'App passwords and OAuth tokens'.",
            "Go to id.yandex.com/security/app-passwords and create a 'Mail' app password.",
            "Use smtp.yandex.com on Port 465 (SSL) and paste the App Password."
        ],
        "troubleshooting": [
            {"issue": "535 5.7.8 Error: authentication failed", "solution": "Ensure 'Email clients' access is enabled in Yandex Mail settings and use an App Password, not your main Yandex password."}
        ],
        "docs_url": "https://yandex.com/support/mail/mail-clients/others.html"
    },
    "rediffmail": {
        "id": "rediffmail",
        "name": "Rediffmail",
        "logo_key": "rediffmail",
        "category": "consumer_and_business",
        "smtp": {"supported": True, "host": "smtp.rediffmail.com", "port": 587, "encryption": "TLS"},
        "imap": {"supported": True, "host": "imap.rediffmail.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.rediffmail.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["smtp_auth"],
        "recommended_auth": "smtp_auth",
        "app_password_supported": False,
        "oauth2_supported": False,
        "requires_paid_plan": True,
        "requires_bridge": False,
        "security_note": "Free @rediffmail.com accounts typically restrict external SMTP access. Rediffmail Pro / Enterprise accounts support SMTP authentication.",
        "setup_steps": [
            "Confirm your account is Rediffmail Pro / Business with SMTP access enabled.",
            "Use smtp.rediffmail.com (Port 587 TLS or Port 25) and imap.rediffmail.com (Port 993 SSL).",
            "Enter your full Rediffmail email and password, then click Test Connection."
        ],
        "troubleshooting": [
            {"issue": "Connection or Authentication rejected", "solution": "Free Rediffmail accounts generally block external SMTP. Upgrade to Rediffmail Pro or use a custom SMTP relay."}
        ],
        "docs_url": "https://support.rediff.com/"
    },
    "qq": {
        "id": "qq",
        "name": "QQ Mail",
        "logo_key": "qq",
        "category": "consumer",
        "smtp": {"supported": True, "host": "smtp.qq.com", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.qq.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.qq.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "QQ Mail requires enabling POP3/SMTP service and using a 16-character Authorization Code instead of your QQ password.",
        "setup_steps": [
            "Log in to QQ Mail webmail -> Settings -> Account.",
            "Locate 'POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV Service' and enable 'POP3/SMTP' or 'IMAP/SMTP'.",
            "Verify via SMS/WeChat to generate your 16-character Authorization Code.",
            "Paste the Authorization Code into the Password field with smtp.qq.com (Port 465, SSL)."
        ],
        "troubleshooting": [
            {"issue": "535 Login Fail / Error", "solution": "Ensure you entered the 16-character Authorization Code generated in QQ Mail Settings, not your QQ account password."}
        ],
        "docs_url": "https://service.mail.qq.com/"
    },
    "netease_163": {
        "id": "netease_163",
        "name": "163 Mail (NetEase)",
        "logo_key": "netease_163",
        "category": "consumer",
        "smtp": {"supported": True, "host": "smtp.163.com", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.163.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.163.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "163 Mail requires enabling POP3/SMTP/IMAP in NetEase settings and using an Authorization Code.",
        "setup_steps": [
            "Log in to mail.163.com -> Settings -> POP3/SMTP/IMAP.",
            "Enable IMAP/SMTP service and complete phone verification.",
            "Generate and copy the Client Authorization Code.",
            "Use smtp.163.com on Port 465 (SSL) with the Authorization Code as your password."
        ],
        "troubleshooting": [
            {"issue": "535 Error: authentication failed", "solution": "Use the NetEase Client Authorization Code instead of your web login password."}
        ],
        "docs_url": "https://help.mail.163.com/"
    },
    "netease_126": {
        "id": "netease_126",
        "name": "126 Mail (NetEase)",
        "logo_key": "netease_126",
        "category": "consumer",
        "smtp": {"supported": True, "host": "smtp.126.com", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.126.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.126.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "126 Mail requires enabling IMAP/SMTP in NetEase settings and using a Client Authorization Code.",
        "setup_steps": [
            "Log in to mail.126.com -> Settings -> POP3/SMTP/IMAP.",
            "Enable IMAP/SMTP service and verify via phone.",
            "Generate and copy the Client Authorization Code.",
            "Use smtp.126.com on Port 465 (SSL) with the Authorization Code."
        ],
        "troubleshooting": [
            {"issue": "535 Error: authentication failed", "solution": "Use the Client Authorization Code generated in 126 Mail settings."}
        ],
        "docs_url": "https://help.mail.163.com/"
    },
    "naver": {
        "id": "naver",
        "name": "Naver Email",
        "logo_key": "naver",
        "category": "consumer",
        "smtp": {"supported": True, "host": "smtp.naver.com", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.naver.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.naver.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password", "smtp_auth"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "Naver requires enabling IMAP/SMTP in Naver Mail Settings -> POP3/IMAP Settings. Use an App Password if 2FA is active.",
        "setup_steps": [
            "Open Naver Mail -> Settings (bottom left) -> POP3/IMAP Settings.",
            "Enable 'IMAP/SMTP Use' and save.",
            "If 2-Step Verification is active on your Naver ID, generate an Application Password in Naver Security settings.",
            "Use smtp.naver.com on Port 465 (SSL) or 587 (TLS)."
        ],
        "troubleshooting": [
            {"issue": "Authentication failed", "solution": "Confirm IMAP/SMTP is turned ON in Naver Mail settings and use an App Password if 2FA is enabled."}
        ],
        "docs_url": "https://help.naver.com/"
    },
    "seznam": {
        "id": "seznam",
        "name": "Seznam Email",
        "logo_key": "seznam",
        "category": "consumer",
        "smtp": {"supported": True, "host": "smtp.seznam.cz", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.seznam.cz", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop3.seznam.cz", "port": 995, "encryption": "SSL"},
        "auth_methods": ["smtp_auth", "app_password"],
        "recommended_auth": "smtp_auth",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "IMAP/SMTP access must be enabled in Seznam Email Settings -> Propojeni (Connections).",
        "setup_steps": [
            "Log in to email.seznam.cz -> Nastaveni (Settings) -> Propojeni.",
            "Enable IMAP/SMTP access.",
            "If 2FA is active, generate an application password in Seznam Account Security.",
            "Use smtp.seznam.cz on Port 465 (SSL)."
        ],
        "troubleshooting": [
            {"issue": "Login rejected", "solution": "Verify IMAP/SMTP access is enabled in Seznam settings."}
        ],
        "docs_url": "https://napoveda.seznam.cz/cz/email/"
    },
    "web_de": {
        "id": "web_de",
        "name": "WEB.DE",
        "logo_key": "web_de",
        "category": "consumer",
        "smtp": {"supported": True, "host": "smtp.web.de", "port": 587, "encryption": "TLS"},
        "imap": {"supported": True, "host": "imap.web.de", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop3.web.de", "port": 995, "encryption": "SSL"},
        "auth_methods": ["smtp_auth", "app_password"],
        "recommended_auth": "smtp_auth",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "WEB.DE requires manually enabling POP3/IMAP/SMTP access in account settings.",
        "setup_steps": [
            "Log in to WEB.DE Mail -> Einstellungen (Settings) -> POP3/IMAP Abruf.",
            "Enable 'E-Mails per externem Programm (Outlook, Thunderbird) versenden und empfangen' and Save.",
            "Use smtp.web.de on Port 587 (TLS) and test the connection."
        ],
        "troubleshooting": [
            {"issue": "535 Authentication credentials invalid", "solution": "Enable external POP3/IMAP/SMTP access in WEB.DE settings."}
        ],
        "docs_url": "https://hilfe.web.de/pop-imap/imap/imap-serverdaten.html"
    },
    "mailfence": {
        "id": "mailfence",
        "name": "Mailfence",
        "logo_key": "mailfence",
        "category": "privacy_encrypted",
        "smtp": {"supported": True, "host": "smtp.mailfence.com", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.mailfence.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.mailfence.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["smtp_auth", "app_password"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": True,
        "requires_bridge": False,
        "security_note": "Mailfence requires a paid subscription (Entry, Pro, or Ultra) for SMTP/IMAP access. Free accounts only support webmail.",
        "setup_steps": [
            "Ensure your Mailfence account is on a paid plan with SMTP/IMAP enabled.",
            "Open Mailfence Settings -> Account -> Security to generate an Application Password if 2FA is active.",
            "Use smtp.mailfence.com on Port 465 (SSL) or 587 (TLS) and test the connection."
        ],
        "troubleshooting": [
            {"issue": "SMTP access denied", "solution": "Verify your Mailfence subscription includes SMTP/IMAP access (paid plans only)."}
        ],
        "docs_url": "https://kb.mailfence.com/kb/smtp-settings/"
    },
    "hushmail": {
        "id": "hushmail",
        "name": "Hushmail",
        "logo_key": "hushmail",
        "category": "privacy_encrypted",
        "smtp": {"supported": True, "host": "smtp.hushmail.com", "port": 587, "encryption": "TLS"},
        "imap": {"supported": True, "host": "imap.hushmail.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.hushmail.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["smtp_auth"],
        "recommended_auth": "smtp_auth",
        "app_password_supported": False,
        "oauth2_supported": False,
        "requires_paid_plan": True,
        "requires_bridge": False,
        "security_note": "Hushmail requires a paid plan for IMAP/SMTP access. Free accounts are webmail-only.",
        "setup_steps": [
            "Ensure your Hushmail plan supports IMAP/SMTP access.",
            "Enable IMAP/SMTP in Hushmail Preferences if required.",
            "Use smtp.hushmail.com on Port 587 (TLS) or 465 (SSL) with your full Hushmail address and passphrase."
        ],
        "troubleshooting": [
            {"issue": "Authentication failed", "solution": "Confirm your Hushmail plan includes IMAP/SMTP access."}
        ],
        "docs_url": "https://help.hushmail.com/"
    },
    "startmail": {
        "id": "startmail",
        "name": "StartMail",
        "logo_key": "startmail",
        "category": "privacy_encrypted",
        "smtp": {"supported": True, "host": "smtp.startmail.com", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.startmail.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop.startmail.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["app_password"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": True,
        "requires_bridge": False,
        "security_note": "StartMail is a paid privacy service and requires creating a dedicated IMAP/SMTP Device Password.",
        "setup_steps": [
            "Log in to StartMail -> Settings -> IMAP / SMTP.",
            "Enable IMAP/SMTP access and generate a new Device / App Password.",
            "Use smtp.startmail.com on Port 465 (SSL) and paste the Device Password."
        ],
        "troubleshooting": [
            {"issue": "535 Authentication failed", "solution": "StartMail rejects your web login password for SMTP; generate an IMAP/SMTP Device Password in StartMail settings."}
        ],
        "docs_url": "https://support.startmail.com/"
    },
    "posteo": {
        "id": "posteo",
        "name": "Posteo",
        "logo_key": "posteo",
        "category": "privacy_encrypted",
        "smtp": {"supported": True, "host": "posteo.de", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "posteo.de", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "posteo.de", "port": 995, "encryption": "SSL"},
        "auth_methods": ["smtp_auth", "app_password"],
        "recommended_auth": "smtp_auth",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": True,
        "requires_bridge": False,
        "security_note": "Posteo supports standard SMTP/IMAP on paid accounts. If 2FA is active, use an app password.",
        "setup_steps": [
            "Ensure your Posteo account is active.",
            "Use posteo.de as both SMTP (Port 465 SSL / 587 TLS) and IMAP (Port 993 SSL) host.",
            "Enter your full @posteo.de email and password (or 2FA app password) and test."
        ],
        "troubleshooting": [
            {"issue": "Login failed", "solution": "Use your full email address including @posteo.de as the Username."}
        ],
        "docs_url": "https://posteo.de/en/help/how-do-i-set-up-posteo-in-an-email-client-pop3-imap-and-smtp"
    },
    "mailbox_org": {
        "id": "mailbox_org",
        "name": "mailbox.org",
        "logo_key": "mailbox_org",
        "category": "privacy_encrypted",
        "smtp": {"supported": True, "host": "smtp.mailbox.org", "port": 465, "encryption": "SSL"},
        "imap": {"supported": True, "host": "imap.mailbox.org", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "pop3.mailbox.org", "port": 995, "encryption": "SSL"},
        "auth_methods": ["smtp_auth", "app_password"],
        "recommended_auth": "smtp_auth",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": True,
        "requires_bridge": False,
        "security_note": "mailbox.org supports standard SMTP/IMAP on paid plans. Generate an app password if 2FA is enabled.",
        "setup_steps": [
            "Ensure your mailbox.org subscription is active.",
            "Use smtp.mailbox.org (Port 465 SSL / 587 TLS) and imap.mailbox.org (Port 993 SSL).",
            "Enter your full @mailbox.org email and password (or app password) and click Test Connection."
        ],
        "troubleshooting": [
            {"issue": "Authentication failed", "solution": "Verify you are using your primary mailbox.org address as the Username."}
        ],
        "docs_url": "https://kb.mailbox.org/en/private/e-mail-article/e-mail-setup-with-imap-and-smtp/"
    },
    "runbox": {
        "id": "runbox",
        "name": "Runbox",
        "logo_key": "runbox",
        "category": "privacy_encrypted",
        "smtp": {"supported": True, "host": "mail.runbox.com", "port": 587, "encryption": "TLS"},
        "imap": {"supported": True, "host": "mail.runbox.com", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "mail.runbox.com", "port": 995, "encryption": "SSL"},
        "auth_methods": ["smtp_auth", "app_password"],
        "recommended_auth": "app_password",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": True,
        "requires_bridge": False,
        "security_note": "Runbox supports standard SMTP/IMAP and per-application passwords in Runbox Account -> Security.",
        "setup_steps": [
            "Log in to Runbox -> Account -> Security -> App Passwords (recommended).",
            "Use mail.runbox.com for SMTP (Port 587 TLS / 465 SSL) and IMAP (Port 993 SSL).",
            "Enter your full Runbox email and password, then click Test Connection."
        ],
        "troubleshooting": [
            {"issue": "Authentication rejected", "solution": "Use an App Password if 2FA is enabled on your Runbox account."}
        ],
        "docs_url": "https://help.runbox.com/email-programs/"
    },
    "custom_domain": {
        "id": "custom_domain",
        "name": "Custom Domain / Unknown Provider",
        "logo_key": "custom",
        "category": "custom",
        "smtp": {"supported": True, "host": "", "port": 587, "encryption": "TLS"},
        "imap": {"supported": True, "host": "", "port": 993, "encryption": "SSL"},
        "pop": {"supported": True, "host": "", "port": 995, "encryption": "SSL"},
        "auth_methods": ["smtp_auth", "app_password", "oauth2"],
        "recommended_auth": "smtp_auth",
        "app_password_supported": True,
        "oauth2_supported": False,
        "requires_paid_plan": False,
        "requires_bridge": False,
        "security_note": "This domain is a custom business domain or an unrecognized provider. Enter the SMTP/IMAP server details provided by your email host (e.g., Google Workspace, Microsoft 365, Zoho, cPanel, or Amazon SES).",
        "setup_steps": [
            "Check which mail host powers your custom domain (Google Workspace, Microsoft 365, Zoho, or cPanel/Webmail).",
            "Enter the exact SMTP Host (e.g., smtp.gmail.com, smtp.office365.com, or mail.yourdomain.com).",
            "Select Port 587 (TLS) or Port 465 (SSL).",
            "Enter your mailbox email address and password / App Password.",
            "Click Save & Test Connection to verify authentication."
        ],
        "troubleshooting": [
            {"issue": "DNS / Connection Failed", "solution": "Double-check the SMTP hostname with your domain hosting provider or IT administrator."},
            {"issue": "535 Authentication Failed", "solution": "If your custom domain is hosted on Google Workspace or Microsoft 365, use an App Password or enable Authenticated SMTP."}
        ],
        "docs_url": ""
    }
}

# Verified exact domain -> provider_id registry
DOMAIN_TO_PROVIDER: Dict[str, str] = {
    # Gmail
    "gmail.com": "gmail",
    "googlemail.com": "gmail",
    # Outlook / Microsoft
    "outlook.com": "outlook",
    "hotmail.com": "outlook",
    "live.com": "outlook",
    "msn.com": "outlook",
    "outlook.in": "outlook",
    "outlook.co.uk": "outlook",
    "hotmail.co.uk": "outlook",
    "hotmail.fr": "outlook",
    "hotmail.de": "outlook",
    # Yahoo
    "yahoo.com": "yahoo",
    "yahoo.co.in": "yahoo",
    "yahoo.in": "yahoo",
    "yahoo.co.uk": "yahoo",
    "yahoo.ca": "yahoo",
    "yahoo.fr": "yahoo",
    "yahoo.de": "yahoo",
    "ymail.com": "yahoo",
    "rocketmail.com": "yahoo",
    # iCloud
    "icloud.com": "icloud",
    "me.com": "icloud",
    "mac.com": "icloud",
    # Proton
    "proton.me": "proton",
    "protonmail.com": "proton",
    "protonmail.ch": "proton",
    "pm.me": "proton",
    # Zoho
    "zoho.com": "zoho",
    "zohomail.com": "zoho",
    "zohomail.in": "zoho",
    "zoho.in": "zoho",
    "zoho.eu": "zoho",
    # AOL
    "aol.com": "aol",
    "aim.com": "aol",
    # GMX
    "gmx.com": "gmx",
    "gmx.net": "gmx",
    "gmx.de": "gmx",
    "gmx.at": "gmx",
    "gmx.ch": "gmx",
    # Mail.com
    "mail.com": "mail_com",
    "email.com": "mail_com",
    "usa.com": "mail_com",
    "consultant.com": "mail_com",
    # Tuta
    "tuta.com": "tuta",
    "tuta.io": "tuta",
    "tutanota.com": "tuta",
    "tutanota.de": "tuta",
    "tutamail.com": "tuta",
    "keemail.me": "tuta",
    # Fastmail
    "fastmail.com": "fastmail",
    "fastmail.fm": "fastmail",
    "fastmail.org": "fastmail",
    "fastmail.net": "fastmail",
    # Yandex
    "yandex.com": "yandex",
    "yandex.ru": "yandex",
    "ya.ru": "yandex",
    # Rediffmail
    "rediffmail.com": "rediffmail",
    "rediff.com": "rediffmail",
    # QQ
    "qq.com": "qq",
    "foxmail.com": "qq",
    # 163 / 126
    "163.com": "netease_163",
    "yeah.net": "netease_163",
    "126.com": "netease_126",
    # Naver
    "naver.com": "naver",
    # Seznam
    "seznam.cz": "seznam",
    "email.cz": "seznam",
    "post.cz": "seznam",
    # WEB.DE
    "web.de": "web_de",
    # Mailfence
    "mailfence.com": "mailfence",
    # Hushmail
    "hushmail.com": "hushmail",
    "hush.com": "hushmail",
    "hush.ai": "hushmail",
    # StartMail
    "startmail.com": "startmail",
    "use.startmail.com": "startmail",
    # Posteo
    "posteo.de": "posteo",
    "posteo.net": "posteo",
    "posteo.org": "posteo",
    "posteo.eu": "posteo",
    # Mailbox.org
    "mailbox.org": "mailbox_org",
    # Runbox
    "runbox.com": "runbox",
    "runbox.no": "runbox",
}


def extract_domain(email: Optional[str]) -> str:
    """Safely extract the lowercase domain part from an email address."""
    raw = str(email or "").strip().lower()
    if "@" not in raw:
        return ""
    local, _, domain = raw.rpartition("@")
    if not local or not domain or "." not in domain:
        return ""
    return domain.strip()


def detect_email_provider(email: Optional[str], include_details: bool = True) -> Dict[str, Any]:
    """
    Identify the email provider from an email address using the centralized domain registry.

    Returns:
      - provider_id, provider_name, logo_key, domain
      - detection_status: 'identified' | 'unknown_custom_domain' | 'invalid'
      - is_known_provider: bool
      - detected_at: ISO timestamp
      - Full SMTP/IMAP/auth/guide metadata if include_details=True
    """
    cleaned_email = str(email or "").strip().lower()
    domain = extract_domain(cleaned_email)
    now_iso = datetime.now(timezone.utc).isoformat()

    if not domain:
        base = {
            "email": cleaned_email,
            "domain": "",
            "provider_id": "custom_domain",
            "provider_name": "Unknown Provider",
            "logo_key": "custom",
            "detection_status": "invalid",
            "is_known_provider": False,
            "detected_at": now_iso,
        }
        if include_details:
            base["provider"] = PROVIDERS["custom_domain"]
        return base

    provider_id = DOMAIN_TO_PROVIDER.get(domain)
    if provider_id and provider_id in PROVIDERS:
        provider_info = PROVIDERS[provider_id]
        detection_status = "identified"
        is_known = True
    else:
        provider_info = PROVIDERS["custom_domain"]
        provider_id = "custom_domain"
        detection_status = "unknown_custom_domain"
        is_known = False

    result: Dict[str, Any] = {
        "email": cleaned_email,
        "domain": domain,
        "provider_id": provider_id,
        "provider_name": provider_info["name"],
        "logo_key": provider_info["logo_key"],
        "detection_status": detection_status,
        "is_known_provider": is_known,
        "detected_at": now_iso,
    }
    if include_details:
        result["provider"] = provider_info
    return result


def build_user_provider_snapshot(email: Optional[str]) -> Dict[str, Any]:
    """Return lightweight provider metadata suitable for storing on user documents."""
    return detect_email_provider(email, include_details=False)


def get_provider_by_id(provider_id: Optional[str]) -> Dict[str, Any]:
    """Retrieve a provider config from the registry by ID, defaulting to custom_domain."""
    if provider_id and provider_id in PROVIDERS:
        return PROVIDERS[provider_id]
    return PROVIDERS["custom_domain"]


def list_all_providers() -> List[Dict[str, Any]]:
    """Return summary list of all registered providers for UI selectors."""
    return [
        {
            "id": p["id"],
            "name": p["name"],
            "logo_key": p["logo_key"],
            "smtp": p["smtp"],
            "imap": p["imap"],
            "pop": p.get("pop", {"supported": False, "host": "", "port": 995, "encryption": "SSL"}),
            "recommended_auth": p["recommended_auth"],
            "app_password_supported": p["app_password_supported"],
            "oauth2_supported": p["oauth2_supported"],
        }
        for p in PROVIDERS.values()
    ]


# ─────────────────────────────────────────────────────────────
# DNS MX Record Auto-Detection for Custom Domains
# ─────────────────────────────────────────────────────────────

# In-memory TTL cache: domain -> (timestamp, mx_hosts)
_MX_CACHE: Dict[str, Tuple[float, List[str]]] = {}
_MX_CACHE_TTL_SECONDS = 3600  # 1 hour

MX_HOST_RULES: List[Tuple[Tuple[str, ...], str, Optional[Dict[str, Any]]]] = [
    (("aspmx.l.google.com", "googlemail.com", "smtp.google.com", "google.com"), "gmail", {"display_suffix": "Workspace"}),
    (("protection.outlook.com", "olc.protection.outlook.com", "mail.eo.outlook.com"), "outlook", {"smtp_host": "smtp.office365.com", "display_suffix": "Microsoft 365"}),
    (("zoho.in",), "zoho", {"smtp_host": "smtp.zoho.in", "imap_host": "imap.zoho.in", "pop_host": "pop.zoho.in", "display_suffix": "India"}),
    (("zoho.eu",), "zoho", {"smtp_host": "smtp.zoho.eu", "imap_host": "imap.zoho.eu", "pop_host": "pop.zoho.eu", "display_suffix": "EU"}),
    (("zoho.com", "zohomail.com"), "zoho", None),
    (("messagingengine.com",), "fastmail", None),
    (("yandex.net", "yandex.ru"), "yandex", None),
    (("protonmail.ch", "proton.ch"), "proton", None),
    (("tutanota.de", "tuta.com"), "tuta", None),
    (("mailfence.com",), "mailfence", None),
    (("posteo.de",), "posteo", None),
    (("mailbox.org",), "mailbox_org", None),
    (("runbox.com",), "runbox", None),
    (("yahoodns.net",), "yahoo", None),
    (("icloud.com",), "icloud", None),
]


def lookup_mx_hosts_sync(domain: str, timeout: float = 2.0) -> List[str]:
    """Query DNS MX records for a domain via dnspython with DNS-over-HTTPS fallback."""
    domain = str(domain or "").strip().lower()
    if not domain or "." not in domain:
        return []

    now = time.monotonic()
    cached = _MX_CACHE.get(domain)
    if cached and (now - cached[0]) < _MX_CACHE_TTL_SECONDS:
        return cached[1]

    mx_hosts: List[str] = []

    # 1. Try dnspython UDP/TCP DNS resolver
    if dns is not None:
        try:
            resolver = dns.resolver.Resolver()
            resolver.timeout = timeout
            resolver.lifetime = timeout
            answers = resolver.resolve(domain, "MX")
            records = sorted(
                ((r.preference, str(r.exchange).rstrip(".").lower()) for r in answers),
                key=lambda x: x[0],
            )
            mx_hosts = [host for _, host in records if host]
        except Exception:
            mx_hosts = []

    # 2. Fallback to Google DNS-over-HTTPS if dnspython returned nothing
    if not mx_hosts:
        try:
            resp = httpx.get(
                "https://dns.google/resolve",
                params={"name": domain, "type": "MX"},
                timeout=timeout,
            )
            if resp.status_code == 200:
                data = resp.json()
                raw_answers = data.get("Answer") or []
                parsed: List[Tuple[int, str]] = []
                for ans in raw_answers:
                    if ans.get("type") == 15 and ans.get("data"):
                        parts = str(ans["data"]).split()
                        if len(parts) >= 2:
                            try:
                                pref = int(parts[0])
                            except ValueError:
                                pref = 10
                            host = parts[1].rstrip(".").lower()
                            if host:
                                parsed.append((pref, host))
                parsed.sort(key=lambda x: x[0])
                mx_hosts = [h for _, h in parsed]
        except Exception:
            pass

    _MX_CACHE[domain] = (now, mx_hosts)
    return mx_hosts


def _match_provider_from_mx(mx_hosts: List[str]) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Match a list of MX hostnames against known provider mail exchange patterns."""
    for mx in mx_hosts:
        mx_low = mx.lower()
        for patterns, pid, overrides in MX_HOST_RULES:
            if any(pat in mx_low for pat in patterns):
                return pid, overrides
    return None, None


def detect_email_provider_with_mx(email: Optional[str], include_details: bool = True) -> Dict[str, Any]:
    """
    Detect provider from domain registry first; if custom domain, inspect DNS MX records
    to identify Google Workspace, Microsoft 365, Zoho, Fastmail, etc.
    """
    base = detect_email_provider(email, include_details=include_details)
    if base.get("is_known_provider") or base.get("detection_status") == "invalid":
        base["detection_method"] = "domain_registry"
        base["mx_hosts"] = []
        return base

    domain = base.get("domain", "")
    mx_hosts = lookup_mx_hosts_sync(domain)
    base["mx_hosts"] = mx_hosts[:5]

    matched_pid, overrides = _match_provider_from_mx(mx_hosts)
    if matched_pid and matched_pid in PROVIDERS:
        provider_info = copy.deepcopy(PROVIDERS[matched_pid])
        if overrides:
            if overrides.get("smtp_host"):
                provider_info["smtp"]["host"] = overrides["smtp_host"]
            if overrides.get("imap_host"):
                provider_info["imap"]["host"] = overrides["imap_host"]
            if overrides.get("pop_host") and "pop" in provider_info:
                provider_info["pop"]["host"] = overrides["pop_host"]
            if overrides.get("display_suffix"):
                provider_info["name"] = f"{provider_info['name']} ({overrides['display_suffix']})"

        base["provider_id"] = matched_pid
        base["provider_name"] = provider_info["name"]
        base["logo_key"] = provider_info["logo_key"]
        base["detection_status"] = "identified"
        base["is_known_provider"] = True
        base["detection_method"] = "mx_lookup"
        if include_details:
            base["provider"] = provider_info
        return base

    base["detection_method"] = "custom_fallback"
    return base


async def detect_email_provider_async(email: Optional[str], include_details: bool = True) -> Dict[str, Any]:
    """Non-blocking async wrapper for provider detection with DNS MX lookup."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, detect_email_provider_with_mx, email, include_details)


async def build_user_provider_snapshot_async(email: Optional[str]) -> Dict[str, Any]:
    """Async lightweight provider snapshot (including MX lookup) for storing on user documents."""
    return await detect_email_provider_async(email, include_details=False)

