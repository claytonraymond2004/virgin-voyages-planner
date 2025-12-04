import {
    state, loadFromStorage as loadState, saveData as saveStateData, updateAppData,
    saveCustomEvents, saveAttendance, saveHiddenNames, saveHiddenUids,
    saveShownUids, savePortNote, saveEventNotes, saveBlacklist, saveOptionalEvents
} from './state.js';
import {
    STORAGE_KEY_THEME, STORAGE_KEY_DATA, STORAGE_KEY_ATTENDANCE,
    STORAGE_KEY_HIDDEN_NAMES, STORAGE_KEY_HIDDEN_UIDS, STORAGE_KEY_PORT_NOTES,
    STORAGE_KEY_EVENT_NOTES, STORAGE_KEY_BLACKLIST, STORAGE_KEY_OPTIONAL_EVENTS,
    STORAGE_KEY_CUSTOM, SHIFT_START_ADD, SHIFT_END_ADD, DEFAULT_OPTIONAL_EVENTS
} from './constants.js';
import { renderApp, updateVisualStates, renderCurrentTimeBar } from './render.js';
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
    toggleShowHiddenTemp, openTimeBlocksModal, saveTimeBlocksUI, initInstallPrompt,
    openSmartScheduler, toggleAgendaPanel, updateAgendaPanel,
    openUpdateAgendaModal, resetUpdateModal, renderChangeSummary, confirmUpdateApply
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
import {
    exportData as getTransferData, uploadData, downloadData, importData,
    generateQR, startScanner, stopScanner
} from './transfer.js';

// --- Global Exposure ---

