import Script from "next/script";

export default function Home() {
  return (
    <>
      <Script src="/widget-calculator.js" strategy="beforeInteractive" />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="container mx-auto px-4 py-12">
          {/* Заголовок */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Медицинская перевозка
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Профессиональная транспортировка пациентов с медицинским сопровождением.
              Рассчитайте стоимость онлайн за 1 минуту.
            </p>
          </div>

          {/* Калькулятор */}
          <div className="max-w-2xl mx-auto mb-16">
            <medical-calculator
              api-url="http://localhost:3003"
              api-key="test-api-key-12345"
            />
          </div>

          {/* Преимущества */}
          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8 mb-16">
            <div className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🚑</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Специализированный транспорт
              </h3>
              <p className="text-gray-600">
                Современные автомобили с медицинским оборудованием
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">👨‍⚕️</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Квалифицированный персонал
              </h3>
              <p className="text-gray-600">
                Опытные медицинские работники сопровождают пациента
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">⏱️</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Работаем 24/7
              </h3>
              <p className="text-gray-600">
                Круглосуточная доступность и быстрая подача транспорта
              </p>
            </div>
          </div>

          {/* Информация */}
          <div className="max-w-4xl mx-auto bg-white rounded-xl p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Как это работает?
            </h2>

            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">
                  1
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Заполните форму</h4>
                  <p className="text-gray-600">
                    Укажите адреса, вес пациента и дополнительные параметры
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">
                  2
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Получите расчет</h4>
                  <p className="text-gray-600">
                    Система автоматически рассчитает точную стоимость по дорогам
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">
                  3
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Оставьте заявку</h4>
                  <p className="text-gray-600">
                    Укажите контактные данные, и мы свяжемся с вами в течение 5 минут
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Футер */}
          <footer className="mt-16 text-center text-gray-500 text-sm">
            <p>© 2024 Медицинская перевозка. Все права защищены.</p>
          </footer>
        </div>
      </div>
    </>
  );
}
