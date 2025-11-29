
// --- Constants ---
const STORAGE_KEY_DATA = 'virginVoyagesData';
const STORAGE_KEY_ATTENDANCE = 'virginVoyagesAttendance';
const STORAGE_KEY_HIDDEN_NAMES = 'virginVoyagesHiddenNames';
const STORAGE_KEY_HIDDEN_UIDS = 'virginVoyagesHiddenUids';
const STORAGE_KEY_SHOWN_UIDS = 'virginVoyagesShownUids';
const STORAGE_KEY_CUSTOM = 'virginVoyagesCustomEvents';
const STORAGE_KEY_PORT_NOTES = 'virginVoyagesPortNotes';
const STORAGE_KEY_EVENT_NOTES = 'virginVoyagesEventNotes';
const STORAGE_KEY_BLACKLIST = 'virginVoyagesBlacklist';
const STORAGE_KEY_OPTIONAL_EVENTS = 'virginVoyagesOptionalEvents';
const STORAGE_KEY_THEME = 'virginVoyagesTheme';
const START_HOUR = 6;
const END_HOUR = 29;

// Shifts
const SHIFT_START_ADD = 0;
const SHIFT_END_ADD = 0;

// --- State ---
let appData = [];
let customEvents = []; // Array of custom event objects
let attendingIds = new Set();
let hiddenNames = new Set();
let hiddenUids = new Set();
let shownUids = new Set();
let portNotes = {}; // Object: { "YYYY-MM-DD": "Port Name" }
let eventNotes = {}; // Object: { "uid": "Note Text" }
let blacklist = new Set();
let optionalEvents = new Set(); // Set of event names marked as optional
let eventColors = {}; // Persist colors across renders
let imageColorCache = {}; // Cache dominant colors by image URL to avoid recalculation
let editMode = 'instance'; // 'instance' or 'series'
let eventNameMap = new Map();
let eventLookup = new Map();
let availableDates = []; // For dropdown
let showHiddenTemp = false;
let initialFormState = null; // Snapshot for dirty check

// Temp state
let currentCtxEvent = null;
let dragStartY = 0;
let dragColumnDate = null;
let dragPreviewEl = null;
let editingEvent = null; // null if creating, object if editing
let activePanelTab = 'required'; // 'required' or 'optional'
let activeHiddenTab = 'series'; // 'series' or 'instances'
let searchMode = 'title'; // 'title' or 'all'

// Hover helper
let currentTooltipTarget = null;
let activeTooltipUid = null;
let tooltipShowTime = 0;
let lastTouchTime = 0;
let justCreatedButton = false;

// --- Custom Confirm System ---
let confirmCallback = null;

function showConfirm(message, onConfirm, title = "Confirm Action") {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirmation-modal').style.display = 'flex';
    confirmCallback = onConfirm;
}

document.getElementById('btn-confirm-cancel').onclick = () => {
    document.getElementById('confirmation-modal').style.display = 'none';
    confirmCallback = null;
};

document.getElementById('btn-confirm-ok').onclick = () => {
    document.getElementById('confirmation-modal').style.display = 'none';
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Dark Mode Init
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark');
        document.getElementById('icon-moon').style.display = 'none';
        document.getElementById('icon-sun').style.display = 'block';
    }

    // Drag & Drop File
    // Drag & Drop File
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });

    // Load
    loadFromStorage();

    // Scroll Sync
    const viewport = document.getElementById('schedule-viewport');
    const timeCol = document.getElementById('time-column');
    viewport.addEventListener('scroll', () => { timeCol.scrollTop = viewport.scrollTop; });

    // Global Click
    document.addEventListener('click', (e) => {
        const ctxMenu = document.getElementById('context-menu');
        if (!ctxMenu.contains(e.target)) {
            ctxMenu.style.display = 'none';
        }
        // Close dropdown if clicking outside
        const dropdown = document.getElementById('dropdown-menu');
        const menuBtn = document.getElementById('menu-btn');
        if (!menuBtn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
        // Close Search Mode Menu if clicking outside
        const searchModeMenu = document.getElementById('search-mode-menu');
        const searchModeBtn = document.getElementById('search-mode-btn');
        if (searchModeMenu && searchModeBtn && !searchModeBtn.contains(e.target) && !searchModeMenu.contains(e.target)) {
            searchModeMenu.classList.add('hidden');
        }
        // Hide Search Results if clicking outside
        const searchResults = document.getElementById('search-results');
        const searchInput = document.getElementById('search-input');
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
        // Remove add event button if clicking elsewhere
        if (!e.target.closest('.add-event-btn') && !justCreatedButton) {
            document.querySelectorAll('.add-event-btn').forEach(el => el.remove());
        }
    });

    // Menu Button
    document.getElementById('menu-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById('dropdown-menu');
        dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
    });

    // Search Input Listeners
    document.getElementById('search-input').addEventListener('input', updateVisualStates);

    // Re-show results on focus
    document.getElementById('search-input').addEventListener('focus', () => {
        if (document.getElementById('search-input').value.trim()) {
            document.getElementById('search-results').style.display = 'block';
        }
    });

    // Esc key clear search
    document.getElementById('search-input').addEventListener('keydown', (e) => {
        if (e.key === 'Escape') clearSearch();
    });

    // Modal Close Logic (Escape)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Check priority: Confirm -> Custom Edit -> Generic
            const confirmModal = document.getElementById('confirmation-modal');
            const customModal = document.getElementById('custom-event-modal');

            if (getComputedStyle(confirmModal).display !== 'none') {
                // Close confirmation only
                confirmModal.style.display = 'none';
                confirmCallback = null;
                return;
            }

            if (getComputedStyle(customModal).display !== 'none') {
                tryCloseCustomModal();
                return;
            }

            // Default close top-most
            const openModals = Array.from(document.querySelectorAll('.modal-overlay'))
                .filter(el => getComputedStyle(el).display !== 'none');
            if (openModals.length > 0) closeAllModals(); // Fallback

            // Close context menu
            document.getElementById('context-menu').style.display = 'none';
        }
    });

    // Click outside modal content
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (overlay.id === 'confirmation-modal') {
                    overlay.style.display = 'none';
                    confirmCallback = null;
                }
                else if (overlay.id === 'custom-event-modal') tryCloseCustomModal();
                else closeAllModals();
            }
        });
    });

    // Tooltip Interaction
    const tooltip = document.getElementById('tooltip');

    tooltip.addEventListener('mouseleave', () => {
        hideTooltip();
    });

    // Touch detection
    document.addEventListener('touchstart', () => { lastTouchTime = Date.now(); }, { passive: true });
});

// --- Dark Mode Toggle ---
function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem(STORAGE_KEY_THEME, isDark ? 'dark' : 'light');

    document.getElementById('icon-moon').style.display = isDark ? 'none' : 'block';
    document.getElementById('icon-sun').style.display = isDark ? 'block' : 'none';
}

// --- Data Handling ---

function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const readers = files.map(file => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    resolve(json);
                } catch (err) {
                    reject(file.name);
                }
            };
            reader.onerror = () => reject(file.name);
            reader.readAsText(file);
        });
    });

    Promise.all(readers)
        .then(results => {
            processLoadedData(results);
        })
        .catch(errFileName => {
            alert("Error processing file: " + errFileName);
        });
}

function processLoadedData(jsonObjects) {
    // Case 1: Single file that is a Backup or CleanAgenda
    if (jsonObjects.length === 1) {
        const json = jsonObjects[0];
        if (json.appData) {
            // Backup File
            restoreBackup(json);
            return;
        } else if (Array.isArray(json)) {
            // CleanAgenda.json
            saveData(json);
            return;
        }
    }

    // Case 2: One or more Raw API files
    const combinedEvents = [];

    jsonObjects.forEach(json => {
        if (json.events && Array.isArray(json.events)) {
            const clean = parseRawData(json);
            combinedEvents.push(...clean);
        }
    });

    if (combinedEvents.length > 0) {
        saveData(combinedEvents);
    } else {
        alert("No valid agenda data found in the uploaded file(s).");
    }
}

function parseRawData(agenda) {
    const cleanAgenda = [];
    agenda.events.forEach((event) => {
        if (event.items && Array.isArray(event.items)) {
            event.items.forEach((item) => {
                const cleanItem = {
                    date: event.date,
                    imageUrl: item.imageUrl,
                    location: item.location,
                    name: item.name,
                    longDescription: item.longDescription,
                    shortDescription: item.shortDescription,
                    timePeriod: item.timePeriod,
                    needToKnows: item.needToKnows,
                };
                cleanAgenda.push(cleanItem);
            });
        }
    });
    return cleanAgenda;
}

function restoreBackup(json) {
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(json.appData));
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(json.customEvents || []));
    localStorage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(json.attendingIds || []));
    localStorage.setItem(STORAGE_KEY_HIDDEN_NAMES, JSON.stringify(json.hiddenNames || []));
    localStorage.setItem(STORAGE_KEY_HIDDEN_UIDS, JSON.stringify(json.hiddenUids || []));
    localStorage.setItem(STORAGE_KEY_PORT_NOTES, JSON.stringify(json.portNotes || {}));
    localStorage.setItem(STORAGE_KEY_EVENT_NOTES, JSON.stringify(json.eventNotes || {}));
    localStorage.setItem(STORAGE_KEY_BLACKLIST, JSON.stringify(json.blacklist || []));
    localStorage.setItem(STORAGE_KEY_OPTIONAL_EVENTS, JSON.stringify(json.optionalEvents || []));
    loadFromStorage();
}

function saveData(json) {
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(json));
    localStorage.removeItem(STORAGE_KEY_ATTENDANCE);
    localStorage.removeItem(STORAGE_KEY_HIDDEN_NAMES);
    localStorage.removeItem(STORAGE_KEY_HIDDEN_UIDS);
    localStorage.removeItem(STORAGE_KEY_PORT_NOTES);
    localStorage.removeItem(STORAGE_KEY_EVENT_NOTES);
    localStorage.removeItem(STORAGE_KEY_BLACKLIST);
    localStorage.removeItem(STORAGE_KEY_OPTIONAL_EVENTS);
    hiddenNames.clear();
    hiddenUids.clear();
    portNotes = {};
    eventNotes = {};
    blacklist.clear();
    optionalEvents.clear();
    eventColors = {}; // Reset colors on new data load
    attendingIds.clear();
    loadFromStorage();
}

