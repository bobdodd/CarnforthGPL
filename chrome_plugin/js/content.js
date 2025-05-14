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
 * Carnforth Accessible Name Tester - Content Script
 * 
 * This script is injected into the page being tested and implements the
 * accessible name testing logic, based on the Carnforth project.
 */

// Store the highlight overlay element (only allow one at a time)
let highlightOverlay = null;

// Track if removal is in progress to prevent race conditions
let removalInProgress = false;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "runAccessibilityTest") {
    const results = runAccessibilityTest();
    sendResponse(results);
    return true;
  }

  if (message.action === "highlightElement") {
    try {
      console.log("Highlight request received:", message.selector, "scrollIntoView:", message.scrollIntoView);

      // Try multiple methods to find the element since querySelectorAll can be more robust than querySelector
      let element = null;

      try {
        // Method 1: Try direct querySelector (most efficient)
        element = document.querySelector(message.selector);
      } catch (queryError) {
        console.warn("Error with querySelector, trying alternative methods:", queryError);
      }

      // If direct selector didn't work, try alternative approaches
      if (!element) {
        try {
          // Method 2: Try querySelectorAll and get first element
          const elements = document.querySelectorAll(message.selector);
          if (elements && elements.length > 0) {
            element = elements[0];
          }
        } catch (queryAllError) {
          console.warn("Error with querySelectorAll:", queryAllError);
        }
      }

      // Method 3: For complex selectors, try breaking it into parts
      if (!element && message.selector.includes('>')) {
        try {
          const parts = message.selector.split('>').map(part => part.trim());
          let currentElements = [document.documentElement]; // Start with html

          for (const part of parts) {
            if (currentElements.length === 0) break;

            const nextElements = [];
            for (const el of currentElements) {
              // For each current element, find children matching the selector part
              try {
                const matches = el.querySelectorAll(part);
                for (const match of matches) {
                  nextElements.push(match);
                }
              } catch (e) {
                // Selector part might be invalid, skip it
                console.warn("Error with selector part:", part, e);
              }
            }
            currentElements = nextElements;
          }

          if (currentElements.length > 0) {
            element = currentElements[0];
          }
        } catch (complexError) {
          console.warn("Error with complex selector parsing:", complexError);
        }
      }

      // Method 4: Try using more basic selectors as a last resort
      if (!element && message.selector.includes('#')) {
        try {
          // Extract ID from the selector
          const idMatch = message.selector.match(/#([^.:#\s\[\]]+)/);
          if (idMatch && idMatch[1]) {
            element = document.getElementById(idMatch[1]);
          }
        } catch (idError) {
          console.warn("Error extracting ID from selector:", idError);
        }
      }

      // Try using attributes as fallback if still no element found
      if (!element) {
        try {
          // Look for elements with specific attributes that might match
          const tagMatch = message.selector.match(/^([a-z0-9]+)/i);
          if (tagMatch && tagMatch[1]) {
            const tag = tagMatch[1].toLowerCase();
            const elements = document.getElementsByTagName(tag);

            // For sites with cookie notices, links, etc.
            for (const el of elements) {
              // For links, check href or text content
              if (tag === 'a' && el.textContent &&
                  (el.textContent.toLowerCase().includes('learn more') ||
                   el.textContent.toLowerCase().includes('click here'))) {
                element = el;
                break;
              }

              // For buttons
              if ((tag === 'button' || el.getAttribute('role') === 'button') &&
                  el.textContent &&
                  (el.textContent.toLowerCase().includes('accept') ||
                   el.textContent.toLowerCase().includes('close'))) {
                element = el;
                break;
              }
            }
          }
        } catch (attrError) {
          console.warn("Error finding element by attributes:", attrError);
        }
      }

      // Special handling for problem sites
      const additionalData = message.additionalData || {};
      const isProblematicSite = additionalData.site === 'bobd69' ||
                               window.location.href.includes('bobd69.sg-host.com');

      // If we found an element, highlight it
      if (element) {
        console.log("Found element to highlight:", element.tagName, element.className, "Position:", element.getBoundingClientRect());

        // First force a layout calculation to ensure element measurements are accurate
        // This helps fix positioning issues on first click
        const rect = element.getBoundingClientRect();
        console.log("Initial element rect:", rect);

        // Force layout calculation by reading these properties
        const forceCalculation = document.body.offsetHeight;

        // Check if element is actually visible
        const computedStyle = window.getComputedStyle(element);
        const isVisible = !(computedStyle.display === 'none' ||
                            computedStyle.visibility === 'hidden' ||
                            parseFloat(computedStyle.opacity) === 0);

        console.log("Element visibility:", isVisible);

        // Highlight with scrollIntoView parameter from the message
        highlightElement(element, message.scrollIntoView === true);
      } else {
        console.warn("Could not find element with selector:", message.selector);

        // Last resort: try to highlight ANY interactive element to show that highlighting works
        if (isProblematicSite) {
          const anyInteractive = document.querySelector('a, button, [role="button"], [tabindex="0"]');
          if (anyInteractive) {
            console.log("Highlighting a fallback interactive element instead");
            highlightElement(anyInteractive, message.scrollIntoView === true);
          }
        }
      }
    } catch (error) {
      console.error("Error highlighting element:", error);
    }
    return true;
  }

  if (message.action === "removeHighlight") {
    // Remove the highlight overlay if it exists
    removeHighlightOverlay();
    return true;
  }

  if (message.action === "getDebugInfo") {
    // Generate and return debug information for an element
    try {
      const element = document.querySelector(message.selector);
      if (element) {
        const debugData = generateDebugInfo(element);
        chrome.runtime.sendMessage({
          action: "debugInfoResponse",
          debugData: debugData
        });
      } else {
        chrome.runtime.sendMessage({
          action: "debugInfoResponse",
          debugData: {
            error: "Element not found with selector: " + message.selector
          }
        });
      }
    } catch (error) {
      chrome.runtime.sendMessage({
        action: "debugInfoResponse",
        debugData: {
          error: "Error getting debug info: " + error.message
        }
      });
    }
    return true;
  }
});

/**
 * Main function to run accessibility tests on the page
 * @returns {Object} Test results with elements and issues
 */
function runAccessibilityTest() {
  console.log("Running accessible name tests");

  // Find all elements that should have accessible names
  const elementsToTest = [
    // Images
    ...findAndTestElements('img:not([role="presentation"], [role="none"])', testImage),

    // Form controls (except special input types that are handled separately)
    ...findAndTestElements('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="radio"]):not([type="image"])', testFormControl),
    ...findAndTestElements('input[type="radio"]', testRadioButton),
    ...findAndTestElements('input[type="image"]', testImageInput),
    ...findAndTestElements('textarea', testFormControl),
    ...findAndTestElements('select', testSelect),

    // Fieldset groups
    ...findAndTestElements('fieldset', testFieldset),
    ...findAndTestElements('[role="group"]', testFieldset),

    // Forms and form roles
    ...findAndTestElements('form', testForm),
    ...findAndTestElements('[role="form"]', testForm),

    // Buttons and button-like inputs
    ...findAndTestElements('button', testButton),
    ...findAndTestElements('[role="button"]', testButton),
    ...findAndTestElements('input[type="button"]', testButton),
    ...findAndTestElements('input[type="submit"]', testButton),
    ...findAndTestElements('input[type="reset"]', testButton),

    // Links
    ...findAndTestElements('a[href]', testLink),
    ...findAndTestElements('[role="link"]', testLink),

    // Image map areas
    ...findAndTestElements('area[href]', testArea),

    // Form element
    ...findAndTestElements('form', testLandmark),
    
    // Landmarks
    ...findAndTestElements('header, [role="banner"]', testLandmark),
    ...findAndTestElements('aside, [role="complementary"]', testLandmark),
    ...findAndTestElements('footer, [role="contentinfo"]', testLandmark),
    ...findAndTestElements('main, [role="main"]', testLandmark),
    ...findAndTestElements('nav, [role="navigation"]', testLandmark),
    ...findAndTestElements('section[aria-label], section[aria-labelledby], [role="region"][aria-label], [role="region"][aria-labelledby]', testLandmark),
    ...findAndTestElements('[role="search"]', testLandmark),
    
    // Progress and meter elements
    ...findAndTestElements('progress', testProgress),
    ...findAndTestElements('[role="progressbar"]', testProgress),
    ...findAndTestElements('meter', testMeter),
    ...findAndTestElements('[role="meter"]', testMeter),

    // SVG images
    ...findAndTestElements('svg[role="img"]', testSVGImage),
    ...findAndTestElements('div[role="img"]', testElementWithRoleImg),
    ...findAndTestElements('span[role="img"]', testElementWithRoleImg),
    ...findAndTestElements('[role="img"]:not(svg):not(div):not(span)', testElementWithRoleImg),

    // ARIA widgets that require accessible names
    ...findAndTestElements('[role="checkbox"]', testAriaWidget),
    ...findAndTestElements('[role="combobox"]', testAriaWidget),
    ...findAndTestElements('[role="dialog"]', testDialog), // Dialog elements need special handling
    ...findAndTestElements('[role="listbox"]', testAriaWidget),
    ...findAndTestElements('[role="menu"]', testAriaWidget),
    ...findAndTestElements('[role="menuitem"]', testAriaWidget),
    ...findAndTestElements('[role="radio"]', testAriaWidget),
    ...findAndTestElements('[role="radiogroup"]', testAriaWidget),
    ...findAndTestElements('[role="slider"]', testAriaWidget),
    ...findAndTestElements('[role="tab"]', testAriaWidget),
    ...findAndTestElements('[role="tablist"]', testAriaWidget),
    ...findAndTestElements('[role="tabpanel"]', testAriaWidget),
    ...findAndTestElements('[role="textbox"]', testFormControl),
    ...findAndTestElements('[role="tree"]', testAriaWidget),
    ...findAndTestElements('[role="treeitem"]', testAriaWidget),
    // Note: [role="meter"] is now handled above
    
    // Other interactive elements that require accessible names
    ...findAndTestElements('iframe', testIframe),
    ...findAndTestElements('audio[controls]', testMedia),
    ...findAndTestElements('video[controls]', testMedia),
    ...findAndTestElements('[role="video"]', testMedia),
    
    // Elements with tabindex
    ...findAndTestElements('[tabindex]:not([tabindex="-1"])', testElementWithTabindex)
  ];
  
  // Process results
  const failedElements = elementsToTest.filter(el => el.result === "fail");
  const warningElements = elementsToTest.filter(el => el.result === "warn");
  const passingElements = elementsToTest.filter(el => el.result === "pass");
  
  return {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    elements: elementsToTest,
    counts: {
      total: elementsToTest.length,
      failed: failedElements.length,
      warnings: warningElements.length,
      passing: passingElements.length
    }
  };
}

/**
 * Find elements matching a selector and test each one
 * @param {string} selector - CSS selector for elements
 * @param {function} testFunction - Function to test each element
 * @returns {Array} Array of test results
 */
function findAndTestElements(selector, testFunction) {
  try {
    const elements = document.querySelectorAll(selector);
    const results = [];
    
    for (const element of elements) {
      const result = testFunction(element);
      if (result) {
        results.push(result);
      }
    }
    
    return results;
  } catch (error) {
    console.error(`Error finding elements with selector ${selector}:`, error);
    return [];
  }
}

/**
 * Test an image element for an accessible name
 * @param {HTMLElement} element - Image element
 * @returns {Object} Test result
 */
/**
 * Test an SVG element with role="img" for an accessible name
 * @param {SVGElement} element - SVG element with role="img"
 * @returns {Object} Test result
 */
function testSVGImage(element) {
  const accessibleName = computeAccessibleName(element);

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: element.tagName.toLowerCase(),
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Determine if the element is explicitly marked as decorative
  const isDecorative = (element.hasAttribute('aria-hidden') && element.getAttribute('aria-hidden') === 'true') ||
                      (element.hasAttribute('role') && element.getAttribute('role') === 'presentation') ||
                      (element.hasAttribute('role') && element.getAttribute('role') === 'none');

  // Check for a <title> element in the SVG
  const hasTitle = element.querySelector('title') !== null;
  const titleElement = element.querySelector('title');
  const titleContent = titleElement ? titleElement.textContent : null;
  result.hasTitleElement = hasTitle;
  result.titleContent = titleContent;

  // If the element is decorative, it should have no accessible name
  if (isDecorative) {
    if (accessibleName === '') {
      result.result = "pass";
      result.description = "Decorative SVG image correctly has no accessible name";
    } else {
      result.result = "warn";
      result.description = "Decorative SVG image (with role='presentation' or 'none') should not have an accessible name";
    }
    return result;
  }

  // Check for broken aria-labelledby references first
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    let resultObj = {
      result: "fail",
      description: "Broken aria-labelledby references",
      details: "When aria-labelledby references IDs that don't exist in the document, screen readers cannot provide an accessible name for the element."
    };

    // Apply the result
    if (!isVisible && resultObj.result === "fail") {
      result.result = "warn";
      result.description = resultObj.description + " (hidden element)";
      result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                   "This is reported as a warning rather than an error because the element is not visible " +
                   "to users, but would fail accessibility requirements if it becomes visible.";
    } else {
      result.result = resultObj.result;
      result.description = resultObj.description;
      if (resultObj.details) {
        result.details = resultObj.details;
      }
    }

    return result;
  }

  // Determine result based on accessible name
  let resultObj;

  if (!accessibleName) {
    resultObj = {
      result: "fail",
      description: "Missing accessible name",
      details: "SVG images with role=\"img\" need an accessible name to make their content available to screen reader users. Add a <title> element as the first child of the SVG, or use aria-label or aria-labelledby attributes."
    };
  } else if (accessibleName.trim() === '') {
    resultObj = {
      result: "fail",
      description: "Whitespace-only accessible name",
      details: "Accessible names consisting only of whitespace characters are not announced by screen readers, making the image inaccessible to screen reader users."
    };
  } else if (isPunctuation(accessibleName)) {
    resultObj = {
      result: "fail",
      description: "Punctuation-only accessible name",
      details: "Accessible names consisting only of punctuation characters don't provide meaningful information to screen reader users."
    };
  } else if (accessibleName.includes('<') && accessibleName.includes('>')) {
    // Don't include the actual accessible name in the result for HTML markup
    result.accessibleName = ''; // Override the accessibleName in the result

    resultObj = {
      result: "fail",
      description: "HTML markup in SVG accessible name",
      details: "HTML tags in accessible names are not rendered properly by screen readers and can cause confusion. Use plain text without markup in accessible names."
    };
  } else if (isFilenameInText(accessibleName)) {
    resultObj = {
      result: "fail",
      description: "Filename as accessible name",
      details: "Filenames do not adequately describe the content or purpose of an image to screen reader users."
    };
  } else if (isGenericLabel(accessibleName)) {
    resultObj = {
      result: "warn",
      description: "Generic accessible name",
      details: "Generic terms don't adequately describe the content or purpose of an image to screen reader users.",
      title: "Generic image description"
    };
  } else if (hasTitle && titleContent && titleContent.trim() === '' && accessibleName) {
    resultObj = {
      result: "warn",
      description: "Empty title element with alternative accessible name",
      details: "Having an empty <title> element along with other accessible name sources can create confusion. It's better to either use the <title> element properly or remove it.",
      title: "Empty title element"
    };
  } else {
    resultObj = {
      result: "pass",
      description: "SVG image has an appropriate accessible name"
    };
  }

  // If the element has an accessibility issue but is hidden, downgrade to a warning
  if (!isVisible && resultObj.result === "fail") {
    result.result = "warn";
    result.description = resultObj.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                   "This is reported as a warning rather than an error because the element is not visible " +
                   "to users, but would fail accessibility requirements if it becomes visible.";
  } else {
    result.result = resultObj.result;
    result.description = resultObj.description;
    if (resultObj.details) {
      result.details = resultObj.details;
    }
    if (resultObj.title) {
      result.title = resultObj.title;
    }
  }

  return result;
}

/**
 * Test an image element for an accessible name
 * @param {HTMLElement} element - Image element
 * @returns {Object} Test result
 */
