import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import Home from '@/pages/Home'
import { TeamsList, TeamDetail } from '@/pages/Teams'
import MatchesList from '@/pages/Matches/MatchesList'
import LiveMatch from '@/pages/Matches/LiveMatch'
import MatchStats from '@/pages/Matches/MatchStats'

export default function App() {
  return (
    <Routes>
      {/* LiveMatch is fullscreen – no bottom nav */}
      <Route path="/matches/:id" element={<LiveMatch />} />

      {/* All other routes use Layout with bottom nav */}
      <Route element={<Layout />}>
        <Route path="/"                  element={<Home />} />
        <Route path="/teams"             element={<TeamsList />} />
        <Route path="/teams/:id"         element={<TeamDetail />} />
        <Route path="/matches"           element={<MatchesList />} />
        <Route path="/matches/:id/stats" element={<MatchStats />} />
        <Route path="*"                  element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