window.toggleMenu = (e) => {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('dropdown-menu');
    dropdown.classList.toggle('open');
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
    document.getElementById('dropdown-menu').classList.remove('open');
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
window.toggleAgendaPanel = toggleAgendaPanel;
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
window.openSmartScheduler = openSmartScheduler;
window.openUpdateAgendaModal = openUpdateAgendaModal;
window.resetUpdateModal = resetUpdateModal;
window.handleUpdateVVLogin = handleUpdateVVLogin;
window.handleUpdateFiles = handleUpdateFiles;
window.applyAgendaUpdate = applyAgendaUpdate;
window.confirmUpdateApply = confirmUpdateApply;
window.openTransferModal = openTransferModal;
window.switchTransferTab = switchTransferTab;
window.handleTransferSend = handleTransferSend;
window.handleTransferReceive = handleTransferReceive;
window.copyTransferUrl = copyTransferUrl;
window.startTransferScanner = startTransferScanner;
window.stopTransferScanner = stopTransferScanner;

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
            dropdown.classList.remove('open');
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
    // Global Shortcuts
    document.addEventListener('keydown', (e) => {
        // Print: Ctrl+P / Cmd+P
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            exportPrintable();
        }

        // Search: / (Vim style)
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // Don't trigger if user is already typing in an input
            const tag = document.activeElement.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable) {
                return;
            }

            e.preventDefault();
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    });

    // Search Input Listeners
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        let currentSearchIndex = -1;

        searchInput.addEventListener('input', () => {
            currentSearchIndex = -1;
            updateVisualStates();
        });

        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim()) {
                document.getElementById('search-results').style.display = 'block';
            }
        });

        searchInput.addEventListener('keydown', (e) => {
            const resultsContainer = document.getElementById('search-results');
            const items = resultsContainer.querySelectorAll('.search-result-item');

            // Allow re-opening search results with arrow keys if hidden
            if (resultsContainer.style.display === 'none') {
                if (['ArrowUp', 'ArrowDown'].includes(e.key) && items.length > 0) {
                    resultsContainer.style.display = 'block';
                    // Fall through to navigation logic to move from last position
                } else if (e.key === 'Escape') {
                    // Allow Escape to fall through to clear search
                } else {
                    return;
                }
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (items.length === 0) return;

                currentSearchIndex++;
                if (currentSearchIndex >= items.length) currentSearchIndex = 0;

                updateSearchHighlight(items, currentSearchIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (items.length === 0) return;

                currentSearchIndex--;
                if (currentSearchIndex < 0) currentSearchIndex = items.length - 1;

                updateSearchHighlight(items, currentSearchIndex);
            } else if (e.key === 'Enter') {
                if (currentSearchIndex >= 0 && currentSearchIndex < items.length) {
                    e.preventDefault();
                    items[currentSearchIndex].click();
                    // Keep focus on input to allow subsequent navigation
                }
            } else if (e.key === 'Escape') {
                e.stopPropagation();
                clearSearch();
                currentSearchIndex = -1;
                searchInput.blur();
            }
        });

        function updateSearchHighlight(items, index) {
            items.forEach((item, i) => {
                if (i === index) {
                    item.classList.add('bg-gray-100', 'dark:bg-gray-700');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('bg-gray-100', 'dark:bg-gray-700');
                }
            });
        }
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
            if (openModals.length > 0) {
                closeAllModals();
                return;
            }

            const ctxMenu = document.getElementById('context-menu');
            if (ctxMenu && ctxMenu.style.display !== 'none') {
                ctxMenu.style.display = 'none';
                return;
            }

            const existingBtn = document.querySelector('.add-event-btn');
            if (existingBtn) {
                existingBtn.remove();
                return;
            }

            const mobileModal = document.getElementById('mobile-event-modal');
            if (mobileModal && getComputedStyle(mobileModal).display !== 'none') {
                closeMobileEventModal();
                return;
            }

            // Close Main Menu
            const dropdown = document.getElementById('dropdown-menu');
            if (dropdown && dropdown.classList.contains('open')) {
                dropdown.classList.remove('open');
                return;
            }

            // Close Agenda Panel
            const agendaPanel = document.getElementById('agenda-panel');
            if (agendaPanel && agendaPanel.classList.contains('open')) {
                toggleAgendaPanel();
                return;
            }

            // Close Attendance Panel
            const attendancePanel = document.getElementById('attendance-panel');
            if (attendancePanel && attendancePanel.classList.contains('open')) {
                toggleAttendancePanel();
                return;
            }

            // Clear Search Filter (if not focused)
            const searchInput = document.getElementById('search-input');
            if (searchInput && document.activeElement !== searchInput && searchInput.value) {
                clearSearch();
                // Trigger input event to reset search index in local scope
                searchInput.dispatchEvent(new Event('input'));
                return;
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
        if (Math.abs(hiddenTouchEndX - hiddenTouchStartX) < 100) return; // Ignore small swipes

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
        if (Math.abs(attendanceTouchEndX - attendanceTouchStartX) < 100) return;

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

    // Visibility Change for Time Bar
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            renderCurrentTimeBar(true);
            startTimeBarUpdater();
        } else {
            stopTimeBarUpdater();
        }
    });

    // Start updater if initially visible
    if (document.visibilityState === 'visible') {
        startTimeBarUpdater();
    }

    // Listen for agenda updates
    document.addEventListener('agenda-update-needed', () => {
        updateAgendaPanel();
    });

    // Initialize Install Prompt
    initInstallPrompt();
});

let timeBarInterval = null;

function startTimeBarUpdater() {
    if (timeBarInterval) clearInterval(timeBarInterval);
    // Update every minute (60000 ms)
    timeBarInterval = setInterval(() => {
        // Update position without centering to avoid annoying jumps
        renderCurrentTimeBar(false);

        // Also update agenda panel to refresh "current" highlight
        const agendaPanel = document.getElementById('agenda-panel');
        if (agendaPanel && agendaPanel.classList.contains('open')) {
            updateAgendaPanel();
        }
    }, 60000);
}

function stopTimeBarUpdater() {
    if (timeBarInterval) {
        clearInterval(timeBarInterval);
        timeBarInterval = null;
    }
}

