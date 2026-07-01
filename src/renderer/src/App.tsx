import { useEffect } from 'react'
import { AppLayout } from './components/Layout'
import { AppRoutes } from './router'
import { useSettings } from './stores/settings'

export default function App(): React.ReactElement {
  const load = useSettings((s) => s.load)
  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppLayout>
      <AppRoutes />
    </AppLayout>
  )
}
