async function test() {
  try {
    const loginRes = await fetch('http://localhost:4000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@vloq.com', password: 'Furnix@2026' }),
    });
    const loginData = (await loginRes.json()) as any;
    if (!loginData.success) {
      console.error('Login failed:', loginData);
      return;
    }
    const token = loginData.data.accessToken;
    console.log('Login successful! Token acquired.');

    // Hit list estimates endpoint without search
    const noSearchRes = await fetch('http://localhost:4000/api/v1/estimates', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const noSearchData = (await noSearchRes.json()) as any;
    console.log('Total items in DB without search:', noSearchData.data.length);

    // Test full query parameters
    const queryRes = await fetch(`http://localhost:4000/api/v1/estimates?page=1&pageSize=20&status=ALL&search=admin@vloq.com`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const queryData = (await queryRes.json()) as any;
    console.log('Full query search count:', queryData.data.length);
    console.log('Full query data:', JSON.stringify(queryData.data, null, 2));
  } catch (err) {
    console.error('Error during test:', err);
  }
}

test();
