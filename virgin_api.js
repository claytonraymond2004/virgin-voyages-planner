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

        // Static Basic Auth from is built into the Virgin app -- Some weird attempt at obfuscation of their API
        // This token is injected at runtime/build time
        const BASIC_AUTH = 'Basic __VV_AUTH_TOKEN__';

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
        this.saveToken(data.accessToken, data.expiresIn, username);
        return data.accessToken;
    },

    saveToken(token, expiresIn, username) {
        localStorage.setItem('vv_access_token', token);
        // expiresIn is in seconds
        const expiryMs = (expiresIn || 3600) * 1000;
        localStorage.setItem('vv_token_expiry', Date.now() + expiryMs);
        if (username) localStorage.setItem('vv_username', username);
    },

    getCachedToken() {
        const token = localStorage.getItem('vv_access_token');
        const expiry = localStorage.getItem('vv_token_expiry');
        if (!token || !expiry) return null;
        if (Date.now() > parseInt(expiry, 10)) {
            this.clearToken();
            return null;
        }
        return token;
    },

    clearToken() {
        localStorage.removeItem('vv_access_token');
        localStorage.removeItem('vv_token_expiry');
    },

    hasValidToken() {
        return !!this.getCachedToken();
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
     * Get My Agenda (Booked Events) for a specific day
     * @param {string} accessToken 
     * @param {string} date YYYY-MM-DD
     * @param {string} guestId 
     * @param {string} shipCode 
     * @returns {Promise<Object>} Agenda data
     */
    async getAgenda(accessToken, date, guestId, shipCode) {
        const params = new URLSearchParams({
            shipCode: shipCode,
            reservationGuestId: guestId,
            dateTime: date
        });

        const url = `${VV_API_BASE}/guest-bff/nsa/my-voyage/agenda?${params.toString()}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                ...COMMON_HEADERS,
                'authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.warn(`Failed to get agenda for ${date}: ${response.status}`);
            return { appointments: [] }; // Return empty on failure to not break the flow
        }

        return await response.json();
    },

    /**
     * Orchestrate the full data fetch
     * @param {string} username 
     * @param {string} password 
     * @param {function} onProgress Callback for status updates
     * @param {boolean} importBooked Whether to fetch booked events
     */
    async fetchAllData(username, password, onProgress = () => { }, importBooked = false) {
        let accessToken = this.getCachedToken();
        const cachedUsername = localStorage.getItem('vv_username');
        let usingCached = false;

        // 1. Determine if we can use cached token
        // We use cached if it exists AND (no username provided OR provided username matches cached)
        if (accessToken && (!username || (cachedUsername && username === cachedUsername))) {
            usingCached = true;
            onProgress('Resuming session...');
        } else if (username && password) {
            // 2. Explicit login required (new user or no token)
            onProgress('Logging in...');
            accessToken = await this.login(username, password);
        } else {
            // 3. No token and insufficient credentials
            throw new Error('Please enter your password to sign in.');
        }

        try {
            return await this._fetchDataInternal(accessToken, onProgress, importBooked);
        } catch (error) {
            // 4. Handle Expired Token (401)
            if (usingCached && error.message && error.message.includes('401')) {
                this.clearToken();

                if (username && password) {
                    onProgress('Session expired. Logging in...');
                    accessToken = await this.login(username, password);
                    return await this._fetchDataInternal(accessToken, onProgress, importBooked);
                } else {
                    throw new Error("Session expired. Please enter your password.");
                }
            }
            throw error;
        }
    },

    /**
     * Internal helper to execute the fetch sequence
     */
    async _fetchDataInternal(accessToken, onProgress, importBooked) {
        try {
            onProgress('Fetching profile...');
            const profile = await this.getProfile(accessToken);

            if (!profile.reservation) {
                throw new Error('No active reservation found.');
            }

            const { reservationGuestId, reservationNumber, voyageNumber, itineraries, shipCode } = profile.reservation;

            if (!itineraries || itineraries.length === 0) {
                throw new Error('No itinerary days found.');
            }

            const totalDays = itineraries.length;
            let completedCount = 0;

            // Initial progress update
            onProgress(`Fetching ${totalDays} days of data...`);

            // Helper to fetch a single day (Lineup + Agenda)
            const fetchDay = async (day) => {
                try {
                    const dayData = await this.getLineup(accessToken, day.date, reservationGuestId, reservationNumber, voyageNumber);

                    // Attach the port name
                    dayData.portName = day.portName || "";

                    // Ensure date is available
                    if (!dayData.date) {
                        dayData.date = day.date;
                    }

                    let dayBookings = [];
                    if (importBooked) {
                        // Fetch agenda
                        const sc = shipCode || (voyageNumber ? voyageNumber.substring(0, 2) : 'BR');
                        try {
                            const agendaData = await this.getAgenda(accessToken, day.date, reservationGuestId, sc);
                            if (agendaData && agendaData.appointments) {
                                dayBookings = agendaData.appointments;
                            }
                        } catch (err) {
                            if (err.message && err.message.includes('401')) throw err;
                            console.warn(`Error fetching agenda for ${day.date}`, err);
                        }
                    }

                    completedCount++;
                    onProgress(`Fetching days... (${completedCount}/${totalDays})`);

                    return { dayData, dayBookings };

                } catch (err) {
                    if (err.message && err.message.includes('401')) throw err;
                    // Log but continue for other errors
                    console.error(`Error fetching day ${day.date}`, err);
                    completedCount++;
                    onProgress(`Fetching days... (${completedCount}/${totalDays})`);
                    return null;
                }
            };

            // Execute all day fetches in parallel
            const results = await Promise.all(itineraries.map(day => fetchDay(day)));

            const allEvents = [];
            const bookedEvents = [];

            // Aggregate results
            results.forEach(result => {
                if (result) {
                    allEvents.push(result.dayData);
                    bookedEvents.push(...result.dayBookings);
                }
            });

            onProgress('Processing data...');
            return { events: allEvents, bookedEvents };

        } catch (error) {
            // Propagate 401s to be handled by the caller
            if (error.message && error.message.includes('401')) {
                throw new Error("401 Unauthorized");
            }
            console.error("API Fetch Error:", error);
            throw error;
        }
    }
};

// Expose to global scope
window.VirginAPI = VirginAPI;
