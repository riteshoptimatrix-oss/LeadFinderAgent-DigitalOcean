"""
routes/admin.py - Protected Admin Panel routes (Flask Blueprint).
"""
import csv
import hashlib
import hmac
import io
import math
import os
import re
import secrets
import smtplib
import time
from datetime import date, datetime, timedelta
from email.mime.text import MIMEText
from email.utils import formataddr
from functools import wraps
from urllib.parse import urlencode

import bcrypt
import openpyxl
import requests
from flask import (
    Blueprint,
    Response,
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.utils import secure_filename

import config
from db import get_db, settings_get
from services.bounce_detector import run_bounce_check
from services.mailer_engine import append_to_imap_sent, send_lead_email
from services.template_helpers import (
    ensure_templates_table,
    get_all_templates,
    get_default_template,
    get_template_by_id,
)

admin_bp = Blueprint("admin", __name__)


def get_client_ip() -> str:
    for hdr in ("CF-Connecting-IP", "X-Forwarded-For"):
        val = request.headers.get(hdr, "")
        if val:
            return val.split(",")[0].strip()
    return request.remote_addr or "0.0.0.0"


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("admin_id") or not session.get("admin_user"):
            return redirect(url_for("admin.login", next=request.full_path))
        if not session.get("csrf_token"):
            session["csrf_token"] = secrets.token_hex(32)
        return fn(*args, **kwargs)
    return wrapper


def verify_csrf():
    submitted = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token") or ""
    expected = session.get("csrf_token") or ""
    if not expected or not hmac.compare_digest(expected, submitted):
        abort(403, "CSRF token mismatch.")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


# ── AUTHENTICATION ────────────────────────────────────────────────────────────

@admin_bp.route("/login", methods=["GET", "POST"])
def login():
    if session.get("admin_id"):
        return redirect(url_for("admin.dashboard"))

    if not session.get("login_csrf"):
        session["login_csrf"] = secrets.token_hex(32)

    error = ""
    rate_blocked = False
    username_val = ""

    if request.method == "POST":
        submitted_csrf = request.form.get("csrf_token", "")
        if not hmac.compare_digest(session.get("login_csrf", ""), submitted_csrf):
            error = "Invalid request. Please refresh and try again."
        else:
            ip = get_client_ip()
            conn = get_db()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT COUNT(*) AS c FROM login_attempts WHERE ip=%s AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)",
                        (ip,),
                    )
                    attempts = int(cur.fetchone()["c"])

                    if attempts >= 5:
                        rate_blocked = True
                        error = "Too many login attempts. Please wait 15 minutes and try again."
                    else:
                        username_val = (request.form.get("username") or "").strip()
                        password = request.form.get("password") or ""
                        cur.execute("INSERT INTO login_attempts (ip, username) VALUES (%s, %s)", (ip, username_val))

                        if not username_val or not password:
                            error = "Username and password are required."
                        else:
                            cur.execute(
                                "SELECT id, username, password_hash FROM admin_users WHERE username=%s LIMIT 1",
                                (username_val,),
                            )
                            user = cur.fetchone()
                            if user and verify_password(password, user["password_hash"]):
                                session.permanent = True
                                session["admin_id"] = int(user["id"])
                                session["admin_user"] = user["username"]
                                session["csrf_token"] = secrets.token_hex(32)
                                session.pop("login_csrf", None)
                                cur.execute("UPDATE admin_users SET last_login=NOW() WHERE id=%s", (user["id"],))
                                next_url = request.args.get("next") or ""
                                if next_url.startswith("/") and not next_url.startswith("//"):
                                    return redirect(next_url)
                                return redirect(url_for("admin.dashboard"))
                            else:
                                error = "Invalid username or password."
            finally:
                conn.close()

    return render_template(
        "admin/login.html",
        error=error,
        rate_blocked=rate_blocked,
        username_val=username_val,
        csrf_token=session["login_csrf"],
    )


@admin_bp.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("admin.login", logged_out=1))


@admin_bp.route("/change_password", methods=["GET", "POST"])
@login_required
def change_password():
    flash = ""
    if request.method == "POST":
        verify_csrf()
        current = request.form.get("current_password", "")
        new_pass = request.form.get("new_password", "")
        confirm = request.form.get("confirm_password", "")

        if not current or not new_pass or not confirm:
            flash = "error:All fields are required."
        elif new_pass != confirm:
            flash = "error:New password and confirmation do not match."
        elif len(new_pass) < 8:
            flash = "error:New password must be at least 8 characters."
        else:
            conn = get_db()
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT password_hash FROM admin_users WHERE id=%s", (session["admin_id"],))
                    user = cur.fetchone()
                    if not user or not verify_password(current, user["password_hash"]):
                        flash = "error:Current password is incorrect."
                    else:
                        cur.execute(
                            "UPDATE admin_users SET password_hash=%s WHERE id=%s",
                            (hash_password(new_pass), session["admin_id"]),
                        )
                        flash = "success:Password changed successfully."
            finally:
                conn.close()

    return render_template(
        "admin/change_password.html",
        page_title="Change Password",
        active_nav="change_password",
        flash=flash,
    )


# ── DASHBOARD ─────────────────────────────────────────────────────────────────

