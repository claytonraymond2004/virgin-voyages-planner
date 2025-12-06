import { state, saveAttendance, saveHiddenNames } from './state.js';
import { renderApp } from './render.js';
import { parseTimeRange } from './utils.js';
import { SHIFT_START_ADD, SHIFT_END_ADD } from './constants.js';

// --- Constants ---
const WIZARD_STEPS = {
    INTRO: 'intro',
    CHECKLIST: 'checklist',
    PROCESS: 'process',
    CONFLICTS: 'conflicts',
    PREVIEW: 'preview'
};

let currentWizardStep = WIZARD_STEPS.INTRO;
let proposedSchedule = new Set(); // Set of UIDs
let conflictList = []; // Array of conflict objects
let ignoredConflicts = new Set(); // Set of UIDs to ignore conflicts for
let skippedEvents = new Set(); // Set of Names
let removedEvents = new Set(); // Set of UIDs to remove from existing schedule

// State Backups for "Back" button functionality
let proposedScheduleBackup = null;
let skippedEventsBackup = null;
let conflictSelectionsBackup = null;
let rescheduleCallback = null;
let currentRescheduleTargetUid = null;
let restoreStateOnClose = null;

// --- Main Entry Point ---
export function initSmartScheduler(skipIntro = false) {
    window.isRescheduleMode = false;
    window.isIntroSkipped = skipIntro; // Store flag
    currentWizardStep = skipIntro ? WIZARD_STEPS.PROCESS : WIZARD_STEPS.INTRO;
    proposedSchedule.clear();
    conflictList = [];
    ignoredConflicts.clear();
    removedEvents.clear();
    skippedEvents.clear();
    conflictSelectionsBackup = null;
    restoreStateOnClose = null;
    renderWizard();
}

export function initRescheduleWizard(eventUid, onComplete = null) {
    window.isRescheduleMode = true;
    rescheduleCallback = onComplete;
    currentRescheduleTargetUid = eventUid;
    const ev = state.eventLookup.get(eventUid);
    if (!ev) {
        alert("Event not found.");
        return;
    }

    // 1. Initialize State
    proposedSchedule.clear();
    conflictList = [];
    ignoredConflicts.clear();
    removedEvents.clear();
    skippedEvents.clear();
    conflictSelectionsBackup = null;

    // 2. Populate Proposed Schedule (All attending EXCEPT target)
    state.attendingIds.forEach(uid => {
        if (uid !== eventUid) {
            proposedSchedule.add(uid);
        }
    });

    // 3. Identify Candidates (Future instances of the same series)
    const now = new Date();
    const allInstances = Array.from(state.eventLookup.values()).filter(e => e.name === ev.name);

    // Filter for future instances
    const candidates = allInstances.filter(instance => {
        // Must not be the exact same instance we are moving from (unless we want to allow keeping it? No, "Unable to Attend")
        if (instance.uid === eventUid) return false;

        const instanceDate = new Date(instance.date + 'T00:00:00');
        instanceDate.setMinutes(instance.startMins);
        return now <= instanceDate;
    });

    if (candidates.length === 0) {
        alert("No future occurrences found for this event.");
        return;
    }

    // Sort by time
    candidates.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startMins - b.startMins;
    });

    // 4. Create Conflict Entry
    // We treat this as a "conflict" so the user is forced to choose one.
    conflictList.push({
        name: ev.name,
        instances: candidates
    });

    // 5. Launch Wizard at Conflicts Step
    currentWizardStep = WIZARD_STEPS.CONFLICTS;
    renderWizard();
}

// --- Wizard Rendering ---
function renderWizard() {
    // Remove existing modal if any
    const existingModal = document.getElementById('smart-scheduler-modal');
    if (existingModal) existingModal.remove();

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'smart-scheduler-modal';
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.display = 'flex';

    // Close on click outside (optional, maybe safer to force buttons)
    // modalOverlay.onclick = (e) => { if(e.target === modalOverlay) closeWizard(); };

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content wizard-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'wizard-header';
    header.innerHTML = `
        <h2 class="text-xl font-bold text-[#AF231C]">Smart Scheduler</h2>
        <button class="text-gray-400 hover:text-gray-600" id="btn-close-wizard">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `;
    modalContent.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'wizard-body';
    body.id = 'wizard-body';
    modalContent.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'wizard-footer';
    footer.id = 'wizard-footer';
    modalContent.appendChild(footer);

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    document.getElementById('btn-close-wizard').onclick = closeWizard;

    renderStepContent(body, footer);
}

// Make global for UI closing logic
window.closeSmartSchedulerWizard = closeWizard;

function closeWizard() {
    const modal = document.getElementById('smart-scheduler-modal');
    if (modal) modal.remove();

    // Execute callback if valid (e.g. calling from Update Itinerary)
    if (window.isRescheduleMode && rescheduleCallback && !restoreStateOnClose) {
        rescheduleCallback();
        rescheduleCallback = null;
    }

    if (restoreStateOnClose) {
        const state = restoreStateOnClose;
        restoreStateOnClose = null; // Clear it so we don't loop

        // Restore functionality
        if (state.wasRescheduleMode) {
            initRescheduleWizard(state.targetUid, state.callback);
            // Restore selections if present
            if (state.selections) {
                conflictSelectionsBackup = state.selections;
            }
        } else {
            initSmartScheduler();
            // Restore selections if present
            if (state.selections) {
                conflictSelectionsBackup = state.selections;
            }

            // Skip to process
            setTimeout(() => {
                currentWizardStep = WIZARD_STEPS.PROCESS;
                // Re-finding elements because we just re-initialized (which re-renders wizard structure)
                const body = document.getElementById('wizard-body');
                const footer = document.getElementById('wizard-footer');
                if (body && footer) {
                    renderStepContent(body, footer);
                    setTimeout(runAlgorithm, 100);
                }
            }, 0);
        }
    }
}

function renderStepContent(bodyContainer, footerContainer) {
    bodyContainer.innerHTML = '';
    footerContainer.innerHTML = '';

    switch (currentWizardStep) {
        case WIZARD_STEPS.INTRO:
            renderIntroStep(bodyContainer, footerContainer);
            break;
        case WIZARD_STEPS.CHECKLIST:
            renderChecklistStep(bodyContainer, footerContainer);
            break;
        case WIZARD_STEPS.PROCESS:
            renderProcessStep(bodyContainer, footerContainer);
            break;
        case WIZARD_STEPS.CONFLICTS:
            renderConflictsStep(bodyContainer, footerContainer);
            break;
        case WIZARD_STEPS.PREVIEW:
            renderPreviewStep(bodyContainer, footerContainer);
            break;
    }
}

// --- Step 1: Intro ---
function renderIntroStep(body, footer) {
    body.innerHTML = `
        <div class="text-center space-y-4 p-4">
            <div class="bg-red-50 p-4 rounded-full inline-block mb-2">
                <svg class="w-12 h-12 text-[#AF231C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
                </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-800">Maximize Your Voyage</h3>
            <p class="text-gray-600 max-w-md mx-auto">
                The Smart Scheduler will automatically build a schedule for you. It prioritizes:
            </p>
            <ul class="text-left max-w-sm mx-auto space-y-2 text-gray-700 list-disc pl-5">
                <li><strong>Required Events:</strong> Ensures you don't miss anything important.</li>
                <li><strong>Locked Events:</strong> Respects events you've already marked as attending.</li>
                <li><strong>Efficiency:</strong> Finds the best time slots for recurring shows.</li>
            </ul>
        </div>
    `;

    footer.innerHTML = `
        <button class="btn-secondary" onclick="document.getElementById('btn-close-wizard').click()">Cancel</button>
        <button class="btn-primary" id="btn-intro-next">Get Started</button>
    `;

    document.getElementById('btn-intro-next').onclick = () => {
        currentWizardStep = WIZARD_STEPS.CHECKLIST;
        renderStepContent(document.getElementById('wizard-body'), document.getElementById('wizard-footer'));
    };
}