function loadApp() {
    loadState();
    if (state.appData && state.appData.length > 0) {
        document.getElementById('upload-screen').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        document.getElementById('main-header').classList.remove('hidden');
        document.getElementById('main-header').classList.add('flex');
        renderApp();
        renderCurrentTimeBar(true);
        if (document.visibilityState === 'visible') {
            startTimeBarUpdater();
        }
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

    const importBooked = document.getElementById('vv-import-booked').checked;

    try {
        if (!window.VirginAPI) throw new Error("VirginAPI not loaded");
        const { events, bookedEvents } = await window.VirginAPI.fetchAllData(username, password, (msg) => {
            statusDiv.textContent = msg;
        }, importBooked);

        statusDiv.textContent = "Import successful! Rendering...";
        statusDiv.className = "text-center text-sm text-green-600 min-h-[20px]";

        processLoadedData(events);

        if (bookedEvents && bookedEvents.length > 0) {
            processBookedEvents(bookedEvents);
        }

    } catch (err) {
        console.error(err);
        statusDiv.textContent = "Error: " + err.message;
        statusDiv.className = "text-center text-sm text-red-600 min-h-[20px]";

        // Show CORS help on error
        document.getElementById('cors-help-link').style.display = 'block';

        btn.disabled = false;
        spinner.classList.add('hidden');
        usernameInput.disabled = false;
        passwordInput.disabled = false;
    }
}

// --- Update Itinerary Logic ---

let pendingUpdateEvents = null;

async function handleUpdateVVLogin() {
    const usernameInput = document.getElementById('update-vv-username');
    const passwordInput = document.getElementById('update-vv-password');
    const btn = document.getElementById('btn-update-vv-login');
    const spinner = document.getElementById('update-vv-spinner');
    const statusDiv = document.getElementById('update-vv-status');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        statusDiv.textContent = "Please enter both email and password.";
        statusDiv.className = "text-center text-xs text-red-600 min-h-[16px]";
        return;
    }

    statusDiv.textContent = "";
    statusDiv.className = "text-center text-xs text-gray-500 min-h-[16px]";
    btn.disabled = true;
    spinner.classList.remove('hidden');
    usernameInput.disabled = true;
    passwordInput.disabled = true;

    const importBooked = document.getElementById('update-vv-import-booked').checked;

    try {
        if (!window.VirginAPI) throw new Error("VirginAPI not loaded");
        const { events, bookedEvents } = await window.VirginAPI.fetchAllData(username, password, (msg) => {
            statusDiv.textContent = msg;
        }, importBooked);

        statusDiv.textContent = "Data fetched. Comparing...";
        statusDiv.className = "text-center text-xs text-green-600 min-h-[16px]";

        checkForUpdates(events, importBooked ? bookedEvents : null);

    } catch (err) {
        console.error(err);
        statusDiv.textContent = "Error: " + err.message;
        statusDiv.className = "text-center text-xs text-red-600 min-h-[16px]";

        btn.disabled = false;
        spinner.classList.add('hidden');
        usernameInput.disabled = false;
        passwordInput.disabled = false;
    }
}

function handleUpdateFiles(fileList) {
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
            checkForUpdates(results);
        })
        .catch(errFileName => {
            alert("Error processing file: " + errFileName);
        });
}