@admin_bp.route("/", methods=["GET", "POST"])
@login_required
def dashboard():
    conn = get_db()
    try:
        if request.method == "POST" and request.form.get("action") == "check_bounces":
            verify_csrf()
            res = run_bounce_check(conn)
            flash_msg = ("success:" if res["success"] else "error:") + res["message"]
            return redirect(url_for("admin.dashboard", flash=flash_msg))

        with conn.cursor() as cur:
            cur.execute("SELECT status, COUNT(*) AS c FROM leads GROUP BY status")
            status_counts = {r["status"]: int(r["c"]) for r in cur.fetchall()}

            total_leads = sum(status_counts.values())
            total_new = status_counts.get("new", 0)
            total_sent = status_counts.get("sent", 0)
            total_bounced = status_counts.get("bounced", 0)
            total_unsub = status_counts.get("unsubscribed", 0)
            total_failed = status_counts.get("failed", 0)

            cur.execute("SELECT COUNT(DISTINCT lead_id) AS c FROM email_events WHERE event_type='open'")
            total_opened = int(cur.fetchone()["c"])
            cur.execute("SELECT COUNT(DISTINCT lead_id) AS c FROM email_events WHERE event_type='click'")
            total_clicked = int(cur.fetchone()["c"])

            open_rate = round(total_opened / total_sent * 100, 1) if total_sent > 0 else 0
            click_rate = round(total_clicked / total_sent * 100, 1) if total_sent > 0 else 0

            cur.execute("SELECT COUNT(*) AS c FROM leads WHERE status='sent' AND DATE(sent_at)=CURDATE()")
            sent_today = int(cur.fetchone()["c"])
            cur.execute("SELECT COUNT(DISTINCT lead_id) AS c FROM email_events WHERE event_type='open' AND DATE(created_at)=CURDATE()")
            opened_today = int(cur.fetchone()["c"])

            cur.execute(
                """
                SELECT DATE(sent_at) AS day, COUNT(*) AS sent,
                    SUM(CASE WHEN EXISTS(SELECT 1 FROM email_events ee WHERE ee.lead_id=leads.id AND ee.event_type='open') THEN 1 ELSE 0 END) AS opened,
                    SUM(CASE WHEN EXISTS(SELECT 1 FROM email_events ee WHERE ee.lead_id=leads.id AND ee.event_type='click') THEN 1 ELSE 0 END) AS clicked
                FROM leads
                WHERE sent_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                  AND status IN ('sent','bounced','unsubscribed')
                GROUP BY DATE(sent_at) ORDER BY day ASC
                """
            )
            trend_map = {str(r["day"]): r for r in cur.fetchall()}

            cur.execute(
                """
                SELECT ee.event_type, ee.created_at, l.first_name, l.last_name, l.email, ee.url
                FROM email_events ee JOIN leads l ON l.id = ee.lead_id
                ORDER BY ee.created_at DESC LIMIT 10
                """
            )
            recent_events = cur.fetchall()

            cur.execute(
                "SELECT first_name, last_name, email, company, title, status, fetched_at FROM leads ORDER BY fetched_at DESC LIMIT 5"
            )
            recent_leads = cur.fetchall()

        labels, sent_arr, open_arr, click_arr = [], [], [], []
        for i in range(29, -1, -1):
            d = (date.today() - timedelta(days=i)).isoformat()
            labels.append((date.today() - timedelta(days=i)).strftime("%d %b"))
            row = trend_map.get(d, {})
            sent_arr.append(int(row.get("sent") or 0))
            open_arr.append(int(row.get("opened") or 0))
            click_arr.append(int(row.get("clicked") or 0))

        return render_template(
            "admin/dashboard.html",
            page_title="Dashboard",
            active_nav="dashboard",
            flash=request.args.get("flash", ""),
            total_leads=total_leads,
            total_new=total_new,
            total_sent=total_sent,
            total_bounced=total_bounced,
            total_unsub=total_unsub,
            total_failed=total_failed,
            total_opened=total_opened,
            total_clicked=total_clicked,
            open_rate=open_rate,
            click_rate=click_rate,
            sent_today=sent_today,
            opened_today=opened_today,
            labels=labels,
            sent_arr=sent_arr,
            open_arr=open_arr,
            click_arr=click_arr,
            recent_events=recent_events,
            recent_leads=recent_leads,
            apollo_page=settings_get(conn, "apollo_last_page"),
            apollo_last_run=settings_get(conn, "apollo_last_run_date"),
            send_last_run=settings_get(conn, "send_last_run_date"),
        )
    finally:
        conn.close()


# ── LEADS MANAGEMENT ──────────────────────────────────────────────────────────

@admin_bp.route("/leads", methods=["GET", "POST"])
@login_required
def leads():
    conn = get_db()
    try:
        ensure_templates_table(conn)

        if request.method == "POST":
            verify_csrf()
            action = request.form.get("action", "")
            lid = int(request.form.get("lead_id") or 0)
            flash_msg = ""

            if action == "check_bounces":
                res = run_bounce_check(conn, True)
                flash_msg = ("success:" if res["success"] else "error:") + res["message"]
            elif lid > 0:
                with conn.cursor() as cur:
                    if action == "mark_bounced":
                        cur.execute("UPDATE leads SET status='bounced', updated_at=NOW() WHERE id=%s", (lid,))
                        flash_msg = "success:Lead marked as bounced."
                    elif action == "mark_new":
                        cur.execute("UPDATE leads SET status='new', updated_at=NOW() WHERE id=%s", (lid,))
                        flash_msg = "success:Lead reset to new."
                    elif action == "delete":
                        cur.execute("DELETE FROM leads WHERE id=%s", (lid,))
                        flash_msg = "success:Lead deleted."
                    elif action == "send_single":
                        cur.execute("SELECT * FROM leads WHERE id=%s LIMIT 1", (lid,))
                        lead = cur.fetchone()
                        if lead:
                            tpl = get_default_template(conn)
                            res = send_lead_email(conn, lead, tpl["body_html"], tpl["subject"])
                            if res["success"]:
                                flash_msg = f"success:Email sent successfully to {lead['email']}!"
                            else:
                                flash_msg = f"error:Email failed: {res.get('error')}"
            else:
                sel_ids = [int(x) for x in request.form.getlist("selected_ids") if x.isdigit()]
                if sel_ids:
                    placeholders = ",".join(["%s"] * len(sel_ids))
                    with conn.cursor() as cur:
                        if action == "bulk_delete":
                            cur.execute(f"DELETE FROM leads WHERE id IN ({placeholders})", sel_ids)
                            flash_msg = f"success:Deleted {len(sel_ids)} selected lead(s)."
                        elif action == "bulk_mark_new":
                            cur.execute(f"UPDATE leads SET status='new', updated_at=NOW() WHERE id IN ({placeholders})", sel_ids)
                            flash_msg = f"success:Reset {len(sel_ids)} lead(s) to new status."

            return redirect(url_for("admin.leads", flash=flash_msg))

        search = (request.args.get("q") or "").strip()
        status = (request.args.get("status") or "").strip()
        date_from = (request.args.get("from") or "").strip()
        date_to = (request.args.get("to") or "").strip()
        page = max(1, int(request.args.get("page") or 1))
        per_page = max(10, min(500, int(request.args.get("per_page") or 25)))

        where = ["1=1"]
        params = []
        if search:
            where.append("(l.first_name LIKE %s OR l.last_name LIKE %s OR l.email LIKE %s OR l.company LIKE %s)")
            like = f"%{search}%"
            params.extend([like, like, like, like])
        if status in ("new", "sent", "bounced", "unsubscribed", "failed"):
            where.append("l.status = %s")
            params.append(status)
        if date_from:
            where.append("DATE(l.fetched_at) >= %s")
            params.append(date_from)
        if date_to:
            where.append("DATE(l.fetched_at) <= %s")
            params.append(date_to)

        where_sql = " AND ".join(where)

        if request.args.get("export") == "csv":
            with conn.cursor() as cur:
                cur.execute(f"SELECT * FROM leads l WHERE {where_sql} ORDER BY l.id DESC", params)
                rows = cur.fetchall()
            buf = io.StringIO()
            if rows:
                writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
                writer.writeheader()
                writer.writerows(rows)
            return Response(
                buf.getvalue(),
                mimetype="text/csv",
                headers={"Content-Disposition": f'attachment; filename="leads-{date.today().isoformat()}.csv"'},
            )

        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS c FROM leads l WHERE {where_sql}", params)
            total = int(cur.fetchone()["c"])
            total_pages = max(1, math.ceil(total / per_page))
            page = min(page, total_pages)
            offset = (page - 1) * per_page

            cur.execute(
                f"""
                SELECT l.*,
                    (SELECT COUNT(*) FROM email_events ee WHERE ee.lead_id=l.id AND ee.event_type='open') AS opens,
                    (SELECT COUNT(*) FROM email_events ee WHERE ee.lead_id=l.id AND ee.event_type='click') AS clicks
                FROM leads l
                WHERE {where_sql}
                ORDER BY l.id DESC
                LIMIT %s OFFSET %s
                """,
                params + [per_page, offset],
            )
            leads_rows = cur.fetchall()

        return render_template(
            "admin/leads.html",
            page_title="Leads",
            active_nav="leads",
            flash=request.args.get("flash", ""),
            leads=leads_rows,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=total_pages,
            offset=offset,
            search=search,
            status=status,
            date_from=date_from,
            date_to=date_to,
        )
    finally:
        conn.close()