function testImage(element) {
  const accessibleName = computeAccessibleName(element);

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  // Check if this is an image map
  const isImageMap = element.hasAttribute('usemap') && element.getAttribute('usemap').trim() !== '';

  const result = {
    tagName: element.tagName.toLowerCase(),
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible,
    isImageMap: isImageMap
  };

  // Determine if the element is explicitly marked as decorative
  // This includes elements with role="presentation", role="none", aria-hidden="true"
  // OR elements with an empty alt attribute (alt="")
  const hasEmptyAlt = element.hasAttribute('alt') && element.getAttribute('alt') === '';
  const isDecorative = hasEmptyAlt ||
                      (element.hasAttribute('aria-hidden') && element.getAttribute('aria-hidden') === 'true') ||
                      (element.hasAttribute('role') && element.getAttribute('role') === 'presentation') ||
                      (element.hasAttribute('role') && element.getAttribute('role') === 'none');

  // If the image is decorative, it should have no accessible name
  if (isDecorative) {
    if (accessibleName === '') {
      result.result = "pass";
      result.description = "Decorative image correctly has empty alt text";
    } else {
      result.result = "warn";
      result.description = "Decorative image should have empty alt text";
    }
    return result;
  }

  // Case where image has empty alt="" but is not caught above due to other attributes
  // This is also considered a valid way to mark decorative images
  if (hasEmptyAlt) {
    result.result = "pass";
    result.description = "Decorative image correctly has empty alt text";
    return result;
  }

  // Determine result based on accessible name
  let resultObj = {
    result: "fail",
    description: "Image is missing an accessible name (alt text) - Invisible to screen reader users. Add descriptive alt text that conveys purpose or content"
  };

  if (!accessibleName) {
    if (isImageMap) {
      resultObj = {
        result: "fail",
        description: "Image map is missing an accessible name - Screen readers can't provide context for the interactive areas. Add descriptive alt text that explains the map's purpose and available options",
        details: "Image maps need descriptive alt text that provides context for the interactive areas within them. Without it, screen reader users won't understand what the map represents."
      };
    } else {
      resultObj = {
        result: "fail",
        description: "Image is missing an accessible name (alt text) - Invisible to screen reader users. Add descriptive alt text that conveys purpose or content"
      };
    }
  } else if (isFilenameInText(accessibleName)) {
    // Don't include the actual filename in the result
    result.accessibleName = ''; // Override the accessibleName in the result

    if (isImageMap) {
      resultObj = {
        result: "fail",
        description: `Image map has a filename as its accessible name - Not descriptive of its purpose. Add alt text that explains the map's purpose and available interactive options`,
        details: "Image maps should have descriptive alt text that explains their purpose and provides context for the interactive areas."
      };
    } else {
      resultObj = {
        result: "fail",
        description: "Image has a filename as its accessible name - Filenames are not meaningful to users. Replace with descriptive alt text that conveys image content or purpose"
      };
    }
  } else if (accessibleName.trim() === '') {
    // This case handles situations where the accessible name computation results in an empty string
    // but the image isn't explicitly marked as decorative with alt=""

    // Don't include the whitespace in the result
    result.accessibleName = ''; // Override the accessibleName in the result

    if (isImageMap) {
      resultObj = {
        result: "fail",
        description: "Image map has empty accessible name - Screen readers can't provide context for the interactive areas. Add descriptive alt text that explains the map's purpose",
        details: "Image maps should never be marked as decorative since they contain interactive elements."
      };
    } else {
      resultObj = {
        result: "fail",
        description: "Image has whitespace-only alt text - This effectively creates a blank accessible name. Use empty alt attribute (alt=\"\") for decorative images or add descriptive alt text for meaningful images",
        details: "Whitespace-only alt text (alt=\" \") is different from empty alt text (alt=\"\"). Screen readers will still try to announce this image but won't have any content to read. If the image is decorative, use alt=\"\"; if it's meaningful, provide descriptive alt text."
      };
    }
  } else if (isPunctuation(accessibleName)) {
    // Don't include the punctuation in the result
    result.accessibleName = ''; // Override the accessibleName in the result

    if (isImageMap) {
      resultObj = {
        result: "fail",
        description: `Image map has only punctuation as its accessible name - Not meaningful to screen reader users. Add descriptive alt text that explains the map's purpose`,
        details: "Punctuation characters don't convey meaning about the purpose of an image map or provide context for its interactive areas."
      };
    } else {
      resultObj = {
        result: "fail",
        description: "Image has only punctuation as its accessible name - Punctuation alone is not meaningful. Add descriptive alt text that conveys image content or purpose"
      };
    }
  } else if (accessibleName.includes('<') && accessibleName.includes('>')) {
    // Don't include the actual accessible name in the result for HTML markup
    result.accessibleName = ''; // Override the accessibleName in the result

    if (isImageMap) {
      resultObj = {
        result: "fail",
        description: "HTML markup in image map alt text",
        details: "HTML tags in alt text are not rendered properly by screen readers and can cause confusion. Use plain text without markup in alt text."
      };
    } else {
      resultObj = {
        result: "fail",
        description: "HTML markup in alt text",
        details: "HTML tags in alt text are not rendered properly by screen readers and can cause confusion. Use plain text without markup in alt text."
      };
    }
  } else if (accessibleName.toLowerCase().startsWith('image ') ||
             accessibleName.toLowerCase().includes('image of')) {
    // Check for redundant "image" or "image of" in alt text
    resultObj = {
      result: "warn",
      description: "Redundant 'image' in alt text",
      details: "Screen readers already announce the element as an image, so including 'image' or 'image of' in the accessible name is redundant and creates a poor user experience.",
      title: "Redundant alt text"
    };
  } else if (isGenericLabel(accessibleName)) {
    // Check for generic labels for all images, not just image maps
    resultObj = {
      result: "warn",
      description: `Generic alt text "${accessibleName}"`,
      details: "Generic terms don't adequately describe the content or purpose of an image to screen reader users.",
      title: "Generic image description"
    };
  } else if (isGenericLabel(accessibleName) && isImageMap) {
    // Special check for generic names on image maps
    resultObj = {
      result: "warn",
      description: `Image map has generic alt text "${accessibleName}" - Not sufficiently descriptive. Add alt text that explains the map's purpose and available interactive options`,
      details: "Image maps need descriptive alt text that explains their purpose and provides context for the contained interactive areas.",
      title: "Generic image map description"
    };
  } else if (accessibleName.length < 10 && isImageMap) {
    // Warn about very short descriptions for image maps
    resultObj = {
      result: "warn",
      description: `Image map has a very short accessible name "${accessibleName}" - May not provide sufficient context. Consider adding more descriptive alt text that explains the map's purpose and available options`,
      details: "Image maps typically benefit from more detailed descriptions to provide context for the interactive areas.",
      title: "Brief image map description"
    };
  } else {
    resultObj = {
      result: "pass",
      description: isImageMap ?
        "Image map has an appropriate accessible name" :
        "Image has a descriptive accessible name"
    };
  }

  // If the element has an accessibility issue but is hidden, downgrade to a warning
  if (!isVisible && resultObj.result === "fail") {
    result.result = "warn";
    result.description = resultObj.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                     "This is reported as a warning rather than an error because the element is not visible " +
                     "to users, but would fail accessibility requirements if it becomes visible.";
  } else {
    result.result = resultObj.result;
    result.description = resultObj.description;
  }

  return result;
}

/**
 * Test a form control for an accessible name
 * @param {HTMLElement} element - Form control element
 * @returns {Object} Test result
 */
function testFormControl(element) {
  const accessibleName = computeAccessibleName(element);
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const isARIATextbox = role === 'textbox';
  const elementType = isARIATextbox ? 'ARIA textbox' : capitalizeFirstLetter(tagName);

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: tagName,
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Check for broken aria-labelledby references first
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    let resultObj = {
      result: "fail",
      description: `${elementType} has aria-labelledby referencing non-existent IDs: "${element._brokenAriaLabelledbyIds.join(', ')}"`
    };

    // Apply the result, downgrading to warning if hidden
    if (!isVisible && resultObj.result === "fail") {
      result.result = "warn";
      result.description = resultObj.description + " (hidden element)";
      result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                     "This is reported as a warning rather than an error because the element is not visible " +
                     "to users, but would fail accessibility requirements if it becomes visible.";
    } else {
      result.result = resultObj.result;
      result.description = resultObj.description;
    }

    return result;
  }

  // Special handling for hidden inputs or elements not requiring a label
  if (element.type === 'hidden' || element.type === 'button' || element.type === 'submit' || element.type === 'reset') {
    // These types don't always need accessible names
    let resultObj = { result: "pass", description: "Hidden input doesn't require an accessible name" };

    if (element.type === 'button' || element.type === 'submit' || element.type === 'reset') {
      if (!accessibleName) {
        resultObj = {
          result: "fail",
          description: `${capitalizeFirstLetter(element.type)} input is missing an accessible name - Users cannot identify its purpose. Add a value attribute, aria-label, or aria-labelledby`
        };
      } else {
        resultObj = {
          result: "pass",
          description: `${capitalizeFirstLetter(element.type)} input has an accessible name`
        };
      }
    } else {
      // Hidden inputs don't need accessible names
      resultObj = {
        result: "pass",
        description: "Hidden input doesn't require an accessible name"
      };
    }

    // Apply the result, downgrading to warning if hidden
    if (!isVisible && resultObj.result === "fail") {
      result.result = "warn";
      result.description = resultObj.description + " (hidden element)";
      result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                     "This is reported as a warning rather than an error because the element is not visible " +
                     "to users, but would fail accessibility requirements if it becomes visible.";
    } else {
      result.result = resultObj.result;
      result.description = resultObj.description;
    }

    return result;
  }

  // For visible form controls, determine the result based on accessible name
  let resultObj = { result: "pass", description: `${elementType} has an accessible name` };

  // For radio buttons, we'll do additional checks in the testRadioButton function

  if (!accessibleName) {
    // Check for placeholder-only inputs, which should specifically fail
    const hasPlaceholder = element.hasAttribute('placeholder');

    if (hasPlaceholder && tagName === 'input') {
      resultObj = {
        result: "fail",
        description: `${elementType} has placeholder but no accessible name - Placeholder text is not part of the accessible name calculation. Add a properly associated label, aria-label, or aria-labelledby`,
        details: "Placeholder text is not included in the accessible name, disappears when users start typing, often has low contrast ratios, and is not a substitute for a proper label. Form controls must have a proper accessible name to meet WCAG success criteria."
      };
    } else {
      resultObj = {
        result: "fail",
        description: `${elementType} is missing an accessible name - Users cannot identify its purpose. Add a properly associated label, aria-label, or aria-labelledby`
      };
    }
  } else if (accessibleName.trim() === '') {
    resultObj = {
      result: "fail",
      description: `${elementType} has empty or whitespace-only accessible name`
    };
  } else if (isPunctuation(accessibleName)) {
    resultObj = {
      result: "fail",
      description: `${elementType} has punctuation-only accessible name "${accessibleName}" - Not meaningful to screen reader users. Add descriptive text that identifies the input's purpose`
    };
  } else if (isGenericLabel(accessibleName)) {
    resultObj = {
      result: "fail",
      description: `${elementType} has generic accessible name "${accessibleName}" - This doesn't describe the input's purpose. Use descriptive text that clearly identifies what information is expected`
    };
  } else if (isFilenameInText(accessibleName)) {
    resultObj = {
      result: "warn",
      description: `${elementType} has a filename-like accessible name "${accessibleName}" - This may not be descriptive of the input's purpose. Consider using a more descriptive label that explains what information is expected`,
      details: "Filename-like labels are often system-oriented rather than user-oriented and may not clearly communicate what information the user should enter."
    };
  } else if (isUrlLike(accessibleName)) {
    resultObj = {
      result: "warn",
      description: `${elementType} has a URL-like accessible name "${accessibleName}" - This may not be descriptive of the input's purpose. Consider using a more descriptive label that explains what information is expected`,
      details: "URL-like labels are often system-oriented rather than user-oriented and may not clearly communicate what information the user should enter."
    };
  } else if (element._accessibleNameFromTitleOnly) {
    resultObj = {
      result: "warn",
      description: `${elementType} uses title attribute for its accessible name - Not recommended for accessibility. Title attributes may not be visible to all users and aren't consistently supported. Use a label element or aria-label instead`,
      details: "Title attributes have several accessibility issues: they're not visible to screen magnifier users, aren't consistently exposed by all assistive technologies, may be difficult to discover for keyboard-only users, and only visible on hover/focus with potential timeout issues."
    };
  } else {
    // Check if the input has an implicit label (parent label without 'for' attribute)
    const hasImplicitLabel = hasImplicitLabelParent(element);

    if (hasImplicitLabel) {
      resultObj = {
        result: "warn",
        description: `${elementType} uses implicit label (nested within label element) - This may cause issues with some voice-control technologies like Dragon Naturally Speaking, which look for explicit for/id associations. Consider using explicit label with matching for/id attributes instead`,
        details: "Voice control technologies often look specifically for the 'for' attribute in labels, and implicit labeling can limit functionality for some assistive technology users. While implicit labels are technically valid, explicit labels with matching for/id attributes are more broadly supported across assistive technologies."
      };
    } else {
      resultObj = {
        result: "pass",
        description: `${elementType} has an accessible name`
      };
    }
  }

  // Apply the result, downgrading to warning if hidden
  if (!isVisible && resultObj.result === "fail") {
    result.result = "warn";
    result.description = resultObj.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                   "This is reported as a warning rather than an error because the element is not visible " +
                   "to users, but would fail accessibility requirements if it becomes visible.";
  } else {
    result.result = resultObj.result;
    result.description = resultObj.description;
  }
  
  return result;
}

/**
 * Test a fieldset for an accessible name
 * @param {HTMLElement} element - Fieldset element
 * @returns {Object} Test result
 */
/**
 * Test a form for an accessible name
 * @param {HTMLElement} element - Form element or element with role="form"
 * @returns {Object} Test result
 */
function testForm(element) {
  const accessibleName = computeAccessibleName(element);
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const elementType = role === 'form' ? 'Element with role="form"' : 'Form';

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: tagName,
    role: role,
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Check for broken aria-labelledby references
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    result.result = "fail";
    result.description = `${elementType} has aria-labelledby referencing non-existent IDs: "${element._brokenAriaLabelledbyIds.join(', ')}" - These referenced elements do not exist in the document. Fix these IDs or add an aria-label attribute`;
  }
  // Check for aria-labelledby referencing an empty element
  else if (element.hasAttribute('aria-labelledby') && accessibleName === '') {
    result.result = "fail";
    result.description = `${elementType} references an element with empty content via aria-labelledby - The referenced element exists but has no text content. Add text to the referenced element or use aria-label instead`;
  }
  // Check for empty aria-label
  else if (element.hasAttribute('aria-label') && element.getAttribute('aria-label').trim() === '') {
    result.result = "fail";
    result.description = `${elementType} has empty aria-label attribute - This doesn't provide an accessible name. Add text to the aria-label or use aria-labelledby instead`;
  }
  // Check for punctuation-only aria-label
  else if (element.hasAttribute('aria-label') && isPunctuation(element.getAttribute('aria-label'))) {
    result.result = "fail";
    result.description = `${elementType} has punctuation-only aria-label "${element.getAttribute('aria-label')}" - Not meaningful to screen reader users. Use descriptive text instead`;
  }
  // Check for missing accessible name entirely
  else if (!accessibleName) {
    result.result = "fail";
    result.description = `${elementType} is missing an accessible name - Essential for landmark navigation with screen readers. Add aria-label or aria-labelledby referencing a heading`;
  }
  // Check for empty accessible name
  else if (accessibleName.trim() === '') {
    result.result = "fail";
    result.description = `${elementType} has empty or whitespace-only accessible name - Not helpful for screen reader users. Add descriptive text to the aria-label`;
  }
  // Check for punctuation-only accessible name
  else if (isPunctuation(accessibleName)) {
    result.result = "fail";
    result.description = `${elementType} has punctuation-only accessible name "${accessibleName}" - Not meaningful to screen reader users. Use descriptive text that indicates the form's purpose`;
  }
  // Check for filename-like accessible name
  else if (isFilenameInText(accessibleName)) {
    result.result = "fail";
    result.description = `${elementType} has a filename as its accessible name "${accessibleName}" - Not helpful to screen reader users. Use descriptive text that indicates the form's purpose`;
  }
  // Check for URL-like accessible name
  else if (isUrlLike(accessibleName)) {
    result.result = "fail";
    result.description = `${elementType} has a URL-like string as its accessible name "${accessibleName}" - Not helpful to screen reader users. Use descriptive text that indicates the form's purpose`;
  }
  // Check for title-only accessible names
  else if (element._accessibleNameFromTitleOnly) {
    result.result = "warn";
    result.description = `${elementType} uses title attribute for its accessible name - Not recommended for accessibility. Title attributes may not be visible to all users and aren't consistently supported. Use aria-label or aria-labelledby instead`;
    result.details = "Title attributes have several accessibility issues: they're not visible to screen magnifier users, aren't consistently exposed by all assistive technologies, may be difficult to discover for keyboard-only users, and only visible on hover/focus with potential timeout issues.";
  }
  // Valid accessible name present
  else {
    result.result = "pass";
    result.description = `${elementType} has a proper accessible name`;
  }

  // If the element is hidden and has a failure, downgrade to warning
  if (!isVisible && result.result === "fail") {
    result.result = "warn";
    result.description += " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                  "This is reported as a warning rather than an error because the element is not visible " +
                  "to users, but would fail accessibility requirements if it becomes visible.";
  }

  return result;
}

/**
 * Test a fieldset for an accessible name
 * @param {HTMLElement} element - Fieldset element
 * @returns {Object} Test result
 */
