import { getActivitySummary, getRecentActivities, clearActivityHistory, ACTIVITY_TYPES } from './activity-tracker.js';

document.addEventListener('DOMContentLoaded', () => {
    // Set up button listeners
    document.getElementById('refreshStats').addEventListener('click', loadData);
    document.getElementById('clearHistory').addEventListener('click', confirmClearHistory);
    document.getElementById('backToPopup').addEventListener('click', () => {
        window.location.href = 'popup.html';
    });
    
    // Load data on page load
    loadData();
});

async function loadData() {
    await loadSummaryStats();
    await loadActivityTable();
}

async function loadSummaryStats() {
    try {
        const stats = await getActivitySummary();
        if (!stats) {
            console.error("Failed to load activity stats");
            return;
        }
        
        // Update summary stat cards
        document.getElementById('totalComments').textContent = stats.totalComments.toLocaleString();
        document.getElementById('totalReactions').textContent = stats.totalReactions.toLocaleString();
        document.getElementById('uniqueProfiles').textContent = stats.uniqueProfiles.toLocaleString();
        document.getElementById('last30Days').textContent = 
            `${stats.last30Days.comments} comments, ${stats.last30Days.reactions} reactions`;
            
    } catch (error) {
        console.error("Error loading summary stats:", error);
    }
}

async function loadActivityTable() {
    const container = document.getElementById('activityTableContainer');
    container.innerHTML = '<div class="loading">Loading activity data...</div>';
    
    try {
        const activities = await getRecentActivities(100); // Get up to 100 recent activities
        
        if (!activities || activities.length === 0) {
            container.innerHTML = '<div class="no-data">No activity data found</div>';
            return;
        }
        
        // Create table
        const table = document.createElement('table');
        table.className = 'activity-table';
        
        // Add header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Profile</th>
                <th>Details</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Add body
        const tbody = document.createElement('tbody');
        activities.forEach(activity => {
            const row = document.createElement('tr');
            
            // Format date
            const date = new Date(activity.timestamp);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            
            // Get profile name from URL
            const profileName = activity.profileUrl ? 
                activity.profileUrl.split('/').filter(Boolean).pop() : 'Unknown';
            
            // Format details based on activity type
            let details = '';
            switch(activity.type) {
                case ACTIVITY_TYPES.COMMENT:
                    details = `<strong>Comment:</strong> "${activity.details.commentText}"`;
                    if (activity.details.reactionAdded) {
                        details += `<br><strong>Reaction:</strong> ${activity.details.reactionType || 'Like'}`;
                    }
                    break;
                case ACTIVITY_TYPES.REACTION:
                    details = `<strong>Reaction:</strong> ${activity.details.reactionType || 'Like'}`;
                    break;
                case ACTIVITY_TYPES.SKIP:
                    details = `<strong>Skipped:</strong> ${activity.details.reason || 'Unknown reason'}`;
                    break;
                case ACTIVITY_TYPES.VISIT:
                    details = 'Profile visited';
                    break;
                default:
                    details = JSON.stringify(activity.details);
            }
            
            // Create badge for activity type
            const badgeClass = `badge badge-${activity.type}`;
            const typeBadge = `<span class="${badgeClass}">${activity.type}</span>`;
            
            // Build row
            row.innerHTML = `
                <td class="date-column">${formattedDate}</td>
                <td>${typeBadge}</td>
                <td>${profileName}</td>
                <td>${details}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        container.innerHTML = '';
        container.appendChild(table);
        
    } catch (error) {
        console.error("Error loading activity table:", error);
        container.innerHTML = `<div class="no-data">Error loading activity data: ${error.message}</div>`;
    }
}

async function confirmClearHistory() {
    if (confirm("Are you sure you want to clear all activity history? This cannot be undone.")) {
        try {
            await clearActivityHistory();
            alert("Activity history cleared successfully");
            loadData(); // Refresh the data display
        } catch (error) {
            console.error("Error clearing activity history:", error);
            alert("Failed to clear activity history: " + error.message);
        }
    }
}
