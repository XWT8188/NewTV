'use client';

import { getAllPlayRecords, PlayRecord, generateStorageKey } from './db.client';

// 缓存键
const WATCHING_UPDATES_CACHE_KEY = 'watching_updates_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 事件名称
export const WATCHING_UPDATES_EVENT = 'watchingUpdatesChanged';

interface WatchingUpdatesCache {
  hasUpdates: boolean;
  timestamp: number;
  updatedCount: number;
}

interface ExtendedPlayRecord extends PlayRecord {
  id: string;
  hasUpdate?: boolean;
  newEpisodes?: number;
}

// 获取缓存的新集数更新状态
export function getCachedWatchingUpdates(): boolean {
  try {
    const cached = localStorage.getItem(WATCHING_UPDATES_CACHE_KEY);
    if (!cached) return false;

    const data: WatchingUpdatesCache = JSON.parse(cached);
    const now = Date.now();

    // 检查缓存是否过期
    if (now - data.timestamp > CACHE_DURATION) {
      localStorage.removeItem(WATCHING_UPDATES_CACHE_KEY);
      return false;
    }

    return data.hasUpdates;
  } catch (error) {
    console.error('获取新集数更新缓存失败:', error);
    return false;
  }
}

// 设置新集数更新状态到缓存
function setCachedWatchingUpdates(hasUpdates: boolean, updatedCount = 0) {
  try {
    const data: WatchingUpdatesCache = {
      hasUpdates,
      timestamp: Date.now(),
      updatedCount
    };
    localStorage.setItem(WATCHING_UPDATES_CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('设置新集数更新缓存失败:', error);
  }
}

// 清除新集数更新状态
export function clearWatchingUpdates() {
  try {
    localStorage.removeItem(WATCHING_UPDATES_CACHE_KEY);
    // 触发事件通知状态变化
    window.dispatchEvent(new CustomEvent(WATCHING_UPDATES_EVENT, {
      detail: { hasUpdates: false, updatedCount: 0 }
    }));
  } catch (error) {
    console.error('清除新集数更新状态失败:', error);
  }
}

// 检查单个剧集的更新状态
async function checkSingleRecordUpdate(record: PlayRecord, videoId: string): Promise<{ hasUpdate: boolean; newEpisodes: number; latestEpisodes: number }> {
  try {
    const response = await fetch(`/api/detail?source=${record.source_name}&id=${videoId}`);
    if (!response.ok) {
      console.warn(`获取${record.title}详情失败:`, response.status);
      return { hasUpdate: false, newEpisodes: 0, latestEpisodes: record.total_episodes };
    }

    const detailData = await response.json();
    const latestEpisodes = detailData.episodes ? detailData.episodes.length : 0;

    // 比较集数，如果用户已看到最新集且没有新增集数，则不计入更新
    const hasUpdate = latestEpisodes > record.total_episodes;
    const userWatchedLatest = record.index >= record.total_episodes;
    const newEpisodes = hasUpdate ? latestEpisodes - record.total_episodes : 0;

    // 只有当有新集数且用户没有看到最新集时才算作更新
    // 如果用户已经看到了当前记录的最新集，且总集数没有增加，则不显示更新
    const shouldShowUpdate = hasUpdate && (!userWatchedLatest || latestEpisodes > record.total_episodes);

    return {
      hasUpdate: shouldShowUpdate,
      newEpisodes,
      latestEpisodes
    };
  } catch (error) {
    console.error(`检查${record.title}更新失败:`, error);
    return { hasUpdate: false, newEpisodes: 0, latestEpisodes: record.total_episodes };
  }
}

// 检查所有观看记录的新集数更新
export async function checkWatchingUpdates(): Promise<void> {
  try {
    const recordsObj = await getAllPlayRecords();
    const records = Object.entries(recordsObj).map(([key, record]) => ({
      ...record,
      id: key
    }));

    if (records.length === 0) {
      setCachedWatchingUpdates(false, 0);
      window.dispatchEvent(new CustomEvent(WATCHING_UPDATES_EVENT, {
        detail: { hasUpdates: false, updatedCount: 0 }
      }));
      return;
    }

    let hasAnyUpdates = false;
    let updatedCount = 0;

    // 并发检查所有记录的更新状态
    const updatePromises = records.map(async (record) => {
      // 从存储key中解析出videoId
      const [sourceName, videoId] = record.id.split('+');
      const updateInfo = await checkSingleRecordUpdate(record, videoId);

      if (updateInfo.hasUpdate) {
        hasAnyUpdates = true;
        updatedCount++;
      }

      return {
        ...record,
        hasUpdate: updateInfo.hasUpdate,
        newEpisodes: updateInfo.newEpisodes,
        total_episodes: updateInfo.latestEpisodes > record.total_episodes ? updateInfo.latestEpisodes : record.total_episodes
      };
    });

    await Promise.all(updatePromises);

    // 更新缓存和触发事件
    setCachedWatchingUpdates(hasAnyUpdates, updatedCount);
    window.dispatchEvent(new CustomEvent(WATCHING_UPDATES_EVENT, {
      detail: { hasUpdates: hasAnyUpdates, updatedCount }
    }));

    console.log(`新集数检查完成: ${hasAnyUpdates ? `发现${updatedCount}部剧集有更新` : '暂无更新'}`);
  } catch (error) {
    console.error('检查新集数更新失败:', error);
  }
}

// 订阅新集数更新事件
export function subscribeToWatchingUpdates(callback: (hasUpdates: boolean, updatedCount: number) => void): () => void {
  const handleUpdate = (event: CustomEvent) => {
    const { hasUpdates, updatedCount } = event.detail;
    callback(hasUpdates, updatedCount);
  };

  window.addEventListener(WATCHING_UPDATES_EVENT, handleUpdate as EventListener);

  return () => {
    window.removeEventListener(WATCHING_UPDATES_EVENT, handleUpdate as EventListener);
  };
}

// 设置定期检查新集数更新
export function setupPeriodicUpdateCheck(intervalMinutes = 30): () => void {
  const intervalMs = intervalMinutes * 60 * 1000;

  const intervalId = setInterval(() => {
    checkWatchingUpdates();
  }, intervalMs);

  return () => {
    clearInterval(intervalId);
  };
}

// 检查特定视频的更新状态（用于视频详情页面）
export async function checkVideoUpdate(sourceName: string, videoId: string): Promise<void> {
  try {
    const recordsObj = await getAllPlayRecords();
    const storageKey = generateStorageKey(sourceName, videoId);
    const targetRecord = recordsObj[storageKey];

    if (!targetRecord) {
      return;
    }

    const updateInfo = await checkSingleRecordUpdate(targetRecord, videoId);

    if (updateInfo.hasUpdate) {
      // 如果发现这个视频有更新，重新检查所有更新状态
      await checkWatchingUpdates();
    }
  } catch (error) {
    console.error('检查视频更新失败:', error);
  }
}