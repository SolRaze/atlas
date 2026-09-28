#!/bin/sh
# Build the page from /atlas and put it where nginx serves from.
set -e
python3 /atlas/bin/atlas-build
cp /atlas/build/index.html /usr/share/nginx/html/index.html
cp /atlas/assets/* /usr/share/nginx/html/
