import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex items-center justify-center h-full w-full animate-fade-in">
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="material-symbols-outlined text-[80px] text-on-surface-variant">error_404</span>
        <h1 className="font-display-lg text-display-lg text-on-surface">页面未找到</h1>
        <p className="font-body-base text-body-base text-on-surface-variant max-w-md">
          您访问的页面不存在或已被移除。请检查URL是否正确，或返回首页。
        </p>
        <Link
          to="/"
          className="px-6 py-2.5 bg-primary text-on-primary font-label-caps text-label-caps rounded-lg shadow-sm hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">home</span>
          返回首页
        </Link>
      </div>
    </div>
  )
}
