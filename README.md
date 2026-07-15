# TaskFlow – Smart To-Do List App

TaskFlow is a premium, client-side, local-first task management application designed with a beautiful three-column layout. It helps users organize, prioritize, and track their daily activities efficiently.

## 🚀 Key Features

* **Visual Workspace**: Organized sidebar filters (All, Active, Completed, Recurring) to navigate tasks.
* **Productivity Hub**: Live analytics dashboard with:
  * **Task Completion Ring**: SVG circular chart showing completion percentages.
  * **Priority Distribution**: Statistics bars representing ratios of task priority levels.
  * **Due Date Calendar Grid**: Highlights today's date and draws dot indicators on dates with active task deadlines.
* **Subtasks Checklist**: Double-pane editing via modals and inline checklist toggling directly on task cards.
* **Midnight Routine Resets**: Automatically resets recurring tasks (daily, weekly, monthly, yearly) on midnight boundaries.
* **Smart Reminders**: Audio/toast alarms and native push alerts before a task is due.

## 🛠️ Tech Stack

* **Frontend**: Vanilla HTML5 (semantic elements), CSS3 custom properties (glassmorphic cards, HSL palettes, transitions), and ES6 JavaScript.
* **Server**: Zero-dependency local Node.js static file server.

## 📦 How to Run Locally

1. Ensure [Node.js](https://nodejs.org/) is installed.
2. In the project directory, run:
   ```bash
   npm run dev
   ```
3. Open **[http://localhost:3000](http://localhost:3000)** in your web browser.
