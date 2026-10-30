"""
Website Technology Detection Engine
====================================
Detects the complete technology stack of a website from already-crawled
page data (HTML, response headers, meta tags, cookies, scripts, stylesheets).

Detection sources (no additional network requests — only the provided
pages are analyzed):
  - Response headers          (server, x-powered-by, cf-ray, set-cookie, ...)
  - Meta generator tags       (WordPress, Drupal, Joomla, ...)
  - Script source URLs        (/_next/static/..., cdn.shopify.com, ...)
  - Stylesheet URLs           (bootstrap.min.css, tailwind, ...)
  - Link tags                 (manifest, preconnect, fonts.googleapis.com, ...)
  - Inline scripts / payloads (__NEXT_DATA__, __NUXT__, ga('create', ...))
  - HTML / DOM patterns       (wp-content, ng-version, data-reactroot, ...)

Output shape (spec-aligned):
    websiteTechnologies: [{name, category, confidence, version, detectedFrom, logo}]

Guarantees:
  - Never raises — any failure returns an empty result so AI analysis continues.
  - Never performs network I/O — purely analyzes the passed page documents.
  - Reuses the HTML already captured by the crawler (no re-crawl).
"""

import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from bs4 import BeautifulSoup

from app.models.technology_detection import (
    DetectedTechnology,
    TechnologyDetectionResultCreate,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Logo helper — official SVGs via the Simple Icons CDN.
# ─────────────────────────────────────────────────────────────────────────────

SIMPLE_ICONS_CDN = "https://cdn.simpleicons.org"


def _logo(slug: Optional[str], color: Optional[str] = None) -> Optional[str]:
    if not slug:
        return None
    return f"{SIMPLE_ICONS_CDN}/{slug}{('/' + color) if color else ''}"


# A detection pattern: (source, regex/literal, confidence_weight, readable_label)
#   source in: header | meta | cookie | script | css | link | html | inline
#   weight is the confidence contribution of this single source match.
#   label is the human-readable detection source, e.g. "HTTP `server` header".
Pattern = Tuple[str, str, float, str]

# A version pattern: (regex, capture_group_index)
VersionPattern = Tuple[str, int]


def _tech(name: str, category: str, patterns: List[Pattern], slug: str = None,
          color: str = None, version: Optional[VersionPattern] = None) -> Dict[str, Any]:
    return {
        "name": name,
        "category": category,
        "patterns": patterns,
        "logo": _logo(slug, color),
        "version": version,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Signature database — one entry per detectable technology.
# ─────────────────────────────────────────────────────────────────────────────

TECHNOLOGY_RULES: List[Dict[str, Any]] = [
    # ═══════════════ Server / Web Servers ═══════════════
    _tech("Nginx", "Server", [
        ("header", r"nginx", 95, "HTTP `server` header"),
    ], "nginx", "009639"),
    _tech("Apache", "Server", [
        ("header", r"apache", 95, "HTTP `server` header"),
    ], "apache", "D22128"),
    _tech("LiteSpeed", "Server", [
        ("header", r"litespeed", 95, "HTTP `server` header"),
    ], "litespeed", "333333"),
    _tech("Microsoft IIS", "Server", [
        ("header", r"microsoft-iis", 95, "HTTP `server` header"),
    ], "microsoftiis", "0078D6"),
    _tech("Caddy", "Server", [
        ("header", r"caddy", 95, "HTTP `server` header"),
    ], "caddy", "1F88C0"),
    _tech("OpenResty", "Server", [
        ("header", r"openresty", 95, "HTTP `server` header"),
    ], "openresty", "009639"),
    _tech("Apache Tomcat", "Server", [
        ("header", r"tomcat", 92, "HTTP header"),
        ("header", r"coyote", 90, "HTTP header"),
    ], "apachetomcat", "F8DC75"),

    # ═══════════════ Programming Languages ═══════════════
    _tech("PHP", "Programming Language", [
        ("header", r"x-powered-by[\s:=]*php", 93, "`x-powered-by` header"),
        ("cookie", r"PHPSESSID", 90, "PHPSESSID cookie"),
        ("html", r"\.php[?/]", 68, "`.php` URLs"),
    ], "php", "777BB4"),
    _tech("Python", "Programming Language", [
        ("header", r"gunicorn|waitress|werkzeug|uvicorn", 90, "HTTP `server` header"),
    ], "python", "3776AB"),
    _tech("Java", "Programming Language", [
        ("header", r"x-powered-by[\s:=]*servlet|tomcat|openjdk", 88, "HTTP header"),
        ("cookie", r"JSESSIONID", 90, "JSESSIONID cookie"),
    ], "java", "F89820", version=(r"OpenJDK[ /]?([\d.]+)", 1)),
    _tech("ASP.NET", "Programming Language", [
        ("header", r"x-powered-by[\s:=]*asp\.net", 93, "`x-powered-by` header"),
        ("cookie", r"ASP\.NET_SessionId", 90, "ASP.NET session cookie"),
        ("html", r"__VIEWSTATE|__EVENTVALIDATION", 78, "ASP.NET form payloads"),
    ], "dotnet", "512BD4"),
    _tech(".NET / C#", "Programming Language", [
        ("header", r"x-aspnet-version", 93, "`x-aspnet-version` header"),
        ("html", r"__VIEWSTATE", 70, "ASP.NET form payloads"),
    ], "dotnet", "512BD4"),
    _tech("Ruby", "Programming Language", [
        ("header", r"webrick|puma|thin|passenger", 90, "HTTP `server` header"),
    ], "ruby", "CC342D"),
    _tech("Go", "Programming Language", [
        ("header", r"go-http-server|net/http", 90, "HTTP `server` header"),
    ], "go", "00ADD8"),
    _tech("Node.js", "Programming Language", [
        ("header", r"node\.js|nodejs", 88, "HTTP header"),
        ("inline", r"process\.versions\.node|__node_env", 70, "Node.js runtime marker"),
    ], "nodedotjs", "5FA04E"),
    _tech("Elixir", "Programming Language", [
        ("header", r"phoenix|elixir", 88, "HTTP header"),
    ], "elixir", "4B275F"),
    _tech("Perl", "Programming Language", [
        ("html", r"\bperl\b", 45, "HTML mention"),
    ], "perl", "39457E"),
    _tech("Rust", "Programming Language", [
        ("header", r"rust", 50, "HTTP header"),
    ], "rust", "000000"),

    # ═══════════════ Backend Frameworks ═══════════════
    _tech("Laravel", "Backend Framework", [
        ("cookie", r"laravel_session", 88, "Laravel session cookie"),
        ("header", r"x-laravel-", 90, "X-Laravel header"),
        ("inline", r"csrf_token[^=]*=[^;]*csrfmiddleware|csrf_token|Laravel", 55, "Laravel token"),
    ], "laravel", "FF2D20", version=(r"Laravel v?(\d+(?:\.\d+)+)", 1)),
    _tech("Symfony", "Backend Framework", [
        ("html", r"symfony", 50, "HTML pattern"),
        ("header", r"symfony", 60, "HTTP header"),
    ], "symfony", "000000"),
    _tech("CodeIgniter", "Backend Framework", [
        ("cookie", r"ci_session", 82, "CodeIgniter session cookie"),
        ("html", r"codeigniter", 55, "HTML pattern"),
    ], "codeigniter", "EF4223"),
    _tech("CakePHP", "Backend Framework", [
        ("cookie", r"CAKEPHP|PHPSESSID[^;]*CakePHP", 82, "CakePHP cookie"),
        ("html", r"cakePHP", 55, "HTML pattern"),
    ], "cakephp", "D33C43"),
    _tech("Yii", "Backend Framework", [
        ("header", r"x-powered-by[^$]*Yii", 85, "X-Powered-By Yii"),
        ("html", r"yii\.js", 75, "Yii asset"),
    ], "yiiframework", "2E9FFF"),
    _tech("Django", "Backend Framework", [
        ("cookie", r"csrftoken|django_language", 85, "Django cookie"),
        ("header", r"csrf", 50, "CSRF header"),
        ("inline", r"django", 45, "Django mention"),
    ], "django", "092E20"),
    _tech("Flask", "Backend Framework", [
        ("header", r"flask|werkzeug", 60, "Werkzeug/Flask header"),
    ], "flask", "000000"),
    _tech("FastAPI", "Backend Framework", [
        ("header", r"uvicorn|fastapi", 65, "FastAPI/Uvicorn header"),
    ], "fastapi", "009688"),
    _tech("Express", "Backend Framework", [
        ("header", r"x-powered-by[^$]*express", 85, "X-Powered-By Express"),
        ("html", r"express", 40, "HTML mention"),
    ], "express", "000000"),
    _tech("NestJS", "Backend Framework", [
        ("header", r"x-powered-by[^$]*nestjs|nest\.js", 85, "X-Powered-By NestJS"),
    ], "nestjs", "E0234E"),
    _tech("Koa", "Backend Framework", [
        ("header", r"koa", 55, "HTTP header"),
    ], "koa", "33333D"),
    _tech("Ruby on Rails", "Backend Framework", [
        ("cookie", r"_session[^;]*B3e[0-9a-f]{30,}|_rails_session", 80, "Rails session cookie"),
        ("header", r"x-request-id|x-runtime", 60, "Rails headers"),
        ("html", r"rails", 45, "HTML mention"),
    ], "rubyonrails", "CC0000"),
    _tech("Phoenix", "Backend Framework", [
        ("cookie", r"_phoenix_session", 85, "Phoenix session cookie"),
    ], "phoenixframework", "FD4F00"),
    _tech("ASP.NET Core", "Backend Framework", [
        ("header", r"x-aspnet-version|x-powered-by[^$]*asp\.net", 85, "X-Powered-By ASP.NET"),
    ], "dotnet", "512BD4"),
    _tech("Spring", "Backend Framework", [
        ("header", r"x-application-context", 80, "Spring header"),
        ("html", r"springframework", 55, "HTML pattern"),
    ], "spring", "6DB33F"),
    _tech("Gin", "Backend Framework", [
        ("header", r"(?<!n)gin\b|gin/\d", 55, "Gin header"),
    ], "gin", "008ECF"),
    _tech("Echo", "Backend Framework", [
        ("header", r"echo/4|echo v", 60, "Echo header"),
    ], "echo", "50C878"),

    # ═══════════════ Databases ═══════════════
    _tech("MySQL", "Database", [
        ("html", r"mysql(_error|_query)?[^a-z]|Powered by MySQL", 55, "HTML pattern"),
    ], "mysql", "4479A1"),
    _tech("MariaDB", "Database", [
        ("html", r"mariadb", 60, "HTML pattern"),
    ], "mariadb", "003545"),
    _tech("PostgreSQL", "Database", [
        ("html", r"postgres(ql)?", 55, "HTML pattern"),
    ], "postgresql", "4169E1"),
    _tech("MongoDB", "Database", [
        ("script", r"mongodb[.-]?[0-9]*\.js", 70, "MongoDB client script"),
        ("html", r"mongodb", 50, "HTML pattern"),
    ], "mongodb", "47A248"),
    _tech("Redis", "Database", [
        ("html", r"redis(?!\s*cache)", 55, "HTML pattern"),
    ], "redis", "FF4438"),
    _tech("SQLite", "Database", [
        ("html", r"sqlite", 55, "HTML pattern"),
    ], "sqlite", "003B57"),
    _tech("Oracle DB", "Database", [
        ("html", r"oracle[^c]database", 55, "HTML pattern"),
    ], "oracle", "F80000"),

    # ═══════════════ CMS ═══════════════
    _tech("WordPress", "CMS", [
        ("meta", r"wordpress", 95, "Meta `generator` tag"),
        ("header", r"x-powered-by[\s:=]*wordpress", 92, "`x-powered-by` header"),
        ("html", r"wp-content|wp-includes|wp-json|wp-emoji-release", 80, "WordPress asset paths"),
        ("link", r"wp-content", 82, "WordPress asset link"),
        ("script", r"wp-emoji-release", 80, "WordPress emoji script"),
    ], "wordpress", "21759B", version=(r"WordPress\s+([\d.]+)", 1)),
    _tech("Drupal", "CMS", [
        ("meta", r"drupal", 95, "Meta `generator` tag"),
        ("header", r"x-generator[\s:=]*drupal", 92, "`x-generator` header"),
        ("html", r"sites/default/files|drupal-settings-json", 78, "Drupal asset paths"),
    ], "drupal", "0678BE", version=(r"Drupal\s+([\d.]+)", 1)),
    _tech("Joomla", "CMS", [
        ("meta", r"joomla", 95, "Meta `generator` tag"),
        ("html", r"media/system/js|joomla", 70, "Joomla asset paths"),
    ], "joomla", "5091CD", version=(r"Joomla!\s*([\d.]+)", 1)),
    _tech("Wix", "CMS", [
        ("html", r"wix\.com|static\.parastorage\.com|wixstatic", 85, "Wix asset domains"),
        ("script", r"wix\.com|parastorage\.com", 85, "Wix script domain"),
        ("header", r"x-wix-request-id", 92, "`x-wix-request-id` header"),
    ], "wix", "000000"),
    _tech("Squarespace", "CMS", [
        ("html", r"squarespace\.com|static[0-9]?\.squarespace", 85, "Squarespace asset paths"),
        ("header", r"squarespace", 92, "HTTP `server` header"),
        ("script", r"static[0-9]?\.squarespace\.com", 85, "Squarespace script"),
    ], "squarespace", "000000"),
    _tech("Webflow", "CMS", [
        ("html", r"data-wf-page|data-wf-site", 85, "Webflow data attributes"),
        ("script", r"webflow\.js", 85, "Webflow script"),
    ], "webflow", "146EF5"),
    _tech("Ghost", "CMS", [
        ("meta", r"ghost", 95, "Meta `generator` tag"),
        ("header", r"x-powered-by[\s:=]*ghost", 92, "`x-powered-by` header"),
        ("html", r"ghost", 55, "HTML pattern"),
    ], "ghost", "738A94", version=(r"Ghost\s+([\d.]+)", 1)),
    _tech("Blogger", "CMS", [
        ("meta", r"blogger", 95, "Meta `generator` tag"),
        ("html", r"blogspot\.com|blogger\.com", 80, "Blogger domains"),
    ], "blogger", "FF5722"),
    _tech("Weebly", "CMS", [
        ("html", r"weebly\.com|wixstatic|cdn2\.editmysite", 80, "Weebly asset domains"),
    ], "weebly", "00A82C"),
    _tech("Tilda", "CMS", [
        ("html", r"tilda\.ws|tilda\.cc|tildacdn", 82, "Tilda asset paths"),
        ("script", r"tilda\.ws|tildacdn", 82, "Tilda script"),
    ], "tilda", "3A3A3A"),
    _tech("Jekyll", "CMS", [
        ("meta", r"jekyll", 95, "Meta `generator` tag"),
        ("link", r"jekyll", 80, "Jekyll asset link"),
    ], "jekyll", "CC0000"),
    _tech("Hugo", "CMS", [
        ("meta", r"hugo", 95, "Meta `generator` tag"),
    ], "hugo", "FF4088", version=(r"Hugo\s+([\d.]+)", 1)),
    _tech("Eleventy", "CMS", [
        ("meta", r"eleventy", 95, "Meta `generator` tag"),
        ("html", r"11ty", 70, "HTML pattern"),
    ], "eleventy", "222222"),
    _tech("Strapi", "CMS", [
        ("html", r"strapi", 60, "HTML pattern"),
        ("header", r"x-strapi", 90, "Strapi header"),
    ], "strapi", "4945FF"),
    _tech("Sanity", "CMS", [
        ("script", r"sanity|@sanity", 75, "Sanity script"),
        ("html", r"__SANITY_STAGING__|sanity", 55, "HTML pattern"),
    ], "sanity", "F03E2F"),
    _tech("Contentful", "CMS", [
        ("script", r"contentful", 75, "Contentful script"),
    ], "contentful", "2478CC"),
    _tech("Docusaurus", "CMS", [
        ("meta", r"docusaurus", 95, "Meta `generator` tag"),
        ("html", r"docusaurus", 70, "HTML pattern"),
    ], "docusaurus", "3ECC5F", version=(r"Docusaurus v([\d.]+)", 1)),

    # ═══════════════ E-Commerce ═══════════════
    _tech("Shopify", "E-Commerce", [
        ("html", r"cdn\.shopify\.com|myshopify\.com", 88, "Shopify asset domain"),
        ("script", r"cdn\.shopify\.com", 88, "Shopify CDN script"),
        ("inline", r"var\s+Shopify\s*=|window\.Shopify", 85, "Shopify global object"),
        ("link", r"cdn\.shopify\.com", 86, "Shopify CDN link"),
        ("header", r"shopify", 92, "HTTP header"),
    ], "shopify", "7AB55C"),
    _tech("WooCommerce", "E-Commerce", [
        ("meta", r"woocommerce", 95, "Meta `generator` tag"),
        ("html", r"woocommerce-[a-z]+|add-to-cart", 80, "WooCommerce classes"),
    ], "woocommerce", "96588A", version=(r"WooCommerce\s+([\d.]+)", 1)),
    _tech("Magento", "E-Commerce", [
        ("html", r"Magento_Theme|mage/cookies\.js", 82, "Magento assets"),
        ("header", r"x-magento", 90, "Magento header"),
        ("link", r"mage/", 70, "Magento module assets"),
    ], "magento", "EE672F", version=(r"Magento\s+([\d.]+)", 1)),
    _tech("BigCommerce", "E-Commerce", [
        ("html", r"cdn[0-9]*\.bigcommerce\.com", 85, "BigCommerce CDN"),
        ("script", r"cdn[0-9]*\.bigcommerce\.com", 85, "BigCommerce script"),
        ("header", r"bigcommerce", 90, "HTTP header"),
    ], "bigcommerce", "121118"),
    _tech("PrestaShop", "E-Commerce", [
        ("html", r"prestashop|modules/(ps_|product)", 75, "PrestaShop asset paths"),
        ("header", r"powered-by prestashop", 90, "HTTP header"),
    ], "prestashop", "DF0067"),
    _tech("OpenCart", "E-Commerce", [
        ("html", r"opencart|index\.php\?route=", 70, "OpenCart routes"),
    ], "opencart", "4A4A4A"),
    _tech("nopCommerce", "E-Commerce", [
        ("html", r"nopcommerce|/Scripts/jquery\.validate", 65, "nopCommerce markers"),
        ("header", r"x-powered-by[\s:=]*nopCommerce", 90, "`x-powered-by` header"),
    ], "nopcommerce", "33414E"),
    _tech("Ecwid", "E-Commerce", [
        ("script", r"ecwid\.com|d1oxdqln5v0kuc\.cloudfront", 85, "Ecwid script"),
        ("html", r"ecwid", 65, "HTML pattern"),
    ], "ecwid", "000000"),
    _tech("Medusa", "E-Commerce", [
        ("html", r"medusa|/medusa/", 55, "HTML pattern"),
    ], "medusa", "F5F5F5"),
    _tech("Saleor", "E-Commerce", [
        ("html", r"saleor", 55, "HTML pattern"),
    ], "saleor", "5CFFB1"),
    _tech("Gumroad", "E-Commerce", [
        ("script", r"gumroad\.com|app\.gumroad", 85, "Gumroad script"),
        ("html", r"gumroad\.com", 70, "Gumroad links"),
    ], "gumroad", "FF90E8"),

    # ═══════════════ Frontend Frameworks ═══════════════
    _tech("React", "Frontend Framework", [
        ("html", r"data-reactroot|data-reactid|__react_container|__reactroot", 88, "React root attribute"),
        ("script", r"react(\.production\.min|-?@[0-9])?\.?[^/]*\.js|/react/umd/react|@facebook/react", 84, "React bundle"),
        ("inline", r"ReactDOM\.(render|hydrate|createRoot)|createRoot\(\s*document|React\.createElement|__REACT_DEVTOOLS_GLOBAL_HOOK__", 80, "React runtime markers"),
    ], "react", "61DAFB", version=(r"react(?:@|\/)([0-9]+\.[0-9]+\.[0-9]+)", 1)),
    _tech("Next.js", "Frontend Framework", [
        ("html", r"__NEXT_DATA__|/_next/static|id=\"__next\"", 92, "Next.js runtime markers"),
        ("script", r"/_next/static/", 90, "Next.js static chunks"),
        ("header", r"x-powered-by[\s:=]*next\.js", 93, "`x-powered-by` header"),
    ], "nextdotjs", "000000", version=(r'"buildId"\s*:\s*"([^"]+)"', 1)),
    _tech("Angular", "Frontend Framework", [
        ("html", r"ng-version=|<app-root>", 90, "Angular root markers"),
        ("html", r"ng-app|ng-controller", 80, "Angular directives"),
        ("script", r"zone\.js|main\.[a-z0-9]+\.js", 68, "Angular bundle"),
    ], "angular", "DD0031", version=(r"ng-version=\"([^\"]+)\"", 1)),
    _tech("Vue.js", "Frontend Framework", [
        ("html", r"data-v-[a-f0-9]{6,}", 90, "Vue scoped attributes"),
        ("inline", r"__VUE__|Vue\.config|createApp\(", 84, "Vue runtime markers"),
        ("script", r"vue(\.runtime)?(\.production)?(\.min)?\.js|@vue/", 82, "Vue bundle"),
    ], "vuedotjs", "4FC08D", version=(r"Vue(?:\.js|@|/)?\s?([0-9]+\.[0-9]+\.[0-9]+)", 1)),
    _tech("Nuxt", "Frontend Framework", [
        ("html", r"__NUXT__|/_nuxt/", 92, "Nuxt runtime markers"),
        ("script", r"/_nuxt/", 90, "Nuxt chunk URLs"),
    ], "nuxtdotjs", "00DC82", version=(r"Nuxt\s+v?([0-9.]+)", 1)),
    _tech("Svelte", "Frontend Framework", [
        ("html", r"__svelte|data-svelte-", 90, "Svelte markers"),
        ("script", r"svelte(\.min)?\.js|@sveltejs", 82, "Svelte bundle"),
    ], "svelte", "FF3E00"),
    _tech("SvelteKit", "Frontend Framework", [
        ("html", r"__sveltekit|svelte-kit", 92, "SvelteKit runtime markers"),
    ], "svelte", "FF3E00"),
    _tech("Astro", "Frontend Framework", [
        ("html", r"data-astro-cid|astro-[a-z0-9-]{4,}", 92, "Astro scoped classes"),
        ("script", r"astro@|astro\.min\.js", 82, "Astro bundle"),
    ], "astro", "BC52EE", version=(r"astro(?:@|\/)([0-9]+\.[0-9]+\.[0-9]+)", 1)),
    _tech("Gatsby", "Frontend Framework", [
        ("html", r"___gatsby|gatsby-", 88, "Gatsby markers"),
        ("script", r"gatsby", 75, "Gatsby script"),
    ], "gatsby", "663399"),
    _tech("Ember", "Frontend Framework", [
        ("html", r"data-ember-action|ember-application", 88, "Ember markers"),
        ("script", r"ember(\.min)?\.js", 80, "Ember bundle"),
    ], "emberdotjs", "E04E39"),
    _tech("Preact", "Frontend Framework", [
        ("script", r"preact(\.min)?\.js|/preact/", 80, "Preact bundle"),
        ("html", r"preact", 60, "HTML pattern"),
    ], "preact", "673AB8", version=(r"preact(?:@|\/)([0-9.]+)", 1)),
    _tech("Solid", "Frontend Framework", [
        ("inline", r"_\$HY|solid-js|createSignal\(", 82, "Solid runtime markers"),
        ("html", r"data-hk=", 85, "Solid hydration marker"),
    ], "solid", "2C4F7C"),
    _tech("Qwik", "Frontend Framework", [
        ("html", r"q:(base|city)|data-qwik|qwik", 88, "Qwik markers"),
    ], "qwik", "AC7EF4"),
    _tech("Remix", "Frontend Framework", [
        ("html", r"__remixContext|remix-run|data-remix", 88, "Remix runtime markers"),
        ("header", r"x-powered-by[\s:=]*remix", 90, "`x-powered-by` header"),
    ], "remix", "000000"),
    _tech("Alpine.js", "Frontend Framework", [
        ("html", r"x-data=|x-init=|x-on:", 85, "Alpine directives"),
        ("script", r"alpinejs|@alpinejs", 82, "Alpine bundle"),
    ], "alpinedotjs", "8BC0D0"),
    _tech("HTMX", "Frontend Framework", [
        ("html", r"hx-get=|hx-post=|hx-trigger=|hx-swap=", 88, "HTMX attributes"),
        ("script", r"htmx(\.min)?\.js", 85, "HTMX bundle"),
    ], "htmx", "3366CC", version=(r"htmx@?([0-9.]+)", 1)),
    _tech("Hotwire Turbo", "Frontend Framework", [
        ("html", r"data-turbo|turbo-frame", 80, "Turbo attributes"),
    ], "hotwire", "FFE801"),
    _tech("Stimulus", "Frontend Framework", [
        ("html", r"data-controller=", 85, "Stimulus controllers"),
    ], "stimulus", "77E8B9"),
    _tech("Mithril", "Frontend Framework", [
        ("html", r"m\.redraw|m\.mount", 75, "Mithril markers"),
    ], "mithril", "000000"),

    # ═══════════════ UI / CSS Frameworks ═══════════════
    _tech("Bootstrap", "UI Library", [
        ("css", r"bootstrap[^/]*\.css", 90, "Bootstrap stylesheet"),
        ("html", r"col-md-|col-lg-|container-fluid|data-bs-", 78, "Bootstrap classes"),
        ("link", r"bootstrap", 80, "Bootstrap link"),
    ], "bootstrap", "7952B3", version=(r"bootstrap[-@/]?([0-9]+\.[0-9]+\.[0-9]+)", 1)),
    _tech("Tailwind CSS", "UI Library", [
        ("css", r"tailwind(\.min)?\.css|tailwindcss", 90, "Tailwind stylesheet"),
        ("html", r"class=\"[^\"]*tw-[a-z]|tailwind", 72, "Tailwind utility classes"),
    ], "tailwindcss", "06B6D4"),
    _tech("Materialize", "UI Library", [
        ("css", r"materialize[^/]*\.css", 90, "Materialize stylesheet"),
    ], "materialize", "EE6E73"),
    _tech("Material UI", "UI Library", [
        ("html", r"Mui[A-Z][a-zA-Z]+|makeStyles", 80, "Material UI classes"),
        ("script", r"@mui/", 80, "MUI package"),
    ], "mui", "007FFF"),
    _tech("Semantic UI", "UI Library", [
        ("css", r"semantic[^/]*\.css", 90, "Semantic UI stylesheet"),
    ], "semanticui", "35BDB2"),
    _tech("Foundation", "UI Library", [
        ("css", r"foundation(\.min)?\.css", 90, "Foundation stylesheet"),
        ("html", r"foundation\.min\.css", 82, "Foundation CSS"),
    ], "foundation", "0063B1"),
    _tech("Bulma", "UI Library", [
        ("css", r"bulma[^/]*\.css", 90, "Bulma stylesheet"),
    ], "bulma", "00D1B2"),
    _tech("Ant Design", "UI Library", [
        ("css", r"antd(\.min)?\.css|ant-design", 88, "Ant Design stylesheet"),
        ("html", r"class=\"[^\"]*\bant-", 70, "Ant Design classes"),
    ], "antdesign", "0170FE"),
    _tech("Chakra UI", "UI Library", [
        ("html", r"chakra-", 82, "Chakra classes"),
        ("script", r"@chakra-ui", 82, "Chakra package"),
    ], "chakraui", "319795"),
    _tech("Mantine", "UI Library", [
        ("html", r"mantine-", 82, "Mantine classes"),
        ("script", r"@mantine/", 82, "Mantine package"),
    ], "mantine", "339AF0"),
    _tech("Radix UI", "UI Library", [
        ("html", r"radix-", 80, "Radix classes"),
        ("script", r"@radix-ui/", 82, "Radix package"),
    ], "radixui", "161618"),
    _tech("PureCSS", "UI Library", [
        ("css", r"pure[^/]*\.css", 88, "PureCSS stylesheet"),
        ("html", r"pure-g|pure-u-", 70, "PureCSS grid classes"),
    ], "purecss", "FFFFFF"),
    _tech("Spectre CSS", "UI Library", [
        ("css", r"spectre[^/]*\.css", 88, "Spectre stylesheet"),
    ], "spectre", "2D3748"),
    _tech("Tachyons", "UI Library", [
        ("css", r"tachyons", 85, "Tachyons stylesheet"),
    ], "tachyons", "FFFFFF"),
    _tech("UnoCSS", "UI Library", [
        ("script", r"@unocss|unocss", 78, "UnoCSS script"),
        ("html", r"uno-", 60, "HTML pattern"),
    ], "unocss", "333333"),
    _tech("Open Props", "UI Library", [
        ("css", r"open-props", 82, "Open Props stylesheet"),
    ], "openprops", "333333"),
    _tech("Animate.css", "UI Library", [
        ("css", r"animate(\.min)?\.css", 85, "Animate.css stylesheet"),
        ("html", r"animate__animated", 80, "Animate.css classes"),
    ], "animatecss", "000000"),

    # ═══════════════ JavaScript Libraries ═══════════════
    _tech("jQuery", "JavaScript Library", [
        ("script", r"jquery[.-]?([0-9.]*)(\.min)?\.js|@jquery", 90, "jQuery script"),
        ("html", r"jquery", 65, "HTML pattern"),
    ], "jquery", "0769AD", version=(r"jquery[-.@/]?([0-9]+\.[0-9]+\.[0-9]+)", 1)),
    _tech("jQuery Migrate", "JavaScript Library", [
        ("script", r"jquery-migrate", 85, "jQuery Migrate script"),
    ], "jquery", "0769AD"),
    _tech("Lodash", "JavaScript Library", [
        ("script", r"lodash(\.min)?\.js|@lodash", 85, "Lodash script"),
    ], "lodash", "3492FF"),
    _tech("Underscore.js", "JavaScript Library", [
        ("script", r"underscore(\.min)?\.js", 85, "Underscore script"),
    ], "underscoredotjs", "0371B3"),
    _tech("GSAP", "JavaScript Library", [
        ("script", r"gsap|greensock", 85, "GSAP script"),
        ("html", r"gsap", 55, "HTML pattern"),
    ], "greensock", "88CE02"),
    _tech("AOS", "JavaScript Library", [
        ("html", r"data-aos=", 88, "AOS attributes"),
        ("script", r"aos(\.min)?\.js", 85, "AOS script"),
    ], "aos", "000000"),
    _tech("Swiper", "JavaScript Library", [
        ("html", r"swiper-container|swiper-wrapper|swiper-slide", 85, "Swiper markup"),
        ("script", r"swiper(\.min)?\.js", 85, "Swiper script"),
    ], "swiper", "6332F6", version=(r"swiper@?([0-9.]+)", 1)),
    _tech("Slick Carousel", "JavaScript Library", [
        ("html", r"slick-slider|slick-initialized", 85, "Slick markup"),
        ("script", r"slick(\.min)?\.js", 85, "Slick script"),
    ], "slick", "FF880F"),
    _tech("Fancybox", "JavaScript Library", [
        ("html", r"fancybox", 75, "Fancybox markup"),
        ("script", r"fancybox", 75, "Fancybox script"),
    ], "fancybox", "000000"),
    _tech("Moment.js", "JavaScript Library", [
        ("script", r"moment(\.min)?\.js", 85, "Moment script"),
    ], "momentdotjs", "5A6D8F"),
    _tech("Axios", "JavaScript Library", [
        ("script", r"axios(\.min)?\.js|@axios", 80, "Axios script"),
    ], "axios", "5A29E4"),
    _tech("D3.js", "JavaScript Library", [
        ("script", r"d3(\.min)?\.js|@d3/", 82, "D3 script"),
    ], "d3dotjs", "F9A03C"),
    _tech("Chart.js", "JavaScript Library", [
        ("script", r"chart(\.min)?\.js|chart\.js@", 82, "Chart.js script"),
    ], "chartdotjs", "FF6384", version=(r"chart\.js@([0-9.]+)", 1)),
    _tech("Three.js", "JavaScript Library", [
        ("script", r"three(\.min)?\.js|three@", 82, "Three.js script"),
    ], "threedotjs", "000000", version=(r"three(?:@|\/)([0-9.]+)", 1)),
    _tech("Isotope", "JavaScript Library", [
        ("html", r"isotope", 65, "HTML pattern"),
    ], "isotope", "3D3D3D"),
    _tech("Masonry", "JavaScript Library", [
        ("script", r"masonry(\.pkgd)?(\.min)?\.js", 82, "Masonry script"),
        ("html", r"masonry", 60, "HTML pattern"),
    ], "masonry", "000000"),

    # ═══════════════ Build Tools ═══════════════
    _tech("Webpack", "Build Tool", [
        ("inline", r"__webpack_require__|webpackJsonp", 82, "Webpack runtime"),
        ("html", r"webpack", 50, "HTML pattern"),
    ], "webpack", "8DD6F9"),
    _tech("Vite", "Build Tool", [
        ("html", r"vite-client|@vite/client|data-vite", 85, "Vite client markers"),
        ("script", r"vite", 55, "Vite script"),
    ], "vite", "646CFF"),
    _tech("Parcel", "Build Tool", [
        ("html", r"parcel", 55, "HTML pattern"),
    ], "parcel", "21374B"),
    _tech("Rollup", "Build Tool", [
        ("inline", r"rollup", 55, "Inline marker"),
    ], "rollup", "EF3335"),
    _tech("Babel", "Build Tool", [
        ("inline", r"babelHelpers|_typeof\s*=|@babel/runtime", 70, "Babel helpers"),
        ("html", r"babel", 45, "HTML pattern"),
    ], "babel", "F9DC3E"),
    _tech("ESBuild", "Build Tool", [
        ("inline", r"esbuild", 55, "Inline marker"),
    ], "esbuild", "FFCF00"),

    # ═══════════════ State Management ═══════════════
    _tech("Redux", "JavaScript Library", [
        ("script", r"redux(\.min)?\.js|@reduxjs", 80, "Redux script"),
        ("inline", r"__REDUX_DEVTOOLS_EXTENSION__", 85, "Redux DevTools marker"),
    ], "redux", "764ABC"),
    _tech("Zustand", "JavaScript Library", [
        ("script", r"zustand", 75, "Zustand script"),
    ], "zustand", "443E38"),
    _tech("MobX", "JavaScript Library", [
        ("script", r"mobx(\.min)?\.js|mobx-react", 80, "MobX script"),
    ], "mobx", "FF9955"),
    _tech("Recoil", "JavaScript Library", [
        ("script", r"recoil", 70, "Recoil script"),
    ], "recoil", "3578E5"),

    # ═══════════════ Analytics ═══════════════
    _tech("Google Analytics", "Analytics", [
        ("script", r"google-analytics\.com/analytics\.js|google-analytics\.com/ga\.js", 88, "Analytics script"),
        ("inline", r"ga\(['\"]create['\"],\s*['\"]UA-", 85, "UA tracking code"),
        ("html", r"UA-\d{6,}-\d{1,2}", 70, "UA tracking ID"),
    ], "googleanalytics", "E37400", version=(r"UA-([0-9]+)", 1)),
    _tech("Google Analytics 4", "Analytics", [
        ("script", r"googletagmanager\.com/gtag/js", 88, "GTag loader"),
        ("inline", r"gtag\(['\"]config['\"],\s*['\"]G-", 86, "GA4 config"),
        ("html", r"\bG-[A-Z0-9]*\d[A-Z0-9]*\b", 70, "GA4 measurement ID"),
    ], "googleanalytics", "E37400"),
    _tech("Google Tag Manager", "Analytics", [
        ("script", r"googletagmanager\.com/gtm\.js", 90, "GTM script"),
        ("inline", r"GTM-[A-Z0-9]{4,}", 86, "GTM container ID"),
    ], "googletagmanager", "246FDB"),
    _tech("Meta Pixel", "Analytics", [
        ("script", r"connect\.facebook\.net/[^'\"]*/fbevents\.js", 90, "Meta Pixel script"),
        ("inline", r"fbq\(['\"]init['\"]", 86, "Pixel init call"),
    ], "meta", "0467DF"),
    _tech("Hotjar", "Analytics", [
        ("script", r"static\.hotjar\.com/c/hotjar-", 90, "Hotjar script"),
    ], "hotjar", "FD3A5C"),
    _tech("Microsoft Clarity", "Analytics", [
        ("script", r"clarity\.ms|static\.clarity\.ms", 90, "Clarity script"),
    ], "microsoftclarity", "4B32C3"),
    _tech("Plausible Analytics", "Analytics", [
        ("script", r"plausible\.io/js|plausible\.io/script", 90, "Plausible script"),
    ], "plausible", "585858"),
    _tech("Fathom Analytics", "Analytics", [
        ("script", r"cdn\.usefathom\.com|usefathom\.com", 88, "Fathom script"),
    ], "fathom", "9188FF"),
    _tech("Matomo", "Analytics", [
        ("script", r"matomo\.js|piwik\.js", 90, "Matomo script"),
        ("html", r"matomo", 55, "HTML pattern"),
    ], "matomo", "3152A0"),
    _tech("Heap", "Analytics", [
        ("script", r"heapanalytics\.com", 88, "Heap script"),
    ], "heap", "8E2DE2"),
    _tech("Amplitude", "Analytics", [
        ("script", r"amplitude\.com", 88, "Amplitude script"),
        ("inline", r"amplitude\.init", 85, "Amplitude init"),
    ], "amplitude", "1E6FFF"),
    _tech("Mixpanel", "Analytics", [
        ("script", r"mixpanel\.com|cdn\.mxpnl\.com", 88, "Mixpanel script"),
    ], "mixpanel", "7856FF"),
    _tech("Segment", "Analytics", [
        ("script", r"segment\.com|segment\.io", 88, "Segment script"),
        ("inline", r"analytics\.load\(['\"]", 85, "Segment analytics.load"),
    ], "segment", "52BD9E"),
    _tech("FullStory", "Analytics", [
        ("script", r"fullstory\.com|rs\.fullstory\.com", 88, "FullStory script"),
    ], "fullstory", "4381F8"),
    _tech("Crazy Egg", "Analytics", [
        ("script", r"crazyegg\.com", 88, "Crazy Egg script"),
    ], "crazyegg", "333333"),
    _tech("VWO", "Analytics", [
        ("script", r"vwo\.com", 88, "VWO script"),
        ("html", r"vwo", 55, "HTML pattern"),
    ], "vwo", "FF3366"),
    _tech("Smartlook", "Analytics", [
        ("script", r"smartlook\.com", 88, "Smartlook script"),
    ], "smartlook", "00B980"),
    _tech("Mouseflow", "Analytics", [
        ("script", r"mouseflow\.com", 88, "Mouseflow script"),
    ], "mouseflow", "000000"),
    _tech("PostHog", "Analytics", [
        ("script", r"posthog(\.min)?\.js|posthog\.com", 86, "PostHog script"),
        ("inline", r"posthog\.init", 85, "PostHog init"),
    ], "posthog", "000000"),
    _tech("Clicky", "Analytics", [
        ("script", r"static\.getclicky\.com", 85, "Clicky script"),
    ], "clicky", "FFDD00"),
    _tech("StatCounter", "Analytics", [
        ("script", r"statcounter\.com", 88, "StatCounter script"),
        ("html", r"statcounter\.com", 72, "StatCounter link"),
    ], "statcounter", "2A3B49"),
    _tech("GoatCounter", "Analytics", [
        ("script", r"goatcounter\.com", 88, "GoatCounter script"),
    ], "goatcounter", "42B029"),
    _tech("Adobe Analytics", "Analytics", [
        ("script", r"dpm\.demdex\.net|adobedtm\.com|omniture", 88, "Adobe tag manager"),
        ("inline", r"s\.account\s*=|s\.pageName", 80, "Adobe s.js markers"),
    ], "adobe", "FF0000"),
    _tech("Yandex Metrica", "Analytics", [
        ("script", r"mc\.yandex\.ru|yandex\.ru/metrika", 88, "Yandex Metrica script"),
        ("inline", r"ym\(['\"]?\d+['\"]?,\s*['\"]init['\"]", 85, "Yandex init"),
    ], "yandex", "FF0000"),
    _tech("TikTok Pixel", "Analytics", [
        ("script", r"analytics\.tiktok\.com|tiktok\.com/i18n/pixel", 88, "TikTok Pixel script"),
        ("inline", r"ttq\.load\(['\"]", 85, "TikTok ttq load"),
    ], "tiktok", "000000"),
    _tech("LinkedIn Insight Tag", "Analytics", [
        ("script", r"snap\.licdn\.com", 88, "LinkedIn Insight script"),
    ], "linkedin", "0A66C2"),
    _tech("Twitter Pixel", "Analytics", [
        ("script", r"static\.ads-twitter\.com", 88, "Twitter Pixel script"),
        ("inline", r"twq\(['\"]init['\"]", 85, "Twitter twq init"),
    ], "x", "000000"),
    _tech("Pinterest Tag", "Analytics", [
        ("script", r"s\.pinimg\.com/ct/core\.js", 88, "Pinterest Tag script"),
        ("inline", r"pintrk\(['\"]load['\"]", 85, "Pinterest pintrk load"),
    ], "pinterest", "BD081C"),

    # ═══════════════ Marketing Tools ═══════════════
    _tech("HubSpot", "Marketing Tools", [
        ("script", r"js\.hs-scripts\.com|js\.hs-analytics\.net", 88, "HubSpot script"),
        ("html", r"hs-scripts|hs-analytics|hsforms", 70, "HubSpot markers"),
    ], "hubspot", "FF7A59"),
    _tech("Intercom", "Marketing Tools", [
        ("script", r"widget\.intercom\.io", 90, "Intercom widget"),
        ("inline", r"window\.intercomSettings|Intercom\(", 85, "Intercom init"),
    ], "intercom", "3FA9F5"),
    _tech("Zendesk", "Marketing Tools", [
        ("script", r"static\.zdassets\.com", 85, "Zendesk assets"),
        ("html", r"zdassets\.com", 70, "Zendesk asset links"),
    ], "zendesk", "03363D"),
    _tech("Mailchimp", "Marketing Tools", [
        ("script", r"chimpstatic\.com|mc\.js|mailchimp", 85, "Mailchimp script"),
        ("html", r"mailchimp", 55, "HTML pattern"),
    ], "mailchimp", "FFE01B"),
    _tech("Klaviyo", "Marketing Tools", [
        ("script", r"klaviyo\.com|static\.klaviyo", 88, "Klaviyo script"),
        ("html", r"klaviyo", 60, "HTML pattern"),
    ], "klaviyo", "00A0DF"),
    _tech("ActiveCampaign", "Marketing Tools", [
        ("script", r"activehosted\.com", 85, "ActiveCampaign script"),
    ], "activecampaign", "47568C"),
    _tech("ConvertKit", "Marketing Tools", [
        ("script", r"f\.convertkit\.com", 85, "ConvertKit script"),
        ("html", r"convertkit", 55, "HTML pattern"),
    ], "convertkit", "FB5F6E"),
    _tech("Brevo", "Marketing Tools", [
        ("script", r"sibautomation|brevo\.com", 85, "Brevo script"),
        ("inline", r"sib\.signupforms", 80, "Brevo forms"),
    ], "brevo", "0B996E"),
    _tech("HubSpot Conversations", "Chat Widget", [
        ("script", r"js\.hs-conversations\.com", 90, "HubSpot chat widget"),
    ], "hubspot", "FF7A59"),
    _tech("Calendly", "Marketing Tools", [
        ("script", r"calendly\.com/assets|widget\.calendly", 88, "Calendly widget"),
        ("html", r"calendly\.com", 70, "Calendly links"),
    ], "calendly", "006BFF"),
    _tech("Typeform", "Marketing Tools", [
        ("script", r"embed\.typeform\.com|js\.hsforms\.net", 85, "Form embed"),
        ("html", r"typeform", 55, "HTML pattern"),
    ], "typeform", "263238"),
    _tech("Jotform", "Marketing Tools", [
        ("script", r"jotform", 80, "Jotform script"),
        ("html", r"jotform", 70, "Jotform embed"),
    ], "jotform", "000000"),
    _tech("Gravity Forms", "Marketing Tools", [
        ("html", r"gravityforms|gform_", 80, "Gravity Forms markers"),
        ("script", r"gravity_forms|gform", 75, "Gravity Forms script"),
    ], "gravity", "F7B500"),

    # ═══════════════ Chat Widgets ═══════════════
    _tech("Crisp", "Chat Widget", [
        ("script", r"client\.crisp\.chat", 90, "Crisp chat script"),
        ("inline", r"CRISP_WEBSITE_ID", 85, "Crisp config"),
    ], "crisp", "4285F4"),
    _tech("Drift", "Chat Widget", [
        ("script", r"js\.drift\.com", 90, "Drift chat script"),
        ("inline", r"drift\.load\(", 85, "Drift init"),
    ], "drift", "0A2CFF"),
    _tech("Tawk.to", "Chat Widget", [
        ("script", r"tawk\.to", 88, "Tawk.to script"),
        ("inline", r"Tawk_API", 85, "Tawk config"),
    ], "tawkto", "000000"),
    _tech("LiveChat", "Chat Widget", [
        ("script", r"livechatinc\.com|cdn\.lc\.cx", 88, "LiveChat script"),
    ], "livechat", "FF5100"),
    _tech("Freshchat", "Chat Widget", [
        ("script", r"wchat\.freshchat\.com", 88, "Freshchat script"),
        ("inline", r"Freshchat\(", 82, "Freshchat init"),
    ], "freshchat", "1A9F4C"),
    _tech("Tidio", "Chat Widget", [
        ("script", r"code\.tidio\.co", 88, "Tidio script"),
    ], "tidio", "000000"),
    _tech("Gorgias", "Chat Widget", [
        ("script", r"gorgias\.chat|assets\.gorgias\.io", 88, "Gorgias widget"),
        ("html", r"gorgias", 55, "HTML pattern"),
    ], "gorgias", "F3B22B"),
    _tech("Zoho SalesIQ", "Chat Widget", [
        ("script", r"salesiq\.zoho", 88, "Zoho SalesIQ script"),
    ], "zoho", "E42527"),
    _tech("WhatsApp Chat Widget", "Chat Widget", [
        ("html", r"api\.whatsapp\.com/send|wa\.me/[0-9]", 82, "WhatsApp link"),
        ("script", r"whatsapp\.com", 70, "WhatsApp widget script"),
    ], "whatsapp", "25D366"),

    # ═══════════════ Payment Gateways ═══════════════
    _tech("Stripe", "Payment Gateway", [
        ("script", r"js\.stripe\.com|js\.stripe\.com/v[0-9]+", 90, "Stripe JS"),
        ("inline", r"Stripe\(['\"]pk_", 88, "Stripe publishable key"),
    ], "stripe", "635BFF"),
    _tech("PayPal", "Payment Gateway", [
        ("script", r"paypal\.com/sdk|paypalobjects\.com", 90, "PayPal SDK"),
        ("html", r"paypal", 55, "HTML pattern"),
    ], "paypal", "00457C"),
    _tech("Razorpay", "Payment Gateway", [
        ("script", r"checkout\.razorpay\.com|cdn\.razorpay", 90, "Razorpay script"),
        ("inline", r"rzp_|Razorpay", 80, "Razorpay key"),
    ], "razorpay", "02042B"),
    _tech("Square", "Payment Gateway", [
        ("script", r"squareup\.com|js\.square\.up|square\.com", 88, "Square script"),
        ("inline", r"Square\([^)]*publishableKey", 82, "Square init"),
    ], "square", "3E4348"),
    _tech("Apple Pay", "Payment Gateway", [
        ("html", r"apple-pay-button|data-apple-pay", 80, "Apple Pay button"),
        ("inline", r"ApplePaySession", 85, "Apple Pay API"),
    ], "applepay", "000000"),
    _tech("Google Pay", "Payment Gateway", [
        ("script", r"pay\.google\.com/gp/p/js/pay\.js", 88, "Google Pay JS"),
        ("html", r"google\.com/pay", 75, "Google Pay marker"),
    ], "googlepay", "4285F4"),
    _tech("Amazon Pay", "Payment Gateway", [
        ("script", r"amazonpay|pay\.amazon\.com", 88, "Amazon Pay script"),
    ], "amazonpay", "FF9900"),
    _tech("Klarna", "Payment Gateway", [
        ("script", r"klarna\.com|js\.klarna\.com", 88, "Klarna script"),
        ("inline", r"klarna", 60, "Inline marker"),
    ], "klarna", "FFB3C7"),
    _tech("Adyen", "Payment Gateway", [
        ("script", r"adyen\.com|checkoutshopper|adyen\.web", 88, "Adyen script"),
    ], "adyen", "0ABF53"),
    _tech("Braintree", "Payment Gateway", [
        ("script", r"braintreegateway\.com|js\.braintreegateway", 88, "Braintree script"),
    ], "braintree", "2E66B8"),
    _tech("Authorize.Net", "Payment Gateway", [
        ("html", r"authorize\.net", 80, "Authorize.Net links"),
        ("script", r"authorize\.net", 80, "Authorize.Net script"),
    ], "authorizenet", "000000"),
    _tech("Paddle", "Payment Gateway", [
        ("script", r"cdn\.paddle\.com|paddlejs", 88, "Paddle script"),
    ], "paddle", "F2F2F2"),
    _tech("Lemon Squeezy", "Payment Gateway", [
        ("script", r"lmsqueezy\.com|app\.lemonsqueezy\.com", 88, "Lemon Squeezy script"),
    ], "lemonsqueezy", "FFC900"),
    _tech("Recurly", "Payment Gateway", [
        ("script", r"recurly", 85, "Recurly script"),
    ], "recurly", "2B72FF"),
    _tech("Chargebee", "Payment Gateway", [
        ("script", r"chargebee", 85, "Chargebee script"),
        ("html", r"chargebee", 55, "HTML pattern"),
    ], "chargebee", "3B6D8F"),
    _tech("Mercado Pago", "Payment Gateway", [
        ("script", r"mercadopago|mercadolibre", 85, "Mercado Pago script"),
    ], "mercadopago", "00B1EA"),
    _tech("PayU", "Payment Gateway", [
        ("script", r"payu\.(in|com|co\.za)", 85, "PayU script"),
    ], "payu", "0077C8"),

    # ═══════════════ CDN ═══════════════
    _tech("Cloudflare", "CDN", [
        ("header", r"cf-ray", 96, "`cf-ray` header"),
        ("header", r"cloudflare", 95, "HTTP `server` header"),
        ("html", r"cdnjs\.cloudflare\.com", 80, "cdnjs assets"),
    ], "cloudflare", "F38020"),
    _tech("CloudFront", "CDN", [
        ("header", r"x-amz-cf-id|x-amz-cf-pop", 96, "CloudFront headers"),
        ("html", r"cloudfront\.net", 85, "CloudFront URLs"),
    ], "amazoncloudfront", "2C2C2C"),
    _tech("Fastly", "CDN", [
        ("header", r"x-fastly-request-id|x-served-by", 96, "Fastly headers"),
        ("header", r"fastly", 95, "HTTP header"),
    ], "fastly", "FF282D"),
    _tech("jsDelivr", "CDN", [
        ("script", r"cdn\.jsdelivr\.net", 88, "jsDelivr script"),
        ("css", r"cdn\.jsdelivr\.net", 88, "jsDelivr stylesheet"),
        ("link", r"cdn\.jsdelivr\.net", 86, "jsDelivr link"),
    ], "jsdelivr", "E84D0D"),
    _tech("unpkg", "CDN", [
        ("script", r"unpkg\.com", 88, "unpkg script"),
        ("css", r"unpkg\.com", 88, "unpkg stylesheet"),
    ], "unpkg", "000000"),
    _tech("cdnjs", "CDN", [
        ("script", r"cdnjs\.cloudflare\.com", 88, "cdnjs script"),
        ("css", r"cdnjs\.cloudflare\.com", 88, "cdnjs stylesheet"),
    ], "cdnjs", "F6821F"),
    _tech("Bunny CDN", "CDN", [
        ("script", r"bunny\.net", 80, "Bunny CDN assets"),
        ("css", r"bunny\.net", 80, "Bunny CDN stylesheet"),
        ("html", r"bunny\.net", 70, "Bunny CDN URLs"),
    ], "bunny", "FF5B2D"),
    _tech("Akamai", "CDN", [
        ("header", r"akamai|x-akamai-transformed", 95, "Akamai headers"),
        ("html", r"akamaized\.net|akamaihd\.net", 85, "Akamai URLs"),
    ], "akamai", "0096D6"),
    _tech("StackPath", "CDN", [
        ("header", r"stackpath", 92, "HTTP `server` header"),
    ], "stackpath", "000000"),
    _tech("KeyCDN", "CDN", [
        ("script", r"keycdn\.com", 80, "KeyCDN assets"),
        ("html", r"\.kxcdn\.com", 78, "KeyCDN URLs"),
    ], "keycdn", "047BD3"),
    _tech("CacheFly", "CDN", [
        ("html", r"cachefly\.net", 80, "CacheFly URLs"),
    ], "cachefly", "F9A825"),
    _tech("Azure CDN", "CDN", [
        ("html", r"azureedge\.net", 82, "Azure CDN URLs"),
        ("header", r"azure", 85, "HTTP header"),
    ], "azuredevops", "0078D7"),
    _tech("Varnish", "CDN", [
        ("header", r"x-varnish|x-cache:.*(?:HIT|MISS)", 88, "Varnish headers"),
    ], "varnish", "000000"),
    _tech("Netlify", "Deployment Platform", [
        ("header", r"x-nf-request-id|netlify", 92, "Netlify headers"),
        ("header", r"^netlify$", 92, "HTTP `server` header"),
    ], "netlify", "00C7B7"),
    _tech("Vercel", "Deployment Platform", [
        ("header", r"x-vercel-id|x-vercel-cache", 95, "Vercel headers"),
        ("html", r"vercel\.app|_vercel", 80, "Vercel URLs"),
    ], "vercel", "000000"),
    _tech("GitHub Pages", "Deployment Platform", [
        ("header", r"github\.com", 92, "HTTP `server` header"),
        ("html", r"\.github\.io", 80, "GitHub Pages URL"),
    ], "github", "181717"),

    # ═══════════════ Hosting ═══════════════
    _tech("Cloudflare Pages", "Hosting", [
        ("header", r"cloudflarepages", 92, "HTTP `server` header"),
        ("html", r"pages\.dev", 80, "Pages.dev URL"),
    ], "cloudflarepages", "F38020"),
    _tech("AWS", "Cloud Provider", [
        ("header", r"awselb|amazonaws|amazon", 90, "AWS headers"),
        ("header", r"x-amz-cf", 90, "AWS CloudFront headers"),
        ("html", r"amazonaws\.com|\.s3[.-]", 78, "AWS resource URLs"),
    ], "amazonaws", "FF9900"),
    _tech("Google Cloud", "Cloud Provider", [
        ("header", r"^gse$|google", 85, "HTTP `server` header"),
        ("html", r"googleusercontent\.com|appspot\.com", 78, "Google Cloud URLs"),
    ], "googlecloud", "4285F4"),
    _tech("Microsoft Azure", "Cloud Provider", [
        ("header", r"x-msedge-ref|microsoft-azure|azurewebsites", 92, "Azure headers"),
        ("html", r"azurewebsites\.net|azureedge\.net", 80, "Azure URLs"),
    ], "microsoftazure", "0078D4"),
    _tech("DigitalOcean", "Cloud Provider", [
        ("header", r"digitalocean", 90, "HTTP `server` header"),
        ("html", r"digitaloceanspaces\.com", 78, "DO Spaces URL"),
    ], "digitalocean", "0080FF"),
    _tech("Heroku", "Hosting", [
        ("header", r"heroku", 90, "HTTP `server` header"),
        ("html", r"herokuapp\.com", 80, "Heroku URL"),
    ], "heroku", "430098"),
    _tech("Firebase Hosting", "Hosting", [
        ("header", r"firebase", 92, "HTTP `server` header"),
        ("html", r"firebaseapp\.com|web\.app", 80, "Firebase URL"),
        ("script", r"firebase(\.app)?\.js|firebaseio\.com", 78, "Firebase script"),
    ], "firebase", "FFCA28"),
    _tech("Fly.io", "Hosting", [
        ("header", r"fly\.io|fly-", 90, "HTTP header"),
    ], "flydotio", "7B3BE2"),
    _tech("Render", "Hosting", [
        ("header", r"render", 88, "HTTP `server` header"),
    ], "render", "46E3B7"),
    _tech("Railway", "Hosting", [
        ("header", r"railway", 85, "HTTP header"),
    ], "railway", "0B0D0E"),
    _tech("Hostinger", "Hosting", [
        ("header", r"hostinger", 85, "HTTP `server` header"),
    ], "hostinger", "673DE6"),
    _tech("Oracle Cloud", "Cloud Provider", [
        ("html", r"oraclecloud\.com", 80, "Oracle Cloud URLs"),
        ("header", r"oracle", 82, "HTTP header"),
    ], "oracle", "F80000"),
    _tech("Alibaba Cloud", "Cloud Provider", [
        ("header", r"aliyun", 88, "HTTP `server` header"),
        ("html", r"aliyuncs\.com", 80, "Alibaba Cloud URLs"),
    ], "alibabacloud", "FF6A00"),
    _tech("Shopify Hosting", "Hosting", [
        ("header", r"shopify", 88, "HTTP header"),
        ("html", r"myshopify\.com", 78, "Shopify shop URL"),
    ], "shopify", "7AB55C"),
    _tech("WordPress.com", "Hosting", [
        ("header", r"wordpress\.com", 88, "HTTP `server` header"),
        ("html", r"wordpress\.com", 70, "WordPress.com URL"),
    ], "wordpress", "21759B"),
    _tech("Pantheon", "Hosting", [
        ("header", r"x-pantheon|pantheon", 85, "Pantheon headers"),
    ], "pantheon", "FFDC28"),

    # ═══════════════ Fonts ═══════════════
    _tech("Google Fonts", "Fonts", [
        ("css", r"fonts\.googleapis\.com", 88, "Google Fonts stylesheet"),
        ("link", r"fonts\.googleapis\.com", 86, "Google Fonts link"),
        ("html", r"fonts\.gstatic\.com", 80, "Google Fonts assets"),
    ], "googlefonts", "4285F4"),
    _tech("Adobe Fonts", "Fonts", [
        ("script", r"use\.typekit\.net", 88, "Adobe Fonts script"),
        ("css", r"use\.typekit\.net", 86, "Adobe Fonts stylesheet"),
    ], "adobefonts", "FF0000"),
    _tech("Font Awesome", "Fonts", [
        ("css", r"font-awesome|fontawesome|fa-solid|@fortawesome", 88, "Font Awesome stylesheet"),
        ("link", r"font-awesome|fontawesome", 85, "Font Awesome link"),
    ], "fontawesome", "528DD7"),
    _tech("Material Icons", "Fonts", [
        ("css", r"materialicons|material-design-icons", 85, "Material Icons stylesheet"),
        ("link", r"materialicons", 83, "Material Icons link"),
    ], "materialdesignicons", "2196F3"),
    _tech("Bootstrap Icons", "Fonts", [
        ("css", r"bootstrap-icons", 85, "Bootstrap Icons stylesheet"),
        ("html", r"\bbi bi-[a-z]", 70, "Bootstrap Icons classes"),
    ], "bootstrap", "7952B3"),
    _tech("Boxicons", "Fonts", [
        ("css", r"boxicons", 85, "Boxicons stylesheet"),
    ], "boxicons", "000000"),
    _tech("Ionicons", "Fonts", [
        ("css", r"ionicons", 85, "Ionicons stylesheet"),
        ("html", r"ion-icon", 70, "Ionicons element"),
    ], "ionic", "3880FF"),
    _tech("Google Material Symbols", "Fonts", [
        ("css", r"material-symbols", 85, "Material Symbols stylesheet"),
        ("html", r"material-symbols-outlined", 78, "Material Symbols classes"),
    ], "materialdesignicons", "2196F3"),

    # ═══════════════ Security ═══════════════
    _tech("reCAPTCHA", "Security", [
        ("script", r"google\.com/recaptcha|grecaptcha", 90, "reCAPTCHA script"),
        ("inline", r"grecaptcha\.render|sitekey", 80, "reCAPTCHA marker"),
    ], "google", "4285F4"),
    _tech("Cloudflare Turnstile", "Security", [
        ("script", r"challenges\.cloudflare\.com/turnstile", 90, "Turnstile script"),
        ("html", r"cf-turnstile", 85, "Turnstile widget"),
    ], "cloudflare", "F38020"),
    _tech("hCaptcha", "Security", [
        ("script", r"hcaptcha\.com|js\.hcaptcha", 90, "hCaptcha script"),
        ("html", r"h-captcha", 82, "hCaptcha widget"),
    ], "hcaptcha", "FF4D00"),
    _tech("HSTS", "Security", [
        ("header", r"strict-transport-security", 96, "`Strict-Transport-Security` header"),
    ], "hsts", "2B579A"),
    _tech("Content Security Policy", "Security", [
        ("header", r"content-security-policy", 96, "`Content-Security-Policy` header"),
    ], "csp", "2B579A"),
    _tech("X-Frame-Options", "Security", [
        ("header", r"x-frame-options", 96, "`X-Frame-Options` header"),
    ], "securityheaders", "2B579A"),
    _tech("X-Content-Type-Options", "Security", [
        ("header", r"x-content-type-options", 96, "`X-Content-Type-Options` header"),
    ], "securityheaders", "2B579A"),
    _tech("Referrer-Policy", "Security", [
        ("header", r"referrer-policy", 96, "`Referrer-Policy` header"),
    ], "securityheaders", "2B579A"),
    _tech("Permissions-Policy", "Security", [
        ("header", r"permissions-policy", 96, "`Permissions-Policy` header"),
    ], "securityheaders", "2B579A"),
    _tech("Subresource Integrity", "Security", [
        ("html", r"integrity=\"sha(256|384|512)-", 82, "SRI integrity attributes"),
    ], "subresourceintegrity", "2B579A"),
    _tech("CookieYes", "Security", [
        ("script", r"cookieyes\.com|app\.cookieyes", 85, "CookieYes script"),
    ], "cookieyes", "4A4A4A"),
    _tech("OneTrust", "Security", [
        ("script", r"cdn\.cookielaw\.org|onetrust", 85, "OneTrust script"),
    ], "onetrust", "2A2A2A"),
    _tech("Cookiebot", "Security", [
        ("script", r"consent\.cookiebot\.com|cookiebot", 85, "Cookiebot script"),
    ], "cookiebot", "2B579A"),

    # ═══════════════ PWA ═══════════════
    _tech("Web App Manifest", "PWA", [
        ("link", r"rel=[\"']manifest[\"']|\.webmanifest", 85, "Manifest link"),
    ], "pwabuilder", "FF0080"),
    _tech("Service Worker", "PWA", [
        ("inline", r"serviceWorker\.register|navigator\.serviceWorker", 85, "Service worker registration"),
        ("script", r"sw\.js", 75, "Service worker script"),
    ], "pwabuilder", "FF0080"),
    _tech("Apple Touch Icon", "PWA", [
        ("link", r"apple-touch-icon", 75, "Apple touch icon"),
    ], "apple", "999999"),

    # ═══════════════ SEO Tools ═══════════════
    _tech("Yoast SEO", "SEO Tools", [
        ("meta", r"yoast", 90, "Meta marker"),
        ("html", r"yoast", 65, "HTML pattern"),
    ], "yoast", "A4286A"),
    _tech("Rank Math SEO", "SEO Tools", [
        ("meta", r"rank-math", 90, "Meta marker"),
        ("html", r"rank-math", 65, "HTML pattern"),
    ], "rankmath", "0A9B0A"),
    _tech("All in One SEO", "SEO Tools", [
        ("meta", r"aioseo", 90, "Meta marker"),
        ("html", r"aioseo", 65, "HTML pattern"),
    ], "aiohttp", "2C5BB4"),
    _tech("SEOPress", "SEO Tools", [
        ("meta", r"seopress", 90, "Meta marker"),
    ], "seopress", "0B0B0B"),
    _tech("The SEO Framework", "SEO Tools", [
        ("meta", r"the-seo-framework", 90, "Meta marker"),
    ], "thealgorithms", "00BCB4"),
    _tech("Google Search Console", "SEO Tools", [
        ("html", r"google-site-verification", 85, "Site verification tag"),
    ], "google", "4285F4"),
    _tech("Bing Webmaster Tools", "SEO Tools", [
        ("html", r"msvalidate\.01", 85, "Bing verification tag"),
    ], "bing", "008373"),
    _tech("Yandex Webmaster", "SEO Tools", [
        ("html", r"yandex-verification", 85, "Yandex verification tag"),
    ], "yandex", "FF0000"),
    _tech("Facebook Domain Verification", "SEO Tools", [
        ("html", r"facebook-domain-verification", 85, "Facebook verification tag"),
    ], "meta", "0467DF"),

    # ═══════════════ Other / Platform ═══════════════
    _tech("GraphQL", "Other", [
        ("html", r"__graphql|graphql(?:/[A-Za-z])", 75, "GraphQL endpoints"),
        ("header", r"x-graphql|graphql", 80, "GraphQL header"),
    ], "graphql", "E10098"),
    _tech("Apollo Client", "Other", [
        ("script", r"apollo-client|@apollo/client", 82, "Apollo bundle"),
        ("inline", r"__APOLLO_STATE__", 88, "Apollo cache marker"),
    ], "apollographql", "311C87"),
    _tech("Socket.IO", "Other", [
        ("script", r"socket\.io(\.min)?\.js", 88, "Socket.IO script"),
        ("inline", r"io\(\)|socket\.io", 70, "Socket.IO marker"),
    ], "socketdotio", "010101"),
    _tech("Sentry", "Other", [
        ("script", r"browser\.sentry|@sentry/browser|sentry\.io", 85, "Sentry script"),
        ("inline", r"Sentry\.init", 82, "Sentry init"),
    ], "sentry", "362D59"),
    _tech("LogRocket", "Other", [
        ("script", r"logrocket\.min\.js|logrocket\.com", 85, "LogRocket script"),
    ], "logrocket", "764AFF"),
    _tech("JSON-LD Structured Data", "Other", [
        ("html", r"application/ld\+json", 80, "JSON-LD schema markup"),
    ], "schema", "FFB13B"),
    _tech("Open Graph", "Other", [
        ("html", r"property=\"og:|name=\"og:", 78, "Open Graph tags"),
    ], "opengraph", "FFB13B"),
    _tech("Twitter Cards", "Other", [
        ("html", r"name=\"twitter:card\"|property=\"twitter:", 75, "Twitter Card tags"),
    ], "x", "000000"),
    _tech("Native Lazy Loading", "Other", [
        ("html", r"loading=\"lazy\"", 70, "Lazy loading attributes"),
    ], "lazyload", "2B579A"),
    _tech("Google Maps Embed", "Other", [
        ("html", r"google\.com/maps/embed|maps\.google\.com/maps\?[^\"']*output=embed", 85, "Maps embed"),
        ("html", r"google\.com/maps/embed\?pb=", 85, "Maps embed iframe"),
    ], "googlemaps", "4285F4"),
    _tech("YouTube Embed", "Other", [
        ("html", r"youtube\.com/embed/|youtube-nocookie\.com/embed", 82, "YouTube iframe"),
    ], "youtube", "FF0000"),
    _tech("Vimeo Embed", "Other", [
        ("html", r"player\.vimeo\.com", 82, "Vimeo iframe"),
    ], "vimeo", "1AB7EA"),
    _tech("SoundCloud Embed", "Other", [
        ("html", r"w\.soundcloud\.com", 80, "SoundCloud iframe"),
    ], "soundcloud", "FF3300"),
    _tech("Cookie Consent Banner", "Other", [
        ("html", r"cookie-consent|cookieconsent|cookie-banner", 72, "Cookie banner"),
    ], "cookieconsent", "FFB13B"),
]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

_REGEX_METACHARS = set(".*+?[](){}^$|\\")


def _is_literal(pattern: str) -> bool:
    return not any(c in _REGEX_METACHARS for c in pattern)


class _MatchedPattern:
    __slots__ = ("source", "regex", "weight", "label", "context")

    def __init__(self, source: str, regex: str, weight: float, label: str, context: str):
        self.source = source
        self.regex = regex
        self.weight = weight
        self.label = label
        self.context = context


class TechnologyDetectionService:
    """Detects a website's technology stack from already-crawled page data."""

    # Cap the number of pages analyzed to bound CPU time while still covering
    # the whole crawled website (pages are ordered home → priority → sitemap).
    MAX_PAGES = 20

    def __init__(self):
        self.rules = TECHNOLOGY_RULES
        self._compiled = None

    def _compile_rules(self) -> None:
        if self._compiled is not None:
            return
        compiled = []
        for rule in self.rules:
            compiled.append({
                "name": rule["name"],
                "category": rule["category"],
                "logo": rule.get("logo"),
                "version": rule.get("version"),
                "patterns": [
                    (source, regex, weight, label)
                    for (source, regex, weight, label) in rule["patterns"]
                ],
            })
        self._compiled = compiled

    # ── Page signal extraction ──────────────────────────────────────────

    @staticmethod
    def _page_signals(page: Dict[str, Any]) -> Dict[str, Any]:
        """Extract all detectable signals from a single crawled page."""
        html = page.get("rendered_html") or page.get("html") or ""
        headers = page.get("response_headers") or {}
        if isinstance(headers, (list, tuple)):
            hdrs: Dict[str, str] = {}
            for item in headers:
                if isinstance(item, dict):
                    for k, v in item.items():
                        hdrs[str(k).lower()] = str(v)
                elif isinstance(item, (list, tuple)) and len(item) == 2:
                    hdrs[str(item[0]).lower()] = str(item[1])
            headers = hdrs

        header_map: Dict[str, str] = {}
        for key, value in headers.items():
            k = str(key).lower()
            if isinstance(value, (list, tuple)):
                value = ", ".join(str(v) for v in value)
            header_map[k] = str(value or "")

        lower_html = html.lower()

        soup = None
        try:
            soup = BeautifulSoup(html, "html.parser")
        except Exception:
            pass

        scripts: List[str] = []
        css: List[str] = []
        links: List[str] = []
        inline: List[str] = []
        meta_generator = ""

        if soup is not None:
            for s in soup.find_all("script"):
                src = s.get("src")
                if src:
                    scripts.append(str(src))
                elif s.string and s.string.strip():
                    inline.append(s.string.strip())

            for c in soup.find_all("link"):
                href = c.get("href")
                if href:
                    links.append(str(href))
                    rel = (c.get("rel") or [])
                    if any(str(r).lower() == "stylesheet" for r in rel):
                        css.append(str(href))

            gen = soup.find("meta", attrs={"name": "generator"})
            if gen and gen.get("content"):
                meta_generator = str(gen.get("content"))

        meta_tags = page.get("meta_tags") or {}
        if not meta_generator:
            gen_val = meta_tags.get("generator")
            if gen_val:
                meta_generator = str(gen_val)

        # Inline scripts may include huge JSON payloads (__NEXT_DATA__) —
        # bound each snippet to keep regex scanning fast.
        inline = [s[:20000] for s in inline]

        return {
            "url": page.get("url") or page.get("final_url") or "",
            "html": html,
            "lower_html": lower_html,
            "headers": header_map,
            "cookies": (header_map.get("set-cookie") or "").lower(),
            "meta_generator": meta_generator,
            "scripts": scripts,
            "css": css,
            "links": links,
            "inline": inline,
        }

    # ── Pattern matching ────────────────────────────────────────────────

    @classmethod
    def _match(cls, pattern: Tuple, signals: Dict[str, Any]) -> Optional[_MatchedPattern]:
        source, raw_pattern, weight, label = pattern
        compiled = None
        try:
            compiled = re.compile(raw_pattern, re.IGNORECASE)
        except re.error:
            return None

        context = ""

        if source == "header":
            # Headers may be matched by name (e.g. cf-ray, x-vercel-id), by
            # value (e.g. server: nginx), or by combined "key: value" form
            # (e.g. x-powered-by: PHP).
            for key, value in signals["headers"].items():
                try:
                    if (
                        compiled.search(key)
                        or compiled.search(value)
                        or compiled.search(f"{key}: {value}")
                    ):
                        context = value
                        break
                except Exception:
                    continue
            else:
                return None
            return _MatchedPattern("header", raw_pattern, weight, label, context)

        if source == "meta":
            if not signals["meta_generator"]:
                return None
            if compiled.search(signals["meta_generator"]):
                return _MatchedPattern("meta", raw_pattern, weight, label, signals["meta_generator"])
            return None

        if source == "cookie":
            if compiled.search(signals["cookies"]):
                return _MatchedPattern("cookie", raw_pattern, weight, label, signals["cookies"])
            return None

        if source in ("script", "css", "link", "inline"):
            if source == "script":
                haystacks = signals["scripts"]
            elif source == "css":
                haystacks = signals["css"]
            elif source == "link":
                haystacks = signals["links"]
            else:
                haystacks = signals["inline"]
            for item in haystacks:
                try:
                    if compiled.search(item):
                        return _MatchedPattern(source, raw_pattern, weight, label, item)
                except Exception:
                    continue
            return None

        # html source — literal fast path first, then regex.
        if source == "html":
            if _is_literal(raw_pattern):
                if raw_pattern.lower() in signals["lower_html"]:
                    return _MatchedPattern("html", raw_pattern, weight, label, raw_pattern)
                return None
            try:
                m = compiled.search(signals["html"])
                if m:
                    return _MatchedPattern("html", raw_pattern, weight, label, m.group(0)[:60])
            except Exception:
                pass
            return None

        return None

    # ── Version extraction ──────────────────────────────────────────────

    def _extract_version(self, rule: Dict[str, Any], matches: List[_MatchedPattern],
                         signals: Dict[str, Any]) -> Optional[str]:
        version_spec = rule.get("version")
        if not version_spec:
            return None
        regex_str, group = version_spec
        try:
            regex = re.compile(regex_str, re.IGNORECASE)
        except re.error:
            return None

        # 1. Prefer the most precise context (the highest-weight match).
        for match in sorted(matches, key=lambda m: m.weight, reverse=True):
            if not match.context:
                continue
            try:
                m = regex.search(match.context)
                if m and m.lastindex is not None and m.group(group):
                    return m.group(group)
            except Exception:
                continue

        # 2. Fall back to the full HTML.
        try:
            m = regex.search(signals["html"])
            if m and m.lastindex is not None and m.group(group):
                return m.group(group)
        except Exception:
            pass

        # 3. Fall back to headers.
        for value in signals["headers"].values():
            try:
                m = regex.search(value)
                if m and m.lastindex is not None and m.group(group):
                    return m.group(group)
            except Exception:
                continue
        return None

    # ── Confidence scoring ──────────────────────────────────────────────

    @staticmethod
    def _score(matches: List[_MatchedPattern], page_hits: int) -> float:
        if not matches:
            return 0.0
        weights = [m.weight for m in matches]
        base = max(weights)
        extra = min(sum(w for w in weights if w < base) * 0.2, 10.0)
        confidence = base + extra
        if page_hits > 1:
            confidence += 3.0
        return round(min(confidence, 98.0), 1)

    # ── detectedFrom label ──────────────────────────────────────────────

    @staticmethod
    def _detected_from(matches: List[_MatchedPattern]) -> str:
        best = max(matches, key=lambda m: m.weight)
        detail = best.context.strip()
        if len(detail) > 120:
            detail = detail[:117] + "..."
        if detail:
            return f"{best.label} · {detail}"
        return best.label

    # ── Insights ────────────────────────────────────────────────────────

    @staticmethod
    def _build_insights(technologies: List[DetectedTechnology],
                        headers: Dict[str, str]) -> Dict[str, List[str]]:
        observations: List[str] = []
        recommendations: List[str] = []

        by_name = {t.name: t for t in technologies}
        names = set(by_name.keys())
        versions = {t.name: t.version for t in technologies if t.version}

        # Stack summary
        cms = next((t.name for t in technologies if t.category == "CMS"), None)
        ecomm = next((t.name for t in technologies if t.category == "E-Commerce"), None)
        frontend = next((t.name for t in technologies if t.category == "Frontend Framework"), None)
        backend = next((t.name for t in technologies if t.category == "Backend Framework"), None)
        css = next((t.name for t in technologies if t.category == "UI Library"), None)
        framework_parts = [p for p in [frontend, backend, css] if p]
        if cms:
            ver = versions.get(cms)
            observations.append(f"Runs on {cms}" + (f" {ver}" if ver else "") + ", the content management system behind the site.")
        if ecomm:
            ver = versions.get(ecomm)
            observations.append(f"Uses {ecomm}" + (f" {ver}" if ver else "") + " for its online storefront and checkout.")
        if frontend:
            ver = versions.get(frontend)
            observations.append(f"Frontend built with {frontend}" + (f" {ver}" if ver else "") + ("." if not framework_parts[1:] else f", paired with {', '.join(framework_parts[1:])}."))
        elif backend:
            observations.append(f"Served by a {backend} backend.")

        # Analytics
        analytics = [t.name for t in technologies if t.category == "Analytics"]
        if analytics:
            observations.append(f"Visitor behaviour tracked via {', '.join(analytics)}.")
        else:
            recommendations.append("Add web analytics (e.g. Plausible or Google Analytics) to understand visitor behaviour.")

        # Payments
        payments = [t.name for t in technologies if t.category == "Payment Gateway"]
        if payments:
            observations.append(f"Accepts payments through {', '.join(payments)}.")

        # CDN
        cdn = [t.name for t in technologies if t.category in ("CDN", "Deployment Platform") if t.name not in ("Netlify", "Vercel")]
        if not cdn and not any(t.category == "CDN" for t in technologies):
            recommendations.append("Serve static assets via a CDN (e.g. Cloudflare or BunnyCDN) to speed up global loading times.")

        # Hosting
        hosting = next((t.name for t in technologies if t.category == "Hosting"), None)
        if hosting:
            observations.append(f"Hosted on {hosting}.")

        # Security headers
        security_headers = {
            "Strict-Transport-Security": headers.get("strict-transport-security"),
            "Content-Security-Policy": headers.get("content-security-policy"),
            "X-Frame-Options": headers.get("x-frame-options"),
            "X-Content-Type-Options": headers.get("x-content-type-options"),
            "Referrer-Policy": headers.get("referrer-policy"),
        }
        missing = [k for k, v in security_headers.items() if not v]
        present = [k for k, v in security_headers.items() if v]
        if present:
            observations.append(f"Good security posture — {', '.join(present)} headers are set.")
        if missing:
            recommendations.append(f"Add security headers: {', '.join(missing)}.")

        # Outdated tech
        outdated = []
        jq = versions.get("jQuery") or versions.get("jQuery Migrate")
        if jq:
            try:
                if int(jq.split(".")[0]) < 3:
                    outdated.append("jQuery 1.x/2.x (update to jQuery 3+)")
                    recommendations.append("Upgrade jQuery — legacy versions contain known security and compatibility issues.")
            except (ValueError, IndexError):
                pass
        boot = versions.get("Bootstrap")
        if boot:
            try:
                if int(boot.split(".")[0]) < 5:
                    outdated.append(f"Bootstrap {boot} (upgrade to Bootstrap 5)")
                    recommendations.append(f"Upgrade Bootstrap from v{boot} to v5 for the latest components and accessibility fixes.")
            except (ValueError, IndexError):
                pass
        ang = versions.get("Angular")
        if ang:
            try:
                if int(ang.split(".")[0]) < 17:
                    outdated.append(f"Angular {ang} (upgrade to Angular 17+)")
            except (ValueError, IndexError):
                pass

        # Framework-specific guidance
        if "WordPress" in names:
            recommendations.append("Keep WordPress core, themes and plugins updated to avoid known vulnerabilities.")
        if frontend in ("React", "Vue.js", "Angular") and not any(t.name == "Next.js" or t.name == "Nuxt" for t in technologies):
            recommendations.append("Consider server-side rendering or static generation for SEO-friendly single-page app delivery.")
        if "Google Fonts" in names:
            recommendations.append("Self-host fonts to improve privacy and reduce third-party requests.")
        if "Laravel" in names:
            recommendations.append("Schedule regular `composer update` runs to keep the Laravel framework patched.")
        if not technologies:
            observations.append("No distinctive technology fingerprints were found — the site may use static HTML or heavily obfuscated assets.")

        # Dedupe, cap
        return {
            "observations": list(dict.fromkeys(observations))[:6],
            "recommendations": list(dict.fromkeys(recommendations))[:6],
        }

    # ── Main detection entrypoint ───────────────────────────────────────

    async def detect_technologies(self, lead_id: str, pages: List[Dict],
                                  on_update=None) -> TechnologyDetectionResultCreate:
        """Detect the technology stack across all crawled pages.

        Never raises — any failure returns an empty result so that the
        surrounding AI analysis pipeline continues uninterrupted.
        """
        try:
            return self._detect(lead_id, pages, on_update=on_update)
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(f"[TechDetection] Detection failed for lead {lead_id}: {exc!r}")
            return TechnologyDetectionResultCreate(lead_id=lead_id)

    def _detect(self, lead_id: str, pages: List[Dict], on_update=None) -> TechnologyDetectionResultCreate:
        self._compile_rules()
        if not pages:
            return TechnologyDetectionResultCreate(lead_id=lead_id)

        # Bound the number of pages; de-duplicate identical HTML.
        analyzed_pages = pages[: self.MAX_PAGES]
        seen_html: Set[str] = set()
        unique_pages: List[Dict[str, Any]] = []
        for page in analyzed_pages:
            try:
                if not isinstance(page, dict):
                    continue
                html = page.get("rendered_html") or page.get("html") or ""
                sig = hash(html) if html else 0
                if sig in seen_html:
                    continue
                seen_html.add(sig)
                unique_pages.append(page)
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug(f"[TechDetection] Invalid page skipped: {exc!r}")

        page_signals: List[Dict[str, Any]] = []
        for page in unique_pages:
            try:
                page_signals.append(self._page_signals(page))
            except Exception as exc:  # pragma: no cover - defensive
                logger.debug(f"[TechDetection] Signal extraction failed: {exc!r}")

        # tech_name -> {rule, matched_patterns per page, page_hits}
        results: Dict[str, Dict[str, Any]] = {}

        for page_idx, signals in enumerate(page_signals):
            for rule in self._compiled:
                name = rule["name"]
                entry = results.setdefault(name, {
                    "rule": rule,
                    "page_matches": {},
                })

                matches_for_page: List[_MatchedPattern] = []
                for pattern in rule["patterns"]:
                    try:
                        matched = self._match(pattern, signals)
                    except Exception:
                        matched = None
                    if matched:
                        matches_for_page.append(matched)

                if matches_for_page:
                    entry["page_matches"][page_idx] = matches_for_page

            if on_update and (page_idx % 4 == 0 or page_idx == len(page_signals) - 1):
                try:
                    _invoke_update(
                        on_update,
                        "Analyzing DOM & Headers",
                        signals.get("url", ""),
                        {
                            "pages_analyzed": page_idx + 1,
                            "technologies_detected": len(results),
                        },
                    )
                except Exception:
                    pass

        # ── Build final result list ──────────────────────────────────────
        detected_list: List[DetectedTechnology] = []
        primary_headers: Dict[str, str] = {}
        if page_signals:
            primary_headers = page_signals[0]["headers"]

        for name, entry in results.items():
            page_matches = entry["page_matches"]
            if not page_matches:
                continue
            rule = entry["rule"]
            all_matches: List[_MatchedPattern] = []
            for matches in page_matches.values():
                all_matches.extend(matches)

            # Deduplicate identical pattern matches across pages.
            unique_matches: List[_MatchedPattern] = []
            seen_patterns: Set[Tuple[str, str]] = set()
            for m in sorted(all_matches, key=lambda m: m.weight, reverse=True):
                key = (m.source, m.regex)
                if key not in seen_patterns:
                    seen_patterns.add(key)
                    unique_matches.append(m)

            page_hits = len(page_matches)
            confidence = self._score(unique_matches, page_hits)
            if confidence < 40:
                continue

            version = self._extract_version(rule, unique_matches, page_signals[0] if page_signals else {})

            detected_list.append(DetectedTechnology(
                name=rule["name"],
                category=rule["category"],
                version=version,
                detection_method="Multi-source signature analysis",
                confidence_score=confidence,
                confidence=confidence,
                detectedFrom=self._detected_from(unique_matches),
                evidence="; ".join(
                    f"{m.label}: {m.context[:80]}" for m in unique_matches[:3]
                ),
                logo=rule["logo"],
            ))

        # Order: highest confidence first, but keep a stable category grouping.
        detected_list.sort(key=lambda t: (-t.confidence_score, t.category, t.name))

        # Insights only make sense when at least one page was actually analyzed.
        insights = self._build_insights(detected_list, primary_headers) if page_signals else {}

        website_technologies = [
            {
                "name": t.name,
                "category": t.category,
                "confidence": t.confidence_score,
                "version": t.version,
                "detectedFrom": t.detectedFrom,
                "logo": t.logo,
            }
            for t in detected_list
        ]

        result = TechnologyDetectionResultCreate(
            lead_id=lead_id,
            technologies=detected_list,
            websiteTechnologies=website_technologies,
            insights=insights,
        )
        logger.info(
            f"[TechDetection] Detected {len(detected_list)} technologies "
            f"across {len(page_signals)} unique pages for lead {lead_id}"
        )
        return result

    # ── MongoDB persistence ────────────────────────────────────────────────
    # The intelligence dashboards aggregate technology data from the standalone
    # `technology_detections` collection (one document per lead). Persisting the
    # detection result here keeps those charts populated. Never raises — a
    # persistence failure must never break the analysis pipeline.

    async def persist_result(self, result: TechnologyDetectionResultCreate,
                             db: Any = None) -> bool:
        """Persist a detection result into the ``technology_detections`` collection.

        Idempotent (``lead_id``-keyed upsert, latest result wins) and
        non-fatal (returns ``False`` on any failure so callers can ignore it).

        Args:
            result: The detection result produced by :meth:`detect_technologies`.
            db: An optional database handle. Defaults to the app-wide
                ``db_instance.db`` when omitted.
        """
        try:
            from bson import ObjectId
            from datetime import datetime

            if db is None:
                from app.db.database import db_instance
                db = db_instance.db
            if db is None:
                return False

            lead_id = result.lead_id
            lead_id_value: Any = lead_id
            if isinstance(lead_id, str) and len(lead_id) == 24:
                try:
                    lead_id_value = ObjectId(lead_id)
                except Exception:
                    lead_id_value = lead_id

            # Remove any stale variant (string vs ObjectId) so a re-analysis
            # never leaves duplicate documents behind.
            if lead_id_value != lead_id:
                try:
                    await db["technology_detections"].delete_many(
                        {"lead_id": {"$in": [lead_id_value, lead_id]}}
                    )
                except Exception:
                    pass

            doc = {
                "lead_id": lead_id_value,
                "user_id": result.user_id,
                "technologies": [t.model_dump() for t in result.technologies],
                "websiteTechnologies": result.websiteTechnologies,
                "insights": result.insights,
                "detected_at": datetime.utcnow(),
            }
            await db["technology_detections"].replace_one(
                {"lead_id": lead_id_value},
                doc,
                upsert=True,
            )
            return True
        except Exception as exc:
            logger.error(
                f"[TechDetection] Persist failed for lead "
                f"{getattr(result, 'lead_id', '?')}: {exc!r}"
            )
            return False


def _invoke_update(on_update, stage: str, url: str, data: Dict[str, Any]) -> None:
    """Invoke the progress callback whether it is sync or async.

    Async callbacks are scheduled on the running loop (with a swallowed
    exception consumer) so detection is never blocked on progress events.
    """
    import asyncio

    result = on_update(stage, url, data)
    if asyncio.iscoroutine(result):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(result)
        else:
            task = asyncio.ensure_future(result)
            task.add_done_callback(
                lambda t: t.exception() if not t.cancelled() else None
            )


# Singleton instance (matching the rest of the codebase pattern).
technology_detection_service = TechnologyDetectionService()
