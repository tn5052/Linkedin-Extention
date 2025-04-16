// Import the config object from config.js
import { config } from './config.js';
// Import the activity tracker module
import { trackComment, trackReaction, trackVisit, trackSkip } from './activity-tracker.js';

console.log("Background script loaded (as module).");
console.log("Config loaded:", config); // Verify config is loaded

let isProcessing = false;
let currentProfileIndex = 0;
let targetProfiles = [];
let geminiApiKey = null; // Renamed for clarity
let mistralApiKey = null; // Added for Mistral
let businessContext = null;

// --- Forward all console logs to popup ---
const origConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug
};
function sendConsoleToPopup(level, ...args) {
  try {
    const msg = args.map(arg =>
      typeof arg === 'object' && arg !== null
        ? (() => { try { return JSON.stringify(arg); } catch { return String(arg); } })()
        : String(arg)
    ).join(' ');
    chrome.runtime.sendMessage({
      action: "consoleLog",
      level,
      message: msg,
      timestamp: new Date().toISOString()
    }).catch(() => {});
  } catch (e) {}
}
console.log = function(...args) { sendConsoleToPopup('log', ...args); origConsole.log(...args); };
console.info = function(...args) { sendConsoleToPopup('info', ...args); origConsole.info(...args); };
console.warn = function(...args) { sendConsoleToPopup('warn', ...args); origConsole.warn(...args); };
console.error = function(...args) { sendConsoleToPopup('error', ...args); origConsole.error(...args); };
console.debug = function(...args) { sendConsoleToPopup('debug', ...args); origConsole.debug(...args); };

// --- Countdown Timer Utility ---
function startCountdownTimer(seconds, description) {
  return new Promise(resolve => {
    const start = Date.now();
    const end = start + seconds * 1000;
    function tick() {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((end - now) / 1000));
      chrome.runtime.sendMessage({
        action: "countdownTimer",
        description,
        remaining,
        total: seconds
      }).catch(() => {});
      if (remaining > 0) setTimeout(tick, 1000);
      else resolve();
    }
    tick();
  });
}
async function enhancedSleep(ms, description = 'Waiting') {
  if (ms >= 10000) {
    await startCountdownTimer(Math.ceil(ms / 1000), description);
  } else {
    await new Promise(res => setTimeout(res, ms));
  }
}

// --- Initialization ---
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension Installed/Updated.");
  // Set initial state
  chrome.storage.local.set({ agentStatus: 'Idle' });
});

// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request);

  if (request.action === "startProcessing") {
    if (isProcessing) {
      console.log("Processing already in progress.");
      sendResponse({ status: "Already Running" });
      return true; // Keep message channel open for async response
    }
    console.log("Starting processing...");
    startProcessing()
      .then(() => {
        sendResponse({ status: "Running" });
      })
      .catch(error => {
        console.error("Error starting processing:", error);
        updateStatus("Error: " + error.message);
        isProcessing = false;
        updateStatus("Idle"); // Reset status
        sendResponse({ status: "Error starting: " + error.message });
      });
    return true; // Indicate async response
  }

  if (request.action === "stopProcessing") {
    console.log("Stopping processing...");
    isProcessing = false;
    updateStatus("Stopping agent...");
    console.log("isProcessing flag set to false.");
    sendResponse({ status: "Idle" });
    return true; // Keep message channel open
  }

  // Handle status updates from popup or other sources if needed
  if (request.action === "updateStatus") {
    console.log("Received status update message (potentially from popup):", request.status);
    sendResponse({ received: true });
    return true;
  }

  if (request.action === "getLatestStats") {
    broadcastStats();
    sendResponse({ received: true });
    return true;
  }

  console.log("Unhandled message action:", request.action);
  return false; // No async response needed for unhandled actions
});

// --- Core Logic ---

async function startProcessing() {
  if (isProcessing) return;

  try {
    const settings = await chrome.storage.local.get(['apiKey', 'mistralApiKey', 'targetProfiles', 'businessContext']);
    geminiApiKey = settings.apiKey;
    mistralApiKey = settings.mistralApiKey;
    targetProfiles = settings.targetProfiles || [];
    businessContext = settings.businessContext;

    if (!geminiApiKey) {
      throw new Error("Gemini API Key not set.");
    }
    if (!targetProfiles || targetProfiles.length === 0) {
      throw new Error("No target profiles set.");
    }

    isProcessing = true;
    currentProfileIndex = 0;
    updateStatus("Running");
    console.log(`Starting processing for ${targetProfiles.length} profiles.`);
    await processNextProfile();

  } catch (error) {
    console.error("Failed to start processing:", error);
    updateStatus(`Error: ${error.message}`);
    isProcessing = false; // Ensure state is reset on error
    throw error;
  }
}

