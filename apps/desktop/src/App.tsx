import { Component, lazy, Suspense, type ReactNode } from 'react';
import { Orbit } from 'lucide-react';
import { useSession } from './hooks/useSession';
import { AuthScreen } from './components/AuthScreen';
import './styles.css';
const Workspace = lazy(() => import('./components/Workspace'));
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="fatal">
        <h1>Algo saiu da órbita.</h1>
        <p>Reabra a tela para continuar.</p>
        <button className="primary" onClick={() => location.reload()}>
          Recarregar
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const { session, ready } = useSession();
  return !ready ? (
    <div className="splash">
      <Orbit size={40} />
      <span>Entrando na sua órbita…</span>
    </div>
  ) : session ? (
    <Suspense fallback={<div className="splash">Preparando seu espaço…</div>}>
      <Workspace key={session.user.id} />
    </Suspense>
  ) : (
    <AuthScreen />
  );
}
