const apiKeyInput = document.getElementById('apiKey');
const mistralApiKeyInput = document.getElementById('mistralApiKey');
const targetProfilesInput = document.getElementById('targetProfiles');
const saveButton = document.getElementById('saveSettings');
const startButton = document.getElementById('startAgent');
const stopButton = document.getElementById('stopAgent');
const statusDisplay = document.getElementById('status');
const clearHistoryButton = document.getElementById('clearHistory');

// Default prompts with variables for highlighting
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
Comment: [Your Generated Comment]`
};

// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['apiKey', 'mistralApiKey', 'targetProfiles', 'businessContext', 'agentStatus', 'enhancedStatus'], (result) => {
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    if (result.mistralApiKey) { // Load Mistral key
      mistralApiKeyInput.value = result.mistralApiKey;
    }
    if (result.targetProfiles) {
      targetProfilesInput.value = result.targetProfiles.join('\n');
    }
    updateStatusUI(result.enhancedStatus || result.agentStatus || 'Idle');
  });

  // Setup control buttons (including optional clear history)
  setupControlButtons();

  // Load initial logs
  loadInitialLogs();

  // Setup tabs
  setupTabs();

  // Remove this line - we've moved prompt management to its own page
  // loadPromptSettings();

  // Set up polling for periodic updates when popup is open
  const pollInterval = setInterval(() => {
    chrome.runtime.sendMessage({ action: "getLatestStats" });
  }, 2000);

  // Clear interval when popup closes
  window.addEventListener('unload', () => {
    clearInterval(pollInterval);
  });
});

// Save settings
saveButton.addEventListener('click', () => {
  const geminiKey = apiKeyInput.value.trim();
  const mistralKey = mistralApiKeyInput.value.trim();
  const profiles = targetProfilesInput.value.split('\n').map(url => url.trim()).filter(url => url);

  if (!geminiKey) {
      alert('Please enter your Gemini API Key.');
      return;
  }

  chrome.storage.local.set({
    apiKey: geminiKey,
    mistralApiKey: mistralKey,
    targetProfiles: profiles
  }, () => {
    alert('Settings saved!');
    console.log('Settings saved to chrome.storage.local');
  });
});

// Start Agent
startButton.addEventListener('click', () => {
    console.log('Start button clicked');
    // Show console when agent starts
    document.getElementById('console-container').classList.add('active');
    
    // Add initial console message
    addConsoleLog('Agent starting...', 'info');
    
    // Send message to background script to start processing
    chrome.runtime.sendMessage({ action: "startProcessing" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Error sending start message:", chrome.runtime.lastError.message);
            updateStatusUI({ message: 'Error starting' });
            addConsoleLog(`Error: ${chrome.runtime.lastError.message}`, 'error');
        } else {
            console.log('Start message sent, response:', response);
            updateStatusUI(response?.enhancedStatus || response?.status || 'Starting...');
            addConsoleLog('Agent successfully started', 'success');
        }
    });
});

// Stop Agent
stopButton.addEventListener('click', () => {
    console.log('Stop button clicked');
    
    // Send message to background script to stop processing
    chrome.runtime.sendMessage({ action: "stopProcessing" }, (response) => {
         if (chrome.runtime.lastError) {
            console.error("Error sending stop message:", chrome.runtime.lastError.message);
            updateStatusUI({ message: 'Error stopping' });
            addConsoleLog(`Error stopping agent: ${chrome.runtime.lastError.message}`, 'error');
        } else {
            console.log('Stop message sent, response:', response);
            updateStatusUI(response?.enhancedStatus || response?.status || 'Stopping...');
            addConsoleLog('Agent stopped', 'info');
            
            // Optional: Hide console when agent stops
            // Uncomment if you want the console to hide when stopped
            // document.getElementById('console-container').classList.remove('active');
        }
    });
});

// Add event listener for the new button (if added)
if (clearHistoryButton) {
    clearHistoryButton.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear the history of commented posts? The agent might comment on the same posts again.")) {
            chrome.storage.local.set({ commentedPostIds: [] }, () => {
                alert('Commented post history cleared.');
                console.log('Cleared commentedPostIds from storage.');
                // Optionally update UI if displaying history count
            });
        }
    });
}

// Enhanced function to update UI with detailed statistics
function updateStatusUI(status) {
  const statusElement = document.getElementById('status');
  if (statusElement) {
    statusElement.textContent = status.message || status;
  }

  // If enhanced status information is available, update statistics
  if (status.stats) {
    updateStatistics(status.stats);
  } else {
    // If just a string was passed, get enhanced status from storage
    chrome.storage.local.get('enhancedStatus', (data) => {
      if (data.enhancedStatus) {
        updateStatistics(data.enhancedStatus.stats);
      }
    });
  }
}

// Display statistics in the UI
function updateStatistics(stats) {
  const statsContainer = document.getElementById('statistics');
  if (!statsContainer) {
    // Create statistics container if it doesn't exist
    const container = document.createElement('div');
    container.id = 'statistics';
    container.className = 'statistics-container';
    document.querySelector('.status-container').appendChild(container);
  }
  
  // Update or create the statistics container content
  const statsDiv = document.getElementById('statistics');
  statsDiv.innerHTML = `
    <div class="stat-item">
      <span class="stat-label">Commented:</span>
      <span class="stat-value">${stats.commented || 0}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Skipped:</span>
      <span class="stat-value">${stats.skipped || 0}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Progress:</span>
      <span class="stat-value">${stats.processed || 0} / ${stats.total || 0}</span>
    </div>
  `;
}

// Enhanced message listener for real-time updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateStatus") {
    // Use the enhanced status if available
    updateStatusUI(request.enhancedStatus || request.status);
    sendResponse({ received: true });
    return true;
  }
  
  // Handle log updates
  if (request.action === "newLogEntry") {
    addLogToPopup(request.logEntry);
    sendResponse({ received: true });
    return true;
  }
  
  // Handle stats updates
  if (request.action === "statsUpdate") {
    updateStatistics(request.stats);
    sendResponse({ received: true });
    return true;
  }
  
  // Handle console logs from background script
  if (request.action === "consoleLog") {
    addConsoleLog(request.message, request.level || 'log');
    sendResponse({ received: true });
    return true;
  }

  if (request.action === "countdownTimer") {
    updateCountdownTimer(request.description, request.remaining, request.total);
    sendResponse?.({ received: true });
    return true;
  }
});

// Add a log entry to the real-time logs display
function addLogToPopup(logEntry) {
  const logsContainer = document.getElementById('real-time-logs');
  const logCount = document.getElementById('log-count');
  
  // Create timestamp display
  const timestamp = new Date(logEntry.timestamp);
  const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  // Create the log element
  const logElement = document.createElement('div');
  logElement.className = `log-entry ${logEntry.level}`;
  logElement.innerHTML = `
    <span class="log-timestamp">[${timeString}]</span>
    <span class="log-message">${escapeHTML(logEntry.message)}</span>
  `;
  
  // Add to container
  logsContainer.appendChild(logElement);
  
  // Remove oldest log if we have too many
  const MAX_LOGS = 50;
  while (logsContainer.children.length > MAX_LOGS) {
    logsContainer.removeChild(logsContainer.firstChild);
  }
  
  // Update log count
  logCount.textContent = logsContainer.children.length;
  
  // Scroll to bottom to show latest log
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Load initial logs when popup opens
function loadInitialLogs() {
  chrome.storage.local.get(['logs'], (result) => {
    const logs = result.logs || [];
    const logsContainer = document.getElementById('real-time-logs');
    
    // Clear placeholder
    logsContainer.innerHTML = '';
    
    // Get last 10 logs
    const recentLogs = logs.slice(-10);
    
    if (recentLogs.length === 0) {
      logsContainer.innerHTML = '<div class="log-entry info">No recent activity logs.</div>';
      return;
    }
    
    // Add each log
    recentLogs.forEach(logEntry => {
      addLogToPopup(logEntry);
    });
  });
}

// Update setupControlButtons function to add a dedicated Prompts Manager button
function setupControlButtons() {
    const container = document.querySelector('.control-container') || document.body;

    // Prompts Manager Button - New primary button for managing prompts
    const managePromptsButton = document.createElement('button');
    managePromptsButton.textContent = 'Manage Prompts';
    managePromptsButton.className = 'action-button primary-accent';
    managePromptsButton.id = 'managePrompts';
    managePromptsButton.addEventListener('click', () => {
        chrome.tabs.create({ url: 'prompts.html' });
    });
    container.appendChild(managePromptsButton);

    // View Logs Button
    const viewLogsButton = document.createElement('button');
    viewLogsButton.textContent = 'View Logs';
    viewLogsButton.className = 'action-button';
    viewLogsButton.id = 'viewLogs';
    viewLogsButton.addEventListener('click', () => {
        chrome.tabs.create({ url: 'logs.html' });
    });
    container.appendChild(viewLogsButton);

    // Clear History Button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear History';
    clearBtn.className = 'action-button secondary';
    clearBtn.id = 'clearHistory';
    clearBtn.addEventListener('click', () => {
         if (confirm("Are you sure you want to clear the history of commented posts? The agent might comment on the same posts again.")) {
            chrome.storage.local.set({ commentedPostIds: [] }, () => {
                alert('Commented post history cleared.');
                console.log('Cleared commentedPostIds from storage.');
            });
        }
    });
    container.appendChild(clearBtn);
}

// Updated tab setup to handle only Settings and Activity tabs
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Show corresponding content
            const tabId = button.getAttribute('data-tab');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}

// Console logging functionality
function addConsoleLog(message, level = 'log') {
    const consoleOutput = document.getElementById('console-output');
    if (!consoleOutput) return;
    const logLine = document.createElement('div');
    logLine.className = `console-line console-${level}`;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const timeSpan = document.createElement('span');
    timeSpan.className = 'console-time';
    timeSpan.textContent = `[${time}]`;
    logLine.appendChild(timeSpan);
    logLine.appendChild(document.createTextNode(` ${message}`));
    consoleOutput.appendChild(logLine);
    while (consoleOutput.childElementCount > 500) {
        consoleOutput.removeChild(consoleOutput.firstChild);
    }
    // Smooth auto-scroll
    if (!document.getElementById('toggleConsole')?.classList.contains('active')) {
        consoleOutput.scrollTo({ top: consoleOutput.scrollHeight, behavior: 'smooth' });
    }
}

// Countdown timer display
function updateCountdownTimer(description, remaining, total) {
    const consoleOutput = document.getElementById('console-output');
    if (!consoleOutput) return;
    const existingTimer = Array.from(consoleOutput.querySelectorAll('.countdown-timer'))
                               .find(el => el.dataset.description === description);
    if (existingTimer) {
        const progressBar = existingTimer.querySelector('.timer-progress-bar');
        const remainingText = existingTimer.querySelector('.timer-remaining');
        const progress = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
        progressBar.style.width = `${progress}%`;
        remainingText.textContent = `${remaining}s remaining`;
        if (remaining <= 0) {
            setTimeout(() => {
                existingTimer.classList.add('completed');
                setTimeout(() => {
                    if (existingTimer.parentNode === consoleOutput) {
                        consoleOutput.removeChild(existingTimer);
                    }
                }, 2000);
            }, 1000);
        }
    } else if (remaining > 0) {
        const timerLine = document.createElement('div');
        timerLine.className = 'console-line countdown-timer';
        timerLine.dataset.description = description;
        const now = new Date();
        const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        timerLine.innerHTML = `
            <span class="console-time">[${time}]</span>
            <span class="timer-description">⏱️ ${description}</span>
            <span class="timer-remaining">${remaining}s remaining</span>
            <div class="timer-progress">
                <div class="timer-progress-bar" style="width: 0%"></div>
            </div>
        `;
        consoleOutput.appendChild(timerLine);
        if (!document.getElementById('toggleConsole')?.classList.contains('active')) {
            consoleOutput.scrollTo({ top: consoleOutput.scrollHeight, behavior: 'smooth' });
        }
    }
}

// Set up console controls
document.addEventListener('DOMContentLoaded', () => {
    // ...existing DOM content loaded code...
    
    // Set up console buttons
    const clearButton = document.getElementById('clearConsole');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            document.getElementById('console-output').innerHTML = '';
            addConsoleLog('Console cleared', 'info');
        });
    }
    
    const toggleButton = document.getElementById('toggleConsole');
    if (toggleButton) {
        toggleButton.classList.add('active'); // Auto-scroll by default
        toggleButton.addEventListener('click', () => {
            toggleButton.classList.toggle('active');
            const isActive = toggleButton.classList.contains('active');
            toggleButton.title = isActive ? 'Disable auto-scroll' : 'Enable auto-scroll';
            addConsoleLog(`Auto-scroll ${isActive ? 'enabled' : 'disabled'}`, 'info');
        });
    }
});
