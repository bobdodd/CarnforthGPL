#!/bin/bash
# Generate PNG icons from SVG

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
SVG_FILE="$SCRIPT_DIR/icon.svg"

if [ ! -f "$SVG_FILE" ]; then
  echo "SVG file not found: $SVG_FILE"
  exit 1
fi

# Generate icons at different sizes
for size in 16 32 48 128; do
  # Using ImageMagick's convert if available
  if command -v convert &> /dev/null; then
    convert -background none -resize ${size}x${size} "$SVG_FILE" "$SCRIPT_DIR/icon${size}.png"
    echo "Generated $SCRIPT_DIR/icon${size}.png"
  # Using rsvg-convert if available
  elif command -v rsvg-convert &> /dev/null; then
    rsvg-convert -w $size -h $size "$SVG_FILE" -o "$SCRIPT_DIR/icon${size}.png"
    echo "Generated $SCRIPT_DIR/icon${size}.png" 
  else
    echo "Error: Neither ImageMagick's convert nor rsvg-convert is installed"
    echo "Please install one of them to generate PNG icons, or create them manually"
    exit 1
  fi
done

echo "Icon generation complete!"