import { useState, useEffect } from 'react';

/**
 * Beads Timeline компонент для визуализации истории проекта
 */
export default function BeadsTimeline({ beads }) {
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredBeads = beads.filter(bead => {
    const matchesFilter = filter === 'all' || bead.metadata.status === filter;
    const matchesSearch = bead.metadata.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (bead.metadata.tags || []).some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'in-progress': return 'bg-yellow-500';
      case 'blocked': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'completed': return 'Выполнено';
      case 'in-progress': return 'В процессе';
      case 'blocked': return 'Заблокировано';
      default: return 'Неизвестно';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="beads-timeline">
      <div className="beads-controls mb-6">
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            placeholder="Поиск по названию или тегам..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border rounded-lg flex-1"
          />
          
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="all">Все статусы</option>
            <option value="completed">Выполнено</option>
            <option value="in-progress">В процессе</option>
            <option value="blocked">Заблокировано</option>
          </select>
        </div>

        <div className="flex gap-2 text-sm">
          <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
            Выполнено: {beads.filter(b => b.metadata.status === 'completed').length}
          </span>
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
            В процессе: {beads.filter(b => b.metadata.status === 'in-progress').length}
          </span>
          <span className="px-2 py-1 bg-red-100 text-red-800 rounded">
            Заблокировано: {beads.filter(b => b.metadata.status === 'blocked').length}
          </span>
        </div>
      </div>

      <div className="beads-list space-y-4">
        {filteredBeads.map((bead) => (
          <div key={bead.id} className="bead-item border rounded-lg p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${getStatusColor(bead.metadata.status)}`}></div>
                <h3 className="font-semibold text-lg">{bead.metadata.title}</h3>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>{formatDate(bead.metadata.date)}</span>
                <span>•</span>
                <span>{bead.metadata.author}</span>
              </div>
            </div>

            <div className="mb-3">
              <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                bead.metadata.status === 'completed' ? 'bg-green-100 text-green-800' :
                bead.metadata.status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {getStatusText(bead.metadata.status)}
              </span>
            </div>

            {bead.metadata.tags && bead.metadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {bead.metadata.tags.map(tag => (
                  <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="text-gray-700 mb-3 line-clamp-3">
              {bead.body.substring(0, 200)}...
            </div>

            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-500">
                ID: {bead.id}
              </div>
              
              <button
                onClick={() => window.open(`/docs/beads/${bead.id}`, '_blank')}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
              >
                Подробнее
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredBeads.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>Ничего не найдено по вашим критериям поиска</p>
        </div>
      )}
    </div>
  );
}
