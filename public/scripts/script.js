// Application state
const state = {
    activeTab: 'presets',
    activePreset: 1,
    isConnected: true,
    presets: {
        1: {
            name: 'Main',
            buySlippage: '',
            sellSlippage: '',
            buyPriorityFee: '',
            buyJitoFee: '',
            sellPriorityFee: '',
            sellJitoFee: '',
            buyPresets: ['0.5', '1', '3', '5', '0.5', '2', '4', '10'],
            sellPresets: ['Initials', '25%', '50%', '100%', '10%', '15%', '20%', '75%']
        },
        2: {
            name: 'High Vol',
            buySlippage: '',
            sellSlippage: '',
            buyPriorityFee: '',
            buyJitoFee: '',
            sellPriorityFee: '',
            sellJitoFee: '',
            buyPresets: ['', '', '', '', '', '', '', ''],
            sellPresets: ['', '', '', '', '', '', '', '']
        },
        3: {
            name: 'No Fees',
            buySlippage: '',
            sellSlippage: '',
            buyPriorityFee: '',
            buyJitoFee: '',
            sellPriorityFee: '',
            sellJitoFee: '',
            buyPresets: ['', '', '', '', '', '', '', ''],
            sellPresets: ['', '', '', '', '', '', '', '']
        }
    },
    settings: {
        presetName: 'Main',
        buySlippage: '',
        sellSlippage: '',
        buyPriorityFee: '',
        buyJitoFee: '',
        sellPriorityFee: '',
        sellJitoFee: '',
        stayOnCurrent: true,
        openInCurrent: false,
        openNewTab: false,
        openInBgTab: false,
        displayJeetmode: true,
        enableQbButtons: true,
        remoteConnect: false,
        localConnect: true,
        qbPanelName: 'Jeet Mode',
        trenchPanelName: 'Trench Wallet'
    }
};

// DOM elements
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const presetButtons = document.querySelectorAll('.preset-btn');
const toggleSwitches = document.querySelectorAll('.toggle-switch');
const disconnectBtn = document.querySelector('.disconnect-btn');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');

// Initialize the application
function init() {
    setupEventListeners();
    updateUI();
}

