import './App.css'
import Widget from './Widget'

function App() {
  return (
    <div className="app">
      <div className="app-header">
        <h1>Todo Widget - Standalone Development Mode</h1>
        <p>This is how the widget will appear when loaded in the dashboard</p>
      </div>
      <div className="app-widget-container">
        <Widget />
      </div>
    </div>
  )
}

export default App
