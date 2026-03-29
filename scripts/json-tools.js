const action = Deno.args[0] || 'validate';
const jsonInput = Deno.args[1] || '';

if (!jsonInput.trim()) {
  console.error('JSON input is required');
  Deno.exit(1);
}

try {
  const parsedJson = JSON.parse(jsonInput);

  if (action === 'validate') {
    console.log(JSON.stringify({ output: 'JSON is valid.' }));
    Deno.exit(0);
  }

  if (action === 'pretty') {
    console.log(JSON.stringify({ output: JSON.stringify(parsedJson, null, 2) }));
    Deno.exit(0);
  }

  if (action === 'minify') {
    console.log(JSON.stringify({ output: JSON.stringify(parsedJson) }));
    Deno.exit(0);
  }

  console.error(`Unsupported action: ${action}`);
  Deno.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
