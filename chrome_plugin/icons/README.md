# Icon Generation

This directory contains the SVG source for the extension icon. For a complete extension, you'll need to generate PNG versions at the following sizes:

- icon16.png (16x16 pixels)
- icon32.png (32x32 pixels)
- icon48.png (48x48 pixels)
- icon128.png (128x128 pixels)

You can generate these using the provided `generate_icons.sh` script if you have ImageMagick or rsvg-convert installed, or by using a graphics editing tool to convert the SVG to the required PNG sizes.

For development purposes, the extension will work without these PNG files, but Chrome will display placeholders instead of the actual icon.