async function processNextProfile() {
  if (!isProcessing) {
    console.log("processNextProfile: Stopping because isProcessing is false.");
    updateStatus("Agent stopped.");
    return;
  }

  if (currentProfileIndex >= targetProfiles.length) {
    console.log("Finished processing all profiles.");
    updateStatus("Finished all profiles. Idling.");
    isProcessing = false; // Stop processing after the last profile
    return;
  }

  const profileUrl = targetProfiles[currentProfileIndex];
  const activityUrl = profileUrl.endsWith('/') ? profileUrl + 'recent-activity/all/' : profileUrl + '/recent-activity/all/';
  const profileShortName = profileUrl.split('/').filter(Boolean).pop();

  console.log(`Processing profile ${currentProfileIndex + 1}/${targetProfiles.length}: ${activityUrl}`);
  updateStatus(`Processing: ${profileUrl}`);

  let tab;
  let skipReason = null;
  let skippedCurrentProfile = false; // Flag to indicate a planned skip

  try {
    // Track the visit when processing starts
    await trackVisit(profileUrl);

    // --- Navigation and Page Load ---
    tab = await findOrCreateLinkedInTab();
    if (!tab?.id) {
      throw new Error("Failed to find or create a LinkedIn tab.");
    }

    // Check before navigation
    if (!isProcessing) {
      console.log("Stopped before navigation.");
      return;
    }

    console.log(`Navigating tab ${tab.id} to ${activityUrl}`);
    await chrome.tabs.update(tab.id, { url: activityUrl });

    // Wait specifically for this navigation to complete
    await new Promise((resolve, reject) => {
      const listener = (tabId, changeInfo, updatedTab) => {
        if (tabId === tab.id && changeInfo.status === 'complete' && updatedTab.url?.includes('linkedin.com')) {
          console.log(`Tab ${tabId} finished loading for ${activityUrl}`);
          chrome.tabs.onUpdated.removeListener(listener);
          // Add random delay *after* load confirmation
          setTimeout(resolve, getRandomDelay(3000, 6000));
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      // Timeout specifically for this navigation
      const navigationTimeout = setTimeout(() => {
        console.warn(`Timeout waiting for tab ${tab.id} to complete loading ${activityUrl}.`);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error(`Timeout loading page: ${activityUrl}`)); // Reject promise on timeout
      }, 25000); // Increased timeout slightly

      // Clear timeout if resolved normally
      const originalResolve = resolve;
      resolve = (...args) => {
        clearTimeout(navigationTimeout);
        originalResolve(...args);
      };
    });
    // --- End Navigation and Page Load ---

    // Check before scraping
    if (!isProcessing) {
      console.log("Stopped before scraping.");
      return;
    }

    console.log(`Sending scrape request to tab ${tab.id}`);
    await sleep(getRandomDelay(1000, 2000));
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "scrapeLatestPost",
      tabId: tab.id
    });

    if (chrome.runtime.lastError) {
      throw new Error(`Error communicating with content script: ${chrome.runtime.lastError.message}`);
    }
    if (!response) {
      throw new Error("No response received from content script (content script might have failed). Check content script console.");
    }
    if (response.error) {
      throw new Error(`Scraping error from content script: ${response.error}`);
    }
    if (!response.postId) {
      throw new Error("Scraping response missing essential postId.");
    }

    const { postText, imageUrls, postId, documentUrl, preReacted } = response;

    // --- Check if Already Commented ---
    if (postId && !postId.startsWith('error_') && !postId.startsWith('post_')) { // Only check valid URNs
      const { commentedPostIds = [] } = await chrome.storage.local.get('commentedPostIds');
      if (commentedPostIds.includes(postId)) {
        skipReason = `Already commented on post ID: ${postId}`;
        skippedCurrentProfile = true; // Set skip flag
        console.warn(`Skipping ${profileShortName}: ${skipReason}`);
        await incrementStat('skippedCount');
        await addLogEntry(`Skipping ${profileShortName}: Already commented on this post.`, 'warn');
        await trackSkip(profileUrl, skipReason); // Track the skip
        return; // Exit the try block early
      }
    } else if (!postId || postId.startsWith('error_') || postId.startsWith('post_')) {
      skipReason = `Invalid postId: ${postId}`;
      skippedCurrentProfile = true; // Set skip flag
      console.warn(`Skipping ${profileShortName}: ${skipReason}`);
      await incrementStat('skippedCount');
      await addLogEntry(`Skipping ${profileShortName}: Invalid postId ('${postId}').`, 'warn');
      await trackSkip(profileUrl, skipReason); // Track the skip
      return; // Exit the try block early
    }
    // --- End Check if Already Commented ---

    // --- Document Skip Logic ---
    if (documentUrl) {
      skipReason = "Latest post contains a document.";
      skippedCurrentProfile = true; // Set skip flag
      console.warn(`Skipping ${profileShortName}: ${skipReason}`);
      await incrementStat('skippedCount'); // Ensure skip is counted
      await addLogEntry(`Skipping ${profileShortName}: ${skipReason}`, 'warn');
      await trackSkip(profileUrl, skipReason); // Track the skip
      return; // Exit the try block early
    }
    // --- End Document Skip Logic ---

    // --- No Content Skip Logic ---
    if (!postText && !imageUrls?.length) {
      skipReason = "Post has no text or image.";
      skippedCurrentProfile = true; // Set skip flag before throwing
      console.warn(`Skipping ${profileShortName}: ${skipReason}`);
      await trackSkip(profileUrl, skipReason); // Track the skip
      throw new Error(skipReason);
    }
    // --- End No Content Skip Logic ---

    let analysisResult = 'No specific content analyzed.';
    let analysisType = 'text_only';

    // Check before AI analysis
    if (!isProcessing) {
      skipReason = "Stopped before AI analysis";
      await trackSkip(profileUrl, skipReason); // Track the skip
      throw new Error(skipReason);
    }

    if (imageUrls && imageUrls.length > 0) {
      analysisType = 'image';
      console.log(`Processing post with ${imageUrls.length} image(s)...`);
      try {
        const visionPrompt = await config.prompts.getVisionPrompt();
        analysisResult = await callMistralVision(imageUrls, visionPrompt);
        console.log("Combined Image description result:", analysisResult);
        if (analysisResult.toLowerCase().includes("cannot provide details") || analysisResult.toLowerCase().includes("unable to analyze")) {
          console.warn("Vision API could not analyze image content meaningfully.");
        }
      } catch (visionError) {
        console.error("Error calling Mistral Vision:", visionError);
        analysisResult = `Error analyzing image(s): ${visionError.message}`;
      }
      await sleep(getRandomDelay(1000, 3000));
    } else if (postText) {
      analysisType = 'text_only';
      console.log("Processing text-only post.");
      analysisResult = 'Analyzed text content only.';
      await sleep(getRandomDelay(500, 1500));
    }

    // Check before comment generation
    if (!isProcessing) {
      skipReason = "Stopped before comment generation";
      await trackSkip(profileUrl, skipReason); // Track the skip
      throw new Error(skipReason);
    }

    let contentContextPrompt = '';
    if (analysisType === 'image' && !analysisResult.startsWith('Error')) {
      contentContextPrompt = `Description of image(s) in the post: "${analysisResult}"`;
    }

    const commentPrompt = await config.prompts.commentPromptTemplate(
      postText, contentContextPrompt, businessContext, analysisType
    );

    const rawGeminiResponse = await callGeminiPro(commentPrompt, config.models.text); // Get raw response

    // Parse reaction and comment
    let generatedComment = '';
    let suggestedReaction = 'Like'; // Default to Like
    const validReactions = ['Like', 'Celebrate', 'Support', 'Love', 'Insightful', 'Funny']; // Define valid reactions

    const reactionMatch = rawGeminiResponse.match(/^Reaction:\s*(\w+)/im); // Match 'Reaction:' at the start of a line
    const commentMatch = rawGeminiResponse.match(/^Comment:\s*(.*)/ims); // Match 'Comment:' at the start of a line

    if (reactionMatch && reactionMatch[1]) {
      const parsedReaction = reactionMatch[1].trim();
      // Validate reaction against the allowed list
      if (validReactions.some(valid => valid.toLowerCase() === parsedReaction.toLowerCase())) {
        // Find the correct capitalization
        suggestedReaction = validReactions.find(valid => valid.toLowerCase() === parsedReaction.toLowerCase());
      } else {
        console.warn(`AI suggested invalid reaction '${parsedReaction}', defaulting to 'Like'.`);
        suggestedReaction = 'Like'; // Default if invalid
      }
    } else {
      console.warn("Could not parse reaction from AI response using format 'Reaction: ...', defaulting to 'Like'. Raw:", rawGeminiResponse);
      suggestedReaction = 'Like'; // Default if format not found
    }

    if (commentMatch && commentMatch[1]) {
      generatedComment = commentMatch[1].trim();
    } else {
      console.warn("Could not parse comment from AI response using format 'Comment: ...'. Using fallback parsing. Raw:", rawGeminiResponse);
      // Fallback: Try to remove the reaction line if it exists
      generatedComment = rawGeminiResponse.replace(/^Reaction:\s*\w+\s*/im, '').trim();
      if (generatedComment.length < 10) { // If fallback is still too short, consider it failed
        skipReason = "Comment generation failed or produced unhelpful content after fallback parsing.";
        skippedCurrentProfile = true;
        console.error(`Skipping posting for ${profileShortName}: ${skipReason}`);
        await trackSkip(profileUrl, skipReason); // Track the skip
        throw new Error(skipReason);
      }
    }

    console.log(`Suggested Reaction: ${suggestedReaction}`);
    console.log("Generated Comment:", generatedComment);

    // Check comment quality *after* parsing
    if (generatedComment.startsWith("Error:") || generatedComment.toLowerCase().includes("unable to comment") || generatedComment.length < 10) {
      skipReason = "Comment generation failed or produced unhelpful content.";
      skippedCurrentProfile = true; // Set skip flag before throwing
      console.warn(`Skipping posting for ${profileShortName}: ${skipReason}`);
      await trackSkip(profileUrl, skipReason); // Track the skip
      throw new Error(skipReason);
    }
    // --- End Comment Generation & Reaction Parsing ---

    // --- Prepare Reaction Type ---
    // Check if post was already pre-reacted to during scraping
    const shouldReact = !preReacted;
    console.log(`Post ${preReacted ? 'was already reacted to' : 'needs reaction'} during processing.`);
    
    // Ensure we use the suggested reaction from AI response or 'Like' as default
    let reactionToUse = suggestedReaction || 'Like';
    console.log(`Will use '${reactionToUse}' reaction ${shouldReact ? 'if needed' : '(already reacted)'}`);

    // --- Posting Comment & Reaction ---
    // Check before posting comment
    if (!isProcessing) {
      skipReason = "Stopped before sending post comment message";
      await trackSkip(profileUrl, skipReason); // Track the skip
      throw new Error(skipReason);
    }

    console.log("Requesting comment posting...");
    await sleep(getRandomDelay(5000, 10000));

    // Check again after delay, before sending message
    if (!isProcessing) {
      skipReason = "Stopped before sending post comment message";
      await trackSkip(profileUrl, skipReason); // Track the skip
      throw new Error(skipReason);
    }

    console.log(`Sending postComment message to tab ${tab.id} for post ${postId}`);
    const postResult = await chrome.tabs.sendMessage(tab.id, {
      action: "postComment",
      commentText: generatedComment,
      postId: postId,
      reactionType: shouldReact ? reactionToUse : null // Only send reaction type if needed
    });

    if (chrome.runtime.lastError) {
      throw new Error(`Error sending postComment message: ${chrome.runtime.lastError.message}`);
    }
    if (!postResult) {
      throw new Error("No response received from content script for postComment action.");
    }

    if (postResult && postResult.success) {
      console.log("Comment posted successfully for:", profileUrl);
      
      // Track reaction if added
      if (postResult.reactionSuccess) {
        console.log(`Successfully added ${reactionToUse} reaction to the post.`);
        await trackReaction(profileUrl, postId, reactionToUse);
        await addLogEntry(`Added ${reactionToUse} reaction and comment for profile: ${profileShortName}`, 'success');
      } else {
        console.log("Comment posted but reaction may have failed.");
        await addLogEntry(`Comment posted for profile: ${profileShortName} (reaction may have failed)`, 'info');
      }
      
      // Track the successful comment
      await trackComment(profileUrl, postId, generatedComment, postResult.reactionSuccess ? reactionToUse : null);
      
      await incrementStat('commentedCount');
      updateStatus(`Comment posted for ${profileUrl}`);

      // Store commented post ID
      const { commentedPostIds = [] } = await chrome.storage.local.get('commentedPostIds');
      if (!commentedPostIds.includes(postId)) {
        commentedPostIds.push(postId);
        await chrome.storage.local.set({ commentedPostIds: commentedPostIds });
        console.log(`Stored commented postId: ${postId}`);
        await addLogEntry(`Stored commented postId: ${postId}`, 'debug');
      }
    } else {
      skipReason = `Content script failed to post comment: ${postResult?.error || 'Unknown error'}`;
      skippedCurrentProfile = true; // Set skip flag before throwing
      console.error("Failed to post comment:", postResult?.error || "Unknown error");
      await trackSkip(profileUrl, skipReason); // Track the skip
      throw new Error(skipReason);
    }
    // --- End Posting Comment & Reaction ---

  } catch (error) {
    console.error(`Error processing profile ${profileUrl}:`, error);
    if (!skipReason) {
      skipReason = `Unexpected error: ${error.message}`;
      await trackSkip(profileUrl, skipReason);
    }
    if (skippedCurrentProfile && !skipReason.includes("document")) {
      const { skippedCount } = await chrome.storage.local.get('skippedCount');
      await chrome.storage.local.set({ skippedCount: (skippedCount || 0) + 1 });
    }
    updateStatus(`Error on ${profileShortName}: ${error.message.substring(0, 50)}...`);
  } finally {
    currentProfileIndex++;

    if (!isProcessing) {
      console.log("processNextProfile (finally): Stopping, isProcessing is false.");
      updateStatus("Agent stopped.");
      return;
    }

    if (currentProfileIndex >= targetProfiles.length) {
      console.log("Finished processing all profiles (in finally block).");
      updateStatus("Finished all profiles. Idling.");
      isProcessing = false;
      return;
    }

    if (skippedCurrentProfile) {
      const shortDelay = getRandomDelay(1000, 3000); // 1-3 seconds
      console.log(`Skipped profile ${profileShortName}. Moving to next profile in ${Math.round(shortDelay / 1000)}s...`);
      await addLogEntry(`Skipped ${profileShortName}. Moving to next profile quickly.`, 'info');
      updateStatus(`Skipped ${profileShortName}. Next... (${currentProfileIndex + 1}/${targetProfiles.length})`);
      await sleep(shortDelay);
    } else {
      const betweenProfileDelay = getRandomDelay(60000, 120000); // 1-2 minutes
      const delaySeconds = Math.round(betweenProfileDelay / 1000);
      console.log(`Waiting ${delaySeconds} seconds before processing next profile...`);
      await addLogEntry(`Waiting ${delaySeconds}s before next profile (${currentProfileIndex + 1}/${targetProfiles.length})`, 'info');
      updateStatus(`Waiting ${delaySeconds}s... (${currentProfileIndex + 1}/${targetProfiles.length})`);
      await enhancedSleep(betweenProfileDelay, `Waiting before next profile (${currentProfileIndex + 1}/${targetProfiles.length})`);
    }

    if (!isProcessing) {
      console.log("Stopped before recursive call.");
      return;
    }
    processNextProfile();
  }
}

