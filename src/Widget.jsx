import { useState, useEffect, useRef } from 'react';
import './Widget.css';

const STORAGE_KEY = 'todo-widget-data';

const DEFAULT_DATA = {
  headings: [
    { id: 'inbox', title: 'Inbox' },
    { id: 'backlog', title: 'Backlog' },
    { id: 'today', title: 'Today' },
    { id: 'done', title: 'Done' }
  ],
  todos: []
};

const VIEWS = {
  PLANNING: 'planning',
  TODAY: 'today',
  BOARD: 'board',
  CALENDAR: 'calendar'
};

// Smart date parser - extracts dates from natural language
const parseDateFromText = (text) => {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  // Patterns to match dates in text
  const patterns = [
    // "on 1/7", "by 1/7/26", "due 1/7/2026"
    /(?:on|by|due)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i,
    // "1/7" at end or with dash: "Task - 1/7"
    /[-–—]\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/,
    /\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/,
    // "on Jan 7", "by January 7th"
    /(?:on|by|due)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?/i,
    // "tomorrow", "today"
    /(?:^|\s)(tomorrow|today)(?:\s|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let parsedDate = null;
      let cleanedText = text;

      if (match[0].match(/tomorrow/i)) {
        parsedDate = new Date();
        parsedDate.setDate(parsedDate.getDate() + 1);
        cleanedText = text.replace(/\s*(?:on|by|due)?\s*tomorrow\s*/i, ' ').trim();
      } else if (match[0].match(/today/i)) {
        parsedDate = new Date();
        cleanedText = text.replace(/\s*(?:on|by|due)?\s*today\s*/i, ' ').trim();
      } else if (match[1] && match[2] && !isNaN(match[1])) {
        // Numeric date (1/7 or 1/7/26)
        const month = parseInt(match[1]) - 1;
        const day = parseInt(match[2]);
        let year = currentYear;

        if (match[3]) {
          year = parseInt(match[3]);
          if (year < 100) year += 2000;
        } else {
          // If the date has passed this year, assume next year
          const testDate = new Date(currentYear, month, day);
          if (testDate < new Date()) {
            year = nextYear;
          }
        }

        parsedDate = new Date(year, month, day);
        cleanedText = text.replace(match[0], '').trim();
      } else if (match[1] && match[2] && isNaN(match[1])) {
        // Month name date (Jan 7, January 7th)
        const months = {
          jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
          apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
          aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
          nov: 10, november: 10, dec: 11, december: 11
        };
        const month = months[match[1].toLowerCase()];
        const day = parseInt(match[2]);
        let year = currentYear;

        // If the date has passed this year, assume next year
        const testDate = new Date(currentYear, month, day);
        if (testDate < new Date()) {
          year = nextYear;
        }

        parsedDate = new Date(year, month, day);
        cleanedText = text.replace(match[0], '').trim();
      }

      if (parsedDate && !isNaN(parsedDate.getTime())) {
        // Format as YYYY-MM-DD for input[type="date"]
        const formatted = parsedDate.toISOString().split('T')[0];
        return {
          text: cleanedText,
          dueDate: formatted
        };
      }
    }
  }

  return { text, dueDate: null };
};

// Simple markdown renderer
const renderMarkdown = (text) => {
  if (!text) return '';

  let html = text
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Line breaks
    .replace(/\n/g, '<br>');

  return html;
};

