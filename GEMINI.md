# **Documentation Regarding the Virgin Voyages Visual Itinerary Planning Application**

## **I. Project Overview and Functional Scope**

The software herein described constitutes a specialized, browser-based interface designed expressly for the visual organization, temporal management, and strategic planning of cruise itineraries associated with the Virgin Voyages commercial entity. The primary function of this application involves the algorithmic transmutation of a raw JavaScript Object Notation (JSON) agenda file—specifically designated within the repository as CleanAgenda.json—into a coherent, interactive, and chronological grid matrix.

Beyond mere visualization, provision is made within the application for the granular administration of attendance records, allowing the end-user to distinguish between potential options and confirmed engagements. Furthermore, the system includes robust mechanisms for the resolution of temporal conflicts, the instantiation of user-defined custom events to supplement the official itinerary, the annotation of specific dates with "Port Notes", and the persistent retention of all user-generated state data via the browser's native LocalStorage mechanism. This architecture ensures that the planning process remains autonomous and localized to the user's device, obviating the need for external account authentication or remote database connectivity.

## **II. Architectural Specifications and Infrastructure**

* **Frontend Interface:** The user interface is comprised of an HTML document (index.html), a separate CSS file (styles.css), and a separate JavaScript file (script.js). This modular structure separates structural markup, styling directives (incorporating the Tailwind CSS framework via Content Delivery Network, augmented by bespoke CSS specifications for custom component rendering), and the executable Vanilla JavaScript logic required for data processing and DOM manipulation. No build steps or bundling processes are required for the deployment of the frontend.  
* **Backend Infrastructure:** A minimal Python http.server module (server.py) is employed exclusively for the provision of the static file assets. This server component is necessary not for data processing, but rather for the circumvention of Cross-Origin Resource Sharing (CORS) restrictions and strict file protocol limitations inherent to modern web browsers when loading local modules or resources.  
* **Data Persistence:** Data storage is achieved via the browser-based localStorage property. Consequently, no server-side database is utilized, ensuring data sovereignty for the user but limiting data portability between distinct devices unless the underlying JSON representation is manually exported and migrated.

## **III. Containerization Instructions (Docker)**

### **1\. Image Construction**

To facilitate the consistent deployment of the application across varying computing environments, a Docker container definition is provided. A build script (`build_docker.sh`) is available to automate the creation of multiple image variants:
- `virgin-voyages-planner:latest`: Standard online version.
- `virgin-voyages-planner:offline`: Offline version with bundled assets.
- `virgin-voyages-planner:<git-sha>`: Versioned tags for specific commits.

Execute the following command to build all variants:

./build_docker.sh

This process instantiates a lightweight environment based on Python 3.11-slim.

### **2\. Container Execution**

Following the successful construction of the image, the container shall be initialized via the following command:

docker run \-p 8000:8000 virgin-voyages-planner

Upon execution, the internal port 8000 is bound to the host machine's port 8000\. Access to the running application may subsequently be obtained via the local host address: http://localhost:8000. This encapsulation ensures that the Python runtime dependencies are isolated from the host operating system.

## **IV. Technical Specifications and Logical Framework (Contextual Reference for Artificial Intelligence Modification)**

*This section is intended to serve as the technical context for automated code modification systems, defining the internal logic governing the application.*

### **1\. Data Structures (JavaScript)**

The following JavaScript data structures form the basis of the application's state management and in-memory processing:

* appData: An array of event objects derived directly from the parsing of the uploaded JSON file. This structure serves as the immutable source of truth for the official itinerary.  
* customEvents: An array of user-generated event objects. This structure mirrors the schema of appData but includes an additional isCustom: true property to distinguish these items during rendering. Furthermore, recurring custom events are linked via an optional seriesId to facilitate batch operations.  
* attendingIds: A JavaScript Set containing unique event identifiers (uid) corresponding to events affirmatively marked for attendance by the user. The use of a Set ensures O(1) complexity for attendance lookups during the rendering cycle.  
* hiddenNames: A Set of strings representing event titles that have been globally concealed by the user (Series Suppression). Any event in the source data matching a name in this set is excluded from the visual grid.  
* hiddenUids: A Set of strings representing unique identifiers for specific event instances that have been concealed by the user (Instance Suppression). This allows for the removal of a single occurrence of a recurring event without affecting the visibility of the remainder of the series.
* portNotes: A JavaScript Object mapping date strings ("YYYY-MM-DD") to user-defined string values (e.g., "Cozumel"). These notes are rendered within the day header.
* eventNotes: A JavaScript Object mapping event UIDs to user-defined string values. These notes are displayed in tooltips and included in printed outputs.

### **2\. Unique Identifier Generation (UID)**

To maintain referential integrity within the DOM and state management systems, events are assigned a unique identifier during the initial processing phase:

* **Format:** The string literal is constructed as ${date}\_${name}\_${startMinutes}.  
* **Purpose:** This mechanism serves to distinguish specific instances of recurring events (e.g., a performance of "Red Hot" occurring on Tuesday versus the same performance on Wednesday). It enables the targeted manipulation of specific DOM elements associated with a distinct temporal occurrence.

