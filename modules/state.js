import {
    STORAGE_KEY_DATA, STORAGE_KEY_ATTENDANCE, STORAGE_KEY_HIDDEN_NAMES,
    STORAGE_KEY_HIDDEN_UIDS, STORAGE_KEY_SHOWN_UIDS, STORAGE_KEY_CUSTOM,
    STORAGE_KEY_PORT_NOTES, STORAGE_KEY_EVENT_NOTES, STORAGE_KEY_BLACKLIST,
    STORAGE_KEY_OPTIONAL_EVENTS, STORAGE_KEY_THEME, STORAGE_KEY_TIME_BLOCKS
} from './constants.js';

// --- State ---
export const state = {
    appData: [],
    customEvents: [],
    attendingIds: new Set(),
    hiddenNames: new Set(),
    hiddenUids: new Set(),
    shownUids: new Set(),
    portNotes: {},
    eventNotes: {},
    blacklist: new Set(),
    optionalEvents: new Set(),
    timeBlocks: {
        enabled: true,
        morning: 8,
        lunch: 11,
        afternoon: 13,
        dinner: 17,
        evening: 20
    },
    eventColors: {},
    imageColorCache: {},
    editMode: 'instance',
    eventNameMap: new Map(),
    eventLookup: new Map(),
    availableDates: [],
    showHiddenTemp: false,
    initialFormState: null,

    // Temp state
    currentCtxEvent: null,
    dragStartY: 0,
    dragColumnDate: null,
    dragPreviewEl: null,
    editingEvent: null,
    activePanelTab: 'required',
    activeHiddenTab: 'series',
    searchMode: 'title',

    // Hover helper
    currentTooltipTarget: null,
    activeTooltipUid: null,
    tooltipShowTime: 0,
    lastTouchTime: 0,
    justCreatedButton: false,
    justClearedSelection: false,

    // Confirm Callback
    confirmCallback: null,

    // Scroll Positions
    hiddenTabScrollPositions: {},
    attendancePanelScrollPositions: {}
};

// --- State Management Functions ---

export function loadFromStorage() {
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
    const storedTimeBlocks = localStorage.getItem(STORAGE_KEY_TIME_BLOCKS);

    if (storedData) {
        try { state.appData = JSON.parse(storedData); } catch (e) { return false; }
        if (storedCustom) try { state.customEvents = JSON.parse(storedCustom); } catch (e) { state.customEvents = []; }
        if (storedAttendance) try { state.attendingIds = new Set(JSON.parse(storedAttendance)); } catch (e) { }
        if (storedNames) try { state.hiddenNames = new Set(JSON.parse(storedNames)); } catch (e) { }
        if (storedUids) try { state.hiddenUids = new Set(JSON.parse(storedUids)); } catch (e) { }
        if (storedShown) try { state.shownUids = new Set(JSON.parse(storedShown)); } catch (e) { }
        if (storedNotes) try { state.portNotes = JSON.parse(storedNotes); } catch (e) { state.portNotes = {}; }
        if (storedEventNotes) try { state.eventNotes = JSON.parse(storedEventNotes); } catch (e) { state.eventNotes = {}; }
        if (storedBlacklist) try { state.blacklist = new Set(JSON.parse(storedBlacklist)); } catch (e) { state.blacklist = new Set(); }
        if (storedOptional) try { state.optionalEvents = new Set(JSON.parse(storedOptional)); } catch (e) { state.optionalEvents = new Set(); }
        if (storedTimeBlocks) try { state.timeBlocks = { ...state.timeBlocks, ...JSON.parse(storedTimeBlocks) }; } catch (e) { }

        return true;
    }
    return false;
}

export function saveData(json, newPortNotes = {}) {
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

    state.hiddenNames.clear();
    state.hiddenUids.clear();
    state.portNotes = newPortNotes;
    state.eventNotes = {};
    state.blacklist.clear();
    state.optionalEvents.clear();
    state.eventColors = {};
    state.attendingIds.clear();

    loadFromStorage(); // Reload to ensure sync
}

export function updateAppData(newEvents) {
    state.appData = newEvents;
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(newEvents));
    // We do NOT clear attendance, custom events, or notes here.
    // That's the whole point of the update feature.
    loadFromStorage();
}

export function restoreBackup(json) {
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(json.appData));
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(json.customEvents || []));
    localStorage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(json.attendingIds || []));
    localStorage.setItem(STORAGE_KEY_HIDDEN_NAMES, JSON.stringify(json.hiddenNames || []));
    localStorage.setItem(STORAGE_KEY_HIDDEN_UIDS, JSON.stringify(json.hiddenUids || []));
    localStorage.setItem(STORAGE_KEY_PORT_NOTES, JSON.stringify(json.portNotes || {}));
    localStorage.setItem(STORAGE_KEY_EVENT_NOTES, JSON.stringify(json.eventNotes || {}));
    localStorage.setItem(STORAGE_KEY_BLACKLIST, JSON.stringify(json.blacklist || []));
    localStorage.setItem(STORAGE_KEY_OPTIONAL_EVENTS, JSON.stringify(json.optionalEvents || []));
    localStorage.setItem(STORAGE_KEY_TIME_BLOCKS, JSON.stringify(json.timeBlocks || {}));
    loadFromStorage();
}

export function saveCustomEvents() {
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(state.customEvents));
}

export function saveAttendance() {
    localStorage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify([...state.attendingIds]));
}

export function saveHiddenNames() {
    localStorage.setItem(STORAGE_KEY_HIDDEN_NAMES, JSON.stringify([...state.hiddenNames]));
}

export function saveHiddenUids() {
    localStorage.setItem(STORAGE_KEY_HIDDEN_UIDS, JSON.stringify([...state.hiddenUids]));
}

export function saveShownUids() {
    localStorage.setItem(STORAGE_KEY_SHOWN_UIDS, JSON.stringify([...state.shownUids]));
}

export function savePortNote() {
    localStorage.setItem(STORAGE_KEY_PORT_NOTES, JSON.stringify(state.portNotes));
}

export function saveEventNotes() {
    localStorage.setItem(STORAGE_KEY_EVENT_NOTES, JSON.stringify(state.eventNotes));
}

export function saveBlacklist() {
    localStorage.setItem(STORAGE_KEY_BLACKLIST, JSON.stringify([...state.blacklist]));
}

export function saveOptionalEvents() {
    localStorage.setItem(STORAGE_KEY_OPTIONAL_EVENTS, JSON.stringify([...state.optionalEvents]));
}

export function saveTheme(theme) {
    localStorage.setItem(STORAGE_KEY_THEME, theme);
}

export function saveTimeBlocks() {
    localStorage.setItem(STORAGE_KEY_TIME_BLOCKS, JSON.stringify(state.timeBlocks));
}
