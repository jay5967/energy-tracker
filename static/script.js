document.addEventListener('DOMContentLoaded', function() {
    console.log('Page loaded, initializing...');
    
    // Run migration first
    migrateEnergyData().then(() => {
        // Initialize form event listeners
        initializeFormListeners();
        
        // Initialize duration controls
        initializeDurationControls();
        
        // Initialize activities toggle
        initializeActivitiesToggle();
        
        // Initialize time range filter
        const timeRange = document.getElementById('timeRange');
        if (timeRange) {
            timeRange.addEventListener('change', async function() {
                console.log('Time range changed to:', this.value);
                await createCharts();
            });
        }
        
        // Load initial data
        Promise.all([
            loadActivities(),
            loadStats(),
            createCharts()
        ]).catch(error => {
            console.error('Error loading initial data:', error);
            showNotification('Failed to load initial data. Please refresh the page.', 'danger');
        });
    });
});

// Consistent color mapping for categories
const categoryColors = {
    'Exercise': {
        background: 'rgba(234, 179, 8, 0.8)',    // Yellow
        border: 'rgba(234, 179, 8, 1)'
    },
    'Rest': {
        background: 'rgba(22, 163, 74, 0.8)',    // Green
        border: 'rgba(22, 163, 74, 1)'
    },
    'Social': {
        background: 'rgba(220, 38, 38, 0.8)',    // Red
        border: 'rgba(220, 38, 38, 1)'
    },
    'Work': {
        background: 'rgba(30, 58, 138, 0.8)',    // Blue
        border: 'rgba(30, 58, 138, 1)'
    },
    'Other': {
        background: 'rgba(217, 119, 6, 0.8)',    // Orange
        border: 'rgba(217, 119, 6, 1)'
    }
};

// Add at the top of the file, after the categoryColors definition
const otherSubcategories = [
    'Reading',
    'Music',
    'Meditation',
    'Journaling',
    'Hobby projects'
];

// Add chart instance tracking at the top of the file
window.chartInstances = {
    energyTrend: null,
    categoryRoi: null,
    timeDistribution: null
};

