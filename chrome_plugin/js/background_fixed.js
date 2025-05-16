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

// Store an array of DevTools panel connections
let devToolsPanelConnections = [];

// Listen for navigation events and notify connected DevTools panels
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only send notification when the page has finished loading
  // or when the URL changes (for single-page applications)
  if (changeInfo.status === 'complete' || changeInfo.url) {
    // Notify all connected DevTools panels about the navigation
    devToolsPanelConnections.forEach(connection => {
      try {
        // Only notify the panels for the tab that has been updated
        if (connection.tabId === tabId) {
          connection.port.postMessage({
            action: "pageNavigated",
            url: tab.url
          });
        }
      } catch (err) {
        console.error("Error notifying panel of navigation:", err);
      }
    });
  }
});

// Helper function to safely send messages to tabs
// This prevents the "Receiving end does not exist" error
function safelySendMessage(tabId, message, callback) {
  if (!tabId) {
    console.log("Cannot send message: No tab ID provided");
    if (callback) callback(null);
    return;
  }
  
  try {
    chrome.tabs.sendMessage(tabId, message, response => {
      // Check for error and handle it silently if no callback provided
      if (chrome.runtime.lastError) {
        console.log(`Error sending message to tab ${tabId}:`, chrome.runtime.lastError.message);
        if (callback) callback(null);
        return;
      }
      
      // If all went well, call the callback with the response
      if (callback) callback(response);
    });
  } catch (err) {
    console.error("Error in safelySendMessage:", err);
    if (callback) callback(null);
  }
}

// Check if a tab exists before trying to use it
function tabExists(tabId, callback) {
  if (!tabId) {
    console.log("No tab ID to check");
    callback(false);
    return;
  }
  
  try {
    chrome.tabs.get(tabId, tab => {
      if (chrome.runtime.lastError) {
        console.log(`Tab ${tabId} does not exist:`, chrome.runtime.lastError.message);
        callback(false);
        return;
      }
      callback(true, tab);
    });
  } catch (err) {
    console.error("Error in tabExists:", err);
    callback(false);
  }
}

// Helper function to run a test on a specific tab
function runTestOnTab(tabId, responsePort, sendResponseFn) {
  console.log("Running test on tab ID:", tabId);
  
  // First check if the tab exists
  tabExists(tabId, (exists, tab) => {
    if (!exists) {
      // Tab doesn't exist, notify the caller
      const errorMessage = `Tab ${tabId} does not exist or is not accessible`;
      console.error(errorMessage);
      
      if (responsePort) {
        responsePort.postMessage({
          action: "testResults",
          results: { error: errorMessage }
        });
      } else if (sendResponseFn) {
        sendResponseFn({ error: errorMessage });
      }
      return;
    }
    
    // First ensure any existing highlights are removed
    safelySendMessage(
      tabId,
      { action: "removeHighlight" },
      () => {
        console.log("Removed any existing highlights or no content script loaded yet");
      }
    );

    // Execute the content script on the active tab
    try {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          files: ["js/content.js"]
        },
        (results) => {
          if (chrome.runtime.lastError) {
            console.error("Error executing script:", chrome.runtime.lastError);
            
            // Send error response appropriately based on how this function was called
            if (responsePort) {
              responsePort.postMessage({
                action: "testResults",
                results: { error: "Error executing script: " + chrome.runtime.lastError.message }
              });
            } else if (sendResponseFn) {
              sendResponseFn({ error: "Error executing script: " + chrome.runtime.lastError.message });
            }
            return;
          }

          // After loading the content script, send a message to it to run the test
          safelySendMessage(
            tabId,
            { action: "runAccessibilityTest" },
            (results) => {
              if (!results) {
                // Handle the case where no results were returned
                const errorMessage = "Error running test: Content script not available or failed to respond";
                
                if (responsePort) {
                  responsePort.postMessage({
                    action: "testResults",
                    results: { error: errorMessage }
                  });
                } else if (sendResponseFn) {
                  sendResponseFn({ error: errorMessage });
                }
                return;
              }

              // Forward the results back using the appropriate channel
              if (responsePort) {
                responsePort.postMessage({ action: "testResults", results: results });
              } else if (sendResponseFn) {
                sendResponseFn(results);
              }
            }
          );
        }
      );
    } catch (err) {
      console.error("Error in chrome.scripting.executeScript:", err);
      const errorMessage = "Error executing script: " + err.message;
      
      if (responsePort) {
        responsePort.postMessage({
          action: "testResults",
          results: { error: errorMessage }
        });
      } else if (sendResponseFn) {
        sendResponseFn({ error: errorMessage });
      }
    }
  });
}

