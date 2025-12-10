// Flipkart Content Script - Compare with Amazon.in
(function () {
    'use strict';

    let comparisonPanel = null;
    let productInfo = null;

    // Extract product information from Flipkart page
    function extractProductInfo() {
        try {
            // Product title
            const titleElement = document.querySelector('.KzDlHZ, .wjcEIp, span.B_NuCI, h1[class*="yhB1nd"]');
            const title = titleElement?.textContent?.trim() || '';

            // Price
            const priceElement = document.querySelector('div.Nx9bqj, div.CxhGGd, div._30jeq3, ._16Jk6d, [class*="price"]');
            const priceText = priceElement?.textContent?.trim() || '';
            const price = parsePrice(priceText);

            // Image
            const imageElement = document.querySelector('img.DByuf4, img._396cs4, img[class*="product-image"]');
            const image = imageElement?.src || imageElement?.getAttribute('data-src') || '';

            // Rating
            const ratingElement = document.querySelector('div.XQDdHH, div._3LWZlK, [class*="rating"]');
            const ratingText = ratingElement?.textContent?.trim() || '';
            const rating = parseRating(ratingText);

            // Reviews count
            const reviewsElement = document.querySelector('span.Wphh3N, span._2_R_DZ, [class*="reviews"]');
            const reviewsText = reviewsElement?.textContent?.trim() || '';
            const reviewsCount = parseReviewsCount(reviewsText);

            // Brand
            const brandElement = document.querySelector('span.G6XhRU, [class*="brand"]');
            const brand = brandElement?.textContent?.trim() || '';

            return {
                title,
                price,
                currency: 'INR',
                image,
                rating,
                reviewsCount,
                brand,
                url: window.location.href
            };
        } catch (error) {
            console.error('Error extracting product info:', error);
            return null;
        }
    }

    function parsePrice(text) {
        const match = text.match(/[\d,]+\.?\d*/);
        return match ? parseFloat(match[0].replace(/,/g, '')) : null;
    }

    function parseRating(text) {
        const match = text.match(/(\d+\.?\d*)/);
        return match ? parseFloat(match[0]) : null;
    }

    function parseReviewsCount(text) {
        const match = text.match(/([\d,]+)/);
        return match ? parseInt(match[0].replace(/,/g, '')) : 0;
    }

    // Create comparison panel
    function createComparisonPanel() {
        if (comparisonPanel) return;

        comparisonPanel = document.createElement('div');
        comparisonPanel.id = 'price-compare-panel';
        comparisonPanel.innerHTML = `
            <div class="compare-header">
                <h3>💰 Price Comparison</h3>
                <button class="close-btn" id="closeCompare">×</button>
            </div>
            <div class="compare-content" id="compareContent">
                <div class="current-product">
                    <h4>Flipkart</h4>
                    <div id="flipkartProduct"></div>
                </div>
                <div class="comparison-divider">vs</div>
                <div class="other-products">
                    <h4>Amazon.in</h4>
                    <div id="amazonResults">
                        <p class="loading">Searching Amazon.in...</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(comparisonPanel);

        document.getElementById('closeCompare').addEventListener('click', () => {
            comparisonPanel.style.display = 'none';
        });
    }

    // Display Flipkart product
    function displayFlipkartProduct(product) {
        const flipkartDiv = document.getElementById('flipkartProduct');
        flipkartDiv.innerHTML = `
            <div class="product-card flipkart">
                ${product.image ? `<img src="${product.image}" alt="${product.title}">` : ''}
                <div class="product-details">
                    <h5>${product.title}</h5>
                    ${product.brand ? `<p class="brand">Brand: ${product.brand}</p>` : ''}
                    <div class="product-meta">
                        ${product.price ? `<span class="price">₹${product.price.toLocaleString()}</span>` : '<span class="price">Price not available</span>'}
                        ${product.rating ? `<span class="rating">⭐ ${product.rating}</span>` : ''}
                        ${product.reviewsCount ? `<span class="reviews">(${product.reviewsCount} reviews)</span>` : ''}
                    </div>
                    <a href="${product.url}" target="_blank" class="view-btn">View on Flipkart →</a>
                </div>
            </div>
        `;
    }

    // Search Amazon for similar product and fetch top result
    async function searchAmazon(product) {
        const amazonDiv = document.getElementById('amazonResults');
        amazonDiv.innerHTML = '<p class="loading">🔍 Searching Amazon.in...</p>';

        try {
            // Extract search keywords from product title
            const searchQuery = extractSearchKeywords(product.title, product.brand);
            const amazonUrl = `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`;

            // Use background script to fetch (avoids CORS issues)
            chrome.runtime.sendMessage({
                action: 'fetchAmazon',
                url: amazonUrl
            }, (response) => {
                if (response && response.success && response.html) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.html, 'text/html');

                    // Extract top product from Amazon search results
                    const topProduct = extractTopAmazonProduct(doc, amazonUrl);

                    if (topProduct) {
                        displayAmazonProduct(topProduct, amazonDiv);
                    } else {
                        amazonDiv.innerHTML = `
                            <div class="search-info">
                                <p class="error">No matching product found on Amazon.in</p>
                                <a href="${amazonUrl}" target="_blank" class="search-link">View all results on Amazon.in →</a>
                            </div>
                        `;
                    }
                } else {
                    // Fallback to link if fetch fails
                    amazonDiv.innerHTML = `
                        <div class="error">
                            <p>Could not fetch Amazon results automatically.</p>
                            <a href="${amazonUrl}" target="_blank" class="search-link">Search on Amazon.in →</a>
                        </div>
                    `;
                }
            });
        } catch (error) {
            console.error('Error searching Amazon:', error);
            const searchQuery = extractSearchKeywords(product.title, product.brand);
            const amazonUrl = `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`;
            amazonDiv.innerHTML = `
                <div class="error">
                    <p>Could not fetch Amazon results automatically.</p>
                    <a href="${amazonUrl}" target="_blank" class="search-link">Search on Amazon.in →</a>
                </div>
            `;
        }
    }

    // Extract top product from Amazon search results
    function extractTopAmazonProduct(doc, baseUrl) {
        try {
            // Try multiple selectors for Amazon product cards
            const productSelectors = [
                '[data-component-type="s-search-result"]',
                '.s-result-item',
                '[data-asin]',
                '.s-card-container'
            ];

            let productElement = null;
            for (const selector of productSelectors) {
                const elements = doc.querySelectorAll(selector);
                if (elements.length > 0) {
                    // STRICTLY pick the first one, even if sponsored, as requested "first result"
                    productElement = elements[0];
                    break;
                }
            }

            if (!productElement) return null;

            // Extract product details
            const titleElement = productElement.querySelector('h2 a span, h2 a, [data-cy="title-recipe-title"] span');
            const title = titleElement?.textContent?.trim() || '';

            const priceElement = productElement.querySelector('.a-price .a-offscreen, .a-price-whole, .a-price-range .a-offscreen, span.a-price span.a-offscreen');
            const priceText = priceElement?.textContent?.trim() || '';
            const price = parsePrice(priceText);

            const imageElement = productElement.querySelector('img, img.s-image');
            const image = imageElement?.src || imageElement?.getAttribute('data-src') || '';

            const ratingElement = productElement.querySelector('.a-icon-alt, [data-cy="review-star-rating"]');
            const ratingText = ratingElement?.textContent?.trim() || '';
            const rating = parseRating(ratingText);

            const reviewsElement = productElement.querySelector('.a-size-base, [data-cy="review-count"]');
            const reviewsText = reviewsElement?.textContent?.trim() || '';
            const reviewsCount = parseReviewsCount(reviewsText);

            // Get product link
            const linkElement = productElement.querySelector('h2 a, [data-cy="title-recipe-title"] a');
            let productUrl = '';
            if (linkElement) {
                const href = linkElement.getAttribute('href');
                productUrl = href.startsWith('http') ? href : `https://www.amazon.in${href}`;
            }

            if (!title) return null;

            return {
                title: title.substring(0, 150),
                price,
                currency: 'INR',
                image,
                rating,
                reviewsCount,
                url: productUrl || baseUrl
            };
        } catch (error) {
            console.error('Error extracting Amazon product:', error);
            return null;
        }
    }

    // Display Amazon product result
    function displayAmazonProduct(product, container) {
        container.innerHTML = `
            <div class="product-card amazon">
                ${product.image ? `<img src="${product.image}" alt="${product.title}" onerror="this.style.display='none'">` : ''}
                <div class="product-details">
                    <h5>${product.title}</h5>
                    <div class="product-meta">
                        ${product.price ? `<span class="price">₹${product.price.toLocaleString()}</span>` : '<span class="price">Price not available</span>'}
                        ${product.rating ? `<span class="rating">⭐ ${product.rating}</span>` : ''}
                        ${product.reviewsCount ? `<span class="reviews">(${product.reviewsCount} reviews)</span>` : ''}
                    </div>
                    ${product.url ? `<a href="${product.url}" target="_blank" class="view-btn">View on Amazon.in →</a>` : ''}
                </div>
            </div>
        `;
    }

    function extractSearchKeywords(title, brand) {
        // Remove common words and keep important keywords
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        let keywords = title.toLowerCase().split(/\s+/);

        if (brand) {
            keywords = [brand.toLowerCase(), ...keywords];
        }

        return keywords
            .filter(word => word.length > 2 && !stopWords.includes(word))
            .slice(0, 5)
            .join(' ');
    }

    // Initialize comparison
    function initComparison() {
        productInfo = extractProductInfo();

        if (!productInfo || !productInfo.title) {
            console.log('Could not extract product information');
            return;
        }

        createComparisonPanel();
        comparisonPanel.style.display = 'block';

        displayFlipkartProduct(productInfo);
        searchAmazon(productInfo);
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'showComparison') {
            initComparison();
        }
    });

    // Auto-detect product page and show comparison button
    function addCompareButton() {
        // Check if we're on a product page
        if (!document.querySelector('.KzDlHZ, .wjcEIp, span.B_NuCI, h1[class*="yhB1nd"]')) return;

        // Check if button already exists
        if (document.getElementById('priceCompareBtn')) return;

        const button = document.createElement('button');
        button.id = 'priceCompareBtn';
        button.className = 'price-compare-btn';
        button.type = 'button'; // Prevent form submission
        button.innerHTML = '💰 Compare Prices';
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            initComparison();
        });

        // Try to insert near price first (User Request)
        const priceSelectors = [
            'div._30jeq3',
            '._16Jk6d',
            'div[class*="price"]'
        ];

        for (const selector of priceSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                // Check if valid price element and visible
                if (el.offsetParent !== null && el.textContent.includes('₹')) {
                    el.parentElement.insertBefore(button, el.nextSibling);
                    return;
                }
            }
        }

        // Try to insert near buy button as fallback
        const buyBox = document.querySelector('._1YokD2, [class*="buyBox"]');
        if (buyBox) {
            buyBox.insertBefore(button, buyBox.firstChild);
        } else {
            // Fallback: add to body if nothing else found (rare)
            const title = document.querySelector('span.B_NuCI, h1[class*="yhB1nd"]');
            if (title) {
                title.parentElement.insertBefore(button, title.nextSibling);
            }
        }
    }

    // Initialize
    function init() {
        // Wait a bit for page to fully load
        setTimeout(() => {
            // Add button
            addCompareButton();

            // Auto-popup: Check if it's a product page by seeing if we can extract info
            const info = extractProductInfo();
            if (info && info.title) {
                initComparison();
            }
        }, 1000);
    }

    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Also run on navigation (SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            // Clear existing panel if any before re-initializing
            if (comparisonPanel) {
                comparisonPanel.remove();
                comparisonPanel = null;
            }
            setTimeout(init, 1000);
        }
    }).observe(document, { subtree: true, childList: true });
})();