// Function to fetch image data as base64
async function fetchImageAsBase64(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Error fetching image ${imageUrl}:`, error);
    return null;
  }
}

// Updated function to call Gemini for Document Analysis (uses specific model from config)
async function callGeminiForDocumentAnalysis(documentBase64, postText) {
  if (!geminiApiKey) {
    console.error("Gemini API key not set.");
    return "Error: API key not configured.";
  }
  const modelName = config.models.documentAnalysis || 'gemini-1.5-flash';
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

  const analysisPrompt = `
    Analyze the key points and overall message of the attached document.
    The accompanying LinkedIn post text (if any) is: "${postText || 'No text provided.'}"
    Provide a concise summary (2-3 sentences) focusing on the most relevant information for a professional audience, considering the context of the LinkedIn post.
  `;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: analysisPrompt },
          {
            inline_data: {
              mime_type: "application/pdf",
              data: documentBase64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 512,
    },
    safetySettings: config.safetySettings
  };

  try {
    console.log(`Calling Gemini API for document analysis (${modelName})...`);
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Gemini Document Analysis API (${modelName}) Error Response:`, errorData);
      throw new Error(`Gemini Document Analysis API request failed with status ${response.status}: ${errorData.error?.message || 'Unknown error'}`);
    }
    const data = await response.json();
    console.log(`Gemini Document Analysis API (${modelName}) Success Response:`, data);
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    } else {
      console.warn(`Gemini Document Analysis API (${modelName}) response structure unexpected or missing text:`, data);
      return "Could not extract summary from document.";
    }
  } catch (error) {
    console.error(`Error calling Gemini Document Analysis API (${modelName}):`, error);
    return `Error analyzing document: ${error.message}`;
  }
}

