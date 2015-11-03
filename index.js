var childProcess = require('child_process')
	, buffer = require('buffer')
	, streamifier = require('streamifier')
	, fs = require('fs')
	, EventEmitter = require('events').EventEmitter
	, Batch = require('batch')
	, util = require('util')

exports.identify = identify;
exports.transcode = transcode;

var SENTINEL = /[\n\r]/

// to edit this see https://gist.github.com/4142076
var PROGRESS_TIME_REGEX = /^In:([\d.]+)%\s+(\d\d):(\d\d):([\d.]+)\s+\[(\d\d):(\d\d):([\d.]+)\]\s+Out:([\d.\w]+)\s+\[[\s|\-!=]+\]\s+(?:Hd:([\d.]+))?\s+Clip:(\d+)\s*$/;

var conversions = {
  sampleRate: int,
  sampleCount: int,
  channelCount: int,
  duration: float,
  bitRate: parseBitRate,
}
var suffixMultiplier = {
  'k': 1024,
  'm': 1024 * 1024,
  'g': 1024 * 1024 * 1024,
};
function parseBitRate(str) {
  var mult = suffixMultiplier[str[str.length - 1].toLowerCase()];
  var n = parseInt(str, 10);
  return mult ? mult * n : n;
}


function int(it){
  return parseInt(it, 10);
}

function float(it){
  return parseFloat(it, 10);
}

function identify(input, callback){
  var results = {}
    , batch = new Batch()
	batch.concurrency(1);
	var input_source = input;
	var input_buffer = new Buffer(0);
	var input_stream = null;
	if ('string' != typeof(input)) {
		input_stream = input;
		input_source = '-';
	}
  soxInfo('-t', function(value) { results.format        = value; });
  soxInfo('-r', function(value) { results.sampleRate    = value; });
  soxInfo('-c', function(value) { results.channelCount  = value; });
  soxInfo('-s', function(value) { results.sampleCount   = value; });
  soxInfo('-D', function(value) { results.duration      = value; });
  soxInfo('-B', function(value) { results.bitRate       = value; });

  batch.end(function(err) {
    if (err) return callback(err);
    for (var k in conversions) {
      results[k] = conversions[k](results[k])
    }
    callback(null, results, input);
  });

  function soxInfo(arg, assign) {
    batch.push(function(cb) {
      capture('sox', ['--info', arg, input_source], function(err, value) {
        if (err) return cb(err);
        assign(value);
        cb();
      });
    });
  }

	function capture(exe, args, callback){
		var child = childProcess.spawn(exe, args);
		var stdout_str = '';
		child.on('error', function(err){
			err.stdout = child.stdout;
			err.stderr = child.stderr;
			err.args = args;
			callback(err);
		});
		child.stdin.on('error', function(error){
			//required since the stdin might close early
			//and without this handler the error escalates
			//sox only seems to need to read the header of a file for determining info
		});
		var perform_unshift = false;
		var whole_input_stream_read = false;
		if (input_stream && 0 == input_buffer.length) {
			perform_unshift = true;
		}
		child.on('close', function(code){
			if (perform_unshift) {
				if (whole_input_stream_read) {
					//the whole stream was read so don't try to unshift or it'll fail
					//instead, just recreate the whole input stream
					input = new streamifier.createReadStream;
					input.push(input_buffer);
				} else {
					input_stream.unshift(input_buffer);
				}
			}
			callback(null, stdout_str.trim());
		});

		child.stdout.on('data', function(data){
			stdout_str += data;
		});

		if (input_stream) {
			input_stream.on('end', function(){
				whole_input_stream_read = true;
			});
			input_stream.on('data', function(data){
				input_buffer = Buffer.concat([input_buffer, data]);
			});
			if (input_buffer.length > 0) {
				child.stdin.write(input_buffer);
			} else {
				input_stream.pipe(child.stdin);
			}
		}
	}
}

function transcode(inputFile, outputFile, options) {
  return new Transcode(inputFile, outputFile, options);
}

function Transcode(inputFile, outputFile, options) {
  EventEmitter.call(this);
  this.inputFile = inputFile;
  this.outputFile = outputFile;
  this.options = options;

  // defaults
  this.options = this.options || {};
  this.options.sampleRate = this.options.sampleRate || 44100;
  this.options.format = this.options.format || 'mp3';
  this.options.channelCount = this.options.channelCount || 2;
  this.options.bitRate = this.options.bitRate ? parseInt(this.options.bitRate, 10) : 192 * 1024;
  if (this.options.format === 'mp3') {
    this.options.compressionQuality = this.options.compressionQuality || 5;
  }
}

util.inherits(Transcode, EventEmitter);

Transcode.prototype.start = function() {
  var self = this;
  identify(self.input, function(err, src, input_stream) {
		if ('string' != typeof(self.input)) {
			self.input = input_stream;
		}

    if (err) {
      self.emit('error', err);
      return
    }

    self.emit('src', src);

    var args = [
      '--guard',
      '--magic',
      '--show-progress',
      self.inputFile,
      '-r', self.options.sampleRate,
      '-t', self.options.format,
      '-C', Math.round(self.options.bitRate / 1024) +
            self.options.compressionQuality,
      '-c', self.options.channelCount,
      self.outputFile
    ];
    var bin = childProcess.spawn('sox', args);
    var stdout = "";
    bin.stdout.setEncoding('utf8');
    bin.stdout.on('data', function(data) {
      stdout += data;
    });
    var stderr = "";
    var buffer = "";
    bin.stderr.setEncoding('utf8');
    bin.stderr.on('data', function(data) {
      stderr += data;
      buffer += data;
      var lines = buffer.split(SENTINEL);
      buffer = lines.pop();
      lines.forEach(function(line) {
        var m = line.match(PROGRESS_TIME_REGEX);
        if (!m) return;
        var hour = parseInt(m[2], 10)
        var min = parseInt(m[3], 10)
        var sec = parseInt(m[4], 10)
        var encodedTime = sec + min * 60 + hour * 60 * 60;
        // might have to correct duration now that we've scanned the file
        if (encodedTime > src.duration) {
          src.duration = encodedTime;
          self.emit('src', src);
        }
        self.emit('progress', encodedTime, src.duration);
      });
    });
    bin.on('close', function(code) {
      if (code) {
        var err = new Error("sox returned nonzero exit code: " + code);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        err.args = args;
        self.emit('error', err);
      } else {
				var output = self.output;
				if ('string' != typeof(output)) {
					output = new streamifier.createReadStream();
					output.push(stdout);
				}
        identify(output, function(err, dest) {
          if (err) {
            self.emit('error', err);
          } else {
            self.emit('dest', dest);
            self.emit('progress', src.duration, src.duration);
            self.emit('end');
          }
        });
      }
    });
  });
};
