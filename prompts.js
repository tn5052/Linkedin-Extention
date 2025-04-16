// Default high-quality prompts and business context
const DEFAULT_PROMPTS = {
    visionPrompt: `Analyze this image from a LinkedIn post. Objectively describe the key visual elements, people, charts, text, and any relevant business context. Focus on professional details that would matter for networking engagement. Be concise (50 words or less).`,
    
    commentPrompt: `You are an AI assistant helping me react and comment on LinkedIn posts professionally.
My business context: \${businessContext}

The LinkedIn post text is:
"\${postText}"

\${imageContext}

Instructions:
1.  First, choose the *single most appropriate* reaction for this post from the following list: [Like, Celebrate, Support, Love, Insightful, Funny]. Consider the post's tone, content and professional context.
2.  Second, generate a short (2-3 sentences), relevant, engaging, and professional comment for this specific post.
3.  Ensure the comment adds value through: a thoughtful question, a related insight, or an authentic connection to the topic.
4.  Use a warm, professional tone that builds rapport. Relate subtly to my business context ONLY if there's a genuine, non-forced connection.
5.  Avoid generic phrases like "Great post!" or "Thanks for sharing!". Focus on specific elements from the post.
6.  Do NOT include hashtags unless they're essential to the conversation.
7.  Do NOT mention being an AI or refer to "analyzing" the post.

Format your response exactly like this:
Reaction: [Your Chosen Reaction]
Comment: [Your Generated Comment]`,

    // Default business context example
    businessContext: `I'm a digital marketing consultant specializing in content strategy and SEO for B2B technology companies. My expertise includes content optimization, marketing analytics, and creating data-driven strategies. I aim to build relationships with technology professionals and marketing leaders by sharing actionable insights. My tone should be professional yet conversational, focusing on practical applications rather than theoretical concepts.`
};

// Variable definitions for highlighting with improved mapping
const VARIABLES = {
    'postText': { class: 'var-postText', description: 'LinkedIn post content' },
    'imageContext': { class: 'var-imageContext', description: 'Image analysis result' },
    'businessContext': { class: 'var-businessContext', description: 'Your business information' }
};

// Initialize the page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const visionPromptArea = document.getElementById('visionPrompt');
    const commentPromptArea = document.getElementById('commentPrompt');
    const businessContextArea = document.getElementById('businessContext');
    const saveAllButton = document.getElementById('saveAllPrompts');
    const resetAllButton = document.getElementById('resetAllPrompts');
    const backButton = document.getElementById('backToPopup');
    const varCounter = document.getElementById('varCount');
    const businessContextCounter = document.getElementById('businessContextCount');
    
    // Load existing prompts and business context from storage
    loadPrompts();
    
    // Setup event listeners for buttons
    saveAllButton.addEventListener('click', saveAllPrompts);
    resetAllButton.addEventListener('click', resetAllPrompts);
    backButton.addEventListener('click', () => window.location.href = 'popup.html');
    
    // Setup individual reset buttons
    const resetButtons = document.querySelectorAll('.reset-button');
    resetButtons.forEach(button => {
        button.addEventListener('click', () => {
            const promptType = button.dataset.promptType;
            resetPrompt(promptType);
        });
    });
    
    // Setup syntax highlighting for textareas
    setupEnhancedHighlighting(visionPromptArea);
    setupEnhancedHighlighting(commentPromptArea);
    
    // Setup variable tracking and character counter
    commentPromptArea.addEventListener('input', () => {
        countAndDisplayVariables(commentPromptArea.value, varCounter);
    });
    
    // Setup character counter for business context
    if (businessContextArea) {
        businessContextArea.addEventListener('input', () => {
            countAndDisplayCharacters(businessContextArea.value, businessContextCounter);
        });
    }
});

// Load prompts and business context from storage
function loadPrompts() {
    const visionPromptArea = document.getElementById('visionPrompt');
    const commentPromptArea = document.getElementById('commentPrompt');
    const businessContextArea = document.getElementById('businessContext');
    const varCounter = document.getElementById('varCount');
    const businessContextCounter = document.getElementById('businessContextCount');
    
    chrome.storage.local.get(['customPrompts', 'businessContext'], (result) => {
        const customPrompts = result.customPrompts || {};
        
        // Set vision prompt
        visionPromptArea.value = customPrompts.visionPrompt || DEFAULT_PROMPTS.visionPrompt;
        
        // Set comment prompt
        commentPromptArea.value = customPrompts.commentPrompt || DEFAULT_PROMPTS.commentPrompt;
        
        // Set business context (from main storage or from customPrompts)
        if (businessContextArea) {
            const savedBusinessContext = result.businessContext || customPrompts.businessContext || DEFAULT_PROMPTS.businessContext;
            businessContextArea.value = savedBusinessContext;
            countAndDisplayCharacters(savedBusinessContext, businessContextCounter);
        }
        
        // Count variables in the loaded comment prompt
        countAndDisplayVariables(commentPromptArea.value, varCounter);
    });
}

