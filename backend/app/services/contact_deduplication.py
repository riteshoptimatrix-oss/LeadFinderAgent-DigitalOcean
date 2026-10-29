"""
Contact Deduplication Service
=============================
Canonical, production-grade normalization and deduplication for contact
information (emails, phone numbers) collected from every source in the
Lead Finder pipeline (crawl, homepage, footer, contact/about pages,
schema.org, mailto/tel links, AI extraction, regex extraction,
enrichment, business intelligence).

Pipeline contract -- every contact stored on a Lead MUST pass through:
    normalize()  ->  validate()  ->  deduplicate()  ->  sort()  ->  save()

All sources are merged first and deduplicated in a SINGLE final pass so
that duplicates can never be persisted to MongoDB.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.core.logger import logger

# ---------------------------------------------------------------------------
# Email normalization
# ---------------------------------------------------------------------------

_EMAIL_STRIP_RE = re.compile(r"\s+")
_EMAIL_REPEATED_DOTS_RE = re.compile(r"\.{2,}")
_EMAIL_VALID_RE = re.compile(
    r"^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*"
    r"@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$"
)

# ---------------------------------------------------------------------------
# Phone normalization
# ---------------------------------------------------------------------------

# Symbols that are stripped from phone numbers during cleaning.
_PHONE_CLEAN_RE = re.compile(r"[^\d+]")

# Basic international phone number shape: 7 to 15 digits, optional leading +.
_PHONE_E164_RE = re.compile(r"^\+?[1-9]\d{6,14}$")

# Digits-only international shape (used before E.164 is applied).
_PHONE_DIGITS_RE = re.compile(r"^[1-9]\d{6,14}$")

# ISO-2 country -> international dial code (digits only, no leading +).
COUNTRY_DIAL_CODES: Dict[str, str] = {
    "US": "1", "CA": "1", "GB": "44", "IN": "91", "AU": "61", "NZ": "64",
    "DE": "49", "FR": "33", "IT": "39", "ES": "34", "PT": "351", "NL": "31",
    "BE": "32", "CH": "41", "AT": "43", "SE": "46", "NO": "47", "DK": "45",
    "FI": "358", "IE": "353", "PL": "48", "CZ": "420", "SK": "421",
    "UA": "380", "RU": "7", "GR": "30", "RO": "40", "HU": "36", "BG": "359",
    "HR": "385", "SI": "386", "RS": "381", "LT": "370", "LV": "371",
    "EE": "372", "IS": "354", "LU": "352", "MT": "356", "CY": "357",
    "BR": "55", "MX": "52", "AR": "54", "CL": "56", "CO": "57", "PE": "51",
    "VE": "58", "UY": "598", "EC": "593", "BO": "591", "PY": "595",
    "JP": "81", "KR": "82", "CN": "86", "HK": "852", "TW": "886", "SG": "65",
    "MY": "60", "TH": "66", "VN": "84", "PH": "63", "ID": "62", "PK": "92",
    "BD": "880", "LK": "94", "NP": "977", "AE": "971", "SA": "966",
    "QA": "974", "KW": "965", "OM": "968", "BH": "973", "IL": "972",
    "TR": "90", "EG": "20", "NG": "234", "ZA": "27", "KE": "254",
    "GH": "233", "MA": "212", "DZ": "213", "TN": "216", "JO": "962",
    "LB": "961", "IR": "98", "IQ": "964",
}


def _country_to_dial_code(country: Any) -> Optional[str]:
    """Return the dial code (digits only) for a country hint.

    Accepts an ISO-2 code ("IN"), an existing dial code ("91", "+91"),
    or a partial E.164 number ("+4912345"). Returns None when unknown.
    """
    if country is None:
        return None
    if isinstance(country, int):
        return str(country)
    raw = str(country).strip().upper().replace("+", "")
    if not raw:
        return None
    if len(raw) == 2 and raw in COUNTRY_DIAL_CODES:
        return COUNTRY_DIAL_CODES[raw]
    # Keep stripping trailing digits until we find a known dial code.
    for i in range(len(raw), 0, -1):
        prefix = raw[:i]
        for code in ("%s" % prefix,):
            if code in COUNTRY_DIAL_CODES.values():
                return code
    return None


# ---------------------------------------------------------------------------
# Email normalization
# ---------------------------------------------------------------------------


def normalize_email(value: Any) -> Optional[str]:
    """Normalize and validate a single email address.

    Steps: strip whitespace, drop any ``mailto:`` prefix, remove embedded
    whitespace, lowercase, collapse duplicate separators (``..``), remove
    leading/trailing dots in the local part, validate. Returns ``None`` for
    anything that is not a well-formed email.
    """
    if value is None:
        return None
    raw = str(value)
    if not isinstance(value, str):
        raw = value.strip() if isinstance(value, str) else str(value).strip()
    raw = raw.strip()
    if not raw:
        return None
    if raw.lower().startswith("mailto:"):
        raw = raw[len("mailto:"):].strip()
    raw = _EMAIL_STRIP_RE.sub("", raw)
    raw = raw.lower()
    raw = _EMAIL_REPEATED_DOTS_RE.sub(".", raw)
    local, sep, domain = raw.partition("@")
    if not sep:
        return None
    local = local.strip(".")
    raw = f"{local}@{domain}"
    if len(raw) > 254:
        return None
    if not _EMAIL_VALID_RE.match(raw):
        return None
    return raw


# ---------------------------------------------------------------------------
# Phone normalization
# ---------------------------------------------------------------------------


def normalize_phone(value: Any, default_country: Any = None) -> Optional[str]:
    """Normalize and validate a single phone number to E.164 when possible.

    Steps: strip ``tel:`` prefix, drop spaces / parentheses / dashes / dots
    and duplicate ``+`` signs, expand the ``00`` international prefix, and
    when a country hint is known prepend the correct international dial code.
    Returns ``None`` for anything that does not look like a phone number.
    """
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if raw.lower().startswith("tel:"):
        raw = raw[len("tel:"):].strip()
    if not raw:
        return None

    clean = _PHONE_CLEAN_RE.sub("", raw)
    if not clean:
        return None

    # Duplicate leading plus signs -> keep exactly one.
    if clean.count("+") > 1:
        clean = "+" + clean.replace("+", "")
    has_plus = clean.startswith("+")
    digits = clean.lstrip("+")

    # ``00`` international prefix is equivalent to ``+``.
    if not has_plus and digits.startswith("00"):
        has_plus = True
        digits = digits[2:]

    # Strip a leading zero when we have explicit international notation;
    # a domestic-style number keeps its leading zero until country joining.
    if has_plus and digits.startswith("0"):
        digits = digits[1:]

    if not _PHONE_DIGITS_RE.match(digits):
        return None

    if has_plus:
        return f"+{digits}"

    dial_code = _country_to_dial_code(default_country)
    if dial_code and digits.startswith(dial_code):
        # Already carries the country code; just prepend the plus.
        return f"+{digits}"
    if dial_code:
        # Domestic number -> join with the country dial code.
        return f"+{dial_code}{digits}"

    # No country hint: return the cleaned digits so records still dedupe
    # against other identical cleaned forms.
    return digits


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------


def _dedupe(values: Sequence[Any], normalize, sort_key) -> Tuple[List[str], int]:
    """Normalize + validate + dedupe a sequence of raw values.

    Returns (unique_list, removed_count). The first occurrence of each
    canonical value wins; ordering is otherwise preserved then re-sorted
    with ``sort_key`` (``None`` disables sorting).
    """
    seen: Dict[str, None] = {}
    unique: List[str] = []
    removed = 0
    for value in values:
        if value is None:
            continue
        try:
            norm = normalize(value)
        except (TypeError, ValueError, AttributeError):
            norm = None
        if not norm:
            removed += 0  # invalid input is dropped, not counted as duplicate
            continue
        if norm in seen:
            removed += 1
            continue
        seen[norm] = None
        unique.append(norm)
    if sort_key is not None:
        unique = sorted(unique, key=sort_key)
    return unique, removed


def deduplicate_emails(values: Sequence[Any]) -> Tuple[List[str], int]:
    """Deduplicate emails (case-insensitive, separator-normalized)."""
    return _dedupe(values, normalize_email, sort_key=str.lower)


def deduplicate_phones(values: Sequence[Any], default_country: Any = None) -> Tuple[List[str], int]:
    """Deduplicate phone numbers (format-agnostic, E.164 when possible)."""
    if default_country is None:
        return _dedupe(values, normalize_phone, sort_key=str)
    return _dedupe(
        values,
        lambda v: normalize_phone(v, default_country=default_country),
        sort_key=str,
    )


# ---------------------------------------------------------------------------
# Contact dict deduplication (ai_analysis.contacts entries)
# ---------------------------------------------------------------------------

# Contact types we treat as normalizable / dedupable.
_EMAIL_TYPES = {"email", "Email", "EMAIL"}
_PHONE_TYPES = {"phone", "Phone", "PHONE"}

# Priority so the most authoritative entry of a duplicate group survives.
_CONTACT_PRIORITY = {
    "Email": 3,
    "Phone": 3,
    "WhatApp": 3,
    "WhatsApp": 3,
    "email": 3,
    "phone": 3,
    "LinkedIn": 1,
    "Facebook": 1,
    "Instagram": 1,
    "Twitter": 1,
    "Website": 1,
    "Address": 1,
}


def deduplicate_contacts(contacts: Sequence[Dict[str, Any]], default_country: Any = None) -> List[Dict[str, Any]]:
    """Deduplicate ``ai_analysis.contacts`` entries by normalized value.

    For email/phone entries the value is normalized (E.164 for phones) and
    deduplicated across every source. For other types entries are kept as-is
    unless the exact ``(type, value)`` repeats. Higher-authority entries
    (classified Email/Phone) survive over generic ones.
    """
    if not contacts:
        return []

    normalized: List[Dict[str, Any]] = []
    for entry in contacts:
        if not isinstance(entry, dict):
            continue
        item = dict(entry)
        ctype = str(item.get("type") or "").strip()
        value = item.get("value")
        if value is None or str(value).strip() == "":
            continue
        if ctype in _EMAIL_TYPES:
            norm = normalize_email(value)
            if not norm:
                continue
            item["value"] = norm
        elif ctype in _PHONE_TYPES:
            norm = normalize_phone(value, default_country=default_country)
            if not norm:
                continue
            item["value"] = norm
        normalized.append(item)

    keyed: Dict[str, Dict[str, Any]] = {}
    for item in normalized:
        ctype = str(item.get("type") or "").strip()
        value = str(item.get("value") or "")
        key = f"{ctype.lower()}::{value.lower()}"
        priority = _CONTACT_PRIORITY.get(ctype, 0)
        existing = keyed.get(key)
        if existing is None:
            keyed[key] = item
            continue
        # Replace only when the new entry is a strictly better candidate.
        existing_priority = _CONTACT_PRIORITY.get(str(existing.get("type") or "").strip(), 0)
        if priority > existing_priority:
            keyed[key] = item

    result = list(keyed.values())

    def _sort_key(item: Dict[str, Any]) -> Tuple[int, str]:
        ctype = str(item.get("type") or "").strip()
        priority = _CONTACT_PRIORITY.get(ctype, 0)
        return (-priority, str(item.get("value") or "").lower())

    result.sort(key=_sort_key)
    return result


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


@dataclass
class ContactDedupMetrics:
    """Uniqueness metrics stored on the Lead for reporting."""

    emails_found: int = 0
    unique_emails: int = 0
    duplicate_emails_removed: int = 0
    phones_found: int = 0
    unique_phones: int = 0
    duplicate_phones_removed: int = 0

    def to_dict(self) -> Dict[str, int]:
        return {
            "emails_found": self.emails_found,
            "unique_emails": self.unique_emails,
            "duplicate_emails_removed": self.duplicate_emails_removed,
            "phones_found": self.phones_found,
            "unique_phones": self.unique_phones,
            "duplicate_phones_removed": self.duplicate_phones_removed,
        }


def compute_metrics(
    raw_emails: Sequence[Any],
    unique_emails: Sequence[str],
    raw_phones: Sequence[Any],
    unique_phones: Sequence[str],
) -> ContactDedupMetrics:
    """Compute uniqueness metrics for a batch of raw/unique contacts."""
    return ContactDedupMetrics(
        emails_found=len(raw_emails),
        unique_emails=len(unique_emails),
        duplicate_emails_removed=max(0, len(raw_emails) - len(unique_emails)),
        phones_found=len(raw_phones),
        unique_phones=len(unique_phones),
        duplicate_phones_removed=max(0, len(raw_phones) - len(unique_phones)),
    )


def log_contacts_metrics(metrics: ContactDedupMetrics, context: str = "") -> None:
    """Emit the canonical ``[CONTACTS]`` dedup log block."""
    ctx = f" ({context})" if context else ""
    logger.info(
        "[CONTACTS]%s\n"
        "  Emails Extracted: %d\n"
        "  Emails Normalized: %d\n"
        "  Emails Removed: %d\n"
        "  Phones Extracted: %d\n"
        "  Phones Normalized: %d\n"
        "  Phones Removed: %d",
        ctx,
        metrics.emails_found,
        metrics.unique_emails,
        metrics.duplicate_emails_removed,
        metrics.phones_found,
        metrics.unique_phones,
        metrics.duplicate_phones_removed,
    )


# ---------------------------------------------------------------------------
# Full pipeline helpers
# ---------------------------------------------------------------------------


def process_contacts(
    raw_emails: Sequence[Any],
    raw_phones: Sequence[Any],
    default_country: Any = None,
    context: str = "",
) -> Tuple[List[str], List[str], ContactDedupMetrics]:
    """Run the full normalize -> validate -> deduplicate -> sort pipeline.

    Returns ``(unique_emails, unique_phones, metrics)``. Logs the
    ``[CONTACTS]`` block with the computed uniqueness metrics.
    """
    unique_emails, _ = deduplicate_emails(raw_emails)
    unique_phones, _ = deduplicate_phones(raw_phones, default_country=default_country)
    metrics = compute_metrics(raw_emails, unique_emails, raw_phones, unique_phones)
    log_contacts_metrics(metrics, context)
    return unique_emails, unique_phones, metrics
