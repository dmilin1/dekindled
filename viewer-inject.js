// DeKindled - Inject blob viewer overlay into current page
(function() {
    // Check if viewer already exists
    if (document.getElementById('dekindled-viewer-overlay')) {
        document.getElementById('dekindled-viewer-overlay').style.display = 'flex';
        return;
    }

    // Current page state
    let currentPageIndex = 0;
    let pages = [];

    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = 'dekindled-viewer-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.95);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
        background: #1976d2;
        color: white;
        padding: 15px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
    `;
    header.innerHTML = `
        <div>
            <h2 style="margin: 0; font-size: 20px;">📚 DeKindled</h2>
            <p id="page-info" style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">Loading...</p>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
            <button id="dekindled-auto-scan" style="
                background: #2196f3;
                border: none;
                color: white;
                font-size: 14px;
                cursor: pointer;
                padding: 8px 16px;
                border-radius: 4px;
                font-weight: 500;
                transition: background 0.2s;
            ">Start Auto-Scan</button>
            <button id="dekindled-convert" style="
                background: #4caf50;
                border: none;
                color: white;
                font-size: 14px;
                cursor: pointer;
                padding: 8px 16px;
                border-radius: 4px;
                font-weight: 500;
                transition: background 0.2s;
            " disabled>Convert to EPUB</button>
            <button id="dekindled-close" style="
                background: transparent;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
            ">&times;</button>
        </div>
    `;

    // Create main reader area
    const readerArea = document.createElement('div');
    readerArea.style.cssText = `
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        min-height: 0;
    `;

    // Create navigation arrows
    const prevButton = document.createElement('button');
    prevButton.id = 'prev-page';
    prevButton.style.cssText = `
        position: absolute;
        left: 20px;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(255, 255, 255, 0.9);
        border: none;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        font-size: 36px;
        cursor: pointer;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.2s;
    `;
    prevButton.innerHTML = '‹';
    prevButton.onclick = () => navigatePage(-1);

    const nextButton = document.createElement('button');
    nextButton.id = 'next-page';
    nextButton.style.cssText = `
        position: absolute;
        right: 20px;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(255, 255, 255, 0.9);
        border: none;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        font-size: 36px;
        cursor: pointer;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.2s;
    `;
    nextButton.innerHTML = '›';
    nextButton.onclick = () => navigatePage(1);

    // Create page display area
    const pageDisplay = document.createElement('div');
    pageDisplay.id = 'page-display';
    pageDisplay.style.cssText = `
        width: calc(100vw - 160px);
        height: calc(100vh - 140px);
        max-width: 1200px;
        max-height: 800px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: white;
        border-radius: 8px;
        box-shadow: 0 10px 50px rgba(0, 0, 0, 0.5);
        overflow: hidden;
        margin: 0 auto;
    `;

    // Create page image
    const pageImage = document.createElement('img');
    pageImage.id = 'current-page-image';
    pageImage.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        background: white;
    `;

    // Create footer with page controls
    const footer = document.createElement('div');
    footer.style.cssText = `
        background: #333;
        color: white;
        padding: 10px 20px;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 20px;
        flex-shrink: 0;
    `;

    const pageSlider = document.createElement('input');
    pageSlider.type = 'range';
    pageSlider.id = 'page-slider';
    pageSlider.style.cssText = `
        flex: 1;
        max-width: 400px;
        height: 6px;
        background: #555;
        border-radius: 3px;
        outline: none;
    `;
    pageSlider.oninput = (e) => {
        currentPageIndex = parseInt(e.target.value);
        displayCurrentPage();
    };

    const pageCounter = document.createElement('div');
    pageCounter.id = 'page-counter';
    pageCounter.style.cssText = `
        min-width: 120px;
        text-align: center;
        font-size: 14px;
        font-family: monospace;
    `;

    footer.appendChild(pageSlider);
    footer.appendChild(pageCounter);

    // Assemble the reader
    pageDisplay.appendChild(pageImage);
    readerArea.appendChild(prevButton);
    readerArea.appendChild(pageDisplay);
    readerArea.appendChild(nextButton);
    overlay.appendChild(header);
    overlay.appendChild(readerArea);
    overlay.appendChild(footer);
    document.body.appendChild(overlay);

    // Navigation function
    function navigatePage(direction) {
        if (pages.length === 0) return;
        
        currentPageIndex += direction;
        if (currentPageIndex < 0) currentPageIndex = 0;
        if (currentPageIndex >= pages.length) currentPageIndex = pages.length - 1;
        
        displayCurrentPage();
    }

    // Display current page
    function displayCurrentPage() {
        if (pages.length === 0) {
            pageImage.style.display = 'none';
            document.getElementById('page-info').textContent = 'No pages captured';
            document.getElementById('page-counter').textContent = '0 / 0';
            prevButton.style.display = 'none';
            nextButton.style.display = 'none';
            pageSlider.style.display = 'none';
            
            // Disable convert button when no pages
            const convertBtn = document.getElementById('dekindled-convert');
            convertBtn.disabled = true;
            convertBtn.style.background = '#ccc';
            convertBtn.style.cursor = 'not-allowed';
            return;
        }

        const currentPage = pages[currentPageIndex];
        
        // Update image
        pageImage.src = currentPage.data.base64;
        
        // Update page info
        const isImage = currentPage.data.type && currentPage.data.type.startsWith('image/');
        document.getElementById('page-info').innerHTML = `
            Page ${currentPageIndex + 1} of ${pages.length} • 
            ${currentPage.data.type} • 
            ${formatSize(currentPage.data.size)} • 
            ${new Date(currentPage.data.timestamp).toLocaleTimeString()}
        `;
        
        // Update page counter
        document.getElementById('page-counter').textContent = `${currentPageIndex + 1} / ${pages.length}`;
        
        // Update slider
        pageSlider.max = pages.length - 1;
        pageSlider.value = currentPageIndex;
        
        // Show/hide navigation buttons
        prevButton.style.opacity = currentPageIndex > 0 ? '1' : '0.3';
        nextButton.style.opacity = currentPageIndex < pages.length - 1 ? '1' : '0.3';
        prevButton.style.cursor = currentPageIndex > 0 ? 'pointer' : 'default';
        nextButton.style.cursor = currentPageIndex < pages.length - 1 ? 'pointer' : 'default';
        
        // Enable convert button when pages are available
        const convertBtn = document.getElementById('dekindled-convert');
        convertBtn.disabled = false;
        convertBtn.style.background = '#4caf50';
        convertBtn.style.cursor = 'pointer';
    }

    // Load pages from blobData
    function loadPages() {
        const dekindled = window.__dekindled;
        if (!dekindled || !dekindled.blobData) {
            pages = [];
            displayCurrentPage();
            return;
        }

        // Convert blobData Map to array, maintaining order
        const newPages = Array.from(dekindled.blobData.entries()).map(([url, data]) => ({
            url,
            data
        }));

        // Only update if pages have actually changed
        const pagesChanged = pages.length !== newPages.length || 
            pages.some((page, index) => page.url !== newPages[index]?.url);

        if (pagesChanged) {
            const previousPageCount = pages.length;
            pages = newPages;
            
            // Preserve current page index if possible
            if (previousPageCount === 0) {
                // First load - start at first page
                currentPageIndex = 0;
            } else if (currentPageIndex >= pages.length) {
                // Current page is out of bounds - go to last page
                currentPageIndex = Math.max(0, pages.length - 1);
            }
            // Otherwise keep the current page index
            
            displayCurrentPage();
        }
    }

    // Close function
    function closeOverlay() {
        // Stop auto-scanning if active
        stopAutoScan();
        overlay.style.display = 'none';
    }

    // Message bridge to communicate with content script
    function sendMessageToBackground(message) {
        return new Promise((resolve, reject) => {
            const messageId = Math.random().toString(36).substr(2, 9);
            
            // Listen for response
            const responseHandler = (event) => {
                if (event.detail.id === messageId) {
                    window.removeEventListener('dekindled-response', responseHandler);
                    if (event.detail.error) {
                        reject(new Error(event.detail.error));
                    } else {
                        resolve(event.detail.response);
                    }
                }
            };
            
            window.addEventListener('dekindled-response', responseHandler);
            
            // Send message
            window.dispatchEvent(new CustomEvent('dekindled-message', {
                detail: {
                    id: messageId,
                    data: message
                }
            }));
            
            // Timeout after 10 seconds (only waiting for acknowledgment, not full conversion)
            setTimeout(() => {
                window.removeEventListener('dekindled-response', responseHandler);
                reject(new Error('Message timeout'));
            }, 10000); // Reduced to 10 seconds since we only wait for acknowledgment
        });
    }

    // Show book metadata dialog
    function showBookMetadataDialog() {
        return new Promise((resolve, reject) => {
            // Create modal overlay
            const modalOverlay = document.createElement('div');
            modalOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                z-index: 1000000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            
            // Create modal dialog
            const modal = document.createElement('div');
            modal.style.cssText = `
                background: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 10px 50px rgba(0, 0, 0, 0.5);
                min-width: 400px;
                max-width: 500px;
            `;
            
            // Get current page title as default
            const defaultTitle = document.title.replace(/\s*-\s*Kindle.*$/i, '').trim() || 'DeKindled Book';
            
            modal.innerHTML = `
                <h2 style="margin: 0 0 20px 0; color: #1976d2;">📚 Book Information</h2>
                <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">
                    Please enter the book details for your EPUB file:
                </p>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">Title:</label>
                    <input type="text" id="book-title-input" value="${defaultTitle}" style="
                        width: 100%;
                        padding: 10px;
                        border: 2px solid #ddd;
                        border-radius: 4px;
                        font-size: 14px;
                        box-sizing: border-box;
                    ">
                </div>
                
                <div style="margin-bottom: 30px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">Author:</label>
                    <input type="text" id="book-author-input" placeholder="Enter author name" style="
                        width: 100%;
                        padding: 10px;
                        border: 2px solid #ddd;
                        border-radius: 4px;
                        font-size: 14px;
                        box-sizing: border-box;
                    ">
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="modal-cancel" style="
                        background: #6c757d;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: background 0.2s;
                    ">Cancel</button>
                    <button id="modal-ok" style="
                        background: #1976d2;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        transition: background 0.2s;
                    ">Start Conversion</button>
                </div>
            `;
            
            modalOverlay.appendChild(modal);
            document.body.appendChild(modalOverlay);
            
            // Focus on title input
            const titleInput = modal.querySelector('#book-title-input');
            titleInput.focus();
            titleInput.select();
            
            // Handle button clicks
            modal.querySelector('#modal-cancel').onclick = () => {
                document.body.removeChild(modalOverlay);
                reject(new Error('User cancelled'));
            };
            
            modal.querySelector('#modal-ok').onclick = () => {
                const title = modal.querySelector('#book-title-input').value.trim();
                const author = modal.querySelector('#book-author-input').value.trim();
                
                if (!title) {
                    alert('Please enter a book title.');
                    return;
                }
                
                document.body.removeChild(modalOverlay);
                resolve({ title, author: author || 'Unknown Author' });
            };
            
            // Handle Enter key
            const handleKeydown = (e) => {
                if (e.key === 'Enter') {
                    modal.querySelector('#modal-ok').click();
                } else if (e.key === 'Escape') {
                    modal.querySelector('#modal-cancel').click();
                }
            };
            
            modal.querySelector('#book-title-input').addEventListener('keydown', handleKeydown);
            modal.querySelector('#book-author-input').addEventListener('keydown', handleKeydown);

            // Add hover effects
            const cancelBtn = modal.querySelector('#modal-cancel');
            const okBtn = modal.querySelector('#modal-ok');
            
            cancelBtn.onmouseenter = () => cancelBtn.style.background = '#5a6268';
            cancelBtn.onmouseleave = () => cancelBtn.style.background = '#6c757d';
            
            okBtn.onmouseenter = () => okBtn.style.background = '#1565c0';
            okBtn.onmouseleave = () => okBtn.style.background = '#1976d2';
        });
    }

    // Conversion function
    async function convertToEpub() {
        const convertBtn = document.getElementById('dekindled-convert');
        const originalText = convertBtn.textContent;
        const pageInfo = document.getElementById('page-info');
        const originalPageInfo = pageInfo.innerHTML;
        
        try {
            // Update button to show progress
            convertBtn.disabled = true;
            convertBtn.textContent = 'Starting Conversion...';
            convertBtn.style.background = '#ff9800';
            
            // Show book metadata dialog first
            let bookMetadata;
            try {
                bookMetadata = await showBookMetadataDialog();
            } catch (dialogError) {
                // User cancelled the dialog
                convertBtn.textContent = originalText;
                convertBtn.style.background = '#4caf50';
                convertBtn.disabled = false;
                return;
            }
            
            // Prepare the pages data
            const pagesData = pages.map((page, index) => ({
                index: index + 1,
                base64: page.data.base64,
                type: page.data.type,
                size: page.data.size
            }));
            
            convertBtn.textContent = 'Sending Pages...';
            pageInfo.innerHTML = '<strong>📤 Sending pages to background process...</strong>';
            
            // Send pages in chunks to avoid message size limits
            const CHUNK_SIZE = 5; // Send 5 pages at a time
            const chunks = [];
            for (let i = 0; i < pagesData.length; i += CHUNK_SIZE) {
                chunks.push(pagesData.slice(i, i + CHUNK_SIZE));
            }
            
            console.log(`[DeKindled] Sending ${pagesData.length} pages in ${chunks.length} chunks of max ${CHUNK_SIZE} pages each`);
            
            // Send initial message to start the conversion process
            const initResponse = await sendMessageToBackground({
                action: 'initEpubConversion',
                totalPages: pagesData.length,
                totalChunks: chunks.length,
                bookTitle: bookMetadata.title,
                bookAuthor: bookMetadata.author
            });
            
            if (!initResponse.success) {
                throw new Error(initResponse.error || 'Failed to initialize conversion');
            }
            
            const conversionId = initResponse.conversionId;
            console.log(`[DeKindled] Conversion initialized with ID: ${conversionId}`);
            
            // Send chunks one by one
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                convertBtn.textContent = `Sending Chunk ${i + 1}/${chunks.length}...`;
                pageInfo.innerHTML = `<strong>📤 Sending chunk ${i + 1} of ${chunks.length}</strong> (${chunk.length} pages)`;
                
                const chunkResponse = await sendMessageToBackground({
                    action: 'sendPagesChunk',
                    conversionId: conversionId,
                    chunkIndex: i,
                    totalChunks: chunks.length,
                    pages: chunk
                });
                
                if (!chunkResponse.success) {
                    throw new Error(chunkResponse.error || `Failed to send chunk ${i + 1}`);
                }
                
                console.log(`[DeKindled] Successfully sent chunk ${i + 1}/${chunks.length}`);
                
                // Small delay to prevent overwhelming the background script
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Start processing once all chunks are sent
            convertBtn.textContent = 'Starting Processing...';
            pageInfo.innerHTML = '<strong>🔄 All pages sent, starting conversion...</strong>';
            
            const processResponse = await sendMessageToBackground({
                action: 'startEpubProcessing',
                conversionId: conversionId
            });
            
            if (!processResponse.success) {
                throw new Error(processResponse.error || 'Failed to start processing');
            }
            
            console.log('[DeKindled] All chunks sent successfully, processing started');
            // Progress and completion will be handled by event listeners
            
        } catch (error) {
            console.error('Conversion startup error:', error);
            convertBtn.textContent = 'Failed to Start ❌';
            convertBtn.style.background = '#d32f2f';
            pageInfo.innerHTML = `<strong>❌ Startup Error:</strong> ${error.message}`;
            setTimeout(() => {
                convertBtn.textContent = originalText;
                convertBtn.style.background = '#4caf50';
                convertBtn.disabled = false;
                pageInfo.innerHTML = originalPageInfo;
            }, 3000);
        }
    }

    // Auto-scan functionality
    let autoScanInterval = null;
    let isAutoScanning = false;

    function startAutoScan() {
        if (isAutoScanning) return;
        
        isAutoScanning = true;
        const autoScanBtn = document.getElementById('dekindled-auto-scan');
        autoScanBtn.textContent = 'Stop Auto-Scan';
        autoScanBtn.style.background = '#f44336';
        
        console.log('[DeKindled] Starting auto-scan...');
        
        autoScanInterval = setInterval(() => {
            try {
                // Try to find the right navigation element
                const rightChevron = document.querySelector('.kr-chevron-container-right');
                if (rightChevron) {
                    // Dispatch synthetic keyboard event
                    rightChevron.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'ArrowRight',
                        code: 'ArrowRight',
                        keyCode: 39,
                        which: 39,
                        bubbles: true,
                        cancelable: true,
                    }));
                    console.log('[DeKindled] Auto-scan: navigated to next page');
                } else {
                    console.warn('[DeKindled] Auto-scan: could not find navigation element');
                }
            } catch (error) {
                console.error('[DeKindled] Auto-scan error:', error);
            }
        }, 300);
    }

    function stopAutoScan() {
        if (!isAutoScanning) return;
        
        isAutoScanning = false;
        if (autoScanInterval) {
            clearInterval(autoScanInterval);
            autoScanInterval = null;
        }
        
        const autoScanBtn = document.getElementById('dekindled-auto-scan');
        autoScanBtn.textContent = 'Start Auto-Scan';
        autoScanBtn.style.background = '#2196f3';
        
        console.log('[DeKindled] Auto-scan stopped');
    }

    function toggleAutoScan() {
        if (isAutoScanning) {
            stopAutoScan();
        } else {
            startAutoScan();
        }
    }

    // Event handlers
    document.getElementById('dekindled-close').onclick = closeOverlay;
    document.getElementById('dekindled-convert').onclick = convertToEpub;
    document.getElementById('dekindled-auto-scan').onclick = toggleAutoScan;

    // Keyboard navigation
    const keyHandler = (e) => {
        if (overlay.style.display === 'none') return;
        
        // Don't interfere with input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        switch(e.key) {
            case 'Escape':
                closeOverlay();
                break;
            case ' ':
            case 'Spacebar':
                e.preventDefault();
                toggleAutoScan();
                break;
        }
    };
    document.addEventListener('keydown', keyHandler);
    overlay._keyHandler = keyHandler;

    // Global functions
    window.__dekindledRefresh = function() {
        loadPages();
    };

    function formatSize(size) {
        if (!size || size === 'Unknown') return 'Unknown';
        const bytes = parseInt(size);
        if (isNaN(bytes)) return size;
        
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // Initial load
    loadPages();

    // Auto-refresh every 2 seconds to pick up new pages
    setInterval(loadPages, 2000);
    
    // Listen for conversion progress updates
    window.addEventListener('dekindled-progress', (event) => {
        const { current, total } = event.detail;
        
        // Update the UI with progress
        const convertBtn = document.getElementById('dekindled-convert');
        const pageInfo = document.getElementById('page-info');
        
        if (convertBtn && (convertBtn.textContent.includes('Converting') || convertBtn.textContent.includes('Starting'))) {
            convertBtn.textContent = `Converting Page ${current}/${total}...`;
            pageInfo.innerHTML = `<strong>🔄 Converting Page ${current} of ${total}</strong> • Please wait...`;
        }
    });
    
    // Listen for conversion completion
    window.addEventListener('dekindled-complete', (event) => {
        const { success, filename, error } = event.detail;
        
        const convertBtn = document.getElementById('dekindled-convert');
        const pageInfo = document.getElementById('page-info');
        const originalText = 'Convert to EPUB';
        
        // Only handle if we're currently converting
        if (convertBtn && convertBtn.disabled) {
            if (success) {
                convertBtn.textContent = 'Conversion Complete! ✅';
                convertBtn.style.background = '#2e7d32';
                pageInfo.innerHTML = `<strong>✅ EPUB Generated:</strong> ${filename}`;
                setTimeout(() => {
                    convertBtn.textContent = originalText;
                    convertBtn.style.background = '#4caf50';
                    convertBtn.disabled = false;
                    const currentPage = pages[currentPageIndex];
                    if (currentPage) {
                        pageInfo.innerHTML = `
                            Page ${currentPageIndex + 1} of ${pages.length} • 
                            ${currentPage.data.type} • 
                            ${formatSize(currentPage.data.size)} • 
                            ${new Date(currentPage.data.timestamp).toLocaleTimeString()}
                        `;
                    }
                }, 5000);
            } else {
                convertBtn.textContent = 'Conversion Failed ❌';
                convertBtn.style.background = '#d32f2f';
                pageInfo.innerHTML = `<strong>❌ Conversion Error:</strong> ${error}`;
                setTimeout(() => {
                    convertBtn.textContent = originalText;
                    convertBtn.style.background = '#4caf50';
                    convertBtn.disabled = false;
                    const currentPage = pages[currentPageIndex];
                    if (currentPage) {
                        pageInfo.innerHTML = `
                            Page ${currentPageIndex + 1} of ${pages.length} • 
                            ${currentPage.data.type} • 
                            ${formatSize(currentPage.data.size)} • 
                            ${new Date(currentPage.data.timestamp).toLocaleTimeString()}
                        `;
                    }
                }, 5000);
            }
        }
    });
})(); 