### **3\. Temporal Processing Logic**

* **Parsing:** A heuristic parseTimeRange function is employed to convert human-readable time strings (e.g., "1:30-3pm" or "8pm") into integer values representing minutes elapsed since midnight (0-1440+). Single time strings (without a range) default to a 60-minute duration.
* **Heuristics:**  
  * **Overnight Calculation:** Designations of "Late" are interpreted as 3:00 AM on the subsequent day to ensure proper grid placement.  
  * **Midnight Handling:** 12:00 AM is interpreted as 24:00 (end of the current day) rather than 0:00 (start of the day) to correctly position late-night events at the bottom of the daily grid.
  * **Suffix Inference:** In the absence of explicit AM/PM suffixes, the system infers the correct period based on event duration minimization (presuming events do not exceed 12 hours in length).  
  * **Temporal Adjustments:** The previously hardcoded temporal shifts have been reset to 0 (SHIFT\_START\_ADD \= 0, SHIFT\_END\_ADD \= 0), assuming the source data is now accurate without need for systematic offset correction.

### **4\. Visual Grid Layout Logic**

* **Lane Packing Algorithm:** A greedy algorithm is utilized to detect and resolve temporal overlaps within a single day column. Should Event A temporally overlap with Event B, Event B is visually displaced to a new horizontal column ("Lane") within the day container. This ensures that no two event cards obscure one another.  
* **Coordinate Snapping:** The drag-to-create interface enforces the snapping of visual coordinates to 15-pixel increments. Given the scale where 1 pixel equates to 1 minute, this compels all user-generated events to align with standard 15-minute intervals (e.g., 10:00, 10:15, 10:30).

### **5\. CSS State Classes**

* .is-attending: Applied when a uid is present in attendingIds. This class applies a green background color to signify user confirmation.  
* .is-dimmed: Applied if the specific instance is not marked as attended, yet a sibling event (sharing the same name property) is marked for attendance at an alternative time. This results in grayscale rendering and reduced opacity to visually deprioritize the conflict.  
* .is-sibling-highlight: Applied dynamically upon mouse hover. This class illuminates all alternative occurrences of the targeted event via a prominent blue border, facilitating rapid comparison of scheduling options.

### **6\. Local Storage Keys**

* virginVoyagesData: Represents the serialized string of the raw JSON derived from the file upload.  
* virginVoyagesCustomEvents: Represents the serialized array of custom event objects.  
* virginVoyagesAttendance: Represents the serialized array of UIDs marked for attendance.  
* virginVoyagesHiddenNames: Represents the serialized array of strings for hidden event series.  
* virginVoyagesHiddenUids: Represents the serialized array of UIDs for hidden event instances.
* virginVoyagesPortNotes: Represents the serialized object of port notes.
* virginVoyagesEventNotes: Represents the serialized object of event notes.
* virginVoyagesBlacklist: Represents the serialized Set of permanently blacklisted event names.
* virginVoyagesOptionalEvents: Represents the serialized Set of event names marked as optional.
* virginVoyagesTheme: Stores the user's preferred theme ('light' or 'dark').
* virginVoyagesShownUids: Represents the serialized Set of UIDs for instances explicitly unhidden from a hidden series.
* virginVoyagesTimeBlocks: Represents the serialized Object containing user-defined start times for day segments (Morning, Lunch, Afternoon, Dinner, Evening).

### **7. Security Architecture**

* **API Token Management:** The Virgin Voyages API authentication token is no longer hardcoded within the client-side JavaScript. It is injected into the application at runtime via environment variables (`VV_AUTH_TOKEN`).
  * **Local Development:** Loaded from a `.env` file via `server.py`.
  * **Docker/Production:** Passed as an environment variable to the container or injected during the build process for GitHub Pages.
* **Secret Management:** Sensitive credentials are stored in GitHub Secrets and are never committed to the repository.

### **8. Deployment & Versioning**

* **Cache Busting:** A custom deployment script (`deploy_gh_pages.sh`) appends a unique timestamp query parameter (e.g., `?v=1234567890`) to all CSS and JavaScript resource links in `index.html` during the build process. This ensures that end-users always receive the most recent code version, bypassing aggressive browser caching.
* **CI/CD Optimization:** GitHub Actions workflows are configured to run only on the latest commit of a push event, preventing redundant builds and saving computation resources.
* **Docker Versioning:** Docker images are automatically tagged with the Git commit SHA, allowing for precise version tracking and rollback capabilities.

## **V. User Interaction Protocols**