// Add the migration function at the top of the file
async function migrateEnergyData() {
    // Check if migration is needed
    if (localStorage.getItem('energyScaleMigrated') === 'true') {
        console.log('Energy scale migration already completed');
        return;
    }
    
    try {
        console.log('Starting energy scale migration...');
        showNotification('Updating energy scale format...', 'info');
        
        // Fetch all activities
        const activities = await fetchWithRetry('/api/activities');
        
        // Update each activity's energy values
        for (const activity of activities) {
            try {
                // Convert from 0-100 scale to 1-10 scale
                const newEnergyBefore = Math.round(activity.energy_before / 10);
                const newEnergyAfter = Math.round(activity.energy_after / 10);
                
                // Prepare the updated activity data
                const updatedActivity = {
                    ...activity,  // Preserve all existing activity data
                    energy_before: newEnergyBefore <= 0 ? 1 : (newEnergyBefore > 10 ? 10 : newEnergyBefore),
                    energy_after: newEnergyAfter <= 0 ? 1 : (newEnergyAfter > 10 ? 10 : newEnergyAfter)
                };
                
                // Update in database
                await fetchWithRetry(`/api/activities/${activity.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updatedActivity)
                });
                
                console.log(`Migrated activity ${activity.id}: ${activity.name}`);
            } catch (activityError) {
                console.error(`Failed to migrate activity ${activity.id}:`, activityError);
                // Continue with other activities even if one fails
            }
        }
        
        // Mark migration as complete
        localStorage.setItem('energyScaleMigrated', 'true');
        console.log('Energy scale migration completed successfully');
        showNotification('Energy scale update completed!', 'success');
    } catch (error) {
        console.error('Error during energy scale migration:', error);
        showNotification('Failed to update some energy values. Please refresh the page.', 'warning');
        // Don't mark migration as complete if it failed
        localStorage.removeItem('energyScaleMigrated');
    }
}

function initializeFormListeners() {
    // Add event listener for category filter
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', function() {
            console.log('Category filter changed to:', this.value);
            loadActivities();
        });
    }
    
    // Add event listeners for energy sliders
    const energyBefore = document.getElementById('energyBefore');
    const energyAfter = document.getElementById('energyAfter');
    const energyBeforeValue = document.getElementById('energyBeforeValue');
    const energyAfterValue = document.getElementById('energyAfterValue');
    
    if (energyBefore && energyBeforeValue) {
        energyBefore.addEventListener('input', function() {
            energyBeforeValue.textContent = this.value;
        });
    }
    
    if (energyAfter && energyAfterValue) {
        energyAfter.addEventListener('input', function() {
            energyAfterValue.textContent = this.value;
        });
    }
    
    // Update form submission handler
    const activityForm = document.getElementById('activityForm');
    if (activityForm) {
        activityForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            try {
                const duration = parseInt(document.getElementById('duration').value) || 0;
                const durationUnit = document.getElementById('durationUnit').value;
                const durationMinutes = durationUnit === 'hours' ? duration * 60 : duration;
                
                const formData = {
                    name: document.getElementById('activityName').value,
                    category: document.getElementById('category').value,
                    energy_before: parseInt(document.getElementById('energyBefore').value),
                    energy_after: parseInt(document.getElementById('energyAfter').value),
                    duration_minutes: durationMinutes
                };
                
                const editId = this.dataset.editId;
                const url = editId ? `/api/activities/${editId}` : '/api/activities';
                const method = editId ? 'PUT' : 'POST';
                
                await fetchWithRetry(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
                
                this.reset();
                document.getElementById('duration').value = '30'; // Reset to default value
                delete this.dataset.editId;
                this.querySelector('button[type="submit"]').textContent = 'Add Activity';
                
                // Refresh data
                await Promise.all([loadActivities(), loadStats()]);
                await createCharts();
                showNotification(editId ? 'Activity updated successfully!' : 'Activity added successfully!', 'success');
            } catch (error) {
                console.error('Error:', error);
                showNotification(error.message || 'Failed to save activity. Please try again.', 'danger');
            }
        });
    } else {
        console.error('Activity form not found!');
    }
}

function initializeDurationControls() {
    const increaseDuration = document.getElementById('increaseDuration');
    const decreaseDuration = document.getElementById('decreaseDuration');
    const durationInput = document.getElementById('duration');
    const durationUnit = document.getElementById('durationUnit');
    
    if (increaseDuration && decreaseDuration && durationInput && durationUnit) {
        // Set initial value to 30 minutes
        durationInput.value = 30;
        
        // Increment button
        increaseDuration.addEventListener('click', function() {
            const currentValue = parseInt(durationInput.value) || 30;
            const step = durationUnit.value === 'hours' ? 1 : 5; // 1 hour or 5 minutes
            const newValue = currentValue + step;
            
            // Cap at 24 hours (1440 minutes)
            if (durationUnit.value === 'hours' && newValue > 24) {
                durationInput.value = 24;
                showNotification('Duration capped at 24 hours', 'info');
            } else if (durationUnit.value === 'minutes' && newValue > 1440) {
                durationInput.value = 1440;
                showNotification('Duration capped at 24 hours', 'info');
            } else {
                durationInput.value = newValue;
            }
        });
        
        // Decrement button
        decreaseDuration.addEventListener('click', function() {
            const currentValue = parseInt(durationInput.value) || 30;
            const step = durationUnit.value === 'hours' ? 1 : 5; // 1 hour or 5 minutes
            
            // Ensure we don't go below 5 minutes or 1 hour
            const minValue = durationUnit.value === 'hours' ? 1 : 5;
            const newValue = Math.max(currentValue - step, minValue);
            durationInput.value = newValue;
        });
        
        // Duration input validation
        durationInput.addEventListener('change', function() {
            let value = parseInt(this.value) || 30;
            const minValue = durationUnit.value === 'hours' ? 1 : 5;
            
            // Ensure minimum value
            if (value < minValue) {
                value = minValue;
                this.value = value;
                showNotification(`Duration must be at least ${minValue} ${durationUnit.value}`, 'warning');
            }
            
            // Cap maximum value based on unit
            const maxValue = durationUnit.value === 'hours' ? 24 : 1440;
            if (value > maxValue) {
                value = maxValue;
                this.value = value;
                showNotification('Duration capped at 24 hours', 'info');
            }
        });
        
        // Duration unit change handler
        durationUnit.addEventListener('change', function() {
            const currentValue = parseInt(durationInput.value) || 30;
            
            if (this.value === 'hours') {
                // Convert minutes to hours (round up)
                const hours = Math.min(24, Math.ceil(currentValue / 60));
                durationInput.value = Math.max(1, hours); // Ensure minimum 1 hour
                if (currentValue > 1440) {
                    showNotification('Duration adjusted to 24 hours maximum', 'info');
                }
            } else {
                // Convert hours to minutes
                const minutes = Math.min(1440, currentValue * 60);
                durationInput.value = Math.max(5, minutes); // Ensure minimum 5 minutes
                if (currentValue > 24) {
                    showNotification('Duration adjusted to 1440 minutes maximum', 'info');
                }
            }
        });
    }
}

// Utility function for making API requests with retry logic
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            console.warn(`Attempt ${attempt} failed, retrying...`, error);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

// Utility function to show notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
    notification.style.zIndex = '1000';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(notification);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Get category icon based on category name
function getCategoryIcon(category) {
    const icons = {
        'Exercise': '💪',
        'Work': '💼',
        'Social': '🤝',
        'Rest': '😴',
        'Other': '📌'
    };
    return icons[category] || '📌';
}

// Format duration for display
function formatDuration(minutes) {
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// Load and display activities
async function loadActivities() {
    try {
        console.log('Loading activities...');
        const categoryFilter = document.getElementById('categoryFilter');
        const selectedCategory = categoryFilter ? categoryFilter.value : null;
        console.log('Selected category:', selectedCategory);
        
        const url = `/api/activities${selectedCategory ? `?category=${selectedCategory}` : ''}`;
        const activities = await fetchWithRetry(url);
        console.log('Fetched activities:', activities);
        
        const activityList = document.getElementById('activitiesList');
        console.log('Activity list element found:', !!activityList);
        activityList.innerHTML = '';
        
        activities.forEach(activity => {
            console.log('Creating activity element for:', activity.name);
            const energyChange = activity.energy_after - activity.energy_before;
            const isPositive = energyChange > 0;
            
            // Calculate energy bar widths (convert 1-10 scale to percentages for display)
            const beforeWidth = (activity.energy_before / 10) * 100;
            const afterWidth = (activity.energy_after / 10) * 100;
            console.log(`Energy bars for ${activity.name}:`, {
                before: beforeWidth,
                after: afterWidth,
                energyChange: energyChange,
                isPositive: isPositive
            });
            
            const activityElement = document.createElement('div');
            activityElement.className = `activity-item ${isPositive ? 'positive' : 'negative'}`;
            
            const categoryClass = activity.category ? `category-${activity.category}` : '';
            
            activityElement.innerHTML = `
                <div class="card-body">
                    <div class="activity-header">
                        <span class="category-badge ${categoryClass}">
                            ${getCategoryIcon(activity.category)} ${activity.category || 'Uncategorized'}
                        </span>
                    </div>
                    <h5 class="activity-title">${activity.name}</h5>
                    
                    <div style="height: 24px; background: #f8f9fa; border-radius: 12px; overflow: hidden; position: relative; margin: 1rem 0; box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);"
                         data-before="${activity.energy_before}" 
                         data-after="${activity.energy_after}">
                        <div style="height: 100%; position: absolute; left: 0; background: linear-gradient(90deg, #6c757d 0%, #adb5bd 100%); z-index: 1; width: ${beforeWidth}%; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                        <div style="height: 100%; position: absolute; left: 0; background: ${
                            isPositive 
                                ? 'linear-gradient(90deg, #28a745 0%, #34ce57 100%)' 
                                : 'linear-gradient(90deg, #dc3545 0%, #e4606d 100%)'
                            }; z-index: 2; width: ${afterWidth}%; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                    </div>
                    
                    <div class="activity-metadata">
                        <span>
                            ⏰ ${formatDuration(activity.duration_minutes)}
                        </span>
                        <span>
                            ${isPositive ? '⬆️' : '⬇️'} ${energyChange > 0 ? '+' : ''}${energyChange} energy
                        </span>
                        <span>
                            📅 ${new Date(activity.timestamp).toLocaleDateString()}
                        </span>
                    </div>
                    
                    <div class="activity-actions">
                        <button class="btn btn-edit" onclick="editActivity(${activity.id})">
                            ✏️ Edit
                        </button>
                        <button class="btn btn-delete" onclick="deleteActivity(${activity.id})">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            `;
            
            activityList.appendChild(activityElement);
            
            // Verify the energy bars after being added to DOM
            const addedEnergyBar = activityElement.querySelector('div[data-before]');
            const beforeBar = addedEnergyBar.children[0];
            const afterBar = addedEnergyBar.children[1];
            
            console.log('Energy bars in DOM:', {
                barExists: !!addedEnergyBar,
                beforeBarExists: !!beforeBar,
                afterBarExists: !!afterBar,
                beforeWidth: beforeBar?.style.width,
                afterWidth: afterBar?.style.width
            });
        });
    } catch (error) {
        console.error('Error loading activities:', error);
        showNotification('Failed to load activities. Please try again.', 'danger');
    }
}

// Load and display statistics
async function loadStats() {
    try {
        const stats = await fetchWithRetry('/api/stats');
        document.getElementById('totalActivities').textContent = stats.total_activities;
        document.getElementById('avgEnergyChange').textContent = 
            `${stats.avg_energy_change > 0 ? '+' : ''}${stats.avg_energy_change}`;
        document.getElementById('mostEnergizing').textContent = 
            `${stats.most_energizing.category} (${stats.most_energizing.change > 0 ? '+' : ''}${stats.most_energizing.change})`;
        document.getElementById('mostDraining').textContent = 
            `${stats.most_draining.category} (${stats.most_draining.change > 0 ? '+' : ''}${stats.most_draining.change})`;
    } catch (error) {
        console.error('Error loading stats:', error);
        showNotification('Failed to load statistics. Please try again.', 'danger');
    }
}

// Edit activity
async function editActivity(id) {
    try {
        const activity = await fetchWithRetry(`/api/activities/${id}`);
        document.getElementById('activityName').value = activity.name;
        document.getElementById('category').value = activity.category;
        document.getElementById('energyBefore').value = activity.energy_before;
        document.getElementById('energyAfter').value = activity.energy_after;
        document.getElementById('duration').value = activity.duration_minutes;
        
        // Update slider values
        document.getElementById('energyBeforeValue').textContent = activity.energy_before;
        document.getElementById('energyAfterValue').textContent = activity.energy_after;
        
        // Change form submit button to update
        const form = document.getElementById('activityForm');
        form.dataset.editId = id;
        form.querySelector('button[type="submit"]').textContent = 'Update Activity';
    } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to load activity for editing. Please try again.', 'danger');
    }
}

// Delete activity
async function deleteActivity(id) {
    if (confirm('Are you sure you want to delete this activity?')) {
        try {
            await fetchWithRetry(`/api/activities/${id}`, {
                method: 'DELETE'
            });
            
            // Refresh data
            await Promise.all([loadActivities(), loadStats()]);
            await createCharts();
            showNotification('Activity deleted successfully!', 'success');
        } catch (error) {
            console.error('Error:', error);
            showNotification('Failed to delete activity. Please try again.', 'danger');
        }
    }
}

// Add time filtering function
function filterActivitiesByTimeRange(activities, days) {
    if (!activities || activities.length === 0) return [];
    if (days === 'all') return activities;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
    
    return activities.filter(activity => {
        const activityDate = new Date(activity.timestamp);
        return activityDate >= cutoffDate;
    });
}

// Add the findTopEnergyBooster function
function findTopEnergyBooster(activities) {
    if (!activities || activities.length === 0) {
        return { category: 'None', impact: 0 };
    }
    
    // Group activities by category
    const categoryImpacts = {};
    
    activities.forEach(activity => {
        const category = activity.category || 'Uncategorized';
        const impact = activity.energy_after - activity.energy_before;
        
        if (!categoryImpacts[category]) {
            categoryImpacts[category] = { total: 0, count: 0 };
        }
        
        categoryImpacts[category].total += impact;
        categoryImpacts[category].count += 1;
    });
    
    // Calculate average impact for each category
    let topBooster = { category: 'None', impact: 0 };
    
    Object.entries(categoryImpacts).forEach(([category, data]) => {
        const avgImpact = data.total / data.count;
        
        if (avgImpact > topBooster.impact) {
            topBooster = { category, impact: avgImpact };
        }
    });
    
    return topBooster;
}

// Add the updateTopBooster function
function updateTopBooster(activities) {
    const topBooster = findTopEnergyBooster(activities);
    const topBoosterElement = document.getElementById('topBoosterValue');
    
    if (topBooster.category === 'None') {
        topBoosterElement.textContent = 'Add more activities to find out!';
        return;
    }
    
    let emoji = '✨';
    if (topBooster.category === 'Exercise') emoji = '💪';
    else if (topBooster.category === 'Rest') emoji = '😴';
    else if (topBooster.category === 'Social') emoji = '👥';
    else if (topBooster.category === 'Work') emoji = '💼';
    else if (topBooster.category === 'Other') emoji = '🔄';
    
    const formattedImpact = topBooster.impact.toFixed(0);
    const sign = topBooster.impact > 0 ? '+' : '';
    
    if (topBooster.category === 'Other') {
        const tooltipContent = otherSubcategories.join(', ');
        topBoosterElement.innerHTML = `
            ${emoji} <span data-tooltip="Includes: ${tooltipContent}">Other</span> (${sign}${formattedImpact}%)
        `;
    } else {
        topBoosterElement.innerHTML = `
            ${emoji} ${topBooster.category} (${sign}${formattedImpact}%)
        `;
    }
    
    const boosterBox = document.getElementById('topBoosterBox');
    if (categoryColors[topBooster.category]) {
        const borderColor = categoryColors[topBooster.category].border;
        boosterBox.style.borderLeftColor = borderColor;
        
        const boosterIcon = boosterBox.querySelector('.booster-icon');
        if (boosterIcon) {
            boosterIcon.style.color = borderColor;
        }
    }
}

// Function to generate insights based on activity data
function generateInsights(activities) {
    if (!activities || activities.length === 0) {
        updateInsightText('topRecommendation', 'Add some activities to get personalized recommendations.');
        updateInsightText('energyDrainAlert', 'No energy drains detected yet.');
        return;
    }
    
    // Find top energy booster
    const topBooster = findTopEnergyBooster(activities);
    
    // Find top energy drain
    const topDrain = findTopEnergyDrain(activities);
    
    // Generate recommendation based on top booster
    let recommendation = '';
    if (topBooster.category !== 'None' && topBooster.impact > 0) {
        const boosterEmoji = getCategoryEmoji(topBooster.category);
        
        if (topBooster.category === 'Rest') {
            recommendation = `Try to schedule more ${boosterEmoji} ${topBooster.category} activities in your week. Even 15 extra minutes daily could boost your energy by ${Math.round(topBooster.impact * 0.3)}%.`;
        } else if (topBooster.category === 'Exercise') {
            recommendation = `${boosterEmoji} ${topBooster.category} is your top energy booster. Consider adding one more short workout to your weekly routine for maximum energy benefits.`;
        } else {
            recommendation = `Activities in the ${boosterEmoji} ${topBooster.category} category give you the most energy. Try to prioritize these when scheduling your week.`;
        }
    } else {
        recommendation = 'Track more activities to get personalized recommendations.';
    }
    
    // Generate alert based on top drain
    let alert = '';
    if (topDrain.category !== 'None' && topDrain.impact < 0) {
        const drainEmoji = getCategoryEmoji(topDrain.category);
        
        if (topDrain.category === 'Social') {
            alert = `${drainEmoji} ${topDrain.category} activities tend to drain your energy. Consider shorter social events or schedule them when your energy is already high.`;
        } else if (topDrain.category === 'Work') {
            alert = `${drainEmoji} ${topDrain.category} is currently your biggest energy drain. Try to take more short breaks or schedule important tasks during your peak energy hours.`;
        } else {
            alert = `Activities in the ${drainEmoji} ${topDrain.category} category tend to drain your energy. Be mindful of when you schedule these.`;
        }
    } else {
        alert = 'No significant energy drains detected yet.';
    }
    
    // Update the insight text
    updateInsightText('topRecommendation', recommendation);
    updateInsightText('energyDrainAlert', alert);
}

// Helper function to find top energy drain
function findTopEnergyDrain(activities) {
    if (!activities || activities.length === 0) {
        return { category: 'None', impact: 0 };
    }
    
    // Group activities by category
    const categoryImpacts = {};
    
    activities.forEach(activity => {
        const category = activity.category || 'Uncategorized';
        const impact = activity.energy_after - activity.energy_before;
        
        if (!categoryImpacts[category]) {
            categoryImpacts[category] = { total: 0, count: 0 };
        }
        
        categoryImpacts[category].total += impact;
        categoryImpacts[category].count += 1;
    });
    
    // Calculate average impact for each category
    let topDrain = { category: 'None', impact: 0 };
    
    Object.entries(categoryImpacts).forEach(([category, data]) => {
        const avgImpact = data.total / data.count;
        
        if (avgImpact < topDrain.impact) {
            topDrain = { category, impact: avgImpact };
        }
    });
    
    return topDrain;
}

// Helper function to get emoji for a category
function getCategoryEmoji(category) {
    switch (category) {
        case 'Exercise': return '💪';
        case 'Rest': return '😴';
        case 'Social': return '👥';
        case 'Work': return '💼';
        case 'Other': return '🔄';
        default: return '✨';
    }
}

// Helper function to update insight text
function updateInsightText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    }
}

// Modify the createCharts function to include insights generation
async function createCharts() {
    try {
        console.log('Creating charts...');
        const activities = await fetchWithRetry('/api/activities');
        console.log('Fetched activities:', activities);

        if (!activities || activities.length === 0) {
            console.log('No activities available');
            return;
        }

        const timeRange = document.getElementById('timeRange');
        const selectedRange = timeRange ? timeRange.value : 'all';
        console.log('Selected time range:', selectedRange);

        const filteredActivities = filterActivitiesByTimeRange(activities, selectedRange);
        console.log('Filtered activities:', filteredActivities);

        if (filteredActivities.length === 0) {
            showNotification('No activities found in the selected time range.', 'info');
            return;
        }

        // Update the top booster first
        updateTopBooster(filteredActivities);
        
        // Generate insights
        generateInsights(filteredActivities);

        // Create each chart if its container exists
        if (document.getElementById('energyTrendChart')) {
            createEnergyTrendChart(filteredActivities);
        }
        
        if (document.getElementById('categoryRoiChart')) {
            createCategoryRoiChart(filteredActivities);
        }
        
        if (document.getElementById('timeDistributionChart')) {
            createTimeDistributionChart(filteredActivities);
        }
    } catch (error) {
        console.error('Error creating charts:', error);
        showNotification('Failed to load chart data. Please try again.', 'danger');
    }
}

// Energy Levels Over Time Chart
function createEnergyTrendChart(activities) {
    // Get the chart canvas and destroy any existing instance
    const canvas = document.getElementById('energyTrendChart');
    if (window.chartInstances.energyTrend) {
        window.chartInstances.energyTrend.destroy();
    }
    
    // Prepare data
    const sortedActivities = [...activities].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    const labels = sortedActivities.map(a => {
        const date = new Date(a.timestamp);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayOfWeek = dayNames[date.getDay()];
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${dayOfWeek} ${month}/${day}`;
    });
    
    const beforeData = sortedActivities.map(a => a.energy_before);
    const afterData = sortedActivities.map(a => a.energy_after);
    
    // Create chart with bar type
    const ctx = canvas.getContext('2d');
    window.chartInstances.energyTrend = new Chart(ctx, {
        type: 'bar',  // Changed from 'line' to 'bar'
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Starting Energy',
                    data: beforeData,
                    backgroundColor: categoryColors['Exercise'].background,
                    borderColor: categoryColors['Exercise'].border,
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                },
                {
                    label: 'Ending Energy',
                    data: afterData,
                    backgroundColor: categoryColors['Rest'].background,
                    borderColor: categoryColors['Rest'].border,
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        font: {
                            size: 14,
                            family: "'Inter', sans-serif",
                            weight: '600'
                        },
                        padding: 20
                    }
                },
                title: {
                    display: true,
                    text: 'Energy Level Tracking',
                    color: 'rgba(255, 255, 255, 0.9)',
                    font: {
                        size: 16,
                        family: "'Inter', sans-serif",
                        weight: '600'
                    },
                    padding: {
                        top: 20,
                        bottom: 10
                    }
                },
                subtitle: {
                    display: true,
                    text: 'Compare your energy before and after activities',
                    color: 'rgba(255, 255, 255, 0.7)',
                    font: {
                        size: 14,
                        family: "'Inter', sans-serif"
                    },
                    padding: {
                        bottom: 20
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label;
                            const value = context.raw;
                            return `${label}: ${value}% energy`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: 1,
                    max: 10,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        font: {
                            size: 12,
                            family: "'Inter', sans-serif"
                        },
                        stepSize: 1
                    },
                    title: {
                        display: true,
                        text: 'Energy Level (1-10)',
                        color: 'rgba(255, 255, 255, 0.8)',
                        font: {
                            weight: 'bold',
                            size: 14,
                            family: "'Inter', sans-serif"
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        font: {
                            size: 12,
                            family: "'Inter', sans-serif"
                        },
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });
    
    // Add instruction text below the chart
    const container = canvas.parentElement;
    let instruction = container.querySelector('.chart-instruction');
    if (!instruction) {
        instruction = document.createElement('div');
        instruction.className = 'chart-instruction';
        container.appendChild(instruction);
    }
    instruction.innerHTML = `
        <div class="pro-tip">
            <span class="tip-icon">✅</span>
            <span class="tip-text">
                <strong>Pro Tip:</strong> When green bars are taller than gold, you <strong>gained</strong> energy! 
                <span class="trend-icon">📈</span>
            </span>
        </div>
    `;
    
    // Add the styles directly to ensure they're applied
    instruction.style.marginTop = '15px';
    instruction.style.textAlign = 'center';
    
    const proTip = instruction.querySelector('.pro-tip');
    proTip.style.display = 'inline-flex';
    proTip.style.alignItems = 'center';
    proTip.style.backgroundColor = 'rgba(30, 58, 138, 0.1)';
    proTip.style.borderLeft = '4px solid rgba(30, 58, 138, 0.8)';
    proTip.style.padding = '10px 15px';
    proTip.style.borderRadius = '4px';
    
    const tipIcon = instruction.querySelector('.tip-icon');
    tipIcon.style.fontSize = '18px';
    tipIcon.style.marginRight = '8px';
    
    const tipText = instruction.querySelector('.tip-text');
    tipText.style.color = 'rgba(255, 255, 255, 0.9)';
    
    const trendIcon = instruction.querySelector('.trend-icon');
    trendIcon.style.marginLeft = '5px';
}

// Energy ROI by Category Chart
function createCategoryRoiChart(activities) {
    // Get the chart canvas and destroy any existing instance
    const canvas = document.getElementById('categoryRoiChart');
    if (window.chartInstances.categoryRoi) {
        window.chartInstances.categoryRoi.destroy();
    }
    
    // Group and calculate data
    const categoryData = {};
    activities.forEach(activity => {
        const category = activity.category || 'Uncategorized';
        const energyChange = activity.energy_after - activity.energy_before;
        const roi = activity.duration_minutes > 0 ? energyChange / activity.duration_minutes : 0;
        
        if (!categoryData[category]) {
            categoryData[category] = { total: 0, count: 0 };
        }
        categoryData[category].total += roi;
        categoryData[category].count += 1;
    });
    
    // Calculate averages and sort
    const roiData = Object.entries(categoryData).map(([category, data]) => ({
        category,
        roi: (data.total / data.count) * 60
    })).sort((a, b) => b.roi - a.roi);
    
    const categories = roiData.map(d => d.category);
    const roiValues = roiData.map(d => d.roi);
    
    // Create gradients for bars
    const ctx = canvas.getContext('2d');
    const positiveGradient = ctx.createLinearGradient(0, 0, 200, 0);
    positiveGradient.addColorStop(0, '#1E3A8A');  // Navy
    positiveGradient.addColorStop(1, '#164E63');  // Teal
    
    const negativeGradient = ctx.createLinearGradient(0, 0, 200, 0);
    negativeGradient.addColorStop(0, '#991B1B');  // Deep red
    negativeGradient.addColorStop(1, '#7F1D1D');  // Darker red
    
    const backgroundColors = roiValues.map(val => val >= 0 ? positiveGradient : negativeGradient);
    
    // Create chart and store instance
    window.chartInstances.categoryRoi = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: categories.map((cat, i) => {
                const roi = roiValues[i];
                const percent = Math.abs(Math.round(roi));
                const arrow = roi >= 0 ? '▲' : '▼';
                return `${getCategoryIcon(cat)} ${cat} ${arrow} ${percent}%`;
            }),
            datasets: [{
                data: roiValues.map(Math.abs),
                backgroundColor: backgroundColors,
                borderColor: '#1F2937',
                borderWidth: 2,
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Energy Impact by Activity Type',
                    color: '#E5E7EB',
                    font: {
                        size: 16,
                        family: "'Inter', sans-serif",
                        weight: '600'
                    },
                    padding: 20
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 12,
                            family: "'Inter', sans-serif"
                        },
                        color: '#E5E7EB'
                    }
                }
            }
        }
    });
}

