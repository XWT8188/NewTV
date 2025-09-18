'use client';

import { AlertCircle, Check, ChevronDown, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface AIConfig {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  model: string;
  customModel?: string;
}

export default function AIConfigComponent() {
  const [config, setConfig] = useState<AIConfig>({
    enabled: false,
    apiUrl: '',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    customModel: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');

  // AI模型选项
  const aiModelOptions = [
    { value: 'gpt-4o', label: 'GPT-4o', group: 'OpenAI' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', group: 'OpenAI' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', group: 'OpenAI' },
    { value: 'gpt-4', label: 'GPT-4', group: 'OpenAI' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', group: 'OpenAI' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', group: 'Anthropic' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', group: 'Anthropic' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus', group: 'Anthropic' },
    { value: 'qwen-turbo', label: '通义千问 Turbo', group: '阿里云' },
    { value: 'qwen-plus', label: '通义千问 Plus', group: '阿里云' },
    { value: 'qwen-max', label: '通义千问 Max', group: '阿里云' },
    { value: 'ernie-4.0-8k', label: '文心一言 4.0', group: '百度' },
    { value: 'ernie-3.5-8k', label: '文心一言 3.5', group: '百度' },
    { value: 'glm-4', label: 'GLM-4', group: '智谱AI' },
    { value: 'glm-3-turbo', label: 'GLM-3 Turbo', group: '智谱AI' },
    { value: 'custom', label: '自定义模型', group: '其他' }
  ];

  // 预设模型列表（用于判断是否为已知模型）
  const knownModels = aiModelOptions.filter(option => option.value !== 'custom').map(option => option.value);

  // 处理模型选择
  const handleModelChange = useCallback((value: string) => {
    setConfig(prev => ({
      ...prev,
      model: value,
      // 如果选择自定义模型，使用当前输入的值；否则清空customModel
      customModel: value === 'custom' ? customModelInput : ''
    }));
    setIsModelDropdownOpen(false);
  }, [customModelInput]);

  // 处理自定义模型输入
  const handleCustomModelInputChange = useCallback((value: string) => {
    setCustomModelInput(value);
    // 如果当前选择的是自定义模型，同时更新config
    if (config.model === 'custom') {
      setConfig(prev => ({ ...prev, customModel: value }));
    }
  }, [config.model]);

  // 点击外部区域关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isModelDropdownOpen) {
        const target = event.target as Element;
        if (!target.closest('[data-dropdown="ai-model"]')) {
          setIsModelDropdownOpen(false);
        }
      }
    };

    if (isModelDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isModelDropdownOpen]);

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/admin/config');
        if (response.ok) {
          const data = await response.json();
          const modelValue = data.Config?.AIConfig?.model || 'gpt-3.5-turbo';
          const isKnownModel = knownModels.includes(modelValue);

          const customModelValue = data.Config?.AIConfig?.customModel || (isKnownModel ? '' : modelValue);

          setConfig({
            enabled: data.Config?.AIConfig?.enabled || false,
            apiUrl: data.Config?.AIConfig?.apiUrl || '',
            apiKey: data.Config?.AIConfig?.apiKey || '',
            model: isKnownModel ? modelValue : 'custom',
            customModel: customModelValue
          });

          // 同时更新自定义模型输入框的值
          setCustomModelInput(customModelValue);
        }
      } catch (error) {
        console.error('Failed to load AI config:', error);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  // 保存配置
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          AIConfig: {
            enabled: config.enabled,
            apiUrl: config.apiUrl,
            apiKey: config.apiKey,
            model: config.model === 'custom' ? (config.customModel || '') : config.model,
            customModel: config.customModel || ''
          }
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'AI配置保存成功' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error('保存失败');
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存AI配置失败，请重试' });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-10 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-10 bg-gray-200 rounded mb-4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 rounded-xl">
      <div className="space-y-4">
        {/* 启用开关 */}
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="ai-enabled"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
          />
          <label htmlFor="ai-enabled" className="text-sm font-medium text-gray-900 dark:text-gray-100">
            启用AI推荐功能
          </label>
        </div>

        {/* API URL */}
        <div>
          <label htmlFor="api-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API地址
          </label>
          <input
            type="url"
            id="api-url"
            value={config.apiUrl}
            onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            输入OpenAI API的基础地址，系统会自动添加/chat/completions
          </p>
        </div>

        {/* API Key */}
        <div>
          <label htmlFor="api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API密钥
          </label>
          <input
            type="password"
            id="api-key"
            value={config.apiKey}
            onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            请输入有效的API密钥
          </p>
        </div>

        {/* AI Model */}
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              AI模型
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              选择要使用的AI模型
            </p>
          </div>
          <div className="relative" data-dropdown="ai-model">
            {/* 自定义下拉选择框 */}
            <button
              type="button"
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="w-full max-w-md px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 text-left"
            >
              {
                aiModelOptions.find(
                  (option) => option.value === config.model
                )?.label || '选择模型'
              }
            </button>

            {/* 下拉箭头 */}
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isModelDropdownOpen ? 'rotate-180' : ''
                  }`}
              />
            </div>

            {/* 下拉选项列表 */}
            {isModelDropdownOpen && (
              <div className="absolute z-50 w-full max-w-md mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                {/* 按组分类显示选项 */}
                {['OpenAI', 'Anthropic', '阿里云', '百度', '智谱AI', '其他'].map((group) => {
                  const groupOptions = aiModelOptions.filter(option => option.group === group);
                  if (groupOptions.length === 0) return null;

                  return (
                    <div key={group}>
                      <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50">
                        {group}
                      </div>
                      {groupOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleModelChange(option.value)}
                          className={`w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${config.model === option.value
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                            : 'text-gray-900 dark:text-gray-100'
                            }`}
                        >
                          <span className="truncate">{option.label}</span>
                          {config.model === option.value && (
                            <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 ml-2" />
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 自定义模型输入 - 仅在选择自定义模型时显示 */}
        {config.model === 'custom' && (
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                自定义模型名称
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                输入完整的模型名称
              </p>
            </div>
            <input
              type="text"
              className="w-full max-w-md px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 shadow-sm hover:border-gray-400 dark:hover:border-gray-500"
              placeholder="例如: gemini-2.5-pro, claude-3-sonnet-20240229"
              value={customModelInput}
              onChange={(e) => handleCustomModelInputChange(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`flex items-center space-x-2 p-3 rounded-md ${message.type === 'success'
          ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
          : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
          }`}>
          {message.type === 'success' ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? '保存中...' : '保存配置'}</span>
        </button>
      </div>

      {/* 使用说明 */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">使用说明</h4>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <li>• 启用后，用户可以网页顶部看到AI荐片图标</li>
          <li>• 兼容OpenAI格式的API模型</li>
          <li>• API地址示例：https://api.openai.com/v1</li>
          <li>• 建议选择带联网搜索的模型</li>
          <li>• 确保API密钥有足够的调用额度</li>
        </ul>
      </div>
    </div>
  );
}