@admin_bp.route("/lead_form", methods=["GET", "POST"])
@login_required
def lead_form():
    conn = get_db()
    try:
        ensure_templates_table(conn)
        lead_id = int(request.args.get("id") or request.form.get("id") or 0)
        is_edit = lead_id > 0
        flash = ""

        lead = {
            "id": 0, "first_name": "", "last_name": "", "email": "", "company": "",
            "title": "", "city": "", "state": "", "country": "India", "employees": 0,
            "status": "new", "apollo_id": "", "tracking_token": "",
        }

        if is_edit:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM leads WHERE id=%s LIMIT 1", (lead_id,))
                row = cur.fetchone()
                if row:
                    lead = row
                else:
                    flash = "error:Lead not found."
                    is_edit = False
                    lead_id = 0

        if request.method == "POST":
            verify_csrf()
            action = request.form.get("form_action", "save")
            first_name = (request.form.get("first_name") or "").strip()
            last_name = (request.form.get("last_name") or "").strip()
            email_addr = (request.form.get("email") or "").strip().lower()
            company = (request.form.get("company") or "").strip()
            title = (request.form.get("title") or "").strip()
            city = (request.form.get("city") or "").strip()
            state = (request.form.get("state") or "").strip()
            country = (request.form.get("country") or "").strip()
            employees = int(request.form.get("employees") or 0)
            status = request.form.get("status", "new")
            if status not in ("new", "sent", "bounced", "unsubscribed", "failed"):
                status = "new"

            if not email_addr or "@" not in email_addr:
                flash = "error:A valid email address is required."
            else:
                with conn.cursor() as cur:
                    cur.execute("SELECT id FROM leads WHERE email=%s AND id != %s LIMIT 1", (email_addr, lead_id))
                    if cur.fetchone():
                        flash = "error:A lead with this email address already exists."
                    else:
                        if is_edit:
                            cur.execute(
                                """
                                UPDATE leads SET first_name=%s, last_name=%s, email=%s, company=%s,
                                    title=%s, city=%s, state=%s, country=%s, employees=%s, status=%s, updated_at=NOW()
                                WHERE id=%s
                                """,
                                (first_name, last_name, email_addr, company, title, city, state, country, employees, status, lead_id),
                            )
                            lead.update({
                                "first_name": first_name, "last_name": last_name, "email": email_addr,
                                "company": company, "title": title, "city": city, "state": state,
                                "country": country, "employees": employees, "status": status,
                            })
                            flash = "success:Lead updated successfully!"
                        else:
                            token = hashlib.sha256(f"{email_addr}{time.time()}".encode() + secrets.token_bytes(16)).hexdigest()
                            apollo_id = "manual_" + hashlib.sha256(f"{email_addr}{time.time()}".encode()).hexdigest()[:24]
                            cur.execute(
                                """
                                INSERT INTO leads (apollo_id, first_name, last_name, email, title, company,
                                    city, state, country, employees, tracking_token, status, fetched_at)
                                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                                """,
                                (apollo_id, first_name, last_name, email_addr, title, company, city, state, country, employees, token, status),
                            )
                            lead_id = cur.lastrowid
                            is_edit = True
                            lead.update({
                                "id": lead_id, "first_name": first_name, "last_name": last_name,
                                "email": email_addr, "company": company, "title": title,
                                "city": city, "state": state, "country": country,
                                "employees": employees, "status": status, "tracking_token": token,
                            })
                            flash = "success:Lead added successfully!"

                        if action == "save_and_send":
                            tpl_id = int(request.form.get("template_id") or 0)
                            tpl = get_template_by_id(conn, tpl_id) if tpl_id > 0 else get_default_template(conn)
                            subj = (request.form.get("email_subject") or "").strip() or tpl["subject"]
                            res = send_lead_email(conn, lead, tpl["body_html"], subj)
                            if res["success"]:
                                flash = f"success:Lead saved AND personalized email sent to {email_addr}!"
                                lead["status"] = "sent"
                            else:
                                flash = f"error:Lead saved, but sending failed: {res.get('error')}"
                                lead["status"] = "failed"

        return render_template(
            "admin/lead_form.html",
            page_title=f"Edit Lead #{lead['id']}" if is_edit else "Add New Lead",
            active_nav="lead_form",
            flash=flash,
            lead=lead,
            is_edit=is_edit,
            templates=get_all_templates(conn),
            default_template=get_default_template(conn),
        )
    finally:
        conn.close()


