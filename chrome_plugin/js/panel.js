/* 
 * JavaScript/CSS GPL License Header
 * --------------------------------
 * Carnforth Accessible Name Tester
 * Copyright (C) 2025 Bob Dodd
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Carnforth Accessible Name Tester - Panel Script
 * 
 * This script handles the DevTools panel UI and functionality.
 */

// Connect to the background script
const port = chrome.runtime.connect({ name: "carnforthPanel" });

// DOM elements
const runTestBtn = document.getElementById('run-test-btn');
const statusEl = document.getElementById('status');
const summarySection = document.getElementById('summary-section');
const totalCountEl = document.getElementById('total-count');
const failCountEl = document.getElementById('fail-count');
const warnCountEl = document.getElementById('warn-count');
const passCountEl = document.getElementById('pass-count');
const failuresList = document.getElementById('failures-list');
const warningsList = document.getElementById('warnings-list');
const allList = document.getElementById('all-list');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const detailsPanel = document.getElementById('details-panel');
const resizeHandle = document.getElementById('resize-handle');
const closeDetailsBtn = document.getElementById('close-details');
const elementInfoEl = document.getElementById('element-info');
const accessibleNameEl = document.getElementById('accessible-name');
const issueDetailsEl = document.getElementById('issue-details');
const elementHtmlEl = document.getElementById('element-html');
const inspectElementBtn = document.getElementById('inspect-element');

// Store the test results for reference
let testResults = null;
let selectedElement = null;

// Variables for resizing functionality
let isResizing = false;
let startX, startWidth;

// Initialize the panel
function init() {
  // Set up event listeners
  runTestBtn.addEventListener('click', runTest);
  closeDetailsBtn.addEventListener('click', hideDetailsPanel);
  inspectElementBtn.addEventListener('click', inspectElementInDevTools);

  // Set up resize handle functionality
  setupResizeHandling();

  // Tab switching functionality
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons and content
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      const tabId = button.dataset.tab;
      document.getElementById(`${tabId}-tab`).classList.add('active');

      // Close the details panel if it's open
      hideDetailsPanel();

      // Also remove any highlight on the page
      removeHighlightFromPage();
    });
  });

  // Listen for messages from the background script
  port.onMessage.addListener(message => {
    if (message.action === "testResults") {
      processTestResults(message.results);
    }

    if (message.action === "debugInfo") {
      updateDebugInfo(message.debugData);
    }
  });

  // Also listen for runtime messages for debug info
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "debugInfo") {
      updateDebugInfo(message.debugData);
    }
    return true;
  });
}

// Update debug information in the panel - no longer needed
function updateDebugInfo(debugData) {
  // Function kept as a placeholder since it's referenced in message listeners
  // but functionality has been removed as requested
  return;
}

// Set up resize functionality for the details panel
function setupResizeHandling() {
  // Make the resize handle keyboard accessible
  resizeHandle.tabIndex = 0;

  // Mouse events for resizing
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(document.defaultView.getComputedStyle(detailsPanel).width, 10);

    // Add resizing class for visual feedback
    resizeHandle.classList.add('resizing');

    // Prevent text selection during resize
    document.body.style.userSelect = 'none';

    // Record initial width for calculations
    const initialWidth = detailsPanel.offsetWidth;

    e.preventDefault();
  });

  // Handle mouse movement for resize
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    // Calculate new width (from right edge)
    const newWidth = startWidth - (e.clientX - startX);

    // Apply min/max constraints
    const minWidth = 250; // Minimum width
    const maxWidth = window.innerWidth * 0.8; // Max width (80% of viewport)

    if (newWidth >= minWidth && newWidth <= maxWidth) {
      detailsPanel.style.width = `${newWidth}px`;
    }
  });

  // Handle mouseup to stop resizing
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('resizing');
      document.body.style.userSelect = '';
    }
  });

  // Keyboard accessibility for resizing
  resizeHandle.addEventListener('keydown', (e) => {
    // Use arrow keys for resizing
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();

      const currentWidth = parseInt(document.defaultView.getComputedStyle(detailsPanel).width, 10);
      const step = 20; // Resize by 20px per key press

      if (e.key === 'ArrowLeft') {
        // Increase panel width (move handle left)
        const newWidth = currentWidth + step;
        if (newWidth <= window.innerWidth * 0.8) {
          detailsPanel.style.width = `${newWidth}px`;
        }
      } else if (e.key === 'ArrowRight') {
        // Decrease panel width (move handle right)
        const newWidth = currentWidth - step;
        if (newWidth >= 250) {
          detailsPanel.style.width = `${newWidth}px`;
        }
      }
    }
  });
}

