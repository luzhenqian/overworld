const siteUrl = new URL(process.env.SITE_URL ?? 'https://overworldengine.com');
const indexNowEndpoint =
  process.env.INDEXNOW_ENDPOINT ?? 'https://api.indexnow.org/indexnow';
const key = 'cce19bfab3f3782f314c709a08a6bf94';
const keyLocation = new URL(`/${key}.txt`, siteUrl).toString();

// pnpm forwards the conventional argument separator to plain Node scripts.
const requestedUrls = process.argv.slice(2).filter((value) => value !== '--');

if (requestedUrls.length === 0) {
  console.error(
    'Pass one or more changed canonical URLs. Example: pnpm docs:seo:indexnow -- https://overworldengine.com/en',
  );
  process.exit(2);
}

const urlList = [...new Set(requestedUrls.map((value) => new URL(value, siteUrl).toString()))];

for (const url of urlList) {
  const parsed = new URL(url);
  if (parsed.origin !== siteUrl.origin) {
    throw new Error(`Refusing to submit a URL outside ${siteUrl.origin}: ${url}`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`Submit only canonical URLs without query strings or fragments: ${url}`);
  }
}

const keyResponse = await fetch(keyLocation, {
  headers: { 'user-agent': 'Overworld-IndexNow/1.0' },
  signal: AbortSignal.timeout(15_000),
});
const hostedKey = (await keyResponse.text()).trim();

if (!keyResponse.ok || hostedKey !== key) {
  throw new Error(
    `IndexNow key is not live at ${keyLocation} (status ${keyResponse.status}). Deploy before submitting URLs.`,
  );
}

const response = await fetch(indexNowEndpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'user-agent': 'Overworld-IndexNow/1.0',
  },
  body: JSON.stringify({
    host: siteUrl.hostname,
    key,
    keyLocation,
    urlList,
  }),
  signal: AbortSignal.timeout(20_000),
});

if (!response.ok) {
  const body = (await response.text()).slice(0, 1_000);
  throw new Error(`IndexNow returned ${response.status}: ${body || response.statusText}`);
}

console.log(
  `IndexNow accepted ${urlList.length} changed canonical URL${urlList.length === 1 ? '' : 's'} (${response.status}).`,
);
