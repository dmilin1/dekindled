// DeKindled - Inject blob interceptor script as early as possible

console.log('[DeKindled] Injecting content interceptor...');

// Inject script tag with chrome-extension:// URL (CSP-safe)
const script = document.createElement('script');
script.src = chrome.runtime.getURL('interceptor.js');
script.type = 'text/javascript';

// Inject the script as early as possible
if (document.documentElement) {
    document.documentElement.appendChild(script);
    console.log('[DeKindled] Interceptor injected');
} else {
    // If documentElement doesn't exist yet, wait for it
    const observer = new MutationObserver((mutations, obs) => {
        if (document.documentElement) {
            document.documentElement.appendChild(script);
            console.log('[DeKindled] Interceptor injected (delayed)');
            obs.disconnect();
        }
    });
    observer.observe(document, { childList: true, subtree: true });
}

// Message bridge: Listen for custom events from main world and forward to background
window.addEventListener('dekindled-message', async (event) => {
    const { data } = event.detail;
    console.log('[DeKindled] Forwarding message to background:', data);
    
    try {
        const response = await chrome.runtime.sendMessage(data);
        
        // Send response back to main world
        window.dispatchEvent(new CustomEvent('dekindled-response', {
            detail: {
                id: event.detail.id,
                response: response
            }
        }));
    } catch (error) {
        console.error('[DeKindled] Error forwarding message:', error);
        
        // Send error back to main world
        window.dispatchEvent(new CustomEvent('dekindled-response', {
            detail: {
                id: event.detail.id,
                error: error.message
            }
        }));
    }
});

// Listen for progress messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'conversionProgress') {
        // Forward progress update to main world
        window.dispatchEvent(new CustomEvent('dekindled-progress', {
            detail: {
                current: message.current,
                total: message.total
            }
        }));
    } else if (message.action === 'conversionComplete') {
        // Forward completion notification to main world
        window.dispatchEvent(new CustomEvent('dekindled-complete', {
            detail: {
                success: message.success,
                filename: message.filename,
                error: message.error
            }
        }));
    }
});

// Fallback: Use chrome.scripting API if main injection fails
setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'injectInterceptor' }, (response) => {
        if (response && response.success) {
            console.log('[DeKindled] Interceptor injected via scripting API fallback');
        }
    });
}, 100); 