// Run the accessibility test
function runTest() {
  // Update UI state
  runTestBtn.disabled = true;
  statusEl.textContent = "Running test...";

  // Clear previous results
  failuresList.innerHTML = '<div class="empty-message">Analyzing page...</div>';
  warningsList.innerHTML = '<div class="empty-message">Analyzing page...</div>';
  allList.innerHTML = '<div class="empty-message">Analyzing page...</div>';

  // Clear any selected element and remove any existing highlight
  selectedElement = null;
  currentlyHighlighted = null;

  // Hide details panel if it was open
  hideDetailsPanel();

  // Clean up any existing highlights before starting new test
  removeHighlightFromPage();

  // Wait briefly to ensure cleanup has time to complete
  setTimeout(() => {
    // Request test to be run
    port.postMessage({ action: "runTest" });
  }, 100);
}

// Process the test results
function processTestResults(results) {
  // Reset UI state
  runTestBtn.disabled = false;
  
  if (!results || results.error) {
    statusEl.textContent = "Error: " + (results?.error || "Unknown error");
    return;
  }
  
  // Store results for reference
  testResults = results;
  
  // Count issues by type
  const counts = {
    total: results.elements.length,
    fail: results.elements.filter(el => el.result === "fail").length,
    warn: results.elements.filter(el => el.result === "warn").length,
    pass: results.elements.filter(el => el.result === "pass").length
  };
  
  // Update summary stats
  totalCountEl.textContent = counts.total;
  failCountEl.textContent = counts.fail;
  warnCountEl.textContent = counts.warn;
  passCountEl.textContent = counts.pass;
  
  // Show summary section
  summarySection.classList.remove('hidden');
  
  // Update status
  const totalIssues = counts.fail + counts.warn;
  if (totalIssues > 0) {
    statusEl.textContent = `Found ${totalIssues} accessibility issues (${counts.fail} errors, ${counts.warn} warnings)`;
    statusEl.style.color = counts.fail > 0 ? "var(--fail-color)" : "var(--warn-color)";
  } else {
    statusEl.textContent = "No accessibility issues found";
    statusEl.style.color = "var(--pass-color)";
  }
  
  // Populate result lists
  populateResultsList(failuresList, results.elements.filter(el => el.result === "fail"));
  populateResultsList(warningsList, results.elements.filter(el => el.result === "warn"));
  populateResultsList(allList, results.elements);
  
  // Switch to the failures tab if there are any failures
  if (counts.fail > 0) {
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    document.querySelector('[data-tab="failures"]').classList.add('active');
    document.getElementById('failures-tab').classList.add('active');
  }
}

