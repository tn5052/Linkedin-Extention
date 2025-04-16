// Activity Tracker module - Handles tracking and storing agent activities

// Activity types
const ACTIVITY_TYPES = {
  COMMENT: 'comment',
  REACTION: 'reaction',
  VISIT: 'visit',
  SKIP: 'skip'
};

// Store an activity in the log
async function trackActivity(type, profileUrl, postId, details) {
  try {
    // Get existing activities
    const { activities = [] } = await chrome.storage.local.get('activities');
    
    // Create new activity record
    const activity = {
      type,
      timestamp: new Date().toISOString(),
      profileUrl,
      postId,
      details,
      success: true
    };
    
    // Add to beginning of array for chronological order (newest first)
    activities.unshift(activity);
    
    // Limit size to prevent storage issues (store last 500 activities)
    if (activities.length > 500) {
      activities.pop(); // Remove oldest
    }
    
    // Save updated activities
    await chrome.storage.local.set({ activities });
    console.log(`[Activity Tracker] Recorded ${type} activity for ${profileUrl}`);
    
    // Update summary stats
    await updateActivityStats();
    
    return true;
  } catch (error) {
    console.error("[Activity Tracker] Error recording activity:", error);
    return false;
  }
}

// Track a successful comment
async function trackComment(profileUrl, postId, commentText, reaction) {
  return trackActivity(ACTIVITY_TYPES.COMMENT, profileUrl, postId, {
    commentText: commentText?.substring(0, 50) + (commentText?.length > 50 ? '...' : ''),
    reactionAdded: !!reaction,
    reactionType: reaction || null
  });
}

// Track a reaction (like, etc.)
async function trackReaction(profileUrl, postId, reactionType) {
  return trackActivity(ACTIVITY_TYPES.REACTION, profileUrl, postId, {
    reactionType
  });
}

// Track a profile visit 
async function trackVisit(profileUrl) {
  return trackActivity(ACTIVITY_TYPES.VISIT, profileUrl, null, {});
}

// Track a skipped profile
async function trackSkip(profileUrl, reason) {
  return trackActivity(ACTIVITY_TYPES.SKIP, profileUrl, null, {
    reason: reason?.substring(0, 100) || 'Unknown reason'
  });
}

// Update aggregate stats based on activity log
async function updateActivityStats() {
  try {
    const { activities = [] } = await chrome.storage.local.get('activities');
    
    // Calculate stats
    const stats = {
      totalComments: 0,
      totalReactions: 0,
      totalVisits: 0,
      totalSkips: 0,
      profilesInteractedWith: new Set(),
      lastActive: activities.length > 0 ? activities[0].timestamp : null,
      // Last 30 days stats
      last30Days: {
        comments: 0,
        reactions: 0
      }
    };
    
    // Calculate 30 days ago for filtering
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();
    
    // Analyze each activity
    activities.forEach(activity => {
      // Count by type
      switch(activity.type) {
        case ACTIVITY_TYPES.COMMENT:
          stats.totalComments++;
          if (activity.timestamp >= thirtyDaysAgoStr) stats.last30Days.comments++;
          break;
        case ACTIVITY_TYPES.REACTION:
          stats.totalReactions++;
          if (activity.timestamp >= thirtyDaysAgoStr) stats.last30Days.reactions++;
          break;
        case ACTIVITY_TYPES.VISIT:
          stats.totalVisits++;
          break;
        case ACTIVITY_TYPES.SKIP:
          stats.totalSkips++;
          break;
      }
      
      // Track unique profiles
      if (activity.profileUrl) {
        stats.profilesInteractedWith.add(activity.profileUrl);
      }
    });
    
    // Convert Set to count
    stats.uniqueProfiles = stats.profilesInteractedWith.size;
    delete stats.profilesInteractedWith;
    
    // Save stats for easy retrieval
    await chrome.storage.local.set({ activityStats: stats });
    return stats;
  } catch (error) {
    console.error("[Activity Tracker] Error updating stats:", error);
    return null;
  }
}

// Get activity summary
async function getActivitySummary() {
  try {
    // Try to get cached stats first
    const { activityStats } = await chrome.storage.local.get('activityStats');
    if (activityStats) {
      return activityStats;
    }
    
    // If no cached stats, recalculate
    return await updateActivityStats();
  } catch (error) {
    console.error("[Activity Tracker] Error getting activity summary:", error);
    return null;
  }
}

// Get recent activities (for display in UI)
async function getRecentActivities(limit = 50) {
  try {
    const { activities = [] } = await chrome.storage.local.get('activities');
    return activities.slice(0, limit);
  } catch (error) {
    console.error("[Activity Tracker] Error getting recent activities:", error);
    return [];
  }
}

// Clear all activity history
async function clearActivityHistory() {
  try {
    await chrome.storage.local.set({ activities: [] });
    await updateActivityStats();
    return true;
  } catch (error) {
    console.error("[Activity Tracker] Error clearing activity history:", error);
    return false;
  }
}

// Export functions
export {
  trackComment,
  trackReaction,
  trackVisit,
  trackSkip,
  getActivitySummary,
  getRecentActivities,
  clearActivityHistory,
  ACTIVITY_TYPES
};
