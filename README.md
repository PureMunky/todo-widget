# Todo Widget

A feature-rich todo list widget with smart date parsing, markdown descriptions, drag-and-drop, and local storage persistence. Built to work with the Module Federation dashboard.

## Features

- **Smart Date Parsing**: Natural language date input extracts dates from your text
  - "Work with Andy on 1/7" → Creates todo "Work with Andy" with due date 1/7/2026
  - Supports: "on 1/7", "by Jan 7th", "tomorrow", "today", "Task - 1/15"
  - Auto-fills the date picker when a date is detected

- **Markdown Descriptions**: Click any todo to add a detailed description with markdown support
  - **Bold**, *italic*, `code`, [links](url)
  - Live preview as you type
  - Notes persist with each todo

- **Task Details Modal**: Click on any todo to view/edit full details
  - Edit title, description, due date, and category
  - See when the task was created
  - Full-featured editor with markdown preview

- **Headings/Categories**: Organize todos into Inbox, Today, Upcoming, and Done
- **Due Dates**: Visual indicators for today, overdue, and upcoming tasks
- **Drag & Drop**: Easily move todos between headings by dragging
- **Local Storage**: All data persists locally in your browser (never leaves your machine)
- **Responsive Design**: Works on desktop and mobile

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

This widget automatically deploys to GitHub Pages when you push to the main branch.

1. Enable GitHub Pages in your repository settings
2. Set the source to "GitHub Actions"
3. Push to main branch
4. Your widget will be available at: `https://YOUR_USERNAME.github.io/todo-widget/`

## Adding to Dashboard

Add this widget to your dashboard by updating the `widgets.json` configuration:

```json
{
  "id": "todo-widget",
  "name": "Todo List",
  "url": "https://YOUR_USERNAME.github.io/todo-widget",
  "scope": "todoWidget",
  "module": "./Widget"
}
```

## Usage Tips

### Smart Date Input Examples

Type these examples in the task input to see smart date parsing:
- `Meeting with team on 1/15`
- `Submit report by Feb 10th`
- `Call dentist tomorrow`
- `Review code today`
- `Presentation - 2/1`

The date will be automatically extracted and set, with the remaining text as the task title.

### Markdown in Descriptions

Click any todo to open the details modal and add a description. Supported markdown:
```
**Bold text**
*Italic text*
`code`
[Link text](https://example.com)
```

### Quick Actions

- **Click todo text**: Open details modal
- **Click checkbox**: Mark done/undone
- **Drag todo**: Move between categories
- **Click X**: Delete todo
- **📝 icon**: Indicates todo has a description

## Architecture

This widget uses:
- **React 18.3.1** - UI framework
- **Vite** - Build tool
- **Module Federation** - Remote module loading
- **HTML5 Drag & Drop API** - Drag and drop functionality
- **LocalStorage API** - Data persistence
- **Custom Markdown Renderer** - No external dependencies for markdown

## Local Storage

The widget stores all data in localStorage under the key `todo-widget-data`. This means:
- Data persists across page refreshes
- Data stays on your local machine
- No server or external API required
- Each browser/device has its own independent data

To reset the widget, clear your browser's localStorage or delete todos manually.