function testFieldset(element) {
  const accessibleName = computeAccessibleName(element);
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const elementType = role === 'group' ? 'Group' : 'Fieldset';

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: tagName,
    role: role,
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Check for the presence of a legend element
  // A legend is only considered the accessible name if it's the first child
  const hasLegend = element.querySelector('legend') !== null;
  const legend = element.querySelector('legend');
  const isFirstChild = legend && legend === element.firstElementChild;
  const emptyLegend = legend && legend.textContent.trim() === '';

  // Check for legend that is not the first child (critical error)
  if (hasLegend && !isFirstChild) {
    result.result = "fail";
    result.description = `${elementType} has legend that is not the first child element - The legend must be the first child of fieldset to be properly associated. Move the legend to be the first element in the fieldset`;
  }
  // Check for broken aria-labelledby references
  else if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    result.result = "fail";
    result.description = `${elementType} has aria-labelledby referencing non-existent IDs: "${element._brokenAriaLabelledbyIds.join(', ')}" - These referenced elements do not exist in the document. Fix these IDs or use a legend element instead`;
  }
  // Check for aria-labelledby referencing an empty element
  else if (element.hasAttribute('aria-labelledby') && accessibleName === '') {
    result.result = "fail";
    result.description = `${elementType} references an element with empty content via aria-labelledby - The referenced element exists but has no text content. Add text to the referenced element or use a legend element instead`;
  }
  // Check for fieldset with both legend and aria-label/aria-labelledby (warning)
  else if (hasLegend && isFirstChild && !emptyLegend &&
          (element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby'))) {
    result.result = "warn";
    result.description = `${elementType} has both a legend and ${element.hasAttribute('aria-label') ? 'aria-label' : 'aria-labelledby'} - This creates redundant announcements in screen readers. Use either a legend OR aria-label/aria-labelledby, but not both`;
  }
  // Check for empty aria-label
  else if (element.hasAttribute('aria-label') && element.getAttribute('aria-label').trim() === '') {
    result.result = "fail";
    result.description = `${elementType} has empty aria-label attribute - This doesn't provide an accessible name. Add text to the aria-label or use a legend element instead`;
  }
  // Check for punctuation-only aria-label
  else if (element.hasAttribute('aria-label') && isPunctuation(element.getAttribute('aria-label'))) {
    result.result = "fail";
    result.description = `${elementType} has punctuation-only aria-label "${element.getAttribute('aria-label')}" - Not meaningful to screen reader users. Use descriptive text or a legend element`;
  }
  // Check for empty legends
  else if (hasLegend && emptyLegend) {
    result.result = "fail";
    result.description = `${elementType} has empty legend element - This doesn't provide an accessible name. Add text to the legend element`;
  }
  // Check for missing accessible name entirely
  else if (!accessibleName) {
    result.result = "fail";
    result.description = `${elementType} is missing an accessible name - Groups of form controls need labels for screen reader users. Add a legend element, aria-label, or aria-labelledby attribute`;
  }
  // Check for empty accessible name
  else if (accessibleName.trim() === '') {
    result.result = "fail";
    result.description = `${elementType} has empty or whitespace-only accessible name - Not helpful for screen reader users. Add descriptive text to the legend or aria-label`;
  }
  // Check for punctuation-only accessible name
  else if (isPunctuation(accessibleName)) {
    result.result = "fail";
    result.description = `${elementType} has punctuation-only accessible name "${accessibleName}" - Not meaningful to screen reader users. Use descriptive text that indicates the ${elementType.toLowerCase()}'s purpose`;
  }
  // Check for filename-like accessible name
  else if (isFilenameInText(accessibleName)) {
    result.result = "fail";
    result.description = `${elementType} has a filename as its accessible name "${accessibleName}" - Not helpful to screen reader users. Use descriptive text that indicates the ${elementType.toLowerCase()}'s purpose`;
  }
  // Check for URL-like accessible name
  else if (isUrlLike(accessibleName)) {
    result.result = "fail";
    result.description = `${elementType} has a URL-like string as its accessible name "${accessibleName}" - Not helpful to screen reader users. Use descriptive text that indicates the ${elementType.toLowerCase()}'s purpose`;
  }
  // Check for title-only accessible names
  else if (element._accessibleNameFromTitleOnly) {
    result.result = "warn";
    result.description = `${elementType} uses title attribute for its accessible name - Not recommended for accessibility. Title attributes may not be visible to all users and aren't consistently supported. Use a legend element or aria-label instead`;
    result.details = "Title attributes have several accessibility issues: they're not visible to screen magnifier users, aren't consistently exposed by all assistive technologies, may be difficult to discover for keyboard-only users, and only visible on hover/focus with potential timeout issues.";
  }
  // Valid accessible name present
  else {
    result.result = "pass";
    result.description = `${elementType} has a proper accessible name`;
  }

  // If the element is hidden and has a failure, downgrade to warning
  if (!isVisible && result.result === "fail") {
    result.result = "warn";
    result.description += " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                   "This is reported as a warning rather than an error because the element is not visible " +
                   "to users, but would fail accessibility requirements if it becomes visible.";
  }

  return result;
}

/**
 * Test a button for an accessible name
 * @param {HTMLElement} element - Button element
 * @returns {Object} Test result
 */
function testButton(element) {
  const accessibleName = computeAccessibleName(element);

  // Determine the type of button element for reporting
  const isAriaButton = element.getAttribute('role') === 'button';
  const isInputButton = element.tagName === 'INPUT' &&
                       (element.type === 'button' || element.type === 'submit' || element.type === 'reset');

  let elementType;
  if (isAriaButton) {
    elementType = 'ARIA button';
  } else if (isInputButton) {
    elementType = `${capitalizeFirstLetter(element.type)} input`;
  } else {
    elementType = 'Button';
  }

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: element.tagName.toLowerCase(),
    role: isAriaButton ? 'button' : null,
    type: isInputButton ? element.type : null,
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Initialize the resultObj
  let resultObj;

  // Check for broken aria-labelledby references (set by computeAccessibleName)
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    resultObj = {
      result: "fail",
      description: `${elementType} has aria-labelledby referencing non-existent IDs: "${element._brokenAriaLabelledbyIds.join(', ')}"`
    };

    // Skip other checks since broken aria-labelledby is the primary issue
    // Note: Still check visibility below to potentially downgrade to warning
  } else {
    // Special check for input buttons without value
    if (element.tagName === 'INPUT' &&
        (element.type === 'button' || element.type === 'submit' || element.type === 'reset') &&
        !element.hasAttribute('value')) {
      resultObj = {
        result: "fail",
        description: `${elementType} is missing value attribute which provides its accessible name - Screen readers cannot announce this button's purpose. Add a value attribute to define button text`
      };
    }
    // Check for empty aria-label
    else if (element._hasEmptyAriaLabel) {
      resultObj = {
        result: "fail",
        description: `${elementType} has empty or whitespace-only aria-label attribute`
      };
    }
    // Check for punctuation-only aria-label
    else if (element._hasPunctuationOnlyAriaLabel) {
      resultObj = {
        result: "fail",
        description: `${elementType} has aria-label with only punctuation "${element.getAttribute('aria-label')}", which may not be announced by screen readers`
      };
    }
    // Determine result based on accessible name for other cases
    else if (!accessibleName) {
      // Check what specific issue causes the missing accessible name
      if (element.textContent.trim() === '') {
        if (element.tagName === 'BUTTON') {
          resultObj = {
            result: "fail",
            description: `${elementType} has no text content and no aria-label/aria-labelledby attributes`
          };
        } else if (element.tagName === 'INPUT' &&
                  (element.type === 'button' || element.type === 'submit' || element.type === 'reset')) {
          resultObj = {
            result: "fail",
            description: `${elementType} is missing value attribute and has no aria-label/aria-labelledby`
          };
        } else if (element.getAttribute('role') === 'button') {
          resultObj = {
            result: "fail",
            description: `${elementType} has no text content and no aria-label/aria-labelledby attributes`
          };
        } else {
          resultObj = {
            result: "fail",
            description: `${elementType} is missing an accessible name (no content and no aria attributes) - Screen reader users cannot determine this button's purpose. Add text content or aria-label attribute`
          };
        }
      } else {
        resultObj = {
          result: "fail",
          description: `${elementType} is missing an accessible name - Not announced properly by screen readers. Add text content, aria-label, or aria-labelledby`
        };
      }
    }
    else if (accessibleName.trim() === '') {
      // Check what's causing the empty accessible name
      if (element.textContent.trim() === '') {
        if (element.hasAttribute('aria-label') && element.getAttribute('aria-label').trim() === '') {
          resultObj = {
            result: "fail",
            description: `${elementType} has whitespace-only text content and aria-label attribute`
          };
        } else {
          resultObj = {
            result: "fail",
            description: `${elementType} has whitespace-only text content and no aria attributes`
          };
        }
      } else {
        resultObj = {
          result: "fail",
          description: `${elementType} has empty or whitespace-only accessible name`
        };
      }
    }
    else if (isIconOnly(element, accessibleName)) {
      resultObj = {
        result: "fail",
        description: `${elementType} has only an icon ("${accessibleName}") - add aria-label with descriptive text`
      };
    } else if (isGenericText(accessibleName)) {
      resultObj = {
        result: "warn",
        description: `${elementType} text "${accessibleName}" is too generic - use more descriptive text`
      };
    } else {
      resultObj = {
        result: "pass",
        description: `${elementType} has an accessible name`
      };
    }
  }

  // Apply the result, downgrading to warning if hidden
  if (!isVisible && resultObj.result === "fail") {
    result.result = "warn";
    result.description = resultObj.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                   "This is reported as a warning rather than an error because the element is not visible " +
                   "to users, but would fail accessibility requirements if it becomes visible.";
  } else {
    result.result = resultObj.result;
    result.description = resultObj.description;
  }

  return result;
}

/**
 * Test a radio button for both an accessible name and proper grouping
 * @param {HTMLElement} element - Radio button element
 * @returns {Object} Test result
 */
function testRadioButton(element) {
  // First do the regular form control test for accessible name
  const formControlResult = testFormControl(element);

  // If the form control already failed, return that result
  if (formControlResult.result === 'fail') {
    return formControlResult;
  }

  // Otherwise, also check for proper grouping context
  const isInFieldset = element.closest('fieldset') !== null;
  const isInARIAGroup = element.closest('[role="radiogroup"]') !== null;

  // If neither in a fieldset nor in an element with role="radiogroup"
  if (!isInFieldset && !isInARIAGroup) {
    return {
      ...formControlResult,
      result: "fail",
      description: "Radio button is not contained within a fieldset or element with role=\"radiogroup\" - Radio buttons need a grouping context with a descriptive label to help users understand what they're selecting between",
      details: "Radio buttons should be grouped within a fieldset with a legend (or an element with role=\"radiogroup\" and aria-labelledby/aria-label) to provide context about what the options represent. This is essential for screen reader users to understand the purpose of the radio button group."
    };
  }

  // If it passed all tests
  return formControlResult;
}

/**
 * Test a select element for accessible names and proper options
 * @param {HTMLElement} element - Select element
 * @returns {Object} Test result
 */
function testSelect(element) {
  // First do the regular form control test for accessible name
  const formControlResult = testFormControl(element);

  // If the form control already failed, return that result
  if (formControlResult.result === 'fail') {
    return formControlResult;
  }

  // Otherwise, also check for issues with options
  const options = Array.from(element.querySelectorAll('option'));
  let hasEmptyOption = false;
  let hasWhitespaceOption = false;

  // Check the first option specifically
  const firstOption = options[0];
  if (firstOption) {
    // Check for empty option (no text)
    if (firstOption.textContent.trim() === '') {
      hasEmptyOption = true;
    }
  }

  // Check all options
  for (const option of options) {
    // Check for options with only whitespace
    if (option.textContent !== '' && option.textContent.trim() === '') {
      hasWhitespaceOption = true;
    }
  }

  // Report issues with select options
  if (hasEmptyOption) {
    return {
      ...formControlResult,
      result: "fail",
      description: "Select has an empty first option - This doesn't provide a clear instruction or placeholder. Add descriptive text to the first option such as 'Choose a category' or 'Select an option'",
      details: "The first option in a select element should have descriptive text that explains what the user is selecting. Empty options don't provide adequate information to screen reader users about what they're expected to choose."
    };
  } else if (hasWhitespaceOption) {
    return {
      ...formControlResult,
      result: "fail",
      description: "Select has an option with only whitespace characters - This doesn't provide a meaningful option label. Add descriptive text to all options",
      details: "All options in a select element need descriptive text for screen reader users to understand what they're selecting. Whitespace-only options are not accessible and should be avoided."
    };
  }

  // If it passed all tests
  return formControlResult;
}

/**
 * Test an input[type="image"] element for an accessible name via alt attribute
 * @param {HTMLElement} element - Image input element
 * @returns {Object} Test result
 */
function testImageInput(element) {
  const accessibleName = computeAccessibleName(element);
  const alt = element.getAttribute('alt');
  const hasAlt = element.hasAttribute('alt');

  // Check if the element is hidden
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: 'input',
    type: 'image',
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Determine result based on accessible name and alt attribute
  let resultObj;

  if (!hasAlt) {
    // No alt attribute at all
    resultObj = {
      result: "fail",
      description: "Image input is missing alt attribute - Images used as buttons must have descriptive alt text. Add an alt attribute that describes the action or purpose of the button",
      details: "Image inputs are functional controls that need descriptive alt text that explains what action will occur when the button is activated. Missing alt text prevents screen reader users from understanding the button's purpose."
    };
  } else if (alt === '') {
    // Empty alt attribute - inappropriate for functional images like submit buttons
    resultObj = {
      result: "fail",
      description: "Image input has empty alt attribute - Functional images like submit buttons must have descriptive alt text, not empty alt attributes. Add descriptive alt text that explains the button's purpose",
      details: "Empty alt attributes (alt=\"\") are used to hide decorative images from screen readers. Since image inputs are functional controls, they should never have empty alt text."
    };
  } else if (alt.trim() === '') {
    // Whitespace-only alt attribute
    resultObj = {
      result: "fail",
      description: "Image input has whitespace-only alt text - This doesn't provide an accessible name. Add descriptive alt text that explains the button's purpose",
      details: "Alt text consisting only of whitespace characters is not announced by screen readers, making the control unusable for screen reader users."
    };
  } else if (isPunctuation(alt)) {
    // Punctuation-only alt attribute
    resultObj = {
      result: "fail",
      description: `Image input has punctuation-only alt text "${alt}" - Not meaningful to screen reader users. Add descriptive alt text that explains the button's purpose`,
      details: "Alt text consisting only of punctuation characters doesn't convey the purpose of the control to screen reader users."
    };
  } else if (isGenericLabel(alt)) {
    // Generic alt text like "button" or "image" - treating as a warning, not a failure
    resultObj = {
      result: "warn",
      description: `Image input has generic alt text "${alt}" - Not descriptive of its function. Add alt text that describes what action the button performs (e.g., "Submit form", "Search", "Add to cart")`,
      details: "Generic terms like 'button' or 'image' don't explain what the button does when activated. Alt text should describe the action that will occur when the button is used.",
      title: "Generic accessible name" // Custom title to override the default "Missing accessible name"
    };
  } else if (isFilenameInText(alt)) {
    // Filename-like alt text
    resultObj = {
      result: "fail",
      description: `Image input has a filename as alt text "${alt}" - Not descriptive of its function. Add alt text that describes what action the button performs`,
      details: "Filenames don't convey the purpose of a control to users. Alt text should describe what the button does when activated, not technical details about the image file."
    };
  } else {
    // Valid alt text
    resultObj = {
      result: "pass",
      description: "Image input has appropriate alt text"
    };
  }

  // Apply the result, downgrading to warning if hidden
  if (!isVisible && resultObj.result === "fail") {
    result.result = "warn";
    result.description = resultObj.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                   "This is reported as a warning rather than an error because the element is not visible " +
                   "to users, but would fail accessibility requirements if it becomes visible.";
  } else {
    result.result = resultObj.result;
    result.description = resultObj.description;
    if (resultObj.details) {
      result.details = resultObj.details;
    }
  }

  return result;
}

/**
 * Test an image map area for an accessible name
 * @param {HTMLElement} element - Area element
 * @returns {Object} Test result
 */
function testArea(element) {
  const accessibleName = computeAccessibleName(element);

  // Check if the element is hidden
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: 'area',
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Check for broken aria-labelledby references first
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    let resultObj = {
      result: "fail",
      description: `Image map area has aria-labelledby referencing non-existent IDs: "${element._brokenAriaLabelledbyIds.join(', ')}" - Users cannot determine the area's purpose`
    };

    // Apply the result, downgrading to warning if hidden
    if (!isVisible && resultObj.result === "fail") {
      result.result = "warn";
      result.description = resultObj.description + " (hidden element)";
      result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                    "This is reported as a warning rather than an error because the element is not visible " +
                    "to users, but would fail accessibility requirements if it becomes visible.";
    } else {
      result.result = resultObj.result;
      result.description = resultObj.description;
    }

    return result;
  }

  let resultObj;

  // Check for presence of accessible name
  if (!accessibleName) {
    // No accessible name at all
    resultObj = {
      result: "fail",
      description: "Image map area is missing an accessible name - Users cannot determine the area's purpose. Add alt text or aria-label to describe the area's purpose",
      details: "Image map areas without accessible names prevent screen reader users from understanding the purpose of each clickable region."
    };
  } else if (accessibleName.trim() === '') {
    // Empty or whitespace-only accessible name
    resultObj = {
      result: "fail",
      description: "Image map area has empty or whitespace-only accessible name - Not meaningful to screen reader users. Add descriptive alt text or aria-label",
      details: "Accessible names consisting only of whitespace characters are not announced by screen readers, making the area unusable for screen reader users."
    };
  } else if (isPunctuation(accessibleName)) {
    // Punctuation-only accessible name
    resultObj = {
      result: "fail",
      description: `Image map area has punctuation-only accessible name "${accessibleName}" - Not meaningful to screen reader users. Add descriptive alt text or aria-label`,
      details: "Accessible names consisting only of punctuation characters don't convey the purpose of the area to screen reader users."
    };
  } else if (isFilenameInText(accessibleName)) {
    // Filename-like accessible name
    resultObj = {
      result: "fail",
      description: `Image map area has a filename as accessible name "${accessibleName}" - Not descriptive of its purpose. Add descriptive alt text or aria-label`,
      details: "Filenames don't convey the purpose of a clickable area to users. The accessible name should describe the area's destination or purpose."
    };
  } else if (isGenericLabel(accessibleName)) {
    // Generic accessible name
    resultObj = {
      result: "warn",
      description: `Image map area has generic accessible name "${accessibleName}" - Not descriptive of its purpose. Add more descriptive alt text or aria-label`,
      details: "Generic terms don't adequately describe the purpose or destination of the area. The accessible name should be more specific.",
      title: "Generic accessible name"
    };
  } else if (isGenericText(accessibleName)) {
    // Generic link text like "click here"
    resultObj = {
      result: "warn",
      description: `Image map area has generic text "${accessibleName}" - Not descriptive of its destination. Add more specific text that indicates the destination`,
      details: "Generic phrases like 'click here' or 'read more' don't indicate where the link will take users. This makes navigation difficult for screen reader users who often navigate by scanning lists of links.",
      title: "Generic link text"
    };
  } else if (element._accessibleNameFromTitleOnly) {
    // Accessible name from title attribute only (not ideal but allowed)
    resultObj = {
      result: "warn",
      description: `Image map area uses only title attribute for accessible name "${accessibleName}" - Screen readers handle title inconsistently. Use alt attribute or aria-label instead`,
      details: "The title attribute is not reliably announced by all screen readers and is not visible on mobile devices. It's better to use alt or aria-label for accessible names.",
      title: "Relies on title attribute"
    };
  } else {
    // Has a valid accessible name
    resultObj = {
      result: "pass",
      description: "Image map area has an appropriate accessible name"
    };
  }

  // Apply the result, downgrading to warning if hidden
  if (!isVisible && resultObj.result === "fail") {
    result.result = "warn";
    result.description = resultObj.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                  "This is reported as a warning rather than an error because the element is not visible " +
                  "to users, but would fail accessibility requirements if it becomes visible.";
  } else {
    result.result = resultObj.result;
    result.description = resultObj.description;
    if (resultObj.details) {
      result.details = resultObj.details;
    }
    if (resultObj.title) {
      result.title = resultObj.title;
    }
  }

  return result;
}

