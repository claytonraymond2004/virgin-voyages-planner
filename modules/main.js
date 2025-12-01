import {
    state, loadFromStorage as loadState, saveData as saveStateData,
    saveCustomEvents, saveAttendance, saveHiddenNames, saveHiddenUids,
    saveShownUids, savePortNote, saveEventNotes, saveBlacklist, saveOptionalEvents
} from './state.js';
import {
    STORAGE_KEY_THEME, STORAGE_KEY_DATA, STORAGE_KEY_ATTENDANCE,
    STORAGE_KEY_HIDDEN_NAMES, STORAGE_KEY_HIDDEN_UIDS, STORAGE_KEY_PORT_NOTES,
    STORAGE_KEY_EVENT_NOTES, STORAGE_KEY_BLACKLIST, STORAGE_KEY_OPTIONAL_EVENTS,
    STORAGE_KEY_CUSTOM, SHIFT_START_ADD
} from './constants.js';
import { renderApp, updateVisualStates } from './render.js';
import {
    initDrag, toggleAttendance, performToggleAttendance, jumpToEvent,
    showContextMenu, hideTooltip, lastTouchTime, closeMobileEventModal,
    openMobileEventModalFromHidden
} from './interactions.js';
import {
    showConfirm, closeAllModals, openUnhideModal, openHiddenManager,
    switchHiddenTab, restoreAllHidden, editPortNote, savePortNoteUI,
    editEventNote, saveEventNoteUI, closeEventNoteModal, toggleAttendancePanel, switchAttendanceTab,
    jumpToEventFromPanel, openBlacklistModal, saveBlacklistUI, toggleOptionalEvent,
    toggleShowHiddenTemp, openTimeBlocksModal, saveTimeBlocksUI
} from './ui.js';
import {
    populateCustomModal, saveCustomEvent, tryCloseCustomModal,
    deleteCustomEvent, confirmDeleteInstance, confirmDeleteSeries,
    confirmEditInstance, confirmEditSeries, initiateEdit
} from './customEvents.js';
import {
    toggleSearchMenu, setSearchMode, clearSearch
} from './search.js';
import { exportPrintable } from './print.js';
import {
    initiateHide, confirmHideInstance, confirmHideSeries,
    hideInstance, hideSeries, unhideSeries, unhideInstance
} from './interactions.js';
import { parseTimeRange } from './utils.js';
import { initTooltips } from './tooltips.js';

// --- Global Exposure ---

window.toggleMenu = (e) => {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('dropdown-menu');
    dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
};

