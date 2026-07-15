/**
 * app.js - TaskFlow Controller and UI Binder
 * Handles CRUD operations, local persistence, statistics calculation,
 * calendar rendering, recurrence resets, and reminder alerts.
 */

class TaskFlowApp {
  constructor() {
    this.storageKey = 'taskflow_tasks';
    
    // UI State
    this.selectedFilter = 'all'; // 'all', 'pending', 'completed', 'recurring'
    this.searchQuery = '';
    this.sortBy = 'due_date'; // 'due_date', 'priority', 'title'
    this.editingTaskId = null;
    this.tempSubtasks = []; // Subtask staging list for modals
    
    // Log of triggered reminders to prevent duplicates
    this.triggeredReminders = this.loadTriggeredReminders();

    this.initElements();
    this.bindEvents();
    
    // Run initial recurrence checks
    this.checkAndResetRecurringTasks();
    
    // Initial render
    this.render();

    // Start periodic background checks (every 30 seconds for resets & reminders)
    this.startBackgroundChecks();
  }

  // Retrieve tasks from Local Storage
  getTasks() {
    const data = localStorage.getItem(this.storageKey);
    return data ? JSON.parse(data) : [];
  }

  // Save tasks to Local Storage
  saveTasks(tasks) {
    localStorage.setItem(this.storageKey, JSON.stringify(tasks));
  }

  // Load triggered reminders
  loadTriggeredReminders() {
    return new Set(JSON.parse(localStorage.getItem('taskflow_triggered_reminders') || '[]'));
  }

  // Save triggered reminders
  saveTriggeredReminders() {
    localStorage.setItem('taskflow_triggered_reminders', JSON.stringify(Array.from(this.triggeredReminders)));
  }

  initElements() {
    this.elements = {
      // Containers
      taskListPending: document.getElementById('pending-list'),
      taskListCompleted: document.getElementById('completed-list'),
      pendingSection: document.getElementById('pending-group'),
      completedSection: document.getElementById('completed-group'),
      emptyState: document.getElementById('empty-state'),
      headerDate: document.getElementById('header-date'),
      
      // Badges
      badgeAll: document.getElementById('badge-all'),
      badgePending: document.getElementById('badge-pending'),
      badgeCompleted: document.getElementById('badge-completed'),
      badgeRecurring: document.getElementById('badge-recurring'),
      
      // Inputs & Sorting
      search: document.getElementById('search-input'),
      sort: document.getElementById('sort-select'),
      navItems: document.querySelectorAll('.menu-item'),
      themeBtn: document.getElementById('theme-toggle-btn'),
      
      // Modals
      modalOverlay: document.getElementById('task-modal'),
      modalTitle: document.querySelector('.modal-header h3'),
      modalForm: document.getElementById('task-form'),
      btnCloseModal: document.querySelector('.btn-close-modal'),
      btnCancelModal: document.querySelector('.btn-cancel-modal'),
      
      // Modal Inputs
      inputTitle: document.getElementById('task-title'),
      inputDesc: document.getElementById('task-desc'),
      inputDueDate: document.getElementById('task-due'),
      inputPriority: document.getElementById('task-priority'),
      inputRecurrence: document.getElementById('task-recurrence'),
      inputReminder: document.getElementById('task-reminder'),
      
      // Modal Subtasks
      inputSubtaskNew: document.getElementById('subtask-input'),
      btnAddSubtask: document.getElementById('btn-add-subtask'),
      subtasksStaging: document.getElementById('subtasks-staging'),
      
      // Stats Widgets
      statsProgressRing: document.getElementById('stats-progress-ring'),
      statsCompletionPct: document.getElementById('stats-completion-pct'),
      statsTotalNum: document.getElementById('stats-total-num'),
      statsCompletedNum: document.getElementById('stats-completed-num'),
      
      // Priority bars
      barHigh: document.getElementById('bar-high'),
      barMedium: document.getElementById('bar-medium'),
      barLow: document.getElementById('bar-low'),
      countHigh: document.getElementById('count-high'),
      countMedium: document.getElementById('count-medium'),
      countLow: document.getElementById('count-low'),
      
      // Calendar
      calendarTitle: document.getElementById('calendar-title'),
      calendarDaysGrid: document.getElementById('calendar-days-grid')
    };

    // Show current human date in header
    if (this.elements.headerDate) {
      this.elements.headerDate.textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  }

  bindEvents() {
    const el = this.elements;

    // Search and Sort
    if (el.search) {
      el.search.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.render();
      });
    }

