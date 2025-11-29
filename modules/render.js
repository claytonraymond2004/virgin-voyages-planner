import { state } from './state.js';
import {
    START_HOUR, END_HOUR, SHIFT_START_ADD, SHIFT_END_ADD,
    STORAGE_KEY_SHOWN_UIDS
} from './constants.js';
import {
    parseTimeRange, getRandomColor, getDominantColor, getContrastYIQ
} from './utils.js';
import {
    initDrag, toggleAttendance, showContextMenu,
    showFullTooltip, hideTooltip, moveTooltip, lastTouchTime,
    tooltipShowTime, activeTooltipUid
} from './interactions.js';
import { editPortNote, updateAttendancePanel } from './ui.js';

// --- Rendering ---

export function renderApp() {
    const timeCol = document.getElementById('time-column');
    const grid = document.getElementById('schedule-grid');

    if (!timeCol || !grid) return;

    timeCol.innerHTML = '';
    grid.innerHTML = '';
    state.eventNameMap.clear();
    state.eventLookup.clear();

    const totalHidden = state.hiddenNames.size + state.hiddenUids.size;
    const hiddenCountEl = document.getElementById('hidden-count');
    if (hiddenCountEl) hiddenCountEl.textContent = totalHidden;

    const eventsByDate = {};
    const totalEventCounts = {};
    state.availableDates = [];

    const allEventsRaw = Array.isArray(state.appData) ? [...state.appData] : [];

    // Calculate total counts from source data to determine SINGLE status correctly
    // Count official events
    allEventsRaw.forEach(ev => {
        if (state.blacklist.has(ev.name)) return;

        const timeData = parseTimeRange(ev.timePeriod);
        if (!timeData) return;
        totalEventCounts[ev.name] = (totalEventCounts[ev.name] || 0) + 1;
    });

    // Count custom events
    state.customEvents.forEach(ev => {
        if (state.blacklist.has(ev.name)) return;
        totalEventCounts[ev.name] = (totalEventCounts[ev.name] || 0) + 1;
    });

    const processedOfficial = [];
    allEventsRaw.forEach(ev => {
        if (state.blacklist.has(ev.name)) return;
        const timeData = parseTimeRange(ev.timePeriod);
        if (!timeData) return;
        let s = timeData.start + SHIFT_START_ADD;
        let e = timeData.end + SHIFT_END_ADD;
        const uid = `${ev.date}_${ev.name}_${s}`;

        let isHidden = false;
        const isExplicitlyShown = state.shownUids.has(uid);
        if ((state.hiddenNames.has(ev.name) || state.hiddenUids.has(uid)) && !state.attendingIds.has(uid) && !isExplicitlyShown) {
            if (!state.showHiddenTemp) return;
            isHidden = true;
        }

        processedOfficial.push({
            ...ev, startMins: s, endMins: e, uid: uid, isCustom: false, isHiddenTemp: isHidden
        });
    });

    const processedCustom = [];
    state.customEvents.forEach(ev => {
        if (state.blacklist.has(ev.name)) return;
        let isHidden = false;
        const isExplicitlyShown = state.shownUids.has(ev.uid);
        if ((state.hiddenNames.has(ev.name) || state.hiddenUids.has(ev.uid)) && !state.attendingIds.has(ev.uid) && !isExplicitlyShown) {
            if (!state.showHiddenTemp) return;
            isHidden = true;
        }
        processedCustom.push({ ...ev, isHiddenTemp: isHidden });
    });

    const finalEvents = [...processedOfficial, ...processedCustom];

    finalEvents.forEach(ev => {
        if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
    });
    state.availableDates = Object.keys(eventsByDate).sort();

    // Only generate colors if not already generated to persist them
    if (Object.keys(state.eventColors).length === 0) {
        Object.keys(totalEventCounts).forEach(name => {
            if (totalEventCounts[name] > 1) state.eventColors[name] = getRandomColor();
            else state.eventColors[name] = 'SINGLE';
        });
    } else {
        // Ensure new events get colors if data changed
        Object.keys(totalEventCounts).forEach(name => {
            if (!state.eventColors[name]) {
                if (totalEventCounts[name] > 1) state.eventColors[name] = getRandomColor();
                else state.eventColors[name] = 'SINGLE';
            }
        });
    }

    finalEvents.forEach(ev => {
        if (!state.eventNameMap.has(ev.name)) state.eventNameMap.set(ev.name, []);
        state.eventNameMap.get(ev.name).push(ev.uid);

        ev.color = state.eventColors[ev.name];
        eventsByDate[ev.date].push(ev);
        state.eventLookup.set(ev.uid, ev);
    });

    // 4. Sort siblings strictly by time for nav
    state.eventNameMap.forEach((uids, name) => {
        uids.sort((a, b) => {
            const eventA = state.eventLookup.get(a);
            const eventB = state.eventLookup.get(b);
            if (eventA.date !== eventB.date) return eventA.date.localeCompare(eventB.date);
            return eventA.startMins - eventB.startMins;
        });
    });

    // 2. Time Column
    // Add header block to hide scrolling labels at the top
    const timeHeader = document.createElement('div');
    timeHeader.className = 'time-column-header';
    timeCol.appendChild(timeHeader);

    for (let m = START_HOUR * 60; m < END_HOUR * 60; m += 60) {
        const h = Math.floor(m / 60) % 24;
        const div = document.createElement('div');
        div.className = 'time-label';
        div.textContent = `${h === 12 ? 12 : h % 12}:00 ${h >= 12 && h < 24 ? 'PM' : 'AM'}`;
        const topPx = (m - START_HOUR * 60);
        div.style.top = topPx + 'px';
        timeCol.appendChild(div);
    }
    // Strut to match day-column height exactly for sync scrolling
    const totalMins = (END_HOUR - START_HOUR) * 60;
    const strut = document.createElement('div');
    strut.style.height = `${(totalMins / 60) * 60 + 50}px`;
    strut.style.width = '1px';
    strut.style.position = 'absolute';
    strut.style.top = '0';
    timeCol.appendChild(strut);

    // 3. Grid Columns
    state.availableDates.forEach(date => {
        const dayCol = document.createElement('div');
        dayCol.className = 'day-column';
        initDrag(dayCol, date);

        dayCol.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        const dateObj = new Date(date + 'T00:00:00');
        const header = document.createElement('div');
        header.className = 'day-header';
        const note = state.portNotes[date] || '';

        // We need to attach the onclick handler for editPortNote
        // Since we are in a module, we can't use onclick="editPortNote(...)".
        // We'll add event listeners after creating the HTML.

        header.innerHTML = `
            <div class="text-center leading-tight w-full h-full flex flex-col justify-center relative">
                <div class="text-xs day-name-text uppercase tracking-wide">${dateObj.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div class="text-lg">${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                <div class="absolute bottom-1 right-1 port-note-container">
                    ${note ?
                `<span class="text-xs font-semibold port-text cursor-pointer hover:underline port-note-edit">${note}</span>` :
                `<button class="text-xs text-gray-400 hover:text-gray-600 border border-gray-300 rounded px-1 port-note-add">+</button>`
            }
                </div>
            </div>
        `;

        const noteBtn = header.querySelector('.port-note-edit') || header.querySelector('.port-note-add');
        if (noteBtn) {
            noteBtn.addEventListener('click', (e) => editPortNote(date, e));
        }

        dayCol.appendChild(header);

        // Packing
        const events = eventsByDate[date].sort((a, b) => a.startMins - b.startMins || (b.endMins - b.startMins) - (a.endMins - a.startMins));

        // Split into normal and optional
        // 1. Identify "Anchor" events (Required OR Attending) which define the "busy" times
        const anchorEvents = events.filter(ev => !state.optionalEvents.has(ev.name) || state.attendingIds.has(ev.uid));

        const normalEvents = [...anchorEvents];
        const optionalEventsList = [];

        // 2. Process "Floating" events (Optional AND Not Attending)
        events.filter(ev => state.optionalEvents.has(ev.name) && !state.attendingIds.has(ev.uid)).forEach(ev => {
            // Check for overlap with ANY anchor event
            const hasOverlap = anchorEvents.some(anchor =>
                ev.startMins < anchor.endMins && anchor.startMins < ev.endMins
            );

            if (hasOverlap) {
                // Overlaps with a required/attending event -> Side column
                optionalEventsList.push(ev);
            } else {
                // Free time -> Main column
                normalEvents.push(ev);
            }
        });

        // Re-sort normalEvents for proper packing
        normalEvents.sort((a, b) => a.startMins - b.startMins || (b.endMins - b.startMins) - (a.endMins - a.startMins));

        // Pack Normal Events
        const normalLanes = [];
        normalEvents.forEach(ev => {
            let placed = false;
            for (let i = 0; i < normalLanes.length; i++) {
                const lane = normalLanes[i];
                const hasOverlap = lane.some(existing =>
                    ev.startMins < existing.endMins && existing.startMins < ev.endMins
                );
                if (!hasOverlap) {
                    lane.push(ev);
                    ev.laneIndex = i;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                normalLanes.push([ev]);
                ev.laneIndex = normalLanes.length - 1;
            }
        });

        // Pack Optional Events
        const optionalLanes = [];
        optionalEventsList.forEach(ev => {
            let placed = false;
            for (let i = 0; i < optionalLanes.length; i++) {
                const lane = optionalLanes[i];
                const hasOverlap = lane.some(existing =>
                    ev.startMins < existing.endMins && existing.startMins < ev.endMins
                );
                if (!hasOverlap) {
                    lane.push(ev);
                    ev.laneIndex = i;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                optionalLanes.push([ev]);
                ev.laneIndex = optionalLanes.length - 1;
            }
        });

        // Calculate Widths
        let normalWidthPercent = 100;
        let optionalWidthPercent = 0;
        let normalStart = 0;
        let optionalStart = 100;

        if (optionalEventsList.length > 0) {
            if (normalEvents.length > 0) {
                normalWidthPercent = 80;
                optionalWidthPercent = 20;
                optionalStart = 80;
            } else {
                normalWidthPercent = 0;
                optionalWidthPercent = 20;
                optionalStart = 80;
            }
        }

        const normalLaneWidth = normalLanes.length > 0 ? normalWidthPercent / normalLanes.length : 0;
        const optionalLaneWidth = optionalLanes.length > 0 ? optionalWidthPercent / optionalLanes.length : 0;

        // Render Normal
        normalEvents.forEach(ev => {
            renderEventCard(ev, dayCol, normalLaneWidth, ev.laneIndex * normalLaneWidth);
        });

        // Render Optional
        optionalEventsList.forEach(ev => {
            // Stack from Right to Left: Lane 0 is rightmost
            const rtlIndex = optionalLanes.length - 1 - ev.laneIndex;
            renderEventCard(ev, dayCol, optionalLaneWidth, optionalStart + (rtlIndex * optionalLaneWidth), true);
        });

        dayCol.style.height = `${(totalMins / 60) * 60 + 50}px`;

        grid.appendChild(dayCol);
    });

    updateVisualStates();
    updateAttendancePanel();
}

export function renderEventCard(ev, dayCol, widthPercent, leftPercent, isOptional = false) {
    const startOffset = ev.startMins - (START_HOUR * 60);
    const duration = ev.endMins - ev.startMins;
    const top = (startOffset / 60) * 60;
    const height = Math.max(15, (duration / 60) * 60);

    const el = document.createElement('div');
    el.className = 'event-card';
    el.id = `card-${ev.uid}`;

    // Check if event is optional (even if attending)
    const isEventOptional = state.optionalEvents.has(ev.name);

    if (isOptional || isEventOptional) {
        el.classList.add('is-optional');
    }

    if (ev.isCustom) {
        el.classList.add('custom-event');
    } else if (ev.color === 'SINGLE') {
        el.classList.add('single-instance');
    } else {
        el.style.backgroundColor = ev.color;
    }

    // Image-based coloring
    if (ev.imageUrl) {
        // Check if colors are already cached for this image
        if (state.imageColorCache[ev.imageUrl]) {
            // Use cached colors immediately
            const cached = state.imageColorCache[ev.imageUrl];

            // Store for restoration in dataset
            el.dataset.originalBg = cached.bgColor;
            el.dataset.originalText = cached.textColor;
            el.dataset.originalBorder = cached.borderColor;
            el.dataset.originalBorderLeft = cached.borderLeftColor;

            const icon = el.querySelector('span');
            if (icon && cached.iconColor) {
                el.dataset.originalIconColor = cached.iconColor;
            }

            // Check if a sibling is attending
            const siblings = state.eventNameMap.get(ev.name) || [];
            const hasAttendingSibling = siblings.some(uid => state.attendingIds.has(uid));

            // Only apply if NOT attending
            if (!state.attendingIds.has(ev.uid)) {
                el.style.setProperty('background-color', cached.bgColor, 'important');
                el.style.setProperty('color', cached.textColor, 'important');
                el.style.setProperty('border-color', cached.borderColor, 'important');

                if (!hasAttendingSibling) {
                    el.style.setProperty('border-left-color', cached.borderLeftColor, 'important');
                } else {
                    el.style.setProperty('border-left-width', '4px', 'important');
                    el.style.setProperty('border-left-style', 'solid', 'important');
                    el.style.setProperty('border-left-color', '#86efac', 'important');
                }

                if (icon && cached.iconColor) {
                    icon.style.color = cached.iconColor;
                }
            }
        } else {
            // Colors not cached - calculate them
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = ev.imageUrl;
            img.style.display = 'none';

            const applyColor = () => {
                const c = getDominantColor(img);
                if (c) {
                    const bgColor = `rgb(${c.r},${c.g},${c.b})`;
                    const textColor = getContrastYIQ(c.r, c.g, c.b);
                    const borderColor = textColor === 'black' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)';
                    const borderLeftColor = textColor === 'black' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)';

                    // Determine icon color
                    let iconColor = null;
                    if (ev.isCustom) iconColor = textColor === 'black' ? '#000' : '#fff';
                    else if (ev.color === 'SINGLE') iconColor = textColor === 'black' ? '#b45309' : '#fcd34d';

                    // Cache the colors for this image URL
                    state.imageColorCache[ev.imageUrl] = {
                        bgColor,
                        textColor,
                        borderColor,
                        borderLeftColor,
                        iconColor
                    };

                    // Store for restoration
                    el.dataset.originalBg = bgColor;
                    el.dataset.originalText = textColor;
                    el.dataset.originalBorder = borderColor;
                    el.dataset.originalBorderLeft = borderLeftColor;
                    if (iconColor) el.dataset.originalIconColor = iconColor;

                    // Check if a sibling is attending (for border preservation)
                    const siblings = state.eventNameMap.get(ev.name) || [];
                    const hasAttendingSibling = siblings.some(uid => state.attendingIds.has(uid));
                    el.dataset.hasAttendingSibling = hasAttendingSibling ? 'true' : 'false';

                    // Only apply if NOT attending
                    if (!state.attendingIds.has(ev.uid)) {
                        el.style.setProperty('background-color', bgColor, 'important');
                        el.style.setProperty('color', textColor, 'important');
                        el.style.setProperty('border-color', borderColor, 'important');

                        // Only override border-left if no sibling is attending
                        if (!hasAttendingSibling) {
                            el.style.setProperty('border-left-color', borderLeftColor, 'important');
                        } else {
                            // Explicitly set green border for sibling attendance
                            el.style.setProperty('border-left-width', '4px', 'important');
                            el.style.setProperty('border-left-style', 'solid', 'important');
                            el.style.setProperty('border-left-color', '#86efac', 'important');
                        }

                        const icon = el.querySelector('span');
                        if (icon && iconColor) {
                            icon.style.color = iconColor;
                        }
                    }
                }
            };

            if (img.complete) {
                applyColor();
            } else {
                img.onload = applyColor;
            }
        }
    }

    if (ev.isHiddenTemp) {
        el.style.opacity = '0.25';
    }

    el.style.top = `${top}px`;
    el.style.height = `${height}px`;
    el.style.width = `${widthPercent}%`;
    el.style.left = `${leftPercent}%`;

    let iconHtml = '';
    if (ev.isCustom) iconHtml = '<span class="mr-1 text-white">👤</span>';
    else if (ev.color === 'SINGLE') iconHtml = '<span class="mr-1 text-yellow-600">★</span>';

    el.innerHTML = `
<div class="event-title truncate" title="${ev.name}">${iconHtml}${ev.name}</div>
<div class="event-loc truncate">${ev.location || ''}</div>
`;

    el.dataset.uid = ev.uid;
    el.dataset.name = ev.name;

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        const ctxMenu = document.getElementById('context-menu');
        if (ctxMenu.style.display === 'block') {
            ctxMenu.style.display = 'none';
            return;
        }

        const isTouchInteraction = (Date.now() - lastTouchTime) < 1000;

        if (isTouchInteraction) {
            // Touch Logic: First tap shows tooltip, Second tap toggles attendance
            if (activeTooltipUid === ev.uid && (Date.now() - tooltipShowTime) > 200) {
                toggleAttendance(ev.uid);
            } else {
                showFullTooltip(e, ev, el);
            }
        } else {
            // Desktop Logic: Click always toggles
            toggleAttendance(ev.uid);
        }
    });

    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, ev);
    });

    el.addEventListener('mouseenter', (e) => showFullTooltip(e, ev, el));
    el.addEventListener('mouseleave', (e) => {
        // Check if moving to tooltip itself
        if (e.relatedTarget !== document.getElementById('tooltip')) {
            hideTooltip();
        }
    });

    dayCol.appendChild(el);

    // Apply green border for sibling attendance AFTER element is added and after image processing
    if (!state.attendingIds.has(ev.uid)) {
        const siblings = state.eventNameMap.get(ev.name) || [];
        const hasAttendingSibling = siblings.some(uid => state.attendingIds.has(uid));
        if (hasAttendingSibling) {
            setTimeout(() => {
                el.style.setProperty('border-left-width', '4px', 'important');
                el.style.setProperty('border-left-style', 'solid', 'important');
                el.style.setProperty('border-left-color', '#86efac', 'important');
            }, 0);
        }
    }
}