function checkForUpdates(jsonObjects, bookedEvents = []) {
    // Flatten and clean new data
    const newEvents = [];

    // Handle if passed a single array of events (from API)
    if (Array.isArray(jsonObjects) && jsonObjects.length > 0 && jsonObjects[0].date && jsonObjects[0].name) {
        // It's already a flat list of events (likely from API)
        newEvents.push(...jsonObjects);
    } else {
        // It's likely from file upload (array of daily objects)
        jsonObjects.forEach(json => {
            if (json.events && Array.isArray(json.events)) {
                const clean = parseRawData(json);
                newEvents.push(...clean);
            } else if (Array.isArray(json)) {
                // Might be a raw array of events
                json.forEach(ev => {
                    if (ev.date && ev.name) newEvents.push(ev);
                });
            }
        });
    }

    if (newEvents.length === 0) {
        alert("No valid agenda data found.");
        resetUpdateModal();
        return;
    }

    // --- Smarter Comparison Logic ---

    const oldEventsByKey = new Map(); // Key: "date_name" -> [Event]
    const newEventsByKey = new Map();

    // Helper to generate key
    const getKey = (ev) => `${ev.date}_${ev.name}`;

    // Helper to get UID
    const getUid = (ev) => {
        const timeData = parseTimeRange(ev.timePeriod);
        if (!timeData) return null;
        const s = timeData.start + SHIFT_START_ADD;
        return `${ev.date}_${ev.name}_${s}`;
    };

    // 1. Index Old Events
    state.appData.forEach(ev => {
        const key = getKey(ev);
        if (!oldEventsByKey.has(key)) oldEventsByKey.set(key, []);
        ev._uid = getUid(ev); // Temp store UID

        // Calculate startMins/endMins for old events (they aren't persisted)
        const timeData = parseTimeRange(ev.timePeriod);
        if (timeData) {
            ev.startMins = timeData.start + SHIFT_START_ADD;
            ev.endMins = timeData.end + SHIFT_END_ADD;
        }

        oldEventsByKey.get(key).push(ev);
    });

    // 2. Index New Events
    newEvents.forEach(ev => {
        const key = getKey(ev);
        if (!newEventsByKey.has(key)) newEventsByKey.set(key, []);
        ev._uid = getUid(ev); // Temp store UID
        // Add start/end mins for UI
        const timeData = parseTimeRange(ev.timePeriod);
        if (timeData) {
            ev.startMins = timeData.start + SHIFT_START_ADD;
            ev.endMins = timeData.end + SHIFT_END_ADD;
        }
        newEventsByKey.get(key).push(ev);
    });

    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];
    const migrations = []; // { oldUid, newUid }

    // 3. Compare by Key
    const allKeys = new Set([...oldEventsByKey.keys(), ...newEventsByKey.keys()]);

    allKeys.forEach(key => {
        const oldList = oldEventsByKey.get(key) || [];
        const newList = newEventsByKey.get(key) || [];

        // Track matched indices
        const oldMatched = new Set();
        const newMatched = new Set();

        // Pass 1: Exact UID Matches (Same time)
        oldList.forEach((oldEv, oldIdx) => {
            const newIdx = newList.findIndex((newEv, i) => !newMatched.has(i) && newEv._uid === oldEv._uid);
            if (newIdx !== -1) {
                oldMatched.add(oldIdx);
                newMatched.add(newIdx);

                const newEv = newList[newIdx];

                // Check for Content Changes (Location, Description)
                const changes = [];
                if (oldEv.location !== newEv.location) changes.push('Location');
                // Simple description check (ignoring minor HTML diffs if possible, but strict for now)
                if (oldEv.longDescription !== newEv.longDescription) changes.push('Description');

                if (changes.length > 0) {
                    modified.push({ type: 'content', oldEv, newEv, changes });
                } else {
                    unchanged.push(newEv);
                }
            }
        });

        // Pass 2: Remaining are potential Time Changes (Same Date/Name, Diff Time)
        oldList.forEach((oldEv, oldIdx) => {
            if (oldMatched.has(oldIdx)) return;

            // Find an unpaired new event
            const newIdx = newList.findIndex((newEv, i) => !newMatched.has(i));
            if (newIdx !== -1) {
                // Match found! It's a time change (and possibly content change)
                oldMatched.add(oldIdx);
                newMatched.add(newIdx);
                const newEv = newList[newIdx];

                const changes = ['Time'];
                if (oldEv.location !== newEv.location) changes.push('Location');
                if (oldEv.longDescription !== newEv.longDescription) changes.push('Description');

                modified.push({ type: 'time', oldEv, newEv, changes });
                migrations.push({ oldUid: oldEv._uid, newUid: newEv._uid });
            } else {
                // No match in new list -> Removed
                removed.push(oldEv);
            }
        });

        // Any remaining new events -> Added
        newList.forEach((newEv, newIdx) => {
            if (!newMatched.has(newIdx)) {
                added.push(newEv);
            }
        });
    });

    // 4. Check for Booked Event Changes
    const bookedChanges = { added: [], removed: [], unattended: [] };

    if (bookedEvents) { // Only if sync is enabled (bookedEvents is not null)
        // A. Check for ADDED bookings (New Custom or New Attendance)
        bookedEvents.forEach(booked => {
            const bookedTime = parseTimeRange(booked.timePeriod);
            if (!bookedTime) return;
            const bookedStart = bookedTime.start + SHIFT_START_ADD;

            // Check if matches official
            const match = newEvents.find(ev => {
                if (ev.date !== booked.date) return false;
                if (ev.name !== booked.name) return false;
                const evTime = parseTimeRange(ev.timePeriod);
                if (!evTime) return false;
                const evStart = evTime.start + SHIFT_START_ADD;
                return Math.abs(evStart - bookedStart) < 15;
            });

            if (match) {
                // Official Event Match
                // If not currently attending, it's "Added"
                const uid = getUid(match);
                if (uid && !state.attendingIds.has(uid)) {
                    bookedChanges.added.push({ ...booked, type: 'attendance', matchUid: uid });
                }
            } else {
                // Custom Event
                // Check if exists in current custom events
                const exists = state.customEvents.find(ev =>
                    ev.date === booked.date &&
                    ev.name === booked.name &&
                    ev.timePeriod === booked.timePeriod
                );
                if (!exists) {
                    bookedChanges.added.push({ ...booked, type: 'custom' });
                }
            }
        });

        // B. Check for REMOVED bookings (Custom Only)
        // Identify existing custom events that look like imported bookings
        const likelyImported = state.customEvents.filter(ev =>
            ev.longDescription === "Imported Booked Event" ||
            ["Treatment", "Eatery", "Entertainment"].includes(ev.longDescription)
        );

        likelyImported.forEach(customEv => {
            // Check if this customEv is present in the NEW bookedEvents list
            const stillExists = bookedEvents.find(b =>
                b.name === customEv.name &&
                b.date === customEv.date &&
                b.timePeriod === customEv.timePeriod
            );

            if (!stillExists) {
                bookedChanges.removed.push(customEv);
            }
        });

        // C. Check for UNATTENDED bookings (Official Events Only)
        // If we are syncing, and an official event is marked attending but NOT in the agenda, unmark it.
        state.attendingIds.forEach(uid => {
            const ev = state.eventLookup.get(uid);
            if (!ev || ev.isCustom) return; // Custom events handled in B

            const evTime = parseTimeRange(ev.timePeriod);
            if (!evTime) return;
            const evStart = evTime.start + SHIFT_START_ADD;

            const isBooked = bookedEvents.find(b => {
                if (b.date !== ev.date) return false;
                if (b.name !== ev.name) return false;
                const bTime = parseTimeRange(b.timePeriod);
                if (!bTime) return false;
                const bStart = bTime.start + SHIFT_START_ADD;
                return Math.abs(bStart - evStart) < 15;
            });

            if (!isBooked) {
                bookedChanges.unattended.push(ev);
            }
        });
    }

    pendingUpdateEvents = { newEvents, migrations, bookedEvents, bookedChanges };
    renderChangeSummary({ added, removed, modified, unchanged, bookedChanges });
}

