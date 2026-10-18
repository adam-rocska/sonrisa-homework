// Signalpost uses Better Auth's server and bearer entrypoints only.
// These optional adapters/test helpers are absent from the application.
const unusedBetterAuthPeers = ['svelte', 'vue', 'vitest'];

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name !== 'better-auth' || pkg.version !== '1.7.10') return pkg;

      for (const name of unusedBetterAuthPeers) {
        if (pkg.peerDependenciesMeta?.[name]?.optional !== true) {
          throw new Error(`Expected better-auth@1.7.10 peer ${name} to be optional`);
        }
        // pnpm 10 reconstructs optional peers left in peerDependenciesMeta.
        // Remove both declarations while leaving actual dependencies alone.
        delete pkg.peerDependencies?.[name];
        delete pkg.peerDependenciesMeta[name];
      }
      return pkg;
    },
  },
};
