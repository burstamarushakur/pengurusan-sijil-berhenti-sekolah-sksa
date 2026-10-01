const API_URL = 'https://sxmchnwzcbsanecxnqdt.supabase.co/functions/v1/school-leaving-api';

async function request(headers, action, payload = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ action, year: 2026, ...payload }),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok || data.success === false) {
    const error = new Error(data.error || `Ralat ${response.status}`);
    error.status = response.status;
    error.code = data.error || '';
    throw error;
  }
  return data;
}

export function login(ic) {
  return request({}, 'login', { ic });
}

export function api(token, action, payload = {}) {
  return request({ 'x-session-token': token }, action, payload);
}
