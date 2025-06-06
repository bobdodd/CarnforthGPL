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

// Safely access the devtools API
let inspectedTabId = null;
try {
  if (window.chrome && chrome.devtools && chrome.devtools.inspectedWindow) {
    inspectedTabId = chrome.devtools.inspectedWindow.tabId;
  }
} catch (e) {
  console.error("Error accessing devtools API:", e);
}

// Connect to the background script - only with name, no tabId
const port = chrome.runtime.connect({ 
  name: "carnforthPanel"
});

// If we have a tab ID, send it separately after connection
if (inspectedTabId) {
  console.log("Have inspected tab ID:", inspectedTabId);
  setTimeout(() => {
    try {
      port.postMessage({ 
        action: "setTabId", 
        tabId: inspectedTabId 
      });
    } catch (e) {
      console.error("Error sending tabId:", e);
    }
  }, 500); // Increased delay for stability
}

// DOM elements
const runTestBtn = document.getElementById('run-test-btn');
const statusEl = document.getElementById('status');
const summarySection = document.getElementById('summary-section');
const totalCountEl = document.getElementById('total-count');
const failCountEl = document.getElementById('fail-count');
const warnCountEl = document.getElementById('warn-count');
const passCountEl = document.getElementById('pass-count');
const resultsLiveRegion = document.getElementById('results-live-region');
const elementsPanelAnnouncement = document.getElementById('elements-panel-announcement');
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
// Note: elementHtmlEl will be replaced by a div during operation
let elementHtmlEl = document.getElementById('element-html');
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
  // Handle both click and keyboard events for the Run Test button
  runTestBtn.addEventListener('click', runTest);
  runTestBtn.addEventListener('keydown', (event) => {
    // Execute on Enter or Space key press
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      runTest();
    }
  });
  
  closeDetailsBtn.addEventListener('click', hideDetailsPanel);
  inspectElementBtn.addEventListener('click', inspectElementInDevTools);

  // Set up resize handle functionality
  setupResizeHandling();

  // Tab switching functionality following WAI-ARIA Authoring Practices
  tabButtons.forEach(button => {
    // Handle click events for mouse users
    button.addEventListener('click', (event) => {
      activateTab(button);
    });
    
    // Handle keyboard events for keyboard navigation
    button.addEventListener('keydown', (event) => {
      const tabList = button.parentElement;
      const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
      const index = tabs.indexOf(button);
      
      // Determine which key was pressed and handle accordingly
      switch (event.key) {
        case 'ArrowLeft':
          // Move to the previous tab, or wrap to the end
          event.preventDefault();
          const prevIndex = index === 0 ? tabs.length - 1 : index - 1;
          tabs[prevIndex].focus();
          activateTab(tabs[prevIndex]);
          break;
        case 'ArrowRight':
          // Move to the next tab, or wrap to the beginning
          event.preventDefault();
          const nextIndex = index === tabs.length - 1 ? 0 : index + 1;
          tabs[nextIndex].focus();
          activateTab(tabs[nextIndex]);
          break;
        case 'Home':
          // Move to the first tab
          event.preventDefault();
          tabs[0].focus();
          activateTab(tabs[0]);
          break;
        case 'End':
          // Move to the last tab
          event.preventDefault();
          tabs[tabs.length - 1].focus();
          activateTab(tabs[tabs.length - 1]);
          break;
        case 'Enter':
        case ' ':
          // Activate the current tab with Enter or Space
          event.preventDefault();
          activateTab(button);
          break;
      }
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
    
    // Handle navigation events
    if (message.action === "pageNavigated") {
      // Reset the panel when the page navigates
      handlePageNavigation(message.url);
    }
  });

  // Also listen for runtime messages for debug info
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "debugInfo") {
      updateDebugInfo(message.debugData);
    }
    return true;
  });
  
  // Expose the onPageNavigated function for the devtools page
  window.onPageNavigated = (url) => {
    handlePageNavigation(url);
  };
  
  // Function to store the tab ID received from devtools page
  window.setInspectedTabId = (tabId) => {
    // Store the tab ID locally
    inspectedTabId = tabId;
    
    // Send a message to the background script with the tab ID
    try {
      port.postMessage({ action: "setTabId", tabId: tabId });
    } catch (e) {
      console.error("Error in setInspectedTabId:", e);
    }
  };
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
  console.log("Run test button clicked");
  
  // Update UI state for the div-based button
  runTestBtn.setAttribute('aria-disabled', 'true');
  runTestBtn.classList.add('disabled');
  // Set tabindex to -1 to prevent focus while disabled
  runTestBtn.setAttribute('tabindex', '-1');
  statusEl.textContent = "Running test...";

  // Clear previous results
  failuresList.innerHTML = '<li class="empty-message">Analyzing page...</li>';
  warningsList.innerHTML = '<li class="empty-message">Analyzing page...</li>';
  allList.innerHTML = '<li class="empty-message">Analyzing page...</li>';

  // Clear any selected element and remove any existing highlight
  selectedElement = null;
  currentlyHighlighted = null;

  // Hide details panel if it was open
  hideDetailsPanel();

  // Clean up any existing highlights before starting new test
  removeHighlightFromPage();

  // Wait briefly to ensure cleanup has time to complete
  setTimeout(() => {
    try {
      // Request test to be run - include tabId if we have it stored
      const message = { action: "runTest" };
      
      // Use the stored inspectedTabId if available
      if (inspectedTabId) {
        message.tabId = inspectedTabId;
      }
      
      console.log("Sending runTest message:", message);
      port.postMessage(message);
    } catch (error) {
      console.error("Error sending runTest message:", error);
      // Handle error, display a message to the user
      statusEl.textContent = "Error starting test: " + error.message;
      
      // Re-enable the run button
      runTestBtn.removeAttribute('aria-disabled');
      runTestBtn.classList.remove('disabled');
      runTestBtn.setAttribute('tabindex', '0');
    }
  }, 100);
}

