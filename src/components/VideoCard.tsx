/* eslint-disable @typescript-eslint/no-explicit-any,react-hooks/exhaustive-deps,@typescript-eslint/no-empty-function */

import { Bot, ExternalLink, Heart, Link, PlayCircleIcon, Radio, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { processImageUrl } from '@/lib/utils';
import { useLongPress } from '@/hooks/useLongPress';

import { getDoubanDetails } from '@/lib/douban.client';
import { ImagePlaceholder } from '@/components/ImagePlaceholder';
import MobileActionSheet from '@/components/MobileActionSheet';
import CombinedDetailModal from './CombinedDetailModal';
import VideoDetailPreview from '@/components/VideoDetailPreview';
import AIChatModal from '@/components/AIChatModal';
import { SearchResult, DoubanDetail } from '@/lib/types';

export interface VideoCardProps {
  id?: string;
  source?: string;
  title?: string;
  query?: string;
  poster?: string;
  episodes?: number;
  source_name?: string;
  source_names?: string[];
  progress?: number;
  year?: string;
  from: 'playrecord' | 'favorite' | 'search' | 'douban';
  currentEpisode?: number;
  douban_id?: number;
  onDelete?: () => void;
  rate?: string;
  type?: string;
  isBangumi?: boolean;
  isAggregate?: boolean;
  origin?: 'vod' | 'live';
}

export type VideoCardHandle = {
  setEpisodes: (episodes?: number) => void;
  setSourceNames: (names?: string[]) => void;
  setDoubanId: (id?: number) => void;
};

const VideoCard = forwardRef<VideoCardHandle, VideoCardProps>(function VideoCard(
  {
    id,
    title = '',
    query = '',
    poster = '',
    episodes,
    source,
    source_name,
    source_names,
    progress = 0,
    year,
    from,
    currentEpisode,
    douban_id,
    onDelete,
    rate,
    type = '',
    isBangumi = false,
    isAggregate = false,
    origin = 'vod',
  }: VideoCardProps,
  ref
) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [searchFavorited, setSearchFavorited] = useState<boolean | null>(null); // 搜索结果的收藏状态
  const [showDetailPreview, setShowDetailPreview] = useState(false);
  const [previewDetail, setPreviewDetail] = useState<SearchResult | null>(null);

  const [showCombinedModal, setShowCombinedModal] = useState(false);
  const [doubanDetail, setDoubanDetail] = useState<DoubanDetail | null>(null);
  const [videoDetail, setVideoDetail] = useState<SearchResult | null>(null);
  const [isLoadingModal, setIsLoadingModal] = useState(false);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 悬停AI功能相关状态（仅豆瓣卡片）
  const [isHovering, setIsHovering] = useState(false);
  const [showAIButton, setShowAIButton] = useState(false);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  // AI聊天模态框状态
  const [isAIChatModalOpen, setIsAIChatModalOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // 可外部修改的可控字段
  const [dynamicEpisodes, setDynamicEpisodes] = useState<number | undefined>(
    episodes
  );
  const [dynamicSourceNames, setDynamicSourceNames] = useState<string[] | undefined>(
    source_names
  );
  const [dynamicDoubanId, setDynamicDoubanId] = useState<number | undefined>(
    douban_id
  );

  useEffect(() => {
    setDynamicEpisodes(episodes);
  }, [episodes]);

  useEffect(() => {
    setDynamicSourceNames(source_names);
  }, [source_names]);

  useEffect(() => {
    setDynamicDoubanId(douban_id);
  }, [douban_id]);

  // 屏幕尺寸检测
  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    setEpisodes: (eps?: number) => setDynamicEpisodes(eps),
    setSourceNames: (names?: string[]) => setDynamicSourceNames(names),
    setDoubanId: (id?: number) => setDynamicDoubanId(id),
  }));

  const actualTitle = title;
  const actualPoster = poster;
  // 对于播放记录，id是完整的存储key（source+id格式），需要解析
  const actualSource = from === 'playrecord' && id?.includes('+') 
    ? id.split('+')[0] 
    : source;
  const actualId = from === 'playrecord' && id?.includes('+') 
    ? id.split('+')[1] 
    : id;
  const actualDoubanId = dynamicDoubanId;
  const actualEpisodes = dynamicEpisodes;
  const actualYear = year;
  const actualQuery = query || '';
  const actualSearchType = isAggregate
    ? (actualEpisodes && actualEpisodes === 1 ? 'movie' : 'tv')
    : type;

  // 获取收藏状态（搜索结果页面不检查）
  useEffect(() => {
    if (from === 'douban' || from === 'search' || !actualSource || !actualId) return;

    const fetchFavoriteStatus = async () => {
      try {
        const fav = await isFavorited(actualSource, actualId);
        setFavorited(fav);
      } catch (err) {
        throw new Error('检查收藏状态失败');
      }
    };

    fetchFavoriteStatus();

    // 监听收藏状态更新事件
    const storageKey = generateStorageKey(actualSource, actualId);
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        // 检查当前项目是否在新的收藏列表中
        const isNowFavorited = !!newFavorites[storageKey];
        setFavorited(isNowFavorited);
      }
    );

    return unsubscribe;
  }, [from, actualSource, actualId]);

  const handleToggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (from === 'douban' || !actualSource || !actualId) return;

      try {
        // 确定当前收藏状态
        const currentFavorited = from === 'search' ? searchFavorited : favorited;

        if (currentFavorited) {
          // 如果已收藏，删除收藏
          await deleteFavorite(actualSource, actualId);
          if (from === 'search') {
            setSearchFavorited(false);
          } else {
            setFavorited(false);
          }
        } else {
          // 如果未收藏，添加收藏
          await saveFavorite(actualSource, actualId, {
            title: actualTitle,
            source_name: source_name || '',
            year: actualYear || '',
            cover: actualPoster,
            total_episodes: actualEpisodes ?? 1,
            save_time: Date.now(),
          });
          if (from === 'search') {
            setSearchFavorited(true);
          } else {
            setFavorited(true);
          }
        }
      } catch (err) {
        throw new Error('切换收藏状态失败');
      }
    },
    [
      from,
      actualSource,
      actualId,
      actualTitle,
      source_name,
      actualYear,
      actualPoster,
      actualEpisodes,
      favorited,
      searchFavorited,
    ]
  );

  const handleDeleteRecord = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (from !== 'playrecord' || !id) return;
      try {
        // 对于观看记录页面，id是完整的存储key，需要解析出source和id
        if (from === 'playrecord') {
          const [source, videoId] = id.split('+');
          if (source && videoId) {
            await deletePlayRecord(source, videoId);
          }
        } else if (actualSource && actualId) {
          // 对于其他页面，使用原有逻辑
          await deletePlayRecord(actualSource, actualId);
        }
        onDelete?.();
      } catch (err) {
        throw new Error('删除播放记录失败');
      }
    },
    [from, actualSource, actualId, id, onDelete]
  );

  // 悬停AI功能事件处理（仅豆瓣卡片）
  const handleMouseEnter = useCallback(() => {
    if (from !== 'douban') return;

    setIsHovering(true);
    // 清除之前的定时器
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }

    // 设置0.5秒定时器
    hoverTimerRef.current = setTimeout(() => {
      setShowAIButton(true);
    }, 500);
  }, [from]);

  const handleMouseLeave = useCallback(() => {
    if (from !== 'douban') return;

    setIsHovering(false);
    setShowAIButton(false);

    // 清除定时器
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, [from]);

  const handleAIButtonClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 清除之前的聊天缓存，确保每次都显示新的剧信息
    localStorage.removeItem('ai-chat-messages');

    // 构建豆瓣链接
    const doubanLink = actualDoubanId && actualDoubanId !== 0
      ? (isBangumi
        ? `https://bgm.tv/subject/${actualDoubanId}`
        : `https://movie.douban.com/subject/${actualDoubanId}`)
      : '';

    // 存储剧名、海报和豆瓣链接信息到localStorage
    const presetContent = {
      title: actualTitle,
      poster: processImageUrl(actualPoster),
      doubanLink: doubanLink,
      hiddenContent: `这部剧的名字叫《${actualTitle}》，这部剧豆瓣链接地址：${doubanLink}\n`,
      timestamp: Date.now()
    };
    localStorage.setItem('ai-chat-preset', JSON.stringify(presetContent));

    // PC端打开模态框，移动端跳转页面
    if (isDesktop) {
      setIsAIChatModalOpen(true);
    } else {
      router.push('/ai-chat');
    }
  }, [actualTitle, actualPoster, actualDoubanId, isBangumi, router, isDesktop]);

  // 跳转到播放页面的函数
  const navigateToPlay = useCallback(() => {
    // 清除自动播放计时器，防止重复跳转
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }

    // 构建豆瓣ID参数
    const doubanIdParam = actualDoubanId && actualDoubanId > 0 ? `&douban_id=${actualDoubanId}` : '';

    if (origin === 'live' && actualSource && actualId) {
      // 直播内容跳转到直播页面
      const url = `/live?source=${actualSource.replace('live_', '')}&id=${actualId.replace('live_', '')}`;
      router.push(url);
    } else if (from === 'douban' || (isAggregate && !actualSource && !actualId)) {
      const url = `/play?title=${encodeURIComponent(actualTitle.trim())}${actualYear ? `&year=${actualYear}` : ''
        }${doubanIdParam}${actualSearchType ? `&stype=${actualSearchType}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''}`;
      router.push(url);
    } else if (actualSource && actualId) {
      const url = `/play?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(
        actualTitle
      )}${actualYear ? `&year=${actualYear}` : ''}${doubanIdParam}${isAggregate ? '&prefer=true' : ''
        }${actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''
        }${actualSearchType ? `&stype=${actualSearchType}` : ''}`;
      router.push(url);
    }
  }, [
    origin,
    from,
    actualSource,
    actualId,
    router,
    actualTitle,
    actualYear,
    isAggregate,
    actualQuery,
    actualSearchType,
    actualDoubanId,
  ]);



  const handleDoubanClick = useCallback(async () => {
    // 防止重复调用
    if (isLoading || showCombinedModal) {
      return;
    }

    // 立即显示模态框和加载状态
    setIsLoading(true);
    setShowCombinedModal(true);
    setIsLoadingModal(true);
    setDoubanDetail(null);
    setVideoDetail(null);

    // 同时执行豆瓣API和搜索API请求
    const promises = [];

    // 豆瓣API请求
    let doubanPromise = null;
    if (actualDoubanId) {
      doubanPromise = getDoubanDetails(actualDoubanId.toString())
        .then(details => {
          if (details.code === 200 && details.data) {
            setDoubanDetail(details.data);
            return { success: true, data: details.data };
          }
          return { success: false, data: null };
        })
        .catch(error => {
          console.error('获取豆瓣详情失败:', error);
          return { success: false, data: null };
        });
      promises.push(doubanPromise);
    }

    // 搜索API请求（后台执行）
    const searchPromise = fetch(`/api/search?q=${encodeURIComponent(actualTitle.trim())}`)
      .then(response => {
        if (!response.ok) throw new Error('搜索失败');
        return response.json();
      })
      .then((data: { results: SearchResult[] }) => {
        if (data.results && data.results.length > 0) {
          return { success: true, results: data.results };
        }
        return { success: false, results: [] };
      })
      .catch(error => {
        console.error('搜索视频源失败:', error);
        return { success: false, results: [] };
      });
    promises.push(searchPromise);

    // 等待所有请求完成
    const [doubanResult, searchResult] = await Promise.all(promises) as [
      { success: boolean; data?: DoubanDetail } | null,
      { success: boolean; results: SearchResult[] }
    ];

    // 处理结果
    if (doubanResult && doubanResult.success) {
      // 豆瓣API成功：显示豆瓣信息，5秒后自动播放
      setIsLoadingModal(false);

      // 如果搜索也成功，设置搜索结果供后续使用
      if (searchResult.success && searchResult.results.length > 0) {
        setVideoDetail(searchResult.results[0]);
      }

      // 5秒后自动播放
      autoPlayTimerRef.current = setTimeout(() => {
        if (searchResult.success && searchResult.results.length > 0) {
          // 跳转到播放器
          navigateToPlay();
        }
      }, 5000);
    } else {
      // 豆瓣API失败：使用搜索结果作为备用方案
      if (searchResult.success && searchResult.results.length > 0) {
        // 查找匹配title且有desc的结果
        const matchedResult = searchResult.results.find(result =>
          result.title && result.title.includes(actualTitle.trim()) && result.desc
        ) || searchResult.results.find(result => result.desc) || searchResult.results[0];

        setVideoDetail(matchedResult);
        setIsLoadingModal(false);

        // 5秒后跳转到第一个源播放
        autoPlayTimerRef.current = setTimeout(() => {
          const firstResult = searchResult.results[0];
          if (firstResult.id && firstResult.source) {
            navigateToPlay();
          }
        }, 5000);
      } else {
        // 搜索也失败
        setIsLoadingModal(false);
      }
    }

    setIsLoading(false);
  }, [actualDoubanId, actualTitle]);

  // 组件卸载时清理自动播放计时器
  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    };
  }, []);

  const handleClick = useCallback(() => {
    // 如果是豆瓣来源，展示豆瓣详情
    if (from === 'douban') {
      handleDoubanClick();
    } else if (isAggregate && !actualSource && !actualId) {
      // 如果是聚合搜索且没有具体的source和id（即搜索源状态），使用统一的处理逻辑
      handleDoubanClick();
    } else {
      // 其他情况直接跳转
      navigateToPlay();
    }
  }, [
    from,
    isAggregate,
    actualSource,
    actualId,
    handleDoubanClick,
    navigateToPlay,
  ]);

  // 新标签页播放处理函数
  const handlePlayInNewTab = useCallback(() => {
    // 构建豆瓣ID参数
    const doubanIdParam = actualDoubanId && actualDoubanId > 0 ? `&douban_id=${actualDoubanId}` : '';

    if (origin === 'live' && actualSource && actualId) {
      // 直播内容跳转到直播页面
      const url = `/live?source=${actualSource.replace('live_', '')}&id=${actualId.replace('live_', '')}`;
      window.open(url, '_blank');
    } else if (from === 'douban' || (isAggregate && !actualSource && !actualId)) {
      const url = `/play?title=${encodeURIComponent(actualTitle.trim())}${actualYear ? `&year=${actualYear}` : ''}${doubanIdParam}${actualSearchType ? `&stype=${actualSearchType}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''}`;
      window.open(url, '_blank');
    } else if (actualSource && actualId) {
      const url = `/play?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(
        actualTitle
      )}${actualYear ? `&year=${actualYear}` : ''}${doubanIdParam}${isAggregate ? '&prefer=true' : ''
        }${actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''
        }${actualSearchType ? `&stype=${actualSearchType}` : ''}`;
      window.open(url, '_blank');
    }
  }, [
    origin,
    from,
    actualSource,
    actualId,
    actualTitle,
    actualYear,
    isAggregate,
    actualQuery,
    actualSearchType,
    actualDoubanId,
  ]);

  // 检查搜索结果的收藏状态
  const checkSearchFavoriteStatus = useCallback(async () => {
    if (from === 'search' && !isAggregate && actualSource && actualId && searchFavorited === null) {
      try {
        const fav = await isFavorited(actualSource, actualId);
        setSearchFavorited(fav);
      } catch (err) {
        setSearchFavorited(false);
      }
    }
  }, [from, isAggregate, actualSource, actualId, searchFavorited]);

  // 长按操作
  const handleLongPress = useCallback(() => {
    if (!showMobileActions) { // 防止重复触发
      // 立即显示菜单，避免等待数据加载导致动画卡顿
      setShowMobileActions(true);

      // 异步检查收藏状态，不阻塞菜单显示
      if (from === 'search' && !isAggregate && actualSource && actualId && searchFavorited === null) {
        checkSearchFavoriteStatus();
      }
    }
  }, [showMobileActions, from, isAggregate, actualSource, actualId, searchFavorited, checkSearchFavoriteStatus]);

  // 长按手势hook
  const longPressProps = useLongPress({
    onLongPress: handleLongPress,
    onClick: handleClick, // 保持点击播放功能
    longPressDelay: 500,
  });

  const config = useMemo(() => {
    const configs = {
      playrecord: {
        showSourceName: true,
        showProgress: true,
        showPlayButton: true,
        showHeart: true,
        showCheckCircle: true,
        showDoubanLink: false,
        showRating: false,
        showYear: false,
      },
      favorite: {
        showSourceName: true,
        showProgress: false,
        showPlayButton: true,
        showHeart: true,
        showCheckCircle: false,
        showDoubanLink: false,
        showRating: false,
        showYear: false,
      },
      search: {
        showSourceName: true,
        showProgress: false,
        showPlayButton: true,
        showHeart: true, // 移动端菜单中需要显示收藏选项
        showCheckCircle: false,
        showDoubanLink: true, // 移动端菜单中显示豆瓣链接
        showRating: false,
        showYear: true,
      },
      douban: {
        showSourceName: false,
        showProgress: false,
        showPlayButton: true,
        showHeart: false,
        showCheckCircle: false,
        showDoubanLink: true,
        showRating: !!rate,
        showYear: false,
      },
    };
    return configs[from] || configs.search;
  }, [from, isAggregate, douban_id, rate]);

  // 移动端操作菜单配置
  const mobileActions = useMemo(() => {
    const actions = [];

    // 播放操作
    if (config.showPlayButton) {
      actions.push({
        id: 'play',
        label: origin === 'live' ? '观看直播' : '播放',
        icon: <PlayCircleIcon size={20} />,
        onClick: handleClick,
        color: 'primary' as const,
      });
    }

    // 问问AI操作 - 替换豆瓣详情页
    actions.push({
      id: 'ai-chat',
      label: '问问AI',
      icon: <Bot size={20} />,
      onClick: () => {
        // 清除之前的聊天缓存，确保每次都显示新的剧信息
        localStorage.removeItem('ai-chat-messages');

        // 构建豆瓣链接
        const doubanLink = actualDoubanId && actualDoubanId !== 0
          ? (isBangumi
            ? `https://bgm.tv/subject/${actualDoubanId}`
            : `https://movie.douban.com/subject/${actualDoubanId}`)
          : '';

        // 存储剧名、海报和豆瓣链接信息到localStorage
        const presetContent = {
          title: actualTitle,
          poster: processImageUrl(actualPoster),
          doubanLink: doubanLink,
          hiddenContent: `这部剧的名字叫《${actualTitle}》，这部剧豆瓣链接地址：${doubanLink}\n`,
          timestamp: Date.now()
        };
        localStorage.setItem('ai-chat-preset', JSON.stringify(presetContent));

        // PC端打开模态框，移动端跳转页面
        if (isDesktop) {
          setIsAIChatModalOpen(true);
        } else {
          router.push('/ai-chat');
        }
      },
      color: 'default' as const,
    });

    // 新标签页播放
    if (config.showPlayButton) {
      actions.push({
        id: 'play-new-tab',
        label: origin === 'live' ? '新标签页观看' : '新标签页播放',
        icon: <ExternalLink size={20} />,
        onClick: handlePlayInNewTab,
        color: 'default' as const,
      });
    }

    // 聚合源信息 - 直接在菜单中展示，不需要单独的操作项

    // 收藏/取消收藏操作
    if (config.showHeart && from !== 'douban' && actualSource && actualId) {
      const currentFavorited = from === 'search' ? searchFavorited : favorited;

      if (from === 'search') {
        // 搜索结果：根据加载状态显示不同的选项
        if (searchFavorited !== null) {
          // 已加载完成，显示实际的收藏状态
          actions.push({
            id: 'favorite',
            label: currentFavorited ? '取消收藏' : '添加收藏',
            icon: currentFavorited ? (
              <Heart size={20} className="fill-red-600 stroke-red-600" />
            ) : (
              <Heart size={20} className="fill-transparent stroke-red-500" />
            ),
            onClick: () => {
              const mockEvent = {
                preventDefault: () => { },
                stopPropagation: () => { },
              } as React.MouseEvent;
              handleToggleFavorite(mockEvent);
            },
            color: currentFavorited ? ('danger' as const) : ('default' as const),
          });
        } else {
          // 正在加载中，显示占位项
          actions.push({
            id: 'favorite-loading',
            label: '收藏加载中...',
            icon: <Heart size={20} />,
            onClick: () => { }, // 加载中时不响应点击
            disabled: true,
          });
        }
      } else {
        // 非搜索结果：直接显示收藏选项
        actions.push({
          id: 'favorite',
          label: currentFavorited ? '取消收藏' : '添加收藏',
          icon: currentFavorited ? (
            <Heart size={20} className="fill-red-600 stroke-red-600" />
          ) : (
            <Heart size={20} className="fill-transparent stroke-red-500" />
          ),
          onClick: () => {
            const mockEvent = {
              preventDefault: () => { },
              stopPropagation: () => { },
            } as React.MouseEvent;
            handleToggleFavorite(mockEvent);
          },
          color: currentFavorited ? ('danger' as const) : ('default' as const),
        });
      }
    }

    // 删除播放记录操作
    if (config.showCheckCircle && from === 'playrecord' && actualSource && actualId) {
      actions.push({
        id: 'delete',
        label: '删除记录',
        icon: <Trash2 size={20} />,
        onClick: () => {
          const mockEvent = {
            preventDefault: () => { },
            stopPropagation: () => { },
          } as React.MouseEvent;
          handleDeleteRecord(mockEvent);
        },
        color: 'danger' as const,
      });
    }

    return actions;
  }, [
    config,
    from,
    actualSource,
    actualId,
    favorited,
    searchFavorited,
    actualDoubanId,
    isBangumi,
    isAggregate,
    dynamicSourceNames,
    actualTitle,
    actualPoster,
    actualYear,
    type,
    handleClick,
    handleToggleFavorite,
    handleDeleteRecord,
    handlePlayInNewTab,
    isDesktop,
    setIsAIChatModalOpen,
    router,
    origin,
  ]);

  return (
    <>
      <div
        className='group relative w-full glass-card cursor-pointer transition-transform duration-200 ease-out hover:scale-105 hover:shadow-elevated hover:z-10 flex flex-col h-full'
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...longPressProps}
        style={{
          // 禁用所有默认的长按和选择效果
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
          // 禁用右键菜单和长按菜单
          pointerEvents: 'auto',
        } as React.CSSProperties}
        onContextMenu={(e) => {
          // 阻止默认右键菜单
          e.preventDefault();
          e.stopPropagation();

          // 右键弹出操作菜单
          setShowMobileActions(true);

          // 异步检查收藏状态，不阻塞菜单显示
          if (from === 'search' && !isAggregate && actualSource && actualId && searchFavorited === null) {
            checkSearchFavoriteStatus();
          }

          return false;
        }}

        onDragStart={(e) => {
          // 阻止拖拽
          e.preventDefault();
          return false;
        }}
      >
        {/* 海报容器 */}
        <div
          className={`relative aspect-[3/4] overflow-hidden rounded-t-lg bg-gray-100 dark:bg-gray-800 transition-all duration-300 ease-in-out group-hover:shadow-lg group-hover:shadow-black/20 dark:group-hover:shadow-black/20 ${origin === 'live' ? 'ring-1 ring-gray-300/80 dark:ring-gray-600/80' : ''}`}
          style={{
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTouchCallout: 'none',
          } as React.CSSProperties}
          onContextMenu={(e) => {
            e.preventDefault();
            return false;
          }}
        >
          {/* 骨架屏 */}
          {!isLoading && <ImagePlaceholder aspectRatio='aspect-[2/3]' />}
          {/* 图片 */}
          <Image
            src={processImageUrl(actualPoster)}
            alt={actualTitle}
            fill
            className={origin === 'live' ? 'object-contain' : 'object-cover'}
            referrerPolicy='no-referrer'
            loading='lazy'
            onLoadingComplete={() => setIsLoading(true)}
            onError={(e) => {
              // 图片加载失败时的重试机制
              const img = e.target as HTMLImageElement;
              if (!img.dataset.retried) {
                img.dataset.retried = 'true';
                setTimeout(() => {
                  img.src = processImageUrl(actualPoster);
                }, 2000);
              }
            }}
            style={{
              // 禁用图片的默认长按效果
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
              pointerEvents: 'none', // 图片不响应任何指针事件
            } as React.CSSProperties}
            onContextMenu={(e) => {
              e.preventDefault();
              return false;
            }}
            onDragStart={(e) => {
              e.preventDefault();
              return false;
            }}
          />

          {/* 悬浮遮罩 */}
          <div
            className='absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-300 ease-in-out opacity-0 group-hover:opacity-100'
            style={{
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
            } as React.CSSProperties}
            onContextMenu={(e) => {
              e.preventDefault();
              return false;
            }}
          />

          {/* 播放按钮 */}
          {config.showPlayButton && (
            <div
              data-button="true"
              className='absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-300 ease-in-out delay-75 group-hover:opacity-100 group-hover:scale-100'
              style={{
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              } as React.CSSProperties}
              onContextMenu={(e) => {
                e.preventDefault();
                return false;
              }}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                </div>
              ) : from === 'playrecord' && progress !== undefined ? (
                // 观看记录显示百分比进度
                <div className="flex flex-col items-center justify-center text-white">
                  <div className="relative w-16 h-16 mb-2">
                    {/* 圆形进度环 */}
                    <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
                      {/* 背景圆环 */}
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth="4"
                        fill="none"
                      />
                      {/* 进度圆环 */}
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="white"
                        strokeWidth="4"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 28}`}
                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress / 100)}`}
                        className="transition-all duration-500 ease-out"
                        strokeLinecap="round"
                      />
                    </svg>
                    {/* 中心播放图标 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <PlayCircleIcon
                        size={24}
                        strokeWidth={1}
                        className='text-white fill-transparent'
                      />
                    </div>
                  </div>
                  {/* 百分比文字 */}
                  <div className="text-sm font-semibold bg-black/50 px-2 py-1 rounded-full">
                    {Math.round(progress)}%
                  </div>
                </div>
              ) : (
                <PlayCircleIcon
                  size={50}
                  strokeWidth={0.8}
                  className='text-white fill-transparent transition-all duration-300 ease-out hover:fill-blue-500 hover:scale-[1.1]'
                  style={{
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    return false;
                  }}
                />
              )}
            </div>
          )}

          {/* 操作按钮 */}
          {(config.showHeart || config.showCheckCircle) && (
            <div
              data-button="true"
              className='absolute bottom-3 right-3 flex gap-3 opacity-0 translate-y-2 transition-all duration-300 ease-in-out sm:group-hover:opacity-100 sm:group-hover:translate-y-0'
              style={{
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              } as React.CSSProperties}
              onContextMenu={(e) => {
                e.preventDefault();
                return false;
              }}
            >
              {config.showCheckCircle && (
                <Trash2
                  onClick={handleDeleteRecord}
                  size={20}
                  className='text-white transition-all duration-300 ease-out hover:stroke-red-500 hover:scale-[1.1]'
                  style={{
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    return false;
                  }}
                />
              )}
              {config.showHeart && (
                <Heart
                  onClick={handleToggleFavorite}
                  size={20}
                  className={`transition-all duration-300 ease-out ${favorited
                    ? 'fill-red-600 stroke-red-600'
                    : 'fill-transparent stroke-white hover:stroke-red-400'
                    } hover:scale-[1.1]`}
                  style={{
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    return false;
                  }}
                />
              )}
            </div>
          )}

          {/* 年份徽章 */}
          {config.showYear && actualYear && actualYear !== 'unknown' && actualYear.trim() !== '' && (
            <div
              className="absolute top-2 bg-black/50 text-white text-xs font-medium px-2 py-1 rounded backdrop-blur-sm shadow-sm transition-all duration-300 ease-out group-hover:opacity-90 left-2"
              style={{
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              } as React.CSSProperties}
              onContextMenu={(e) => {
                e.preventDefault();
                return false;
              }}
            >
              {actualYear}
            </div>
          )}

          {/* 徽章 */}
          {config.showRating && rate && (
            <div
              className='absolute top-2 right-2 bg-pink-500 text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-all duration-300 ease-out group-hover:scale-110'
              style={{
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              } as React.CSSProperties}
              onContextMenu={(e) => {
                e.preventDefault();
                return false;
              }}
            >
              {rate}
            </div>
          )}

          {actualEpisodes && actualEpisodes > 1 && (
            <div
              className='absolute top-2 right-2 bg-black text-white text-xs font-semibold px-2 py-1 rounded-md shadow-md transition-all duration-300 ease-out group-hover:scale-110'
              style={{
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              } as React.CSSProperties}
              onContextMenu={(e) => {
                e.preventDefault();
                return false;
              }}
            >
              {currentEpisode
                ? `${currentEpisode}/${actualEpisodes}`
                : actualEpisodes}
            </div>
          )}

          {/* 豆瓣链接 */}
          {config.showDoubanLink && actualDoubanId && actualDoubanId !== 0 && (
            <a
              href={
                isBangumi
                  ? `https://bgm.tv/subject/${actualDoubanId.toString()}`
                  : `https://movie.douban.com/subject/${actualDoubanId.toString()}`
              }
              target='_blank'
              rel='noopener noreferrer'
              onClick={(e) => e.stopPropagation()}
              className='absolute top-2 left-2 opacity-0 -translate-x-2 transition-all duration-300 ease-in-out delay-100 sm:group-hover:opacity-100 sm:group-hover:translate-x-0'
              style={{
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              } as React.CSSProperties}
              onContextMenu={(e) => {
                e.preventDefault();
                return false;
              }}
            >
              <div
                className='bg-black text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shadow-md hover:bg-gray-800 hover:scale-[1.1] transition-all duration-300 ease-out'
                style={{
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  WebkitTouchCallout: 'none',
                } as React.CSSProperties}
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              >
                <Link
                  size={16}
                  style={{
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                    pointerEvents: 'none',
                  } as React.CSSProperties}
                />
              </div>
            </a>
          )}

          {/* 聚合播放源指示器 */}
          {isAggregate && dynamicSourceNames && dynamicSourceNames.length > 0 && (() => {
            const uniqueSources = Array.from(new Set(dynamicSourceNames));
            const sourceCount = uniqueSources.length;

            return (
              <div
                className='absolute bottom-2 right-2 opacity-0 transition-all duration-300 ease-in-out delay-75 sm:group-hover:opacity-100'
                style={{
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  WebkitTouchCallout: 'none',
                } as React.CSSProperties}
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              >
                <div
                  className='relative group/sources'
                  style={{
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties}
                >
                  <div
                    className='glass-strong text-white text-xs font-bold w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center shadow-glass hover:scale-[1.1] transition-all duration-300 ease-out cursor-pointer'
                    style={{
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      WebkitTouchCallout: 'none',
                    } as React.CSSProperties}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      return false;
                    }}
                  >
                    {sourceCount}
                  </div>

                  {/* 播放源详情悬浮框 */}
                  {(() => {
                    // 优先显示的播放源（常见的主流平台）
                    const prioritySources = ['爱奇艺', '腾讯视频', '优酷', '芒果TV', '哔哩哔哩', 'Netflix', 'Disney+'];

                    // 按优先级排序播放源
                    const sortedSources = uniqueSources.sort((a, b) => {
                      const aIndex = prioritySources.indexOf(a);
                      const bIndex = prioritySources.indexOf(b);
                      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                      if (aIndex !== -1) return -1;
                      if (bIndex !== -1) return 1;
                      return a.localeCompare(b);
                    });

                    const maxDisplayCount = 6; // 最多显示6个
                    const displaySources = sortedSources.slice(0, maxDisplayCount);
                    const hasMore = sortedSources.length > maxDisplayCount;
                    const remainingCount = sortedSources.length - maxDisplayCount;

                    return (
                      <div
                        className='absolute bottom-full mb-2 opacity-0 invisible group-hover/sources:opacity-100 group-hover/sources:visible transition-all duration-200 ease-out delay-100 pointer-events-none z-50 right-0 sm:right-0 -translate-x-0 sm:translate-x-0'
                        style={{
                          WebkitUserSelect: 'none',
                          userSelect: 'none',
                          WebkitTouchCallout: 'none',
                        } as React.CSSProperties}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          return false;
                        }}
                      >
                        <div
                          className='glass-strong text-white text-xs sm:text-xs rounded-apple-lg shadow-floating border border-white/20 p-1.5 sm:p-2 min-w-[100px] sm:min-w-[120px] max-w-[140px] sm:max-w-[200px] overflow-hidden'
                          style={{
                            WebkitUserSelect: 'none',
                            userSelect: 'none',
                            WebkitTouchCallout: 'none',
                          } as React.CSSProperties}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            return false;
                          }}
                        >
                          {/* 单列布局 */}
                          <div className='space-y-0.5 sm:space-y-1'>
                            {displaySources.map((sourceName, index) => (
                              <div key={index} className='flex items-center gap-1 sm:gap-1.5'>
                                <div className='w-0.5 h-0.5 sm:w-1 sm:h-1 bg-blue-400 rounded-full flex-shrink-0'></div>
                                <span className='truncate text-[10px] sm:text-xs leading-tight' title={sourceName}>
                                  {sourceName}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* 显示更多提示 */}
                          {hasMore && (
                            <div className='mt-1 sm:mt-2 pt-1 sm:pt-1.5 border-t border-gray-700/50'>
                              <div className='flex items-center justify-center text-gray-400'>
                                <span className='text-[10px] sm:text-xs font-medium'>+{remainingCount} 播放源</span>
                              </div>
                            </div>
                          )}

                          {/* 小箭头 */}
                          <div className='absolute top-full right-2 sm:right-3 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] sm:border-l-[6px] sm:border-r-[6px] sm:border-t-[6px] border-transparent border-t-gray-800/90'></div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}
        </div>

        {/* 进度条 */}
        {config.showProgress && progress !== undefined && (
          <div
            className='mt-1 h-1 w-full bg-gray-200 rounded-full overflow-hidden'
            style={{
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
            } as React.CSSProperties}
            onContextMenu={(e) => {
              e.preventDefault();
              return false;
            }}
          >
            <div
              className='h-full bg-blue-500 transition-all duration-500 ease-out'
              style={{
                width: `${progress}%`,
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              } as React.CSSProperties}
              onContextMenu={(e) => {
                e.preventDefault();
                return false;
              }}
            />
          </div>
        )}

        {/* 标题与来源 - 豆瓣卡片悬停时整个底栏变成问问AI按钮 */}
        {from === 'douban' && showAIButton ? (
          <button
            onClick={handleAIButtonClick}
            className='flex-1 flex flex-col justify-center px-2 py-3 text-center bg-blue-500 hover:bg-white hover:text-black text-white transition-all duration-300 ease-in-out rounded-b-lg'
            style={{
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
            } as React.CSSProperties}
            onContextMenu={(e) => {
              e.preventDefault();
              return false;
            }}
          >
            <span className='text-sm font-medium'>问问 AI</span>
          </button>
        ) : (
          <div
            className='flex-1 flex flex-col justify-center px-2 py-3 text-center'
            style={{
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
            } as React.CSSProperties}
            onContextMenu={(e) => {
              e.preventDefault();
              return false;
            }}
          >
            <div
              className='relative'
              style={{
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              } as React.CSSProperties}
            >
              {/* 标题文字 */}
              <span
                className={`block font-semibold text-gray-900 dark:text-gray-100 transition-all duration-300 ease-in-out group-hover:text-black dark:group-hover:text-white peer ${from === 'douban' && actualTitle.length > 8 ? 'text-xs' : 'text-sm'
                  }`}
                style={{
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  WebkitTouchCallout: 'none',
                } as React.CSSProperties}
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              >
                {actualTitle.length <= 10 ? actualTitle : `${actualTitle.slice(0, 10)}...`}
              </span>

              {/* 自定义 tooltip */}
              <div
                className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible peer-hover:opacity-100 peer-hover:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap pointer-events-none'
                style={{
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  WebkitTouchCallout: 'none',
                } as React.CSSProperties}
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              >
                {actualTitle}
                <div
                  className='absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800'
                  style={{
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties}
                ></div>
              </div>
            </div>
            {config.showSourceName && source_name && (
              <span
                className='block text-xs text-gray-500 dark:text-gray-400 mt-1'
                style={{
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  WebkitTouchCallout: 'none',
                } as React.CSSProperties}
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              >
                <span
                  className='inline-block border rounded px-2 py-0.5 border-gray-500/60 dark:border-gray-400/60 transition-all duration-300 ease-in-out group-hover:border-black/60 group-hover:text-black dark:group-hover:text-white'
                  style={{
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    return false;
                  }}
                >
                  {origin === 'live' && (
                    <Radio size={12} className="inline-block text-gray-500 dark:text-gray-400 mr-1.5" />
                  )}
                  {source_name}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* 操作菜单 - 支持右键和长按触发 */}
      <MobileActionSheet
        isOpen={showMobileActions}
        onClose={() => setShowMobileActions(false)}
        title={actualTitle}
        poster={processImageUrl(actualPoster)}
        actions={mobileActions}
        sources={isAggregate && dynamicSourceNames ? Array.from(new Set(dynamicSourceNames)) : undefined}
        isAggregate={isAggregate}
        sourceName={source_name}
        currentEpisode={currentEpisode}
        totalEpisodes={actualEpisodes}
        origin={origin}
      />

      {/* 资源站详情预览 */}
      <VideoDetailPreview
        detail={previewDetail}
        isVisible={showDetailPreview}
        onClose={() => {
          setShowDetailPreview(false);
          setPreviewDetail(null);
        }}
        onTimeout={() => {
          setShowDetailPreview(false);
          setPreviewDetail(null);
          navigateToPlay();
        }}
        duration={5000}
      />
      <CombinedDetailModal
        isOpen={showCombinedModal}
        onClose={() => {
          setShowCombinedModal(false);
          setDoubanDetail(null);
          setVideoDetail(null);
          setIsLoadingModal(false);
        }}
        onPlay={() => {
          setShowCombinedModal(false);
          setDoubanDetail(null);
          setVideoDetail(null);
          setIsLoadingModal(false);
          navigateToPlay();
        }}
        onClearAutoPlayTimer={() => {
          if (autoPlayTimerRef.current) {
            clearTimeout(autoPlayTimerRef.current);
            autoPlayTimerRef.current = null;
          }
        }}
        doubanDetail={doubanDetail}
        videoDetail={videoDetail}
        isLoading={isLoadingModal}
        poster={actualPoster}
        title={actualTitle}
      />
      {isDesktop && (
        <AIChatModal
          isOpen={isAIChatModalOpen}
          onClose={() => setIsAIChatModalOpen(false)}
        />
      )}
    </>
  );
}

);

export default memo(VideoCard);
