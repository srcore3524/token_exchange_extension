document.addEventListener('DOMContentLoaded', () => {
    const remote = document.getElementById('remote');
    const local = document.getElementById('local');

    remote?.addEventListener('change', () => {
        if (remote.checked) local.checked = false;
    });

    local?.addEventListener('change', () => {
        if (local.checked) remote.checked = false;
    });

    document.querySelectorAll('.tabs').forEach(tabsContainer => {
        const tabs = tabsContainer.querySelectorAll('.tab');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
            });
        });
    });

    document.querySelectorAll('.quick-section').forEach(section => {
        const buyButtons = section.querySelectorAll('.buy-options button');
        const sellButtons = section.querySelectorAll('.sell-options button');
        const inputs = section.querySelectorAll('.input-amount');

        buyButtons.forEach(button => {
            button.addEventListener('click', () => {
                const value = button.textContent.trim().split(' ')[0];
                if (inputs.length > 0) {
                    inputs[0].value = value;
                }
            });
        });

        sellButtons.forEach(button => {
            button.addEventListener('click', () => {
                const text = button.textContent.trim();

                if (text.includes('%')) {
                    const percent = text.split('%')[0].trim();
                    if (inputs.length > 1) {
                        inputs[1].value = percent;
                    }
                } else {
                    if (inputs.length > 0) {
                        inputs[0].value = text;
                    }
                }
            });
        });
    });
    document.querySelectorAll('.buy-options.presets').forEach(presetGroup => {
        const buttons = presetGroup.querySelectorAll('button');

        buttons.forEach(button => {
            button.addEventListener('click', () => {
                buttons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            });
        });
    });


    const container = document.getElementById("assets-container");

    const hardcodedAssets = [
        {
            name: "wDog",
            invested: "3.5 Sol",
            sold: "7 Sol",
            remaining: "10.5 Sol",
            pnl: "17.5 (500%)",
            avatar: "assets/graphic.svg"
        }
    ];

    function renderAssets(assets) {
        assets.forEach(asset => {
            const row = document.createElement("div");
            row.className = "asset-row";
            row.innerHTML = `
          <div class="avatar-wrapper">
            <img src="${asset.avatar}" alt="${asset.name}" class="avatar" />
            <span class="asset-name">${asset.name}</span>
          </div>
          <div class="asset-info">
            <div class="asset-stats">
              <div><span class="label">Invested</span><br><span class="value">${asset.invested}</span></div>
              <div><span class="label">Sold</span><br><span class="value">${asset.sold}</span></div>
              <div><span class="label">Remaining</span><br><span class="value">${asset.remaining}</span></div>
              <div><span class="label">PnL</span><br><span class="pnl">${asset.pnl}</span></div>
            </div>
          </div>
          <button class="sell-btn waves-effect waves-light">Sell</button>
        `;
            container?.appendChild(row);
        });
    }

    async function loadPositions() {
        try {
            const response = await fetch('https://extension.soliz-labs.io/positions');
            if (!response.ok) throw new Error('Failed to load positions');

            const data = await response.json();

            renderAssets([...hardcodedAssets, ...(data.assets || [])]);
        } catch (err) {
            console.error('Error loading positions:', err);
            renderAssets(hardcodedAssets);
        }
    }

    loadPositions();

    document.querySelector('.connect-btn')?.addEventListener('click', async () => {
        // Auto-redirect for testing
        window.location.href = 'login-disconnect.html';
    });



    const remoteCheckbox = document.getElementById('remote');
    const localCheckbox = document.getElementById('local');

    function uncheckOther(selected) {
        if (selected === 'remote') localCheckbox.checked = false;
        if (selected === 'local') remoteCheckbox.checked = false;
    }

    function sendAuthType(type) {
        fetch('https://extension.soliz-labs.io/authentication', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ type })
        })
            .then(res => {
                if (!res.ok) throw new Error('Request failed');
                return res.json();
            })
            .then(data => {
                console.log('Auth type sent successfully:', data);
            })
            .catch(err => {
                console.error('Error sending auth type:', err);
                alert('Failed to connect. Please try again.');
            });
    }

    remoteCheckbox?.addEventListener('change', (e) => {
        if (e.target.checked) {
            uncheckOther('remote');
            sendAuthType('remote');
        }
    });

    localCheckbox?.addEventListener('change', (e) => {
        if (e.target.checked) {
            uncheckOther('local');
            sendAuthType('local');
        }
    });

    async function getAmountFromLocalStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['presetAmount'], (result) => {
                resolve(result.presetAmount || 0);
            });
        });
    }

    async function handleSwap(actionType) {
        const amount = await getAmountFromLocalStorage();
        
        // Get current preset ID from storage
        let currentPresetId = 1; // Default to preset 1
        try {
            const result = await chrome.storage.sync.get(['currentActivePreset']);
            if (result.currentActivePreset) {
                currentPresetId = result.currentActivePreset;
            }
        } catch (error) {
            console.error('Error getting current preset:', error);
        }

        try {
            const response = await fetch('https://extension.soliz-labs.io/swap', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: actionType,
                    amount: amount,
                    presetId: currentPresetId // Include the current preset ID
                })
            });

            if (!response.ok) {
                throw new Error('Swap failed');
            }

            const data = await response.json();
            console.log(`${actionType} successful:`, data);
        } catch (error) {
            console.error(`Error on ${actionType}:`, error);
            alert(`${actionType.toUpperCase()} failed. Please try again.`);
        }
    }

    document.querySelectorAll('.buy-btn').forEach(button => {
        button.addEventListener('click', () => handleSwap('buy'));
    });

    document.querySelectorAll('.sell-btn').forEach(button => {
        button.addEventListener('click', () => handleSwap('sell'));
    });


});