// --- Step 2: Checklist ---
function renderChecklistStep(body, footer) {
    // If skipping intro and user goes BACK from process step, they might land here.
    // That is fine, skipping is only for initial launch.
    const blacklistCount = state.blacklist.size;
    const customCount = state.customEvents.length;
    const customAttendingCount = state.customEvents.filter(e => state.attendingIds.has(e.uid)).length;
    // Calculate missing (required) events - distinct series
    const missingEvents = new Set();
    const allEvents = Array.from(state.eventLookup.values());
    allEvents.forEach(e => {
        if (!state.attendingIds.has(e.uid) && !state.hiddenNames.has(e.name) && !state.hiddenUids.has(e.uid) && !state.optionalEvents.has(e.name) && !state.blacklist.has(e.name)) {
            missingEvents.add(e.name);
        }
    });
    // Filter out if any instance is attended
    state.attendingIds.forEach(uid => {
        const ev = state.eventLookup.get(uid);
        if (ev && missingEvents.has(ev.name)) missingEvents.delete(ev.name);
    });

    const missingCount = missingEvents.size;
    const optionalCount = state.optionalEvents.size;
    const hiddenCount = state.hiddenNames.size + state.hiddenUids.size;

    body.innerHTML = `
        <div class="space-y-6 p-2">
            <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 border-b dark:border-gray-700 pb-2">Pre-Voyage Checklist</h3>
            <p class="text-sm text-gray-600 dark:text-gray-300">For the best results, please confirm you've done the following:</p>
            
            <div class="space-y-4">
                <label class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                    <div class="flex-shrink-0 mt-1">
                        <input type="checkbox" id="check-blacklist" class="w-5 h-5 text-red-600 rounded focus:ring-red-500">
                    </div>
                    <div>
                        <span class="font-medium text-gray-800 dark:text-gray-100 block">Blacklist Unwanted Events</span>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Events you never want to see. <span class="font-semibold text-gray-700 dark:text-gray-300">${blacklistCount} events blacklisted.</span></p>
                    </div>
                </label>

                <label class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                    <div class="flex-shrink-0 mt-1">
                        <input type="checkbox" id="check-custom" class="w-5 h-5 text-red-600 rounded focus:ring-red-500">
                    </div>
                    <div>
                        <span class="font-medium text-gray-800 dark:text-gray-100 block">Add & Lock Custom Events</span>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Add custom events for spa appointments, special meals, or other pre-booked activities. Mark them as attending to lock them in your schedule. <span class="font-semibold text-gray-700 dark:text-gray-300">${customCount} created, ${customAttendingCount} locked.</span></p>
                    </div>
                </label>

                <label class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                    <div class="flex-shrink-0 mt-1">
                        <input type="checkbox" id="check-optional" class="w-5 h-5 text-red-600 rounded focus:ring-red-500">
                    </div>
                    <div>
                        <span class="font-medium text-gray-800 dark:text-gray-100 block">Review Missing Events Panel</span>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Mark "nice-to-have" events as Optional. <span class="font-semibold text-gray-700 dark:text-gray-300">${missingCount} required, ${optionalCount} optional.</span></p>
                    </div>
                </label>

                <label class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                    <div class="flex-shrink-0 mt-1">
                        <input type="checkbox" id="check-hidden" class="w-5 h-5 text-red-600 rounded focus:ring-red-500">
                    </div>
                    <div>
                        <span class="font-medium text-gray-800 dark:text-gray-100 block">Hide Clutter</span>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Hide events you might attend spontaneously but don't need to plan for right now (trivia, live music, pool DJs, sports). <span class="font-semibold text-gray-700 dark:text-gray-300">${hiddenCount} currently hidden.</span></p>
                    </div>
                </label>
            </div>
        </div>
    `;

    footer.innerHTML = `
        <button class="btn-secondary" id="btn-checklist-back">Back</button>
        <button class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed" id="btn-checklist-next" disabled>Confirm & Continue</button>
    `;

    const checkboxes = body.querySelectorAll('input[type="checkbox"]');
    const nextBtn = document.getElementById('btn-checklist-next');

    const checkAll = () => {
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        nextBtn.disabled = !allChecked;
    };

    checkboxes.forEach(cb => cb.addEventListener('change', checkAll));

    document.getElementById('btn-checklist-back').onclick = () => {
        currentWizardStep = WIZARD_STEPS.INTRO;
        renderStepContent(document.getElementById('wizard-body'), document.getElementById('wizard-footer'));
    };

    nextBtn.onclick = () => {
        currentWizardStep = WIZARD_STEPS.PROCESS;
        renderStepContent(document.getElementById('wizard-body'), document.getElementById('wizard-footer'));
        // Small delay to allow UI to update before heavy processing
        setTimeout(runAlgorithm, 100);
    };
}

