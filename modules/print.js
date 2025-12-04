import { state } from './state.js';
import { SHIFT_START_ADD, SHIFT_END_ADD } from './constants.js';
import { parseTimeRange } from './utils.js';
import { showGenericChoice } from './ui.js';

// --- Export Printable Logic ---

export function exportPrintable() {
    showGenericChoice(
        "Print Format",
        "Choose a format for your printed agenda.",
        "Day Grid View",
        () => exportPrintableGrid(),
        "Simple List View",
        () => exportPrintableList()
    );
}

export function exportPrintableList() {
    const attendingEvents = [];
    const allEvents = [...state.appData];

    // 1. Gather Attending Events (Official)
    allEvents.forEach(ev => {
        const timeData = parseTimeRange(ev.timePeriod);
        if (!timeData) return;
        let s = timeData.start + SHIFT_START_ADD;
        let uid = `${ev.date}_${ev.name}_${s}`;

        let isHidden = false;
        if (state.hiddenUids.has(uid)) {
            if (!state.showHiddenTemp) return;
            isHidden = true;
        }

        if (state.attendingIds.has(uid)) {
            attendingEvents.push({
                ...ev,
                startMins: s,
                endMins: timeData.end + SHIFT_END_ADD,
                uid: uid,
                isHiddenTemp: isHidden,
                isCustom: false
            });
        }
    });

    // 2. Gather Attending Events (Custom)
    state.customEvents.forEach(ev => {
        let isHidden = false;
        if (state.hiddenUids.has(ev.uid)) {
            if (!state.showHiddenTemp) return;
            isHidden = true;
        }
        if (state.attendingIds.has(ev.uid)) {
            attendingEvents.push({ ...ev, isHiddenTemp: isHidden });
        }
    });

    if (attendingEvents.length === 0) {
        alert("No events marked as Attending.");
        return;
    }

    // 3. Sort by Date then Time
    attendingEvents.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startMins - b.startMins;
    });

    // 4. Group by Date
    const eventsByDate = {};
    attendingEvents.forEach(ev => {
        if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
        eventsByDate[ev.date].push(ev);
    });

    const sortedDates = Object.keys(eventsByDate).sort();
    const PLACEHOLDER_IMG = "virgin_placeholder.png";

    // Calculate total dates for "Every day" check
    const allVoyageDates = new Set(state.appData.map(d => d.date));
    const totalVoyageDays = allVoyageDates.size;

    const printWindow = window.open('', '_blank');
    let html = `
    <html><head><title>My Voyage Agenda</title>
    <style>
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #333; max-width: 900px; margin: 0 auto; }
        h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 30px; }
        .date-section { margin-bottom: 30px; break-before: page; }
        body.duplex-mode .date-section { break-before: right; break-before: recto; page-break-before: right; page-break-before: recto; }
        h1 + .date-section, body.duplex-mode h1 + .date-section { break-before: auto; page-break-before: auto; }
        .date-header { 
            background: #f3f4f6; 
            padding: 12px 16px; 
            font-weight: 700; 
            font-size: 1.2em; 
            border-left: 6px solid #AF231C; 
            margin-bottom: 15px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            border-radius: 0 4px 4px 0;
        }
        .event-row { display: flex; align-items: center; border-bottom: 1px solid #e5e7eb; padding: 16px 0; }
        .event-row:last-child { border-bottom: none; }
        .event-row.optional { 
            background-color: #fafafa;
            background-image: linear-gradient(45deg, #f3f4f6 25%, transparent 25%, transparent 50%, #f3f4f6 50%, #f3f4f6 75%, transparent 75%, transparent);
            background-size: 20px 20px;
        }
        .event-row.optional .event-img {
            filter: grayscale(100%);
            opacity: 0.8;
            border: 2px dashed #d1d5db;
        }
        .event-row.optional .event-name, 
        .event-row.optional .event-time,
        .event-row.optional .event-loc {
            color: #6b7280 !important; /* Force gray text for optional */
        }
        .event-img-col { width: 80px; flex-shrink: 0; margin-right: 20px; }
        .event-img-wrapper { width: 80px; height: 80px; border-radius: 6px; overflow: hidden; background-color: #eee; position: relative; }
        .event-img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .event-img.placeholder { transform: scale(1.4); background-color: transparent; }
        .event-details-col { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
        .event-time { font-weight: 600; color: #6b7280; font-size: 0.9em; margin-bottom: 4px; }
        .event-name { font-weight: 800; font-size: 1.1em; margin-bottom: 4px; line-height: 1.2; }
        .event-loc { font-style: italic; color: #4b5563; font-size: 0.95em; }
        .event-note { 
            background: #fef3c7; 
            color: #92400e;
            padding: 4px 8px; 
            border-radius: 4px; 
            margin-top: 8px; 
            font-size: 0.85em; 
            display: inline-block; 
            border: 1px solid #fcd34d; 
            align-self: flex-start;
        }
        .event-siblings-col { 
            width: 220px; 
            flex-shrink: 0; 
            border-left: 1px solid #e5e7eb; 
            padding-left: 20px; 
            margin-left: 20px;
            font-size: 0.8em; 
            color: #6b7280; 
            display: flex; 
            flex-direction: column; 
            justify-content: center; 
        }
        .sibling-title { font-weight: 600; margin-bottom: 4px; text-transform: uppercase; font-size: 0.75em; letter-spacing: 0.05em; }
        .sibling-item { 
            display: grid; 
            grid-template-columns: 15px 35px 40px 1fr; 
            gap: 4px; 
            margin-bottom: 3px; 
            align-items: center;
        }
        .sibling-attending { color: #059669; font-weight: 700; }
        .sib-day { text-align: left; }
        .sib-date { text-align: left; }
        .sib-time { text-align: left; }
        .free-time-row { 
            background: #f0fdf4; 
            padding: 8px; 
            margin: 0; 
            text-align: center; 
            color: #166534; 
            font-style: italic; 
            font-weight: 500;
            border-bottom: 1px solid #e5e7eb;
        }
        .transition-time-row {
            background: #f3f4f6;
            padding: 8px;
            margin: 0;
            text-align: center;
            color: #6b7280;
            font-style: italic;
            font-size: 0.9em;
            border-bottom: 1px solid #e5e7eb;
        }
        @media print { 
            .no-print { display: none; } 
            body { padding: 0; }
            /* Hide the manual spacer checkbox when printing */
            .date-header label { display: none !important; }

        }
    </style>
    </head><body>
    <div style="text-align: right; margin-bottom: 20px;" class="no-print">
        <button onclick="window.print()" style="background: #AF231C; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer;">Print Itinerary</button>
        <div style="margin-top: 10px;">
            <label style="cursor:pointer; font-size: 0.9em; display: inline-flex; align-items: center;">
                <input type="checkbox" id="duplexCheck" onchange="autoCalculateDuplex()" style="margin-right: 6px;">
                Duplex Printing (Start each day on new sheet)
            </label>
        </div>
        <div style="margin-top: 5px;">
            <label style="font-size: 0.9em; margin-right: 6px;">Paper Size:</label>
            <select id="paperSize" onchange="autoCalculateDuplex()" style="font-size: 0.9em; padding: 2px;">
                <option value="1056">Letter (8.5" x 11")</option>
                <option value="1123">A4 (210mm x 297mm)</option>
                <option value="1344">Legal (8.5" x 14")</option>
            </select>
        </div>
        <div style="margin-top: 5px;">
            <label style="font-size: 0.9em; margin-right: 6px;">Margins:</label>
            <select id="printMargins" onchange="autoCalculateDuplex()" style="font-size: 0.9em; padding: 2px;">
                <option value="0">None</option>
                <option value="40">Minimum</option>
                <option value="96" selected>Default</option>
            </select>
        </div>
    </div>
    <h1>My Voyage Agenda</h1>
    `;

    sortedDates.forEach(date => {
        const dObj = new Date(date + 'T00:00:00');
        const portName = state.portNotes[date] ? ` <span style="font-weight:normal; font-size: 0.9em; color: #4b5563;">(${state.portNotes[date]})</span>` : '';

        html += `<div class="date-section" id="date-${date}">
            <div class="date-header">
                <div>
                    <span>${dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                    ${portName}
                </div>
                <label class="no-print" style="font-size:0.8rem; font-weight:normal; display:flex; align-items:center; cursor:pointer; margin-left: 10px;">
                    <input type="checkbox" onchange="togglePageSpacer(this, 'date-${date}')" style="margin-right:4px;" disabled> Add Blank Page Before
                </label>
            </div>`;

        const dayEvents = eventsByDate[date];
        let lastEndMins = -1;

        // Sort just in case
        dayEvents.sort((a, b) => a.startMins - b.startMins);

        dayEvents.forEach((ev) => {
            // Gap Check
            if (lastEndMins !== -1) {
                const gap = ev.startMins - lastEndMins;
                if (gap > 0) {
                    const h = Math.floor(gap / 60);
                    const m = gap % 60;
                    let durationStr = '';
                    if (h > 0) {
                        durationStr += `${h} ${h === 1 ? 'hour' : 'hours'}`;
                    }
                    if (m > 0) {
                        if (durationStr) durationStr += ' ';
                        durationStr += `${m} ${m === 1 ? 'minute' : 'minutes'}`;
                    }

                    if (gap > 60) {
                        html += `<div class="free-time-row">Free Time: ${durationStr}</div>`;
                    } else {
                        html += `<div class="transition-time-row">Transition time: ${durationStr}</div>`;
                    }
                }
            }
            lastEndMins = Math.max(lastEndMins, ev.endMins);

            // Format Time
            const fmt = (m) => {
                let h = Math.floor(m / 60) % 24;
                let min = m % 60;
                let displayH = (h === 12 || h === 0 ? 12 : h % 12);
                return `${displayH.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}${h >= 12 && h < 24 ? 'pm' : 'am'}`;
            };
            const timeStr = `${fmt(ev.startMins)} - ${fmt(ev.endMins)}`;

            // Image
            const isPlaceholder = !ev.imageUrl;
            const imgUrl = ev.imageUrl || PLACEHOLDER_IMG;

            // Note
            const note = state.eventNotes[ev.uid];

            // Optional
            const isOptional = state.optionalEvents.has(ev.name);

            // Siblings Logic
            let siblingsHtml = '';
            const allInstances = [];

            if (ev.isCustom) {
                state.customEvents.forEach(c => {
                    if (c.seriesId === ev.seriesId && c.uid !== ev.uid) allInstances.push(c);
                });
            } else {
                state.appData.forEach(a => {
                    if (a.name === ev.name) {
                        const t = parseTimeRange(a.timePeriod);
                        if (t) {
                            const s = t.start + SHIFT_START_ADD;
                            const u = `${a.date}_${a.name}_${s}`;
                            if (u !== ev.uid) allInstances.push({ ...a, startMins: s, uid: u });
                        }
                    }
                });
            }

            allInstances.sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.startMins - b.startMins;
            });

            if (allInstances.length > 0) {
                // Check for "Every day"
                const totalInstances = [ev, ...allInstances];
                const uniqueInstanceDates = new Set(totalInstances.map(i => i.date));
                const allSameTime = totalInstances.every(i => i.startMins === ev.startMins);
                const isEveryDay = uniqueInstanceDates.size === totalVoyageDays && allSameTime;

                siblingsHtml = '<div class="event-siblings-col"><div class="sibling-title">Other Times</div>';

                if (isEveryDay) {
                    const tStr = fmt(ev.startMins);
                    siblingsHtml += `<div class="sibling-item" style="display:block; font-style:italic; color:#555;">
                        Every day at ${tStr}
                     </div>`;
                } else {
                    allInstances.forEach(sib => {
                        const sibDate = new Date(sib.date + 'T00:00:00');
                        const dayStr = sibDate.toLocaleDateString('en-US', { weekday: 'short' });
                        const dateStr = `${(sibDate.getMonth() + 1).toString().padStart(2, '0')}/${sibDate.getDate().toString().padStart(2, '0')}`;
                        const tStr = fmt(sib.startMins);
                        const isAttendingSib = state.attendingIds.has(sib.uid);
                        siblingsHtml += `<div class="sibling-item ${isAttendingSib ? 'sibling-attending' : ''}">
                            <span>${isAttendingSib ? '✅' : '⬜'}</span>
                            <span class="sib-day">${dayStr}</span>
                            <span class="sib-date">${dateStr}</span>
                            <span class="sib-time">${tStr}</span>
                        </div>`;
                    });
                }
                siblingsHtml += '</div>';
            }

            html += `
            <div class="event-row ${isOptional ? 'optional' : ''}">
                <div class="event-img-col">
                    <div class="event-img-wrapper">
                        <img src="${imgUrl}" class="event-img ${isPlaceholder ? 'placeholder' : ''}" crossorigin="anonymous">
                    </div>
                </div>
                <div class="event-details-col">
                    <div class="event-time">${timeStr}</div>
                    <div class="event-name">${ev.name}</div>
                    <div class="event-loc">${ev.location || ''}</div>
                    ${note ? `<div class="event-note">Note: ${note}</div>` : ''}
                </div>
                ${siblingsHtml}
            </div>
            `;
        });

        html += `</div>`; // End date-section
    });

    html += `
    <script>
    function getDominantColor(img) {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 50;
            canvas.height = 50;
            ctx.drawImage(img, 0, 0, 50, 50);
            const data = ctx.getImageData(0, 0, 50, 50).data;
            const colorCounts = {};
            let maxCount = 0;
            let dominant = null;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                const a = data[i+3];
                if (a < 128) continue;
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                if ((max - min) < 30) continue;

                const qR = Math.round(r / 20) * 20;
                const qG = Math.round(g / 20) * 20;
                const qB = Math.round(b / 20) * 20;
                const key = qR + ',' + qG + ',' + qB;
                colorCounts[key] = (colorCounts[key] || 0) + 1;
                if (colorCounts[key] > maxCount) {
                    maxCount = colorCounts[key];
                    dominant = { r: qR, g: qG, b: qB };
                }
            }
            return dominant;
        } catch (e) { return null; }
    }

    function processListImages() {
        const imgs = document.querySelectorAll('.event-img');
        imgs.forEach(img => {
            if (img.src.includes('placehold.co')) return;

            const applyColor = () => {
                const c = getDominantColor(img);
                if (!c) return;
                
                const row = img.closest('.event-row');
                const nameEl = row.querySelector('.event-name');
                if (nameEl) {
                    nameEl.style.color = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
                }
            };

            if (img.complete) applyColor();
            else img.onload = applyColor;
        });
    }
    function togglePageSpacer(cb, id) {
        const section = document.getElementById(id);
        if (cb.checked) {
            const spacer = document.createElement('div');
            spacer.id = 'spacer-' + id;
            spacer.style.pageBreakBefore = 'always';
            spacer.style.height = '1px'; 
            spacer.style.visibility = 'hidden';
            section.parentNode.insertBefore(spacer, section);
        } else {
            const spacer = document.getElementById('spacer-' + id);
            if (spacer) spacer.remove();
        }
    }

    function autoCalculateDuplex() {
        const isDuplex = document.getElementById('duplexCheck').checked;
        document.body.classList.toggle('duplex-mode', isDuplex);
        
        const checkboxes = document.querySelectorAll('.date-header input[type=checkbox]');
        
        // Reset all first
        checkboxes.forEach(cb => {
            if (cb.checked) {
                cb.checked = false;
                // Extract ID from the section (parent's parent)
                const sectionId = cb.closest('.date-section').id;
                togglePageSpacer(cb, sectionId);
            }
            cb.disabled = !isDuplex;
        });

        if (!isDuplex) return;

        const sections = document.querySelectorAll('.date-section');
        let nextPage = 1;
        const baseHeight = parseInt(document.getElementById('paperSize').value, 10);
        const marginRed = parseInt(document.getElementById('printMargins').value, 10);
        const PAGE_HEIGHT = baseHeight - marginRed;

        sections.forEach((section, index) => {
            let height = section.offsetHeight;
            
            if (index === 0) {
                const h1 = document.querySelector('h1');
                if (h1) height += h1.offsetHeight + 20; // + margins (reduced to avoid overestimation)
            }

            // If we are on an even page, we need to insert a blank to start on odd
            if (nextPage % 2 === 0) {
                const cb = section.querySelector('input[type=checkbox]');
                if (cb) {
                    cb.checked = true;
                    togglePageSpacer(cb, section.id);
                    nextPage++; // The spacer consumes the even page
                }
            }

            const pages = Math.ceil(height / PAGE_HEIGHT);
            nextPage += pages;
        });
    }
    window.addEventListener('load', processListImages);
    processListImages();
    </script>
    </body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    document.getElementById('dropdown-menu').classList.remove('open');
}

export function exportPrintableGrid() {
    const attendingEvents = [];
    const allEvents = [...state.appData];
    allEvents.forEach(ev => {
        const timeData = parseTimeRange(ev.timePeriod);
        if (!timeData) return;
        let s = timeData.start + SHIFT_START_ADD;
        let uid = `${ev.date}_${ev.name}_${s}`;

        let isHidden = false;
        if (state.hiddenUids.has(uid)) {
            if (!state.showHiddenTemp) return;
            isHidden = true;
        }

        if (state.attendingIds.has(uid)) attendingEvents.push({ ...ev, startMins: s, endMins: timeData.end + SHIFT_END_ADD, uid: uid, isHiddenTemp: isHidden });
    });

    state.customEvents.forEach(ev => {
        let isHidden = false;
        if (state.hiddenUids.has(ev.uid)) {
            if (!state.showHiddenTemp) return;
            isHidden = true;
        }
        if (state.attendingIds.has(ev.uid)) attendingEvents.push({ ...ev, isHiddenTemp: isHidden });
    });

    if (attendingEvents.length === 0) {
        alert("No events marked as Attending.");
        return;
    }

    attendingEvents.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startMins - b.startMins;
    });

    const PX_PER_MIN = 0.8;
    const GRID_STEP_PX = PX_PER_MIN * 15;
    const HOUR_STEP_PX = PX_PER_MIN * 60;

    const printWindow = window.open('', '_blank');
    let html = `
    <html><head><title>My Voyage Agenda</title>
    <style>
        body { font-family: sans-serif; padding: 20px; color: #333; }
        h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .date-section { margin-bottom: 30px; break-before: page; }
        body.duplex-mode .date-section { break-before: right; break-before: recto; page-break-before: right; page-break-before: recto; }
        h1 + .date-section, body.duplex-mode h1 + .date-section { break-before: auto; page-break-before: auto; }
        .date-header { background: #eee; padding: 8px; font-weight: bold; border-left: 4px solid #333; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
        .day-grid { display: flex; border: 1px solid #ddd; position: relative; height: 1200px; } /* Approx height */
        .time-ruler { width: 50px; border-right: 1px solid #eee; position: relative; background: #fafafa; font-size: 0.75em; color: #888; }
        .time-marker { position: absolute; width: 100%; text-align: right; padding-right: 5px; border-top: 1px solid #eee; }
        .events-area { flex: 1; position: relative; background-image: repeating-linear-gradient(to bottom, #ccc 0, #ccc 1px, transparent 1px, transparent ${HOUR_STEP_PX}px), repeating-linear-gradient(to bottom, #f0f0f0 0, #f0f0f0 1px, transparent 1px, transparent ${GRID_STEP_PX}px); }
        .print-card { position: absolute; border: 1px solid #ccc; background: white; padding: 4px; font-size: 0.8em; overflow: hidden; box-sizing: border-box; display: flex; flex-direction: row; }
        .print-card-details { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        
        /* Main content wrapper */
        .print-card-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        
        /* Short events: Horizontal layout for main content */
        .print-card-details.short .print-card-main { flex-direction: row; align-items: center; flex-wrap: wrap; gap: 6px; line-height: 1.1; }
        
        .print-card-time { font-weight: bold; font-size: 0.9em; margin-bottom: 2px; white-space: nowrap; }
        .print-card-details.short .print-card-time { margin-bottom: 0; font-size: 0.85em; }
        
        .print-card-title { font-weight: bold; color: #000; }
        .print-card-details.short .print-card-title { font-size: 0.85em; }
        
        .print-card-loc { font-style: italic; color: #555; }
        .print-card-details.short .print-card-loc { font-size: 0.85em; }
        
        .print-card-note { color: #777; border-top: 1px solid #eee; margin-top: 2px; padding-top: 2px; }
        
        /* Grid layout for ANY event with a note */
        .print-card-details.has-note {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 0 8px;
            align-items: center;
        }
        
        .print-card-details.has-note .print-card-note {
            grid-column: 2;
            border-top: none;
            border-left: 1px solid #eee;
            padding-left: 6px;
            margin-top: 0;
            padding-top: 0;
            display: flex;
            align-items: center;
            max-width: 40%;
            font-size: 0.85em;
            height: 100%;
        }

        .print-card-img { height: 100%; width: auto; max-width: 60px; object-fit: cover; margin-right: 4px; border-radius: 2px; }
        .print-card[data-is-optional="true"] {
            border-style: dashed !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        @media print { 
            .no-print { display: none; } 
            /* Hide the manual spacer checkbox when printing */
            .date-header label { display: none !important; }
        }
    </style>
    </head><body>
    <div style="text-align: right; margin-bottom: 10px;" class="no-print">
        <button onclick="window.print()" style="background: #AF231C; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer;">Print Itinerary</button>
        <div style="margin-top: 10px;">
            <label style="cursor:pointer; font-size: 0.9em; display: inline-flex; align-items: center;">
                <input type="checkbox" id="duplexCheck" onchange="autoCalculateDuplex()" style="margin-right: 6px;">
                Duplex Printing (Start each day on new sheet)
            </label>
        </div>
        <div style="margin-top: 5px;">
            <label style="font-size: 0.9em; margin-right: 6px;">Paper Size:</label>
            <select id="paperSize" onchange="autoCalculateDuplex()" style="font-size: 0.9em; padding: 2px;">
                <option value="1056">Letter (8.5" x 11")</option>
                <option value="1123">A4 (210mm x 297mm)</option>
                <option value="1344">Legal (8.5" x 14")</option>
            </select>
        </div>
        <div style="margin-top: 5px;">
            <label style="font-size: 0.9em; margin-right: 6px;">Margins:</label>
            <select id="printMargins" onchange="autoCalculateDuplex()" style="font-size: 0.9em; padding: 2px;">
                <option value="0">None</option>
                <option value="40">Minimum</option>
                <option value="96" selected>Default</option>
            </select>
        </div>
    </div>
    <h1>My Voyage Agenda</h1>
    `;

    // Group by Date
    const eventsByDate = {};
    attendingEvents.forEach(ev => {
        if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
        eventsByDate[ev.date].push(ev);
    });

    const sortedDates = Object.keys(eventsByDate).sort();

    sortedDates.forEach(date => {
        const dObj = new Date(date + 'T00:00:00');

        // Calculate dynamic start/end for this day
        const dayEvents = eventsByDate[date];
        if (!dayEvents || dayEvents.length === 0) return;

        let minMins = Math.min(...dayEvents.map(e => e.startMins));
        let maxMins = Math.max(...dayEvents.map(e => e.endMins));

        // Round to nearest hour, with some padding
        let startHour = Math.floor(minMins / 60);
        let endHour = Math.ceil(maxMins / 60);

        // Ensure we don't go out of bounds (0-24) but allow extending past midnight
        startHour = Math.max(0, startHour - 1); // Add 1 hour padding before
        endHour = endHour + 1;    // Add 1 hour padding after

        const dayStartMins = startHour * 60;
        const totalDayMins = (endHour - startHour) * 60;
        const gridHeight = totalDayMins * PX_PER_MIN;

        const portName = state.portNotes[date] ? ` <span style="font-weight:normal; color:#666;">(${state.portNotes[date]})</span>` : '';

        html += `
            <div class="date-section" id="date-${date}">
                <div class="date-header">
                    <div>${dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${portName}</div>
                    <label class="no-print" style="font-size:0.8rem; font-weight:normal; display:flex; align-items:center; cursor:pointer; margin-left: 10px;">
                        <input type="checkbox" onchange="togglePageSpacer(this, 'date-${date}')" style="margin-right:4px;" disabled> Add Blank Page Before
                    </label>
                </div>
                <div class="day-grid" style="height: ${gridHeight}px;">
                    <div class="time-ruler">
        `;

        // Time Markers
        for (let h = startHour; h < endHour; h++) {
            const top = (h * 60 - dayStartMins) * PX_PER_MIN;
            let normalizedH = h % 24;
            let displayH = (normalizedH === 0 || normalizedH === 12) ? 12 : normalizedH % 12;
            let ampm = (normalizedH >= 12) ? 'pm' : 'am';
            const label = `${displayH}${ampm}`;
            html += `<div class="time-marker" style="top: ${top}px;">${label}</div>`;
        }

        html += `   </div>
                    <div class="events-area">
        `;

        // Calculate Lanes
        const events = dayEvents.sort((a, b) => a.startMins - b.startMins || (b.endMins - b.startMins) - (a.endMins - a.startMins));
        const lanes = [];
        events.forEach(ev => {
            let placed = false;
            for (let i = 0; i < lanes.length; i++) {
                const lane = lanes[i];
                const hasOverlap = lane.some(existing => ev.startMins < existing.endMins && existing.startMins < ev.endMins);
                if (!hasOverlap) {
                    lane.push(ev);
                    ev.laneIndex = i;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                lanes.push([ev]);
                ev.laneIndex = lanes.length - 1;
            }
        });

        const laneWidthPercent = 100 / lanes.length;

        events.forEach(ev => {
            const startOffset = ev.startMins - dayStartMins;
            const duration = ev.endMins - ev.startMins;
            const top = startOffset * PX_PER_MIN;
            const height = Math.max(20, duration * PX_PER_MIN);
            const left = ev.laneIndex * laneWidthPercent;
            const width = laneWidthPercent;

            const fmt = (m) => {
                let h = Math.floor(m / 60) % 24;
                let min = m % 60;
                return `${h === 12 || h === 0 ? 12 : h % 12}:${min.toString().padStart(2, '0')}${h >= 12 && h < 24 ? 'pm' : 'am'}`;
            };
            const timeStr = `${fmt(ev.startMins)} - ${fmt(ev.endMins)}`;
            const note = state.eventNotes[ev.uid];
            const imgUrl = ev.imageUrl || '';
            const isShort = duration <= 60;
            const showImage = imgUrl && !isShort;
            const hasHiddenImage = imgUrl && isShort;
            const isOptional = state.optionalEvents.has(ev.name);

            html += `
                <div class="print-card" data-is-custom="${ev.isCustom ? 'true' : 'false'}" data-is-optional="${isOptional}" style="top: ${top}px; height: ${height}px; left: ${left}%; width: ${width}%; border-left: 4px solid ${ev.color || '#ccc'};">
                    ${showImage ? `<img src="${imgUrl}" class="print-card-img" crossorigin="anonymous">` : ''}
                    ${hasHiddenImage ? `<img src="${imgUrl}" style="display:none;" crossorigin="anonymous">` : ''}
                    <div class="print-card-details ${isShort ? 'short' : ''} ${note ? 'has-note' : ''}">
                        <div class="print-card-main">
                            <div class="print-card-time">${timeStr}</div>
                            <div class="print-card-title">${ev.name}</div>
                            <div class="print-card-loc">${ev.location || ''}</div>
                        </div>
                        ${note ? `<div class="print-card-note">Note: ${note}</div>` : ''}
                    </div>
                </div>
            `;
        });

        html += `   </div>
                </div>
            </div>
        `;
    });

    html += `
    <script>
    function getContrastYIQ(r, g, b) {
        var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? 'black' : 'white';
    }

    function getDominantColor(img) {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 50;
            canvas.height = 50;
            ctx.drawImage(img, 0, 0, 50, 50);
            const data = ctx.getImageData(0, 0, 50, 50).data;
            const colorCounts = {};
            let maxCount = 0;
            let dominant = null;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                const a = data[i+3];
                if (a < 128) continue;

                // Skip grayscale colors (black, white, gray)
                // If the difference between max and min RGB is small, it's grayscale
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const colorfulness = max - min;
                
                // Skip if colorfulness is below threshold (grayscale)
                if (colorfulness < 30) continue;

                const qR = Math.round(r / 20) * 20;
                const qG = Math.round(g / 20) * 20;
                const qB = Math.round(b / 20) * 20;
                
                const key = qR + ',' + qG + ',' + qB;
                colorCounts[key] = (colorCounts[key] || 0) + 1;
                
                if (colorCounts[key] > maxCount) {
                    maxCount = colorCounts[key];
                    dominant = { r: qR, g: qG, b: qB };
                }
            }
            return dominant;
        } catch (e) {
            return null;
        }
    }

    function processCards() {
        const cards = document.querySelectorAll('.print-card');
        cards.forEach(card => {
            // Check for Custom Event first
            if (card.dataset.isCustom === 'true') {
                // Apply blue styling for custom events
                card.style.backgroundColor = '#eff6ff'; // blue-50
                card.style.color = '#1e3a8a'; // blue-900
                card.style.borderColor = '#bfdbfe'; // blue-200
                
                const title = card.querySelector('.print-card-title');
                if (title) title.style.color = '#1e3a8a';
                
                const loc = card.querySelector('.print-card-loc');
                if (loc) loc.style.color = '#1d4ed8'; // blue-700
                
                const note = card.querySelector('.print-card-note');
                if (note) {
                     note.style.color = '#60a5fa'; // blue-400
                     note.style.borderColor = '#dbeafe'; // blue-100
                }
                return; // Skip image processing for custom events
            }

            const img = card.querySelector('img');
            if (!img) return;

            const applyColor = () => {
                const c = getDominantColor(img);
                if (!c) return;
                
                card.style.backgroundColor = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
                
                const textColor = getContrastYIQ(c.r, c.g, c.b);
                card.style.color = textColor;
                
                const title = card.querySelector('.print-card-title');
                if (title) title.style.color = textColor;
                
                const loc = card.querySelector('.print-card-loc');
                if (loc) loc.style.color = textColor === 'black' ? '#333' : '#eee';
                
                const note = card.querySelector('.print-card-note');
                if (note) {
                     note.style.color = textColor === 'black' ? '#555' : '#ccc';
                     note.style.borderColor = textColor === 'black' ? '#eee' : '#555';
                }
                card.style.borderColor = textColor === 'black' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)';
            };

            if (img.complete) {
                applyColor();
            } else {
                img.onload = applyColor;
            }
        });
    }
    
    function togglePageSpacer(cb, id) {
        const section = document.getElementById(id);
        if (cb.checked) {
            const spacer = document.createElement('div');
            spacer.id = 'spacer-' + id;
            spacer.style.pageBreakBefore = 'always';
            spacer.style.height = '1px'; 
            spacer.style.visibility = 'hidden';
            section.parentNode.insertBefore(spacer, section);
        } else {
            const spacer = document.getElementById('spacer-' + id);
            if (spacer) spacer.remove();
        }
    }

    function autoCalculateDuplex() {
        const isDuplex = document.getElementById('duplexCheck').checked;
        document.body.classList.toggle('duplex-mode', isDuplex);
        
        const checkboxes = document.querySelectorAll('.date-header input[type=checkbox]');
        
        // Reset all first
        checkboxes.forEach(cb => {
            if (cb.checked) {
                cb.checked = false;
                const sectionId = cb.closest('.date-section').id;
                togglePageSpacer(cb, sectionId);
            }
            cb.disabled = !isDuplex;
        });

        if (!isDuplex) return;

        const sections = document.querySelectorAll('.date-section');
        let nextPage = 1;
        const baseHeight = parseInt(document.getElementById('paperSize').value, 10);
        const marginRed = parseInt(document.getElementById('printMargins').value, 10);
        const PAGE_HEIGHT = baseHeight - marginRed;

        sections.forEach((section, index) => {
            let height = section.offsetHeight;
            
            if (index === 0) {
                const h1 = document.querySelector('h1');
                if (h1) height += h1.offsetHeight + 20; 
            }

            if (nextPage % 2 === 0) {
                const cb = section.querySelector('input[type=checkbox]');
                if (cb) {
                    cb.checked = true;
                    togglePageSpacer(cb, section.id);
                    nextPage++; 
                }
            }

            const pages = Math.ceil(height / PAGE_HEIGHT);
            nextPage += pages;
        });
    }
    
    window.addEventListener('load', processCards);
    // Also try running immediately in case images are already cached
    processCards();
    </script>
    </body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    document.getElementById('dropdown-menu').classList.remove('open');
}