function exportData() {
    const exportObj = {
        appData: appData,
        customEvents: customEvents,
        attendingIds: [...attendingIds],
        hiddenNames: [...hiddenNames],
        hiddenUids: [...hiddenUids],
        portNotes: portNotes,
        eventNotes: eventNotes,
        blacklist: [...blacklist],
        optionalEvents: [...optionalEvents],
        version: 1
    };
    const blob = new Blob([JSON.stringify(exportObj)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "voyage-planner-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById('dropdown-menu').style.display = 'none'; // Close menu
}

function confirmResetData() {
    showConfirm("Reset everything? This deletes schedule, custom events, and preferences.", () => {
        localStorage.clear();
        location.reload();
    }, "Reset Data");
    document.getElementById('dropdown-menu').style.display = 'none'; // Close menu
}

function loadFromStorage() {
    const storedData = localStorage.getItem(STORAGE_KEY_DATA);
    const storedCustom = localStorage.getItem(STORAGE_KEY_CUSTOM);
    const storedAttendance = localStorage.getItem(STORAGE_KEY_ATTENDANCE);
    const storedNames = localStorage.getItem(STORAGE_KEY_HIDDEN_NAMES);
    const storedUids = localStorage.getItem(STORAGE_KEY_HIDDEN_UIDS);
    const storedShown = localStorage.getItem(STORAGE_KEY_SHOWN_UIDS);
    const storedNotes = localStorage.getItem(STORAGE_KEY_PORT_NOTES);
    const storedEventNotes = localStorage.getItem(STORAGE_KEY_EVENT_NOTES);
    const storedBlacklist = localStorage.getItem(STORAGE_KEY_BLACKLIST);
    const storedOptional = localStorage.getItem(STORAGE_KEY_OPTIONAL_EVENTS);

    if (storedData) {
        document.getElementById('upload-screen').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        document.getElementById('main-header').classList.remove('hidden');
        document.getElementById('main-header').classList.add('flex');

        try { appData = JSON.parse(storedData); } catch (e) { return; }
        if (storedCustom) try { customEvents = JSON.parse(storedCustom); } catch (e) { customEvents = []; }
        if (storedAttendance) try { attendingIds = new Set(JSON.parse(storedAttendance)); } catch (e) { }
        if (storedNames) try { hiddenNames = new Set(JSON.parse(storedNames)); } catch (e) { }
        if (storedUids) try { hiddenUids = new Set(JSON.parse(storedUids)); } catch (e) { }
        if (storedShown) try { shownUids = new Set(JSON.parse(storedShown)); } catch (e) { }
        if (storedNotes) try { portNotes = JSON.parse(storedNotes); } catch (e) { portNotes = {}; }
        if (storedEventNotes) try { eventNotes = JSON.parse(storedEventNotes); } catch (e) { eventNotes = {}; }
        if (storedBlacklist) try { blacklist = new Set(JSON.parse(storedBlacklist)); } catch (e) { blacklist = new Set(); }
        if (storedOptional) try { optionalEvents = new Set(JSON.parse(storedOptional)); } catch (e) { optionalEvents = new Set(); }

        renderApp();
    }
}

// --- Search Logic ---

function clearSearch() {
    document.getElementById('search-input').value = '';
    updateVisualStates();
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('clear-search').classList.add('hidden');
}

// --- Custom Events ---

function getCustomEventFormData() {
    return {
        title: document.getElementById('custom-title').value,
        location: document.getElementById('custom-location').value,
        date: document.getElementById('custom-date').value,
        start: document.getElementById('custom-start').value,
        end: document.getElementById('custom-end').value,
        repeat: document.getElementById('custom-repeat').checked,
        desc: document.getElementById('custom-desc').value
    };
}

function tryCloseCustomModal() {
    const currentState = getCustomEventFormData();
    if (initialFormState && JSON.stringify(currentState) !== JSON.stringify(initialFormState)) {
        showConfirm("Discard unsaved changes?", () => {
            closeAllModals();
            initialFormState = null;
        }, "Unsaved Changes");
    } else {
        closeAllModals();
        initialFormState = null;
    }
}

function initiateEdit(ev) {
    editingEvent = ev;

    // Check if it's a repeating event (has seriesId AND multiple instances exist)
    let isSeries = false;
    if (ev.seriesId) {
        const siblings = customEvents.filter(c => c.seriesId === ev.seriesId);
        if (siblings.length > 1) {
            isSeries = true;
        }
    }

    if (isSeries) {
        document.getElementById('edit-choice-modal').style.display = 'flex';
    } else {
        // Single event, just edit it
        editMode = 'instance'; // Default
        openEditForm(ev);
    }
}

function confirmEditInstance() {
    editMode = 'instance';
    closeAllModals();
    openEditForm(editingEvent);
}

function confirmEditSeries() {
    editMode = 'series';
    closeAllModals();
    openEditForm(editingEvent);
}

function openEditForm(ev) {
    document.getElementById('custom-modal-title').textContent = "Edit Custom Event";
    document.getElementById('custom-title').value = ev.name;
    document.getElementById('custom-location').value = ev.location || '';
    document.getElementById('custom-desc').value = ev.longDescription || '';

    const dateSelect = document.getElementById('custom-date');
    dateSelect.innerHTML = '';
    availableDates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        if (d === ev.date) opt.selected = true;
        dateSelect.appendChild(opt);
    });

    const formatInput = (mins) => {
        let h = Math.floor(mins / 60) % 24;
        let m = Math.floor(mins % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`; // Removed trailing space
    };
    document.getElementById('custom-start').value = formatInput(ev.startMins);
    document.getElementById('custom-end').value = formatInput(ev.endMins);

    document.getElementById('custom-repeat-group').style.display = 'none';
    document.getElementById('custom-repeat').checked = false;

    openCustomModal();
}

function openCustomModal() {
    document.getElementById('custom-event-modal').style.display = 'flex';
    setTimeout(() => {
        initialFormState = getCustomEventFormData();
    }, 10);
}

function saveCustomEvent() {
    const title = document.getElementById('custom-title').value;
    const loc = document.getElementById('custom-location').value;
    const date = document.getElementById('custom-date').value;
    const startStr = document.getElementById('custom-start').value;
    const endStr = document.getElementById('custom-end').value;
    const desc = document.getElementById('custom-desc').value;

    if (!title || !date || !startStr || !endStr) {
        alert("Please fill in the title, date, and times.");
        return;
    }

    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    let sMins = sh * 60 + sm;
    let eMins = eh * 60 + em;
    if (eMins < sMins) eMins += 24 * 60;

    if (editingEvent) {
        if (editMode === 'series' && editingEvent.seriesId) {
            // Update all events in the series
            customEvents.forEach(c => {
                if (c.seriesId === editingEvent.seriesId) {
                    c.name = title;
                    c.location = loc;
                    c.startMins = sMins;
                    c.endMins = eMins;
                    c.longDescription = desc;
                    // Do NOT update date for series edit, as they are on different days
                }
            });
        } else {
            // Update single instance
            const idx = customEvents.findIndex(c => c.uid === editingEvent.uid);
            if (idx !== -1) {
                customEvents[idx] = {
                    ...customEvents[idx],
                    name: title,
                    location: loc,
                    date: date,
                    startMins: sMins,
                    endMins: eMins,
                    longDescription: desc
                };
            }
        }
    } else {
        const repeat = document.getElementById('custom-repeat').checked;
        const seriesId = Date.now();
        const newEvents = [];

        if (repeat) {
            availableDates.forEach(d => {
                newEvents.push({
                    name: title, location: loc, date: d, startMins: sMins, endMins: eMins, longDescription: desc,
                    isCustom: true, uid: `custom_${seriesId}_${d}`, seriesId: seriesId
                });
            });
        } else {
            newEvents.push({
                name: title, location: loc, date: date, startMins: sMins, endMins: eMins, longDescription: desc,
                isCustom: true, uid: `custom_${seriesId}`, seriesId: seriesId
            });
        }
        customEvents.push(...newEvents);
    }

    initialFormState = null;
    finalizeSave();
}



function finalizeSave() {
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(customEvents));
    closeAllModals();
    renderApp();
}

function deleteCustomEvent(uid) {
    const ev = eventLookup.get(uid);
    if (!ev) return;

    const siblings = customEvents.filter(c => c.seriesId && c.seriesId === ev.seriesId);

    if (siblings.length > 1) {
        currentCtxEvent = ev;
        document.getElementById('delete-choice-modal').style.display = 'flex';
    } else {
        showConfirm("Delete this custom event?", () => {
            customEvents = customEvents.filter(c => c.uid !== uid);
            finalizeSave();
        }, "Delete Event");
    }
}

function confirmDeleteInstance() {
    if (currentCtxEvent) {
        customEvents = customEvents.filter(c => c.uid !== currentCtxEvent.uid);
        finalizeSave();
    }
}

function confirmDeleteSeries() {
    if (currentCtxEvent) {
        customEvents = customEvents.filter(c => c.seriesId !== currentCtxEvent.seriesId);
        finalizeSave();
    }
}

// --- Drag Interaction ---

function initDrag(dayCol, date) {
    dayCol.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left click
        if (e.target.closest('.event-card')) return; // Don't start drag on existing event
        if (e.target.closest('.day-header')) return; // Don't start drag on day header
        if (e.target.closest('.add-event-btn')) return; // Don't start drag on add button

        e.preventDefault();
        dragColumnDate = date;
        const rect = dayCol.getBoundingClientRect();
        let clickY = e.clientY - rect.top;
        dragStartY = clickY;

        // Remove any existing add buttons
        document.querySelectorAll('.add-event-btn').forEach(el => el.remove());

        dragPreviewEl = document.createElement('div');
        dragPreviewEl.className = 'drag-preview';
        dragPreviewEl.style.top = `${dragStartY}px`;
        dragPreviewEl.style.height = '0px'; // Start at 0 height
        dayCol.appendChild(dragPreviewEl);

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    });
}

function onDragMove(e) {
    if (!dragPreviewEl) return;
    const col = dragPreviewEl.parentElement;
    const rect = col.getBoundingClientRect();
    let currentY = e.clientY - rect.top;

    let snapY = Math.round(currentY / 15) * 15;
    let snapStart = Math.round(dragStartY / 15) * 15;

    const top = Math.min(snapStart, snapY);
    const height = Math.abs(snapY - snapStart);

    dragPreviewEl.style.top = `${top}px`;
    dragPreviewEl.style.height = `${height}px`;
}

function onDragEnd(e) {
    if (!dragPreviewEl) return;

    const topPx = parseInt(dragPreviewEl.style.top);
    let heightPx = parseInt(dragPreviewEl.style.height);
    const dayCol = dragPreviewEl.parentElement;

    dragPreviewEl.remove();
    dragPreviewEl = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);

    let startMinsTotal, endMinsTotal;

    // Check if it was a click (minimal drag)
    if (heightPx < 5) {
        // It was a click -> Create 1 hour block
        const snapStart = Math.round(dragStartY / 15) * 15;
        startMinsTotal = (START_HOUR * 60) + snapStart;
        endMinsTotal = startMinsTotal + 60;
        heightPx = 60; // Visual height for button
    } else {
        // It was a drag
        startMinsTotal = (START_HOUR * 60) + topPx;
        endMinsTotal = startMinsTotal + heightPx;

        startMinsTotal = Math.round(startMinsTotal / 15) * 15;
        endMinsTotal = Math.round(endMinsTotal / 15) * 15;
        if (endMinsTotal <= startMinsTotal) endMinsTotal = startMinsTotal + 15;
    }

    createAddEventButton(dayCol, dragColumnDate, startMinsTotal, endMinsTotal);
}

function createAddEventButton(dayCol, date, startMins, endMins) {
    const startOffset = startMins - (START_HOUR * 60);
    const duration = endMins - startMins;
    const top = startOffset; // 1px = 1min
    const height = duration;

    const btn = document.createElement('div');
    btn.className = 'add-event-btn';
    btn.style.top = `${top}px`;
    btn.style.height = `${height}px`;
    btn.innerHTML = `<span class="text-2xl font-bold">+</span>`;

    btn.onclick = (e) => {
        e.stopPropagation();
        populateCustomModal(date, startMins, endMins);
        btn.remove();
    };

    dayCol.appendChild(btn);

    // Prevent immediate removal by global click
    justCreatedButton = true;
    setTimeout(() => { justCreatedButton = false; }, 100);
}

function populateCustomModal(date, sMins, eMins) {
    editingEvent = null;
    document.getElementById('custom-modal-title').textContent = "New Custom Event";

    const dateSelect = document.getElementById('custom-date');
    dateSelect.innerHTML = '';
    availableDates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        if (d === date) opt.selected = true;
        dateSelect.appendChild(opt);
    });

    const formatInput = (mins) => {
        let h = Math.floor(mins / 60) % 24;
        let m = Math.floor(mins % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    document.getElementById('custom-start').value = formatInput(sMins);
    document.getElementById('custom-end').value = formatInput(eMins);

    document.getElementById('custom-title').value = '';
    document.getElementById('custom-location').value = '';
    document.getElementById('custom-desc').value = '';

    document.getElementById('custom-repeat-group').style.display = 'flex';
    document.getElementById('custom-repeat').checked = false;

    openCustomModal();
    document.getElementById('custom-title').focus();
}

// --- Export Printable Logic ---
// Logic moved to print_logic.js
// --- Rendering ---

function renderApp() {
    const timeCol = document.getElementById('time-column');
    const grid = document.getElementById('schedule-grid');

    timeCol.innerHTML = '';
    grid.innerHTML = '';
    eventNameMap.clear();
    eventLookup.clear();

    const totalHidden = hiddenNames.size + hiddenUids.size;
    document.getElementById('hidden-count').textContent = totalHidden;

    const eventsByDate = {};
    const totalEventCounts = {};
    availableDates = [];

    const allEventsRaw = Array.isArray(appData) ? [...appData] : [];

    // Calculate total counts from source data to determine SINGLE status correctly
    // Count official events
    allEventsRaw.forEach(ev => {
        if (blacklist.has(ev.name)) return;
        const timeData = parseTimeRange(ev.timePeriod);
        if (!timeData) return;
        totalEventCounts[ev.name] = (totalEventCounts[ev.name] || 0) + 1;
    });

    // Count custom events
    customEvents.forEach(ev => {
        if (blacklist.has(ev.name)) return;
        totalEventCounts[ev.name] = (totalEventCounts[ev.name] || 0) + 1;
    });

    const processedOfficial = [];
    allEventsRaw.forEach(ev => {
        if (blacklist.has(ev.name)) return;
        const timeData = parseTimeRange(ev.timePeriod);
        if (!timeData) return;
        let s = timeData.start + SHIFT_START_ADD;
        let e = timeData.end + SHIFT_END_ADD;
        const uid = `${ev.date}_${ev.name}_${s}`;

        let isHidden = false;
        const isExplicitlyShown = shownUids.has(uid);
        if ((hiddenNames.has(ev.name) || hiddenUids.has(uid)) && !attendingIds.has(uid) && !isExplicitlyShown) {
            if (!showHiddenTemp) return;
            isHidden = true;
        }

        processedOfficial.push({
            ...ev, startMins: s, endMins: e, uid: uid, isCustom: false, isHiddenTemp: isHidden
        });
    });

    const processedCustom = [];
    customEvents.forEach(ev => {
        if (blacklist.has(ev.name)) return;
        let isHidden = false;
        const isExplicitlyShown = shownUids.has(ev.uid);
        if ((hiddenNames.has(ev.name) || hiddenUids.has(ev.uid)) && !attendingIds.has(ev.uid) && !isExplicitlyShown) {
            if (!showHiddenTemp) return;
            isHidden = true;
        }
        processedCustom.push({ ...ev, isHiddenTemp: isHidden });
    });

    const finalEvents = [...processedOfficial, ...processedCustom];

    finalEvents.forEach(ev => {
        if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
    });
    availableDates = Object.keys(eventsByDate).sort();

    // Only generate colors if not already generated to persist them
    if (Object.keys(eventColors).length === 0) {
        Object.keys(totalEventCounts).forEach(name => {
            if (totalEventCounts[name] > 1) eventColors[name] = getRandomColor();
            else eventColors[name] = 'SINGLE';
        });
    } else {
        // Ensure new events get colors if data changed
        Object.keys(totalEventCounts).forEach(name => {
            if (!eventColors[name]) {
                if (totalEventCounts[name] > 1) eventColors[name] = getRandomColor();
                else eventColors[name] = 'SINGLE';
            }
        });
    }

    finalEvents.forEach(ev => {
        if (!eventNameMap.has(ev.name)) eventNameMap.set(ev.name, []);
        eventNameMap.get(ev.name).push(ev.uid);

        ev.color = eventColors[ev.name];
        eventsByDate[ev.date].push(ev);
        eventLookup.set(ev.uid, ev);
    });

    // 4. Sort siblings strictly by time for nav
    eventNameMap.forEach((uids, name) => {
        uids.sort((a, b) => {
            const eventA = eventLookup.get(a);
            const eventB = eventLookup.get(b);
            if (eventA.date !== eventB.date) return eventA.date.localeCompare(eventB.date);
            return eventA.startMins - eventB.startMins;
        });
    });

    // 2. Time Column
    for (let m = START_HOUR * 60; m < END_HOUR * 60; m += 60) {
        const h = Math.floor(m / 60) % 24;
        const div = document.createElement('div');
        div.className = 'time-label';
        div.textContent = `${h === 12 ? 12 : h % 12}:00 ${h >= 12 && h < 24 ? 'PM' : 'AM'}`;
        const topPx = (m - START_HOUR * 60);
        div.style.top = topPx + 'px';
        timeCol.appendChild(div);
    }
    // Strut to match day-column height exactly for sync scrolling
    const totalMins = (END_HOUR - START_HOUR) * 60;
    const strut = document.createElement('div');
    strut.style.height = `${(totalMins / 60) * 60 + 50}px`;
    strut.style.width = '1px';
    strut.style.position = 'absolute';
    strut.style.top = '0';
    timeCol.appendChild(strut);

    // 3. Grid Columns
    availableDates.forEach(date => {
        const dayCol = document.createElement('div');
        dayCol.className = 'day-column';
        initDrag(dayCol, date);

        dayCol.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        const dateObj = new Date(date + 'T00:00:00');
        const header = document.createElement('div');
        header.className = 'day-header';
        const note = portNotes[date] || '';
        header.innerHTML = `
            <div class="text-center leading-tight w-full h-full flex flex-col justify-center relative">
                <div class="text-xs text-gray-500 uppercase tracking-wide">${dateObj.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div class="text-lg">${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                <div class="absolute bottom-1 right-1">
                    ${note ?
                `<span class="text-xs font-semibold text-blue-600 cursor-pointer hover:underline" onclick="editPortNote('${date}', event)">${note}</span>` :
                `<button class="text-xs text-gray-400 hover:text-gray-600 border border-gray-300 rounded px-1" onclick="editPortNote('${date}', event)">+</button>`
            }
                </div>
            </div>
    `;
        dayCol.appendChild(header);

        // Packing
        const events = eventsByDate[date].sort((a, b) => a.startMins - b.startMins || (b.endMins - b.startMins) - (a.endMins - a.startMins));

        // Split into normal and optional
        // 1. Identify "Anchor" events (Required OR Attending) which define the "busy" times
        const anchorEvents = events.filter(ev => !optionalEvents.has(ev.name) || attendingIds.has(ev.uid));

        const normalEvents = [...anchorEvents];
        const optionalEventsList = [];

        // 2. Process "Floating" events (Optional AND Not Attending)
        events.filter(ev => optionalEvents.has(ev.name) && !attendingIds.has(ev.uid)).forEach(ev => {
            // Check for overlap with ANY anchor event
            const hasOverlap = anchorEvents.some(anchor =>
                ev.startMins < anchor.endMins && anchor.startMins < ev.endMins
            );

            if (hasOverlap) {
                // Overlaps with a required/attending event -> Side column
                optionalEventsList.push(ev);
            } else {
                // Free time -> Main column
                normalEvents.push(ev);
            }
        });

        // Re-sort normalEvents for proper packing
        normalEvents.sort((a, b) => a.startMins - b.startMins || (b.endMins - b.startMins) - (a.endMins - a.startMins));

        // Pack Normal Events
        const normalLanes = [];
        normalEvents.forEach(ev => {
            let placed = false;
            for (let i = 0; i < normalLanes.length; i++) {
                const lane = normalLanes[i];
                const hasOverlap = lane.some(existing =>
                    ev.startMins < existing.endMins && existing.startMins < ev.endMins
                );
                if (!hasOverlap) {
                    lane.push(ev);
                    ev.laneIndex = i;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                normalLanes.push([ev]);
                ev.laneIndex = normalLanes.length - 1;
            }
        });

        // Pack Optional Events
        const optionalLanes = [];
        optionalEventsList.forEach(ev => {
            let placed = false;
            for (let i = 0; i < optionalLanes.length; i++) {
                const lane = optionalLanes[i];
                const hasOverlap = lane.some(existing =>
                    ev.startMins < existing.endMins && existing.startMins < ev.endMins
                );
                if (!hasOverlap) {
                    lane.push(ev);
                    ev.laneIndex = i;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                optionalLanes.push([ev]);
                ev.laneIndex = optionalLanes.length - 1;
            }
        });

        // Calculate Widths
        // If we have optional events, reserve 20% width on the right for them
        // If NO optional events, normal gets 100%
        // If NO normal events, optional gets 100% (or maybe just stick to right?)

        let normalWidthPercent = 100;
        let optionalWidthPercent = 0;
        let normalStart = 0;
        let optionalStart = 100;

        if (optionalEventsList.length > 0) {
            if (normalEvents.length > 0) {
                normalWidthPercent = 80;
                optionalWidthPercent = 20;
                optionalStart = 80;
            } else {
                normalWidthPercent = 0;
                optionalWidthPercent = 20; // Keep them narrow on the right even if alone? Or full width?
                // User said "align it to the right hand side... to separate it".
                // If only optional events exist, maybe they should still look "optional" (right aligned).
                // Let's give them 20% width on the right.
                optionalStart = 80;
            }
        }

        const normalLaneWidth = normalLanes.length > 0 ? normalWidthPercent / normalLanes.length : 0;
        const optionalLaneWidth = optionalLanes.length > 0 ? optionalWidthPercent / optionalLanes.length : 0;

        // Render Normal
        normalEvents.forEach(ev => {
            renderEventCard(ev, dayCol, normalLaneWidth, ev.laneIndex * normalLaneWidth);
        });

        // Render Optional
        optionalEventsList.forEach(ev => {
            // Stack from Right to Left: Lane 0 is rightmost
            const rtlIndex = optionalLanes.length - 1 - ev.laneIndex;
            renderEventCard(ev, dayCol, optionalLaneWidth, optionalStart + (rtlIndex * optionalLaneWidth), true);
        });

        const totalMins = (END_HOUR - START_HOUR) * 60;
        dayCol.style.height = `${(totalMins / 60) * 60 + 50}px`;

        grid.appendChild(dayCol);
    });

    updateVisualStates();
    updateAttendancePanel();
}

function showGenericChoice(title, message, primaryLabel, onPrimary, secondaryLabel, onSecondary) {
    document.getElementById('generic-choice-title').textContent = title;
    document.getElementById('generic-choice-message').textContent = message;

    const btnPrimary = document.getElementById('btn-generic-primary');
    btnPrimary.textContent = primaryLabel;
    btnPrimary.onclick = () => {
        document.getElementById('generic-choice-modal').style.display = 'none';
        if (onPrimary) onPrimary();
    };

    const btnSecondary = document.getElementById('btn-generic-secondary');
    btnSecondary.textContent = secondaryLabel;
    btnSecondary.onclick = () => {
        document.getElementById('generic-choice-modal').style.display = 'none';
        if (onSecondary) onSecondary();
    };

    const btnCancel = document.getElementById('btn-generic-cancel-x');
    btnCancel.onclick = () => {
        document.getElementById('generic-choice-modal').style.display = 'none';
    };

    document.getElementById('generic-choice-modal').style.display = 'flex';
}

function performToggleAttendance(uid) {
    // Prevent toggling attendance for hidden events
    const ev = appData.find(e => {
        const timeData = parseTimeRange(e.timePeriod);
        if (!timeData) return false;
        const s = timeData.start + SHIFT_START_ADD;
        return `${e.date}_${e.name}_${s}` === uid;
    }) || customEvents.find(e => e.uid === uid);

    if (ev) {
        // Check if it's hidden (either series or instance)
        const isSeriesHidden = hiddenNames.has(ev.name);
        const isInstanceHidden = hiddenUids.has(uid);
        const isExplicitlyShown = shownUids.has(uid);

        // Guard: Block interaction only if it's hidden AND not attending AND not explicitly shown
        if ((isSeriesHidden || isInstanceHidden) && !attendingIds.has(uid) && !isExplicitlyShown) return;

        if (attendingIds.has(uid)) {
            // Unattending
            attendingIds.delete(uid);

            // If it was part of a hidden series, keep it visible by adding to shownUids
            if (isSeriesHidden) {
                shownUids.add(uid);
                localStorage.setItem(STORAGE_KEY_SHOWN_UIDS, JSON.stringify([...shownUids]));
            }
        } else {
            // Attending
            attendingIds.add(uid);

            // Cleanup: If it was explicitly shown, we can remove it from shownUids
            if (shownUids.has(uid)) {
                shownUids.delete(uid);
                localStorage.setItem(STORAGE_KEY_SHOWN_UIDS, JSON.stringify([...shownUids]));
            }
        }
    } else {
        if (attendingIds.has(uid)) {
            attendingIds.delete(uid);
        } else {
            attendingIds.add(uid);
        }
    }

    localStorage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify([...attendingIds]));
    renderApp();
}

function toggleAttendance(uid) {
    // 1. Find the event object
    const ev = appData.find(e => {
        const timeData = parseTimeRange(e.timePeriod);
        if (!timeData) return false;
        const s = timeData.start + SHIFT_START_ADD;
        return `${e.date}_${e.name}_${s}` === uid;
    }) || customEvents.find(e => e.uid === uid);

    if (!ev) {
        performToggleAttendance(uid);
        return;
    }

    const isAttending = attendingIds.has(uid);

    // 2. Count siblings and attended siblings
    let siblingCount = 0;
    let attendedSiblingCount = 0;

    // Scan Official
    appData.forEach(e => {
        if (e.name === ev.name) {
            siblingCount++;
            const timeData = parseTimeRange(e.timePeriod);
            if (timeData) {
                const s = timeData.start + SHIFT_START_ADD;
                const u = `${e.date}_${e.name}_${s}`;
                if (attendingIds.has(u)) attendedSiblingCount++;
            }
        }
    });

    // Scan Custom
    customEvents.forEach(e => {
        if (e.name === ev.name) {
            siblingCount++;
            if (attendingIds.has(e.uid)) attendedSiblingCount++;
        }
    });

    if (siblingCount <= 1) {
        performToggleAttendance(uid);
        return;
    }

    if (!isAttending) {
        // Case: Adding (Attending)
        if (!hiddenNames.has(ev.name)) {
            showGenericChoice(
                "Hide Other Occurrences?",
                `You are attending "${ev.name}". Would you like to hide all other occurrences of this event?`,
                "Yes, Hide Others",
                () => {
                    performToggleAttendance(uid);
                    hideSeries(ev.name);
                },
                "No, Keep Visible",
                () => {
                    performToggleAttendance(uid);
                }
            );
            return;
        }
    } else {
        // Case: Removing (Un-attending)
        if (hiddenNames.has(ev.name)) {
            // Check if this is the last attended instance
            if (attendedSiblingCount === 1) {
                showGenericChoice(
                    "Unhide Series?",
                    `You are no longer attending "${ev.name}". Would you like to unhide the other occurrences?`,
                    "Yes, Unhide Series",
                    () => {
                        performToggleAttendance(uid);
                        unhideSeries(ev.name);
                    },
                    "No, Keep Hidden",
                    () => {
                        performToggleAttendance(uid);
                    }
                );
                return;
            }
        }
    }

    performToggleAttendance(uid);
}

// --- Search Logic ---
function toggleSearchMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('search-mode-menu');
    menu.classList.toggle('hidden');
}

function setSearchMode(mode) {
    searchMode = mode;
    document.getElementById('search-mode-menu').classList.add('hidden');

    // Update Checkmarks
    if (mode === 'title') {
        document.getElementById('check-title').classList.remove('hidden');
        document.getElementById('check-all').classList.add('hidden');
        document.getElementById('search-input').placeholder = "Filter Events (Title)...";
    } else {
        document.getElementById('check-title').classList.add('hidden');
        document.getElementById('check-all').classList.remove('hidden');
        document.getElementById('search-input').placeholder = "Filter Events (Title & Desc)...";
    }

    // Re-run search
    updateVisualStates();
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    updateVisualStates();
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('clear-search').classList.add('hidden');
}

function updateVisualStates() {
    const cards = document.querySelectorAll('.event-card');
    const query = document.getElementById('search-input').value.toLowerCase();
    const clearBtn = document.getElementById('clear-search');

    if (query.length > 0) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');

    // Search Logic - Populate Dropdown
    const searchResults = document.getElementById('search-results');
    if (query.length > 1) {
        const matches = [];

        // Search official
        appData.forEach(ev => {
            if (blacklist.has(ev.name)) return;

            let match = ev.name.toLowerCase().includes(query);
            if (!match && searchMode === 'all' && (ev.longDescription || "").toLowerCase().includes(query)) match = true;

            if (match) {
                // Need precise startMins for sorting. Reparse.
                const timeData = parseTimeRange(ev.timePeriod);
                if (timeData) {
                    let s = timeData.start + SHIFT_START_ADD;
                    let uid = `${ev.date}_${ev.name}_${s}`;

                    const isHidden = (hiddenNames.has(ev.name) || hiddenUids.has(uid));
                    const isAttending = attendingIds.has(uid);
                    const isExplicitlyShown = shownUids.has(uid);

                    if (isHidden && !isAttending && !isExplicitlyShown && !showHiddenTemp) {
                        return;
                    }

                    matches.push({ ...ev, startMins: s, uid: uid });
                }
            }
        });

        // Search custom
        customEvents.forEach(ev => {
            if (blacklist.has(ev.name)) return;
            let match = ev.name.toLowerCase().includes(query);
            if (!match && searchMode === 'all' && (ev.longDescription || "").toLowerCase().includes(query)) match = true;

            if (match) {
                const isHidden = (hiddenNames.has(ev.name) || hiddenUids.has(ev.uid));
                const isAttending = attendingIds.has(ev.uid);
                const isExplicitlyShown = shownUids.has(ev.uid);

                if (isHidden && !isAttending && !isExplicitlyShown && !showHiddenTemp) {
                    return;
                }
                matches.push(ev);
            }
        });

        // Sort and Render
        matches.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.startMins - b.startMins;
        });

        if (matches.length > 0) {
            searchResults.innerHTML = matches.slice(0, 15).map(ev => {
                const dateObj = new Date(ev.date + 'T00:00:00');
                const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const h = Math.floor(ev.startMins / 60) % 24;
                const m = ev.startMins % 60;
                const timeStr = `${h === 12 || h === 0 ? 12 : h % 12}:${m.toString().padStart(2, '0')}${h >= 12 && h < 24 ? 'pm' : 'am'}`;
                return `<div class="search-result-item" onclick="jumpToEvent('${ev.uid.replace(/'/g, "\\'")}')">
                    <div class="font-bold text-sm">${ev.name}</div>
                    <div class="text-xs text-gray-500">${dateStr} @ ${timeStr}</div>
                </div>`;
            }).join('');
            searchResults.style.display = 'block';
        } else {
            searchResults.innerHTML = '<div class="p-3 text-sm text-gray-500 italic">No matches found</div>';
            searchResults.style.display = 'block';
        }

    } else {
        searchResults.style.display = 'none';
    }

    // 1. Calculate Occupied Time Ranges
    const occupiedRanges = {}; // { "YYYY-MM-DD": [{start, end}, ...] }
    attendingIds.forEach(id => {
        const ev = eventLookup.get(id);
        if (ev) {
            if (!occupiedRanges[ev.date]) occupiedRanges[ev.date] = [];
            occupiedRanges[ev.date].push({ start: ev.startMins, end: ev.endMins });
        }
    });

    const attendingNames = new Set();
    attendingIds.forEach(id => {
        const card = document.getElementById(`card-${id}`);
        if (card) attendingNames.add(card.dataset.name);
    });

    cards.forEach(card => {
        const uid = card.dataset.uid;
        const name = card.dataset.name;
        const isAttending = attendingIds.has(uid);
        const eventData = eventLookup.get(uid);

        card.classList.remove('is-attending', 'is-dimmed', 'is-search-dimmed', 'is-search-match', 'is-sibling-attended');

        // Base state
        if (isAttending) {
            card.classList.add('is-attending');
            // Clear inline styles that might override the class
            card.style.removeProperty('background-color');
            card.style.removeProperty('color');
            card.style.removeProperty('border-color');
            card.style.removeProperty('border-left-color');

            // Reset icon color
            const icon = card.querySelector('span');
            if (icon) icon.style.removeProperty('color');

        } else {
            // Check if a sibling is attending
            const hasSiblingAttending = attendingNames.has(name);

            // Restore original colors if they exist in dataset
            if (card.dataset.originalBg) {
                card.style.setProperty('background-color', card.dataset.originalBg, 'important');
                card.style.setProperty('color', card.dataset.originalText, 'important');
                card.style.setProperty('border-color', card.dataset.originalBorder, 'important');

                // Only restore border-left if no sibling is attending
                if (!hasSiblingAttending) {
                    card.style.setProperty('border-left-color', card.dataset.originalBorderLeft, 'important');
                } else {
                    // Set green border for sibling-attended
                    card.style.setProperty('border-left', '4px solid #86efac', 'important');
                }

                const icon = card.querySelector('span');
                if (icon && card.dataset.originalIconColor) {
                    icon.style.color = card.dataset.originalIconColor;
                }
            }

            if (hasSiblingAttending) {
                card.classList.add('is-sibling-attended'); // New style
                // Ensure green border is set
                if (!card.dataset.originalBg) {
                    card.style.setProperty('border-left', '4px solid #86efac', 'important');
                }
            }

            // Conflict Dimming
            if (eventData) {
                const dayRanges = occupiedRanges[eventData.date] || [];
                const hasConflict = dayRanges.some(range => {
                    // Overlap logic: (StartA < EndB) and (EndA > StartB)
                    return eventData.startMins < range.end && eventData.endMins > range.start;
                });

                if (hasConflict) {
                    card.classList.add('is-dimmed');
                }
            }
        }

        // Search Dimming
        if (query.length > 0) {
            let match = name.toLowerCase().includes(query);
            if (!match && searchMode === 'all' && eventData && (eventData.longDescription || "").toLowerCase().includes(query)) match = true;

            if (match) {
                card.classList.add('is-search-match');
                card.classList.remove('is-dimmed');
                card.classList.remove('is-sibling-attended');
            } else {
                card.classList.add('is-search-dimmed');
            }
        }
    });
}

// --- Search Logic ---
function clearSearch() {
    document.getElementById('search-input').value = '';
    updateVisualStates();
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('clear-search').classList.add('hidden');
}

// --- Context Menu ---
const ctxMenu = document.getElementById('context-menu');

function showContextMenu(e, ev) {
    ctxMenu.style.display = 'block';
    let x = e.clientX, y = e.clientY;
    if (x + 200 > window.innerWidth) x -= 200;
    if (y + 200 > window.innerHeight) y -= 200;
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;

    const siblings = eventNameMap.get(ev.name) || [];
    const myIndex = siblings.indexOf(ev.uid);
    let hasPrev = (myIndex > 0);
    let hasNext = (myIndex < siblings.length - 1);

    const btnPrev = document.getElementById('ctx-prev');
    const btnNext = document.getElementById('ctx-next');

    const btnHide = document.getElementById('ctx-hide');
    const btnDelete = document.getElementById('ctx-delete');
    const btnEdit = document.getElementById('ctx-edit');
    const btnNote = document.getElementById('ctx-note');
    const btnOptional = document.getElementById('ctx-optional');
    const btnVV = document.getElementById('ctx-vvinsider');
    const btnGoogle = document.getElementById('ctx-google');
    const btnBlacklist = document.getElementById('ctx-blacklist');

    const dividerNav = document.getElementById('ctx-nav-divider');
    const dividerNote = document.getElementById('ctx-note-divider');
    const dividerHide = document.getElementById('ctx-hide-divider');

    const dividerVV = document.getElementById('ctx-vv-divider');

    // Logic
    // Hide/Unhide Logic
    const unhideOption = document.getElementById('ctx-unhide');
    const unhideDivider = document.getElementById('ctx-unhide-divider');

    if (ev.isHiddenTemp) {
        btnHide.style.display = 'none';
        unhideOption.style.display = 'flex';
        unhideDivider.style.display = 'block';

        unhideOption.onclick = (e) => {
            e.stopPropagation();
            ctxMenu.style.display = 'none';
            openUnhideModal(ev);
        };
    } else {
        unhideOption.style.display = 'none';
        unhideDivider.style.display = 'none';

        // Disable hide if attending
        if (attendingIds.has(ev.uid)) {
            btnHide.style.display = 'flex';
            btnHide.style.opacity = '0.5';
            btnHide.style.pointerEvents = 'none';
        } else {
            btnHide.style.opacity = '1';
            btnHide.style.pointerEvents = 'auto';

            if (ev.isCustom) {
                // Only show hide for custom events if they are part of a series (have siblings)
                if (siblings.length > 1) {
                    btnHide.style.display = 'flex';
                    btnHide.onclick = (e) => {
                        e.stopPropagation();
                        ctxMenu.style.display = 'none';
                        initiateHide(ev);
                    };
                } else {
                    btnHide.style.display = 'none';
                }
            } else {
                btnHide.style.display = 'flex';
                btnHide.onclick = (e) => {
                    e.stopPropagation();
                    ctxMenu.style.display = 'none';
                    initiateHide(ev);
                };
            }
        }
    }

    if (ev.isCustom) {
        // Disable delete if attending
        if (attendingIds.has(ev.uid)) {
            btnDelete.style.display = 'flex';
            btnDelete.style.opacity = '0.5';
            btnDelete.style.pointerEvents = 'none';
        } else {
            btnDelete.style.display = 'flex';
            btnDelete.style.opacity = '1';
            btnDelete.style.pointerEvents = 'auto';
        }
        btnEdit.style.display = 'flex';
        btnVV.style.display = 'none'; // No VVInsider for custom
        btnGoogle.style.display = 'none'; // No Google for custom

        // Show but disable blacklist for custom events
        btnBlacklist.style.display = 'flex';
        btnBlacklist.style.opacity = '0.5';
        btnBlacklist.style.pointerEvents = 'none';

        // Only show hide divider if we have nav items (separating nav from delete)
        // If no nav items, Note Divider separates Note from Delete.
        // Only show hide divider if Hide or Delete is visible
        // User request: hide the menu separater above the mark as optional/required button if the event is a custom event
        // Update: Show it if we have multiple instances (so we have nav buttons above)
        if (siblings.length > 1) {
            dividerHide.style.display = 'block';
        } else {
            dividerHide.style.display = 'none';
        }

        dividerNote.style.display = 'block'; // Divider after Note
        btnDelete.onclick = (e) => { e.stopPropagation(); deleteCustomEvent(ev.uid); ctxMenu.style.display = 'none'; }
        btnEdit.onclick = (e) => { e.stopPropagation(); ctxMenu.style.display = 'none'; initiateEdit(ev); }
    } else {
        btnDelete.style.display = 'none';
        btnEdit.style.display = 'none';
        btnVV.style.display = 'flex'; // Show VVInsider
        btnGoogle.style.display = 'flex'; // Show Google
        btnBlacklist.style.display = 'flex'; // Show Blacklist

        // Check if attending ANY instance of this event
        const anyAttending = siblings.some(uid => attendingIds.has(uid));

        if (anyAttending) {
            btnBlacklist.style.opacity = '0.5';
            btnBlacklist.style.pointerEvents = 'none';
        } else {
            btnBlacklist.style.opacity = '1';
            btnBlacklist.style.pointerEvents = 'auto';
            btnBlacklist.onclick = (e) => {
                e.stopPropagation();
                confirmBlacklist(ev.name);
            };
        }

        // Only show hide divider if hide button is visible AND (we have nav items OR we have VV/Google items above it)
        // Actually, simpler: Show divider if Hide is visible OR Delete is visible (for custom)
        // But wait, Hide is at the bottom.
        // Let's look at the structure:
        // [Edit] (Custom)
        // [Unhide] (If hidden)
        // [Note]
        // [Nav Prev/Next]
        // [VVInsider] (Official)
        // [Google] (Official)
        // --- Divider Hide ---
        // [Hide]
        // [Delete] (Custom)

        // So we want the divider if EITHER Hide OR Delete is visible.
        const isHideVisible = btnHide.style.display !== 'none';
        const isDeleteVisible = btnDelete.style.display !== 'none';

        if (isHideVisible || isDeleteVisible) {
            dividerHide.style.display = 'block';
        } else {
            dividerHide.style.display = 'none';
        }
        dividerNote.style.display = 'block'; // Divider after Note

        btnVV.onclick = (e) => {
            e.stopPropagation();
            window.open('https://www.google.com/search?q=site:vvinsider.com ' + encodeURIComponent(ev.name), '_blank');
            ctxMenu.style.display = 'none';
        };

        btnGoogle.onclick = (e) => {
            e.stopPropagation();
            window.open('https://www.google.com/search?q=' + encodeURIComponent(ev.name), '_blank');
            ctxMenu.style.display = 'none';
        };
    }

    // Optional Logic
    const isOptional = optionalEvents.has(ev.name);
    btnOptional.innerHTML = isOptional ?
        `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Mark as Required` :
        `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Mark as Optional`;

    btnOptional.onclick = (e) => {
        e.stopPropagation();
        ctxMenu.style.display = 'none';
        toggleOptionalEvent(ev.name);
    };

    // Note Button Logic
    btnNote.onclick = (e) => {
        e.stopPropagation();
        ctxMenu.style.display = 'none';
        editEventNote(ev.uid);
    };

    // Nav
    btnPrev.style.display = hasPrev ? 'flex' : 'none';
    btnNext.style.display = hasNext ? 'flex' : 'none';
    if (hasPrev) btnPrev.onclick = () => jumpToEvent(siblings[myIndex - 1]);
    if (hasNext) btnNext.onclick = () => jumpToEvent(siblings[myIndex + 1]);

    // Redundant divider, Note Divider handles separation
    dividerNav.style.display = 'none';

    // VV Divider Logic: Only show if NOT custom (VVInsider visible) AND we have nav items above it
    dividerVV.style.display = (!ev.isCustom && (hasPrev || hasNext)) ? 'block' : 'none';
}

function initiateHide(ev) {
    // If it's a custom event, always just hide the instance directly
    if (ev.isCustom) {
        hideInstance(ev.uid);
        return;
    }

    const siblings = eventNameMap.get(ev.name);
    if (!siblings || siblings.length <= 1) {
        hideSeries(ev.name);
        return;
    }
    currentCtxEvent = ev;
    document.getElementById('hide-series-name').textContent = ev.name;
    document.getElementById('hide-choice-modal').style.display = 'flex';
}

function confirmHideInstance() {
    if (currentCtxEvent) {
        hideInstance(currentCtxEvent.uid);
    }
    closeAllModals();
}

function hideInstance(uid) {
    hiddenUids.add(uid);
    localStorage.setItem(STORAGE_KEY_HIDDEN_UIDS, JSON.stringify([...hiddenUids]));

    // Remove from shownUids if present
    if (shownUids.has(uid)) {
        shownUids.delete(uid);
        localStorage.setItem(STORAGE_KEY_SHOWN_UIDS, JSON.stringify([...shownUids]));
    }

    const totalHidden = hiddenNames.size + hiddenUids.size;
    document.getElementById('hidden-count').textContent = totalHidden;

    renderApp();
}

function confirmHideSeries() {
    if (currentCtxEvent) hideSeries(currentCtxEvent.name);
    closeAllModals();
}

function hideSeries(name) {
    hiddenNames.add(name);
    localStorage.setItem(STORAGE_KEY_HIDDEN_NAMES, JSON.stringify([...hiddenNames]));

    // Remove any instances of this series from shownUids
    let shownChanged = false;

    // Check official events
    appData.forEach(e => {
        if (e.name === name) {
            const timeData = parseTimeRange(e.timePeriod);
            if (timeData) {
                const s = timeData.start + SHIFT_START_ADD;
                const uid = `${e.date}_${e.name}_${s}`;
                if (shownUids.has(uid)) {
                    shownUids.delete(uid);
                    shownChanged = true;
                }
            }
        }
    });

    // Check custom events
    customEvents.forEach(e => {
        if (e.name === name) {
            if (shownUids.has(e.uid)) {
                shownUids.delete(e.uid);
                shownChanged = true;
            }
        }
    });

    if (shownChanged) {
        localStorage.setItem(STORAGE_KEY_SHOWN_UIDS, JSON.stringify([...shownUids]));
    }

    const totalHidden = hiddenNames.size + hiddenUids.size;
    document.getElementById('hidden-count').textContent = totalHidden;

    renderApp();
}

function unhideSeries(name, refreshModal = false) {
    hiddenNames.delete(name);
    localStorage.setItem(STORAGE_KEY_HIDDEN_NAMES, JSON.stringify([...hiddenNames]));

    // Update count immediately
    const totalHidden = hiddenNames.size + hiddenUids.size;
    document.getElementById('hidden-count').textContent = totalHidden;

    if (refreshModal) openHiddenManager(true); // Refresh modal, keep tab
    renderApp();
}

function unhideInstance(uid, refreshModal = false) {
    hiddenUids.delete(uid);
    localStorage.setItem(STORAGE_KEY_HIDDEN_UIDS, JSON.stringify([...hiddenUids]));

    // Update count immediately
    const totalHidden = hiddenNames.size + hiddenUids.size;
    document.getElementById('hidden-count').textContent = totalHidden;

    if (refreshModal) openHiddenManager(true); // Refresh modal, keep tab
    renderApp();
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.style.display = 'none');
    currentCtxEvent = null;
    initialFormState = null; // Clear state on close
}

function openUnhideModal(ev) {
    const modal = document.getElementById('unhide-modal');
    const btnInstance = document.getElementById('btn-unhide-instance');
    const btnSeries = document.getElementById('btn-unhide-series');

    // Determine state
    const isSeriesHidden = hiddenNames.has(ev.name);
    const isInstanceHidden = hiddenUids.has(ev.uid);

    // Configure buttons based on what's hidden
    if (isSeriesHidden) {
        btnSeries.style.display = 'inline-flex';
        btnSeries.textContent = "Unhide Entire Series";
        btnSeries.onclick = () => {
            if (ev.isCustom) {
                // For custom events, "Unhide Series" means removing all UIDs of this series from hiddenUids
                // because we don't use hiddenNames for custom events anymore (we use individual UIDs)
                const siblings = customEvents.filter(c => c.seriesId === ev.seriesId);
                siblings.forEach(sib => hiddenUids.delete(sib.uid));
                localStorage.setItem(STORAGE_KEY_HIDDEN_UIDS, JSON.stringify([...hiddenUids]));

                // Also remove name just in case legacy data
                if (hiddenNames.has(ev.name)) {
                    hiddenNames.delete(ev.name);
                    localStorage.setItem(STORAGE_KEY_HIDDEN_NAMES, JSON.stringify([...hiddenNames]));
                }

                const totalHidden = hiddenNames.size + hiddenUids.size;
                document.getElementById('hidden-count').textContent = totalHidden;
                renderApp();
            } else {
                unhideSeries(ev.name);
            }
            closeAllModals();
        };

        // If series is hidden, unhiding "only this instance" is tricky. 
        // We'd have to unhide the series, then hide ALL OTHER instances.
        // That's computationally expensive and maybe not what user expects.
        // But let's support it if requested.
        // Actually, simpler interpretation: If series is hidden, we can't just unhide one without unhiding the series name.
        // So maybe disable "Unhide Instance" if it's a series hide?
        // Or, "Unhide Instance" could just mean "Remove from hiddenUids" if it's there, but if hiddenNames has it, it's still hidden.

        // Let's assume if Series is hidden, user probably wants to unhide series.
        // If they really want just one, they'd have to unhide series then hide others.
        // Let's disable instance button if series is hidden to avoid confusion, 
        // OR make it do the "Unhide series" action too? No.

        // Wait, if I hide a series, I can't see any of them.
        // If I toggle "Show Hidden", I see them all.
        // If I right click one and say "Unhide", and I pick "Instance", 
        // it implies I want THIS one to be visible, but others to stay hidden.
        // To achieve this: Remove name from hiddenNames. Add ALL OTHER uids of this series to hiddenUids.

        btnInstance.style.display = 'inline-flex';
        btnInstance.onclick = () => {
            // New Logic: Explicitly show this instance (overriding series hide)
            shownUids.add(ev.uid);
            localStorage.setItem(STORAGE_KEY_SHOWN_UIDS, JSON.stringify([...shownUids]));

            // Also ensure it's not in hiddenUids (just in case)
            if (hiddenUids.has(ev.uid)) {
                hiddenUids.delete(ev.uid);
                localStorage.setItem(STORAGE_KEY_HIDDEN_UIDS, JSON.stringify([...hiddenUids]));
            }

            renderApp();
            closeAllModals();
        };

    } else if (isInstanceHidden) {
        // Only instance is hidden.
        btnSeries.style.display = 'inline-flex';
        btnSeries.textContent = "Unhide Entire Series (If any others hidden)";
        // Actually, if only instance is hidden, "Unhide Series" might mean "Unhide this and any other hidden instances of this series"

        btnSeries.onclick = () => {
            if (ev.isCustom) {
                const siblings = customEvents.filter(c => c.seriesId === ev.seriesId);
                siblings.forEach(sib => hiddenUids.delete(sib.uid));
            } else {
                // Remove all UIDs of this series from hiddenUids
                const allInstances = appData.filter(e => e.name === ev.name);
                allInstances.forEach(instance => {
                    const timeData = parseTimeRange(instance.timePeriod);
                    if (timeData) {
                        const s = timeData.start + SHIFT_START_ADD;
                        const uid = `${instance.date}_${instance.name}_${s}`;
                        hiddenUids.delete(uid);
                    }
                });
            }
            localStorage.setItem(STORAGE_KEY_HIDDEN_UIDS, JSON.stringify([...hiddenUids]));

            const totalHidden = hiddenNames.size + hiddenUids.size;
            document.getElementById('hidden-count').textContent = totalHidden;
            renderApp();
            closeAllModals();
        };
        btnInstance.style.display = 'inline-flex';
        btnInstance.onclick = () => {
            unhideInstance(ev.uid);
            closeAllModals();
        };
    }

    modal.style.display = 'flex';
}

function switchHiddenTab(tab) {
    activeHiddenTab = tab;
    renderHiddenContent();
}

function openHiddenManager(keepTab = false) {
    // Reset to default tab unless specified
    if (!keepTab) activeHiddenTab = 'series';
    renderHiddenContent();
    document.getElementById('hidden-manager-modal').style.display = 'flex';
}

function renderHiddenContent() {
    const container = document.getElementById('hidden-list-container');
    container.innerHTML = '';

    // Update Tabs UI
    const tabSeries = document.getElementById('tab-hidden-series');
    const tabPartial = document.getElementById('tab-hidden-partial');
    const tabInstances = document.getElementById('tab-hidden-instances');

    // Calculate counts
    let fullyHiddenCount = 0;
    let partiallyHiddenCount = 0;

    hiddenNames.forEach(name => {
        let isVisibleAny = false;
        // Check official events
        appData.forEach(ev => {
            if (ev.name === name) {
                const timeData = parseTimeRange(ev.timePeriod);
                if (timeData) {
                    const s = timeData.start + SHIFT_START_ADD;
                    const uid = `${ev.date}_${ev.name}_${s}`;
                    if (attendingIds.has(uid) || shownUids.has(uid)) isVisibleAny = true;
                }
            }
        });
        // Check custom events
        if (!isVisibleAny) {
            customEvents.forEach(ev => {
                if (ev.name === name) {
                    if (attendingIds.has(ev.uid) || shownUids.has(ev.uid)) isVisibleAny = true;
                }
            });
        }

        if (isVisibleAny) partiallyHiddenCount++;
        else fullyHiddenCount++;
    });

    const instanceCount = hiddenUids.size;

    tabSeries.textContent = `Hidden Series (${fullyHiddenCount})`;
    tabPartial.textContent = `Partially Hidden (${partiallyHiddenCount})`;
    tabInstances.textContent = `Instances (${instanceCount})`;

    tabSeries.classList.remove('tab-active');
    tabPartial.classList.remove('tab-active');
    tabInstances.classList.remove('tab-active');

    if (activeHiddenTab === 'series') {
        tabSeries.classList.add('tab-active');
        renderHiddenSeriesList(container, 'full');
    } else if (activeHiddenTab === 'partial') {
        tabPartial.classList.add('tab-active');
        renderHiddenSeriesList(container, 'partial');
    } else {
        tabInstances.classList.add('tab-active');
        renderHiddenInstances(container);
    }
}

function restoreAllHidden(type) {
    if (!confirm('Are you sure you want to restore all events in this list?')) return;

    if (type === 'instances') {
        hiddenUids.clear();
        localStorage.setItem(STORAGE_KEY_HIDDEN_UIDS, JSON.stringify([]));
    } else {
        // We need to identify which names to remove
        const namesToRemove = [];
        hiddenNames.forEach(name => {
            let isVisibleAny = false;
            // Check official events
            appData.forEach(ev => {
                if (ev.name === name) {
                    const timeData = parseTimeRange(ev.timePeriod);
                    if (timeData) {
                        const s = timeData.start + SHIFT_START_ADD;
                        const uid = `${ev.date}_${ev.name}_${s}`;
                        if (attendingIds.has(uid) || shownUids.has(uid)) isVisibleAny = true;
                    }
                }
            });
            // Check custom events
            if (!isVisibleAny) {
                customEvents.forEach(ev => {
                    if (ev.name === name) {
                        if (attendingIds.has(ev.uid) || shownUids.has(ev.uid)) isVisibleAny = true;
                    }
                });
            }

            if (type === 'partial' && isVisibleAny) namesToRemove.push(name);
            if (type === 'full' && !isVisibleAny) namesToRemove.push(name);
        });

        namesToRemove.forEach(name => hiddenNames.delete(name));
        localStorage.setItem(STORAGE_KEY_HIDDEN_NAMES, JSON.stringify([...hiddenNames]));
    }

    const totalHidden = hiddenNames.size + hiddenUids.size;
    document.getElementById('hidden-count').textContent = totalHidden;
    renderApp();
    renderHiddenContent(); // Refresh modal content
}

function renderHiddenSeriesList(container, type) {
    const seriesList = [];
    hiddenNames.forEach(name => {
        let isVisibleAny = false;
        // Check official events
        appData.forEach(ev => {
            if (ev.name === name) {
                const timeData = parseTimeRange(ev.timePeriod);
                if (timeData) {
                    const s = timeData.start + SHIFT_START_ADD;
                    const uid = `${ev.date}_${ev.name}_${s}`;
                    if (attendingIds.has(uid) || shownUids.has(uid)) isVisibleAny = true;
                }
            }
        });
        // Check custom events
        if (!isVisibleAny) {
            customEvents.forEach(ev => {
                if (ev.name === name) {
                    if (attendingIds.has(ev.uid) || shownUids.has(ev.uid)) isVisibleAny = true;
                }
            });
        }

        if (type === 'partial' && isVisibleAny) seriesList.push(name);
        if (type === 'full' && !isVisibleAny) seriesList.push(name);
    });

    if (seriesList.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-400 py-8 italic">No events found.</div>`;
        return;
    }

    // Add Restore All Button
    const restoreBtn = document.createElement('button');
    restoreBtn.className = "w-full mb-4 py-2 bg-blue-50 text-blue-600 font-semibold rounded hover:bg-blue-100 transition text-sm";
    restoreBtn.textContent = `Restore All (${seriesList.length})`;
    restoreBtn.onclick = () => restoreAllHidden(type);
    container.appendChild(restoreBtn);

    // Sort series by first occurrence
    const sortedSeries = seriesList.map(name => {
        // Find first occurrence in appData
        const firstEvent = appData.find(e => e.name === name);
        let sortTime = 9999999999999;
        if (firstEvent) {
            const timeData = parseTimeRange(firstEvent.timePeriod);
            if (timeData) {
                const dateObj = new Date(firstEvent.date + 'T00:00:00');
                sortTime = dateObj.getTime() + timeData.start;
            }
        }
        return { name, sortTime };
    }).sort((a, b) => a.sortTime - b.sortTime);

    sortedSeries.forEach(({ name }) => {
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center bg-white border border-gray-200 rounded p-3 mb-2 shadow-sm';

        // Calculate counts
        let total = 0;
        let attending = 0;
        let explicitlyShown = 0;

        // Check official events
        appData.forEach(ev => {
            if (ev.name === name) {
                total++;
                const timeData = parseTimeRange(ev.timePeriod);
                if (timeData) {
                    const s = timeData.start + SHIFT_START_ADD;
                    const uid = `${ev.date}_${ev.name}_${s}`;
                    if (attendingIds.has(uid)) attending++;
                    else if (shownUids.has(uid)) explicitlyShown++;
                }
            }
        });

        // Check custom events
        customEvents.forEach(ev => {
            if (ev.name === name) {
                total++;
                if (attendingIds.has(ev.uid)) attending++;
                else if (shownUids.has(ev.uid)) explicitlyShown++;
            }
        });

        const visible = attending + explicitlyShown;
        const hidden = total - visible;

        let countText = '';
        if (visible > 0) {
            const parts = [];
            if (attending > 0) parts.push(`${attending} attending`);
            if (explicitlyShown > 0) parts.push(`${explicitlyShown} unhidden`);
            parts.push(`${hidden} hidden`);
            countText = `<span class="text-xs text-gray-500 ml-2 font-normal">(${parts.join(', ')})</span>`;
        } else {
            countText = `<span class="text-xs text-gray-500 ml-2 font-normal">(${hidden} hidden)</span>`;
        }

        // Find a representative event for this series to show in tooltip
        const repEvent = appData.find(e => e.name === name);
        if (repEvent) {
            const timeData = parseTimeRange(repEvent.timePeriod);
            if (timeData) {
                const s = timeData.start + SHIFT_START_ADD;
                const e = timeData.end + SHIFT_END_ADD;
                const tooltipEvent = { ...repEvent, startMins: s, endMins: e, uid: 'hidden-series-preview' };
                row.onmouseenter = (e) => showFullTooltip(e, tooltipEvent, row);
                row.onmousemove = (e) => moveTooltip(e);
                row.onmouseleave = () => hideTooltip();
            }
        }

        row.innerHTML = `<span class="font-medium text-gray-800 text-sm truncate pr-4">${name}${countText}</span>
<button onclick="unhideSeries('${name.replace(/'/g, "\\'")}', true)" class="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 font-semibold">Restore</button>`;
        container.appendChild(row);
    });
}

function renderHiddenInstances(container) {
    if (hiddenUids.size === 0) {
        container.innerHTML = `<div class="text-center text-gray-400 py-8 italic">No single instances are currently hidden.</div>`;
        return;
    }

    // Add Restore All Button
    const restoreBtn = document.createElement('button');
    restoreBtn.className = "w-full mb-4 py-2 bg-blue-50 text-blue-600 font-semibold rounded hover:bg-blue-100 transition text-sm";
    restoreBtn.textContent = `Restore All (${hiddenUids.size})`;
    restoreBtn.onclick = () => restoreAllHidden('instances');
    container.appendChild(restoreBtn);

    const section = document.createElement('div');
    // section.innerHTML = `<h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Hidden Single Times</h4>`; // Title redundant with tab

    const hiddenInstanceData = [];
    const allSourceEvents = [...appData];

    allSourceEvents.forEach(ev => {
        const timeData = parseTimeRange(ev.timePeriod);
        if (!timeData) return;
        const s = timeData.start + SHIFT_START_ADD;
        const uid = `${ev.date}_${ev.name}_${s}`;
        if (hiddenUids.has(uid)) hiddenInstanceData.push({ ...ev, uid, s });
    });

    // Sort by date then time
    hiddenInstanceData.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.s - b.s;
    }).forEach(ev => {
        const dateObj = new Date(ev.date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const h = Math.floor(ev.s / 60) % 24;
        const m = ev.s % 60;
        const timeStr = `${h === 12 || h === 0 ? 12 : h % 12}:${m.toString().padStart(2, '0')}${h >= 12 && h < 24 ? 'pm' : 'am'}`;

        const row = document.createElement('div');
        row.className = 'flex justify-between items-center bg-white border border-gray-200 rounded p-3 mb-2 shadow-sm';
        // Add hover listeners for tooltip
        row.onmouseenter = (e) => showFullTooltip(e, ev, row);
        row.onmousemove = (e) => moveTooltip(e);
        row.onmouseleave = () => hideTooltip();

        row.innerHTML = `<div class="flex flex-col overflow-hidden pr-4">
                <span class="font-medium text-gray-800 text-sm truncate">${ev.name}</span>
                <span class="text-xs text-gray-500">${dateStr} @ ${timeStr}</span>
            </div>
            <button onclick="unhideInstance('${ev.uid.replace(/'/g, "\\'")}', true)" class="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 font-semibold flex-shrink-0">Restore</button>`;
        section.appendChild(row);
    });
    container.appendChild(section);
}

function jumpToEvent(targetUid) {
    const el = document.getElementById(`card-${targetUid}`);
    if (el) {
        // Check if attendance panel is open
        const panel = document.getElementById('attendance-panel');
        const isPanelOpen = panel && panel.classList.contains('open');
        const panelWidth = isPanelOpen ? 400 : 0; // Panel width from CSS

        // Get viewport and element positions
        const viewport = document.getElementById('schedule-viewport');
        const elementRect = el.getBoundingClientRect();
        const viewportRect = viewport.getBoundingClientRect();

        // Calculate the effective viewport width (accounting for panel)
        const effectiveViewportWidth = viewportRect.width - panelWidth;

        // Calculate desired position (center of effective viewport)
        const desiredLeft = (effectiveViewportWidth / 2) - (elementRect.width / 2);

        // Calculate current offset
        const currentLeft = elementRect.left - viewportRect.left;

        // Calculate scroll adjustment
        const scrollAdjustment = currentLeft - desiredLeft;

        // Scroll to position
        viewport.scrollTo({
            left: viewport.scrollLeft + scrollAdjustment,
            top: viewport.scrollTop + (elementRect.top - viewportRect.top) - (viewportRect.height / 2) + (elementRect.height / 2),
            behavior: 'smooth'
        });

        // Highlight the event with flash animation and dim others
        const grid = document.getElementById('schedule-grid');
        grid.classList.add('dimmed-for-flash');
        el.classList.add('event-flash');
        setTimeout(() => {
            el.classList.remove('event-flash');
            grid.classList.remove('dimmed-for-flash');
        }, 1000);
    }

    const ctxMenu = document.getElementById('context-menu');
    if (ctxMenu) ctxMenu.style.display = 'none';

    const searchResults = document.getElementById('search-results');
    if (searchResults) searchResults.style.display = 'none';
}

// --- Helpers ---
function parseTimeComponent(str) {
    str = str.trim();
    let match = str.match(/^(\d+):(\d+)([a-z]+)?$/);
    if (match) return { h: parseInt(match[1]), m: parseInt(match[2]), suffix: match[3] };
    match = str.match(/^(\d+)([a-z]+)?$/);
    if (match) return { h: parseInt(match[1]), m: 0, suffix: match[2] };
    return { h: 0, m: 0, suffix: null };
}

function toMinutes(h, m, suffix) {
    if (suffix === 'pm' && h !== 12) h += 12;
    else if (suffix === 'am' && h === 12) h = 24;
    return h * 60 + m;
}

function parseTimeRange(timeStr) {
    timeStr = timeStr.toLowerCase().replace(/ /g, '').replace('late', '3am');
    const parts = timeStr.split('-');

    if (parts.length === 1) {
        const comp = parseTimeComponent(parts[0]);
        let suffix = comp.suffix || (comp.h < 8 ? 'pm' : 'am');
        let start = toMinutes(comp.h, comp.m, suffix);
        return { start: start, end: start + 60 };
    }

    if (parts.length !== 2) return null;
    const startComp = parseTimeComponent(parts[0]);
    let endComp = parseTimeComponent(parts[1]);
    if (!endComp.suffix) endComp.suffix = 'pm';
    let endMins = toMinutes(endComp.h, endComp.m, endComp.suffix);
    let startMins;
    if (startComp.suffix) startMins = toMinutes(startComp.h, startComp.m, startComp.suffix);
    else {
        const startAm = toMinutes(startComp.h, startComp.m, 'am');
        const startPm = toMinutes(startComp.h, startComp.m, 'pm');
        let durAm = endMins - startAm; if (durAm < 0) durAm += 1440;
        let durPm = endMins - startPm; if (durPm < 0) durPm += 1440;
        if (durAm <= durPm && durAm > 0) startMins = startAm; else startMins = startPm;
    }
    if (endMins < startMins) endMins += 1440;
    return { start: startMins, end: endMins };
}

function getRandomColor() {
    const r = Math.floor(Math.random() * 40 + 210);
    const g = Math.floor(Math.random() * 40 + 210);
    const b = Math.floor(Math.random() * 40 + 210);
    return `rgb(${r},${g},${b})`;
}

// --- Tooltip ---
const tooltip = document.getElementById('tooltip');



function moveTooltip(e) {
    const tipRect = tooltip.getBoundingClientRect();
    let left = e.clientX + 15;
    let top = e.clientY + 15;

    if (left + tipRect.width > window.innerWidth) left = e.clientX - tipRect.width - 10;
    if (top + tipRect.height > window.innerHeight) top = e.clientY - tipRect.height - 10;

    // Ensure top doesn't go off-screen
    if (top < 10) top = 10;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function showFullTooltip(e, ev, el) {
    // Don't show tooltip if dragging
    if (dragPreviewEl) return;

    // Check if any modal is open
    // Robust check: find any .modal-overlay that is explicitly set to flex (visible)
    const isModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');

    if (isModalOpen) {
        tooltip.style.zIndex = '6000'; // Higher than modal (4000) and confirmation (5000)
    } else {
        tooltip.style.zIndex = '2000'; // Default

        // Hover logic: Dim others if in series (ONLY if no modal is open)
        const hoverSiblings = eventNameMap.get(ev.name);
        if (hoverSiblings && hoverSiblings.length > 1) {
            document.getElementById('schedule-grid').classList.add('dim-mode');
            hoverSiblings.forEach(uid => {
                const sib = document.getElementById(`card-${uid}`);
                if (sib) sib.classList.add('is-sibling-highlight');
            });
        } else {
            // Highlight single instance
            document.getElementById('schedule-grid').classList.add('dim-mode');
            el.classList.add('is-sibling-highlight');
        }
    }

    tooltip.className = ""; // Reset to full style
    let html = `<h4>${ev.name}</h4>`;

    const dObj = new Date(ev.date + 'T00:00:00');
    const dateStr = dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const fmt = (h, m) => `${h === 12 || h === 0 ? 12 : h % 12}:${m.toString().padStart(2, '0')}${h >= 12 && h < 24 ? 'pm' : 'am'}`;
    const sH = Math.floor(ev.startMins / 60) % 24, sM = ev.startMins % 60;
    const eH = Math.floor(ev.endMins / 60) % 24, eM = ev.endMins % 60;

    const isSeriesPreview = ev.uid === 'hidden-series-preview';

    html += `<div class="meta">`;
    if (!isSeriesPreview && !isNaN(ev.startMins)) {
        html += `<div><strong>When:</strong> ${dateStr}, ${fmt(sH, sM)} - ${fmt(eH, eM)}</div>`;
    }
    html += `<div><strong>Location:</strong> ${ev.location}</div>
    </div>`;

    if (ev.imageUrl) html += `<img src="${ev.imageUrl}" onerror="this.style.display='none'" />`;

    const myNote = eventNotes[ev.uid];
    if (myNote) {
        html += `<div class="mb-2 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-yellow-200 text-sm">
            <strong>Note:</strong> ${myNote}
        </div>`;
    }

    html += `<p>${ev.longDescription || "No description available."}</p>`;

    // Gather all siblings from source data to ensure we include hidden ones
    let allSiblings = [];

    // 1. Official Events
    appData.forEach(item => {
        if (item.name === ev.name) {
            const timeData = parseTimeRange(item.timePeriod);
            if (timeData) {
                const s = timeData.start + SHIFT_START_ADD;
                const e = timeData.end + SHIFT_END_ADD;
                const uid = `${item.date}_${item.name}_${s}`;
                allSiblings.push({ ...item, startMins: s, endMins: e, uid: uid });
            }
        }
    });

    // 2. Custom Events
    customEvents.forEach(item => {
        if (item.name === ev.name) {
            allSiblings.push(item);
        }
    });

    if (allSiblings.length > 0) {
        html += `<div class="siblings-list">
            <div class="font-bold mb-1 text-white">All Occurrences:</div>`;

        const siblings = allSiblings
            .sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.startMins - b.startMins;
            });

        siblings.forEach(sib => {
            const isAttending = attendingIds.has(sib.uid);
            const sDate = new Date(sib.date + 'T00:00:00');
            const sDateStr = sDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const sH = Math.floor(sib.startMins / 60) % 24, sM = sib.startMins % 60;
            const attendingLabel = isAttending ? ' <span class="text-green-400 font-bold ml-1">(Attending)</span>' : '';
            const itemClass = isAttending ? 'sibling-item text-green-200' : 'sibling-item';

            // Check if this specific instance is hidden
            let isHidden = false;
            if (hiddenUids.has(sib.uid)) isHidden = true;
            if (hiddenNames.has(sib.name) && !isAttending) isHidden = true;

            html += `<div class="${itemClass}">• ${sDateStr} @ ${fmt(sH, sM)}${attendingLabel}</div>`;
        });
        html += `</div>`;
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';

    // Track active tooltip
    if (activeTooltipUid !== ev.uid) {
        activeTooltipUid = ev.uid;
        tooltipShowTime = Date.now();
    }

    const tipRect = tooltip.getBoundingClientRect();

    if (isModalOpen) {
        // Position next to mouse
        let left = e.clientX + 15;
        let top = e.clientY + 15;

        // Boundary checks
        if (left + tipRect.width > window.innerWidth) left = e.clientX - tipRect.width - 10;
        if (top + tipRect.height > window.innerHeight) top = e.clientY - tipRect.height - 10;

        // Ensure top doesn't go off-screen
        if (top < 10) top = 10;

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    } else {
        const rect = el.getBoundingClientRect();

        // Prefer Left
        let left = rect.left - tipRect.width - 10;

        // If left is off-screen, flip to right
        if (left < 10) {
            left = rect.right + 10;
        }
        let top = rect.top;
        if (top + tipRect.height > window.innerHeight) top = window.innerHeight - tipRect.height - 10;

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }
}

function confirmBlacklist(name) {
    document.getElementById('context-menu').style.display = 'none';
    showConfirm(`Are you sure you want to blacklist "${name}"? This will permanently hide all occurrences of this event. You can restore it later from the Blacklist Manager.`, () => {
        blacklist.add(name);
        localStorage.setItem(STORAGE_KEY_BLACKLIST, JSON.stringify([...blacklist]));
        renderApp();
    }, "Blacklist Event");
}

function hideTooltip() {
    tooltip.style.display = 'none';
    activeTooltipUid = null;
    document.getElementById('schedule-grid').classList.remove('dim-mode');
    document.querySelectorAll('.is-sibling-highlight').forEach(el => el.classList.remove('is-sibling-highlight'));
}

let currentPortNoteDate = null;

function editPortNote(date, event) {
    if (event) event.stopPropagation(); // Prevent triggering custom event creation
    currentPortNoteDate = date;
    const current = portNotes[date] || '';
    document.getElementById('port-note-input').value = current;
    document.getElementById('port-note-modal').style.display = 'flex';
    const inputEl = document.getElementById('port-note-input');
    inputEl.focus();
    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') savePortNote();
    };
}