// --- Step 3: Process (Algorithm) ---
function renderProcessStep(body, footer) {
    body.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full space-y-4">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[#AF231C]"></div>
            <p class="text-gray-600 font-medium">Crunching the numbers...</p>
        </div>
    `;
    footer.innerHTML = '';

    // Automatically start processing
    setTimeout(runAlgorithm, 1000);
}

function runAlgorithm() {
    // 1. Identify "Locked" events (Attending)
    const lockedEvents = [];
    // Add appData events that are attending
    state.appData.forEach(ev => {
        if (state.attendingIds.has(ev.uid)) lockedEvents.push(ev);
    });
    // Add custom events that are attending
    state.customEvents.forEach(ev => {
        if (state.attendingIds.has(ev.uid)) lockedEvents.push(ev);
    });

    // 2. Identify Candidates (Required, Not Hidden, Not Blacklisted, Not Optional, Not already Attending)
    // 2. Identify Candidates (Required, Not Hidden, Not Blacklisted, Not Optional, Not already Attending)
    // Use eventLookup to ensure we have UIDs and parsed times
    const allEvents = Array.from(state.eventLookup.values());

    const candidates = allEvents.filter(ev => {
        if (state.attendingIds.has(ev.uid)) return false; // Already attended
        if (state.hiddenNames.has(ev.name)) return false;
        if (state.hiddenUids.has(ev.uid)) return false;
        if (state.blacklist.has(ev.name)) return false;
        if (state.optionalEvents.has(ev.name)) return false;
        if (ev.name === "Bingo Card Sales") return false; // Handled specially by "Bingo with..." logic
        return true;
    }).map(ev => {
        // Map startMins to startMinutes for compatibility with existing algo logic
        return { ...ev, startMinutes: ev.startMins, endMinutes: ev.endMins };
    });

    // 3. Group by Series (Name)
    const seriesMap = new Map();
    candidates.forEach(ev => {
        if (!seriesMap.has(ev.name)) seriesMap.set(ev.name, []);
        seriesMap.get(ev.name).push(ev);
    });

    // 4. Bingo Special Logic: Merge "Bingo Card Sales" with "Bingo with..."
    // If we select a "Bingo with..." event, we MUST also select the preceding "Bingo Card Sales".
    // We will treat them as a combined block for conflict checking.
    // For simplicity in this greedy algo, we can just pre-filter:
    // When considering a "Bingo with..." candidate, we check if the corresponding Sales event is available.

    // When considering a "Bingo with..." candidate, we check if the corresponding Sales event is available.


    proposedSchedule = new Set();
    conflictList = [];

    // Sort series by "constraint" (fewest options first)
    const sortedSeries = Array.from(seriesMap.entries()).sort((a, b) => a[1].length - b[1].length);

    const tempAttending = new Set(state.attendingIds); // Start with existing attendance

    for (const [name, instances] of sortedSeries) {
        // Try to find an instance that doesn't conflict
        let selectedInstance = null;

        // Sort instances by time (earliest first) - arbitrary preference
        instances.sort((a, b) => a.startMinutes - b.startMinutes);

        for (const instance of instances) {
            if (!hasConflict(instance, tempAttending)) {

                // Special Bingo Check
                if (instance.name.startsWith("Bingo with")) {
                    // Find corresponding sales
                    const salesEvent = findBingoSales(instance);
                    if (salesEvent) {
                        if (!hasConflict(salesEvent, tempAttending)) {
                            // Both fit!
                            selectedInstance = instance;
                            // Add sales event too
                            tempAttending.add(salesEvent.uid);
                            proposedSchedule.add(salesEvent.uid);
                            break;
                        }
                    } else {
                        // No sales found? weird. Just schedule the game if it fits.
                        selectedInstance = instance;
                        break;
                    }
                } else {
                    selectedInstance = instance;
                    break;
                }
            }
        }

        if (selectedInstance) {
            tempAttending.add(selectedInstance.uid);
            proposedSchedule.add(selectedInstance.uid);
        } else {
            // CONFLICT DETECTED!
            // We couldn't find ANY instance of this series that fits.
            // We need to ask the user.
            // We'll add ALL instances of this series to the conflict list for the user to choose.
            conflictList.push({
                name: name,
                instances: instances
            });
        }
    }

    // Done processing
    if (conflictList.length > 0) {
        currentWizardStep = WIZARD_STEPS.CONFLICTS;
    } else {
        currentWizardStep = WIZARD_STEPS.PREVIEW;
    }
    renderStepContent(document.getElementById('wizard-body'), document.getElementById('wizard-footer'));
}

function findBingoSales(bingoGameEvent) {
    // Look for "Bingo Card Sales" on the same day, before the game
    // Heuristic: Sales usually start 1-2 hours before

    // We must search ALL events, even hidden ones, so we cannot rely on state.eventLookup.
    const candidates = [];

    // 1. Official Events
    if (state.appData) {
        state.appData.forEach(ev => {
            if (ev.name === "Bingo Card Sales" && ev.date === bingoGameEvent.date) {
                const timeData = parseTimeRange(ev.timePeriod);
                if (timeData) {
                    const s = timeData.start + SHIFT_START_ADD;
                    const e = timeData.end + SHIFT_END_ADD;
                    const uid = `${ev.date}_${ev.name}_${s}`;
                    candidates.push({ ...ev, startMins: s, endMins: e, uid: uid });
                }
            }
        });
    }

    // 2. Custom Events
    if (state.customEvents) {
        state.customEvents.forEach(ev => {
            if (ev.name === "Bingo Card Sales" && ev.date === bingoGameEvent.date) {
                let s, e;
                if (ev.startMinutes !== undefined) {
                    s = ev.startMinutes;
                    e = ev.endMinutes;
                } else {
                    const timeData = parseTimeRange(ev.timePeriod);
                    if (timeData) {
                        s = timeData.start + SHIFT_START_ADD;
                        e = timeData.end + SHIFT_END_ADD;
                    }
                }

                if (s !== undefined) {
                    // Custom events should have a UID
                    const uid = ev.uid || `${ev.date}_${ev.name}_${s}`;
                    candidates.push({ ...ev, startMins: s, endMins: e, uid: uid });
                }
            }
        });
    }

    const sales = candidates.find(ev => {
        const salesEnd = ev.endMins;
        const gameStart = bingoGameEvent.startMins ?? bingoGameEvent.startMinutes;
        return salesEnd <= gameStart && salesEnd >= gameStart - 120;
    });

    // CRITICAL: If we found a hidden sales event, we MUST add it to eventLookup
    // Otherwise, conflict detection (getConflictingEvents) will fail to see it
    // because it relies on looking up UIDs in state.eventLookup.
    if (sales && !state.eventLookup.has(sales.uid)) {
        state.eventLookup.set(sales.uid, sales);
    }

    return sales;
}



function hasConflict(event, attendingSet) {
    // Check against all events in attendingSet
    for (const uid of attendingSet) {
        const attendingEvent = state.eventLookup.get(uid);
        if (!attendingEvent) continue;

        // Check overlap
        // Same day?
        if (event.date !== attendingEvent.date) continue;

        // Overlap logic: (StartA < EndB) and (EndA > StartB)
        // event uses startMinutes (mapped), attendingEvent uses startMins (raw from lookup)
        if (event.startMinutes < attendingEvent.endMins && event.endMinutes > attendingEvent.startMins) {
            return true;
        }
    }
    return false;
}

// --- Step 4: Conflicts ---
function renderConflictsStep(body, footer) {
    body.innerHTML = `
        <div class="p-2 space-y-4">
            <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">Schedule Conflicts</h3>
            <p class="text-sm text-gray-600 dark:text-gray-300">We found some event conflicts we couldn't resolve automatically. For each event, please select when you would like to schedule it. Check "Allow Overlap" if you would like to allow the conflicting event(s) to be scheduled at the same time.</p>
            <p class="text-xs text-gray-500 italic dark:text-gray-400">* Event cannot be rescheduled - Single occurrence, custom event, or past event</p>
            <div id="conflicts-list" class="space-y-4"></div>
        </div>
    `;

    const list = document.getElementById('conflicts-list');

    conflictList.forEach((conflict, index) => {
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm';

        // Determine default selection
        let selectedValue = 'skip';
        let isOverlapAllowed = false;

        if (conflictSelectionsBackup) {
            const saved = conflictSelectionsBackup.find(s => s.name === conflict.name);
            if (saved) {
                selectedValue = saved.value;
                if (saved.value !== 'skip') {
                    isOverlapAllowed = saved.allowOverlap;
                }
            }
        }

        let html = `<h4 class="font-bold text-[#AF231C] dark:text-[#D14942] mb-2">${conflict.name}</h4>`;
        html += `<div class="space-y-2">`;

        // Option to Skip
        html += `
            <label class="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                <input type="radio" name="conflict_${index}" value="skip" ${selectedValue === 'skip' ? 'checked' : ''} class="text-red-600 focus:ring-red-500 mt-0.5">
                <div class="text-sm">
                    <span class="font-semibold text-gray-700 dark:text-gray-200 block">Skip this event</span>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Do not schedule any occurrence.</p>
                </div>
            </label>
        `;

        // Options for each instance (even if conflicting)
        conflict.instances.forEach(instance => {
            const timeStr = formatTime(instance.startMins ?? instance.startMinutes) + ' - ' + formatTime(instance.endMins ?? instance.endMinutes);
            const conflictsWith = getConflictingEvents(instance);

            // Check against other items in conflictList
            conflictList.forEach(otherConflict => {
                if (otherConflict.name === conflict.name) return; // Don't check self
                otherConflict.instances.forEach(otherInst => {
                    if (checkOverlap(instance, otherInst)) {
                        conflictsWith.push(otherInst);
                    }
                });
            });

            // Check against unused instances of Scheduled Series (Opportunity Cost)
            // Find all series currently in proposedSchedule
            const scheduledSeriesNames = new Set();
            proposedSchedule.forEach(uid => {
                const ev = state.eventLookup.get(uid);
                if (ev) scheduledSeriesNames.add(ev.name);
            });

            // For each scheduled series, check all its instances
            scheduledSeriesNames.forEach(name => {
                if (name === conflict.name) return; // Don't check self
                // Find all instances of this series
                const seriesInstances = Array.from(state.eventLookup.values()).filter(e => e.name === name);

                seriesInstances.forEach(si => {
                    if (checkOverlap(instance, si)) {
                        // Only add if not already in list (avoid duplicates with the actual scheduled one)
                        if (!conflictsWith.some(c => c.uid === si.uid)) {
                            conflictsWith.push(si);
                        }
                    }
                });
            });

            // Deduplicate
            const uniqueConflicts = [];
            const seenUids = new Set();
            conflictsWith.forEach(c => {
                if (!seenUids.has(c.uid)) {
                    seenUids.add(c.uid);
                    uniqueConflicts.push(c);
                }
            });

            const conflictListItems = uniqueConflicts.map(c => {
                const totalInstances = Array.from(state.eventLookup.values()).filter(ev => ev.name === c.name).length;
                const mark = totalInstances === 1 ? '*' : '';
                const timeStr = `${formatTime(c.startMins ?? c.startMinutes)} - ${formatTime(c.endMins ?? c.endMinutes)}`;
                let itemHtml = `<span class="font-medium">${mark}${c.name}</span> <span class="text-xs opacity-75">(${timeStr})</span>`;

                // Add "Find Alternative" text button inline if applicable
                if (totalInstances > 1 && !c.isCustom) {
                    const lockedForCheck = new Set([...state.attendingIds, ...proposedSchedule]);
                    lockedForCheck.add(instance.uid);
                    lockedForCheck.delete(c.uid);

                    if (canMoveSeries(c.name, lockedForCheck, 0)) {
                        const safeName = c.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                        const safeUid = c.uid.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                        const safeInstanceUid = instance.uid.replace(/'/g, "\\'").replace(/"/g, '&quot;');

                        itemHtml += ` - <button class="underline hover:no-underline font-medium focus:outline-none text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors" onclick="event.preventDefault(); window.smartSchedulerRescheduleConflict('${safeName}', '${safeUid}', '${safeInstanceUid}')">Find Alternative</button>`;
                    }
                }

                return `<li>${itemHtml}</li>`;
            }).join('');

            html += `
                <label class="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                    <input type="radio" name="conflict_${index}" value="${instance.uid}" ${selectedValue === instance.uid ? 'checked' : ''} class="text-red-600 focus:ring-red-500 mt-0.5">
                    <div class="text-sm w-full flex justify-between items-center">
                        <div class="flex-grow pr-2">
                            <span class="font-semibold text-gray-800 dark:text-gray-200 block">${instance.date} @ ${timeStr}</span>
                            ${conflictListItems ? `
                                <div class="mt-1">
                                    <p class="text-xs text-red-600 dark:text-red-400 font-semibold mb-0.5">⚠️ Conflicts with:</p>
                                    <ul class="list-disc pl-5 text-xs text-red-600 dark:text-red-400 space-y-0.5">
                                        ${conflictListItems}
                                    </ul>
                                </div>
                            ` : ''}
                        </div>
                        <label class="flex flex-col md:flex-row items-center gap-1 md:gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer p-2 -m-2 flex-shrink-0" onclick="event.stopPropagation()">
                            <input type="checkbox" name="allow_overlap_${index}_${instance.uid}" ${selectedValue === instance.uid && isOverlapAllowed ? 'checked' : ''} class="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-500">
                            <span class="text-center md:text-left w-min md:w-auto leading-none">Allow Overlap</span>
                        </label>
                    </div>
                </label>
            `;
        });

        html += `</div>`;
        card.innerHTML = html;
        list.appendChild(card);
    });

    footer.innerHTML = `
        <button class="btn-secondary" id="btn-conflicts-back">Back</button>
        <button class="btn-primary" id="btn-conflicts-next">Resolve & Continue</button>
    `;

    const cancelBtn = document.getElementById('btn-conflicts-back');
    const nextBtn = document.getElementById('btn-conflicts-next');

    // Logic: 
    // If in Global Mode: Show "Back" (to Checklist)
    // If in Reschedule Mode (Single Event): Hide "Back" usually...
    // UNLESS it's a nested Reschedule (launched via Find Alternative), in which case "Back" becomes "Cancel" (to return to parent).

    // How to detect Nested Reschedule?
    // We can check if 'restoreStateOnClose' is populated? 
    // Wait, restoreStateOnClose is populated BEFORE calling initRescheduleWizard.
    // So if restoreStateOnClose is NOT null, we are nested.

    if (window.isRescheduleMode) {
        // Reschedule Mode -> Show Cancel
        cancelBtn.style.display = 'inline-block';
        cancelBtn.innerText = 'Cancel';
        cancelBtn.onclick = () => {
            closeWizard();
        };
    } else {
        // Global Smart Scheduler Mode -> Standard Back
        cancelBtn.style.display = 'inline-block';
        cancelBtn.innerText = 'Back';
        cancelBtn.onclick = () => {
            // Clear backups if going back further
            proposedScheduleBackup = null;
            skippedEventsBackup = null;

            if (window.isIntroSkipped) {
                // Do not allow going back to checklist if intro was skipped
                // Treat as Cancel
                closeWizard();
            } else {
                currentWizardStep = WIZARD_STEPS.CHECKLIST; // Go back to checklist? Or re-run?
                // Maybe just re-run algo?
                renderStepContent(document.getElementById('wizard-body'), document.getElementById('wizard-footer'));
            }
        };
    }

    nextBtn.onclick = () => {
        // Snapshot state before applying changes
        proposedScheduleBackup = new Set(proposedSchedule);
        skippedEventsBackup = new Set(skippedEvents);
        applyDeadlockSelection();
    };
}

function applyDeadlockSelection() {
    const list = document.getElementById('conflicts-list');
    const inputs = list.querySelectorAll('input[type="radio"]:checked');

    const selections = [];
    inputs.forEach(input => {
        const conflictIndex = parseInt(input.name.split('_')[1]);
        const value = input.value;
        const conflict = conflictList[conflictIndex];

        const allowOverlapInput = list.querySelector(`input[name="allow_overlap_${conflictIndex}_${value}"]`);
        const allowOverlap = allowOverlapInput ? allowOverlapInput.checked : false;

        selections.push({
            name: conflict.name,
            value: value,
            instances: conflict.instances,
            allowOverlap: allowOverlap
        });
    });

    // Validation: Check for unresolved conflicts
    const blockingConflicts = [];
    selections.forEach(sel => {
        if (sel.value === 'skip') return;
        if (sel.allowOverlap) return; // Overlap allowed, no blocker

        const selectedEvent = state.eventLookup.get(sel.value);
        if (!selectedEvent) return;

        // Check conflicts against currently scheduled items
        // Note: getConflictingEvents checks against state.attendingIds AND proposedSchedule
        // We need to ensure we don't count conflicts with ITSELF (though it shouldn't be in proposed yet?)
        // Actually, proposedSchedule might contain items we are about to add? No, we haven't added them yet.
        const conflicts = getConflictingEvents(selectedEvent);

        // We only care about conflicts that are NOT correctly handled.
        // If the conflict is in the 'conflictList' (i.e., we are actively resolving it), it shouldn't trigger this?
        // Wait, 'conflictList' contains the events we are resolving. The 'conflicts' array returned here contains the BLOCKING events.
        // If we select a slot, and it conflicts with 'Event B', and we didn't check 'Allow Overlap',
        // previously we would displace 'Event B'. Now we want to block.

        if (conflicts.length > 0) {
            conflicts.forEach(c => {
                // We need to be careful: is 'c' one of the other events being resolved right now?
                // If so, and we haven't processed its selection yet, is it a real conflict?
                // The 'proposedSchedule' contains confirmed events. 'state.attendingIds' contains confirmed events.
                // Events in the current resolving batch are NOT in proposedSchedule yet.
                // So 'c' must be an already-scheduled event.
                blockingConflicts.push({ source: sel.name, blocker: c.name });
            });
        }
    });

    if (blockingConflicts.length > 0) {
        // Construct error message
        const uniqueBlockers = [...new Set(blockingConflicts.map(x => `<div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded p-2 mb-2 text-sm text-red-800 dark:text-red-200"><span class="font-bold">${x.source}</span> conflicts with <span class="font-bold">${x.blocker}</span></div>`))];
        const msg = `<div class="mb-4 text-gray-700 dark:text-gray-300">The following conflicts prevent you from proceeding:</div>` +
            `<div class="mb-4">${uniqueBlockers.join('')}</div>` +
            `<div class="text-sm text-gray-600 dark:text-gray-400"><p class="mb-2 font-medium">Please resolve these conflicts by:</p><ul class="list-disc pl-5 space-y-1"><li>Skipping the event</li><li>Checking 'Allow Overlap'</li><li>Finding an alternative time for the conflicting event</li><li>Removing the conflicting event</li></ul></div>`;

        import('./ui.js').then(ui => {
            ui.showGenericChoice(
                "Unresolved Conflicts",
                msg,
                "OK",
                () => { }, // Close modal
                null,
                null
            );
        });
        return; // Stop processing
    }

    // Process selections
    // For each selection that is NOT 'skip', we force it.
    // This might displace existing proposed events.
    // If an event is displaced, we must try to reschedule it (find another instance).

    let somethingChanged = false;
    const displacedSeries = new Set();

    selections.forEach(sel => {
        if (sel.value === 'skip') {
            skippedEvents.add(sel.name);
            return;
        }

        const selectedUid = sel.value;
        const selectedEvent = state.eventLookup.get(selectedUid);
        if (!selectedEvent) return;

        // 1. Find what it conflicts with in proposedSchedule
        const conflicts = getConflictingEvents(selectedEvent);

        // 2. Remove conflicts from proposedSchedule (UNLESS overlap is allowed)
        if (!sel.allowOverlap) {
            conflicts.forEach(conflictEv => {
                const removed = removeEventFromSchedule(conflictEv.uid);
                removed.forEach(name => displacedSeries.add(name));
                if (removed.size > 0) somethingChanged = true;
            });
        }

        // 3. Add selection
        proposedSchedule.add(selectedUid);

        // Bingo Special: Add sales if needed
        if (selectedEvent.name.startsWith("Bingo with")) {
            const sales = findBingoSales(selectedEvent);
            if (sales) {
                // Check if sales conflicts
                const salesConflicts = getConflictingEvents(sales);
                salesConflicts.forEach(sc => {
                    if (proposedSchedule.has(sc.uid)) {
                        // If overlap allowed for main event, we probably should allow for sales too?
                        // Or strictly follow the checkbox? 
                        // Let's assume checkbox applies to the BLOCK.
                        if (!sel.allowOverlap) {
                            proposedSchedule.delete(sc.uid);
                            displacedSeries.add(sc.name);
                            somethingChanged = true;
                        }
                    }
                });
                proposedSchedule.add(sales.uid);
            }
        }
    });

    // 4. Re-schedule displaced series
    if (displacedSeries.size > 0) {
        // We need to try to find spots for these displaced series
        // We can reuse the greedy logic, but only for these specific series
        // And we must respect the ALREADY proposed schedule (including the user's forced choices)

        // Define locked UIDs (User choices + Existing Attending)
        const lockedUids = new Set([...state.attendingIds]);
        const justSelectedUids = new Set();
        selections.forEach(sel => {
            if (sel.value !== 'skip') {
                lockedUids.add(sel.value);
                justSelectedUids.add(sel.value);
            }
        });

        // Predicate to avoid circular conflicts with the user's immediate selection
        const avoidJustSelected = (instance) => {
            for (const uid of justSelectedUids) {
                const lockedEvent = state.eventLookup.get(uid);
                if (lockedEvent && checkOverlap(instance, lockedEvent)) {
                    return false;
                }
            }
            return true;
        };

        displacedSeries.forEach(seriesName => {
            const success = smartReschedule(seriesName, lockedUids, 0, avoidJustSelected);
            if (!success) {
                // If we failed to reschedule, we need to add it to the conflict list
                // But smartReschedule already adds it to conflictList if it fails!
                // So we don't need to do anything here.
                // However, we need to ensure that the conflict list actually grew.
            }
        });
    }

    // Check if we have NEW conflicts (size increased)
    // We do NOT remove resolved conflicts from the list, so that the Back button works.
    // We only check if the list grew (meaning new displacement conflicts were added).

    // Note: We need to know if we are "done". 
    // We are done if we didn't add any NEW conflicts.
    // The original conflicts are considered "handled" by the user's selection.

    // However, if we just check length > initial, we might miss if we are re-running?
    // Actually, smartReschedule checks for existence before pushing.

    // Let's track if smartReschedule failed.
    // But smartReschedule returns false on failure.
    // We didn't capture return values above.

    // Let's check if conflictList length increased.
    // But wait, applyDeadlockSelection doesn't know the "start" length easily unless we passed it or check it.
    // Actually, we can just check if the current conflictList contains any *new* items that weren't there before?
    // Or simpler: The user just resolved the items that were presented.
    // If smartReschedule added items, they are new.
    // So if (conflictList.length > inputs.length) ? No, inputs is just checked ones.

    // Let's assume if we are at this step, conflictList had some size N.
    // We presented N items.
    // If smartReschedule adds items, size becomes > N.
    // So we need to capture size at start.

    // But wait, I can't capture it easily inside this replacement block unless I change the whole function.
    // Let's look at where I am editing.
    // I am editing the end of applyDeadlockSelection.
    // Check if we have NEW conflicts (size increased)
    // We do NOT remove resolved conflicts from the list, so that the Back button works.
    // We only check if the list grew (meaning new displacement conflicts were added).

    const handledNames = new Set(selections.map(s => s.name));
    const hasUnhandledConflicts = conflictList.some(c => !handledNames.has(c.name));

    if (hasUnhandledConflicts) {
        currentWizardStep = WIZARD_STEPS.CONFLICTS;
        renderStepContent(document.getElementById('wizard-body'), document.getElementById('wizard-footer'));
    } else {
        // If we are in "Reschedule Mode" (initRescheduleWizard), skip preview and apply immediately
        if (window.isRescheduleMode) {
            applySchedule();
            closeWizard();
        } else {
            // Actually, the user requested "Skip the schedule preview in smart scheduler if just resolving a conflict from a find alternative menu."
            // We can add a flag to initRescheduleWizard.

            if (window.isRescheduleMode) {
                applySchedule();
                closeWizard();
                // Jump to the new event? We don't know the UID easily here without searching proposedSchedule.
                // But the user asked for this in a previous step, and we handled it in interactions.js.
                // Here we just need to close.
                // Wait, interactions.js calls initRescheduleWizard, which opens this modal.
                // If we close here, interactions.js callback for "View Options" is already done.
                // So we are good.
            } else {
                currentWizardStep = WIZARD_STEPS.PREVIEW;
                renderStepContent(document.getElementById('wizard-body'), document.getElementById('wizard-footer'));
            }
        }
    }
}

