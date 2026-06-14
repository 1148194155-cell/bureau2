import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex items-center justify-center bg-surface-950">
          <div className="text-center space-y-3">
            <div className="text-xs text-surface-300 font-medium">界面渲染出错</div>
            <div className="text-[10px] text-surface-500 font-mono max-w-md break-all">{this.state.error.message}</div>
            <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="h-7 px-4 rounded-lg bg-accent-600 hover:bg-accent-500 text-surface-950 text-xs font-medium transition-colors">
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