// Populate a results list with elements
function populateResultsList(listElement, elements) {
  if (elements.length === 0) {
    listElement.innerHTML = '<div class="empty-message">No issues found</div>';
    return;
  }
  
  listElement.innerHTML = '';
  
  elements.forEach((element, index) => {
    const item = document.createElement('div');
    item.className = `issue-item ${element.result}`;
    item.dataset.index = index;
    
    const statusClass = element.result === "fail" ? "status-fail" : 
                        element.result === "warn" ? "status-warn" : "status-pass";
    
    item.innerHTML = `
      <div class="issue-title">
        <span class="issue-status ${statusClass}"></span>
        ${getElementDescription(element)}
      </div>
      <div class="issue-description">${element.description || 'No description'}</div>
      <div class="issue-element">${element.selector}</div>
    `;
    
    // Helper function to select an item and handle all operations in a consistent order
    function selectAndHighlightItem(elementData, itemElement) {
      console.log("Selection started:", elementData);

      // 1. First clear any existing selection
      document.querySelectorAll('.issue-item').forEach(el => {
        el.classList.remove('selected');
      });

      // 2. Set this item as selected
      itemElement.classList.add('selected');

      // 3. Show details in the side panel
      showElementDetails(elementData);

      // 4. First remove any existing highlight
      removeHighlightFromPage();

      // 5. DIRECT SCROLLING APPROACH: Directly scroll the element into view using eval
      // This bypasses all the message passing that might be causing issues
      if (elementData.selector) {
        console.log("Using direct DOM access to find and scroll to element");
        chrome.devtools.inspectedWindow.eval(
          `
          (function() {
            try {
              const element = document.querySelector('${elementData.selector.replace(/'/g, "\\'")}');
              if (element) {
                console.log("Found element to scroll to:", element);
                element.scrollIntoView({behavior: 'auto', block: 'center'});
                return "Element found and scrolled into view";
              } else {
                return "Element not found with selector: ${elementData.selector}";
              }
            } catch(e) {
              return "Error scrolling: " + e.message;
            }
          })()
          `,
          function(result, isException) {
            console.log("Direct scroll result:", result, isException ? "Exception!" : "");

            // After scrolling is done, send the highlight message
            setTimeout(() => {
              highlightElementOnPage(elementData, false);
            }, 300);
          }
        );
      } else {
        // Just highlight if no selector available
        highlightElementOnPage(elementData, false);
      }
    }

    // Make issue item focusable
    item.tabIndex = 0;

    // Add click handler for mouse navigation
    item.addEventListener('click', () => {
      selectAndHighlightItem(element, item);
    });

    // Add focus handler for keyboard navigation
    item.addEventListener('focus', () => {
      selectAndHighlightItem(element, item);
    });

    // Simplify blur handler - let click/focus handle state
    item.addEventListener('blur', () => {});

    listElement.appendChild(item);
  });
}

// Get a human-readable description of an element
function getElementDescription(element) {
  const tag = element.tagName || 'Element';
  const role = element.role ? ` (role="${element.role}")` : '';

  // Check if the description already contains a specific issue type
  if (element.description && (
      element.description.includes("HTML markup") ||
      element.description.includes("Filename as") ||
      element.description.includes("URL as") ||
      element.description.includes("Punctuation-only") ||
      element.description.includes("Whitespace-only") ||
      element.description.includes("Generic") ||
      element.description.includes("Redundant") ||
      element.description.includes("Broken aria-labelledby") ||
      element.description.includes("Icon-only") ||
      element.description === "Punctuation-only accessible name" ||
      element.description === "Dialog missing accessible name" ||
      element.description === "Dialog has empty accessible name" ||
      element.description === "Dialog has redundant accessible name" ||
      element.description === "Tabpanel references element with empty accessible name" ||
      element.description === "Tabpanel references element with only aria-hidden content" ||
      element.description === "Tabpanel references element with no accessible name" ||
      element.description.includes("Tabpanel references")
  )) {
    // Extract the issue type for the title
    const issueMatch = element.description.match(/(HTML markup|Filename as|URL as|Punctuation-only|Whitespace-only|Generic|Redundant|Broken aria-labelledby|Icon-only|Punctuation-only accessible name|Dialog missing accessible name|Dialog has empty accessible name|Dialog has redundant accessible name|Tabpanel references element with empty accessible name|Tabpanel references element with only aria-hidden content|Tabpanel references element with no accessible name|Tabpanel references)[^\n]*/);
    const issueType = issueMatch ? issueMatch[0] : "Issue with accessible name";

    return `<span title="${issueType}">${tag}${role}: ${issueType}</span>`;
  } else if (element.accessibleName) {
    return `<span title="${element.accessibleName}">${tag}${role}: "${truncateString(element.accessibleName, 30)}"</span>`;
  } else {
    return `${tag}${role}: Missing accessible name`;
  }
}