function setupEventListeners() {
    // Tab navigation
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Preset buttons
    presetButtons.forEach(button => {
        button.addEventListener('click', () => {
            const presetId = parseInt(button.getAttribute('data-preset'));
            switchPreset(presetId);
        });
    });

    // Toggle switches
    toggleSwitches.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const setting = toggle.getAttribute('data-setting');
            toggleSetting(setting);
        });
    });

    // Connect/Disconnect button
    disconnectBtn.addEventListener('click', async () => {
        if (!state.isConnected) {
            console.log('Connecting to bot...');
            const success = await loadPresetsFromBot();
            if (success) {
                state.isConnected = true;
                disconnectBtn.textContent = 'Disconnect';
                console.log('Successfully connected to bot');
            } else {
                console.log('Failed to connect to bot');
                alert('Failed to connect to bot. Please check your connection and try again.');
            }
        } else {
            // Disconnect from bot
            state.isConnected = false;
            disconnectBtn.textContent = 'Connect';
            console.log('Disconnected from bot');
        }
        updateConnectionStatus();
    });

    // Form inputs
    const inputs = document.querySelectorAll('input[type="text"]');
    inputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            const id = e.target.id;
            
            // Validation for slippage inputs
            if (id.includes('slippage')) {
                
                let cleanValue = value.replace(/[^0-9]/g, ''); // Removes any non-numeric characters
    
                if (cleanValue.length > 3) {
                    cleanValue = cleanValue.slice(0, 3);  // Limits to 3 digits max (for 100)
                }
                
                const numValue = parseInt(cleanValue); // If value exceeds 100, use first two digits
                if (numValue > 100) {
                    cleanValue = cleanValue.slice(0, 2);
                }
                
                e.target.value = cleanValue;
            }
            
            // Validation for priority fee and jito fee inputs (numbers and decimals only)
            if (id.includes('priority-fee') || id.includes('jito-fee')) {
                // Remove any non-numeric characters except decimal points
                let cleanValue = value.replace(/[^0-9.]/g, '');
                
                // Ensure only one decimal point
                const parts = cleanValue.split('.');
                if (parts.length > 2) {
                    cleanValue = parts[0] + '.' + parts.slice(1).join('');
                }
                
                // Limit to reasonable length
                if (cleanValue.length > 10) {
                    cleanValue = cleanValue.slice(0, 10);
                }
                
                e.target.value = cleanValue;
            }
            
            if (id === 'qb-panel-name') {
                state.settings.qbPanelName = e.target.value;
            } else if (id === 'trench-panel-name') {
                state.settings.trenchPanelName = e.target.value;
            } else if (id === 'preset-name') {
                // Update preset name in current preset only
                const preset = state.presets[state.activePreset];
                if (preset) {
                    preset.name = e.target.value;
                }
            } else if (id && state.settings.hasOwnProperty(id.replace('-', ''))) {
                state.settings[id.replace('-', '')] = e.target.value;
            }
            
        });
    });

    // Preset amount inputs
    const presetInputs = document.querySelectorAll('.preset-input');
    presetInputs.forEach(input => {
        // Track if this is the first input after focus
        let isFirstInput = true;
        
        input.addEventListener('focus', (e) => {
            // Reset the flag when field is focused
            isFirstInput = true;
            
            // Store the original value for replacement logic
            e.target.setAttribute('data-original-value', e.target.value);
        });
        
        // Handle backspace to treat "Initials" as a single character
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                const currentValue = e.target.value;
                if (currentValue === 'Initials') {
                    e.preventDefault();
                    e.target.value = '';
                }
            }
        });
        
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            const inputId = e.target.id;
            
            // Validation for sell preset inputs
            if (inputId.includes('sell-preset') || input.closest('.sell-preset')) {
                // Remove any % symbols from the input first
                let cleanValue = value.replace(/%/g, '');
                
                // Handle "i" -> "Initials" conversion
                if (cleanValue.toLowerCase().includes('i')) {
                    e.target.value = 'Initials';
                } else if (cleanValue.toLowerCase().includes('initials')) {
                    e.target.value = 'Initials';
                } else {
                    // Check if input contains any letters (other than "i" which was handled above)
                    const hasLetters = /[a-zA-Z]/.test(cleanValue);
                    
                    if (hasLetters) {
                        // If it has letters but not "i", clear the input
                        e.target.value = '';
                    } else if (/\d/.test(cleanValue)) {
                        // If it has numbers, treat as numeric input
                        let numericValue = cleanValue.replace(/[^0-9]/g, '');
                        
                        // Check if the field originally contained "Initials" and we're typing a number
                        const originalValue = e.target.getAttribute('data-original-value') || '';
                        if (originalValue === 'Initials' && isFirstInput) {
                            // Replace "Initials" with the number
                            isFirstInput = false;
                        }
                        
                        // Limit to 3 digits max (for 100)
                        if (numericValue.length > 3) {
                            numericValue = numericValue.slice(0, 3);
                        }
                        
                        // If value exceeds 100, use first two digits
                        const numValue = parseInt(numericValue);
                        if (numValue > 100) {
                            numericValue = numericValue.slice(0, 2);
                        }
                        
                        e.target.value = numericValue;
                    } else {
                        // If no numbers or letters, allow empty input
                        e.target.value = '';
                    }
                }
            }
            
            // Validation for buy preset inputs (numbers only)
            if (inputId.includes('buy-preset') || input.closest('.buy-preset')) {
                // Remove any non-numeric characters and decimal points
                let cleanValue = value.replace(/[^0-9.]/g, '');
                
                // Ensure only one decimal point
                const parts = cleanValue.split('.');
                if (parts.length > 2) {
                    cleanValue = parts[0] + '.' + parts.slice(1).join('');
                }
                
                // Limit to reasonable length (e.g., 10 characters for buy amounts)
                if (cleanValue.length > 10) {
                    cleanValue = cleanValue.slice(0, 10);
                }
                
                e.target.value = cleanValue;
            }
            
            // Validation for slippage inputs
            if (inputId.includes('slippage')) {
                // Remove any non-numeric characters
                let cleanValue = value.replace(/[^0-9]/g, '');
                
                // Limit to 3 digits max (for 100)
                if (cleanValue.length > 3) {
                    cleanValue = cleanValue.slice(0, 3);
                }
                
                // If value exceeds 100, use first two digits
                const numValue = parseInt(cleanValue);
                if (numValue > 100) {
                    cleanValue = cleanValue.slice(0, 2);
                }
                
                e.target.value = cleanValue;
            }
            
        });
    });

    // Save buttons
    const saveButtons = document.querySelectorAll('.save-btn');
    saveButtons.forEach(button => {
        button.addEventListener('click', saveSettings);
    });
}