function applyAgendaUpdate() {
    if (!pendingUpdateEvents) return;

    const { newEvents, migrations, bookedEvents, bookedChanges } = pendingUpdateEvents;

    // 1. Migrate State (Attendance, Notes)
    migrations.forEach(({ oldUid, newUid }) => {
        if (!oldUid || !newUid) return;

        // Attendance
        if (state.attendingIds.has(oldUid)) {
            state.attendingIds.delete(oldUid);
            state.attendingIds.add(newUid);
        }

        // Event Notes
        if (state.eventNotes[oldUid]) {
            state.eventNotes[newUid] = state.eventNotes[oldUid];
            delete state.eventNotes[oldUid];
        }

        // Hidden UIDs (Instance Hiding)
        // If user hid the specific old instance, hide the new one
        // Note: Hidden Names (Series) works by name, so it persists automatically
        if (state.hiddenUids.has(oldUid)) {
            state.hiddenUids.delete(oldUid);
            state.hiddenUids.add(newUid);
        }
    });

    // 2. Save Migrated State
    saveAttendance();
    saveEventNotes();
    saveHiddenUids();

    // 3. Update Data
    updateAppData(newEvents);

    // 4. Process Booked Events
    if (bookedChanges) {
        // Remove cancelled bookings (Custom Events)
        if (bookedChanges.removed.length > 0) {
            const uidsToRemove = new Set(bookedChanges.removed.filter(ev => !ev.ignored).map(ev => ev.uid));
            if (uidsToRemove.size > 0) {
                state.customEvents = state.customEvents.filter(ev => !uidsToRemove.has(ev.uid));
                uidsToRemove.forEach(uid => state.attendingIds.delete(uid));
                saveCustomEvents();
            }
        }

        // Unmark unattended events (Official Events)
        if (bookedChanges.unattended.length > 0) {
            bookedChanges.unattended.forEach(ev => {
                if (ev.ignored) return; // Skip if ignored

                // We need to find the UID in the NEW data context if possible, 
                // but attendingIds stores UIDs based on date/name/time which should be stable 
                // or migrated by step 1.
                // However, ev comes from state.eventLookup (OLD data).
                // Step 1 migrated attendingIds from OldUID -> NewUID.
                // So we should check if the OldUID was migrated.

                let targetUid = ev.uid; // Old UID
                // Check if this UID was migrated
                const migration = migrations.find(m => m.oldUid === ev.uid);
                if (migration) {
                    targetUid = migration.newUid;
                }

                if (state.attendingIds.has(targetUid)) {
                    state.attendingIds.delete(targetUid);
                }
            });
        }
        saveAttendance();
    }

    // Then process additions/updates
    if (bookedEvents && bookedEvents.length > 0) {
        // Filter out ignored additions
        const activeBookedEvents = bookedEvents.filter(b => {
            // Find corresponding change object to check ignored status
            // This is a bit tricky because bookedEvents is the raw list.
            // We need to look up in bookedChanges.added

            // Check if it was an "added" change
            const addedChange = bookedChanges.added.find(c =>
                c.date === b.date &&
                c.name === b.name &&
                c.timePeriod === b.timePeriod
            );

            if (addedChange && addedChange.ignored) return false;
            return true;
        });

        if (activeBookedEvents.length > 0) {
            processBookedEvents(activeBookedEvents, false);
        }
    }
    if (bookedEvents && bookedEvents.length > 0) {
        processBookedEvents(bookedEvents, false);
    }

    pendingUpdateEvents = null;
    renderApp();
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
    // Calculate optional events (Default + Dynamic)
    const optionalEvents = new Set(DEFAULT_OPTIONAL_EVENTS);
    const autoOptionalKeywords = [
        "guest artist",
        "pickleball",
        "run club",
        "you have arrived",
        "roll call",
        "trivia",
        "solo sailor",
        "$",
        "zumba",
        "quiz",
        "karaoke",
        "club",
        "puzzle",
        "roaming magic",
        "aquatic club",
        "book on board",
        "glam station"
    ];

    json.forEach(ev => {
        if (ev.name) {
            const lowerName = ev.name.toLowerCase();
            if (autoOptionalKeywords.some(keyword => lowerName.includes(keyword))) {
                optionalEvents.add(ev.name);
            }
        }
    });
    localStorage.setItem(STORAGE_KEY_OPTIONAL_EVENTS, JSON.stringify([...optionalEvents]));

    // Calculate blacklist events (Dynamic)
    const blacklistEvents = new Set();
    const autoBlacklistKeywords = [
        "crew drill",
        "you have arrived!",
        "roll call - assembly drill"
    ];

    json.forEach(ev => {
        if (ev.name) {
            const lowerName = ev.name.toLowerCase();
            if (autoBlacklistKeywords.some(keyword => lowerName.includes(keyword))) {
                blacklistEvents.add(ev.name);
            }
        }
    });
    localStorage.setItem(STORAGE_KEY_BLACKLIST, JSON.stringify([...blacklistEvents]));

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
    a.download = "voyage-planner-backup.vvoyage";
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById('dropdown-menu').classList.remove('open');
}

