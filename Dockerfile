# Use a lightweight Python base image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the server script and the web application files into the container
COPY server.py .
COPY index.html .
COPY styles.css .
COPY script.js .

# Expose port 8000 to the outside world
EXPOSE 8000

# Command to run the server
CMD ["python", "server.py"]