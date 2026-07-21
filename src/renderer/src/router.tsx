import { Navigate, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Library from './pages/Library'
import AddSearch from './pages/AddSearch'
import SongDetail from './pages/SongDetail'
import Practice from './pages/Practice'
import Settings from './pages/Settings'
import Tuner from './pages/Tuner'

export function AppRoutes(): React.ReactElement {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/library" element={<Library />} />
      <Route path="/songs/:id" element={<SongDetail />} />
      <Route path="/songs/:id/practice/:assetId?" element={<Practice />} />
      <Route path="/tuner" element={<Tuner />} />
      <Route path="/add" element={<AddSearch />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
