import { state, saveCustomEvents } from './state.js';
import { STORAGE_KEY_CUSTOM } from './constants.js';
import { renderApp } from './render.js';
import { showConfirm, closeAllModals } from './ui.js';

// --- Custom Events ---

export function getCustomEventFormData() {
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

export function tryCloseCustomModal() {
    const currentState = getCustomEventFormData();
    if (state.initialFormState && JSON.stringify(currentState) !== JSON.stringify(state.initialFormState)) {
        showConfirm("Discard unsaved changes?", () => {
            closeAllModals();
            state.initialFormState = null;
        }, "Unsaved Changes");
    } else {
        closeAllModals();
        state.initialFormState = null;
    }
}

export function initiateEdit(ev) {
    state.editingEvent = ev;

    // Check if it's a repeating event (has seriesId AND multiple instances exist)
    let isSeries = false;
    if (ev.seriesId) {
        const siblings = state.customEvents.filter(c => c.seriesId === ev.seriesId);
        if (siblings.length > 1) {
            isSeries = true;
        }
    }

    if (isSeries) {
        document.getElementById('edit-choice-modal').style.display = 'flex';
    } else {
        // Single event, just edit it
        state.editMode = 'instance'; // Default
        openEditForm(ev);
    }
}

export function confirmEditInstance() {
    state.editMode = 'instance';
    closeAllModals();
    openEditForm(state.editingEvent);
}

export function confirmEditSeries() {
    state.editMode = 'series';
    closeAllModals();
    openEditForm(state.editingEvent);
}

export function openEditForm(ev) {
    document.getElementById('custom-modal-title').textContent = "Edit Custom Event";
    document.getElementById('custom-title').value = ev.name;
    document.getElementById('custom-location').value = ev.location || '';
    document.getElementById('custom-desc').value = ev.longDescription || '';

    const dateSelect = document.getElementById('custom-date');
    dateSelect.innerHTML = '';
    state.availableDates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        if (d === ev.date) opt.selected = true;
        dateSelect.appendChild(opt);
    });

    const formatInput = (mins) => {
        let h = Math.floor(mins / 60) % 24;
        let m = Math.floor(mins % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };
    document.getElementById('custom-start').value = formatInput(ev.startMins);
    document.getElementById('custom-end').value = formatInput(ev.endMins);

    document.getElementById('custom-repeat-group').style.display = 'none';
    document.getElementById('custom-repeat').checked = false;

    openCustomModal();
}

export function openCustomModal() {
    document.getElementById('custom-event-modal').style.display = 'flex';
    setTimeout(() => {
        state.initialFormState = getCustomEventFormData();
    }, 10);
}

export function saveCustomEvent() {
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

    if (state.editingEvent) {
        if (state.editMode === 'series' && state.editingEvent.seriesId) {
            // Update all events in the series
            state.customEvents.forEach(c => {
                if (c.seriesId === state.editingEvent.seriesId) {
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
            const idx = state.customEvents.findIndex(c => c.uid === state.editingEvent.uid);
            if (idx !== -1) {
                state.customEvents[idx] = {
                    ...state.customEvents[idx],
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
            state.availableDates.forEach(d => {
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
        state.customEvents.push(...newEvents);
    }

    state.initialFormState = null;
    finalizeSave();
}

export function finalizeSave() {
    saveCustomEvents();
    closeAllModals();
    renderApp();
}

export function deleteCustomEvent(uid) {
    const ev = state.eventLookup.get(uid);
    if (!ev) return;

    const siblings = state.customEvents.filter(c => c.seriesId && c.seriesId === ev.seriesId);

    if (siblings.length > 1) {
        state.currentCtxEvent = ev;
        document.getElementById('delete-choice-modal').style.display = 'flex';
    } else {
        showConfirm("Delete this custom event?", () => {
            state.customEvents = state.customEvents.filter(c => c.uid !== uid);
            finalizeSave();
        }, "Delete Event");
    }
}

export function confirmDeleteInstance() {
    if (state.currentCtxEvent) {
        state.customEvents = state.customEvents.filter(c => c.uid !== state.currentCtxEvent.uid);
        finalizeSave();
    }
}

export function confirmDeleteSeries() {
    if (state.currentCtxEvent) {
        state.customEvents = state.customEvents.filter(c => c.seriesId !== state.currentCtxEvent.seriesId);
        finalizeSave();
    }
}

export function populateCustomModal(date, sMins, eMins) {
    state.editingEvent = null;
    document.getElementById('custom-modal-title').textContent = "New Custom Event";

    const dateSelect = document.getElementById('custom-date');
    dateSelect.innerHTML = '';
    state.availableDates.forEach(d => {
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