function getConflictingEvents(event) {
    const conflicts = [];
    const tempAttending = new Set([...state.attendingIds, ...proposedSchedule]);

    for (const uid of tempAttending) {
        if (removedEvents.has(uid)) continue;

        const attendingEvent = state.eventLookup.get(uid);
        if (!attendingEvent) continue;

        // Don't conflict with self or other instances of the same series (we are rescheduling the series)
        if (attendingEvent.name === event.name) continue;

        if (checkOverlap(event, attendingEvent)) {
            conflicts.push(attendingEvent);
        }
    }

    return conflicts;
}

function formatTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// --- Step 5: Preview ---
function renderPreviewStep(body, footer) {
    const events = [];

    // 1. Add Proposed (New)
    proposedSchedule.forEach(uid => {
        const ev = state.eventLookup.get(uid);
        if (ev) events.push({ ...ev, isNew: true });
    });

    // 2. Add Existing Attending
    state.attendingIds.forEach(uid => {
        if (!proposedSchedule.has(uid) && !removedEvents.has(uid)) {
            const ev = state.eventLookup.get(uid);
            if (ev) events.push({ ...ev, isNew: false });
        }
    });

    // Group by Date
    const byDay = {};
    events.forEach(ev => {
        if (!byDay[ev.date]) byDay[ev.date] = [];
        byDay[ev.date].push(ev);
    });

    // Sort Dates
    const sortedDates = Object.keys(byDay).sort();

    // Count only NEW events for the chip
    const newEventsCount = events.filter(e => e.isNew).length;

    let html = `<div class="p-2 space-y-4 h-full flex flex-col">
    <div class="flex items-center justify-between flex-shrink-0">
            <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">Review Your Schedule</h3>
            <span class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full">Adding ${newEventsCount} Events</span>
    </div>
    <div class="space-y-4 overflow-y-auto pr-2 flex-grow">`;

    if (events.length === 0) {
        html += `<div class="text-center py-10 text-gray-500 dark:text-gray-400 italic">No new events selected to add.</div>`;
    }

    if (skippedEvents.size > 0) {
        html += `
        <div class="border border-yellow-200 dark:border-yellow-900/50 rounded-lg overflow-hidden shadow-sm mt-4">
            <div class="bg-yellow-50 dark:bg-yellow-900/20 px-4 py-2 font-semibold text-yellow-800 dark:text-yellow-200 border-b border-yellow-200 dark:border-yellow-900/50 text-sm flex items-center gap-2">
                <span>⚠️</span> Skipped Events
            </div>
            <div class="divide-y divide-yellow-100 dark:divide-yellow-900/30 bg-white dark:bg-gray-900">
    `;
        skippedEvents.forEach(name => {
            html += `
            <div class="p-3 flex items-center gap-2">
                    <div class="font-medium text-gray-700 dark:text-gray-300 text-sm">${name}</div>
            </div>
        `;
        });
        html += `</div></div>`;
    }

    if (removedEvents.size > 0) {
        html += `
        <div class="border border-red-200 dark:border-red-900/50 rounded-lg overflow-hidden shadow-sm mt-4">
            <div class="bg-red-50 dark:bg-red-900/20 px-4 py-2 font-semibold text-red-800 dark:text-red-200 border-b border-red-200 dark:border-red-900/50 text-sm flex items-center gap-2">
                <span>🗑️</span> Removed Events
            </div>
            <div class="divide-y divide-red-100 dark:divide-red-900/30 bg-white dark:bg-gray-900">
    `;
        removedEvents.forEach(uid => {
            const ev = state.eventLookup.get(uid);
            if (ev) {
                html += `
            <div class="p-3 flex items-center gap-2">
                    <div class="font-medium text-gray-700 dark:text-gray-300 text-sm">${ev.name}</div>
                    <div class="text-xs text-gray-500">${ev.date} @ ${formatTime(ev.startMins)}</div>
            </div>
        `;
            }
        });
        html += `</div></div>`;
    }

    sortedDates.forEach(date => {
        const dayEvents = byDay[date].sort((a, b) => a.startMins - b.startMins);

        html += `
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
            <div class="bg-gray-50 dark:bg-gray-700 px-4 py-2 font-semibold text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 text-sm">
                ${date}
            </div>
            <div class="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
    `;

        dayEvents.forEach(ev => {
            // Check Conflicts
            const conflicts = [];

            // 1. Check against Existing Attending
            state.attendingIds.forEach(uid => {
                const other = state.eventLookup.get(uid);
                if (other && other.date === ev.date && other.uid !== ev.uid) {
                    if (ev.startMins < other.endMins && ev.endMins > other.startMins) {
                        conflicts.push(other.name);
                    }
                }
            });

            // 2. Check against Other Proposed
            proposedSchedule.forEach(uid => {
                const other = state.eventLookup.get(uid);
                if (other && other.date === ev.date && other.uid !== ev.uid) {
                    if (ev.startMins < other.endMins && ev.endMins > other.startMins) {
                        conflicts.push(other.name);
                    }
                }
            });

            const uniqueConflicts = [...new Set(conflicts)];
            const hasConflict = uniqueConflicts.length > 0;
            const rowClass = hasConflict ? "bg-red-50 dark:bg-[#3b0764]" : "";

            const isPlaceholder = !ev.imageUrl || ev.imageUrl === 'virgin_placeholder.png';
            const imgSrc = ev.imageUrl || 'virgin_placeholder.png';
            // If placeholder, scale it up to hide white background (like in print view)
            const imgStyle = isPlaceholder ? 'transform: scale(1.4);' : '';

            html += `
            <div class="p-3 ${rowClass} flex items-start hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div class="w-12 h-12 rounded overflow-hidden mr-3 flex-shrink-0 bg-gray-200 dark:bg-gray-600 relative">
                    <img src="${imgSrc}" 
                            class="w-full h-full object-cover transition-transform duration-200" 
                            style="${imgStyle}"
                            onerror="this.src='virgin_placeholder.png'; this.style.transform='scale(1.4)';">
                </div>
                <div class="flex-grow min-w-0 flex justify-between items-start">
                    <div class="mr-2">
                        <div class="font-medium text-gray-900 dark:text-gray-100 text-sm ${hasConflict ? 'text-red-700 dark:text-red-300' : ''}">
                            ${ev.name}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${formatTime(ev.startMins)} - ${formatTime(ev.endMins)} <span class="mx-1">•</span> ${ev.location}</div>
                    </div>
                    <div class="flex flex-col items-end gap-1 flex-shrink-0">
                        ${!ev.isNew ? '<span class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium px-2 py-0.5 rounded">Planned</span>' : '<span class="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-medium px-2 py-0.5 rounded">Adding to Planner</span>'}
                        ${hasConflict ? '<span class="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 text-xs font-medium px-2 py-0.5 rounded">Event Overlap</span>' : ''}
                    </div>
                </div>
            </div>
        `;
        });

        html += `</div></div>`;
    });

    html += `</div></div>`;

    body.innerHTML = html;

    footer.innerHTML = `
    <button class="btn-secondary" id="btn-preview-back">Back</button>
    <button class="btn-primary" id="btn-apply">Confirm & Apply</button>
`;

    document.getElementById('btn-preview-back').onclick = () => {
        // Restore state if available
        if (proposedScheduleBackup) {
            proposedSchedule = new Set(proposedScheduleBackup);
            skippedEvents = new Set(skippedEventsBackup);
        }

        // If we came from conflicts, go back there. If no conflicts, go back to checklist?
        // Actually, logic in runAlgorithm decides next step.
        // If we go back, we might need to re-run algo or just show previous screen.
        // Simplest is to go back to Checklist for now, or Conflicts if it was populated.
        if (conflictList.length > 0) {
            currentWizardStep = WIZARD_STEPS.CONFLICTS;
        } else {
            currentWizardStep = WIZARD_STEPS.CHECKLIST;
        }
        renderStepContent(document.getElementById('wizard-body'), document.getElementById('wizard-footer'));
    };

    document.getElementById('btn-apply').onclick = () => {
        applySchedule();

        // If we have a reschedule callback, call it!
        // This is crucial for the Nested Reschedule flow.
        if (rescheduleCallback) {
            rescheduleCallback();
            rescheduleCallback = null;
        }

        // Logic split:
        // If we are in nested mode (restoreStateOnClose exists), closeWizard() will trigger the restore.
        // If we are in normal mode, closeWizard() just closes.
        closeWizard();
    };
}

