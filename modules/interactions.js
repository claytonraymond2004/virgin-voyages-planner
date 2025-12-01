import { state, saveData, saveAttendance, saveHiddenNames, saveHiddenUids, saveShownUids, saveBlacklist } from './state.js';
import { START_HOUR, STORAGE_KEY_SHOWN_UIDS, STORAGE_KEY_HIDDEN_UIDS, STORAGE_KEY_HIDDEN_NAMES, STORAGE_KEY_BLACKLIST, SHIFT_START_ADD, SHIFT_END_ADD } from './constants.js';
import { renderApp } from './render.js';
import { parseTimeRange, formatTime } from './utils.js';
import {
    showGenericChoice, showConfirm, closeAllModals,
    openUnhideModal, editEventNote, toggleOptionalEvent, openHiddenManager
} from './ui.js';
import { populateCustomModal, deleteCustomEvent, initiateEdit } from './customEvents.js';

// --- Drag Interaction ---

export function initDrag(dayCol, date) {
    dayCol.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left click

        // Check for existing add button - if exists, remove it and stop
        const existingBtn = document.querySelector('.add-event-btn');
        if (existingBtn && !e.target.closest('.add-event-btn')) {
            existingBtn.remove();
            state.justClearedSelection = true;
            setTimeout(() => { state.justClearedSelection = false; }, 100);
            return;
        }

        if (e.target.closest('.event-card')) return; // Don't start drag on existing event
        if (e.target.closest('.day-header')) return; // Don't start drag on day header
        if (e.target.closest('.add-event-btn')) return; // Don't start drag on add button
        if (e.target.closest('.port-note-edit')) return; // Don't start drag on port note
        if (e.target.closest('.port-note-add')) return; // Don't start drag on port note add

        e.preventDefault();
        state.dragColumnDate = date;
        const rect = dayCol.getBoundingClientRect();
        let clickY = e.clientY - rect.top;
        state.dragStartY = clickY;

        // Remove any existing add buttons
        document.querySelectorAll('.add-event-btn').forEach(el => el.remove());

        state.dragPreviewEl = document.createElement('div');
        state.dragPreviewEl.className = 'drag-preview';
        state.dragPreviewEl.style.top = `${state.dragStartY}px`;
        state.dragPreviewEl.style.height = '0px'; // Start at 0 height
        dayCol.appendChild(state.dragPreviewEl);

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    });
}

function onDragMove(e) {
    if (!state.dragPreviewEl) return;
    const col = state.dragPreviewEl.parentElement;
    const rect = col.getBoundingClientRect();
    let currentY = e.clientY - rect.top;

    let snapY = Math.round(currentY / 15) * 15;
    let snapStart = Math.round(state.dragStartY / 15) * 15;

    const top = Math.min(snapStart, snapY);
    const height = Math.abs(snapY - snapStart);

    state.dragPreviewEl.style.top = `${top}px`;
    state.dragPreviewEl.style.height = `${height}px`;
}

function onDragEnd(e) {
    if (!state.dragPreviewEl) return;

    const topPx = parseInt(state.dragPreviewEl.style.top);
    let heightPx = parseInt(state.dragPreviewEl.style.height);
    const dayCol = state.dragPreviewEl.parentElement;

    state.dragPreviewEl.remove();
    state.dragPreviewEl = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);

    let startMinsTotal, endMinsTotal;

    // Check if it was a click (minimal drag)
    if (heightPx < 5) {
        // It was a click -> Create 1 hour block
        const snapStart = Math.round(state.dragStartY / 15) * 15;
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

    createAddEventButton(dayCol, state.dragColumnDate, startMinsTotal, endMinsTotal);
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
    state.justCreatedButton = true;
    setTimeout(() => { state.justCreatedButton = false; }, 100);
}

// --- Attendance Logic ---

