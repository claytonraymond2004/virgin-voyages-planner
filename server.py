import http.server
import socketserver
import os

PORT = 8000

# Ensure we bind to all interfaces for Docker
ADDRESS = "0.0.0.0"

def load_env():
    """Load environment variables from .env file if it exists."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(env_path):
        print(f"Loading environment variables from {env_path}")
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, value = line.split('=', 1)
                    # Don't overwrite existing env vars (e.g. from docker run -e)
                    if key not in os.environ:
                        os.environ[key] = value

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching so changes to index.html appear immediately
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        # Handle virgin_api.js injection
        # Check for exact match or match with query parameters
        if self.path == '/virgin_api.js' or self.path.startswith('/virgin_api.js?'):
            self.serve_virgin_api()
        else:
            super().do_GET()

    def serve_virgin_api(self):
        try:
            file_path = os.path.join(os.getcwd(), 'virgin_api.js')
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Inject token
            token = os.environ.get('VV_AUTH_TOKEN', '')
            if not token:
                print("WARNING: VV_AUTH_TOKEN not found in environment!")
            
            content = content.replace('__VV_AUTH_TOKEN__', token)
            
            encoded_content = content.encode('utf-8')
            self.send_response(200)
            self.send_header("Content-type", "application/javascript")
            self.send_header("Content-Length", str(len(encoded_content)))
            self.end_headers()
            self.wfile.write(encoded_content)
        except Exception as e:
            print(f"Error serving virgin_api.js: {e}")
            self.send_error(500, "Internal Server Error")

print(f"Starting Virgin Voyages Planner on {ADDRESS}:{PORT}...")

# Change directory to where the script is located to ensure index.html is found
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Load .env
load_env()

with socketserver.ThreadingTCPServer((ADDRESS, PORT), CustomHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")