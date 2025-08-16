

// AXIOM INJECTOR SCRIPT - Simplified Version
console.log("=== AXIOM INJECTOR SCRIPT STARTING ===");

const axiomInjectorObservers = {};
const jeetModeTextClassName = "jmt" + Math.random().toString(36).substring(2, 10);
const pnlSectionClassName = "pnl" + Math.random().toString(36).substring(2, 10);

// Load Airnt font
function loadAirntFont() {
  const fontUrl = chrome.runtime.getURL('/public/assets/fonts/Airnt.otf');
  const fontFace = new FontFace('Airnt', `url(${fontUrl})`);
  
  fontFace.load().then(() => {
    document.fonts.add(fontFace);
    console.log('Airnt font loaded successfully');
  }).catch(err => {
    console.error('Failed to load Airnt font:', err);
  });
}

loadAirntFont();

// Clean up any existing trench panel buttons and PnL duplicates on script load
const cleanupExistingButtons = () => {
  // Clean up trench panel buttons
  const existingButtons = document.querySelectorAll('img[src*="TrenchPanel.svg"], .trench-svg-button, button[class*="trench"]');
  if (existingButtons.length > 0) {
    console.log(`Found ${existingButtons.length} existing trench panel buttons, removing them...`);
    existingButtons.forEach(button => button.remove());
  }
  
  // Clean up duplicate PnL sections
  const existingPnLSections = document.querySelectorAll('[data-pnl-section="true"]');
  if (existingPnLSections.length > 1) {
    console.log(`Found ${existingPnLSections.length} PnL sections, keeping only the first one...`);
    // Keep only the first one, remove the rest
    for (let i = 1; i < existingPnLSections.length; i++) {
      existingPnLSections[i].remove();
    }
  }
};

cleanupExistingButtons();



// Set up periodic check to ensure trench button exists
setInterval(() => {
  const trenchButton = document.getElementById('trench-panel-button-debug');
  if (!trenchButton) {
    console.log("Trench button missing, attempting to recreate...");
    trenchButtonInjected = false; // Reset flag to allow recreation
    replaceTrenchPanelWithSVG();
  }
}, 3000); // Check every 3 seconds

console.log("=== AXIOM INJECTOR SCRIPT LOADED ===");
console.log("Script URL:", window.location.href);
console.log("Document ready state:", document.readyState);
console.log("Current pathname:", window.location.pathname);



// Global flags to track initialization
let axiomInjectorInitialized = false;
let trenchButtonInjected = false;

// Function to initialize PnL when DOM is ready
function initializePnLWhenReady() {
  console.log("=== initializePnLWhenReady called ===");
  console.log("Current URL:", window.location.href);
  console.log("Current pathname:", window.location.pathname);
  console.log("axiomInjectorInitialized:", axiomInjectorInitialized);
  
  if (axiomInjectorInitialized) {
    console.log("Already initialized, skipping...");
    return;
  }
  
  // Only inject PnL on actual token pages
  const isTokenPage = window.location.pathname.includes('/meme/') && window.location.pathname.split('/').length > 2;
  
  if (isTokenPage) {
    console.log("Token page detected, initializing PnL...");
    if (!axiomInjectorInitialized) {
    addPulseSummaryUI();
    axiomInjectorInitialized = true;
    }
  } else {
    console.log("Not on token page, skipping PnL injection");
    axiomInjectorInitialized = false;
  }
  
  // Check if we're on the pulse page
  if (window.location.pathname === '/pulse') {
    console.log("Pulse page detected, initializing Jeet Mode text...");
    addJeetModeText();
  }
  
  // Replace Trench Panel text with SVG on any page (only once)
  if (!trenchButtonInjected) {
    console.log("Attempting to replace Trench Panel with SVG...");
  replaceTrenchPanelWithSVG();
    trenchButtonInjected = true;
  } else {
    console.log("Trench button already injected, skipping...");
  }
  

  
  console.log("=== initializePnLWhenReady completed ===");
}

