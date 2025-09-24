import React, { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { DoubanDetail, SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

interface CombinedDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlay: () => void;
  onClearAutoPlayTimer?: () => void;
  doubanDetail: DoubanDetail | null;
  videoDetail: SearchResult | null;
  isLoading: boolean;
  poster: string;
  title: string;
}

const CombinedDetailModal: React.FC<CombinedDetailModalProps> = ({
  isOpen,
  onClose,
  onPlay,
  onClearAutoPlayTimer,
  doubanDetail,
  videoDetail,
  isLoading,
  poster,
  title,
}) => {
  const { resolvedTheme } = useTheme();
  const [countdown, setCountdown] = useState(5);
  const [progress, setProgress] = useState(0);
  const [currentPosterUrl, setCurrentPosterUrl] = useState<string>('');
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 创建fallback URL数组
  const fallbackUrls = useMemo(() => {
    const doubanPoster = doubanDetail?.poster;
    const isDoubanPosterValid = doubanPoster &&
      doubanPoster.trim() !== '' &&
      doubanPoster !== 'undefined' &&
      doubanPoster !== 'null' &&
      !doubanPoster.includes('default') &&
      !doubanPoster.includes('placeholder');

    const baseUrl = isDoubanPosterValid ? doubanPoster : poster;

    if (!baseUrl || !baseUrl.includes('doubanio.com')) {
      return [baseUrl]; // 非豆瓣图片直接返回
    }

    // 为豆瓣图片创建多个fallback选项
    const urls = [
      // 1. 服务器代理
      `/api/image-proxy?url=${encodeURIComponent(baseUrl)}`,
      // 2. img3代理
      baseUrl.replace(/img\d+\.doubanio\.com/g, 'img3.doubanio.com'),
      // 3. 腾讯CDN代理
      baseUrl.replace(/img\d+\.doubanio\.com/g, 'img.doubanio.cmliussss.net'),
      // 4. 阿里CDN代理
      baseUrl.replace(/img\d+\.doubanio\.com/g, 'img.doubanio.cmliussss.com'),
      // 5. 原始URL
      baseUrl
    ];

    console.log('海报URL fallback列表:', urls);
    return urls;
  }, [doubanDetail, poster]);

  const posterUrl = useMemo(() => {
    const url = fallbackUrls[fallbackIndex] || fallbackUrls[0] || poster;
    console.log(`使用第${fallbackIndex + 1}个fallback URL:`, url);
    return url;
  }, [fallbackUrls, fallbackIndex, poster]);

  // 重置fallback索引当URL列表改变时
  useEffect(() => {
    setFallbackIndex(0);
    setCurrentPosterUrl(fallbackUrls[0] || poster);
  }, [fallbackUrls, poster]);

  // 清除计时器的通用函数
  const clearTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    onClearAutoPlayTimer?.();
  };

  useEffect(() => {
    if (!isOpen) {
      setCountdown(5);
      setProgress(0);
      clearTimers();
      return;
    }

    // 当有豆瓣数据或搜索数据且不在加载状态时启动倒计时
    if ((doubanDetail || videoDetail) && !isLoading) {
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearTimers();
            onPlay();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      progressTimerRef.current = setInterval(() => {
        setProgress((oldProgress) => {
          if (oldProgress >= 100) {
            if (progressTimerRef.current) {
              clearInterval(progressTimerRef.current);
              progressTimerRef.current = null;
            }
            return 100;
          }
          return oldProgress + 100 / 50; // 5s * 10 frames/s
        });
      }, 100); // update progress every 100ms

      return () => {
        clearTimers();
      };
    }
  }, [isOpen, doubanDetail, videoDetail, isLoading, onPlay]);

  if (!isOpen) {
    return null;
  }

  const renderDetailItem = (label: string, value?: string | string[] | null) => {
    if (!value) return null;
    const displayValue = Array.isArray(value) ? value.join(' / ') : value;
    return (
      <div className="flex text-xs md:text-sm mb-1 md:mb-2">
        <span className={`${resolvedTheme === 'light' ? 'text-gray-600' : 'text-gray-400'} w-16 md:w-24 flex-shrink-0`}>{label}</span>
        <span className={`${resolvedTheme === 'light' ? 'text-gray-900' : 'text-white'} flex-grow`}>{displayValue}</span>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-start md:items-center justify-center z-50 p-2 md:p-4"
      onClick={(e) => {
        // 只有点击背景时才关闭弹窗
        if (e.target === e.currentTarget) {
          clearTimers();
          onClose();
        }
      }}
    >
      {/* PC端布局 - 保持原有的横向布局 */}
      <div className={`hidden md:block ${resolvedTheme === 'light' ? 'bg-white bg-opacity-95' : 'bg-gray-800 bg-opacity-90'} rounded-lg shadow-lg w-[90vw] max-w-4xl h-[70vh] overflow-hidden relative`}>
        <div className="flex h-full">
          <button
            onClick={() => {
              clearTimers();
              onClose();
            }}
            className={`absolute top-4 right-4 ${resolvedTheme === 'light' ? 'text-gray-600 hover:text-gray-900 bg-white bg-opacity-70' : 'text-gray-400 hover:text-white bg-black bg-opacity-50'} z-20 rounded-full p-1`}
          >
            <X size={24} />
          </button>

          <div className="w-1/3 h-full flex-shrink-0 relative z-0">
            <Image
              src={posterUrl}
              alt={title}
              fill
              style={{ objectFit: 'cover' }}
              className="rounded-l-lg"
              onError={(e) => {
                console.error(`海报图片加载失败 (第${fallbackIndex + 1}个URL):`, posterUrl, e);
                if (fallbackIndex < fallbackUrls.length - 1) {
                  console.log(`尝试第${fallbackIndex + 2}个fallback URL`);
                  setFallbackIndex(prev => prev + 1);
                } else {
                  console.error('所有fallback URL都失败了');
                }
              }}
              onLoad={() => {
                console.log(`海报图片加载成功 (第${fallbackIndex + 1}个URL):`, posterUrl);
              }}
            />
          </div>

          <div className="w-2/3 relative z-10 h-full">
            <div className="absolute inset-0 p-8 pb-40 overflow-y-auto">
              <h2 className={`text-3xl font-bold ${resolvedTheme === 'light' ? 'text-gray-900' : 'text-white'} mb-6`}>{doubanDetail?.title || videoDetail?.title || title}</h2>

              {isLoading && !doubanDetail && !videoDetail ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-12 w-12 mb-4"></div>
                  <div className={`${resolvedTheme === 'light' ? 'text-gray-700' : 'text-white'} text-base text-center`}>
                    影片信息获取中，请稍等片刻
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-y-2 mb-4 text-sm">
                    {renderDetailItem('年份', doubanDetail?.year || videoDetail?.year)}
                    {renderDetailItem('豆瓣评分', doubanDetail?.rate)}
                    {renderDetailItem('类型', doubanDetail?.genres || videoDetail?.type_name)}
                    {renderDetailItem('制片国家/地区', doubanDetail?.countries)}
                    {renderDetailItem('语言', doubanDetail?.languages)}
                    {videoDetail?.source_name && renderDetailItem('来源', videoDetail.source_name)}
                  </div>

                  <h3 className={`text-lg font-semibold ${resolvedTheme === 'light' ? 'text-gray-900' : 'text-white'} mt-6 mb-1`}>简介</h3>
                  <div className="mb-4 h-32 overflow-y-auto">
                    <p className={`${resolvedTheme === 'light' ? 'text-gray-700' : 'text-gray-300'} text-sm leading-relaxed`}>
                      {doubanDetail?.plot_summary || videoDetail?.desc || '暂无简介信息'}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className={`absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t ${resolvedTheme === 'light' ? 'from-white to-transparent' : 'from-gray-800 to-transparent'}`}>
              {(doubanDetail || videoDetail) && !isLoading && (
                <div className="w-full mb-4">
                  <div className={`flex justify-between text-xs ${resolvedTheme === 'light' ? 'text-gray-600' : 'text-gray-400'} mb-1`}>
                    <span>{countdown}s 后自动播放</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}
              <div className="flex flex-row space-x-4">
                <button
                  onClick={() => {
                    clearTimers();
                    onPlay();
                  }}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition text-base"
                >
                  立即播放
                </button>
                <button
                  onClick={() => {
                    clearTimers();
                    onClose();
                  }}
                  className="flex-1 bg-gray-700 text-white py-3 rounded-lg hover:bg-gray-600 transition text-base"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 移动端布局 - 4段式垂直布局 */}
      <div className={`block md:hidden ${resolvedTheme === 'light' ? 'bg-white bg-opacity-95' : 'bg-gray-800 bg-opacity-90'} rounded-lg shadow-lg w-[90vw] h-[70vh] flex flex-col overflow-hidden relative mt-[10vh]`}>
        <button
          onClick={() => {
            clearTimers();
            onClose();
          }}
          className={`absolute top-2 right-2 ${resolvedTheme === 'light' ? 'text-gray-600 hover:text-gray-900 bg-white bg-opacity-70' : 'text-gray-400 hover:text-white bg-black bg-opacity-50'} z-20 rounded-full p-1`}
        >
          <X size={20} />
        </button>

        {/* 第1段：封面图片区域 - 固定高度 */}
        <div className="w-full h-32 flex-shrink-0 relative">
          <Image
            src={posterUrl}
            alt={title}
            fill
            style={{ objectFit: 'cover' }}
            className="rounded-t-lg"
            onError={(e) => {
              console.error(`海报图片加载失败 (第${fallbackIndex + 1}个URL):`, posterUrl, e);
              if (fallbackIndex < fallbackUrls.length - 1) {
                console.log(`尝试第${fallbackIndex + 2}个fallback URL`);
                setFallbackIndex(prev => prev + 1);
              } else {
                console.error('所有fallback URL都失败了');
              }
            }}
            onLoad={() => {
              console.log(`海报图片加载成功 (第${fallbackIndex + 1}个URL):`, posterUrl);
            }}
          />
        </div>

        {/* 第2段：影片信息内容区域 - 可滚动，自适应高度 */}
        <div className="flex-1 p-3 overflow-y-auto">
          <h2 className={`text-base font-bold ${resolvedTheme === 'light' ? 'text-gray-900' : 'text-white'} mb-2`}>{doubanDetail?.title || videoDetail?.title || title}</h2>

          {isLoading && !doubanDetail && !videoDetail ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-8 w-8 mb-4"></div>
              <div className={`${resolvedTheme === 'light' ? 'text-gray-700' : 'text-white'} text-sm text-center`}>
                影片信息获取中，请稍等片刻
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-3 text-xs">
                {renderDetailItem('年份', doubanDetail?.year || videoDetail?.year)}
                {renderDetailItem('豆瓣评分', doubanDetail?.rate)}
                {renderDetailItem('类型', doubanDetail?.genres || videoDetail?.type_name)}
                {renderDetailItem('制片国家/地区', doubanDetail?.countries)}
                {renderDetailItem('语言', doubanDetail?.languages)}
                {videoDetail?.source_name && renderDetailItem('来源', videoDetail.source_name)}
              </div>

              <h3 className={`text-xs font-semibold ${resolvedTheme === 'light' ? 'text-gray-900' : 'text-white'} mb-2`}>简介</h3>
              <p className={`${resolvedTheme === 'light' ? 'text-gray-700' : 'text-gray-300'} text-xs leading-tight`}>
                {doubanDetail?.plot_summary || videoDetail?.desc || '暂无简介信息'}
              </p>
            </>
          )}
        </div>

        {/* 第3段：进度条区域 - 固定高度 */}
        {(doubanDetail || videoDetail) && !isLoading && (
          <div className={`flex-shrink-0 px-3 py-2 ${resolvedTheme === 'light' ? 'bg-gray-100' : 'bg-gray-800'}`}>
            <div className={`flex justify-between text-xs ${resolvedTheme === 'light' ? 'text-gray-600' : 'text-gray-400'} mb-1`}>
              <span>{countdown}s 后自动播放</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-600 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* 第4段：按钮区域 - 固定高度 */}
        <div className={`flex-shrink-0 p-3 ${resolvedTheme === 'light' ? 'bg-gray-100' : 'bg-gray-800'} rounded-b-lg`}>
          <div className="flex flex-row space-x-2">
            <button
              onClick={() => {
                clearTimers();
                onPlay();
              }}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm"
            >
              立即播放
            </button>
            <button
              onClick={() => {
                clearTimers();
                onClose();
              }}
              className="flex-1 bg-gray-700 text-white py-2 rounded-lg hover:bg-gray-600 transition text-sm"
            >
              取消
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        .loader {
          border-top-color: #3498db;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default CombinedDetailModal;
