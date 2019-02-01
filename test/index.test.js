'use strict';

const expect = require('expect.js');
const lib = require('../lib');

describe('`index`', () => {
  it('returns the module', () => {
    expect(lib).to.be.ok();
  });
});