# ── CSV / XLSX IMPORT ─────────────────────────────────────────────────────────

def _parse_import_rows(file_path: str, ext: str, limit: int = 0) -> list[list[str]]:
    rows = []
    if ext == "xlsx":
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        ws = wb.active
        for row in ws.iter_rows(values_only=True):
            vals = [str(c).strip() if c is not None else "" for c in row]
            if any(vals):
                rows.append(vals)
                if limit and len(rows) >= limit:
                    break
        wb.close()
        return rows

    delim = "\t" if ext == "tsv" else ","
    with open(file_path, "r", encoding="utf-8-sig", errors="replace", newline="") as f:
        reader = csv.reader(f, delimiter=delim)
        for row in reader:
            vals = [c.strip() for c in row]
            if any(vals):
                rows.append(vals)
                if limit and len(rows) >= limit:
                    break
    return rows


def _auto_detect_columns(headers: list[str]) -> dict[str, int]:
    mapping = {}
    patterns = {
        "email": ["email", "e-mail", "work email"],
        "first_name": ["first name", "first_name", "firstname"],
        "last_name": ["last name", "last_name", "lastname"],
        "company": ["company", "organization", "company name"],
        "title": ["title", "job title", "designation"],
        "city": ["city"],
        "state": ["state"],
        "country": ["country"],
        "employees": ["employees", "# employees", "num_employees"],
        "apollo_id": ["apollo_id", "person id", "id"],
    }
    for idx, h in enumerate(headers):
        hl = h.lower().strip()
        for field, kws in patterns.items():
            if field not in mapping and any(kw == hl or kw in hl for kw in kws):
                mapping[field] = idx
    return mapping


@admin_bp.route("/import", methods=["GET", "POST"])
@login_required
def import_leads():
    config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    step = "upload"
    error_msg = ""
    preview_headers = []
    preview_rows = []
    detected_map = {}
    tmp_file_name = ""
    import_stats = {}

    if request.method == "POST":
        verify_csrf()
        action = request.form.get("action", "")

        if action == "upload_file":
            file = request.files.get("lead_file")
            if not file or not file.filename:
                error_msg = "Please select a valid file to upload."
            else:
                ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
                if ext not in ("csv", "tsv", "txt", "xlsx"):
                    error_msg = "Unsupported file type. Please upload .csv, .xlsx, or .tsv."
                else:
                    tmp_file_name = f"import_{int(time.time())}_{secrets.token_hex(6)}.{ext}"
                    dest = config.LOG_DIR / tmp_file_name
                    file.save(dest)
                    all_rows = _parse_import_rows(str(dest), ext, limit=10)
                    if not all_rows:
                        dest.unlink(missing_ok=True)
                        error_msg = "The file is empty or could not be read."
                    else:
                        preview_headers = all_rows[0]
                        preview_rows = all_rows[1:5]
                        detected_map = _auto_detect_columns(preview_headers)
                        step = "map"

        elif action == "execute_import":
            tmp_file = os.path.basename(request.form.get("tmp_file", ""))
            full_path = config.LOG_DIR / tmp_file
            if not tmp_file or not full_path.exists():
                error_msg = "Import session expired or file not found."
            else:
                ext = tmp_file.rsplit(".", 1)[-1].lower()
                rows = _parse_import_rows(str(full_path), ext)
                if not rows:
                    error_msg = "No readable data rows found."
                else:
                    rows.pop(0)  # remove header
                    def col_idx(name):
                        v = request.form.get(f"map[{name}]", "")
                        return int(v) if v.isdigit() else -1

                    c_email = col_idx("email")
                    if c_email < 0:
                        error_msg = "You must map the Email column before importing."
                    else:
                        dup_action = request.form.get("on_duplicate", "skip")
                        init_status = request.form.get("initial_status", "new")
                        if init_status not in ("new", "sent"):
                            init_status = "new"

                        stats = {"total": len(rows), "imported": 0, "updated": 0, "skipped": 0, "invalid": 0}
                        conn = get_db()
                        try:
                            with conn.cursor() as cur:
                                for r in rows:
                                    def get_val(idx):
                                        return r[idx].strip() if 0 <= idx < len(r) else ""

                                    email_addr = get_val(c_email).lower()
                                    if not email_addr or "@" not in email_addr:
                                        stats["invalid"] += 1
                                        continue

                                    fn = get_val(col_idx("first_name"))
                                    ln = get_val(col_idx("last_name"))
                                    co = get_val(col_idx("company"))
                                    ti = get_val(col_idx("title"))
                                    ci = get_val(col_idx("city"))
                                    st = get_val(col_idx("state"))
                                    cy = get_val(col_idx("country"))
                                    emp_raw = re.sub(r"[^0-9]", "", get_val(col_idx("employees")))
                                    emp = int(emp_raw) if emp_raw else 0
                                    aid = get_val(col_idx("apollo_id")) or ("csv_" + hashlib.sha256(email_addr.encode()).hexdigest()[:24])

                                    cur.execute("SELECT id FROM leads WHERE email=%s LIMIT 1", (email_addr,))
                                    existing = cur.fetchone()
                                    if existing:
                                        if dup_action == "update":
                                            cur.execute(
                                                """
                                                UPDATE leads SET
                                                    first_name = IF(%s != '', %s, first_name),
                                                    last_name  = IF(%s != '', %s, last_name),
                                                    company    = IF(%s != '', %s, company),
                                                    title      = IF(%s != '', %s, title),
                                                    city       = IF(%s != '', %s, city),
                                                    state      = IF(%s != '', %s, state),
                                                    country    = IF(%s != '', %s, country),
                                                    updated_at = NOW()
                                                WHERE id=%s
                                                """,
                                                (fn, fn, ln, ln, co, co, ti, ti, ci, ci, st, st, cy, cy, existing["id"]),
                                            )
                                            stats["updated"] += 1
                                        else:
                                            stats["skipped"] += 1
                                    else:
                                        token = hashlib.sha256(f"{aid}{email_addr}".encode() + secrets.token_bytes(16)).hexdigest()
                                        try:
                                            cur.execute(
                                                """
                                                INSERT INTO leads (apollo_id, first_name, last_name, email, title, company,
                                                    city, state, country, employees, tracking_token, status, fetched_at)
                                                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                                                """,
                                                (aid, fn, ln, email_addr, ti, co, ci, st, cy, emp, token, init_status),
                                            )
                                            stats["imported"] += 1
                                        except Exception:
                                            stats["skipped"] += 1
                        finally:
                            conn.close()
                        full_path.unlink(missing_ok=True)
                        import_stats = stats
                        step = "done"

    return render_template(
        "admin/import.html",
        page_title="Import Leads",
        active_nav="import",
        step=step,
        error_msg=error_msg,
        preview_headers=preview_headers,
        preview_rows=preview_rows,
        detected_map=detected_map,
        tmp_file_name=tmp_file_name,
        import_stats=import_stats,
    )