// Process the test results
function processTestResults(results) {
  // Reset UI state for the div-based button
  runTestBtn.removeAttribute('aria-disabled');
  runTestBtn.classList.remove('disabled');
  // Restore focus ability
  runTestBtn.setAttribute('tabindex', '0');
  
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
  let statusMessage = "";
  
  if (totalIssues > 0) {
    statusMessage = `Found ${totalIssues} accessibility issues (${counts.fail} errors, ${counts.warn} warnings)`;
    statusEl.textContent = statusMessage;
    statusEl.style.color = counts.fail > 0 ? "var(--fail-color)" : "var(--warn-color)";
  } else {
    statusMessage = "No accessibility issues found";
    statusEl.textContent = statusMessage;
    statusEl.style.color = "var(--pass-color)";
  }
  
  // Clear and update the ARIA live region to ensure it's announced
  // First empty it to ensure change is detected
  resultsLiveRegion.textContent = '';
  
  // Force browser to process the empty state
  setTimeout(() => {
    // Use a clear, concise message that prioritizes the most important information first
    resultsLiveRegion.textContent = `Test complete. ${counts.fail} failures, ${counts.warn} warnings found out of ${counts.total} elements tested.`;
  }, 50);
  
  // Populate result lists
  populateResultsList(failuresList, results.elements.filter(el => el.result === "fail"));
  populateResultsList(warningsList, results.elements.filter(el => el.result === "warn"));
  populateResultsList(allList, results.elements);
  
  // Switch to the failures tab if there are any failures
  if (counts.fail > 0) {
    // Use our new activateTab function
    const failuresTab = document.getElementById('tab-failures');
    activateTab(failuresTab);
  }
}

