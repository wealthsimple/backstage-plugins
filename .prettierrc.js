const baseConfig = require('@spotify/prettier-config');

module.exports = {
  ...baseConfig,
  ...{
    proseWrap: 'always',
  },
};
