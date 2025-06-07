// DeKindled - Background service worker

// Import ZIP utility and Showdown
importScripts('zip-utils.js');
importScripts('showdown.min.js');

// Extension installed/updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('DeKindled Extension Installed/Updated');
  console.log('Ready to extract content from web readers.');
});

// Conversion state management
const activeConversions = new Map();

// Log when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  console.log('DeKindled icon clicked on tab:', tab.url);
  
  // Inject the viewer overlay into the current tab
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['viewer-inject.js'],
    world: 'MAIN'
  }).then(() => {
    console.log('DeKindled viewer overlay injected');
  }).catch(error => {
    console.error('Failed to inject viewer:', error);
    // Fallback: open blob-viewer.html if injection fails
    chrome.tabs.create({
      url: chrome.runtime.getURL('blob-viewer.html'),
      index: tab.index + 1
    });
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'blobCaptured') {
    console.log(`[DeKindled] Content captured from ${sender.tab?.url || 'unknown'}`);
    sendResponse({ received: true });
  } else if (message.action === 'initEpubConversion') {
    handleInitEpubConversion(message, sender, sendResponse);
    return true; // Keep sendResponse callback alive for async operation
  } else if (message.action === 'sendPagesChunk') {
    handleSendPagesChunk(message, sender, sendResponse);
    return true; // Keep sendResponse callback alive for async operation
  } else if (message.action === 'startEpubProcessing') {
    handleStartEpubProcessing(message, sender, sendResponse);
    return true; // Keep sendResponse callback alive for async operation
  }
  return false;
});

