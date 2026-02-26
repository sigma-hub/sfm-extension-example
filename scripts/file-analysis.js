const filePath = Deno.args[0];

if (!filePath) {
  console.error('File path is required');
  Deno.exit(1);
}

try {
  const fileBytes = await Deno.readFile(filePath);
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(hashByte => hashByte.toString(16).padStart(2, '0')).join('');
  const textContent = new TextDecoder().decode(fileBytes);
  const lineCount = textContent.split(/\r\n|\r|\n/).length;
  const sizeBytes = fileBytes.byteLength;

  console.log(JSON.stringify({
    hash: hashHex,
    lines: lineCount,
    sizeBytes,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
