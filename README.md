# Virgin Voyages Visual Itinerary Planner

**🚀 Live Version: [https://claytonraymond2004.github.io/virgin-voyages-planner/](https://claytonraymond2004.github.io/virgin-voyages-planner/)**

A specialized, browser-based interface designed for the visual organization, temporal management, and strategic planning of cruise itineraries associated with Virgin Voyages. This application transforms a raw JSON agenda file into a coherent, interactive, and chronological grid matrix.

## Features

- **Visual Grid Layout**: Automatically organizes events into a clear, time-based grid with smart lane packing for overlapping events.
- **Attendance Management**:
  - **Attending**: Mark events as "Attending" to highlight them in green.
  - **Conflict Handling**: Conflicting events or alternative times for the same show are visually dimmed or highlighted to help you decide.
- **Custom Events**: Create your own events (e.g., "Dinner Reservation", "Meetup") by simply dragging on the grid to define the time range.
- **Port Notes**: Add custom notes to each day (e.g., "Cozumel", "At Sea") by clicking on the day header.
- **Event Notes**: Add personal notes to any specific event. These notes appear in the event tooltip and are included in the printed itinerary.
- **Privacy & Persistence**: All data is stored locally in your browser's `localStorage`. No account creation or remote server is required.
- **Search**: Filter events by title or description using the search bar. Use the dropdown menu to toggle between "Title Only" and "Title & Description" modes.
- **Context Menu**: Right-click on any event to access quick actions like toggling attendance, hiding specific instances, editing custom events, blacklisting events, or searching for the event on Google/VVInsider.
- **Printable Itinerary**: Export your schedule in a clean "Day Grid" or "Simple List" format, perfect for printing or saving as PDF.
- **Hidden Events Manager**: Easily view and restore events you've previously hidden, organized by series or individual instances.
- **Missing Events Panel**: Quickly identify event series you haven't booked yet ("Required") and manage optional activities.
- **Blacklist Events**: Permanently hide specific events from the schedule (e.g., events you know you'll never attend) to declutter your view.
- **Time Block Configuration**: Customize the start times for Morning, Lunch, Afternoon, Dinner, and Evening blocks to match your personal schedule.
- **Smart Scheduler**: An intelligent wizard that automatically builds a schedule for you, prioritizing events you haven't seen yet and resolving conflicts.
- **Mobile Optimized**: Enhanced mobile experience with improved menus, dividers, and touch-friendly event cards.
- **Backup & Restore**: Export your entire itinerary state (including attendance, custom events, and notes) to a JSON file for safekeeping or transfer to another device.

## How to Use

1.  **Start the Application**: Follow the "How to Run" instructions below to open the app in your browser.
2.  **Upload Data**:
    - **Raw Data**: Drag and drop your `CleanAgenda.json` file (or multiple daily JSON files extracted from the Virgin Voyages App API calls) onto the upload screen.
    - **Restore Backup**: Drag and drop a previously exported `virgin-voyages-backup.json` file to restore your state.
3.  **Navigate the Schedule**: Scroll horizontally and vertically through the timeline to view events.
4.  **Interact with Events**:
    - **Hover**: View event details (if applicable).
    - **Left Click**: Toggle attendance (if avaialble).
    - **Right Click**: Open the context menu to **Add Notes**, **Hide**, **Toggle Optional**, **Edit**, **Blacklist**, **Delete**, **Jump to Next/Previous Occurrence** or **Research Online**.
5.  **Add Custom Events**:
    - **Click** or **Drag** on an empty lane to define a time range.
    - A temporary **Add Event Button** (+) will appear. Click it to confirm.
    - Enter the title, location, and description in the modal. 
    - Adjust the date and time as needed. 
    - Choose if it repeats daily.
6.  **Add Port Notes**:
    - Click the `+`  button (or existing note) in any day header to add or edit a note for that day.
7.  **Add Event Notes**:
    - Right-click on any event and select **Edit Note**.
    - Enter your personal note (e.g., "Wear white", "Meet John here").
    - Notes are visible in the event tooltip and on the printed itinerary.
8.  **Manage Hidden Events**:
    - Access the **Hidden Events Manager** (crossed through eye icon) from the menu bar to view and restore hidden event series or single instances.
9.  **Missing Events Panel**:
    - Open the **Attendance Panel** (clipboard icon).
    - **Logic**: Shows "Required" events (series where you haven't attended *any* instance yet) and "Optional" events; Hidden events are not shown.
    - **Actions**:
        - Click any event to jump to its next occurrence.
        - Click the **"Mark Optional"** button next to an event to move it to the Optional tab (useful for events you might skip).
10. **Print Itinerary**:
    - Click the **Print** icon in the toolbar.
    - Choose between **Day Grid View** (visual calendar) or **Simple List View** (chronological list).
11. **Blacklist Events**:
    - Open the hamburger menu and select **Blacklist Events**.
    - Paste a list of event names (one per line) to permanently hide them from the application.
12. **Configure Time Blocks**:
    - Open the hamburger menu and select **Configure Time Blocks**.
    - Adjust the start times for Morning, Lunch, Afternoon, Dinner, and Evening.
    - Click **Save** to apply the changes immediately.
13. **Smart Scheduler**:
    - Open the hamburger menu and select **Smart Scheduler**.
    - Follow the wizard to automatically fill your schedule with events you haven't booked yet.
    - Resolve any conflicts and confirm the proposed schedule.
14. **Backup & Restore**:
    - **Export**: Open the hamburger menu and select **Export Backup** to download your current state.
    - **Import**: Use the "Upload Data" screen (refresh the page if needed) to upload your backup file.
15. **Dark Mode**:
    - Toggle between Light and Dark themes using the **Moon/Sun icon** in the toolbar.

## Key Concepts & Tips

-   **Attendance Toggling**:
    -   You cannot toggle attendance for a hidden event directly. You must first unhide it via the **Hidden Events Manager**.
    -   **Multi-Instance Helper**: When you mark an event as "Attending" that has other occurrences, the app will ask if you want to hide the other instances to clean up your schedule.
-   **Visual Layout**:
    -   **Required Events**: Always appear on the left side of the day column.
    -   **Optional Events**: If an optional event conflicts with an event you are attending, it will automatically shift to the right side of the column to avoid visual clutter.
    -   **Sibling Indicators**: Events that have other instances (siblings) will show a **green left border** if you are already attending one of the other instances in that series.
-   **Event Tooltips**: Hovering over an event shows:
    -   Full Title & Location
    -   Time Duration
    -   Description & Image
    -   Your Personal Notes
    -   **Sibling List**: A list of all other times this event occurs, with checkmarks indicating which one you are attending.
-   **Port Notes**:
    -   To **Edit**: Click the existing note text in the header.
    -   To **Remove**: Click the note to edit it, clear the text, and press Enter.
-   **Hidden Events Manager Logic**:
    -   **Hidden Series**: Shows entire event groups (e.g., "Yoga Class") that you have globally hidden and are **not** attending any instances of.
    -   **Partially Hidden**: Shows event series that you have globally hidden, but where you have explicitly marked specific instances as "Attending". This allows you to keep the series hidden while retaining your specific bookings.
    -   **Hidden Instances**: Shows specific one-off times you hid (e.g., just the 8 AM Yoga class). Restoring here brings back only that specific slot.

## How to Run

You can run this application locally using Python or Docker.

### Environment Setup (API Token)

To use the Virgin Voyages API integration, you need to provide an authorization token for the email login endpoint (this seems like a poor attempt to protect the Virgin Voyages API through obscurity).

You can find this token by snooping the HTTPS traffic (you will need to break/inspect) from the Virgin Voyages app during email account login to `https://mobile.shore.virginvoyages.com/user-account-service/signin/email`. It will be in the `Authorization` header as a Basic Auth token. As far as I can tell, this is a static token that does not change between users (but it may change during app updates?).

Note: This token is only needed for Options 1 - 3 of running the app. The token is already included in the Docker image for Option 4 or at [https://claytonraymond2004.github.io/virgin-voyages-planner/](https://claytonraymond2004.github.io/virgin-voyages-planner/)

**Hint**: You can also find find the token in the `virgin_api.js` file at [https://claytonraymond2004.github.io/virgin-voyages-planner/virgin_api.js](https://claytonraymond2004.github.io/virgin-voyages-planner/virgin_api.js) around line 31 if you don't want to snoop the HTTPS traffic. 😉

1.  **Create a `.env` file** in the root directory of the project.
2.  Add your token to the file:
    ```env
    VV_AUTH_TOKEN=virgin_app_base64_encoded_token_here
    ```

### Option 1: Python (Recommended for local dev)

This method requires Python 3 installed on your machine. It will automatically load the `VV_AUTH_TOKEN` from your `.env` file.

1.  Open a terminal and navigate to the project directory.
2.  Run the included server script:
    ```bash
    python3 server.py
    ```
3.  Open your web browser and navigate to:
    [http://localhost:8000](http://localhost:8000)

### Option 2: Docker with Live Reload (Volume Mount)

Use this option if you want to edit files locally and see changes immediately without building a Docker image.

1.  **Run the container directly**:
    ```bash
    docker run -p 8000:8000 --env-file .env -v "$(pwd):/app" python:3.11-slim python /app/server.py
    ```
    *Note: On Windows PowerShell, use `${PWD}` instead of `$(pwd)`.*

2.  Open your web browser and navigate to:
    [http://localhost:8000](http://localhost:8000)

### Option 3: Docker (Production / Offline)
This method ensures a consistent environment isolated from your system. You can build two versions:
- **Standard (Online)**: Uses CDNs for Tailwind CSS and Google Fonts (smaller image size).
- **Offline**: Downloads all external assets into the image, requiring no internet connection at runtime.

1.  **Build the Docker images**:
    Use the provided script to build and tag both versions automatically:
    ```bash
    ./build_docker.sh
    ```
    This will create the following images:
    - `virgin-voyages-planner:latest` (Online version)
    - `virgin-voyages-planner:offline` (Offline version)
    - `virgin-voyages-planner:<git-sha>` (Versioned tags)

2.  **Run the container**:
    
    **For the Standard (Online) version:**
    ```bash
    docker run -p 8000:8000 --env-file .env virgin-voyages-planner:latest
    ```

    **For the Offline version:**
    ```bash
    docker run -p 8000:8000 --env-file .env virgin-voyages-planner:offline
    ```

3.  Open your web browser and navigate to:
    [http://localhost:8000](http://localhost:8000)

### Option 4: Pull from GitHub Container Registry

You can also pull the pre-built images directly from GitHub without building them yourself. The VV_AUTH_TOKEN is already included in this build.

1.  **Run the Standard (Online) version**:
    ```bash
    docker run -p 8000:8000 ghcr.io/claytonraymond2004/virgin-voyages-planner:latest
    ```

2.  **Run the Offline version**:
    ```bash
    docker run -p 8000:8000 ghcr.io/claytonraymond2004/virgin-voyages-planner:offline
    ```

3.  Open your web browser and navigate to:
    [http://localhost:8000](http://localhost:8000)

## Technical Overview

- **Frontend**: HTML (`index.html`), CSS (`styles.css`), and Vanilla JavaScript (`script.js`, `print_logic.js`). Tailwind CSS is used via CDN. No build step required.
- **Backend**: A lightweight Python `http.server` (`server.py`) serves static files to handle local CORS/protocol restrictions.
- **Data**: State is managed via `localStorage` keys:
  - `virginVoyagesData`: Raw JSON data.
  - `virginVoyagesAttendance`: User's attending events.
  - `virginVoyagesCustomEvents`: User-created events.
  - `virginVoyagesPortNotes`: User's port notes.
  - `virginVoyagesEventNotes`: User's event notes.
  - `virginVoyagesHiddenNames`: Globally hidden event series.
  - `virginVoyagesHiddenUids`: Individually hidden event instances.
  - `virginVoyagesBlacklist`: Permanently blacklisted event names.
  - `virginVoyagesOptionalEvents`: Events marked as optional.
  - `virginVoyagesTheme`: User's theme preference (light/dark).
  - `virginVoyagesTimeBlocks`: User's custom time block definitions.