// Handle initialization of EPUB conversion
async function handleInitEpubConversion(message, sender, sendResponse) {
  try {
    const conversionId = generateUUID();
    
    // Initialize conversion state
    activeConversions.set(conversionId, {
      id: conversionId,
      tabId: sender.tab.id,
      bookTitle: message.bookTitle,
      bookAuthor: message.bookAuthor,
      totalPages: message.totalPages,
      totalChunks: message.totalChunks,
      receivedChunks: 0,
      pages: [],
      status: 'initialized',
      timestamp: Date.now()
    });
    
    console.log(`[DeKindled] Initialized conversion ${conversionId} for "${message.bookTitle}" with ${message.totalPages} pages in ${message.totalChunks} chunks`);
    
    sendResponse({ 
      success: true, 
      conversionId: conversionId,
      message: 'Conversion initialized successfully'
    });
  } catch (error) {
    console.error('[DeKindled] Error initializing conversion:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

// Handle receiving pages chunks
async function handleSendPagesChunk(message, sender, sendResponse) {
  try {
    const { conversionId, chunkIndex, totalChunks, pages } = message;
    
    const conversion = activeConversions.get(conversionId);
    if (!conversion) {
      throw new Error(`Conversion ${conversionId} not found`);
    }
    
    if (conversion.tabId !== sender.tab.id) {
      throw new Error(`Conversion ${conversionId} belongs to different tab`);
    }
    
    // Add pages from this chunk
    conversion.pages.push(...pages);
    conversion.receivedChunks++;
    
    console.log(`[DeKindled] Received chunk ${chunkIndex + 1}/${totalChunks} for conversion ${conversionId} (${pages.length} pages, ${conversion.pages.length} total)`);
    
    // Validate chunk completion
    if (conversion.receivedChunks === conversion.totalChunks) {
      if (conversion.pages.length !== conversion.totalPages) {
        console.warn(`[DeKindled] Page count mismatch for conversion ${conversionId}: expected ${conversion.totalPages}, got ${conversion.pages.length}`);
      } else {
        console.log(`[DeKindled] All chunks received for conversion ${conversionId}, ready for processing`);
      }
      conversion.status = 'chunks_complete';
    }
    
    sendResponse({ 
      success: true,
      receivedChunks: conversion.receivedChunks,
      totalChunks: conversion.totalChunks,
      message: `Chunk ${chunkIndex + 1}/${totalChunks} received successfully`
    });
  } catch (error) {
    console.error('[DeKindled] Error receiving chunk:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

// Handle starting EPUB processing
async function handleStartEpubProcessing(message, sender, sendResponse) {
  try {
    const { conversionId } = message;
    
    const conversion = activeConversions.get(conversionId);
    if (!conversion) {
      throw new Error(`Conversion ${conversionId} not found`);
    }
    
    if (conversion.tabId !== sender.tab.id) {
      throw new Error(`Conversion ${conversionId} belongs to different tab`);
    }
    
    if (conversion.status !== 'chunks_complete') {
      throw new Error(`Conversion ${conversionId} is not ready for processing (status: ${conversion.status})`);
    }
    
    conversion.status = 'processing';
    
    console.log(`[DeKindled] Starting processing for conversion ${conversionId} with ${conversion.pages.length} pages`);
    
    // Send immediate acknowledgment
    sendResponse({ 
      success: true, 
      message: 'Processing started successfully' 
    });
    
    // Start the actual conversion asynchronously
    processEpubConversion(conversion);
    
  } catch (error) {
    console.error('[DeKindled] Error starting processing:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

// Process EPUB conversion (async, doesn't use sendResponse)
async function processEpubConversion(conversion) {
  try {
    console.log(`[DeKindled] Starting EPUB conversion for ${conversion.pages.length} pages`);
    
    const pagesToProcess = conversion.pages;
    console.log(`[DeKindled] Processing ${pagesToProcess.length} pages`);
    
    // Get OpenAI API key from storage
    const result = await chrome.storage.sync.get(['openaiApiKey']);
    if (!result.openaiApiKey) {
      // Prompt user for API key
      const apiKey = await promptForApiKey(conversion.tabId);
      if (!apiKey) {
        chrome.tabs.sendMessage(conversion.tabId, {
          action: 'conversionComplete',
          success: false,
          error: 'OpenAI API key required'
        }).catch(console.error);
        return;
      }
    }
    
    const apiKey = result.openaiApiKey || await chrome.storage.sync.get(['openaiApiKey']).then(r => r.openaiApiKey);
    
    // Progress callback to send updates to viewer
    const progressCallback = (current, total) => {
      chrome.tabs.sendMessage(conversion.tabId, {
        action: 'conversionProgress',
        current: current,
        total: total
      }).catch(error => {
        console.warn('[DeKindled] Failed to send progress update:', error);
      });
    };
    
    // Convert images to XHTML chapters
    const chapters = await convertImagesToChapters(pagesToProcess, apiKey, progressCallback);
    
    // Generate EPUB file
    const epubBlob = await generateEpubFile(chapters, conversion.bookTitle, conversion.bookAuthor);
    
    // Convert blob to data URL for download (URL.createObjectURL not available in service workers)
    const arrayBuffer = await epubBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert uint8Array to base64 using chunked approach to avoid stack overflow
    const base64String = uint8ArrayToBase64(uint8Array);
    const dataUrl = `data:application/epub+zip;base64,${base64String}`;
    
    const filename = `${sanitizeFilename(conversion.bookTitle)} - ${sanitizeFilename(conversion.bookAuthor || 'Unknown Author')}.epub`;
    
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      conflictAction: 'uniquify'
    });
    
    // Send completion notification
    chrome.tabs.sendMessage(conversion.tabId, {
      action: 'conversionComplete',
      success: true,
      filename: filename
    }).catch(console.error);
    
    // Clean up conversion state
    activeConversions.delete(conversion.id);
    console.log(`[DeKindled] Conversion ${conversion.id} completed successfully`);
    
  } catch (error) {
    console.error('[DeKindled] Conversion error:', error);
    
    // Send error notification
    chrome.tabs.sendMessage(conversion.tabId, {
      action: 'conversionComplete',
      success: false,
      error: error.message
    }).catch(console.error);
    
    // Clean up conversion state
    activeConversions.delete(conversion.id);
  }
}

// Prompt user for OpenAI API key
async function promptForApiKey(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        const apiKey = prompt(
          '🔑 Enter your OpenAI API Key:\n\n' +
          'This is needed to convert images to text for your EPUB.\n' +
          'Your key will be stored securely in your browser.\n\n' +
          'Get your API key from: https://platform.openai.com/api-keys'
        );
        return apiKey;
      }
    }).then((results) => {
      const apiKey = results[0].result;
      if (apiKey) {
        chrome.storage.sync.set({ openaiApiKey: apiKey });
      }
      resolve(apiKey);
    }).catch(() => resolve(null));
  });
}

// Convert images to XHTML chapters using OpenAI Vision API
async function convertImagesToChapters(pages, apiKey, progressCallback) {
  const sections = []; // Will contain the final grouped sections
  let currentSection = null;
  
  // Initialize Showdown converter
  const converter = new showdown.Converter({
    headerLevelStart: 1,
    simpleLineBreaks: true,
    literalMidWordUnderscores: true,
    strikethrough: true,
    tables: true,
    tasklists: true
  });
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    
    // Send progress update
    if (progressCallback) {
      progressCallback(i + 1, pages.length);
    }
    
    try {
      console.log(`[DeKindled] Analyzing page ${i + 1} for markdown conversion`);
      
      // Retry loop for API call
      let markdownContent = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[DeKindled] API attempt ${attempt}/${maxRetries} for page ${i + 1}`);
          
          // Call OpenAI Vision API
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4.1-mini-2025-04-14',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image_url',
                      image_url: {
                        url: page.base64
                      }
                    },
                    {
                      type: 'text',
                      text: await buildAnalysisPrompt()
                    },
                  ]
                }
              ],
              max_tokens: 5000,
              temperature: 0 + ((attempt - 1) * 0.2),

              /**
               * Weird, but the model behaves differently when providing this even if it's
               * empty. This makes things work more like the playground.
               */
              tools: [],
            })
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
          }
          
          const data = await response.json();

          // Parse and clean the response
          const cleanedResponse = parseAIResponse(data.choices[0].message.content);

          markdownContent = cleanedResponse.trim().replaceAll('  \n', '\n\n');
          
          console.log(`[DeKindled] Successfully got markdown content on attempt ${attempt} for page ${i + 1}`);
          break; // Success, exit retry loop
          
        } catch (apiError) {
          console.error(`[DeKindled] API error on attempt ${attempt} for page ${i + 1}:`, apiError);
          if (attempt === maxRetries) {
            // All retries failed, create fallback
            markdownContent = `*[API error for page ${i + 1}: ${apiError.message} - content may be missing]*`;
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      // Check for chapter markers
      const chapterMarkerRegex = /^--- NEW CHAPTER: (.+?) ---$/m;
      const chapterMatch = markdownContent.match(chapterMarkerRegex);
      
      let isNewChapter = false;
      let chapterTitle = null;
      let contentToProcess = markdownContent;
      
      if (chapterMatch) {
        isNewChapter = true;
        chapterTitle = chapterMatch[1].trim();
        // Remove the chapter marker from the content
        contentToProcess = markdownContent.replace(chapterMarkerRegex, '').trim();
        console.log(`[DeKindled] Found new chapter: "${chapterTitle}"`);
      }
      
      // Start new section if needed
      if (isNewChapter || currentSection === null || (i === 0 && !currentSection)) {
        // Finalize previous section if it exists (convert markdown to HTML)
        if (currentSection && currentSection.markdownContent.trim()) {
          try {
            currentSection.content = converter.makeHtml(currentSection.markdownContent);
            console.log(`[DeKindled] Converted section "${currentSection.title}" from markdown to HTML`);
          } catch (conversionError) {
            console.error(`[DeKindled] Markdown conversion error for section "${currentSection.title}":`, conversionError);
            // Fallback: wrap in paragraph tags
            currentSection.content = `<p>${currentSection.markdownContent.replace(/\n/g, '<br>')}</p>`;
          }
          sections.push(currentSection);
        }
        
        // Determine section title
        const sectionTitle = chapterTitle || 
                           (isNewChapter ? `Chapter ${sections.length + 1}` : `Section ${sections.length + 1}`);
        
        // Start new section
        currentSection = {
          id: `section-${sections.length + 1}`,
          title: sectionTitle,
          content_type: isNewChapter ? 'chapter' : 'section',
          markdownContent: contentToProcess, // Store markdown content
          content: '', // Will be filled when section is complete
          page_numbers: [i + 1]
        };
        
        console.log(`[DeKindled] Started new section: "${sectionTitle}"`);
      } else {
        // Continue current section - intelligently append with space or newlines
        if (currentSection && contentToProcess.trim()) {
          const separator = shouldContinueWithSpace(currentSection.markdownContent, contentToProcess) ? ' ' : '\n\n';
          currentSection.markdownContent += separator + contentToProcess;
          currentSection.page_numbers.push(i + 1);
          console.log(`[DeKindled] Added page ${i + 1} to section: "${currentSection.title}" with ${separator === ' ' ? 'space' : 'paragraph break'}`);
        } else if (contentToProcess.trim()) {
          // Edge case: no current section but not starting new one
          currentSection = {
            id: `section-1`,
            title: `Section 1`,
            content_type: 'section',
            markdownContent: contentToProcess,
            content: '',
            page_numbers: [i + 1]
          };
        }
      }
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`[DeKindled] Error analyzing page ${i + 1}:`, error);
      
      // Create fallback section for this page
      const fallbackSection = {
        id: `error-page-${i + 1}`,
        title: `Page ${i + 1} (Error)`,
        content_type: 'error',
        markdownContent: '',
        content: `<p><em>Error processing page ${i + 1}: ${error.message}</em></p><p><img src="data:${page.type};base64,${page.base64.split(',')[1]}" alt="Page ${i + 1}" style="max-width: 100%; height: auto;" /></p>`,
        page_numbers: [i + 1]
      };
      
      sections.push(fallbackSection);
    }
  }
  
  // Don't forget the last section - convert its markdown to HTML
  if (currentSection && currentSection.markdownContent.trim()) {
    try {
      currentSection.content = converter.makeHtml(currentSection.markdownContent);
      console.log(`[DeKindled] Converted final section "${currentSection.title}" from markdown to HTML`);
    } catch (conversionError) {
      console.error(`[DeKindled] Markdown conversion error for final section "${currentSection.title}":`, conversionError);
      // Fallback: wrap in paragraph tags
      currentSection.content = `<p>${currentSection.markdownContent.replace(/\n/g, '<br>')}</p>`;
    }
    sections.push(currentSection);
  }
  
  console.log(`[DeKindled] Created ${sections.length} sections from ${pages.length} pages`);
  sections.forEach(section => {
    console.log(`[DeKindled] Section: "${section.title}" (${section.content_type}) - Pages: ${section.page_numbers.join(', ')}`);
  });
  
  return sections;
}

function parseAIResponse(rawContent) {
    if (!rawContent || typeof rawContent !== 'string') {
      return rawContent;
    }
    
    // Remove leading/trailing whitespace
    let content = rawContent.trim();
    
    // Pattern to match markdown code blocks: ```html, ```xhtml, ```xml, ```json, ```markdown, or just ```
    const codeBlockPattern = /^```(?:html|xhtml|xml|json|markdown)?\s*\n([\s\S]*?)\n```$/;
    const match = content.match(codeBlockPattern);
    
    if (match) {
      // Extract content from inside the code block
      content = match[1].trim();
      console.log('[DeKindled] Removed markdown code block wrapper from OpenAI response');
    }
    
    // Also handle single backticks (less common but possible)
    const singleBacktickPattern = /^`([\s\S]*?)`$/;
    const singleMatch = content.match(singleBacktickPattern);
    
    if (singleMatch) {
      content = singleMatch[1].trim();
      console.log('[DeKindled] Removed single backtick wrapper from OpenAI response');
    }
    
    // Additional cleanup: remove any extra leading/trailing markdown artifacts
    content = content
      .replace(/^#+\s*/, '') // Remove leading markdown headers
      .replace(/^\*\*.*?\*\*\s*/, '') // Remove bold markdown at start
      .trim();
    
    return content;
  }

// Generate EPUB file
async function generateEpubFile(chapters, bookTitle, bookAuthor) {
  const ZipClass = await importJSZip();
  const zip = new ZipClass();
  
  // Create EPUB structure
  zip.file('mimetype', 'application/epub+zip');
  
  // META-INF folder
  const metaInf = zip.folder('META-INF');
  metaInf.file('container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
  
  // OEBPS folder
  const oebps = zip.folder('OEBPS');
  
  // Generate content.opf
  const manifestItems = chapters.map(chapter => 
    `    <item id="${chapter.id}" href="${chapter.id}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n');
  
  const spineItems = chapters.map(chapter => 
    `    <itemref idref="${chapter.id}"/>`
  ).join('\n');
  
  oebps.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${generateUUID()}</dc:identifier>
    <dc:title>${escapeXml(bookTitle)}</dc:title>
    <dc:creator>${escapeXml(bookAuthor || 'Unknown Author')}</dc:creator>
    <dc:language>en</dc:language>
    <dc:date>${new Date().toISOString().split('T')[0]}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString()}</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`);
  
  // Generate toc.ncx
  const navPoints = chapters.map((chapter, index) => 
    `    <navPoint id="${chapter.id}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(chapter.title)}</text></navLabel>
      <content src="${chapter.id}.xhtml"/>
    </navPoint>`
  ).join('\n');
  
  oebps.file('toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${generateUUID()}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(bookTitle)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`);
  
  // Generate chapter XHTML files
  chapters.forEach(chapter => {
    const xhtmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(chapter.title)}</title>
</head>
<body>
${chapter.content}
</body>
</html>`;
    
    oebps.file(`${chapter.id}.xhtml`, xhtmlContent);
  });
  
  // Generate the EPUB file
  const epubBlob = await zip.generateAsync({ 
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  
  return epubBlob;
}

// Utility functions
function sanitizeFilename(filename) {
  return filename.replace(/[^a-z0-9\-_\s]/gi, '').replace(/\s+/g, '_').substring(0, 100);
}

function escapeXml(text) {
  return text.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&apos;');
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Import JSZip dynamically
async function importJSZip() {
  return SimpleZip;
}

// Build analysis prompt based on the current section
async function buildAnalysisPrompt() {
  // Default prompt value
  const defaultPrompt = `You are a book preservation assistant. Your job is to look at scanned images of books and rewrite them as markdown. You will be provided with a page from a book. Your job is to convert the page into valid markdown. We don't want to lose any data, so make sure to include all the text you see in the image.

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

  try {
    const result = await chrome.storage.sync.get(['analysisPrompt']);
    return result.analysisPrompt || defaultPrompt;
  } catch (error) {
    console.warn('[DeKindled] Failed to load analysis prompt from storage, using default:', error);
    return defaultPrompt;
  }
}

// Convert uint8Array to base64 using chunked approach to avoid stack overflow
function uint8ArrayToBase64(uint8Array) {
  console.log(`[DeKindled] Converting ${uint8Array.length} bytes to base64 using chunked approach`);
  
  let binaryString = '';
  const chunkSize = 16384; // 16KB chunks - better browser compatibility
  
  try {
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, chunk);
    }
    
    console.log(`[DeKindled] Successfully converted to binary string, applying base64 encoding`);
    return btoa(binaryString);
    
  } catch (error) {
    console.error('[DeKindled] Error in chunked base64 conversion:', error);
    throw new Error(`Base64 conversion failed: ${error.message}`);
  }
}

