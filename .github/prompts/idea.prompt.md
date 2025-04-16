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