// --- PWA File Handling ---
if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
        if (launchParams.files.length > 0) {
            const fileHandles = launchParams.files;
            const files = [];
            for (const handle of fileHandles) {
                const file = await handle.getFile();
                files.push(file);
            }
            handleFiles(files);
        }
    });
}

function confirmResetData() {
    showConfirm("Reset everything? This deletes schedule, custom events, and preferences.", () => {
        localStorage.clear();
        location.reload();
    }, "Reset Data");
    document.getElementById('dropdown-menu').classList.remove('open');
}

function processBookedEvents(bookedEvents, shouldRender = true) {
    let modified = false;

    bookedEvents.forEach(booked => {
        const bookedTime = parseTimeRange(booked.timePeriod);
        if (!bookedTime) return;
        const bookedStart = bookedTime.start + SHIFT_START_ADD;

        // 1. Try to find in appData
        const match = state.appData.find(ev => {
            if (ev.date !== booked.date) return false;
            // Exact name match preferred, but maybe loose?
            // The API names might match exactly.
            if (ev.name !== booked.name) return false;

            const evTime = parseTimeRange(ev.timePeriod);
            if (!evTime) return false;
            const evStart = evTime.start + SHIFT_START_ADD;

            // Allow 15 min tolerance
            return Math.abs(evStart - bookedStart) < 15;
        });

        if (match) {
            // Mark as attending
            const timeData = parseTimeRange(match.timePeriod);
            const s = timeData.start + SHIFT_START_ADD;
            const uid = `${match.date}_${match.name}_${s}`;

            if (!state.attendingIds.has(uid)) {
                state.attendingIds.add(uid);
                modified = true;
            }

            // Hide other occurrences (Series Hiding)
            if (!state.hiddenNames.has(match.name)) {
                state.hiddenNames.add(match.name);
                modified = true;
            }

            // Ensure THIS specific instance is visible (Unhide Instance)
            if (state.hiddenUids.has(uid)) {
                state.hiddenUids.delete(uid);
                modified = true;
            }
            // Also add to shownUids to explicitly show this instance despite series hide
            if (!state.shownUids) state.shownUids = new Set();
            if (!state.shownUids.has(uid)) {
                state.shownUids.add(uid);
                modified = true;
            }
        } else {
            // Create Custom Event
            // Check for duplicates
            const exists = state.customEvents.find(ev =>
                ev.date === booked.date &&
                ev.name === booked.name &&
                ev.timePeriod === booked.timePeriod
            );

            if (exists) {
                // Update existing if missing fields (migration fix)
                if (!exists.startMins || !exists.uid || !exists.seriesId) {
                    const bookedEnd = bookedTime.end + SHIFT_END_ADD;
                    const seriesId = Date.now() + Math.floor(Math.random() * 10000);
                    const uid = `custom_${seriesId}`;

                    exists.startMins = bookedStart;
                    exists.endMins = bookedEnd;
                    exists.seriesId = exists.seriesId || seriesId;
                    exists.uid = exists.uid || uid;
                    exists.longDescription = exists.longDescription || booked.bookableType || "Imported Booked Event";

                    // Ensure it's in attending
                    state.attendingIds.add(exists.uid);
                    modified = true;
                }
            } else {
                const bookedEnd = bookedTime.end + SHIFT_END_ADD;
                const seriesId = Date.now() + Math.floor(Math.random() * 10000);
                const uid = `custom_${seriesId}`;

                const newCustom = {
                    id: crypto.randomUUID(),
                    date: booked.date,
                    name: booked.name,
                    location: booked.location || "",
                    timePeriod: booked.timePeriod,
                    longDescription: booked.bookableType || "Imported Booked Event",
                    isCustom: true,
                    startMins: bookedStart,
                    endMins: bookedEnd,
                    seriesId: seriesId,
                    uid: uid
                };
                state.customEvents.push(newCustom);

                // Add to attending
                state.attendingIds.add(uid);

                modified = true;
            }
        }
    });

    if (modified) {
        saveAttendance();
        saveCustomEvents();
        saveHiddenNames();
        saveShownUids();
        if (shouldRender) renderApp();
    }
}

