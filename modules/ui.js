import { state, saveData, savePortNote, saveEventNotes, saveBlacklist, saveHiddenNames, saveHiddenUids, saveShownUids, saveOptionalEvents, saveTimeBlocks } from './state.js';
import { STORAGE_KEY_BLACKLIST, STORAGE_KEY_PORT_NOTES, STORAGE_KEY_EVENT_NOTES, SHIFT_START_ADD, SHIFT_END_ADD, STORAGE_KEY_HIDDEN_UIDS, STORAGE_KEY_HIDDEN_NAMES, STORAGE_KEY_SHOWN_UIDS, STORAGE_KEY_OPTIONAL_EVENTS } from './constants.js';
import { renderApp } from './render.js';
import { parseTimeRange, formatTimeRange, escapeHtml } from './utils.js';
import {
    jumpToEvent, unhideSeries, unhideInstance, hideInstance, hideSeries,
    showFullTooltip, moveTooltip, hideTooltip, openMobileEventModal
} from './interactions.js';

// --- Modals ---

export function showGenericChoice(title, message, primaryLabel, onPrimary, secondaryLabel, onSecondary) {
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

export function showConfirm(msg, onYes, title = "Confirm") {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = msg;
    state.confirmCallback = onYes;
    document.getElementById('confirmation-modal').style.display = 'flex';
}



// --- Unhide Modal ---

export function openUnhideModal(ev) {
    const modal = document.getElementById('unhide-modal');
    const btnInstance = document.getElementById('btn-unhide-instance');
    const btnSeries = document.getElementById('btn-unhide-series');

    // Determine state
    const isSeriesHidden = state.hiddenNames.has(ev.name);
    const isInstanceHidden = state.hiddenUids.has(ev.uid);

    // Check if it's a single occurrence event
    let instanceCount = 0;
    if (ev.isCustom) {
        if (ev.seriesId) {
            instanceCount = state.customEvents.filter(c => c.seriesId === ev.seriesId).length;
        } else {
            instanceCount = 1;
        }
    } else {
        instanceCount = state.appData.filter(e => e.name === ev.name).length;
    }

    if (instanceCount === 1) {
        // Directly unhide without modal
        if (ev.isCustom) {
            if (state.hiddenNames.has(ev.name)) {
                state.hiddenNames.delete(ev.name);
                saveHiddenNames();
            }
            state.hiddenUids.delete(ev.uid);
            saveHiddenUids();
            renderApp();
        } else {
            unhideSeries(ev.name);
        }
        return;
    }

    // Configure buttons based on what's hidden
    if (isSeriesHidden) {
        btnSeries.style.display = 'inline-flex';
        btnSeries.textContent = "Unhide Entire Series";
        btnSeries.onclick = () => {
            if (ev.isCustom) {
                const siblings = state.customEvents.filter(c => c.seriesId === ev.seriesId);
                siblings.forEach(sib => state.hiddenUids.delete(sib.uid));
                saveHiddenUids();

                if (state.hiddenNames.has(ev.name)) {
                    state.hiddenNames.delete(ev.name);
                    saveHiddenNames();
                }

                const totalHidden = state.hiddenNames.size + state.hiddenUids.size;
                document.querySelectorAll('.hidden-count').forEach(el => el.textContent = totalHidden);
                renderApp();
            } else {
                unhideSeries(ev.name);
            }
            closeAllModals();
        };

        btnInstance.style.display = 'inline-flex';
        btnInstance.onclick = () => {
            state.shownUids.add(ev.uid);
            saveShownUids();

            if (state.hiddenUids.has(ev.uid)) {
                state.hiddenUids.delete(ev.uid);
                saveHiddenUids();
            }

            renderApp();
            closeAllModals();
        };

    } else if (isInstanceHidden) {
        btnSeries.style.display = 'inline-flex';
        btnSeries.textContent = "Unhide Entire Series (If any others hidden)";

        btnSeries.onclick = () => {
            if (ev.isCustom) {
                const siblings = state.customEvents.filter(c => c.seriesId === ev.seriesId);
                siblings.forEach(sib => state.hiddenUids.delete(sib.uid));
            } else {
                const allInstances = state.appData.filter(e => e.name === ev.name);
                allInstances.forEach(instance => {
                    const timeData = parseTimeRange(instance.timePeriod);
                    if (timeData) {
                        const s = timeData.start + SHIFT_START_ADD;
                        const uid = `${instance.date}_${instance.name}_${s}`;
                        state.hiddenUids.delete(uid);
                    }
                });
            }
            saveHiddenUids();

            const totalHidden = state.hiddenNames.size + state.hiddenUids.size;
            document.querySelectorAll('.hidden-count').forEach(el => el.textContent = totalHidden);
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

// --- Hidden Manager ---

export function switchHiddenTab(tab) {
    const container = document.getElementById('hidden-list-container');
    if (container) {
        state.hiddenTabScrollPositions[state.activeHiddenTab] = container.scrollTop;
    }
    state.activeHiddenTab = tab;
    renderHiddenContent();
    if (container) {
        container.scrollTop = state.hiddenTabScrollPositions[tab] || 0;
    }
}

export function openHiddenManager(keepTab = false) {
    if (!keepTab) {
        state.activeHiddenTab = 'series';
        state.hiddenTabScrollPositions = {};
    }
    renderHiddenContent();
    document.getElementById('hidden-manager-modal').style.display = 'flex';
    const container = document.getElementById('hidden-list-container');
    if (container) {
        container.scrollTop = state.hiddenTabScrollPositions[state.activeHiddenTab] || 0;
    }
}

export function renderHiddenContent() {
    const container = document.getElementById('hidden-list-container');
    container.innerHTML = '';

    const tabSeries = document.getElementById('tab-hidden-series');
    const tabPartial = document.getElementById('tab-hidden-partial');
    const tabInstances = document.getElementById('tab-hidden-instances');

    let fullyHiddenCount = 0;
    let partiallyHiddenCount = 0;

    state.hiddenNames.forEach(name => {
        let isVisibleAny = false;
        state.appData.forEach(ev => {
            if (ev.name === name) {
                const timeData = parseTimeRange(ev.timePeriod);
                if (timeData) {
                    const s = timeData.start + SHIFT_START_ADD;
                    const uid = `${ev.date}_${ev.name}_${s}`;
                    if (state.attendingIds.has(uid) || state.shownUids.has(uid)) isVisibleAny = true;
                }
            }
        });
        if (!isVisibleAny) {
            state.customEvents.forEach(ev => {
                if (ev.name === name) {
                    if (state.attendingIds.has(ev.uid) || state.shownUids.has(ev.uid)) isVisibleAny = true;
                }
            });
        }

        if (isVisibleAny) partiallyHiddenCount++;
        else fullyHiddenCount++;
    });

    const instanceCount = state.hiddenUids.size;

    tabSeries.textContent = `Hidden Series (${fullyHiddenCount})`;
    tabPartial.textContent = `Partially Hidden (${partiallyHiddenCount})`;
    tabInstances.textContent = `Instances (${instanceCount})`;

    tabSeries.classList.remove('tab-active');
    tabPartial.classList.remove('tab-active');
    tabInstances.classList.remove('tab-active');

    if (state.activeHiddenTab === 'series') {
        tabSeries.classList.add('tab-active');
        renderHiddenSeriesList(container, 'full');
    } else if (state.activeHiddenTab === 'partial') {
        tabPartial.classList.add('tab-active');
        renderHiddenSeriesList(container, 'partial');
    } else {
        tabInstances.classList.add('tab-active');
        renderHiddenInstances(container);
    }
}

export function restoreAllHidden(type) {
    if (!confirm('Are you sure you want to restore all events in this list?')) return;

    if (type === 'instances') {
        state.hiddenUids.clear();
        saveHiddenUids();
    } else {
        const namesToRemove = [];
        state.hiddenNames.forEach(name => {
            let isVisibleAny = false;
            state.appData.forEach(ev => {
                if (ev.name === name) {
                    const timeData = parseTimeRange(ev.timePeriod);
                    if (timeData) {
                        const s = timeData.start + SHIFT_START_ADD;
                        const uid = `${ev.date}_${ev.name}_${s}`;
                        if (state.attendingIds.has(uid) || state.shownUids.has(uid)) isVisibleAny = true;
                    }
                }
            });
            if (!isVisibleAny) {
                state.customEvents.forEach(ev => {
                    if (ev.name === name) {
                        if (state.attendingIds.has(ev.uid) || state.shownUids.has(ev.uid)) isVisibleAny = true;
                    }
                });
            }

            if (type === 'partial' && isVisibleAny) namesToRemove.push(name);
            if (type === 'full' && !isVisibleAny) namesToRemove.push(name);
        });

        namesToRemove.forEach(name => state.hiddenNames.delete(name));
        saveHiddenNames();
    }

    const totalHidden = state.hiddenNames.size + state.hiddenUids.size;
    document.querySelectorAll('.hidden-count').forEach(el => el.textContent = totalHidden);
    renderApp();
    renderHiddenContent();
}

export function renderHiddenSeriesList(container, type) {
    const seriesList = [];
    state.hiddenNames.forEach(name => {
        let isVisibleAny = false;
        state.appData.forEach(ev => {
            if (ev.name === name) {
                const timeData = parseTimeRange(ev.timePeriod);
                if (timeData) {
                    const s = timeData.start + SHIFT_START_ADD;
                    const uid = `${ev.date}_${ev.name}_${s}`;
                    if (state.attendingIds.has(uid) || state.shownUids.has(uid)) isVisibleAny = true;
                }
            }
        });
        if (!isVisibleAny) {
            state.customEvents.forEach(ev => {
                if (ev.name === name) {
                    if (state.attendingIds.has(ev.uid) || state.shownUids.has(ev.uid)) isVisibleAny = true;
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

    const restoreBtn = document.createElement('button');
    restoreBtn.className = "w-full mb-4 py-2 bg-[#F3E8F5] text-[#5C068C] font-semibold rounded hover:bg-[#eaddf0] transition text-sm dark:bg-[#5C068C] dark:text-white dark:hover:bg-[#4a0470]";
    restoreBtn.textContent = `Restore All (${seriesList.length})`;
    restoreBtn.onclick = () => restoreAllHidden(type);
    container.appendChild(restoreBtn);

    const sortedSeries = seriesList.map(name => {
        const firstEvent = state.appData.find(e => e.name === name);
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

        let total = 0;
        let attending = 0;
        let explicitlyShown = 0;

        state.appData.forEach(ev => {
            if (ev.name === name) {
                total++;
                const timeData = parseTimeRange(ev.timePeriod);
                if (timeData) {
                    const s = timeData.start + SHIFT_START_ADD;
                    const uid = `${ev.date}_${ev.name}_${s}`;
                    if (state.attendingIds.has(uid)) attending++;
                    else if (state.shownUids.has(uid)) explicitlyShown++;
                }
            }
        });

        state.customEvents.forEach(ev => {
            if (ev.name === name) {
                total++;
                if (state.attendingIds.has(ev.uid)) attending++;
                else if (state.shownUids.has(ev.uid)) explicitlyShown++;
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

        const repEvent = state.appData.find(e => e.name === name);
        if (repEvent) {
            const timeData = parseTimeRange(repEvent.timePeriod);
            if (timeData) {
                const s = timeData.start + SHIFT_START_ADD;
                const e = timeData.end + SHIFT_END_ADD;
                const tooltipEvent = { ...repEvent, startMins: s, endMins: e, uid: 'hidden-series-preview' };
                row.onmouseenter = (e) => {
                    if (window.innerWidth > 768) showFullTooltip(e, tooltipEvent, row);
                };
                row.onmousemove = moveTooltip;
                row.onmouseleave = () => { tooltip.style.display = 'none'; };
            }
        }

        row.innerHTML = `<span class="font-medium text-gray-800 text-sm truncate pr-4 cursor-pointer flex-1" onclick="if(window.innerWidth <= 768) openMobileEventModalFromHidden('${name}')">${name}${countText}</span>
<button class="text-xs bg-[#F3E8F5] text-[#5C068C] px-3 py-1 rounded hover:bg-[#eaddf0] font-semibold restore-series-btn dark:bg-[#5C068C] dark:text-white dark:hover:bg-[#4a0470]">Restore</button>`;

        row.querySelector('.restore-series-btn').onclick = (e) => { e.stopPropagation(); unhideSeries(name, true); };
        container.appendChild(row);
    });
}

export function renderHiddenInstances(container) {
    if (state.hiddenUids.size === 0) {
        container.innerHTML = `<div class="text-center text-gray-400 py-8 italic">No single instances are currently hidden.</div>`;
        return;
    }

    const restoreBtn = document.createElement('button');
    restoreBtn.className = "w-full mb-4 py-2 bg-[#F3E8F5] text-[#5C068C] font-semibold rounded hover:bg-[#eaddf0] transition text-sm dark:bg-[#5C068C] dark:text-white dark:hover:bg-[#4a0470]";
    restoreBtn.textContent = `Restore All (${state.hiddenUids.size})`;
    restoreBtn.onclick = () => restoreAllHidden('instances');
    container.appendChild(restoreBtn);

    const section = document.createElement('div');

    const hiddenInstanceData = [];
    const allSourceEvents = [...state.appData];

    allSourceEvents.forEach(ev => {
        const timeData = parseTimeRange(ev.timePeriod);
        if (!timeData) return;
        const s = timeData.start + SHIFT_START_ADD;
        const uid = `${ev.date}_${ev.name}_${s}`;
        if (state.hiddenUids.has(uid)) hiddenInstanceData.push({ ...ev, uid, s });
    });

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

        row.onmouseenter = (e) => {
            if (window.innerWidth > 768) showFullTooltip(e, ev, row);
        };
        row.onmousemove = moveTooltip;
        row.onmouseleave = () => { tooltip.style.display = 'none'; };

        row.innerHTML = `<div class="flex flex-col overflow-hidden pr-4 cursor-pointer flex-1" onclick="if(window.innerWidth <= 768) openMobileEventModalFromHidden('${ev.name}', '${ev.uid}')">
                <span class="font-medium text-gray-800 text-sm truncate">${ev.name}</span>
                <span class="text-xs text-gray-500">${dateStr} @ ${timeStr}</span>
            </div>
            <button class="text-xs bg-[#F3E8F5] text-[#5C068C] px-3 py-1 rounded hover:bg-[#eaddf0] font-semibold flex-shrink-0 restore-instance-btn dark:bg-[#5C068C] dark:text-white dark:hover:bg-[#4a0470]">Restore</button>`;

        row.querySelector('.restore-instance-btn').onclick = (e) => { e.stopPropagation(); unhideInstance(ev.uid, true); };
        section.appendChild(row);
    });
    container.appendChild(section);
}

// --- Notes ---

export function editPortNote(date, event) {
    if (event) event.stopPropagation();
    state.currentPortNoteDate = date;
    const current = state.portNotes[date] || '';
    document.getElementById('port-note-input').value = current;
    document.getElementById('port-note-modal').style.display = 'flex';
    const inputEl = document.getElementById('port-note-input');
    inputEl.focus();
    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') savePortNoteUI();
    };
}

export function savePortNoteUI() {
    if (!state.currentPortNoteDate) return;
    const input = document.getElementById('port-note-input').value;

    if (input.trim() === '') delete state.portNotes[state.currentPortNoteDate];
    else state.portNotes[state.currentPortNoteDate] = input.trim();

    savePortNote();
    renderApp();
    closeAllModals();
}

export function editEventNote(uid) {
    state.currentEventNoteUid = uid;
    const current = state.eventNotes[uid] || '';
    document.getElementById('event-note-input').value = current;
    document.getElementById('event-note-modal').style.display = 'flex';
    const inputEl = document.getElementById('event-note-input');
    inputEl.focus();
    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') saveEventNoteUI();
    };
}

export function closeEventNoteModal() {
    // Check if we are on mobile and the mobile event modal is open
    const mobileModal = document.getElementById('mobile-event-modal');
    if (window.innerWidth <= 768 && mobileModal.style.display === 'flex') {
        // Only close the note modal
        document.getElementById('event-note-modal').style.display = 'none';
    } else {
        closeAllModals();
    }
}

export function saveEventNoteUI() {
    if (!state.currentEventNoteUid) return;
    const input = document.getElementById('event-note-input').value;

    if (input.trim() === '') delete state.eventNotes[state.currentEventNoteUid];
    else state.eventNotes[state.currentEventNoteUid] = input.trim();

    saveEventNotes();
    renderApp();

    // Check if we are on mobile and the mobile event modal is open
    const mobileModal = document.getElementById('mobile-event-modal');
    if (window.innerWidth <= 768 && mobileModal.style.display === 'flex') {
        // Only close the note modal
        document.getElementById('event-note-modal').style.display = 'none';

        // Re-render the mobile modal content to show the new note
        // We need to find the event object again
        const uid = state.currentEventNoteUid;
        let ev = null;

        // Try to find in appData
        const appEvent = state.appData.find(e => {
            const timeData = parseTimeRange(e.timePeriod);
            if (!timeData) return false;
            const s = timeData.start + SHIFT_START_ADD;
            return `${e.date}_${e.name}_${s}` === uid;
        });

        if (appEvent) {
            const timeData = parseTimeRange(appEvent.timePeriod);
            if (timeData) {
                const s = timeData.start + SHIFT_START_ADD;
                const e = timeData.end + SHIFT_END_ADD;
                ev = { ...appEvent, startMins: s, endMins: e, uid: uid };
            }
        } else {
            // Try custom events
            ev = state.customEvents.find(e => e.uid === uid);
        }

        if (ev) {
            // Refresh the mobile modal to show the new note
            // Determine if it was a hidden preview
            const btnToggle = document.getElementById('mobile-btn-toggle');
            const isHiddenPreview = btnToggle && btnToggle.classList.contains('cursor-not-allowed');

            openMobileEventModal(ev, isHiddenPreview);
        }
    } else {
        closeAllModals();
    }
}

// --- Attendance Panel ---

export function toggleMenu() {
    const menu = document.getElementById('dropdown-menu');
    menu.classList.toggle('hidden');
}

export function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.style.display = 'none');
    document.getElementById('context-menu').style.display = 'none';

    state.currentCtxEvent = null;
    state.initialFormState = null;

    const ctxOverlay = document.getElementById('context-menu-overlay');
    if (ctxOverlay) ctxOverlay.classList.remove('active');

    document.getElementById('dropdown-menu').classList.add('hidden');

    // Close mobile event modal
    closeMobileEventModal();
}

export function toggleAttendancePanel() {
    const ctxOverlay = document.getElementById('context-menu-overlay');
    if (ctxOverlay) ctxOverlay.classList.remove('active');

    const menuOverlay = document.getElementById('menu-overlay');
    if (menuOverlay) menuOverlay.classList.remove('active');
    document.getElementById('dropdown-menu').classList.add('hidden');

    // Close mobile event modal
    closeMobileEventModal();
    const panel = document.getElementById('attendance-panel');
    const isOpen = panel.classList.contains('open');

    if (isOpen) {
        // Save current scroll position before closing
        const content = document.getElementById('attendance-panel-content');
        if (content) {
            state.attendancePanelScrollPositions[state.activePanelTab] = content.scrollTop;
        }
        panel.classList.remove('open');
    } else {
        // Initialize scroll positions object if it doesn't exist
        if (!state.attendancePanelScrollPositions) {
            state.attendancePanelScrollPositions = {};
        }
        updateAttendancePanel();
        panel.classList.add('open');
        // Restore the saved scroll position for the active tab
        const content = document.getElementById('attendance-panel-content');
        if (content) {
            content.scrollTop = state.attendancePanelScrollPositions[state.activePanelTab] || 0;
        }
    }
}

export function switchAttendanceTab(tab) {
    const content = document.getElementById('attendance-panel-content');
    if (content) {
        state.attendancePanelScrollPositions[state.activePanelTab] = content.scrollTop;
    }
    state.activePanelTab = tab;
    updateAttendancePanel();
    if (content) {
        content.scrollTop = state.attendancePanelScrollPositions[tab] || 0;
    }
}

export function toggleOptionalEvent(eventName) {
    if (state.optionalEvents.has(eventName)) {
        state.optionalEvents.delete(eventName);
    } else {
        state.optionalEvents.add(eventName);
    }
    saveOptionalEvents();
    renderApp();
    updateAttendancePanel();
}

export function updateAttendancePanel() {
    const { missing, optional } = getMissingEvents();
    const content = document.getElementById('attendance-panel-content');
    const countBadges = document.querySelectorAll('.missing-count');
    const tabRequired = document.getElementById('tab-required');
    const tabOptional = document.getElementById('tab-optional');

    countBadges.forEach(el => el.textContent = missing.length);

    if (state.activePanelTab === 'required') {
        tabRequired.classList.add('tab-active');
        tabOptional.classList.remove('tab-active');
    } else {
        tabRequired.classList.remove('tab-active');
        tabOptional.classList.add('tab-active');
    }

    tabRequired.textContent = `Required (${missing.length})`;
    tabOptional.textContent = `Optional (${optional.length})`;

    const eventsToShow = state.activePanelTab === 'required' ? missing : optional;

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

    const renderGroup = (eventGroup) => {
        const isOptional = state.optionalEvents.has(eventGroup.name);
        const safeName = eventGroup.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const toggleHtml = `
            <button class="ml-2 px-2 py-1 text-xs font-medium rounded border transition-colors focus:outline-none flex justify-center items-center flex-shrink-0 w-[90px] whitespace-nowrap ${isOptional ? 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50 hover:text-gray-700'}" title="${isOptional ? 'Mark as Required' : 'Mark as Optional'}" onclick="window.toggleOptionalEvent('${safeName}')">
                ${isOptional ? 'Mark Required' : 'Mark Optional'}
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
                <div class="missing-event-instance ${hasConflict ? 'has-conflict' : ''}" onclick="window.jumpToEventFromPanel('${safeUid}')">
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

export function getMissingEvents() {
    const eventsByName = new Map();

    state.appData.forEach(ev => {
        if (state.blacklist.has(ev.name)) return;
        if (state.hiddenNames.has(ev.name)) return;

        const timeData = parseTimeRange(ev.timePeriod);
        if (!timeData) return;

        const s = timeData.start + SHIFT_START_ADD;
        const e = timeData.end + SHIFT_END_ADD;
        const uid = `${ev.date}_${ev.name}_${s}`;

        if (state.hiddenUids.has(uid)) return;

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

    state.customEvents.forEach(ev => {
        if (state.blacklist.has(ev.name)) return;
        if (state.hiddenNames.has(ev.name)) return;
        if (state.hiddenUids.has(ev.uid)) return;

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

    const attendedEventsByDate = new Map();

    state.attendingIds.forEach(uid => {
        const ev = state.eventLookup.get(uid);
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

    const missingEvents = [];

    eventsByName.forEach((instances, name) => {
        const hasAttendedInstance = instances.some(instance => state.attendingIds.has(instance.uid));

        if (!hasAttendedInstance) {
            instances.sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.startMins - b.startMins;
            });

            instances.forEach(instance => {
                const attendedOnDate = attendedEventsByDate.get(instance.date) || [];
                const conflicts = attendedOnDate.filter(attended => {
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

    missingEvents.sort((a, b) => {
        if (a.firstInstanceDate !== b.firstInstanceDate) {
            return a.firstInstanceDate.localeCompare(b.firstInstanceDate);
        }
        return a.firstInstanceTime - b.firstInstanceTime;
    });

    const missing = [];
    const optional = [];

    missingEvents.forEach(group => {
        const isOptional = state.optionalEvents.has(group.name);
        if (isOptional) optional.push(group);
        else missing.push(group);
    });

    return { missing, optional };
}

// --- PWA Install Prompt ---

let deferredPrompt;

export function initInstallPrompt() {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return; // Already installed
    }

    // Check if dismissed previously
    if (localStorage.getItem('vv-install-dismissed')) {
        return;
    }

    const banner = document.getElementById('install-banner');
    const btnInstall = document.getElementById('btn-install-app');
    const btnDismiss = document.getElementById('btn-install-dismiss');

    // Android / Desktop (Chrome)
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;

        // Show the banner
        showInstallBanner();
    });

    // iOS Detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
        // iOS doesn't support beforeinstallprompt, so we just show the banner if not standalone
        // However, we should be careful not to show it if they are just browsing.
        // Maybe wait a bit or check if they are visiting frequently?
        // For now, let's show it after a short delay to not be intrusive immediately on load
        setTimeout(() => {
            showInstallBanner();
        }, 3000);
    }

    if (btnInstall) {
        btnInstall.addEventListener('click', async () => {
            if (deferredPrompt) {
                // Android/Desktop
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);
                deferredPrompt = null;
                hideInstallBanner();
            } else if (isIOS) {
                // iOS - Show instructions
                document.getElementById('ios-install-modal').style.display = 'flex';
                hideInstallBanner();
            }
        });
    }

    if (btnDismiss) {
        btnDismiss.addEventListener('click', () => {
            hideInstallBanner();
            localStorage.setItem('vv-install-dismissed', 'true');
        });
    }
}

function showInstallBanner() {
    const banner = document.getElementById('install-banner');
    if (banner) {
        banner.classList.remove('hidden');
        banner.style.display = 'flex'; // Ensure flex layout
        // Small delay to allow display:flex to apply before transition
        requestAnimationFrame(() => {
            banner.classList.remove('translate-y-full');
        });
    }
}

function hideInstallBanner() {
    const banner = document.getElementById('install-banner');
    if (banner) {
        banner.classList.add('translate-y-full');
        setTimeout(() => {
            banner.classList.add('hidden');
            banner.style.display = 'none';
        }, 300); // Match transition duration
    }
}

export function jumpToEventFromPanel(uid) {
    const el = document.getElementById(`card-${uid}`);
    if (!el) {
        jumpToEvent(uid);
        return;
    }

    const panel = document.getElementById('attendance-panel');
    const isPanelOpen = panel && panel.classList.contains('open');

    if (isPanelOpen) {
        if (window.innerWidth <= 768) {
            toggleAttendancePanel();
            setTimeout(() => jumpToEvent(uid), 100);
            return;
        }

        const viewport = document.getElementById('schedule-viewport');
        const grid = document.getElementById('schedule-grid');

        const elementRect = el.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();

        const eventLeftInGrid = elementRect.left - gridRect.left + viewport.scrollLeft;
        const gridWidth = grid.scrollWidth;

        const distanceFromRightEdge = gridWidth - eventLeftInGrid;
        const panelWidth = 400;
        const threshold = panelWidth * 1.0;

        if (distanceFromRightEdge < threshold) {
            toggleAttendancePanel();
            setTimeout(() => jumpToEvent(uid), 100);
        } else {
            jumpToEvent(uid);
        }
    } else {
        jumpToEvent(uid);
    }
}

// --- Blacklist ---

export function openBlacklistModal() {
    document.getElementById('blacklist-input').value = Array.from(state.blacklist).join('\n');
    document.getElementById('blacklist-modal').style.display = 'flex';
    document.getElementById('dropdown-menu').style.display = 'none';
}

export function saveBlacklistUI() {
    const text = document.getElementById('blacklist-input').value;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    state.blacklist = new Set(lines);
    saveBlacklist();
    closeAllModals();
    renderApp();
}

export function toggleShowHiddenTemp() {
    state.showHiddenTemp = !state.showHiddenTemp;
    const btns = document.querySelectorAll('.btn-toggle-hidden');
    btns.forEach(btn => {
        // Toggle visual state for the icon button
        if (state.showHiddenTemp) {
            btn.classList.add('text-blue-600', 'bg-blue-50');
            btn.classList.remove('text-gray-400');
        } else {
            btn.classList.remove('text-blue-600', 'bg-blue-50');
            btn.classList.add('text-gray-400');
        }
    });
    renderApp();
}

// --- Time Blocks ---

export function openTimeBlocksModal() {
    const modal = document.getElementById('time-blocks-modal');
    const cbEnabled = document.getElementById('tb-enabled');
    const selects = {
        morning: document.getElementById('tb-morning'),
        lunch: document.getElementById('tb-lunch'),
        afternoon: document.getElementById('tb-afternoon'),
        dinner: document.getElementById('tb-dinner'),
        evening: document.getElementById('tb-evening')
    };

    // Set enabled state
    cbEnabled.checked = state.timeBlocks.enabled !== false; // Default true

    // Toggle inputs
    const toggleInputs = () => {
        Object.values(selects).forEach(el => el.disabled = !cbEnabled.checked);
    };
    cbEnabled.onchange = toggleInputs;
    toggleInputs();

    // Populate options (5 AM to 28 AM/4 AM next day)
    const options = [];
    for (let h = 5; h <= 28; h++) {
        const displayH = h >= 24 ? h - 24 : h;
        const ampm = displayH >= 12 ? 'PM' : 'AM';
        const labelH = displayH > 12 ? displayH - 12 : (displayH === 0 || displayH === 24 ? 12 : displayH);
        const label = `${labelH}:00 ${ampm}`;
        options.push({ value: h, label });

        // Add half hour
        const label30 = `${labelH}:30 ${ampm}`;
        options.push({ value: h + 0.5, label: label30 });
    }

    Object.keys(selects).forEach(key => {
        const sel = selects[key];
        sel.innerHTML = options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
        sel.value = state.timeBlocks[key];
    });

    document.getElementById('dropdown-menu').style.display = 'none';
    modal.style.display = 'flex';
}

export function saveTimeBlocksUI() {
    const newBlocks = {
        enabled: document.getElementById('tb-enabled').checked,
        morning: parseFloat(document.getElementById('tb-morning').value),
        lunch: parseFloat(document.getElementById('tb-lunch').value),
        afternoon: parseFloat(document.getElementById('tb-afternoon').value),
        dinner: parseFloat(document.getElementById('tb-dinner').value),
        evening: parseFloat(document.getElementById('tb-evening').value)
    };

    // Validate order
    if (newBlocks.morning >= newBlocks.lunch ||
        newBlocks.lunch >= newBlocks.afternoon ||
        newBlocks.afternoon >= newBlocks.dinner ||
        newBlocks.dinner >= newBlocks.evening) {
        alert("Time blocks must be in chronological order.");
        return;
    }

    state.timeBlocks = newBlocks;
    saveTimeBlocks();
    renderApp();
    closeAllModals();
}
