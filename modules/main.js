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
import { parseTimeRange, scanFiles } from './utils.js';
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
    // Dark Mode Init
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (isDark) => {
        if (isDark) {
            document.body.classList.add('dark');
            document.getElementById('icon-moon').style.display = 'none';
            document.getElementById('icon-sun').style.display = 'block';
        } else {
            document.body.classList.remove('dark');
            document.getElementById('icon-moon').style.display = 'block';
            document.getElementById('icon-sun').style.display = 'none';
        }
        updateThemeColor(isDark);
    };

    if (savedTheme) {
        applyTheme(savedTheme === 'dark');
    } else {
        applyTheme(mediaQuery.matches);
    }

    // Listen for system changes
    mediaQuery.addEventListener('change', (e) => {
        if (!localStorage.getItem(STORAGE_KEY_THEME)) {
            applyTheme(e.matches);
        }
    });

    // Drag & Drop File
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                const files = await scanFiles(e.dataTransfer.items);
                if (files.length > 0) handleFiles(files);
            } else if (e.dataTransfer.files.length) {
                handleFiles(e.dataTransfer.files);
            }
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

    // Transfer Modal Swipe Logic
    const transferModalContent = document.querySelector('#transfer-modal .modal-content');
    let transferTouchStartX = 0;
    let transferTouchEndX = 0;

    if (transferModalContent) {
        transferModalContent.addEventListener('touchstart', (e) => {
            transferTouchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        transferModalContent.addEventListener('touchend', (e) => {
            transferTouchEndX = e.changedTouches[0].screenX;
            handleTransferSwipe();
        }, { passive: true });
    }

    function handleTransferSwipe() {
        if (Math.abs(transferTouchEndX - transferTouchStartX) < 100) return; // Ignore small swipes

        // Determine current tab based on visibility
        const sendContent = document.getElementById('transfer-content-send');
        const isSendVisible = sendContent && !sendContent.classList.contains('hidden');
        const currentTab = isSendVisible ? 'send' : 'receive';

        if (transferTouchEndX < transferTouchStartX) {
            // Swipe Left -> Next Tab (Send -> Receive)
            if (currentTab === 'send') {
                switchTransferTab('receive');
            }
        } else {
            // Swipe Right -> Prev Tab (Receive -> Send)
            if (currentTab === 'receive') {
                switchTransferTab('send');
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

function updateThemeColor(isDark) {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#111827' : '#AF231C');
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem(STORAGE_KEY_THEME, isDark ? 'dark' : 'light');

    document.getElementById('icon-moon').style.display = isDark ? 'none' : 'block';
    document.getElementById('icon-sun').style.display = isDark ? 'block' : 'none';

    updateThemeColor(isDark);
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
        fetch(`example_data/virgin_api_samples/line-ups/${file}`)
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
let lastUpdateInputs = null;

export function refreshUpdateCheck() {
    if (lastUpdateInputs) {
        checkForUpdates(lastUpdateInputs.jsonObjects, lastUpdateInputs.bookedEvents);
    }
}

async function handleUpdateVVLogin() {
    const usernameInput = document.getElementById('update-vv-username');
    const passwordInput = document.getElementById('update-vv-password');
    const btn = document.getElementById('btn-update-vv-login');
    const spinner = document.getElementById('update-vv-spinner');
    const statusDiv = document.getElementById('update-vv-status');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    // Check if we can use cached session
    const hasToken = window.VirginAPI && window.VirginAPI.hasValidToken();
    const cachedUser = localStorage.getItem('vv_username');
    const canUseCached = hasToken && (!username || (cachedUser && username === cachedUser));

    if (!username) {
        statusDiv.textContent = "Please enter your email.";
        statusDiv.className = "text-center text-xs text-red-600 min-h-[16px]";
        return;
    }

    if (!password && !canUseCached) {
        statusDiv.textContent = "Please enter your password.";
        statusDiv.className = "text-center text-xs text-red-600 min-h-[16px]";
        return;
    }

    const importBookedCheckbox = document.getElementById('update-vv-import-booked');
    const modeRadios = document.querySelectorAll('input[name="update-mode"]');

    statusDiv.textContent = "";
    statusDiv.className = "text-center text-xs text-gray-500 min-h-[16px]";
    btn.disabled = true;
    spinner.classList.remove('hidden');
    usernameInput.disabled = true;
    passwordInput.disabled = true;
    importBookedCheckbox.disabled = true;
    if (modeRadios) modeRadios.forEach(r => r.disabled = true);

    const importBooked = importBookedCheckbox.checked;

    try {
        if (!window.VirginAPI) throw new Error("VirginAPI not loaded");
        const { events, bookedEvents } = await window.VirginAPI.fetchAllData(username, password, (msg) => {
            statusDiv.textContent = msg;
        }, importBooked);

        statusDiv.textContent = "Data fetched. Comparing...";
        statusDiv.className = "text-center text-xs text-green-600 min-h-[16px]";

        checkForUpdates(events, importBooked ? bookedEvents : null);

        // Re-enable on success (though view changes, good practice)
        btn.disabled = false;
        spinner.classList.add('hidden');
        usernameInput.disabled = false;
        passwordInput.disabled = false;
        importBookedCheckbox.disabled = false;

        // Restore radio state
        if (window.toggleUpdateOptions) window.toggleUpdateOptions();

    } catch (err) {
        console.error(err);

        // Handle Session Expiration
        if (err.message && (err.message.includes('Session expired') || err.message.includes('401'))) {
            if (window.switchUpdateAccount) window.switchUpdateAccount();
            statusDiv.textContent = "Session expired. Please log in again.";
        } else {
            statusDiv.textContent = "Error: " + err.message;
        }

        statusDiv.className = "text-center text-xs text-red-600 min-h-[16px]";

        btn.disabled = false;
        spinner.classList.add('hidden');
        usernameInput.disabled = false;
        passwordInput.disabled = false;
        importBookedCheckbox.disabled = false;

        // Restore radio state
        if (window.toggleUpdateOptions) window.toggleUpdateOptions();
    }
}

function toggleUpdateOptions() {
    const importBooked = document.getElementById('update-vv-import-booked').checked;
    const pullRadio = document.querySelector('input[name="update-mode"][value="pull"]');

    if (pullRadio) {
        const pullLabel = pullRadio.closest('label');
        if (importBooked) {
            pullRadio.disabled = false;
            if (pullLabel) {
                pullLabel.classList.remove('cursor-not-allowed', 'opacity-50');
                pullLabel.classList.add('cursor-pointer');
            }
        } else {
            pullRadio.disabled = true;
            if (pullLabel) {
                pullLabel.classList.add('cursor-not-allowed', 'opacity-50');
                pullLabel.classList.remove('cursor-pointer');
            }
        }
    }
}

window.switchUpdateAccount = function () {
    const inputContainer = document.getElementById('update-vv-login-inputs');
    const cachedContainer = document.getElementById('update-vv-cached-session');

    if (inputContainer) inputContainer.classList.remove('hidden');
    if (cachedContainer) {
        cachedContainer.classList.add('hidden');
        cachedContainer.style.display = ''; // Clear inline flex style
    }

    // Also clear the password field to force re-entry if desired, but maybe keep username
    const passwordInput = document.getElementById('update-vv-password');
    if (passwordInput) passwordInput.value = '';

    // Clear the token so we don't try to use it again immediately or if the user cancels
    if (window.VirginAPI && window.VirginAPI.clearToken) {
        window.VirginAPI.clearToken();
    }
}

window.toggleUpdateOptions = toggleUpdateOptions;

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

const getUid = (ev) => {
    const timeData = parseTimeRange(ev.timePeriod);
    if (!timeData) return null;
    const s = timeData.start + SHIFT_START_ADD;
    return `${ev.date}_${ev.name}_${s}`;
};

function checkForUpdates(jsonObjects, bookedEvents = []) {
    lastUpdateInputs = { jsonObjects, bookedEvents };
    // Flatten and clean new data
    const newEvents = [];
    if (!bookedEvents) bookedEvents = [];

    // Ensure we handle single object input wrapped in array
    const objects = Array.isArray(jsonObjects) ? jsonObjects : [jsonObjects];

    // Collect appointments extracted from JSON files
    const extractedAppointments = [];

    objects.forEach(json => {
        // Handle if passed a single array of events (from API)
        if (Array.isArray(json) && json.length > 0 && json[0].date && json[0].name) {
            newEvents.push(...json);
            return; // It's a flat list
        }

        if (json.events && Array.isArray(json.events)) {
            const clean = parseRawData(json);
            newEvents.push(...clean);
        } else if (Array.isArray(json)) {
            // Might be a raw array of events
            json.forEach(ev => {
                if (ev.date && ev.name) newEvents.push(ev);
            });
        }

        // Grab Booked Events (Agenda)
        if (json.appointments && Array.isArray(json.appointments)) {
            extractedAppointments.push(...json.appointments);
        }
    });

    // Combine passed-in booked events (e.g. from API) with those extracted from files
    // Use a new array to avoid mutating the input 'bookedEvents' which causes duplication on re-runs
    const allBookedEvents = [...bookedEvents, ...extractedAppointments];

    if (newEvents.length === 0 && allBookedEvents.length === 0) {
        alert("No valid agenda data found.");
        resetUpdateModal();
        return;
    }

    // --- Smarter Comparison Logic ---

    const oldEventsByKey = new Map(); // Key: "date_name" -> [Event]
    const newEventsByKey = new Map();

    // Helper to generate key
    const getKey = (ev) => `${ev.date}_${ev.name}`;



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
    if (newEvents.length > 0) {
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
    }
    // Else: newEvents is empty, assume we are keeping old schedule (Bookings Update Only)

    // 4. Check for Booked Event Changes
    const bookedChanges = { added: [], removed: [], unattended: [] };

    if (allBookedEvents.length > 0) { // Only if sync is enabled (bookedEvents is not null)
        // A. Check for ADDED bookings (New Custom or New Attendance)
        allBookedEvents.forEach(booked => {
            const bookedTime = parseTimeRange(booked.timePeriod);
            if (!bookedTime) return;
            const bookedStart = bookedTime.start + SHIFT_START_ADD;

            // Check if matches official
            // Use newEvents if available, otherwise fallback to appData (if doing bookings-only update)
            const sourceEvents = newEvents.length > 0 ? newEvents : state.appData;

            const match = sourceEvents.find(ev => {
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
                // If using appData (bookings-only), uid is already in match._uid if we pre-processed it?
                // Wait, processChecForUpdates added _uid to appData items.
                // But getUid recalculates it.
                const uid = getUid(match);
                if (uid && !state.attendingIds.has(uid)) {
                    // Check if this event (new UID) is part of a Modification (Time Change)
                    // If so, and we are attending the OLD version, then this is just the "Moved" version
                    // already covered by the Modified section. We don't want to show it as "New Booking".
                    // However, if we were NOT attending the old version, arguably it's a new booking.
                    // But here we are iterating *bookedEvents* (what is currently in the app).
                    // If it matches a `modified` event's `newEv` UID, it means the app says we are booked for the new time.

                    // Check if this match is the 'newEv' of a modification
                    const isModifiedMove = modified.some(m => getUid(m.newEv) === uid);

                    if (isModifiedMove) {
                        // It is a moved event. Now check if we were attending the OLD version.
                        // We need to find the old version's UID.
                        // The 'modified' object has oldEv.
                        const modEntry = modified.find(m => getUid(m.newEv) === uid);
                        if (modEntry) {
                            const oldUid = getUid(modEntry.oldEv);
                            if (state.attendingIds.has(oldUid)) {
                                // case: Event moved, and we were booked for old time.
                                // The new time is now in our booked list.
                                // This is handled by the "Modified" section showing "Scheduled in Planner".
                                // So we SKIP adding it to "Booked Changes" to avoid dup.
                                return;
                            }
                        }
                    }

                    // Check for conflicts
                    const conflicts = [];
                    const matchTime = parseTimeRange(match.timePeriod);
                    if (matchTime) {
                        const matchStart = matchTime.start + SHIFT_START_ADD;
                        const matchEnd = matchTime.end + SHIFT_END_ADD;

                        state.attendingIds.forEach(attUid => {
                            const attEv = state.eventLookup.get(attUid);
                            if (attEv && attEv.date === match.date) {
                                const attTime = parseTimeRange(attEv.timePeriod);
                                if (attTime) {
                                    const attStart = attTime.start + SHIFT_START_ADD;
                                    const attEnd = attTime.end + SHIFT_END_ADD;

                                    if (matchStart < attEnd && matchEnd > attStart) {
                                        // Only count as conflict if the attending event is ALSO still in the booked list
                                        // (i.e. it's not being removed/moved itself)
                                        const isAttEvStillBooked = bookedEvents.some(b => {
                                            if (b.date !== attEv.date) return false;
                                            if (b.name !== attEv.name) return false;
                                            const bTime = parseTimeRange(b.timePeriod);
                                            if (!bTime) return false;
                                            const bStart = bTime.start + SHIFT_START_ADD;
                                            return Math.abs(bStart - attStart) < 15;
                                        });

                                        if (isAttEvStillBooked) {
                                            conflicts.push(attEv);
                                        }
                                    }
                                }
                            }
                        });
                    }
                    bookedChanges.added.push({ ...booked, type: 'attendance', matchUid: uid, conflicts });
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
            const stillExists = allBookedEvents.find(b =>
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

            const isBooked = allBookedEvents.find(b => {
                if (b.date !== ev.date) return false;
                if (b.name !== ev.name) return false;
                const bTime = parseTimeRange(b.timePeriod);
                if (!bTime) return false;
                const bStart = bTime.start + SHIFT_START_ADD;
                return Math.abs(bStart - evStart) < 15;
            });

            if (!isBooked) {
                // Check if type is Informative (don't unmark these as they don't appear in booked list)
                let isInformative = ev.type === "Informative";

                // Fallback: Check new data if old data doesn't have type field yet
                if (!isInformative) {
                    const key = `${ev.date}_${ev.name}`;
                    // Use newEventsKeys if available, otherwise check current appData
                    // Although eventLookup IS current appData.
                    // If we are updating schedule, we check if new schedule *confirms* it is informative.
                    if (newEvents.length > 0) {
                        const newEvs = newEventsByKey.get(key);
                        if (newEvs) {
                            const match = newEvs.find(ne => {
                                // ... time match logic ...
                                const neTime = parseTimeRange(ne.timePeriod);
                                const neStart = neTime ? neTime.start + SHIFT_START_ADD : -1;
                                // Tolerance
                                return Math.abs(neStart - evStart) < 15;
                            });
                            if (match && match.type === "Informative") isInformative = true;
                        }
                    } else {
                        // Schedules are same (Bookings only update). Trust existing type.
                        // If existing type wasn't informative, then it's not.
                    }
                }

                if (!isInformative) {
                    // Check if this is just the OLD version of a Modified Event
                    // If so, we don't want to show "Unmarking Attendance", because the system will automatically migrate attendance
                    const isOldVersionOfModified = modified.some(m => getUid(m.oldEv) === uid);

                    // Check if this event is REMOVED entirely from the schedule
                    // If so, it's covered by the "Removed Events" section (with the red "Scheduled in Planner" label)
                    // We don't need to show it as "Unmarking Attendance" separately.
                    const isRemovedEvent = removed.some(r => getUid(r) === uid);

                    if (!isOldVersionOfModified && !isRemovedEvent) {
                        bookedChanges.unattended.push(ev);
                    }
                }
            }
        });
    }

    pendingUpdateEvents = { newEvents, migrations, bookedEvents: allBookedEvents, bookedChanges, removed };
    renderChangeSummary({ added, removed, modified, unchanged, bookedChanges });
}

function applyAgendaUpdate() {
    if (!pendingUpdateEvents) return [];

    const { newEvents, migrations, bookedEvents, bookedChanges, removed } = pendingUpdateEvents;
    const rescheduledEvents = [];

    // 1. Migrate State (Attendance, Notes)
    // Only if we have migrations (implies newEvents > 0)
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
        if (state.hiddenUids.has(oldUid)) {
            state.hiddenUids.delete(oldUid);
            state.hiddenUids.add(newUid);
        }
    });

    // 2. Apply New Events Data
    if (newEvents.length > 0) {
        state.appData = newEvents;

        // Re-calculate UIDs for everything to be safe
        state.appData.forEach(ev => {
            ev._uid = getUid(ev); // Ensure _uid property is set
        });

        // Re-build lookup
        state.eventLookup = new Map();
        state.appData.forEach(ev => state.eventLookup.set(ev._uid, ev));
        state.customEvents.forEach(ev => state.eventLookup.set(ev.uid, ev));

        // Re-validate attending IDs (remove obsolete ones)
        // We only keep ones that exist in new data or are custom
        // OR we trust the migration above.
        // But what about 'removed' events?
        // If an event was removed, its UID is no longer in appData.
        // We should remove it from attendingIds unless custom.

        // Handle Removed Events Rescheduling Logic
        if (removed && removed.length > 0) {
            removed.forEach(ev => {
                if (ev.reschedule) {
                    // User wants to reschedule this removed event.
                    // 1. Ensure it appears in Missing Events (unhide/unoptional)
                    if (state.hiddenNames.has(ev.name)) {
                        state.hiddenNames.delete(ev.name);
                    }
                    if (state.optionalEvents.has(ev.name)) {
                        state.optionalEvents.delete(ev.name);
                    }

                    // Track for UI confirmation
                    rescheduledEvents.push(ev.name);
                }

                // Always remove from attendingIds if it's gone
                const uid = ev._uid || getUid(ev);
                if (uid && state.attendingIds.has(uid)) {
                    state.attendingIds.delete(uid);
                }
            });
        }

        // General cleanup of zombie IDs
        state.attendingIds.forEach(uid => {
            if (!state.eventLookup.has(uid)) {
                // Check if it was a migration target (it should be in lookup now)
                // If not found, it's gone.
                state.attendingIds.delete(uid);
            }
        });

        // Update Migrated UIDs in Hidden UIDs as well (already done in step 1 loop?)
        // Yes.
    }

    // 3. Process Booked Changes
    // First process removals/unmarks
    if (bookedChanges) {
        if (bookedChanges.removed.length > 0) {
            bookedChanges.removed.forEach(ev => {
                if (ev.ignored) return;
                // It's a custom event that is removed
                state.customEvents = state.customEvents.filter(c =>
                    c.date !== ev.date || c.name !== ev.name || c.timePeriod !== ev.timePeriod
                );
            });
        }

        if (bookedChanges.unattended.length > 0) {
            bookedChanges.unattended.forEach(ev => {
                if (ev.ignored) return;
                // Official event to unmark
                // We need to find its UID. It might be a new UID if migrated?
                // `ev` here is from state.attendingIds loop in checkForUpdates.
                // It refers to the *current* state object (old data) if we haven't updated yet?
                // No, in checkForUpdates we iterate state.attendingIds.
                // If we updated appData above, `ev` might be stale reference if it was from old appData?
                // But we act on UIDs.

                // If migration happened, we updated attendingIds to newUid.
                // If this event was migrated, we updated the ID in attendingIds.
                // But `ev` in bookedChanges has the OLD data/uid?
                // Use the name/date/time to find the target UID to remove?
                // Or: assume if it was unattended, it likely WASNT migrated (because it's "unattended" - i.e. not in the booked list).

                // However, if we migrated it, we updated attendingIds to newUid.
                // We should check if we need to remove newUid or oldUid.

                let targetUid = ev._uid;
                // Check if it was migrated
                const migration = migrations.find(m => m.oldUid === ev._uid);
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

    // Persist all changes
    if (newEvents && newEvents.length > 0) {
        localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(state.appData));
    }
    saveAttendance();
    saveEventNotes();
    saveHiddenUids();
    saveHiddenNames();
    saveOptionalEvents();

    pendingUpdateEvents = null;
    renderApp();

    return rescheduledEvents;
}

function processLoadedData(jsonObjects) {
    if (jsonObjects.length === 1) {
        const json = jsonObjects[0];
        if (json.appData) {
            restoreBackup(json);
            return;
        } else if (Array.isArray(json) && !json[0].appointments) {
            // Handle array of events (unless it's an array of agenda objects)
            // Using check for appointments to check if it's our bulk loaded format
            // The bulk loaded format is array of objects, each object might have events.
            // If we drop a single "CleanAgenda.json", it's array of events.
            // If we drop a single "Lineup.json", it's { events: ... }
            // If we drop "Agenda.json", it's { appointments: ... }
            // We should let the loop below handle it for robustness if multiple types dropped
        }
    }

    const combinedEvents = [];
    const newPortNotes = {};
    const extractedBookings = [];

    const objects = Array.isArray(jsonObjects) ? jsonObjects : [jsonObjects];

    objects.forEach(json => {
        if (json.date && json.portName) {
            newPortNotes[json.date] = json.portName;
        }

        if (json.events && Array.isArray(json.events)) {
            const clean = parseRawData(json);
            combinedEvents.push(...clean);
        } else if (Array.isArray(json)) {
            // Check if items are events
            json.forEach(ev => {
                if (ev.date && ev.name) combinedEvents.push(ev);
            });
        }

        // Handle Appointments
        if (json.appointments && Array.isArray(json.appointments)) {
            extractedBookings.push(...json.appointments);
        }
    });

    if (combinedEvents.length > 0) {
        saveNewData(combinedEvents, newPortNotes);
        if (extractedBookings.length > 0) {
            processBookedEvents(extractedBookings, true);
        }
    } else if (extractedBookings.length > 0) {
        // Only found bookings, maybe assume user wants to mark those on existing data?
        // OR we can't do anything because we wiped data in saveNewData if we called it.
        // But we didn't call it securely.
        // If init with only bookings, we have no schedule.
        // However, if we drop agenda.json AND line-ups.json, we are good.
        // If only agenda, we alert "No valid agenda data" (meaning schedule).
        alert("No schedule data found. Please include line-up files.");
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
                    type: item.type,
                    introduction: item.introduction,
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

function openTransferModal(tab) {
    if (!tab) {
        tab = window.innerWidth <= 768 ? 'receive' : 'send';
    }
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