// Function to determine if we should append with space (mid-sentence) or newlines (new paragraph)
function shouldContinueWithSpace(previousContent, newContent) {
  if (!previousContent || !newContent) {
    return false; // Default to new paragraph if either is empty
  }
  
  // Get the last 50 characters of previous content, trimmed
  const prevTrimmed = previousContent.trim();
  const prevEnd = prevTrimmed.slice(-50).trim();
  
  // Get the first 50 characters of new content, trimmed  
  const newTrimmed = newContent.trim();
  const newStart = newTrimmed.slice(0, 50).trim();
  
  if (!prevEnd || !newStart) {
    return false;
  }
  
  // Check for common abbreviations that end with periods but don't end sentences
  const commonAbbrevs = /\b(dr|mr|mrs|ms|prof|vs|etc|inc|ltd|corp|co|st|ave|blvd|rd|jr|sr|phd|md|ba|ma|bs|ms|am|pm|vol|no|pg|ch|sec|min|max|approx|est|fig|ref|ed|eds|trans|repr|orig|pub|univ|dept|govt|assoc|org|admin|tech|info|bio|geo|psych|econ|hist|lit|math|sci|eng|med|law|bus|art|mus|phil|relig|sociol|anthro|archaeol|astron|biol|bot|chem|comp|ecol|geol|meteorol|oceanol|phys|stat|zool)\.\s*$/i;
  if (commonAbbrevs.test(prevEnd)) {
    return true; // Continue with space after abbreviations
  }
  
  // If previous content ends with sentence-ending punctuation (including within quotes), start new paragraph
  const sentenceEnders = /[.!?:;]['"""''‚„‹›«»]?\s*$|[.!?:;]\s*['"""''‚„‹›«»]\s*$|\.{3,}\s*$/;
  if (sentenceEnders.test(prevEnd)) {
    return false;
  }
  
  // If previous content ends with comma, dash, or ellipsis (but not sentence-ending ellipsis), likely continuing
  const continuationPunctuation = /[,\-—…]['"""''‚„‹›«»]?\s*$|[,\-—…]\s*['"""''‚„‹›«»]\s*$/;
  if (continuationPunctuation.test(prevEnd)) {
    return true;
  }
  
  // If new content starts with lowercase letter, likely continuing sentence
  if (/^[a-z]/.test(newStart)) {
    return true;
  }
  
  // If new content starts with common continuation words (even if capitalized)
  const continuationWords = /^(and|but|or|so|yet|for|nor|the|a|an|he|she|it|they|we|you|i|his|her|its|their|our|your|my|this|that|these|those|then|now|here|there|when|where|who|what|why|how|however|therefore|thus|meanwhile|furthermore|moreover|nevertheless|nonetheless|otherwise|likewise|similarly|consequently|accordingly|subsequently|eventually|finally|initially|originally|previously|recently|currently|presently|immediately|suddenly|gradually|slowly|quickly|briefly|shortly|soon|later|earlier|before|after|during|while|since|until|unless|although|though|whereas|because|if|when|where|as|than|like|unlike|despite|regarding|concerning|including|excluding|except|besides|among|between|within|without|beyond|beneath|above|below|across|through|throughout|around|toward|towards|against|along|beside|behind|ahead|inside|outside|nearby|far|close|near)\b/i;
  if (continuationWords.test(newStart)) {
    return true;
  }
  
  // If new content starts with closing punctuation (quotes, parentheses, brackets), likely continuing
  if (/^['"""''‚„‹›«»)\]}>]/.test(newStart)) {
    return true;
  }
  
  // If previous content doesn't end with a word character (and not already handled above), probably start new paragraph
  if (!/\w['"""''‚„‹›«»]?\s*$/.test(prevEnd)) {
    return false;
  }
  
  // Default: if new content starts with capital letter and doesn't match continuation patterns,
  // it's probably a new sentence/paragraph
  if (/^[A-Z]/.test(newStart)) {
    return false;
  }
  
  // When in doubt, continue with space (conservative approach for mid-sentence cases)
  return true;
}