// Listen for DOM content loaded
console.log("Setting up DOM content loaded listener...");
if (document.readyState === 'loading') {
  console.log("Document still loading, adding event listener...");
  document.addEventListener('DOMContentLoaded', initializePnLWhenReady);
} else {
  console.log("Document already loaded, calling initializePnLWhenReady immediately...");
  initializePnLWhenReady();
}

  // Also listen for navigation changes (for SPA) - Optimized for faster response
let axiomInjectorLastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== axiomInjectorLastUrl) {
    axiomInjectorLastUrl = url;
      
      // Immediate cleanup when leaving token pages
      const wasOnTokenPage = axiomInjectorLastUrl.includes('/meme/') && axiomInjectorLastUrl.split('/').length > 2;
      const isOnTokenPage = url.includes('/meme/') && url.split('/').length > 2;
      
      if (wasOnTokenPage && !isOnTokenPage) {
        // Immediately remove PnL when leaving token page
        const existingPnL = document.querySelector(`.${pnlSectionClassName}, [data-pnl-section="true"]`);
        if (existingPnL) {
          console.log("Leaving token page, immediately removing PnL...");
          existingPnL.remove();
        }
      }
      
      axiomInjectorInitialized = false; // Reset flag for new page
      trenchButtonInjected = false; // Reset trench button flag for new page
      
      // Reduced delay for faster response
      setTimeout(initializePnLWhenReady, 10); // Much faster response
    }
  }).observe(document, { subtree: true, childList: true });

