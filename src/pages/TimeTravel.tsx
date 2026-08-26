import { Dashboard } from './Dashboard';

/**
 * The chronological run, on its own page.
 *
 * Deliberately not a copy of the dashboard: it IS the dashboard, scoped to
 * entries carrying the Time Travel modifier. A watch-through in release order
 * means dozens of series open at once, each touched rarely — which on the main
 * overview would bury the few things actually being worked through, while
 * moving them out of sight entirely would mean not tracking them at all.
 */
export function TimeTravel() {
  return <Dashboard variant="timeTravel" />;
}
