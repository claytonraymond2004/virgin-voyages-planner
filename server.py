import http.server
import socketserver
import os

PORT = 8000

# Ensure we bind to all interfaces for Docker
ADDRESS = "0.0.0.0"

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching so changes to index.html appear immediately
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

print(f"Starting Virgin Voyages Planner on {ADDRESS}:{PORT}...")

# Change directory to where the script is located to ensure index.html is found
os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer((ADDRESS, PORT), NoCacheHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")