// Main function to add PnL summary UI to the pulse page
async function addPulseSummaryUI() {
  console.log("=== addPulseSummaryUI called ===");
  console.log("Current URL:", window.location.href);
  console.log("Current pathname:", window.location.pathname);
  
  // Only inject on token pages
  const isTokenPage = window.location.pathname.includes('/meme/') && window.location.pathname.split('/').length > 2;
  if (!isTokenPage) {
    console.log("Not on token page, skipping PnL injection");
    return;
  }
  

  
  // Clean up existing observers
  if (axiomInjectorObservers["pnl"]) {
    axiomInjectorObservers["pnl"].forEach((observer) => observer.disconnect());
    axiomInjectorObservers["pnl"] = [];
  }

  function injectPnL() {
    console.log("injectPnL function called");
    
    // Optimized DOM search - try crown icon first, then fallback
    let tokenHeader = document.querySelector('i.ri-vip-crown-2-line')?.closest('.flex.flex-row.flex-1') || 
                     document.querySelector('.flex.flex-row.flex-1.max-h-\\[64px\\].min-h-\\[64px\\].border-b.border-primaryStroke');
    
    if (!tokenHeader) {
      console.log("No suitable header found, returning false");
      return false;
    }
    
    console.log("Token header found:", tokenHeader);

    // Prevent duplicate injection - check globally and by data attribute
    const existingPnL = document.querySelector(`.${pnlSectionClassName}, [data-pnl-section="true"]`);
    if (existingPnL) {
      console.log("PnL section already exists, skipping injection");
      return true;
    }
    
    // Also check if we're in the right location - should be near the crown icon
    const crownIconCheck = document.querySelector('i.ri-vip-crown-2-line');
    if (!crownIconCheck) {
      console.log("Crown icon not found, PnL injection might be in wrong location");
    }

    console.log("Injecting PnL section...");

    // Create the PnL section
    const pnlSection = document.createElement("div");
    pnlSection.classList.add(pnlSectionClassName);
    pnlSection.setAttribute('data-pnl-section', 'true');
    pnlSection.style.cssText = "display: flex; flex-direction: row; gap: 16px; margin-left: 41px; margin-right: 16px;";

    const pnlContainer = document.createElement("div");
    pnlContainer.style.cssText = "display: flex; flex-direction: row; gap: 21px; align-items: center;";

    const createPnLItem = (label, value) => {
      const item = document.createElement("div");
      item.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; color: #C7C7C7; white-space: nowrap;";
      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;
      labelSpan.style.cssText = "font-weight: 400; color: #6A60E8;";
      const valueSpan = document.createElement("span");
      valueSpan.textContent = value;
      valueSpan.style.cssText = "color: white; font-weight: 400;";
      item.appendChild(labelSpan);
      item.appendChild(valueSpan);
      return item;
    };

    const investedItem = createPnLItem("INVESTED", "2.3");
    const soldItem = createPnLItem("SOLD", "0");
    const remainingItem = createPnLItem("REMAINING", "23");

    const pnlChangeItem = document.createElement("div");
    pnlChangeItem.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; white-space: nowrap;";
    const pnlLabel = document.createElement("span");
    pnlLabel.textContent = "Total PnL";
    pnlLabel.style.cssText = "color: #6A60E8; font-weight: 400;";
    const pnlValue = document.createElement("span");
    pnlValue.textContent = "20.7 (+1000%)";
    pnlValue.style.cssText = "color:rgb(64, 204, 64); font-weight: 400;";
    pnlChangeItem.appendChild(pnlLabel);
    pnlChangeItem.appendChild(pnlValue);

    pnlContainer.appendChild(investedItem);
    pnlContainer.appendChild(soldItem);
    pnlContainer.appendChild(remainingItem);
    pnlContainer.appendChild(pnlChangeItem);
    pnlSection.appendChild(pnlContainer);
  
    const findCrownAndPosition = () => {
      const crownIcon = tokenHeader.querySelector('i.ri-vip-crown-2-line');
      
      if (crownIcon) {
        console.log("Found crown icon:", crownIcon);
        
        // Remove any existing PnL section
        const existingPnL = tokenHeader.querySelector(`.${pnlSectionClassName}`);
        if (existingPnL) {
          existingPnL.remove();
        }
        
        // Find the crown's parent container
        let crownContainer = crownIcon.parentElement;
        
        // Navigate up to find the right container level
        while (crownContainer && crownContainer.parentElement) {
          if (crownContainer.parentElement === tokenHeader) {
            break;
          }
          crownContainer = crownContainer.parentElement;
        }
        
        if (crownContainer) {
          // Insert PnL section AFTER the crown container
          tokenHeader.insertBefore(pnlSection, crownContainer.nextSibling);
          console.log("PnL inserted after crown container");
          return true;
        }
      }
      
      return false;
    };
    
    // Try to position immediately
    if (findCrownAndPosition()) {
      return true;
    }
    
    // If crown not found, wait for it with observer
    const crownObserver = new MutationObserver(() => {
      if (findCrownAndPosition()) {
        crownObserver.disconnect();
      }
    });
    
    crownObserver.observe(tokenHeader, {
      childList: true,
      subtree: true
    });
    
    // Store crown observer for cleanup
    if (!axiomInjectorObservers["pnl-crown"]) {
      axiomInjectorObservers["pnl-crown"] = [];
    }
    axiomInjectorObservers["pnl-crown"].push(crownObserver);
    
    // Timeout after 3 seconds
    setTimeout(() => {
      crownObserver.disconnect();
      // Final fallback - append at end
      const existingPnL = tokenHeader.querySelector(`.${pnlSectionClassName}`);
      if (!existingPnL) {
        tokenHeader.appendChild(pnlSection);
        console.log("PnL appended to end of header");
      }
    }, 3000);

    return true;
  }

  // Try to inject immediately
  if (injectPnL()) {
    return;
  }

  // Set up observer to wait for token header if not found immediately
  const observer = new MutationObserver(() => {
    if (injectPnL()) {
      observer.disconnect();
    }
  });
  
  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });

  // Store observer for cleanup
  if (!axiomInjectorObservers["pnl"]) {
    axiomInjectorObservers["pnl"] = [];
  }
  axiomInjectorObservers["pnl"].push(observer);
}

