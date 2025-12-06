import { state, saveData, saveAttendance, savePortNote, saveEventNotes, saveBlacklist, saveHiddenNames, saveHiddenUids, saveShownUids, saveOptionalEvents, saveTimeBlocks, saveCompletedIds } from './state.js';
import { STORAGE_KEY_BLACKLIST, STORAGE_KEY_PORT_NOTES, STORAGE_KEY_EVENT_NOTES, SHIFT_START_ADD, SHIFT_END_ADD, STORAGE_KEY_HIDDEN_UIDS, STORAGE_KEY_HIDDEN_NAMES, STORAGE_KEY_SHOWN_UIDS, STORAGE_KEY_OPTIONAL_EVENTS } from './constants.js';
import { renderApp } from './render.js';
import { parseTimeRange, formatTimeRange, escapeHtml, scanFiles } from './utils.js';
import {
    jumpToEvent, unhideSeries, unhideInstance, hideInstance, hideSeries,
    showFullTooltip, moveTooltip, hideTooltip, openMobileEventModal
} from './interactions.js';
import { initSmartScheduler, initRescheduleWizard } from './smartScheduler.js';
import { refreshUpdateCheck } from './main.js';

// --- Modals ---

let updateStateSnapshot = null;

export function showGenericChoice(title, message, primaryLabel, onPrimary, secondaryLabel, onSecondary) {
    document.getElementById('generic-choice-title').textContent = title;

    // Support HTML content if message starts with specific tag or just always use innerHTML?
    // Using innerHTML is flexible but risks XSS if user input is not escaped.
    // The message here comes from internal logic, so it's relatively safe.
    // Let's assume standard use of innerHTML is fine for this helper.
    document.getElementById('generic-choice-message').innerHTML = message.replace(/\n/g, '<br>');

    const btnPrimary = document.getElementById('btn-generic-primary');
    btnPrimary.textContent = primaryLabel;
    btnPrimary.onclick = () => {
        document.getElementById('generic-choice-modal').style.display = 'none';
        if (onPrimary) onPrimary();
    };

    const btnSecondary = document.getElementById('btn-generic-secondary');
    if (secondaryLabel) {
        btnSecondary.style.display = 'inline-flex'; // Restore display
        btnSecondary.textContent = secondaryLabel;
        btnSecondary.onclick = () => {
            document.getElementById('generic-choice-modal').style.display = 'none';
            if (onSecondary) onSecondary();
        };
    } else {
        btnSecondary.style.display = 'none';
    }

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



export function showToast(message, type = 'info') {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded shadow-lg text-white text-sm font-medium z-[10000] transition-opacity duration-300 opacity-0 pointer-events-none';
        document.body.appendChild(toast);
    }

    // Set colors based on type
    if (type === 'error') {
        toast.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded shadow-lg text-white text-sm font-medium z-[10000] transition-opacity duration-300 opacity-0 pointer-events-none bg-red-600';
    } else if (type === 'success') {
        toast.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded shadow-lg text-white text-sm font-medium z-[10000] transition-opacity duration-300 opacity-0 pointer-events-none bg-green-600';
    } else {
        toast.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded shadow-lg text-white text-sm font-medium z-[10000] transition-opacity duration-300 opacity-0 pointer-events-none bg-gray-800';
    }

    toast.textContent = message;

    // Show
    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0');
        toast.classList.remove('pointer-events-none');
    });

    // Hide after 3s
    setTimeout(() => {
        toast.classList.add('opacity-0');
        toast.classList.add('pointer-events-none');
    }, 3000);
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
    menu.classList.toggle('open');
}

export function openSmartScheduler(skipIntro = false) {
    initSmartScheduler(skipIntro);
    document.getElementById('dropdown-menu').classList.remove('open');
}

export function closeAllModals() {
    // Check if update modal is open and cancel it properly
    const updateModal = document.getElementById('update-agenda-modal');
    if (updateModal && updateModal.style.display === 'flex') {
        cancelUpdateAgenda();
        return; // cancelUpdateAgenda calls closeAllModals again after cleanup, or handles closing itself
    }

    document.querySelectorAll('.modal-overlay').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.mobile-panel').forEach(el => el.classList.remove('open'));
    document.getElementById('context-menu').style.display = 'none';
    document.getElementById('context-menu-overlay').classList.remove('active');

    // Also close wizard if open
    const wizard = document.getElementById('smart-scheduler-modal');
    if (wizard) {
        if (window.closeSmartSchedulerWizard) {
            window.closeSmartSchedulerWizard();
        } else {
            wizard.remove();
        }
    }

    state.currentCtxEvent = null;
    state.initialFormState = null;

    document.getElementById('dropdown-menu').classList.remove('open');

    // Close mobile event modal
    closeMobileEventModal();
}

export function cancelUpdateAgenda() {
    if (updateStateSnapshot) {
        // Restore state
        state.attendingIds = new Set(updateStateSnapshot.attendingIds);
        state.hiddenNames = new Set(updateStateSnapshot.hiddenNames);
        state.hiddenUids = new Set(updateStateSnapshot.hiddenUids);

        saveAttendance();
        saveHiddenNames();
        saveHiddenUids();
        renderApp();

        updateStateSnapshot = null;
    }

    // Hide modal manually to avoid infinite recursion if we called closeAllModals
    document.getElementById('update-agenda-modal').style.display = 'none';

    // Also ensure other things are closed
    document.querySelectorAll('.modal-overlay').forEach(el => {
        if (el.id !== 'update-agenda-modal') el.style.display = 'none';
    });
    document.querySelectorAll('.mobile-panel').forEach(el => el.classList.remove('open'));
    document.getElementById('context-menu').style.display = 'none';
    document.getElementById('context-menu-overlay').classList.remove('active');

    // Also close wizard if open
    const wizard = document.getElementById('smart-scheduler-modal');
    if (wizard) wizard.remove();

    state.currentCtxEvent = null;
    state.initialFormState = null;

    document.getElementById('dropdown-menu').classList.remove('open');

    // Close mobile event modal
    closeMobileEventModal();
}

export function openAttendancePanel(tab) {
    const panel = document.getElementById('attendance-panel');
    if (!panel.classList.contains('open')) {
        toggleAttendancePanel();
    }
    if (tab) {
        switchAttendanceTab(tab);
    }
}