window.toggleSearchMenu = toggleSearchMenu;
window.setSearchMode = setSearchMode;
window.clearSearch = clearSearch;
window.jumpToEvent = jumpToEvent;
window.jumpToEventFromPanel = jumpToEventFromPanel;
window.toggleAttendance = toggleAttendance;
window.toggleOptionalEvent = toggleOptionalEvent;
window.editPortNote = editPortNote;
window.editEventNote = editEventNote;
window.openHiddenManager = openHiddenManager;
window.switchHiddenTab = switchHiddenTab;
window.restoreAllHidden = restoreAllHidden;
window.openBlacklistModal = openBlacklistModal;
window.saveBlacklist = saveBlacklistUI;
window.openCustomModal = () => {
    // Default to today at 12:00 PM if no date selected, or first available date
    const date = state.availableDates.length > 0 ? state.availableDates[0] : new Date().toISOString().split('T')[0];
    populateCustomModal(date, 720, 780);
    document.getElementById('dropdown-menu').style.display = 'none';
};
window.saveCustomEvent = saveCustomEvent;
window.tryCloseCustomModal = tryCloseCustomModal;
window.confirmDeleteInstance = confirmDeleteInstance;
window.confirmDeleteSeries = confirmDeleteSeries;
window.confirmEditInstance = confirmEditInstance;
window.confirmEditSeries = confirmEditSeries;
window.confirmHideInstance = confirmHideInstance;
window.confirmHideSeries = confirmHideSeries;
window.savePortNote = savePortNoteUI;
window.saveEventNote = saveEventNoteUI;
window.exportPrintable = exportPrintable;
window.closeAllModals = closeAllModals;
window.closeMobileEventModal = closeMobileEventModal;
window.openMobileEventModalFromHidden = openMobileEventModalFromHidden;
window.closeEventNoteModal = closeEventNoteModal;
window.switchAttendanceTab = switchAttendanceTab;
window.toggleAttendancePanel = toggleAttendancePanel;
window.exportData = exportData;
window.confirmResetData = confirmResetData;
window.loadSampleData = loadSampleData;
window.handleVVLogin = handleVVLogin;
window.openCorsHelp = () => document.getElementById('cors-help-modal').style.display = 'flex';
window.openPasswordHelp = () => document.getElementById('password-help-modal').style.display = 'flex';
window.toggleDarkMode = toggleDarkMode;
window.toggleShowHiddenTemp = toggleShowHiddenTemp;
window.openTimeBlocksModal = openTimeBlocksModal;
window.saveTimeBlocksUI = saveTimeBlocksUI;

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
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        });
    }

    // Load
    loadApp();

    // Scroll Sync
    const viewport = document.getElementById('schedule-viewport');
    const timeCol = document.getElementById('time-column');
    if (viewport && timeCol) {
        viewport.addEventListener('scroll', () => { timeCol.scrollTop = viewport.scrollTop; });
    }

    // Menu Button
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) {
        menuBtn.addEventListener('click', window.toggleMenu);
    }

    // Global Click
    document.addEventListener('click', (e) => {
        const ctxMenu = document.getElementById('context-menu');
        if (ctxMenu && !ctxMenu.contains(e.target)) {
            ctxMenu.style.display = 'none';
        }
        // Close dropdown if clicking outside
        const dropdown = document.getElementById('dropdown-menu');
        const menuBtn = document.getElementById('menu-btn');
        if (dropdown && menuBtn && !menuBtn.contains(e.target) && !dropdown.contains(e.target)) {
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
        if (searchResults && searchInput && !searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
        // Remove add event button if clicking elsewhere
        if (!e.target.closest('.add-event-btn') && !state.justCreatedButton) {
            document.querySelectorAll('.add-event-btn').forEach(el => el.remove());
        }
    });

    // Print Shortcut (Ctrl+P / Cmd+P)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            exportPrintable();
        }
    });

    // Search Input Listeners
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', updateVisualStates);
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim()) {
                document.getElementById('search-results').style.display = 'block';
            }
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') clearSearch();
        });
    }

    // Modal Close Logic (Escape)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const confirmModal = document.getElementById('confirmation-modal');
            const customModal = document.getElementById('custom-event-modal');

            if (confirmModal && getComputedStyle(confirmModal).display !== 'none') {
                confirmModal.style.display = 'none';
                state.confirmCallback = null;
                return;
            }

            if (customModal && getComputedStyle(customModal).display !== 'none') {
                tryCloseCustomModal();
                return;
            }

            const openModals = Array.from(document.querySelectorAll('.modal-overlay'))
                .filter(el => getComputedStyle(el).display !== 'none');
            if (openModals.length > 0) closeAllModals();

            const ctxMenu = document.getElementById('context-menu');
            if (ctxMenu) ctxMenu.style.display = 'none';

            const existingBtn = document.querySelector('.add-event-btn');
            if (existingBtn) existingBtn.remove();

            const mobileModal = document.getElementById('mobile-event-modal');
            if (mobileModal && getComputedStyle(mobileModal).display !== 'none') {
                closeMobileEventModal();
            }
        }
    });

    // Click outside modal content
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (overlay.id === 'confirmation-modal') {
                    overlay.style.display = 'none';
                    state.confirmCallback = null;
                }
                else if (overlay.id === 'custom-event-modal') tryCloseCustomModal();
                else if (overlay.id === 'cors-help-modal') overlay.style.display = 'none';
                else if (overlay.id === 'password-help-modal') overlay.style.display = 'none';
                else closeAllModals();
            }
        });
    });

    // Tooltip Interaction
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
        tooltip.addEventListener('mouseleave', () => {
            hideTooltip();
        });
    }

    // Touch detection
    document.addEventListener('touchstart', () => { state.lastTouchTime = Date.now(); }, { passive: true });

    // Login Enter Key
    const vvPassword = document.getElementById('vv-password');
    if (vvPassword) {
        vvPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleVVLogin();
        });
    }

    // Confirmation Modal Listeners
    const btnConfirmOk = document.getElementById('btn-confirm-ok');
    const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    if (btnConfirmOk) {
        btnConfirmOk.addEventListener('click', () => {
            document.getElementById('confirmation-modal').style.display = 'none';
            if (state.confirmCallback) state.confirmCallback();
            state.confirmCallback = null;
        });
    }
    if (btnConfirmCancel) {
        btnConfirmCancel.addEventListener('click', () => {
            document.getElementById('confirmation-modal').style.display = 'none';
            state.confirmCallback = null;
        });
    }

    // Watch for Add Event Button to toggle body class
    const observer = new MutationObserver((mutations) => {
        const btn = document.querySelector('.add-event-btn');
        if (btn) document.body.classList.add('adding-event-mode');
        else document.body.classList.remove('adding-event-mode');
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Hidden Manager Swipe Logic
    const hiddenContainer = document.getElementById('hidden-list-container');
    let hiddenTouchStartX = 0;
    let hiddenTouchEndX = 0;

    if (hiddenContainer) {
        hiddenContainer.addEventListener('touchstart', (e) => {
            hiddenTouchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        hiddenContainer.addEventListener('touchend', (e) => {
            hiddenTouchEndX = e.changedTouches[0].screenX;
            handleHiddenSwipe();
        }, { passive: true });
    }

    function handleHiddenSwipe() {
        if (Math.abs(hiddenTouchEndX - hiddenTouchStartX) < 50) return; // Ignore small swipes

        const tabs = ['series', 'partial', 'instances'];
        const currentIdx = tabs.indexOf(state.activeHiddenTab);

        if (hiddenTouchEndX < hiddenTouchStartX) {
            // Swipe Left -> Next Tab
            if (currentIdx < tabs.length - 1) {
                switchHiddenTab(tabs[currentIdx + 1]);
            }
        } else {
            // Swipe Right -> Prev Tab
            if (currentIdx > 0) {
                switchHiddenTab(tabs[currentIdx - 1]);
            }
        }
    }

    // Attendance Panel Swipe Logic
    const attendanceContainer = document.getElementById('attendance-panel-content');
    let attendanceTouchStartX = 0;
    let attendanceTouchEndX = 0;

    if (attendanceContainer) {
        attendanceContainer.addEventListener('touchstart', (e) => {
            attendanceTouchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        attendanceContainer.addEventListener('touchend', (e) => {
            attendanceTouchEndX = e.changedTouches[0].screenX;
            handleAttendanceSwipe();
        }, { passive: true });
    }

    function handleAttendanceSwipe() {
        if (Math.abs(attendanceTouchEndX - attendanceTouchStartX) < 50) return;

        const tabs = ['required', 'optional'];
        const currentIdx = tabs.indexOf(state.activePanelTab);

        if (attendanceTouchEndX < attendanceTouchStartX) {
            // Swipe Left -> Next Tab (Required -> Optional)
            if (currentIdx < tabs.length - 1) {
                switchAttendanceTab(tabs[currentIdx + 1]);
            }
        } else {
            // Swipe Right -> Prev Tab (Optional -> Required)
            if (currentIdx > 0) {
                switchAttendanceTab(tabs[currentIdx - 1]);
            }
        }
    }

    // Initialize Toolbar Tooltips
    initTooltips();
});

function loadApp() {
    loadState();
    if (state.appData && state.appData.length > 0) {
        document.getElementById('upload-screen').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        document.getElementById('main-header').classList.remove('hidden');
        document.getElementById('main-header').classList.add('flex');
        renderApp();
    }
}

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

function loadSampleData() {
    const files = [
        '2025-12-07.json', '2025-12-08.json', '2025-12-09.json',
        '2025-12-10.json', '2025-12-11.json', '2025-12-12.json',
        '2025-12-13.json', '2025-12-14.json', '2025-12-15.json',
        '2025-12-16.json', '2025-12-17.json'
    ];

    const promises = files.map(file =>
        fetch(`example_data/virgin_api_samples/${file}`)
            .then(response => {
                if (!response.ok) throw new Error(`Failed to load ${file}`);
                return response.json();
            })
    );

    Promise.all(promises)
        .then(results => {
            processLoadedData(results);
        })
        .catch(err => {
            alert("Error loading sample data: " + err.message);
            console.error(err);
        });
}

async function handleVVLogin() {
    const usernameInput = document.getElementById('vv-username');
    const passwordInput = document.getElementById('vv-password');
    const btn = document.getElementById('btn-vv-login');
    const spinner = document.getElementById('vv-spinner');
    const statusDiv = document.getElementById('vv-status');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        statusDiv.textContent = "Please enter both email and password.";
        statusDiv.className = "text-center text-sm text-red-600 min-h-[20px]";
        return;
    }

    statusDiv.textContent = "";
    statusDiv.className = "text-center text-sm text-gray-600 min-h-[20px]";
    btn.disabled = true;
    spinner.classList.remove('hidden');
    usernameInput.disabled = true;
    passwordInput.disabled = true;

    try {
        if (!window.VirginAPI) throw new Error("VirginAPI not loaded");
        const events = await window.VirginAPI.fetchAllData(username, password, (msg) => {
            statusDiv.textContent = msg;
        });

        statusDiv.textContent = "Import successful! Rendering...";
        statusDiv.className = "text-center text-sm text-green-600 min-h-[20px]";

        processLoadedData(events);

    } catch (err) {
        console.error(err);
        statusDiv.textContent = "Error: " + err.message;
        statusDiv.className = "text-center text-sm text-red-600 min-h-[20px]";

        btn.disabled = false;
        spinner.classList.add('hidden');
        usernameInput.disabled = false;
        passwordInput.disabled = false;
    }
}

function processLoadedData(jsonObjects) {
    if (jsonObjects.length === 1) {
        const json = jsonObjects[0];
        if (json.appData) {
            restoreBackup(json);
            return;
        } else if (Array.isArray(json)) {
            saveNewData(json);
            return;
        }
    }

    const combinedEvents = [];
    const newPortNotes = {};

    jsonObjects.forEach(json => {
        if (json.date && json.portName) {
            newPortNotes[json.date] = json.portName;
        }

        if (json.events && Array.isArray(json.events)) {
            const clean = parseRawData(json);
            combinedEvents.push(...clean);
        }
    });

    if (combinedEvents.length > 0) {
        saveNewData(combinedEvents, newPortNotes);
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
    loadApp();
}

function saveNewData(json, newPortNotes = {}) {
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(json));
    localStorage.removeItem(STORAGE_KEY_ATTENDANCE);
    localStorage.removeItem(STORAGE_KEY_HIDDEN_NAMES);
    localStorage.removeItem(STORAGE_KEY_HIDDEN_UIDS);

    if (Object.keys(newPortNotes).length > 0) {
        localStorage.setItem(STORAGE_KEY_PORT_NOTES, JSON.stringify(newPortNotes));
    } else {
        localStorage.removeItem(STORAGE_KEY_PORT_NOTES);
    }

    localStorage.removeItem(STORAGE_KEY_EVENT_NOTES);
    localStorage.removeItem(STORAGE_KEY_BLACKLIST);
    localStorage.removeItem(STORAGE_KEY_OPTIONAL_EVENTS);

    // Clear state
    state.hiddenNames.clear();
    state.hiddenUids.clear();
    state.portNotes = newPortNotes;
    state.eventNotes = {};
    state.blacklist.clear();
    state.optionalEvents.clear();
    state.eventColors = {};
    state.attendingIds.clear();

    loadApp();
}

function exportData() {
    const exportObj = {
        appData: state.appData,
        customEvents: state.customEvents,
        attendingIds: [...state.attendingIds],
        hiddenNames: [...state.hiddenNames],
        hiddenUids: [...state.hiddenUids],
        portNotes: state.portNotes,
        eventNotes: state.eventNotes,
        blacklist: [...state.blacklist],
        optionalEvents: [...state.optionalEvents],
        version: 1
    };
    const blob = new Blob([JSON.stringify(exportObj)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "voyage-planner-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById('dropdown-menu').style.display = 'none';
}

function confirmResetData() {
    showConfirm("Reset everything? This deletes schedule, custom events, and preferences.", () => {
        localStorage.clear();
        location.reload();
    }, "Reset Data");
    document.getElementById('dropdown-menu').style.display = 'none';
}
