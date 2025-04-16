document.addEventListener('DOMContentLoaded', () => {
  // Load and display logs
  loadLogs();
  
  // Setup button handlers
  document.getElementById('refresh').addEventListener('click', loadLogs);
  document.getElementById('clear').addEventListener('click', clearLogs);
  document.getElementById('export').addEventListener('click', exportLogs);
});

// Load logs from storage and display them
async function loadLogs() {
  try {
    const { logs = [], commentedCount = 0, skippedCount = 0, processedCount = 0 } = 
      await chrome.storage.local.get(['logs', 'commentedCount', 'skippedCount', 'processedCount']);
    
    // Update statistics
    document.getElementById('commented').textContent = commentedCount;
    document.getElementById('skipped').textContent = skippedCount;
    document.getElementById('processed').textContent = processedCount;
    
    // Display logs
    const logsContainer = document.getElementById('logs');
    if (logs.length === 0) {
      logsContainer.innerHTML = '<div class="log-entry info">No logs found.</div>';
      return;
    }
    
    logsContainer.innerHTML = logs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const date = new Date(log.timestamp).toLocaleDateString();
      return `<div class="log-entry ${log.level}">
                <span class="timestamp">${date} ${time}</span>
                <span class="message">${escapeHtml(log.message)}</span>
              </div>`;
    }).join('');
    
    // Scroll to bottom to show latest logs
    logsContainer.scrollTop = logsContainer.scrollHeight;
    
  } catch (error) {
    console.error("Error loading logs:", error);
    document.getElementById('logs').innerHTML = 
      `<div class="log-entry error">Error loading logs: ${error.message}</div>`;
  }
}

// Clear all logs from storage
async function clearLogs() {
  if (confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
    try {
      await chrome.storage.local.set({ logs: [] });
      document.getElementById('logs').innerHTML = 
        '<div class="log-entry info">All logs cleared.</div>';
    } catch (error) {
      console.error("Error clearing logs:", error);
      document.getElementById('logs').innerHTML = 
        `<div class="log-entry error">Error clearing logs: ${error.message}</div>`;
    }
  }
}

// Export logs to a JSON file for download
async function exportLogs() {
  try {
    const { logs = [] } = await chrome.storage.local.get('logs');
    const dataStr = "data:text/json;charset=utf-8," + 
      encodeURIComponent(JSON.stringify(logs, null, 2));
    
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `linkedin-ai-logs-${getTimestamp()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
  } catch (error) {
    console.error("Error exporting logs:", error);
    alert(`Error exporting logs: ${error.message}`);
  }
}

// Helper function to get timestamp for filenames
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
