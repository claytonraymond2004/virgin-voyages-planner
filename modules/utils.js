import { SHIFT_START_ADD, SHIFT_END_ADD } from './constants.js';

// --- Utility Functions ---

export function parseTimeRange(timeStr) {
    if (!timeStr) return null;
    let parts = timeStr.toLowerCase().split('-');
    if (parts.length === 0) return null;

    let startStr = parts[0].trim();
    let endStr = parts.length > 1 ? parts[1].trim() : null;

    let startMins = parseTime(startStr);
    let endMins = endStr ? parseTime(endStr) : startMins + 60; // Default 1 hour

    // Heuristic: If start has no AM/PM, try both AM and PM and pick the one 
    // that results in the shorter duration (assuming events are usually < 12h).
    const startHasSuffix = startStr.includes('am') || startStr.includes('pm');

    if (!startHasSuffix && endStr) {
        // Calculate duration if we assume start is as-is (AM usually, or 12=Noon)
        let s1 = startMins;
        let e1 = endMins;
        if (e1 < s1) e1 += 24 * 60;
        let dur1 = e1 - s1;

        // Calculate duration if we shift start by 12h (PM, or 12=Midnight)
        let s2 = startMins + 720;
        let e2 = endMins;
        if (e2 < s2) e2 += 24 * 60;
        let dur2 = e2 - s2;

        // If shifting makes it shorter (and reasonable), use the shift
        if (dur2 < dur1) {
            startMins += 720;
        }
    }

    // Handle overnight (e.g. 11pm - 2am)
    if (endMins < startMins) {
        endMins += 24 * 60;
    }

    return { start: startMins, end: endMins };
}

export function parseTime(t) {
    // "Late" -> 3am next day (27 * 60)
    if (t.includes('late')) return 27 * 60;

    let isPm = t.includes('pm');
    let isAm = t.includes('am');
    let clean = t.replace(/[^0-9:]/g, '');
    let [h, m] = clean.split(':').map(Number);
    if (isNaN(m)) m = 0;

    // 12am -> 24:00 (end of day) for sorting purposes if needed, 
    // but usually 12am is start of day. 
    // However, in this context, "Late Night" events often go past midnight.
    // Let's stick to standard 24h:
    // 12am -> 0, 12pm -> 12
    // BUT, if we want 12am to be "late night" (end of previous day's grid), we might handle it differently.
    // The original logic seemed to imply 12am is 0.
    // Let's check if there was specific logic for 12am in the original file.
    // Re-reading original script logic:
    // "Midnight Handling: 12:00 AM is interpreted as 24:00 (end of the current day)"

    if (h === 12) {
        if (isAm) h = 24; // Treat 12am as end of day (24:00)
        else if (isPm) h = 12;
    } else {
        if (isPm) h += 12;
    }

    return h * 60 + m;
}

export function formatTime(mins) {
    let h = Math.floor(mins / 60) % 24;
    let m = Math.floor(mins % 60);
    let displayH = (h === 12 || h === 0 ? 12 : h % 12);
    let ampm = (h >= 12 && h < 24 ? 'pm' : 'am');
    return `${displayH}:${m.toString().padStart(2, '0')}${ampm}`;
}

export function generateUid(event) {
    return `${event.date}_${event.name}_${event.startMins}`;
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function getContrastYIQ(r, g, b) {
    var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? 'black' : 'white';
}

export function getDominantColor(img) {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 50;
        canvas.height = 50;
        ctx.drawImage(img, 0, 0, 50, 50);
        const data = ctx.getImageData(0, 0, 50, 50).data;
        const colorCounts = {};
        let maxCount = 0;
        let dominant = null;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            if (a < 128) continue;

            // Skip grayscale
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            if ((max - min) < 30) continue;

            const qR = Math.round(r / 20) * 20;
            const qG = Math.round(g / 20) * 20;
            const qB = Math.round(b / 20) * 20;
            const key = qR + ',' + qG + ',' + qB;
            colorCounts[key] = (colorCounts[key] || 0) + 1;
            if (colorCounts[key] > maxCount) {
                maxCount = colorCounts[key];
                dominant = { r: qR, g: qG, b: qB };
            }
        }
        return dominant;
    } catch (e) { return null; }
}

export function getRandomColor() {
    const r = Math.floor(Math.random() * 40 + 210);
    const g = Math.floor(Math.random() * 40 + 210);
    const b = Math.floor(Math.random() * 40 + 210);
    return `rgb(${r},${g},${b})`;
}

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function formatTimeRange(startMins, endMins) {
    const fmt = (mins) => {
        let h = Math.floor(mins / 60) % 24;
        const m = mins % 60;
        const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return m > 0 ? `${h}:${m.toString().padStart(2, '0')}${ampm}` : `${h}${ampm}`;
    };
    return `${fmt(startMins)} - ${fmt(endMins)}`;
}

/**
 * Recursively scans files from DataTransferItems, extracting .json and .vvoyage files.
 * Handles nested directories.
 * @param {DataTransferItemList} items 
 * @returns {Promise<File[]>}
 */
export async function scanFiles(items) {
    const files = [];

    // Helper to traverse directories
    async function traverse(entry) {
        if (entry.isFile) {
            const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
            if (file.name.toLowerCase().endsWith('.json') || file.name.endsWith('.vvoyage')) {
                files.push(file);
            }
        } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            // readEntries might not return all entries in one call
            const entries = await new Promise((resolve, reject) => {
                const results = [];
                function read() {
                    dirReader.readEntries((batch) => {
                        if (!batch.length) {
                            resolve(results);
                        } else {
                            results.push(...batch);
                            read();
                        }
                    }, reject);
                }
                read();
            });
            for (const subEntry of entries) {
                await traverse(subEntry);
            }
        }
    }

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof item.webkitGetAsEntry === 'function') {
            const entry = item.webkitGetAsEntry();
            if (entry) await traverse(entry);
        } else if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file && (file.name.toLowerCase().endsWith('.json') || file.name.endsWith('.vvoyage'))) {
                files.push(file);
            }
        }
    }

    return files;
}

export function getAllFileEntries(dataTransferItems) {
    return scanFiles(dataTransferItems);
}
