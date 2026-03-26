const https = require('https');

const CLIENT_ID     = '165907';
const CLIENT_SECRET = 'b461d8a3b3fa5fe99465578ad15b0d7e05490ea3';
const WEB_APP_URL   = 'https://script.google.com/macros/s/AKfycbwM3Ebx9Wjh40EeALc2HKWOAvaTm8C9vgE2g9htWX1K31DtcZFm_MIjIKzXWhgfhv07/exec';

// Простий POST запит через https (без зовнішніх залежностей)
function post(url, data) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const params = new URLSearchParams(event.rawQuery || '');
  const code = params.get('code');

  if (!code) {
    return { statusCode: 400, body: 'Помилка: код від Strava не отримано.' };
  }

  // Отримуємо токени від Strava
  let stravaData;
  try {
    const res = await post('https://www.strava.com/oauth/token', {
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code:          code,
      grant_type:    'authorization_code'
    });
    stravaData = JSON.parse(res.body);
  } catch (e) {
    return { statusCode: 500, body: `Помилка Strava API: ${e.message}` };
  }

  if (!stravaData.access_token) {
    return { statusCode: 400, body: `Помилка авторизації: ${JSON.stringify(stravaData)}` };
  }

  const athlete      = stravaData.athlete || {};
  const fname        = (athlete.firstname || '').trim();
  const lname        = (athlete.lastname  || '').trim();
  const fullName     = `${fname} ${lname}`.trim() || 'Атлет Strava';
  const refreshToken = stravaData.refresh_token || '';

  // Відправляємо в Google Sheets
  try {
    await post(WEB_APP_URL, { fullname: fullName, token: refreshToken });
  } catch (e) {
    return { statusCode: 500, body: `Помилка відправки в Google Sheets: ${e.message}` };
  }

  // Сторінка успіху
  const html = `
    <!doctype html>
    <html lang="uk">
    <head>
      <meta charset="UTF-8"/>
      <title>Реєстрація успішна</title>
      <style>
        body { background-color:#1a1a1a; color:#f4e4bc; font-family:'Georgia',serif; text-align:center; padding:50px; min-height:100vh; }
        h1   { color:#d4af37; }
        a    { color:#d4af37; text-decoration:none; border:1px solid #d4af37; padding:10px 20px; }
        a:hover { background:#333; }
      </style>
    </head>
    <body>
      <h1>РЕЄСТРАЦІЯ УСПІШНА!</h1>
      <p>Вітаю, <strong>${fullName}</strong>.</p>
      <p>Дані передано в аркуш Token.</p>
      <hr style="border:0;border-top:1px solid #333;margin:20px 0;">
      <a href="/">На головну</a>
    </body>
    </html>
  `;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html
  };
};