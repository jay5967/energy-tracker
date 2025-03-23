// User management functions
function getUserId() {
    // Check if a user ID exists in localStorage
    let userId = localStorage.getItem('energyTracker_userId');
    
    // If not, create a new random ID and store it
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('energyTracker_userId', userId);
    }
    
    return userId;
}

// Enhanced fetch function that adds user ID to all requests
async function fetchWithUserId(url, options = {}) {
    const userId = getUserId();
    
    // Add userId as a query parameter
    const separator = url.includes('?') ? '&' : '?';
    const urlWithUser = `${url}${separator}userId=${userId}`;
    
    try {
        const response = await fetch(urlWithUser, options);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

// Export functions for use in other files
window.getUserId = getUserId;
window.fetchWithUserId = fetchWithUserId; 