// Add Jeet Mode text to pulse page
async function addJeetModeText() {
  console.log("addJeetModeText called");
  
  const injectJeetMode = async () => {
    const pulseText = document.querySelector('span.flex-1.text-textPrimary.text-\\[20px\\].font-medium');
    if (!pulseText || pulseText.textContent !== 'Pulse') {
      return false;
    }
    
    // Check if already added
    if (pulseText.parentElement.querySelector('.jmt-jeet-mode-text')) {
      return true;
    }

    // Load QB Panel Name setting
    let qbPanelName = 'Jeet Mode';
    try {
        const result = await chrome.storage.sync.get(['extensionSettings']);
        if (result.extensionSettings && result.extensionSettings.qbPanelName) {
            qbPanelName = result.extensionSettings.qbPanelName;
        }
    } catch (e) {
        console.log("Error loading QB Panel Name setting:", e);
    }
    
    // Create span with proper styling and unique class
    const jeetModeText = document.createElement("span");
    jeetModeText.textContent = qbPanelName;
    jeetModeText.classList.add('jmt-jeet-mode-text');
    jeetModeText.style.cssText = `
      font-family: 'Airnt', sans-serif;
      color: #B9A6F3;
      font-size: 34px;
      font-weight: 500;
      -webkit-text-fill-color: transparent;
      -webkit-text-stroke: 2px #B9A6F3;
      position: absolute;
      left: 0;
      top: 0;
      letter-spacing: 3px;
      z-index: 10;
    `;
    
    // Insert into the parent container with absolute positioning
    pulseText.parentElement.appendChild(jeetModeText);
    
    // Position relative to the Pulse text element
    const pulseRect = pulseText.getBoundingClientRect();
    const containerRect = pulseText.parentElement.getBoundingClientRect();
    const relativeLeft = pulseRect.right - containerRect.left + -1260;
    const relativeTop = pulseRect.top - containerRect.top;
    
    jeetModeText.style.left = relativeLeft + 'px';
    jeetModeText.style.top = relativeTop + 'px';
    
    console.log("Jeet Mode text injected successfully at position:", relativeLeft, relativeTop);
    return true;
  };

  // Try immediately
  const success = await injectJeetMode();
  if (success) return;

  // Set up observer to wait for pulse text if not found immediately - Optimized for faster response
  const observer = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const pulseText = node.querySelector('span.flex-1.text-textPrimary.text-\\[20px\\].font-medium');
          if (pulseText && pulseText.textContent === 'Pulse') {
            const success = await injectJeetMode();
            if (success) {
              observer.disconnect();
              return;
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });

  // Store observer for cleanup
  if (!axiomInjectorObservers["jeet-mode"]) {
    axiomInjectorObservers["jeet-mode"] = [];
  }
  axiomInjectorObservers["jeet-mode"].push(observer);
}

