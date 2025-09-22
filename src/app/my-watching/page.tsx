'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Play, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { getAllPlayRecords, clearAllPlayRecords, PlayRecord, getUserStats, clearUserStats, UserStats, subscribeToDataUpdates, recalculateUserStatsFromHistory, generateStorageKey } from '@/lib/db.client';
import { setupAutoSync } from '@/lib/force-sync-stats';
import VideoCard from '@/components/VideoCard';
import ScrollableRow from '@/components/ScrollableRow';

interface ExtendedPlayRecord extends PlayRecord {
  id: string; // 添加id属性，用于存储generateStorageKey生成的唯一标识符
  hasUpdate?: boolean;
  newEpisodes?: number;
}

export default function MyWatchingPage() {
  const router = useRouter();
  const [playRecords, setPlayRecords] = useState<ExtendedPlayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearStatsConfirm, setShowClearStatsConfirm] = useState(false);
  const [updatedRecords, setUpdatedRecords] = useState<ExtendedPlayRecord[]>([]);
  const [historyRecords, setHistoryRecords] = useState<ExtendedPlayRecord[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  useEffect(() => {
    // 只在页面首次加载时设置自动同步
    // 不要在清除播放记录后触发同步
    const shouldSetupSync = !window.location.search.includes('skipSync');
    if (shouldSetupSync) {
      setupAutoSync();
    }

    loadPlayRecords();
    loadUserStats();

    // 监听播放记录更新事件
    const unsubscribePlayRecords = subscribeToDataUpdates(
      'playRecordsUpdated',
      () => {
        console.log('播放记录已更新，重新加载数据');
        loadUserStats();
        loadPlayRecords();
      }
    );

    // 监听用户统计数据更新事件
    const unsubscribeUserStats = subscribeToDataUpdates(
      'userStatsUpdated',
      () => {
        console.log('用户统计数据已更新，重新加载统计数据');
        loadUserStats();
      }
    );

    return () => {
      unsubscribePlayRecords();
      unsubscribeUserStats();
    };
  }, []);

  const loadUserStats = async () => {
    try {
      // 使用缓存数据以提高加载速度
      const stats = await getUserStats(false);
      setUserStats(stats);
    } catch (error) {
      console.error('加载用户统计数据失败:', error);
    }
  };

  const loadPlayRecords = async (skipUpdateCheck = false) => {
    try {
      setLoading(true);

      // 并行加载播放记录和用户统计数据以提高加载速度
      const [recordsObj] = await Promise.all([
        getAllPlayRecords()
      ]);

      // 将Record转换为数组并按时间排序，同时为每个记录添加id
      const records = Object.entries(recordsObj).map(([key, record]) => ({
        ...record,
        id: key // 使用存储的key作为id
      })).sort((a, b) => b.save_time - a.save_time);

      // 如果是删除操作触发的重新加载，跳过更新检查
      if (skipUpdateCheck) {
        setPlayRecords(records);
        setHistoryRecords(records);
        setUpdatedRecords([]);
        setLoading(false);
        return;
      }

      // 异步检查剧集更新，不阻塞页面渲染
      setPlayRecords(records);
      setHistoryRecords(records);
      setLoading(false);

      // 在后台检查更新
      checkForUpdates(records).then(recordsWithUpdates => {
        // 实现更新剧集优先排序：有更新的剧集排在前面，然后按时间排序
        const sortedRecords = recordsWithUpdates.sort((a, b) => {
          // 首先按是否有更新排序（有更新的在前）
          if (a.hasUpdate && !b.hasUpdate) return -1;
          if (!a.hasUpdate && b.hasUpdate) return 1;

          // 如果都有更新或都没有更新，则按保存时间排序（最新的在前）
          return b.save_time - a.save_time;
        });

        // 分离有更新的记录和历史记录，只显示真正需要用户关注的更新
        const updated = sortedRecords.filter(record => record.hasUpdate);
        const history = sortedRecords.filter(record => !record.hasUpdate);

        setUpdatedRecords(updated);
        setHistoryRecords(history);
        setPlayRecords(sortedRecords);
      }).catch(error => {
        console.error('检查剧集更新失败:', error);
      });
    } catch (error) {
      console.error('加载播放记录失败:', error);
      setLoading(false);
    }
  };

  // 检查剧集更新的函数
  const checkForUpdates = async (records: (PlayRecord & { id: string })[]): Promise<ExtendedPlayRecord[]> => {
    if (!records.length) return [];

    const updatedRecords: ExtendedPlayRecord[] = [];

    for (const record of records) {
      try {
        // 只检查剧集类型的内容（总集数大于1）
        if (record.total_episodes <= 1) {
          updatedRecords.push({
            ...record,
            hasUpdate: false,
            newEpisodes: 0
          });
          continue;
        }

        // 通过搜索API查找对应的视频ID
        const searchQuery = record.search_title || record.title;
        const searchResponse = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);

        if (!searchResponse.ok) {
          throw new Error(`搜索请求失败: ${searchResponse.status}`);
        }

        const searchData = await searchResponse.json();
        const searchResults = searchData.results || [];

        // 查找匹配的结果（相同标题和播放源）
        const matchedResult = searchResults.find((result: any) =>
          result.title === record.title &&
          result.source_name === record.source_name &&
          result.year === record.year
        );

        if (!matchedResult) {
          // 没有找到匹配的结果，可能是视频已下架
          updatedRecords.push({
            ...record,
            hasUpdate: false,
            newEpisodes: 0
          });
          continue;
        }

        // 获取详细信息以获取最新集数
        const detailResponse = await fetch(`/api/detail?source=${matchedResult.source}&id=${matchedResult.id}`);

        if (!detailResponse.ok) {
          throw new Error(`详情请求失败: ${detailResponse.status}`);
        }

        const detailData = await detailResponse.json();
        const latestEpisodes = detailData.episodes ? detailData.episodes.length : 0;

        // 比较集数，如果用户已看到最新集且没有新增集数，则不计入更新
        const hasUpdate = latestEpisodes > record.total_episodes;
        const userWatchedLatest = record.index >= record.total_episodes;
        const newEpisodes = hasUpdate ? latestEpisodes - record.total_episodes : 0;

        // 只有当有新集数且用户没有看到最新集时才算作更新
        // 如果用户已经看到了当前记录的最新集，且总集数没有增加，则不显示更新
        const shouldShowUpdate = hasUpdate && (!userWatchedLatest || latestEpisodes > record.total_episodes);

        console.log(`检查更新 - ${record.title}: 原集数=${record.total_episodes}, 最新集数=${latestEpisodes}, 用户观看到第${record.index}集, 用户看到最新=${userWatchedLatest}, 有更新=${hasUpdate}, 应显示更新=${shouldShowUpdate}, 新增=${newEpisodes}集`);

        updatedRecords.push({
          ...record,
          hasUpdate: shouldShowUpdate,
          newEpisodes,
          // 更新总集数到最新值
          total_episodes: latestEpisodes > record.total_episodes ? latestEpisodes : record.total_episodes
        });

      } catch (error) {
        console.error(`检查更新失败 - ${record.title}:`, error);
        updatedRecords.push({
          ...record,
          hasUpdate: false,
          newEpisodes: 0
        });
      }
    }

    return updatedRecords;
  };

  const handleClearAll = () => {
    setShowClearStatsConfirm(true);
  };

  const handleConfirmClearStats = async () => {
    try {
      // 使用 Promise.all 确保所有清除操作同时进行并等待完成
      await Promise.all([
        clearUserStats(),
        clearAllPlayRecords()
      ]);

      // 确保所有状态都被重置
      setUserStats({
        totalWatchTime: 0,
        totalMovies: 0,
        firstWatchDate: Date.now(),
        lastUpdateTime: Date.now()
      });
      setPlayRecords([]);
      setUpdatedRecords([]);
      setHistoryRecords([]);
      setShowClearStatsConfirm(false);

      // 强制重新加载数据以确保清除完成
      setTimeout(() => {
        loadPlayRecords();
        loadUserStats();
      }, 100);
    } catch (error) {
      console.error('清空所有数据失败:', error);
      // 即使出错也要关闭对话框，避免用户重复点击
      setShowClearStatsConfirm(false);
      // 显示错误提示
      alert('清空数据失败，请重试');
    }
  };

  const handleCancelClearStats = () => {
    setShowClearStatsConfirm(false);
  };

  const handleClearPlayRecords = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClear = async () => {
    try {
      // 只清除播放记录，不影响统计数据
      await clearAllPlayRecords();
      setPlayRecords([]);
      setUpdatedRecords([]);
      setHistoryRecords([]);
      setShowClearConfirm(false);

      // 强制重新加载播放记录，但不重新加载统计数据
      // 避免触发自动同步，防止统计数据被重置
      setTimeout(() => {
        loadPlayRecords();
      }, 100);
    } catch (error) {
      console.error('清空播放记录失败:', error);
      // 即使出错也要关闭对话框，避免用户重复点击
      setShowClearConfirm(false);
      // 显示错误提示
      alert('清空播放记录失败，请重试');
    }
  };

  const handleCancelClear = () => {
    setShowClearConfirm(false);
  };

  const handlePlayVideo = (record: PlayRecord) => {
    const params = new URLSearchParams({
      title: record.title,
      source: record.source_name,
      year: record.year?.toString() || '',
      index: record.index?.toString() || '1',
      time: record.play_time?.toString() || '0'
    });

    router.push(`/play?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500 dark:text-gray-400">加载中...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20">
      <div className="container mx-auto px-4 py-8">
        {/* 页面头部 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              我的观看
            </h1>
          </div>

          {userStats && userStats.totalMovies > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1 px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded-md transition-colors sm:gap-2 sm:px-4 sm:py-2 sm:text-base sm:rounded-lg"
            >
              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
              清空所有数据
            </button>
          )}
        </div>

        {/* 观看统计信息 */}
        <div className="mb-8">
          {/* 移动端横向布局 */}
          <div className="sm:hidden">
            <div className="glass-light rounded-xl p-4 mb-6">
              <div className="flex items-center justify-around">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {userStats ? Math.floor(userStats.totalWatchTime / 3600) : 0} h
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">观看总时长</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {userStats && userStats.firstWatchDate > 0 ? (() => {
                      // 按自然日计算登录天数
                      const firstDate = new Date(userStats.firstWatchDate);
                      const currentDate = new Date();

                      // 获取注册日期的年月日（忽略时分秒）
                      const firstDay = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
                      const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

                      // 计算自然日差值并加1
                      const daysDiff = Math.floor((currentDay.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24));
                      return daysDiff + 1;
                    })() : 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">注册天数</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {userStats ? userStats.totalMovies : 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">观看影片</div>
                </div>
              </div>
            </div>
          </div>

          {/* 桌面端保持原有的网格布局 */}
          <div className="hidden sm:block">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="glass-light rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {userStats ? Math.floor(userStats.totalWatchTime / 3600) : 0} h
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">观看总时长</div>
              </div>
              <div className="glass-light rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {userStats && userStats.firstWatchDate > 0 ? (() => {
                    // 按自然日计算登录天数
                    const firstDate = new Date(userStats.firstWatchDate);
                    const currentDate = new Date();

                    // 获取注册日期的年月日（忽略时分秒）
                    const firstDay = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
                    const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

                    // 计算自然日差值并加1
                    const daysDiff = Math.floor((currentDay.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24));
                    return daysDiff + 1;
                  })() : 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">注册天数</div>
              </div>
              <div className="glass-light rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {userStats ? userStats.totalMovies : 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">观看影片</div>
              </div>
            </div>
          </div>
        </div>

        {playRecords.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              暂无观看记录
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              开始观看影片后，记录会显示在这里
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 有更新的剧集 */}
            {updatedRecords.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    有新集数
                  </h2>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-red-500 font-medium">
                      {updatedRecords.length}部剧集有更新
                    </span>
                  </div>
                </div>
                {/* 移动端网格布局 */}
                <div className="sm:hidden">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-8 pt-4 pb-6">
                    {updatedRecords.map((record, index) => (
                      <div key={`updated-${index}`} className="relative w-full group">
                        <div className="relative">
                          <VideoCard
                            title={record.title}
                            poster={record.cover}
                            year={record.year}
                            from="playrecord"
                            progress={record.total_time ? (record.play_time / record.total_time) * 100 : 0}
                            currentEpisode={record.index}
                            episodes={record.total_episodes}
                            source_name={record.source_name}
                            source={record.source_name}
                            id={record.id}
                            onDelete={() => loadPlayRecords(true)}
                          />
                          {/* 新集数提示光环效果 - 跟随VideoCard缩放 */}
                          {record.hasUpdate && (
                            <div className="absolute inset-0 rounded-lg ring-2 ring-red-400 ring-opacity-50 animate-pulse pointer-events-none z-10 transition-transform duration-200 ease-out group-hover:scale-105"></div>
                          )}
                        </div>
                        {record.hasUpdate && record.newEpisodes && record.newEpisodes > 0 && (
                          <div className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-bounce z-50">
                            +{record.newEpisodes}集
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 桌面端网格布局 */}
                <div className="hidden sm:block">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-10 pt-6 pb-8">
                    {updatedRecords.map((record, index) => (
                      <div key={`updated-${index}`} className="relative w-full group">
                        <div className="relative">
                          <VideoCard
                            title={record.title}
                            poster={record.cover}
                            year={record.year}
                            from="playrecord"
                            progress={record.total_time ? (record.play_time / record.total_time) * 100 : 0}
                            currentEpisode={record.index}
                            episodes={record.total_episodes}
                            source_name={record.source_name}
                            source={record.source_name}
                            id={record.id}
                            onDelete={() => loadPlayRecords(true)}
                          />
                          {/* 新集数提示光环效果 - 跟随VideoCard缩放 */}
                          {record.hasUpdate && (
                            <div className="absolute inset-0 rounded-lg ring-2 ring-red-400 ring-opacity-50 animate-pulse pointer-events-none z-10 transition-transform duration-200 ease-out group-hover:scale-105"></div>
                          )}
                        </div>
                        {record.hasUpdate && record.newEpisodes && record.newEpisodes > 0 && (
                          <div className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-bounce z-50">
                            +{record.newEpisodes}集
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 历史观看记录 */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                {updatedRecords.length > 0 ? '历史观看' : '观看记录'}
              </h2>

              {/* 统一使用网格布局 - 每行2部的竖向排列 */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 pt-4 pb-6 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-x-6 sm:gap-y-10 sm:pt-6 sm:pb-8">
                {historyRecords.map((record, index) => (
                  <div key={`history-${index}`} className="w-full">
                    <VideoCard
                      title={record.title}
                      poster={record.cover}
                      year={record.year}
                      from="playrecord"
                      progress={record.total_time ? (record.play_time / record.total_time) * 100 : 0}
                      currentEpisode={record.index}
                      episodes={record.total_episodes}
                      source_name={record.source_name}
                      source={record.source_name}
                      id={record.id}
                      onDelete={loadPlayRecords}
                    />
                  </div>
                ))}
              </div>

              {/* 清除观看记录按钮 */}
              {historyRecords.length > 0 && (
                <div className="mt-6 text-center">
                  <button
                    onClick={handleClearPlayRecords}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors mx-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                    清除观看记录
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 确认清除弹窗 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="glass-strong rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  确认清除记录
                </h3>
                <button
                  onClick={handleCancelClear}
                  className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-gray-600 dark:text-gray-300 mb-6">
                确定要清空所有观看记录吗？此操作不可撤销，将删除您的所有观看历史和进度信息，但不会影响观看统计数据。
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleCancelClear}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmClear}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 确认清除统计数据弹窗 */}
      {showClearStatsConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="glass-strong rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  确认清空所有数据
                </h3>
                <button
                  onClick={handleCancelClearStats}
                  className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-gray-600 dark:text-gray-300 mb-6">
                确定要清空所有数据吗？此操作将删除您的观看统计数据和所有观看记录，不可撤销。
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleCancelClearStats}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmClearStats}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                >
                  确认清空
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}