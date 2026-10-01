const API_URL = 'https://sxmchnwzcbsanecxnqdt.supabase.co/functions/v1/school-leaving-api';

export async function api(password, action, payload = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-password': password,
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
    throw error;
  }
  return data;
}