// Switch between tabs
function switchTab(tabId) {
    state.activeTab = tabId;
    
    // Update tab buttons
    tabButtons.forEach(button => {
        button.classList.remove('active');
        if (button.getAttribute('data-tab') === tabId) {
            button.classList.add('active');
        }
    });

    // Update tab content
    tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabId}-content`) {
            content.classList.add('active');
        }
    });
}

// Switch between presets
function switchPreset(presetId) {
    state.activePreset = presetId;
    
    presetButtons.forEach(button => {
        button.classList.remove('active');
        if (parseInt(button.getAttribute('data-preset')) === presetId) {
            button.classList.add('active');
        }
    });

    // Load preset data when switching presets
    loadPresetData(presetId);

}

// Toggle a setting
function toggleSetting(setting) {
    if (state.settings.hasOwnProperty(setting)) {
        // Handle QB Tab Operations as radio buttons
        if (['stayOnCurrent', 'openInCurrent', 'openNewTab', 'openInBgTab'].includes(setting)) {
            // Turn off all QB tab operation settings
            ['stayOnCurrent', 'openInCurrent', 'openNewTab', 'openInBgTab'].forEach(qbSetting => {
                state.settings[qbSetting] = false;
                updateToggleUI(qbSetting);
            });
            // Turn on the selected setting
            state.settings[setting] = true;
            updateToggleUI(setting);
        } else {
            // Handle other settings as regular toggles
            state.settings[setting] = !state.settings[setting];
            updateToggleUI(setting);
        }
    }
}

// Update toggle UI
function updateToggleUI(setting) {
    const toggle = document.querySelector(`[data-setting="${setting}"]`);
    if (toggle) {
        if (state.settings[setting]) {
            toggle.classList.add('active');
        } else {
            toggle.classList.remove('active');
        }
    }
}

// Update connection status
function updateConnectionStatus() {
    if (state.isConnected) {
        statusDot.classList.add('connected');
        statusText.classList.add('connected');
        statusText.textContent = 'Connected';
    } else {
        statusDot.classList.remove('connected');
        statusText.classList.remove('connected');
        statusText.textContent = 'Disconnected';
        statusText.style.color = '#f87171';
    }
}

// Load preset data
function loadPresetData(presetId) {
    const preset = state.presets[presetId];
    if (!preset) return;

    // Update preset name
    const presetNameInput = document.getElementById('preset-name');
    if (presetNameInput) {
        presetNameInput.value = preset.name;
    }

    // Update buy settings
    const buySlippageInput = document.getElementById('buy-slippage');
    if (buySlippageInput) buySlippageInput.value = preset.buySlippage;
    
    const buyPriorityFeeInput = document.getElementById('buy-priority-fee');
    if (buyPriorityFeeInput) buyPriorityFeeInput.value = preset.buyPriorityFee;
    
    const buyJitoFeeInput = document.getElementById('buy-jito-fee');
    if (buyJitoFeeInput) buyJitoFeeInput.value = preset.buyJitoFee;

    // Update sell settings
    const sellSlippageInput = document.getElementById('sell-slippage');
    if (sellSlippageInput) sellSlippageInput.value = preset.sellSlippage;
    
    const sellPriorityFeeInput = document.getElementById('sell-priority-fee');
    if (sellPriorityFeeInput) sellPriorityFeeInput.value = preset.sellPriorityFee;
    
    const sellJitoFeeInput = document.getElementById('sell-jito-fee');
    if (sellJitoFeeInput) sellJitoFeeInput.value = preset.sellJitoFee;

    // Update buy preset amounts
    const buyPresetInputs = document.querySelectorAll('.buy-preset .preset-input');
    buyPresetInputs.forEach((input, index) => {
        if (preset.buyPresets[index]) {
            input.value = preset.buyPresets[index];
        }
    });

    // Update sell preset amounts
    const sellPresetInputs = document.querySelectorAll('.sell-preset .preset-input');
    sellPresetInputs.forEach((input, index) => {
        if (preset.sellPresets[index]) {
            let value = preset.sellPresets[index];
            
            // Remove % symbols when loading into input fields
            if (value === 'Initials') {
                input.value = 'Initials';
            } else {
                input.value = value.replace(/%/g, '');
            }
        }
    });

}

// Manual trigger to test preset update (for debugging)
function testPresetUpdate() {
    console.log('Manual trigger: Testing preset update');
    sendPresetToTrenchPanel(state.activePreset);
}

// Listen for messages from trench panel
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'getPresetData') {
            const presetId = message.presetId;
            const preset = state.presets[presetId];
            if (preset) {
                sendResponse({ preset: preset });
            } else {
                sendResponse({ preset: null });
            }
        }
    });
}

// Send preset data to trench panel
function sendPresetToTrenchPanel(presetId) {
    const preset = state.presets[presetId];
    if (!preset) {
        console.log('No preset found for ID:', presetId);
        return;
    }

    console.log('Sending preset to trench panel:', preset);

    // Send message to content script to update trench panel
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                console.log('Sending message to tab:', tabs[0].id);
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'updateTrenchPanel',
                    preset: preset
                }, (response) => {
                    console.log('Response from content script:', response);
                });
            } else {
                console.log('No active tab found');
            }
        });
    } else {
        console.log('Chrome tabs API not available');
    }
}

// Save current preset data
function saveCurrentPreset() {
    const presetId = state.activePreset;
    const preset = state.presets[presetId];
    
    // Update preset name
    const presetNameInput = document.getElementById('preset-name');
    if (presetNameInput) {
        preset.name = presetNameInput.value;
 
    }

    // Update buy settings
    const buySlippageInput = document.getElementById('buy-slippage');
    if (buySlippageInput) preset.buySlippage = buySlippageInput.value;
    
    const buyPriorityFeeInput = document.getElementById('buy-priority-fee');
    if (buyPriorityFeeInput) preset.buyPriorityFee = buyPriorityFeeInput.value;
    
    const buyJitoFeeInput = document.getElementById('buy-jito-fee');
    if (buyJitoFeeInput) preset.buyJitoFee = buyJitoFeeInput.value;

    // Update sell settings
    const sellSlippageInput = document.getElementById('sell-slippage');
    if (sellSlippageInput) preset.sellSlippage = sellSlippageInput.value;
    
    const sellPriorityFeeInput = document.getElementById('sell-priority-fee');
    if (sellPriorityFeeInput) preset.sellPriorityFee = sellPriorityFeeInput.value;
    
    const sellJitoFeeInput = document.getElementById('sell-jito-fee');
    if (sellJitoFeeInput) preset.sellJitoFee = sellJitoFeeInput.value;

    // Update buy preset amounts
    const buyPresetInputs = document.querySelectorAll('.buy-preset .preset-input');
    buyPresetInputs.forEach((input, index) => {
        preset.buyPresets[index] = input.value;
    });

    // Update sell preset amounts
    const sellPresetInputs = document.querySelectorAll('.sell-preset .preset-input');
    sellPresetInputs.forEach((input, index) => {
        let value = input.value;
        
        // Remove any existing % symbols to prevent double %
        value = value.replace(/%/g, '');
        
        // Handle "Initials" special case
        if (value === 'Initials') {
            preset.sellPresets[index] = 'Initials';
        } else if (value === '') {
            // Empty values should not have %
            preset.sellPresets[index] = '';
        } else {
            // For numeric values, add % symbol
            const numValue = parseInt(value);
            if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
                preset.sellPresets[index] = numValue + '%';
            } else {
                preset.sellPresets[index] = value; // Keep original if invalid
            }
        }
    });

    // Update state settings
    state.settings.buySlippage = preset.buySlippage;
    state.settings.sellSlippage = preset.sellSlippage;
    state.settings.buyPriorityFee = preset.buyPriorityFee;
    state.settings.buyJitoFee = preset.buyJitoFee;
    state.settings.sellPriorityFee = preset.sellPriorityFee;
    state.settings.sellJitoFee = preset.sellJitoFee;
}

// Save settings
async function saveSettings() {
    // Save current preset data first
    saveCurrentPreset();
    
    // Send updated preset to trench panel
    sendPresetToTrenchPanel(state.activePreset);
    
    // Save to chrome storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.set({ 
            extensionSettings: state.settings,
            extensionPresets: state.presets
        });
    }
    
    // Send presets to bot if connected
    if (state.isConnected) {
        const botSuccess = await savePresetsToBot();
        if (!botSuccess) {
            console.warn('Failed to save presets to bot');
        }
    }
    
    console.log('Saving settings:', state.settings);
    console.log('Saving presets:', state.presets);
    
    // Show a temporary success message
    const saveButtons = document.querySelectorAll('.save-btn');
    saveButtons.forEach(button => {
        const originalText = button.innerHTML;
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20,6 9,17 4,12"></polyline>
            </svg>
            Saved!
        `;
        button.style.backgroundColor = '#10b981';
        
        setTimeout(() => {
            button.innerHTML = originalText;
            button.style.backgroundColor = '#675DD8';
        }, 2000);
    });
}

