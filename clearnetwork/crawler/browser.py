"""Browser-based MRF discovery for insurers requiring JavaScript rendering.

Uses Playwright to navigate insurer websites, extract MRF index URLs from
page links and intercepted network traffic.

Requires: pip install playwright && playwright install chromium
"""
import asyncio
import logging
import re

import aiohttp

from crawler.mrf_index import MRFIndexResult, fetch_and_parse_index

logger = logging.getLogger(__name__)

# Patterns for finding MRF URLs in page content and network traffic
INDEX_JSON_RE = re.compile(
    r"https?://[^\s\"'<>]+_index\.json(?:\.gz)?(?:\?[^\s\"'<>]*)?",
    re.IGNORECASE,
)
MRF_URL_RE = re.compile(
    r"https?://[^\s\"'<>]+(?:in.network.rates|allowed.amounts|table.of.contents)[^\s\"'<>]*",
    re.IGNORECASE,
)
AETNA_API_RE = re.compile(r"apix\.cvshealth\.com|transparency-proxy\.aetna\.com")


async def _scrape_page_for_mrf_urls(url: str, timeout_ms: int = 45000) -> list[str]:
    """Generic scraper: navigate a page, extract all MRF index URLs.

    Works for any insurer that renders index links in HTML (Kaiser, Centene, etc.)
    Also intercepts XHR/fetch responses for SPA-based sites (Highmark, Aetna, etc.)
    """
    from playwright.async_api import async_playwright

    discovered = []
    intercepted_json_urls = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()

        # Intercept network responses for API-driven sites
        async def on_response(response):
            try:
                resp_url = response.url
                ct = response.headers.get("content-type", "")
                if response.status == 200 and "json" in ct:
                    # Check if the response URL itself is an index
                    if "index.json" in resp_url.lower():
                        intercepted_json_urls.append(resp_url)
                    # For Aetna-like APIs, scan response body for URLs
                    if AETNA_API_RE.search(resp_url):
                        body = await response.text()
                        for m in INDEX_JSON_RE.findall(body):
                            intercepted_json_urls.append(m)
                        for m in MRF_URL_RE.findall(body):
                            intercepted_json_urls.append(m)
            except Exception:
                pass

        page.on("response", on_response)

        try:
            logger.info(f"    Browser: navigating to {url[:80]}...")
            await page.goto(url, wait_until="networkidle", timeout=timeout_ms)
            await page.wait_for_timeout(3000)

            # Strategy 1: Extract all <a href> links matching index.json
            all_hrefs = await page.eval_on_selector_all(
                "a[href]", "els => els.map(e => e.href)"
            )
            for href in all_hrefs:
                if "index.json" in href.lower():
                    discovered.append(href)

            # Strategy 2: Scan full page source for index URLs only
            content = await page.content()
            for m in INDEX_JSON_RE.findall(content):
                discovered.append(m)

            # Strategy 3: Add intercepted network URLs
            discovered.extend(intercepted_json_urls)

            # Strategy 4: Try clicking expandable sections / "show more"
            expandables = await page.query_selector_all(
                "button:has-text('Show'), button:has-text('More'), "
                "button:has-text('Download'), details summary, "
                "[role='tab'], .accordion-header"
            )
            if expandables and len(discovered) < 5:
                for btn in expandables[:10]:
                    try:
                        await btn.click()
                        await page.wait_for_timeout(1000)
                    except Exception:
                        pass
                # Re-scan after expanding
                content = await page.content()
                for m in INDEX_JSON_RE.findall(content):
                    discovered.append(m)

        except Exception as e:
            logger.warning(f"    Browser error at {url}: {e}")
        finally:
            await browser.close()

    # Deduplicate preserving order
    return list(dict.fromkeys(discovered))


async def fetch_mrf_urls_with_browser(
    url: str, session: aiohttp.ClientSession, max_indexes: int = 20
) -> MRFIndexResult:
    """Discover MRF index URLs via browser, then parse them for in-network files.

    Works generically for any browser_required insurer:
    1. Navigate to the insurer's transparency page with Playwright
    2. Extract index.json URLs from links, page source, and network traffic
    3. Parse each discovered index file for plans and in-network file URLs
    """
    result = MRFIndexResult()

    try:
        from playwright.async_api import async_playwright  # noqa: F401
    except ImportError:
        result.errors.append(
            "playwright not installed. Run: pip install playwright && playwright install chromium"
        )
        return result

    # Step 1: Scrape for index URLs
    index_urls = await _scrape_page_for_mrf_urls(url)

    if not index_urls:
        result.errors.append(f"Browser found no MRF index URLs at {url}")
        logger.warning(f"    No index URLs found at {url}")
        return result

    logger.info(f"    Browser found {len(index_urls)} index URLs")

    # Step 2: Parse each index file for plans and in-network URLs
    sample = index_urls[:max_indexes]
    for idx, idx_url in enumerate(sample, 1):
        try:
            logger.info(f"    [{idx}/{len(sample)}] Parsing: {idx_url[:100]}...")
            sub = await fetch_and_parse_index(idx_url, session)

            if not result.entity_name and sub.entity_name:
                result.entity_name = sub.entity_name
                result.entity_type = sub.entity_type

            result.plans.extend(sub.plans)
            result.in_network_urls.extend(sub.in_network_urls)
            if sub.errors:
                result.errors.extend(sub.errors)
        except Exception as e:
            result.errors.append(f"Error parsing index {idx_url[:80]}: {e}")

    # Deduplicate
    result.in_network_urls = list(dict.fromkeys(result.in_network_urls))
    logger.info(
        f"    Browser totals: {len(result.plans)} plans, "
        f"{len(result.in_network_urls)} unique in-network URLs"
    )

    return result