export function toggleAttendancePanel() {
    const ctxOverlay = document.getElementById('context-menu-overlay');
    if (ctxOverlay) ctxOverlay.classList.remove('active');

    const menuOverlay = document.getElementById('menu-overlay');
    if (menuOverlay) menuOverlay.classList.remove('active');
    document.getElementById('dropdown-menu').classList.remove('open');

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
        if (!eventGroup || !eventGroup.name) return '';
        const isOptional = state.optionalEvents.has(eventGroup.name);
        const safeName = eventGroup.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const toggleHtml = `
            <button class="ml-2 px-2 py-1 text-xs font-medium rounded border transition-colors focus:outline-none flex justify-center items-center flex-shrink-0 w-[90px] whitespace-nowrap ${isOptional ? 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50 hover:text-gray-700'}" title="${isOptional ? 'Mark as Required' : 'Mark as Optional'}" onclick="event.stopPropagation(); window.toggleOptionalEvent('${safeName}')">
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

// --- Agenda Panel ---

export function toggleAgendaPanel() {
    const ctxOverlay = document.getElementById('context-menu-overlay');
    if (ctxOverlay) ctxOverlay.classList.remove('active');

    const menuOverlay = document.getElementById('menu-overlay');
    if (menuOverlay) menuOverlay.classList.remove('active');
    document.getElementById('dropdown-menu').classList.remove('open');

    // Close mobile event modal
    closeMobileEventModal();

    // Close Attendance Panel if open
    const attendancePanel = document.getElementById('attendance-panel');
    if (attendancePanel && attendancePanel.classList.contains('open')) {
        toggleAttendancePanel();
    }

    const panel = document.getElementById('agenda-panel');
    const isOpen = panel.classList.contains('open');

    if (isOpen) {
        panel.classList.remove('open');
    } else {
        // Reset state for new session
        state.agendaHasUserScrolled = false;
        state.agendaIsAutoScrolling = false;

        updateAgendaPanel();
        panel.classList.add('open');

        const content = document.getElementById('agenda-panel-content');
        if (content) {
            content.onscroll = () => {
                state.agendaPanelScrollPosition = content.scrollTop;
                if (!state.agendaIsAutoScrolling) {
                    state.agendaHasUserScrolled = true;
                }
            };
        }
    }
}

export function updateAgendaPanel() {
    const content = document.getElementById('agenda-panel-content');
    content.innerHTML = ''; // Clear

    // Current Time Calculation
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const currentDateStr = `${year}-${month}-${day}`;
    const currentMins = (now.getHours() * 60) + now.getMinutes();

    // Get all attending events
    const events = [];
    state.attendingIds.forEach(uid => {
        const ev = state.eventLookup.get(uid);
        if (ev) events.push(ev);
    });

    if (events.length === 0) {
        content.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
                <p class="font-semibold">Your agenda is empty.</p>
                <p class="text-sm mt-2">Mark events as attending to see them here.</p>
            </div>
        `;
        return;
    }

    // Sort by Date then Time
    events.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.startMins ?? a.startMinutes) - (b.startMins ?? b.startMinutes);
    });

    // Group by Date
    const byDay = {};
    events.forEach(ev => {
        if (!byDay[ev.date]) byDay[ev.date] = [];
        byDay[ev.date].push(ev);
    });

    Object.keys(byDay).sort().forEach(date => {
        const dayEvents = byDay[date];

        // Date Header
        const dateObj = new Date(date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        const dayContainer = document.createElement('div');
        dayContainer.className = 'mb-6';

        const header = document.createElement('h4');
        header.className = 'font-bold text-gray-800 border-b border-gray-200 px-6 py-3 sticky top-0 bg-white z-10 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700';
        header.textContent = dateStr;
        dayContainer.appendChild(header);

        const list = document.createElement('div');
        list.className = 'space-y-3 px-6 pt-3';

        dayEvents.forEach(ev => {
            const start = ev.startMins ?? ev.startMinutes;
            const end = ev.endMins ?? ev.endMinutes;
            const timeStr = formatTimeRange(start, end);
            const location = ev.location ? ev.location : '';
            const isOptional = state.optionalEvents.has(ev.name);

            // Check Conflicts
            const conflicts = [];
            state.attendingIds.forEach(otherUid => {
                if (otherUid === ev.uid) return;
                const other = state.eventLookup.get(otherUid);
                if (other && other.date === ev.date) {
                    const otherStart = other.startMins ?? other.startMinutes;
                    const otherEnd = other.endMins ?? other.endMinutes;
                    if (start < otherEnd && end > otherStart) {
                        conflicts.push(other.name);
                    }
                }
            });

            const card = document.createElement('div');
            const hasConflict = conflicts.length > 0;
            const isCurrent = ev.date === currentDateStr && currentMins >= start && currentMins < end;
            card.className = `bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative ${hasConflict ? 'agenda-conflict' : ''} ${isCurrent ? 'agenda-current' : ''}`;
            card.style.scrollMarginTop = '60px'; // Ensure sticky header doesn't cover card on scroll

            // Click handler
            // Click handler
            card.onclick = () => {
                if (window.innerWidth <= 768) {
                    openMobileEventModal(ev);
                } else {
                    jumpToEventFromPanel(ev.uid);
                }
            };

            // Hover handlers
            // Hover handlers
            card.onmouseenter = (e) => {
                if (window.innerWidth > 768) {
                    showFullTooltip(e, ev, card);
                    moveTooltipFromPanel(e);
                }
            };
            card.onmousemove = (e) => {
                if (window.innerWidth > 768) moveTooltipFromPanel(e);
            };
            card.onmouseleave = hideTooltip;

            let cardHtml = `
                <div class="flex justify-between items-start">
                    <div class="font-bold text-gray-800 dark:text-gray-100 text-sm pr-2">${escapeHtml(ev.name)}</div>
                    ${isOptional ? `<span class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider border border-gray-200 dark:border-gray-600">Optional</span>` : ''}
                </div>
                
                <div class="flex items-center text-xs text-gray-600 dark:text-gray-400 mt-1">
                    <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    ${timeStr}
                </div>
                
                ${location ? `
                <div class="flex items-center text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                    <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    ${escapeHtml(location)}
                </div>` : ''}
            `;

            card.id = `agenda-card-${ev.uid}`;
            card.innerHTML = cardHtml;
            list.appendChild(card);
        });

        dayContainer.appendChild(list);
        content.appendChild(dayContainer);
    });

    // Auto-scroll to closest event
    // (Time calculated at top of function)

    // Find closest event
    let targetUid = null;

    // Check if current date is within the cruise range
    // We use all attending events to determine range.
    // If we are before the first event, or after the last event, do NOT auto-scroll.
    const uniqueDates = Object.keys(byDay).sort();
    let isWithinRange = false;

    if (uniqueDates.length > 0) {
        const firstDate = uniqueDates[0];
        const lastDate = uniqueDates[uniqueDates.length - 1];
        if (currentDateStr >= firstDate && currentDateStr <= lastDate) {
            isWithinRange = true;
        }
    }

    if (!isWithinRange) {
        // Stop here, leave targetUid as null
    } else {
        // 1. Try to find event today that hasn't ended yet or is about to start
        const todayEvents = events.filter(e => e.date === currentDateStr);
        if (todayEvents.length > 0) {
            // Find first event that ends after now (current or future)
            const upcoming = todayEvents.find(e => {
                const end = e.endMins ?? e.endMinutes;
                return end > currentMins;
            });

            if (upcoming) {
                targetUid = upcoming.uid;
            } else {
                // All events today have passed, maybe scroll to the last one? 
                // Or just let it be. User request says "closest event".
                // If all passed, maybe next day?
            }
        }

        // 2. If no target yet, find first event of future dates
        if (!targetUid) {
            const futureEvents = events.filter(e => e.date > currentDateStr);
            if (futureEvents.length > 0) {
                targetUid = futureEvents[0].uid;
            }
        }

        // 3. If still no target (e.g. all past), maybe last event of today?
        if (!targetUid && todayEvents.length > 0) {
            targetUid = todayEvents[todayEvents.length - 1].uid;
        }

        if (targetUid) {
            if (!state.agendaHasUserScrolled) {
                state.agendaIsAutoScrolling = true;
                setTimeout(() => {
                    const el = document.getElementById(`agenda-card-${targetUid}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    // Release lock after animation
                    setTimeout(() => { state.agendaIsAutoScrolling = false; }, 800);
                }, 100);
            } else if (state.agendaPanelScrollPosition !== null) {
                // Restore position if user has scrolled
                const content = document.getElementById('agenda-panel-content');
                if (content) content.scrollTop = state.agendaPanelScrollPosition;
            }
        }
    }
}

function formatTime(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const ampm = h >= 12 && h < 24 ? 'pm' : 'am';
    const h12 = h === 0 || h === 12 ? 12 : h % 12;
    return `${h12}:${m.toString().padStart(2, '0')}${amppm}`;
}

// --- Update Itinerary Modal ---

