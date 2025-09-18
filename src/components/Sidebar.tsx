/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Cat, Clover, Clapperboard, Cloud, Film, Home, Menu, Radio, Search, Star, Tv, Youtube } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

import { useSite } from './SiteProvider';

interface SidebarContextType {
  isCollapsed: boolean;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
});

export const useSidebar = () => useContext(SidebarContext);

// 可替换为你自己的 logo 图片
const Logo = () => {
  const { siteName } = useSite();
  return (
    <Link
      href='/'
      className='flex items-center justify-center h-16 select-none hover:opacity-80 transition-opacity duration-200'
    >
      <span className='text-2xl font-bold text-black dark:text-white tracking-tight'>
        {siteName}
      </span>
    </Link>
  );
};

interface SidebarProps {
  onToggle?: (collapsed: boolean) => void;
  defaultCollapsed?: boolean;
}

// 在浏览器环境下通过全局变量缓存折叠状态，避免组件重新挂载时出现初始值闪烁
declare global {
  interface Window {
    __sidebarCollapsed?: boolean;
  }
}

const Sidebar = ({ onToggle, defaultCollapsed }: SidebarProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 若同一次 SPA 会话中已经读取过折叠状态，则直接复用，避免闪烁
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (
      typeof window !== 'undefined' &&
      typeof window.__sidebarCollapsed === 'boolean'
    ) {
      return window.__sidebarCollapsed;
    }
    return defaultCollapsed ?? false; // 使用传入的默认值，否则默认展开
  });

  // 首次挂载时读取 localStorage，以便刷新后仍保持上次的折叠状态
  useLayoutEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved !== null) {
      const val = JSON.parse(saved);
      setIsCollapsed(val);
      window.__sidebarCollapsed = val;
    } else if (defaultCollapsed !== undefined) {
      // 如果没有保存的状态，但有默认值，则使用默认值
      setIsCollapsed(defaultCollapsed);
      window.__sidebarCollapsed = defaultCollapsed;
    }
  }, [defaultCollapsed]);

  // 当折叠状态变化时，同步到 <html> data 属性，供首屏 CSS 使用
  useLayoutEffect(() => {
    if (typeof document !== 'undefined') {
      if (isCollapsed) {
        document.documentElement.dataset.sidebarCollapsed = 'true';
      } else {
        delete document.documentElement.dataset.sidebarCollapsed;
      }
    }
  }, [isCollapsed]);

  const [active, setActive] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const getCurrentFullPath = () => {
      const queryString = searchParams.toString();
      return queryString ? `${pathname}?${queryString}` : pathname;
    };
    const fullPath = getCurrentFullPath();

    if (fullPath && pathname) {
      // 使用setTimeout避免快速路由切换时的状态冲突
      const timeoutId = setTimeout(() => {
        setActive(fullPath);
        setIsInitialized(true);
      }, 0);

      return () => clearTimeout(timeoutId);
    }
  }, [pathname, searchParams]);

  // 初始化时设置当前路径
  useEffect(() => {
    if (!isInitialized && pathname) {
      const queryString = searchParams.toString();
      const initialActive = queryString ? `${pathname}?${queryString}` : pathname;
      setActive(initialActive);
      setIsInitialized(true);
    }
  }, [pathname, searchParams, isInitialized]);

  const handleToggle = useCallback(() => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
    if (typeof window !== 'undefined') {
      window.__sidebarCollapsed = newState;
    }
    onToggle?.(newState);
  }, [isCollapsed, onToggle]);

  const handleSearchClick = useCallback(() => {
    router.push('/search');
  }, [router]);

  const contextValue = {
    isCollapsed,
  };

  const [menuItems, setMenuItems] = useState([
    {
      icon: Film,
      label: '电影',
      href: '/douban?type=movie',
    },
    {
      icon: Tv,
      label: '剧集',
      href: '/douban?type=tv',
    },
    {
      icon: Clapperboard,
      label: '短剧',
      href: '/douban?type=short-drama',
    },
    {
      icon: Cat,
      label: '动漫',
      href: '/douban?type=anime',
    },
    {
      icon: Clover,
      label: '综艺',
      href: '/douban?type=show',
    },
    {
      icon: Radio,
      label: '直播',
      href: '/live',
    },
    {
      icon: Youtube,
      label: 'YouTube',
      href: '/youtube',
    },
  ]);

  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    const newItems: Array<{
      icon: any;
      label: string;
      href: string;
    }> = [];

    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      newItems.push({
        icon: Star,
        label: '纪录',
        href: '/douban?type=custom',
      });
    }

    if (runtimeConfig?.CLOUD_DISK_CONFIG?.enabled) {
      newItems.push({
        icon: Cloud,
        label: runtimeConfig.CLOUD_DISK_CONFIG.name || '网盘',
        href: '/cloud-disk',
      });
    }

    if (newItems.length > 0) {
      setMenuItems((prevItems) => [...prevItems, ...newItems]);
    }
  }, []);

  return (
    <SidebarContext.Provider value={contextValue}>
      {/* 在移动端隐藏侧边栏 */}
      <div className='hidden md:flex'>
        <aside
          data-sidebar
          className={`fixed top-0 left-0 h-screen glass-nav transition-all duration-300 z-10 ${isCollapsed ? 'w-16' : 'w-64'
            }`}
        >
          <div className='flex h-full flex-col'>
            {/* 顶部 Logo 区域 */}
            <div className='relative h-16'>
              <div
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${isCollapsed ? 'opacity-0' : 'opacity-100'
                  }`}
              >
                <div className='w-[calc(100%-4rem)] flex justify-center'>
                  {!isCollapsed && <Logo />}
                </div>
              </div>
              <button
                onClick={handleToggle}
                className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 glass-button text-gray-600 hover:text-gray-800 z-10 dark:text-gray-300 dark:hover:text-gray-100 ${isCollapsed ? 'left-1/2 -translate-x-1/2' : 'right-2'
                  }`}
              >
                <Menu className='h-4 w-4' />
              </button>
            </div>

            {/* 首页和搜索导航 */}
            <nav className='px-2 mt-4 space-y-1'>
              <Link
                href='/'
                data-active={isInitialized && active === '/'}
                className={`group flex items-center rounded-apple-lg px-2 py-2 pl-4 text-gray-700 hover:bg-white/20 hover:text-blue-600 data-[active=true]:glass-button data-[active=true]:text-blue-700 font-medium transition-all duration-200 min-h-[40px] dark:text-gray-300 dark:hover:text-blue-400 dark:data-[active=true]:text-blue-400 ${isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                  } gap-3 justify-start`}
              >
                <div className='w-4 h-4 flex items-center justify-center'>
                  <Home className='h-4 w-4 text-gray-500 group-hover:text-blue-600 data-[active=true]:text-blue-700 dark:text-gray-400 dark:group-hover:text-blue-400 dark:data-[active=true]:text-blue-400' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100'>
                    首页
                  </span>
                )}
              </Link>
              <Link
                href='/search'
                onClick={(e) => {
                  e.preventDefault();
                  handleSearchClick();
                }}
                data-active={isInitialized && active.startsWith('/search')}
                className={`group flex items-center rounded-apple-lg px-2 py-2 pl-4 text-gray-700 hover:bg-white/20 hover:text-blue-600 data-[active=true]:glass-button data-[active=true]:text-blue-700 font-medium transition-all duration-200 min-h-[40px] dark:text-gray-300 dark:hover:text-blue-400 dark:data-[active=true]:text-blue-400 ${isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                  } gap-3 justify-start`}
              >
                <div className='w-4 h-4 flex items-center justify-center'>
                  <Search className='h-4 w-4 text-gray-500 group-hover:text-blue-600 data-[active=true]:text-blue-700 dark:text-gray-400 dark:group-hover:text-blue-400 dark:data-[active=true]:text-blue-400' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100'>
                    搜索
                  </span>
                )}
              </Link>
            </nav>

            {/* 菜单项 */}
            <div className='flex-1 overflow-y-auto px-2 pt-4'>
              <div className='space-y-1'>
                {menuItems.map((item) => {
                  // 检查当前路径是否匹配这个菜单项
                  const typeMatch = item.href.match(/type=([^&]+)/)?.[1];

                  // 解码URL以进行正确的比较
                  const decodedActive = decodeURIComponent(active);
                  const decodedItemHref = decodeURIComponent(item.href);

                  const isActive = isInitialized && (item.href.startsWith('/douban')
                    ? typeMatch && decodedActive.includes(`type=${typeMatch}`)
                    : item.href === '/youtube'
                      ? decodedActive.startsWith('/youtube')
                      : decodedActive === decodedItemHref);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      data-active={isActive}
                      className={`group flex items-center rounded-apple-lg px-2 py-2 pl-4 text-sm text-gray-700 hover:bg-white/20 hover:text-blue-600 data-[active=true]:glass-button data-[active=true]:text-blue-700 transition-all duration-200 min-h-[40px] dark:text-gray-300 dark:hover:text-blue-400 dark:data-[active=true]:text-blue-400 ${isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                        } gap-3 justify-start`}
                    >
                      <div className='w-4 h-4 flex items-center justify-center'>
                        <Icon className='h-4 w-4 text-gray-500 group-hover:text-blue-600 data-[active=true]:text-blue-700 dark:text-gray-400 dark:group-hover:text-blue-400 dark:data-[active=true]:text-blue-400' />
                      </div>
                      {!isCollapsed && (
                        <span className='whitespace-nowrap transition-opacity duration-200 opacity-100'>
                          {item.label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
        <div
          className={`transition-all duration-300 sidebar-offset ${isCollapsed ? 'w-16' : 'w-64'
            }`}
        ></div>
      </div>
    </SidebarContext.Provider>
  );
};

export default Sidebar;