/**
 * Test a link for an accessible name
 * @param {HTMLElement} element - Link element
 * @returns {Object} Test result
 */
function testLink(element) {
  const accessibleName = computeAccessibleName(element);
  const isAriaLink = element.getAttribute('role') === 'link';
  const elementType = isAriaLink ? 'ARIA link' : 'Link';

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: element.tagName.toLowerCase(),
    role: isAriaLink ? 'link' : null,
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Check for broken aria-labelledby references first
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    result.result = "fail";
    result.description = "Broken aria-labelledby attribute";
    result.details = `The aria-labelledby attribute references IDs that don't exist in the document: "${element._brokenAriaLabelledbyIds.join(', ')}". This causes the element's accessible name to fall back to text content or other sources.`;

    // Downgrade to warning if hidden
    if (!isVisible) {
      result.result = "warn";
      result.description += " (hidden element)";
      const hiddenDetails = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                     "This is reported as a warning rather than an error because the element is not visible " +
                     "to users, but would fail accessibility requirements if it becomes visible.";
      result.details = result.details ? result.details + "\n\n" + hiddenDetails : hiddenDetails;
    }

    return result;
  }

  // Check if link contains an image with alt text
  const containsImage = element.querySelector('img') !== null;
  const imageWithAlt = element.querySelector('img[alt]:not([alt=""])');

  // If no broken aria-labelledby issues, check if the link has an accessible name
  if (!accessibleName) {
    // Special case for links with images
    if (containsImage && !imageWithAlt) {
      result.result = "fail";
      result.description = `${elementType} contains an image without alt text - Screen readers can't determine the link's purpose. Add alt text to the image or descriptive text to the link`;
    } else {
      result.result = "fail";
      result.description = `${elementType} is missing an accessible name - Provides no information to screen reader users. Add descriptive text content, aria-label, or aria-labelledby`;
    }
  } else if (accessibleName.trim() === '') {
    result.result = "fail";
    result.description = `${elementType} has empty or whitespace-only accessible name - Not meaningful to screen reader users. Add descriptive text that indicates where the link leads`;
  } else if (isPunctuation(accessibleName)) {
    result.result = "fail";
    result.description = "Punctuation-only accessible name";
    result.details = "Accessible names consisting only of punctuation characters are not meaningful to screen reader users. Use descriptive text that indicates where the link leads.";
  } else if (isIconOnly(element, accessibleName)) {
    result.result = "fail";
    result.description = "Icon-only link";
    result.details = `This link appears to contain only an icon or symbol ("${accessibleName}") without descriptive text. Add aria-label with descriptive text that explains the link's destination or purpose.`;
  } else if (isGenericLinkText(accessibleName)) {
    // Generic link text is a best practice issue rather than a WCAG failure
    result.result = "warn";
    result.description = "Generic link text";
    result.details = `The text "${accessibleName}" is not descriptive of the link's purpose. This makes navigation difficult for screen reader users who browse by link lists. Replace with text that clearly describes the link's destination.`;
  } else if (isUrlLike(accessibleName)) {
    // Special case for links with URL as text - this is a best practice issue, not a WCAG failure
    result.result = "warn";
    result.description = "URL as text";
    result.details = "URLs as link text may be difficult for screen reader users to listen to. Consider using descriptive text that explains the link's purpose instead.";
  } else {
    // Check if this is a link with an image that has proper alt text
    const hasImgWithMatchingAlt = containsImage && imageWithAlt &&
                                 imageWithAlt.getAttribute('alt') === accessibleName;

    if (hasImgWithMatchingAlt) {
      // This is a good pattern - link with an image that has proper alt text
      result.result = "pass";
      result.description = `${elementType} with image has a descriptive accessible name from alt text`;
    } else {
      result.result = "pass";
      result.description = `${elementType} has a descriptive accessible name`;
    }
  }

  // Downgrade to warning if hidden and there's a failure
  if (!isVisible && result.result === "fail") {
    result.result = "warn";
    result.description += " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                   "This is reported as a warning rather than an error because the element is not visible " +
                   "to users, but would fail accessibility requirements if it becomes visible.";
  }
  
  return result;
}

/**
 * Test a landmark element for an accessible name
 * @param {HTMLElement} element - Landmark element
 * @returns {Object} Test result
 */
function testLandmark(element) {
  const accessibleName = computeAccessibleName(element);
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');

  // Determine the type of landmark
  let landmarkType = role;
  if (!landmarkType) {
    if (tagName === 'header') landmarkType = 'banner';
    else if (tagName === 'footer') landmarkType = 'contentinfo';
    else if (tagName === 'aside') landmarkType = 'complementary';
    else if (tagName === 'nav') landmarkType = 'navigation';
    else if (tagName === 'main') landmarkType = 'main';
    else if (tagName === 'section') landmarkType = 'region';
    else if (tagName === 'form') landmarkType = 'form';
  }

  const result = {
    tagName: tagName,
    role: role,
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName
  };

  // Special case for landmark elements that are in the page only once
  // This matches the implementation in project_tester's accessible_names.py

  // Check for header/banner elements
  if (tagName === 'header' || landmarkType === 'banner') {
    const bannerElements = document.querySelectorAll('header, [role="banner"]');
    if (bannerElements.length <= 1 && !accessibleName) {
      result.result = "pass";
      result.description = "Single banner landmark doesn't require an accessible name";
      return result;
    }
  }

  // Check for footer/contentinfo elements
  if (tagName === 'footer' || landmarkType === 'contentinfo') {
    const contentinfoElements = document.querySelectorAll('footer, [role="contentinfo"]');
    if (contentinfoElements.length <= 1 && !accessibleName) {
      result.result = "pass";
      result.description = "Single contentinfo landmark doesn't require an accessible name";
      return result;
    }
  }

  // Check for main elements
  if (tagName === 'main' || landmarkType === 'main') {
    const mainElements = document.querySelectorAll('main, [role="main"]');
    if (mainElements.length <= 1 && !accessibleName) {
      result.result = "pass";
      result.description = "Single main landmark doesn't require an accessible name";
      return result;
    }
  }

  // Check for nav elements - special case that generates a warning
  if (tagName === 'nav' || landmarkType === 'navigation') {
    const navElements = document.querySelectorAll('nav, [role="navigation"]');
    if (navElements.length <= 1 && !accessibleName) {
      result.result = "warn";
      result.description = "Single navigation landmark should have an accessible name for better user experience";
      result.details = "While a single navigation landmark does not require an accessible name per WCAG, " +
                       "providing one improves user experience with screen readers. The default announcement of " +
                       "'navigation' is not as helpful as a descriptive name like 'Main Menu' or 'Site Navigation'.";
      return result;
    }
  }

  // Check if the landmark has an accessible name when needed
  if (!accessibleName && (landmarkType === 'region' || landmarkType === 'form' ||
      document.querySelectorAll(`[role="${landmarkType}"], ${tagName}`).length > 1)) {
    result.result = "fail";

    // Provide more specific guidance based on landmark type with explanations of why it matters
    if (landmarkType === 'form') {
      result.description = `Form is missing an accessible name - Essential for landmark navigation with screen readers. Add aria-label, aria-labelledby referencing a heading, or use a legend element with a fieldset`;
    } else if (landmarkType === 'region') {
      result.description = `Region landmark needs an accessible name - Without a name, users cannot distinguish between regions. Add aria-label or aria-labelledby referencing a heading`;
    } else if (document.querySelectorAll(`[role="${landmarkType}"], ${tagName}`).length > 1) {
      result.description = `${capitalizeFirstLetter(landmarkType)} landmark (${tagName}) requires a name when multiple instances exist - Users need to distinguish between multiple landmarks of the same type. Add aria-label or aria-labelledby referencing a heading`;
    } else {
      result.description = `${capitalizeFirstLetter(landmarkType)} landmark is missing an accessible name`;
    }
  } else if (accessibleName && accessibleName.trim() === '') {
    result.result = "fail";
    result.description = `${capitalizeFirstLetter(landmarkType)} landmark has empty or whitespace-only accessible name`;
  } else if (!accessibleName) {
    result.result = "pass";
    result.description = `${capitalizeFirstLetter(landmarkType)} landmark doesn't require an accessible name`;
  } else if (landmarkType === 'form' && isPunctuation(accessibleName)) {
    // Check for punctuation-only accessible name in forms
    result.result = "fail";
    result.description = `Form has only punctuation as its accessible name: "${accessibleName}" - Punctuation alone is not meaningful to screen reader users. Add a descriptive accessible name that explains the form's purpose`;
  } else if (landmarkType === 'form' && isFilenameInText(accessibleName)) {
    // Check for filename-like accessible name in forms
    result.result = "fail";
    result.description = `Form has a filename as its accessible name: "${accessibleName}" - Filenames are not helpful to users. Add a descriptive accessible name that explains the form's purpose`;
  } else if (landmarkType === 'form' && isUrlLike(accessibleName)) {
    // Check for URL-like accessible name in forms
    result.result = "fail";
    result.description = `Form has a URL-like string as its accessible name: "${accessibleName}" - URLs are not helpful to users. Add a descriptive accessible name that explains the form's purpose`;
  } else if (role === 'form' && isPunctuation(accessibleName)) {
    // Check for punctuation-only accessible name in forms with role="form"
    result.result = "fail";
    result.description = `Form (role="form") has only punctuation as its accessible name: "${accessibleName}" - Punctuation alone is not meaningful to screen reader users. Add a descriptive accessible name that explains the form's purpose`;
  } else if (role === 'form' && isFilenameInText(accessibleName)) {
    // Check for filename-like accessible name in forms with role="form"
    result.result = "fail";
    result.description = `Form (role="form") has a filename as its accessible name: "${accessibleName}" - Filenames are not helpful to users. Add a descriptive accessible name that explains the form's purpose`;
  } else if (role === 'form' && isUrlLike(accessibleName)) {
    // Check for URL-like accessible name in forms with role="form"
    result.result = "fail";
    result.description = `Form (role="form") has a URL-like string as its accessible name: "${accessibleName}" - URLs are not helpful to users. Add a descriptive accessible name that explains the form's purpose`;
  } else if (element._accessibleNameFromTitleOnly) {
    // Warning for title-only accessible names
    result.result = "warn";
    result.description = `${capitalizeFirstLetter(landmarkType)} landmark uses title attribute for its accessible name - Not recommended for accessibility. Title attributes may not be visible to all users and aren't consistently supported. Use aria-label or aria-labelledby instead`;
    result.details = "Title attributes have several accessibility issues: they're not visible to screen magnifier users, aren't consistently exposed by all assistive technologies, may be difficult to discover for keyboard-only users, and only visible on hover/focus with potential timeout issues.";
  } else {
    result.result = "pass";
    result.description = `${capitalizeFirstLetter(landmarkType)} landmark has an accessible name`;
  }
  
  return result;
}

/**
 * Test an ARIA widget for an accessible name
 * @param {HTMLElement} element - ARIA widget element
 * @returns {Object} Test result
 */
/**
 * Test a dialog element for an accessible name and check for common dialog accessibility issues
 * @param {HTMLElement} element - Dialog element
 * @returns {Object} Test result
 */
function testDialog(element) {
  const accessibleName = computeAccessibleName(element);

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: element.tagName.toLowerCase(),
    role: "dialog",
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Check for broken aria-labelledby references
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    result.result = "fail";
    result.description = "Broken aria-labelledby attribute";
    result.details = `The dialog has an aria-labelledby attribute that references IDs that don't exist in the document: "${element._brokenAriaLabelledbyIds.join(', ')}". This causes the dialog's accessible name to be missing, making it difficult for screen reader users to identify the dialog's purpose.`;
  }
  // If no broken aria-labelledby issues, check for missing accessible name
  else if (!accessibleName) {
    result.result = "fail";
    result.description = "Dialog missing accessible name";
    result.details = "Dialogs require an accessible name via aria-label or aria-labelledby for screen reader users to understand the dialog's purpose. This is especially important for modal dialogs that capture focus.";
  }
  // Check for empty accessible name
  else if (accessibleName.trim() === '') {
    result.result = "fail";
    result.description = "Dialog has empty accessible name";
    result.details = "The dialog has an accessible name that is empty or contains only whitespace. This doesn't provide any meaningful information to screen reader users.";
  }
  // Check for punctuation-only accessible name
  else if (isPunctuation(accessibleName)) {
    result.result = "fail";
    result.description = "Punctuation-only accessible name";
    result.details = `The dialog has an accessible name consisting only of punctuation characters ("${accessibleName}"). This doesn't provide meaningful information to screen reader users.`;
  }
  // Check for redundant dialog label compared to visible heading
  else {
    // Check for redundancy between aria-label and visible heading
    const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let hasRedundantHeading = false;

    if (headings.length > 0 && element.hasAttribute('aria-label')) {
      // Check if any heading text matches the aria-label
      for (const heading of headings) {
        const headingText = heading.textContent.trim();
        if (headingText === accessibleName) {
          hasRedundantHeading = true;
          break;
        }
      }
    }

    if (hasRedundantHeading) {
      result.result = "warn";
      result.description = "Dialog has redundant accessible name";
      result.details = `The dialog's aria-label "${accessibleName}" duplicates visible heading text. This creates redundant announcements for screen reader users. Consider using aria-labelledby to reference the heading instead of duplicating the text in aria-label.`;
    } else {
      result.result = "pass";
      result.description = "Dialog has appropriate accessible name";
    }
  }

  // Downgrade to warning if the element is hidden
  if (!isVisible && result.result === "fail") {
    result.result = "warn";
    result.description = result.description + " (hidden element)";
    result.details = (result.details || "") + "\n\nThis element is currently hidden (display: none, visibility: hidden, or opacity: 0). This is reported as a warning rather than an error because the element is not visible to users, but would fail accessibility requirements if it becomes visible.";
  }

  return result;
}

function testAriaWidget(element) {
  const accessibleName = computeAccessibleName(element);
  const role = element.getAttribute('role');

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: element.tagName.toLowerCase(),
    role: role,
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Check for broken aria-labelledby references (set by computeAccessibleName)
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    result.result = "fail";
    result.description = `${capitalizeFirstLetter(role)} widget has aria-labelledby referencing non-existent IDs: "${element._brokenAriaLabelledbyIds.join(', ')}" - fix these IDs or use aria-label instead`;
  }
  // Otherwise check if the ARIA widget has an accessible name
  else if (!accessibleName) {
    result.result = "fail";

    // Provide specific guidance based on widget type
    if (role === 'checkbox' || role === 'radio' || role === 'switch') {
      result.description = `${capitalizeFirstLetter(role)} is missing an accessible name - Screen reader users cannot identify its purpose. Add aria-label, aria-labelledby, or wrapped text content`;
    } else if (role === 'combobox' || role === 'textbox' || role === 'listbox') {
      result.description = `${capitalizeFirstLetter(role)} control needs an accessible name - Screen reader users cannot identify its purpose. Add aria-label, aria-labelledby, or a properly associated label`;
    } else if (role === 'tab' || role === 'tabpanel') {
      result.description = `${capitalizeFirstLetter(role)} requires a descriptive accessible name - Needed for navigation and orientation. Add aria-label or aria-labelledby referencing a heading`;
    } else if (role === 'menu' || role === 'menuitem') {
      result.description = `${capitalizeFirstLetter(role)} needs text content or an aria-label for proper identification - Menu items require descriptive names for screen reader users to navigate menus effectively`;
    } else {
      result.description = `${capitalizeFirstLetter(role)} widget is missing an accessible name - Screen reader users cannot identify its purpose. Add aria-label or aria-labelledby`;
    }
  } else if (accessibleName.trim() === '') {
    result.result = "fail";
    result.description = `${capitalizeFirstLetter(role)} widget has empty or whitespace-only accessible name - add meaningful text`;
  } else if (isPunctuation(accessibleName)) {
    // Handle punctuation-only accessible names
    result.result = "fail";
    result.description = "Punctuation-only accessible name";
    result.details = `The ${role} has an accessible name consisting only of punctuation characters ("${accessibleName}"). This does not provide meaningful information to screen reader users. Use descriptive text instead.`;
  } else if (role === 'tab' && hasAriaHiddenContent(element)) {
    // Special check for tabs with only aria-hidden content (icon-only tabs)
    result.result = "fail";
    result.description = "Icon-only tab without accessible name";
    result.details = `This tab contains content that is hidden from screen readers with aria-hidden="true" but has no accessible text alternative. Screen reader users cannot determine the tab's purpose. Add text content outside the aria-hidden element or use aria-label to provide an accessible name.`;
  } else if (role === 'tabpanel' && tabpanelReferencesEmptyName(element)) {
    // Get more specific information about the referenced elements to provide a better error message
    const labelledbyIds = element.getAttribute('aria-labelledby').split(/\s+/);
    const labelledbyInfo = getLabelledbyElementsInfo(element);

    // Special check for tabpanels that reference elements with no accessible name
    result.result = "fail";

    // Create a specific description based on the referenced elements
    if (labelledbyInfo.hasEmptyAccessibleName) {
      result.description = "Tabpanel references element with empty accessible name";
    } else if (labelledbyInfo.hasAriaHiddenContentOnly) {
      result.description = "Tabpanel references element with only aria-hidden content";
    } else if (labelledbyInfo.hasNoAccessibleName) {
      result.description = "Tabpanel references element with no accessible name";
    } else {
      result.description = "Tabpanel references element with inaccessible content";
    }

    // Don't use the hidden content as the accessible name
    result.accessibleName = '';

    // Build detailed error message
    let detailsMessage = `This tabpanel uses aria-labelledby="${element.getAttribute('aria-labelledby')}" to reference `;

    if (labelledbyInfo.hasEmptyAccessibleName) {
      detailsMessage += `element(s) with empty accessible names. `;
    } else if (labelledbyInfo.hasAriaHiddenContentOnly) {
      detailsMessage += `element(s) that contain only aria-hidden content (like icon-only tabs). `;
    } else if (labelledbyInfo.hasNoAccessibleName) {
      detailsMessage += `element(s) with no accessible name or text content. `;
    } else {
      detailsMessage += `element(s) with inaccessible content. `;
    }

    detailsMessage += `This creates an association that provides no meaningful information to screen reader users. `;

    if (labelledbyInfo.hasAriaHiddenContentOnly) {
      detailsMessage += `Add visible text content outside the aria-hidden elements or provide aria-label on the referenced elements. `;
    } else {
      detailsMessage += `Ensure the referenced elements have proper accessible names. `;
    }

    detailsMessage += `Alternatively, use aria-label to provide a direct name for this tabpanel.`;

    result.details = detailsMessage;
  } else {
    result.result = "pass";
    result.description = `${capitalizeFirstLetter(role)} widget has an accessible name`;
  }

  // Downgrade to warning if the element is hidden
  if (!isVisible && result.result === "fail") {
    result.result = "warn";
    result.description = result.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                   "This is reported as a warning rather than an error because the element is not visible " +
                   "to users, but would fail accessibility requirements if it becomes visible.";
  }

  return result;
}