// Replace white Trench Panel text with SVG
async function replaceTrenchPanelWithSVG() {
  console.log("replaceTrenchPanelWithSVG called");
  console.log("Current URL:", window.location.href);
  console.log("Document ready state:", document.readyState);
  
  // Check if already injected
  if (trenchButtonInjected) {
    console.log("Trench button already injected, skipping...");
    return;
  }
  
  // Also check if button already exists in DOM
  const existingButton = document.querySelector('img[src*="TrenchPanel.svg"], .trench-svg-button, button[class*="trench"]');
  if (existingButton) {
    console.log("Trench button already exists in DOM, skipping...");
    trenchButtonInjected = true;
    return;
  }
  
  // Function to inject the SVG button - Optimized for faster response
  const injectSVGButton = async () => {
    // Find the exact target div with icon buttons - optimized search
    let targetDiv = document.querySelector('div.flex.flex-row.flex-1.gap-\\[12px\\].justify-end.items-center');
    
    if (!targetDiv) {
      console.log("Target div not found, skipping trench button injection");
      return false;
    }
    
    // Quick verification - check for at least one icon button
    const hasIconButtons = targetDiv.querySelector('i.ri-refresh-line, i.ri-line-height, i.ri-settings-3-line, i.ri-share-line, i.ri-eye-off-line, i.ri-star-line');
    if (!hasIconButtons) {
      console.log("Target div found but doesn't contain expected icon buttons, skipping...");
      return false;
    }

    console.log("Found correct target div with icon buttons");
    return await injectSVGButtonToElement(targetDiv);
  };

  // Helper function to inject button to a specific element
  const injectSVGButtonToElement = async (targetElement) => {
    // Check if already added in this target element
    const existingInTarget = targetElement.querySelector('img[src*="TrenchPanel.svg"], .trench-svg-button, button[class*="trench"]');
    if (existingInTarget) {
      console.log("Trench panel button already exists in target element");
      return true;
    }

    // Create button with SVG
    const button = document.createElement('button');
    button.className = 'trench-svg-button group flex flex-row p-[8px] h-[24px] gap-[4px] justify-center items-center transition-all duration-150 ease-in-out cursor-pointer rounded-[4px]';
    button.style.cssText = 'background: transparent !important; border: none !important;';
    
    // Add hover effect with inline styles for better control
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(147, 51, 234, 0.3) !important';
      button.style.transition = 'background 0.2s ease-in-out';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent !important';
    });
    
    // Add a unique ID for tracking
    button.id = 'trench-panel-button-debug';
    
    // Create SVG image element using the TrenchPanel.svg
    const svgImg = document.createElement('img');
    svgImg.src = chrome.runtime.getURL('/public/assets/images/TrenchPanel.svg');
    svgImg.style.cssText = `
      width: 87px;
      height: 19px;
      transition: opacity 0.2s ease-in-out;
    `;
    svgImg.alt = 'Trench Panel';
    
    // Add error handling for image loading
    svgImg.onerror = () => {
      console.error("Failed to load TrenchPanel.svg");
    };
    
    svgImg.onload = () => {
      console.log("TrenchPanel.svg loaded successfully");
    };
    
    // Add SVG to button and button to div
    button.appendChild(svgImg);
    
    // Add click event handler
    button.addEventListener('click', () => {
      console.log("Trench Panel SVG button clicked");
      // Toggle the panel visibility
      const existingPanel = document.querySelector('.wallet-card');
      if (existingPanel) {
        existingPanel.style.display = existingPanel.style.display === 'none' ? 'block' : 'none';
      } else {
        // Create the panel if it doesn't exist
        if (typeof addSolizTrenchPanel === 'function') {
            console.log("Calling addSolizTrenchPanel...");
            addSolizTrenchPanel();
        } else {
            console.log("addSolizTrenchPanel function not available");
        }
      }
    });
    
    // Insert at the very beginning of the icon buttons container
    const firstChild = targetElement.firstElementChild;
    if (firstChild) {
      targetElement.insertBefore(button, firstChild);
      console.log("Inserted trench button at beginning of icon buttons container");
    } else {
      targetElement.appendChild(button);
      console.log("Appended trench button to icon buttons container");
    }
    
    console.log("Trench Panel SVG button created successfully in:", targetElement);
    
    // Check if button is still there after a short delay
    setTimeout(() => {
      const buttonStillExists = document.getElementById('trench-panel-button-debug');
      if (buttonStillExists) {
        console.log("✅ Trench button still exists after 1 second");
      } else {
        console.log("❌ Trench button was removed after 1 second");
      }
    }, 1000);
    
    return true;
  };

  // Try immediately
  const success = await injectSVGButton();
  if (success) return;

  console.log("Target div not found immediately, setting up observer...");

  // Set up observer to wait for target div if not found immediately
  const observer = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Look for the top-right section with icon buttons
          const targetDiv = node.querySelector('div.flex.flex-row.flex-1.gap-\\[12px\\].justify-end.items-center') || 
                           (node.classList && node.classList.contains('flex') && node.classList.contains('flex-row') && node.classList.contains('flex-1') && node.classList.contains('gap-[12px]') && node.classList.contains('justify-end') && node.classList.contains('items-center') ? node : null);
          
          if (targetDiv) {
            console.log("Target div found via observer:", targetDiv);
            const success = await injectSVGButtonToElement(targetDiv);
            if (success) {
              observer.disconnect();
              return;
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });

  // Store observer for cleanup
  if (!axiomInjectorObservers["trench-svg"]) {
    axiomInjectorObservers["trench-svg"] = [];
  }
  axiomInjectorObservers["trench-svg"].push(observer);
}

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { addPulseSummaryUI, addJeetModeText, initializePnLWhenReady, replaceTrenchPanelWithSVG };
}

