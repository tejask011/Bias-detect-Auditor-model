# Use a slim version of python for smaller image size
FROM python:3.10-slim

WORKDIR /app
COPY . .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Run gunicorn with the PORT environment variable and increased timeout for large files
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 app:app