// Save all prompts and business context to storage
function saveAllPrompts() {
    const visionPrompt = document.getElementById('visionPrompt').value;
    const commentPrompt = document.getElementById('commentPrompt').value;
    const businessContext = document.getElementById('businessContext')?.value || '';
    
    // Validation - ensure prompts aren't empty
    if (!visionPrompt.trim()) {
        showNotification("Vision prompt cannot be empty", "error");
        return;
    }
    
    if (!commentPrompt.trim()) {
        showNotification("Comment prompt cannot be empty", "error");
        return;
    }
    
    // Save to storage - both in customPrompts and main storage for business context
    const customPrompts = { 
        visionPrompt, 
        commentPrompt,
        businessContext // Also store in customPrompts for consistency
    };
    
    // Use Promise.all to ensure both storage operations complete
    Promise.all([
        new Promise(resolve => chrome.storage.local.set({ customPrompts }, resolve)),
        new Promise(resolve => chrome.storage.local.set({ businessContext }, resolve))
    ]).then(() => {
        showNotification("All prompts and business context saved successfully", "success");
    }).catch(error => {
        console.error("Error saving settings:", error);
        showNotification("Failed to save settings", "error");
    });
}

// Reset all prompts to defaults
function resetAllPrompts() {
    if (confirm('Reset all prompts and business context to defaults? This will overwrite your custom prompts.')) {
        document.getElementById('visionPrompt').value = DEFAULT_PROMPTS.visionPrompt;
        document.getElementById('commentPrompt').value = DEFAULT_PROMPTS.commentPrompt;
        
        // Reset business context if it exists
        const businessContextArea = document.getElementById('businessContext');
        if (businessContextArea) {
            businessContextArea.value = DEFAULT_PROMPTS.businessContext;
            countAndDisplayCharacters(
                DEFAULT_PROMPTS.businessContext, 
                document.getElementById('businessContextCount')
            );
        }
        
        // Update variable count for comment prompt
        countAndDisplayVariables(
            DEFAULT_PROMPTS.commentPrompt, 
            document.getElementById('varCount')
        );
        
        // Save defaults to storage (both customPrompts and main businessContext)
        Promise.all([
            new Promise(resolve => chrome.storage.local.set({ customPrompts: DEFAULT_PROMPTS }, resolve)),
            new Promise(resolve => chrome.storage.local.set({ businessContext: DEFAULT_PROMPTS.businessContext }, resolve))
        ]).then(() => {
            showNotification("All prompts reset to defaults", "success");
        }).catch(error => {
            console.error("Error resetting prompts:", error);
            showNotification("Failed to reset prompts", "error");
        });
    }
}

// Reset a specific prompt
function resetPrompt(promptType) {
    if (confirm(`Reset the ${promptType} to default?`)) {
        const defaultKey = promptType === 'businessContext' ? 'businessContext' : `${promptType}Prompt`;
        const textarea = document.getElementById(promptType === 'businessContext' ? 'businessContext' : `${promptType}Prompt`);
        
        if (textarea) {
            textarea.value = DEFAULT_PROMPTS[defaultKey];
            
            // Update character count or variable count
            if (promptType === 'businessContext') {
                countAndDisplayCharacters(
                    DEFAULT_PROMPTS.businessContext, 
                    document.getElementById('businessContextCount')
                );
                
                // Save to both storages
                Promise.all([
                    new Promise(resolve => {
                        chrome.storage.local.get(['customPrompts'], result => {
                            const customPrompts = result.customPrompts || {};
                            customPrompts.businessContext = DEFAULT_PROMPTS.businessContext;
                            chrome.storage.local.set({ customPrompts }, resolve);
                        });
                    }),
                    new Promise(resolve => {
                        chrome.storage.local.set({ businessContext: DEFAULT_PROMPTS.businessContext }, resolve)
                    })
                ]).then(() => {
                    showNotification(`Business context reset to default`, "success");
                });
            } else if (promptType === 'comment') {
                countAndDisplayVariables(
                    DEFAULT_PROMPTS.commentPrompt, 
                    document.getElementById('varCount')
                );
                
                // Update just customPrompts
                chrome.storage.local.get(['customPrompts'], result => {
                    const customPrompts = result.customPrompts || {};
                    customPrompts[`${promptType}Prompt`] = DEFAULT_PROMPTS[`${promptType}Prompt`];
                    chrome.storage.local.set({ customPrompts }, () => {
                        showNotification(
                            `${promptType.charAt(0).toUpperCase() + promptType.slice(1)} prompt reset to default`,
                            "success"
                        );
                    });
                });
            } else {
                // Vision prompt or other prompts
                chrome.storage.local.get(['customPrompts'], result => {
                    const customPrompts = result.customPrompts || {};
                    customPrompts[`${promptType}Prompt`] = DEFAULT_PROMPTS[`${promptType}Prompt`];
                    chrome.storage.local.set({ customPrompts }, () => {
                        showNotification(
                            `${promptType.charAt(0).toUpperCase() + promptType.slice(1)} prompt reset to default`,
                            "success"
                        );
                    });
                });
            }
        }
    }
}

