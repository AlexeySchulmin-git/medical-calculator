'use client';

/**
 * Статическая страница документации проекта (без beads)
 */
export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            📚 Документация проекта
          </h1>
          <p className="text-lg text-gray-600">Актуальная техническая документация проекта.</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Что использовать как источник контекста</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li><strong>Git история</strong> — источник фактических изменений.</li>
            <li><strong>docs/CODEINDEX.md</strong> — карта модулей и точек входа.</li>
            <li><strong>docs/DECISIONS.md</strong> — архитектурные решения и ограничения.</li>
            <li><strong>docs/QUICK_REFERENCE.md</strong> — оперативные команды и поток запуска.</li>
          </ul>
        </div>

        {/* Quick Links */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Быстрые ссылки</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a href="/test.html" target="_blank" className="flex items-center p-4 border rounded hover:bg-gray-50">
              <span className="text-2xl mr-3">🧪</span>
              <div>
                <div className="font-semibold">Тест виджета</div>
                <div className="text-sm text-gray-600">Актуальный тест calculator-виджета</div>
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