// --- AI API Calls ---
async function callMistralVision(imageUrls, promptOverride = null) {
  if (!mistralApiKey) throw new Error("Mistral API Key is missing.");
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new Error("Image URLs array is missing or empty for Mistral Vision call.");
  }

  // Use custom prompt if available, otherwise use default
  const promptText = promptOverride || await config.prompts.getVisionPrompt();

  const API_ENDPOINT = `https://api.mistral.ai/v1/chat/completions`;

  try {
    console.log(`Calling Mistral Vision API (${config.models.vision}) with ${imageUrls.length} image(s).`);

    const messageContent = [
      { type: "text", text: promptText }
    ];
    imageUrls.forEach(url => {
      messageContent.push({ type: "image_url", image_url: url });
    });

    const requestBody = {
      model: config.models.vision,
      messages: [
        {
          role: "user",
          content: messageContent
        }
      ],
      max_tokens: 150
    };

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      console.error("Mistral API Error Response:", responseBody);
      throw new Error(`Mistral API request failed: ${response.status} ${response.statusText} - ${responseBody?.error?.message || 'Unknown error'}`);
    }

    console.log("Mistral API Raw Response:", responseBody);

    if (responseBody.choices && responseBody.choices.length > 0 && responseBody.choices[0].message && responseBody.choices[0].message.content) {
      return responseBody.choices[0].message.content.trim();
    } else {
      console.error("Unexpected Mistral API response format:", responseBody);
      throw new Error("Could not extract description from Mistral response.");
    }

  } catch (error) {
    console.error(`Error calling Mistral Vision API (${config.models.vision}):`, error);
    throw error;
  }
}