// Show the details panel for an element
function showElementDetails(element) {
  selectedElement = element;

  // Populate details
  elementInfoEl.innerHTML = `
    <div><strong>Tag:</strong> ${element.tagName || 'Unknown'}</div>
    ${element.role ? `<div><strong>Role:</strong> ${element.role}</div>` : ''}
    <div><strong>Selector:</strong> ${element.selector}</div>
  `;

  accessibleNameEl.innerHTML = element.accessibleName
    ? `<div class="accessible-name">${element.accessibleName}</div>`
    : '<div class="missing-name">Missing accessible name</div>';

  issueDetailsEl.innerHTML = `
    <div><strong>Result:</strong> <span class="${element.result}-color">${element.result.toUpperCase()}</span></div>
    <div><strong>Description:</strong> ${element.description || 'No description'}</div>
    ${element.details ? `<div><strong>Details:</strong> ${element.details}</div>` : ''}
  `;

  // Debug section removed as requested

  // Set the HTML
  elementHtmlEl.textContent = element.outerHTML || 'HTML not available';

  // Show the panel
  detailsPanel.classList.add('visible');
}

// Hide the details panel
function hideDetailsPanel() {
  detailsPanel.classList.remove('visible');
  selectedElement = null;
}

// Track the currently highlighted element
let currentlyHighlighted = null;
let lastHighlightTime = 0;
let isHighlightInProgress = false;

// Highlight an element on the page
function highlightElementOnPage(element, scrollIntoView = true) {
  // If this is already the highlighted element, don't re-highlight
  if (currentlyHighlighted === element.selector && isHighlightInProgress) {
    return;
  }

  // Prevent rapid highlights - limit to one every 500ms
  const now = Date.now();
  if (now - lastHighlightTime < 500 && isHighlightInProgress) {
    console.log('Highlighting too frequent, delaying this request');
    setTimeout(() => highlightElementOnPage(element, scrollIntoView), 500);
    return;
  }

  // Set flag to prevent multiple highlights
  isHighlightInProgress = true;
  lastHighlightTime = now;

  // Reset tracking and remove existing highlight
  if (currentlyHighlighted !== element.selector) {
    removeHighlightFromPage();
  }

  // Set this as the currently highlighted element
  currentlyHighlighted = element.selector;

  // Ensure we have a valid selector
  const selector = element.selector || '';
  if (!selector) {
    console.warn('Cannot highlight element: No selector provided');
    isHighlightInProgress = false;
    return;
  }

  // For debugging
  console.log('highlightElementOnPage with selector:', selector);

  // For specific websites with complex structure, we might need to add extra information
  const additionalData = {};

  // Check if we're on specific websites that require special handling
  const currentUrl = window.location.href;
  if (currentUrl.includes('bobd69.sg-host.com')) {
    // Special handling for this site
    additionalData.site = 'bobd69';
  }

  // Send the highlight message
  // We now always use scrollIntoView: false because scrolling is handled separately
  chrome.runtime.sendMessage({
    action: "highlightElement",
    selector: selector,
    scrollIntoView: false,  // Always false since scrolling is handled directly in panel.js
    additionalData: additionalData
  });

  // Reset the flag after highlighting completes
  setTimeout(() => {
    isHighlightInProgress = false;
  }, 500);
}

// Remove highlight from the page
function removeHighlightFromPage() {
  // Reset tracking
  currentlyHighlighted = null;

  // Send message to remove highlight
  chrome.runtime.sendMessage({
    action: "removeHighlight"
  });
}

// Inspect the element in the Elements panel
function inspectElementInDevTools() {
  if (!selectedElement) return;
  
  // Use the inspect function to inspect the element
  chrome.devtools.inspectedWindow.eval(
    `inspect(document.querySelector('${selectedElement.selector.replace(/'/g, "\\'")}'))`,
    function(result, isException) {
      if (isException) {
        console.error('Error inspecting element:', isException);
      }
    }
  );
}

// Helper function to truncate strings
function truncateString(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

// Initialize the panel
init();