/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { Redis } from '@upstash/redis';

import { AdminConfig } from './admin.types';
import { DanmakuConfig, Favorite, IStorage, PlayRecord, SkipConfig, UserStats } from './types';

// 搜索历史最大条数
const SEARCH_HISTORY_LIMIT = 20;

// 数据类型转换辅助函数
function ensureString(value: any): string {
  return String(value);
}

function ensureStringArray(value: any[]): string[] {
  return value.map((item) => String(item));
}

// 添加Upstash Redis操作重试包装器
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err: any) {
      const isLastAttempt = i === maxRetries - 1;
      const isConnectionError =
        err.message?.includes('Connection') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ENOTFOUND') ||
        err.code === 'ECONNRESET' ||
        err.code === 'EPIPE' ||
        err.name === 'UpstashError';

      if (isConnectionError && !isLastAttempt) {
        console.log(
          `Upstash Redis operation failed, retrying... (${i + 1}/${maxRetries})`
        );
        console.error('Error:', err.message);

        // 等待一段时间后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }

      throw err;
    }
  }

  throw new Error('Max retries exceeded');
}

export class UpstashRedisStorage implements IStorage {
  private client: Redis;

  constructor() {
    this.client = getUpstashRedisClient();
  }

  // ---------- 通用缓存方法 ----------
  async connect(): Promise<void> {
    // Upstash Redis 不需要显式连接
  }

  async get(key: string): Promise<string | null> {
    return await withRetry(() => this.client.get(key));
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<void> {
    if (options?.EX) {
      await withRetry(() => this.client.setex(key, options.EX!, value));
    } else {
      await withRetry(() => this.client.set(key, value));
    }
  }

  // ---------- 播放记录 ----------
  private prKey(user: string, key: string) {
    return `u:${user}:pr:${key}`; // u:username:pr:source+id
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const val = await withRetry(() =>
      this.client.get(this.prKey(userName, key))
    );
    return val ? (val as PlayRecord) : null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    await withRetry(() => this.client.set(this.prKey(userName, key), record));
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    const pattern = `u:${userName}:pr:*`;
    const keys: string[] = await withRetry(() => this.client.keys(pattern));
    if (keys.length === 0) return {};

    const result: Record<string, PlayRecord> = {};
    for (const fullKey of keys) {
      const value = await withRetry(() => this.client.get(fullKey));
      if (value) {
        // 截取 source+id 部分
        const keyPart = ensureString(fullKey.replace(`u:${userName}:pr:`, ''));
        result[keyPart] = value as PlayRecord;
      }
    }
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.del(this.prKey(userName, key)));
  }

  // ---------- 收藏 ----------
  private favKey(user: string, key: string) {
    return `u:${user}:fav:${key}`;
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const val = await withRetry(() =>
      this.client.get(this.favKey(userName, key))
    );
    return val ? (val as Favorite) : null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.favKey(userName, key), favorite)
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const pattern = `u:${userName}:fav:*`;
    const keys: string[] = await withRetry(() => this.client.keys(pattern));
    if (keys.length === 0) return {};