export function updateVisualStates() {
    const cards = document.querySelectorAll('.event-card');
    const query = document.getElementById('search-input').value.toLowerCase();
    const clearBtn = document.getElementById('clear-search');

    if (query.length > 0) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');

    // Search Logic - Populate Dropdown
    const searchResults = document.getElementById('search-results');
    if (query.length > 1) {
        const matches = [];

        // Search official
        state.appData.forEach(ev => {
            if (state.blacklist.has(ev.name)) return;

            let match = ev.name.toLowerCase().includes(query);
            if (!match && state.searchMode === 'all' && (ev.longDescription || "").toLowerCase().includes(query)) match = true;

            if (match) {
                // Need precise startMins for sorting. Reparse.
                const timeData = parseTimeRange(ev.timePeriod);
                if (timeData) {
                    let s = timeData.start + SHIFT_START_ADD;
                    let uid = `${ev.date}_${ev.name}_${s}`;

                    const isHidden = (state.hiddenNames.has(ev.name) || state.hiddenUids.has(uid));
                    const isAttending = state.attendingIds.has(uid);
                    const isExplicitlyShown = state.shownUids.has(uid);

                    if (isHidden && !isAttending && !isExplicitlyShown && !state.showHiddenTemp) {
                        return;
                    }

                    matches.push({ ...ev, startMins: s, uid: uid });
                }
            }
        });

        // Search custom
        state.customEvents.forEach(ev => {
            if (state.blacklist.has(ev.name)) return;
            let match = ev.name.toLowerCase().includes(query);
            if (!match && state.searchMode === 'all' && (ev.longDescription || "").toLowerCase().includes(query)) match = true;

            if (match) {
                const isHidden = (state.hiddenNames.has(ev.name) || state.hiddenUids.has(ev.uid));
                const isAttending = state.attendingIds.has(ev.uid);
                const isExplicitlyShown = state.shownUids.has(ev.uid);

                if (isHidden && !isAttending && !isExplicitlyShown && !state.showHiddenTemp) {
                    return;
                }
                matches.push(ev);
            }
        });

        // Sort and Render
        matches.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.startMins - b.startMins;
        });

        if (matches.length > 0) {
            // We need to import jumpToEvent here or use a global. 
            // Since we are in render.js, we can't easily import jumpToEvent if it's in interactions.js (circular).
            // But we can dispatch a custom event or use a global handler attached to window.
            // For now, let's assume jumpToEvent is globally available or we attach it to window in main.js

            searchResults.innerHTML = matches.slice(0, 15).map(ev => {
                const dateObj = new Date(ev.date + 'T00:00:00');
                const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const h = Math.floor(ev.startMins / 60) % 24;
                const m = ev.startMins % 60;
                const timeStr = `${h === 12 || h === 0 ? 12 : h % 12}:${m.toString().padStart(2, '0')}${h >= 12 && h < 24 ? 'pm' : 'am'}`;
                return `<div class="search-result-item" data-uid="${ev.uid.replace(/"/g, '&quot;')}" onclick="window.jumpToEvent('${ev.uid.replace(/'/g, "\\'")}')">
                    <div class="font-bold text-sm">${ev.name}</div>
                    <div class="text-xs text-gray-500">${dateStr} @ ${timeStr}</div>
                </div>`;
            }).join('');
            searchResults.style.display = 'block';
        } else {
            searchResults.innerHTML = '<div class="p-3 text-sm text-gray-500 italic">No matches found</div>';
            searchResults.style.display = 'block';
        }

    } else {
        searchResults.style.display = 'none';
    }

    // 1. Calculate Occupied Time Ranges
    const occupiedRanges = {}; // { "YYYY-MM-DD": [{start, end}, ...] }
    state.attendingIds.forEach(id => {
        const ev = state.eventLookup.get(id);
        if (ev) {
            if (!occupiedRanges[ev.date]) occupiedRanges[ev.date] = [];
            occupiedRanges[ev.date].push({ start: ev.startMins, end: ev.endMins });
        }
    });

    const attendingNames = new Set();
    state.attendingIds.forEach(id => {
        const card = document.getElementById(`card-${id}`);
        if (card) attendingNames.add(card.dataset.name);
    });

    cards.forEach(card => {
        const uid = card.dataset.uid;
        const name = card.dataset.name;
        const isAttending = state.attendingIds.has(uid);
        const eventData = state.eventLookup.get(uid);

        card.classList.remove('is-attending', 'is-dimmed', 'is-search-dimmed', 'is-search-match', 'is-sibling-attended');

        // Base state
        if (isAttending) {
            card.classList.add('is-attending');
            // Clear inline styles that might override the class
            card.style.removeProperty('background-color');
            card.style.removeProperty('color');
            card.style.removeProperty('border-color');
            card.style.removeProperty('border-left-color');

            // Reset icon color
            const icon = card.querySelector('span');
            if (icon) icon.style.removeProperty('color');

        } else {
            // Check if a sibling is attending
            const hasSiblingAttending = attendingNames.has(name);

            // Restore original colors if they exist in dataset
            if (card.dataset.originalBg) {
                card.style.setProperty('background-color', card.dataset.originalBg, 'important');
                card.style.setProperty('color', card.dataset.originalText, 'important');
                card.style.setProperty('border-color', card.dataset.originalBorder, 'important');

                // Only restore border-left if no sibling is attending
                if (!hasSiblingAttending) {
                    card.style.setProperty('border-left-color', card.dataset.originalBorderLeft, 'important');
                } else {
                    // Set green border for sibling-attended
                    card.style.setProperty('border-left', '4px solid #86efac', 'important');
                }

                const icon = card.querySelector('span');
                if (icon && card.dataset.originalIconColor) {
                    icon.style.color = card.dataset.originalIconColor;
                }
            }

            if (hasSiblingAttending) {
                card.classList.add('is-sibling-attended'); // New style
                // Ensure green border is set
                if (!card.dataset.originalBg) {
                    card.style.setProperty('border-left', '4px solid #86efac', 'important');
                }
            }

            // Conflict Dimming
            if (eventData) {
                const dayRanges = occupiedRanges[eventData.date] || [];
                const hasConflict = dayRanges.some(range => {
                    // Overlap logic: (StartA < EndB) and (EndA > StartB)
                    return eventData.startMins < range.end && eventData.endMins > range.start;
                });

                if (hasConflict) {
                    card.classList.add('is-dimmed');
                }
            }
        }

        // Search Dimming
        if (query.length > 0) {
            let match = name.toLowerCase().includes(query);
            if (!match && state.searchMode === 'all' && eventData && (eventData.longDescription || "").toLowerCase().includes(query)) match = true;

            if (match) {
                card.classList.add('is-search-match');
                card.classList.remove('is-dimmed');
                card.classList.remove('is-sibling-attended');
            } else {
                card.classList.add('is-search-dimmed');
            }
        }
    });
}
