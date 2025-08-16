// Global flags to track panel state
let isCreatingPanel = false; // Flag to prevent concurrent panel creation
let isDraggingPanel = false; // Flag to track if panel is being dragged

// Listen for DOM content loaded - delegate to axiom-injector.js
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded, axiom.js ready");
  });
} else {
  console.log("DOM already loaded, axiom.js ready");
}

// Navigation changes are handled by axiom-injector.js

// Content script loaded
console.log("Axiom content script loaded");

// Initial cleanup - handled by axiom-injector.js

const activeObservers = {};
const platform = "axiom";

const buyButtonClassName = "b" + Math.random().toString(36).substring(2, 10);
const toastClassName = "t" + Math.random().toString(36).substring(2, 10);
const quickPanelClassName = "qp" + Math.random().toString(36).substring(2, 10);
const buyDivClassName = "bd" + Math.random().toString(36).substring(2, 10);
const sellDivClassName = "sd" + Math.random().toString(36).substring(2, 10);
const headerClassName = "h" + Math.random().toString(36).substring(2, 10);
const trackerButtonClassName = "tr" + Math.random().toString(36).substring(2, 10);
const similarTokensButtonClassName = "st" + Math.random().toString(36).substring(2, 10);
const oneClickButtonClassName = "oc" + Math.random().toString(36).substring(2, 10);
const hasGifBackgroundClassName = "hgb" + Math.random().toString(36).substring(2, 10);
const gifBackgroundOverlayClassName = "gbo" + Math.random().toString(36).substring(2, 10);
const SolizGifStyleId = "cgs" + Math.random().toString(36).substring(2, 10);

async function getClipboardContent() {
  try {
    const text = await navigator.clipboard.readText();
    return text;
  } catch (err) {
    console.error('Failed to read clipboard:', err);
    return null;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const signal = controller.signal;

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...options, signal });
  } finally {
    clearTimeout(timeout);
  }
}


// LISTENER

let currentPage, pulseButtonsEnabled;
chrome.runtime.onMessage.addListener(async function (request) {
  const sitePreferences = (await chrome.storage.local.get(`Soliz.sitePreferences`))?.[`Soliz.sitePreferences`] || {};
  
  // Check if Axiom is enabled in site preferences
  if (sitePreferences["axiom"] === false) return;
  
  console.log("Received page message:", request.message);
  
  // Clean up existing panels
  removeSolizTrenchPanels();
  if (activeObservers["wallet-tracker"]) {
    activeObservers["wallet-tracker"].forEach((observer) => observer.disconnect());
  }
  if (activeObservers["main-tracker"]) {
    activeObservers["main-tracker"].forEach((observer) => observer.disconnect());
  }
  if (request.message === "axiom-pulse") {
    pulseButtonsEnabled = (await chrome.storage.local.get("Soliz.pulseButtons"))?.["Soliz.pulseButtons"] ?? true;
    const observers = activeObservers["pulse"] || [];
    observers.forEach((observer) => observer.disconnect());
    currentPage = request.message;
    handlePulse();
    // NO PANEL on pulse pages
  } else if (request.message === "axiom-token") {
    if (sitePreferences["axiom-instant-trade"] === true) {
      handleOneClick();
    }
    // Check if panel already exists before creating
    const existingPanel = document.querySelector('.wallet-card');
    if (!existingPanel && !isDraggingPanel) {
      addSolizTrenchPanel(); // Show trench panel on token pages
    }
    // PnL section is handled by axiom-injector.js
  } else if (request.message === "axiom-discover") {
    currentPage = request.message;

  } else if (request.message === "reset" && currentPage === "axiom-token") {
    // Check if panel already exists before creating
    const existingPanel = document.querySelector('.wallet-card');
    if (!existingPanel && !isDraggingPanel) {
      addSolizTrenchPanel();
    }
  }
});

// UTILS

function insertAfter(referenceNode, newNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function insertBefore(referenceNode, newNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode);
}

// API HANDLERS

async function handleDisperseAction() {
  try {
    console.log("Initiating disperse action...");
    
    // Get selected wallets from the panel
    const selectedWallets = getSelectedWallets();
    if (selectedWallets.length === 0) {
      showToast('Please select at least one wallet for disperse action');
      return;
    }
    
    // Get current token address from URL
    const tokenAddress = getCurrentTokenAddress();
    if (!tokenAddress) {
      showToast('Could not determine token address');
      return;
    }
    
    // Prepare API payload
    const payload = {
      action: 'disperse',
      tokenAddress: tokenAddress,
      wallets: selectedWallets,
      timestamp: Date.now()
    };
    
    console.log("Disperse payload:", payload);
    
    // Make API call to Soliz Labs endpoint
    const response = await fetch('https://extension.Soliz-labs.io/tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await getAuthToken()
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log("Disperse API response:", result);
      showToast('Disperse action initiated successfully');
    } else {
      console.error("Disperse API error:", response.status, response.statusText);
      showToast('Failed to initiate disperse action');
    }
    
  } catch (error) {
    console.error("Error in disperse action:", error);
    showToast('Error occurred during disperse action');
  }
}

async function handleConsolidateAction() {
  try {
    console.log("Initiating consolidate action...");
    
    // Get selected wallets from the panel
    const selectedWallets = getSelectedWallets();
    if (selectedWallets.length === 0) {
      showToast('Please select at least one wallet for consolidate action');
      return;
    }
    
    // Get current token address from URL
    const tokenAddress = getCurrentTokenAddress();
    if (!tokenAddress) {
      showToast('Could not determine token address');
      return;
    }
    
    // Prepare API payload
    const payload = {
      action: 'consolidate',
      tokenAddress: tokenAddress,
      wallets: selectedWallets,
      timestamp: Date.now()
    };
    
    console.log("Consolidate payload:", payload);
    
    // Make API call to Soliz Labs endpoint
    const response = await fetch('https://extension.Soliz-labs.io/tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await getAuthToken()
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log("Consolidate API response:", result);
      showToast('Consolidate action initiated successfully');
    } else {
      console.error("Consolidate API error:", response.status, response.statusText);
      showToast('Failed to initiate consolidate action');
    }
    
  } catch (error) {
    console.error("Error in consolidate action:", error);
    showToast('Error occurred during consolidate action');
  }
}

// Helper functions for API handlers

function getSelectedWallets() {
  const selectedWallets = [];
  
  // Find the wallet dropdown menu
  const walletMenu = document.querySelector('[data-wallet-menu]');
  if (walletMenu) {
    // Get all checked wallet checkboxes
    const checkedBoxes = walletMenu.querySelectorAll('.wallet-checkbox');
    checkedBoxes.forEach((checkbox, index) => {
      if (checkbox.style.background === 'rgb(115, 103, 240)' || checkbox.style.background === '#7367F0') {
        // Get wallet info from the parent wallet item
        const walletItem = checkbox.closest('div');
        if (walletItem) {
          const walletName = walletItem.querySelector('div:first-child')?.textContent || `Wallet ${index + 1}`;
          const walletAddress = walletItem.querySelector('span:last-child')?.textContent || '';
          selectedWallets.push({
            name: walletName,
            address: walletAddress,
            id: `wallet_${index + 1}`
          });
        }
      }
    });
  }
  
  // If no wallets found in dropdown, return default wallet
  if (selectedWallets.length === 0) {
    selectedWallets.push({
      name: "Trench Wallet",
      address: "Brn7r",
      id: "trench"
    });
  }
  
  console.log("Selected wallets:", selectedWallets);
  return selectedWallets;
}

function getCurrentTokenAddress() {
  // Extract token address from URL
  const url = window.location.href;
  const match = url.match(/\/meme\/([^\/\?]+)/);
  if (match) {
    return match[1];
  }
  
  // Fallback: try to find token address in page content
  const tokenElements = document.querySelectorAll('[data-token-address], [data-address]');
  for (const element of tokenElements) {
    const address = element.getAttribute('data-token-address') || element.getAttribute('data-address');
    if (address && address.length > 20) {
      return address;
    }
  }
  
  return null;
}

async function getAuthToken() {
  try {
    // Try to get auth token from storage
    const result = await chrome.storage.local.get(['Soliz.authToken']);
    if (result['Soliz.authToken']) {
      return result['Soliz.authToken'];
    }
    
    // Fallback: return a placeholder token for development
    return 'placeholder_auth_token';
  } catch (error) {
    console.error("Error getting auth token:", error);
    return 'placeholder_auth_token';
  }
}

