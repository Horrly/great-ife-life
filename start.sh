#!/usr/bin/env bash
# Render start: migrate, then serve.
set -o errexit
cd backend
python manage.py migrate --noinput
exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --workers 2 --threads 4 --timeout 60 --access-logfile -
