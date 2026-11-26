"""
routes/public.py - Public tracking pixel, click redirect, unsubscribe, and bounce endpoints.
"""
import base64
import hmac
import re
from urllib.parse import urlparse

from flask import Blueprint, Response, jsonify, redirect, render_template, request, send_from_directory, session

import config
from db import get_db
from services.bounce_detector import run_bounce_check

public_bp = Blueprint("public", __name__)

PIXEL_GIF = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
TOKEN_RE = re.compile(r"^[0-9a-f]{64}$", re.I)


def get_client_ip() -> str:
    for hdr in ("HTTP_CF_CONNECTING_IP", "HTTP_X_FORWARDED_FOR"):
        val = request.headers.get(hdr.replace("HTTP_", "").replace("_", "-"), "")
        if val:
            return val.split(",")[0].strip()
    return request.remote_addr or ""


def is_valid_http_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def serve_pixel() -> Response:
    resp = Response(PIXEL_GIF, status=200, mimetype="image/gif")
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "Thu, 01 Jan 1970 00:00:00 GMT"
    return resp


@public_bp.route("/track")
@public_bp.route("/track.php")
def track():
    token = (request.args.get("t") or "").strip()
    event = (request.args.get("e") or "").strip()
    dest_url = (request.args.get("u") or "").strip()

    if not TOKEN_RE.match(token):
        return serve_pixel()

    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM leads WHERE tracking_token = %s LIMIT 1", (token,))
            row = cur.fetchone()

        if row:
            lead_id = int(row["id"])
            ip = get_client_ip()
            ua = (request.headers.get("User-Agent") or "")[:512]

            if event == "open":
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO email_events (lead_id, event_type, ip, user_agent) VALUES (%s, 'open', %s, %s)",
                        (lead_id, ip, ua),
                    )
            elif event == "click" and is_valid_http_url(dest_url):
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO email_events (lead_id, event_type, url, ip, user_agent) VALUES (%s, 'click', %s, %s, %s)",
                        (lead_id, dest_url, ip, ua),
                    )
                return redirect(dest_url, code=302)
    except Exception:
        if event == "click" and is_valid_http_url(dest_url):
            return redirect(dest_url, code=302)
        return serve_pixel()
    finally:
        if conn:
            conn.close()

    return serve_pixel()


@public_bp.route("/unsubscribe", methods=["GET", "POST"])
@public_bp.route("/unsubscribe.php", methods=["GET", "POST"])
def unsubscribe():
    token = (request.args.get("t") or "").strip()
    if not TOKEN_RE.match(token):
        return render_template("public/unsubscribe.html", title="Invalid Link", state="invalid")

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, first_name, email, status FROM leads WHERE tracking_token = %s LIMIT 1", (token,))
            lead = cur.fetchone()

        if not lead:
            return render_template("public/unsubscribe.html", title="Not Found", state="not_found")

        first_name = lead["first_name"] or "there"
        email_addr = lead["email"]

        if lead["status"] == "unsubscribed":
            return render_template(
                "public/unsubscribe.html",
                title="Already Unsubscribed",
                state="already",
                first_name=first_name,
                email=email_addr,
            )

        if request.method == "POST":
            ip = get_client_ip()
            ua = (request.headers.get("User-Agent") or "")[:512]
            with conn.cursor() as cur:
                cur.execute("UPDATE leads SET status='unsubscribed', updated_at=NOW() WHERE id=%s", (int(lead["id"]),))
                cur.execute(
                    "INSERT INTO email_events (lead_id, event_type, ip, user_agent) VALUES (%s, 'unsubscribe', %s, %s)",
                    (int(lead["id"]), ip, ua),
                )
            return render_template(
                "public/unsubscribe.html",
                title="Unsubscribed Successfully",
                state="done",
                first_name=first_name,
                email=email_addr,
            )

        action_url = f"{config.BASE_URL}/unsubscribe.php?t={token}"
        return render_template(
            "public/unsubscribe.html",
            title="Unsubscribe",
            state="confirm",
            first_name=first_name,
            email=email_addr,
            action_url=action_url,
        )
    finally:
        conn.close()


@public_bp.route("/bounce_check")
@public_bp.route("/bounce_check.php")
def web_bounce_check():
    is_authorized = bool(session.get("admin_id"))
    secret_param = request.args.get("secret", "")
    if config.REPORT_SYNC_SECRET and hmac.compare_digest(config.REPORT_SYNC_SECRET, secret_param):
        is_authorized = True

    if not is_authorized:
        return Response("Access denied. Admin login required.", status=403)

    conn = get_db()
    try:
        res = run_bounce_check(conn)
    finally:
        conn.close()

    if request.args.get("format") == "json":
        return jsonify(res)

    flash_msg = ("success:" if res["success"] else "error:") + res["message"]
    return_url = request.args.get("return") or "/admin/"
    sep = "&" if "?" in return_url else "?"
    return redirect(f"{return_url}{sep}flash={flash_msg}")


@public_bp.route("/uploads/<path:filename>")
def uploaded_media(filename):
    config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return send_from_directory(config.UPLOAD_DIR, filename)


@public_bp.route("/images/<path:filename>")
def brand_images(filename):
    return send_from_directory(config.PARENT_DIR / "images", filename)
