import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendOrderNotification(orderData, clientData) {
    const { order, price, customer_name, customer_email, phone } = orderData;
    
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: clientData.email, // Email клиента (компании)
      subject: `Новая заявка на медицинскую перевозку #${order.id}`,
      html: this.generateOrderEmail(orderData, clientData)
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Order notification sent to client');
      
      // Отправка подтверждения посетителю
      if (customer_email) {
        await this.sendCustomerConfirmation(orderData, customer_email);
      }
    } catch (error) {
      console.error('Failed to send email notification:', error);
      throw error;
    }
  }

  async sendCustomerConfirmation(orderData, customerEmail) {
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: customerEmail,
      subject: `Ваша заявка #${orderData.order.id} принята`,
      html: this.generateConfirmationEmail(orderData)
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Confirmation sent to customer');
    } catch (error) {
      console.error('Failed to send confirmation:', error);
      throw error;
    }
  }

  generateOrderEmail(orderData, clientData) {
    const { order, price, distance } = orderData;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Новая заявка</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .field { margin-bottom: 15px; }
          .label { font-weight: bold; color: #374151; }
          .value { color: #6b7280; }
          .price { font-size: 24px; font-weight: bold; color: #10b981; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Новая заявка на медицинскую перевозку</h1>
          </div>
          <div class="content">
            <div class="field">
              <span class="label">Номер заявки:</span>
              <span class="value">${order.id}</span>
            </div>
            <div class="field">
              <span class="label">Имя клиента:</span>
              <span class="value">${customer_name || 'Не указано'}</span>
            </div>
            <div class="field">
              <span class="label">Телефон:</span>
              <span class="value">${phone}</span>
            </div>
            <div class="field">
              <span class="label">Email:</span>
              <span class="value">${customer_email || 'Не указан'}</span>
            </div>
            <div class="field">
              <span class="label">Адрес откуда:</span>
              <span class="value">${order.from_address}</span>
            </div>
            <div class="field">
              <span class="label">Адрес куда:</span>
              <span class="value">${order.to_address}</span>
            </div>
            ${distance ? `
            <div class="field">
              <span class="label">Расстояние:</span>
              <span class="value">${distance} км</span>
            </div>
            ` : ''}
            ${order.weight ? `
            <div class="field">
              <span class="label">Вес пациента:</span>
              <span class="value">${order.weight} кг</span>
            </div>
            ` : ''}
            ${order.diagnosis ? `
            <div class="field">
              <span class="label">Диагноз:</span>
              <span class="value">${order.diagnosis}</span>
            </div>
            ` : ''}
            ${order.medical_escort ? `
            <div class="field">
              <span class="label">Медицинское сопровождение:</span>
              <span class="value">Да</span>
            </div>
            ` : ''}
            ${order.round_trip ? `
            <div class="field">
              <span class="label">Перевозка туда-обратно:</span>
              <span class="value">Да</span>
            </div>
            ` : ''}
            <div class="field">
              <span class="label">Способ оплаты:</span>
              <span class="value">${order.payment_method || 'Не указан'}</span>
            </div>
            ${order.comment ? `
            <div class="field">
              <span class="label">Комментарий:</span>
              <span class="value">${order.comment}</span>
            </div>
            ` : ''}
            <div class="field">
              <span class="label">Стоимость:</span>
              <span class="value price">${price} ₽</span>
            </div>
          </div>
          <div class="footer">
            <p>Это сообщение было отправлено автоматически с медицинского калькулятора</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateConfirmationEmail(orderData) {
    const { order, price } = orderData;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ваша заявка принята</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .field { margin-bottom: 15px; }
          .label { font-weight: bold; color: #374151; }
          .value { color: #6b7280; }
          .price { font-size: 24px; font-weight: bold; color: #10b981; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Ваша заявка принята</h1>
          </div>
          <div class="content">
            <p>Спасибо за обращение! Ваша заявка на медицинскую перевозку принята в обработку.</p>
            
            <div class="field">
              <span class="label">Номер заявки:</span>
              <span class="value">${order.id}</span>
            </div>
            <div class="field">
              <span class="label">Маршрут:</span>
              <span class="value">${order.from_address} → ${order.to_address}</span>
            </div>
            <div class="field">
              <span class="label">Предварительная стоимость:</span>
              <span class="value price">${price} ₽</span>
            </div>
            
            <p>Наш менеджер свяжется с вами в ближайшее время для подтверждения деталей и уточнения времени.</p>
            
            <p>Если у вас возникнут вопросы, пожалуйста, позвоните нам по указанному на сайте телефону.</p>
          </div>
          <div class="footer">
            <p>С уважением,<br>Команда медицинской перевозки</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      console.log('Email service connection verified');
      return true;
    } catch (error) {
      console.error('Email service connection failed:', error);
      return false;
    }
  }
}

export default new EmailService();