    const result: Record<string, Favorite> = {};
    for (const fullKey of keys) {
      const value = await withRetry(() => this.client.get(fullKey));
      if (value) {
        const keyPart = ensureString(fullKey.replace(`u:${userName}:fav:`, ''));
        result[keyPart] = value as Favorite;
      }
    }
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.del(this.favKey(userName, key)));
  }

  // ---------- 用户注册 / 登录 ----------
  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await withRetry(() => this.client.set(this.userPwdKey(userName), password));
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await withRetry(() =>
      this.client.get(this.userPwdKey(userName))
    );
    if (stored === null) return false;
    // 确保比较时都是字符串类型
    return ensureString(stored) === password;
  }

  // 检查用户是否存在
  async checkUserExist(userName: string): Promise<boolean> {
    // 使用 EXISTS 判断 key 是否存在
    const exists = await withRetry(() =>
      this.client.exists(this.userPwdKey(userName))
    );
    return exists === 1;
  }

  // 修改用户密码
  async changePassword(userName: string, newPassword: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await withRetry(() =>
      this.client.set(this.userPwdKey(userName), newPassword)
    );
  }

  // 删除用户及其所有数据
  async deleteUser(userName: string): Promise<void> {
    // 删除用户密码
    await withRetry(() => this.client.del(this.userPwdKey(userName)));

    // 删除搜索历史
    await withRetry(() => this.client.del(this.shKey(userName)));

    // 删除播放记录
    const playRecordPattern = `u:${userName}:pr:*`;
    const playRecordKeys = await withRetry(() =>
      this.client.keys(playRecordPattern)
    );
    if (playRecordKeys.length > 0) {
      await withRetry(() => this.client.del(...playRecordKeys));
    }

    // 删除收藏夹
    const favoritePattern = `u:${userName}:fav:*`;
    const favoriteKeys = await withRetry(() =>
      this.client.keys(favoritePattern)
    );
    if (favoriteKeys.length > 0) {
      await withRetry(() => this.client.del(...favoriteKeys));
    }

    // 删除跳过片头片尾配置
    const skipConfigPattern = `u:${userName}:skip:*`;
    const skipConfigKeys = await withRetry(() =>
      this.client.keys(skipConfigPattern)
    );
    if (skipConfigKeys.length > 0) {
      await withRetry(() => this.client.del(...skipConfigKeys));
    }

    // 删除弹幕配置
    await withRetry(() => this.client.del(this.danmakuConfigKey(userName)));
  }

  // ---------- 搜索历史 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await withRetry(() =>
      this.client.lrange(this.shKey(userName), 0, -1)
    );
    // 确保返回的都是字符串类型
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 先去重
    await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    // 插入到最前
    await withRetry(() => this.client.lpush(key, ensureString(keyword)));
    // 限制最大长度
    await withRetry(() => this.client.ltrim(key, 0, SEARCH_HISTORY_LIMIT - 1));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    } else {
      await withRetry(() => this.client.del(key));
    }
  }

  // ---------- 获取全部用户 ----------
  async getAllUsers(): Promise<string[]> {
    const keys = await withRetry(() => this.client.keys('u:*:pwd'));
    return keys
      .map((k) => {
        const match = k.match(/^u:(.+?):pwd$/);
        return match ? ensureString(match[1]) : undefined;
      })
      .filter((u): u is string => typeof u === 'string');
  }

  // ---------- 管理员配置 ----------
  private adminConfigKey() {
    return 'admin:config';
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const val = await withRetry(() => this.client.get(this.adminConfigKey()));
    return val ? (val as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await withRetry(() => this.client.set(this.adminConfigKey(), config));

    // 确保管理员配置永不过期，移除可能存在的TTL
    try {
      await withRetry(() => this.client.persist(this.adminConfigKey()));
    } catch (error) {
      console.warn('移除管理员配置TTL失败，但数据已保存:', error);
    }
  }

  // ---------- 跳过片头片尾配置 ----------
  private skipConfigKey(user: string, source: string, id: string) {
    return `u:${user}:skip:${source}+${id}`;
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<SkipConfig | null> {
    const val = await withRetry(() =>
      this.client.get(this.skipConfigKey(userName, source, id))
    );
    return val ? (val as SkipConfig) : null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.skipConfigKey(userName, source, id), config)
    );
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    await withRetry(() =>
      this.client.del(this.skipConfigKey(userName, source, id))
    );
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: SkipConfig }> {
    const pattern = `u:${userName}:skip:*`;
    const keys = await withRetry(() => this.client.keys(pattern));

    if (keys.length === 0) {
      return {};
    }

    const configs: { [key: string]: SkipConfig } = {};

    // 批量获取所有配置
    const values = await withRetry(() => this.client.mget(keys));

    keys.forEach((key, index) => {
      const value = values[index];
      if (value) {
        // 从key中提取source+id
        const match = key.match(/^u:.+?:skip:(.+)$/);
        if (match) {
          const sourceAndId = match[1];
          configs[sourceAndId] = value as SkipConfig;
        }
      }
    });

    return configs;
  }

  // ---------- 弹幕配置 ----------
  private danmakuConfigKey(user: string) {
    return `u:${user}:danmaku`;
  }

  async getDanmakuConfig(userName: string): Promise<DanmakuConfig | null> {
    const val = await withRetry(() => this.client.get(this.danmakuConfigKey(userName)));
    return val ? (val as DanmakuConfig) : null;
  }

  async setDanmakuConfig(userName: string, config: DanmakuConfig): Promise<void> {
    await withRetry(() => this.client.set(this.danmakuConfigKey(userName), config));
  }

  async deleteDanmakuConfig(userName: string): Promise<void> {
    await withRetry(() => this.client.del(this.danmakuConfigKey(userName)));
  }

  // ---------- 用户统计数据 ----------
  private userStatsKey(user: string) {
    return `u:${user}:stats`;
  }

  async getUserStats(userName: string): Promise<UserStats | null> {
    try {
      const key = this.userStatsKey(userName);
      console.log(`getUserStats: 查询用户 ${userName} 的统计数据，键: ${key}`);

      const result = await withRetry(() => this.client.get(key));
      console.log(`getUserStats: 从数据库获取的原始结果:`, result, `类型: ${typeof result}`);

      if (!result) {
        console.log('getUserStats: 数据库中没有找到统计数据，为新用户初始化默认统计数据');

        // 为新用户创建初始化统计数据
        const defaultStats: UserStats = {
          totalWatchTime: 0,
          totalMovies: 0,
          firstWatchDate: 0, // 初始化为0，将在第一次观看时设置为实际时间
          lastUpdateTime: Date.now()
        };

        // 将默认统计数据保存到数据库
        await withRetry(() => this.client.set(key, JSON.stringify(defaultStats)));
        console.log(`为新用户 ${userName} 初始化统计数据:`, defaultStats);

        return defaultStats;
      }

      // 检查结果是否已经是对象
      if (typeof result === 'object' && result !== null) {
        console.log('getUserStats: 数据已经是对象格式，直接返回');
        return result as UserStats;
      }

      // 检查是否是有效的JSON字符串
      if (typeof result === 'string') {
        try {
          const parsed = JSON.parse(result);
          console.log('getUserStats: JSON解析成功，返回数据:', parsed);
          return parsed;
        } catch (parseError) {
          console.error('getUserStats: JSON解析失败，原始数据:', result);
          console.error('getUserStats: 解析错误:', parseError);

          // 如果解析失败，为用户重新初始化统计数据
          const defaultStats: UserStats = {
            totalWatchTime: 0,
            totalMovies: 0,
            firstWatchDate: 0, // 初始化为0，将在第一次观看时设置为实际时间
            lastUpdateTime: Date.now()
          };

          await withRetry(() => this.client.set(key, JSON.stringify(defaultStats)));
          console.log(`数据解析失败，为用户 ${userName} 重新初始化统计数据:`, defaultStats);

          return defaultStats;
        }
      }

      console.error('getUserStats: 未知数据格式:', typeof result, result);

      // 对于未知格式，也提供默认统计数据
      const defaultStats: UserStats = {
        totalWatchTime: 0,
        totalMovies: 0,
        firstWatchDate: 0, // 初始化为0，将在第一次观看时设置为实际时间
        lastUpdateTime: Date.now()
      };

      await withRetry(() => this.client.set(key, JSON.stringify(defaultStats)));
      console.log(`未知数据格式，为用户 ${userName} 重新初始化统计数据:`, defaultStats);

      return defaultStats;
    } catch (error) {
      console.error('getUserStats: 获取用户统计数据失败:', error);

      // 即使出现错误，也为用户提供默认统计数据
      const defaultStats: UserStats = {
        totalWatchTime: 0,
        totalMovies: 0,
        firstWatchDate: 0, // 初始化为0，将在第一次观看时设置为实际时间
        lastUpdateTime: Date.now()
      };

      try {
        const key = this.userStatsKey(userName);
        await withRetry(() => this.client.set(key, JSON.stringify(defaultStats)));
        console.log(`发生错误，为用户 ${userName} 初始化统计数据:`, defaultStats);
      } catch (initError) {
        console.error('初始化统计数据也失败:', initError);
      }

      return defaultStats;
    }
  }

  async updateUserStats(userName: string, updateData: {
    watchTime: number;
    movieKey: string;
    timestamp: number;
    isFullReset?: boolean;
  }): Promise<void> {
    try {
      const key = this.userStatsKey(userName);

      if (updateData.isFullReset) {
        // 处理重新计算的完整重置
        console.log('执行完整重置统计数据...');

        // 解析movieKey中的所有影片
        const movieKeys = updateData.movieKey.split(',').filter(k => k.trim());

        const stats: UserStats = {
          totalWatchTime: updateData.watchTime,
          totalMovies: movieKeys.length,
          firstWatchDate: updateData.timestamp,
          lastUpdateTime: Date.now()
        };

        // 重置已观看影片集合
        const watchedMoviesKey = `watched_movies:${userName}`;
        await withRetry(() => this.client.set(watchedMoviesKey, JSON.stringify(movieKeys)));

        // 设置统计数据
        await withRetry(() => this.client.set(key, JSON.stringify(stats)));
        console.log('完整重置统计数据成功:', stats);
        return;
      }

      const existingStats = await this.getUserStats(userName);

      let stats: UserStats;
      if (existingStats && existingStats.firstWatchDate > 0) {
        // 用户已有观看记录，进行增量更新
        const watchedMoviesKey = `watched_movies:${userName}`;
        const watchedMoviesResult = await withRetry(() => this.client.get(watchedMoviesKey));

        let movieSet: Set<string>;
        if (watchedMoviesResult) {
          try {
            // 检查数据类型
            if (typeof watchedMoviesResult === 'object' && Array.isArray(watchedMoviesResult)) {
              movieSet = new Set(watchedMoviesResult);
            } else if (typeof watchedMoviesResult === 'string') {
              movieSet = new Set(JSON.parse(watchedMoviesResult));
            } else {
              console.error('watchedMovies数据格式异常:', typeof watchedMoviesResult, watchedMoviesResult);
              movieSet = new Set();
            }
          } catch (parseError) {
            console.error('解析watchedMovies失败:', parseError, '原始数据:', watchedMoviesResult);
            movieSet = new Set();
          }
        } else {
          movieSet = new Set();
        }

        const isNewMovie = !movieSet.has(updateData.movieKey);

        // 更新现有统计数据
        stats = {
          totalWatchTime: existingStats.totalWatchTime + updateData.watchTime,
          totalMovies: isNewMovie ? existingStats.totalMovies + 1 : existingStats.totalMovies,
          firstWatchDate: existingStats.firstWatchDate,
          lastUpdateTime: updateData.timestamp
        };

        // 如果是新影片，添加到已观看影片集合中
        if (isNewMovie) {
          movieSet.add(updateData.movieKey);
          await withRetry(() => this.client.set(watchedMoviesKey, JSON.stringify(Array.from(movieSet))));
          console.log(`新影片记录: ${updateData.movieKey}, 总影片数: ${stats.totalMovies}`);
        } else {
          console.log(`已观看影片: ${updateData.movieKey}, 总影片数保持: ${stats.totalMovies}`);
        }
      } else {
        // 新用户第一次观看，创建新的统计数据
        stats = {
          totalWatchTime: updateData.watchTime,
          totalMovies: 1,
          firstWatchDate: updateData.timestamp, // 使用实际观看时间
          lastUpdateTime: updateData.timestamp
        };

        // 初始化已观看影片集合
        const watchedMoviesKey = `watched_movies:${userName}`;
        await withRetry(() => this.client.set(watchedMoviesKey, JSON.stringify([updateData.movieKey])));
        console.log(`初始化用户统计: ${updateData.movieKey}, 总影片数: 1`);
      }

      await withRetry(() => this.client.set(key, JSON.stringify(stats)));
      console.log('updateUserStats: 统计数据更新成功');
    } catch (error) {
      console.error('updateUserStats: 更新用户统计数据失败:', error);
      throw error;
    }
  }

  async clearUserStats(userName: string): Promise<void> {
    await withRetry(() => this.client.del(this.userStatsKey(userName)));
  }

  async clearAllData(): Promise<void> {
    try {
      // 获取所有用户
      const allUsers = await this.getAllUsers();

      // 删除所有用户及其数据
      for (const username of allUsers) {
        await this.deleteUser(username);
      }

      // 删除管理员配置
      await withRetry(() => this.client.del(this.adminConfigKey()));

      console.log('所有数据已清空');
    } catch (error) {
      console.error('清空数据失败:', error);
      throw new Error('清空数据失败');
    }
  }
}

// 单例 Upstash Redis 客户端
function getUpstashRedisClient(): Redis {
  const globalKey = Symbol.for('__MOONTV_UPSTASH_REDIS_CLIENT__');
  let client: Redis | undefined = (global as any)[globalKey];

  if (!client) {
    const upstashUrl = process.env.UPSTASH_URL;
    const upstashToken = process.env.UPSTASH_TOKEN;

    if (!upstashUrl || !upstashToken) {
      throw new Error(
        'UPSTASH_URL and UPSTASH_TOKEN env variables must be set'
      );
    }

    // 创建 Upstash Redis 客户端
    client = new Redis({
      url: upstashUrl,
      token: upstashToken,
      // 可选配置
      retry: {
        retries: 3,
        backoff: (retryCount: number) =>
          Math.min(1000 * Math.pow(2, retryCount), 30000),
      },
    });

    console.log('Upstash Redis client created successfully');

    (global as any)[globalKey] = client;
  }

  return client;
}
