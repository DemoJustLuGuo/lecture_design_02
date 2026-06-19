import { createBrowserRouter } from 'react-router-dom'
import { lazy, Suspense } from 'react'

/* ── Layout ──────────────────────────────────────────────────── */
import App from './App'

/* ── Lazy-loaded Pages ───────────────────────────────────────── */
const Dashboard = lazy(() => import('./pages/Dashboard'))
const StationMgmt = lazy(() => import('./pages/StationMgmt'))
const StationDetail = lazy(() => import('./pages/StationDetail'))
const FaultLogs = lazy(() => import('./pages/FaultLogs'))
const FaultMap = lazy(() => import('./pages/FaultMap'))
const Diagnosis = lazy(() => import('./pages/Diagnosis'))
const ModelEval = lazy(() => import('./pages/ModelEval'))
const MobileAlert = lazy(() => import('./pages/MobileAlert'))
const Settings = lazy(() => import('./pages/Settings'))
const NotFound = lazy(() => import('./pages/NotFound'))

/* ── Loading fallback ────────────────────────────────────────── */
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full w-full animate-fade-in">
      <div className="flex flex-col items-center gap-4">
        <span aria-hidden="true" className="material-symbols-outlined lg animate-spin-slow text-primary">
          progress_activity
        </span>
        <p className="text-on-surface-variant font-label-caps text-label-caps">加载中...</p>
      </div>
    </div>
  )
}

/* ── Suspense wrapper ────────────────────────────────────────── */
function SuspensePage({ component: Component }: { component: React.LazyExoticComponent<React.ComponentType> }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  )
}

/* ── Router definition ───────────────────────────────────────── */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: <SuspensePage component={Dashboard} />,
      },
      {
        path: 'stations',
        element: <SuspensePage component={StationMgmt} />,
      },
      {
        path: 'stations/:id',
        element: <SuspensePage component={StationDetail} />,
      },
      {
        path: 'faults',
        element: <SuspensePage component={FaultLogs} />,
      },
      {
        path: 'faults/:id/diagnosis',
        element: <SuspensePage component={Diagnosis} />,
      },
      {
        path: 'diagnosis/:id',
        element: <SuspensePage component={Diagnosis} />,
      },
      {
        path: 'map',
        element: <SuspensePage component={FaultMap} />,
      },
      {
        path: 'metrics',
        element: <SuspensePage component={ModelEval} />,
      },
      {
        path: 'mobile-alert',
        element: <SuspensePage component={MobileAlert} />,
      },
      {
        path: 'settings',
        element: <SuspensePage component={Settings} />,
      },
      {
        path: '*',
        element: <SuspensePage component={NotFound} />,
      },
    ],
  },
])
