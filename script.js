/**
 * =================================================================
 * NutriGuide - Main Application Logic
 * =================================================================
 * This script handles all the dynamic functionality of the NutriGuide
 * web application. It manages user state, navigation, form handling,
 * API calls to the AI, and rendering of dynamic content like charts
 * and meal plans.
 */

// =================================================================
// SECTION 1: GLOBAL STATE AND VARIABLES
// =================================================================
// These variables hold the application's state and are accessible
// throughout the script.

// `currentStep`: Tracks the current step in the multi-page onboarding form.
let currentStep = 1;

// `userProfile`: Stores all information about the logged-in user,
// including their personal details and their generated meal plan.
// It's `null` when no user is logged in.
let userProfile = null;

// `mealHistory`: An array to store logs of daily meals.
// Each entry represents a day's meal log.
let mealHistory = [];

// `weightData`: An array of objects to track weight over time.
// Each object contains a `date` and `weight`.
let weightData = [];

// `weightChart`, `macroChart`: Variables to hold the Chart.js instances
// so they can be destroyed and re-rendered when data changes.
let weightChart;
let macroChart;

// `isProUser`: A boolean flag to track if the current user has a "Pro" subscription.
let isProUser = false;


// =================================================================
// SECTION 2: UI NAVIGATION AND VIEW MANAGEMENT
// =================================================================
// Functions that control which section of the application is visible.

/**
 * Hides all main sections and shows only the one with the specified ID.
 * This function acts as a simple single-page application (SPA) router.
 * @param {string} sectionId - The ID of the HTML <section> element to display.
 */
function showSection(sectionId) {
    // Hide all sections that have the 'view-section' class.
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.add('hidden');
    });

    // Show the target section.
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.remove('hidden');
    }

    // Special cases: some sections need to be re-rendered when shown.
    if (sectionId === 'progress-dashboard-section') {
        renderDashboard();
    }
    // No special render needed for other pages as they are static for now.
}

/**
 * Navigates to the next step in the multi-step form.
 * @param {number} step - The step number to navigate to.
 */
function nextStep(step) {
    document.getElementById(`step-${currentStep}`).classList.add('hidden');
    document.getElementById(`step-${step}`).classList.remove('hidden');
    currentStep = step;
}

/**
 * Navigates to the previous step in the multi-step form.
 * @param {number} step - The step number to navigate to.
 */
function prevStep(step) {
    document.getElementById(`step-${currentStep}`).classList.add('hidden');
    document.getElementById(`step-${step}`).classList.remove('hidden');
    currentStep = step;
}

/**
 * A dedicated function to navigate back to the home page.
 * It's cleaner than calling showSection directly everywhere.
 */
function showHomePage() {
    showSection('home-page-section');
    updateProFeatures(); // Ensure Pro features are correctly displayed.
}

// =================================================================
// SECTION 3: EVENT LISTENERS
// =================================================================
// This is where we attach functions to user interactions like clicks and form submissions.

// This function runs when the entire page content has loaded.
document.addEventListener('DOMContentLoaded', () => {

    // --- Login Form ---
    document.getElementById('login-form').addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent the form from reloading the page.
        document.getElementById('main-nav').classList.remove('hidden'); // Show the main navigation bar.
        showHomePage();
        updateProFeatures(); // Update UI based on user's subscription status.
    });

    // --- Navigation Links ---
    document.getElementById('home-link').addEventListener('click', (event) => {
        event.preventDefault();
        showHomePage();
    });

    document.getElementById('help-link').addEventListener('click', (event) => {
        event.preventDefault();
        showSection('help-section');
    });

    document.querySelector('.pro-button').addEventListener('click', () => {
        showSection('pro-section');
    });

    // --- Home Page Main Action Cards ---
    document.getElementById('ai-nutritionist-card').addEventListener('click', () => {
        // If the user already has a plan, show it. Otherwise, show the onboarding form.
        if (userProfile && userProfile.latestPlan) {
            showSection('meal-plan-section');
        } else {
            showSection('onboarding-section');
        }
    });

    document.getElementById('view-progress-card').addEventListener('click', () => {
        showSection('progress-dashboard-section');
    });

    // --- Home Page "Glass" Icon Cards ---
    document.getElementById('daily-highlights-card').addEventListener('click', () => {
        showSection('daily-highlights-section');
    });

    document.getElementById('tip-of-day-card').addEventListener('click', () => {
        showSection('tip-of-the-day-section');
    });

    document.getElementById('community-card').addEventListener('click', () => {
        showSection('community-section');
    });

    // --- Home Page Pro Feature Cards ---
    document.getElementById('log-meal-card-parent').addEventListener('click', () => {
        if (isProUser) {
            showToast("Photo meal logging coming soon!");
        } else {
            showSection('pro-section'); // Prompt user to upgrade
        }
    });

    document.getElementById('sync-data-card-parent').addEventListener('click', () => {
        if (isProUser) {
            showToast("Wearable sync coming soon!");
        } else {
            showSection('pro-section'); // Prompt user to upgrade
        }
    });
    
    // --- Onboarding Form ---
    document.getElementById('nutrition-form').addEventListener('submit', handleNutritionFormSubmit);

    // --- Pro/Upgrade Section ---
    document.getElementById('upgrade-now-button').addEventListener('click', toggleProStatus);
    
    // --- Meal Plan Section ---
    document.getElementById('log-meals-button').addEventListener('click', () => {
        const checkedMeals = document.querySelectorAll('#meal-plan-checklist input:checked');
        if (checkedMeals.length > 0) {
            mealHistory.push({
                date: new Date().toLocaleDateString(),
                meals: Array.from(checkedMeals).map(cb => cb.id.replace('meal-', ''))
            });
            showToast(`Logged ${checkedMeals.length} meals for today!`);
            showHomePage();
        } else {
            showToast("Please check at least one meal to log your day.");
        }
    });
});