function savePortNote() {
    if (!currentPortNoteDate) return;
    const input = document.getElementById('port-note-input').value;

    if (input.trim() === '') delete portNotes[currentPortNoteDate];
    else portNotes[currentPortNoteDate] = input.trim();

    localStorage.setItem(STORAGE_KEY_PORT_NOTES, JSON.stringify(portNotes));
    renderApp();
    closeAllModals();
}

let currentEventNoteUid = null;

function editEventNote(uid) {
    currentEventNoteUid = uid;
    const current = eventNotes[uid] || '';
    document.getElementById('event-note-input').value = current;
    document.getElementById('event-note-modal').style.display = 'flex';
    const inputEl = document.getElementById('event-note-input');
    inputEl.focus();
    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') saveEventNote();
    };
}

function saveEventNote() {
    if (!currentEventNoteUid) return;
    const input = document.getElementById('event-note-input').value;

    if (input.trim() === '') delete eventNotes[currentEventNoteUid];
    else eventNotes[currentEventNoteUid] = input.trim();

    localStorage.setItem(STORAGE_KEY_EVENT_NOTES, JSON.stringify(eventNotes));
    renderApp();
    closeAllModals();
}

function toggleShowHiddenTemp() {
    showHiddenTemp = !showHiddenTemp;
    const btn = document.getElementById('btn-toggle-hidden');
    if (btn) {
        if (showHiddenTemp) {
            btn.classList.remove('text-gray-400');
            btn.classList.add('text-blue-600', 'bg-blue-50');
        } else {
            btn.classList.add('text-gray-400');
            btn.classList.remove('text-blue-600', 'bg-blue-50');
        }
    }
    renderApp();
}