function showToast(message) {
  // Create a simple toast notification
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #1b1835;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    border: 1px solid #7367F0;
    z-index: 1000000;
    font-size: 14px;
    font-family: Arial, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    max-width: 300px;
    word-wrap: break-word;
  `;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  // Remove toast after 3 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3000);
}

// Duplicate prevention is handled within addSolizTrenchPanel function

// ORDERS (Create Soliz payload structure here)

// async function {
//   try {
//     const payload = (type === 'snipe' || type === "pnl")
//       ? {
//         addr: address,
//         auth: authToken,
//       }
//       : {
//         addr: address,
//         isPool,
//         amt: amount === "ini" ? amount : parseFloat(amount).toString(),
//         auth: authToken,
//         side,
//       }
//     if (additionalPayload && type === "swap") {
//       payload.fee = (side === 'buy' ? additionalPayload.values['buy-fee'] : additionalPayload.values['sell-fee']).toString();
//       payload.tip = (side === 'buy' ? additionalPayload.values['buy-tip'] : additionalPayload.values['sell-tip']).toString();
//       payload.slippage = (side === 'buy' ? additionalPayload.values['buy-slippage'] : additionalPayload.values['sell-slippage']).toString();
//       if (side === 'buy') {
//         if (typeof additionalPayload.values['buy-anti-mev'] === 'undefined') {
//           payload.antimev = additionalPayload.values['anti-mev'];
//         } else {
//           payload.antimev = additionalPayload.values['buy-anti-mev'];
//         }
//       } else {
//         if (typeof additionalPayload.values['sell-anti-mev'] === 'undefined') {
//           payload.antimev = additionalPayload.values['anti-mev'];
//         } else {
//           payload.antimev = additionalPayload.values['sell-anti-mev'];
//         }
//       }
//       payload.autotip = additionalPayload.values['auto-tip'];
//     } else if (additionalPayload && type === "limit") {
//       payload.bundletip = additionalPayload.values['limit-tip'].toString();
//       payload.slippage = additionalPayload.values['limit-slippage'].toString();
//       payload.targettype = additionalPayload.values['target-type'];
//       payload.targetvalue = additionalPayload.values['target-value'].toString();
//       payload.expiry = additionalPayload.values['expiry'].toString();
//     }

//     const data = await res.json();
//     return data;
//   } catch (error) {
//     if (error.toString().includes("signal is aborted")) {
//       return { status: "timeout" };
//     }
//     console.error("Failed to create order:", error);
//     return null;
//   }
// }

// FINDERS

async function findPulseContainers(timeout = 5000) {
  for (let i = 0; i < timeout / 500; i++) {
    const containers = document.body.querySelectorAll('.flex-1.border-primaryStroke.bg-backgroundSecondary')
    if (containers.length) return containers;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}



async function findTopBar(timeout = 5000) {
  for (let i = 0; i < timeout / 500; i++) {
    const topBar = document.querySelector(".p-show__bar__row");
    if (topBar) {
      const lastDiv = topBar.querySelector(".l-col-md-auto:last-of-type");
      if (lastDiv) return lastDiv;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function findBuySellContainer(timeout = 5000) {
  for (let i = 0; i < timeout / 500; i++) {
    const container = document.querySelector("div.js-show__trade-tabs");
    if (container) return container;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}


async function findTargetInput(timeout = 5000) {
  for (let i = 0; i < timeout / 500; i++) {
    const targetInputs = document.querySelectorAll('input.flex-1.h-full');
    if (targetInputs.length) return targetInputs[targetInputs.length - 1];
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function findSimilarTokens(timeout = 5000) {
  for (let i = 0; i < timeout / 500; i++) {
    const similarTokens = Array.from(document.querySelectorAll('a[href*="/meme/"]')).filter((t) => !t.classList.contains("group/token") && !t.classList.contains("group"));
    if (similarTokens.length) return similarTokens;
    await new Promise((r) => setTimeout(r, 500));
  }
  return [];
}

async function findWatchlistTokens(timeout = 5000) {
  for (let i = 0; i < timeout / 500; i++) {
    const watchlistTokens = Array.from(document.querySelectorAll('a[href*="/meme/"]')).filter((t) => t.classList.contains("group") && !t.classList.contains("group/token"));
    if (watchlistTokens.length) return watchlistTokens;
    await new Promise((r) => setTimeout(r, 500));
  }
  return [];
}

async function findOneClickContainer(timeout = 5000) {
  for (let i = 0; i < timeout / 500; i++) {
    const container = document.querySelector("div#instant-trade");
    if (container) return container;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function findTokenMint(copyButton, pulseData, startsWith, endsWith) {
  try {
    if (pulseData?.content) {
      const pulseToken = pulseData?.content?.find(
        (token) =>
          token.tokenAddress.startsWith(startsWith) &&
          token.tokenAddress.endsWith(endsWith)
      );
      if (!pulseToken) throw new Error("Token not found!");
      return pulseToken.tokenAddress;
    } else {
      showToast('Your pulse data is corrupted! Please refresh the page.')
      throw new Error("Pulse data is corrupted!");
    }
  } catch (e) {
    copyButton.click();
    const tokenMint = await getClipboardContent();
    if (!tokenMint || !tokenMint.startsWith(startsWith) || !tokenMint.endsWith(endsWith)) {
      return showToast('Token not found!');
    }
    return tokenMint;
  }
}

// HANDLERS

async function handleOneClick() {
  const container = await findOneClickContainer();
  if (container) {
    addOneClickButtons(container);
  }

  const observer = new MutationObserver((m) => {
    m.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName?.toLowerCase() === "div" && node.id === "instant-trade") {
          addOneClickButtons(node);
        }
      });
    });
  });

  activeObservers["token"] ? activeObservers["token"].push(observer) : (activeObservers["token"] = [observer]);
  observer.observe(document.body, { childList: true, subtree: true });
}



async function handlePulse() {
  const containers = await findPulseContainers();
  if (!containers) return;

  // PnL summary UI is handled by axiom-injector.js

 containers.forEach((container) => {
   const cards = Array.from(container.querySelectorAll("div[style*='position: absolute'][style*='width: 100%']"));
   cards.forEach((card) => {
     if (pulseButtonsEnabled) {
       // addPulseButtons functionality removed
     }
   });

   const observer = new MutationObserver((mutations) => {
     mutations.forEach((mutation) => {
       mutation.addedNodes.forEach((node) => {
         if (node.nodeName === "DIV" && !Array.from(node.classList).length) {
           if (pulseButtonsEnabled) {
             // addPulseButtons functionality removed
           }
         } else if (node.nodeName === "DIV" && node.classList.contains("hidden") && node.innerHTML.includes('ri-crosshair-2-fill')) {
           const card = node.closest('div[style*="position: absolute"][style*="width: 100%"]')
           if (card && pulseButtonsEnabled) {
             // addPulseButtons functionality removed
           }
         }
       });
     });
   });

   observer.observe(container, { childList: true, subtree: true });
   activeObservers["pulse"]
     ? activeObservers["pulse"].push(observer)
     : (activeObservers["pulse"] = [observer]);
 });
}




async function restoreSolizPanelPosition(el, storageKey) {
  const { [storageKey]: savedPos } = await chrome.storage.local.get(storageKey);
  if (savedPos) {
    el.style.left = savedPos.left;
    el.style.top = savedPos.top;
  } else {
    el.style.left = "100px";
    el.style.top = "100px";
  }
  el.style.visibility = "visible";
}

function removeSolizTrenchPanels() {
  console.log("Removing all panels...");
  
  let removedCount = 0;
  
  // Remove panels with the random class name
  const previousQuickPanels = document.querySelectorAll(`.${quickPanelClassName}`);
  previousQuickPanels.forEach((panel) => {
    // Clean up drag event listeners before removing
    const header = panel.querySelector('.logo');
    if (header && header._dragMousedownHandler) {
      header.removeEventListener('mousedown', header._dragMousedownHandler);
      document.removeEventListener('mousemove', header._dragMousemoveHandler);
      document.removeEventListener('mouseup', header._dragMouseupHandler);
    }
    panel.remove();
    removedCount++;
  });
  
  // Also remove wallet-card elements (trench panels)
  const walletCards = document.querySelectorAll('.wallet-card');
  walletCards.forEach((card) => {
    // Clean up drag event listeners before removing
    const header = card.querySelector('.logo');
    if (header && header._dragMousedownHandler) {
      header.removeEventListener('mousedown', header._dragMousedownHandler);
      document.removeEventListener('mousemove', header._dragMousemoveHandler);
      document.removeEventListener('mouseup', header._dragMouseupHandler);
    }
    card.remove();
    removedCount++;
  });
  
  // Remove the trench panel style
  const trenchStyle = document.getElementById('trench-panel-style');
  if (trenchStyle) {
    trenchStyle.remove();
  }
  
  // Reset global flags
  isCreatingPanel = false;
  isDraggingPanel = false;
  
  console.log(`Panel cleanup complete. Removed ${removedCount} panels.`);
}


// addPulseSummaryUI is handled by axiom-injector.js

  // =========================
  // TRENCH PANEL
  // ========================
async function addSolizTrenchPanel() {
  
  // Quick check - if we're not on a token page, don't create panel
  if (!window.location.pathname.includes('/meme/')) {
    console.log("Not on token page, skipping panel creation");
    return;
  }
  
  // Duplicate prevention check
  if (isCreatingPanel || isDraggingPanel) {
    console.log("Panel creation/dragging in progress, skipping");
    return;
  }
  
  // Check if panel already exists to prevent duplicates
  const existingPanels = document.querySelectorAll('.wallet-card');
  if (existingPanels.length > 0) {
    console.log(`Found ${existingPanels.length} existing panel(s), skipping creation`);
    // If there are multiple panels, remove all but the first one
    if (existingPanels.length > 1) {
      console.log("Multiple panels detected, removing duplicates");
      for (let i = 1; i < existingPanels.length; i++) {
        existingPanels[i].remove();
      }
    }
    return;
  }
  
  // Set flag to prevent concurrent creation
  isCreatingPanel = true;
  
  // Load hide/unhide states synchronously BEFORE creating elements
  let hidePnL = false;
  let hideBuyRow = false;
  let hideSellRow = false;
  try {
    const result = await chrome.storage.local.get([
      "Soliz.hidePnL.axiom",
      "Soliz.hideBuyRow.axiom",
      "Soliz.hideSellRow.axiom"
    ]);
    hidePnL = result["Soliz.hidePnL.axiom"] || false;
    hideBuyRow = result["Soliz.hideBuyRow.axiom"] || false;
    hideSellRow = result["Soliz.hideSellRow.axiom"] || false;
    console.log("Loaded hide states:", { hidePnL, hideBuyRow, hideSellRow });
  } catch (e) {
    console.log("Error loading hide states:", e);
  }
  
  // Load active preset state synchronously BEFORE creating elements
  let activePresetId = 1; // Default to preset 1
  let activePresetData = null;
  try {
    const presetResult = await chrome.storage.sync.get(['currentActivePreset', 'extensionPresets']);
    if (presetResult.currentActivePreset) {
      activePresetId = presetResult.currentActivePreset;
      if (presetResult.extensionPresets && presetResult.extensionPresets[activePresetId]) {
        activePresetData = presetResult.extensionPresets[activePresetId];
      }
    }
    console.log("Loaded preset state:", { activePresetId, activePresetData });
  } catch (e) {
    console.log("Error loading preset state:", e);
  }
  
  // Aggressively remove any existing panels before creating new one
  const panelsToRemove = document.querySelectorAll('.wallet-card');
  if (panelsToRemove.length > 0) {
    console.log(`Removing ${panelsToRemove.length} existing panel(s) before creating new one`);
    panelsToRemove.forEach(card => {
      // Clean up any event listeners before removing
      const header = card.querySelector('.logo');
      if (header && header._dragMousedownHandler) {
        header.removeEventListener('mousedown', header._dragMousedownHandler);
        document.removeEventListener('mousemove', header._dragMousemoveHandler);
        document.removeEventListener('mouseup', header._dragMouseupHandler);
      }
      card.remove();
    });
  }
    try {
      // Create and inject CSS
      if (!document.getElementById('trench-panel-style')) {
        const style = document.createElement('style');
        style.id = 'trench-panel-style';
        style.textContent = `
          :root {
              --bg-dark: #0e0c20;
              --bg-buttons: #29284D;
              --border-color: #7367F0;
              --card-bg: #1b1835;
              --inputs-bg: #282C40;
              --text-light: #f4f4f4;
              --accent-purple: #8260ff;
              --accent-green: #28C76F;
              --sell-inputs-color: #E64449;
              --accent-red: #ff4e4e;
              --border-radius: 4px;
              --spacing: 12px;
          }
          .wallet-card {
              background: var(--card-bg);
              border-radius: 8px !important;
              padding: var(--spacing);
              width: 338px;
              box-shadow: 0 4px 10px rgba(12, 12, 12, 0.2);
              border: 1px solid rgba(105, 96, 232, 0.13);
              box-sizing: border-box;
              color: var(--text-light);
          }
          .wallet-card .wallet-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 8px;
          }
          .wallet-card .logo {
              display: flex;
              font-weight: bold;
              font-size: 18px;
              margin-right: auto;
              align-items: center;
          }
          .wallet-card .logo img { height: 24px; width: 24px; margin-right: 6px; }
          .wallet-card .settings-icon {
              width: 22px;
              height: 22px;
              margin-left: 8px;
              vertical-align: middle;
          }
          .wallet-card .wallet-selector {
              background: var(--bg-buttons);
              color: var(--text-light);
              border: 1.5px solid var(--border-color);
              border-radius: var(--border-radius);
              height: 30px;
              width: 130px;
              font-size: 13px;
          }
          .wallet-card .wallet-selector-wrapper {
              position: relative;
              display: inline-block;
          }
          .wallet-card .wallet-selector-wrapper::after {
              content: "";
              position: absolute;
              top: 6px;
              bottom: 6px;
              right: 20px;
              width: 1px;
              background-color: white;
              pointer-events: none;
          }
          .wallet-card .tab-select-group {
              display: flex;
              gap: 16px;
              height: 22px;
              border-bottom: 1px solid rgba(255, 255, 255, 0.1);
              border-top: 1px solid rgba(255, 255, 255, 0.1);
              margin-top: 8px;
              padding-top: 3px;
              padding-bottom: 3px;
              margin-bottom: 6px;
              align-items: center;
          }
          .wallet-card .tab-info {
              display: flex;
              align-items: center;
              gap: 4px;
              margin-left: auto;
          }
          .wallet-card .tab-icon, .wallet-card .wallet-icon {
              width: 18px;
              height: 18px;
              margin-left: 2px;
              vertical-align: middle;
          }
          .wallet-card .tab-select {
              background: none;
              border: none;
              color: white;
              cursor: pointer;
              position: relative;
              padding-bottom: 4px;
              font-size: 10px;
              font-weight: 400;
              top: -0.7px;
              text-align: center;
              width: 100%;
          }
          .wallet-card .tab-select:hover { color: #7367F0; }
          .wallet-card .tab-select.active:hover { color: #7367F0 !important; }
          .wallet-card .tab-select.active::after {
              content: "";
              position: absolute;
              left: -2px;
              right: -2px;
              bottom: 0px;
              height: 3px;
              background: var(--accent-purple);
          }
          .wallet-card .tab-select.active.red-underline::after {
              background: var(--accent-red);
              bottom: 0.5px !important;
              height: 3px !important;
          }
          .wallet-card .tab-select.red-underline:hover { color: var(--accent-red); }
          .wallet-card .tab-stats-row {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 30px;
              flex-wrap: wrap;
              position: relative;
          }
          .wallet-card .tabs {
              display: flex;
              gap: 6px;
              margin: 0;
          }
          .wallet-card .tab {
              flex: 1;
              padding: 0px;
              background: var(--bg-buttons);
              border: 1.5px solid;
              color: var(--text-light);
              border-color: var(--border-color);
              border-radius: 6px;
              font-size: 10px;
              min-width: 50px;
              max-width: 50px;
              height: 20px;
              cursor: pointer;
          }
          .wallet-card .tab.active { background-color: #7367F0; }
          .wallet-card .wallet-stats {
              display: flex;
              flex-direction: column;
              align-items: end;
              font-size: 14px;
              position: absolute;
              right: 0;
          }
          .wallet-card .entry-value { color: var(--accent-green); }
          .wallet-card .quick-section { margin-top: 8px; }
          .wallet-card .quick-section h2 {
              margin: 0 4px;
              font-size: 18px;
              font-weight: 400;
          }
          .wallet-card .buy-inputs {
              display: flex;
              align-content: center;
              gap: 14px;
              justify-content: space-between;
          }
          .wallet-card .input-wrapper {
              position: relative;
              display: flex;
              width: 100%;
          }
          .wallet-card .input-wrapper .tab-icon {
              position: absolute;
              top: 50%;
              right: 8px;
              transform: translateY(-50%);
              width: 18px;
              height: 18px;
              pointer-events: none;
          }
          .wallet-card .input-amount {
              width: 100%;
              padding: 5px 16px;
              font-size: 14px;
              color: #ffffff;
              border: 1.5px solid;
              background-color: var(--inputs-bg);
              border-color: var(--border-color);
              border-radius: 6px;
              margin-top: 4px;
              box-shadow: 0px 2px 6px rgba(128, 103, 240, 0.3);
              cursor: pointer;
              transition: border-color 0.15s, background 0.15s;
              height: 31px;
          }
          .wallet-card .input-amount:focus { outline: none; }
          .wallet-card .input-amount:hover {
              border-color: #a18aff;
              background: rgba(40, 32, 74, 0.5);
          }
          .wallet-card .input-amount.sell-input-red {
              border: 1.5px solid var(--accent-red) !important;
              background-color: #2a2742 !important;
              box-shadow: 0px 2px 8px rgba(255, 78, 78, 0.4) !important;
              height: 31px;
          }
          .wallet-card .input-amount.sell-input-red:hover {
              border-color: #ff7b7b !important;
              background: rgba(58, 34, 48, 0.5) !important;
          }
          .wallet-card .buy-btn,
          .wallet-card .sell-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              background: var(--accent-purple);
              color: white;
              border: none;
              border-radius: 6px;
              padding: 10px 0;
              margin-top: 4px;
              min-width: 68px;
              font-weight: 400;
              cursor: pointer;
              height: 31px;
          }
          .wallet-card .buy-btn:hover { background-color: #8f85f3; }
          .wallet-card .sell-btn:hover { background-color: #c2424b; }
          .wallet-card .sell-btn { background: var(--accent-red); }
          .wallet-card .buy-options,
          .wallet-card .sell-options {
              display: flex;
              flex-direction: column;
              gap: 7px;
              margin-top: 5px;
          }
          .wallet-card .buy-options button {
              flex: 1 1 calc(25% - 5.25px);
              background: #44418F;
              color: white;
              border: none;
              padding: 6px;
              border-radius: var(--border-radius);
              font-size: 13px;
              font-weight: 400;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 4px;
              min-width: 0;
          }
          .wallet-card .buy-options button img {
              width: 16px;
              height: 16px;
              vertical-align: middle;
              display: inline-block;
          }
          .wallet-card .buy-options button:hover { background-color: #373479; }
          .wallet-card .sell-options button {
              flex: 1 1 calc(25% - 5.25px);
              background: #A83941;
              color: white;
              border: none;
              padding: 6px;
              border-radius: var(--border-radius);
              font-size: 13px;
              font-weight: 400;
              cursor: pointer;
              min-width: 0;
          }
          .wallet-card .sell-options button:hover { background-color: #812a30; }
          .wallet-card .sell-buttons {
              display: flex;
              align-content: center;
              gap: 10px;
              justify-content: space-between;
          }
          .wallet-card .sell-btn-width {
              max-width: 70px !important;
              width: 70px !important;
              box-sizing: border-box;
          }
          .wallet-card .wallet-summary {
              display: flex;
              flex-wrap: wrap;
              gap: 6px;
              font-size: 12px;
              margin-top: 8px;
              padding-top: 6px;
              text-align: center;
              border-top: 1px solid rgba(255, 255, 255, 0.1);
          }
          .wallet-card .wallet-summary div {
              background-color: #393B638C;
              border-radius: 8px;
              height: 42px;
              box-sizing: border-box;
              padding: 3px 0px;
              width: calc((100% - 12px) / 3);
              color: #C7C7C7;
          }
          .wallet-card .wallet-summary div span {
              display: block;
              font-size: 12px;
              margin-top: 2px;
              color: white;
          }
          .wallet-card .w-50 {
              width: calc((100% - 6px) / 2) !important;
              font-weight: 600;
          }
          .wallet-card .w-50 strong {
              color: var(--accent-green) !important;
              font-weight: normal !important;
          }
          .wallet-card .w-100 { width: 100%; }
          .wallet-card .tab-select-group-bottom .tab-select {
              top: 2px;
          }
          .wallet-card .tab-info .tab-icon:first-of-type {
              width: 13px;
              height: 13px;
          }
          .wallet-card .sell-tab-underline {
              width: 36px;
              height: 2px;
              background: var(--accent-purple);
              border-radius: 2px;
              position: relative;
              left: calc(100% - 36px);
              top: 9px;
          }
          .wallet-card .sell-btn-group {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 100%;
              gap: 4px;
          }
          .wallet-card .sell-number, .wallet-card .sell-percent {
              display: inline-block;
              text-align: center;
          }
          .wallet-card .wallet-selector:focus,
          .wallet-card .wallet-selector:active,
          .wallet-card .wallet-selector:focus-visible {
              border-color: var(--border-color) !important;
              box-shadow: none !important;
              outline: none !important;
          }
          .trench-stats {
            overflow: hidden;
            transition: max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s;
            max-height: 200px;
            opacity: 1;
          }
          .trench-stats.trench-stats-closed {
            max-height: 0;
            opacity: 0;
            pointer-events: none;
          }
        `;
        document.head.appendChild(style);
      }
  
      // Create main container
      const container = document.createElement("div");
      container.classList.add("wallet-card");
      Object.assign(container.style, {
        position: "fixed",
        zIndex: 9999,
        maxWidth: "400px",
        overflow: "auto"
      });
  
            // Set position using Soliz's position system
      await restoreSolizPanelPosition(container, "Soliz.positionBeforeHide.axiom");

      // Create header
      const header = document.createElement("header");
      header.classList.add("wallet-header");
      Object.assign(header.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px"
      });
  
      // Create logo section
      const logo = document.createElement("div");
      logo.classList.add("logo");
      Object.assign(logo.style, {
        display: "flex",
        fontWeight: "bold",
        fontSize: "18px",
        marginRight: "auto",
        alignItems: "center"
      });
  
      // Get the Trench Panel Name from settings for the logo text
      let logoPanelName = "JEET MODE"; // Default value
      try {
          const result = await chrome.storage.sync.get(['extensionSettings']);
          if (result.extensionSettings && result.extensionSettings.trenchPanelName) {
              logoPanelName = result.extensionSettings.trenchPanelName;
          }
      } catch (e) {
          console.log("Error loading Trench Panel Name setting:", e);
      }
      
      // Create dynamic text instead of using image
      const logoText = document.createElement("span");
      logoText.textContent = logoPanelName;
      logoText.style.cssText = "font-family: 'Airnt', sans-serif; color: #B9A6F3; font-size: 15px; font-weight: bold; margin-right: 6px; -webkit-text-fill-color: transparent; -webkit-text-stroke: 0.3px #B9A6F3; letter-spacing: 2px;";
      logo.appendChild(logoText);

      // Create enhanced wallet dropdown
      const walletSelectorWrapper = document.createElement("div");
      walletSelectorWrapper.classList.add("wallet-selector-wrapper");
      Object.assign(walletSelectorWrapper.style, {
        position: "relative",
        display: "inline-block"
      });

      const walletDropdown = document.createElement("div");
      walletDropdown.classList.add("wallet-dropdown");
      Object.assign(walletDropdown.style, {
        position: "relative",
        display: "inline-block",
        zIndex: "1000"
      });

      const walletSelect = document.createElement("div");
      walletSelect.classList.add("wallet-select");
      Object.assign(walletSelect.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 8px",
        background: "var(--bg-buttons)",
        border: "1.5px solid var(--border-color)",
        borderRadius: "calc(var(--border-radius) + 1px)",
        cursor: "pointer",
        fontSize: "13px",
        color: "var(--text-light)",
        minWidth: "130px",
        height: "25.5px"
      });
      
      // Get the Trench Panel Name from settings
      let trenchPanelName = "Trench Wallet"; // Default value
      try {
          const result = await chrome.storage.sync.get(['extensionSettings']);
          if (result.extensionSettings && result.extensionSettings.trenchPanelName) {
              trenchPanelName = result.extensionSettings.trenchPanelName;
          }
      } catch (e) {
          console.log("Error loading Trench Panel Name setting:", e);
      }
      
      walletSelect.textContent = trenchPanelName;
      walletSelect.innerHTML += '<span style="margin-left: auto;">▼</span>';

      // Wallet dropdown menu
      const walletMenu = document.createElement("div");
      walletMenu.classList.add("wallet-menu");
      walletMenu.setAttribute("data-wallet-menu", "true");
      Object.assign(walletMenu.style, {
        position: "fixed",
        background: "var(--bg-buttons)",
        border: "1px solid rgba(115, 103, 240, 0.5)",
        borderRadius: "6px",
        marginTop: "4px",
        padding: "8px",
        zIndex: "999999",
        display: "none",
        minWidth: "273px",
        maxHeight: "300px",
        overflow: "hidden",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)"
      });

      // Button container for side-by-side layout
      const buttonContainer = document.createElement("div");
      Object.assign(buttonContainer.style, {
        display: "flex",
        gap: "8px",
        marginBottom: "12px"
      });

      // Select All button
      const selectAllBtn = document.createElement("button");
      selectAllBtn.textContent = "All";
      Object.assign(selectAllBtn.style, {
        width: "40px",
        padding: "2px 6px",
        background: "rgba(115, 103, 240, 0.6)",
        borderRadius: "3px",
        color: "white",
        cursor: "pointer",
        fontSize: "10px",
        border: "none"
      });

      // Select Main button
      const selectMainBtn = document.createElement("button");
      selectMainBtn.textContent = "Main";
      Object.assign(selectMainBtn.style, {
        width: "40px",
        padding: "2px 6px",
        background: "rgba(115, 103, 240, 0.6)",
        borderRadius: "3px",
        color: "white",
        cursor: "pointer",
        fontSize: "10px",
        border: "none"
      });

      // Wallet list container
      const walletList = document.createElement("div");
      Object.assign(walletList.style, {
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      });

      // Sample wallets (you can modify this list)
      const wallets = [
        { name: "Trench Wallet", id: "trench", balance: "126", address: "Brn7r" },
        { name: "Wallet 2", id: "wallet2", balance: "0", address: "Gn5s3" },
        { name: "Wallet 3", id: "wallet3", balance: "0", address: "Xy9m2" }
      ];
      let selectedWallets = new Set(["trench"]); // Default to main wallet selected
      
      // Set dropdown text to the first wallet name
      walletSelect.textContent = wallets[0].name;
      
      // Add arrow down SVG
      const arrowDown = document.createElement("img");
      arrowDown.src = chrome.runtime.getURL('public/assets/images/arrowdown.svg');
      arrowDown.alt = "Arrow Down";
      arrowDown.style.cssText = "margin-left: auto; width: 12px; height: 12px;";
      walletSelect.appendChild(arrowDown);

              // Create wallet items
        wallets.forEach((wallet, index) => {
          const walletItem = document.createElement("div");
          Object.assign(walletItem.style, {
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            padding: "3px",
            borderRadius: "4px",
            cursor: "pointer"
          });

          // Add border bottom for separation (except last item)
          if (index < wallets.length - 1) {
            walletItem.style.borderBottom = "1px solid rgba(115, 103, 240, 0.2)";
            walletItem.style.paddingBottom = "6px";
          }

        // Checkbox
        const checkbox = document.createElement("div");
        checkbox.classList.add("wallet-checkbox");
        Object.assign(checkbox.style, {
          width: "14px",
          height: "14px",
          border: "2px solid rgba(115, 103, 240, 0.5)",
          borderRadius: "3px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          marginTop: "2px",
          background: selectedWallets.has(wallet.id) ? "#7367F0" : "transparent"
        });

        // No checkmark - just solid purple for checked, stroke only for unchecked

        // Wallet info
        const walletInfo = document.createElement("div");
        Object.assign(walletInfo.style, {
          flex: "1",
          display: "flex",
          flexDirection: "column",
          gap: "1px"
        });

        const walletName = document.createElement("div");
        walletName.textContent = wallet.name;
        Object.assign(walletName.style, {
          fontSize: "13px",
          fontWeight: "500",
          color: "white"
        });

        const walletDetails = document.createElement("div");
        walletDetails.innerHTML = `
          <span style="color: #7367F0; font-size: 12px;">●</span>
          <span style="color: #aaa; font-size: 11px; margin-left: 4px; cursor: pointer;" title="Click to copy">${wallet.address}</span>
        `;
        Object.assign(walletDetails.style, {
          display: "flex",
          alignItems: "flex-start",
          fontSize: "10px",
          marginTop: "-2px"
        });

        // Add click handler to copy address
        const addressSpan = walletDetails.querySelector('span:last-child');
        addressSpan.addEventListener('click', () => {
          navigator.clipboard.writeText(wallet.address).then(() => {
            // Show brief feedback
            const originalText = addressSpan.textContent;
            addressSpan.textContent = 'Copied!';
            addressSpan.style.color = '#4CAF50';
            setTimeout(() => {
              addressSpan.textContent = originalText;
              addressSpan.style.color = '#aaa';
            }, 1000);
          });
        });

        walletInfo.appendChild(walletName);
        walletInfo.appendChild(walletDetails);

        // Grey box with "0" - positioned to the left of balance badge
        const greyBox = document.createElement("div");
        greyBox.textContent = "0";
        Object.assign(greyBox.style, {
          background: "rgba(128, 128, 128, 0.3)",
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "10px",
          display: "flex",
          alignItems: "flex-start",
          alignSelf: "flex-start",
          marginTop: "2px",
          marginRight: "4px",
          color: "white"
        });

        // Balance badge - moved up to same level as wallet name
        const balanceBadge = document.createElement("div");
        balanceBadge.innerHTML = `
          <img src="${chrome.runtime.getURL('public/assets/images/solana-svg.svg')}" style="width: 12px; height: 12px; margin-right: 4px;" alt="SOL">
          <span style="color: white;">${wallet.balance}</span>
        `;
        Object.assign(balanceBadge.style, {
          background: "rgba(115, 103, 240, 0.1)",
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "10px",
          display: "flex",
          alignItems: "flex-start",
          alignSelf: "flex-start",
          marginTop: "2px"
        });

        walletItem.appendChild(checkbox);
        walletItem.appendChild(walletInfo);
        walletItem.appendChild(greyBox);
        walletItem.appendChild(balanceBadge);

        // Click handlers
        walletItem.addEventListener("click", () => {
          if (selectedWallets.has(wallet.id)) {
            selectedWallets.delete(wallet.id);
            checkbox.style.background = "transparent";
          } else {
            selectedWallets.add(wallet.id);
            checkbox.style.background = "#7367F0";
          }
        });

        // Hover effects
        walletItem.addEventListener("mouseenter", () => {
          walletItem.style.background = "rgba(115, 103, 240, 0.4)";
        });

        walletItem.addEventListener("mouseleave", () => {
          walletItem.style.background = "transparent";
        });

        walletList.appendChild(walletItem);
      });

      // Button event handlers
      selectAllBtn.addEventListener("click", () => {
        selectedWallets.clear();
        wallets.forEach(wallet => {
          selectedWallets.add(wallet.id);
        });
        
        // Update all checkboxes
        walletList.querySelectorAll(".wallet-checkbox").forEach((checkbox, index) => {
          checkbox.style.background = "#7367F0";
        });
      });

      selectMainBtn.addEventListener("click", () => {
        selectedWallets.clear();
        selectedWallets.add("trench"); // Select only main wallet
        
        // Update checkboxes
        walletList.querySelectorAll(".wallet-checkbox").forEach((checkbox, index) => {
          if (index === 0) { // First wallet (main)
            checkbox.style.background = "#7367F0";
          } else {
            checkbox.style.background = "transparent";
          }
        });
      });

      // Toggle dropdown
      walletSelect.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isVisible = walletMenu.style.display === "block";
        if (isVisible) {
          walletMenu.style.display = "none";
        } else {
          // Position the dropdown relative to the wallet select button
          const rect = walletSelect.getBoundingClientRect();
          
          // Get the current scale of the panel
          const panelScale = parseFloat(container.style.transform.match(/scale\(([^)]+)\)/)?.[1] || 1);
          
          // Right-aligned positioning - align dropdown's right edge with the button's right edge
          // Account for panel scale in positioning and sizing
          walletMenu.style.left = (rect.right - 273) + "px";
          walletMenu.style.top = (rect.bottom + 1) + "px";
          walletMenu.style.transform = `scale(${panelScale})`;
          walletMenu.style.transformOrigin = "top right";
          walletMenu.style.display = "block";
        }
      });

      // Close dropdown when clicking outside
      document.addEventListener("click", (e) => {
        if (!walletDropdown.contains(e.target) && !walletMenu.contains(e.target)) {
          walletMenu.style.display = "none";
        }
      });

      // Handle clicks within the dropdown
      walletMenu.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      // Create header container with "Wallets" text and buttons
      const headerContainer = document.createElement("div");
      Object.assign(headerContainer.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "10px",
        paddingBottom: "2px",
        borderBottom: "1px solid rgba(115, 103, 240, 0.2)"
      });

      // Wallets text
      const walletsText = document.createElement("div");
      walletsText.textContent = "Wallets";
      Object.assign(walletsText.style, {
        fontSize: "14px",
        fontWeight: "500",
        color: "white",
        marginTop: "-10px",
        marginLeft: "3px"
      });

      // Assemble header container
      headerContainer.appendChild(walletsText);
      headerContainer.appendChild(buttonContainer);

      // Assemble dropdown
      buttonContainer.appendChild(selectAllBtn);
      buttonContainer.appendChild(selectMainBtn);
      walletMenu.appendChild(headerContainer);
      walletMenu.appendChild(walletList);
      walletDropdown.appendChild(walletSelect);
      walletSelectorWrapper.appendChild(walletDropdown);
      
      // Append dropdown menu to document body to avoid clipping
      document.body.appendChild(walletMenu);

      // Global click handler to close dropdown when clicking anywhere outside
      const globalClickHandler = (e) => {
        if (walletMenu.style.display === "block") {
          if (!walletDropdown.contains(e.target) && !walletMenu.contains(e.target)) {
            walletMenu.style.display = "none";
          }
        }
      };
      document.addEventListener("click", globalClickHandler);
  
      // Create settings icon
      const settingsIcon = document.createElement("img");
      settingsIcon.src = chrome.runtime.getURL('public/assets/images/settings.png');
      settingsIcon.alt = "Settings";
      settingsIcon.classList.add("settings-icon");
      Object.assign(settingsIcon.style, {
        width: "22px",
        height: "22px",
        marginLeft: "8px",
        verticalAlign: "middle",
        cursor: "pointer"
      });
      // Add click event listener to open settings page
      settingsIcon.addEventListener('click', () => {
  chrome.runtime.sendMessage({
    message: "openTab",
    url: chrome.runtime.getURL('public/Settings.html')
  });
});
  
      // Assemble header
      header.appendChild(logo);
      header.appendChild(walletSelectorWrapper);
      header.appendChild(settingsIcon);
  
      // Create tab select group
      const tabSelectGroup = document.createElement("div");
      tabSelectGroup.classList.add("tab-select-group");
      Object.assign(tabSelectGroup.style, {
        display: "flex",
        gap: "16px",
        height: "22px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
        marginTop: "8px", // Match main panel spacing exactly
        paddingTop: "3px",
        paddingBottom: "3px", // Match main panel padding exactly
        marginBottom: "6px", // Match main panel margin exactly
        marginLeft: "5px",
        alignItems: "center",
        position: "relative"
      });
  
      // Create tab buttons
      const createTabButton = (text, href) => {
        const link = document.createElement("a");
        link.href = href;
        const button = document.createElement("button");
        button.classList.add("tab-select");
        button.textContent = text;
        Object.assign(button.style, {
          background: "none",
          border: "none",
          color: "white",
          cursor: "pointer",
          position: "relative",
          paddingBottom: "4px",
          fontSize: "10px",
          fontWeight: "500",
          top: "-0.7px"
        });
        link.appendChild(button);
        return link;
      };
  
      const regularTab = createTabButton("Regular", "#");
      regularTab.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default link behavior
        window.lastPanelPosition = {
          left: container.style.left,
          top: container.style.top,
          transform: container.style.transform
        };
        // Remove current panel before creating the main panel
        document.querySelectorAll('.wallet-card').forEach(card => card.remove());
        addSolizTrenchPanel(); // This will take us back to the main panel
      });
      // Add hover/click effects for regular tab
      const regularButton = regularTab.querySelector('.tab-select');
      regularButton.addEventListener("mouseenter", () => {
        regularButton.style.color = "#7367F0";
        regularButton.style.transform = "translateY(-1px)";
      });
      regularButton.addEventListener("mouseleave", () => {
        regularButton.style.color = "white";
        regularButton.style.transform = "translateY(0)";
      });
      regularButton.addEventListener("mousedown", () => {
        regularButton.style.opacity = "0.7";
      });
      regularButton.addEventListener("mouseup", () => {
        regularButton.style.opacity = "1";
      });
      tabSelectGroup.appendChild(regularTab);
      
      // Set Regular tab as active by default
      regularButton.classList.add('active');
  
      const dcaTab = createTabButton("DCA", "#");
      // Add hover/click effects for DCA tab
      const dcaButton = dcaTab.querySelector('.tab-select');
      dcaButton.addEventListener("mouseenter", () => {
        dcaButton.style.color = "#7367F0";
        dcaButton.style.transform = "translateY(-1px)";
      });
      dcaButton.addEventListener("mouseleave", () => {
        dcaButton.style.color = "white";
        dcaButton.style.transform = "translateY(0)";
      });
      dcaButton.addEventListener("mousedown", () => {
        dcaButton.style.opacity = "0.7";
      });
      dcaButton.addEventListener("mouseup", () => {
        dcaButton.style.opacity = "1";
      });
      tabSelectGroup.appendChild(dcaTab);
  
      const positionManagerTab = createTabButton("Position Manager", "#");
      positionManagerTab.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default link behavior
        window.lastPanelPosition = {
          left: container.style.left,
          top: container.style.top,
          transform: container.style.transform
        };
        addPositionManagerPanel();
      });
      // Add hover/click effects for position manager tab
      const positionManagerButton = positionManagerTab.querySelector('.tab-select');
      positionManagerButton.addEventListener("mouseenter", () => {
        positionManagerButton.style.color = "#7367F0";
        positionManagerButton.style.transform = "translateY(-1px)";
      });
      positionManagerButton.addEventListener("mouseleave", () => {
        positionManagerButton.style.color = "white";
        positionManagerButton.style.transform = "translateY(0)";
      });
      positionManagerButton.addEventListener("mousedown", () => {
        positionManagerButton.style.opacity = "0.7";
      });
      positionManagerButton.addEventListener("mouseup", () => {
        positionManagerButton.style.opacity = "1";
      });
      tabSelectGroup.appendChild(positionManagerTab);
  
      // Create tab info
      const tabInfo = document.createElement("div");
      tabInfo.classList.add("tab-info");
      Object.assign(tabInfo.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        marginLeft: "auto"
      });
  
      const balance = document.createElement("span");
      balance.classList.add("tab-balance");
      balance.textContent = "126";
      balance.style.marginTop = "1px";
  
      const solanaIcon = document.createElement("img");
      solanaIcon.src = chrome.runtime.getURL('public/assets/images/solana-svg.svg');
      solanaIcon.alt = "Solana";
      solanaIcon.classList.add("tab-icon");
      Object.assign(solanaIcon.style, {
        width: "15px",
        height: "15px",
        marginLeft: "2px",
        verticalAlign: "middle"
      });
  
      const walletIcon = document.createElement("img");
      walletIcon.src = chrome.runtime.getURL('public/assets/images/wallet.png');
      walletIcon.alt = "Wallet";
      walletIcon.classList.add("tab-icon", "wallet-icon");
      Object.assign(walletIcon.style, {
        width: "18px",
        height: "18px",
        marginLeft: "2px",
        verticalAlign: "middle",
        cursor: "pointer"
      });
  
      tabInfo.appendChild(balance);
      tabInfo.appendChild(solanaIcon);
      tabInfo.appendChild(walletIcon);
      
      // Add disperse and consolidate icons below the wallet icon
      const disperseIcon = document.createElement("img");
      disperseIcon.src = chrome.runtime.getURL('public/assets/images/disperse.svg');
      disperseIcon.alt = "Disperse";
      disperseIcon.classList.add("tab-icon", "disperse-icon");
      Object.assign(disperseIcon.style, {
        width: "25px",
        height: "25px",
        verticalAlign: "middle",
        cursor: "pointer",
        opacity: "0.8"
      });
      
      const consolidateIcon = document.createElement("img");
      consolidateIcon.src = chrome.runtime.getURL('public/assets/images/consolidate.svg');
      consolidateIcon.alt = "Consolidate";
      consolidateIcon.classList.add("tab-icon", "consolidate-icon");
      Object.assign(consolidateIcon.style, {
        width: "25px",
        height: "25px",
        verticalAlign: "middle",
        cursor: "pointer",
        opacity: "0.8"
      });
      
      // Add hover effects for the icons
      disperseIcon.addEventListener('mouseenter', () => {
        disperseIcon.style.opacity = "1";
        disperseIcon.style.transform = "scale(1.1)";
      });
      disperseIcon.addEventListener('mouseleave', () => {
        disperseIcon.style.opacity = "0.8";
        disperseIcon.style.transform = "scale(1)";
      });
      
      consolidateIcon.addEventListener('mouseenter', () => {
        consolidateIcon.style.opacity = "1";
        consolidateIcon.style.transform = "scale(1.1)";
      });
      consolidateIcon.addEventListener('mouseleave', () => {
        consolidateIcon.style.opacity = "0.8";
        consolidateIcon.style.transform = "scale(1)";
      });
      
      // Add click handlers for API calls
      disperseIcon.addEventListener('click', async () => {
        console.log("Disperse button clicked");
        
        // Add loading state
        disperseIcon.style.opacity = "0.5";
        disperseIcon.style.transform = "scale(0.9)";
        disperseIcon.style.cursor = "not-allowed";
        
        try {
          await handleDisperseAction();
        } finally {
          // Reset loading state
          disperseIcon.style.opacity = "0.8";
          disperseIcon.style.transform = "scale(1)";
          disperseIcon.style.cursor = "pointer";
        }
      });
      
      consolidateIcon.addEventListener('click', async () => {
        console.log("Consolidate button clicked");
        
        // Add loading state
        consolidateIcon.style.opacity = "0.5";
        consolidateIcon.style.transform = "scale(0.9)";
        consolidateIcon.style.cursor = "not-allowed";
        
        try {
          await handleConsolidateAction();
        } finally {
          // Reset loading state
          consolidateIcon.style.opacity = "0.8";
          consolidateIcon.style.transform = "scale(1)";
          consolidateIcon.style.cursor = "pointer";
        }
      });
      
      tabSelectGroup.appendChild(tabInfo);
      
              // Create a SEPARATE ROW for disperse and consolidate icons below the tabs
    const iconRow = document.createElement("div");
    Object.assign(iconRow.style, {
      position: "absolute",
      top: "75px",
      right: "10px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      zIndex: "10"
    });
    
    // Add consolidate icon first (left), then disperse icon (right)
    iconRow.appendChild(consolidateIcon);
    iconRow.appendChild(disperseIcon);
    
    // Add wallet icon click handler for PnL toggle
    let isTrenchStatsOpen = !hidePnL;
    
    // Note: trenchStats will be created later and the click handler will be set up there

    // Add elements to container
    container.appendChild(header);
    container.appendChild(tabSelectGroup);
    
    // Add the icon row as an absolutely positioned element
    container.appendChild(iconRow);
  
      // Create tab stats row
      const tabStatsRow = document.createElement("div");
      tabStatsRow.classList.add("tab-stats-row");
      Object.assign(tabStatsRow.style, {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "30px",
        flexWrap: "wrap",
        position: "relative"
      });
  
      // Create tabs
      const tabs = document.createElement("div");
      tabs.classList.add("tabs");
      Object.assign(tabs.style, {
        display: "flex",
        gap: "6px",
        margin: "0"
      });
  
            // Create tabs with placeholder names first, then update with real names
      let selectedTopTabIndex = activePresetId - 1; // Use loaded preset state instead of default 0
      const topTabButtons = [];
      let tabNames = ["", "", ""]; // Start with empty names
      
      // Create tabs with empty names first
      tabNames.forEach((name, index) => {
        const tab = document.createElement("button");
        tab.classList.add("tab");
        if (index === selectedTopTabIndex) {
          tab.classList.add("active");
          tab.style.background = "#7367F0";
          tab.style.color = "white";
        } else {
          tab.style.background = "var(--bg-buttons)";
          tab.style.color = "var(--text-light)";
        }
        tab.textContent = name;
        Object.assign(tab.style, {
          flex: "1",
          padding: "0px",
          background: tab.style.background,
          border: "1.5px solid",
          color: tab.style.color,
          borderColor: "var(--border-color)",
          borderRadius: "6px",
          fontSize: "10px",
          minWidth: "50px",
          maxWidth: "50px",
          height: "20px",
          cursor: "pointer"
        });
        tab.addEventListener("click", async () => {
          topTabButtons.forEach((btn, i) => {
            btn.classList.remove("active");
            btn.style.background = "var(--bg-buttons)";
            btn.style.color = "var(--text-light)";
          });
          tab.classList.add("active");
          tab.style.background = "#7367F0";
          tab.style.color = "white";
          selectedTopTabIndex = index;
          
          // Load corresponding preset data based on tab index
          const presetId = index + 1; // Tab 0 = Preset 1, Tab 1 = Preset 2, Tab 2 = Preset 3
          console.log(`Switching to tab ${index} (${name}), loading preset ${presetId}`);
          
          // Store the current active preset ID
          try {
            await chrome.storage.sync.set({ currentActivePreset: presetId });
            console.log(`Set current active preset to ${presetId}`);
          } catch (error) {
            console.error('Error setting current active preset:', error);
          }
          
          try {
            // Get preset data from storage
            const result = await chrome.storage.sync.get(['extensionPresets']);
            if (result.extensionPresets && result.extensionPresets[presetId]) {
              const preset = result.extensionPresets[presetId];
              console.log(`Loading preset ${presetId}:`, preset);
              
              // Update the trench panel with the selected preset data
              updateTrenchPanelWithPreset(preset);
            } else {
              console.log(`No preset data found for preset ${presetId}`);
            }
          } catch (error) {
            console.error('Error loading preset data:', error);
          }
        });
        // Keep hover/click effects
        tab.addEventListener("mouseenter", () => {
          if (!tab.classList.contains("active")) {
            tab.style.background = "rgba(115, 103, 240, 0.75)";
            tab.style.color = "white";
            tab.style.transform = "translateY(-1px)";
          }
        });
        tab.addEventListener("mouseleave", () => {
          if (!tab.classList.contains("active")) {
            tab.style.background = "var(--bg-buttons)";
            tab.style.color = "var(--text-light)";
            tab.style.transform = "translateY(0)";
          }
        });
        tab.addEventListener("mousedown", () => {
          tab.style.opacity = "0.7";
        });
        tab.addEventListener("mouseup", () => {
          tab.style.opacity = "1";
        });
        topTabButtons.push(tab);
        tabs.appendChild(tab);
      });
      
      // Update tab names with real preset names from storage
      chrome.storage.sync.get(['extensionPresets'], (result) => {
        if (result.extensionPresets) {
          topTabButtons.forEach((tab, index) => {
            const presetId = index + 1;
            if (result.extensionPresets[presetId] && result.extensionPresets[presetId].name) {
              tab.textContent = result.extensionPresets[presetId].name;
            }
          });
        }
      });
  
      // Create wallet stats
      const walletStats = document.createElement("div");
      walletStats.classList.add("wallet-stats");
      Object.assign(walletStats.style, {
        display: "flex",
        flexDirection: "column",
        alignItems: "end",
        fontSize: "14px",
        position: "absolute",
        right: "0"
      });
  
      
  
      tabStatsRow.appendChild(tabs);
      tabStatsRow.appendChild(walletStats);
  
      // Create quick buy section
      const quickSection = document.createElement("section");
      quickSection.classList.add("quick-section");
      Object.assign(quickSection.style, {
        marginTop: "8px"
      });
  
      const quickBuyTitle = document.createElement("h2");
      quickBuyTitle.textContent = "Quick Buy";
      Object.assign(quickBuyTitle.style, {
        margin: "0 4px",
        fontSize: "18px",
        fontWeight: "400",
        display: "flex",
        alignItems: "center",
        gap: "4px"
      });
      
      // Add purple arrow to Quick Buy title
      const quickBuyArrow = document.createElement("img");
      quickBuyArrow.src = chrome.runtime.getURL('public/assets/images/Purplearrow.svg');
      quickBuyArrow.alt = "Arrow";
      Object.assign(quickBuyArrow.style, {
        width: "12px",
        height: "12px",
        cursor: "pointer"
      });
      
      quickBuyTitle.appendChild(quickBuyArrow);
  
      const buyInputs = document.createElement("div");
      buyInputs.classList.add("buy-inputs");
      Object.assign(buyInputs.style, {
        position: "relative",
        height: "40px"
      });
  
      const inputWrapper = document.createElement("div");
      inputWrapper.classList.add("input-wrapper", "w-1");
      Object.assign(inputWrapper.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        width: "233px"
      });
  
      const amountInput = document.createElement("input");
      amountInput.type = "text";
      amountInput.value = "0";
      amountInput.classList.add("input-amount");
      Object.assign(amountInput.style, {
        textAlign: "left",
        width: "100%",
        marginLeft: "0px",
        paddingLeft: "13px",
        paddingTop: "6px",
        paddingRight: "28px"
      });
  
      const inputSolanaIcon = document.createElement("img");
      inputSolanaIcon.src = chrome.runtime.getURL('public/assets/images/solana-svg.svg');
      inputSolanaIcon.alt = "Solana";
      inputSolanaIcon.classList.add("tab-icon");
      Object.assign(inputSolanaIcon.style, {
        position: "absolute",
        right: "8px",
        top: "55%",
        transform: "translateY(-50%)",
        width: "14px",
        height: "14px",
        pointerEvents: "none"
      });
  
      const buyButton = document.createElement("button");
      buyButton.classList.add("buy-btn");
      buyButton.textContent = "Buy";
      Object.assign(buyButton.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--accent-purple)",
        color: "white",
        border: "none",
        borderRadius: "6px",
        padding: "10px 0",
        position: "absolute",
        right: "0px",
        top: "0px",
        width: "72px",
        fontWeight: "400",
        cursor: "pointer",
        height: "31px"
      });
  
     // Add focus behavior to buy amount input
     amountInput.addEventListener('focus', function() {
      this.select(); // Select all text when focused
    });
    
    amountInput.addEventListener('blur', function() {
      if (this.value === '') {
          this.value = '0';
        }
      });
         // Add focus behavior to buy amount input
   amountInput.addEventListener('focus', function() {
    this.select(); // Select all text when focused
  });
  
  amountInput.addEventListener('blur', function() {
    if (this.value === '') {
      this.value = '0';
    }
  });
  // Add input validation for buy amount - allow numbers and decimals
amountInput.addEventListener('input', function() {
  this.value = this.value.replace(/[^0-9.]/g, '');
  // Prevent multiple decimal points
  const parts = this.value.split('.');
  if (parts.length > 2) {
    this.value = parts[0] + '.' + parts.slice(1).join('');
  }
});
      inputWrapper.appendChild(amountInput);
      inputWrapper.appendChild(inputSolanaIcon);
      buyInputs.appendChild(inputWrapper);
      buyInputs.appendChild(buyButton);
  
      // Add hover/click effects for buy button (top half)
      buyButton.addEventListener("mouseenter", () => {
        buyButton.style.background = "#8f85f3";
        buyButton.style.transform = "translateY(-1px)";
      });
      buyButton.addEventListener("mouseleave", () => {
        buyButton.style.background = "var(--accent-purple)";
        buyButton.style.transform = "translateY(0)";
      });
      buyButton.addEventListener("mousedown", () => {
        buyButton.style.opacity = "0.7";
      });
      buyButton.addEventListener("mouseup", () => {
        buyButton.style.opacity = "1";
      });
  
      // Create buy options container
      const buyOptions = document.createElement("div");
      buyOptions.classList.add("buy-options");
      Object.assign(buyOptions.style, {
        display: "flex",
        flexDirection: "column",
        gap: "7px"
  });

      // First row of buy buttons
      const buyOptionsRow1 = document.createElement("div");
      Object.assign(buyOptionsRow1.style, {
        display: "flex",
        flexWrap: "wrap",
        gap: "7px",
        justifyContent: "space-between"
      });

      // Get preset data from storage or use defaults
      let presetAmountsRow1 = ["0.5", "1", "3", "5"];
      let presetAmountsRow2 = ["0.5", "2", "4", "10"];
      
      // Use the active preset data that was loaded earlier
      if (activePresetData && activePresetData.buyPresets) {
        const savedPresets = activePresetData.buyPresets;
        if (savedPresets.length >= 8) {
          presetAmountsRow1 = savedPresets.slice(0, 4);
          presetAmountsRow2 = savedPresets.slice(4, 8);
          console.log('Using active preset buy presets:', { row1: presetAmountsRow1, row2: presetAmountsRow2 });
        }
      } else {
        // Fallback to loading from storage
        if (typeof chrome !== 'undefined' && chrome.storage) {
          try {
            const result = await chrome.storage.sync.get(['extensionPresets']);
            if (result.extensionPresets && result.extensionPresets[activePresetId] && result.extensionPresets[activePresetId].buyPresets) {
              const savedPresets = result.extensionPresets[activePresetId].buyPresets;
              if (savedPresets.length >= 8) {
                presetAmountsRow1 = savedPresets.slice(0, 4);
                presetAmountsRow2 = savedPresets.slice(4, 8);
                console.log('Loaded saved buy presets from storage:', { row1: presetAmountsRow1, row2: presetAmountsRow2 });
              }
            }
          } catch (error) {
            console.log('Error loading saved presets, using defaults:', error);
          }
        }
      }
      
      presetAmountsRow1.forEach(amount => {
        const button = document.createElement("button");
        Object.assign(button.style, {
          flex: "1 1 calc(25% - 5.25px)",
          background: "#44418F",
          color: "white",
          border: "none",
          padding: "6px",
          borderRadius: "var(--border-radius)",
          fontSize: "13px",
          fontWeight: "400",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: "0"
        });
  
        // Create a wrapper for centering
        const contentWrapper = document.createElement("span");
        contentWrapper.style.display = "flex";
        contentWrapper.style.alignItems = "center";
        contentWrapper.style.justifyContent = "center";
        contentWrapper.style.width = "100%";
  
        const amountSpan = document.createElement("span");
        amountSpan.textContent = amount;
        amountSpan.style.display = "inline-block";
  
        const buttonSolIcon = document.createElement("img");
        buttonSolIcon.src = chrome.runtime.getURL('public/assets/images/solana-svg.svg');
        buttonSolIcon.alt = "Solana";
        buttonSolIcon.style.width = "14px";
        buttonSolIcon.style.height = "14px";
        buttonSolIcon.style.marginLeft = "4px";
        buttonSolIcon.style.verticalAlign = "middle";
        buttonSolIcon.style.display = "inline-block";
  
        contentWrapper.appendChild(amountSpan);
        contentWrapper.appendChild(buttonSolIcon);
        button.appendChild(contentWrapper);
  
        // Add hover/click effects for buy preset buttons (first row)
        button.addEventListener("mouseenter", () => {
          button.style.background = "#373479";
          button.style.transform = "translateY(-1px)";
        });
        button.addEventListener("mouseleave", () => {
          button.style.background = "#44418F";
          button.style.transform = "translateY(0)";
        });
        button.addEventListener("mousedown", () => {
          button.style.opacity = "0.7";
        });
        button.addEventListener("mouseup", () => {
          button.style.opacity = "1";
        });
        buyOptionsRow1.appendChild(button);
      });

      // Grey line between buy button rows
      const buyGreyLine = document.createElement("div");
      Object.assign(buyGreyLine.style, {
        width: "25px",
        height: "1px",
        background: "rgba(255, 255, 255, 0.1)",
        margin: "0 auto"
      });

      // Buy toggle 

      // Second row of buy buttons
      const buyOptionsRow2 = document.createElement("div");
      Object.assign(buyOptionsRow2.style, {
        display: "flex",
        flexWrap: "wrap",
        gap: "7px",
        justifyContent: "space-between",
        overflow: "hidden",
        transition: "none", // Disable transitions during initial creation
        maxHeight: hideBuyRow ? "0" : "40px",
        opacity: hideBuyRow ? "0" : "1"
      });

      presetAmountsRow2.forEach(amount => {
        const button = document.createElement("button");
        Object.assign(button.style, {
          flex: "1 1 calc(25% - 5.25px)",
          background: "#44418F",
          color: "white",
          border: "none",
          padding: "6px",
          borderRadius: "var(--border-radius)",
          fontSize: "13px",
          fontWeight: "400",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: "0"
        });
  
        // Create a wrapper for centering
        const contentWrapper = document.createElement("span");
        contentWrapper.style.display = "flex";
        contentWrapper.style.alignItems = "center";
        contentWrapper.style.justifyContent = "center";
        contentWrapper.style.width = "100%";
  
        const amountSpan = document.createElement("span");
        amountSpan.textContent = amount;
        amountSpan.style.display = "inline-block";
  
        const buttonSolIcon = document.createElement("img");
        buttonSolIcon.src = chrome.runtime.getURL('public/assets/images/solana-svg.svg');
        buttonSolIcon.alt = "Solana";
        buttonSolIcon.style.width = "14px";
        buttonSolIcon.style.height = "14px";
        buttonSolIcon.style.marginLeft = "4px";
        buttonSolIcon.style.verticalAlign = "middle";
        buttonSolIcon.style.display = "inline-block";
  
        contentWrapper.appendChild(amountSpan);
        contentWrapper.appendChild(buttonSolIcon);
        button.appendChild(contentWrapper);
  
        // Add hover/click effects for buy preset buttons (second row)
        button.addEventListener("mouseenter", () => {
          button.style.background = "#373479";
          button.style.transform = "translateY(-1px)";
        });
        button.addEventListener("mouseleave", () => {
          button.style.background = "#44418F";
          button.style.transform = "translateY(0)";
        });
        button.addEventListener("mousedown", () => {
          button.style.opacity = "0.7";
        });
        button.addEventListener("mouseup", () => {
          button.style.opacity = "1";
        });
        buyOptionsRow2.appendChild(button);
      });

      // Buy toggle functionality
      let isBuyRow2Open = true;

      // Add click event to Quick Buy arrow to toggle second row
      if (quickBuyArrow) {
        // Set initial state based on pre-loaded hideBuyRow
        let isBuyRow2Open = !hideBuyRow;
        if (hideBuyRow) {
          buyOptionsRow2.style.maxHeight = '0';
          buyOptionsRow2.style.opacity = '0';
          buyOptions.style.gap = '0px';
          buyGreyLine.style.display = 'none';
        }

        quickBuyArrow.addEventListener('click', async () => {
          isBuyRow2Open = !isBuyRow2Open;
          if (isBuyRow2Open) {
            buyOptionsRow2.style.maxHeight = '40px';
            buyOptionsRow2.style.opacity = '1';
            buyOptions.style.gap = '7px';
            buyGreyLine.style.display = 'block';
            await chrome.storage.local.set({ "Soliz.hideBuyRow.axiom": false });
          } else {
            buyOptionsRow2.style.maxHeight = '0';
            buyOptionsRow2.style.opacity = '0';
            buyOptions.style.gap = '0px';
            buyGreyLine.style.display = 'none';
            await chrome.storage.local.set({ "Soliz.hideBuyRow.axiom": true });
          }
        });
      }

      // Add all buy elements to container
      buyOptions.appendChild(buyOptionsRow1);
      buyOptions.appendChild(buyGreyLine);
      buyOptions.appendChild(buyOptionsRow2);
  
      quickSection.appendChild(quickBuyTitle);
      quickSection.appendChild(buyInputs);
      quickSection.appendChild(buyOptions);
  
      // Add all sections to container
      container.appendChild(tabStatsRow);
      container.appendChild(quickSection);
  

  
      // Red tabs
      const redTabs = document.createElement("div");
      redTabs.classList.add("tabs", "red");
      Object.assign(redTabs.style, {
        display: "flex",
        gap: "6px",
        margin: "0"
      });
      let selectedBottomTabIndex = 0;
      const bottomTabButtons = [];
      // Use the same tabNames array for bottom tabs
      tabNames.forEach((name, index) => {
        const tab = document.createElement("button");
        tab.classList.add("tab");
        if (index === selectedBottomTabIndex) {
          tab.classList.add("active");
          tab.style.background = "#7367F0";
          tab.style.color = "white";
        } else {
          tab.style.background = "var(--bg-buttons)";
          tab.style.color = "var(--text-light)";
        }
        tab.textContent = name;
        Object.assign(tab.style, {
          flex: "1",
          padding: "0px",
          background: tab.style.background,
          border: "1.5px solid",
          color: tab.style.color,
          borderColor: "var(--border-color)",
          borderRadius: "6px",
          fontSize: "10px",
          minWidth: "50px",
          maxWidth: "50px",
          height: "20px",
          cursor: "pointer"
        });
        tab.addEventListener("click", () => {
          bottomTabButtons.forEach((btn, i) => {
            btn.classList.remove("active");
            btn.style.background = "var(--bg-buttons)";
            btn.style.color = "var(--text-light)";
          });
          tab.classList.add("active");
          tab.style.background = "#7367F0";
          tab.style.color = "white";
          selectedBottomTabIndex = index;
        });
        // Keep hover/click effects
        tab.addEventListener("mouseenter", () => {
          if (!tab.classList.contains("active")) {
            tab.style.background = "rgba(115, 103, 240, 0.75)";
            tab.style.color = "white";
            tab.style.transform = "translateY(-1px)";
          }
        });
        tab.addEventListener("mouseleave", () => {
          if (!tab.classList.contains("active")) {
            tab.style.background = "var(--bg-buttons)";
            tab.style.color = "var(--text-light)";
            tab.style.transform = "translateY(0)";
          }
        });
        tab.addEventListener("mousedown", () => {
          tab.style.opacity = "0.7";
        });
        tab.addEventListener("mouseup", () => {
          tab.style.opacity = "1";
        });
        bottomTabButtons.push(tab);
        redTabs.appendChild(tab);
      });
  
      // Quick Sell Section
      const quickSellSection = document.createElement("section");
      quickSellSection.classList.add("quick-section");
      Object.assign(quickSellSection.style, {
        marginTop: "0px",
        paddingBottom: "0px",
        marginBottom: "0px"
      });
      const quickSellTitle = document.createElement("h2");
      quickSellTitle.textContent = "Quick Sell";
      Object.assign(quickSellTitle.style, {
        margin: "0 4px 0 4px",
        fontSize: "18px",
        fontWeight: "400",
        display: "flex",
        alignItems: "center",
        gap: "4px"
      });
      
      // Add purple arrow to Quick Sell title
      const quickSellArrow = document.createElement("img");
      quickSellArrow.src = chrome.runtime.getURL('public/assets/images/Purplearrow.svg');
      quickSellArrow.alt = "Arrow";
      Object.assign(quickSellArrow.style, {
        width: "12px",
        height: "12px",
        cursor: "pointer"
      });
      quickSellTitle.appendChild(quickSellArrow);
      const sellButtons = document.createElement("div");
      sellButtons.classList.add("sell-buttons");
      Object.assign(sellButtons.style, {
        position: "relative",
        height: "40px"
      });
      const sellInputWrapper = document.createElement("div");
      sellInputWrapper.classList.add("input-wrapper");
      Object.assign(sellInputWrapper.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        width: "153px"
      });
      const sellAmountInput = document.createElement("input");
      sellAmountInput.type = "text";
      sellAmountInput.value = "0";
      sellAmountInput.classList.add("input-amount", "sell-input-red");
      sellAmountInput.placeholder = "0";
      Object.assign(sellAmountInput.style, {
        textAlign: "left",
        width: "100%",
        marginLeft: "1px",
        paddingLeft: "8px",
        paddingTop: "6px",
        paddingRight: "25px"
      });
      const sellInputSolanaIcon = document.createElement("img");
      sellInputSolanaIcon.src = chrome.runtime.getURL('public/assets/images/solana-svg.svg');
      sellInputSolanaIcon.alt = "Solana";
      sellInputSolanaIcon.classList.add("tab-icon");
      Object.assign(sellInputSolanaIcon.style, {
        position: "absolute",
        right: "8px",
        top: "55%",
        transform: "translateY(-50%)",
        width: "14px",
        height: "14px",
        pointerEvents: "none"
      });
      
    // Add focus behavior to sell amount input
    sellAmountInput.addEventListener('focus', function() {
      this.select(); // Select all text when focused
    });
    
    sellAmountInput.addEventListener('blur', function() {
      if (this.value === '') {
        this.value = '0';
        }
      });
      // Add input validation for sell amount - allow numbers and decimals
sellAmountInput.addEventListener('input', function() {
  this.value = this.value.replace(/[^0-9.]/g, '');
  // Prevent multiple decimal points
  const parts = this.value.split('.');
  if (parts.length > 2) {
    this.value = parts[0] + '.' + parts.slice(1).join('');
      }
    });
      sellInputWrapper.appendChild(sellAmountInput);
      sellInputWrapper.appendChild(sellInputSolanaIcon);
      const percentInputWrapper = document.createElement("div");
      percentInputWrapper.classList.add("input-wrapper");
      Object.assign(percentInputWrapper.style, {
        width: "76px",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "6px",
        position: "absolute",
        left: "157px",
        top: "0px"
      });
      const percentInput = document.createElement("input");
      percentInput.type = "text";
      percentInput.value = "0";
      percentInput.classList.add("input-amount", "sell-input-red");
      percentInput.placeholder = "%";
      Object.assign(percentInput.style, {
        textAlign: "left",
        flex: "1 1 0",
        minWidth: "0",
        marginLeft: "5px",
        paddingLeft: "8px",
        paddingRight: "25px"
      });
      // Add focus behavior to percent input
      percentInput.addEventListener('focus', function() {
        this.select(); // Select all text when focused
      });
      
      percentInput.addEventListener('blur', function() {
        if (this.value === '') {
          this.value = '0';
        }
      });
      
      // Add input validation for percent - only numbers up to 100
      percentInput.addEventListener('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '');
        // Remove leading zeros in multi-digit numbers
        if (this.value.length > 1 && this.value.startsWith('0')) {
          this.value = this.value.substring(1);
        }
        if (parseInt(this.value) > 100) {
          this.value = '0';
        }
      });
      
      percentInputWrapper.appendChild(percentInput);
   
      // Add percentage symbol to the right side of the input field
      const percentSymbol = document.createElement("span");
      percentSymbol.textContent = "%";
      Object.assign(percentSymbol.style, {
        position: "absolute",
        right: "8px",
        top: "57%",
        transform: "translateY(-50%)",
        color: "white",
        fontSize: "14px",
        fontWeight: "400",
        pointerEvents: "none",
        zIndex: "10"
      });
      
      percentInputWrapper.appendChild(percentSymbol);
      const sellButton = document.createElement("button");
      sellButton.classList.add("sell-btn");
      sellButton.textContent = "Sell";
      Object.assign(sellButton.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--accent-red)",
        color: "white",
        border: "none",
        borderRadius: "6px",
        padding: "10px 0",
        position: "absolute",
        right: "0px",
        top: "0px",
        width: "72px",
        fontWeight: "400",
        cursor: "pointer",
        height: "31px"
      });
      sellButtons.appendChild(sellInputWrapper);
      sellButtons.appendChild(percentInputWrapper);
      sellButtons.appendChild(sellButton);
      
      // Add hover/click effects for sell button
      sellButton.addEventListener("mouseenter", () => {
        sellButton.style.background = "#6a1f25";
        sellButton.style.transform = "translateY(-1px)";
      });
      sellButton.addEventListener("mouseleave", () => {
        sellButton.style.background = "var(--accent-red)";
        sellButton.style.transform = "translateY(0)";
      });
      sellButton.addEventListener("mousedown", () => {
        sellButton.style.opacity = "0.7";
      });
      sellButton.addEventListener("mouseup", () => {
        sellButton.style.opacity = "1";
      });
      // Sell options container
      const sellOptions = document.createElement("div");
      sellOptions.classList.add("sell-options");
      Object.assign(sellOptions.style, {
        display: "flex",
        flexDirection: "column",
        gap: "7px"
      });

      // First row of sell buttons
      const sellOptionsRow1 = document.createElement("div");
      Object.assign(sellOptionsRow1.style, {
        display: "flex",
        flexWrap: "wrap",
        gap: "7px",
        justifyContent: "space-between"
      });

      // Get sell preset data from storage or use defaults
      let sellPresetLabelsRow1 = ["Initials", "25", "50", "100"];
      let sellPresetLabelsRow2 = ["10", "15", "20", "75"];
      
      // Use the active preset data that was loaded earlier
      if (activePresetData && activePresetData.sellPresets) {
        const savedSellPresets = activePresetData.sellPresets;
        if (savedSellPresets.length >= 8) {
          // Extract numbers from sell presets (remove % and "Initials")
          const row1Presets = savedSellPresets.slice(0, 4).map(preset => {
            if (preset === 'Initials') return 'Initials';
            return preset.replace(/%/g, ''); // Remove all % symbols
          });
          const row2Presets = savedSellPresets.slice(4, 8).map(preset => {
            return preset.replace(/%/g, ''); // Remove all % symbols
          });
          sellPresetLabelsRow1 = row1Presets;
          sellPresetLabelsRow2 = row2Presets;
          console.log('Using active preset sell presets:', { row1: sellPresetLabelsRow1, row2: sellPresetLabelsRow2 });
        }
      } else {
        // Fallback to loading from storage
        if (typeof chrome !== 'undefined' && chrome.storage) {
          try {
            const result = await chrome.storage.sync.get(['extensionPresets']);
            if (result.extensionPresets && result.extensionPresets[activePresetId] && result.extensionPresets[activePresetId].sellPresets) {
              const savedSellPresets = result.extensionPresets[activePresetId].sellPresets;
              if (savedSellPresets.length >= 8) {
                // Extract numbers from sell presets (remove % and "Initials")
                const row1Presets = savedSellPresets.slice(0, 4).map(preset => {
                  if (preset === 'Initials') return 'Initials';
                  return preset.replace(/%/g, ''); // Remove all % symbols
                });
                const row2Presets = savedSellPresets.slice(4, 8).map(preset => {
                  return preset.replace(/%/g, ''); // Remove all % symbols
                });
                sellPresetLabelsRow1 = row1Presets;
                sellPresetLabelsRow2 = row2Presets;
                console.log('Loaded saved sell presets from storage:', { row1: sellPresetLabelsRow1, row2: sellPresetLabelsRow2 });
              }
            }
          } catch (error) {
            console.log('Error loading saved sell presets, using defaults:', error);
          }
        }
      }
      
      sellPresetLabelsRow1.forEach((label, index) => {
        const button = document.createElement("button");
        Object.assign(button.style, {
          flex: "1 1 calc(25% - 5.25px)",
          background: "#A83941",
          color: "white",
          border: "none",
          padding: "6px",
          borderRadius: "var(--border-radius)",
          fontSize: "13px",
          fontWeight: "400",
          cursor: "pointer",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: "3px",
          width: "100%",
          minWidth: "0"
        });
        const labelSpan = document.createElement("span");
        labelSpan.textContent = label;
        Object.assign(labelSpan.style, {
          display: "inline-block"
        });
        button.appendChild(labelSpan);
        
        // Only add % symbol if it's not "Initials" and not empty
        if (label !== 'Initials' && label !== '') {
          const percentSpan = document.createElement("span");
          percentSpan.textContent = "%";
          Object.assign(percentSpan.style, {
            display: "inline-block",
            fontSize: "13px"
          });
          button.appendChild(percentSpan);
        }
        sellOptionsRow1.appendChild(button);
        
        // Add hover effects for sell button
        button.addEventListener("mouseenter", () => {
          button.style.background = "#6a1f25";
          button.style.transform = "translateY(-1px)";
        });
        button.addEventListener("mouseleave", () => {
          button.style.background = "#A83941";
          button.style.transform = "translateY(0)";
        });
        button.addEventListener("mousedown", () => {
          button.style.opacity = "0.7";
        });
        button.addEventListener("mouseup", () => {
          button.style.opacity = "1";
        });
      });

      // Grey line between sell button rows
      const sellGreyLine = document.createElement("div");
      Object.assign(sellGreyLine.style, {
        width: "25px",
        height: "1px",
        background: "rgba(255, 255, 255, 0.1)",
        margin: "-2px auto 0 auto"
      });


      // Second row of sell buttons
      const sellOptionsRow2 = document.createElement("div");
      Object.assign(sellOptionsRow2.style, {
        display: "flex",
        flexWrap: "wrap",
        gap: "7px",
        justifyContent: "space-between",
        overflow: "hidden",
        transition: "none", // Disable transitions during initial creation
        maxHeight: hideSellRow ? "0" : "40px",
        opacity: hideSellRow ? "0" : "1"
      });

      sellPresetLabelsRow2.forEach((label, index) => {
        const button = document.createElement("button");
        Object.assign(button.style, {
          flex: "1 1 calc(25% - 5.25px)",
          background: "#A83941",
          color: "white",
          border: "none",
          padding: "6px",
          borderRadius: "var(--border-radius)",
          fontSize: "13px",
          fontWeight: "400",
          cursor: "pointer",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: "3px",
          width: "100%",
          minWidth: "0"
        });

        const labelSpan = document.createElement("span");
        labelSpan.textContent = label;
        Object.assign(labelSpan.style, {
          display: "inline-block"
        });

        button.appendChild(labelSpan);
        
        // Only add % symbol if it's not "Initials" and not empty
        if (label !== 'Initials' && label !== '') {
          const percentSpan = document.createElement("span");
          percentSpan.textContent = "%";
          Object.assign(percentSpan.style, {
            display: "inline-block",
            fontSize: "13px"
          });
          button.appendChild(percentSpan);
        }

        sellOptionsRow2.appendChild(button);
        
        // Add hover effects for sell button
        button.addEventListener("mouseenter", () => {
          button.style.background = "#6a1f25";
          button.style.transform = "translateY(-1px)";
        });
        button.addEventListener("mouseleave", () => {
          button.style.background = "#A83941";
          button.style.transform = "translateY(0)";
        });
        button.addEventListener("mousedown", () => {
          button.style.opacity = "0.7";
        });
        button.addEventListener("mouseup", () => {
          button.style.opacity = "1";
        });
      });

      // Sell toggle functionality - removed sellToggleBar event listener to fix spacing issues
      let isSellRow2Open = true;

      // Add click event to Quick Sell arrow to toggle second row
      if (quickSellArrow) {
        // Set initial state based on pre-loaded hideSellRow
        let isSellRow2Open = !hideSellRow;
        if (hideSellRow) {
          sellOptionsRow2.style.maxHeight = '0';
          sellOptionsRow2.style.opacity = '0';
          sellOptions.style.gap = '0px';
          sellGreyLine.style.display = 'none';
        }

        quickSellArrow.addEventListener('click', async () => {
          isSellRow2Open = !isSellRow2Open;
          if (isSellRow2Open) {
            sellOptionsRow2.style.maxHeight = '40px';
            sellOptionsRow2.style.opacity = '1';
            sellOptions.style.gap = '7px';
            sellGreyLine.style.display = 'block';
            await chrome.storage.local.set({ "Soliz.hideSellRow.axiom": false });
          } else {
            sellOptionsRow2.style.maxHeight = '0';
            sellOptionsRow2.style.opacity = '0';
            sellOptions.style.gap = '0px';
            sellGreyLine.style.display = 'none';
            await chrome.storage.local.set({ "Soliz.hideSellRow.axiom": true });
          }
        });
      }

      // Add all sell elements to container
      sellOptions.appendChild(sellOptionsRow1);
      sellOptions.appendChild(sellGreyLine);
      sellOptions.appendChild(sellOptionsRow2);
    


      // Trench stats
              const trenchStats = document.createElement("div");
        trenchStats.classList.add("trench-stats", hidePnL ? "trench-stats-closed" : "trench-stats-open");
        Object.assign(trenchStats.style, {
        overflow: "hidden",
        transition: "none", // Disable transitions during initial creation
        maxHeight: hidePnL ? "0" : "200px",
        opacity: hidePnL ? "0" : "1",
        paddingBottom: "0px",
        marginBottom: "0px"
      });
      const walletSummary = document.createElement("footer");
      walletSummary.classList.add("wallet-summary");
      Object.assign(walletSummary.style, {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        fontSize: "12px",
        paddingTop: "8px",
        textAlign: "center",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)"
      });
      const createSummaryItem = (label, value, className = "") => {
        const div = document.createElement("div");
        if (className) div.classList.add(className);
        Object.assign(div.style, {
          backgroundColor: "#393B638C",
          borderRadius: "4px",
          height: "42px",
          boxSizing: "border-box",
          padding: "3px 0px",
          width: className.includes("w-50") ? "calc((100% - 6px) / 2)" : "calc((100% - 12px) / 3)",
          color: "#C7C7C7"
        });

        div.textContent = label;
        const valueSpan = document.createElement("span");
        
        // Check if value contains "Sol" and replace with Solana PNG
        if (value.includes("Sol")) {
          const numberText = value.replace(" Sol", "");
          valueSpan.textContent = numberText;
          
          const solanaIcon = document.createElement("img");
          solanaIcon.src = chrome.runtime.getURL('public/assets/images/solana-svg.svg');
          solanaIcon.alt = "SOL";
          Object.assign(solanaIcon.style, {
            height: "9.6px",
            width: "9.6px",
            verticalAlign: "middle",
            marginLeft: "2px",
            marginTop: "-1px",
            display: "inline-block"
          });
          
          valueSpan.appendChild(solanaIcon);
          
          // Add percentage if this is the Remaining box
          if (label === "Remaining") {
            const percentageSpan = document.createElement("span");
            percentageSpan.textContent = " (402%)";
            percentageSpan.style.color = "var(--accent-green)";
            percentageSpan.style.fontSize = "10px";
            percentageSpan.style.display = "inline";
            percentageSpan.style.marginTop = "-1px";
            valueSpan.appendChild(percentageSpan);
          }
        } else {
        valueSpan.textContent = value;
        }
        
        Object.assign(valueSpan.style, {
          display: "block",
          fontSize: "10px",
          marginTop: "0px",
          color: "white"
        });

        if (className.includes("w-50")) {
          Object.assign(valueSpan.style, {
            color: "var(--accent-green)",
            fontWeight: "normal"
          });
        }

        div.appendChild(valueSpan);
        return div;
      };
      walletSummary.appendChild(createSummaryItem("Invested", "2.3 Sol"));
      walletSummary.appendChild(createSummaryItem("Sold", "-"));
      walletSummary.appendChild(createSummaryItem("Remaining", "23 Sol"));

      trenchStats.appendChild(walletSummary);

      // Create grey line between sell buttons and Quick Sell title
      const greyLine = document.createElement("div");
      Object.assign(greyLine.style, {
        width: "100%",
        height: "1px",
        background: "rgba(255, 255, 255, 0.1)",
        margin: "8px 0"
      });

      quickSellSection.appendChild(greyLine);
      quickSellSection.appendChild(quickSellTitle);
      quickSellSection.appendChild(sellButtons);
      quickSellSection.appendChild(sellOptions);
      quickSellSection.appendChild(trenchStats);

      container.appendChild(quickSellSection);
  
      // Add hover/click effects for top tab select group (Regular, DCA, Position Manager)
      tabSelectGroup.querySelectorAll('.tab-select').forEach(btn => {
        btn.addEventListener("mouseenter", () => {
          btn.style.color = "#7367F0";
          btn.style.transform = "translateY(-1px)";
        });
        btn.addEventListener("mouseleave", () => {
          // Don't override color if it's the active tab
          if (!btn.classList.contains('active')) {
            btn.style.color = "white";
          }
          btn.style.transform = "translateY(0)";
        });
        btn.addEventListener("mousedown", () => {
          btn.style.opacity = "0.7";
        });
        btn.addEventListener("mouseup", () => {
          btn.style.opacity = "1";
        });
      });
  
      // Add to document
      document.body.appendChild(container);

      // Add wallet icon click handler for PnL toggle (after trenchStats is created)
      walletIcon.addEventListener('click', async () => {
        isTrenchStatsOpen = !isTrenchStatsOpen;
        trenchStats.classList.toggle('trench-stats-open', isTrenchStatsOpen);
        trenchStats.classList.toggle('trench-stats-closed', !isTrenchStatsOpen);
        // Directly set maxHeight/opacity for smooth animation
        if (isTrenchStatsOpen) {
          trenchStats.style.maxHeight = '200px';
          trenchStats.style.opacity = '1';
          await chrome.storage.local.set({ "Soliz.hidePnL.axiom": false });
        } else {
          trenchStats.style.maxHeight = '0';
          trenchStats.style.opacity = '0';
          await chrome.storage.local.set({ "Soliz.hidePnL.axiom": true });
        }
      });

      // Initialize Soliz's smooth resizing system
      console.log('Initializing resize for main panel...'); // Debug log
      initializePanelResize(container, "Soliz.panelScale.axiom").catch(err => {
        console.error('Failed to initialize resize:', err);
      });
  
      // Initialize Soliz sophisticated smooth drag system
      function initializePanelDrag(panelRoot, storageKey) {
        // Clean up any existing drag handlers first
        const existingHeader = panelRoot.querySelector('.logo');
        if (existingHeader) {
          existingHeader.removeEventListener('mousedown', existingHeader._dragMousedownHandler);
          document.removeEventListener('mousemove', existingHeader._dragMousemoveHandler);
          document.removeEventListener('mouseup', existingHeader._dragMouseupHandler);
        }
        
        let panelDragOffsetX = 0;
        let panelDragOffsetY = 0;
        let panelDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        let panelDragAnimationId;
        let dragOverlay = null;

        // Create drag overlay for smooth dragging
        function createDragOverlay() {
          dragOverlay = document.createElement("div");
          Object.assign(dragOverlay.style, {
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            zIndex: 999999,
            cursor: "move",
            background: "transparent"
          });
          document.body.appendChild(dragOverlay);
        }

        // Animation management
        const stopPanelDragAnimation = () => {
          if (panelDragAnimationId) {
            cancelAnimationFrame(panelDragAnimationId);
            panelDragAnimationId = null;
          }
        };

        // Smooth animation loop using requestAnimationFrame
        const initiatePanelDragAnimation = () => {
          const updatePosition = () => {
            if (!panelDragging) return;

            // Get current scale from transform
            const currentTransform = panelRoot.style.transform;
            const scaleMatch = currentTransform.match(/scale\(([^)]+)\)/);
            const currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

            let left = lastMouseX - panelDragOffsetX;
            let top = lastMouseY - panelDragOffsetY;

            // Use the scaled dimensions for boundary calculations
            const scaledWidth = panelRoot.offsetWidth * currentScale;
            const scaledHeight = panelRoot.offsetHeight * currentScale;

            const maxLeft = window.innerWidth - scaledWidth;
            const maxTop = window.innerHeight - scaledHeight;

            left = Math.min(Math.max(left, 0), maxLeft);
            top = Math.min(Math.max(top, 0), maxTop);

            panelRoot.style.left = `${left}px`;
            panelRoot.style.top = `${top}px`;

            panelDragAnimationId = requestAnimationFrame(updatePosition);
          };

          stopPanelDragAnimation();
          panelDragAnimationId = requestAnimationFrame(updatePosition);
        };

        // Mouse down handler
        const handleMousedown = (evt) => {
          // Only allow dragging on the logo area (JEET MODE text), not the dropdown
          const logoEl = panelRoot.querySelector('.logo');
          if (logoEl && (evt.target === logoEl || logoEl.contains(evt.target))) {
            panelDragging = true;
            panelDragOffsetX = evt.clientX - panelRoot.getBoundingClientRect().left;
            panelDragOffsetY = evt.clientY - panelRoot.getBoundingClientRect().top;
            lastMouseX = evt.clientX;
            lastMouseY = evt.clientY;
            panelRoot.style.userSelect = "none";
            panelRoot.style.opacity = "0.7"; // Visual feedback for drag mode

            createDragOverlay();
            initiatePanelDragAnimation();
          }
        };

        // Mouse move handler
        const handleMousemove = (evt) => {
          if (!panelDragging) return;
          lastMouseX = evt.clientX;
          lastMouseY = evt.clientY;
        };

        // Mouse up handler
        const handleMouseup = async () => {
          if (!panelDragging) return;
          
          panelDragging = false;
          panelRoot.style.userSelect = "";
          panelRoot.style.opacity = "1"; // Restore full opacity
          stopPanelDragAnimation();
          
          if (dragOverlay) {
            dragOverlay.remove();
            dragOverlay = null;
          }

          // Save position to persistent storage
          let { left, top } = panelRoot.style;
          if (!left || left === "auto") {
            left = panelRoot.getBoundingClientRect().left + "px";
          }
          if (!top || top === "auto") {
            top = panelRoot.getBoundingClientRect().top + "px";
          }
          await chrome.storage.local.set({ 
            [storageKey]: { left, top } 
          });
        };

        // Store handlers on the header element for cleanup
        header._dragMousedownHandler = handleMousedown;
        header._dragMousemoveHandler = handleMousemove;
        header._dragMouseupHandler = handleMouseup;
        
        // Add event listeners
        header.addEventListener('mousedown', handleMousedown);
        document.addEventListener('mousemove', handleMousemove);
        document.addEventListener('mouseup', handleMouseup);
      }

      // Initialize the drag system
      initializePanelDrag(container, "Soliz.positionBeforeHide.axiom");
      
      // Re-enable transitions after initial state is set (prevents flicker)
      setTimeout(() => {
        if (trenchStats) {
          trenchStats.style.transition = "max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s";
        }
        if (buyOptionsRow2) {
          buyOptionsRow2.style.transition = "max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s";
        }
        if (sellOptionsRow2) {
          sellOptionsRow2.style.transition = "max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s";
        }
      }, 50); // Small delay to ensure DOM is ready
  
      // Add hover/click effects for tab group
      tabSelectGroup.querySelectorAll(".tab-select").forEach(btn => {
        btn.addEventListener("mouseenter", () => {
          btn.style.color = "#7367F0";
          btn.style.transform = "translateY(-1px)";
        });
        btn.addEventListener("mouseleave", () => {
          // Don't override color if it's the active tab
          if (!btn.classList.contains('active')) {
            btn.style.color = "white";
          }
          btn.style.transform = "translateY(0)";
        });
        btn.addEventListener("mousedown", () => {
          btn.style.opacity = "0.7";
        });
        btn.addEventListener("mouseup", () => {
          btn.style.opacity = "1";
        });
      });
  
      // Add hover/click effects for red tabs
      redTabs.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("mouseenter", () => {
          tab.style.background = "#ff4e4e";
          tab.style.color = "white";
          tab.style.transform = "translateY(-1px)";
        });
        tab.addEventListener("mouseleave", () => {
          tab.style.background = "var(--bg-buttons)";
          tab.style.color = "var(--text-light)";
          tab.style.transform = "translateY(0)";
        });
        tab.addEventListener("mousedown", () => {
          tab.style.opacity = "0.7";
        });
        tab.addEventListener("mouseup", () => {
          tab.style.opacity = "1";
        });
      });
  
      // Add hover/click effects for sell button
      sellButton.addEventListener("mouseenter", () => {
        sellButton.style.background = "#d18f95";
        sellButton.style.transform = "translateY(-1px)";
      });
      sellButton.addEventListener("mouseleave", () => {
        sellButton.style.background = "var(--accent-red)";
        sellButton.style.transform = "translateY(0)";
      });
      sellButton.addEventListener("mousedown", () => {
        sellButton.style.opacity = "0.7";
      });
      sellButton.addEventListener("mouseup", () => {
        sellButton.style.opacity = "1";
      });
            // Add click handler for main Sell button
            sellButton.addEventListener("click", () => {
              console.log("Main Sell button clicked");
              // Add your sell functionality here
            });
  
      // Add hover/click effects for sell preset buttons
      sellOptions.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("mouseenter", () => {
          btn.style.background = "#6a1f25";
          btn.style.transform = "translateY(-1px)";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.background = "#A83941";
          btn.style.transform = "translateY(0)";
        });
        btn.addEventListener("mousedown", () => {
          btn.style.opacity = "0.7";
        });
        btn.addEventListener("mouseup", () => {
          btn.style.opacity = "1";
        });
      });
  
      // After creating regularTab, dcaTab, positionManagerTab and appending them to tabSelectGroup:
      const topTabButtonsSoliz = [
        regularTab.querySelector('.tab-select'),
        dcaTab.querySelector('.tab-select'),
        positionManagerTab.querySelector('.tab-select')
      ];
      // Set initial active tab: Regular for addSolizTrenchPanel
      topTabButtonsSoliz.forEach(btn => btn.classList.remove('active'));
      topTabButtonsSoliz[0].classList.add('active');
      // Add click event to switch active tab and underline
      topTabButtonsSoliz.forEach((btn, idx) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          topTabButtonsSoliz.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
  
    } catch (error) {
      console.error("Failed to add Trench panel:", error);
    } finally {
      // Reset the creation flag
      isCreatingPanel = false;
    }

    // PnL persistence and duplicate prevention are handled by axiom-injector.js

            // Load preset names for the sub-tabs (but don't reset active preset)
            setTimeout(async () => {
              try {
                console.log('Loading preset names for sub-tabs...');
                loadAllPresetNames();
              } catch (error) {
                console.error('Error loading preset names:', error);
              }
            }, 1000); // Give the panel time to fully render
  }
  

  // Position Manager Panel //
  async function addPositionManagerPanel() {
    document.querySelectorAll('.wallet-card').forEach(card => card.remove());
    try {
      // Create main container
      const container = document.createElement("div");
      container.classList.add("wallet-card");
      Object.assign(container.style, {
        position: "fixed",
        zIndex: 9999,
        maxWidth: "400px",
        overflow: "auto"
      });
  
      // Set position using Soliz's position system
      await restoreSolizPanelPosition(container, "Soliz.positionBeforeHide.axiom");
    
    // Create header
    const header = document.createElement("header");
    header.classList.add("wallet-header");
    Object.assign(header.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px"
    });
  
      // Create logo section
    const logo = document.createElement("div");
    logo.classList.add("logo");
      Object.assign(logo.style, {
        display: "flex",
        fontWeight: "bold",
        fontSize: "18px",
        marginRight: "auto",
        alignItems: "center"
      });
  
      // Get the Trench Panel Name from settings for the logo text
      let logoPanelName = "JEET MODE"; // Default value
      try {
          const result = await chrome.storage.sync.get(['extensionSettings']);
          if (result.extensionSettings && result.extensionSettings.trenchPanelName) {
              logoPanelName = result.extensionSettings.trenchPanelName;
          }
      } catch (e) {
          console.log("Error loading Trench Panel Name setting:", e);
      }
      
      // Create dynamic text instead of using image
      const logoText = document.createElement("span");
      logoText.textContent = logoPanelName;
      logoText.style.cssText = "font-family: 'Airnt', sans-serif; color: #B9A6F3; font-size: 15px; font-weight: bold; margin-right: 6px; -webkit-text-fill-color: transparent; -webkit-text-stroke: 0.3px #B9A6F3; letter-spacing: 2px;";
      logo.appendChild(logoText);

      // Create enhanced wallet dropdown
      const walletSelectorWrapper = document.createElement("div");
      walletSelectorWrapper.classList.add("wallet-selector-wrapper");
      Object.assign(walletSelectorWrapper.style, {
        position: "relative",
        display: "inline-block"
      });

      const walletDropdown = document.createElement("div");
      walletDropdown.classList.add("wallet-dropdown");
      Object.assign(walletDropdown.style, {
        position: "relative",
        display: "inline-block",
        zIndex: "1000"
      });

      const walletSelect = document.createElement("div");
      walletSelect.classList.add("wallet-select");
      Object.assign(walletSelect.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 8px",
        background: "var(--bg-buttons)",
        border: "1.5px solid var(--border-color)",
        borderRadius: "calc(var(--border-radius) + 1px)",
        cursor: "pointer",
        fontSize: "13px",
        color: "var(--text-light)",
        minWidth: "130px",
        height: "25.5px"
      });
      
      // Get the Trench Panel Name from settings
      let trenchPanelName = "Trench Wallet"; // Default value
      try {
          const result = await chrome.storage.sync.get(['extensionSettings']);
          if (result.extensionSettings && result.extensionSettings.trenchPanelName) {
              trenchPanelName = result.extensionSettings.trenchPanelName;
          }
      } catch (e) {
          console.log("Error loading Trench Panel Name setting:", e);
      }
      
      walletSelect.textContent = trenchPanelName;
      walletSelect.innerHTML += '<span style="margin-left: auto;">▼</span>';

      // Wallet dropdown menu
      const walletMenu = document.createElement("div");
      walletMenu.classList.add("wallet-menu");
      walletMenu.setAttribute("data-wallet-menu", "true");
      Object.assign(walletMenu.style, {
        position: "fixed",
        background: "var(--bg-buttons)",
        border: "1px solid rgba(115, 103, 240, 0.5)",
        borderRadius: "6px",
        marginTop: "4px",
        padding: "8px",
        zIndex: "999999",
        display: "none",
        minWidth: "273px",
        maxHeight: "300px",
        overflow: "hidden",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)"
      });

      // Button container for side-by-side layout
      const buttonContainer = document.createElement("div");
      Object.assign(buttonContainer.style, {
        display: "flex",
        gap: "8px",
        marginBottom: "12px"
      });

      // Select All button
      const selectAllBtn = document.createElement("button");
      selectAllBtn.textContent = "All";
      Object.assign(selectAllBtn.style, {
        width: "40px",
        padding: "2px 6px",
        background: "rgba(115, 103, 240, 0.6)",
        borderRadius: "3px",
        color: "white",
        cursor: "pointer",
        fontSize: "10px",
        border: "none"
      });

      // Select Main button
      const selectMainBtn = document.createElement("button");
      selectMainBtn.textContent = "Main";
      Object.assign(selectMainBtn.style, {
        width: "40px",
        padding: "2px 6px",
        background: "rgba(115, 103, 240, 0.6)",
        borderRadius: "3px",
        color: "white",
        cursor: "pointer",
        fontSize: "10px",
        border: "none"
      });

      // Wallet list container
      const walletList = document.createElement("div");
      Object.assign(walletList.style, {
        display: "flex",
        flexDirection: "column",
        gap: "6px"
      });

      // Sample wallets (you can modify this list)
      const wallets = [
        { name: "Trench Wallet", id: "trench", balance: "126", address: "Brn7r" },
        { name: "Wallet 2", id: "wallet2", balance: "0", address: "Gn5s3" },
        { name: "Wallet 3", id: "wallet3", balance: "0", address: "Xy9m2" }
      ];
      let selectedWallets = new Set(["trench"]); // Default to main wallet selected
      
      // Set dropdown text to the first wallet name
      walletSelect.textContent = wallets[0].name;
      
      // Add arrow down SVG
      const arrowDown = document.createElement("img");
      arrowDown.src = chrome.runtime.getURL('public/assets/images/arrowdown.svg');
      arrowDown.alt = "Arrow Down";
      arrowDown.style.cssText = "margin-left: auto; width: 12px; height: 12px;";
      walletSelect.appendChild(arrowDown);

              // Create wallet items
        wallets.forEach((wallet, index) => {
          const walletItem = document.createElement("div");
          Object.assign(walletItem.style, {
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            padding: "3px",
            borderRadius: "4px",
            cursor: "pointer"
          });

          // Add border bottom for separation (except last item)
          if (index < wallets.length - 1) {
            walletItem.style.borderBottom = "1px solid rgba(115, 103, 240, 0.2)";
            walletItem.style.paddingBottom = "6px";
          }

        // Checkbox
        const checkbox = document.createElement("div");
        checkbox.classList.add("wallet-checkbox");
        Object.assign(checkbox.style, {
          width: "14px",
          height: "14px",
          border: "2px solid rgba(115, 103, 240, 0.5)",
          borderRadius: "3px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          marginTop: "2px",
          background: selectedWallets.has(wallet.id) ? "#7367F0" : "transparent"
        });

        // Wallet info
        const walletInfo = document.createElement("div");
        Object.assign(walletInfo.style, {
          flex: "1",
          display: "flex",
          flexDirection: "column",
          gap: "1px"
        });

        const walletName = document.createElement("div");
        walletName.textContent = wallet.name;
        Object.assign(walletName.style, {
          fontSize: "11px",
          fontWeight: "500",
          color: "white"
        });

        const walletDetails = document.createElement("div");
        walletDetails.innerHTML = `
          <span style="color: #7367F0; font-size: 12px;">●</span>
          <span style="color: #aaa; font-size: 11px; margin-left: 4px; cursor: pointer;" title="Click to copy">${wallet.address}</span>
        `;
        Object.assign(walletDetails.style, {
          display: "flex",
          alignItems: "flex-start",
          fontSize: "10px",
          marginTop: "-2px"
        });

        // Add click handler to copy address
        const addressSpan = walletDetails.querySelector('span:last-child');
        addressSpan.addEventListener('click', () => {
          navigator.clipboard.writeText(wallet.address).then(() => {
            // Show brief feedback
            const originalText = addressSpan.textContent;
            addressSpan.textContent = 'Copied!';
            addressSpan.style.color = '#4CAF50';
            setTimeout(() => {
              addressSpan.textContent = originalText;
              addressSpan.style.color = '#aaa';
            }, 1000);
      });
    });

        walletInfo.appendChild(walletName);
        walletInfo.appendChild(walletDetails);

        // Grey box with "0" - positioned to the left of balance badge
        const greyBox = document.createElement("div");
        greyBox.textContent = "0";
        Object.assign(greyBox.style, {
          background: "rgba(128, 128, 128, 0.3)",
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "10px",
          display: "flex",
          alignItems: "flex-start",
          alignSelf: "flex-start",
          marginTop: "2px",
          marginRight: "4px",
          color: "white"
        });

        // Balance badge - moved up to same level as wallet name
        const balanceBadge = document.createElement("div");
        balanceBadge.innerHTML = `
          <img src="${chrome.runtime.getURL('public/assets/images/solana-svg.svg')}" style="width: 12px; height: 12px; margin-right: 4px;" alt="SOL">
          <span style="color: white;">${wallet.balance}</span>
        `;
        Object.assign(balanceBadge.style, {
          background: "rgba(115, 103, 240, 0.1)",
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "10px",
          display: "flex",
          alignItems: "flex-start",
          alignSelf: "flex-start",
          marginTop: "2px"
        });

        walletItem.appendChild(checkbox);
        walletItem.appendChild(walletInfo);
        walletItem.appendChild(greyBox);
        walletItem.appendChild(balanceBadge);

        // Click handlers
        walletItem.addEventListener("click", () => {
          if (selectedWallets.has(wallet.id)) {
            selectedWallets.delete(wallet.id);
            checkbox.style.background = "transparent";
          } else {
            selectedWallets.add(wallet.id);
            checkbox.style.background = "#7367F0";
          }
        });

        // Hover effects
        walletItem.addEventListener("mouseenter", () => {
          walletItem.style.background = "rgba(115, 103, 240, 0.4)";
        });

        walletItem.addEventListener("mouseleave", () => {
          walletItem.style.background = "transparent";
        });

        walletList.appendChild(walletItem);
      });

      // Button event handlers
      selectAllBtn.addEventListener("click", () => {
        selectedWallets.clear();
        wallets.forEach(wallet => {
          selectedWallets.add(wallet.id);
        });
        
        // Update all checkboxes
        walletList.querySelectorAll(".wallet-checkbox").forEach((checkbox, index) => {
          checkbox.style.background = "#7367F0";
        });
      });

      selectMainBtn.addEventListener("click", () => {
        selectedWallets.clear();
        selectedWallets.add("trench"); // Select only main wallet
        
        // Update checkboxes
        walletList.querySelectorAll(".wallet-checkbox").forEach((checkbox, index) => {
          if (index === 0) { // First wallet (main)
            checkbox.style.background = "#7367F0";
          } else {
            checkbox.style.background = "transparent";
          }
        });
      });

      // Toggle dropdown
      walletSelect.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isVisible = walletMenu.style.display === "block";
        if (isVisible) {
          walletMenu.style.display = "none";
        } else {
          // Position the dropdown relative to the wallet select button
          const rect = walletSelect.getBoundingClientRect();
          
          // Get the current scale of the panel
          const panelScale = parseFloat(container.style.transform.match(/scale\(([^)]+)\)/)?.[1] || 1);
          
          walletMenu.style.left = (rect.right - 273) + "px";
          walletMenu.style.top = (rect.bottom + 1) + "px";
          walletMenu.style.transform = `scale(${panelScale})`;
          walletMenu.style.transformOrigin = "top right";
          walletMenu.style.display = "block";
        }
      });

      // Close dropdown when clicking outside
      document.addEventListener("click", (e) => {
        if (!walletDropdown.contains(e.target) && !walletMenu.contains(e.target)) {
          walletMenu.style.display = "none";
        }
      });

      // Handle clicks within the dropdown
      walletMenu.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      // Create header container with "Wallets" text and buttons
      const headerContainer = document.createElement("div");
      Object.assign(headerContainer.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "10px",
        paddingBottom: "2px",
        borderBottom: "1px solid rgba(115, 103, 240, 0.2)"
      });

      // Wallets text
      const walletsText = document.createElement("div");
      walletsText.textContent = "Wallets";
      Object.assign(walletsText.style, {
        fontSize: "14px",
        fontWeight: "500",
        color: "white",
        marginTop: "-10px",
        marginLeft: "3px"
      });

      // Assemble header container
      headerContainer.appendChild(walletsText);
      headerContainer.appendChild(buttonContainer);

      // Assemble dropdown
      buttonContainer.appendChild(selectAllBtn);
      buttonContainer.appendChild(selectMainBtn);
      walletMenu.appendChild(headerContainer);
      walletMenu.appendChild(walletList);
      walletDropdown.appendChild(walletSelect);
      walletSelectorWrapper.appendChild(walletDropdown);
      
      // Append dropdown menu to document body to avoid clipping
      document.body.appendChild(walletMenu);

      // Global click handler to close dropdown when clicking anywhere outside
      const globalClickHandler = (e) => {
        if (walletMenu.style.display === "block") {
          if (!walletDropdown.contains(e.target) && !walletMenu.contains(e.target)) {
            walletMenu.style.display = "none";
          }
        }
      };
      document.addEventListener("click", globalClickHandler);
  
      // Create settings icon
      const settingsIcon = document.createElement("img");
      settingsIcon.src = chrome.runtime.getURL('public/assets/images/settings.png');
      settingsIcon.alt = "Settings";
      settingsIcon.classList.add("settings-icon");
      Object.assign(settingsIcon.style, {
        width: "22px",
        height: "22px",
        marginLeft: "8px",
        verticalAlign: "middle",
        cursor: "pointer"
      });
// Add click event listener to open settings page
settingsIcon.addEventListener('click', () => {
  chrome.runtime.sendMessage({
    message: "openTab",
    url: chrome.runtime.getURL('public/Settings.html')
  });
});
  
      // Assemble header
      header.appendChild(logo);
      header.appendChild(walletSelectorWrapper);
      header.appendChild(settingsIcon);
  
      // Create tab select group
      const tabSelectGroup = document.createElement("div");
      tabSelectGroup.classList.add("tab-select-group");
      Object.assign(tabSelectGroup.style, {
        display: "flex",
        gap: "16px",
        height: "22px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                marginTop: "-17px", // Match main panel spacing exactly
        paddingTop: "3px",
        paddingBottom: "3px", // Match main panel padding exactly
        marginBottom: "6px", // Match main panel margin exactly
        marginLeft: "5px",
        alignItems: "center",
        position: "relative"
      });

      // Create tab buttons
      const createTabButton = (text, href) => {
        const link = document.createElement("a");
        link.href = href;
        const button = document.createElement("button");
        button.classList.add("tab-select");
        button.textContent = text;
        Object.assign(button.style, {
          background: "none",
          border: "none",
          color: "white",
          cursor: "pointer",
          position: "relative",
          paddingBottom: "4px",
          fontSize: "10px",
          fontWeight: "500",
          top: "-0.7px"
        });
        link.appendChild(button);
        return link;
      };

      const regularTab = createTabButton("Regular", "#");
      regularTab.addEventListener('click', (e) => {
        e.preventDefault();
        window.lastPanelPosition = {
          left: container.style.left,
          top: container.style.top,
          transform: container.style.transform
        };
        // Remove current panel before creating the main panel
        document.querySelectorAll('.wallet-card').forEach(card => card.remove());
        addSolizTrenchPanel();
      });
      // Add hover/click effects for regular tab
      const regularButton = regularTab.querySelector('.tab-select');
      regularButton.addEventListener("mouseenter", () => {
        regularButton.style.color = "#7367F0";
        regularButton.style.transform = "translateY(-1px)";
      });
      regularButton.addEventListener("mouseleave", () => {
        regularButton.style.color = "white";
        regularButton.style.transform = "translateY(0)";
      });
      regularButton.addEventListener("mousedown", () => {
        regularButton.style.opacity = "0.7";
      });
      regularButton.addEventListener("mouseup", () => {
        regularButton.style.opacity = "1";
      });
      
      const dcaTab = createTabButton("DCA", "#");
      // Add hover/click effects for DCA tab
      const dcaButton = dcaTab.querySelector('.tab-select');
      dcaButton.addEventListener("mouseenter", () => {
        dcaButton.style.color = "#7367F0";
        dcaButton.style.transform = "translateY(-1px)";
      });
      dcaButton.addEventListener("mouseleave", () => {
        dcaButton.style.color = "white";
        dcaButton.style.transform = "translateY(0)";
      });
      dcaButton.addEventListener("mousedown", () => {
        dcaButton.style.opacity = "0.7";
      });
      dcaButton.addEventListener("mouseup", () => {
        dcaButton.style.opacity = "1";
      });
      
      const positionManagerTab = createTabButton("Position Manager", "#");
      positionManagerTab.addEventListener('click', (e) => {
        e.preventDefault();
        window.lastPanelPosition = {
          left: container.style.left,
          top: container.style.top,
          transform: container.style.transform
        };
        addPositionManagerPanel();
      });
      tabSelectGroup.appendChild(regularTab);
      tabSelectGroup.appendChild(dcaTab);
      tabSelectGroup.appendChild(positionManagerTab);
  
      // Create tab info (wallet balance and icons)
      const tabInfo = document.createElement("div");
      tabInfo.classList.add("tab-info");
      Object.assign(tabInfo.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        marginLeft: "auto"
      });
  
      const balance = document.createElement("span");
      balance.classList.add("tab-balance");
      balance.textContent = "126";
      balance.style.marginTop = "1px";
      balance.style.marginTop = "1px";
  
      const solanaIcon = document.createElement("img");
      solanaIcon.src = chrome.runtime.getURL('public/assets/images/solana-svg.svg');
      solanaIcon.alt = "Solana";
      solanaIcon.classList.add("tab-icon");
      Object.assign(solanaIcon.style, {
        width: "15px",
        height: "15px",
        marginLeft: "2px",
        verticalAlign: "middle"
      });
  
      const walletIcon = document.createElement("img");
      walletIcon.src = chrome.runtime.getURL('public/assets/images/wallet.png');
      walletIcon.alt = "Wallet";
      walletIcon.classList.add("tab-icon", "wallet-icon");
      Object.assign(walletIcon.style, {
        width: "18px",
        height: "18px",
        marginLeft: "2px",
        verticalAlign: "middle",
        cursor: "pointer"
      });
  
      tabInfo.appendChild(balance);
      tabInfo.appendChild(solanaIcon);
      tabInfo.appendChild(walletIcon);
      tabSelectGroup.appendChild(tabInfo);

      const topTabButtonsPM = [
        regularTab.querySelector('.tab-select'),
        dcaTab.querySelector('.tab-select'),
        positionManagerTab.querySelector('.tab-select')
      ];
      topTabButtonsPM.forEach(btn => btn.classList.remove('active'));
      topTabButtonsPM[2].classList.add('active');
  
      // Add elements to container
      container.appendChild(header);
      container.appendChild(tabSelectGroup);
  
      // Create positions container
      const positionsContainer = document.createElement("div");
      positionsContainer.id = "assets-container";
      Object.assign(positionsContainer.style, {
        display: "flex",
        flexDirection: "column",
        gap: "0",
        marginTop: "0",
        padding: "0 12px 12px 12px",
        overflowY: "auto",
        height: "calc(100% - 80px)"
      });
      container.appendChild(positionsContainer);
  
      // Set container dimensions
      container.style.width = '338px';
      container.style.borderRadius = '10px';
      container.style.overflow = 'hidden';
      container.style.height = '477.67px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.justifyContent = 'space-between';
  
      // Add to document
      document.body.appendChild(container);

      // Initialize Soliz's smooth resizing system for position manager panel
      console.log('Initializing resize for position manager panel...'); // Debug log
      initializePanelResize(container, "Soliz.panelScale.axiom").catch(err => {
        console.error('Failed to initialize resize for position manager:', err);
      });
      
      // Initialize Soliz's sophisticated smooth drag system for position manager
      function initializePositionManagerDrag(panelRoot, storageKey) {
        let panelDragOffsetX = 0;
        let panelDragOffsetY = 0;
        let panelDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        let panelDragAnimationId;
        let dragOverlay = null;

        // Create drag overlay for smooth dragging
        function createDragOverlay() {
          dragOverlay = document.createElement("div");
          Object.assign(dragOverlay.style, {
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            zIndex: 999999,
            cursor: "move",
            background: "transparent"
          });
          document.body.appendChild(dragOverlay);
        }

        // Animation management
        const stopPanelDragAnimation = () => {
          if (panelDragAnimationId) {
            cancelAnimationFrame(panelDragAnimationId);
            panelDragAnimationId = null;
          }
        };

        // Smooth animation loop using requestAnimationFrame
        const initiatePanelDragAnimation = () => {
          const updatePosition = () => {
            if (!panelDragging) return;

            // Get current scale from transform
            const currentTransform = panelRoot.style.transform;
            const scaleMatch = currentTransform.match(/scale\(([^)]+)\)/);
            const currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

            let left = lastMouseX - panelDragOffsetX;
            let top = lastMouseY - panelDragOffsetY;

            // Use the scaled dimensions for boundary calculations
            const scaledWidth = panelRoot.offsetWidth * currentScale;
            const scaledHeight = panelRoot.offsetHeight * currentScale;

            const maxLeft = window.innerWidth - scaledWidth;
            const maxTop = window.innerHeight - scaledHeight;

            left = Math.min(Math.max(left, 0), maxLeft);
            top = Math.min(Math.max(top, 0), maxTop);

            panelRoot.style.left = `${left}px`;
            panelRoot.style.top = `${top}px`;

            panelDragAnimationId = requestAnimationFrame(updatePosition);
          };

          stopPanelDragAnimation();
          panelDragAnimationId = requestAnimationFrame(updatePosition);
        };

        // Mouse down handler
        const handleMousedown = (evt) => {
          // Only allow dragging on the logo area (JEET MODE text), not the dropdown
          const logoEl = panelRoot.querySelector('.logo');
          if (logoEl && (evt.target === logoEl || logoEl.contains(evt.target))) {
            panelDragging = true;
            panelDragOffsetX = evt.clientX - panelRoot.getBoundingClientRect().left;
            panelDragOffsetY = evt.clientY - panelRoot.getBoundingClientRect().top;
            lastMouseX = evt.clientX;
            lastMouseY = evt.clientY;
            panelRoot.style.userSelect = "none";
            panelRoot.style.opacity = "0.7"; // Visual feedback for drag mode

            createDragOverlay();
            initiatePanelDragAnimation();
          }
        };

        // Mouse move handler
        const handleMousemove = (evt) => {
          if (!panelDragging) return;
          lastMouseX = evt.clientX;
          lastMouseY = evt.clientY;
        };

        // Mouse up handler
        const handleMouseup = async () => {
          if (!panelDragging) return;
          
          panelDragging = false;
          panelRoot.style.userSelect = "";
          panelRoot.style.opacity = "1"; // Restore full opacity
          stopPanelDragAnimation();
          
          if (dragOverlay) {
            dragOverlay.remove();
            dragOverlay = null;
          }

          // Save position to persistent storage
          let { left, top } = panelRoot.style;
          if (!left || left === "auto") {
            left = panelRoot.getBoundingClientRect().left + "px";
          }
          if (!top || top === "auto") {
            top = panelRoot.getBoundingClientRect().top + "px";
          }
          await chrome.storage.local.set({ 
            [storageKey]: { left, top } 
          });
        };

        // Add event listeners
        header.addEventListener('mousedown', handleMousedown);
        document.addEventListener('mousemove', handleMousemove);
        document.addEventListener('mouseup', handleMouseup);
      }

      // Initialize the drag system for position manager
      initializePositionManagerDrag(container, "Soliz.positionBeforeHide.axiom");
  
      // Load and render positions
      try {
        if (typeof window.getPositionsData === 'function') {
          const positions = await window.getPositionsData();
          if (typeof window.renderPositions === 'function') {
            window.renderPositions(positionsContainer, positions);
          } else {
            console.error('renderPositions function not found');
          }
        } else {
          console.error('getPositionsData function not found');
        }
      } catch (error) {
        console.error("Failed to load positions:", error);
      }
  
    } catch (error) {
      console.error("Failed to add Position Manager panel:", error);
    }
  }

  // Soliz's Smooth Resizing System
  async function initializePanelResize(panelRoot, storageKey) {
    console.log('initializePanelResize called for:', storageKey); // Debug log
    
    let { [storageKey]: savedScale } = await chrome.storage.local.get(storageKey);
    let initialScale = 1.0;
    if (savedScale && typeof savedScale.x === "number") {
      initialScale = parseFloat(savedScale.x) || 1.0;
    }

    const resizeHandle = document.createElement("div");
    Object.assign(resizeHandle.style, {
      position: "absolute",
      width: "24px",
      height: "24px",
      right: "0px",
      bottom: "0px",
      cursor: "nwse-resize",
      zIndex: 100000,
      background: "transparent",
      pointerEvents: "auto",
    });

    panelRoot.appendChild(resizeHandle);
    console.log('Resize handle added to panel:', resizeHandle); // Debug log

    let isResizing = false;
    let startRect = null;
    let startScale = 1.0;
    let resizeOverlay = null;

    function onMouseMove(evt) {
      if (!isResizing) return;

      const currentX = evt.clientX;
      const currentY = evt.clientY;

      // Check if startRect has valid dimensions
      if (!startRect || startRect.width <= 0 || startRect.height <= 0) {
        console.error('Invalid startRect:', startRect);
        return;
      }

      // Calculate the distance from the start point
      const deltaX = currentX - startRect.left;
      const deltaY = currentY - startRect.top;

      // Use a simpler scale calculation based on distance from corner
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const baseDistance = Math.sqrt(startRect.width * startRect.width + startRect.height * startRect.height);
      
      // Calculate scale as ratio of distances
      const newScale = (distance / baseDistance) * startScale;

      // Clamp scale to reasonable bounds
      const clampedScale = Math.max(0.5, Math.min(2.0, newScale));

      console.log('Scale calculation:', { 
        deltaX, 
        deltaY, 
        distance, 
        baseDistance, 
        startScale, 
        newScale, 
        clampedScale 
      }); // Debug log

      // Apply the scale
      panelRoot.style.transform = `scale(${clampedScale})`;
      panelRoot.style.transformOrigin = "top left";
      
      // Store the scale for later use
      panelRoot.dataset.scaleFactors = JSON.stringify({
        x: clampedScale,
        y: clampedScale,
      });
    }

    function onMouseUp() {
      if (!isResizing) return;
      
      isResizing = false;
      
      if (resizeOverlay) {
        resizeOverlay.remove();
        resizeOverlay = null;
      }

      // Save scale to storage
      const scaleFactors = JSON.parse(panelRoot.dataset.scaleFactors || '{"x":1,"y":1}');
      chrome.storage.local.set({ [storageKey]: scaleFactors });

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    function createResizeOverlay() {
      resizeOverlay = document.createElement("div");
      Object.assign(resizeOverlay.style, {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 999999,
        cursor: "nwse-resize",
        background: "transparent",
      });
      document.body.appendChild(resizeOverlay);
    }

    resizeHandle.addEventListener('mousedown', (evt) => {
      console.log('Resize handle clicked!'); // Debug log
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation(); // Stop all other event handlers

      // Close any open wallet dropdowns when starting resize
      const allWalletMenus = document.querySelectorAll('[data-wallet-menu]');
      allWalletMenus.forEach(menu => {
        if (menu.style.display === "block") {
          menu.style.display = "none";
        }
      });

      isResizing = true;
      startRect = panelRoot.getBoundingClientRect();
      
      // Get current scale with proper fallback
      let currentScale = 1.0;
      try {
        if (panelRoot.dataset.scaleFactors) {
          const scaleData = JSON.parse(panelRoot.dataset.scaleFactors);
          currentScale = parseFloat(scaleData.x) || 1.0;
        }
      } catch (e) {
        console.log('Error parsing scale factors, using default:', e);
        currentScale = 1.0;
      }
      
      startScale = currentScale;

      console.log('Start rect:', startRect); // Debug log
      console.log('Start scale:', startScale); // Debug log

      createResizeOverlay();
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Restore saved scale
    await restoreSolizPanelScale(panelRoot, storageKey);
    
    // Set initial scale if none exists
    if (!panelRoot.dataset.scaleFactors) {
      panelRoot.dataset.scaleFactors = JSON.stringify({ x: 1.0, y: 1.0 });
      panelRoot.style.transform = "scale(1.0)";
      panelRoot.style.transformOrigin = "top left";
      console.log('Set initial scale to 1.0'); // Debug log
    } else {
      console.log('Existing scale factors:', panelRoot.dataset.scaleFactors); // Debug log
    }
  }

  async function restoreSolizPanelScale(el, storageKey) {
    const { [storageKey]: savedScale } = await chrome.storage.local.get(storageKey);
    let { x, y } = { x: 1, y: 1 };
    if (savedScale) {
      x = savedScale.x;
      y = savedScale.y;
    }
    el.dataset.scaleFactors = JSON.stringify({ x, y });
    el.style.transform = `scale(${x}, ${y})`;
    el.style.transformOrigin = "top left";
  }

  // Listen for messages from settings page
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateTrenchPanel') {
        console.log('Received preset data to update trench panel:', message.preset);
        updateTrenchPanelWithPreset(message.preset);
        sendResponse({ success: true });
      }
    });
  }

  // Load all preset names for the sub-tabs
  function loadAllPresetNames() {
    console.log('Loading all preset names for sub-tabs...');
    
    const attemptLoad = () => {
      // Find the trench panel
      const trenchPanel = document.querySelector('.wallet-card');
      if (!trenchPanel) {
        console.log('Trench panel not found yet, waiting...');
        return false;
      }

      // Find the sub-tab buttons (Main, High Vol, No Fees) - these are the preset tabs
      let subTabButtons = trenchPanel.querySelectorAll('button');
      let presetTabButtons = [];
      
      // Look for buttons that match the preset tab names
      subTabButtons.forEach(button => {
        const buttonText = button.textContent.trim();
        if (buttonText === 'Main' || buttonText === 'High Vol' || buttonText === 'No Fees') {
          presetTabButtons.push(button);
        }
      });
      
      console.log('Found preset tab buttons for name loading:', presetTabButtons.length);
      
      // Load preset names for each button
      presetTabButtons.forEach((button, index) => {
        const presetId = index + 1; // Button 0 = Preset 1, Button 1 = Preset 2, Button 2 = Preset 3
        
        chrome.storage.sync.get(['extensionPresets'], (result) => {
          if (result.extensionPresets && result.extensionPresets[presetId]) {
            const buttonPreset = result.extensionPresets[presetId];
            if (buttonPreset.name) {
              button.textContent = buttonPreset.name;
              console.log(`Loaded preset name for button ${presetId}: ${buttonPreset.name}`);
            }
          }
        });
      });
      
      return true;
    };

    // Try to load immediately, if it fails, retry after a short delay
    if (!attemptLoad()) {
      setTimeout(attemptLoad, 500);
    }
  }

    // Update trench panel with preset data
  function updateTrenchPanelWithPreset(preset) {
    console.log('updateTrenchPanelWithPreset called with:', preset);
    
    // Find the trench panel
    const trenchPanel = document.querySelector('.wallet-card');
    if (!trenchPanel) {
      console.log('Trench panel not found yet, retrying...');
      setTimeout(() => updateTrenchPanelWithPreset(preset), 100);
      return;
    }

    console.log('Found trench panel:', trenchPanel);

    // Update immediately without delay
    console.log('Updating trench panel immediately...');
    
    // Find the sub-tab buttons (Main, High Vol, No Fees) - these are the preset tabs
    let subTabButtons = trenchPanel.querySelectorAll('button');
    let presetTabButtons = [];
    
    // Look for buttons that match the preset tab names
    subTabButtons.forEach(button => {
      const buttonText = button.textContent.trim();
      if (buttonText === 'Main' || buttonText === 'High Vol' || buttonText === 'No Fees') {
        presetTabButtons.push(button);
      }
    });
    
    console.log('Found preset tab buttons:', presetTabButtons.length);
    
    // Update the preset tab buttons with their corresponding preset names
    presetTabButtons.forEach((button, index) => {
      const presetId = index + 1; // Button 0 = Preset 1, Button 1 = Preset 2, Button 2 = Preset 3
      
      // Get the preset data for this specific button
      try {
        chrome.storage.sync.get(['extensionPresets'], (result) => {
          if (result.extensionPresets && result.extensionPresets[presetId]) {
            const buttonPreset = result.extensionPresets[presetId];
            if (buttonPreset.name) {
              button.textContent = buttonPreset.name;
              console.log(`Updated preset tab button ${presetId} to: ${buttonPreset.name}`);
            }
          }
        });
      } catch (error) {
        console.error('Error loading preset name for button:', error);
      }
    });

    // Try to find buy preset buttons with specific selectors
    let buyButtons = [];
    
    // Method 1: Look for buttons in buy-options class (most specific)
    const buyOptionsSection = trenchPanel.querySelector('.buy-options');
    console.log('Buy options section found:', !!buyOptionsSection);
    
    if (buyOptionsSection) {
      const buyOptionButtons = buyOptionsSection.querySelectorAll('button');
      console.log('Buy option buttons found:', buyOptionButtons.length);
      
      buyOptionButtons.forEach((button, i) => {
        // Check if button has the expected structure (span with amount + solana icon)
        const amountSpan = button.querySelector('span');
        const solIcon = button.querySelector('img[src*="solana"]');
        console.log(`Button ${i}: amountSpan=${!!amountSpan}, solIcon=${!!solIcon}`);
        
        if (amountSpan && solIcon) {
          buyButtons.push(button);
        }
      });
    }
    
    // Method 2: Look for buttons with SOL icons as fallback
    if (buyButtons.length === 0) {
      console.log('No buy buttons found in buy-options, trying fallback method...');
      const buttonsWithSol = trenchPanel.querySelectorAll('button');
      buttonsWithSol.forEach(button => {
        const hasSolIcon = button.querySelector('img[src*="solana"]') || 
                         button.innerHTML.includes('solana') || 
                         button.innerHTML.includes('SOL');
        const hasNumbers = /\d/.test(button.textContent);
        
        if (hasSolIcon && hasNumbers) {
          buyButtons.push(button);
        }
      });
    }
    
    console.log('Found buy buttons:', buyButtons.length);
    console.log('Buy buttons found:', buyButtons.map(btn => btn.textContent.trim()));
    
    // Update buy preset buttons
    buyButtons.forEach((button, index) => {
      if (preset.buyPresets && preset.buyPresets[index]) {
        console.log(`Updating buy button ${index} to: ${preset.buyPresets[index]}`);
        
        // Update the button content to match original creation
        button.innerHTML = '';
        
        // Create a wrapper for centering (same as original)
        const contentWrapper = document.createElement("span");
        contentWrapper.style.display = "flex";
        contentWrapper.style.alignItems = "center";
        contentWrapper.style.justifyContent = "center";
        contentWrapper.style.width = "100%";
        
        const amountSpan = document.createElement("span");
        amountSpan.textContent = preset.buyPresets[index];
        amountSpan.style.display = "inline-block";
        
        const buttonSolIcon = document.createElement("img");
        buttonSolIcon.src = chrome.runtime.getURL('public/assets/images/solana-svg.svg');
        buttonSolIcon.alt = "Solana";
        buttonSolIcon.style.width = "14px";
        buttonSolIcon.style.height = "14px";
        buttonSolIcon.style.marginLeft = "4px";
        buttonSolIcon.style.verticalAlign = "middle";
        buttonSolIcon.style.display = "inline-block";
        
        contentWrapper.appendChild(amountSpan);
        contentWrapper.appendChild(buttonSolIcon);
        button.appendChild(contentWrapper);
        
        console.log(`Successfully updated buy button ${index} to: ${preset.buyPresets[index]}`);
      }
    });

    // Try to find sell preset buttons with specific selectors
    let sellButtons = [];
    
    // Method 1: Look for buttons in sell-options class (most specific)
    const sellOptionsSection = trenchPanel.querySelector('.sell-options');
    console.log('Sell options section found:', !!sellOptionsSection);
    
    if (sellOptionsSection) {
      const sellOptionButtons = sellOptionsSection.querySelectorAll('button');
      console.log('Sell option buttons found:', sellOptionButtons.length);
      
      sellOptionButtons.forEach((button, i) => {
        if (button.textContent.includes('%') || button.textContent.includes('Initials')) {
          sellButtons.push(button);
          console.log(`Found sell button ${i}: ${button.textContent.trim()}`);
        }
      });
    }
    
    // Method 2: Look for buttons with % symbols as fallback
    if (sellButtons.length === 0) {
      console.log('No sell buttons found in sell-options, trying fallback method...');
      const buttonsWithPercentage = trenchPanel.querySelectorAll('button');
      buttonsWithPercentage.forEach(button => {
        const hasPercentage = button.textContent.includes('%') || 
                            button.innerHTML.includes('%') ||
                            button.textContent.includes('Initials');
        
        if (hasPercentage) {
          sellButtons.push(button);
        }
      });
    }
    
    console.log('Found sell buttons with %:', sellButtons.length);
    console.log('Sell buttons found:', sellButtons.map(btn => btn.textContent.trim()));
    
    // Update sell preset buttons
    sellButtons.forEach((button, index) => {
      if (preset.sellPresets && preset.sellPresets[index]) {
        console.log(`Updating sell button ${index} to: ${preset.sellPresets[index]}`);
        
        let displayText = preset.sellPresets[index];
        
        // Clear the button content
        button.innerHTML = '';
        
        // Handle "Initials" - don't add % symbol
        if (displayText === 'Initials') {
          button.textContent = 'Initials';
        } else if (displayText === '') {
          // Empty values should show nothing
          button.textContent = '';
        } else {
          // Extract the number from the preset (remove % if present)
          const numberValue = displayText.replace(/%/g, '');
          
          // Create label span (same structure as initial creation)
          const labelSpan = document.createElement("span");
          labelSpan.textContent = numberValue;
          Object.assign(labelSpan.style, {
            display: "inline-block"
          });
          button.appendChild(labelSpan);
          
          // Add % symbol span (same structure as initial creation)
          const percentSpan = document.createElement("span");
          percentSpan.textContent = "%";
          Object.assign(percentSpan.style, {
            display: "inline-block",
            fontSize: "13px"
          });
          button.appendChild(percentSpan);
        }
        
        console.log(`Successfully updated sell button ${index} to: ${preset.sellPresets[index]}`);
      }
    });

    // Try to find and update input fields
    const allInputs = trenchPanel.querySelectorAll('input');
    console.log('Found inputs in trench panel:', allInputs.length);
    
    allInputs.forEach(input => {
      const inputId = input.id || '';
      const inputPlaceholder = input.placeholder || '';
      
      console.log(`Input found: id="${inputId}", placeholder="${inputPlaceholder}"`);
      
      // Update slippage inputs
      if ((inputId.includes('slippage') || inputPlaceholder.includes('slippage')) && 
          inputId.includes('buy') && preset.buySlippage) {
        input.value = preset.buySlippage;
        console.log('Updated buy slippage input to:', preset.buySlippage);
      }
      
      if ((inputId.includes('slippage') || inputPlaceholder.includes('slippage')) && 
          inputId.includes('sell') && preset.sellSlippage) {
        input.value = preset.sellSlippage;
        console.log('Updated sell slippage input to:', preset.sellSlippage);
      }
      
      // Update priority fee inputs
      if (inputId.includes('priority') && inputId.includes('buy') && preset.buyPriorityFee) {
        input.value = preset.buyPriorityFee;
        console.log('Updated buy priority fee input to:', preset.buyPriorityFee);
      }
      
      if (inputId.includes('priority') && inputId.includes('sell') && preset.sellPriorityFee) {
        input.value = preset.sellPriorityFee;
        console.log('Updated sell priority fee input to:', preset.sellPriorityFee);
      }
      
      // Update jito fee inputs
      if (inputId.includes('jito') && inputId.includes('buy') && preset.buyJitoFee) {
        input.value = preset.buyJitoFee;
        console.log('Updated buy jito fee input to:', preset.buyJitoFee);
      }
      
      if (inputId.includes('jito') && inputId.includes('sell') && preset.sellJitoFee) {
        input.value = preset.sellJitoFee;
        console.log('Updated sell jito fee input to:', preset.sellJitoFee);
      }
    });

    console.log('Trench panel update completed');
    console.log('=== PRESET UPDATE SUMMARY ===');
    console.log('Preset data applied:', preset);
    console.log('Buy buttons updated:', buyButtons.length);
    console.log('Sell buttons updated:', sellButtons.length);
    console.log('=============================');
  }

  // Apply the loaded preset data to the panel IMMEDIATELY
  if (activePresetData) {
    console.log(`Applying loaded preset data for preset ${activePresetId}:`, activePresetData);
    // Apply preset data immediately after panel creation
    updateTrenchPanelWithPreset(activePresetData);
  }



