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
 * Carnforth Accessible Name Tester - Background Script
 * 
 * This script runs in the background and handles communication between the DevTools panel
 * and the content script that runs on the page being tested.
 */

// When the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("Carnforth Accessible Name Tester installed");
});

// Handle messages from the DevTools panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "runTest") {
    console.log("Received request to run accessibility test");

    // Get the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ error: "No active tab found" });
        return;
      }

      const activeTab = tabs[0];

      // First ensure any existing highlights are removed
      try {
        chrome.tabs.sendMessage(
          activeTab.id,
          { action: "removeHighlight" },
          () => {
            // If there's an error (like the content script isn't loaded yet), just continue
            if (chrome.runtime.lastError) {
              console.log("No content script yet to remove highlights, continuing with test");
            }
          }
        );
      } catch (e) {
        console.log("Error removing highlights before test:", e);
      }

      // Execute the content script on the active tab
      chrome.scripting.executeScript(
        {
          target: { tabId: activeTab.id },
          files: ["js/content.js"]
        },
        () => {
          // After loading the content script, send a message to it to run the test
          chrome.tabs.sendMessage(
            activeTab.id,
            { action: "runAccessibilityTest" },
            (results) => {
              if (chrome.runtime.lastError) {
                console.error("Error running test:", chrome.runtime.lastError);
                sendResponse({ error: "Error running test: " + chrome.runtime.lastError.message });
                return;
              }

              // Forward the results back to the DevTools panel
              sendResponse(results);
            }
          );
        }
      );
    });

    // Keep the message channel open for the async response
    return true;
  }
  
  if (message.action === "highlightElement") {
    // When the user selects an issue in the DevTools panel, highlight the element on the page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;

      const activeTab = tabs[0];

      // Improve logging to debug scrolling issues
      console.log("BACKGROUND: Sending highlightElement message with scrollIntoView:",
                  message.scrollIntoView === true ? "TRUE" :
                  message.scrollIntoView === false ? "FALSE" :
                  "UNDEFINED, defaulting to FALSE");

      // Convert undefined to explicit false, and ensure boolean values are passed correctly
      const shouldScroll = message.scrollIntoView === true;

      chrome.tabs.sendMessage(
        activeTab.id,
        {
          action: "highlightElement",
          selector: message.selector,
          scrollIntoView: shouldScroll,
          additionalData: message.additionalData
        }
      );
    });
  }

  if (message.action === "removeHighlight") {
    // When the user deselects an issue, remove the highlight from the page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;

      const activeTab = tabs[0];
      chrome.tabs.sendMessage(
        activeTab.id,
        { action: "removeHighlight" }
      );
    });
  }

  if (message.action === "getDebugInfo") {
    // Request debug information about an element
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;

      const activeTab = tabs[0];
      chrome.tabs.sendMessage(
        activeTab.id,
        {
          action: "getDebugInfo",
          selector: message.selector
        }
      );
    });
  }

  if (message.action === "debugInfoResponse") {
    // Forward debug info from content script to the panel
    chrome.runtime.sendMessage({
      action: "debugInfo",
      debugData: message.debugData
    });
  }
});

// Connection from the devtools panel
chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === "carnforthPanel") {
    // When the DevTools panel connects
    port.onMessage.addListener(function(message) {
      if (message.action === "runTest") {
        // Get the active tab and run the test
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length === 0) {
            port.postMessage({ error: "No active tab found" });
            return;
          }

          const activeTab = tabs[0];

          // First ensure any existing highlights are removed
          try {
            chrome.tabs.sendMessage(
              activeTab.id,
              { action: "removeHighlight" },
              () => {
                // If there's an error (like the content script isn't loaded yet), just continue
                if (chrome.runtime.lastError) {
                  console.log("No content script yet to remove highlights, continuing with test");
                }
              }
            );
          } catch (e) {
            console.log("Error removing highlights before test:", e);
          }

          // Execute the content script on the active tab
          chrome.scripting.executeScript(
            {
              target: { tabId: activeTab.id },
              files: ["js/content.js"]
            },
            () => {
              if (chrome.runtime.lastError) {
                console.error("Error executing script:", chrome.runtime.lastError);
                port.postMessage({
                  action: "testResults",
                  results: { error: "Error executing script: " + chrome.runtime.lastError.message }
                });
                return;
              }

              // After loading the content script, send a message to it to run the test
              chrome.tabs.sendMessage(
                activeTab.id,
                { action: "runAccessibilityTest" },
                (results) => {
                  if (chrome.runtime.lastError) {
                    console.error("Error running test:", chrome.runtime.lastError);
                    port.postMessage({
                      action: "testResults",
                      results: { error: "Error running test: " + chrome.runtime.lastError.message }
                    });
                    return;
                  }

                  // Forward the results back to the DevTools panel
                  port.postMessage({ action: "testResults", results: results });
                }
              );
            }
          );
        });
      }
    });
  }
});