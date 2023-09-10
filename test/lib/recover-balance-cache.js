'use strict';
const NodeCache = require('node-cache');
const sinon = require('sinon');
const chai = require('chai');
chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));
const expect = chai.expect;
const fs = require('fs');
const timers = {
  sleep: require('util').promisify(require('timers').setTimeout),
};
const bn128 = require('@anonymous-zether/anonymous.js/src/utils/bn128.js');

describe('recover-balance-test.js', () => {
  let RecoverBalanceCache, recoverBalanceCache, nodeCache;
  before(async () => {
    process.env.KALEIDO_DATA_DIR = '/qdata/tmpDir';
    RecoverBalanceCache = require('../../lib/recover-balance-cache.js');
    nodeCache = new NodeCache({ stdTTL: 3, checkperiod: 1, useClones: false, maxKeys: 15, deleteOnExpire: true });
    recoverBalanceCache = new RecoverBalanceCache(10);
    recoverBalanceCache.init(nodeCache);
    let readStreamObj = await fs.createReadStream('test/resources/test-balance-cache.csv');
    let noHeadersStreamObj = await fs.createReadStream('test/resources/test-balance-cache-no-headers.csv');
    let corrruptedEntriesObj = await fs.createReadStream('test/resources/test-balance-cache-corrupted.csv');
    sinon.stub(RecoverBalanceCache.fs, 'createReadStream').onCall(0).resolves(readStreamObj).onCall(1).rejects().onCall(2).resolves(noHeadersStreamObj).onCall(3).resolves(corrruptedEntriesObj);
  });
  beforeEach(async () => {
    await recoverBalanceCache.flush();
  });
  it('populateBalanceRange populates cache with range of values', async () => {
    await recoverBalanceCache.populateBalanceRange(100, 10);
    let stats = recoverBalanceCache.getStats();
    expect(stats.keys).to.be.equal(10);
  });
  it('populateBalanceRange attempts to populates cache with more than maxKey pairs', async () => {
    await recoverBalanceCache.populateBalanceRange(0, 40);
    let stats = recoverBalanceCache.getStats();
    expect(stats.keys).to.be.equal(10);
  });
  it('delBalanceRange deletes cache with range of values', async () => {
    await recoverBalanceCache.populateBalanceRange(100, 5);
    let stats = recoverBalanceCache.getStats();
    expect(stats.keys).to.be.equal(5);
    await recoverBalanceCache.delBalanceRange(100, 10);
    stats = recoverBalanceCache.getStats();
    expect(stats.keys).to.be.equal(0);
  });
  it('get hits cached value', async () => {
    await recoverBalanceCache.populateBalanceRange(100, 10);
    let key = bn128.curve.g.mul(105);
    let value = await recoverBalanceCache.get(key, function () {
      return Promise.resolve(105);
    });
    expect(value).to.be.equal(105);
    let stats = recoverBalanceCache.getStats();
    expect(stats.hits).to.be.equal(1);
    expect(stats.keys).to.be.equal(10);
  });
  it('get misses', async () => {
    let key = bn128.curve.g.mul(105);
    let value = await recoverBalanceCache.get(key, function () {
      return Promise.resolve(105);
    });
    expect(value).to.be.equal(105);
    let stats = recoverBalanceCache.getStats();
    expect(stats.hits).to.be.equal(0);
    expect(stats.misses).to.be.equal(1);
    expect(stats.keys).to.be.equal(1);
  });
  it('populateCacheFromFile populates cache using a csv file', async () => {
    await recoverBalanceCache.populateCacheFromFile('balance-cache.csv');
    let stats = recoverBalanceCache.getStats();
    expect(stats.keys).to.be.equal(10);
  });
  it('populateCacheFromFile error handling', async () => {
    // no file
    await expect(recoverBalanceCache.populateCacheFromFile('balance-cache.csv')).to.be.eventually.rejectedWith('Cache file not found.');
    // no headers
    await expect(recoverBalanceCache.populateCacheFromFile('balance-cache.csv')).to.be.eventually.rejectedWith('File is not well formed.');
    // corrruptedEntries, 1 entry is corrupted
    await recoverBalanceCache.populateCacheFromFile('balance-cache.csv');
    let stats = recoverBalanceCache.getStats();
    expect(stats.keys).to.be.equal(9);
  });
  it('Make sure entries are deleted on expiry if deleteOnExpire is true', async () => {
    await recoverBalanceCache.populateBalanceRange(100, 5);
    await timers.sleep(4500);
    let stats = recoverBalanceCache.getStats();
    expect(stats.keys).to.be.equal(0);
  }).timeout(5000);

  it('Make sure entries are not deleted on expiry if deleteOnExpire is false', async () => {
    nodeCache = new NodeCache({ stdTTL: 2, checkperiod: 1, useClones: false, maxKeys: 15, deleteOnExpire: false });
    recoverBalanceCache = new RecoverBalanceCache(15);
    recoverBalanceCache.init(nodeCache);
    await recoverBalanceCache.populateBalanceRange(100, 15);
    // check if you are able to access keys
    let key = bn128.curve.g.mul(105);
    await timers.sleep(2000);
    let stats = recoverBalanceCache.getStats();
    expect(stats.keys).to.be.equal(15);
    let value = await recoverBalanceCache.get(key, function () {
      return Promise.resolve(101);
    });
    expect(value).to.be.equal(105);
  }).timeout(3500);
});
