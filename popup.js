// Popup script
document.addEventListener('DOMContentLoaded', () => {
    // Check current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        const url = currentTab.url;

        const statusDiv = document.getElementById('status');

        if (url.includes('amazon.in') || url.includes('flipkart.com')) {
            statusDiv.textContent = '✓ On e-commerce site - Click "Compare Prices" button';
            statusDiv.className = 'status active';
        } else if (url.includes('swiggy.com')) {
            statusDiv.textContent = '✓ On Swiggy - Click any dish to compare';
            statusDiv.className = 'status active';
        } else {
            statusDiv.textContent = 'ℹ️ Visit Amazon.in, Flipkart, or Swiggy to use extension';
            statusDiv.className = 'status';
        }
    });
    // Variables
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsSection = document.getElementById('settingsSection');
    const projectIdInput = document.getElementById('projectId');
    const deviceTokenInput = document.getElementById('deviceToken');
    const saveSettingsdBtn = document.getElementById('saveSettings');
    const testAlertBtn = document.getElementById('testAlert');
    const settingsStatus = document.getElementById('settingsStatus');

    // Toggle Settings
    settingsToggle.addEventListener('click', () => {
        if (settingsSection.style.display === 'none') {
            settingsSection.style.display = 'block';
            settingsToggle.textContent = '❌ Close Settings';
            loadSettings();
        } else {
            settingsSection.style.display = 'none';
            settingsToggle.textContent = '⚙️ Configure Mobile Alerts';
        }
    });

    // Load Settings
    function loadSettings() {
        chrome.storage.local.get(['projectId', 'deviceToken'], (result) => {
            if (result.projectId) projectIdInput.value = result.projectId;
            if (result.deviceToken) deviceTokenInput.value = result.deviceToken;
        });
    }

    // Save Settings
    saveSettingsdBtn.addEventListener('click', () => {
        const pid = projectIdInput.value.trim();
        const token = deviceTokenInput.value.trim();

        if (!pid || !token) {
            showStatus('Please enter Project ID and Token', false);
            return;
        }

        chrome.storage.local.set({
            projectId: pid,
            deviceToken: token
        }, () => {
            showStatus('Settings Saved!', true);
        });
    });

    // Test Alert
    testAlertBtn.addEventListener('click', () => {
        testAlertBtn.disabled = true;
        testAlertBtn.textContent = 'Sending...';

        chrome.runtime.sendMessage({ action: 'testFCM' }, (response) => {
            testAlertBtn.disabled = false;
            testAlertBtn.textContent = 'Test Alert (Auth)';

            if (response && response.success) {
                showStatus('Test Sent! Check your phone.', true);
            } else {
                showStatus('Error: ' + (response?.error || 'Unknown error'), false);
            }
        });
    });

    function showStatus(msg, success) {
        settingsStatus.textContent = msg;
        settingsStatus.style.color = success ? '#81c784' : '#ff8a80';
        settingsStatus.style.display = 'block';
        setTimeout(() => {
            settingsStatus.style.display = 'none';
        }, 3000);
    }



    // Load alerts
    loadAlerts();

    function loadAlerts() {
        const alertsSection = document.getElementById('alertsSection');
        const alertsList = document.getElementById('alertsList');

        chrome.storage.local.get(['priceAlerts'], (result) => {
            const alerts = result.priceAlerts || [];

            if (alerts.length > 0) {
                alertsSection.style.display = 'block';
                alertsList.innerHTML = '';

                alerts.forEach((alert, index) => {
                    const alertItem = document.createElement('div');
                    alertItem.style.display = 'flex';
                    alertItem.style.justifyContent = 'space-between';
                    alertItem.style.alignItems = 'center';
                    alertItem.style.background = 'rgba(255, 255, 255, 0.05)';
                    alertItem.style.padding = '8px';
                    alertItem.style.marginBottom = '8px';
                    alertItem.style.borderRadius = '6px';

                    alertItem.innerHTML = `
                        <div style="flex: 1; margin-right: 10px;">
                            <div style="font-weight: bold; font-size: 13px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">${alert.title}</div>
                            <div style="font-size: 12px; opacity: 0.8;">Target: ₹${alert.targetPrice} (was ₹${alert.currentPrice})</div>
                        </div>
                        <button class="delete-btn" data-index="${index}" style="background: none; border: none; cursor: pointer; font-size: 16px;">🗑️</button>
                    `;
                    alertsList.appendChild(alertItem);
                });

                // Add delete listeners
                document.querySelectorAll('.delete-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const index = parseInt(e.target.getAttribute('data-index'));
                        deleteAlert(index);
                    });
                });
            } else {
                alertsSection.style.display = 'none';
            }
        });
    }

    function deleteAlert(index) {
        chrome.storage.local.get(['priceAlerts'], (result) => {
            const alerts = result.priceAlerts || [];
            alerts.splice(index, 1);
            chrome.storage.local.set({ priceAlerts: alerts }, () => {
                loadAlerts(); // Reload list
            });
        });
    }
});