export function openUpdateAgendaModal() {
    // Snapshot state for rollback
    updateStateSnapshot = {
        attendingIds: new Set(state.attendingIds),
        hiddenNames: new Set(state.hiddenNames),
        hiddenUids: new Set(state.hiddenUids)
    };

    resetUpdateModal();
    document.getElementById('update-agenda-modal').style.display = 'flex';
    document.getElementById('dropdown-menu').classList.remove('open');

    // Initialize file input listener for update
    const fileInput = document.getElementById('update-file-input');
    const dropZone = document.getElementById('update-drop-zone');

    // Remove old listeners to avoid duplicates (simple way: clone and replace)
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);

    const newDropZone = dropZone.cloneNode(true);
    dropZone.parentNode.replaceChild(newDropZone, dropZone);

    // Re-attach listeners
    newDropZone.addEventListener('click', () => newFileInput.click());
    newFileInput.addEventListener('change', (e) => window.handleUpdateFiles(e.target.files));

    newDropZone.addEventListener('dragover', (e) => { e.preventDefault(); newDropZone.classList.add('border-red-500', 'bg-red-50'); });
    newDropZone.addEventListener('dragleave', () => newDropZone.classList.remove('border-red-500', 'bg-red-50'));
    newDropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        newDropZone.classList.remove('border-red-500', 'bg-red-50');
        if (e.dataTransfer.items) {
            const files = await scanFiles(e.dataTransfer.items);
            if (files.length > 0) window.handleUpdateFiles(files);
        } else if (e.dataTransfer.files.length) {
            window.handleUpdateFiles(e.dataTransfer.files);
        }
    });

    // Add Enter key support for login
    const usernameInput = document.getElementById('update-vv-username');
    const passwordInput = document.getElementById('update-vv-password');

    const handleEnter = (e) => {
        if (e.key === 'Enter') {
            window.handleUpdateVVLogin();
        }
    };

    usernameInput.onkeydown = handleEnter;
    passwordInput.onkeydown = handleEnter;

    // Check for cached credentials
    const hasToken = window.VirginAPI && window.VirginAPI.hasValidToken();
    const cachedUser = localStorage.getItem('vv_username');
    const inputContainer = document.getElementById('update-vv-login-inputs');
    const cachedContainer = document.getElementById('update-vv-cached-session');
    const cachedUserLabel = document.getElementById('update-vv-cached-username');

    if (hasToken && cachedUser) {
        if (inputContainer) inputContainer.classList.add('hidden');
        if (cachedContainer) cachedContainer.classList.remove('hidden');
        if (cachedContainer) cachedContainer.style.display = 'flex'; // Ensure flex
        if (cachedUserLabel) cachedUserLabel.textContent = cachedUser;
        // Pre-fill username for logic but hide it
        if (usernameInput) usernameInput.value = cachedUser;
    } else {
        if (usernameInput) usernameInput.value = cachedUser || '';
    }

    // Ensure options state matches checkboxes
    if (window.toggleUpdateOptions) window.toggleUpdateOptions();
}

export function resetUpdateModal() {
    document.getElementById('update-step-source').classList.remove('hidden');
    document.getElementById('update-step-summary').classList.add('hidden');
    document.getElementById('update-step-summary').classList.remove('flex');
    document.getElementById('update-step-no-changes').classList.add('hidden');
    document.getElementById('update-step-no-changes').classList.remove('flex');

    document.getElementById('update-changes-list').innerHTML = '';

    // Reset login form
    document.getElementById('update-vv-status').textContent = '';
    document.getElementById('btn-update-vv-login').disabled = false;
    document.getElementById('update-vv-spinner').classList.add('hidden');
    document.getElementById('update-vv-username').disabled = false;
    document.getElementById('update-vv-password').disabled = false;
}

// --- Update Itinerary State Management ---
let lastRenderedChanges = null;
let updateModalStateSnapshot = null;

const getChangeKey = (ev) => `${ev.date}_${ev.name}_${ev.timePeriod || (ev.startMins + '-' + ev.endMins)}`;

function captureUpdateModalState() {
    if (!lastRenderedChanges) return;
    const snapshot = {}; // key -> { ignored, forceOverlap }

    const capture = (list) => {
        if (!list) return;
        list.forEach(ev => {
            snapshot[getChangeKey(ev)] = {
                ignored: ev.ignored,
                forceOverlap: ev.forceOverlap
            };
        });
    };

    if (lastRenderedChanges.bookedChanges) {
        capture(lastRenderedChanges.bookedChanges.added);
        capture(lastRenderedChanges.bookedChanges.removed);
        capture(lastRenderedChanges.bookedChanges.unattended);
    }
    capture(lastRenderedChanges.added);

    if (lastRenderedChanges.modified) {
        lastRenderedChanges.modified.forEach(item => {
            // Use the new event for the key, as that is what persists
            snapshot[getChangeKey(item.newEv)] = {
                ignored: item.ignored,
                forceOverlap: item.forceOverlap
            };
        });
    }
    if (lastRenderedChanges.removed) {
        lastRenderedChanges.removed.forEach(ev => {
            snapshot[getChangeKey(ev)] = {
                reschedule: ev.reschedule
            };
        });
    }

    updateModalStateSnapshot = snapshot;
}

function restoreUpdateModalState(changes) {
    if (!updateModalStateSnapshot) return;
    const snapshot = updateModalStateSnapshot;

    const restore = (list) => {
        if (!list) return;
        list.forEach(ev => {
            const state = snapshot[getChangeKey(ev)];
            if (state) {
                if (state.ignored !== undefined) ev.ignored = state.ignored;
                if (state.forceOverlap !== undefined) ev.forceOverlap = state.forceOverlap;
            }
        });
    };

    if (changes.bookedChanges) {
        restore(changes.bookedChanges.added);
        restore(changes.bookedChanges.removed);
        restore(changes.bookedChanges.unattended);
    }
    restore(changes.added);

    if (changes.modified) {
        changes.modified.forEach(item => {
            const state = snapshot[getChangeKey(item.newEv)];
            if (state) {
                if (state.ignored !== undefined) item.ignored = state.ignored;
                if (state.forceOverlap !== undefined) item.forceOverlap = state.forceOverlap;
            }
        });
    }

    if (changes.removed) {
        changes.removed.forEach(ev => {
            const state = snapshot[getChangeKey(ev)];
            if (state) {
                if (state.reschedule !== undefined) ev.reschedule = state.reschedule;
            }
        });
    }

    updateModalStateSnapshot = null;
}



window.launchRescheduleFromUpdate = (uid) => {
    captureUpdateModalState();
    // Hide Update Modal
    document.getElementById('update-agenda-modal').style.display = 'none';

    initRescheduleWizard(uid, () => {
        // Callback when wizard closes
        document.getElementById('update-agenda-modal').style.display = 'flex';
        refreshUpdateCheck();
    });
};

