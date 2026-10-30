import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** What to show instead of the children once they have thrown while rendering. */
  fallback: (error: Error, reset: () => void) => ReactNode;
};

/** Contains a render error to the subtree it wraps, so one broken part never takes the whole screen down. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    return error ? this.props.fallback(error, this.reset) : this.props.children;
  }
}