// --- Helper Functions for Color Extraction ---
function getContrastYIQ(r, g, b) {
    var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? 'black' : 'white';
}

function getDominantColor(img) {
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

            // Skip grayscale colors (black, white, gray)
            // If the difference between max and min RGB is small, it's grayscale
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const colorfulness = max - min;

            // Skip if colorfulness is below threshold (grayscale)
            if (colorfulness < 30) continue;

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
    } catch (e) {
        return null;
    }
}

// --- Attendance Panel Functions ---
function toggleAttendancePanel() {
    const panel = document.getElementById('attendance-panel');
    const isOpen = panel.classList.contains('open');

    if (isOpen) {
        panel.classList.remove('open');
    } else {
        updateAttendancePanel();
        panel.classList.add('open');
    }
}

function toggleOptionalEvent(eventName) {
    if (optionalEvents.has(eventName)) {
        optionalEvents.delete(eventName);
    } else {
        optionalEvents.add(eventName);
    }
    localStorage.setItem(STORAGE_KEY_OPTIONAL_EVENTS, JSON.stringify([...optionalEvents]));
    renderApp();
    updateAttendancePanel();
}

function switchAttendanceTab(tab) {
    activePanelTab = tab;
    updateAttendancePanel();
}

function updateAttendancePanel() {
    const { missing, optional } = getMissingEvents();
    const content = document.getElementById('attendance-panel-content');
    const countBadge = document.getElementById('missing-count');
    const tabRequired = document.getElementById('tab-required');
    const tabOptional = document.getElementById('tab-optional');

    // Update count badge (only missing events count)
    countBadge.textContent = missing.length;

    // Update Tabs UI
    if (activePanelTab === 'required') {
        tabRequired.classList.add('tab-active');
        tabOptional.classList.remove('tab-active');
    } else {
        tabRequired.classList.remove('tab-active');
        tabOptional.classList.add('tab-active');
    }

    // Update Tab Counts
    tabRequired.textContent = `Required (${missing.length})`;
    tabOptional.textContent = `Optional (${optional.length})`;

    const eventsToShow = activePanelTab === 'required' ? missing : optional;

    if (eventsToShow.length === 0) {
        content.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <svg class="w-16 h-16 mx-auto mb-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="font-semibold">No events here!</p>
            </div>
        `;
        return;
    }

    let html = '';

    // Helper to render event group
    const renderGroup = (eventGroup) => {
        const isOptional = optionalEvents.has(eventGroup.name);
        // Toggle Button HTML
        const safeName = eventGroup.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const toggleHtml = `
            <button onclick="toggleOptionalEvent('${safeName}')" class="ml-2 px-2 py-1 text-xs font-medium rounded border transition-colors focus:outline-none ${isOptional ? 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50 hover:text-gray-700'}" title="${isOptional ? 'Mark as Required' : 'Mark as Optional'}">
                ${isOptional ? 'Optional' : 'Mark Optional'}
            </button>
        `;

        let groupHtml = `
            <div class="missing-event-group">
                <div class="missing-event-header flex justify-between items-center">
                    <span class="font-semibold text-gray-800 truncate pr-2" title="${escapeHtml(eventGroup.name)}">${escapeHtml(eventGroup.name)}</span>
                    ${toggleHtml}
                </div>
        `;

        eventGroup.instances.forEach(instance => {
            const dateObj = new Date(instance.date + 'T00:00:00');
            const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = formatTimeRange(instance.startMins, instance.endMins);
            const location = instance.location ? escapeHtml(instance.location) : '';
            const hasConflict = instance.conflicts && instance.conflicts.length > 0;
            const safeUid = instance.uid.replace(/'/g, "\\'").replace(/"/g, "&quot;");

            groupHtml += `
                <div class="missing-event-instance ${hasConflict ? 'has-conflict' : ''}" onclick="jumpToEventFromPanel('${safeUid}')">
                    <div class="missing-event-datetime">
                        <div class="missing-event-date">${dateStr}</div>
                        <div class="missing-event-time">${timeStr}</div>
                        ${location ? `<div class="missing-event-location">${location}</div>` : ''}
                        ${hasConflict ? `
                            <div class="conflict-warning">
                                <svg class="w-3 h-3 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                                </svg>
                                Conflicts with: ${instance.conflicts.map(c => escapeHtml(c.name)).join(', ')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        groupHtml += `</div>`;
        return groupHtml;
    };

    eventsToShow.forEach(g => html += renderGroup(g));
    content.innerHTML = html;
}

function getMissingEvents() {
    // Get all unique event names (non-hidden)
    const eventsByName = new Map();

    // Process official events
    appData.forEach(ev => {
        // Skip hidden events
        if (blacklist.has(ev.name)) return;
        if (hiddenNames.has(ev.name)) return;

        const timeData = parseTimeRange(ev.timePeriod);
        if (!timeData) return;

        const s = timeData.start + SHIFT_START_ADD;
        const e = timeData.end + SHIFT_END_ADD;
        const uid = `${ev.date}_${ev.name}_${s}`;

        // Skip hidden UIDs
        if (hiddenUids.has(uid)) return;

        if (!eventsByName.has(ev.name)) {
            eventsByName.set(ev.name, []);
        }

        eventsByName.get(ev.name).push({
            uid: uid,
            date: ev.date,
            startMins: s,
            endMins: e,
            location: ev.location,
            name: ev.name
        });
    });

    // Process custom events
    customEvents.forEach(ev => {
        // Skip hidden events
        if (blacklist.has(ev.name)) return;
        if (hiddenNames.has(ev.name)) return;
        if (hiddenUids.has(ev.uid)) return;

        if (!eventsByName.has(ev.name)) {
            eventsByName.set(ev.name, []);
        }

        eventsByName.get(ev.name).push({
            uid: ev.uid,
            date: ev.date,
            startMins: ev.startMins,
            endMins: ev.endMins,
            location: ev.location,
            name: ev.name
        });
    });

    // Build a map of attended events by date for conflict detection
    const attendedEventsByDate = new Map();

    // Get all attended events
    attendingIds.forEach(uid => {
        const ev = eventLookup.get(uid);
        if (ev) {
            if (!attendedEventsByDate.has(ev.date)) {
                attendedEventsByDate.set(ev.date, []);
            }
            attendedEventsByDate.get(ev.date).push({
                name: ev.name,
                startMins: ev.startMins,
                endMins: ev.endMins,
                uid: ev.uid
            });
        }
    });

    // Find events where NO instance is attended
    const missingEvents = [];

    eventsByName.forEach((instances, name) => {
        const hasAttendedInstance = instances.some(instance => attendingIds.has(instance.uid));

        if (!hasAttendedInstance) {
            // Sort instances by date and time
            instances.sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.startMins - b.startMins;
            });

            // Check for conflicts with attended events
            instances.forEach(instance => {
                const attendedOnDate = attendedEventsByDate.get(instance.date) || [];
                const conflicts = attendedOnDate.filter(attended => {
                    // Check if time ranges overlap
                    return !(instance.endMins <= attended.startMins || instance.startMins >= attended.endMins);
                });

                instance.conflicts = conflicts;
            });

            missingEvents.push({
                name: name,
                instances: instances,
                firstInstanceDate: instances[0].date,
                firstInstanceTime: instances[0].startMins
            });
        }
    });

    // Sort by first instance date/time (chronologically) instead of alphabetically
    missingEvents.sort((a, b) => {
        if (a.firstInstanceDate !== b.firstInstanceDate) {
            return a.firstInstanceDate.localeCompare(b.firstInstanceDate);
        }
        return a.firstInstanceTime - b.firstInstanceTime;
    });

    const missing = [];
    const optional = [];

    missingEvents.forEach(ev => {
        if (optionalEvents.has(ev.name)) {
            optional.push(ev);
        } else {
            missing.push(ev);
        }
    });

    return { missing, optional };
}

function jumpToEventFromPanel(uid) {
    // Get the event element and its position
    const el = document.getElementById(`card-${uid}`);
    if (!el) {
        jumpToEvent(uid);
        return;
    }

    // Check if attendance panel is open
    const panel = document.getElementById('attendance-panel');
    const isPanelOpen = panel && panel.classList.contains('open');

    if (isPanelOpen) {
        // Check the event's position in the overall grid
        const viewport = document.getElementById('schedule-viewport');
        const grid = document.getElementById('schedule-grid');

        // Get the event's position relative to the grid
        const elementRect = el.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();

        // Calculate the event's horizontal position in the grid
        // (accounting for current scroll position)
        const eventLeftInGrid = elementRect.left - gridRect.left + viewport.scrollLeft;
        const gridWidth = grid.scrollWidth;

        // Calculate distance from the right edge of the grid
        const distanceFromRightEdge = gridWidth - eventLeftInGrid;

        // Panel width is 400px, check if event is within 1.25x that distance (500px) from the right
        // This means events near the right edge will trigger panel closing
        const panelWidth = 400;
        const threshold = panelWidth * 1.0;

        if (distanceFromRightEdge < threshold) {
            // Event is close to the right edge, close panel before jumping
            toggleAttendancePanel();
            // Wait for panel to close before jumping
            setTimeout(() => jumpToEvent(uid), 100);
        } else {
            // Event is far enough from the right edge, just jump without closing panel
            jumpToEvent(uid);
        }
    } else {
        // Panel not open, just jump
        jumpToEvent(uid);
    }
}

function formatTimeRange(startMins, endMins) {
    const formatTime = (mins) => {
        let h = Math.floor(mins / 60) % 24;
        const m = mins % 60;
        const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return m > 0 ? `${h}:${m.toString().padStart(2, '0')}${ampm}` : `${h}${ampm}`;
    };

    return `${formatTime(startMins)} - ${formatTime(endMins)}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Blacklist Logic ---

function openBlacklistModal() {
    document.getElementById('blacklist-input').value = Array.from(blacklist).join('\n');
    document.getElementById('blacklist-modal').style.display = 'flex';
    document.getElementById('dropdown-menu').style.display = 'none'; // Close menu
}

function saveBlacklist() {
    const text = document.getElementById('blacklist-input').value;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    blacklist = new Set(lines);
    localStorage.setItem(STORAGE_KEY_BLACKLIST, JSON.stringify([...blacklist]));
    closeAllModals();
    renderApp();
}

function renderEventCard(ev, dayCol, widthPercent, leftPercent, isOptional = false) {
    const startOffset = ev.startMins - (START_HOUR * 60);
    const duration = ev.endMins - ev.startMins;
    const top = (startOffset / 60) * 60;
    const height = Math.max(15, (duration / 60) * 60);

    const el = document.createElement('div');
    el.className = 'event-card';
    el.id = `card-${ev.uid}`;

    // Check if event is optional (even if attending)
    const isEventOptional = optionalEvents.has(ev.name);

    if (isOptional || isEventOptional) {
        el.classList.add('is-optional');
    }

    if (ev.isCustom) {
        el.classList.add('custom-event');
    } else if (ev.color === 'SINGLE') {
        el.classList.add('single-instance');
    } else {
        el.style.backgroundColor = ev.color;
    }

    // Image-based coloring
    if (ev.imageUrl) {
        // Check if colors are already cached for this image
        if (imageColorCache[ev.imageUrl]) {
            // Use cached colors immediately
            const cached = imageColorCache[ev.imageUrl];

            // Store for restoration in dataset
            el.dataset.originalBg = cached.bgColor;
            el.dataset.originalText = cached.textColor;
            el.dataset.originalBorder = cached.borderColor;
            el.dataset.originalBorderLeft = cached.borderLeftColor;

            const icon = el.querySelector('span');
            if (icon && cached.iconColor) {
                el.dataset.originalIconColor = cached.iconColor;
            }

            // Check if a sibling is attending
            const siblings = eventNameMap.get(ev.name) || [];
            const hasAttendingSibling = siblings.some(uid => attendingIds.has(uid));

            // Only apply if NOT attending
            if (!attendingIds.has(ev.uid)) {
                el.style.setProperty('background-color', cached.bgColor, 'important');
                el.style.setProperty('color', cached.textColor, 'important');
                el.style.setProperty('border-color', cached.borderColor, 'important');

                if (!hasAttendingSibling) {
                    el.style.setProperty('border-left-color', cached.borderLeftColor, 'important');
                } else {
                    el.style.setProperty('border-left-width', '4px', 'important');
                    el.style.setProperty('border-left-style', 'solid', 'important');
                    el.style.setProperty('border-left-color', '#86efac', 'important');
                }

                if (icon && cached.iconColor) {
                    icon.style.color = cached.iconColor;
                }
            }
        } else {
            // Colors not cached - calculate them
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = ev.imageUrl;
            img.style.display = 'none';

            const applyColor = () => {
                const c = getDominantColor(img);
                if (c) {
                    const bgColor = `rgb(${c.r},${c.g},${c.b})`;
                    const textColor = getContrastYIQ(c.r, c.g, c.b);
                    const borderColor = textColor === 'black' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)';
                    const borderLeftColor = textColor === 'black' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)';

                    // Determine icon color
                    let iconColor = null;
                    if (ev.isCustom) iconColor = textColor === 'black' ? '#000' : '#fff';
                    else if (ev.color === 'SINGLE') iconColor = textColor === 'black' ? '#b45309' : '#fcd34d';

                    // Cache the colors for this image URL
                    imageColorCache[ev.imageUrl] = {
                        bgColor,
                        textColor,
                        borderColor,
                        borderLeftColor,
                        iconColor
                    };

                    // Store for restoration
                    el.dataset.originalBg = bgColor;
                    el.dataset.originalText = textColor;
                    el.dataset.originalBorder = borderColor;
                    el.dataset.originalBorderLeft = borderLeftColor;
                    if (iconColor) el.dataset.originalIconColor = iconColor;

                    // Check if a sibling is attending (for border preservation)
                    const siblings = eventNameMap.get(ev.name) || [];
                    const hasAttendingSibling = siblings.some(uid => attendingIds.has(uid));
                    el.dataset.hasAttendingSibling = hasAttendingSibling ? 'true' : 'false';

                    // Only apply if NOT attending
                    if (!attendingIds.has(ev.uid)) {
                        el.style.setProperty('background-color', bgColor, 'important');
                        el.style.setProperty('color', textColor, 'important');
                        el.style.setProperty('border-color', borderColor, 'important');

                        // Only override border-left if no sibling is attending
                        if (!hasAttendingSibling) {
                            el.style.setProperty('border-left-color', borderLeftColor, 'important');
                        } else {
                            // Explicitly set green border for sibling attendance
                            el.style.setProperty('border-left-width', '4px', 'important');
                            el.style.setProperty('border-left-style', 'solid', 'important');
                            el.style.setProperty('border-left-color', '#86efac', 'important');
                        }

                        const icon = el.querySelector('span');
                        if (icon && iconColor) {
                            icon.style.color = iconColor;
                        }
                    }
                }
            };

            if (img.complete) {
                applyColor();
            } else {
                img.onload = applyColor;
            }
        }
    }

    if (ev.isHiddenTemp) {
        el.style.opacity = '0.25';
    }

    el.style.top = `${top}px`;
    el.style.height = `${height}px`;
    el.style.width = `${widthPercent}%`;
    el.style.left = `${leftPercent}%`;

    let iconHtml = '';
    if (ev.isCustom) iconHtml = '<span class="mr-1 text-white">👤</span>';
    else if (ev.color === 'SINGLE') iconHtml = '<span class="mr-1 text-yellow-600">★</span>';

    el.innerHTML = `
<div class="event-title truncate" title="${ev.name}">${iconHtml}${ev.name}</div>
<div class="event-loc truncate">${ev.location || ''}</div>
`;

    el.dataset.uid = ev.uid;
    el.dataset.name = ev.name;

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        const ctxMenu = document.getElementById('context-menu');
        if (ctxMenu.style.display === 'block') {
            ctxMenu.style.display = 'none';
            return;
        }

        const isTouchInteraction = (Date.now() - lastTouchTime) < 1000;

        if (isTouchInteraction) {
            // Touch Logic: First tap shows tooltip, Second tap toggles attendance
            // We check if this event's tooltip has been showing for a bit (avoiding immediate tap-through)
            if (activeTooltipUid === ev.uid && (Date.now() - tooltipShowTime) > 200) {
                toggleAttendance(ev.uid);
            } else {
                // Ensure tooltip is shown
                showFullTooltip(e, ev, el);
            }
        } else {
            // Desktop Logic: Click always toggles
            toggleAttendance(ev.uid);
        }
    });

    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, ev);
    });

    el.addEventListener('mouseenter', (e) => showFullTooltip(e, ev, el));
    el.addEventListener('mouseleave', (e) => {
        // Check if moving to tooltip itself
        if (e.relatedTarget !== document.getElementById('tooltip')) {
            hideTooltip();
        }
    });

    dayCol.appendChild(el);

    // Apply green border for sibling attendance AFTER element is added and after image processing
    // Use setTimeout to ensure this runs after any immediate/cached image loads
    if (!attendingIds.has(ev.uid)) {
        const siblings = eventNameMap.get(ev.name) || [];
        const hasAttendingSibling = siblings.some(uid => attendingIds.has(uid));
        if (hasAttendingSibling) {
            setTimeout(() => {
                el.style.setProperty('border-left-width', '4px', 'important');
                el.style.setProperty('border-left-style', 'solid', 'important');
                el.style.setProperty('border-left-color', '#86efac', 'important');
            }, 0);
        }
    }
}