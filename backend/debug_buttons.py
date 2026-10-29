import asyncio
from app.services.search_engine.playwright_engine import PlaywrightEngine

async def main():
    engine = PlaywrightEngine()
    await engine.start_browser()
    await engine.navigate_to_maps('software companies in bangalore')
    
    # Get the feed
    cards = engine.page.locator('div[role="feed"] > div:has(a[href*="/maps/place"])')
    await cards.first.click()
    await asyncio.sleep(3)
    
    # Try to find close/back buttons
    for label in ['Close', 'Back', 'Back to results']:
        btn = engine.page.locator(f'button[aria-label="{label}"]')
        count = await btn.count()
        if count > 0:
            print(f'Found {label} button! Count: {count}')
            
    await engine.close()

asyncio.run(main())