async function callGeminiPro(promptText, modelName = config.models.text) {
  if (!geminiApiKey) throw new Error("API Key is missing for Gemini Pro call.");
  if (!modelName) throw new Error("Model name is missing for Gemini Pro call.");

  const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

  try {
    console.log(`Calling Gemini API (${modelName})...`);
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: promptText }]
        }],
        generationConfig: {
          temperature: config.generationConfig.temperature,
          maxOutputTokens: config.generationConfig.maxOutputTokens
        },
        safetySettings: config.safetySettings
      }),
    });

    const responseBody = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error Response:", responseBody);
      throw new Error(`Gemini API request failed: ${response.status} ${response.statusText} - ${responseBody?.error?.message || 'Unknown error'}`);
    }

    console.log("Gemini API Raw Response:", responseBody);

    if (responseBody.candidates && responseBody.candidates.length > 0) {
      const candidate = responseBody.candidates[0];
      if (candidate.finishReason === "SAFETY") {
        console.warn("Gemini response blocked due to safety settings.");
        throw new Error("Generated content blocked due to safety settings."); // Throw error
      }
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        // Return the full text for parsing reaction and comment later
        return candidate.content.parts[0].text.trim();
      }
    }

    console.error("Unexpected Gemini API response format or no content:", responseBody);
    throw new Error("Could not extract generated text from Gemini response."); // Throw error

  } catch (error) {
    console.error(`Error calling Gemini API (${modelName}):`, error);
    // Re-throw the error to be caught by processNextProfile
    throw new Error(`Gemini API call failed: ${error.message}`);
  }
}