# ── TEMPLATES & MEDIA ─────────────────────────────────────────────────────────

@admin_bp.route("/templates", methods=["GET", "POST"])
@login_required
def templates_list():
    conn = get_db()
    try:
        ensure_templates_table(conn)
        if request.method == "POST":
            verify_csrf()
            action = request.form.get("action", "")
            tpl_id = int(request.form.get("template_id") or 0)
            flash_msg = ""
            if tpl_id > 0:
                with conn.cursor() as cur:
                    if action == "set_default":
                        cur.execute("UPDATE email_templates SET is_default = 0")
                        cur.execute("UPDATE email_templates SET is_default = 1, updated_at = NOW() WHERE id = %s", (tpl_id,))
                        flash_msg = "success:Template marked as default!"
                    elif action == "duplicate":
                        orig = get_template_by_id(conn, tpl_id)
                        if orig:
                            new_name = f"{orig['name']} (Copy)"
                            cur.execute(
                                "INSERT INTO email_templates (name, subject, body_html, body_text, is_default, created_at) VALUES (%s,%s,%s,%s,0,NOW())",
                                (new_name, orig["subject"], orig["body_html"], orig.get("body_text")),
                            )
                            flash_msg = f'success:Template duplicated as "{new_name}"!'
                    elif action == "delete":
                        cur.execute("SELECT is_default FROM email_templates WHERE id=%s", (tpl_id,))
                        row = cur.fetchone()
                        if row and row["is_default"]:
                            flash_msg = "error:Cannot delete the active default template."
                        else:
                            cur.execute("DELETE FROM email_templates WHERE id=%s", (tpl_id,))
                            flash_msg = "success:Template deleted successfully."
            return redirect(url_for("admin.templates_list", flash=flash_msg))

        return render_template(
            "admin/templates.html",
            page_title="Email Templates",
            active_nav="templates",
            flash=request.args.get("flash", ""),
            templates=get_all_templates(conn),
        )
    finally:
        conn.close()


@admin_bp.route("/template_form", methods=["GET", "POST"])
@login_required
def template_form():
    conn = get_db()
    try:
        ensure_templates_table(conn)
        if request.args.get("preview_id"):
            tpl = get_template_by_id(conn, int(request.args["preview_id"]))
            html_out = tpl["body_html"] if tpl else "<h1>Template not found</h1>"
            for k, v in {
                "{{first_name}}": "Rajesh",
                "{{company}}": "Acme Corporation",
                "{{cta_url}}": "https://www.easymsgsender.com/pricing.php",
                "{{unsub_url}}": "#",
                "{{pixel_url}}": "",
            }.items():
                html_out = html_out.replace(k, v)
            return Response(html_out, mimetype="text/html")

        tpl_id = int(request.args.get("id") or request.form.get("id") or 0)
        is_edit = tpl_id > 0
        flash = ""
        tpl = {"id": 0, "name": "", "subject": "", "body_html": "", "is_default": 0}

        if is_edit:
            existing = get_template_by_id(conn, tpl_id)
            if existing:
                tpl = existing
            else:
                flash = "error:Template not found."
                is_edit = False
                tpl_id = 0

        if request.method == "POST" and request.form.get("action") == "save_template":
            verify_csrf()
            name = (request.form.get("name") or "").strip()
            subject = (request.form.get("subject") or "").strip()
            body_html = (request.form.get("body_html") or "").strip()
            is_default = 1 if request.form.get("is_default") else 0

            if not name or not subject or not body_html:
                flash = "error:Name, Subject, and HTML body are required."
            else:
                with conn.cursor() as cur:
                    if is_default:
                        cur.execute("UPDATE email_templates SET is_default = 0")
                    if is_edit:
                        cur.execute(
                            "UPDATE email_templates SET name=%s, subject=%s, body_html=%s, is_default=%s, updated_at=NOW() WHERE id=%s",
                            (name, subject, body_html, is_default, tpl_id),
                        )
                        flash = "success:Template updated successfully!"
                    else:
                        cur.execute(
                            "INSERT INTO email_templates (name, subject, body_html, is_default, created_at) VALUES (%s,%s,%s,%s,NOW())",
                            (name, subject, body_html, is_default),
                        )
                        tpl_id = cur.lastrowid
                        is_edit = True
                        flash = "success:Template created successfully!"
                tpl.update({"id": tpl_id, "name": name, "subject": subject, "body_html": body_html, "is_default": is_default})

        if not is_edit and not tpl["body_html"]:
            tpl["body_html"] = config.EMAIL_TEMPLATE_PATH.read_text(encoding="utf-8") if config.EMAIL_TEMPLATE_PATH.exists() else ""
            tpl["name"] = "New Campaign Template"
            tpl["subject"] = "Grow Your Business with WhatsApp Marketing 🚀"

        return render_template(
            "admin/template_form.html",
            page_title=f"Edit Template: {tpl['name']}" if is_edit else "Create Email Template",
            active_nav="template_form",
            flash=flash,
            tpl=tpl,
            is_edit=is_edit,
        )
    finally:
        conn.close()