/**
 * Test an iframe for an accessible name
 * @param {HTMLElement} element - iframe element
 * @returns {Object} Test result
 */
function testIframe(element) {
  const accessibleName = computeAccessibleName(element);

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: element.tagName.toLowerCase(),
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Initialize resultObj
  let resultObj;

  // Check for broken aria-labelledby references (set by computeAccessibleName)
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    resultObj = {
      result: "fail",
      description: `iframe has aria-labelledby referencing non-existent IDs: "${element._brokenAriaLabelledbyIds.join(', ')}"`
    };
  }
  // Otherwise determine result based on accessible name
  else if (!accessibleName) {
    resultObj = {
      result: "fail",
      description: "iframe is missing an accessible name - Screen readers announce frames with no context. Add a title attribute that describes the frame's purpose or content"
    };
  } else if (accessibleName.trim() === '') {
    resultObj = {
      result: "fail",
      description: "iframe has empty or whitespace-only title attribute - add meaningful description"
    };
  } else if (isPunctuation(accessibleName)) {
    resultObj = {
      result: "fail",
      description: `iframe has punctuation-only title "${accessibleName}" - Screen readers may not announce this. Add a descriptive title that explains the frame's purpose`,
      details: "Titles consisting only of punctuation characters are not meaningful to screen reader users and may not be announced at all by some assistive technologies."
    };
  } else if (accessibleName.length < 5) {
    resultObj = {
      result: "warn",
      description: `iframe title "${accessibleName}" is too short - use a more descriptive title`
    };
  } else {
    resultObj = {
      result: "pass",
      description: "iframe has an accessible name"
    };
  }

  // If the element has an accessibility issue but is hidden, downgrade to a warning
  if (!isVisible && resultObj.result === "fail") {
    result.result = "warn";
    result.description = resultObj.description + " (hidden element)";
    result.details = "This iframe is currently hidden (display: none, visibility: hidden, zero dimensions, or opacity: 0). " +
                     "This is reported as a warning rather than an error because the element is not visible " +
                     "to users, but would fail accessibility requirements if it becomes visible.";
  } else {
    result.result = resultObj.result;
    result.description = resultObj.description;
  }

  return result;
}

/**
 * Test a progress element for an accessible name
 * @param {HTMLElement} element - Progress element
 * @returns {Object} Test result
 */
function testProgress(element) {
  const accessibleName = computeAccessibleName(element);
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const isAriaProgress = role === 'progressbar' || role === 'meter';
  const elementType = isAriaProgress ?
    (role === 'meter' ? 'ARIA meter' : 'ARIA progressbar') :
    'Progress';

  // Check if the element is hidden
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  // Get current value information if available
  const hasValue = element.hasAttribute('value');
  const value = hasValue ? element.getAttribute('value') : null;
  const max = element.hasAttribute('max') ? element.getAttribute('max') : 100;
  const percentValue = hasValue ? Math.round((parseInt(value) / parseInt(max)) * 100) + '%' : 'Unknown';

  const result = {
    tagName: tagName,
    role: role,
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible,
    value: value,
    percentValue: percentValue
  };

  // Check for broken aria-labelledby references first
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    let resultObj = {
      result: "fail",
      description: `${elementType} element has aria-labelledby referencing non-existent IDs: "${element._brokenAriaLabelledbyIds.join(', ')}" - Users cannot determine the progress bar's purpose`,
      details: "When aria-labelledby references IDs that don't exist in the document, screen readers cannot provide an accessible name for the element."
    };

    // Apply the result, downgrading to warning if hidden
    if (!isVisible && resultObj.result === "fail") {
      result.result = "warn";
      result.description = resultObj.description + " (hidden element)";
      result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                    "This is reported as a warning rather than an error because the element is not visible " +
                    "to users, but would fail accessibility requirements if it becomes visible.";
    } else {
      result.result = resultObj.result;
      result.description = resultObj.description;
      if (resultObj.details) {
        result.details = resultObj.details;
      }
    }

    return result;
  }

  let resultObj;

  // Check for presence of accessible name
  if (!accessibleName) {
    // No accessible name at all
    resultObj = {
      result: "fail",
      description: `${elementType} element is missing an accessible name - Screen reader users cannot determine its purpose. Add aria-label, aria-labelledby, or a proper <label>`,
      details: `Progress indicators need accessible names to identify what is being measured (e.g., "Download progress", "Upload status", etc). The current value is ${percentValue}.`
    };
  } else if (accessibleName.trim() === '') {
    // Empty or whitespace-only accessible name
    resultObj = {
      result: "fail",
      description: `${elementType} element has empty or whitespace-only accessible name - Not meaningful to screen reader users. Add descriptive aria-label or aria-labelledby`,
      details: `Empty accessible names are not announced by screen readers, making it impossible for users to understand the purpose of the progress bar. The current value is ${percentValue}.`
    };
  } else if (isPunctuation(accessibleName)) {
    // Punctuation-only accessible name
    resultObj = {
      result: "fail",
      description: `${elementType} element has punctuation-only accessible name "${accessibleName}" - Not meaningful to screen reader users. Add descriptive aria-label or aria-labelledby`,
      details: `Accessible names consisting only of punctuation characters don't convey the purpose of the progress bar to screen reader users. The current value is ${percentValue}.`
    };
  } else if (isGenericLabel(accessibleName)) {
    // Generic accessible name
    resultObj = {
      result: "warn",
      description: `${elementType} element has generic accessible name "${accessibleName}" - Not descriptive of its purpose. Add more specific text that indicates what is being measured`,
      details: `Generic terms don't adequately describe what the progress indicator is measuring. The current value is ${percentValue}.`,
      title: "Generic progress description"
    };
  } else if (element._accessibleNameFromTitleOnly) {
    // Accessible name from title attribute only (not ideal but allowed)
    resultObj = {
      result: "warn",
      description: `${elementType} element uses only title attribute for accessible name "${accessibleName}" - Screen readers handle title inconsistently. Use aria-label or aria-labelledby instead`,
      details: "The title attribute is not reliably announced by all screen readers and is not visible on mobile devices. It's better to use aria-label or aria-labelledby for accessible names.",
      title: "Relies on title attribute"
    };
  } else if (element._accessibleNameFromLabel && element._labelType === 'wrapped') {
    // Wrapped labels can be problematic for voice control software
    resultObj = {
      result: "warn",
      description: `${elementType} element is wrapped by a label - May not work with voice control software. Use label with 'for' attribute instead`,
      details: "When a progress element is wrapped inside a label element, some voice control assistive technologies like Dragon Naturally Speaking may not recognize the association. Using a separate label with a 'for' attribute is more reliable.",
      title: "Wrapped label may cause issues"
    };
  } else {
    // Has a valid accessible name
    resultObj = {
      result: "pass",
      description: `${elementType} element has an appropriate accessible name`
    };
  }

  // Apply the result, downgrading to warning if hidden
  if (!isVisible && resultObj.result === "fail") {
    result.result = "warn";
    result.description = resultObj.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                  "This is reported as a warning rather than an error because the element is not visible " +
                  "to users, but would fail accessibility requirements if it becomes visible.";
  } else {
    result.result = resultObj.result;
    result.description = resultObj.description;
    if (resultObj.details) {
      result.details = resultObj.details;
    }
    if (resultObj.title) {
      result.title = resultObj.title;
    }
  }

  return result;
}

/**
 * Test a meter element for an accessible name
 * @param {HTMLElement} element - Meter element
 * @returns {Object} Test result
 */
function testMeter(element) {
  const accessibleName = computeAccessibleName(element);
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const isAriaMeter = role === 'meter';
  const elementType = isAriaMeter ? 'ARIA meter' : 'Meter';

  // Check if the element is hidden
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  // Get current value information if available
  const hasValue = element.hasAttribute('value');
  const value = hasValue ? element.getAttribute('value') : null;
  const min = element.hasAttribute('min') ? element.getAttribute('min') : 0;
  const max = element.hasAttribute('max') ? element.getAttribute('max') : 1;
  let percentValue = 'Unknown';

  // Calculate percentage if we have all values
  if (hasValue && min !== null && max !== null) {
    const rawValue = parseFloat(value);
    const rawMin = parseFloat(min);
    const rawMax = parseFloat(max);
    if (!isNaN(rawValue) && !isNaN(rawMin) && !isNaN(rawMax) && rawMax > rawMin) {
      const percentage = ((rawValue - rawMin) / (rawMax - rawMin)) * 100;
      percentValue = Math.round(percentage) + '%';
    }
  }

  const result = {
    tagName: tagName,
    role: role,
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible,
    value: value,
    percentValue: percentValue
  };

  // Check for broken aria-labelledby references first
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    let resultObj = {
      result: "fail",
      description: `${elementType} element has aria-labelledby referencing non-existent IDs: "${element._brokenAriaLabelledbyIds.join(', ')}" - Users cannot determine the meter's purpose`,
      details: "When aria-labelledby references IDs that don't exist in the document, screen readers cannot provide an accessible name for the element."
    };

    // Apply the result, downgrading to warning if hidden
    if (!isVisible && resultObj.result === "fail") {
      result.result = "warn";
      result.description = resultObj.description + " (hidden element)";
      result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                    "This is reported as a warning rather than an error because the element is not visible " +
                    "to users, but would fail accessibility requirements if it becomes visible.";
    } else {
      result.result = resultObj.result;
      result.description = resultObj.description;
      if (resultObj.details) {
        result.details = resultObj.details;
      }
    }

    return result;
  }

  let resultObj;

  // Check for presence of accessible name
  if (!accessibleName) {
    // No accessible name at all
    resultObj = {
      result: "fail",
      description: `${elementType} element is missing an accessible name - Screen reader users cannot determine its purpose. Add aria-label, aria-labelledby, or a proper <label>`,
      details: `Meter elements need accessible names to identify what is being measured (e.g., "Battery level", "Storage space used", etc). The current value is ${percentValue}.`
    };
  } else if (accessibleName.trim() === '') {
    // Empty or whitespace-only accessible name
    resultObj = {
      result: "fail",
      description: `${elementType} element has empty or whitespace-only accessible name - Not meaningful to screen reader users. Add descriptive aria-label or aria-labelledby`,
      details: `Empty accessible names are not announced by screen readers, making it impossible for users to understand the purpose of the meter. The current value is ${percentValue}.`
    };
  } else if (isPunctuation(accessibleName)) {
    // Punctuation-only accessible name
    resultObj = {
      result: "fail",
      description: `${elementType} element has punctuation-only accessible name "${accessibleName}" - Not meaningful to screen reader users. Add descriptive aria-label or aria-labelledby`,
      details: `Accessible names consisting only of punctuation characters don't convey the purpose of the meter to screen reader users. The current value is ${percentValue}.`
    };
  } else if (isGenericLabel(accessibleName)) {
    // Generic accessible name
    resultObj = {
      result: "warn",
      description: `${elementType} element has generic accessible name "${accessibleName}" - Not descriptive of its purpose. Add more specific text that indicates what is being measured`,
      details: `Generic terms don't adequately describe what the meter is measuring. The current value is ${percentValue}.`,
      title: "Generic meter description"
    };
  } else if (element._accessibleNameFromTitleOnly) {
    // Accessible name from title attribute only (not ideal but allowed)
    resultObj = {
      result: "warn",
      description: `${elementType} element uses only title attribute for accessible name "${accessibleName}" - Screen readers handle title inconsistently. Use aria-label or aria-labelledby instead`,
      details: "The title attribute is not reliably announced by all screen readers and is not visible on mobile devices. It's better to use aria-label or aria-labelledby for accessible names.",
      title: "Relies on title attribute"
    };
  } else if (element._accessibleNameFromLabel && element._labelType === 'wrapped') {
    // Wrapped labels can be problematic for voice control software
    resultObj = {
      result: "warn",
      description: `${elementType} element is wrapped by a label - May not work with voice control software. Use label with 'for' attribute instead`,
      details: "When a meter element is wrapped inside a label element, some voice control assistive technologies like Dragon Naturally Speaking may not recognize the association. Using a separate label with a 'for' attribute is more reliable.",
      title: "Wrapped label may cause issues"
    };
  } else {
    // Has a valid accessible name
    resultObj = {
      result: "pass",
      description: `${elementType} element has an appropriate accessible name`
    };
  }

  // Apply the result, downgrading to warning if hidden
  if (!isVisible && resultObj.result === "fail") {
    result.result = "warn";
    result.description = resultObj.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                  "This is reported as a warning rather than an error because the element is not visible " +
                  "to users, but would fail accessibility requirements if it becomes visible.";
  } else {
    result.result = resultObj.result;
    result.description = resultObj.description;
    if (resultObj.details) {
      result.details = resultObj.details;
    }
    if (resultObj.title) {
      result.title = resultObj.title;
    }
  }

  return result;
}

/**
 * Test a generic element with role="img" for an accessible name
 * @param {HTMLElement} element - Element with role="img" that is not an SVG
 * @returns {Object} Result object with pass/fail status and details
 */
function testElementWithRoleImg(element) {
  // More detailed debugging
  console.log(`Testing element with role="img": ${element.tagName}, id="${element.id}", class="${element.className}"`);

  const accessibleName = computeAccessibleName(element);
  console.log(`  Accessible name: "${accessibleName}"`);

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: element.tagName.toLowerCase(),
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  let resultObj = null;

  // Create a more descriptive element label (div[role="img"], span[role="img"], etc.)
  // Make it very prominent with uppercase and brackets for visibility in reports
  const elementLabel = `【${element.tagName.toUpperCase()}[role="img"]】`;

  // Check for broken aria-labelledby references first
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    resultObj = {
      result: "fail",
      description: `${elementLabel}: Broken aria-labelledby reference`,
      details: `The aria-labelledby attribute references IDs that don't exist: "${element._brokenAriaLabelledbyIds.join(', ')}". Screen readers cannot determine the element's purpose.`
    };
  } else if (!accessibleName) {
    // Missing accessible name
    resultObj = {
      result: "fail",
      description: `${elementLabel}: Missing accessible name`,
      details: "Elements with role=\"img\" must have an accessible name via aria-label, aria-labelledby, or other accessible name computation."
    };
  } else if (isWhitespaceOnly(accessibleName)) {
    // Whitespace-only accessible name
    // Override the accessibleName completely to prevent it from appearing in reports
    result.accessibleName = '';

    resultObj = {
      result: "fail",
      description: `${elementLabel}: Whitespace-only accessible name`,
      details: "Accessible names consisting only of whitespace characters are not announced by screen readers, making the element inaccessible to screen reader users."
    };
  } else if (isPunctuation(accessibleName)) {
    // Punctuation-only accessible name
    // Override the accessibleName completely to prevent it from appearing in reports
    result.accessibleName = '';

    resultObj = {
      result: "fail",
      description: `${elementLabel}: Punctuation-only accessible name`,
      details: "Accessible names consisting only of punctuation characters don't provide meaningful information to screen reader users."
    };
  } else if (accessibleName.includes('<') && accessibleName.includes('>')) {
    // Don't include the actual accessible name in the result for HTML markup
    result.accessibleName = ''; // Override the accessibleName in the result

    resultObj = {
      result: "fail",
      description: `${elementLabel}: HTML markup in accessible name`,
      details: "HTML tags in accessible names are not rendered properly by screen readers and can cause confusion. Use plain text without markup in accessible names."
    };
  } else if (isFilenameInText(accessibleName)) {
    // Filename as accessible name
    // Override the accessibleName completely to prevent it from appearing in reports
    result.accessibleName = '';

    resultObj = {
      result: "fail",
      description: `${elementLabel}: Filename as accessible name`,
      details: "Filenames do not adequately describe the content or purpose of an element to screen reader users."
    };
  } else if (isUrlInText(accessibleName)) {
    // URL as accessible name
    // Override the accessibleName completely to prevent it from appearing in reports
    result.accessibleName = '';

    resultObj = {
      result: "fail",
      description: `${elementLabel}: URL as accessible name`,
      details: "URLs do not adequately describe the content or purpose of an element to screen reader users."
    };
  } else if (accessibleName.toLowerCase().startsWith('image ') ||
             accessibleName.toLowerCase().includes('image of')) {
    // Redundant "image" text in accessible name
    resultObj = {
      result: "warn",
      description: `${elementLabel}: Redundant "image" in accessible name`,
      details: "Screen readers already announce the element as an image, so including 'image' or 'image of' in the accessible name is redundant and creates a poor user experience.",
      title: "Redundant text"
    };
  } else if (isGenericLabel(accessibleName)) {
    // Generic accessible name
    resultObj = {
      result: "warn",
      description: `${elementLabel}: Generic accessible name`,
      details: "Generic terms don't adequately describe the content or purpose of an element to screen reader users.",
      title: "Generic description"
    };
  } else {
    // Has an appropriate accessible name
    resultObj = {
      result: "pass",
      description: `${elementLabel}: Has appropriate accessible name`
    };
  }

  // Apply the result, downgrading to warning if hidden
  if (!isVisible && resultObj.result === "fail") {
    result.result = "warn";
    result.description = resultObj.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                  "This is reported as a warning rather than an error because the element is not visible " +
                  "to users, but would fail accessibility requirements if it becomes visible.";
  } else {
    result.result = resultObj.result;
    result.description = resultObj.description;
    if (resultObj.details) {
      result.details = resultObj.details;
    }
    if (resultObj.title) {
      result.title = resultObj.title;
    }
  }

  return result;
}