// Handle messages from the DevTools panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "runTest") {
    console.log("Received request to run accessibility test via chrome.runtime.onMessage");

    // Get the current active tab or use provided tabId
    if (message.tabId) {
      runTestOnTab(message.tabId, null, sendResponse);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
          sendResponse({ error: "No active tab found" });
          return;
        }
        
        const activeTab = tabs[0];
        runTestOnTab(activeTab.id, null, sendResponse);
      });
    }

    // Keep the message channel open for the async response
    return true;
  }
  
  if (message.action === "highlightElement") {
    // When the user selects an issue in the DevTools panel, highlight the element on the page
    if (message.tabId) {
      // Use the specific tabId if provided
      safelySendMessage(
        message.tabId,
        {
          action: "highlightElement",
          selector: message.selector,
          scrollIntoView: !!message.scrollIntoView,
          additionalData: message.additionalData
        },
        null // No callback needed
      );
    } else {
      // Fall back to querying for the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;

        const activeTab = tabs[0];
        safelySendMessage(
          activeTab.id,
          {
            action: "highlightElement",
            selector: message.selector,
            scrollIntoView: !!message.scrollIntoView,
            additionalData: message.additionalData
          },
          null // No callback needed
        );
      });
    }
  }

  if (message.action === "removeHighlight") {
    // When the user deselects an issue, remove the highlight from the page
    if (message.tabId) {
      // Use the specific tabId if provided
      safelySendMessage(
        message.tabId,
        { action: "removeHighlight" },
        null // No callback needed
      );
    } else {
      // Fall back to querying for the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;

        const activeTab = tabs[0];
        safelySendMessage(
          activeTab.id,
          { action: "removeHighlight" },
          null // No callback needed
        );
      });
    }
  }

  if (message.action === "getDebugInfo") {
    // Request debug information about an element
    if (message.tabId) {
      // Use the specific tabId if provided
      safelySendMessage(
        message.tabId,
        {
          action: "getDebugInfo",
          selector: message.selector
        },
        null // No callback needed - response sent via runtime.sendMessage
      );
    } else {
      // Fall back to querying for the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;

        const activeTab = tabs[0];
        safelySendMessage(
          activeTab.id,
          {
            action: "getDebugInfo",
            selector: message.selector
          },
          null // No callback needed - response sent via runtime.sendMessage
        );
      });
    }
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
    // Create a connection object
    let connection = {
      port: port,
      tabId: null // We don't know the tabId yet - it will be set via message
    };
    
    // Add this connection to our list
    devToolsPanelConnections.push(connection);
    
    // Clean up when this DevTools panel instance is closed
    port.onDisconnect.addListener(function() {
      // Remove the disconnected panel from our list
      devToolsPanelConnections = devToolsPanelConnections.filter(conn => conn.port !== port);
    });
    
    // Listen for messages from the DevTools panel
    port.onMessage.addListener(function(message) {
      // Handle setTabId message to store the tab ID with this connection
      if (message.action === "setTabId" && message.tabId) {
        console.log("Setting connection tabId to:", message.tabId);
        connection.tabId = message.tabId;
        
        // Verify the tab exists
        tabExists(message.tabId, (exists) => {
          if (!exists) {
            console.log(`Warning: Tab ${message.tabId} does not exist or is not accessible`);
          }
        });
      }
      
      // Handle runTest message
      if (message.action === "runTest") {
        console.log("Received request to run accessibility test via port.onMessage");
        
        // Either use the provided tabId or the connection's tabId
        const tabId = message.tabId || connection.tabId;
        
        if (tabId) {
          // Use the specific tabId 
          runTestOnTab(tabId, port);
        } else {
          // Fall back to querying for the active tab
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
              port.postMessage({
                action: "testResults",
                results: { error: "No active tab found" }
              });
              return;
            }
            
            // Store this tab ID with the connection for future use
            connection.tabId = tabs[0].id;
            
            runTestOnTab(tabs[0].id, port);
          });
        }
      }
      
      // Handle highlightElement message
      if (message.action === "highlightElement") {
        // Get tabId either from message, connection, or active tab
        const tabId = message.tabId || connection.tabId;
        
        if (tabId) {
          safelySendMessage(
            tabId,
            {
              action: "highlightElement",
              selector: message.selector,
              scrollIntoView: !!message.scrollIntoView,
              additionalData: message.additionalData
            },
            null // No callback needed
          );
        } else {
          // Fall back to querying for the active tab
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) return;
            
            // Store the active tab ID for future use
            connection.tabId = tabs[0].id;
            
            safelySendMessage(
              tabs[0].id,
              {
                action: "highlightElement",
                selector: message.selector,
                scrollIntoView: !!message.scrollIntoView,
                additionalData: message.additionalData
              },
              null // No callback needed
            );
          });
        }
      }
      
      // Handle removeHighlight message
      if (message.action === "removeHighlight") {
        // Get tabId either from message, connection, or active tab
        const tabId = message.tabId || connection.tabId;
        
        if (tabId) {
          safelySendMessage(
            tabId,
            { action: "removeHighlight" },
            null // No callback needed
          );
        } else {
          // Fall back to querying for the active tab
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) return;
            
            // Store the active tab ID for future use
            connection.tabId = tabs[0].id;
            
            safelySendMessage(
              tabs[0].id,
              { action: "removeHighlight" },
              null // No callback needed
            );
          });
        }
      }
    });
  }
});