function getTimes(ev) {
    return {
        start: ev.startMinutes ?? ev.startMins,
        end: ev.endMinutes ?? ev.endMins
    };
}

function checkOverlap(ev1, ev2) {
    if (ev1.date !== ev2.date) return false;
    const t1 = getTimes(ev1);
    const t2 = getTimes(ev2);
    return t1.start < t2.end && t1.end > t2.start;
}

function applySchedule() {
    // Determine if we are replacing (Reschedule Mode) or adding (Smart Scheduler)
    if (window.isRescheduleMode) {
        state.attendingIds.clear();
        proposedSchedule.forEach(uid => state.attendingIds.add(uid));
    } else {
        // Additive Mode
        // 1. Remove events marked for removal (e.g. to resolve conflicts)
        removedEvents.forEach(uid => state.attendingIds.delete(uid));

        // 2. Add proposed events
        proposedSchedule.forEach(uid => state.attendingIds.add(uid));
    }

    // Update Hidden Names: Ensure all attended series are marked as hidden (to hide other instances)
    state.attendingIds.forEach(uid => {
        const ev = state.eventLookup.get(uid);
        if (ev) {
            state.hiddenNames.add(ev.name);
        }
    });

    saveAttendance();
    saveHiddenNames();
    renderApp();
    if (rescheduleCallback) {
        rescheduleCallback();
        rescheduleCallback = null;
    }
}