/**
 * Test a media element for an accessible name
 * @param {HTMLElement} element - Media element (audio/video)
 * @returns {Object} Test result
 */
function testMedia(element) {
  const accessibleName = computeAccessibleName(element);
  const tagName = element.tagName.toLowerCase();
  const isAriaVideo = element.getAttribute('role') === 'video';
  const elementType = isAriaVideo ? 'ARIA video' : tagName;
  
  const result = {
    tagName: tagName,
    role: isAriaVideo ? 'video' : null,
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName
  };
  
  // Check if the media element has an accessible name
  if (!accessibleName) {
    result.result = "fail";
    result.description = `${capitalizeFirstLetter(elementType)} is missing an accessible name`;
  } else if (accessibleName.trim() === '') {
    result.result = "fail";
    result.description = `${capitalizeFirstLetter(elementType)} has empty or whitespace-only accessible name`;
  } else {
    result.result = "pass";
    result.description = `${capitalizeFirstLetter(elementType)} has an accessible name`;
  }
  
  return result;
}

/**
 * Test an element with tabindex for an accessible name
 * @param {HTMLElement} element - Element with tabindex
 * @returns {Object} Test result
 */
function testElementWithTabindex(element) {
  // Skip elements that are already interactive or have roles that don't require accessible names
  // Elements with ARIA roles like "button" will be tested by their respective role-specific testers
  if (element.tagName === 'A' || element.tagName === 'BUTTON' || element.tagName === 'INPUT' ||
      element.tagName === 'SELECT' || element.tagName === 'TEXTAREA' || element.tagName === 'IFRAME' ||
      element.getAttribute('role') === 'presentation' || element.getAttribute('role') === 'none' ||
      // Skip elements with interactive roles as they'll be tested by their role-specific testers
      element.getAttribute('role') === 'button' || element.getAttribute('role') === 'link' ||
      element.getAttribute('role') === 'checkbox' || element.getAttribute('role') === 'menuitem' ||
      element.getAttribute('role') === 'tab' || element.getAttribute('role') === 'menuitemcheckbox' ||
      element.getAttribute('role') === 'menuitemradio' || element.getAttribute('role') === 'radio' ||
      element.getAttribute('role') === 'switch' || element.getAttribute('role') === 'textbox') {
    return null;
  }

  const accessibleName = computeAccessibleName(element);
  const tabindex = element.getAttribute('tabindex');

  // Only test elements with non-negative tabindex (tabindex="0" or positive values)
  if (tabindex && parseInt(tabindex) < 0) {
    return null;
  }

  // Special handling for container elements like headings, which get their accessible name from their content
  // This includes headings, list items, and other container elements
  if (element.tagName === 'H1' || element.tagName === 'H2' || element.tagName === 'H3' ||
      element.tagName === 'H4' || element.tagName === 'H5' || element.tagName === 'H6' ||
      element.tagName === 'LI' || element.tagName === 'DT' || element.tagName === 'DD' ||
      element.tagName === 'FIGURE' || element.tagName === 'FIGCAPTION' ||
      element.tagName === 'P' || element.tagName === 'DIV' || element.tagName === 'SPAN' ||
      element.getAttribute('role') === 'heading' || element.getAttribute('role') === 'listitem') {

    // If the container element has text content, it has an accessible name
    if (element.textContent && element.textContent.trim() !== '') {
      return null;  // Skip the test as container elements with content have accessible names
    }
  }

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: element.tagName.toLowerCase(),
    role: element.getAttribute('role'),
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Check for broken aria-labelledby references first
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    result.result = "fail"; // This is an error, not a warning
    result.description = `Element with tabindex=${tabindex} has aria-labelledby referencing non-existent IDs: "${element._brokenAriaLabelledbyIds.join(', ')}"`;
  }
  // Otherwise check if the element with tabindex has an accessible name
  else if (!accessibleName) {
    result.result = "fail"; // Changed from "warn" to "fail" - missing name on focusable element is an error
    result.description = `Element with tabindex=${tabindex} is missing an accessible name - Screen readers announce this as "clickable item" with no context. Add aria-label, aria-labelledby, or descriptive text content`;
  } else if (accessibleName.trim() === '') {
    result.result = "fail"; // Changed from "warn" to "fail" - empty name on focusable element is an error
    result.description = `Element with tabindex=${tabindex} has empty or whitespace-only accessible name - This provides no meaningful information to screen reader users. Add descriptive aria-label, aria-labelledby, or text content`;
  } else {
    result.result = "pass";
    result.description = `Element with tabindex=${tabindex} has an accessible name`;
  }

  // If the element has an accessibility issue but is hidden, downgrade to a warning
  if (!isVisible && result.result === "fail") {
    result.result = "warn";
    result.description = result.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                   "This is reported as a warning rather than an error because the element is not visible " +
                   "to users, but would fail accessibility requirements if it becomes visible.";
  }

  return result;
}

/**
 * Check if an element has an implicit label parent (is nested within a label element)
 * @param {HTMLElement} element - Element to check for implicit label
 * @returns {boolean} True if the element has an implicit label parent
 */
function hasImplicitLabelParent(element) {
  // Find closest label ancestor
  let parent = element.parentElement;
  while (parent) {
    if (parent.tagName === 'LABEL') {
      // Check if this is truly an implicit label (no 'for' attribute or 'for' pointing to a different element)
      const forAttribute = parent.getAttribute('for');
      if (!forAttribute) {
        // No 'for' attribute - this is an implicit label
        return true;
      } else if (element.id && forAttribute !== element.id) {
        // 'for' attribute points to a different element - this is an explicit label for something else
        return false;
      }
      // Otherwise, it's an explicit label for this element
      return false;
    }
    parent = parent.parentElement;
  }
  return false;
}

/**
 * Compute the accessible name for an element
 * @param {HTMLElement} element - Element to compute the accessible name for
 * @returns {string} The element's accessible name
 */
function computeAccessibleName(element) {
  // Special handling for fieldsets - legend must be first child to be considered valid
  if (element.tagName === 'FIELDSET') {
    const legend = element.querySelector('legend');
    if (legend && legend === element.firstElementChild && legend.textContent.trim() !== '') {
      return legend.textContent.trim();
    }
  }

  // Check for aria-labelledby
  if (element.hasAttribute('aria-labelledby')) {
    const ids = element.getAttribute('aria-labelledby').split(/\s+/);
    let name = '';

    // Check for broken aria-labelledby references
    let hasBrokenReferences = false;
    let brokenIds = [];

    for (const id of ids) {
      const labelElement = document.getElementById(id);
      if (labelElement) {
        name += (name ? ' ' : '') + labelElement.textContent.trim();
      } else {
        // Track broken references
        hasBrokenReferences = true;
        brokenIds.push(id);
      }
    }

    // Store information about broken aria-labelledby references on the element
    element._hasBrokenAriaLabelledby = hasBrokenReferences;
    element._brokenAriaLabelledbyIds = brokenIds;

    if (name) return name;
  }
  
  // Check for aria-label
  if (element.hasAttribute('aria-label')) {
    const label = element.getAttribute('aria-label');
    // Store if aria-label exists but is empty or whitespace-only
    if (label === '' || (label && label.trim() === '')) {
      element._hasEmptyAriaLabel = true;
      // Return empty string to properly trigger missing accessible name checks
      return '';
    }
    // Check if aria-label contains only punctuation
    if (label && isPunctuation(label)) {
      element._hasPunctuationOnlyAriaLabel = true;
      // We'll still return the label, but flag this as an issue
    }
    if (label) return label;
  }
  
  // Check for label element (for form controls and interactive elements)
  if (element.id && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.tagName === 'PROGRESS' || element.tagName === 'METER')) {
    const labelElement = document.querySelector(`label[for="${element.id}"]`);
    if (labelElement) {
      // Found a label referencing the element by ID
      // For progress elements, just store the fact that a label is used
      if (element.tagName === 'PROGRESS' || element.tagName === 'METER') {
        element._accessibleNameFromLabel = true;
        element._labelType = 'external'; // Label references element with 'for' attribute
      }
      return labelElement.textContent.trim();
    }

    // Check for wrapping label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      // Clone the label to avoid modifying the DOM
      const labelClone = parentLabel.cloneNode(true);

      // Remove the element itself from the clone
      const elementInLabel = labelClone.querySelector(`#${element.id}`);
      if (elementInLabel) {
        elementInLabel.parentNode.removeChild(elementInLabel);
      }

      // For progress elements, store the fact that a wrapping label is used
      if (element.tagName === 'PROGRESS' || element.tagName === 'METER') {
        element._accessibleNameFromLabel = true;
        element._labelType = 'wrapped'; // Element is wrapped by a label
      }

      return labelClone.textContent.trim();
    }
  }
  
  // Check for alt text on images and image map areas
  if ((element.tagName === 'IMG' || element.tagName === 'AREA') && element.hasAttribute('alt')) {
    return element.getAttribute('alt');
  }

  // Check for value on buttons
  if (element.tagName === 'INPUT' && 
      (element.type === 'button' || element.type === 'submit' || element.type === 'reset') && 
      element.hasAttribute('value')) {
    return element.value;
  }
  
  // Check for title on iframes
  if (element.tagName === 'IFRAME' && element.hasAttribute('title')) {
    return element.getAttribute('title');
  }
  
  // Check for title attribute (less preferred, but still valid)
  if (element.hasAttribute('title')) {
    const title = element.getAttribute('title');
    if (title) {
      // Mark elements that use title-only for accessible name
      element._accessibleNameFromTitleOnly = true;
      return title;
    }
  }
  
  // For buttons, links, heading elements, and other container elements, use text content as accessible name
  if (element.tagName === 'BUTTON' ||
      element.tagName === 'A' ||
      element.tagName === 'H1' || element.tagName === 'H2' || element.tagName === 'H3' ||
      element.tagName === 'H4' || element.tagName === 'H5' || element.tagName === 'H6' ||
      element.tagName === 'LI' || element.tagName === 'DT' || element.tagName === 'DD' ||
      element.tagName === 'FIGURE' || element.tagName === 'FIGCAPTION' ||
      element.getAttribute('role') === 'button' ||
      element.getAttribute('role') === 'link' ||
      element.getAttribute('role') === 'heading' ||
      element.getAttribute('role') === 'listitem') {

    // Special handling for links with images - needs to be prioritized higher than text content
    if (element.tagName === 'A') {
      const imgElement = element.querySelector('img[alt]:not([alt=""])');
      if (imgElement && imgElement.getAttribute('alt')) {
        const altText = imgElement.getAttribute('alt');
        if (altText && altText.trim() !== '') {
          // If the link contains an image with alt text, use that as the accessible name
          // This follows WCAG guidelines for links with images
          console.log(`Using alt text "${altText}" from image inside link:`, element);
          return altText;
        }
      }
    }

    // Use text content for other cases
    const textContent = element.textContent.trim();
    if (textContent) {
      return textContent;
    }
  }
  
  // For elements with certain ARIA roles, use text content
  const rolesThatUseTextContent = [
    'checkbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'option', 'radio', 'tab', 'treeitem'
  ];
  
  if (element.hasAttribute('role') && rolesThatUseTextContent.includes(element.getAttribute('role'))) {
    return element.textContent.trim();
  }
  
  // Default: return empty string (no accessible name found)
  return '';
}

/**
 * Check if an element is effectively hidden/invisible
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} True if the element is hidden, false if visible
 */
function isElementHidden(element) {
  if (!element) return true;

  // Check computed style
  const computedStyle = window.getComputedStyle(element);
  const isHiddenByComputedStyle = computedStyle.display === 'none' ||
                                 computedStyle.visibility === 'hidden' ||
                                 parseFloat(computedStyle.opacity) === 0;

  // Check inline style attributes which might not be fully reflected in computed style
  const hasInlineHiddenStyle = element.style && (
    element.style.display === 'none' ||
    element.style.visibility === 'hidden' ||
    element.getAttribute('style')?.includes('display: none') ||
    element.getAttribute('style')?.includes('visibility: hidden')
  );

  // Check for zero dimensions (especially relevant for iframes and some controls)
  const hasZeroDimensions = element.width === '0' && element.height === '0';

  // Element is hidden if any hiding method is detected
  return isHiddenByComputedStyle || hasInlineHiddenStyle || hasZeroDimensions;
}

/**
 * Generate a CSS selector for an element
 * @param {HTMLElement} element - Element to generate selector for
 * @returns {string} CSS selector
 */
function generateSelector(element) {
  // Try ID first
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }
  
  // Try a unique data attribute
  for (const attr of element.attributes) {
    if (attr.name.startsWith('data-') && attr.value) {
      // Check if this attribute value is unique
      const matchingElements = document.querySelectorAll(`[${attr.name}="${attr.value}"]`);
      if (matchingElements.length === 1) {
        return `[${attr.name}="${attr.value}"]`;
      }
    }
  }
  
  // Try name attribute for form elements
  if ((element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') && 
      element.name) {
    const matchingElements = document.querySelectorAll(`${element.tagName.toLowerCase()}[name="${element.name}"]`);
    if (matchingElements.length === 1) {
      return `${element.tagName.toLowerCase()}[name="${element.name}"]`;
    }
  }
  
  // Build a path
  let path = [];
  let currentElement = element;
  
  while (currentElement) {
    // Skip document and window
    if (!currentElement.tagName) {
      break;
    }
    
    let selector = currentElement.tagName.toLowerCase();
    
    if (currentElement.id) {
      selector += `#${CSS.escape(currentElement.id)}`;
      path.unshift(selector);
      break;
    } else {
      // Add class if available and seems stable (not auto-generated)
      const classes = Array.from(currentElement.classList)
        .filter(c => !c.match(/^[0-9]/) && c.length > 2 && !c.includes('active') && !c.includes('selected'));
      
      if (classes.length > 0) {
        selector += `.${classes.join('.')}`;
      }
      
      // Add position
      let siblings = 0;
      let position = 0;
      
      for (const child of currentElement.parentNode.children) {
        if (child.tagName === currentElement.tagName) {
          siblings++;
          
          if (child === currentElement) {
            position = siblings;
          }
        }
      }
      
      if (siblings > 1) {
        selector += `:nth-of-type(${position})`;
      }
      
      path.unshift(selector);
      
      // Move up to parent
      currentElement = currentElement.parentNode;
      
      // Stop at body or if selector is getting too long
      if (currentElement === document.body || path.length > 5) {
        path.unshift('body');
        break;
      }
    }
  }
  
  return path.join(' > ');
}

/**
 * Properly remove the highlight overlay with a fade-out animation
 */
function removeHighlightOverlay() {
  if (highlightOverlay && highlightOverlay.parentNode) {
    // Add fade-out transition
    highlightOverlay.style.opacity = '0';
    
    // Remove from DOM after animation completes
    setTimeout(() => {
      if (highlightOverlay && highlightOverlay.parentNode) {
        document.body.removeChild(highlightOverlay);
        highlightOverlay = null;
      }
    }, 300); // Match the transition duration
  }
}

/**
 * Highlight an element on the page
 * @param {HTMLElement} element - Element to highlight
 * @param {boolean} scrollIntoView - Whether to scroll the element into view
 */
