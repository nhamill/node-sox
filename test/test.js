var sox = require('../')
	, stream = require('stream')
  , fs = require('fs')
  , assert = require('assert')
  , path = require('path')
  , mkdirp = require('mkdirp')
  , rimraf = require('rimraf')
  , soundWav = path.join(__dirname, 'sound.wav')
  , soundMp3 = path.join(__dirname, 'sound.mp3')
  , tmpDir = path.join(__dirname, 'tmp')
  , outputWav = path.join(tmpDir, 'output.wav')
  , outputMp3 = path.join(tmpDir, 'output.mp3')

describe("sox", function () {
  describe("identify", function () {
    it("stream", function(done) {
			var soundWavStream = fs.createReadStream(path.join(__dirname, 'sound.wav'), { flags: 'r'})
      sox.identify(soundWavStream, function (err, results) {
        if (err) return done(err);
        assert.deepEqual(results, {
          bitRate: 0,
          format: 'wav',
          duration: 1.5,
          sampleCount: 66150,
          channelCount: 1,
          sampleRate: 44100,
        });
        done();
      });
    });
    it("wav", function(done) {
      sox.identify(soundWav, function (err, results) {
        if (err) return done(err);
        assert.deepEqual(results, {
          format: 'wav',
          duration: 1.5,
          sampleCount: 66150,
          channelCount: 1,
          bitRate: 722944,
          sampleRate: 44100,
        });
        done();
      });
    });
    it("mp3", function(done) {
      sox.identify(path.join(__dirname, 'sound.mp3'), function (err, results) {
        if (err) return done(err);
        assert.deepEqual(results, {
          format: 'mp3',
          duration: 1.070998,
          sampleCount: 47231,
          channelCount: 1,
          bitRate: 132096,
          sampleRate: 44100,
        });
        done();
      });
    });
  });
  describe("transcode", function() {
    it("creating test directory", function(done) {
      mkdirp(tmpDir, done);
    });
    it("stream(wav) -> stream(wav)", function(done) {
			var write_stream = new stream.PassThrough;
			var soundWavStream = fs.createReadStream(path.join(__dirname, 'sound.wav'), { flags: 'r'})
      var transcode = sox.transcode(soundWavStream, write_stream, {format: 'wav'});
      transcode.on('error', function(err) {
        console.dir(err);
        done(err);
      });
      var progress = 0;
      var progressEventCount = 0;
      transcode.on('progress', function(amountDone, amountTotal) {
        var newProgress = amountDone / amountTotal;
        progressEventCount += 1;
        assert(newProgress >= progress);
        progress = newProgress;
      });
      var gotSrc = false;
      transcode.on('src', function(info) {
        gotSrc = true;
        assert.deepEqual(info, {
          format: 'wav',
          duration: 1.5,
          sampleCount: 66150,
          channelCount: 1,
          bitRate: 0,
          sampleRate: 44100,
        });
      });
      var gotDest = false;
      transcode.on('dest', function(info) {
        gotDest = true;
        assert.deepEqual(info, {
          sampleRate: 44100,
          format: 'wav',
          channelCount: 2,
          sampleCount: 66150,
          duration: 1.5,
          bitRate: 0,
        });
      });
      transcode.on('end', function() {
        assert(gotSrc);
        assert(gotDest);
        assert.strictEqual(progress, 1);
        assert(progressEventCount >= 3, "expected at lesat 3 progress events. got: " + progressEventCount);
        done();
      });
      transcode.start();
    });
    it("file(wav) -> stream(wav)", function(done) {
			var write_stream = new stream.Writable;
			write_stream.buffer = new Buffer(0);
			write_stream._write = function(chunk, enc, next) {
				this.buffer = Buffer.concat([this.buffer, chunk]);
				next();
			};
      var transcode = sox.transcode(path.join(__dirname, 'sound.wav'), write_stream, {format: 'wav'});
      transcode.on('error', function(err) {
        console.dir(err);
        done(err);
      });
      var progress = 0;
      var progressEventCount = 0;
      transcode.on('progress', function(amountDone, amountTotal) {
        var newProgress = amountDone / amountTotal;
        progressEventCount += 1;
        assert(newProgress >= progress);
        progress = newProgress;
      });
      var gotSrc = false;
      transcode.on('src', function(info) {
        gotSrc = true;
        assert.deepEqual(info, {
          format: 'wav',
          duration: 1.5,
          sampleCount: 66150,
          channelCount: 1,
          bitRate: 722944,
          sampleRate: 44100,
        });
      });
      var gotDest = false;
      transcode.on('dest', function(info) {
        gotDest = true;
        assert.deepEqual(info, {
          sampleRate: 44100,
          format: 'wav',
          channelCount: 2,
          sampleCount: 66150,
          duration: 1.5,
          bitRate: 0,
        });
      });
      transcode.on('end', function() {
        assert(gotSrc);
        assert(gotDest);
        assert.strictEqual(progress, 1);
        assert(progressEventCount >= 3, "expected at lesat 3 progress events. got: " + progressEventCount);
        done();
      });
      transcode.start();
    });
    it("stream(wav) -> file(wav)", function(done) {
			var soundWavStream = fs.createReadStream(path.join(__dirname, 'sound.wav'), { flags: 'r'})
      var transcode = sox.transcode(soundWavStream, outputWav, {format: 'wav'});
      transcode.on('error', function(err) {
        console.dir(err);
        done(err);
      });
      var progress = 0;
      var progressEventCount = 0;
      transcode.on('progress', function(amountDone, amountTotal) {
        var newProgress = amountDone / amountTotal;
        progressEventCount += 1;
        assert(newProgress >= progress);
        progress = newProgress;
      });
      var gotSrc = false;
      transcode.on('src', function(info) {
        gotSrc = true;
        assert.deepEqual(info, {
          format: 'wav',
          duration: 1.5,
          sampleCount: 66150,
          channelCount: 1,
          bitRate: 0,
          sampleRate: 44100,
        });
      });
      var gotDest = false;
      transcode.on('dest', function(info) {
        gotDest = true;
        assert.deepEqual(info, {
          sampleRate: 44100,
          format: 'wav',
          channelCount: 2,
          sampleCount: 66150,
          duration: 1.5,
          bitRate: 1048576,
        });
      });
      transcode.on('end', function() {
        assert(gotSrc);
        assert(gotDest);
        assert.strictEqual(progress, 1);
        assert(progressEventCount >= 3, "expected at lesat 3 progress events. got: " + progressEventCount);
        done();
      });
      transcode.start();
    });
    it("wav -> mp3", function(done) {
      var transcode = sox.transcode(soundWav, outputMp3);
      transcode.on('error', function(err) {
        console.dir(err);
        done(err);
      });
      var progress = 0;
      var progressEventCount = 0;
      transcode.on('progress', function(amountDone, amountTotal) {
        var newProgress = amountDone / amountTotal;
        progressEventCount += 1;
        assert(newProgress >= progress);
        progress = newProgress;
      });
      var gotSrc = false;
      transcode.on('src', function(info) {
        gotSrc = true;
        assert.deepEqual(info, {
          format: 'wav',
          duration: 1.5,
          sampleCount: 66150,
          channelCount: 1,
          bitRate: 722944,
          sampleRate: 44100,
        });
      });
      var gotDest = false;
      transcode.on('dest', function(info) {
        gotDest = true;
        assert.deepEqual(info, {
          sampleRate: 44100,
          format: 'mp3',
          channelCount: 2,
          sampleCount: 67958,
          duration: 1.540998,
          bitRate: 196608,
        });
      });
      transcode.on('end', function() {
        assert(gotSrc);
        assert(gotDest);
        assert.strictEqual(progress, 1);
        assert(progressEventCount >= 3, "expected at lesat 3 progress events. got: " + progressEventCount);
        done();
      });
      transcode.start();
    });
    it("removing tmp dir", function(done) {
      rimraf(tmpDir, done);
    });
  });
});