function canMoveSeries(seriesName, lockedUids, depth) {
    // Check if there is ANY free slot for this series (ignoring current proposed schedule for a moment? No, respecting it)
    // Actually, we need to check if there is a slot that DOES NOT conflict with lockedUids
    // AND does not conflict with proposedSchedule (except the ones we are about to remove? No, that's hard)

    // Heuristic: Just check if there is another instance that has NO conflicts with Locked UIDs.
    // We assume we can swap to it.

    const instances = Array.from(state.eventLookup.values()).filter(e => e.name === seriesName);

    return instances.some(inst => {
        // Check conflicts with LOCKED UIDs only
        // We assume we can displace other non-locked things if needed (recursion)
        // But for safety, let's just check for "Free or Displaceable"

        // For this check, let's just see if it conflicts with Locked UIDs.
        const conflicts = getConflictingEvents(inst);
        return !conflicts.some(c => lockedUids.has(c.uid));
    });
}

// Helper to remove event and its dependencies (Bingo)
// Returns Set of series names that were removed (for rescheduling)
function removeEventFromSchedule(uid) {
    const removedSeries = new Set();

    // Check if it's in proposedSchedule (New/Tentative)
    if (proposedSchedule.has(uid)) {
        proposedSchedule.delete(uid);
        const ev = state.eventLookup.get(uid);
        if (ev) {
            removedSeries.add(ev.name);

            if (ev.name.startsWith("Bingo with")) {
                // Remove Sales from Proposed
                const toRemove = [];
                for (const pUid of proposedSchedule) {
                    const pEv = state.eventLookup.get(pUid);
                    if (pEv && pEv.name === "Bingo Card Sales" && pEv.date === ev.date) {
                        toRemove.push(pUid);
                    }
                }
                toRemove.forEach(id => proposedSchedule.delete(id));

            } else if (ev.name === "Bingo Card Sales") {
                // Remove Game from Proposed
                const toRemove = [];
                for (const pUid of proposedSchedule) {
                    const pEv = state.eventLookup.get(pUid);
                    if (pEv && pEv.name.startsWith("Bingo with") && pEv.date === ev.date) {
                        toRemove.push(pUid);
                        removedSeries.add(pEv.name);
                    }
                }
                toRemove.forEach(id => proposedSchedule.delete(id));
            }
        }
    }
    // Check if it's in attendingIds (Existing) and not already marked for removal
    else if (state.attendingIds.has(uid) && !removedEvents.has(uid)) {
        removedEvents.add(uid);
        const ev = state.eventLookup.get(uid);
        if (ev) {
            removedSeries.add(ev.name);

            if (ev.name.startsWith("Bingo with")) {
                // Remove Sales from Existing
                state.attendingIds.forEach(attUid => {
                    const attEv = state.eventLookup.get(attUid);
                    if (attEv && attEv.name === "Bingo Card Sales" && attEv.date === ev.date) {
                        removedEvents.add(attUid);
                    }
                });
            } else if (ev.name === "Bingo Card Sales") {
                // Remove Game from Existing
                state.attendingIds.forEach(attUid => {
                    const attEv = state.eventLookup.get(attUid);
                    if (attEv && attEv.name.startsWith("Bingo with") && attEv.date === ev.date) {
                        removedEvents.add(attUid);
                        removedSeries.add(attEv.name);
                    }
                });
            }
        }
    }

    return removedSeries;
}

