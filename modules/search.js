import { state } from './state.js';
import { updateVisualStates } from './render.js';

// --- Search Logic ---

export function toggleSearchMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('search-mode-menu');
    menu.classList.toggle('hidden');
}

export function setSearchMode(mode) {
    state.searchMode = mode;
    document.getElementById('search-mode-menu').classList.add('hidden');

    // Update Checkmarks
    if (mode === 'title') {
        document.getElementById('check-title').classList.remove('hidden');
        document.getElementById('check-all').classList.add('hidden');
        document.getElementById('search-input').placeholder = "Filter Events (Title)...";
    } else {
        document.getElementById('check-title').classList.add('hidden');
        document.getElementById('check-all').classList.remove('hidden');
        document.getElementById('search-input').placeholder = "Filter Events (Title & Desc)...";
    }

    // Re-run search
    updateVisualStates();
}

export function clearSearch() {
    document.getElementById('search-input').value = '';
    updateVisualStates();
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('clear-search').classList.add('hidden');
}