// Update the entire UI
function updateUI() {
    // Update connection status
    updateConnectionStatus();
    
    // Update all toggles
    Object.keys(state.settings).forEach(setting => {
        updateToggleUI(setting);
    });
    
    // Update form inputs
    Object.keys(state.settings).forEach(setting => {
        let inputId;
        if (setting === 'qbPanelName') {
            inputId = 'qb-panel-name';
        } else if (setting === 'trenchPanelName') {
            inputId = 'trench-panel-name';
        } else {
            inputId = setting.replace(/([A-Z])/g, '-$1').toLowerCase();
        }
        const input = document.getElementById(inputId);
        if (input && typeof state.settings[setting] === 'string') {
            input.value = state.settings[setting];
        }
    });
}

// API Functions for Bot Communication
async function loadPresetsFromBot() {
    try {
        console.log('Loading presets from bot...');
        const response = await fetch('https://extension.soliz-labs.io/presets', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                // Add any authentication headers needed
                // 'Authorization': 'Bearer ' + apiKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Received presets from bot:', data);
        
        // Updates state with bot data
        if (data.presets) {
            state.presets = { ...state.presets, ...data.presets };
        }
        
        // Load the current preset data into UI
        loadPresetData(state.activePreset);
        
        // Update trench panel with current preset
        sendPresetToTrenchPanel(state.activePreset);
        
        return true;
    } catch (error) {
        console.error('Error loading presets from bot:', error);
        return false;
    }
}

async function savePresetsToBot() {
    try {
        console.log('Saving presets to bot...');
        const response = await fetch('https://extension.soliz-labs.io/presets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add any authentication headers needed
                // 'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify({
                presets: state.presets
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Bot response:', data);
        return true;
    } catch (error) {
        console.error('Error saving presets to bot:', error);
        return false;
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// For browser extension compatibility
if (typeof chrome !== 'undefined' && chrome.storage) {
    // Load settings and presets from chrome storage
    chrome.storage.sync.get(['extensionSettings', 'extensionPresets'], (result) => {
        if (result.extensionSettings) {
            state.settings = { ...state.settings, ...result.extensionSettings };
        }
        if (result.extensionPresets) {
            state.presets = { ...state.presets, ...result.extensionPresets };
        }
        updateUI();
        // Load the current preset data
        loadPresetData(state.activePreset);
    });
    
    // Override save function to use chrome storage
    function saveSettings() {
        // Save current preset data first
        saveCurrentPreset();
        
        // Send updated preset to trench panel
        sendPresetToTrenchPanel(state.activePreset);
        
        // Save both settings and presets
        chrome.storage.sync.set({ 
            extensionSettings: state.settings,
            extensionPresets: state.presets
        }, () => {
            console.log('Settings and presets saved to chrome storage');
            
            // Show success message
            const saveButtons = document.querySelectorAll('.save-btn');
            saveButtons.forEach(button => {
                const originalText = button.innerHTML;
                button.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                    Saved!
                `;
                button.style.backgroundColor = '#10b981';
                
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.style.backgroundColor = '#675DD8';
                }, 2000);
            });
        });
    }
}