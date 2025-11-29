/**
 * Virgin Voyages API Integration
 * Handles authentication and data fetching directly from the browser.
 */

const VV_API_BASE = 'https://mobile.shore.virginvoyages.com';

// Headers from the curl command
const COMMON_HEADERS = {
    'accept': 'application/json',
    'accept-encoding': 'gzip',
    'accept-language': 'en-US,en;q=0.9',
    'connection': 'Keep-Alive',
    'content-type': 'application/json',
    'user-agent': 'okhttp/4.12.0'
};

const VirginAPI = {

    /**
     * Authenticate with the API
     * @param {string} username 
     * @param {string} password 
     * @returns {Promise<string>} accessToken
     */
    async login(username, password) {
        const url = `${VV_API_BASE}/user-account-service/signin/email`;

        // Static Basic Auth from the curl command
        const BASIC_AUTH = 'Basic [REDACTED_TOKEN]';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                ...COMMON_HEADERS,
                'authorization': BASIC_AUTH,
                'content-type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify({
                password: password,
                userName: username
            })
        });

        if (!response.ok) {
            throw new Error(`Login failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.accessToken;
    },

    /**
     * Get User Profile to retrieve reservation details
     * @param {string} accessToken 
     * @returns {Promise<Object>} Profile data containing reservation info
     */
    async getProfile(accessToken) {
        const url = `${VV_API_BASE}/guest-bff/nsa/sailors/profile`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...COMMON_HEADERS,
                'authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get profile: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    },

    /**
     * Get Lineup (Events) for a specific day
     * @param {string} accessToken 
     * @param {string} date YYYY-MM-DD
     * @param {string} guestId 
     * @param {string} reservationNumber 
     * @param {string} voyageNumber 
     * @returns {Promise<Object>} Day's itinerary data
     */
    async getLineup(accessToken, date, guestId, reservationNumber, voyageNumber) {
        const params = new URLSearchParams({
            startDateTime: date,
            reservationGuestId: guestId,
            reservationNumber: reservationNumber,
            voyageNumber: voyageNumber
        });

        const url = `${VV_API_BASE}/guest-bff/nsa/line-ups?${params.toString()}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...COMMON_HEADERS,
                'authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get lineup for ${date}: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    },

    /**
     * Orchestrate the full data fetch
     * @param {string} username 
     * @param {string} password 
     * @param {function} onProgress Callback for status updates
     */
    async fetchAllData(username, password, onProgress = () => { }) {
        try {
            onProgress('Logging in...');
            const accessToken = await this.login(username, password);

            onProgress('Fetching profile...');
            const profile = await this.getProfile(accessToken);

            if (!profile.reservation) {
                throw new Error('No active reservation found.');
            }

            const { reservationGuestId, reservationNumber, voyageNumber, itineraries } = profile.reservation;

            if (!itineraries || itineraries.length === 0) {
                throw new Error('No itinerary days found.');
            }

            const allEvents = [];
            const totalDays = itineraries.length;

            for (let i = 0; i < totalDays; i++) {
                const day = itineraries[i];
                onProgress(`Fetching day ${i + 1} of ${totalDays} (${day.date})...`);

                // Add a small delay to be nice to the API
                await new Promise(r => setTimeout(r, 500));

                try {
                    const dayData = await this.getLineup(accessToken, day.date, reservationGuestId, reservationNumber, voyageNumber);

                    // Attach the port name to the day data so we can use it later
                    // The API returns 'portName' in the itinerary object
                    dayData.portName = day.portName || "";

                    // Ensure date is available on the top level object for script.js to use
                    if (!dayData.date) {
                        dayData.date = day.date;
                    }

                    // The API returns a structure that needs to be parsed
                    // Based on the user request, we need to mimic what 'parseRawData' expects or do it here.
                    // Let's assume the response from getLineup is the "Raw API file" content for that day.
                    // We'll collect them and process them.

                    // NOTE: The curl response for getLineup wasn't fully shown in the prompt, 
                    // but usually it contains an 'events' array.
                    // We will pass the whole object to the existing processor.
                    allEvents.push(dayData);

                } catch (err) {
                    console.error(`Error fetching day ${day.date}`, err);
                    // Continue to next day? Or fail? Let's continue.
                }
            }

            onProgress('Processing data...');
            return allEvents;

        } catch (error) {
            console.error("API Fetch Error:", error);
            throw error;
        }
    }
};

// Expose to global scope
window.VirginAPI = VirginAPI;