function highlightElement(element, scrollIntoView) {
  // Wait for any in-progress removals to complete before adding a new highlight
  if (removalInProgress) {
    setTimeout(() => highlightElement(element, scrollIntoView), 150);
    return;
  }

  // Force removal of all highlights to ensure a clean slate
  cleanupAllHighlights();

  // Function to apply the highlight
  const applyHighlight = () => {
    try {
      // Get element dimensions and position
      const rect = element.getBoundingClientRect();

      // Handle zero-size elements
      if (rect.width === 0 && rect.height === 0) {
        console.warn("Element has zero size, using parent for highlighting");
        let parentRect = null;
        let currentParent = element.parentElement;
        while (currentParent && !parentRect) {
          const pRect = currentParent.getBoundingClientRect();
          if (pRect.width > 0 && pRect.height > 0) {
            parentRect = pRect;
          } else {
            currentParent = currentParent.parentElement;
          }
        }

        // Use parent rect if found
        if (parentRect) {
          createHighlightOverlay(parentRect);
        } else {
          console.warn("Could not find parent with non-zero size for highlighting");
        }
      } else {
        // Normal case
        createHighlightOverlay(rect);
      }
    } catch (error) {
      console.error("Error creating highlight:", error);
    }
  };

  // Apply the highlight - scrolling is handled in panel.js
  applyHighlight();
}

/**
 * Scroll an element into view in the viewport
 * @param {HTMLElement} element - Element to scroll into view
 *
 * Note: This function is no longer used as scrolling is now handled directly in panel.js
 * through chrome.devtools.inspectedWindow.eval()
 */
function scrollElementIntoView(element) {
  // Function kept for backwards compatibility
  return;
}

/**
 * Create a highlight overlay for the given element rectangle
 * @param {DOMRect} rect - The rectangle to highlight
 */
function createHighlightOverlay(rect) {
  // Create highlight overlay
  highlightOverlay = document.createElement('div');

  // Add a class name to make it easier to locate later
  highlightOverlay.className = 'carnforth-highlight-overlay';
  highlightOverlay.id = 'carnforth-highlight-' + Date.now();

  // Set DOM attachment point
  let container = document.body;

  // Try to find if there's another fixed position container that would work better
  // (Some sites have overlays with higher z-index than body)
  const possibleContainers = [
    document.querySelector('html'),
    document.querySelector('body'),
    document.querySelector('#root'),
    document.querySelector('main'),
    document.querySelector('div[role="main"]'),
    document.querySelector('.app'),
    document.querySelector('#app')
  ].filter(el => el !== null);

  if (possibleContainers.length > 1) {
    // Choose the container with highest z-index if possible
    let maxZ = -1;
    possibleContainers.forEach(el => {
      const zIndex = parseInt(window.getComputedStyle(el).zIndex) || 0;
      if (zIndex > maxZ) {
        maxZ = zIndex;
        container = el;
      }
    });
  }

  // First try to inject a stylesheet with our custom class
  try {
    if (!document.querySelector('#carnforth-highlight-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'carnforth-highlight-styles';
      styleEl.textContent = `
        .carnforth-highlight-overlay {
          position: absolute !important;
          border: 6px solid #FF0000 !important;
          outline: 2px solid white !important;
          box-shadow: inset 0 0 0 2px white !important;
          border-radius: 0px !important;
          pointer-events: none !important;
          z-index: 2147483647 !important;
          transition: opacity 0.3s ease-in-out !important;
          box-sizing: border-box !important;
          opacity: 1 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      `;
      document.head.appendChild(styleEl);
    }
  } catch (e) {
    console.warn("Failed to inject stylesheet:", e);
  }

  // Simple and reliable approach - just add outlines to the element
  const borderWidth = 6;
  const outlineWidth = 2;
  const padding = 2; // Extra padding around the element
  const totalPadding = borderWidth + outlineWidth * 2 + padding;

  // IMPORTANT: getBoundingClientRect() returns position relative to viewport, not the page
  // We need to convert to page coordinates by adding scroll position
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;

  // Get element position from viewport coordinates - ensure values are finite numbers
  const viewportLeft = isFinite(rect.left) ? rect.left : 0;
  const viewportTop = isFinite(rect.top) ? rect.top : 0;
  const elementWidth = isFinite(rect.width) ? rect.width : 0;
  const elementHeight = isFinite(rect.height) ? rect.height : 0;

  // Convert to absolute page coordinates by adding scroll position
  const pageLeft = viewportLeft + scrollX;
  const pageTop = viewportTop + scrollY;
  const pageRight = pageLeft + elementWidth;
  const pageBottom = pageTop + elementHeight;

  // For first click scenarios, ensure we're always showing something valid
  // even if the position calculation is off
  const minHighlightSize = 50; // Minimum size to ensure visibility

  // Create a highlight that surrounds the element with padding
  // Work with page coordinates, not viewport coordinates
  // Ensure we don't go off-screen by using Math.max for left/top and Math.min for right/bottom
  const pageHighlightLeft = Math.max(0, pageLeft - totalPadding);
  const pageHighlightTop = Math.max(0, pageTop - totalPadding);
  // Get viewport dimensions
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;

  // Get total document dimensions (for scrolling area)
  const documentWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
    document.documentElement.clientWidth
  );
  const documentHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    document.documentElement.clientHeight
  );

  // Calculate position ensuring the highlight doesn't go off the document
  const pageHighlightRight = Math.min(documentWidth, pageRight + totalPadding);
  const pageHighlightBottom = Math.min(documentHeight, pageBottom + totalPadding);

  // Calculate the final sizes, ensuring minimum dimensions
  let width = Math.max(minHighlightSize, pageHighlightRight - pageHighlightLeft);
  let height = Math.max(minHighlightSize, pageHighlightBottom - pageHighlightTop);

  // These are already absolute page coordinates, so we don't need to add scroll position

  // Debug information removed
  // Keep minimal logging for troubleshooting
  console.log("Creating highlight overlay: " + width + "x" + height);

  // Apply the highlight styling using page coordinates
  highlightOverlay.style.cssText = `
    position: absolute !important;
    left: ${pageHighlightLeft}px !important;
    top: ${pageHighlightTop}px !important;
    width: ${width}px !important;
    height: ${height}px !important;
    border: ${borderWidth}px solid #FF0000 !important;
    outline: ${outlineWidth}px solid white !important;
    box-shadow: inset 0 0 0 ${outlineWidth}px white !important;
    border-radius: 0px !important;
    pointer-events: none !important;
    z-index: 2147483647 !important;
    box-sizing: border-box !important;
    opacity: 1 !important;
    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
    display: block !important;
    visibility: visible !important;
  `;

  try {
    // Append the highlight to the container
    container.appendChild(highlightOverlay);

    // Create a pulsing animation effect
    animateHighlight(highlightOverlay);

    // Set up an update interval to handle page changes
    setupPositionUpdateInterval(highlightOverlay, rect);

    // Log success
    console.log("Highlight overlay created and added to DOM");
  } catch (error) {
    console.error("Error appending highlight:", error);

    // Fallback method: try to insert at the top level
    try {
      document.documentElement.appendChild(highlightOverlay);
      console.log("Highlight added using fallback method");
    } catch (e) {
      console.error("Failed to append highlight even with fallback:", e);
    }
  }
}

/**
 * Set up an interval to update the highlight position
 * @param {HTMLElement} overlay - The highlight overlay element
 * @param {DOMRect} originalRect - The original element rectangle
 */
function setupPositionUpdateInterval(overlay, originalRect) {
  // Since we've used absolute page coordinates (not viewport coordinates)
  // We no longer need to update the position on scroll - it should stay fixed to the page

  const updateId = Date.now();
  overlay.dataset.updateId = updateId;

  // Store information for debugging only
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;

  // Store both viewport (relative) and page (absolute) coordinates
  overlay.dataset.viewportLeft = originalRect.left;
  overlay.dataset.viewportTop = originalRect.top;
  overlay.dataset.width = originalRect.width;
  overlay.dataset.height = originalRect.height;
  overlay.dataset.pageLeft = (originalRect.left + scrollX);
  overlay.dataset.pageTop = (originalRect.top + scrollY);

  // We only need this function to clean up resources when overlay is removed
  function checkOverlay() {
    if (!overlay || !overlay.parentNode || overlay.dataset.updateId !== updateId.toString()) {
      return; // Overlay is gone, stop checking
    }

    // Continue checking as long as the overlay exists
    requestAnimationFrame(checkOverlay);
  }

  // Start checking
  requestAnimationFrame(checkOverlay);
}

/**
 * Remove the highlight overlay if it exists
 * Ensures thorough cleanup to prevent multiple overlays
 */
function removeHighlightOverlay() {
  // If we're already removing a highlight, don't start another removal process
  if (removalInProgress) return;

  removalInProgress = true;

  // First, remove the specific tracked overlay with fade effect
  if (highlightOverlay && highlightOverlay.parentNode) {
    highlightOverlay.style.opacity = '0';
    setTimeout(() => {
      cleanupAllHighlights();
    }, 100); // shorter timeout to be more responsive
  } else {
    // If no specific overlay is tracked, still check for any that might exist
    cleanupAllHighlights();
  }
}

/**
 * Find and remove all possible highlight elements from the page
 * This is more thorough than the simple removeHighlightOverlay
 */
function cleanupAllHighlights() {
  // Clear the tracked highlight
  if (highlightOverlay && highlightOverlay.parentNode) {
    try {
      highlightOverlay.parentNode.removeChild(highlightOverlay);
    } catch (e) {
      console.warn("Error removing highlight overlay:", e);
    }
  }
  highlightOverlay = null;

  // Try to remove any injected styles
  try {
    const styleEl = document.querySelector('#carnforth-highlight-styles');
    if (styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
    }
  } catch (e) {
    console.warn("Error removing highlight styles:", e);
  }

  // Find all possible highlight elements in the DOM
  try {
    // Try all strategies to find highlight elements
    const selectors = [
      // By ID pattern
      '[id^="carnforth-highlight-"]',
      // By class
      '.carnforth-highlight-overlay',
      // By style attributes that match our highlight styles
      'div[style*="border: 6px solid #FF0000"]',
      'div[style*="border: 6px solid rgb(255, 0, 0)"]',
      'div[style*="outline: 2px solid white"]',
      'div[style*="box-shadow: inset"]',
      'div[style*="z-index: 2147483647"]',
      // Legacy styles from previous versions
      'div[style*="border: 2px solid rgb(139, 0, 0)"]',
      'div[style*="z-index: 999999"]'
    ];

    // Search for elements matching any of these selectors
    const allPossibleOverlays = document.querySelectorAll(selectors.join(', '));

    console.log(`Found ${allPossibleOverlays.length} potential highlight overlays to remove`);

    // Remove all found overlays
    allPossibleOverlays.forEach(overlay => {
      if (overlay.parentNode) {
        try {
          overlay.parentNode.removeChild(overlay);
          console.log("Removed overlay:", overlay.id || overlay.className || "unknown");
        } catch (e) {
          console.warn("Error removing highlight element:", e);
        }
      }
    });

    // Additionally, look for any div with absolute positioning and a red border as fallback
    const allDivs = document.querySelectorAll('div[style*="position: absolute"]');
    allDivs.forEach(div => {
      const style = window.getComputedStyle(div);
      if (
        (style.border.includes('red') || style.border.includes('rgb(255, 0, 0)') || style.borderColor.includes('red')) &&
        style.pointerEvents === 'none'
      ) {
        try {
          div.parentNode.removeChild(div);
          console.log("Removed potential highlight div by style check");
        } catch (e) {
          console.warn("Error removing potential highlight div:", e);
        }
      }
    });
  } catch (e) {
    console.warn("Error in cleanup process:", e);
  }

  // Reset state variables
  highlightOverlay = null;
  currentlyHighlighted = null; // Make sure this is also reset if defined elsewhere
  isHighlightInProgress = false; // Make sure any in-progress flags are reset

  // Reset the removal flag
  removalInProgress = false;

  console.log("Cleanup completed, all highlight elements should be removed");
}

/**
 * Animate the highlight overlay with a pulsing effect
 * @param {HTMLElement} element - Element to animate
 */
function animateHighlight(element) {
  // Safety check - if element doesn't exist or has no parent, don't attempt to animate
  if (!element || !element.parentNode) {
    return;
  }

  let opacity = 1;
  let direction = -1; // Start by fading out
  // Use fixed 6px border now
  const borderWidth = 6;
  let frameCount = 0;
  let isAnimating = true;

  // Give the element a unique ID we can track
  const animationId = 'highlight-' + Date.now();
  element.dataset.animationId = animationId;

  const animate = () => {
    // If element no longer exists, has no parent, or another animation has started
    if (!element || !element.parentNode || element.dataset.animationId !== animationId || !isAnimating) {
      isAnimating = false;
      return;
    }

    try {
      frameCount++;

      // Only update opacity every frame
      opacity += direction * 0.01; // Slower animation for smoother effect

      // Switch direction at the bounds
      if (opacity <= 0.8) { // Higher minimum opacity for better visibility
        direction = 1;
      } else if (opacity >= 1) {
        direction = -1;
      }

      // Update styles every 15 frames for smoother animation
      if (frameCount % 15 === 0) {
        // Only update opacity to avoid layout shifts
        // This is more efficient than reapplying all styles
        try {
          element.style.opacity = opacity.toString();
        } catch (e) {
          // If direct style update fails, try the complete cssText approach
          try {
            // Get current position values
            const computedStyle = window.getComputedStyle(element);
            const left = computedStyle.left;
            const top = computedStyle.top;
            const width = computedStyle.width;
            const height = computedStyle.height;

            // Apply all styles to ensure it stays visible
            element.style.cssText = `
              position: fixed !important;
              left: ${left} !important;
              top: ${top} !important;
              width: ${width} !important;
              height: ${height} !important;
              border: 6px solid #FF0000 !important;
              outline: 2px solid white !important;
              box-shadow: inset 0 0 0 2px white !important;
              border-radius: 2px !important;
              pointer-events: none !important;
              z-index: 2147483647 !important;
              transition: opacity 0.3s ease-in-out !important;
              box-sizing: border-box !important;
              opacity: ${opacity} !important;
              margin: 0 !important;
              padding: 0 !important;
              transform: none !important;
              display: block !important;
              visibility: visible !important;
            `;
          } catch (innerError) {
            console.warn('Failed to update styles during animation:', innerError);
          }
        }
      } else {
        // Update opacity on every frame for smooth transition
        element.style.opacity = opacity.toString();
      }

      // Only continue if the element is still valid and we're still animating
      if (element && element.parentNode && element.dataset.animationId === animationId && isAnimating) {
        requestAnimationFrame(animate);
      }
    } catch (error) {
      // If any error occurs, stop animating
      console.warn('Error animating highlight:', error);
      isAnimating = false;
    }
  };

  // Start the animation
  requestAnimationFrame(animate);
}

/**
 * Check if a string is only whitespace
 * @param {string} text - The text to check
 * @returns {boolean} True if the text contains only whitespace characters
 */
function isWhitespaceOnly(text) {
  return text !== null && text !== undefined && text.trim() === '';
}

/**
 * Check if text is a filename
 * @param {string} text - Text to check
 * @returns {boolean} True if text appears to be a filename
 */
function isFilenameInText(text) {
  // Check if the text matches common file extensions
  const fileExtPattern = /\.(jpg|jpeg|png|gif|webp|svg|bmp|pdf|doc|docx|xls|xlsx|txt|csv|zip|rar|mp3|mp4|wav|avi|mov)$/i;
  if (fileExtPattern.test(text.trim())) {
    return true;
  }

  // Check for image paths or URLs with file extensions
  const pathPattern = /(\/|\\)[^\/\\]+\.(jpg|jpeg|png|gif|webp|svg|bmp|pdf|doc|docx|xls|xlsx|txt|csv|zip|rar|mp3|mp4|wav|avi|mov)$/i;
  if (pathPattern.test(text.trim())) {
    return true;
  }

  return false;
}

/**
 * Check if text appears to be a URL
 * @param {string} text - The text to check
 * @returns {boolean} Whether the text appears to be a URL
 */
function isUrlInText(text) {
  const trimmedText = text.trim();

  // Check for common URL patterns
  if (/^https?:\/\//i.test(trimmedText)) {
    return true;
  }

  // Check for "www." patterns
  if (/^www\./i.test(trimmedText)) {
    return true;
  }

  // Check for common TLDs in domain-like patterns
  if (/\.(com|org|net|edu|gov|io|co|us|uk|ca|au|de|fr)(\s|$|\/)/i.test(trimmedText)) {
    return true;
  }

  return false;
}

/**
 * Check if text appears to be a URL
 * @param {string} text - Text to check
 * @returns {boolean} True if text appears to be a URL
 */
function isUrlLike(text) {
  const trimmedText = text.trim();

  // Check common URL patterns
  if (trimmedText.startsWith('http://') ||
      trimmedText.startsWith('https://') ||
      trimmedText.startsWith('www.')) {
    return true;
  }

  // Check for domain-like patterns
  const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/.*)?$/;
  if (domainPattern.test(trimmedText)) {
    return true;
  }

  return false;
}

/**
 * Check if text consists only of punctuation
 * @param {string} text - Text to check
 * @returns {boolean} True if text is only punctuation
 */
