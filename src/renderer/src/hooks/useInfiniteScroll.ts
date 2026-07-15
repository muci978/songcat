import { useEffect, useRef } from 'react'

interface UseInfiniteScrollOptions {
  /** 触发加载的阈值距离（px），默认 200 */
  threshold?: number
  /** 是否还有更多数据 */
  hasMore: boolean
  /** 是否正在加载 */
  isLoading: boolean
  /** 加载更多的回调 */
  onLoadMore: () => void
}

/**
 * 基于 IntersectionObserver 的无限滚动 hook。
 * 返回 sentinelRef，将其附加到列表底部的哨兵 div 上，
 * 当哨兵进入视口时自动触发 onLoadMore。
 */
export function useInfiniteScroll({
  threshold = 200,
  hasMore,
  isLoading,
  onLoadMore
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(isLoading)
  loadingRef.current = isLoading

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingRef.current) {
          onLoadMore()
        }
      },
      { rootMargin: `${threshold}px` }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore, threshold])

  return { sentinelRef }
}
