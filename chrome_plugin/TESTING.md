# Testing the Carnforth Accessible Name Tester Extension

This document provides instructions for testing the Chrome extension.

## Installation for Testing

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" by toggling the switch in the top-right corner
3. Click "Load unpacked" and select the `chrome_plugin` directory
4. The extension will be installed and a new "Accessible Names" panel will be available in Chrome DevTools

## Testing Procedure

1. Open a web page to test (you can use one of the HTML test files in the `html` directory)
2. Open Chrome DevTools (F12 or Right-click > Inspect)
3. Navigate to the "Accessible Names" panel (you might need to click the >> icon to see additional panels)
4. Click "Run Test" to analyze the page

## Expected Results

When testing on one of the HTML test files (e.g., `accessible_names-buttons-0.html`), you should see:

1. A summary showing the total number of elements tested and counts of passing, failing, and warning elements
2. The failures tab should be automatically selected if issues are found
3. Each issue should show:
   - The element type (e.g., "Button", "Div with role=button")
   - A description of the issue (e.g., "Button is missing an accessible name")
   - The element's selector

4. Clicking on an issue should:
   - Highlight the element on the page
   - Show detailed information in the side panel
   - Allow inspection of the element in the Elements panel

## Test Cases

You can use the HTML test files in the `html` directory as test cases:

- `accessible_names-buttons-0.html` - Tests buttons with and without accessible names
- `accessible_names-images-0.html` - Tests images with and without alt text
- `accessible_names-links-0.html` - Tests links with and without descriptive text
- `accessible_names-forms-0.html` - Tests form elements with and without labels
- `accessible_names-aria-roles-0.html` - Tests elements with ARIA roles

## Troubleshooting

If the extension doesn't appear in DevTools:
1. Make sure the extension is enabled in `chrome://extensions/`
2. Try restarting Chrome
3. Check the console in DevTools for any errors
4. If using Chrome in incognito mode, ensure the extension is allowed in incognito

If the "Run Test" button doesn't work:
1. Check the console in DevTools for any JavaScript errors
2. Make sure the content script is allowed to run on the current page

## Reporting Issues

If you encounter any issues, please report them on the GitHub repository with:
1. A detailed description of the issue
2. Steps to reproduce
3. Expected vs. actual behavior
4. Screenshots if applicable
5. Browser and extension version information