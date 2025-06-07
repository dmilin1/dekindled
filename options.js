// DeKindled Options Page Script

// DOM elements
const apiKeyInput = document.getElementById('apiKey');
const bookTitleInput = document.getElementById('bookTitle');
const analysisPromptInput = document.getElementById('analysisPrompt');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const resetPromptBtn = document.getElementById('resetPromptBtn');
const status = document.getElementById('status');
const apiKeyStatus = document.getElementById('apiKeyStatus');

// Default prompt value
const DEFAULT_ANALYSIS_PROMPT = `You are a book preservation assistant. Your job is to look at scanned images of books and rewrite them as markdown. You will be provided with a page from a book. Your job is to convert the page into valid markdown. We don't want to lose any data, so make sure to include all the text you see in the image.

Indentations should be handled by adding a new line between paragraphs. Do not add indents. If multiple indents appear in a row, they should have gaps between them.
--- example ---
"Character A talking," he said.

"Character B talking," she said. "This is more stuff that is said"

"Well that makes sense," he replied.

Now here's more text in a big long paragraph.
--- end example ---

Important! If you notice the page has a chapter title, write the following to mark the start of a new chapter (Exclude the brackets):

--- NEW CHAPTER: [Chapter Title] ---

# Chapter Number if it exists
Chapter Title`;

// Load saved settings
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(['openaiApiKey', 'defaultBookTitle', 'analysisPrompt']);
        
        if (result.openaiApiKey) {
            apiKeyInput.value = result.openaiApiKey;
            apiKeyStatus.textContent = '✓ API key saved';
            apiKeyStatus.className = 'api-key-status valid';
            testBtn.disabled = false;
        }
        
        if (result.defaultBookTitle) {
            bookTitleInput.value = result.defaultBookTitle;
        }
        
        // Load analysis prompt or use default
        analysisPromptInput.value = result.analysisPrompt || DEFAULT_ANALYSIS_PROMPT;
        
    } catch (error) {
        showStatus('Error loading settings: ' + error.message, 'error');
    }
}

// Save settings
async function saveSettings() {
    try {
        const settings = {
            openaiApiKey: apiKeyInput.value.trim(),
            defaultBookTitle: bookTitleInput.value.trim() || 'DeKindled Book',
            analysisPrompt: analysisPromptInput.value.trim() || DEFAULT_ANALYSIS_PROMPT
        };
        
        await chrome.storage.sync.set(settings);
        
        if (settings.openaiApiKey) {
            apiKeyStatus.textContent = '✓ API key saved';
            apiKeyStatus.className = 'api-key-status valid';
            testBtn.disabled = false;
        } else {
            apiKeyStatus.textContent = '';
            testBtn.disabled = true;
        }
        
        showStatus('Settings saved successfully!', 'success');
    } catch (error) {
        showStatus('Error saving settings: ' + error.message, 'error');
    }
}

// Test API key
async function testApiKey() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
        showStatus('Please enter an API key first', 'error');
        return;
    }
    
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const hasVisionModel = data.data.some(model => 
                model.id.includes('gpt-4-vision') || model.id.includes('gpt-4o')
            );
            
            if (hasVisionModel) {
                showStatus('✅ API key is valid and has access to vision models!', 'success');
                apiKeyStatus.textContent = '✓ API key verified';
                apiKeyStatus.className = 'api-key-status valid';
            } else {
                showStatus('⚠️ API key is valid but may not have access to vision models. Check your OpenAI plan.', 'error');
            }
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }
    } catch (error) {
        showStatus('❌ API key test failed: ' + error.message, 'error');
        apiKeyStatus.textContent = '✗ API key invalid';
        apiKeyStatus.className = 'api-key-status invalid';
    } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Test API Key';
    }
}

// Show status message
function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    }
}

// Reset analysis prompt to default
function resetPrompt() {
    if (confirm('Are you sure you want to reset the analysis prompt to default? This will overwrite your current prompt.')) {
        analysisPromptInput.value = DEFAULT_ANALYSIS_PROMPT;
        saveSettings(); // Auto-save after reset
        showStatus('Analysis prompt reset to default!', 'success');
    }
}

// Event listeners
saveBtn.addEventListener('click', saveSettings);
testBtn.addEventListener('click', testApiKey);
resetPromptBtn.addEventListener('click', resetPrompt);

// Enable test button when API key is entered
apiKeyInput.addEventListener('input', () => {
    testBtn.disabled = !apiKeyInput.value.trim();
});

// Auto-save book title
bookTitleInput.addEventListener('blur', saveSettings);

// Auto-save analysis prompt
analysisPromptInput.addEventListener('blur', saveSettings);

// Load settings on page load
document.addEventListener('DOMContentLoaded', loadSettings); 