// --- Transfer Logic ---

function openTransferModal(tab = 'send') {
    // Reset UI State
    document.getElementById('transfer-send-result').classList.add('hidden');
    document.getElementById('transfer-send-result').classList.remove('flex');
    document.getElementById('transfer-send-initial').classList.remove('hidden');
    document.getElementById('qrcode-container').innerHTML = '';
    document.getElementById('transfer-share-url').value = '';
    document.getElementById('transfer-receive-url').value = '';

    // Reset Scanner if active
    stopTransferScanner();

    document.getElementById('transfer-modal').style.display = 'flex';
    document.getElementById('dropdown-menu').classList.remove('open');
    switchTransferTab(tab);
}

function switchTransferTab(tab) {
    const sendTab = document.getElementById('tab-transfer-send');
    const receiveTab = document.getElementById('tab-transfer-receive');
    const sendContent = document.getElementById('transfer-content-send');
    const receiveContent = document.getElementById('transfer-content-receive');

    if (tab === 'send') {
        sendTab.classList.add('border-red-500', 'text-red-600');
        sendTab.classList.remove('border-transparent', 'text-gray-500');
        receiveTab.classList.remove('border-red-500', 'text-red-600');
        receiveTab.classList.add('border-transparent', 'text-gray-500');

        sendContent.classList.remove('hidden');
        receiveContent.classList.add('hidden');
    } else {
        receiveTab.classList.add('border-red-500', 'text-red-600');
        receiveTab.classList.remove('border-transparent', 'text-gray-500');
        sendTab.classList.remove('border-red-500', 'text-red-600');
        sendTab.classList.add('border-transparent', 'text-gray-500');

        receiveContent.classList.remove('hidden');
        sendContent.classList.add('hidden');
    }
}