export function renderChangeSummary(changes) {
    lastRenderedChanges = changes;
    restoreUpdateModalState(changes);

    const list = document.getElementById('update-changes-list');
    list.innerHTML = '';

    document.getElementById('update-step-source').classList.add('hidden');

    const hasBookedChanges = changes.bookedChanges && (changes.bookedChanges.added.length > 0 || changes.bookedChanges.removed.length > 0 || changes.bookedChanges.unattended.length > 0);

    const getStatusBadges = (ev) => {
        let html = '';
        // Optional
        if (state.optionalEvents.has(ev.name)) {
            html += `<span class="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-1 rounded h-5 flex items-center ml-2 border border-blue-200 dark:border-blue-800 whitespace-nowrap">Optional</span>`;
        }

        // Hidden
        if (state.hiddenNames.has(ev.name)) {
            html += `<span class="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1 rounded h-5 flex items-center ml-2 border border-gray-200 dark:border-gray-600 whitespace-nowrap">Hidden Series</span>`;
        } else {
            // Check instance hidden
            // Try to resolve UID
            let uid = ev.uid || ev._uid;
            if (!uid && ev.date && ev.name && typeof ev.startMins === 'number') {
                uid = `${ev.date}_${ev.name}_${ev.startMins}`;
            }
            if (uid && state.hiddenUids.has(uid)) {
                html += `<span class="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1 rounded h-5 flex items-center ml-2 border border-gray-200 dark:border-gray-600 whitespace-nowrap">Hidden Instance</span>`;
            }
        }
        return html;
    };

    if (changes.added.length === 0 && changes.removed.length === 0 && (!changes.modified || changes.modified.length === 0) && !hasBookedChanges) {
        document.getElementById('update-step-no-changes').classList.remove('hidden');
        document.getElementById('update-step-no-changes').classList.add('flex');
        return;
    }

    document.getElementById('update-step-summary').classList.remove('hidden');
    document.getElementById('update-step-summary').classList.add('flex');

    // Pre-process: Identify Booked Adds that match New Events (Added)
    // We want to show these in the "New Events" section with the "Mark Attending" footer,
    // instead of showing them in "Booked Event Changes".
    const bookedAddedList = (changes.bookedChanges && changes.bookedChanges.added) ? changes.bookedChanges.added : [];
    const addedList = changes.added || [];
    const bookedMatchesInAdded = new Set(); // Set of bookedChange objects to skip in the Booked section

    // --- Future Conflict Detection Setup ---
    // 1. Build a "Future Base Schedule" from currently scheduled events that are NOT being removed/changed.
    let futureAttending = new Set(state.attendingIds);

    // Remove UIDs for events that are being removed
    if (changes.removed) changes.removed.forEach(e => futureAttending.delete(e._uid));

    // Remove UIDs for events that are being modified (we will check the *new* state of them later)
    if (changes.modified) changes.modified.forEach(m => futureAttending.delete(m.oldEv._uid));

    // Remove UIDs for booked events that are being cancelled/unattended
    if (changes.bookedChanges) {
        if (changes.bookedChanges.removed) changes.bookedChanges.removed.forEach(e => futureAttending.delete(e._uid));
        if (changes.bookedChanges.unattended) changes.bookedChanges.unattended.forEach(e => futureAttending.delete(e._uid));
    }

    const hasFutureInstances = (evName) => {
        const now = new Date();
        // Determine "future" roughly.
        // We only offer reschedule if there is at least one OTHER future option.
        // So we need > 1 future instance total (the conflicting one + at least one other).
        const all = Array.from(state.eventLookup.values()).filter(e => e.name === evName);
        const futureCount = all.reduce((count, e) => {
            const d = new Date(e.date + 'T00:00:00');
            d.setMinutes(e.startMins);
            return d >= now ? count + 1 : count;
        }, 0);

        return futureCount > 1;
    };

    // Helper to check for conflicts against the Future Base Schedule
    const checkFutureConflict = (candidate) => {
        let conflicts = [];

        let cS, cE;
        // Determine candidate times
        if (typeof candidate.startMins === 'number') {
            cS = candidate.startMins;
            cE = candidate.endMins;
        } else {
            const t = parseTimeRange(candidate.timePeriod);
            if (!t) return []; // Cannot check without time
            cS = t.start + SHIFT_START_ADD;
            cE = t.end + SHIFT_END_ADD;
        }

        // Iterate over the "stable" events
        futureAttending.forEach(uid => {
            let existing = state.eventLookup.get(uid);
            // Fallback for custom events if not in lookup (though they should be)
            if (!existing) return;

            // Simple date check first
            if (existing.date === candidate.date) {
                const eS = existing.startMins;
                const eE = existing.endMins;

                // Check overlap (exclusive end time usually, but inclusive logic is fine for warnings)
                // Overlap if Max(StartA, StartB) < Min(EndA, EndB)
                if (Math.max(cS, eS) < Math.min(cE, eE)) {
                    conflicts.push(existing);
                }
            }
        });
        return conflicts;
    };


    bookedAddedList.forEach(booked => {
        const bookedTime = parseTimeRange(booked.timePeriod);
        if (!bookedTime) return;
        const bookedStart = bookedTime.start + SHIFT_START_ADD;

        const match = addedList.find(newEv =>
            newEv.date === booked.date &&
            newEv.name === booked.name &&
            Math.abs(newEv.startMins - bookedStart) < 15
        );

        if (match) {
            bookedMatchesInAdded.add(booked);
            // Attach reference to the new event so we can render the footer there
            match._bookedChangeRef = booked;
        }
    });

    // 1. Render Booked Event Changes
    if (changes.bookedChanges && (changes.bookedChanges.added.length > 0 || changes.bookedChanges.removed.length > 0 || changes.bookedChanges.unattended.length > 0)) {

        // Filter out the ones moved to "New Events" section
        const visibleAdded = changes.bookedChanges.added.filter(b => !bookedMatchesInAdded.has(b));

        if (visibleAdded.length > 0 || changes.bookedChanges.removed.length > 0 || changes.bookedChanges.unattended.length > 0) {
            const bookedHeader = document.createElement('h5');
            bookedHeader.className = "font-bold text-purple-700 dark:text-purple-300 text-sm uppercase tracking-wide mb-2 sticky top-0 bg-white dark:bg-gray-800 py-3 px-4 z-10 shadow-sm border-b border-gray-100 dark:border-gray-700";
            bookedHeader.textContent = `Booked Event Changes`;
            list.appendChild(bookedHeader);

            // Added Bookings
            visibleAdded.forEach((ev, idx) => {
                const el = document.createElement('div');
                el.className = "bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded mb-2 text-sm mx-4 flex flex-col";
                const typeLabel = ev.type === 'attendance' ? 'Attending in VV App' : 'New Custom Event';
                const id = `booked-add-${idx}`;

                let conflictHtml = '';
                // Check conflicts against future state
                const futureConflicts = checkFutureConflict(ev);

                if (futureConflicts.length > 0) {
                    const conflictList = futureConflicts.map(c => {
                        const canReschedule = hasFutureInstances(c.name);
                        const mark = canReschedule ? '' : '* ';
                        return `<li>${mark}${escapeHtml(c.name)} (${formatTimeRange(c.startMins, c.endMins)}) ${canReschedule ? `<a href="#" class="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1" onclick="event.preventDefault(); launchRescheduleFromUpdate('${c.uid || c._uid}');">Find Alternative</a>` : ''}</li>`;
                    }).join('');
                    conflictHtml = `
                        <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded p-2 mt-2">
                            <div class="flex items-center gap-2 text-red-700 dark:text-red-300 font-bold text-xs mb-1">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                Conflict with:
                            </div>
                            <ul class="list-disc list-inside text-xs text-red-600 dark:text-red-400 ml-2">
                                ${conflictList}
                            </ul>
                        </div>
                    `;
                }

                // Add the footer
                const groupName = `action_booked_${idx}`;
                const isOverlap = ev.forceOverlap;
                const isSkip = ev.ignored;
                const isAttend = !isOverlap && !isSkip;

                const canShowOverlap = futureConflicts.length > 0;

                const footerHtml = `
                    <div class="border-t border-purple-200 dark:border-purple-800 p-2 bg-purple-100/30 dark:bg-purple-900/10">
                        <div class="flex flex-col gap-1">
                            <label class="flex items-center gap-2 cursor-pointer select-none">
                                <input type="radio" name="${groupName}" value="attend" class="text-purple-600 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600" ${isAttend ? 'checked' : ''}>
                                <span class="text-xs font-bold text-purple-800 dark:text-purple-300">Mark Attending in Planner</span>
                            </label>
                            ${canShowOverlap ? `
                            <label class="flex items-center gap-2 cursor-pointer select-none">
                                <input type="radio" name="${groupName}" value="overlap" class="text-purple-600 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600" ${isOverlap ? 'checked' : ''}>
                                <span class="text-xs font-bold text-purple-800 dark:text-purple-300">Mark Attending with Overlap</span>
                            </label>` : ''}
                            <label class="flex items-center gap-2 cursor-pointer select-none">
                                <input type="radio" name="${groupName}" value="skip" class="text-purple-600 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600" ${isSkip ? 'checked' : ''}>
                                <span class="text-xs font-bold text-purple-800 dark:text-purple-300">Skip Adding to Planner</span>
                            </label>
                        </div>
                    </div>
                `;

                el.innerHTML = `
                    <div class="p-2">
                        <div class="flex justify-between items-start">
                            <div class="flex flex-wrap items-center gap-1">
                                <span class="font-bold text-gray-800 dark:text-gray-100">${escapeHtml(ev.name)}</span>
                                ${getStatusBadges(ev)}
                            </div>
                            <span class="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900 px-1 rounded h-5 flex items-center">${typeLabel}</span>
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">${ev.date} @ ${ev.timePeriod}</div>
                        <div class="text-xs text-gray-400 dark:text-gray-500 truncate">${escapeHtml(ev.location || '')}</div>
                        ${conflictHtml}
                    </div>
                    ${footerHtml}
                `;
                list.appendChild(el);

                const radios = el.querySelectorAll(`input[name="${groupName}"]`);
                radios.forEach(r => {
                    r.onchange = (e) => {
                        ev.ignored = (e.target.value === 'skip');
                        ev.forceOverlap = (e.target.value === 'overlap');

                        // Re-render to update dynamic checks (like "Already Attending" in removed section)
                        const list = document.getElementById('update-changes-list');
                        const scroll = list ? list.scrollTop : 0;
                        captureUpdateModalState(); // Capture state
                        renderChangeSummary(lastRenderedChanges);
                        // Restore scroll
                        const newList = document.getElementById('update-changes-list');
                        if (newList) newList.scrollTop = scroll;
                    };
                });

                if (futureConflicts.length > 0) {
                    ev.hasConflicts = true;
                } else {
                    ev.hasConflicts = false;
                }

                if (ev.conflicts && ev.conflicts.length > 0) {
                    // Handle resolve button
                    const btnResolve = document.getElementById(`btn-resolve-${idx}`);
                    if (btnResolve) {
                        btnResolve.onclick = () => {
                            initRescheduleWizard(ev.conflicts[0].uid, refreshUpdateCheck);
                        };
                    }
                }
            });

            // Removed Bookings
            changes.bookedChanges.removed.forEach((ev, idx) => {
                const el = document.createElement('div');
                el.className = "bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded mb-2 text-sm opacity-75 mx-4 flex flex-col";
                const id = `booked-rem-${idx}`;

                el.innerHTML = `
                    <div class="p-2">
                        <div class="flex justify-between items-start">
                             <div class="flex flex-wrap items-center gap-1">
                                <span class="font-bold text-gray-800 dark:text-gray-100">${escapeHtml(ev.name)}</span>
                                ${getStatusBadges(ev)}
                            </div>
                            <span class="text-[10px] uppercase font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900 px-1 rounded h-5 flex items-center">Booking Cancelled</span>
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">${ev.date} @ ${formatTimeRange(ev.startMins, ev.endMins)}</div>
                    </div>

                    <div class="border-t border-red-200 dark:border-red-800 p-2 bg-red-100/30 dark:bg-red-900/10">
                        <label class="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" id="${id}" class="rounded text-red-600 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600" checked>
                            <span class="text-xs font-bold text-red-800 dark:text-red-300">Unmark Attending in Planner?</span>
                        </label>
                    </div>
                `;
                list.appendChild(el);
                document.getElementById(id).onchange = (e) => { ev.ignored = !e.target.checked; };
            });

            // Unattended Bookings
            changes.bookedChanges.unattended.forEach((ev, idx) => {
                const el = document.createElement('div');
                el.className = "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 rounded mb-2 text-sm opacity-75 mx-4 flex flex-col";
                const id = `booked-unatt-${idx}`;

                el.innerHTML = `
                    <div class="p-2">
                        <div class="flex justify-between items-start">
                            <div class="flex flex-wrap items-center gap-1">
                                <span class="font-bold text-gray-800 dark:text-gray-100">${escapeHtml(ev.name)}</span>
                                ${getStatusBadges(ev)}
                            </div>
                            <span class="text-[10px] uppercase font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900 px-1 rounded h-5 flex items-center">Atttending in Planner</span>
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">${ev.date} @ ${formatTimeRange(ev.startMins, ev.endMins)}</div>
                    </div>

                    <div class="border-t border-yellow-200 dark:border-yellow-800 p-2 bg-yellow-100/30 dark:bg-yellow-900/10">
                        <label class="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" id="${id}" class="rounded text-yellow-600 focus:ring-yellow-500 dark:bg-gray-700 dark:border-gray-600" checked>
                            <span class="text-xs font-bold text-yellow-800 dark:text-yellow-300">Unmark Attending in Planner?</span>
                        </label>
                    </div>
                `;
                list.appendChild(el);
                document.getElementById(id).onchange = (e) => { ev.ignored = !e.target.checked; };
            });
        }
    }

    // 2. Render Added (New Events)
    if (changes.added.length > 0) {
        const addedHeader = document.createElement('h5');
        addedHeader.className = "font-bold text-green-700 dark:text-green-300 text-sm uppercase tracking-wide mb-2 sticky top-0 bg-white dark:bg-gray-800 py-3 px-4 z-10 shadow-sm border-b border-gray-100 dark:border-gray-700";
        addedHeader.textContent = `New Events (${changes.added.length})`;
        list.appendChild(addedHeader);

        changes.added.forEach((ev, idx) => {
            const el = document.createElement('div');
            // Check if this new event is also a booked event
            const bookedRef = ev._bookedChangeRef;

            // Adjust styling if it's a booked match - User requested keeping green color
            const borderClass = "border-green-100 dark:border-green-800";
            const bgClass = "bg-green-50 dark:bg-green-900/20";

            el.className = `${bgClass} border ${borderClass} rounded mb-2 text-sm mx-4 flex flex-col`;

            let footerHtml = '';
            let conflictHtml = '';
            let attendingLabelHtml = '';

            if (bookedRef) {
                // Label for "Attending In VV App"
                attendingLabelHtml = `
                    <span class="text-[10px] uppercase font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900 px-1 rounded h-5 flex items-center whitespace-nowrap ml-2">Attending In VV App</span>
                `;

                // If it's a booked event, we show conflict UI if any
                const futureConflicts = checkFutureConflict(ev);
                if (futureConflicts.length > 0) {
                    const conflictList = futureConflicts.map(c => {
                        const canReschedule = hasFutureInstances(c.name);
                        const mark = canReschedule ? '' : '* ';
                        return `<li>${mark}${escapeHtml(c.name)} (${formatTimeRange(c.startMins, c.endMins)}) ${canReschedule ? `<a href="#" class="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1" onclick="event.preventDefault(); launchRescheduleFromUpdate('${c.uid}');">Find Alternative</a>` : ''}</li>`;
                    }).join('');
                    conflictHtml = `
                        <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded p-2 mt-2">
                             <div class="flex items-center gap-2 text-red-700 dark:text-red-300 font-bold text-xs mb-1">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                Conflict with:
                             </div>
                             <ul class="list-disc list-inside text-xs text-red-600 dark:text-red-400 ml-2">
                                ${conflictList}
                             </ul>
                        </div>
                     `;
                }

                // Add the footer
                const groupName = `action_added_${idx}`;
                const isOverlap = bookedRef.forceOverlap;
                const isSkip = bookedRef.ignored;
                const isAttend = !isOverlap && !isSkip;

                const canShowOverlap = futureConflicts.length > 0;

                // Re-render conflict HTML here since we need it for canShowOverlap logic (though previously it was below)
                // Actually we need to make sure conflictHtml is generated before footerHtml?
                // In original code, conflictHtml was generated inside `if (bookedRef) { ... }`.
                // Wait, `futureConflicts` was generated inside `if (bookedRef)` block in original code.
                // So I will keep structure but move variable declaration up.

                if (futureConflicts.length > 0) {
                    // ... conflict HTML generation (omitted from replace block to keep brief, assumes it runs below/parallel) ...
                    // Actually I need to regenerate the whole `if (bookedRef)` block or check where I am.
                    // The snippet I am replacing covers the footer generation inside `if (bookedRef)`.
                    // I will assume `futureConflicts` variable is accessible or I recalc it.
                    // `futureConflicts` was defined LATER in the original code (Line 1579).
                    // I must lift it up or recalculate.
                }

                footerHtml = `
                    <div class="border-t border-green-200 dark:border-green-800 p-2 bg-green-100/30 dark:bg-green-900/10">
                        <div class="flex flex-col gap-1">
                            <label class="flex items-center gap-2 cursor-pointer select-none">
                                <input type="radio" name="${groupName}" value="attend" class="text-green-600 focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600" ${isAttend ? 'checked' : ''}>
                                <span class="text-xs font-bold text-green-800 dark:text-green-300">Mark Attending in Planner</span>
                            </label>
                            ${canShowOverlap ? `
                            <label class="flex items-center gap-2 cursor-pointer select-none">
                                <input type="radio" name="${groupName}" value="overlap" class="text-green-600 focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600" ${isOverlap ? 'checked' : ''}>
                                <span class="text-xs font-bold text-green-800 dark:text-green-300">Mark Attending with Overlap</span>
                            </label>` : ''}
                            <label class="flex items-center gap-2 cursor-pointer select-none">
                                <input type="radio" name="${groupName}" value="skip" class="text-green-600 focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600" ${isSkip ? 'checked' : ''}>
                                <span class="text-xs font-bold text-green-800 dark:text-green-300">Skip Adding to Planner</span>
                            </label>
                        </div>
                    </div>
                `;
            }

            el.innerHTML = `
                <div class="p-2">
                    <div class="flex justify-between items-start">
                        <div class="flex flex-wrap items-center gap-1">
                            <span class="font-bold text-gray-800 dark:text-gray-100">${escapeHtml(ev.name)}</span>
                            ${getStatusBadges(ev)}
                        </div>
                        ${attendingLabelHtml}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">${ev.date} @ ${formatTimeRange(ev.startMins, ev.endMins)}</div>
                    <div class="text-xs text-gray-400 dark:text-gray-500 truncate">${escapeHtml(ev.location || '')}</div>
                    ${conflictHtml}
                </div>
                ${footerHtml}
            `;
            list.appendChild(el);

            if (bookedRef) {
                const groupName = `action_added_${idx}`;
                const radios = el.querySelectorAll(`input[name="${groupName}"]`);
                radios.forEach(r => {
                    r.onchange = (e) => {
                        bookedRef.ignored = (e.target.value === 'skip');
                        bookedRef.forceOverlap = (e.target.value === 'overlap');

                        // Re-render to update dynamic checks
                        const list = document.getElementById('update-changes-list');
                        const scroll = list ? list.scrollTop : 0;
                        captureUpdateModalState();
                        renderChangeSummary(lastRenderedChanges);
                        const newList = document.getElementById('update-changes-list');
                        if (newList) newList.scrollTop = scroll;
                    };
                });
            }


            if (bookedRef && checkFutureConflict(ev).length > 0) {
                bookedRef.hasConflicts = true;
            }
        });
    }

    // 3. Render Modified
    if (changes.modified && changes.modified.length > 0) {
        const modHeader = document.createElement('h5');
        modHeader.className = "font-bold text-orange-700 dark:text-orange-300 text-sm uppercase tracking-wide mb-2 sticky top-0 bg-white dark:bg-gray-800 py-3 px-4 z-10 shadow-sm border-b border-gray-100 dark:border-gray-700";
        modHeader.textContent = `Modified Events (${changes.modified.length})`;
        list.appendChild(modHeader);

        changes.modified.forEach((item, idx) => {
            const { oldEv, newEv, changes: changedFields } = item;
            const el = document.createElement('div');
            el.className = "bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded mb-2 text-sm mx-4 flex flex-col";

            // Check if user is attending this modified event
            let isScheduled = false;
            const timeData = parseTimeRange(oldEv.timePeriod);
            if (timeData) {
                const s = timeData.start + SHIFT_START_ADD;
                const uid = `${oldEv.date}_${oldEv.name}_${s}`;
                if (state.attendingIds.has(uid)) isScheduled = true;
            }
            // Store for usage in Removed Events check
            item.wasScheduled = isScheduled;

            let conflictHtml = '';
            // Only check conflicts if it's scheduled and moving/changing
            if (isScheduled) {
                const futureConflicts = checkFutureConflict(newEv);
                if (futureConflicts.length > 0) {
                    const conflictList = futureConflicts.map(c => {
                        const canReschedule = hasFutureInstances(c.name);
                        const mark = canReschedule ? '' : '* ';
                        return `<li>${mark}${escapeHtml(c.name)} (${formatTimeRange(c.startMins, c.endMins)}) ${canReschedule ? `<a href="#" class="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1" onclick="event.preventDefault(); launchRescheduleFromUpdate('${c.uid}');">Find Alternative</a>` : ''}</li>`;
                    }).join('');
                    conflictHtml = `
                        <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded p-2 mt-2">
                             <div class="flex items-center gap-2 text-red-700 dark:text-red-300 font-bold text-xs mb-1">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                Conflict with:
                             </div>
                             <ul class="list-disc list-inside text-xs text-red-600 dark:text-red-400 ml-2">
                                ${conflictList}
                             </ul>
                        </div>
                `;
                }
            }

            let details = '';
            if (changedFields.includes('Time')) {
                details += `<div class="text-xs text-orange-800 dark:text-orange-200 mt-1"><span class="font-bold">Time:</span> ${formatTimeRange(oldEv.startMins, oldEv.endMins)} &rarr; ${formatTimeRange(newEv.startMins, newEv.endMins)}</div>`;
            }
            if (changedFields.includes('Location')) {
                details += `<div class="text-xs text-orange-800 dark:text-orange-200 mt-1"><span class="font-bold">Location:</span> ${escapeHtml(oldEv.location || 'None')} &rarr; ${escapeHtml(newEv.location || 'None')}</div>`;
            }
            if (changedFields.includes('Description')) {
                details += `<div class="text-xs text-orange-800 dark:text-orange-200 mt-1"><span class="font-bold">Description Updated</span></div>`;
            }

            let warningHtml = '';
            if (isScheduled) {
                warningHtml = `
                    <span class="text-[10px] uppercase font-bold text-orange-800 dark:text-orange-200 bg-orange-100 dark:bg-orange-900 px-1 rounded ml-2 whitespace-nowrap">Attending in Planner</span>
                `;
            }

            let footerHtml = '';
            if (isScheduled) {
                const groupName = `action_modified_${idx}`;
                const isOverlap = item.forceOverlap;
                const isSkip = item.ignored;
                const isAttend = !isOverlap && !isSkip;

                // Check for conflicts again or reuse? `futureConflicts` was inside `if (isScheduled)` block just above?
                // Actually `conflictHtml` generation block was `if (isScheduled) { const futureConflicts = ... }`.
                // `footerHtml` generation block is ALSO `if (isScheduled) { ... }`.
                // Since they are separate consecutive `if` blocks with same condition, I can technically merge them or just re-run check.
                // Merging them would be cleaner but risky with replace tool.
                // I will just re-run check for safety and minimal diff.
                const userConflicts = checkFutureConflict(newEv);
                const canShowOverlap = userConflicts.length > 0;

                if (canShowOverlap) {
                    footerHtml = `
                        <div class="border-t border-orange-200 dark:border-orange-800 p-2 bg-orange-100/30 dark:bg-orange-900/10">
                            <div class="flex flex-col gap-1">
                                <label class="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="radio" name="${groupName}" value="attend" class="text-orange-600 focus:ring-orange-500 dark:bg-gray-700 dark:border-gray-600" ${isAttend ? 'checked' : ''}>
                                    <span class="text-xs font-bold text-orange-800 dark:text-orange-300">Mark Attending in Planner</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="radio" name="${groupName}" value="overlap" class="text-orange-600 focus:ring-orange-500 dark:bg-gray-700 dark:border-gray-600" ${isOverlap ? 'checked' : ''}>
                                    <span class="text-xs font-bold text-orange-800 dark:text-orange-300">Mark Attending with Overlap</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="radio" name="${groupName}" value="skip" class="text-orange-600 focus:ring-orange-500 dark:bg-gray-700 dark:border-gray-600" ${isSkip ? 'checked' : ''}>
                                    <span class="text-xs font-bold text-orange-800 dark:text-orange-300">Skip Adding to Planner</span>
                                </label>
                            </div>
                        </div>
                    `;
                }
            }

            el.innerHTML = `
                <div class="p-2">
                    <div class="flex justify-between items-start">
                         <div class="flex flex-wrap items-center gap-1">
                            <span class="font-bold text-gray-800 dark:text-gray-100">${escapeHtml(newEv.name)}</span>
                            ${getStatusBadges(newEv)}
                        </div>
                        ${warningHtml}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">${newEv.date}</div>
                    ${details}
                    ${conflictHtml}
                </div>
                ${footerHtml}
            `;
            list.appendChild(el);

            if (isScheduled) {
                const groupName = `action_modified_${idx}`;
                const radios = el.querySelectorAll(`input[name="${groupName}"]`);
                if (radios.length > 0) {
                    radios.forEach(r => {
                        r.onchange = (e) => {
                            item.ignored = (e.target.value === 'skip');
                            item.forceOverlap = (e.target.value === 'overlap');

                            const list = document.getElementById('update-changes-list');
                            const scroll = list ? list.scrollTop : 0;
                            captureUpdateModalState();
                            renderChangeSummary(lastRenderedChanges);

                            const newList = document.getElementById('update-changes-list');
                            if (newList) newList.scrollTop = scroll;
                        };
                    });

                    if (checkFutureConflict(newEv).length > 0) {
                        item.hasConflicts = true;
                    } else {
                        item.hasConflicts = false;
                    }
                }
            }
        });
    }

    // 4. Render Removed
    if (changes.removed && changes.removed.length > 0) {
        const removedHeader = document.createElement('h5');
        removedHeader.className = "font-bold text-red-700 dark:text-red-300 text-sm uppercase tracking-wide mb-2 sticky top-0 bg-white dark:bg-gray-800 py-3 px-4 z-10 shadow-sm border-b border-gray-100 dark:border-gray-700";
        removedHeader.textContent = `Removed Events (${changes.removed.length})`;
        list.appendChild(removedHeader);

        changes.removed.forEach((ev, idx) => {
            const el = document.createElement('div');
            el.className = "bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded mb-2 text-sm mx-4 flex flex-col";

            // Check if user is attending this removed event
            let isScheduled = false;
            const timeData = parseTimeRange(ev.timePeriod);
            if (timeData) {
                const s = timeData.start + SHIFT_START_ADD;
                const uid = `${ev.date}_${ev.name}_${s}`;
                if (state.attendingIds.has(uid)) isScheduled = true;
            }

            let warningHtml = '';
            let footerHtml = '';

            if (isScheduled) {
                // Check if we are ALREADY attending another instance of this SAME event
                let alreadyAttendingEv = null;

                // 1. Check existing Future Base Schedule
                for (const uid of futureAttending) {
                    const existing = state.eventLookup.get(uid);
                    if (existing && existing.name === ev.name) {
                        alreadyAttendingEv = existing;
                        break;
                    }
                }

                // 2. Check "New Events" (Added)
                if (!alreadyAttendingEv) {
                    const match = changes.added.find(a => {
                        if (a.name !== ev.name) return false;

                        // If it corresponds to a Booked Change (e.g. "Attending In VV App"), check the state of that booked change
                        if (a._bookedChangeRef) {
                            if (a._bookedChangeRef.ignored) return false; // Skipped by user selection
                            return true; // Marked Attend or Overlap
                        }

                        // If it's a raw new event (not booked), it's not "attending" unless we someday allow auto-attend new events
                        // For now, assume if it's in "Added" list without booked ref, it's NOT attending yet.
                        return false;
                    });
                    if (match) alreadyAttendingEv = match;
                }

                // 3. Check "Booked Event Changes" (Added)
                // These are ones NOT in "New Events" section (visibleAdded logic inside render loop, but we can check source)
                if (!alreadyAttendingEv && changes.bookedChanges && changes.bookedChanges.added) {
                    const match = changes.bookedChanges.added.find(b => {
                        if (b.name !== ev.name) return false;
                        if (b.ignored) return false; // User selected "Skip Adding to Planner"

                        // Ensure we don't count if we already matched it in step 2 (via _bookedChangeRef)
                        // But logic above handles that by checking !alreadyAttendingEv
                        return true;
                    });
                    if (match) alreadyAttendingEv = match;
                }

                // 4. Check "Modified Events"
                if (!alreadyAttendingEv && changes.modified) {
                    const match = changes.modified.find(m => {
                        if (m.newEv.name !== ev.name) return false;
                        if (m.ignored) return false; // User selected "Skip"

                        // KEY FIX: Only count this as "attending" if the user was actually attending the ORIGINAL version of this modified event
                        // OR if they explicitly chose "Attend" (which we don't expose UI for if not scheduled, but logic holds)
                        // Actually, if !wasScheduled, we don't show radios, so they CAN'T choose attend.
                        // So we simply check wasScheduled.
                        if (!m.wasScheduled) return false;

                        return true;
                    });
                    if (match) alreadyAttendingEv = match.newEv; // Use newEv for display
                }


                if (alreadyAttendingEv) {
                    // Found an attending instance!
                    // Disable reschedule (logic wise) so we don't accidentally prompt later
                    ev.reschedule = false;

                    warningHtml = `
                        <span class="text-[10px] uppercase font-bold text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900 px-1 rounded ml-2 whitespace-nowrap">Attending in Planner</span>
                    `;

                    footerHtml = `
                        <div class="border-t border-red-200 dark:border-red-800 p-2 bg-red-100/30 dark:bg-red-900/10">
                             <div class="flex items-center gap-2 text-xs text-green-700 dark:text-green-300 font-bold">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                                <span>No need to reschedule, already attending<br><span class="font-normal opacity-90">${alreadyAttendingEv.date} @ ${alreadyAttendingEv.timePeriod || formatTimeRange(alreadyAttendingEv.startMins, alreadyAttendingEv.endMins)}</span></span>
                             </div>
                        </div>
                    `;

                } else {
                    // Default Reschedule Logic
                    if (ev.reschedule === undefined || ev.reschedule === false) ev.reschedule = true;

                    warningHtml = `
                        <span class="text-[10px] uppercase font-bold text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900 px-1 rounded ml-2 whitespace-nowrap">Attending in Planner</span>
                    `;

                    footerHtml = `
                        <div class="border-t border-red-200 dark:border-red-800 p-2 bg-red-100/30 dark:bg-red-900/10">
                            <label class="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" id="rem-resched-${idx}-grid" class="rounded text-red-600 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600" ${ev.reschedule ? 'checked' : ''}>
                                <span class="text-xs font-bold text-red-800 dark:text-red-300">Reschedule this event?</span>
                            </label>
                        </div>
                    `;
                }
            }

            el.innerHTML = `
                <div class="p-2">
                    <div class="flex justify-between items-start">
                        <div class="flex flex-wrap items-center gap-1">
                            <span class="font-bold text-gray-800 dark:text-gray-100">${escapeHtml(ev.name)}</span>
                            ${getStatusBadges(ev)}
                        </div>
                        ${warningHtml}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">${ev.date} @ ${formatTimeRange(ev.startMins, ev.endMins)}</div>
                </div>
                ${footerHtml}
            `;
            list.appendChild(el);

            if (isScheduled) {
                const cb = document.getElementById(`rem-resched-${idx}-grid`);
                if (cb) {
                    cb.onchange = (e) => { ev.reschedule = e.target.checked; };
                }
            }
        });
    }
}