// --- Utility Functions ---

// Add log entry to storage and broadcast to popup for real-time updates
async function addLogEntry(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    message,
    level
  };
  
  try {
    // Get existing logs
    const { logs = [] } = await chrome.storage.local.get('logs');
    
    // Add new entry (limit to most recent 500 entries to avoid storage limits)
    logs.push(logEntry);
    if (logs.length > 500) logs.shift(); // Remove oldest entry if over 500
    
    // Save updated logs
    await chrome.storage.local.set({ logs });
    
    // Broadcast to open popup
    chrome.runtime.sendMessage({ 
      action: "newLogEntry", 
      logEntry: logEntry 
    }).catch(err => {
      // Ignore connection errors when popup is closed
      if (!err.message.includes("Could not establish connection")) {
        console.error("Error sending log update to popup:", err);
      }
    });
    
    console.log(`[${level.toUpperCase()}] ${timestamp}: ${message}`);
    
    // Update stats if needed based on log content
    if (message.includes("Comment posted successfully")) {
      incrementStat('commentedCount');
    } else if (message.includes("Skipping") && !message.includes("waiting")) {
      incrementStat('skippedCount');
    }
  } catch (error) {
    console.error("Error saving log entry:", error);
  }
}

// Increment a specific statistics counter
async function incrementStat(statName) {
  try {
    const stats = await chrome.storage.local.get([statName]);
    const currentValue = stats[statName] || 0;
    await chrome.storage.local.set({ [statName]: currentValue + 1 });
    
    // Also update total processed count if needed
    if (statName === 'commentedCount' || statName === 'skippedCount') {
      const { processedCount = 0 } = await chrome.storage.local.get('processedCount');
      await chrome.storage.local.set({ processedCount: processedCount + 1 });
    }
    
    // Get all updated stats and broadcast
    broadcastStats();
  } catch (error) {
    console.error(`Error incrementing stat ${statName}:`, error);
  }
}

