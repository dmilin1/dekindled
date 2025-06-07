# 📚 DeKindled - Chrome Extension for Base64 Blob Extraction

A Chrome extension designed to build epubs from Amazon's Kindle Reader website.

It injects into the Kindle Reader website to capture and extract base64 blob content, before the blobs get revoked.

Inspired by my desire to read the books I've purchased through [Inkwell](https://inkwell.app), an ebook reader app I built for myself.

Thanks to [Showdown](https://github.com/showdownjs/showdown) for their markdown to HTML converter.

# DeKindled Quick Start Guide

## 🚀 Getting Started with DeKindled

### 1. Install DeKindled
- Open Chrome and go to `chrome://extensions/`
- Enable "Developer mode" (top right)
- Click "Load unpacked" and select the DeKindled folder
- You should see the DeKindled extension installed

### 2. Open Your Kindle Book
- Go to [read.amazon.com](https://read.amazon.com)
- Sign in and open a book
- Look for the "📚 DeKindled Active" indicator (bottom-right corner)

### 3. Capture Content
- If the book didn't open on the first page, go to it, then reload the page.
- Click the extension icon to open the overlay.
- Click "Start Auto-Scan" and DeKindled will click through the book, capturing content as it goes.
- When the page counter at the bottom stops increasing, the scan is complete.

### 4. Convert to EPUB
- Click "Convert to EPUB" in the top right corner of the overlay
- You'll be asked for the book title and author, then your OpenAI API key
- Background processing will begin converting the images to Markdown which will then be converted to EPUB
- Once completed, a download prompt will appear

## ⚠️ Important Notes

- DeKindled captures content as it's loaded by the Kindle reader. If you go backwards or change display settings, your content will be out of order!

## ⚙️ Advanced Configuration

### 🎛️ Customizing the Analysis Prompt

DeKindled uses OpenAI's vision API to convert scanned book pages to markdown. You can customize the prompt that controls how the AI interprets and converts the content.

#### **Accessing Options:**
1. **Right-click** the DeKindled extension icon in Chrome
2. Select **"Options"** from the context menu
3. Or go to `chrome://extensions/` → DeKindled → **"Extension options"**

#### **Modifying the Analysis Prompt:**
1. In the options page, scroll to the **"Analysis Prompt"** section
2. The large text area contains the prompt sent to OpenAI for each page
3. **Edit the prompt** to customize how the AI processes book pages:
   - Change instructions for formatting (e.g., preserve indentation differently)
   - Modify chapter detection logic
   - Add specific instructions for handling tables, quotes, or special formatting
   - Adjust the tone or style of conversion

#### **Default Prompt Behavior:**
The default prompt instructs the AI to:
- Convert images to clean markdown
- Detect chapter titles and mark them with `--- NEW CHAPTER: [Title] ---`
- Handle paragraph indentation by adding line breaks
- Preserve all visible text content
- Use proper markdown formatting

#### **Resetting the Prompt:**
- Click **"Reset to Default"** to restore the original prompt
- Confirm the action to replace your custom prompt
- Changes are automatically saved

#### **Tips for Custom Prompts:**
- **Test incrementally**: Make small changes and test with a few pages
- **Keep the chapter marker**: The `--- NEW CHAPTER: [Title] ---` format is required for proper EPUB structure
- **Preserve key instructions**: Don't remove the core instruction to convert everything to markdown
- **Be specific**: Clear, detailed instructions work better than vague ones
- **Consider your content**: Tailor the prompt to the types of books you typically convert

> **⚠️ Advanced Feature**: Modifying the prompt requires understanding of how AI language models work. Incorrect prompts may result in poor conversion quality or failed processing.

# DeKindled Technical Details

## 🎯 Problem Solved

Web readers often generate blob URLs for content (like images, text) that get revoked immediately after creation. This extension:
- **Captures blob data instantly** when `URL.createObjectURL()` is called
- **Stores base64 content** before blobs get revoked
- **Provides easy download** of captured content

## ✨ Key Features

### 🚀 Real-time Base64 Capture
- Intercepts `URL.createObjectURL()` calls
- Immediately reads and stores blob content as base64
- Visual indicators show capture success/failure
- Works before blob URLs get revoked

### 💾 Persistent Storage
- Stores base64 data in memory during session
- Maps blob URLs to their base64 content
- Survives blob URL revocation
- Debug info shows storage status

### 🎨 User-friendly Interface
- Overlay viewer accessible via extension icon
- Real-time stats (captured, stored, total size)
- Storage status indicators

## 🛠️ How It Works

### 1. **Blob Interception**
```javascript
// When any page creates a blob URL:
URL.createObjectURL = function(blob) {
    const url = originalCreateObjectURL(blob);
    
    // Immediately read and store base64 data
    readBlobAsBase64(blob).then(base64Data => {
        window.__dekindled.blobData.set(url, {
            base64: base64Data,
            type: blob.type,
            size: blob.size
        });
    });
    
    return url;
}
```

### 2. **Base64 Storage**
- Uses `FileReader.readAsDataURL()` to convert blobs to base64
- Stores in a `Map` with blob URL as key
- Maintains metadata (type, size, timestamp)
- Survives blob revocation

### 3. **Smart Downloads**
- Downloads from stored base64 data when available
- Falls back to URL access if storage failed
- Batch processing for multiple files
- Proper file extensions based on MIME types

## 📦 Installation

1. **Clone this repository:**
   ```bash
   git clone https://github.com/yourusername/dekindled.git
   cd dekindled
   ```

2. **Load the extension in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dekindled` folder

3. **Grant permissions:**
   - The extension needs access to the Kindle Reader website to intercept blob creation
   - Downloads permission for saving captured content

### Files Structure
- `manifest.json` - Extension configuration
- `background.js` - Service worker for extension management
- `inject.js` - Content script injector
- `interceptor.js` - **Core blob interception and base64 storage**
- `viewer-inject.js` - **Overlay UI for managing captured content**

### Key Functions
```javascript
// Store base64 data immediately
window.__dekindled.blobData.set(url, {
    base64: dataURL,
    type: blob.type,
    size: blob.size
});

// Download from stored base64
window.__dekindled.downloadStoredBlob(url, filename);

// Download all stored content
window.__dekindled.downloadAllStored();
```

## 🧪 Testing

Use the included `test-page.html` to verify functionality:
```bash
# Open test-page.html in Chrome with extension loaded
# Should capture test blobs and show visual indicators
```

## 📈 Troubleshooting

### No Blobs Captured
- Ensure extension is active (blue indicator in bottom-right)
- Check browser console for DeKindled messages
- Try refreshing the page after enabling extension

### Storage Shows "Missing"
- Blob was created but base64 reading failed
- Check console for FileReader errors
- May indicate binary/unsupported blob type

### Downloads Fail
- Try "Try URL" button for recently created blobs
- Check if blob URL is still valid
- Verify download permissions are granted

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License

---

**Note**: This extension is designed for legitimate content preservation and so you can read your content on any device or app you choose. Buy your books and support the authors!