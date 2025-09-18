import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';

// YouTube频道数据类型
interface YouTubeChannel {
  id: string;
  name: string;
  channelId: string;
  addedAt: string;
  sortOrder: number;
}

// 获取所有频道
async function getChannels(): Promise<YouTubeChannel[]> {
  try {
    const adminConfig = await getConfig();
    const channels = (adminConfig as any)?.YouTubeChannels || [];

    // 确保所有频道都有sortOrder字段，如果没有则按添加时间排序
    return channels
      .map((channel: any, index: number) => ({
        ...channel,
        sortOrder: channel.sortOrder ?? index,
      }))
      .sort((a: YouTubeChannel, b: YouTubeChannel) => a.sortOrder - b.sortOrder);
  } catch (error) {
    console.error('获取YouTube频道失败:', error);
    return [];
  }
}

// 保存所有频道
async function saveChannels(channels: YouTubeChannel[]): Promise<void> {
  try {
    const adminConfig = await getConfig();
    (adminConfig as any).YouTubeChannels = channels;
    await db.saveAdminConfig(adminConfig);
    
    // 清除配置缓存，确保下次读取时从数据库获取最新数据
    clearConfigCache();
  } catch (error) {
    console.error('保存YouTube频道失败:', error);
    throw error;
  }
}

export async function GET() {
  try {
    const channels = await getChannels();
    return NextResponse.json({ channels });
  } catch (error) {
    console.error('获取YouTube频道列表失败:', error);
    return NextResponse.json({ error: '获取频道列表失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const { name, channelId } = await request.json();

    if (!name || !channelId) {
      return NextResponse.json({ error: '频道名称和ID不能为空' }, { status: 400 });
    }

    const channels = await getChannels();

    // 获取当前最大的sortOrder，新频道排在最后
    const maxSortOrder = channels.length > 0 ? Math.max(...channels.map((c) => c.sortOrder || 0)) : -1;

    const newChannel: YouTubeChannel = {
      id: Date.now().toString(),
      name,
      channelId,
      addedAt: new Date().toISOString(),
      sortOrder: maxSortOrder + 1,
    };

    channels.push(newChannel);
    await saveChannels(channels);

    return NextResponse.json({ channel: newChannel });
  } catch (error) {
    console.error('添加YouTube频道失败:', error);
    return NextResponse.json({ error: '添加频道失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const { channels: updatedChannels } = await request.json();

    if (!Array.isArray(updatedChannels)) {
      return NextResponse.json({ error: '无效的频道数据' }, { status: 400 });
    }

    // 验证每个频道都有必要的字段
    for (const channel of updatedChannels) {
      if (!channel.id || !channel.name || !channel.channelId || typeof channel.sortOrder !== 'number') {
        return NextResponse.json({ error: '频道数据格式不正确' }, { status: 400 });
      }
    }

    await saveChannels(updatedChannels);
    return NextResponse.json({ message: '频道排序更新成功' });
  } catch (error) {
    console.error('更新YouTube频道排序失败:', error);
    return NextResponse.json({ error: '更新频道排序失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('id');

    if (!channelId) {
      return NextResponse.json({ error: '频道ID不能为空' }, { status: 400 });
    }

    const channels = await getChannels();
    const initialLength = channels.length;
    const filteredChannels = channels.filter((channel) => channel.id !== channelId);

    if (filteredChannels.length === initialLength) {
      return NextResponse.json({ error: '频道不存在' }, { status: 404 });
    }

    await saveChannels(filteredChannels);
    return NextResponse.json({ message: '频道删除成功' });
  } catch (error) {
    console.error('删除YouTube频道失败:', error);
    return NextResponse.json({ error: '删除频道失败' }, { status: 500 });
  }
}