// =================================================================
// SECTION 4: CORE APPLICATION LOGIC
// =================================================================
// This section contains the main business logic, including form processing,
// calculations, and communication with the AI model.

/**
 * Handles the submission of the multi-step nutrition form.
 * It collects data, triggers calculations and the AI call, then updates the UI.
 */
async function handleNutritionFormSubmit(event) {
    event.preventDefault(); // Stop the default form submission.
    document.getElementById('form-error-message').textContent = ''; // Clear previous errors.

    const submitButton = this.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    // Provide visual feedback that something is happening.
    submitButton.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Generating...
    `;

    try {
        // 1. Collect all data from the form fields.
        userProfile = {
            name: document.getElementById('name').value,
            age: parseInt(document.getElementById('age').value),
            height: parseInt(document.getElementById('height').value),
            weight: parseInt(document.getElementById('weight').value),
            activityLevel: document.getElementById('activity-level').value,
            dietaryPreference: document.getElementById('dietary-preference').value,
            allergies: document.getElementById('allergies').value,
            culturalPreference: document.getElementById('cultural-preference').value,
            healthGoal: document.getElementById('health-goal').value,
        };

        // Initialize weight tracking data with the starting weight.
        weightData = [{ date: new Date().toLocaleDateString(), weight: userProfile.weight }];

        // 2. Perform necessary health calculations.
        userProfile.bmi = calculateBMI(userProfile.weight, userProfile.height);
        userProfile.calories = calculateCalories(userProfile);

        // 3. Call the AI to generate a meal plan.
        const planData = await generateAiPlan(userProfile);

        // 4. If the AI returns a valid plan, update the application state and UI.
        if (planData && planData.meals && planData.macros) {
            userProfile.latestPlan = planData;
            updateDailyHighlights(userProfile);
            updateAiCard(); // Change the AI card to "View Plan".
            displayMealPlanChecklist(userProfile.latestPlan);
            showSection('meal-plan-section'); // Navigate to the meal plan view.
        } else {
            document.getElementById('form-error-message').textContent = "Sorry, we couldn't generate a plan. The AI might be busy. Please try again.";
        }
    } catch (error) {
        console.error('Error generating AI plan:', error);
        document.getElementById('form-error-message').textContent = "An error occurred. Please check your inputs and try again.";
    } finally {
        // 5. Reset the submit button regardless of success or failure.
        submitButton.disabled = false;
        submitButton.textContent = 'Generate My Plan';
    }
}


/**
 * Communicates with the Gemini AI to generate a meal plan.
 * @param {object} userData - The collected user profile data.
 * @returns {Promise<object|null>} A promise that resolves to the parsed JSON meal plan, or null on failure.
 */
async function generateAiPlan(userData) {
    // NOTE: In a real-world application, the API key should be handled securely on a server.
    const apiKey = ""; // This is handled by the execution environment.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    // Construct the prompt with clear instructions for the AI.
    const prompt = `
        You are an expert nutritionist. Create a personalized one-day meal plan for a user with the goal of consuming approximately ${userData.calories} kcal.

        User Profile:
        - Goal: ${userData.healthGoal}
        - Dietary Preference: ${userData.dietaryPreference}
        - Allergies: ${userData.allergies || 'None'}
        - Cultural Preference: ${userData.culturalPreference || 'None'}

        Provide a simple, healthy, and balanced meal plan. 
        
        Return the response ONLY as a valid JSON object with the following structure:
        {
          "meals": {
            "Breakfast": "...",
            "Lunch": "...",
            "Dinner": "...",
            "Snack": "..."
          },
          "macros": {
            "protein": <percentage>,
            "carbs": <percentage>,
            "fats": <percentage>
          }
        }
        The sum of macro percentages must be 100.
    `;

    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        console.error("API Error Response:", await response.text());
        throw new Error(`API call failed with status: ${response.status}`);
    }

    const result = await response.json();
    const candidate = result.candidates?.[0];

    if (candidate && candidate.content?.parts?.[0]?.text) {
        // Clean up the response from the AI to ensure it's valid JSON.
        const textResponse = candidate.content.parts[0].text;
        const cleanedJsonString = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            return JSON.parse(cleanedJsonString);
        } catch (e) {
            console.error("Failed to parse JSON from AI response:", cleanedJsonString);
            throw new Error("Could not understand the AI's response format.");
        }
    } else {
        console.error("Invalid response structure from API:", result);
        throw new Error('Invalid or empty response from API');
    }
}

// =================================================================
// SECTION 5: HELPER & CALCULATION FUNCTIONS
// =================================================================

/**
 * Calculates Body Mass Index (BMI).
 * @param {number} weight - Weight in kilograms.
 * @param {number} height - Height in centimeters.
 * @returns {number} The calculated BMI, rounded to one decimal place.
 */
function calculateBMI(weight, height) {
    if (height <= 0) return 0;
    const heightInMeters = height / 100;
    const bmi = weight / (heightInMeters * heightInMeters);
    return parseFloat(bmi.toFixed(1));
}

/**
 * Calculates estimated daily calorie needs using a simplified Mifflin-St Jeor equation.
 * @param {object} profile - The user's profile data.
 * @returns {number} The estimated daily calorie needs.
 */
function calculateCalories(profile) {
    const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5;
    const activityMultipliers = {
        'sedentary': 1.2, 'light': 1.375, 'moderate': 1.55,
        'active': 1.725, 'extra-active': 1.9
    };
    const tdee = bmr * (activityMultipliers[profile.activityLevel] || 1.2);

    switch (profile.healthGoal) {
        case 'weight-loss': return Math.round(tdee - 500);
        case 'muscle-gain': return Math.round(tdee + 300);
        default: return Math.round(tdee);
    }
}

// =================================================================
// SECTION 6: UI RENDERING FUNCTIONS
// =================================================================

/**
 * Updates the "Daily Highlights" card on the home page with user's stats.
 * @param {object} profile - The user's profile containing stats.
 */
function updateDailyHighlights(profile) {
    const container = document.getElementById('daily-highlights-content');
    if (!profile || !profile.calories || !profile.bmi) {
        container.innerHTML = `<p class="col-span-full text-gray-400">Complete your profile to see your stats!</p>`;
        return;
    }
    container.innerHTML = `
        <div class="text-center p-4 bg-gray-700 rounded-xl"><p class="text-sm text-gray-400">Target Calories</p><p class="text-xl font-bold text-indigo-400">${profile.calories} kcal</p></div>
        <div class="text-center p-4 bg-gray-700 rounded-xl"><p class="text-sm text-gray-400">BMI</p><p class="text-xl font-bold text-cyan-400">${profile.bmi}</p></div>
        <div class="text-center p-4 bg-gray-700 rounded-xl"><p class="text-sm text-gray-400">Protein</p><p class="text-xl font-bold text-green-400">${profile.latestPlan.macros.protein}%</p></div>
        <div class="text-center p-4 bg-gray-700 rounded-xl"><p class="text-sm text-gray-400">Carbs</p><p class="text-xl font-bold text-yellow-400">${profile.latestPlan.macros.carbs}%</p></div>
    `;
}

/**
 * Updates the main AI Nutritionist card on the home page after a plan is generated.
 */
function updateAiCard() {
    document.querySelector('#ai-nutritionist-card p').textContent = "You have an active plan. View or regenerate it here.";
    document.getElementById('ai-card-button').textContent = "View Your Plan";
}

/**
 * Renders the generated meal plan as an interactive checklist.
 * @param {object} plan - The meal plan object from the AI.
 */
function displayMealPlanChecklist(plan) {
    const container = document.getElementById('meal-plan-checklist');
    const allergyNote = document.getElementById('allergy-note');
    container.innerHTML = '';

    if (userProfile.allergies) {
        allergyNote.classList.remove('hidden');
        allergyNote.textContent = `Note: This plan was generated excluding your listed allergies: ${userProfile.allergies}. Always double-check ingredients.`;
    } else {
        allergyNote.classList.add('hidden');
    }

    Object.entries(plan.meals).forEach(([meal, description]) => {
        container.innerHTML += `
            <div class="flex items-start">
                <input type="checkbox" id="meal-${meal}" class="mt-1 h-5 w-5 rounded-full border-gray-500 text-green-500 focus:ring-green-600 bg-gray-700 cursor-pointer">
                <div class="ml-4">
                    <label for="meal-${meal}" class="font-semibold text-lg cursor-pointer">${meal}</label>
                    <p class="text-gray-400">${description}</p>
                </div>
            </div>`;
    });
}

/**
 * Renders the entire Progress Dashboard, including charts.
 */
function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    if (!userProfile || !userProfile.latestPlan) {
        container.innerHTML = `<h2 class="text-2xl font-semibold mb-4 text-center">Progress Dashboard</h2><p class="text-center text-gray-400">Generate a meal plan first to start tracking your progress!</p>`;
        return;
    }

    container.innerHTML = `
        <h2 class="text-2xl font-semibold mb-6">Progress Dashboard</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <h3 class="font-semibold mb-4">Weight Journey</h3>
                <canvas id="weightChart"></canvas>
                <div class="mt-4"><input type="number" id="new-weight-input" placeholder="Enter today's weight (kg)" class="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg"><button id="add-weight-btn" class="mt-2 w-full p-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-semibold">Add Weight Entry</button></div>
            </div>
            <div><h3 class="font-semibold mb-4">Target Macronutrient Split</h3><canvas id="macroChart"></canvas></div>
        </div>
        <div class="mt-8"><h3 class="font-semibold mb-4">Meal Log History</h3><div id="meal-history-container" class="space-y-2 text-gray-400"></div></div>`;

    if (weightChart) weightChart.destroy();
    if (macroChart) macroChart.destroy();

    weightChart = new Chart(document.getElementById('weightChart').getContext('2d'), {
        type: 'line', data: { labels: weightData.map(d => d.date), datasets: [{ label: 'Weight (kg)', data: weightData.map(d => d.weight), borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.2)', fill: true, tension: 0.3 }] }, options: { responsive: true, scales: { y: { beginAtZero: false } } }
    });

    const macros = userProfile.latestPlan.macros;
    macroChart = new Chart(document.getElementById('macroChart').getContext('2d'), {
        type: 'doughnut', data: { labels: ['Protein', 'Carbs', 'Fats'], datasets: [{ data: [macros.protein, macros.carbs, macros.fats], backgroundColor: ['#4ade80', '#facc15', '#f87171'], borderColor: '#1f2937' }] }, options: { responsive: true, cutout: '60%' }
    });
    
    renderMealHistory();
    document.getElementById('add-weight-btn').addEventListener('click', addNewWeightEntry);
}

function addNewWeightEntry() {
    const input = document.getElementById('new-weight-input');
    const newWeight = parseFloat(input.value);
    if (newWeight && newWeight > 0) {
        weightData.push({ date: new Date().toLocaleDateString(), weight: newWeight });
        input.value = '';
        renderDashboard();
        showToast("Weight entry added!");
    }
}

function renderMealHistory() {
    const container = document.getElementById('meal-history-container');
    if (!container) return;
    if (mealHistory.length === 0) {
        container.innerHTML = '<p>No meals logged yet. Complete a day on your meal plan page!</p>';
    } else {
        container.innerHTML = mealHistory.map(log => `<div class="p-2 bg-gray-700 rounded-lg"><strong>${log.date}:</strong> Logged ${log.meals.length} meals.</div>`).join('');
    }
}

// =================================================================
// SECTION 7: PRO FEATURES & USER MANAGEMENT
// =================================================================

function logout() { window.location.reload(); }

function toggleProStatus() {
    isProUser = !isProUser;
    showToast(isProUser ? "Congratulations! You're now a Pro member." : "You are now on the free plan.");
    updateProFeatures();
    showHomePage();
}

function updateProFeatures() {
    const proBadge = document.getElementById('pro-badge');
    const proCards = document.querySelectorAll('.pro-feature-card');
    const upgradeButton = document.getElementById('upgrade-now-button');

    if (isProUser) {
        proBadge.classList.remove('hidden');
        proCards.forEach(card => {
            card.classList.remove('opacity-60');
            card.classList.add('unlocked');
            card.querySelector('p').textContent = card.querySelector('p').textContent.replace(' (Pro Feature)', '');
        });
        upgradeButton.textContent = 'You Are a Pro Member';
        upgradeButton.disabled = true;
    } else {
        proBadge.classList.add('hidden');
        proCards.forEach(card => {
            card.classList.add('opacity-60');
            card.classList.remove('unlocked');
            const p = card.querySelector('p');
            if (!p.textContent.includes('(Pro Feature)')) { p.textContent += ' (Pro Feature)'; }
        });
        upgradeButton.textContent = 'Upgrade Now';
        upgradeButton.disabled = false;
    }
}

// =================================================================
// SECTION 8: MISCELLANEOUS UI & UTILITIES
// =================================================================

function showToast(message) {
    const toast = document.getElementById('toast-notification');
    toast.textContent = message;
    toast.classList.remove('opacity-0');
    setTimeout(() => { toast.classList.add('opacity-0'); }, 3000);
}

