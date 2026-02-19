'use client';

import { useState, useEffect } from 'react';
import BeadsTimeline from '../../docs/components/BeadsTimeline';

/**
 * Страница документации проекта с Beads системой
 */
export default function DocsPage() {
  const [beads, setBeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBeads();
  }, []);

  const fetchBeads = async () => {
    try {
      const response = await fetch('/api/docs/beads');
      const data = await response.json();
      
      if (data.success) {
        setBeads(data.beads);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch beads');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка документации...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Ошибка загрузки</h1>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={fetchBeads}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            📚 Документация проекта
          </h1>
          <p className="text-lg text-gray-600">
            История разработки и принятия решений в медицинском калькуляторе
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-3xl font-bold text-blue-500">{beads.length}</div>
            <div className="text-gray-600">Всего записей</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-3xl font-bold text-green-500">
              {beads.filter(b => b.metadata.status === 'completed').length}
            </div>
            <div className="text-gray-600">Выполнено</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-3xl font-bold text-yellow-500">
              {beads.filter(b => b.metadata.status === 'in-progress').length}
            </div>
            <div className="text-gray-600">В процессе</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-3xl font-bold text-red-500">
              {beads.filter(b => b.metadata.status === 'blocked').length}
            </div>
            <div className="text-gray-600">Заблокировано</div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Timeline проекта</h2>
          <BeadsTimeline beads={beads} />
        </div>

        {/* Quick Links */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Быстрые ссылки</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a href="/test-simple.html" target="_blank" className="flex items-center p-4 border rounded hover:bg-gray-50">
              <span className="text-2xl mr-3">🧪</span>
              <div>
                <div className="font-semibold">Тест виджета</div>
                <div className="text-sm text-gray-600">Mock версия калькулятора</div>
              </div>
            </a>
            <a href="/.windsurf/workflows/main.md" target="_blank" className="flex items-center p-4 border rounded hover:bg-gray-50">
              <span className="text-2xl mr-3">📋</span>
              <div>
                <div className="font-semibold">План реализации</div>
                <div className="text-sm text-gray-600">Полный план проекта</div>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
