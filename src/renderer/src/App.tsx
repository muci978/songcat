import { useEffect, useRef, useState } from 'react'
import { AppLayout } from './components/Layout'
import { AppRoutes } from './router'
import { useSettings } from './stores/settings'
import { api, unwrap } from './lib/api'
import { UpdateDialog } from './components/UpdateDialog'
import type { UpdateInfo } from '@shared'

export default function App(): React.ReactElement {
  const load = useSettings((s) => s.load)
  const settings = useSettings((s) => s.settings)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [showUpdate, setShowUpdate] = useState(false)
  const autoCheckDone = useRef(false)

  useEffect(() => {
    void load()
  }, [load])

  // 设置加载完成后，延迟检查更新（避免阻塞首屏渲染）
  useEffect(() => {
    if (!settings || autoCheckDone.current) return
    autoCheckDone.current = true

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const info = await unwrap(api.updater.checkForUpdate())
          if (info.hasUpdate) {
            setUpdateInfo(info)
            setShowUpdate(true)
          }
        } catch {
          // 启动时检查失败静默忽略，不打扰用户
        }
      })()
    }, 5000)

    return () => clearTimeout(timer)
  }, [settings])

  return (
    <AppLayout>
      <AppRoutes />
      <UpdateDialog
        open={showUpdate}
        info={updateInfo}
        onClose={() => setShowUpdate(false)}
      />
    </AppLayout>
  )
}
