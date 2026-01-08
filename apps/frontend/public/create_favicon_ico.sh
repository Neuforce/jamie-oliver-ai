#!/bin/bash
# Simple script to note that favicon.ico can be generated from favicon.svg
# For now, we'll use the SVG which modern browsers support
echo "Favicon SVG created. Modern browsers will use /favicon.svg"
echo "For .ico format, you can convert favicon.svg using online tools or ImageMagick:"
echo "  convert -background none -density 256x256 -resize 256x256 favicon.svg favicon.ico"