export function findAlternativeForEvent(eventUid) {
    const ev = state.eventLookup.get(eventUid);
    if (!ev) return { success: false, message: "Event not found." };

    // 1. Determine Time Constraints
    const now = new Date();
    // For testing/demo purposes, we might want to use a fixed time if provided in metadata, 
    // but the requirement says "browser time".
    // However, we need to know if we are "during the itinerary".
    // We can check if `now` is between start and end of available dates.

    let minStartMins = -1;

    if (state.availableDates.length > 0) {
        const firstDate = new Date(state.availableDates[0] + 'T00:00:00');
        const lastDate = new Date(state.availableDates[state.availableDates.length - 1] + 'T23:59:59');

        if (now >= firstDate && now <= lastDate) {
            // We are during the itinerary.
            // Calculate minutes from start of itinerary? 
            // No, our startMins are relative to 00:00 of the specific day usually?
            // Wait, `startMins` in our app is just minutes from midnight of THAT day.
            // But we need to filter instances that are in the future relative to NOW.

            // We can just use the Date object comparison for each instance.
            // The filterPredicate will handle this.
        }
    }

    const filterPredicate = (instance) => {
        // 1. Must not be the exact same instance we are moving from
        if (instance.uid === eventUid) return false;

        // 2. Future check
        // Construct instance date object
        const instanceDate = new Date(instance.date + 'T00:00:00');
        instanceDate.setMinutes(instance.startMins);

        if (now > instanceDate) return false; // In the past

        return true;
    };

    // Note: The search for alternatives includes both time and date.
    // We prioritize events based on Date then Time (handled in smartReschedule).
    // We only filter out events that are in the past relative to the current Browser Time (now).
    // This allows rescheduling to "earlier" instances (e.g. earlier date or time) if they are still in the future relative to now.

    // 2. Initialize Scheduler State
    // We need to reset the module-level variables used by smartReschedule
    proposedSchedule.clear();
    conflictList = [];
    ignoredConflicts.clear();
    skippedEvents.clear();

    // Populate proposedSchedule with ALL currently attending events EXCEPT the target one
    state.attendingIds.forEach(uid => {
        if (uid !== eventUid) {
            proposedSchedule.add(uid);
        }
    });

    // 3. Run Smart Reschedule
    // We pass an empty set for lockedUids to allow moving other events if necessary.
    // However, we might want to treat "Required" events as locked? 
    // For now, let's assume everything else is movable if needed, but the algorithm prefers free slots.
    const lockedUids = new Set();

    const success = smartReschedule(ev.name, lockedUids, 0, filterPredicate);

    if (!success) {
        return { success: false, message: "No suitable alternative time found." };
    }

    // 4. Calculate Changes
    const changes = {
        added: [],
        removed: [],
        kept: []
    };

    // Identify the new instance of the target event
    let newTargetUid = null;
    proposedSchedule.forEach(uid => {
        const pEv = state.eventLookup.get(uid);
        if (pEv && pEv.name === ev.name) {
            newTargetUid = uid;
        }
    });

    if (!newTargetUid) {
        // Should not happen if success is true
        return { success: false, message: "Error identifying new slot." };
    }

    // Calculate diffs
    // Added: in proposed but not in original attending (excluding the target swap)
    proposedSchedule.forEach(uid => {
        if (!state.attendingIds.has(uid)) {
            changes.added.push(state.eventLookup.get(uid));
        }
    });

    // Removed: in original attending but not in proposed (excluding the target swap)
    state.attendingIds.forEach(uid => {
        if (!proposedSchedule.has(uid) && uid !== eventUid) {
            changes.removed.push(state.eventLookup.get(uid));
        }
    });

    // If any events are removed (displaced), we consider this a "conflict" for the simple "Find Alternative" action.
    // We want to force the user to the wizard to resolve this manually.
    if (changes.removed.length > 0) {
        return { success: false, message: "No conflict-free alternative found." };
    }

    return {
        success: true,
        newTargetUid: newTargetUid,
        changes: changes
    };
}

