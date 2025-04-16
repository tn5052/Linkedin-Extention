# LinkedIn Commenting AI Agent - Plan

## 1. Goal and Scope

*   **Objective:** Develop an AI agent to automate the process of commenting on the latest LinkedIn posts of specified user profiles.
*   **Functionality:**
    *   Navigate to target LinkedIn profiles.
    *   Identify and extract text content from the latest post.
    *   Identify and analyze images within the latest post.
    *   Incorporate user-provided knowledge about their business(es).
    *   Utilize AI (LLMs) to generate relevant, engaging comments based on post content, images, and business context.
    *   Post the generated comment to LinkedIn.
*   **Constraints:**
    *   Prioritize simplicity and functionality ("simple, basic, but effective").
    *   Aim for a low-cost or free implementation ("free way").
    *   Operate autonomously after initial setup.

## 2. Technology Stack

*   **Platform:** Chrome Extension
    *   *Rationale:* Operates within the user's authenticated browser session, potentially reducing detection risks compared to external bots. Simpler infrastructure setup.
*   **Primary Language:** JavaScript
    *   *Rationale:* Native language for Chrome Extensions (Content Scripts, Background Scripts, Popup UI).
*   **AI - Text Processing & Comment Generation:** Google Gemini Pro API
    *   *Rationale:* Powerful language model, offers a free tier suitable for low-volume use, aligns with user request for Gemini. Accessed via JavaScript `fetch`.
*   **AI - Image Analysis:** Google Gemini Pro Vision API
    *   *Rationale:* Integrates well with Gemini Pro, handles multimodal input (text + image), offers a free tier. Simplifies the stack compared to integrating a separate model like Mistral (for which easily accessible free vision APIs are less common). Accessed via JavaScript `fetch`.
*   **Knowledge Base Storage:** `chrome.storage.local` API
    *   *Rationale:* Simple, built-in storage for Chrome extensions, suitable for storing business context strings and target profile lists.
*   **LinkedIn Interaction:** Native JavaScript DOM Manipulation
    *   *Rationale:* Directly interact with LinkedIn's web interface via Content Scripts. Avoids external dependencies for basic interaction, though more complex scenarios might benefit from small helper libraries.

## 3. Workflow Design

1.  **Configuration (Extension Popup UI):**
    *   Input field(s) for target LinkedIn profile URLs (e.g., `https://www.linkedin.com/in/username/`).
    *   Text area for user to input details about their business(es) - key messages, services, target audience, desired tone for comments.
    *   Save button to store configuration in `chrome.storage.local`.
    *   Start/Stop button to manually trigger/halt the agent's operation.
    *   (Optional) Scheduling options using `chrome.alarms` API for periodic runs.

2.  **Execution Cycle (Background Script & Content Script):**
    *   **Trigger:** User clicks "Start" or a scheduled alarm fires.
    *   **Profile Iteration (Background Script):** Retrieve the list of target profiles from storage. Iterate through them one by one, respecting delays.
    *   **Navigation (Background Script -> Content Script):** For the current target profile, instruct the content script (running on a LinkedIn tab) to navigate to the profile's URL (or potentially their activity/post feed).
    *   **Post Identification & Scraping (Content Script):**
        *   Wait for the page/feed elements to load completely.
        *   Use specific, potentially complex CSS selectors to find the container of the *latest* post. (This is the most fragile part).
        *   Extract the post's text content (`innerText`).
        *   Identify `<img>` tags within the post container and extract their `src` URLs.
    *   **Data Transmission (Content Script -> Background Script):** Send the extracted post text and image URLs back to the background script for processing.
    *   **AI Analysis (Background Script):**
        *   Retrieve user's business context from `chrome.storage.local`.
        *   **Image Processing:** If image URLs exist:
            *   Fetch image data (handle potential CORS issues, may need to fetch via background script).
            *   Format data for Gemini Pro Vision API (e.g., base64 encoding).
            *   Call Gemini Pro Vision with a prompt like "Briefly describe the key elements in this image relevant to a professional LinkedIn post."
            *   Store the resulting image description(s).
        *   **Comment Generation:**
            *   Construct a detailed prompt for the Gemini Pro API, including:
                *   Role definition (e.g., "You are an AI assistant helping me comment on LinkedIn posts.")
                *   My business context: `[User's Business Info]`
                *   The LinkedIn post text: `[Extracted Post Text]`
                *   Description of images in the post: `[Image Descriptions from Vision API, or 'No images']`
                *   Instructions: "Generate a short (2-3 sentences), relevant, engaging, and professional comment for this post. Ensure the comment adds value or perspective based on the post and my business context. Avoid generic phrases. Be positive and constructive."
            *   Call the Gemini Pro API with the prompt.
            *   Receive the generated comment text.
    *   **Posting Comment (Background Script -> Content Script):**
        *   Send the generated comment text back to the content script.
        *   **Locate Comment Field:** Use CSS selectors to find the comment input box associated with the specific post.
        *   **Input Comment:** Programmatically set the `value` of the comment input field.
        *   **Simulate Post:** Programmatically trigger a click event on the "Post" button for the comment.
    *   **Delay & Loop:** Implement a significant, randomized delay (e.g., several minutes) before processing the next profile to mimic human behavior.

## 4. Key Considerations & Mitigation Strategies