// Time Distribution by Category Chart
function createTimeDistributionChart(activities) {
    const canvas = document.getElementById('timeDistributionChart');
    if (window.chartInstances.timeDistribution) {
        window.chartInstances.timeDistribution.destroy();
    }
    
    const categoryData = {};
    activities.forEach(activity => {
        const category = activity.category || 'Uncategorized';
        if (!categoryData[category]) {
            categoryData[category] = 0;
        }
        categoryData[category] += activity.duration_minutes;
    });
    
    const categories = Object.keys(categoryData);
    const durations = categories.map(cat => categoryData[cat]);
    const total = durations.reduce((a, b) => a + b, 0);
    
    const backgroundColors = categories.map(category => 
        categoryColors[category]?.background || 'rgba(156, 163, 175, 0.8)'
    );
    const borderColors = categories.map(category => 
        categoryColors[category]?.border || 'rgba(156, 163, 175, 1)'
    );
    
    const ctx = canvas.getContext('2d');
    window.chartInstances.timeDistribution = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: categories.map(cat => {
                const minutes = categoryData[cat];
                const percentage = Math.round((minutes / total) * 100);
                const label = `${getCategoryIcon(cat)} ${cat} (${percentage}%)`;
                if (cat === 'Other') {
                    return {
                        text: label,
                        tooltip: `Includes: ${otherSubcategories.join(', ')}`
                    };
                }
                return label;
            }),
            datasets: [{
                data: durations,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        font: {
                            size: 12,
                            family: "'Inter', sans-serif",
                            weight: '500'
                        },
                        padding: 15,
                        color: '#E5E7EB',
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const meta = chart.getDatasetMeta(0);
                                    const style = meta.controller.getStyle(i);
                                    
                                    const labelText = typeof label === 'object' ? label.text : label;
                                    const tooltipText = typeof label === 'object' ? label.tooltip : null;
                                    
                                    const element = document.createElement('span');
                                    element.textContent = labelText;
                                    if (tooltipText) {
                                        element.setAttribute('data-tooltip', tooltipText);
                                    }
                                    
                                    return {
                                        text: labelText,
                                        fillStyle: style.backgroundColor,
                                        strokeStyle: style.borderColor,
                                        lineWidth: style.borderWidth,
                                        hidden: !chart.getDataVisibility(i),
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Time Distribution',
                    color: '#E5E7EB',
                    font: {
                        size: 16,
                        family: "'Inter', sans-serif",
                        weight: '600'
                    },
                    padding: 20
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label;
                            if (context.label.includes('Other')) {
                                return [
                                    label,
                                    `Includes: ${otherSubcategories.join(', ')}`
                                ];
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// Add after the DOMContentLoaded event listener
function initializeActivitiesToggle() {
    const toggleBtn = document.getElementById('toggleActivities');
    const activitiesList = document.getElementById('activitiesList');
    
    if (!toggleBtn || !activitiesList) {
        console.error('Activities toggle elements not found!');
        return;
    }
    
    // Load saved preference
    const isCollapsed = localStorage.getItem('activitiesCollapsed') === 'true';
    if (isCollapsed) {
        activitiesList.classList.add('collapsed');
        toggleBtn.classList.add('collapsed');
        toggleBtn.querySelector('.toggle-text').textContent = 'Show Activities';
    }
    
    // Handle toggle click
    toggleBtn.addEventListener('click', function() {
        const isNowCollapsed = !activitiesList.classList.contains('collapsed');
        
        // Toggle classes
        activitiesList.classList.toggle('collapsed');
        toggleBtn.classList.toggle('collapsed');
        
        // Update text
        toggleBtn.querySelector('.toggle-text').textContent = 
            isNowCollapsed ? 'Show Activities' : 'Hide Activities';
        
        // Save preference
        localStorage.setItem('activitiesCollapsed', isNowCollapsed);
    });
}

function createEnergyChart(activities) {
    const ctx = document.getElementById('energyChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.energyChart) {
        window.energyChart.destroy();
    }

    window.energyChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Energy Level',
                data: activities.map(activity => ({
                    x: new Date(activity.timestamp),
                    y: activity.energy_after
                })),
                borderColor: '#4CAF50',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: window.innerWidth < 768 ? 'bottom' : 'right',
                    labels: {
                        boxWidth: window.innerWidth < 768 ? 12 : 15,
                        font: {
                            size: window.innerWidth < 768 ? 12 : 14
                        }
                    }
                },
                tooltip: {
                    titleFont: {
                        size: window.innerWidth < 768 ? 12 : 14
                    },
                    bodyFont: {
                        size: window.innerWidth < 768 ? 11 : 13
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day'
                    },
                    ticks: {
                        font: {
                            size: window.innerWidth < 768 ? 10 : 12
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 10,
                    ticks: {
                        stepSize: 1,
                        font: {
                            size: window.innerWidth < 768 ? 10 : 12
                        }
                    }
                }
            }
        }
    });
}

function createCategoryChart(activities) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.categoryChart) {
        window.categoryChart.destroy();
    }

    // Calculate average energy change per category
    const categoryData = {};
    activities.forEach(activity => {
        if (!categoryData[activity.category]) {
            categoryData[activity.category] = {
                total: 0,
                count: 0
            };
        }
        categoryData[activity.category].total += (activity.energy_after - activity.energy_before);
        categoryData[activity.category].count += 1;
    });

    const categories = Object.keys(categoryData);
    const averages = categories.map(cat => 
        categoryData[cat].total / categoryData[cat].count
    );

    window.categoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [{
                label: 'Average Energy Change',
                data: averages,
                backgroundColor: averages.map(val => 
                    val >= 0 ? 'rgba(76, 175, 80, 0.6)' : 'rgba(244, 67, 54, 0.6)'
                )
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: window.innerWidth < 768 ? 'bottom' : 'right',
                    labels: {
                        boxWidth: window.innerWidth < 768 ? 12 : 15,
                        font: {
                            size: window.innerWidth < 768 ? 12 : 14
                        }
                    }
                },
                tooltip: {
                    titleFont: {
                        size: window.innerWidth < 768 ? 12 : 14
                    },
                    bodyFont: {
                        size: window.innerWidth < 768 ? 11 : 13
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        font: {
                            size: window.innerWidth < 768 ? 10 : 12
                        }
                    }
                },
                y: {
                    ticks: {
                        font: {
                            size: window.innerWidth < 768 ? 10 : 12
                        }
                    }
                }
            }
        }
    });
}

// Add resize handler for charts
window.addEventListener('resize', () => {
    if (window.energyChart) {
        createEnergyChart(window.currentActivities || []);
    }
    if (window.categoryChart) {
        createCategoryChart(window.currentActivities || []);
    }
}); 