let raw = '';
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    console.log(JSON.stringify(JSON.parse(raw), null, 2));
  } catch {
    console.log(raw);
  }
});
