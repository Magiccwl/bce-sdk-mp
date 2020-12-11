
// Jest will set process.env.NODE_ENV to 'test' if it's not set to something else.
const isTest = process.env.NODE_ENV === 'test';

const babelPresetEnvOptions = {
    useBuiltIns: false,
    loose: true,
    targets: '> 0.25%, not dead',
};

if (isTest) {
    babelPresetEnvOptions.targets = {node: 'current'};
}

module.exports = {
    presets: [
        ['@babel/preset-env', babelPresetEnvOptions]
    ]
};
