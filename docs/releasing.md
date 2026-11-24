# Preparing a TypeDial release

1. Review the tree and the commits and tags that will be visible. Check Git author and committer addresses, local paths, unpublished issue or release content, credentials, and screenshots before changing repository visibility.
2. Set the version in `package.json` and `package-lock.json`, update the [changelog](../CHANGELOG.md), and run the [contributor checks](../CONTRIBUTING.md) from a clean checkout.
3. Build the `.pbw` and test the target watches or emulators. Test an offline save on any available phone and watch before claiming physical offline verification.
4. If distributing binaries, publish them with matching corresponding source, build instructions, and license notices. Include [GPLv3](../LICENSE), [third-party notices](../licenses/README.md), and the relevant notices for any runtime components linked or bundled by the SDK. Review the SDK linker map and toolchain notices for the build you distribute. For the SDK used here, the map shows statically linked Newlib code. Check `COPYING.NEWLIB` in the SDK toolchain distribution, and review the notices for any bundled dependencies of Clay.
5. Tag the verified source and record the SHA-256 of the binary or distribution archive. Attach the verified artifact and link its matching source when publishing the release.

The `.pbw` comes from `pebble build` and is kept under the ignored `build/` directory.