@admin_bp.route("/upload_media", methods=["GET", "POST"])
@login_required
def upload_media():
    config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    flash = ""

    if request.method == "POST":
        verify_csrf()
        file = request.files.get("media_file")
        is_ajax = bool(request.form.get("ajax"))
        if not file or not file.filename:
            if is_ajax:
                return jsonify({"status": "error", "message": "Upload failed or no file selected."})
            flash = "error:Upload failed or no file selected."
        else:
            ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
            allowed = {"jpg", "jpeg", "png", "gif", "webp", "svg", "mp4", "webm"}
            if ext not in allowed:
                msg = f"Unsupported format. Allowed: {', '.join(sorted(allowed))}"
                if is_ajax:
                    return jsonify({"status": "error", "message": msg})
                flash = f"error:{msg}"
            else:
                safe = secure_filename(file.filename.rsplit(".", 1)[0])[:30]
                final_name = f"asset_{int(time.time())}_{safe}.{ext}"
                file.save(config.UPLOAD_DIR / final_name)
                url = f"{config.BASE_URL}/uploads/{final_name}"
                if is_ajax:
                    return jsonify({"status": "success", "url": url, "filename": final_name, "is_video": ext in ("mp4", "webm")})
                flash = f"success:File uploaded successfully: {final_name}"

    files = []
    for p in sorted(config.UPLOAD_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.is_file():
            ext = p.suffix.lstrip(".").lower()
            files.append({
                "name": p.name,
                "url": f"{config.BASE_URL}/uploads/{p.name}",
                "size": p.stat().st_size,
                "date": datetime.fromtimestamp(p.stat().st_mtime).strftime("%d %b %Y"),
                "is_video": ext in ("mp4", "webm"),
                "is_image": ext in ("jpg", "jpeg", "png", "gif", "webp", "svg"),
            })

    return render_template(
        "admin/upload_media.html",
        page_title="Media & Asset Library",
        active_nav="upload_media",
        flash=flash,
        files=files,
    )


# ── BULK SENDER ───────────────────────────────────────────────────────────────

@admin_bp.route("/send_bulk", methods=["GET", "POST"])
@login_required
def send_bulk():
    conn = get_db()
    try:
        ensure_templates_table(conn)

        if request.method == "POST":
            action = request.form.get("action", "")
            if action == "send_single_ajax":
                verify_csrf()
                subject = (request.form.get("subject") or "").strip() or "Grow Your Business with WhatsApp Marketing 🚀"
                cta_url = (request.form.get("cta_url") or "").strip() or "https://www.easymsgsender.com/pricing.php"
                selected_str = (request.form.get("selected_ids") or "").strip()
                selected_ids = [int(x) for x in selected_str.split(",") if x.strip().isdigit()]

                with conn.cursor() as cur:
                    if selected_ids:
                        ph = ",".join(["%s"] * len(selected_ids))
                        cur.execute(f"SELECT * FROM leads WHERE id IN ({ph}) AND status='new' ORDER BY id ASC LIMIT 1", selected_ids)
                    else:
                        cur.execute("SELECT * FROM leads WHERE status='new' ORDER BY id ASC LIMIT 1")
                    lead = cur.fetchone()

                    if not lead:
                        cur.execute("SELECT COUNT(*) AS c FROM leads WHERE status='new'")
                        rem = int(cur.fetchone()["c"])
                        return jsonify({"status": "completed", "remaining": rem, "message": "No more pending leads in queue."})

                tpl_id = int(request.form.get("template_id") or 0)
                tpl = get_template_by_id(conn, tpl_id) if tpl_id > 0 else get_default_template(conn)
                res = send_lead_email(conn, lead, tpl["body_html"], subject, cta_url)

                with conn.cursor() as cur:
                    cur.execute("SELECT COUNT(*) AS c FROM leads WHERE status='new'")
                    rem = int(cur.fetchone()["c"])

                if res["success"]:
                    return jsonify({
                        "status": "success",
                        "lead_id": res["lead_id"],
                        "email": res["email"],
                        "name": res["name"],
                        "company": res["company"],
                        "remaining": rem,
                    })
                return jsonify({
                    "status": "failed",
                    "lead_id": res["lead_id"],
                    "email": res["email"],
                    "name": res["name"],
                    "company": res["company"],
                    "error": res["error"],
                    "remaining": rem,
                })

            if action == "send_test_preview":
                verify_csrf()
                to = (request.form.get("test_email") or "").strip()
                if "@" not in to:
                    return jsonify({"status": "error", "message": "Please enter a valid email address."})
                subject = (request.form.get("subject") or "").strip() or "Grow Your Business with WhatsApp Marketing 🚀"
                cta_url = (request.form.get("cta_url") or "").strip() or "https://www.easymsgsender.com/pricing.php"
                tpl_id = int(request.form.get("template_id") or 0)
                tpl = get_template_by_id(conn, tpl_id) if tpl_id > 0 else get_default_template(conn)
                dummy = {
                    "id": 0, "email": to, "first_name": "Demo First Name",
                    "last_name": "Demo Last Name", "company": "Acme Technologies",
                    "tracking_token": "test_" + secrets.token_hex(16),
                }
                res = send_lead_email(conn, dummy, tpl["body_html"], "[TEST PREVIEW] " + subject, cta_url)
                if res["success"]:
                    return jsonify({"status": "success", "message": f"Test email sent to {to}!"})
                return jsonify({"status": "error", "message": f"Failed: {res.get('error')}"})

        selected_get = (request.args.get("selected") or "").strip()
        selected_ids = [int(x) for x in selected_get.split(",") if x.strip().isdigit()]

        with conn.cursor() as cur:
            if selected_ids:
                ph = ",".join(["%s"] * len(selected_ids))
                cur.execute(f"SELECT COUNT(*) AS c FROM leads WHERE id IN ({ph}) AND status='new'", selected_ids)
            else:
                cur.execute("SELECT COUNT(*) AS c FROM leads WHERE status='new'")
            count_new = int(cur.fetchone()["c"])

            cur.execute("SELECT COUNT(*) AS c FROM leads WHERE status='sent'")
            count_sent = int(cur.fetchone()["c"])
            cur.execute("SELECT COUNT(*) AS c FROM leads WHERE status='sent' AND DATE(sent_at)=CURDATE()")
            sent_today = int(cur.fetchone()["c"])
            cur.execute("SELECT COUNT(*) AS c FROM leads WHERE status='failed'")
            count_failed = int(cur.fetchone()["c"])

        all_tpls = get_all_templates(conn)
        default_tpl = get_default_template(conn)
        sel_tpl_id = int(request.args.get("template_id") or default_tpl.get("id") or 0)
        active_tpl = get_template_by_id(conn, sel_tpl_id) if sel_tpl_id > 0 else default_tpl
        if not active_tpl:
            active_tpl = default_tpl

        js_templates = {}
        for t in all_tpls:
            full = get_template_by_id(conn, int(t["id"]))
            if full:
                js_templates[str(full["id"])] = {
                    "id": int(full["id"]),
                    "name": full["name"],
                    "subject": full["subject"],
                    "html": full["body_html"],
                }

        return render_template(
            "admin/send_bulk.html",
            page_title="Send Bulk Emails",
            active_nav="send_bulk",
            count_new=count_new,
            count_sent=count_sent,
            sent_today=sent_today,
            count_failed=count_failed,
            all_templates=all_tpls,
            active_template=active_tpl,
            js_templates=js_templates,
            selected_get=selected_get,
        )
    finally:
        conn.close()


# ── EVENTS & DAILY REPORT ─────────────────────────────────────────────────────

@admin_bp.route("/events", methods=["GET", "POST"])
@login_required
def events():
    conn = get_db()
    try:
        if request.method == "POST" and request.form.get("action") == "check_bounces":
            verify_csrf()
            res = run_bounce_check(conn, True)
            flash_msg = ("success:" if res["success"] else "error:") + res["message"]
            return redirect(url_for("admin.events", flash=flash_msg))

        search = (request.args.get("q") or "").strip()
        ev_type = (request.args.get("type") or "").strip()
        date_from = (request.args.get("from") or "").strip()
        date_to = (request.args.get("to") or "").strip()
        page = max(1, int(request.args.get("page") or 1))
        per_page = 30

        where = ["1=1"]
        params = []
        if search:
            where.append("(l.email LIKE %s OR l.first_name LIKE %s OR l.company LIKE %s)")
            like = f"%{search}%"
            params.extend([like, like, like])
        if ev_type in ("open", "click", "bounce", "unsubscribe"):
            where.append("ee.event_type = %s")
            params.append(ev_type)
        if date_from:
            where.append("DATE(ee.created_at) >= %s")
            params.append(date_from)
        if date_to:
            where.append("DATE(ee.created_at) <= %s")
            params.append(date_to)
        where_sql = " AND ".join(where)

        with conn.cursor() as cur:
            cur.execute("SELECT event_type, COUNT(*) AS c FROM email_events GROUP BY event_type")
            type_stats = {r["event_type"]: int(r["c"]) for r in cur.fetchall()}

            cur.execute(f"SELECT COUNT(*) AS c FROM email_events ee JOIN leads l ON l.id=ee.lead_id WHERE {where_sql}", params)
            total = int(cur.fetchone()["c"])
            total_pages = max(1, math.ceil(total / per_page))
            page = min(page, total_pages)
            offset = (page - 1) * per_page

            cur.execute(
                f"""
                SELECT ee.id, ee.event_type, ee.url, ee.ip, ee.user_agent, ee.created_at,
                       l.id AS lead_id, l.first_name, l.last_name, l.email, l.company
                FROM email_events ee JOIN leads l ON l.id = ee.lead_id
                WHERE {where_sql}
                ORDER BY ee.created_at DESC
                LIMIT %s OFFSET %s
                """,
                params + [per_page, offset],
            )
            events_rows = cur.fetchall()

        return render_template(
            "admin/events.html",
            page_title="Email Events",
            active_nav="events",
            flash=request.args.get("flash", ""),
            type_stats=type_stats,
            events=events_rows,
            total=total,
            page=page,
            per_page=per_page,
            total_pages=total_pages,
            offset=offset,
            search=search,
            ev_type=ev_type,
            date_from=date_from,
            date_to=date_to,
        )
    finally:
        conn.close()


@admin_bp.route("/daily_report", methods=["GET", "POST"])
@login_required
def daily_report():
    conn = get_db()
    try:
        if request.method == "POST" and request.form.get("action") == "check_bounces":
            verify_csrf()
            res = run_bounce_check(conn)
            flash_msg = ("success:" if res["success"] else "error:") + res["message"]
            return redirect(url_for("admin.daily_report", flash=flash_msg))

        date_from = (request.args.get("from") or (date.today() - timedelta(days=29)).isoformat()).strip()
        date_to = (request.args.get("to") or date.today().isoformat()).strip()

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DATE(sent_at) AS day, COUNT(*) AS sent
                FROM leads WHERE status IN ('sent','bounced','unsubscribed')
                  AND DATE(sent_at) BETWEEN %s AND %s
                GROUP BY DATE(sent_at)
                """,
                (date_from, date_to),
            )
            sent_map = {str(r["day"]): int(r["sent"]) for r in cur.fetchall()}

            cur.execute(
                """
                SELECT DATE(ee.created_at) AS day, ee.event_type, COUNT(DISTINCT ee.lead_id) AS cnt
                FROM email_events ee
                WHERE DATE(ee.created_at) BETWEEN %s AND %s
                GROUP BY DATE(ee.created_at), ee.event_type
                """,
                (date_from, date_to),
            )
            ev_map = {}
            for r in cur.fetchall():
                ev_map.setdefault(str(r["day"]), {})[r["event_type"]] = int(r["cnt"])

        rows = []
        labels, c_sent, c_open, c_click, c_bounce = [], [], [], [], []
        cur_d = date.fromisoformat(date_from)
        end_d = date.fromisoformat(date_to)
        while cur_d <= end_d:
            ds = cur_d.isoformat()
            ev = ev_map.get(ds, {})
            s = sent_map.get(ds, 0)
            o = ev.get("open", 0)
            cl = ev.get("click", 0)
            b = ev.get("bounce", 0)
            u = ev.get("unsubscribe", 0)
            rows.append({"d": ds, "sent": s, "opened": o, "clicked": cl, "bounced": b, "unsub": u})
            labels.append(cur_d.strftime("%d %b"))
            c_sent.append(s)
            c_open.append(o)
            c_click.append(cl)
            c_bounce.append(b)
            cur_d += timedelta(days=1)

        return render_template(
            "admin/daily_report.html",
            page_title="Daily Report",
            active_nav="daily_report",
            flash=request.args.get("flash", ""),
            date_from=date_from,
            date_to=date_to,
            rows_desc=list(reversed(rows)),
            labels=labels,
            chart_sent=c_sent,
            chart_open=c_open,
            chart_click=c_click,
            chart_bounce=c_bounce,
            tot_sent=sum(c_sent),
            tot_open=sum(c_open),
            tot_click=sum(c_click),
            tot_bounce=sum(c_bounce),
            tot_unsub=sum(r["unsub"] for r in rows),
        )
    finally:
        conn.close()


# ── SETTINGS ──────────────────────────────────────────────────────────────────

@admin_bp.route("/settings", methods=["GET", "POST"])
@login_required
def settings():
    conn = get_db()
    try:
        if request.method == "POST":
            verify_csrf()
            action = request.form.get("action", "")
            flash_msg = ""

            if action == "save_setting":
                key = (request.form.get("setting_key") or "").strip()
                val = (request.form.get("setting_value") or "").strip()
                if key:
                    with conn.cursor() as cur:
                        cur.execute(
                            "INSERT INTO settings (`key`,`value`) VALUES(%s,%s) ON DUPLICATE KEY UPDATE `value`=%s, updated_at=NOW()",
                            (key, val, val),
                        )
                    flash_msg = f'success:Setting "{key}" updated.'
            elif action == "reset_apollo_page":
                with conn.cursor() as cur:
                    cur.execute("UPDATE settings SET `value`='1' WHERE `key`='apollo_last_page'")
                    cur.execute("UPDATE settings SET `value`='' WHERE `key`='apollo_last_run_date'")
                flash_msg = "success:Apollo pagination reset to page 1."
            elif action == "reset_send_date":
                with conn.cursor() as cur:
                    cur.execute("UPDATE settings SET `value`='' WHERE `key`='send_last_run_date'")
                flash_msg = "success:Send date reset."
            elif action == "test_apollo":
                try:
                    r = requests.get("https://api.apollo.io/api/v1/auth/health", timeout=10, headers={"X-Api-Key": config.APOLLO_API_KEY})
                    if r.status_code == 200:
                        flash_msg = "success:Apollo API Key is VALID!"
                    else:
                        flash_msg = f"error:Apollo Key verification failed (HTTP {r.status_code})."
                except Exception as exc:
                    flash_msg = f"error:Apollo check error: {exc}"
            elif action == "send_test_email":
                to = (request.form.get("test_email") or "").strip()
                if "@" not in to:
                    flash_msg = "error:Please enter a valid recipient email address."
                else:
                    msg = MIMEText(f"<h3>Easy Message Sender (Python) SMTP Test</h3><p>Delivered at {datetime.now()}</p>", "html", "utf-8")
                    msg["Subject"] = f"Easy Message Sender – Python SMTP Test ({datetime.now().strftime('%H:%M:%S')})"
                    msg["From"] = formataddr((config.MAIL_FROM_NAME, config.MAIL_FROM_EMAIL))
                    msg["To"] = to
                    try:
                        if config.SMTP_SECURE == "ssl":
                            with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as s:
                                if config.SMTP_USER:
                                    s.login(config.SMTP_USER, config.SMTP_PASS)
                                s.sendmail(config.MAIL_FROM_EMAIL, [to], msg.as_string())
                        else:
                            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as s:
                                if config.SMTP_SECURE == "tls":
                                    s.starttls()
                                if config.SMTP_USER:
                                    s.login(config.SMTP_USER, config.SMTP_PASS)
                                s.sendmail(config.MAIL_FROM_EMAIL, [to], msg.as_string())
                        if config.SAVE_SENT_TO_IMAP:
                            append_to_imap_sent(msg.as_bytes())
                        flash_msg = f"success:Test email sent successfully to {to}!"
                    except Exception as exc:
                        flash_msg = f"error:Failed to send test email: {exc}"

            return redirect(url_for("admin.settings", flash=flash_msg))

        with conn.cursor() as cur:
            cur.execute("SELECT `key`, `value`, `updated_at` FROM settings ORDER BY `key`")
            settings_rows = cur.fetchall()

        def mask(v: str) -> str:
            if len(v) <= 4:
                return "•" * 8
            return v[:2] + ("•" * max(4, len(v) - 4)) + v[-2:]

        config_display = {
            "APOLLO_API_KEY": mask(config.APOLLO_API_KEY),
            "APOLLO_DAILY_LIMIT": config.APOLLO_DAILY_LIMIT,
            "SEND_DAILY_LIMIT": config.SEND_DAILY_LIMIT,
            "SEND_DELAY_MIN": f"{config.SEND_DELAY_MIN}s",
            "SEND_DELAY_MAX": f"{config.SEND_DELAY_MAX}s",
            "DB_HOST": config.DB_HOST,
            "DB_NAME": config.DB_NAME,
            "DB_USER": config.DB_USER,
            "SMTP_HOST": config.SMTP_HOST,
            "SMTP_PORT": config.SMTP_PORT,
            "SMTP_SECURE": config.SMTP_SECURE,
            "MAIL_FROM_EMAIL": config.MAIL_FROM_EMAIL,
            "BASE_URL": config.BASE_URL,
            "IMAP_HOST": config.IMAP_HOST,
            "REPORT_SYNC_URL": config.REPORT_SYNC_URL,
        }

        return render_template(
            "admin/settings.html",
            page_title="Settings",
            active_nav="settings",
            flash=request.args.get("flash", ""),
            settings=settings_rows,
            config_display=config_display,
        )
    finally:
        conn.close()
