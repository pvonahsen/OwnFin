import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div className="bg-red-900/40 border border-red-700 rounded-xl p-5 m-4">
        <p className="text-red-300 font-semibold mb-2">Fehler in diesem Tab:</p>
        <pre className="text-red-200 text-xs whitespace-pre-wrap">{this.state.error.toString()}</pre>
        <button onClick={() => this.setState({ error: null })} className="mt-3 text-xs text-red-300 underline">
          Zurücksetzen
        </button>
      </div>
    );
    return this.props.children;
  }
}
