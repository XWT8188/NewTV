'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';

interface YouTubeVideo {
  id: { videoId: string };
  snippet: {
    title: string;
    description?: string;
    thumbnails: {
      medium: {
        url: string;
        width?: number;
        height?: number;
      };
    };
    channelTitle: string;
    publishedAt: string;
  };
  embedPlayer?: string;
}

interface YouTubeVideoCardProps {
  video: YouTubeVideo;
  onPlay?: (videoId: string) => void;
  showActions?: boolean;
  /** 当前正在播放的视频 ID，用于外部控制播放状态 */
  currentPlayingId?: string | null;
}

const YouTubeVideoCard = ({ video, onPlay, showActions = true, currentPlayingId }: YouTubeVideoCardProps) => {
  // 统一使用外部传入的 currentPlayingId 来判断是否播放
  const identifier = video.id.videoId ?? video.embedPlayer ?? '';
  const isPlaying = currentPlayingId === identifier;
  const [imageError, setImageError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // 当停止播放时，清空 iframe 的 src 以释放内存
  useEffect(() => {
    if (!isPlaying && iframeRef.current) {
      iframeRef.current.src = '';
    }
  }, [isPlaying]);

  const handlePlay = () => {
    // 仅当外部未处于播放状态时才触发
    if (currentPlayingId !== identifier) {
      onPlay?.(identifier);
    }
  };

  const handleOpenInNewTab = () => {
    window.open(`https://www.youtube.com/watch?v=${video.id.videoId}`, '_blank');
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const truncateTitle = (title: string, maxLength = 60) => {
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  };

  const videoUrl = video.embedPlayer || `https://www.youtube.com/embed/${video.id.videoId}?autoplay=1&rel=0`;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden">
      {/* 视频缩略图区域 */}
      <div className="relative aspect-video bg-gray-200 dark:bg-gray-700">
        {isPlaying ? (
          <iframe
            ref={iframeRef}
            src={videoUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            title={video.snippet.title}
          />
        ) : (
          <>
            {!imageError ? (
              <Image
                src={video.snippet.thumbnails.medium.url}
                alt={video.snippet.title}
                fill
                className="object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-300 dark:bg-gray-600">
                <svg className="w-12 h-12 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
            )}

            {/* 播放按钮覆盖层 */}
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center group cursor-pointer" onClick={handlePlay}>
              <div className="opacity-70 group-hover:opacity-100 transition-opacity duration-300 bg-red-600 hover:bg-red-700 text-white rounded-full p-3 transform hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>

            {/* 视频时长（如果有的话） */}
            <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
              视频
            </div>
          </>
        )}
      </div>

      {/* 视频信息区域 */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-2 line-clamp-2">
          {truncateTitle(video.snippet.title)}
        </h3>

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
          <span className="truncate">{video.snippet.channelTitle}</span>
          <span>{formatDate(video.snippet.publishedAt)}</span>
        </div>

        {/* 操作按钮 */}
        {showActions && (
          <div className="flex space-x-2">
            <button
              onClick={handlePlay}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 px-3 rounded transition-colors"
            >
              嵌入播放
            </button>
            <button
              onClick={handleOpenInNewTab}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-xs py-2 px-3 rounded transition-colors"
            >
              新窗口打开
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default YouTubeVideoCard;