*   **LinkedIn ToS & Account Safety:**
    *   **Risk:** High risk of account restriction or banning.
    *   **Mitigation:**
        *   **Low Frequency:** Run the agent infrequently (e.g., few comments per day).
        *   **Long, Randomized Delays:** Implement significant, variable delays between all actions (navigation, scrolling, typing, clicking).
        *   **Supervision:** Initially, review generated comments before allowing posting. Add a manual approval step if possible.
        *   **Avoid Running Unattended for Long Periods:** Especially during initial testing.
*   **UI Changes & Selector Fragility:**
    *   **Risk:** LinkedIn updates will break CSS selectors, stopping the agent.
    *   **Mitigation:**
        *   **Robust Selectors:** Use selectors that are less likely to change (e.g., based on `data-testid` attributes if available, though less common, or stable ARIA roles) but expect frequent breakage.
        *   **Regular Maintenance:** Be prepared to update selectors regularly.
        *   **Error Handling:** Detect when selectors fail and log errors gracefully, potentially stopping the process for that profile.
*   **Comment Quality & Relevance:**
    *   **Risk:** Generic, irrelevant, or spammy comments damage reputation.
    *   **Mitigation:**
        *   **Detailed Prompts:** Craft specific prompts for Gemini, providing strong context.
        *   **Contextual Relevance:** Ensure the prompt strongly emphasizes relevance to the *specific* post content.
        *   **Negative Constraints:** Instruct the AI *what not to do* (e.g., "Do not just say 'Great post!'").
        *   **Review & Refine:** Periodically review posted comments and refine the prompts or business context input.
*   **Error Handling:**
    *   **Risk:** Network errors, API failures, unexpected page states.
    *   **Mitigation:** Implement `try...catch` blocks for API calls, DOM manipulations, and navigation. Log errors clearly. Implement retries with backoff for transient network/API issues.

## 5. "Free Way" Implementation Notes

*   **Gemini API:** Stay within the free tier limits for Gemini Pro and Gemini Pro Vision. Monitor usage via Google Cloud Console.
*   **Compute:** Runs locally within the user's Chrome browser, no server costs.
*   **Development:** Chrome extension development tools are free.
*   **Limitations:** Free tier limits might restrict the number of comments per day/month. No budget for paid proxies or advanced anti-detection tools.

## 6. Conclusion

This Chrome Extension approach offers a feasible path for a simple, low-cost LinkedIn commenting agent. Success hinges on careful implementation of human-like delays, robust error handling, meticulous prompt engineering for quality comments, and constant maintenance of selectors. The violation of LinkedIn's ToS remains the most significant risk.

## 7. Implementation - Next Steps

1.  **Load Extension:** Load the unpacked extension into Chrome (`chrome://extensions/` -> Developer mode -> Load unpacked). Create placeholder icon files (`icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`) or the extension won't load.
2.  **Popup UI & Storage:**
    *   Test the popup (`popup.html`, `popup.js`, `styles.css`).
    *   Verify that entering an API key, profile URLs, and business context and clicking "Save Settings" correctly stores the data in `chrome.storage.local` (Check using the Extension DevTools for the popup).
    *   Verify that reopening the popup loads the saved settings.
3.  **Background Script - Basic Communication:**
    *   Test the "Start Agent" and "Stop Agent" buttons in the popup.
    *   Check the Background Script's console (via `chrome://extensions/` -> Service worker) to see if the `startProcessing` and `stopProcessing` messages are received (`background.js`).
    *   Verify status updates are sent back to the popup and displayed correctly.
4.  **Content Script - Basic Injection & Communication:**
    *   Navigate to a LinkedIn page.
    *   Check the regular browser Developer Tools console (on the LinkedIn tab) to confirm the `content.js` script has loaded.
    *   Manually trigger the `scrapeLatestPost` action from the background script's console (e.g., `chrome.tabs.query({active: true, currentWindow: true}, (tabs) => { chrome.tabs.sendMessage(tabs[0].id, {action: 'scrapeLatestPost'}); });`) and check if the content script receives the message and attempts to scrape (look for console logs in the content script).
5.  **Content Script - Scraping Logic:**
    *   **This is the most critical and fragile part.** Open LinkedIn (profile page, activity feed, main feed).
    *   Use the browser's Developer Tools (Elements tab) to inspect the HTML structure of posts.
    *   Carefully identify reliable CSS selectors for the post container, text content, image elements, comment button, comment input box, and post button.
    *   Update the selectors in `content.js` (`scrapeLatestPostData` and `postCommentToLatest`).
    *   Test the scraping function thoroughly by triggering it from the background script console and checking the output logged in `content.js` and sent back to `background.js`.
6.  **Background Script - AI Integration:**
    *   Implement the actual `fetch` calls to the Gemini Pro Vision (if tackling images) and Gemini Pro APIs in `background.js` (`callGeminiVision`, `callGeminiPro`).
    *   Use the API key stored in `chrome.storage.local`.
    *   Parse the API responses correctly to extract the generated text/description.
    *   Handle API errors gracefully.
    *   Test with sample scraped data first, then integrate with the live scraping flow.
7.  **End-to-End Flow & Refinement:**
    *   Connect the full loop: Start -> Navigate -> Scrape -> Analyze (AI) -> Post Comment -> Delay -> Next Profile.
    *   Implement robust error handling at each step.
    *   Implement proper delays and randomization (`sleep` function in `background.js`) between actions to avoid detection.
    *   Refine the Gemini prompts (`constructCommentPrompt`) for better comment quality based on test results.
    *   Implement reliable waiting mechanisms instead of fixed `sleep` calls where possible (e.g., waiting for specific elements to appear after navigation or clicks, potentially using MutationObservers in `content.js`).
    *   Address the TODOs left in the code comments.