export default function Widget() {
  const [data, setData] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    let parsedData = saved ? JSON.parse(saved) : DEFAULT_DATA;

    // Migration: Rename 'upcoming' to 'backlog' for existing data
    if (parsedData.headings) {
      parsedData.headings = parsedData.headings.map(h =>
        h.id === 'upcoming' ? { ...h, id: 'backlog', title: 'Backlog' } : h
      );
      parsedData.todos = parsedData.todos.map(t =>
        t.headingId === 'upcoming' ? { ...t, headingId: 'backlog' } : t
      );
    }

    // Migration: Add rank to existing todos
    if (parsedData.todos) {
      parsedData.todos = parsedData.todos.map((t, index) => ({
        ...t,
        rank: t.rank !== undefined ? t.rank : index * 1000
      }));
    }

    return parsedData;
  });

  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoDueDate, setNewTodoDueDate] = useState('');
  const [draggedTodo, setDraggedTodo] = useState(null);
  const [selectedTodo, setSelectedTodo] = useState(null);
  const [editingTodo, setEditingTodo] = useState(null);
  const [dropIndicator, setDropIndicator] = useState(null); // { todoId, position: 'before' | 'after' }
  const [currentView, setCurrentView] = useState(() => {
    return localStorage.getItem('todo-widget-view') || VIEWS.PLANNING;
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const newTodoInputRef = useRef(null);

  // Persist to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  // Persist view selection
  useEffect(() => {
    localStorage.setItem('todo-widget-view', currentView);
  }, [currentView]);

  // Get visible todos for current view
  const getVisibleTodos = () => {
    if (currentView === VIEWS.PLANNING) {
      return data.todos.filter(t => t.headingId === 'inbox').sort((a, b) => (a.rank || 0) - (b.rank || 0));
    } else if (currentView === VIEWS.TODAY) {
      return data.todos.filter(t => t.headingId === 'today').sort((a, b) => (a.rank || 0) - (b.rank || 0));
    } else if (currentView === VIEWS.BOARD) {
      // For board view, navigate left-to-right (by column), top-to-bottom (within column)
      const columnOrder = ['backlog', 'today', 'done'];
      const result = [];
      columnOrder.forEach(headingId => {
        const columnTodos = data.todos
          .filter(t => t.headingId === headingId)
          .sort((a, b) => (a.rank || 0) - (b.rank || 0));
        result.push(...columnTodos);
      });
      return result;
    } else if (currentView === VIEWS.CALENDAR) {
      return data.todos.filter(t => t.dueDate && t.headingId !== 'done').sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    }
    return [];
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle shortcuts if user is typing in an input or modal is open
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || selectedTodo) {
        // Handle Escape to close modal or unfocus input
        if (e.key === 'Escape') {
          if (selectedTodo) {
            closeTodoModal();
          } else if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            e.target.blur();
          }
        }
        return;
      }

      const visibleTodos = getVisibleTodos();
      if (visibleTodos.length === 0 && !['1', '2', '3', '4', '?'].includes(e.key)) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, visibleTodos.length - 1));
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (visibleTodos[selectedIndex]) {
            openTodoModal(visibleTodos[selectedIndex]);
          }
          break;
        case ' ':
          e.preventDefault();
          if (visibleTodos[selectedIndex]) {
            toggleTodoDone(visibleTodos[selectedIndex].id);
          }
          break;
        case 'i':
          e.preventDefault();
          if (visibleTodos[selectedIndex]) {
            moveTodoToHeading(visibleTodos[selectedIndex].id, 'inbox');
          }
          break;
        case 'b':
          e.preventDefault();
          if (visibleTodos[selectedIndex]) {
            moveTodoToHeading(visibleTodos[selectedIndex].id, 'backlog');
          }
          break;
        case 't':
          e.preventDefault();
          if (visibleTodos[selectedIndex]) {
            moveTodoToHeading(visibleTodos[selectedIndex].id, 'today');
          }
          break;
        case 'd':
          e.preventDefault();
          if (visibleTodos[selectedIndex]) {
            moveTodoToHeading(visibleTodos[selectedIndex].id, 'done');
          }
          break;
        case '1':
          e.preventDefault();
          setCurrentView(VIEWS.PLANNING);
          setSelectedIndex(0);
          break;
        case '2':
          e.preventDefault();
          setCurrentView(VIEWS.TODAY);
          setSelectedIndex(0);
          break;
        case '3':
          e.preventDefault();
          setCurrentView(VIEWS.BOARD);
          setSelectedIndex(0);
          break;
        case '4':
          e.preventDefault();
          setCurrentView(VIEWS.CALENDAR);
          setSelectedIndex(0);
          break;
        case '!': // Shift+1 - Jump to top of Backlog column
          e.preventDefault();
          if (currentView === VIEWS.BOARD) {
            const backlogTodos = data.todos.filter(t => t.headingId === 'backlog').sort((a, b) => (a.rank || 0) - (b.rank || 0));
            if (backlogTodos.length > 0) {
              const allVisibleTodos = getVisibleTodos();
              const firstBacklogIndex = allVisibleTodos.findIndex(t => t.id === backlogTodos[0].id);
              if (firstBacklogIndex !== -1) setSelectedIndex(firstBacklogIndex);
            }
          }
          break;
        case '@': // Shift+2 - Jump to top of Today column
          e.preventDefault();
          if (currentView === VIEWS.BOARD) {
            const todayTodos = data.todos.filter(t => t.headingId === 'today').sort((a, b) => (a.rank || 0) - (b.rank || 0));
            if (todayTodos.length > 0) {
              const allVisibleTodos = getVisibleTodos();
              const firstTodayIndex = allVisibleTodos.findIndex(t => t.id === todayTodos[0].id);
              if (firstTodayIndex !== -1) setSelectedIndex(firstTodayIndex);
            }
          }
          break;
        case '#': // Shift+3 - Jump to top of Done column
          e.preventDefault();
          if (currentView === VIEWS.BOARD) {
            const doneTodos = data.todos.filter(t => t.headingId === 'done').sort((a, b) => (a.rank || 0) - (b.rank || 0));
            if (doneTodos.length > 0) {
              const allVisibleTodos = getVisibleTodos();
              const firstDoneIndex = allVisibleTodos.findIndex(t => t.id === doneTodos[0].id);
              if (firstDoneIndex !== -1) setSelectedIndex(firstDoneIndex);
            }
          }
          break;
        case 'n':
          e.preventDefault();
          if (newTodoInputRef.current) {
            newTodoInputRef.current.focus();
          }
          break;
        case '?':
          e.preventDefault();
          setShowKeyboardHelp(true);
          break;
        case 'Escape':
          setShowKeyboardHelp(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, data.todos, currentView, selectedTodo]);

  const addTodo = (e) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;

    // Parse smart dates from text
    const parsed = parseDateFromText(newTodoText);

    // Get highest rank in inbox and add 1000
    const inboxTodos = data.todos.filter(t => t.headingId === 'inbox');
    const maxRank = inboxTodos.length > 0
      ? Math.max(...inboxTodos.map(t => t.rank || 0))
      : 0;

    const newTodo = {
      id: Date.now().toString(),
      text: parsed.text,
      description: '',
      dueDate: parsed.dueDate || newTodoDueDate || null,
      headingId: 'inbox',
      rank: maxRank + 1000,
      createdAt: new Date().toISOString()
    };

    setData(prev => ({
      ...prev,
      todos: [...prev.todos, newTodo]
    }));

    setNewTodoText('');
    setNewTodoDueDate('');
  };

  const deleteTodo = (todoId) => {
    setData(prev => ({
      ...prev,
      todos: prev.todos.filter(t => t.id !== todoId)
    }));
    if (selectedTodo?.id === todoId) {
      setSelectedTodo(null);
      setEditingTodo(null);
    }
  };

  const openTodoModal = (todo, e) => {
    // Prevent drag from interfering
    if (e) {
      e.stopPropagation();
    }
    setSelectedTodo(todo);
    setEditingTodo({ ...todo });
  };

  const closeTodoModal = () => {
    setSelectedTodo(null);
    setEditingTodo(null);
  };

  const saveTodoChanges = () => {
    if (!editingTodo) return;

    setData(prev => ({
      ...prev,
      todos: prev.todos.map(t =>
        t.id === editingTodo.id ? editingTodo : t
      )
    }));

    closeTodoModal();
  };

  const updateEditingTodo = (field, value) => {
    setEditingTodo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Quick action: Move todo to a specific heading
  const moveTodoToHeading = (todoId, headingId) => {
    setData(prev => ({
      ...prev,
      todos: prev.todos.map(t =>
        t.id === todoId ? { ...t, headingId } : t
      )
    }));
  };

  // Quick action: Snooze todo (set due date)
  const snoozeTodo = (todoId, days) => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + days);
    const formatted = newDate.toISOString().split('T')[0];

    setData(prev => ({
      ...prev,
      todos: prev.todos.map(t =>
        t.id === todoId ? { ...t, dueDate: formatted } : t
      )
    }));
  };

  // Quick action: Update due date inline
  const updateTodoDueDate = (todoId, dueDate) => {
    setData(prev => ({
      ...prev,
      todos: prev.todos.map(t =>
        t.id === todoId ? { ...t, dueDate } : t
      )
    }));
  };

  const toggleTodoDone = (todoId) => {
    setData(prev => ({
      ...prev,
      todos: prev.todos.map(t => {
        if (t.id === todoId) {
          return {
            ...t,
            headingId: t.headingId === 'done' ? 'inbox' : 'done'
          };
        }
        return t;
      })
    }));
  };

  // Reorder a todo within its list
  const reorderTodo = (todoId, targetTodoId, insertBefore = true) => {
    setData(prev => {
      const todos = [...prev.todos];
      const draggedIndex = todos.findIndex(t => t.id === todoId);
      const targetIndex = todos.findIndex(t => t.id === targetTodoId);

      if (draggedIndex === -1 || targetIndex === -1) return prev;

      const draggedTodo = todos[draggedIndex];
      const targetTodo = todos[targetIndex];

      // Calculate new rank
      let newRank;
      if (insertBefore) {
        // Insert before target
        const prevTodo = todos.find((t, i) =>
          i < targetIndex &&
          t.headingId === targetTodo.headingId &&
          t.rank < targetTodo.rank
        );
        const prevRank = prevTodo?.rank || targetTodo.rank - 1000;
        newRank = (prevRank + targetTodo.rank) / 2;
      } else {
        // Insert after target
        const nextTodo = todos.find((t, i) =>
          i > targetIndex &&
          t.headingId === targetTodo.headingId &&
          t.rank > targetTodo.rank
        );
        const nextRank = nextTodo?.rank || targetTodo.rank + 1000;
        newRank = (targetTodo.rank + nextRank) / 2;
      }

      return {
        ...prev,
        todos: todos.map(t =>
          t.id === todoId
            ? { ...t, rank: newRank, headingId: targetTodo.headingId }
            : t
        )
      };
    });
  };

  const handleDragStart = (e, todo) => {
    // Don't start drag if clicking on interactive elements
    const target = e.target;
    const isInteractive =
      target.tagName === 'A' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.closest('a') ||
      target.closest('button') ||
      target.closest('input');

    if (isInteractive) {
      e.preventDefault();
      return false;
    }

    setDraggedTodo(todo);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, headingId) => {
    e.preventDefault();
    if (!draggedTodo) return;

    // Get highest rank in target heading
    const targetTodos = data.todos.filter(t => t.headingId === headingId);
    const maxRank = targetTodos.length > 0
      ? Math.max(...targetTodos.map(t => t.rank || 0))
      : 0;

    setData(prev => ({
      ...prev,
      todos: prev.todos.map(t =>
        t.id === draggedTodo.id
          ? { ...t, headingId, rank: maxRank + 1000 }
          : t
      )
    }));

    setDraggedTodo(null);
  };

  const handleDragEnd = () => {
    setDraggedTodo(null);
    setDropIndicator(null);
  };

  // Handle drag over a specific todo (for reordering)
  const handleTodoDragOver = (e, targetTodo) => {
    // Don't interfere with links or other interactive elements
    if (e.target.tagName === 'A' || e.target.closest('a')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedTodo || draggedTodo.id === targetTodo.id) {
      setDropIndicator(null);
      return;
    }

    // Determine if we should insert before or after based on mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const position = e.clientY < midpoint ? 'before' : 'after';

    setDropIndicator({ todoId: targetTodo.id, position });
  };

  // Handle drop on a specific todo (for reordering)
  const handleTodoDrop = (e, targetTodo) => {
    // Don't interfere with links or other interactive elements
    if (e.target.tagName === 'A' || e.target.closest('a')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (!draggedTodo || draggedTodo.id === targetTodo.id) {
      setDropIndicator(null);
      return;
    }

    // Determine if we should insert before or after based on mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const insertBefore = e.clientY < midpoint;

    reorderTodo(draggedTodo.id, targetTodo.id, insertBefore);
    setDraggedTodo(null);
    setDropIndicator(null);
  };

  const getTodosByHeading = (headingId) => {
    return data.todos
      .filter(t => t.headingId === headingId)
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));
  };

  const cleanupDone = () => {
    const doneTodos = data.todos.filter(t => t.headingId === 'done');

    if (doneTodos.length === 0) {
      alert('No completed tasks to clean up');
      return;
    }

    // Generate markdown content
    const now = new Date();
    const dateString = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let markdown = `# Completed Tasks - ${dateString}\n\n`;
    markdown += `Total tasks completed: ${doneTodos.length}\n\n`;
    markdown += `---\n\n`;

    doneTodos
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .forEach(todo => {
        markdown += `## ${todo.text}\n\n`;

        if (todo.dueDate) {
          const dueDate = new Date(todo.dueDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
          markdown += `**Due Date:** ${dueDate}\n\n`;
        }

        if (todo.description) {
          markdown += `${todo.description}\n\n`;
        }

        const createdDate = new Date(todo.createdAt).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        markdown += `*Created: ${createdDate}*\n\n`;
        markdown += `---\n\n`;
      });

    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `completed-tasks-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Remove completed todos
    setData(prev => ({
      ...prev,
      todos: prev.todos.filter(t => t.headingId !== 'done')
    }));
  };

  const formatDueDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(date);
    dueDate.setHours(0, 0, 0, 0);

    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
    if (diffDays <= 7) return `In ${diffDays} days`;

    return date.toLocaleDateString();
  };

  const getDueDateClass = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(date);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < today) return 'todo-widget-overdue';
    if (dueDate.getTime() === today.getTime()) return 'todo-widget-today';
    return '';
  };

  // View-specific rendering helpers
  const renderPlanningView = () => {
    const inboxTodos = data.todos
      .filter(t => t.headingId === 'inbox')
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));

    const visibleTodos = getVisibleTodos();

    return (
      <div className="todo-widget-planning-view">
        <div className="todo-widget-view-header">
          <h4>Planning - Inbox ({inboxTodos.length})</h4>
          <p className="todo-widget-view-subtitle">Process your inbox and move tasks to backlog or today</p>
        </div>
        <div className="todo-widget-planning-list">
          {inboxTodos.length === 0 ? (
            <div className="todo-widget-empty">
              Your inbox is empty! Add tasks above or switch to Board view to see all your tasks.
            </div>
          ) : (
            inboxTodos.map((todo, index) => (
              <div
                key={todo.id}
                className={`todo-widget-planning-item
                  ${draggedTodo?.id === todo.id ? 'todo-widget-dragging' : ''}
                  ${dropIndicator?.todoId === todo.id && dropIndicator?.position === 'before' ? 'todo-widget-drop-before' : ''}
                  ${dropIndicator?.todoId === todo.id && dropIndicator?.position === 'after' ? 'todo-widget-drop-after' : ''}
                  ${visibleTodos[selectedIndex]?.id === todo.id ? 'todo-widget-planning-item-selected' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, todo)}
                onDragOver={(e) => handleTodoDragOver(e, todo)}
                onDrop={(e) => handleTodoDrop(e, todo)}
                onDragEnd={handleDragEnd}
              >
                <div className="todo-widget-planning-item-main">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => moveTodoToHeading(todo.id, 'done')}
                    className="todo-widget-checkbox"
                  />
                  <div className="todo-widget-planning-item-content">
                    <span className="todo-widget-planning-item-text">
                      {todo.text}
                      {todo.description && <span className="todo-widget-has-description">📝</span>}
                    </span>
                    {todo.dueDate && (
                      <span className={`todo-widget-due-date ${getDueDateClass(todo.dueDate)}`}>
                        {formatDueDate(todo.dueDate)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => openTodoModal(todo, e)}
                    className="todo-widget-edit-btn"
                    title="Edit task"
                  >
                    ✏️
                  </button>
                </div>
                <div className="todo-widget-planning-item-actions">
                  <input
                    type="date"
                    value={todo.dueDate || ''}
                    onChange={(e) => updateTodoDueDate(todo.id, e.target.value)}
                    className="todo-widget-inline-date"
                    title="Set due date"
                  />
                  <div className="todo-widget-snooze-buttons">
                    <button
                      onClick={() => snoozeTodo(todo.id, 1)}
                      className="todo-widget-snooze-btn"
                      title="Tomorrow"
                    >
                      Tomorrow
                    </button>
                    <button
                      onClick={() => snoozeTodo(todo.id, 7)}
                      className="todo-widget-snooze-btn"
                      title="Next week"
                    >
                      Next Week
                    </button>
                  </div>
                  <div className="todo-widget-move-buttons">
                    <button
                      onClick={() => moveTodoToHeading(todo.id, 'backlog')}
                      className="todo-widget-move-btn todo-widget-move-backlog"
                    >
                      → Backlog
                    </button>
                    <button
                      onClick={() => moveTodoToHeading(todo.id, 'today')}
                      className="todo-widget-move-btn todo-widget-move-today"
                    >
                      → Today
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderTodayView = () => {
    const todayTodos = data.todos
      .filter(t => t.headingId === 'today')
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));
    const backlogTodos = data.todos
      .filter(t => t.headingId === 'backlog')
      .sort((a, b) => (a.rank || 0) - (b.rank || 0));

    const visibleTodos = getVisibleTodos();

    return (
      <div className="todo-widget-today-view">
        <div className="todo-widget-view-header">
          <h4>Today's Focus ({todayTodos.length})</h4>
          <p className="todo-widget-view-subtitle">Focus on completing these tasks today</p>
        </div>
        <div className="todo-widget-today-list">
          {todayTodos.length === 0 ? (
            <div className="todo-widget-empty">
              No tasks for today. Move items from your backlog or inbox!
            </div>
          ) : (
            todayTodos.map((todo, index) => (
              <div
                key={todo.id}
                className={`todo-widget-today-item
                  ${draggedTodo?.id === todo.id ? 'todo-widget-dragging' : ''}
                  ${dropIndicator?.todoId === todo.id && dropIndicator?.position === 'before' ? 'todo-widget-drop-before' : ''}
                  ${dropIndicator?.todoId === todo.id && dropIndicator?.position === 'after' ? 'todo-widget-drop-after' : ''}
                  ${visibleTodos[selectedIndex]?.id === todo.id ? 'todo-widget-today-item-selected' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, todo)}
                onDragOver={(e) => handleTodoDragOver(e, todo)}
                onDrop={(e) => handleTodoDrop(e, todo)}
                onDragEnd={handleDragEnd}
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => moveTodoToHeading(todo.id, 'done')}
                  className="todo-widget-checkbox-large"
                />
                <div className="todo-widget-today-item-content">
                  <span className="todo-widget-today-item-text">
                    {todo.text}
                    {todo.description && <span className="todo-widget-has-description">📝</span>}
                  </span>
                  {todo.dueDate && (
                    <span className={`todo-widget-due-date ${getDueDateClass(todo.dueDate)}`}>
                      {formatDueDate(todo.dueDate)}
                    </span>
                  )}
                  {todo.description && (
                    <div
                      className="todo-widget-today-description-preview"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(todo.description) }}
                    />
                  )}
                </div>
                <button
                  onClick={(e) => openTodoModal(todo, e)}
                  className="todo-widget-edit-btn"
                  title="Edit task"
                >
                  ✏️
                </button>
              </div>
            ))
          )}
        </div>

        {/* Backlog Section */}
        {backlogTodos.length > 0 && (
          <div className="todo-widget-today-backlog">
            <h5 className="todo-widget-today-backlog-title">
              Backlog ({backlogTodos.length})
              <span className="todo-widget-today-backlog-subtitle">Pull tasks up when ready</span>
            </h5>
            <div className="todo-widget-today-backlog-list">
              {backlogTodos.map(todo => (
                <div key={todo.id} className="todo-widget-today-backlog-item">
                  <div className="todo-widget-today-backlog-item-content">
                    <span className="todo-widget-today-backlog-item-text">
                      {todo.text}
                      {todo.description && <span className="todo-widget-has-description">📝</span>}
                    </span>
                    {todo.dueDate && (
                      <span className={`todo-widget-due-date ${getDueDateClass(todo.dueDate)}`}>
                        {formatDueDate(todo.dueDate)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => openTodoModal(todo, e)}
                    className="todo-widget-edit-btn-small"
                    title="Edit task"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => moveTodoToHeading(todo.id, 'today')}
                    className="todo-widget-today-backlog-pull-btn"
                    title="Move to Today"
                  >
                    ↑ Today
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCalendarView = () => {
    const todosByDate = {};
    const todosWithDates = data.todos.filter(t => t.dueDate && t.headingId !== 'done');

    todosWithDates.forEach(todo => {
      if (!todosByDate[todo.dueDate]) {
        todosByDate[todo.dueDate] = [];
      }
      todosByDate[todo.dueDate].push(todo);
    });

    const sortedDates = Object.keys(todosByDate).sort((a, b) => new Date(a) - new Date(b));

    return (
      <div className="todo-widget-calendar-view">
        <div className="todo-widget-view-header">
          <h4>Calendar Timeline</h4>
          <p className="todo-widget-view-subtitle">Tasks organized by due date</p>
        </div>
        <div className="todo-widget-calendar-list">
          {sortedDates.length === 0 ? (
            <div className="todo-widget-empty">
              No tasks with due dates. Add due dates to see them here!
            </div>
          ) : (
            sortedDates.map(date => (
              <div key={date} className="todo-widget-calendar-group">
                <h5 className="todo-widget-calendar-date">
                  {new Date(date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                  <span className={`todo-widget-due-date ${getDueDateClass(date)}`}>
                    {formatDueDate(date)}
                  </span>
                </h5>
                <div className="todo-widget-calendar-items">
                  {todosByDate[date].map(todo => (
                    <div key={todo.id} className="todo-widget-calendar-item">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => moveTodoToHeading(todo.id, 'done')}
                        className="todo-widget-checkbox"
                      />
                      <div className="todo-widget-calendar-item-content">
                        <span>{todo.text}</span>
                        <span className="todo-widget-calendar-item-category">
                          {data.headings.find(h => h.id === todo.headingId)?.title}
                        </span>
                      </div>
                      <button
                        onClick={(e) => openTodoModal(todo, e)}
                        className="todo-widget-edit-btn-small"
                        title="Edit task"
                      >
                        ✏️
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="todo-widget">
      <div className="todo-widget-header">
        <div className="todo-widget-header-top">
          <h3>Todo List</h3>
          <button
            onClick={cleanupDone}
            className="todo-widget-cleanup-btn"
            title="Export and delete completed tasks"
          >
            Clean Up Done ({data.todos.filter(t => t.headingId === 'done').length})
          </button>
        </div>
        <div className="todo-widget-view-switcher">
          <button
            className={`todo-widget-view-tab ${currentView === VIEWS.PLANNING ? 'active' : ''}`}
            onClick={() => setCurrentView(VIEWS.PLANNING)}
          >
            Planning
          </button>
          <button
            className={`todo-widget-view-tab ${currentView === VIEWS.TODAY ? 'active' : ''}`}
            onClick={() => setCurrentView(VIEWS.TODAY)}
          >
            Today
          </button>
          <button
            className={`todo-widget-view-tab ${currentView === VIEWS.BOARD ? 'active' : ''}`}
            onClick={() => setCurrentView(VIEWS.BOARD)}
          >
            Board
          </button>
          <button
            className={`todo-widget-view-tab ${currentView === VIEWS.CALENDAR ? 'active' : ''}`}
            onClick={() => setCurrentView(VIEWS.CALENDAR)}
          >
            Calendar
          </button>
        </div>
      </div>

      <form className="todo-widget-input" onSubmit={addTodo}>
        <input
          ref={newTodoInputRef}
          type="text"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          placeholder="Add a new todo... (try: Work with Andy on 1/7)"
          className="todo-widget-text-input"
        />
        <input
          type="date"
          value={newTodoDueDate}
          onChange={(e) => setNewTodoDueDate(e.target.value)}
          className="todo-widget-date-input"
        />
        <button type="submit" className="todo-widget-add-btn">Add</button>
      </form>

      {currentView === VIEWS.PLANNING && renderPlanningView()}
      {currentView === VIEWS.TODAY && renderTodayView()}
      {currentView === VIEWS.CALENDAR && renderCalendarView()}

      {currentView === VIEWS.BOARD && (
        <div className="todo-widget-columns">
          {data.headings
            .filter(heading => heading.id !== 'inbox')
            .sort((a, b) => {
              const order = ['backlog', 'today', 'done'];
              return order.indexOf(a.id) - order.indexOf(b.id);
            })
            .map(heading => {
              const visibleTodos = getVisibleTodos();
              return (
            <div
              key={heading.id}
              className="todo-widget-column"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, heading.id)}
            >
              <h4 className="todo-widget-column-title">
                {heading.title}
                <span className="todo-widget-count">
                  {getTodosByHeading(heading.id).length}
                </span>
              </h4>

              <div className="todo-widget-items">
                {getTodosByHeading(heading.id).map(todo => (
                  <div
                    key={todo.id}
                    className={`todo-widget-item
                      ${draggedTodo?.id === todo.id ? 'todo-widget-dragging' : ''}
                      ${dropIndicator?.todoId === todo.id && dropIndicator?.position === 'before' ? 'todo-widget-drop-before' : ''}
                      ${dropIndicator?.todoId === todo.id && dropIndicator?.position === 'after' ? 'todo-widget-drop-after' : ''}
                      ${visibleTodos[selectedIndex]?.id === todo.id ? 'todo-widget-item-selected' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, todo)}
                    onDragOver={(e) => handleTodoDragOver(e, todo)}
                    onDrop={(e) => handleTodoDrop(e, todo)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="todo-widget-item-content">
                      <input
                        type="checkbox"
                        checked={todo.headingId === 'done'}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleTodoDone(todo.id);
                        }}
                        className="todo-widget-checkbox"
                      />
                      <div className="todo-widget-item-text">
                        <span className={todo.headingId === 'done' ? 'todo-widget-done-text' : ''}>
                          {todo.text}
                          {todo.description && (
                            <span className="todo-widget-has-description" title="Has description">📝</span>
                          )}
                        </span>
                        {todo.dueDate && (
                          <span className={`todo-widget-due-date ${getDueDateClass(todo.dueDate)}`}>
                            {formatDueDate(todo.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openTodoModal(todo, e);
                      }}
                      className="todo-widget-edit-btn"
                      title="Edit task"
                    >
                      ✏️
                    </button>
                  </div>
                ))}

                {getTodosByHeading(heading.id).length === 0 && (
                  <div className="todo-widget-empty">
                    Drop todos here
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      )}

      {selectedTodo && editingTodo && (
        <div className="todo-widget-modal-overlay" onClick={closeTodoModal}>
          <div className="todo-widget-modal" onClick={(e) => e.stopPropagation()}>
            <div className="todo-widget-modal-header">
              <h3>Edit Todo</h3>
              <button
                onClick={closeTodoModal}
                className="todo-widget-modal-close"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="todo-widget-modal-body">
              <div className="todo-widget-modal-field">
                <label>Title</label>
                <input
                  type="text"
                  value={editingTodo.text}
                  onChange={(e) => updateEditingTodo('text', e.target.value)}
                  className="todo-widget-modal-input"
                />
              </div>

              <div className="todo-widget-modal-field">
                <label>Description (Markdown supported)</label>
                <textarea
                  value={editingTodo.description || ''}
                  onChange={(e) => updateEditingTodo('description', e.target.value)}
                  className="todo-widget-modal-textarea"
                  placeholder="Add notes, links, or details...

**Bold text** or __bold__
*Italic text* or _italic_
`code`
[Link](https://example.com)
"
                  rows={6}
                />
              </div>

              {editingTodo.description && (
                <div className="todo-widget-modal-field">
                  <label>Preview</label>
                  <div
                    className="todo-widget-modal-preview"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(editingTodo.description) }}
                  />
                </div>
              )}

              <div className="todo-widget-modal-field">
                <label>Due Date</label>
                <input
                  type="date"
                  value={editingTodo.dueDate || ''}
                  onChange={(e) => updateEditingTodo('dueDate', e.target.value)}
                  className="todo-widget-modal-input"
                />
              </div>

              <div className="todo-widget-modal-field">
                <label>Category</label>
                <select
                  value={editingTodo.headingId}
                  onChange={(e) => updateEditingTodo('headingId', e.target.value)}
                  className="todo-widget-modal-input"
                >
                  {data.headings.map(heading => (
                    <option key={heading.id} value={heading.id}>
                      {heading.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="todo-widget-modal-meta">
                <small>Created: {new Date(editingTodo.createdAt).toLocaleString()}</small>
              </div>
            </div>

            <div className="todo-widget-modal-footer">
              <button
                onClick={() => {
                  deleteTodo(editingTodo.id);
                }}
                className="todo-widget-modal-btn-delete"
              >
                Delete
              </button>
              <div className="todo-widget-modal-footer-right">
                <button
                  onClick={closeTodoModal}
                  className="todo-widget-modal-btn-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTodoChanges}
                  className="todo-widget-modal-btn-save"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Help Modal */}
      {showKeyboardHelp && (
        <div className="todo-widget-modal-overlay" onClick={() => setShowKeyboardHelp(false)}>
          <div className="todo-widget-modal todo-widget-help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="todo-widget-modal-header">
              <h3>Keyboard Shortcuts</h3>
              <button
                onClick={() => setShowKeyboardHelp(false)}
                className="todo-widget-modal-close"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="todo-widget-modal-body">
              <div className="todo-widget-help-section">
                <h4>Navigation</h4>
                <div className="todo-widget-help-item">
                  <kbd>↓</kbd> or <kbd>j</kbd>
                  <span>Move down</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>↑</kbd> or <kbd>k</kbd>
                  <span>Move up</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>Enter</kbd>
                  <span>Open/edit selected task</span>
                </div>
              </div>
              <div className="todo-widget-help-section">
                <h4>Actions</h4>
                <div className="todo-widget-help-item">
                  <kbd>Space</kbd>
                  <span>Toggle done/undone</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>i</kbd>
                  <span>Move to Inbox</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>b</kbd>
                  <span>Move to Backlog</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>t</kbd>
                  <span>Move to Today</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>d</kbd>
                  <span>Move to Done</span>
                </div>
              </div>
              <div className="todo-widget-help-section">
                <h4>Views</h4>
                <div className="todo-widget-help-item">
                  <kbd>1</kbd>
                  <span>Planning view</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>2</kbd>
                  <span>Today view</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>3</kbd>
                  <span>Board view</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>4</kbd>
                  <span>Calendar view</span>
                </div>
              </div>
              <div className="todo-widget-help-section">
                <h4>Board View (Column Jump)</h4>
                <div className="todo-widget-help-item">
                  <kbd>Shift+1</kbd>
                  <span>Jump to Backlog column</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>Shift+2</kbd>
                  <span>Jump to Today column</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>Shift+3</kbd>
                  <span>Jump to Done column</span>
                </div>
              </div>
              <div className="todo-widget-help-section">
                <h4>Other</h4>
                <div className="todo-widget-help-item">
                  <kbd>n</kbd>
                  <span>New todo (focus input)</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>?</kbd>
                  <span>Show this help</span>
                </div>
                <div className="todo-widget-help-item">
                  <kbd>Esc</kbd>
                  <span>Close modal</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
