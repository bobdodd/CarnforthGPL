# Carnforth Accessible Name Tester

A Chrome DevTools extension for testing accessible name computation on web pages, inspired by the Carnforth project.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

## Features

- Tests elements on the page for proper accessible names according to WCAG guidelines
- Displays results in a DevTools panel with counts of passes, failures, and warnings
- Provides detailed information about each issue found
- Allows navigation to and highlighting of elements with issues
- Links to the Elements panel for inspecting and fixing issues

## Installation

### From source (development)

1. Clone this repository:
   ```
   git clone https://github.com/bobdodd/CarnforthGPL.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" by toggling the switch in the top-right corner

4. Click "Load unpacked" and select the directory containing the extension

5. The extension will be installed and a new "Accessible Names" panel will be available in Chrome DevTools (F12)

## Usage

1. Open Chrome DevTools (F12) on any web page
2. Navigate to the "Accessible Names" panel
3. Click "Run Test" to analyze the page for accessible name issues
4. View results organized by failures, warnings, and all elements
5. Click on any issue to see details and highlight the element on the page
6. Use "Inspect in Elements Panel" to jump directly to the element in the Elements panel

## Technical Details

This extension tests web pages for WCAG 4.1.2 (Name, Role, Value) compliance, specifically focusing on the accessible name computation algorithm. It checks:

- Images for appropriate alt text
- Form controls for labels
- Buttons for descriptive text
- Links for meaningful content
- Landmarks for names when needed
- ARIA widgets for proper naming
- iframes for title attributes
- Audio/video elements for accessible names

## Credits

Based on the accessibility testing logic from the Carnforth project.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE.txt](../LICENSE.txt) file for details.

### GPL License

The GNU General Public License is a free, copyleft license for software and other kinds of works.

The licenses for most software and other practical works are designed to take away your freedom to share and change the works. By contrast, the GNU General Public License is intended to guarantee your freedom to share and change all versions of a program--to make sure it remains free software for all its users.

When we speak of free software, we are referring to freedom, not price. This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.