export function performToggleAttendance(uid) {
    // Prevent toggling attendance for hidden events
    const ev = state.appData.find(e => {
        const timeData = parseTimeRange(e.timePeriod);
        if (!timeData) return false;
        const s = timeData.start + SHIFT_START_ADD;
        return `${e.date}_${e.name}_${s}` === uid;
    }) || state.customEvents.find(e => e.uid === uid);

    if (ev) {
        // Check if it's hidden (either series or instance)
        const isSeriesHidden = state.hiddenNames.has(ev.name);
        const isInstanceHidden = state.hiddenUids.has(uid);
        const isExplicitlyShown = state.shownUids.has(uid);

        // Guard: Block interaction only if it's hidden AND not attending AND not explicitly shown
        if ((isSeriesHidden || isInstanceHidden) && !state.attendingIds.has(uid) && !isExplicitlyShown) return;

        if (state.attendingIds.has(uid)) {
            // Unattending
            state.attendingIds.delete(uid);

            // If it was part of a hidden series, keep it visible by adding to shownUids
            if (isSeriesHidden) {
                state.shownUids.add(uid);
                saveShownUids();
            }
        } else {
            // Attending
            state.attendingIds.add(uid);

            // Cleanup: If it was explicitly shown, we can remove it from shownUids
            if (state.shownUids.has(uid)) {
                state.shownUids.delete(uid);
                saveShownUids();
            }
        }
    } else {
        if (state.attendingIds.has(uid)) {
            state.attendingIds.delete(uid);
        } else {
            state.attendingIds.add(uid);
        }
    }

    saveAttendance();
    renderApp();
}