function smartReschedule(seriesName, lockedUids, depth = 0, filterPredicate = null) {
    if (depth > 5) {
        return false;
    }

    let instances = Array.from(state.eventLookup.values()).filter(e => e.name === seriesName);

    if (filterPredicate) {
        instances = instances.filter(filterPredicate);
    }

    instances.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startMins - b.startMins;
    });

    // Unified Logic: Try each instance. 
    // For each instance, identify ALL blockers (Main + Sales).
    // If blockers = 0, schedule.
    // If blockers > 0, try to displace ALL blockers.

    for (const instance of instances) {

        if (filterPredicate && !filterPredicate(instance)) {
            continue;
        }

        let allConflicts = [];
        let salesEvent = null;

        // 1. Get Main Conflicts
        const mainConflicts = getConflictingEvents(instance);
        allConflicts.push(...mainConflicts);

        // 2. Get Sales Conflicts (if applicable)
        if (instance.name.startsWith("Bingo with")) {
            salesEvent = findBingoSales(instance);
            if (salesEvent) {
                const salesConflicts = getConflictingEvents(salesEvent);
                if (salesConflicts.length > 0) {
                }
                allConflicts.push(...salesConflicts);
            } else {
            }
        }

        // Deduplicate conflicts
        const uniqueConflicts = [];
        const seenUids = new Set();
        allConflicts.forEach(c => {
            if (!seenUids.has(c.uid)) {
                seenUids.add(c.uid);
                uniqueConflicts.push(c);
            }
        });
        allConflicts = uniqueConflicts;

        if (allConflicts.length === 0) {
            // Success!

            // If in Reschedule Mode (manual conflict resolution), we DO NOT want to automatically schedule.
            // We want to force the user to choose.
            // So we skip this "success" and continue, effectively failing to find an auto-slot.
            // This will cause the series to be added to the conflict list.
            if (window.isRescheduleMode && depth === 0) {
                continue;
            }

            proposedSchedule.add(instance.uid);
            if (salesEvent) proposedSchedule.add(salesEvent.uid);
            return true;
        }

        // If we are here, we have conflicts. Try to displace them.

        // Check if any conflict is locked
        const isLocked = allConflicts.some(c => lockedUids.has(c.uid));
        if (isLocked) {
            continue;
        }

        const canMoveAll = allConflicts.every(c => canMoveSeries(c.name, lockedUids, depth + 1));

        if (canMoveAll) {

            // 1. Remove conflicting events AND their dependencies
            const displacedSeries = new Set();
            allConflicts.forEach(c => {
                const removed = removeEventFromSchedule(c.uid);
                removed.forEach(name => displacedSeries.add(name));
            });

            // 2. Add THIS event (occupy the slot)
            proposedSchedule.add(instance.uid);
            if (salesEvent) proposedSchedule.add(salesEvent.uid);

            // Create new locked set for recursion to prevent cycles (A displaces B, B displaces A)
            const nextLockedUids = new Set(lockedUids);
            nextLockedUids.add(instance.uid);
            if (salesEvent) nextLockedUids.add(salesEvent.uid);

            // 3. Recurse for each unique series
            let success = true;
            for (const seriesName of displacedSeries) {
                if (!smartReschedule(seriesName, nextLockedUids, depth + 1)) {
                    success = false;
                    break;
                }
            }

            if (success) {
                return true;
            } else {
                // BACKTRACK!
                proposedSchedule.delete(instance.uid);
                if (salesEvent) proposedSchedule.delete(salesEvent.uid);

                // Restore original conflicts? 
                // We can't easily restore exactly what was there because removeEventFromSchedule might have removed partners.
                // But we can try to re-add the specific conflict UIDs we identified.
                // Note: If we removed a partner that wasn't in 'allConflicts', it won't be re-added here.
                // This is a limitation of this simple backtrack.
                // However, since we failed, we are moving to the next instance or failing the series.
                // The state might be slightly inconsistent if we don't fully restore.
                // But generally, if we fail, we fail.

                // Better attempt at restore:
                allConflicts.forEach(c => {
                    proposedSchedule.add(c.uid);
                    // If it was bingo, add its sales?
                    if (c.name.startsWith("Bingo with")) {
                        const s = findBingoSales(c);
                        if (s) proposedSchedule.add(s.uid);
                    }
                });

            }
        } else {
        }
    }

    // Failed to schedule
    // Add back to conflict list if not present
    if (!conflictList.some(c => c.name === seriesName)) {
        conflictList.push({
            name: seriesName,
            instances: instances
        });
    }
    return false;
}

// Global handler for Conflict Resolution Buttons
window.smartSchedulerRescheduleConflict = (blockingSeriesName, blockingUid, desiredUid) => {
    // 1. Capture Current State
    const wasRescheduleMode = window.isRescheduleMode;
    const capturedTargetUid = currentRescheduleTargetUid;
    const capturedCallback = rescheduleCallback;

    // We should save skipped/removed/conflictSelections if we want to restore exact state?
    // But since the environment changes (blocker moves), exact restore of conflicts is invalid.
    // We will re-run the algorithm/init logic.
    // However, for "Smart Scheduler" (Global), preserving "skippedEvents" (user said Check A, Check B -> Skip A) is nice but maybe complex.
    // Let's stick to restarting the process to ensure validity.

    // 2. Capture Current Conflict Selections (if any)
    const list = document.getElementById('conflicts-list');
    let currentSelections = null;
    if (list) {
        currentSelections = [];
        const inputs = list.querySelectorAll('input[type="radio"]:checked');
        inputs.forEach(input => {
            const conflictIndex = parseInt(input.name.split('_')[1]);
            const value = input.value;
            // We need the conflict NAME to map it back, because indices will change if list changes
            // conflictList is global
            if (conflictList[conflictIndex]) {
                const conflictName = conflictList[conflictIndex].name;
                const allowOverlapInput = list.querySelector(`input[name="allow_overlap_${conflictIndex}_${value}"]`);
                const allowOverlap = allowOverlapInput ? allowOverlapInput.checked : false;

                currentSelections.push({
                    name: conflictName,
                    value: value,
                    allowOverlap: allowOverlap
                });
            }
        });
    }

    // 3. Close Current Wizard
    closeWizard();

    // 4. Launch Reschedule Wizard for Blocker
    // Save restore state before launching logic
    restoreStateOnClose = {
        wasRescheduleMode: wasRescheduleMode,
        targetUid: capturedTargetUid,
        callback: capturedCallback,
        selections: currentSelections
    };

    // We pass an empty callback because the actual restoration happens in closeWizard via restoreStateOnClose.
    initRescheduleWizard(blockingUid, () => {
        // Optional: any specific strict-success cleanup?
        // Nothing needed here, closeWizard handles the flow.
    });
};