function isPunctuation(text) {
  // Enhanced pattern to include more punctuation symbols, including dots and ellipses
  return /^[.,\/#!$%\^&\*;:{}=\-_`~()\[\]"'…]+$/.test(text.trim());
}

/**
 * Get detailed information about elements referenced by aria-labelledby
 * @param {HTMLElement} element - The element with aria-labelledby to analyze
 * @returns {Object} Information about the referenced elements
 */
function getLabelledbyElementsInfo(element) {
  const result = {
    hasEmptyAccessibleName: false,
    hasAriaHiddenContentOnly: false,
    hasNoAccessibleName: false,
    hasNonExistentIds: false,
    referencedElements: []
  };

  if (!element.hasAttribute('aria-labelledby')) {
    return result;
  }

  // Get the IDs referenced by aria-labelledby
  const labelledbyIds = element.getAttribute('aria-labelledby').split(/\s+/);

  // Analyze each referenced element
  for (const id of labelledbyIds) {
    if (!id) continue;

    const referencedElement = document.getElementById(id);
    if (!referencedElement) {
      result.hasNonExistentIds = true;
      continue;
    }

    result.referencedElements.push(referencedElement);

    // Calculate accessible name for the referenced element
    const accessibleName = computeAccessibleName(referencedElement);

    // Check if the referenced element has aria-hidden content
    const hasHiddenContent = hasAriaHiddenContent(referencedElement);

    // Check for empty accessible name
    if (accessibleName && accessibleName.trim() === '') {
      result.hasEmptyAccessibleName = true;
    }

    // Check for no accessible name at all
    if (!accessibleName) {
      result.hasNoAccessibleName = true;
    }

    // Check for no accessible name but has hidden content
    if (!accessibleName && hasHiddenContent) {
      result.hasAriaHiddenContentOnly = true;
    }
  }

  return result;
}

/**
 * Check if a tabpanel references elements with no accessible name via aria-labelledby
 * @param {HTMLElement} element - The tabpanel element to check
 * @returns {boolean} True if the tabpanel references elements with no accessible name
 */
function tabpanelReferencesEmptyName(element) {
  // Check if the element has aria-labelledby
  if (!element.hasAttribute('aria-labelledby')) {
    return false;
  }

  // Get the IDs referenced by aria-labelledby
  const labelledbyIds = element.getAttribute('aria-labelledby').split(/\s+/);

  // Check if any of the referenced elements have no accessible name
  for (const id of labelledbyIds) {
    if (!id) continue;

    const referencedElement = document.getElementById(id);
    if (!referencedElement) continue;

    // Calculate accessible name for the referenced element
    const accessibleName = computeAccessibleName(referencedElement);

    // Check if the referenced element has aria-hidden content
    const hasHiddenContent = hasAriaHiddenContent(referencedElement);

    // If it has no accessible name but has hidden content, it's a problem
    if (!accessibleName && hasHiddenContent) {
      return true;
    }

    // If it has no accessible name at all (completely empty), it's a problem
    if (!accessibleName) {
      return true;
    }

    // Or if it has an empty accessible name
    if (accessibleName && accessibleName.trim() === '') {
      return true;
    }
  }

  return false;
}

/**
 * Check if an element contains only aria-hidden content
 * This is useful for detecting icon-only elements with no accessible text
 * @param {HTMLElement} element - The element to check
 * @returns {boolean} True if the element has aria-hidden content but no accessible text
 */
function hasAriaHiddenContent(element) {
  // Check if the element has any aria-hidden elements
  const ariaHiddenElements = element.querySelectorAll('[aria-hidden="true"]');
  if (ariaHiddenElements.length === 0) {
    return false;
  }

  // Get the text content of the element, excluding aria-hidden content
  let visibleTextContent = '';

  // Helper function to get text content excluding aria-hidden elements
  function getVisibleTextContent(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (node.hasAttribute && node.hasAttribute('aria-hidden') &&
        node.getAttribute('aria-hidden') === 'true') {
      return '';
    }

    let text = '';
    for (const child of node.childNodes) {
      text += getVisibleTextContent(child);
    }
    return text;
  }

  visibleTextContent = getVisibleTextContent(element).trim();

  // If there's no visible text content but there are aria-hidden elements,
  // this is likely an icon-only element
  return visibleTextContent === '';
}

/**
 * Check if text contains only generic label terms that don't provide specific meaning
 * @param {string} text - Text to check
 * @returns {boolean} True if the text only contains generic terms like "label"
 */
function isGenericLabel(text) {
  // Normalize the text - convert to lowercase and trim
  const normalized = text.trim().toLowerCase();

  // List of generic terms that don't provide specific meaning when used alone
  const genericTerms = [
    'label',
    'field',
    'input',
    'text',
    'textbox',
    'textarea',
    'form field',
    'form input',
    'name',
    'enter text',
    'enter input',
    // Added for image inputs
    'image',
    'button',
    'submit',
    'icon',
    'picture',
    'photo',
    'graphic'
  ];

  // Check if the normalized text exactly matches one of the generic terms
  return genericTerms.includes(normalized);
}

/**
 * Check if text is generic and not descriptive
 * @param {string} text - Text to check
 * @returns {boolean} True if text is generic
 */
function isGenericText(text) {
  const lowercaseText = text.toLowerCase().trim();
  const genericTerms = ['button', 'click', 'click here', 'click me', 'submit', 'go', 'next', 'previous', 'send', 'ok'];
  
  return genericTerms.includes(lowercaseText);
}

/**
 * Check if link text is generic and not descriptive
 * @param {string} text - Text to check
 * @returns {boolean} True if text is generic for a link
 */
function isGenericLinkText(text) {
  const lowercaseText = text.toLowerCase().trim();
  const genericTerms = ['click', 'click here', 'click me', 'link', 'more', 'read more', 'details', 'learn more', 'go', 'here'];
  
  return genericTerms.includes(lowercaseText);
}

/**
 * Capitalize the first letter of a string
 * @param {string} string - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Generate XPath for an element
 * @param {HTMLElement} element - Element to generate XPath for
 * @returns {string} XPath
 */
function getXPath(element) {
  if (!element) return "";

  try {
    // Check if the element has an ID
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    // No ID, so we need to count siblings
    let path = '';
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let tag = current.tagName.toLowerCase();
      let siblings = 0;
      let hasSameTagSiblings = false;
      let index = 0;

      // Count preceding siblings
      for (let sibling = current.previousSibling; sibling; sibling = sibling.previousSibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE) {
          siblings++;
          if (sibling.tagName.toLowerCase() === tag) {
            hasSameTagSiblings = true;
            index++;
          }
        }
      }

      // Count following siblings with same tag
      for (let sibling = current.nextSibling; sibling; sibling = sibling.nextSibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName.toLowerCase() === tag) {
          hasSameTagSiblings = true;
          break;
        }
      }

      // Add tag and index if needed
      if (hasSameTagSiblings) {
        path = `/${tag}[${index + 1}]${path}`;
      } else {
        path = `/${tag}${path}`;
      }

      // Move up to parent
      current = current.parentNode;

      // Stop at the document level
      if (current === document.documentElement) {
        path = `/${current.tagName.toLowerCase()}${path}`;
        break;
      }
    }

    return path;
  } catch (error) {
    return "Error generating XPath: " + error.message;
  }
}

/**
 * Generate debug information for an element
 * @param {HTMLElement} element - Element to debug
 * @returns {Object} Debug information
 */
function generateDebugInfo(element) {
  try {
    if (!element) {
      return { error: "Element is null or undefined" };
    }

    // Get computed style
    const computedStyle = window.getComputedStyle(element);

    // Check visibility
    const isVisible = !(
      computedStyle.display === 'none' ||
      computedStyle.visibility === 'hidden' ||
      computedStyle.opacity === '0' ||
      (element.getBoundingClientRect().width === 0 && element.getBoundingClientRect().height === 0)
    );

    // Get bounding box
    const boundingBox = element.getBoundingClientRect().toJSON();

    // Get element source
    let sourceFragment = element.outerHTML;
    if (sourceFragment && sourceFragment.length > 500) {
      sourceFragment = sourceFragment.substring(0, 500) + '...';
    }

    // Get element XPath
    const xpath = getXPath(element);

    // Get full selector chain
    const selectorChain = generateSelector(element);

    // Get stacking context and z-index info
    const zIndex = computedStyle.zIndex;
    const position = computedStyle.position;

    // Check if element is in an iframe
    const isInIframe = window !== window.top;

    // Element ancestry information
    let ancestry = [];
    let parent = element.parentElement;
    while (parent && ancestry.length < 5) {
      ancestry.push({
        tag: parent.tagName.toLowerCase(),
        id: parent.id || null,
        classes: Array.from(parent.classList).join('.'),
        position: window.getComputedStyle(parent).position,
        zIndex: window.getComputedStyle(parent).zIndex
      });
      parent = parent.parentElement;
    }

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: Array.from(element.classList),
      xpath: xpath,
      selectorChain: selectorChain,
      sourceFragment: sourceFragment,
      boundingBox: boundingBox,
      zIndex: zIndex,
      position: position,
      display: computedStyle.display,
      visibility: computedStyle.visibility,
      opacity: computedStyle.opacity,
      overflow: computedStyle.overflow,
      isVisible: isVisible,
      isInIframe: isInIframe,
      ancestry: ancestry,
      windowSize: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      scrollPosition: {
        x: window.scrollX,
        y: window.scrollY
      }
    };
  } catch (error) {
    return {
      error: "Error generating debug info: " + error.message
    };
  }
}

/**
 * Check if an element has only an icon as its text content
 * @param {HTMLElement} element - Element to check
 * @param {string} accessibleName - The computed accessible name
 * @returns {boolean} True if the element has only an icon
 */
/**
 * Test an SVG element with role="img" for an accessible name
 * @param {SVGElement} element - SVG element with role="img"
 * @returns {Object} Test result
 */
function testSVGImage(element) {
  const accessibleName = computeAccessibleName(element);

  // Check if the element is hidden using our helper function
  const isHidden = isElementHidden(element);
  const isVisible = !isHidden;

  const result = {
    tagName: element.tagName.toLowerCase(),
    selector: generateSelector(element),
    outerHTML: element.outerHTML,
    accessibleName: accessibleName,
    isVisible: isVisible
  };

  // Check for a <title> element in the SVG
  const hasTitle = element.querySelector('title') !== null;
  const titleElement = element.querySelector('title');
  const titleContent = titleElement ? titleElement.textContent : null;
  result.hasTitleElement = hasTitle;
  result.titleContent = titleContent;

  // Determine if the element is explicitly marked as decorative
  const isDecorative = (element.hasAttribute('aria-hidden') && element.getAttribute('aria-hidden') === 'true') ||
                      (element.hasAttribute('role') && element.getAttribute('role') === 'presentation') ||
                      (element.hasAttribute('role') && element.getAttribute('role') === 'none');

  // If the element is decorative, it should have no accessible name
  if (isDecorative) {
    if (accessibleName === '') {
      result.result = "pass";
      result.description = "Decorative SVG image correctly has no accessible name";
    } else {
      result.result = "warn";
      result.description = "Decorative SVG image (with role='presentation' or 'none') should not have an accessible name";
    }
    return result;
  }

  // Check for broken aria-labelledby references first
  if (element.hasAttribute('aria-labelledby') && element._hasBrokenAriaLabelledby) {
    // Add the broken IDs to the result
    result.brokenAriaLabelledby = true;
    result.brokenAriaLabelledbyIds = element._brokenAriaLabelledbyIds;

    // Create a specific error message for broken aria-labelledby
    let resultObj = {
      result: "fail",
      description: "Broken aria-labelledby references",
      details: "When aria-labelledby references IDs that don't exist in the document, screen readers cannot provide an accessible name for the element."
    };

    // Apply the result
    if (!isVisible && resultObj.result === "fail") {
      result.result = "warn";
      result.description = resultObj.description + " (hidden element)";
      result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                   "This is reported as a warning rather than an error because the element is not visible " +
                   "to users, but would fail accessibility requirements if it becomes visible.";
    } else {
      result.result = resultObj.result;
      result.description = resultObj.description;
      if (resultObj.details) {
        result.details = resultObj.details;
      }
    }

    return result;
  }

  // Determine result based on accessible name
  let resultObj;

  if (!accessibleName) {
    resultObj = {
      result: "fail",
      description: "Missing accessible name",
      details: "SVG images with role=\"img\" need an accessible name to make their content available to screen reader users. Add a <title> element as the first child of the SVG, or use aria-label or aria-labelledby attributes."
    };
  } else if (accessibleName.trim() === '') {
    resultObj = {
      result: "fail",
      description: "Whitespace-only accessible name",
      details: "Accessible names consisting only of whitespace characters are not announced by screen readers, making the image inaccessible to screen reader users."
    };
  } else if (isPunctuation(accessibleName)) {
    resultObj = {
      result: "fail",
      description: "Punctuation-only accessible name",
      details: "Accessible names consisting only of punctuation characters don't provide meaningful information to screen reader users."
    };
  } else if (accessibleName.includes('<') && accessibleName.includes('>')) {
    // Don't include the actual accessible name in the result for HTML markup
    result.accessibleName = ''; // Override the accessibleName in the result

    resultObj = {
      result: "fail",
      description: "HTML markup in SVG accessible name",
      details: "HTML tags in accessible names are not rendered properly by screen readers and can cause confusion. Use plain text without markup in accessible names."
    };
  } else if (isFilenameInText(accessibleName)) {
    resultObj = {
      result: "fail",
      description: "Filename as accessible name",
      details: "Filenames do not adequately describe the content or purpose of an image to screen reader users."
    };
  } else if (isGenericLabel(accessibleName)) {
    resultObj = {
      result: "warn",
      description: "Generic accessible name",
      details: "Generic terms don't adequately describe the content or purpose of an image to screen reader users.",
      title: "Generic image description"
    };
  } else if (hasTitle && titleContent && titleContent.trim() === '' && accessibleName) {
    resultObj = {
      result: "warn",
      description: "Empty title element with alternative accessible name",
      details: "Having an empty <title> element along with other accessible name sources can create confusion. It's better to either use the <title> element properly or remove it.",
      title: "Empty title element"
    };
  } else {
    resultObj = {
      result: "pass",
      description: "SVG image has an appropriate accessible name"
    };
  }

  // If the element has an accessibility issue but is hidden, downgrade to a warning
  if (!isVisible && resultObj.result === "fail") {
    result.result = "warn";
    result.description = resultObj.description + " (hidden element)";
    result.details = "This element is currently hidden (display: none, visibility: hidden, or opacity: 0). " +
                   "This is reported as a warning rather than an error because the element is not visible " +
                   "to users, but would fail accessibility requirements if it becomes visible.";
  } else {
    result.result = resultObj.result;
    result.description = resultObj.description;
    if (resultObj.details) {
      result.details = resultObj.details;
    }
    if (resultObj.title) {
      result.title = resultObj.title;
    }
  }

  return result;
}

/**
 * Determines if an element only contains an icon (e.g., a button with just an icon)
 * @param {HTMLElement} element - Element to check
 * @param {string} accessibleName - The computed accessible name
 * @returns {boolean} True if the element has only an icon
 */
function isIconOnly(element, accessibleName) {
  // If the accessible name didn't come from textContent, then it's not an icon-only issue
  if (element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') ||
      element.getAttribute('title')) {
    return false;
  }

  // Input buttons should use the 'value' attribute for their accessible name
  // So we need special handling for them
  if (element.tagName === 'INPUT' &&
      (element.type === 'button' || element.type === 'submit' || element.type === 'reset')) {
    // If there's no value, that's also a problem but not an icon-only issue
    if (!element.hasAttribute('value')) {
      return false;
    }

    // Use the value attribute for the test
    const value = element.getAttribute('value');

    // Check if value is a single character that might be an icon
    if (value.length === 1) {
      // Special characters often used as icons
      const iconChars = ['×', '✓', '✗', '➤', '►', '▶', '◄', '«', '»', '❮', '❯',
                         '+', '-', '×', '÷', '=', '<', '>', '≤', '≥', '*', '☆', '★', '◆', '■', '●',
                         '❌', '✅', '✔', '✖', '✕', '☒', '☑', '☐', '✱', '✲', '✳', '✴',
                         '↑', '↓', '←', '→', '↖', '↗', '↙', '↘', '↔', '↕'];

      if (iconChars.includes(value)) {
        return true;
      }

      // Check for emoji
      const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
      if (emojiRegex.test(value)) {
        return true;
      }
    }

    // Check for very short values that might be icons
    if (value.length <= 2 && /[^\w\s]/.test(value)) {
      return true;
    }

    return false;
  }

  // Single character tests (common for icons)
  if (accessibleName.length === 1 && accessibleName.trim().length === 1) {
    // Check for emoji
    const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
    if (emojiRegex.test(accessibleName)) {
      return true;
    }

    // Special characters often used as icons
    const iconChars = ['×', '✓', '✗', '➤', '►', '▶', '◄', '«', '»', '❮', '❯',
                       '+', '-', '×', '÷', '=', '<', '>', '≤', '≥', '*', '☆', '★', '◆', '■', '●',
                       '❌', '✅', '✔', '✖', '✕', '☒', '☑', '☐', '✱', '✲', '✳', '✴',
                       '↑', '↓', '←', '→', '↖', '↗', '↙', '↘', '↔', '↕'];

    if (iconChars.includes(accessibleName)) {
      return true;
    }
  }

  // Check for Font Awesome and other common icon classes
  if (element.classList) {
    const iconClassPatterns = [
      /^fa-/, /^fas-/, /^far-/, /^fal-/, /^fad-/, // Font Awesome
      /^glyphicon-/, // Glyphicons
      /^material-icons/, // Material Icons
      /^icon-/, // Generic icon class
      /^ui-icon-/ // jQuery UI
    ];

    const iconClassExists = Array.from(element.classList).some(cls =>
      iconClassPatterns.some(pattern => pattern.test(cls))
    );

    if (iconClassExists) {
      return true;
    }
  }

  // Check if the element has an icon child element but no other substantial text
  // This handles cases where the icon is in a child element
  const hasIconChilds = element.querySelector('i.fa, i.fas, i.far, i.fal, i.fad, span.material-icons, i.icon, .glyphicon');
  if (hasIconChilds && element.textContent.trim().length <= 2) {
    return true;
  }

  // Check for very short text that might be an icon
  if (accessibleName.length <= 2 && /[^\w\s]/.test(accessibleName)) {
    return true;
  }

  return false;
}