1. **Custom Event Generation:** Time definitions are established via drag-and-drop or click operations on the grid surface. Upon releasing the mouse button or clicking a time slot, a temporary "Add Event" button (displayed as a dashed blue box with a plus sign) is created at the selected time. Clicking this button instantiates a modal interface to capture event details. If the button is not clicked, interacting elsewhere on the screen removes it. If the "Repeat Daily" option is selected in the modal, multiple event objects sharing a common seriesId are instantiated across all available dates.
2. **Search Functionality:** The search bar includes a dropdown menu (accessible via the magnifying glass icon) that allows users to toggle between "Title Only" (default) and "Title & Description" search modes. This enables more precise filtering of the itinerary.
3. **Contextual Menu:** A custom right-click context menu facilitates rapid interaction. Options include the toggling of attendance status, navigation to the Next/Previous occurrence of the selected event series, editing (restricted to Custom events), deletion (restricted to Custom events), suppression (Hiding), blacklisting (restricted to Official events not currently attended), and external search (Google/VVInsider).  
4. **Modal Dialogs:**  
   * **Hide/Delete/Edit Operations:** In the event of an action targeting a repeating occurrence, the user is prompted via a secondary modal to apply the action to the specific "Instance" (single UID) or the entire "Series" (matching seriesId or name).  
   * **Data Integrity:** The closure of a modal containing unsaved form modifications triggers a window.confirm validation check to prevent the accidental loss of user input.
5. **Hidden Events Manager:** Accessible via the main menu, this interface allows users to review and restore suppressed events. It supports horizontal swipe gestures to navigate between tabs and is divided into three tabs:
   * **Hidden Series:** Manages global suppressions based on event name. Restoring an item here unhides every instance of that event across the entire itinerary.
   * **Partially Hidden:** Shows event series that are globally hidden but have specific instances marked as "Attending" (and thus visible). This state allows users to keep the bulk of a series hidden while retaining specific bookings.
   * **Hidden Instances:** Manages specific, time-based suppressions (UIDs). Restoring an item here only unhides that single occurrence.
6. **Attendance Panel (Missing Events):** A slide-out panel (toggled via the clipboard icon) designed to help users identify unbooked activities. Supports horizontal swipe gestures to navigate between tabs.
   *   **Logic:**
       *   **Required Tab:** Lists event series where *zero* instances have been marked as "Attending". This effectively shows "what I haven't scheduled yet".
       *   **Optional Tab:** Lists event series that the user has explicitly flagged as "Optional".
   *   **Interaction:** Users can toggle an event between "Required" and "Optional" states using the button in the panel header. Clicking an event instance scrolls the grid to that specific time slot.
7. **Printing:** The application supports two print formats:
   * **Day Grid View:** A visual representation of the daily schedule, preserving the grid layout.
   * **Simple List View:** A chronological, text-based list of attended events, grouped by day.
8. **Blacklist Manager:** Accessible via the main menu, this feature allows users to maintain a persistent list of event names to be globally excluded from the application. This is useful for permanently hiding uninteresting events.
9. **Data Import/Export:**
   * **Import:** The application accepts three types of file uploads:
     * A single `CleanAgenda.json` file.
     * Multiple raw JSON files (one per day) extracted directly from the Virgin Voyages API. The system automatically parses and combines these into a unified agenda.
     * A `virgin-voyages-backup.json` file, which restores the user's entire state (attendance, custom events, notes, etc.).
   * **Export:** Users can export their current state to a JSON file via the "Export Backup" menu option.
10. **Visual Feedback & Layout Logic:**
   * **Sibling Indicators:** Events belonging to a series where another instance is already attended display a prominent green left border. This visual cue helps users avoid booking duplicate experiences.
   * **Optional Event Placement:** To minimize visual clutter, "Optional" events that temporally conflict with an "Attending" event are automatically rendered in a secondary right-hand column within the day grid.
   * **Tooltip Data:** The event tooltip is a comprehensive information hub, displaying:
     * Core details (Title, Time, Location).
     * Full description and image.
     * User-defined notes.
     * A "Sibling List" showing all other occurrences of the event, with visual indicators for the currently attended instance.
11. **Dark Mode:**
    *   The application supports a toggleable dark theme (via the Moon/Sun icon). This preference is persisted in local storage (`virginVoyagesTheme`) and defaults to the system preference if not set.
12. **Time Block Configuration:**
    *   Users can customize the start times for the five primary day segments: Morning, Lunch, Afternoon, Dinner, and Evening.
    *   These settings are accessed via the main menu and are persisted in `virginVoyagesTimeBlocks`.
    *   Changes to these times immediately trigger a re-render of the grid to reflect the new temporal boundaries.
13. **Smart Scheduler:**
    *   **Purpose:** An automated wizard that generates a proposed schedule based on the user's "Required" events (those not yet attended).
    *   **Workflow:**
        1.  **Intro:** Explains the process.
        2.  **Checklist:** Ensures the user has set up their constraints (Blacklist, Custom Events, Optional Events).
        3.  **Processing:** Runs a greedy algorithm to maximize attendance of remaining required events.
            *   **Bingo Logic:** Treats "Bingo Card Sales" and the subsequent "Bingo" game as a single atomic block.
        4.  **Conflict Resolution:** If the algorithm cannot find a conflict-free slot for a required event, it presents the user with a choice:
            *   **Skip:** Do not schedule this event.
            *   **Select Instance:** Force-schedule a specific instance (potentially creating a conflict).
        5.  **Preview:** Shows the proposed additions before applying them to the main state.
    *   **Algorithm:** Prioritizes events with fewer remaining opportunities (most constrained first). Respects existing "Attending" events as locked.