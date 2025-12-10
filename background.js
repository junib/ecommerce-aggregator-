// Background Service Worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle fetch requests for search results (to avoid CORS issues)
    if (message.action === 'fetchFlipkart') {
        fetch(message.url, {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'max-age=0',
                'Upgrade-Insecure-Requests': '1'
            }
        })
            .then(response => response.text())
            .then(html => {
                sendResponse({ success: true, html: html });
            })
            .catch(error => {
                console.error('Error fetching Flipkart:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep channel open for async response
    }

    if (message.action === 'fetchAmazon') {
        fetch(message.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        })
            .then(response => response.text())
            .then(html => {
                sendResponse({ success: true, html: html });
            })
            .catch(error => {
                console.error('Error fetching Amazon:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep channel open for async response
    }

    if (message.action === 'fetchZomato') {
        fetch(message.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        })
            .then(response => response.text())
            .then(html => {
                sendResponse({ success: true, html: html });
            })
            .catch(error => {
                console.error('Error fetching Zomato:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }

    if (message.action === 'searchFlipkart') {
        // Store the search query for when user visits Flipkart
        chrome.storage.local.set({
            pendingFlipkartSearch: {
                query: message.query,
                amazonProduct: message.amazonProduct,
                timestamp: Date.now()
            }
        });
        sendResponse({ success: true });
    } else if (message.action === 'searchAmazon') {
        // Store the search query for when user visits Amazon
        chrome.storage.local.set({
            pendingAmazonSearch: {
                query: message.query,
                flipkartProduct: message.flipkartProduct,
                timestamp: Date.now()
            }
        });
        sendResponse({ success: true });
        sendResponse({ success: true });
    } else if (message.action === 'createAlert') {
        chrome.storage.local.get(['priceAlerts'], (result) => {
            const alerts = result.priceAlerts || [];
            alerts.push(message.alert);
            chrome.storage.local.set({ priceAlerts: alerts }, () => {
                // Ensure alarm is created
                chrome.alarms.get('checkPrices', (alarm) => {
                    if (!alarm) {
                        chrome.alarms.create('checkPrices', { periodInMinutes: 30 }); // Check every 30 mins
                    }
                });
                sendResponse({ success: true });
            });
        });
        return true; // Keep channel open
    } else if (message.action === 'testFCM') {
        const testAlert = {
            title: 'Test Product',
            targetPrice: 1000,
            image: ''
        };
        sendFCMNotification(testAlert, 999, true) // isTest = true
            .then(success => sendResponse({ success }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    } else {
        sendResponse({ success: true });
    }
});

// Listen for tab updates to check if user navigated to comparison site
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;

    if (tab.url?.includes('flipkart.com')) {
        // Check if there's a pending Amazon search
        chrome.storage.local.get(['pendingFlipkartSearch'], (result) => {
            if (result.pendingFlipkartSearch) {
                // Clear the pending search
                chrome.storage.local.remove(['pendingFlipkartSearch']);
                // Optionally inject a notification
                chrome.tabs.sendMessage(tabId, {
                    action: 'showComparison',
                    searchQuery: result.pendingFlipkartSearch.query
                }).catch(() => {
                    // Ignore errors if content script not ready
                });
            }
        });
    } else if (tab.url?.includes('amazon.in')) {
        // Check if there's a pending Flipkart search
        chrome.storage.local.get(['pendingAmazonSearch'], (result) => {
            if (result.pendingAmazonSearch) {
                // Clear the pending search
                chrome.storage.local.remove(['pendingAmazonSearch']);
                // Optionally inject a notification
                chrome.tabs.sendMessage(tabId, {
                    action: 'showComparison',
                    searchQuery: result.pendingAmazonSearch.query
                }).catch(() => {
                    // Ignore errors if content script not ready
                });
            }
        });
    }
});

// Price Check Alarm
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'checkPrices') {
        checkPrices();
    }
});

async function checkPrices() {
    chrome.storage.local.get(['priceAlerts'], async (result) => {
        const alerts = result.priceAlerts || [];
        if (alerts.length === 0) return;

        const updatedAlerts = [];
        let alertsChanged = false;

        for (const alert of alerts) {
            try {
                // Fetch current price
                const response = await fetch(alert.url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const html = await response.text();

                let currentPrice = null;

                if (alert.type === 'swiggy') {
                    // Swiggy Logic: Search for dish name in the page content
                    // Swiggy often loads data in a big JSON blob inside __NEXT_DATA__ or similar script tag
                    // But for simple scraping, we might try to find the dish name and the nearest price

                    // Simple regex heuristic: look for the dish name followed reasonably closely by a price
                    // This is brittle but works for basic cases without full DOM parsing/JS execution
                    const dishNameRegex = new RegExp(alert.dishName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]{0,500}?₹([\\d,]+)', 'i');
                    const match = html.match(dishNameRegex);
                    if (match) {
                        currentPrice = parseFloat(match[1].replace(/,/g, ''));
                    }
                } else {
                    // Amazon/Flipkart Logic
                    const priceMatch = html.match(/<span[^>]*class="[^"]*a-price-whole[^"]*"[^>]*>([\d,.]+)</) ||
                        html.match(/id="priceblock_ourprice"[^>]*>₹?([\d,.]+)/) ||
                        html.match(/id="priceblock_dealprice"[^>]*>₹?([\d,.]+)/);
                    if (priceMatch) {
                        currentPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
                    }
                }

                if (currentPrice !== null && !isNaN(currentPrice) && currentPrice <= alert.targetPrice) {
                    // Trigger Notification
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icons/icon128.png',
                        title: 'Price Drop Alert! 📉',
                        message: `Price for "${alert.title.substring(0, 30)}..." has dropped to ₹${currentPrice}! (Target: ₹${alert.targetPrice})`,
                        priority: 2
                    });

                    // Send Mobile Notification
                    sendFCMNotification(alert, currentPrice);

                    // Remove this alert as it's triggered
                    alertsChanged = true;
                    continue;
                }
            } catch (error) {
                console.error('Error checking price for', alert.title, error);
            }
            updatedAlerts.push(alert);
        }

        if (alertsChanged) {
            chrome.storage.local.set({ priceAlerts: updatedAlerts });
        }
    });
}


async function sendFCMNotification(alert, currentPrice, isTest = false) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['projectId', 'deviceToken'], async (result) => {
            if (!result.projectId || !result.deviceToken) {
                console.warn('FCM credentials missing');
                if (isTest) reject(new Error('Missing Settings (Project ID/Token)'));
                else resolve(false);
                return;
            }

            try {
                // Get OAuth Token
                const tokenWrapper = await new Promise((res, rej) => {
                    chrome.identity.getAuthToken({ interactive: true }, (token) => {
                        if (chrome.runtime.lastError || !token) {
                            rej(new Error(chrome.runtime.lastError?.message || 'Auth Failed'));
                        } else {
                            res(token);
                        }
                    });
                });

                const accessToken = tokenWrapper;

                // Send V1 Notification
                const response = await fetch(`https://fcm.googleapis.com/v1/projects/${result.projectId}/messages:send`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: {
                            token: result.deviceToken,
                            notification: {
                                title: isTest ? 'Test Alert 🔔' : 'Price Drop Alert! 📉',
                                body: isTest
                                    ? 'This is a test notification from your extension.'
                                    : `Price for "${alert.title.substring(0, 30)}..." dropped to ₹${currentPrice}!`
                            },
                            data: {
                                productName: alert.title || 'Unknown Product',
                                currentPrice: String(currentPrice),
                                targetPrice: String(alert.targetPrice),
                                imageUrl: alert.image || '',
                                url: alert.url || ''
                            }
                        }
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();

                    // Specific handling for token issues
                    if (response.status === 401 || response.status === 403) {
                        chrome.identity.removeCachedAuthToken({ token: accessToken }, () => { });
                        throw new Error('Auth Token Expired/Invalid (401/403)');
                    }

                    throw new Error(`FCM V1 Error: ${response.status} ${errorText}`);
                }

                resolve(true);
            } catch (error) {
                console.error('Failed to send FCM', error);
                if (isTest) reject(error);
                else resolve(false); // Don't fail the whole loop
            }
        });
    });
}
