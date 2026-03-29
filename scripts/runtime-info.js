try {
  const runtimeInfo = {
    os: Deno.build.os,
    arch: Deno.build.arch,
    denoVersion: Deno.version.deno,
    v8Version: Deno.version.v8,
    typescriptVersion: Deno.version.typescript,
    hostname: Deno.hostname(),
    homeDir: Deno.env.get('HOME') || Deno.env.get('USERPROFILE') || '',
  };

  console.log(JSON.stringify(runtimeInfo));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
