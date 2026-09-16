// Karma configuration.
//
// The only reason this file exists is memory. Angular's built-in default
// launches ChromeHeadless with its normal multi-process architecture, which on
// the 3.8GB VPS (no swap) spawned fifteen processes, starved the machine to
// ~30MB free, and stalled the run partway through — Karma reported
// "Disconnected, because no message in 30000 ms", which reads like a test
// failure and is not one.
//
// `ChromeHeadlessLowMem` keeps Chrome to a single renderer and off /dev/shm.
// Use it wherever RAM is tight:
//
//   npx ng test --watch=false --browsers=ChromeHeadlessLowMem
//
// On a roomy machine the ordinary ChromeHeadless is still there and faster.
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      jasmine: {},
      clearContext: false,
    },
    jasmineHtmlReporter: {suppressAll: true},
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/kidraw'),
      subdir: '.',
      reporters: [{type: 'html'}, {type: 'text-summary'}],
    },
    reporters: ['progress', 'kjhtml'],
    browsers: ['ChromeHeadless'],
    customLaunchers: {
      ChromeHeadlessLowMem: {
        base: 'ChromeHeadless',
        flags: [
          // One renderer instead of one per tab/origin: the single biggest saving.
          '--renderer-process-limit=1',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--no-sandbox',
          '--js-flags=--max-old-space-size=512',
        ],
      },
    },
    // A starved machine can be slow rather than broken; give it room to be slow
    // before calling the browser dead.
    browserNoActivityTimeout: 120000,
    browserDisconnectTimeout: 30000,
    browserDisconnectTolerance: 2,
    restartOnFileChange: true,
  });
};