export function confirmUpdateApply() {
    // Validation Step
    const conflicts = [];

    if (lastRenderedChanges) {
        // Check Booked Changes (Added)
        if (lastRenderedChanges.bookedChanges && lastRenderedChanges.bookedChanges.added) {
            lastRenderedChanges.bookedChanges.added.forEach(ev => {
                if (ev.hasConflicts && !ev.ignored && !ev.forceOverlap) {
                    conflicts.push(ev.name);
                }
            });
        }

        // Check Modified Events
        if (lastRenderedChanges.modified) {
            lastRenderedChanges.modified.forEach(item => {
                if (item.hasConflicts && !item.ignored && !item.forceOverlap) {
                    conflicts.push(item.newEv.name);
                }
            });
        }
    }

    if (conflicts.length > 0) {
        // Show validation modal
        showConflictValidationModal(conflicts);
        return;
    }

    if (window.applyAgendaUpdate) {
        const rescheduled = window.applyAgendaUpdate();
        updateStateSnapshot = null; // Commit changes
        closeAllModals();

        if (rescheduled && rescheduled.length > 0) {
            showRescheduleModal(rescheduled);
        } else {
            showConfirm("Itinerary updated successfully!", null, "Success");
            // Hide cancel button for this success message
            setTimeout(() => {
                const cancelBtn = document.getElementById('btn-confirm-cancel');
                if (cancelBtn) cancelBtn.style.display = 'none';
                const okBtn = document.getElementById('btn-confirm-ok');
                if (okBtn) {
                    const oldOnClick = okBtn.onclick;
                    okBtn.onclick = () => {
                        if (oldOnClick) oldOnClick();
                        cancelBtn.style.display = 'inline-block'; // Restore
                    };
                }
            }, 0);
        }
    }
}

