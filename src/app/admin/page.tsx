'use client';

import { useEffect } from 'react';

export default function AdminPage() {
  useEffect(() => {
    // Перенаправляем на статический admin.html
    window.location.href = '/admin.html';
  }, []);

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <p>Загрузка админ панели...</p>
    </div>
  );
}
