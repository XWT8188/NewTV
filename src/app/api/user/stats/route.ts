import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getConfig();
    if (authInfo.username !== process.env.ADMIN_USERNAME) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (user.banned) {
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
    }

    const stats = await db.getUserStats(authInfo.username);

    // 如果stats为null，返回默认统计数据
    if (!stats) {
      const defaultStats = {
        totalWatchTime: 0,
        totalMovies: 0,
        firstWatchDate: 0, // 初始化为0，将在第一次观看时设置为实际时间
        lastUpdateTime: Date.now()
      };

      console.log(`为新用户 ${authInfo.username} 提供默认统计数据:`, defaultStats);
      return NextResponse.json(defaultStats);
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('获取用户统计数据失败:', error);
    return NextResponse.json(
      { error: '获取用户统计数据失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/user/stats - 开始处理请求');

    // 从 cookie 获取用户信息
    console.log('正在从 cookie 获取用户信息...');
    const authInfo = getAuthInfoFromCookie(request);
    console.log('用户认证信息:', { username: authInfo?.username || 'null' });

    if (!authInfo || !authInfo.username) {
      console.log('用户未认证');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('正在获取配置...');
    const config = await getConfig();
    console.log('配置获取成功');

    if (authInfo.username !== process.env.ADMIN_USERNAME) {
      console.log('非管理员用户，检查用户状态...');
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        console.log('用户不存在:', authInfo.username);
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (user.banned) {
        console.log('用户已被封禁:', authInfo.username);
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
      console.log('用户状态正常');
    }

    console.log('正在解析请求体...');
    const body = await request.json();
    const { watchTime, movieKey, timestamp, isRecalculation } = body;
    console.log('请求体数据:', { watchTime, movieKey, timestamp, isRecalculation });

    if (typeof watchTime !== 'number' || !movieKey || !timestamp) {
      console.log('参数验证失败');
      return NextResponse.json(
        { error: '参数错误：需要 watchTime, movieKey, timestamp' },
        { status: 400 }
      );
    }

    if (isRecalculation) {
      console.log('处理重新计算请求，直接设置统计数据...');
      // 对于重新计算，我们需要直接设置统计数据而不是增量更新

      // 直接设置统计数据
      const recalculatedStats = {
        totalWatchTime: watchTime,
        totalMovies: movieKey.split(',').filter((k: string) => k.trim()).length,
        firstWatchDate: timestamp,
        lastUpdateTime: Date.now()
      };

      console.log('设置重新计算的统计数据:', recalculatedStats);

      // 这里我们需要一个直接设置统计数据的方法
      // 暂时先清除旧数据，然后设置新数据
      await db.clearUserStats(authInfo.username);

      // 使用updateUserStats但传入特殊参数来表示这是完整设置
      await db.updateUserStats(authInfo.username, {
        watchTime: recalculatedStats.totalWatchTime,
        movieKey: movieKey,
        timestamp: recalculatedStats.firstWatchDate,
        isFullReset: true
      });
    } else {
      console.log('正在增量更新用户统计数据...');
      await db.updateUserStats(authInfo.username, {
        watchTime,
        movieKey,
        timestamp
      });
    }
    console.log('用户统计数据更新成功');

    // 获取更新后的用户统计数据并返回
    console.log('正在获取更新后的用户统计数据...');
    const updatedStats = await db.getUserStats(authInfo.username);
    console.log('获取到的更新后统计数据:', updatedStats);

    return NextResponse.json({
      success: true,
      userStats: updatedStats || { totalWatchTime: 0, totalMovies: 0, firstWatchDate: 0, lastUpdateTime: 0 }
    });
  } catch (error) {
    console.error('POST /api/user/stats - 详细错误信息:');
    console.error('错误类型:', error?.constructor?.name);
    console.error('错误消息:', (error as Error)?.message);
    console.error('错误堆栈:', (error as Error)?.stack);

    // 如果是特定类型的错误，提供更详细的信息
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error cause:', error.cause);
    }

    return NextResponse.json(
      {
        error: '更新用户统计数据失败',
        details: process.env.NODE_ENV === 'development' ? (error as Error)?.message : undefined
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getConfig();
    if (authInfo.username !== process.env.ADMIN_USERNAME) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (user.banned) {
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
    }

    await db.clearUserStats(authInfo.username);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('清除用户统计数据失败:', error);
    return NextResponse.json(
      { error: '清除用户统计数据失败' },
      { status: 500 }
    );
  }
}