// Broadcast current stats to popup
async function broadcastStats() {
  try {
    const { commentedCount = 0, skippedCount = 0, processedCount = 0 } = 
      await chrome.storage.local.get(['commentedCount', 'skippedCount', 'processedCount']);
      
    const stats = {
      commented: commentedCount,
      skipped: skippedCount,
      processed: processedCount,
      total: targetProfiles.length
    };
    
    chrome.runtime.sendMessage({ 
      action: "statsUpdate", 
      stats: stats 
    }).catch(err => {
      // Ignore connection errors when popup is closed
      if (!err.message.includes("Could not establish connection")) {
        console.error("Error sending stats update to popup:", err);
      }
    });
  } catch (error) {
    console.error("Error broadcasting stats:", error);
  }
}

// Add a function to send console logs to the popup
function sendConsoleLog(message, level = 'log') {
    try {
        chrome.runtime.sendMessage({
            action: "consoleLog",
            message: message,
            level: level,
            timestamp: new Date().toISOString()
        }).catch(err => {
            // If popup isn't open, this will fail silently
            console.debug("Failed to send console log to popup (likely not open):", err);
        });
    } catch (e) {
        // Ignore errors when popup is not open
    }
    
    // Also log to background console
    switch(level) {
        case 'error': console.error(message); break;
        case 'warn': console.warn(message); break;
        case 'info': console.info(message); break;
        case 'success': console.log(`✓ ${message}`); break;
        default: console.log(message);
    }
}

// Enhance the existing logging functions to also send to popup
function updateStatus(message, level = 'info') {
    sendConsoleLog(`Status: ${message}`, level); // Send to popup console
    chrome.storage.local.set({ agentStatus: message });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function findTabById(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.url && tab.url.includes("linkedin.com")) {
      return tab;
    }
    console.warn(`Tab ${tabId} found, but URL is not LinkedIn: ${tab?.url}`);
    return null;
  } catch (error) {
    console.error(`Error getting tab ${tabId}:`, error);
    return null;
  }
}

async function findOrCreateLinkedInTab() {
  let [tab] = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });

  if (tab) {
    console.log("Found existing LinkedIn tab:", tab.id);
    return tab;
  } else {
    console.log("No existing LinkedIn tab found, creating one.");
    tab = await chrome.tabs.create({ url: "https://www.linkedin.com/feed/", active: false });
    await sleep(2000);
    return tab;
  }
}
