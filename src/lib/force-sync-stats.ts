/**
 * 强制同步用户统计数据的工具函数
 * 用于确保多设备间的数据同步
 */

import { getUserStats, clearUserStats, recalculateUserStatsFromHistory, UserStats } from './db.client';

/**
 * 强制同步用户统计数据
 * 清除本地缓存并从服务器重新获取最新数据
 */
export async function forceSyncUserStats(): Promise<UserStats | null> {
  try {
    console.log('开始强制同步用户统计数据...');

    // 先尝试基于历史记录重新计算统计数据
    console.log('正在基于历史记录重新计算统计数据...');
    const recalculatedStats = await recalculateUserStatsFromHistory();
    console.log('重新计算的统计数据:', recalculatedStats);

    if (recalculatedStats) {
      console.log('用户统计数据同步完成（重新计算）:', recalculatedStats);

      // 触发全局更新事件
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('userStatsUpdated', {
          detail: recalculatedStats
        }));
      }

      return recalculatedStats;
    }

    // 如果重新计算失败，清除本地缓存并从服务器获取
    console.log('重新计算失败，清除本地缓存并从服务器获取...');

    // 清除本地缓存
    await clearUserStats();
    console.log('本地缓存已清除');

    // 从服务器重新获取最新数据
    console.log('正在从服务器获取最新统计数据...');
    const latestStats = await getUserStats(true);
    console.log('从服务器获取到的统计数据:', latestStats);

    if (!latestStats || (latestStats.totalWatchTime === 0 && latestStats.totalMovies === 0 && latestStats.firstWatchDate === 0)) {
      console.warn('服务器返回的统计数据为空或无效');
      return null;
    }

    console.log('用户统计数据同步完成:', latestStats);

    // 触发全局更新事件
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('userStatsUpdated', {
        detail: latestStats
      }));
    }

    return latestStats;
  } catch (error) {
    console.error('强制同步用户统计数据失败:', error);

    // 如果同步失败，尝试重新计算
    try {
      console.log('同步失败，尝试重新计算统计数据...');
      const recalculatedStats = await recalculateUserStatsFromHistory();
      console.log('重新计算的统计数据:', recalculatedStats);

      if (recalculatedStats && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('userStatsUpdated', {
          detail: recalculatedStats
        }));
      }

      return recalculatedStats;
    } catch (recalcError) {
      console.error('重新计算统计数据也失败:', recalcError);
      return null;
    }
  }
}

/**
 * 在页面可见性变化时自动同步数据
 * 当用户切换回页面时，自动检查并同步最新数据
 */
export function setupAutoSync(): void {
  if (typeof window === 'undefined') return;

  let lastSyncTime = 0;
  const SYNC_INTERVAL = 5 * 60 * 1000; // 5分钟最多同步一次

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      if (now - lastSyncTime > SYNC_INTERVAL) {
        lastSyncTime = now;
        forceSyncUserStats();
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // 页面加载时也执行一次同步
  forceSyncUserStats();
}