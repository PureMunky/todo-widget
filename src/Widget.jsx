import { useState, useEffect } from 'react';
import './Widget.css';

const STORAGE_KEY = 'todo-widget-data';

const DEFAULT_DATA = {
  headings: [
    { id: 'inbox', title: 'Inbox' },
    { id: 'today', title: 'Today' },
    { id: 'upcoming', title: 'Upcoming' },
    { id: 'done', title: 'Done' }
  ],
  todos: []
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
    return saved ? JSON.parse(saved) : DEFAULT_DATA;
  });

  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoDueDate, setNewTodoDueDate] = useState('');
  const [draggedTodo, setDraggedTodo] = useState(null);
  const [selectedTodo, setSelectedTodo] = useState(null);
  const [editingTodo, setEditingTodo] = useState(null);

  // Persist to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const addTodo = (e) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;

    // Parse smart dates from text
    const parsed = parseDateFromText(newTodoText);

    const newTodo = {
      id: Date.now().toString(),
      text: parsed.text,
      description: '',
      dueDate: parsed.dueDate || newTodoDueDate || null,
      headingId: 'inbox',
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

  const handleDragStart = (e, todo) => {
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

    setData(prev => ({
      ...prev,
      todos: prev.todos.map(t =>
        t.id === draggedTodo.id
          ? { ...t, headingId }
          : t
      )
    }));

    setDraggedTodo(null);
  };

  const handleDragEnd = () => {
    setDraggedTodo(null);
  };

  const getTodosByHeading = (headingId) => {
    return data.todos.filter(t => t.headingId === headingId);
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

  return (
    <div className="todo-widget">
      <div className="todo-widget-header">
        <h3>Todo List</h3>
      </div>

      <form className="todo-widget-input" onSubmit={addTodo}>
        <input
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

      <div className="todo-widget-columns">
        {data.headings.map(heading => (
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
                  className={`todo-widget-item ${draggedTodo?.id === todo.id ? 'todo-widget-dragging' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, todo)}
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
                    <div
                      className="todo-widget-item-text"
                      onClick={(e) => openTodoModal(todo, e)}
                    >
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
                      deleteTodo(todo.id);
                    }}
                    className="todo-widget-delete-btn"
                    title="Delete todo"
                  >
                    ×
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
        ))}
      </div>

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
      )}
    </div>
  );
}
