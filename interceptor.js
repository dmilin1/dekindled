// DeKindled - Blob URL Interceptor
// Captures blob URLs and their base64 content for extraction
(function() {
    // Guard against multiple script injection
    if (window.__dekindled && window.__dekindled._initialized) {
        console.log('[DeKindled] Interceptor already initialized, skipping duplicate injection');
        return;
    }
    
    // Create storage for blob data
    window.__dekindled = window.__dekindled || {
        blobs: [],
        blobData: new Map(), // Store actual blob content
        _initialized: true // Mark as initialized
    };
    
    console.log('[DeKindled] Initializing blob interceptor...');
    
    // Logging function
    function logBlob(type, details) {
        // Store in array for viewing
        window.__dekindled.blobs.push({ 
            type, 
            details, 
            timestamp: new Date().toISOString() 
        });
        
        // Visual indicator for blob creation
        if (type === 'Blob URL Created') {
            [...document.getElementsByClassName('dekindled-indicator')].forEach(indicator => indicator.remove());
            const indicator = document.createElement('div');
            indicator.className = 'dekindled-indicator';
            indicator.style.cssText = 'position:fixed;top:10px;left:10px;background:#d32f2f;color:white;padding:10px;z-index:999999;font-family:monospace;font-size:12px;border-radius:4px;box-shadow:0 2px 5px rgba(0,0,0,0.3);';
            indicator.textContent = '📚 DeKindled: Captured ' + (details.type || 'blob') + ' ✓';
            document.body.appendChild(indicator);
            setTimeout(() => indicator.remove(), 3000);
        }
    }
    
    // Function to read blob as base64
    async function readBlobAsBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    // Check if URL.createObjectURL is already overridden
    if (URL.createObjectURL._dekindledOverridden) {
        console.log('[DeKindled] URL.createObjectURL already overridden, skipping');
        return;
    }
    
    // Store original functions
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    
    // Override createObjectURL
    URL.createObjectURL = function(object) {
        const url = originalCreateObjectURL.apply(this, arguments);
        
        try {
            const details = {
                url: url,
                objectType: object?.constructor?.name || 'Unknown',
                size: object?.size || 0,
                type: object?.type || 'Unknown',
                timestamp: new Date().toISOString(),
                stored: false
            };
            
            // If it's a Blob, immediately read its content as base64
            if (object instanceof Blob) {
                readBlobAsBase64(object).then(base64Data => {
                    // Store the base64 data
                    window.__dekindled.blobData.set(url, {
                        base64: base64Data,
                        type: object.type,
                        size: object.size,
                        timestamp: details.timestamp
                    });
                    
                    details.stored = true;
                    console.log(`[DeKindled] Captured base64 data for ${url}:`, {
                        type: object.type,
                        size: object.size,
                        dataLength: base64Data.length
                    });
                    
                    // Update the visual indicator
                    const indicators = document.querySelectorAll('div[style*="DeKindled: Captured"]');
                    const latestIndicator = indicators[indicators.length - 1];
                    if (latestIndicator) {
                        latestIndicator.textContent = '📚 DeKindled: Captured ' + (object.type || 'blob') + ' ✓';
                        latestIndicator.style.background = '#2e7d32';
                    }
                }).catch(error => {
                    console.error('[DeKindled] Failed to read blob as base64:', error);
                });
            }
            
            logBlob('Blob URL Created', details);
        } catch (e) {
            console.error('[DeKindled] Error in createObjectURL override:', e);
            // Fallback visual alert
            const alert = document.createElement('div');
            alert.style.cssText = 'position:fixed;top:50px;left:10px;background:orange;color:black;padding:10px;z-index:999999;border-radius:4px;';
            alert.textContent = 'DeKindled: Captured blob (error logging)';
            document.body.appendChild(alert);
            setTimeout(() => alert.remove(), 3000);
        }
        
        return url;
    };
    
    // Mark the override to prevent double-overriding
    URL.createObjectURL._dekindledOverridden = true;
    
    // Override revokeObjectURL
    URL.revokeObjectURL = function(url) {
        logBlob('Blob URL Revoked', {
            url: url,
            timestamp: new Date().toISOString(),
            hadData: window.__dekindled.blobData.has(url)
        });
        
        console.log(`[DeKindled] Blob URL revoked: ${url}, had stored data: ${window.__dekindled.blobData.has(url)}`);
        
        return originalRevokeObjectURL.apply(this, arguments);
    };
    
    // Ensure overrides are set on window object
    window.URL = URL;
    if (window.webkitURL) {
        window.webkitURL = URL;
    }
    
    // Create a visible indicator that script is running
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'position:fixed;bottom:10px;right:10px;background:#1976d2;color:white;padding:5px 10px;z-index:999999;font-size:10px;border-radius:4px;';
    statusDiv.textContent = '📚 DeKindled Active';
    document.body.appendChild(statusDiv);
    
    console.log('[DeKindled] Content extraction ready - capturing base64 blob data');
})(); 