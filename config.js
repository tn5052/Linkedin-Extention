// Centralized configuration for AI models and prompts

// Use export to make the config object available for import
export const config = {
    // --- Model Names ---
    models: {
        text: 'gemini-2.0-flash', // Model for final comment generation (User Request)
        documentAnalysis: 'gemini-1.5-flash', // Model specifically for PDF analysis (Known to work)
        vision: 'pixtral-large-latest' // Model for image analysis
    },

    // --- Prompts ---
    prompts: {
        // Default prompts - these will be overridden by any custom prompts from storage
        defaultVisionPrompt: "Analyze this image from a LinkedIn post. Objectively describe the key visual elements, people, charts, text, and any relevant business context. Focus on professional details that would matter for networking engagement. Be concise (50 words or less).",
        
        // Updated comment prompt template to request reaction
        defaultCommentTemplate: (postText, analysisContext, userBusinessContext, analysisType = 'text_only') => {
            let analysisInstruction = 'text content';
            if (analysisType === 'document') analysisInstruction = 'document summary and text';
            if (analysisType === 'image') analysisInstruction = 'image description and text';
            if (analysisType === 'text_only_fallback') analysisInstruction = 'text content (as document/image analysis failed)';

            return `
You are an AI assistant helping me react and comment on LinkedIn posts professionally.
My business context: "${userBusinessContext || 'I am a professional looking to engage with content.'}"

The LinkedIn post text is:
"${postText || '[No text content provided]'}"

${analysisContext || '[No additional context from images/documents provided]'}

Instructions:
1.  First, choose the *single most appropriate* reaction for this post from the following list: [Like, Celebrate, Support, Love, Insightful, Funny]. Consider the post's tone, content and professional context.
2.  Second, generate a short (2-3 sentences), relevant, engaging, and professional comment for this specific post, based *directly* on the post's ${analysisInstruction}.
3.  Ensure the comment adds value through: a thoughtful question, a related insight, or an authentic connection to the topic.
4.  Use a warm, professional tone that builds rapport. Relate subtly to my business context ONLY if there's a genuine, non-forced connection.
5.  Avoid generic phrases like "Great post!" or "Thanks for sharing!". Focus on specific elements from the post.
6.  Do NOT include hashtags unless they're essential to the conversation.
7.  Do NOT mention being an AI or refer to "analyzing" the post.

Format your response exactly like this:
Reaction: [Your Chosen Reaction]
Comment: [Your Generated Comment]
            `.trim();
        },
        
        // Functions to get the current prompts - used by the background script
        // These will check storage for custom prompts first, then fall back to defaults
        getVisionPrompt: async () => {
            try {
                const { customPrompts } = await chrome.storage.local.get('customPrompts') || {};
                return (customPrompts && customPrompts.visionPrompt) || config.prompts.defaultVisionPrompt;
            } catch (error) {
                console.error("Error getting vision prompt from storage:", error);
                return config.prompts.defaultVisionPrompt;
            }
        },
        
        commentPromptTemplate: async (postText, analysisContext, userBusinessContext, analysisType = 'text_only') => {
            try {
                const { customPrompts } = await chrome.storage.local.get('customPrompts') || {};
                
                if (customPrompts && customPrompts.commentPrompt) {
                    // If custom prompt exists, replace variables with actual values
                    return customPrompts.commentPrompt
                        .replace(/\${postText}/g, postText || '[No text content provided]')
                        .replace(/\${businessContext}/g, userBusinessContext || 'I am a professional looking to engage with content.')
                        .replace(/\${imageContext}/g, analysisContext || '[No additional context from images/documents provided]');
                } else {
                    // Otherwise use the default template
                    return config.prompts.defaultCommentTemplate(postText, analysisContext, userBusinessContext, analysisType);
                }
            } catch (error) {
                console.error("Error getting comment prompt from storage:", error);
                return config.prompts.defaultCommentTemplate(postText, analysisContext, userBusinessContext, analysisType);
            }
        }
    },

    // --- API Generation Configuration ---
    generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2000 // Increased slightly for potentially better comments
    },

    // --- Safety Settings (Example - Adjust thresholds as needed) ---
    safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ],

    // --- Delays (in milliseconds) ---
    delays: {
        // Delay between processing different profiles
        betweenProfiles: {
            min: 180000, // 3 minutes
            max: 600000  // 10 minutes
        },
        // Short delays for actions within a profile (navigation, scraping, posting)
        // These are often handled directly in background.js/content.js but can be centralized
        // Example:
        // actionDelay: {
        //     min: 2000, // 2 seconds
        //     max: 5000  // 5 seconds
        // }
    }
};

// Initialize by loading any custom prompts from storage into the config
(async function initializeConfig() {
    try {
        const { customPrompts } = await chrome.storage.local.get('customPrompts') || {};
        if (customPrompts) {
            console.log("Loaded custom prompts into config");
        }
    } catch (error) {
        console.error("Error initializing config with custom prompts:", error);
    }
})();