// Count and display character count for business context
function countAndDisplayCharacters(text, counterElement) {
    if (!counterElement) return 0;
    
    const charCount = text ? text.length : 0;
    counterElement.textContent = charCount.toLocaleString();
    
    // Add tooltip with guidance if too short or long
    if (charCount < 100) {
        counterElement.setAttribute('title', 'Consider adding more details for better results (aim for 200-500 characters)');
        counterElement.classList.add('warning');
    } else if (charCount > 1000) {
        counterElement.setAttribute('title', 'Consider shortening to focus on key information (aim for 200-500 characters)');
        counterElement.classList.add('warning');
    } else {
        counterElement.removeAttribute('title');
        counterElement.classList.remove('warning');
    }
    
    return charCount;
}

// Setup enhanced syntax highlighting with HTML overlay
function setupEnhancedHighlighting(textarea) {
    if (!textarea) return;
    
    // Create wrapper to maintain positioning context
    const wrapper = document.createElement('div');
    wrapper.className = 'prompt-editor-wrapper';
    textarea.parentNode.insertBefore(wrapper, textarea);
    wrapper.appendChild(textarea);
    
    // Create highlight layer for colored variables
    const highlightLayer = document.createElement('div');
    highlightLayer.className = 'highlight-layer';
    wrapper.insertBefore(highlightLayer, textarea);
    
    // Update highlighting when text changes
    textarea.addEventListener('input', () => updateHighlights(textarea, highlightLayer));
    
    // Update highlighting on scroll to keep in sync
    textarea.addEventListener('scroll', () => {
        highlightLayer.scrollTop = textarea.scrollTop;
        highlightLayer.scrollLeft = textarea.scrollLeft;
    });
    
    // Initial highlighting
    updateHighlights(textarea, highlightLayer);
    
    return highlightLayer;
}

// Update the syntax highlighting in the overlay layer
function updateHighlights(textarea, highlightLayer) {
    if (!textarea || !highlightLayer) return;
    
    let content = textarea.value || '';
    
    // Escape HTML characters to prevent XSS
    content = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Replace variables with highlighted spans
    content = content.replace(/\${(\w+)}/g, (match, variableName) => {
        const varType = VARIABLES[variableName]?.class || 'var-unknown';
        return `<span class="var-highlight ${varType}">${match}</span>`;
    });
    
    // Replace line breaks with <br> for proper display
    content = content.replace(/\n/g, '<br>');
    
    // Add extra space at the end to ensure scrolling works correctly
    content += '<br>';
    
    // Update the highlight layer
    highlightLayer.innerHTML = content;
    
    // If this is the comment prompt, update the variable counter
    if (textarea.id === 'commentPrompt') {
        const counter = document.getElementById('varCount');
        if (counter) {
            countAndDisplayVariables(textarea.value, counter);
        }
    }
}

// Count variables in text and update counter element
function countAndDisplayVariables(text, counterElement) {
    if (!text || !counterElement) return 0;
    
    // Find all variable placeholders ${varName}
    const variableRegex = /\${(\w+)}/g;
    const uniqueVariables = new Set();
    let match;
    
    // Extract all unique variable names
    while ((match = variableRegex.exec(text)) !== null) {
        uniqueVariables.add(match[1]);
    }
    
    // Update counter with count
    counterElement.textContent = uniqueVariables.size;
    
    // Add tooltip with variable names
    if (uniqueVariables.size > 0) {
        const varList = Array.from(uniqueVariables).map(varName => {
            const varInfo = VARIABLES[varName] || { description: 'Unknown variable' };
            return `${varName} (${varInfo.description})`;
        });
        counterElement.setAttribute('title', `Found: ${varList.join(', ')}`);
    } else {
        counterElement.removeAttribute('title');
    }
    
    return uniqueVariables.size;
}

// Show notification
function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationContainer');
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Create close button
    const closeButton = document.createElement('button');
    closeButton.innerText = '×';
    closeButton.className = 'close-notification';
    closeButton.onclick = () => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    };
    
    // Add close button to notification
    notification.appendChild(closeButton);
    
    // Add to container
    container.appendChild(notification);
    
    // Show notification with animation
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Auto-hide after delay
    setTimeout(() => {
        if (notification.parentNode === container) {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode === container) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
}
