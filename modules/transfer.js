
import { showToast } from './ui.js';

// Constants
const DPASTE_API_URL = 'https://dpaste.com/api/';

/**
 * Gathers all application data from localStorage.
 * @returns {Object} The data object to be transferred.
 */
export function exportData() {
    const data = {};
    // Explicitly exclude auth tokens
    const EXCLUDED_KEYS = ['vv_access_token', 'vv_token_expiry', 'vv_username'];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('virginVoyages') && !EXCLUDED_KEYS.includes(key)) {
            data[key] = localStorage.getItem(key);
        }
    }
    return data;
}

/**
 * Uploads data to dpaste.com.
 * @param {Object} data - The data to upload.
 * @returns {Promise<string>} The URL of the uploaded file (raw .txt link).
 */
export async function uploadData(data) {
    try {
        console.log('Starting upload to dpaste.com...');
        const jsonString = JSON.stringify(data);
        const formData = new FormData();
        formData.append('content', jsonString);
        formData.append('expiry_days', '1');
        formData.append('syntax', 'json'); // Optional, for syntax highlighting in UI

        // 15 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(DPASTE_API_URL, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            console.log('Upload response status:', response.status);

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            // dpaste returns the URL in the body as text
            let url = await response.text();
            url = url.trim();
            console.log('Upload result URL:', url);

            if (!url.startsWith('http')) {
                throw new Error('Upload failed: Invalid response from server');
            }

            // Return the raw text URL for direct JSON fetching
            return url + '.txt';
        } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
                throw new Error('Upload timed out. Please check your internet connection.');
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Error uploading data:', error);
        throw error;
    }
}

/**
 * Downloads data from a given URL.
 * @param {string} url - The URL to download data from.
 * @returns {Promise<Object>} The downloaded data.
 */
export async function downloadData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText} `);
        }
        return await response.json();
    } catch (error) {
        console.error('Error downloading data:', error);
        throw error;
    }
}

/**
 * Imports data into localStorage and reloads the page.
 * @param {Object} data - The data to import.
 */
export function importData(data) {
    if (!data || Object.keys(data).length === 0) {
        showToast('No valid data found to import.', 'error');
        return;
    }

    try {
        // Clear existing app data to avoid conflicts, or just overwrite. 
        // Overwriting is safer for keys that might not be in the import.
        // But to be clean, let's overwrite specific keys.

        Object.keys(data).forEach(key => {
            if (key.startsWith('virginVoyages')) {
                localStorage.setItem(key, data[key]);
            }
        });

        showToast('Data imported successfully! Reloading...', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (error) {
        console.error('Error importing data:', error);
        showToast('Failed to save data to local storage.', 'error');
    }
}

/**
 * Generates a QR code for the given text.
 * @param {string} text - The text to encode.
 * @param {HTMLElement} element - The DOM element to render the QR code into.
 */
export function generateQR(text, element) {
    element.innerHTML = ''; // Clear previous
    new QRCode(element, {
        text: text,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
    });
}

let html5QrCode;

/**
 * Starts the QR code scanner.
 * @param {string} elementId - The ID of the HTML element to render the scanner into.
 * @param {Function} onScanSuccess - Callback function when a QR code is successfully scanned.
 * @param {Function} onScanFailure - Callback function when scanning fails (optional).
 */
export function startScanner(elementId, onScanSuccess, onScanFailure) {
    if (html5QrCode) {
        // Already running or instance exists
        return;
    }

    html5QrCode = new Html5Qrcode(elementId);
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText, decodedResult) => {
            // Handle the scanned code
            stopScanner().then(() => {
                onScanSuccess(decodedText, decodedResult);
            });
        },
        (errorMessage) => {
            // parse error, ignore it.
            if (onScanFailure) onScanFailure(errorMessage);
        }
    ).catch(err => {
        console.error("Error starting scanner", err);
        showToast("Could not start camera. Please ensure you have given permission.", "error");
    });
}

/**
 * Stops the QR code scanner.
 */
export async function stopScanner() {
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
            html5QrCode.clear();
            html5QrCode = null;
        } catch (err) {
            console.error("Failed to stop scanner", err);
        }
    }
}