// Populate a results list with elements
function populateResultsList(listElement, elements) {
  if (elements.length === 0) {
    listElement.innerHTML = '<li class="empty-message">No issues found</li>';
    return;
  }
  
  listElement.innerHTML = '';
  
  elements.forEach((element, index) => {
    const item = document.createElement('li');
    item.className = `issue-item ${element.result}`;
    item.dataset.index = index;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0'); // Make it keyboard focusable
    
    const statusClass = element.result === "fail" ? "status-fail" : 
                        element.result === "warn" ? "status-warn" : "status-pass";
    
    // Generate unique IDs for various elements
    const issueTypeId = `issue-type-${element.result}-${index}`;
    const issueTitleId = `issue-title-${element.result}-${index}`;
    const selectorDescId = `selector-desc-${element.result}-${index}`;
    
    // Set a clear accessible name using aria-label
    const accessibleName = `${element.result === "fail" ? "Failure" : element.result === "warn" ? "Warning" : "Pass"}: ${getElementDescription(element).replace(/<[^>]*>/g, '')}. Click to open details`;
    item.setAttribute('aria-label', accessibleName);
    
    // Create an ID for the description section
    const descriptionId = `issue-desc-${element.result}-${index}`;
    const elementSelectorId = `element-selector-${element.result}-${index}`;
    
    // Use aria-describedby to ensure the description is read after the label
    item.setAttribute('aria-describedby', `${descriptionId} ${elementSelectorId}`);
    
    item.innerHTML = `
      <h3 class="issue-title">
        <span class="issue-status ${statusClass}" aria-hidden="true"></span>
        ${getElementDescription(element)}
      </h3>
      <div id="${descriptionId}" class="issue-description">${element.description || 'No description'}</div>
      <div id="${elementSelectorId}" class="issue-element">${element.selector}</div>
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

    // Function to handle selection
    const selectItem = () => {
      selectAndHighlightItem(element, item);
    };
    
    // Add click handler for mouse navigation
    item.addEventListener('click', selectItem);
    
    // Add keyboard support for accessibility
    item.addEventListener('keydown', (event) => {
      // Handle Enter and Space key presses
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectItem();
      }
    });

    // Add focus styling but don't select on focus
    item.addEventListener('focus', () => {
      // Apply focus styling only without triggering selection
      document.querySelectorAll('.issue-item').forEach(el => {
        el.classList.remove('selected');
      });
      item.classList.add('focused');
    });

    // Remove focus styling on blur
    item.addEventListener('blur', () => {
      item.classList.remove('focused');
    });

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

// Store a reference to the element that opened the dialog
let lastFocusedElement = null;

// Store the focusable elements within the dialog
let focusableElements = [];

function showElementDetails(element) {
  // Store the element that was focused before opening the dialog
  lastFocusedElement = document.activeElement;
  
  // Update the selected element
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

  // Display syntax highlighted HTML in the code block
  const syntaxHighlightedHTML = formatHTML(element.outerHTML || 'HTML not available');
  
  // Set content and attributes directly without replacing the element
  elementHtmlEl.innerHTML = syntaxHighlightedHTML;
  elementHtmlEl.setAttribute('aria-label', 'HTML code example, non-interactive');
  elementHtmlEl.setAttribute('aria-hidden', 'true'); // Hide from screen readers since it's just example code

  // Show the panel
  detailsPanel.classList.remove('hidden');
  detailsPanel.classList.add('visible');
  
  // Find all focusable elements within the dialog
  focusableElements = Array.from(detailsPanel.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  ));
  
  // Set focus on the close button
  setTimeout(() => {
    closeDetailsBtn.focus();
  }, 50);
  
  // Add keyboard event listener for trapping focus
  document.addEventListener('keydown', trapFocus);
}

// Trap focus within the modal dialog
function trapFocus(event) {
  // Check for the Escape key to close the dialog
  if (event.key === 'Escape') {
    event.preventDefault();
    hideDetailsPanel();
    return;
  }
  
  // Only trap focus if the dialog is visible
  if (!detailsPanel.classList.contains('visible')) {
    return;
  }
  
  // Check for Tab key to manage focus
  if (event.key === 'Tab') {
    // If there are no focusable elements, prevent tabbing
    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }
    
    // Get the first and last focusable elements
    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];
    
    // If shift+tab and focus is on first element, move to last element
    if (event.shiftKey && document.activeElement === firstFocusableElement) {
      event.preventDefault();
      lastFocusableElement.focus();
    } 
    // If tab and focus is on last element, move to first element
    else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
      event.preventDefault();
      firstFocusableElement.focus();
    }
  }
}

// Hide the details panel
function hideDetailsPanel() {
  // Remove the dialog from view
  detailsPanel.classList.remove('visible');
  detailsPanel.classList.add('hidden');
  
  // Remove the keyboard event listener
  document.removeEventListener('keydown', trapFocus);
  
  // Clear the selected element
  selectedElement = null;
  
  // Restore focus to the element that opened the dialog
  if (lastFocusedElement) {
    lastFocusedElement.focus();
  }
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
  try {
    chrome.runtime.sendMessage({
      action: "highlightElement",
      selector: selector,
      scrollIntoView: false,  // Always false since scrolling is handled directly in panel.js
      additionalData: additionalData
    });
  } catch (e) {
    console.error("Error sending highlight message:", e);
  }

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
  try {
    chrome.runtime.sendMessage({
      action: "removeHighlight"
    });
  } catch (e) {
    console.error("Error sending removeHighlight message:", e);
  }
}

// Inspect the element in the Elements panel
function inspectElementInDevTools() {
  if (!selectedElement) return;
  
  // Announce to screen readers that we're moving to the Elements panel
  elementsPanelAnnouncement.textContent = "Moving to Elements panel to inspect the selected element";
  
  // Use the inspect function to inspect the element
  try {
    chrome.devtools.inspectedWindow.eval(
      `inspect(document.querySelector('${selectedElement.selector.replace(/'/g, "\\'")}'))`,
      function(result, isException) {
        if (isException) {
          console.error('Error inspecting element:', isException);
          elementsPanelAnnouncement.textContent = "Error: Could not inspect element in Elements panel";
        } else {
          // Keep announcement visible until user takes action
          // No timeout - content will remain until next user interaction
        }
      }
    );
  } catch (e) {
    console.error("Error in inspectElementInDevTools:", e);
    elementsPanelAnnouncement.textContent = "Error: Could not access DevTools API";
  }
}

