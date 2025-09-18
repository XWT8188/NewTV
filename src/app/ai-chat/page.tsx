'use client';

import { Bot, Send, User, ArrowLeft, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

import PageLayout from '@/components/PageLayout';
import { processImageUrl } from '@/lib/utils';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  recommendations?: MovieRecommendation[];
  youtubeVideos?: YouTubeVideo[];
  isMovieCard?: boolean;
  movieInfo?: {
    title: string;
    poster: string;
    doubanLink: string;
  };
  hiddenContent?: string;
}

interface MovieRecommendation {
  title: string;
  year?: string;
  genre?: string;
  description: string;
  poster?: string;
}

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
}

const AIChatPage = () => {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'ai',
      content: '你好！我是AI推荐助手，可以根据你的喜好为你推荐精彩的影视作品和YouTube视频。\n\n如果你想看电影、电视剧、动漫等影视内容，我会为你推荐相关作品；\n如果你想看新闻、教程、解说、音乐等视频内容，我会为你推荐YouTube视频。\n\n请告诉我你想看什么类型的内容吧！',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      // 检查是否有预设的剧名内容
      const presetContent = localStorage.getItem('ai-chat-preset');
      if (presetContent) {
        const { title, poster, doubanLink, hiddenContent, timestamp } = JSON.parse(presetContent);
        const now = Date.now();
        // 5分钟内有效
        if (now - timestamp < 5 * 60 * 1000) {
          // 清除预设内容
          localStorage.removeItem('ai-chat-preset');
          
          // 模拟发送海报卡片消息
          const movieCardMessage: Message = {
            id: Date.now().toString(),
            type: 'user',
            content: `[发送了《${title}》的海报卡片]`,
            timestamp: new Date(),
            isMovieCard: true,
            movieInfo: {
              title,
              poster,
              doubanLink
            },
            hiddenContent
          };
          
          // AI预设回复
          const aiPresetReply: Message = {
            id: (Date.now() + 1).toString(),
            type: 'ai',
            content: `你想了解《${title}》的什么相关信息呢？`,
            timestamp: new Date()
          };
          
          setMessages(prev => [...prev, movieCardMessage, aiPresetReply]);
          
          return; // 如果有预设内容，不加载缓存消息
        } else {
          // 过期的预设内容，清除
          localStorage.removeItem('ai-chat-preset');
        }
      }
      
      // 加载缓存消息
      const cachedMessages = localStorage.getItem('ai-chat-messages');
      if (cachedMessages) {
        const { messages: storedMessages, timestamp } = JSON.parse(cachedMessages);
        const now = new Date().getTime();
        // 30 minutes cache
        if (now - timestamp < 30 * 60 * 1000) {
          setMessages(storedMessages.map((msg: Message) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })));
        }
      }
    } catch (error) {
      console.error("Failed to load messages from cache", error);
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
    try {
      const cache = {
        messages,
        timestamp: new Date().getTime()
      };
      localStorage.setItem('ai-chat-messages', JSON.stringify(cache));
    } catch (error) {
      console.error("Failed to save messages to cache", error);
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleAutoSendMessage = async (messagesWithPreset: Message[]) => {
    const conversationHistory = messagesWithPreset.slice(-8);

    try {
      const response = await fetch('/api/ai/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: conversationHistory.map(m => ({ role: m.type, content: m.content }))
        })
      });

      if (!response.ok) {
        throw new Error('推荐请求失败');
      }

      const data = await response.json();
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: data.content || '抱歉，我现在无法为你推荐内容，请稍后再试。',
        timestamp: new Date(),
        recommendations: data.recommendations || [],
        youtubeVideos: data.youtubeVideos || []
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('AI推荐失败:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: '抱歉，网络连接出现问题，请检查网络后重试。如果问题持续存在，请稍后再试。',
        timestamp: new Date(),
        recommendations: [],
        youtubeVideos: []
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    // 检查最后一条消息是否是电影卡片消息，如果是则组合隐藏内容
    const lastMessage = messages[messages.length - 1];
    let actualContent = inputValue.trim();
    
    if (lastMessage && lastMessage.isMovieCard && lastMessage.hiddenContent) {
      // 组合隐藏内容和用户输入
      actualContent = `${lastMessage.hiddenContent}\n\n用户问题：${inputValue.trim()}`;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(), // 显示内容仍然是用户输入的内容
      timestamp: new Date()
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    // 构建对话历史，使用实际内容（包含隐藏内容）
    const conversationHistory = updatedMessages.slice(-8).map(msg => {
      if (msg === userMessage) {
        // 对于刚发送的消息，使用包含隐藏内容的实际内容
        return { role: msg.type, content: actualContent };
      }
      return { role: msg.type, content: msg.content };
    });

    try {
      const response = await fetch('/api/ai/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: conversationHistory
        })
      });

      if (!response.ok) {
        throw new Error('推荐请求失败');
      }

      const data = await response.json();
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: data.content || '抱歉，我现在无法为你推荐内容，请稍后再试。',
        timestamp: new Date(),
        recommendations: data.recommendations || [],
        youtubeVideos: data.youtubeVideos || []
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('AI推荐失败:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: '抱歉，推荐服务暂时不可用，请稍后再试。',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleMovieSelect = (movie: MovieRecommendation) => {
    // 跳转到搜索页面并搜索该影片
    const searchQuery = encodeURIComponent(movie.title);
    router.push(`/search?q=${searchQuery}`);
  };

  const handleYouTubeVideoSelect = (video: YouTubeVideo) => {
    setPlayingVideoId(video.id);
  };

  return (
    <PageLayout>
      <div className="flex flex-col h-full">

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-4 pt-8 space-y-4 pb-28">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.type === 'ai' && (
                <div className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center flex-shrink-0 self-start">
                  <Bot className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
              )}
              <div className={`flex flex-col max-w-[80%] ${message.type === 'user' ? 'items-end' : 'items-start'}`}>
                {/* 海报卡片显示 */}
                {message.isMovieCard && message.movieInfo && (
                  <div className="mb-2 p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg max-w-xs">
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-20 bg-gray-200 dark:bg-gray-600 rounded flex-shrink-0 overflow-hidden">
                        <img
                          src={processImageUrl(message.movieInfo.poster)}
                          alt={message.movieInfo.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent && !parent.querySelector('.poster-placeholder')) {
                              const placeholder = document.createElement('div');
                              placeholder.className = 'poster-placeholder w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs';
                              placeholder.textContent = '海报';
                              parent.appendChild(placeholder);
                            }
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                          {message.movieInfo.title}
                        </h4>
                        {message.movieInfo.doubanLink && (
                          <a
                            href={message.movieInfo.doubanLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            查看豆瓣详情
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div
                  className={`p-3 rounded-2xl ${message.type === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
                    }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                </div>

                {/* 推荐影片卡片 */}
                {message.recommendations && message.recommendations.length > 0 && (
                  <div className="mt-3 space-y-2 self-stretch">
                    {message.recommendations.map((movie, index) => (
                      <div
                        key={index}
                        onClick={() => handleMovieSelect(movie)}
                        className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          {movie.poster && (
                            <div className="w-12 h-16 bg-gray-200 dark:bg-gray-600 rounded flex-shrink-0 overflow-hidden">
                              <img
                                src={processImageUrl(movie.poster)}
                                alt={movie.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent && !parent.querySelector('.poster-placeholder')) {
                                    const placeholder = document.createElement('div');
                                    placeholder.className = 'poster-placeholder w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs';
                                    placeholder.textContent = '海报';
                                    parent.appendChild(placeholder);
                                  }
                                }}
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                              {movie.title}
                              {movie.year && (
                                <span className="text-gray-500 dark:text-gray-400 ml-1">({movie.year})</span>
                              )}
                            </h4>
                            {movie.genre && (
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{movie.genre}</p>
                            )}
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                              {movie.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {message.youtubeVideos && message.youtubeVideos.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.youtubeVideos.map((video, index) => (
                      <div key={index} className="relative">
                        {playingVideoId === video.id ? (
                          <div className="relative">
                            <div className="aspect-video bg-black rounded-lg overflow-hidden">
                              <iframe
                                src={`https://www.youtube.com/embed/${video.id}?autoplay=1`}
                                title={video.title}
                                className="w-full h-full"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>
                            <button
                              onClick={() => setPlayingVideoId(null)}
                              className="absolute top-1 right-1 sm:top-2 sm:right-2 bg-black bg-opacity-50 text-white p-1 rounded-full hover:bg-opacity-70 transition-all"
                            >
                              <X className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                            <div className="mt-2">
                              <h4 className="font-medium text-gray-900 dark:text-white text-xs sm:text-sm line-clamp-2">
                                {video.title}
                              </h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {video.channelTitle}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 sm:p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                            onClick={() => handleYouTubeVideoSelect(video)}
                          >
                            <div className="flex gap-2 sm:gap-3">
                              <div className="relative flex-shrink-0">
                                <img
                                  src={video.thumbnail}
                                  alt={video.title}
                                  className="w-16 h-12 sm:w-20 sm:h-14 object-cover rounded"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 rounded">
                                  <div className="w-4 h-4 sm:w-6 sm:h-6 bg-red-600 rounded-full flex items-center justify-center">
                                    <div className="w-0 h-0 border-l-[4px] sm:border-l-[6px] border-l-white border-t-[2px] sm:border-t-[3px] border-t-transparent border-b-[2px] sm:border-b-[3px] border-b-transparent ml-0.5"></div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-900 dark:text-white text-xs sm:text-sm line-clamp-2">
                                  {video.title}
                                </h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {video.channelTitle}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 hidden sm:block">
                                  {video.description}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-2">
                  {message.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {message.type === 'user' && (
                <div className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <div className="fixed bottom-14 left-0 right-0 p-3 border-t border-gray-200 dark:border-gray-700 md:relative md:bottom-auto backdrop-blur-md bg-white/80 dark:bg-gray-900/80">
          <div className="flex gap-2 items-center max-w-4xl mx-auto">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="描述你想看的影片类型或心情..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none"
                disabled={isLoading}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default AIChatPage;