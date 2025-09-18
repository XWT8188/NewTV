'use client';

import { useState, useEffect } from 'react';
import { Search, Cloud, ExternalLink, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import PageLayout from '@/components/PageLayout';
import ErrorBoundary from '@/components/ErrorBoundary';

interface CloudDiskResult {
  url: string;
  password: string;
  note: string;
  datetime: string;
  source: string;
}

interface CloudDiskResponse {
  code: number;
  message: string;
  data: {
    total: number;
    merged_by_type: {
      baidu: CloudDiskResult[];
      quark?: CloudDiskResult[];
    };
  };
}

export default function CloudDiskPage() {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CloudDiskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [quarkCollapsed, setQuarkCollapsed] = useState(false);
  const [baiduCollapsed, setBaiduCollapsed] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // 滚动监听 Effect
  useEffect(() => {
    const getScrollTop = () => {
      return document.body.scrollTop || 0;
    };

    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowScrollToTop(scrollTop > 300);
    };

    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    try {
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      document.body.scrollTop = 0;
    }
  };

  const handleSearch = async () => {
    if (!keyword.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);
    // 重置折叠状态
    setQuarkCollapsed(false);
    setBaiduCollapsed(false);

    try {
      const response = await fetch(`/api/cloud-disk/search?kw=${encodeURIComponent(keyword)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '搜索失败');
      }

      // 验证响应数据结构
      if (!data || typeof data !== 'object') {
        throw new Error('服务器返回了无效的数据格式');
      }

      // 确保数据结构正确
      const validatedData = {
        code: data.code || 0,
        message: data.message || '',
        data: {
          total: data.data?.total || 0,
          merged_by_type: {
            baidu: Array.isArray(data.data?.merged_by_type?.baidu) ? data.data.merged_by_type.baidu : [],
            quark: Array.isArray(data.data?.merged_by_type?.quark) ? data.data.merged_by_type.quark : []
          }
        }
      };

      // 如果夸克网盘结果超过10个，自动折叠百度网盘结果
      const quarkResults = validatedData.data.merged_by_type.quark || [];
      const baiduResults = validatedData.data.merged_by_type.baidu || [];

      if (quarkResults.length > 10 && baiduResults.length > 0) {
        setBaiduCollapsed(true);
      }
      // 如果百度网盘结果超过10个且夸克网盘结果少，自动折叠夸克网盘结果
      else if (baiduResults.length > 10 && quarkResults.length > 0 && quarkResults.length < baiduResults.length) {
        setQuarkCollapsed(true);
      }

      setResults(validatedData);
    } catch (err) {
      console.error('网盘搜索错误:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 3000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('zh-CN');
    } catch {
      return dateString;
    }
  };

  return (
    <ErrorBoundary>
      <PageLayout>
        <div className="min-h-screen">
          <div className="container mx-auto px-4 py-6">
            {/* 页面标题 */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                <Cloud className="inline-block w-8 h-8 mr-2" />
                网盘搜索
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                搜索百度网盘、夸克网盘等云存储资源
              </p>
            </div>

            {/* 搜索框 */}
            <div className="mb-8">
              <div className="flex gap-2 max-w-2xl">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="输入搜索关键词..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  disabled={loading || !keyword.trim()}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
                >
                  {loading ? '搜索中...' : '搜索'}
                </button>
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* 搜索结果 */}
            {results && (
              <div className="space-y-6">
                {/* 统计信息 */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                  <p className="text-gray-600 dark:text-gray-400">
                    找到 <span className="font-semibold text-green-600 dark:text-green-400">{results.data.total}</span> 个结果
                  </p>
                </div>

                {/* 夸克网盘结果 - 优先展示 */}
                {results.data.merged_by_type.quark && results.data.merged_by_type.quark.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2
                        className="text-xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-green-600 dark:hover:text-green-400 transition-colors flex items-center"
                        onClick={() => setQuarkCollapsed(!quarkCollapsed)}
                      >
                        夸克网盘 ({results.data.merged_by_type.quark.length})
                        {quarkCollapsed ? <ChevronDown className="w-4 h-4 ml-2" /> : <ChevronUp className="w-4 h-4 ml-2" />}
                      </h2>
                      <button
                        onClick={() => setQuarkCollapsed(!quarkCollapsed)}
                        className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-1"
                      >
                        {quarkCollapsed ? '展开' : '折叠'}
                        {quarkCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className={`grid gap-4 ${quarkCollapsed ? 'hidden' : ''}`}>
                      {results.data.merged_by_type.quark.map((item, index) => (
                        <div
                          key={index}
                          className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-gray-900 dark:text-white mb-2 line-clamp-2">
                                {item.note}
                              </h3>
                              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-3">
                                <span>更新时间: {formatDate(item.datetime)}</span>
                                <span>来源: {item.source}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600 dark:text-gray-300">提取码:</span>
                                <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">
                                  {item.password}
                                </code>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => copyToClipboard(item.url)}
                                className="p-2 text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 transition-colors"
                                title="复制链接"
                              >
                                {copiedUrl === item.url ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 transition-colors"
                                title="打开链接"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 百度网盘结果 */}
                {results.data.merged_by_type.baidu && results.data.merged_by_type.baidu.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2
                        className="text-xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-green-600 dark:hover:text-green-400 transition-colors flex items-center"
                        onClick={() => setBaiduCollapsed(!baiduCollapsed)}
                      >
                        百度网盘 ({results.data.merged_by_type.baidu.length})
                        {baiduCollapsed ? <ChevronDown className="w-4 h-4 ml-2" /> : <ChevronUp className="w-4 h-4 ml-2" />}
                      </h2>
                      <button
                        onClick={() => setBaiduCollapsed(!baiduCollapsed)}
                        className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-1"
                      >
                        {baiduCollapsed ? '展开' : '折叠'}
                        {baiduCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className={`grid gap-4 ${baiduCollapsed ? 'hidden' : ''}`}>
                      {results.data.merged_by_type.baidu.map((item, index) => (
                        <div
                          key={index}
                          className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-gray-900 dark:text-white mb-2 line-clamp-2">
                                {item.note}
                              </h3>
                              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-3">
                                <span>更新时间: {formatDate(item.datetime)}</span>
                                <span>来源: {item.source}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600 dark:text-gray-300">提取码:</span>
                                <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">
                                  {item.password}
                                </code>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => copyToClipboard(item.url)}
                                className="p-2 text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 transition-colors"
                                title="复制链接"
                              >
                                {copiedUrl === item.url ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 transition-colors"
                                title="打开链接"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 无结果提示 */}
                {results.data.total === 0 && (
                  <div className="text-center py-12">
                    <Cloud className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">未找到相关资源</h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                      尝试使用不同的关键词或检查拼写
                    </p>
                    <div className="text-sm text-gray-400">
                      搜索关键词: <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{keyword}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 返回顶部悬浮按钮 */}
        <button
          onClick={scrollToTop}
          className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${showScrollToTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          aria-label='返回顶部'
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </PageLayout>
    </ErrorBoundary>
  );
}
