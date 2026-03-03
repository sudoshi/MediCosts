"""Browser-based MRF discovery for insurers requiring JavaScript rendering.

Uses Playwright to navigate insurer websites, intercept API calls, and extract
MRF index/in-network file URLs that aren't available via direct HTTP.

Usage:
    # Called by orchestrator when --include-browser is set
    result = await fetch_mrf_urls_with_browser(url, session)

Requires: pip install playwright && playwright install chromium
"""
import asyncio
import logging
import re
from urllib.parse import urljoin

import aiohttp

from crawler.mrf_index import MRFIndexResult

logger = logging.getLogger(__name__)

# Known patterns for extracting MRF URLs from intercepted network traffic
AETNA_API_PATTERN = re.compile(r"apix\.cvshealth\.com|transparency-proxy\.aetna\.com")
MRF_URL_PATTERN = re.compile(r"https?://[^\s\"']+(?:index\.json|in-network-rates|allowed-amounts)[^\s\"']*", re.IGNORECASE)


async def _discover_aetna_urls(base_url: str) -> list[str]:
    """Navigate Aetna's MRF portal and intercept API responses for file URLs."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.error("playwright not installed. Run: pip install playwright && playwright install chromium")
        return []

    discovered_urls = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        # Intercept network responses to capture API data
        async def handle_response(response):
            try:
                url = response.url
                if AETNA_API_PATTERN.search(url) and response.status == 200:
                    content_type = response.headers.get("content-type", "")
                    if "json" in content_type:
                        body = await response.text()
                        # Extract any MRF-like URLs from the response
                        urls = MRF_URL_PATTERN.findall(body)
                        for u in urls:
                            if u not in discovered_urls:
                                discovered_urls.append(u)
                                logger.debug(f"    Intercepted MRF URL: {u[:80]}...")
            except Exception:
                pass

        page.on("response", handle_response)

        try:
            logger.info(f"    Navigating to {base_url}...")
            await page.goto(base_url, wait_until="networkidle", timeout=60000)

            # Wait for dynamic content to load
            await page.wait_for_timeout(5000)

            # Try to find and click through any file listing elements
            # Aetna's SPA may need interaction to load file lists
            links = await page.query_selector_all("a[href*='.json'], a[href*='download'], a[href*='mrf']")
            for link in links[:10]:
                href = await link.get_attribute("href")
                if href and href.startswith("http"):
                    discovered_urls.append(href)

            # Also check for any direct links in page source
            content = await page.content()
            page_urls = MRF_URL_PATTERN.findall(content)
            for u in page_urls:
                if u not in discovered_urls:
                    discovered_urls.append(u)

        except Exception as e:
            logger.error(f"    Browser navigation error: {e}")
        finally:
            await browser.close()

    return discovered_urls


async def fetch_mrf_urls_with_browser(url: str, session: aiohttp.ClientSession) -> MRFIndexResult:
    """Fetch MRF URLs using browser automation for browser_required insurers.

    Currently supports Aetna. Other browser_required insurers can be added
    by creating handler functions and mapping them here.
    """
    result = MRFIndexResult()

    # Dispatch to insurer-specific handler
    if "aetna" in url.lower() or "mrf.aetna.com" in url.lower():
        result.entity_name = "Aetna Life Insurance Company"
        result.entity_type = "health insurance issuer"
        urls = await _discover_aetna_urls(url)
    else:
        result.errors.append(f"No browser handler for URL: {url}")
        return result

    if urls:
        # Separate index files from in-network files
        index_urls = [u for u in urls if "index.json" in u.lower()]
        in_network_urls = [u for u in urls if "in-network" in u.lower() or "in_network" in u.lower()]

        if index_urls:
            # Parse the first index file to get plans and more in-network URLs
            from crawler.mrf_index import fetch_and_parse_index
            for idx_url in index_urls[:5]:
                try:
                    sub = await fetch_and_parse_index(idx_url, session)
                    result.plans.extend(sub.plans)
                    result.in_network_urls.extend(sub.in_network_urls)
                except Exception as e:
                    result.errors.append(f"Error parsing browser-discovered index: {e}")

        # Add directly discovered in-network URLs
        result.in_network_urls.extend(in_network_urls)

        # Deduplicate
        result.in_network_urls = list(dict.fromkeys(result.in_network_urls))
        logger.info(f"    Browser discovered {len(result.in_network_urls)} in-network URLs")
    else:
        result.errors.append(f"Browser automation found no MRF URLs at {url}")

    return result
