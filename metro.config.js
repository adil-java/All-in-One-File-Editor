// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// pdf-lib depends on tslib 1.x, whose "import" export (modules/index.js) default-imports
// a CommonJS file. Under Metro that default is undefined, crashing with
// "Cannot destructure property '__extends' of 'tslib.default'". Use tslib's
// real ES module build instead.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const result = (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
  if (
    moduleName === 'tslib' &&
    result.type === 'sourceFile' &&
    result.filePath.endsWith('/tslib/modules/index.js')
  ) {
    return { ...result, filePath: result.filePath.replace(/modules\/index\.js$/, 'tslib.es6.js') };
  }
  return result;
};

module.exports = config;