function showRescheduleModal(events) {
    // Create modal if not exists
    let modal = document.getElementById('reschedule-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reschedule-modal';
        modal.className = 'modal-overlay';
        modal.style.zIndex = '9000';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden transform transition-all">
                <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-600 flex justify-between items-center">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white">Reschedule Required</h3>
                    <button onclick="document.getElementById('reschedule-modal').style.display='none'" class="text-gray-400 hover:text-gray-500">
                        <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                <div class="p-6">
                    <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
                        The following events have been removed from the schedule but were marked for rescheduling. They have been added to your "Missing Events" list as required:
                    </p>
                    <ul class="list-disc list-inside text-sm font-bold text-gray-800 dark:text-gray-100 mb-6 max-h-40 overflow-y-auto" id="reschedule-list">
                    </ul>
                    <div class="flex flex-col gap-3">
                        <button id="btn-resched-smart" class="w-full justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#AF231C] text-base font-medium text-white hover:bg-[#8e1c16] focus:outline-none sm:text-sm">
                            Launch Smart Scheduler
                        </button>
                        <button id="btn-resched-missing" class="w-full justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600 focus:outline-none sm:text-sm">
                            Show Missing Events
                        </button>
                        <button onclick="document.getElementById('reschedule-modal').style.display='none'" class="w-full justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-gray-100 text-base font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-300 dark:border-gray-500 dark:hover:bg-gray-500 focus:outline-none sm:text-sm">
                            OK
                        </button>
                    </div>
                </div>
            </div>
                `;
        document.body.appendChild(modal);

        document.getElementById('btn-resched-smart').onclick = () => {
            document.getElementById('reschedule-modal').style.display = 'none';
            // Assuming openSmartScheduler takes a 'skipIntro' param or check previous usage
            // The user requested "skipping the introduction page and pre-voyage checklist"
            // Start Smart Scheduler
            if (window.openSmartScheduler) window.openSmartScheduler(true);
        };

        document.getElementById('btn-resched-missing').onclick = () => {
            document.getElementById('reschedule-modal').style.display = 'none';
            openAttendancePanel('required');
        };
    }

    // Update list
    const list = document.getElementById('reschedule-list');
    list.innerHTML = events.map(name => `<li>${escapeHtml(name)}</li>`).join('');

    // Show
    document.getElementById('reschedule-modal').style.display = 'flex';
}

function moveTooltipFromPanel(e) {
    const tooltip = document.getElementById('tooltip');
    if (tooltip && tooltip.style.display === 'block') {
        const panel = document.getElementById('agenda-panel');
        const panelRect = panel.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        // Position to the left of the panel
        let left = panelRect.left - tooltipRect.width - 10;
        let top = e.clientY - (tooltipRect.height / 2);

        // Ensure it doesn't go off screen
        if (left < 10) left = 10;
        if (top < 10) top = 10;
        if (top + tooltipRect.height > window.innerHeight - 10) {
            top = window.innerHeight - tooltipRect.height - 10;
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }
}

export function updateAgendaCount() {
    const badges = document.querySelectorAll('.agenda-count');
    if (badges.length === 0) return;

    const now = new Date();
    const currentMins = (now.getHours() * 60) + now.getMinutes();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const currentDateStr = `${year}-${month}-${day}`;

    // Determine if "during cruise"
    let isDuringCruise = false;
    if (state.availableDates.length > 0) {
        const firstDate = state.availableDates[0];
        const lastDate = state.availableDates[state.availableDates.length - 1];

        // Simple string comparison works for YYYY-MM-DD
        if (currentDateStr >= firstDate && currentDateStr <= lastDate) {
            isDuringCruise = true;
        }
    }

    let count = 0;
    state.attendingIds.forEach(uid => {
        const ev = state.eventLookup.get(uid);
        if (!ev) return;

        if (isDuringCruise) {
            // Count only if event ends in the future
            // Check date
            if (ev.date > currentDateStr) {
                count++;
            } else if (ev.date === currentDateStr) {
                const end = ev.endMins ?? ev.endMinutes;
                if (end > currentMins) {
                    count++;
                }
            }
        } else {
            // Count all
            count++;
        }
    });

    badges.forEach(el => el.textContent = count);
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

    const attendancePanel = document.getElementById('attendance-panel');
    const isAttendanceOpen = attendancePanel && attendancePanel.classList.contains('open');

    const agendaPanel = document.getElementById('agenda-panel');
    const isAgendaOpen = agendaPanel && agendaPanel.classList.contains('open');

    const handlePanelClose = (toggleFunc) => {
        if (window.innerWidth <= 768) {
            toggleFunc();
            setTimeout(() => jumpToEvent(uid), 100);
            return true;
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
            toggleFunc();
            setTimeout(() => jumpToEvent(uid), 100);
            return true;
        }
        return false;
    };

    if (isAttendanceOpen) {
        if (handlePanelClose(toggleAttendancePanel)) return;
    }

    if (isAgendaOpen) {
        if (handlePanelClose(toggleAgendaPanel)) return;
    }

    jumpToEvent(uid);
}

// --- Blacklist ---

export function openBlacklistModal() {
    document.getElementById('blacklist-input').value = Array.from(state.blacklist).join('\n');
    document.getElementById('blacklist-modal').style.display = 'flex';
    document.getElementById('dropdown-menu').classList.remove('open');
}

export function saveBlacklistUI() {
    const text = document.getElementById('blacklist-input').value;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    state.blacklist = new Set(lines);
    saveBlacklist();

    // Cleanup hidden lists based on new blacklist
    let namesRemoved = false;
    let uidsRemoved = false;

    state.blacklist.forEach(name => {
        if (state.hiddenNames.has(name)) {
            state.hiddenNames.delete(name);
            namesRemoved = true;
        }
    });

    // Optimize: Iterate hiddenUids instead of all events
    const uidsToDelete = [];
    state.hiddenUids.forEach(uid => {
        const ev = state.eventLookup.get(uid);
        if (ev && state.blacklist.has(ev.name)) {
            uidsToDelete.push(uid);
        }
    });

    if (uidsToDelete.length > 0) {
        uidsToDelete.forEach(uid => state.hiddenUids.delete(uid));
        uidsRemoved = true;
    }

    if (namesRemoved) saveHiddenNames();
    if (uidsRemoved) saveHiddenUids();

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
    document.getElementById('dropdown-menu').classList.remove('open');
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

// --- Celebration Feature ---

export function toggleComplete(uid) {
    if (state.completedIds.has(uid)) {
        state.completedIds.delete(uid);
    } else {
        state.completedIds.add(uid);
        triggerCelebration();
    }
    saveCompletedIds();
    renderApp();
}

function triggerCelebration() {
    // Confetti
    if (typeof confetti === 'function') {
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };
        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const fire = () => {
            confetti(Object.assign({}, defaults, { particleCount: 40, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
            confetti(Object.assign({}, defaults, { particleCount: 40, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        };

        // Fire a few bursts
        fire();
        setTimeout(fire, 200);
        setTimeout(fire, 400);
        setTimeout(fire, 600);
        setTimeout(fire, 800);
    }
}

export function showConflictValidationModal(conflicts) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'conflict-validation-modal';
    // Ensure Z-Index is significantly higher than the Update Itinerary Modal (z-index: 6000)
    modal.style.zIndex = '9999';
    // Force usage of flex display to override the default 'display: none' from .modal-overlay CSS class
    modal.style.display = 'flex';

    const listHtml = conflicts.map(name => `<li>${escapeHtml(name)}</li>`).join('');

    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden transform transition-all z-[9999]">
            <div class="bg-red-50 dark:bg-red-900/30 px-4 py-3 border-b border-red-200 dark:border-red-800 flex justify-between items-center">
                <h3 class="text-lg font-bold text-red-800 dark:text-red-200">Unresolved Conflicts</h3>
                <button onclick="document.body.removeChild(document.getElementById('conflict-validation-modal'))" class="text-gray-400 hover:text-gray-500">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="p-4">
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
                    The following events have schedule conflicts. You must resolve them before updating:
                </p>
                <ul class="list-disc list-inside text-sm font-medium text-gray-800 dark:text-gray-200 mb-4 bg-gray-50 dark:bg-gray-700/50 p-3 rounded border border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto">
                    ${listHtml}
                </ul>
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    <strong>Options:</strong>
                    <ul class="list-disc list-inside mt-1 ml-2">
                        <li>Find an alternative time (Reschedule)</li>
                        <li>Select <strong>"Mark Attending with Overlap"</strong> to allow the conflict</li>
                        <li>Select <strong>"Skip Adding to Planner"</strong> to ignore the event</li>
                    </ul>
                </div>
            </div>
            <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 flex justify-end">
                <button onclick="document.body.removeChild(document.getElementById('conflict-validation-modal'))" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm">
                    OK
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