async function handleTransferSend() {
    const btn = document.querySelector('#transfer-send-initial button');
    const spinner = document.getElementById('transfer-send-spinner');
    const resultDiv = document.getElementById('transfer-send-result');
    const qrContainer = document.getElementById('qrcode-container');
    const urlInput = document.getElementById('transfer-share-url');

    btn.disabled = true;
    spinner.classList.remove('hidden');
    resultDiv.classList.add('hidden');

    try {
        const data = getTransferData();
        const locationUrl = await uploadData(data);

        // Generate QR
        generateQR(locationUrl, qrContainer);
        urlInput.value = locationUrl;

        resultDiv.classList.remove('hidden');
        resultDiv.classList.add('flex');
        document.getElementById('transfer-send-initial').classList.add('hidden');

    } catch (err) {
        alert("Transfer failed: " + err.message);
    } finally {
        btn.disabled = false;
        spinner.classList.add('hidden');
    }
}

async function handleTransferReceive() {
    const urlInput = document.getElementById('transfer-receive-url');
    const btn = document.getElementById('btn-transfer-receive');
    const spinner = document.getElementById('transfer-receive-spinner');

    const url = urlInput.value.trim();
    if (!url) {
        alert("Please enter a URL.");
        return;
    }

    btn.disabled = true;
    spinner.classList.remove('hidden');

    try {
        const data = await downloadData(url);
        importData(data);
    } catch (err) {
        alert("Import failed: " + err.message);
        btn.disabled = false;
        spinner.classList.add('hidden');
    }
}

function copyTransferUrl() {
    const urlInput = document.getElementById('transfer-share-url');
    urlInput.select();
    document.execCommand('copy');
    // Or use navigator.clipboard.writeText(urlInput.value);

    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => btn.textContent = originalText, 2000);
}

function startTransferScanner() {
    document.getElementById('transfer-receive-initial').classList.add('hidden');
    document.getElementById('transfer-scanner-container').classList.remove('hidden');

    startScanner('reader', (decodedText) => {
        // Success
        document.getElementById('transfer-receive-url').value = decodedText;
        stopTransferScanner();
        handleTransferReceive();
    }, (errorMessage) => {
        // Parse error, ignore
    });
}

function stopTransferScanner() {
    stopScanner();
    document.getElementById('transfer-scanner-container').classList.add('hidden');
    document.getElementById('transfer-receive-initial').classList.remove('hidden');
}