export function toggleAttendance(uid) {
    // 1. Find the event object
    const ev = state.appData.find(e => {
        const timeData = parseTimeRange(e.timePeriod);
        if (!timeData) return false;
        const s = timeData.start + SHIFT_START_ADD;
        return `${e.date}_${e.name}_${s}` === uid;
    }) || state.customEvents.find(e => e.uid === uid);

    if (!ev) {
        performToggleAttendance(uid);
        return;
    }

    const isAttending = state.attendingIds.has(uid);

    // 2. Count siblings and attended siblings
    let siblingCount = 0;
    let attendedSiblingCount = 0;

    // Scan Official
    state.appData.forEach(e => {
        if (e.name === ev.name) {
            siblingCount++;
            const timeData = parseTimeRange(e.timePeriod);
            if (timeData) {
                const s = timeData.start + SHIFT_START_ADD;
                const u = `${e.date}_${e.name}_${s}`;
                if (state.attendingIds.has(u)) attendedSiblingCount++;
            }
        }
    });

    // Scan Custom
    state.customEvents.forEach(e => {
        if (e.name === ev.name) {
            siblingCount++;
            if (state.attendingIds.has(e.uid)) attendedSiblingCount++;
        }
    });

    if (siblingCount <= 1) {
        performToggleAttendance(uid);
        return;
    }

    if (!isAttending) {
        // Case: Adding (Attending)
        if (!state.hiddenNames.has(ev.name)) {
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
        if (state.hiddenNames.has(ev.name)) {
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

// --- Context Menu ---

export function showContextMenu(e, ev, isHiddenPreview = false) {
    const ctxMenu = document.getElementById('context-menu');
    const ctxOverlay = document.getElementById('context-menu-overlay');

    ctxMenu.style.display = 'block';

    // Mobile Overlay Logic
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        if (ctxOverlay) {
            ctxOverlay.classList.add('active');
            ctxOverlay.onclick = () => {
                ctxMenu.style.display = 'none';
                ctxOverlay.classList.remove('active');
            };
        }
        // No manual positioning needed for mobile (CSS handles centering)
    } else {
        // Desktop Positioning
        let x = e.clientX;
        let y = e.clientY;

        // Adjust if going off screen
        if (x + 220 > window.innerWidth) x = window.innerWidth - 230; // 200px width + padding

        // Dynamic vertical positioning
        const menuHeight = ctxMenu.offsetHeight;

        // If menu would go off screen, shift up
        if (y + menuHeight > window.innerHeight) {
            y = y - menuHeight;
        }

        // Safety check
        if (y < 10) y = 10;
        if (y + menuHeight > window.innerHeight) {
            y = window.innerHeight - menuHeight - 10;
        }

        ctxMenu.style.left = `${x}px`;
        ctxMenu.style.top = `${y}px`;
    }

    const siblings = state.eventNameMap.get(ev.name) || [];
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

    // Helper to close menu and overlay
    const closeMenu = () => {
        ctxMenu.style.display = 'none';
        if (ctxOverlay) ctxOverlay.classList.remove('active');
    };

    if (ev.isHiddenTemp) {
        btnHide.style.display = 'none';
        unhideOption.style.display = 'flex';
        unhideDivider.style.display = 'block';

        unhideOption.onclick = (e) => {
            e.stopPropagation();
            closeMenu();
            openUnhideModal(ev);
        };
    } else {
        unhideOption.style.display = 'none';
        unhideDivider.style.display = 'none';

        // Disable hide if attending
        if (state.attendingIds.has(ev.uid)) {
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
                        closeMenu();
                        initiateHide(ev);
                    };
                } else {
                    btnHide.style.display = 'none';
                }
            } else {
                btnHide.style.display = 'flex';
                btnHide.onclick = (e) => {
                    e.stopPropagation();
                    closeMenu();
                    initiateHide(ev);
                };
            }
        }
    }

    // If hidden preview, allow unhide but hide "Hide" option
    if (isHiddenPreview) {
        btnHide.style.display = 'none';

        // Show Unhide option
        unhideOption.style.display = 'flex';
        unhideDivider.style.display = 'block';

        unhideOption.onclick = (e) => {
            e.stopPropagation();
            closeMenu();

            // Determine unhide action based on active tab
            if (state.activeHiddenTab === 'instances') {
                // Unhide specific instance
                unhideInstance(ev.uid, true);
            } else {
                // Unhide series (series or partial tab)
                unhideSeries(ev.name, true);
            }

            // Close mobile modal as the event is no longer hidden/previewed in the same way
            closeMobileEventModal();
        };

        dividerHide.style.display = 'none';
    }

    if (ev.isCustom) {
        // Disable delete if attending
        if (state.attendingIds.has(ev.uid)) {
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

        if (siblings.length > 1) {
            dividerHide.style.display = 'block';
        } else {
            dividerHide.style.display = 'none';
        }

        dividerNote.style.display = 'block'; // Divider after Note
        btnDelete.onclick = (e) => { e.stopPropagation(); deleteCustomEvent(ev.uid); closeMenu(); }
        btnEdit.onclick = (e) => { e.stopPropagation(); closeMenu(); initiateEdit(ev); }
    } else {
        btnDelete.style.display = 'none';
        btnEdit.style.display = 'none';
        btnVV.style.display = 'flex'; // Show VVInsider
        btnGoogle.style.display = 'flex'; // Show Google
        btnBlacklist.style.display = 'flex'; // Show Blacklist

        // Check if attending ANY instance of this event
        const anyAttending = siblings.some(uid => state.attendingIds.has(uid));

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

        // Always show divider for official events to separate Google from Optional
        dividerHide.style.display = 'block';
        dividerNote.style.display = 'block'; // Divider after Note

        btnVV.onclick = (e) => {
            e.stopPropagation();
            window.open('https://www.google.com/search?q=site:vvinsider.com ' + encodeURIComponent(ev.name), '_blank');
            closeMenu();
        };

        btnGoogle.onclick = (e) => {
            e.stopPropagation();
            window.open('https://www.google.com/search?q=' + encodeURIComponent(ev.name), '_blank');
            closeMenu();
        };
    }

    // Optional Logic
    const isOptional = state.optionalEvents.has(ev.name);
    btnOptional.innerHTML = isOptional ?
        `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Mark as Required` :
        `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Mark as Optional`;

    if (ev.isHiddenTemp) {
        btnOptional.style.opacity = '0.5';
        btnOptional.style.pointerEvents = 'none';
    } else {
        btnOptional.style.opacity = '1';
        btnOptional.style.pointerEvents = 'auto';
        btnOptional.onclick = (e) => {
            e.stopPropagation();
            closeMenu();
            toggleOptionalEvent(ev.name);
        };
    }

    // Note Button Logic
    btnNote.onclick = (e) => {
        e.stopPropagation();
        closeMenu();
        editEventNote(ev.uid);
    };

    // Nav
    btnPrev.style.display = hasPrev ? 'flex' : 'none';
    btnNext.style.display = hasNext ? 'flex' : 'none';
    if (hasPrev) btnPrev.onclick = () => {
        document.getElementById('mobile-event-modal').style.display = 'none';
        closeMenu();
        jumpToEvent(siblings[myIndex - 1]);
    };
    if (hasNext) btnNext.onclick = () => {
        document.getElementById('mobile-event-modal').style.display = 'none';
        closeMenu();
        jumpToEvent(siblings[myIndex + 1]);
    };

    dividerNav.style.display = 'none';

    // VV Divider Logic
    dividerVV.style.display = (!ev.isCustom && (hasPrev || hasNext)) ? 'block' : 'none';
}

// --- Hiding Logic ---

export function initiateHide(ev) {
    if (ev.isCustom) {
        hideInstance(ev.uid);
        return;
    }

    const siblings = state.eventNameMap.get(ev.name);
    if (!siblings || siblings.length <= 1) {
        hideSeries(ev.name);
        return;
    }
    state.currentCtxEvent = ev;
    document.getElementById('hide-series-name').textContent = ev.name;
    document.getElementById('hide-choice-modal').style.display = 'flex';
}

export function confirmHideInstance() {
    if (state.currentCtxEvent) {
        hideInstance(state.currentCtxEvent.uid);
    }
    closeAllModals();
}

export function hideInstance(uid) {
    state.hiddenUids.add(uid);
    saveHiddenUids();

    if (state.shownUids.has(uid)) {
        state.shownUids.delete(uid);
        saveShownUids();
    }

    renderApp();
}

export function confirmHideSeries() {
    if (state.currentCtxEvent) hideSeries(state.currentCtxEvent.name);
    closeAllModals();
}

export function hideSeries(name) {
    state.hiddenNames.add(name);
    saveHiddenNames();

    let shownChanged = false;

    // Check official events
    state.appData.forEach(e => {
        if (e.name === name) {
            const timeData = parseTimeRange(e.timePeriod);
            if (timeData) {
                const s = timeData.start + SHIFT_START_ADD;
                const uid = `${e.date}_${e.name}_${s}`;
                if (state.shownUids.has(uid)) {
                    state.shownUids.delete(uid);
                    shownChanged = true;
                }
            }
        }
    });

    // Check custom events
    state.customEvents.forEach(e => {
        if (e.name === name) {
            if (state.shownUids.has(e.uid)) {
                state.shownUids.delete(e.uid);
                shownChanged = true;
            }
        }
    });

    if (shownChanged) {
        saveShownUids();
    }

    renderApp();
}

export function unhideSeries(name, refreshModal = false) {
    state.hiddenNames.delete(name);
    saveHiddenNames();

    if (refreshModal) {
        openHiddenManager(true);
    }
    renderApp();
}

export function unhideInstance(uid, refreshModal = false) {
    state.hiddenUids.delete(uid);
    saveHiddenUids();

    if (refreshModal) {
        openHiddenManager(true);
    }

    renderApp();
}

// --- Jump To Event ---

export function jumpToEvent(targetUid) {
    const el = document.getElementById(`card-${targetUid}`);
    if (el) {
        const panel = document.getElementById('attendance-panel');
        const isPanelOpen = panel && panel.classList.contains('open');
        const panelWidth = isPanelOpen ? 400 : 0;

        const viewport = document.getElementById('schedule-viewport');
        const elementRect = el.getBoundingClientRect();
        const viewportRect = viewport.getBoundingClientRect();

        const effectiveViewportWidth = viewportRect.width - panelWidth;
        const desiredLeft = (effectiveViewportWidth / 2) - (elementRect.width / 2);
        const currentLeft = elementRect.left - viewportRect.left;
        const scrollAdjustment = currentLeft - desiredLeft;

        viewport.scrollTo({
            left: viewport.scrollLeft + scrollAdjustment,
            top: viewport.scrollTop + (elementRect.top - viewportRect.top) - (viewportRect.height / 2) + (elementRect.height / 2),
            behavior: 'smooth'
        });

        const grid = document.getElementById('schedule-grid');

        // Wait for scroll to likely finish (approx 500ms) or use a scrollend listener if supported
        // For simplicity and broad support, we'll use a timeout that should cover the smooth scroll duration
        setTimeout(() => {
            grid.classList.add('dimmed-for-flash');
            el.classList.add('event-flash');
            setTimeout(() => {
                el.classList.remove('event-flash');
                grid.classList.remove('dimmed-for-flash');
            }, 1000);
        }, 600);
    }

    const ctxMenu = document.getElementById('context-menu');
    if (ctxMenu) ctxMenu.style.display = 'none';

    const searchResults = document.getElementById('search-results');
    if (searchResults) searchResults.style.display = 'none';
}

// --- Tooltip ---

export const tooltip = document.getElementById('tooltip');
export let lastTouchTime = 0;
export let tooltipShowTime = 0;
export let activeTooltipUid = null;

export function moveTooltip(e) {
    const tipRect = tooltip.getBoundingClientRect();
    let left = e.clientX + 15;
    let top = e.clientY + 15;

    if (left + tipRect.width > window.innerWidth) left = e.clientX - tipRect.width - 10;
    if (top + tipRect.height > window.innerHeight) top = e.clientY - tipRect.height - 10;

    if (top < 10) top = 10;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

export function showFullTooltip(e, ev, el) {
    if (state.dragPreviewEl) return;
    if (document.querySelector('.add-event-btn')) return;

    const isModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => m.style.display === 'flex');

    if (isModalOpen) {
        tooltip.style.zIndex = '8000';
    } else {
        tooltip.style.zIndex = '5000';

        const hoverSiblings = state.eventNameMap.get(ev.name);
        if (hoverSiblings && hoverSiblings.length > 1) {
            document.getElementById('schedule-grid').classList.add('dim-mode');
            hoverSiblings.forEach(uid => {
                const sib = document.getElementById(`card-${uid}`);
                if (sib) sib.classList.add('is-sibling-highlight');
            });
        } else {
            document.getElementById('schedule-grid').classList.add('dim-mode');
            el.classList.add('is-sibling-highlight');
        }
    }

    tooltip.className = "";
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

    const myNote = state.eventNotes[ev.uid];
    if (myNote) {
        html += `<div class="mb-2 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-yellow-200 text-sm">
            <strong>Note:</strong> ${myNote}
        </div>`;
    }

    html += `<p>${ev.longDescription || "No description available."}</p>`;

    let allSiblings = [];

    state.appData.forEach(item => {
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

    state.customEvents.forEach(item => {
        if (item.name === ev.name) {
            allSiblings.push(item);
        }
    });

    if (allSiblings.length > 0) {
        html += `<div class="siblings-list">
            <div class="font-bold mb-1 text-white">All Occurrences (${allSiblings.length}):</div>`;

        const siblings = allSiblings
            .sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.startMins - b.startMins;
            });

        siblings.forEach(sib => {
            const isAttending = state.attendingIds.has(sib.uid);
            const isSeriesHidden = state.hiddenNames.has(sib.name);
            const isInstanceHidden = state.hiddenUids.has(sib.uid);
            const isExplicitlyShown = state.shownUids.has(sib.uid);

            // Event is hidden if it's marked hidden AND NOT explicitly shown AND NOT attended
            const isHidden = (isSeriesHidden || isInstanceHidden) && !isExplicitlyShown && !isAttending;
            const isTempUnhidden = isHidden && state.showHiddenTemp;
            const isEffectiveHidden = isHidden && !state.showHiddenTemp;
            const isCurrent = sib.uid === ev.uid;

            const sDate = new Date(sib.date + 'T00:00:00');
            const sDateStr = sDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const sH = Math.floor(sib.startMins / 60) % 24, sM = sib.startMins % 60;

            let icon = '';
            const iconEye = `<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-transparent mr-1"><svg class="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg></span>`;
            const iconHidden = `<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-transparent mr-1"><svg class="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg></span>`;
            const iconTemp = `<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-900/50 text-blue-300 mr-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg></span>`;

            if (isEffectiveHidden) icon = iconHidden;
            else if (isTempUnhidden) icon = iconTemp;
            else icon = iconEye;

            let label = '';
            if (isAttending) {
                label = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-900/50 text-green-300 uppercase tracking-wide ml-2 border border-green-700/50">
                    <svg class="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    Attending
                </span>`;
            }

            let itemClass = 'sibling-item flex items-center justify-between gap-2';
            if (isAttending) itemClass += ' text-green-200';
            else if (isEffectiveHidden) itemClass += ' text-gray-400';
            else if (isTempUnhidden) itemClass += ' text-blue-200';

            let currentChip = '';
            if (isCurrent) {
                currentChip = `<span class="text-[10px] bg-[#5C068C]/50 text-[#F3E8F5] px-1.5 py-0.5 rounded-full border border-[#5C068C]/50 dark:bg-[#5C068C]/50 dark:text-[#F3E8F5] dark:border-[#5C068C]/50">Viewing</span>`;
            }

            html += `<div class="${itemClass}">
                <div class="flex items-center flex-wrap gap-y-1">
                    <span class="flex items-center">${icon} ${sDateStr} @ ${fmt(sH, sM)}</span>
                    ${label}
                </div>
                ${currentChip}
            </div>`;
        });
        html += `</div>`;
    }

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';

    if (activeTooltipUid !== ev.uid) {
        activeTooltipUid = ev.uid;
        tooltipShowTime = Date.now();
    }

    const tipRect = tooltip.getBoundingClientRect();

    if (isModalOpen) {
        let left = e.clientX + 15;
        let top = e.clientY + 15;

        if (left + tipRect.width > window.innerWidth) left = e.clientX - tipRect.width - 10;
        if (top + tipRect.height > window.innerHeight) top = e.clientY - tipRect.height - 10;
        if (top < 10) top = 10;

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    } else {
        const rect = el.getBoundingClientRect();
        let left = rect.left - tipRect.width - 10;
        if (left < 10) {
            left = rect.right + 10;
        }
        let top = rect.top;
        if (top + tipRect.height > window.innerHeight) top = window.innerHeight - tipRect.height - 10;

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }
}

export function hideTooltip() {
    tooltip.style.display = 'none';
    activeTooltipUid = null;
    document.getElementById('schedule-grid').classList.remove('dim-mode');
    document.querySelectorAll('.is-sibling-highlight').forEach(el => el.classList.remove('is-sibling-highlight'));
}

export function confirmBlacklist(name) {
    document.getElementById('context-menu').style.display = 'none';
    const ctxOverlay = document.getElementById('context-menu-overlay');
    if (ctxOverlay) ctxOverlay.classList.remove('active');

    showConfirm(`Are you sure you want to blacklist "${name}"? This will permanently hide all occurrences of this event. You can restore it later from the Blacklist Manager.`, () => {
        state.blacklist.add(name);
        saveBlacklist();
        renderApp();
    }, "Blacklist Event");
}

// --- Mobile Event Modal ---

export function openMobileEventModal(ev, isHiddenPreview = false) {
    const modal = document.getElementById('mobile-event-modal');
    const titleEl = document.getElementById('mobile-modal-title');
    const contentEl = document.getElementById('mobile-modal-content');
    const btnToggle = document.getElementById('mobile-btn-toggle');
    const btnMenu = document.getElementById('mobile-btn-menu');

    titleEl.textContent = ev.name;

    // Build Content
    const dObj = new Date(ev.date + 'T00:00:00');
    const dateStr = dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const fmt = (h, m) => `${h === 12 || h === 0 ? 12 : h % 12}:${m.toString().padStart(2, '0')}${h >= 12 && h < 24 ? 'pm' : 'am'}`;
    const sH = Math.floor(ev.startMins / 60) % 24, sM = ev.startMins % 60;
    const eH = Math.floor(ev.endMins / 60) % 24, eM = ev.endMins % 60;

    let html = ``;

    if (ev.imageUrl) {
        html += `<img src="${ev.imageUrl}" class="w-full h-48 object-cover rounded-lg shadow-sm mb-4" onerror="this.style.display='none'" />`;
    }

    html += `<div class="space-y-3">
        <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <div>
                <div class="font-semibold text-gray-800">Time</div>
                <div class="text-gray-600">${dateStr}, ${fmt(sH, sM)} - ${fmt(eH, eM)}</div>
            </div>
        </div>
        <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            <div>
                <div class="font-semibold text-gray-800">Location</div>
                <div class="text-gray-600">${ev.location || 'Unknown'}</div>
            </div>
        </div>
    `;

    const myNote = state.eventNotes[ev.uid];
    if (myNote) {
        html += `<div class="p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm dark:bg-yellow-900/30 dark:border-yellow-700/50 dark:text-yellow-200">
            <strong>Note:</strong> ${myNote}
        </div>`;
    }

    if (ev.longDescription) {
        html += `<div class="pt-2 border-t border-gray-100">
            <div class="font-semibold text-gray-800 mb-1">Description</div>
            <p class="text-gray-600 text-sm leading-relaxed">${ev.longDescription}</p>
        </div>`;
    }

    // Add All Occurrences Section
    let allSiblings = [];
    state.appData.forEach(item => {
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
    state.customEvents.forEach(item => {
        if (item.name === ev.name) {
            allSiblings.push(item);
        }
    });

    if (allSiblings.length > 0) {
        html += `<div class="pt-2 border-t border-gray-100">
            <div class="font-semibold text-gray-800 mb-2">All Occurrences (${allSiblings.length})</div>
            <div class="space-y-1">`;

        const siblings = allSiblings.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.startMins - b.startMins;
        });

        siblings.forEach(sib => {
            const isAttending = state.attendingIds.has(sib.uid);
            const isSeriesHidden = state.hiddenNames.has(sib.name);
            const isInstanceHidden = state.hiddenUids.has(sib.uid);
            const isExplicitlyShown = state.shownUids.has(sib.uid);

            // Event is hidden if it's marked hidden AND NOT explicitly shown AND NOT attended
            const isHidden = (isSeriesHidden || isInstanceHidden) && !isExplicitlyShown && !isAttending;
            const isTempUnhidden = isHidden && state.showHiddenTemp;
            const isEffectiveHidden = isHidden && !state.showHiddenTemp;
            const isCurrent = sib.uid === ev.uid;

            const sDate = new Date(sib.date + 'T00:00:00');
            const sDateStr = sDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const sH = Math.floor(sib.startMins / 60) % 24, sM = sib.startMins % 60;

            let iconStatus = '';
            const iconEye = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-transparent mr-1"><svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg></span>`;
            const iconHidden = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-transparent mr-1"><svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg></span>`;
            const iconTemp = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 mr-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg></span>`;

            if (isEffectiveHidden) iconStatus = iconHidden;
            else if (isTempUnhidden) iconStatus = iconTemp;
            else iconStatus = iconEye;

            let content = `<div class="flex items-center flex-wrap gap-x-2">
                <span class="flex items-center whitespace-nowrap">${iconStatus} ${sDateStr} @ ${fmt(sH, sM)}</span>`;

            if (isAttending) {
                content += `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 dark:border dark:border-green-700/50 uppercase tracking-wide">
                    <svg class="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    Attending
                </span>`;
            }
            content += `</div>`;

            let itemClass = 'text-sm p-2 rounded flex items-center justify-between';
            if (isAttending) itemClass += ' text-green-700 font-medium';
            else if (isEffectiveHidden) itemClass += ' text-gray-400';
            else if (isTempUnhidden) itemClass += ' text-blue-600';
            else itemClass += ' text-gray-600';

            let clickAction = '';
            let cursorClass = '';
            let icon = '';

            if (!isHiddenPreview && !isEffectiveHidden) {
                if (isCurrent) {
                    icon = `<span class="text-[10px] bg-transparent text-[#7C08BD] px-1.5 py-0.5 rounded-full border border-[#7C08BD] dark:text-[#d8b4fe] dark:border-[#d8b4fe]">Viewing</span>`;
                } else {
                    const safeUid = sib.uid.replace(/'/g, "\\'");
                    clickAction = `onclick="closeMobileEventModal(); jumpToEvent('${safeUid}')"`;
                    cursorClass = 'cursor-pointer hover:bg-gray-50';
                    icon = `<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>`;
                }
            }

            html += `<div class="${itemClass} ${cursorClass}" ${clickAction}>
                <span>${content}</span>
                ${icon}
            </div>`;
        });
        html += `</div></div>`;
    }

    html += `</div>`;
    contentEl.innerHTML = html;

    // Configure Buttons
    // Check if this is a hidden event being temporarily shown
    const isTempHidden = ev.isHiddenTemp;

    if (isHiddenPreview || isTempHidden) {
        btnToggle.className = "flex-1 py-3 px-4 rounded font-bold text-gray-400 bg-gray-100 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-500 cursor-not-allowed flex justify-center items-center gap-2";
        btnToggle.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg> Hidden Event`;
        btnToggle.onclick = null;

        // For temp hidden events, we still want the menu to allow unhiding
        if (isTempHidden) {
            btnMenu.style.opacity = '1';
            btnMenu.style.pointerEvents = 'auto';
        } else {
            btnMenu.style.opacity = '1';
            btnMenu.style.pointerEvents = 'auto';
        }
    } else {
        btnMenu.style.opacity = '1';
        btnMenu.style.pointerEvents = 'auto';

        const isAttending = state.attendingIds.has(ev.uid);
        if (isAttending) {
            btnToggle.className = "flex-1 py-3 px-4 rounded font-bold transition-colors shadow-sm flex justify-center items-center gap-2 bg-[#F3E8F5] text-[#5C068C] border border-[#5C068C]/30 hover:bg-[#eaddf0] dark:bg-transparent dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700";
            btnToggle.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg> Remove from Agenda`;
            btnToggle.onclick = () => {
                document.getElementById('mobile-event-modal').style.display = 'none';
                toggleAttendance(ev.uid);
            };
        } else {
            btnToggle.className = "flex-1 py-3 px-4 rounded font-bold text-white transition-colors shadow-sm flex justify-center items-center gap-2 bg-[#AF231C] hover:bg-red-800";
            btnToggle.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg> Add to Agenda`;
            btnToggle.onclick = () => {
                document.getElementById('mobile-event-modal').style.display = 'none';
                toggleAttendance(ev.uid);
            };
        }
    }

    btnMenu.onclick = (e) => {
        e.stopPropagation(); // Prevent global click from closing it immediately
        // Position context menu near the button
        const rect = btnMenu.getBoundingClientRect();
        // Fake event for showContextMenu
        // Pass the button's top position so we can calculate upward expansion dynamically
        const fakeEvent = {
            clientX: rect.left - 160, // Shift left to keep on screen
            clientY: rect.top - 5, // Just above the button
            preventDefault: () => { },
            stopPropagation: () => { }
        };
        showContextMenu(fakeEvent, ev, isHiddenPreview);
    };

    modal.style.display = 'flex';
    state.activeMobileEventUid = (isHiddenPreview || isTempHidden) ? null : ev.uid; // Don't track active UID for hidden previews to prevent jump on close
}

export function closeMobileEventModal() {
    const modal = document.getElementById('mobile-event-modal');
    if (modal) {
        modal.style.display = 'none';
        state.activeMobileEventUid = null;
    }
}

export function openMobileEventModalFromHidden(name, specificUid = null) {
    // Find a representative event object
    let ev = state.appData.find(e => e.name === name) || state.customEvents.find(e => e.name === name);

    if (ev) {
        // If specific UID provided (instance), try to find exact match for time
        if (specificUid) {
            // Reconstruct time for specific instance if possible
            // But ev might be the generic one.
            // Let's try to find the exact instance in appData
            const exact = state.appData.find(e => {
                const timeData = parseTimeRange(e.timePeriod);
                if (!timeData) return false;
                const s = timeData.start + SHIFT_START_ADD;
                return `${e.date}_${e.name}_${s}` === specificUid;
            });
            if (exact) {
                const timeData = parseTimeRange(exact.timePeriod);
                const s = timeData.start + SHIFT_START_ADD;
                const e = timeData.end + SHIFT_END_ADD;
                ev = { ...exact, startMins: s, endMins: e, uid: specificUid };
            }
        } else {
            // Series view - just use the representative but ensure it has time props
            const timeData = parseTimeRange(ev.timePeriod);
            if (timeData) {
                const s = timeData.start + SHIFT_START_ADD;
                const e = timeData.end + SHIFT_END_ADD;
                ev = { ...ev, startMins: s, endMins: e, uid: 'hidden-series-preview' };
            }
        }
        openMobileEventModal(ev, true);
    }
}
