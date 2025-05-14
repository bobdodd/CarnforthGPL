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
 * Carnforth Accessible Name Tester - DevTools Script
 *
 * This script creates a new panel in Chrome DevTools.
 */

// Create a panel in DevTools
chrome.devtools.panels.create(
  "Accessible Names", // Panel title
  null, // No panel icon
  "../panel/panel.html", // Panel HTML page
  (panel) => {
    console.log("Accessible Names panel created");

    // Panel created callback
    panel.onShown.addListener((panelWindow) => {
      console.log("Panel shown");
    });

    panel.onHidden.addListener(() => {
      console.log("Panel hidden");
    });
  }
);