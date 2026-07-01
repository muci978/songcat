/** 应用外壳：侧边栏一级导航 + 内容区 + toast 容器（设计 §13.1） */
import type React from 'react'
import { NavLink } from 'react-router-dom'
import { useToast } from '../stores/toast'

const NAV: { to: string; label: string; icon: string; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/library', label: '曲库', icon: '📚' },
  { to: '/add', label: '添加 / 搜索', icon: '＋' },
  { to: '/settings', label: '设置', icon: '⚙' }
]

export function AppLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  const toasts = useToast((s) => s.toasts)
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="dot">🐱</span> SongCat
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span aria-hidden>{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-spacer" />
        <div className="sidebar-footer">本地曲谱练习笔记本</div>
      </aside>
      <main className="content">{children}</main>
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
