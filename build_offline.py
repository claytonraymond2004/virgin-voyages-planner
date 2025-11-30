import os
import re
import urllib.request
import sys

# Configuration
TAILWIND_URL = "https://cdn.tailwindcss.com"
FONTS_CSS_URL = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Oswald:wght@400;500;600;700&display=swap"

ASSETS_DIR = "assets"
FONTS_DIR = os.path.join(ASSETS_DIR, "fonts")

def ensure_dirs():
    if not os.path.exists(ASSETS_DIR):
        os.makedirs(ASSETS_DIR)
    if not os.path.exists(FONTS_DIR):
        os.makedirs(FONTS_DIR)

def download_file(url, path):
    print(f"Downloading {url} to {path}...")
    try:
        # User-Agent is sometimes needed for Google Fonts to give the right format (woff2)
        req = urllib.request.Request(
            url, 
            data=None, 
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
            }
        )
        with urllib.request.urlopen(req) as response, open(path, 'wb') as out_file:
            out_file.write(response.read())
    except Exception as e:
        print(f"Failed to download {url}: {e}")
        sys.exit(1)

def process_fonts():
    print("Processing fonts...")
    # 1. Download CSS
    try:
        req = urllib.request.Request(
            FONTS_CSS_URL, 
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
            }
        )
        with urllib.request.urlopen(req) as response:
            css_content = response.read().decode('utf-8')
    except Exception as e:
        print(f"Failed to download fonts CSS: {e}")
        sys.exit(1)

    # 2. Find all font URLs
    # url(https://fonts.gstatic.com/s/outfit/v11/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC0C4G-FiU.woff2)
    font_urls = re.findall(r'url\((https://[^)]+)\)', css_content)
    
    # 3. Download each font and replace in CSS
    for url in set(font_urls):
        filename = url.split('/')[-1]
        local_path = os.path.join(FONTS_DIR, filename)
        download_file(url, local_path)
        
        # Replace in CSS (relative path from assets/fonts.css to assets/fonts/file.woff2 is just fonts/file.woff2)
        css_content = css_content.replace(url, f'fonts/{filename}')

    # 4. Save modified CSS
    with open(os.path.join(ASSETS_DIR, "fonts.css"), "w") as f:
        f.write(css_content)

def process_tailwind():
    print("Processing Tailwind...")
    download_file(TAILWIND_URL, os.path.join(ASSETS_DIR, "tailwindcss.js"))

def patch_html():
    print("Patching index.html...")
    with open("index.html", "r") as f:
        html = f.read()

    # Replace Tailwind
    html = html.replace('src="https://cdn.tailwindcss.com"', 'src="assets/tailwindcss.js"')
    
    # Replace Fonts
    # Regex replacement for the fonts link
    # Matches <link ... href="https://fonts.googleapis.com..." ...>
    # We use a broad pattern to catch the multi-line tag
    
    # Pattern explanation:
    # <link\s+[^>]*href="https://fonts\.googleapis\.com[^"]+"[^>]*>
    # \s+ matches space after link
    # [^>]* matches other attributes before href
    # href="..." matches the target href
    # [^>]* matches attributes after href
    
    pattern = r'<link\s+[^>]*href="https://fonts\.googleapis\.com[^"]+"[^>]*>'
    
    if re.search(pattern, html, re.DOTALL):
        print("Found Google Fonts link, replacing...")
        html = re.sub(
            pattern,
            '<link rel="stylesheet" href="assets/fonts.css">',
            html,
            flags=re.DOTALL
        )
    else:
        print("Warning: Could not find Google Fonts link to replace.")

    with open("index.html", "w") as f:
        f.write(html)

def main():
    ensure_dirs()
    process_fonts()
    process_tailwind()
    patch_html()
    print("Offline build preparation complete.")

if __name__ == "__main__":
    main()
