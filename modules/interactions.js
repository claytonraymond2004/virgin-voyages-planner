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

export function showContextMenu(e, ev) {
    const ctxMenu = document.getElementById('context-menu');
    ctxMenu.style.display = 'block';
    let x = e.clientX, y = e.clientY;
    if (x + 200 > window.innerWidth) x -= 200;
    if (y + 200 > window.innerHeight) y -= 200;
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;

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
        btnDelete.onclick = (e) => { e.stopPropagation(); deleteCustomEvent(ev.uid); ctxMenu.style.display = 'none'; }
        btnEdit.onclick = (e) => { e.stopPropagation(); ctxMenu.style.display = 'none'; initiateEdit(ev); }
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
            ctxMenu.style.display = 'none';
        };

        btnGoogle.onclick = (e) => {
            e.stopPropagation();
            window.open('https://www.google.com/search?q=' + encodeURIComponent(ev.name), '_blank');
            ctxMenu.style.display = 'none';
        };
    }

    // Optional Logic
    const isOptional = state.optionalEvents.has(ev.name);
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
        tooltip.style.zIndex = '6000';
    } else {
        tooltip.style.zIndex = '2000';

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
            <div class="font-bold mb-1 text-white">All Occurrences:</div>`;

        const siblings = allSiblings
            .sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.startMins - b.startMins;
            });

        siblings.forEach(sib => {
            const isAttending = state.attendingIds.has(sib.uid);
            const sDate = new Date(sib.date + 'T00:00:00');
            const sDateStr = sDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const sH = Math.floor(sib.startMins / 60) % 24, sM = sib.startMins % 60;
            const attendingLabel = isAttending ? ' <span class="text-green-400 font-bold ml-1">(Attending)</span>' : '';
            const itemClass = isAttending ? 'sibling-item text-green-200' : 'sibling-item';

            html += `<div class="${itemClass}">• ${sDateStr} @ ${fmt(sH, sM)}${attendingLabel}</div>`;
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
    showConfirm(`Are you sure you want to blacklist "${name}"? This will permanently hide all occurrences of this event. You can restore it later from the Blacklist Manager.`, () => {
        state.blacklist.add(name);
        saveBlacklist();
        renderApp();
    }, "Blacklist Event");
}