/**
 * Handle page navigation events - reset the panel UI
 * @param {string} url - The URL of the new page
 */
function handlePageNavigation(url) {
  console.log("Page navigated to:", url);
  
  // Update the tab ID if available from devtools
  try {
    if (chrome.devtools && chrome.devtools.inspectedWindow) {
      inspectedTabId = chrome.devtools.inspectedWindow.tabId;
      // Notify the background script of the current tab
      port.postMessage({ 
        action: "setTabId", 
        tabId: inspectedTabId 
      });
    }
  } catch (e) {
    console.error("Error in handlePageNavigation:", e);
  }
  
  // Reset UI state
  statusEl.textContent = "Page changed - Run test to check accessibility";
  statusEl.style.color = ""; // Reset to default color
  
  // Clear results and summary
  summarySection.classList.add('hidden');
  
  // Reset results lists
  failuresList.innerHTML = '<li class="empty-message">Run the test to see results</li>';
  warningsList.innerHTML = '<li class="empty-message">Run the test to see results</li>';
  allList.innerHTML = '<li class="empty-message">Run the test to see results</li>';
  
  // Clear any selected element and details panel
  selectedElement = null;
  hideDetailsPanel();
  
  // Reset the test results
  testResults = null;
  
  // Reset the live region announcement but add a message for screen readers
  resultsLiveRegion.textContent = ''; 
  setTimeout(() => {
    resultsLiveRegion.textContent = 'Page has changed. Please run the test again to check accessibility.';
  }, 50);
  
  // Remove any highlight from the previous page
  removeHighlightFromPage();
}

// Helper function to truncate strings
function truncateString(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

// Function to format HTML with syntax highlighting
function formatHTML(html) {
  if (!html) return '';
  
  // Replace special characters
  let formatted = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  
  // Highlight tags
  formatted = formatted.replace(/&lt;(\/?[a-zA-Z][a-zA-Z0-9:._-]*)(\s[^&]*)?&gt;/g, 
    '<span style="color:#0000cc;">&lt;$1</span><span style="color:#8B2252;">$2</span><span style="color:#0000cc;">&gt;</span>');
  
  // Highlight attributes
  formatted = formatted.replace(/(\s+)([a-zA-Z][a-zA-Z0-9:._-]*)(=)(&quot;[^&]*&quot;)/g, 
    '$1<span style="color:#994500;">$2</span><span style="color:#000000;">$3</span><span style="color:#1A1AA6;">$4</span>');
  
  return formatted;
}

// Function to activate a tab and show its panel
function activateTab(tabElement) {
  // Get all tabs and panels
  const tabs = Array.from(tabElement.parentElement.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
  
  // Deactivate all tabs and hide all panels
  tabs.forEach(tab => {
    tab.setAttribute('aria-selected', 'false');
    tab.classList.remove('active');
  });
  
  panels.forEach(panel => {
    panel.classList.remove('active');
    panel.hidden = true;
  });
  
  // Activate selected tab and show its panel
  tabElement.setAttribute('aria-selected', 'true');
  tabElement.classList.add('active');
  
  const tabId = tabElement.dataset.tab;
  const panel = document.getElementById(`${tabId}-panel`);
  panel.classList.add('active');
  panel.hidden = false;
  
  // Close the details panel if it's open
  hideDetailsPanel();
  
  // Also remove any highlight on the page
  removeHighlightFromPage();
}

// Initialize the panel
init();