// Swiggy Content Script - Side-by-Side Zomato Comparison
(function () {
    'use strict';

    let sidebar = null;
    let selectedDish = null;
    let restaurantName = '';
    let zomatoUrl = '';

    // --- SIDEBAR UI ---

    function createSidebar() {
        if (sidebar) return;

        sidebar = document.createElement('div');
        sidebar.id = 'swiggy-zomato-sidebar';
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <h3>Price Compare</h3>
                <button id="minimizeSidebar">_</button>
            </div>
            
            <div class="zomato-status-section">
                <h4>Zomato Status</h4>
                <div id="zomatoRestaurantInfo" class="status-box">
                    <p class="loading">Searching for this restaurant on Zomato...</p>
                </div>
            </div>

            <div class="comparison-section" id="comparisonContent">
                <div class="placeholder-msg">
                    <p>👈 Click any dish to compare prices</p>
                </div>
            </div>
        `;

        // Inject Styles specifically for sidebar
        const style = document.createElement('style');
        style.textContent = `
            #swiggy-zomato-sidebar {
                position: fixed;
                top: 80px;
                right: 0;
                width: 320px;
                height: calc(100vh - 80px);
                background: white;
                box-shadow: -2px 0 10px rgba(0,0,0,0.1);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                font-family: sans-serif;
                transition: transform 0.3s;
                border-left: 1px solid #eee;
            }
            #swiggy-zomato-sidebar.minimized {
                transform: translateX(280px);
            }
            .sidebar-header {
                padding: 15px;
                background: linear-gradient(135deg, #fc8019 0%, #ff5e3a 100%); /* Swiggy Orange-ish */
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .sidebar-header h3 { margin: 0; font-size: 16px; }
            #minimizeSidebar {
                background: none; border: none; color: white; font-weight: bold; cursor: pointer; font-size: 18px;
            }
            
            .zomato-status-section {
                padding: 15px;
                border-bottom: 5px solid #f0f0f0;
                background: #fff;
            }
            .status-box {
                background: #f8f8f8;
                padding: 10px;
                border-radius: 6px;
                font-size: 13px;
                margin-top: 5px;
            }
            
            .comparison-section {
                flex: 1;
                padding: 15px;
                overflow-y: auto;
            }
            
            .cmp-card {
                border: 1px solid #eee;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 12px;
            }
            .cmp-card.swiggy { border-left: 4px solid #fc8019; }
            .cmp-card.zomato { border-left: 4px solid #E23744; }
            
            .cmp-price { font-size: 18px; font-weight: bold; color: #333; }
            .cmp-title { font-size: 14px; font-weight: 600; margin-bottom: 5px; }
            .cmp-meta { font-size: 11px; color: #777; margin-top: 5px; }
            
            .placeholder-msg {
                text-align: center; color: #999; margin-top: 50px;
            }
            
            .z-btn {
                display: block; width: 100%; text-align: center; background: #E23744; color: white; 
                padding: 8px; border-radius: 4px; text-decoration: none; font-weight: bold; margin-top: 10px;
                box-sizing: border-box;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(sidebar);

        // Sidebar behavior
        document.getElementById('minimizeSidebar').addEventListener('click', () => {
            sidebar.classList.toggle('minimized');
            const btn = document.getElementById('minimizeSidebar');
            btn.textContent = sidebar.classList.contains('minimized') ? '◀' : '_';
        });
    }

    // --- LOGIC ---

    function detectRestaurant() {
        // Try multiple strategies to find restaurant name
        let name = '';
        if (document.title.includes('Order from')) {
            name = document.title.split('Order from')[1].split('|')[0].trim();
        } else if (document.title.includes('|')) {
            name = document.title.split('|')[0].trim();
        }

        // Sanity check: Don't detect "Swiggy" as the restaurant name
        if (name && !name.toLowerCase().includes('swiggy') && name !== restaurantName) {
            restaurantName = name;
            console.log('Swiggy Ext: Detected Restaurant', restaurantName);
            createSidebar();
            findRestaurantOnZomato(restaurantName);
        }
    }

    // Phase 1: Search for the restaurant itself
    function findRestaurantOnZomato(name) {
        const infoBox = document.getElementById('zomatoRestaurantInfo');
        infoBox.innerHTML = `<p class="loading">Searching Zomato for "${name}"...</p>`;

        // Use background script to search
        const query = `${name} restaurant`; // simplified query
        const searchUrl = `https://www.zomato.com/search?q=${encodeURIComponent(query)}`;

        chrome.runtime.sendMessage({ action: 'fetchZomato', url: searchUrl }, (response) => {
            if (response && response.success) {
                // Parse Search Results
                // Zomato search results are usually in json/blob or specific DOM structure
                // Heuristic: Look for the first "result-title" or similar link
                // Since Zomato is SPA/SSR, we might find <a href="/city/restaurant-name...">

                // Simple regex to find the first restaurant link in the HTML
                // Pattern: href="https://www.zomato.com/[city]/[restaurant]..." class="..."
                const linkMatch = response.html.match(/href="(https:\/\/www\.zomato\.com\/[a-zA-Z-]+\/[a-zA-Z0-9-]+)(\/order|"[^>]*class="[^"]*result-title)/i);

                if (linkMatch && linkMatch[1]) {
                    zomatoUrl = linkMatch[1];
                    infoBox.innerHTML = `
                        <div style="color: #2e7d32; font-weight: bold;">✓ Found on Zomato</div>
                        <a href="${zomatoUrl}" target="_blank" class="z-btn">Open in Zomato</a>
                    `;
                } else {
                    infoBox.innerHTML = `
                        <div style="color: #e65100;">⚠️ Could not auto-detect link</div>
                        <a href="${searchUrl}" target="_blank" class="z-btn">Search Manually</a>
                    `;
                }
            } else {
                infoBox.innerHTML = `<p class="error">Search failed. ${response.error || ''}</p>`;
            }
        });
    }

    // Phase 2: Compare specific dish
    function compareDish(dishName, price) {
        if (!restaurantName) return;

        const content = document.getElementById('comparisonContent');
        content.innerHTML = `
            <div class="cmp-card swiggy">
                <div class="cmp-title">${dishName}</div>
                <div class="cmp-price">₹${price}</div>
                <div class="cmp-meta">Swiggy Price</div>
            </div>
            <div class="cmp-card zomato">
                <div class="cmp-title">Zomato</div>
                <div id="zomatoPriceBox"><p class="loading">Checking price...</p></div>
            </div>
        `;

        // Search Zomato for this dish
        // We search: "Restaurant Name Dish Name"
        const query = `${restaurantName} ${dishName}`;
        const searchUrl = `https://www.zomato.com/search?q=${encodeURIComponent(query)}`;

        chrome.runtime.sendMessage({ action: 'fetchZomato', url: searchUrl }, (response) => {
            const zBox = document.getElementById('zomatoPriceBox');
            if (response && response.success) {
                // Try to scrape price from search result snippet
                // Look for "₹" near the dish name
                // This is extremely heuristic-based
                const cleanHtml = response.html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, ""); // remove scripts to reduce noise
                const doc = new DOMParser().parseFromString(cleanHtml, 'text/html');

                // Zomato search results often have <h4 class="...name...">Dish Name</h4> ... <div class="...cost...">₹199</div>
                // We will look for elements containing the dish name loosely

                // Generic Price scraping from the entire text blob of the first result card?
                // Let's try to finding the first "₹" followed by digits

                // Better: Pass link to search results
                zBox.innerHTML = `
                    <div style="font-size: 13px; color: #555;">
                        Unable to extract exact price automatically (Security restricted).
                    </div>
                    <a href="${searchUrl}" target="_blank" class="z-btn" style="background: #333; margin-top:8px;">Check Price on Zomato</a>
                 `;
            } else {
                zBox.innerHTML = 'Error checking price.';
            }
        });
    }

    // --- INIT & EVENTS ---

    function handleGlobalClick(e) {
        // Detect click on dishes
        const dishCard = e.target.closest('[data-swiggy-hooked], [data-testid="normal-dish-item"], [data-testid="recommended-dish-item"]');

        if (dishCard) {
            // Extract info
            // (Re-using parts of extraction logic from previous version, simplified)
            let title = '';
            let price = '';

            // Text Search
            const text = dishCard.innerText;
            const priceMatch = text.match(/₹\s?([\d,]+)/);
            if (priceMatch) {
                price = priceMatch[1];
                // Assume title is the first distinct line or header
                const lines = text.split('\n').filter(l => l.length > 3 && !l.includes('₹') && !l.toLowerCase().includes('add'));
                if (lines.length > 0) title = lines[0];
            }

            if (title && price) {
                if (sidebar) {
                    sidebar.classList.remove('minimized');
                    compareDish(title, price);
                }
            }
        }
    }

    // Init
    setInterval(detectRestaurant, 2000); // Check periodically for nav changes
    document.addEventListener('click', handleGlobalClick);

})();
