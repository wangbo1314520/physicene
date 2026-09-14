import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1500, 'height': 950})
    page.goto('http://localhost:5173/login', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_load_state('networkidle', timeout=60000)
    page.fill('input[placeholder*="4-50"]', 'stu01')
    page.fill('input[placeholder*="8-32"]', 'pass1234')
    page.click('button:has-text("登 录")')
    page.wait_for_selector('.lab', timeout=30000)
    time.sleep(1)
    page.goto('http://localhost:5173/lab?scene=27')
    page.wait_for_load_state('networkidle', timeout=30000)
    time.sleep(3)
    page.locator('.canvas-wrap').screenshot(path='frame-canvas.png')
    browser.close()
print('saved')
