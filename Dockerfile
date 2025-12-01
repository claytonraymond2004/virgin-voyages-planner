# Use a lightweight Python base image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Build argument for offline mode (default: false)
ARG OFFLINE_MODE=false

# Copy the server script and the web application files into the container
COPY server.py .
COPY index.html .
COPY styles.css .
COPY app_logo.svg .
COPY virgin_api.js .
COPY virgin_placeholder.png .
COPY app_icon.svg .
COPY icon-192.png .
COPY icon-512.png .
COPY manifest.json .
COPY sw.js .
COPY modules/ ./modules/
COPY example_data/ ./example_data/
COPY build_offline.py .

# Build argument for cache busting (default: "v1")
ARG APP_VERSION="v1"

# Cache Busting: Update asset references with version string
RUN sed -i "s|styles.css?v=[^\"]*|styles.css?v=$APP_VERSION|g" index.html && \
    sed -i "s|styles.css\"|styles.css?v=$APP_VERSION\"|g" index.html && \
    sed -i "s|virgin_api.js\"|virgin_api.js?v=$APP_VERSION\"|g" index.html && \
    sed -i "s|modules/main.js\"|modules/main.js?v=$APP_VERSION\"|g" index.html && \
    sed -i "s|from '\./\([^']*\)\.js'|from './\1.js?v=$APP_VERSION'|g" modules/*.js && \
    sed -i 's|from "\./\([^"]*\)\.js"|from "./\1.js?v='$APP_VERSION'"|g' modules/*.js && \
    sed -i "s|const CACHE_NAME = '[^']*'|const CACHE_NAME = 'vv-planner-$APP_VERSION'|g" sw.js

# If OFFLINE_MODE is true, run the build_offline.py script
RUN if [ "$OFFLINE_MODE" = "true" ]; then python build_offline.py; fi

# Remove the build script to keep the image clean
RUN rm build_offline.py

# Expose port 8000 to the outside world
EXPOSE 8000

# Command to run the server
CMD ["python", "server.py"]