    if (el.sort) {
      el.sort.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.render();
      });
    }

    // Category navigation filter click
    el.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        el.navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        this.selectedFilter = item.dataset.filter;
        this.render();
      });
    });

    // Add Task Modal triggers
    document.querySelectorAll('.btn-add-task').forEach(btn => {
      btn.addEventListener('click', () => this.openTaskModal());
    });

    if (el.btnCloseModal) el.btnCloseModal.addEventListener('click', () => this.closeTaskModal());
    if (el.btnCancelModal) el.btnCancelModal.addEventListener('click', () => this.closeTaskModal());

    // Modal Subtasks
    if (el.btnAddSubtask) {
      el.btnAddSubtask.addEventListener('click', () => this.stageSubtask());
    }
    if (el.inputSubtaskNew) {
      el.inputSubtaskNew.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.stageSubtask();
        }
      });
    }

    // Modal submit
    if (el.modalForm) {
      el.modalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveTaskFromModal();
      });
    }

    // Theme toggle
    if (el.themeBtn) {
      el.themeBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-theme');
        el.themeBtn.querySelector('.material-icons').textContent = isDark ? 'dark_mode' : 'light_mode';
        el.themeBtn.querySelector('.theme-text').textContent = isDark ? 'Dark Mode' : 'Light Mode';
      });
    }
  }

  // Toast System
  toast(title, message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <div class="toast-close">&times;</div>
    `;

    container.appendChild(toast);

    const timer = setTimeout(() => {
      toast.style.animation = 'slide-in 0.3s ease-in reverse forwards';
      setTimeout(() => toast.remove(), 300);
    }, 5000);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      clearTimeout(timer);
      toast.remove();
    });

    // Native browser push notification
    if (Notification.permission === 'granted') {
      new Notification(`TaskFlow - ${title}`, { body: message });
    }
  }

  // Background timer loop (every 30s)
  startBackgroundChecks() {
    setInterval(() => {
      this.checkAndResetRecurringTasks();
      this.checkDueDatesAndReminders();
    }, 30000);
  }

  // Recurrence reset logic (at midnight)
  checkAndResetRecurringTasks() {
    const tasks = this.getTasks();
    const nowTime = new Date();
    let updated = false;

    tasks.forEach(task => {
      if (task.status && task.recurrence_type && task.recurrence_type !== 'none' && task.completed_at) {
        const completedAt = new Date(task.completed_at);
        const resetBoundary = this.getNextResetBoundary(completedAt, task.recurrence_type);

        if (nowTime >= resetBoundary) {
          if (!task.completion_history) {
            task.completion_history = [];
          }
          task.completion_history.push(task.completed_at);

          // Reset properties to reopen task
          task.status = false;
          task.completed_at = null;
          task.updated_at = nowTime.toISOString();
          
          this.toast(
            `Routine Reset: ${task.title}`,
            `Task has reset to active for the new interval.`,
            'info'
          );
          updated = true;
        }
      }
    });

    if (updated) {
      this.saveTasks(tasks);
      this.render();
    }
  }

  getNextResetBoundary(completedAt, recurrence) {
    const date = new Date(completedAt.getTime());
    date.setHours(0, 0, 0, 0);

    if (recurrence === 'daily') {
      date.setDate(date.getDate() + 1);
    } else if (recurrence === 'weekly') {
      const day = date.getDay();
      const daysToNextMonday = day === 0 ? 1 : 8 - day;
      date.setDate(date.getDate() + daysToNextMonday);
    } else if (recurrence === 'monthly') {
      date.setMonth(date.getMonth() + 1);
      date.setDate(1);
    } else if (recurrence === 'yearly') {
      date.setFullYear(date.getFullYear() + 1);
      date.setMonth(0);
      date.setDate(1);
    }
    
    return date;
  }

  // Alarms Checker
  checkDueDatesAndReminders() {
    const tasks = this.getTasks();
    const nowTime = new Date();

    tasks.forEach(task => {
      if (task.status || !task.due_date) return;

      const dueTime = new Date(task.due_date);
      let triggerTime = null;

      if (task.reminder_time === 'at_due') {
        triggerTime = dueTime;
      } else if (task.reminder_time === '10m_before') {
        triggerTime = new Date(dueTime.getTime() - 10 * 60 * 1000);
      } else if (task.reminder_time === '30m_before') {
        triggerTime = new Date(dueTime.getTime() - 30 * 60 * 1000);
      } else if (task.reminder_time === '1h_before') {
        triggerTime = new Date(dueTime.getTime() - 60 * 60 * 1000);
      }

      if (triggerTime && nowTime >= triggerTime) {
        const reminderId = `${task.task_id}_${triggerTime.getTime()}`;
        if (!this.triggeredReminders.has(reminderId)) {
          this.triggeredReminders.add(reminderId);
          this.saveTriggeredReminders();
          
          const diffMinutes = Math.round((dueTime - nowTime) / (60 * 1000));
          let timeText = 'due now!';
          if (diffMinutes > 0) {
            timeText = `due in ${diffMinutes} minutes.`;
          }

          this.toast(
            `Reminder: ${task.title}`,
            `Task is ${timeText} (${dueTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`,
            'info'
          );
        }
      }
    });
  }

  // Render Loop
  render() {
    const tasks = this.getTasks();

    // 1. Calculate and update badge counts
    const counts = {
      all: tasks.length,
      pending: tasks.filter(t => !t.status).length,
      completed: tasks.filter(t => t.status).length,
      recurring: tasks.filter(t => t.recurrence_type && t.recurrence_type !== 'none').length
    };

    if (this.elements.badgeAll) this.elements.badgeAll.textContent = counts.all;
    if (this.elements.badgePending) this.elements.badgePending.textContent = counts.pending;
    if (this.elements.badgeCompleted) this.elements.badgeCompleted.textContent = counts.completed;
    if (this.elements.badgeRecurring) this.elements.badgeRecurring.textContent = counts.recurring;

    // 2. Filter tasks
    let filteredTasks = tasks.filter(task => {
      if (this.selectedFilter === 'pending' && task.status) return false;
      if (this.selectedFilter === 'completed' && !task.status) return false;
      if (this.selectedFilter === 'recurring' && (!task.recurrence_type || task.recurrence_type === 'none')) return false;

      if (this.searchQuery) {
        const titleMatch = task.title.toLowerCase().includes(this.searchQuery);
        const descMatch = task.description && task.description.toLowerCase().includes(this.searchQuery);
        return titleMatch || descMatch;
      }

      return true;
    });

    // 3. Sort tasks
    filteredTasks.sort((a, b) => {
      if (this.sortBy === 'title') {
        return a.title.localeCompare(b.title);
      } else if (this.sortBy === 'priority') {
        const priorityWeight = { 'high': 3, 'medium': 2, 'low': 1 };
        return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
      } else {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      }
    });

    const pendingTasks = filteredTasks.filter(t => !t.status);
    const completedTasks = filteredTasks.filter(t => t.status);

    // 4. Render checklist elements
    this.renderTaskList(pendingTasks, this.elements.taskListPending);
    this.renderTaskList(completedTasks, this.elements.taskListCompleted);

    // Toggle Empty state visual
    if (filteredTasks.length === 0) {
      this.elements.emptyState.style.display = 'flex';
      this.elements.pendingSection.style.display = 'none';
      this.elements.completedSection.style.display = 'none';
    } else {
      this.elements.emptyState.style.display = 'none';
      this.elements.pendingSection.style.display = pendingTasks.length > 0 ? 'block' : 'none';
      this.elements.completedSection.style.display = completedTasks.length > 0 ? 'block' : 'none';
    }

    // 5. Update Productivity Stats Panel & Calendar Widget
    this.updateStatsWidgets(tasks);
    this.renderCalendar(tasks);
  }

  renderTaskList(tasks, containerElement) {
    if (!containerElement) return;
    containerElement.innerHTML = '';

    tasks.forEach(task => {
      const card = document.createElement('div');
      card.className = `task-card ${task.status ? 'completed' : ''}`;
      card.dataset.id = task.task_id;

      const priorityClass = task.priority.toLowerCase();
      const priorityName = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);

      let dueDateHTML = '';
      if (task.due_date) {
        const d = new Date(task.due_date);
        const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dueDateHTML = `
          <div class="task-meta-tag date-tag">
            <span class="material-icons" style="font-size:0.85rem">calendar_today</span>
            ${formattedDate}
          </div>
        `;
      }

      let recurrenceHTML = '';
      if (task.recurrence_type && task.recurrence_type !== 'none') {
        recurrenceHTML = `
          <div class="task-meta-tag recurrence-tag">
            <span class="material-icons" style="font-size:0.85rem">sync</span>
            ${task.recurrence_type.charAt(0).toUpperCase() + task.recurrence_type.slice(1)}
          </div>
        `;
      }

      // Subtasks inline list & progress calculations
      let progressHTML = '';
      let subtasksHTML = '';
      if (task.subtasks && task.subtasks.length > 0) {
        const completedCount = task.subtasks.filter(s => s.status).length;
        const totalCount = task.subtasks.length;
        const pct = Math.round((completedCount / totalCount) * 100);
        
        progressHTML = `
          <div class="progress-bar-container" title="${completedCount}/${totalCount} subtasks completed">
            <span>${completedCount}/${totalCount}</span>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        `;

        subtasksHTML = `
          <div class="task-card-subtasks" onclick="event.stopPropagation()">
            ${task.subtasks.map(sub => `
              <div class="task-card-subtask-item">
                <label class="custom-checkbox" style="width:16px; height:16px;">
                  <input type="checkbox" ${sub.status ? 'checked' : ''} data-task-id="${task.task_id}" data-sub-id="${sub.subtask_id}" class="subtask-inline-toggle">
                  <span class="checkmark subtask-checkmark"></span>
                </label>
                <span class="subtask-inline-title ${sub.status ? 'completed' : ''}">${this.escapeHTML(sub.title)}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="task-card-header">
          <label class="custom-checkbox" onclick="event.stopPropagation()">
            <input type="checkbox" ${task.status ? 'checked' : ''} data-id="${task.task_id}" class="task-complete-toggle">
            <span class="checkmark"></span>
          </label>
          <div class="task-card-title-group">
            <span class="task-title">${this.escapeHTML(task.title)}</span>
            ${task.description ? `<p class="task-desc">${this.escapeHTML(task.description)}</p>` : ''}
            ${subtasksHTML}
          </div>
          <div class="task-actions" onclick="event.stopPropagation()">
            <button class="btn btn-icon btn-edit" title="Edit Task" data-id="${task.task_id}">
              <span class="material-icons" style="font-size:1.1rem">edit</span>
            </button>
            <button class="btn btn-icon btn-icon-danger btn-delete" title="Delete Task" data-id="${task.task_id}">
              <span class="material-icons" style="font-size:1.1rem">delete</span>
            </button>
          </div>
        </div>
        
        <div class="task-card-footer">
          <div class="task-meta-left">
            <div class="task-meta-tag priority-tag ${priorityClass}">
              ${priorityName}
            </div>
            ${dueDateHTML}
            ${recurrenceHTML}
          </div>
          ${progressHTML}
        </div>
      `;

      // Event bindings inside card
      
      // Complete toggle
      const check = card.querySelector('.task-complete-toggle');
      check.addEventListener('change', (e) => {
        const status = e.target.checked;
        const allTasks = this.getTasks();
        const tIdx = allTasks.findIndex(t => t.task_id === task.task_id);
        if (tIdx !== -1) {
          allTasks[tIdx].status = status;
          allTasks[tIdx].completed_at = status ? new Date().toISOString() : null;
          allTasks[tIdx].updated_at = new Date().toISOString();
          
          this.saveTasks(allTasks);
          this.render();
          this.toast(
            status ? 'Task Completed' : 'Task Reopened',
            `"${task.title}" has been updated.`
          );
        }
      });

      // Inline subtask checkbox toggles
      card.querySelectorAll('.subtask-inline-toggle').forEach(subCheck => {
        subCheck.addEventListener('change', (e) => {
          const taskId = e.target.dataset.taskId;
          const subId = e.target.dataset.subId;
          const status = e.target.checked;

          const allTasks = this.getTasks();
          const t = allTasks.find(item => item.task_id === taskId);
          if (t && t.subtasks) {
            const s = t.subtasks.find(item => item.subtask_id === subId);
            if (s) {
              s.status = status;
              t.updated_at = new Date().toISOString();
              this.saveTasks(allTasks);
              this.render();
              this.toast(
                status ? 'Subtask Completed' : 'Subtask Reopened',
                `"${s.title}" has been updated.`
              );
            }
          }
        });
      });

      card.querySelector('.btn-edit').addEventListener('click', () => {
        this.openTaskModal(task.task_id);
      });

      card.querySelector('.btn-delete').addEventListener('click', () => {
        this.confirmDeleteTask(task.task_id);
      });

      card.addEventListener('click', () => {
        this.openTaskModal(task.task_id);
      });

      containerElement.appendChild(card);
    });
  }

  escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // Modal forms
  openTaskModal(taskId = null) {
    const el = this.elements;
    this.editingTaskId = taskId;
    this.tempSubtasks = [];

    if (taskId) {
      el.modalTitle.textContent = 'Edit Task';
      const tasks = this.getTasks();
      const task = tasks.find(t => t.task_id === taskId);
      if (!task) return;

      el.inputTitle.value = task.title;
      el.inputDesc.value = task.description || '';
      el.inputDueDate.value = task.due_date ? task.due_date.substring(0, 16) : '';
      el.inputPriority.value = task.priority;
      el.inputRecurrence.value = task.recurrence_type || 'none';
      el.inputReminder.value = task.reminder_time || 'at_due';
      
      if (task.subtasks) {
        this.tempSubtasks = JSON.parse(JSON.stringify(task.subtasks));
      }
    } else {
      el.modalTitle.textContent = 'Create New Task';
      el.modalForm.reset();
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      
      const pad = (n) => n.toString().padStart(2, '0');
      const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth()+1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;
      el.inputDueDate.value = tomorrowStr;
      el.inputPriority.value = 'medium';
      el.inputRecurrence.value = 'none';
      el.inputReminder.value = 'at_due';
    }

    this.renderStagedSubtasks();
    el.modalOverlay.classList.add('active');
  }

  closeTaskModal() {
    this.elements.modalOverlay.classList.remove('active');
    this.editingTaskId = null;
  }

  stageSubtask() {
    const titleInput = this.elements.inputSubtaskNew;
    const title = titleInput.value.trim();
    if (!title) return;

    this.tempSubtasks.push({
      subtask_id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      title: title,
      status: false
    });

    titleInput.value = '';
    this.renderStagedSubtasks();
  }

  renderStagedSubtasks() {
    const container = this.elements.subtasksStaging;
    if (!container) return;
    container.innerHTML = '';

    this.tempSubtasks.forEach((sub, index) => {
      const item = document.createElement('div');
      item.className = `subtask-item ${sub.status ? 'completed' : ''}`;
      
      item.innerHTML = `
        <div class="subtask-item-left">
          <label class="custom-checkbox" onclick="event.stopPropagation()">
            <input type="checkbox" ${sub.status ? 'checked' : ''} class="sub-toggle">
            <span class="checkmark" style="width:16px; height:16px; border-width: 1px;"></span>
          </label>
          <span class="subtask-title-text">${this.escapeHTML(sub.title)}</span>
        </div>
        <button type="button" class="btn btn-icon btn-icon-danger btn-sub-del" style="width:24px; height:24px;">
          <span class="material-icons" style="font-size:0.95rem">close</span>
        </button>
      `;

      item.querySelector('.sub-toggle').addEventListener('change', (e) => {
        this.tempSubtasks[index].status = e.target.checked;
        item.classList.toggle('completed', e.target.checked);
      });

      item.querySelector('.btn-sub-del').addEventListener('click', () => {
        this.tempSubtasks.splice(index, 1);
        this.renderStagedSubtasks();
      });

      container.appendChild(item);
    });
  }

  saveTaskFromModal() {
    const el = this.elements;
    const title = el.inputTitle.value.trim();
    if (!title) return;

    const taskData = {
      title,
      description: el.inputDesc.value.trim(),
      due_date: el.inputDueDate.value || null,
      priority: el.inputPriority.value,
      recurrence_type: el.inputRecurrence.value,
      reminder_time: el.inputReminder.value,
      subtasks: this.tempSubtasks
    };

    const allTasks = this.getTasks();

    if (this.editingTaskId) {
      const index = allTasks.findIndex(t => t.task_id === this.editingTaskId);
      if (index !== -1) {
        allTasks[index] = {
          ...allTasks[index],
          ...taskData,
          updated_at: new Date().toISOString()
        };
        this.toast('Task Updated', `Changes to "${title}" were saved.`);
      }
    } else {
      const nowStr = new Date().toISOString();
      const newTask = {
        task_id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        user_id: 'default_user',
        status: false,
        created_at: nowStr,
        updated_at: nowStr,
        completed_at: null,
        completion_history: [],
        ...taskData
      };
      allTasks.push(newTask);
      this.toast('Task Created', `"${title}" has been created.`);
    }

    this.saveTasks(allTasks);
    this.closeTaskModal();
    this.render();
  }

  confirmDeleteTask(taskId) {
    const allTasks = this.getTasks();
    const task = allTasks.find(t => t.task_id === taskId);
    if (!task) return;

    if (confirm(`Are you sure you want to permanently delete task "${task.title}"?`)) {
      const filtered = allTasks.filter(t => t.task_id !== taskId);
      this.saveTasks(filtered);
      this.toast('Task Deleted', `"${task.title}" was removed permanently.`, 'error');
      this.render();
    }
  }

  // Update Productivity Stats Widgets
  updateStatsWidgets(tasks) {
    const el = this.elements;
    if (!el.statsProgressRing) return;

    const total = tasks.length;
    const completed = tasks.filter(t => t.status).length;
    const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

    // 1. Update text nodes
    el.statsTotalNum.textContent = total;
    el.statsCompletedNum.textContent = completed;
    el.statsCompletionPct.textContent = `${pct}%`;

    // 2. Set circle dashoffset (r=40, circumference = 251.2)
    const strokeDashoffset = 251.2 - (pct / 100) * 251.2;
    el.statsProgressRing.style.strokeDashoffset = strokeDashoffset;

    // 3. Update priority counts & bars
    const countHigh = tasks.filter(t => t.priority === 'high').length;
    const countMedium = tasks.filter(t => t.priority === 'medium').length;
    const countLow = tasks.filter(t => t.priority === 'low').length;

    el.countHigh.textContent = countHigh;
    el.countMedium.textContent = countMedium;
    el.countLow.textContent = countLow;

    const maxCount = total === 0 ? 1 : total;
    el.barHigh.style.width = `${(countHigh / maxCount) * 100}%`;
    el.barMedium.style.width = `${(countMedium / maxCount) * 100}%`;
    el.barLow.style.width = `${(countLow / maxCount) * 100}%`;
  }

  // Render Calendar Grid widget with event indicators
  renderCalendar(tasks) {
    const el = this.elements;
    if (!el.calendarDaysGrid) return;

    el.calendarDaysGrid.innerHTML = '';
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Set month title
    const monthName = now.toLocaleString('default', { month: 'long' });
    el.calendarTitle.textContent = `${monthName} ${currentYear}`;

    // Get number of days in month and starting weekday
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startWeekday = firstDay.getDay(); // 0 = Sun, 1 = Mon ...
    const totalDays = lastDay.getDate();

    // Map due date dates from tasks to build dot indicators
    const dueDatesMap = new Set();
    tasks.forEach(task => {
      if (task.due_date && !task.status) {
        const d = new Date(task.due_date);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          dueDatesMap.add(d.getDate());
        }
      }
    });

    // Get days in previous month for prepended inactive cells
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();

    // Prepend previous month's final days as inactive placeholders
    for (let i = startWeekday - 1; i >= 0; i--) {
      const cell = document.createElement('div');
      cell.className = 'calendar-day-cell inactive';
      cell.textContent = prevMonthLastDay - i;
      el.calendarDaysGrid.appendChild(cell);
    }

    // Load actual days of current month
    for (let day = 1; day <= totalDays; day++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-day-cell';
      cell.textContent = day;

      // Add "today" highlight
      if (day === now.getDate()) {
        cell.classList.add('today');
      }

      // Add dot indicator if task is due on this date
      if (dueDatesMap.has(day)) {
        const dot = document.createElement('div');
        dot.className = 'calendar-event-dot';
        cell.appendChild(dot);
      }

      // Clicking calendar day updates search filter to tasks due on that day
      cell.addEventListener('click', () => {
        const pad = (n) => n.toString().padStart(2, '0');
        const targetDateStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(day)}`;
        
        // Find tasks due on that date
        const matches = tasks.filter(t => t.due_date && t.due_date.startsWith(targetDateStr));
        if (matches.length > 0) {
          this.toast(
            `Tasks Due on ${monthName} ${day}`,
            `Found ${matches.length} tasks scheduled for this day.`
          );
        }
      });

      el.calendarDaysGrid.appendChild(cell);
    }

    // Append trailing days from next month to make grid square (multiple of 7)
    const totalRenderedCells = startWeekday + totalDays;
    const remainingDays = 42 - totalRenderedCells; // 6 rows * 7 columns = 42 cells
    for (let i = 1; i <= remainingDays; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-day-cell inactive';
      cell.textContent = i;
      el.calendarDaysGrid.appendChild(cell);
    }
  }
}

// Instantiate App
document.addEventListener('DOMContentLoaded', () => {
  // Populate initial task templates if storage is empty
  if (!localStorage.getItem('taskflow_tasks')) {
    const initialTasks = [
      {
        task_id: 'sample-1',
        user_id: 'default_user',
        title: 'Complete Project Submission 🚀',
        description: 'Verify layout styling, test checkmarks, and compile the final walkthrough reports.',
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        priority: 'high',
        status: false,
        recurrence_type: 'none',
        reminder_time: 'at_due',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
        completion_history: [],
        subtasks: [
          { subtask_id: 's1', title: 'Refactor layout columns', status: true },
          { subtask_id: 's2', title: 'Double check dark theme variables', status: false },
          { subtask_id: 's3', title: 'Verify responsive CSS grid', status: false }
        ]
      },
      {
        task_id: 'sample-2',
        user_id: 'default_user',
        title: 'Review Analytics Hub 📈',
        description: 'Check task completion circle widgets and priority distributions.',
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        priority: 'medium',
        status: false,
        recurrence_type: 'none',
        reminder_time: 'at_due',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
        completion_history: [],
        subtasks: []
      },
      {
        task_id: 'sample-3',
        user_id: 'default_user',
        title: 'Drink Water 💧',
        description: 'Daily health routine resets automatically every midnight.',
        due_date: new Date().toISOString(),
        priority: 'low',
        status: true,
        recurrence_type: 'daily',
        reminder_time: 'at_due',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        completion_history: [],
        subtasks: []
      }
    ];
    localStorage.setItem('taskflow_tasks', JSON.stringify(initialTasks));
  }

  // Request browser push permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  window.taskFlowApp = new TaskFlowApp();
});
