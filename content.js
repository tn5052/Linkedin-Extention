console.log("LinkedIn AI Commenter: Content script loaded.");

// --- Helper: Sleep function ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Helper: Get Random Delay ---
function getRandomDelay(minMs, maxMs) {
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

// --- Enhanced Utility Functions ---
function findLatestPostElement() {
    console.log("[Post Finder] Attempting to find the latest post element...");
    
    // Expanded list of selectors for better post detection across LinkedIn UI variations
    const postSelectors = [
        '.scaffold-finite-scroll__content > div', 
        'div.feed-shared-update-v2', 
        'div.profile-creator-shared-feed-update__container',
        // Add more specific and reliable selectors
        'div[data-urn]',
        'div[data-entity-urn]',
        'div.feed-shared-update-v2__content',
        'div.ember-view.occludable-update'
    ];
    
    const selectorString = postSelectors.join(', ');
    const postElements = document.querySelectorAll(selectorString);
    
    if (postElements.length > 0) {
        console.log(`[Post Finder] Found ${postElements.length} potential post elements. Evaluating quality...`);
        
        // Enhanced post selection - score posts based on quality indicators
        const scoredPosts = Array.from(postElements).map(post => {
            let score = 0;
            
            // Check for presence of key elements that indicate a complete post
            const hasText = post.querySelector('.feed-shared-update-v2__description, .update-components-text');
            if (hasText) score += 3;
            
            const hasActions = post.querySelector('button[aria-label*="Comment"], button[aria-label*="Like"]');
            if (hasActions) score += 3;
            
            const hasAuthor = post.querySelector('.feed-shared-actor__name, .update-components-actor__name');
            if (hasAuthor) score += 2;
            
            const hasTimestamp = post.querySelector('.feed-shared-actor__sub-description, .update-components-actor__sub-description');
            if (hasTimestamp) score += 1;
            
            // Check for proper URN - critical for interactions
            const hasUrn = post.hasAttribute('data-urn') || post.hasAttribute('data-entity-urn');
            if (hasUrn) score += 5;
            
            return { element: post, score };
        });
        
        // Sort posts by quality score (highest first)
        scoredPosts.sort((a, b) => b.score - a.score);
        
        // Select best post with minimum quality threshold
        if (scoredPosts.length > 0 && scoredPosts[0].score >= 5) {
            const bestPost = scoredPosts[0].element;
            console.log(`[Post Finder] Selected highest quality post element (score: ${scoredPosts[0].score}):`, bestPost);
            return bestPost;
        } else if (postElements.length > 0) {
            console.warn("[Post Finder] No high-quality posts found. Using first available post element as fallback.");
            return postElements[0];
        }
    }
    
    console.error("[Post Finder] Could not find any potential post elements with current selectors.");
    return null;
}

// --- Pre-Scrape Reaction Logic ---
// New function to determine if a reaction should be added before scraping details
async function preCheckAndReact(postElement) {
    if (!postElement) return false;
    
    try {
        // Check if this post already has a visible reaction from us
        const reactionButton = postElement.querySelector('button.react-button__trigger[aria-pressed="true"]');
        if (reactionButton) {
            console.log("[Pre-React] Post already has a reaction from us.");
            return true; // Already reacted
        }
        
        // Auto-like the post with simple 'Like' reaction
        console.log("[Pre-React] Post has no reaction yet. Adding default 'Like'...");
        return await reactToPost(postElement, 'Like');
    } catch (error) {
        console.error("[Pre-React] Error during pre-reaction check:", error);
        return false;
    }
}

// --- Document Handling (Re-implemented) ---
async function handleDocumentPost(postElement) {
    console.log("Attempting to handle document post interactively...");
    const docContainer = postElement.querySelector('div.native-document-container, iframe[src*="native-document.html"]');
    if (!docContainer) {
        console.log("No document container or iframe found in this post element.");
        return null;
    }
    console.log("Document container/iframe found. Looking for viewer within post element...");

    const docViewer = postElement.querySelector('div.native-document-container');
    if (!docViewer) {
         console.log("No 'div.native-document-container' found directly. Interaction might fail.");
         const potentialFullscreenButton = postElement.querySelector('button.ssplayer-fullscreen-on-button');
         if (!potentialFullscreenButton) {
             console.error("Document Handler: Cannot find fullscreen button within post element. Cannot proceed with interaction.");
             return null;
         }
         console.warn("Document Handler: Found fullscreen button but not the standard container. Proceeding with caution.");
    }

    try {
        const fullscreenButton = postElement.querySelector('button.ssplayer-fullscreen-on-button');
        if (!fullscreenButton) {
            console.error("Document Handler: Fullscreen button ('button.ssplayer-fullscreen-on-button') not found within post element.");
            return null;
        }
        console.log("Document Handler: Found fullscreen button. Clicking...");
        fullscreenButton.click();
        await sleep(2500);

        const downloadButton = document.querySelector('.ssplayer-presentation-player.ssplayer-fullscreen button.ssplayer-topbar-action-download');
        if (!downloadButton) {
            console.error("Document Handler: Download button ('.ssplayer-presentation-player.ssplayer-fullscreen button.ssplayer-topbar-action-download') not found in fullscreen mode.");
            const exitFullscreenButton = document.querySelector('.ssplayer-presentation-player.ssplayer-fullscreen button.ssplayer-topbar-action-cancel');
            if (exitFullscreenButton) exitFullscreenButton.click();
            return null;
        }
        console.log("Document Handler: Found download button in fullscreen. Clicking...");
        downloadButton.click();
        await sleep(3000);

        const downloadDialog = document.querySelector('div.ssplayer-virus-scan-container.active');
        if (!downloadDialog) {
            console.error("Document Handler: Download dialog ('div.ssplayer-virus-scan-container.active') not found or not active.");
            const exitFullscreenButton = document.querySelector('.ssplayer-presentation-player.ssplayer-fullscreen button.ssplayer-topbar-action-cancel');
            if (exitFullscreenButton) exitFullscreenButton.click();
            return null;
        }
        console.log("Document Handler: Found active download dialog. Waiting briefly for link population...");
        await sleep(1000); // *** ADDED DELAY: Wait 1 second for href to potentially populate ***

        const finalDownloadLink = downloadDialog.querySelector('a.ssplayer-virus-scan-container__download-button');

        if (finalDownloadLink) {
             console.log("Document Handler: Found download link element:", finalDownloadLink);
             if (finalDownloadLink.href && finalDownloadLink.href.trim() !== '') {
                const documentUrl = finalDownloadLink.href;
                console.log("Document Handler: Extracted document URL:", documentUrl);

                console.log("Document Handler: Closing dialog and exiting fullscreen...");
                const cancelButton = downloadDialog.querySelector('button.ssplayer-virus-scan-container__cancel-button');
                if (cancelButton) cancelButton.click();
                await sleep(500);
                const exitFullscreenButton = document.querySelector('.ssplayer-presentation-player.ssplayer-fullscreen button.ssplayer-topbar-action-cancel');
                if (exitFullscreenButton) exitFullscreenButton.click();
                await sleep(1500);

                return documentUrl;
             } else {
                 console.error("Document Handler: Found the download link element, but its 'href' attribute is missing or empty.");
                 const exitFullscreenButton = document.querySelector('.ssplayer-presentation-player.ssplayer-fullscreen button.ssplayer-topbar-action-cancel');
                 if (exitFullscreenButton) exitFullscreenButton.click();
                 return null;
             }
        } else {
            console.error("Document Handler: Could not find the final download link element ('a.ssplayer-virus-scan-container__download-button') within the dialog.");
            const exitFullscreenButton = document.querySelector('.ssplayer-presentation-player.ssplayer-fullscreen button.ssplayer-topbar-action-cancel');
            if (exitFullscreenButton) exitFullscreenButton.click();
            return null;
        }

    } catch (error) {
        console.error("Document Handler: Error during interactive document handling:", error);
         try {
            const exitFullscreenButton = document.querySelector('.ssplayer-presentation-player.ssplayer-fullscreen button.ssplayer-topbar-action-cancel');
            if (exitFullscreenButton) exitFullscreenButton.click();
        } catch (exitError) { }
        return null;
    }
}

// --- Enhanced Main Scraping Logic ---
async function scrapeLatestPostData() {
    const postElement = findLatestPostElement();
    if (!postElement) {
        return { error: "Could not find the latest post element.", postId: `error_${Date.now()}` };
    }

    const postIdAttribute = postElement.getAttribute('data-urn') || postElement.getAttribute('data-entity-urn');
    const postId = postIdAttribute || `post_${Date.now()}`;
    console.log("[Scraper] Extracted Post ID:", postId);

    // Add auto-like before scraping (optional - comment out if not desired)
    const reactionAdded = await preCheckAndReact(postElement);
    console.log(`[Scraper] Pre-scrape reaction ${reactionAdded ? 'added successfully' : 'not added'}`);

    const postData = {
        postId: postId,
        postText: '',
        imageUrls: [],
        documentUrl: null,
        error: null,
        preReacted: reactionAdded // Track if we've already added a reaction
    };

    try {
        const textElement = postElement.querySelector('.feed-shared-update-v2__description .update-components-text, .update-components-text .text-view');
        postData.postText = textElement ? textElement.innerText.trim() : '';
        console.log("Post Text:", postData.postText || "N/A");

        const docIndicator = postElement.querySelector('div.native-document-container, iframe[src*="native-document.html"]');
        if (docIndicator) {
             console.log("Document indicator found, attempting interactive handling...");
             postData.documentUrl = await handleDocumentPost(postElement);
        } else {
             console.log("No document indicator found.");
        }

        if (!postData.documentUrl) {
            console.log("No document URL obtained. Checking for images.");
            const imageSelector = `
                .feed-shared-update-v2__content img.update-components-image__image,
                .feed-shared-update-v2__content img.ivm-view-attr__img--centered:not(.update-components-actor__avatar-image):not(.ghost-person):not([class*='EntityPhoto-circle']),
                .feed-shared-article__featured-image img,
                .feed-shared-article__scroll-container img
            `;
            const imageElements = postElement.querySelectorAll(imageSelector);

            imageElements.forEach((img, index) => {
                const delayedSrc = img.dataset.delayedUrl || img.dataset.src;
                const currentSrc = img.src;
                const effectiveSrc = delayedSrc || currentSrc;

                console.log(`Image Element ${index + 1}: effectiveSrc='${effectiveSrc}', classList='${img.classList}'`);

                if (effectiveSrc && !effectiveSrc.startsWith('data:')) {
                     try {
                        const absoluteUrl = new URL(effectiveSrc, window.location.href).href;
                        if (img.naturalWidth > 50 && img.naturalHeight > 50) {
                             console.log(`  -> Adding image URL: ${absoluteUrl}`);
                             postData.imageUrls.push(absoluteUrl);
                        } else if (img.width > 50 && img.height > 50) {
                             console.log(`  -> Adding image URL (using element dimensions): ${absoluteUrl}`);
                             postData.imageUrls.push(absoluteUrl);
                        } else {
                             console.log(`  -> Skipping image (too small): ${absoluteUrl}`);
                        }
                     } catch (e) {
                         console.warn(`  -> Invalid image URL found: ${effectiveSrc}`);
                     }
                } else {
                    console.log(`  -> Skipping image element ${index + 1} (data URI or no src).`);
                }
            });
            postData.imageUrls = [...new Set(postData.imageUrls)];
            console.log("Final Image URLs:", postData.imageUrls.length > 0 ? postData.imageUrls : "N/A");
        } else {
             console.log("Document URL obtained via interaction. Skipping image check.");
        }

        if (!postData.postText && postData.imageUrls.length === 0 && !postData.documentUrl) {
            console.log("Post has no text, images, or document. Sending minimal data.");
        }

    } catch (scrapeError) {
        console.error("Error during scraping content (text/images/doc handling):", scrapeError);
        postData.error = `Content scraping error: ${scrapeError.message}`;
    }

    return postData;
}

// --- Comment Posting Logic ---
async function postCommentById(postId, commentText) {
    console.log(`Looking for post container with URN: ${postId}`);
    const targetPost = document.querySelector(`.feed-shared-update-v2[data-urn="${postId}"]`);

    if (!targetPost) {
        console.error(`Cannot find post container with URN ${postId}.`);
        return false;
    }
    console.log("Found target post container:", targetPost);

    targetPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(getRandomDelay(500, 1000));

    const commentButton = targetPost.querySelector('button.comment-button, button[aria-label*="Comment"]');
    if (!commentButton) {
        console.error("Cannot find comment button for the post:", postId);
        return false;
    }
    console.log("Found comment button:", commentButton);

    console.log("Clicking comment button to reveal input...");
    commentButton.click();

    let commentBox = null;
    let commentBoxAttempts = 0;
    const maxCommentBoxAttempts = 10;
    while (!commentBox && commentBoxAttempts < maxCommentBoxAttempts) {
        await sleep(500);
        commentBox = targetPost.querySelector('.ql-editor[data-placeholder="Add a comment…"]');
        commentBoxAttempts++;
        if (commentBox) {
             console.log("Found comment input box after clicking button.");
        } else {
             console.log(`Comment box not found yet (Attempt ${commentBoxAttempts}/${maxCommentBoxAttempts})`);
             if (commentBoxAttempts === 3) commentButton.click();
        }
    }

    if (!commentBox) {
        console.error("Cannot find comment input box after multiple attempts for post:", postId);
        return false;
    }

    commentBox.focus();
    await sleep(getRandomDelay(200, 500));

    if (commentBox.isContentEditable) {
         commentBox.innerHTML = `<p>${commentText.replace(/\n/g, '</p><p>')}</p>`;
    } else {
         commentBox.value = commentText;
    }
    commentBox.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    commentBox.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    console.log("Comment text inserted into box:", commentText);
    await sleep(getRandomDelay(500, 1000));

    let postButton = null;
    let postButtonAttempts = 0;
    const maxPostButtonAttempts = 6;
    while (!postButton && postButtonAttempts < maxPostButtonAttempts) {
        postButton = targetPost.querySelector('button.comments-comment-box__submit-button--cr');

        if (!postButton) {
            const buttons = targetPost.querySelectorAll('button.artdeco-button--primary');
            buttons.forEach(btn => {
                const buttonText = (btn.innerText || btn.textContent || '').trim();
                if (buttonText.toLowerCase() === 'comment') {
                    postButton = btn;
                }
            });
        }

        if (postButton) {
            console.log("Found post/comment button:", postButton);
            break;
        } else {
            postButtonAttempts++;
            console.log(`Post/Comment button not found yet (Attempt ${postButtonAttempts}/${maxPostButtonAttempts})`);
            await sleep(500);
        }
    }

    if (!postButton) {
        console.error("Cannot find post/comment button after multiple attempts for post:", postId);
        return false;
    }

    if (!postButton.disabled) {
        console.log("Clicking post/comment button...");
        postButton.click();
        console.log("Post/comment button clicked for post:", postId);
        await sleep(getRandomDelay(2000, 4000));
        return true;
    } else {
        console.error("Post/comment button is disabled for post:", postId);
        await sleep(1000);
        if (!postButton.disabled){
             console.log("Clicking post/comment button after extra delay...");
             postButton.click();
             console.log("Post/comment button clicked for post:", postId);
             await sleep(getRandomDelay(2000, 4000));
             return true;
        } else {
             console.error("Post/comment button remained disabled for post:", postId);
             return false;
        }
    }
}

// --- Enhanced Comment Posting Logic ---
async function postCommentToLatest(commentText, postId) {
    console.log(`Attempting to post comment to post ID ${postId}: "${commentText}"`);
    let postElement;

    try {
        // Find the specific post using the postId (URN)
        postElement = document.querySelector(`[data-urn="${postId}"], [data-entity-urn="${postId}"]`);
        if (!postElement) {
            console.error(`Post Comment Error: Could not find post element with ID ${postId}.`);
            return { success: false, error: `Could not find post element with ID ${postId}.` };
        }
        console.log("Post Comment: Found post element.");

        // Find the comment button and click it
        const commentButton = postElement.querySelector('button[aria-label*="comment" i], button[aria-label*="Comment" i]');
        if (!commentButton) {
            console.error("Post Comment Error: Could not find comment button for the post.");
            return { success: false, error: "Could not find comment button." };
        }
        console.log("Post Comment: Clicking comment button...");
        commentButton.click();
        
        // Wait longer, randomized, for comment box to fully initialize
        await sleep(getRandomDelay(2500, 4000)); // Increased and randomized

        // Find the comment input field - try multiple selector strategies
        let commentBox = null;
        const selectors = [
            '.comments-comment-box__editor .ql-editor[contenteditable="true"]',
            '.comments-comment-box__editor div[role="textbox"]',
            '.comments-comment-texteditor__content div[role="textbox"]',
            'div[data-placeholder="Add a comment…"]',
            '.comments-comment-box__editor' // Fallback to general container
        ];

        for (const selector of selectors) {
            const element = postElement.querySelector(selector);
            if (element) {
                commentBox = element;
                console.log(`Post Comment: Found comment box using selector: ${selector}`);
                break;
            }
        }

        if (!commentBox) {
            console.error("Post Comment Error: Could not find comment input box after clicking button.");
            return { success: false, error: "Could not find comment input box." };
        }

        // Focus and simulate more realistic typing
        commentBox.focus();
        await sleep(getRandomDelay(400, 800)); // Randomized short delay
        
        // Use more reliable input method
        if (commentBox.isContentEditable) {
            // For contentEditable elements - simulate typing more naturally
            commentBox.innerHTML = '';  // Clear any existing content
            
            // Dispatch events that LinkedIn's handlers are expecting
            const inputEvent = new InputEvent('input', { 
                bubbles: true,
                cancelable: true,
                data: commentText
            });
            
            // Set content and fire events
            commentBox.textContent = commentText;
            commentBox.dispatchEvent(inputEvent);
            commentBox.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            // For regular input fields
            commentBox.value = commentText;
            commentBox.dispatchEvent(new Event('input', { bubbles: true }));
            commentBox.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // Wait before submitting - randomized and potentially longer
        await sleep(getRandomDelay(1500, 3000)); // Randomized

        // FIXED SUBMIT BUTTON DETECTION - Look for both Post and Comment buttons
        let submitButton = null;
        
        // Step 1: Try to find a "Post" button first - FIXED SELECTORS
        const postButtonSelectors = [
            'button.comments-comment-box__submit-button[type="submit"]',
            'button.comments-comment-box__submit-button:not([type="submit"])',
            'button.comments-comment-box__submit-button--cr',
            'button.mt3.artdeco-button--primary',
            'button.artdeco-button.artdeco-button--1.artdeco-button--primary',
            'button.comments-comment-box__submit-button'
            // Removed invalid :contains() selector
        ];
        
        for (const selector of postButtonSelectors) {
            const candidates = postElement.querySelectorAll(selector);
            console.log(`Post Comment: Checking selector: ${selector}, found ${candidates.length} elements`);
            
            for (const btn of candidates) {
                // Check button text after selection instead of in the selector
                const buttonText = (btn.textContent || btn.innerText || '').trim().toLowerCase();
                const spanElement = btn.querySelector('span.artdeco-button__text');
                const spanText = spanElement ? (spanElement.textContent || '').trim().toLowerCase() : '';
                
                console.log(`Post Comment: Button text="${buttonText}", span text="${spanText}"`);
                
                // Check for either "post" or "comment" text
                if (buttonText.includes('post') || buttonText.includes('comment') || 
                    spanText.includes('post') || spanText.includes('comment')) {
                    console.log(`Post Comment: Found submit button with text "${buttonText || spanText}"`);
                    submitButton = btn;
                    break;
                }
            }
            if (submitButton) break;
        }
        
        // Step 2: If no button found yet, try more generic approach with the example HTML structure
        if (!submitButton) {
            console.log("Post Comment: No specific button found, trying more generic approach...");
            
            // Look specifically for the HTML structure in the provided example
            const commentButtonSelectors = [
                'button.comments-comment-box__submit-button--cr.artdeco-button.artdeco-button--1.artdeco-button--primary',
                'div.display-flex.align-items-center button.artdeco-button--primary'
            ];
            
            for (const selector of commentButtonSelectors) {
                const candidates = document.querySelectorAll(selector);
                console.log(`Post Comment: Checking generic selector: ${selector}, found ${candidates.length} elements`);
                
                if (candidates.length > 0) {
                    // Use the first match since these are very specific selectors
                    submitButton = candidates[0];
                    console.log(`Post Comment: Found submit button with generic selector`);
                    break;
                }
            }
        }
        
        // Step 3: Last resort - unchanged from original
        if (!submitButton) {
            console.log("Post Comment: Could not find specific 'Post' or 'Comment' button. Looking for any valid submit button...");
            
            // Try to find any button with primary styling in the comment section
            const commentContainer = postElement.querySelector('.comments-comment-box, .comments-comment-texteditor');
            if (commentContainer) {
                const allButtons = commentContainer.querySelectorAll('button.artdeco-button--primary:not([disabled])');
                console.log(`Post Comment: Found ${allButtons.length} primary buttons in comment container`);
                
                if (allButtons.length > 0) {
                    // Use the last primary button as it's likely the submit button
                    submitButton = allButtons[allButtons.length - 1];
                    console.log(`Post Comment: Using fallback primary button: "${submitButton.textContent.trim()}"`);
                }
            }
        }

        // Check if we found a submit button
        if (!submitButton) {
            console.error("Post Comment Error: Could not find any valid submit button.");
            
            // Debug information for future updates
            const buttons = postElement.querySelectorAll('button');
            console.log(`Post Comment Debug: Found ${buttons.length} total buttons in the post element.`);
            
            if (buttons.length > 0) {
                console.log("Post Comment Debug: Available buttons:");
                Array.from(buttons).forEach((btn, i) => {
                    const id = btn.id || 'no-id';
                    const classes = btn.className;
                    const text = btn.textContent.trim();
                    console.log(`Button ${i+1}: id="${id}", classes="${classes}", text="${text}"`);
                });
            }
            
            return { success: false, error: "Could not find post/comment submit button." };
        }

        // Check if button is disabled
        if (submitButton.disabled || submitButton.classList.contains('disabled') || 
            submitButton.getAttribute('aria-disabled') === 'true') {
            console.error("Post Comment Error: Submit button is disabled.");
            return { success: false, error: "Submit button is disabled." };
        }

        await sleep(getRandomDelay(800, 1500));
        console.log("Post Comment: Clicking submit button...");
        submitButton.click();
        
        // Wait for comment to be posted
        await sleep(getRandomDelay(3500, 5500));

        try {
            // Verify if comment was posted
            const commentNodes = postElement.querySelectorAll('.comments-comment-item__content-body');
            let commentPosted = false;
            
            for (const node of commentNodes) {
                const nodeText = node.textContent.trim();
                if (nodeText.includes(commentText.substring(0, 30))) {
                    commentPosted = true;
                    break;
                }
            }
            
            if (commentPosted) {
                console.log("Post Comment: Comment successfully posted and verified.");
                return { success: true };
            } else {
                console.warn("Post Comment Warning: Could not verify if comment was posted.");
                return { success: true, warning: "Comment may have been posted but couldn't be verified." };
            }
        } catch (verifyError) {
            console.warn("Post Comment Warning: Error during comment verification:", verifyError);
            return { success: true, warning: "Clicked post button but couldn't verify comment" };  
        }

    } catch (error) {
        console.error("Post Comment Error:", error);
        return { success: false, error: `Error posting comment: ${error.message}` };
    }
}

// --- Improved Reaction Logic ---
async function reactToPost(postElement, reactionType = 'Like') {
    console.log(`[React] Attempting to react with '${reactionType}'...`);
    if (!postElement) {
        console.error("[React] Error: Invalid post element provided.");
        return false;
    }

    // Find the reaction button container with more specific and reliable selectors
    const containerSelectors = [
        'span.reactions-react-button',
        '.feed-shared-social-action-bar__action-button', 
        '.social-actions-button',
        '[data-test-id="social-actions"]',
        '.feed-shared-social-action-bar', // More general container
        '.feed-shared-social-actions' // Another potential container
    ];
    
    let container = null;
    for (const selector of containerSelectors) {
        container = postElement.querySelector(selector);
        if (container) {
            console.log(`[React] Found reaction container with selector: ${selector}`);
            break;
        }
    }
    
    if (!container) {
        console.error("[React] Failed to find any reaction container");
        // Try the whole post element as a fallback
        container = postElement;
        console.log("[React] Falling back to using the entire post element");
    }
    
    // Take screenshot of container area to debug (uncomment if needed)
    // try {
    //    console.log("[React] Container HTML:", container.outerHTML);
    // } catch (e) {}

    // SIMPLIFIED APPROACH FOR ALL REACTIONS: Click directly first
    console.log(`[React] Using direct click approach for ${reactionType}`);
    
    // Try to find all reaction buttons in the post
    const allButtonSelectors = [
        'button.react-button__trigger',
        'button[aria-label*="Like"]',
        'button[aria-label*="React"]',
        'button.social-actions-button',
        'button.feed-shared-social-action-bar__action-button'
    ];
    
    // Log all found buttons for debugging
    console.log("[React] Scanning for all reaction buttons:");
    for (const selector of allButtonSelectors) {
        const buttons = container.querySelectorAll(selector);
        if (buttons.length > 0) {
            console.log(`[React] Found ${buttons.length} buttons with selector: ${selector}`);
            for (let i = 0; i < buttons.length; i++) {
                const btn = buttons[i];
                console.log(`[React] Button ${i+1} - aria-label: "${btn.getAttribute('aria-label')}", text: "${btn.textContent.trim()}"`);
            }
        }
    }
    
    // Try to find a specific button for the reaction type first
    let targetButton = null;
    
    // Try to find a button that matches our reaction type
    if (reactionType !== 'Like') {
        targetButton = container.querySelector(`button[aria-label*="${reactionType}"]`);
    }
    
    // If specific reaction button not found, fall back to main Like button
    if (!targetButton) {
        for (const selector of allButtonSelectors) {
            const buttons = container.querySelectorAll(selector);
            for (const btn of buttons) {
                // Check if this could be the main reaction button
                const label = btn.getAttribute('aria-label') || '';
                const text = btn.textContent.trim();
                
                if (reactionType === 'Like' && (label.includes('Like') || text.includes('Like'))) {
                    targetButton = btn;
                    console.log(`[React] Found Like button: ${label}`);
                    break;
                } else if (!targetButton && (label.includes('React') || label.includes('Like'))) {
                    // Fall back to any reaction button if we can't find a specific one
                    targetButton = btn;
                    console.log(`[React] Found fallback reaction button: ${label}`);
                }
            }
            if (targetButton) break;
        }
    }
    
    if (!targetButton) {
        console.error("[React] Could not find any reaction button");
        return false;
    }
    
    console.log(`[React] Found target button: ${targetButton.getAttribute('aria-label') || targetButton.textContent.trim()}`);
    
    // Try multiple click approaches
    try {
        console.log("[React] Executing primary click on target button...");
        targetButton.click();
        await sleep(1500); // Wait after click
        
        // For non-Like reactions, we need to open the reaction menu and select the specific reaction
        if (reactionType !== 'Like') {
            // Check if menu is now visible
            let reactionMenu = document.querySelector('.reactions-menu, .reactions-menu--active, [class*="reactions-menu"]');
            
            // If menu not visible, try mouseover or long press
            if (!reactionMenu) {
                console.log("[React] Reaction menu not visible. Trying mouseover event...");
                targetButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                await sleep(2000); // Wait longer for menu
                
                reactionMenu = document.querySelector('.reactions-menu, .reactions-menu--active, [class*="reactions-menu"]');
                
                // If still no menu, try mousedown (like long press)
                if (!reactionMenu) {
                    console.log("[React] Trying mousedown event...");
                    targetButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    await sleep(2000);
                    
                    reactionMenu = document.querySelector('.reactions-menu, .reactions-menu--active, [class*="reactions-menu"]');
                }
            }
            
            // If menu found, find and click the specific reaction
            if (reactionMenu) {
                console.log("[React] Reaction menu found:", reactionMenu);
                
                // Log all buttons in the menu
                const menuButtons = reactionMenu.querySelectorAll('button');
                console.log(`[React] Found ${menuButtons.length} buttons in the reaction menu`);
                
                menuButtons.forEach((btn, i) => {
                    const btnLabel = btn.getAttribute('aria-label') || '';
                    console.log(`[React] Menu button ${i+1}: "${btnLabel}", text: "${btn.textContent.trim()}"`);
                });
                
                // Try to find our specific reaction button
                const specificReactionBtn = Array.from(menuButtons).find(btn => {
                    const btnLabel = btn.getAttribute('aria-label') || '';
                    const btnText = btn.textContent.trim();
                    return btnLabel.includes(reactionType) || btnText.includes(reactionType);
                });
                
                if (specificReactionBtn) {
                    console.log(`[React] Found ${reactionType} button in menu. Clicking...`);
                    specificReactionBtn.click();
                    await sleep(2000); // Wait after the reaction click
                    return true;
                } else {
                    console.warn(`[React] Could not find ${reactionType} in menu. Using fallback...`);
                    // Just click the main button again as fallback
                    targetButton.click();
                    return true;
                }
            } else {
                console.warn("[React] Could not open reaction menu. Using simple click...");
                // Just use the original click result
                return true;
            }
        } else {
            // For Like, the simple click should be sufficient
            console.log("[React] Simple Like reaction attempted.");
            return true;
        }
    } catch (error) {
        console.error("[React] Error during reaction process:", error);
        return false;
    } finally {
        // Clean up any open menus by clicking elsewhere on the page
        try {
            document.body.dispatchEvent(new MouseEvent('click', { 
                bubbles: true, 
                cancelable: true,
                clientX: 1,  // Click far from reaction menu
                clientY: 1
            }));
        } catch (e) {}
    }
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[Content Script] Received message:", request);
    if (request.action === "scrapeLatestPost") {
        scrapeLatestPostData()
            .then(data => {
                console.log("[Content Script] Sending scraped data back to background:", data);
                // Make sure to include the preReacted flag in the response
                sendResponse(data);
            })
            .catch(error => {
                console.error("[Content Script] Unexpected error in scrapeLatestPost promise chain:", error);
                sendResponse({ 
                    success: false, 
                    error: `Unexpected content script error: ${error.message}`, 
                    postId: `unexpected_error_${Date.now()}` 
                });
            });
        return true; // Keep async channel open
    } else if (request.action === "postComment") {
        (async () => {
            let finalResult = { success: false, error: "Processing started but not completed.", reactionSuccess: false };
            try {
                const postElement = document.querySelector(`[data-urn="${request.postId}"], [data-entity-urn="${request.postId}"]`);
                if (!postElement) {
                    throw new Error(`[Content Script] Could not find post element with ID ${request.postId} for reaction/comment.`);
                }
                console.log(`[Content Script] Found post element for ID ${request.postId}`);

                // --- React First ---
                let reactionSuccess = false;
                if (request.reactionType) {
                    console.log(`[Content Script] Received request to react with: ${request.reactionType}`);
                    try {
                        reactionSuccess = await reactToPost(postElement, request.reactionType);
                        finalResult.reactionSuccess = reactionSuccess; // Add to final result
                        
                        if (reactionSuccess) {
                            console.log(`[Content Script] Reaction attempt successful (${request.reactionType}). Proceeding to comment.`);
                            await sleep(getRandomDelay(700, 1200));
                        } else {
                            console.warn(`[Content Script] Reaction attempt failed (${request.reactionType}). Proceeding to comment anyway.`);
                            await sleep(getRandomDelay(1000, 1500));
                        }
                    } catch (reactError) {
                        console.error("[Content Script] Error during reaction attempt:", reactError);
                        // Log error but continue with comment
                    }
                } else {
                    console.log("[Content Script] No reactionType provided, skipping reaction.");
                }
                // --- End React ---

                // --- Post Comment ---
                console.log("[Content Script] Proceeding to post comment...");
                const commentResult = await postCommentToLatest(request.commentText, request.postId);
                
                // Merge comment result with reaction success
                finalResult = { 
                    ...commentResult, 
                    reactionSuccess: reactionSuccess
                };
                
                console.log("[Content Script] Final result:", finalResult);
                // --- End Post Comment ---

            } catch (error) {
                console.error("[Content Script] Error during reaction or comment process:", error);
                finalResult = { 
                    success: false, 
                    error: `Error in content script: ${error.message}`,
                    reactionSuccess: false 
                };
            } finally {
                if (typeof finalResult === 'undefined') {
                    finalResult = { 
                        success: false, 
                        error: "Result was undefined in content script.",
                        reactionSuccess: false 
                    };
                }
                console.log("[Content Script] Sending response to background:", finalResult);
                sendResponse(finalResult);
            }
        })();
        return true; // Crucial: Keep message channel open for async sendResponse
    }
    console.warn("[Content Script] Unhandled action:", request.action);
    return false; // No async response needed for unhandled actions
});

console.log("LinkedIn AI Commenter: Content script setup complete.");
