'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var proxyquire = require('proxyquire').noCallThru();
var sinon = require('sinon');
var tap = require('tap');

var ZmqSocket = function() { };
util.inherits(ZmqSocket, EventEmitter);

var zmqStub = {
  socket: sinon.stub()
};

var ZmqProvider = proxyquire('../../../lib/providers/zmq', {
  'zeromq': zmqStub
});

var validOptions = {
  queueName: 'queue',
  hostname: 'test',
  port: 1234
};

tap.beforeEach(function(done) {
  zmqStub.socket = sinon.stub().returns(new ZmqSocket());

  ZmqSocket.prototype.bind = sinon.stub().callsArgWith(1, null);
  ZmqSocket.prototype.send = sinon.stub();
  ZmqSocket.prototype.connect = sinon.stub();
  ZmqSocket.prototype.subscribe = sinon.stub();

  done();
});

tap.test('Throws an error if `emitter` arg is not set', function(t) {
  t.throws(function() { new ZmqProvider(); }, { message: /emitter.+not.+set/i });
  t.end();
});

tap.test('Throws an error if `options` args is not set', function(t) {
  t.throws(function() { new ZmqProvider({}); }, { message: /options.+not.+set/i });
  t.end();
});

tap.test('Throws an error if `options` args is missing `queueName` property', function(t) {
  var providerOptions = {};

  t.throws(function() { new ZmqProvider({}, providerOptions); }, { message: /queueName.+not.+set/i });
  t.end();
});

tap.test('Throws an error if `options` args is missing `hostname` property', function(t) {
  var providerOptions = {
    queueName: 'queue'
  };

  t.throws(function() { new ZmqProvider({}, providerOptions); }, { message: /hostname.+not.+set/i });
  t.end();
});

tap.test('Throws an error if `options` args is missing `port` property', function(t) {
  var providerOptions = {
    queueName: 'queue',
    hostname: 'test'
  };

  t.throws(function() { new ZmqProvider({}, providerOptions); }, { message: /port.+not.+set/i });
  t.end();
});

tap.test('Does not throw an error if args are valid', function(t) {
  sinon.stub(ZmqProvider.prototype, '_initProvider', function() { });
  t.doesNotThrow(function() { new ZmqProvider({}, validOptions); });
  ZmqProvider.prototype._initProvider.restore();
  t.end();
});

tap.test('Creates a sub socket', function(t) {
  var provider = new ZmqProvider(new EventEmitter(), validOptions);

  t.ok(zmqStub.socket.calledWith('sub'));
  t.ok(provider._subSock);
  t.end();
});

tap.test('Creates a pub socket', function(t) {
  var provider = new ZmqProvider(new EventEmitter(), validOptions);

  t.ok(zmqStub.socket.calledWith('pub'));
  t.ok(provider._pubSock);
  t.end();
});

tap.test('Binds to the pub socket', function(t) {
  var provider = new ZmqProvider(new EventEmitter(), validOptions);
  var expectedUrl = 'tcp://' + validOptions.hostname + ':' + validOptions.port;

  // Defer these tests since provider is initialized on next event loop
  setTimeout(function() {
    t.ok(provider._pubSock.bind.called);
    t.equal(provider._pubSock.bind.getCall(0).args[0], expectedUrl);
    t.equal(typeof provider._pubSock.bind.getCall(0).args[1], 'function');
    t.end();
  }, 10);
});

tap.test('Sets emmitter to ready once bound to pub socket', function(t) {
  var emitter = new EventEmitter();
  new ZmqProvider(emitter, validOptions);

  emitter.once('ready', function() {
    t.equal(emitter.isReady, true);
    t.end();
  });
});

tap.test('Emits an error on when error called back from pub socket bind', function(t) {
  var testError = new Error('test error');
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);
  provider._pubSock.bind = sinon.stub().callsArgWith(1, testError);

  emitter.once('error', function(err) {
    t.equal(err, testError);
    t.end();
  });
});

tap.test('Calls socket `send` function with string message', function(t) {
  var message = 'test message';
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);

  provider.publish(message);

  emitter.once('ready', function() {
    setTimeout(function() {
      var expectedMessage = [validOptions.queueName, message];
      t.ok(provider._pubSock.send.called);
      t.same(provider._pubSock.send.getCall(0).args[0], expectedMessage);
      t.end();
    }, 10);
  });
});

tap.test('Calls socket `send` function with JSON string', function(t) {
  var message = { test: 'obj', foo: 'bar' };
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);

  provider.publish(message);

  emitter.once('ready', function() {
    setTimeout(function() {
      var expectedMessage = [validOptions.queueName, JSON.stringify(message)];
      t.ok(provider._pubSock.send.called);
      t.same(provider._pubSock.send.getCall(0).args[0], expectedMessage);
      t.end();
    }, 10);
  });
});

tap.test('Calls socket `send` function with Buffer', function(t) {
  var message = new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);

  provider.publish(message);

  emitter.once('ready', function() {
    setTimeout(function() {
      var expectedMessage = [validOptions.queueName, message.toString('base64')];
      t.ok(provider._pubSock.send.called);
      t.same(provider._pubSock.send.getCall(0).args[0], expectedMessage);
      t.end();
    }, 10);
  });
});

tap.test('Calls publish function when already... "ready"', function(t) {
  var message = 'test message';
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);

  emitter.once('ready', function() {
    provider.publish(message);
    setTimeout(function() {
      var expectedMessage = [validOptions.queueName, message];
      t.ok(provider._pubSock.send.called);
      t.same(provider._pubSock.send.getCall(0).args[0], expectedMessage);
      t.end();
    }, 10);
  });
});

tap.test('Emits an error when socket `send` throws an error', function(t) {
  var message = 'test message';
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);
  var testError = new Error('test error');
  provider._pubSock.send = sinon.stub().throws(testError)
  provider.publish(message);

  emitter.once('error', function(err) {
    t.equal(err, testError);
    t.end();
  });
});

tap.test('Subcribes to the queue', function(t) {
  var expectedUrl = 'tcp://' + validOptions.hostname + ':' + validOptions.port;
  var expectedTopic = validOptions.queueName;
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);
  provider.subscribe();

  emitter.once('ready', function() {
    setTimeout(function() {
      t.ok(provider._subSock.connect.calledWith(expectedUrl));
      t.ok(provider._subSock.subscribe.calledWith(expectedTopic));
      t.end();
    }, 10);
  });
});

tap.test('Emits a string message event after subscribing', function(t) {
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);
  var originalMessage = 'test message';
  provider.subscribe();

  emitter.on('message', function(message) {
    t.equal(message, originalMessage);
    t.end();
  });

  emitter.once('ready', function() {
    setTimeout(function() {
      provider._subSock.emit('message', originalMessage);
    }, 20);
  });
});

tap.test('Emits an object message event after subscribing', function(t) {
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);
  var originalMessage = { test: 'test', foo: 'bar' };
  provider.subscribe();

  emitter.on('message', function(message) {
    t.same(message, originalMessage);
    t.end();
  });

  emitter.once('ready', function() {
    setTimeout(function() {
      provider._subSock.emit('message', JSON.stringify(originalMessage));
    }, 20);
  });
});

tap.test('Emits a Buffer message event after subscribing', function(t) {
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);
  var originalMessage = new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  provider.subscribe();

  emitter.on('message', function(message) {
    t.same(message, originalMessage);
    t.end();
  });

  emitter.once('ready', function() {
    setTimeout(function() {
      provider._subSock.emit('message', originalMessage.toString('base64'));
    }, 20);
  });
});

tap.test('Subcribes to the queue when already... "ready"', function(t) {
  var expectedUrl = 'tcp://' + validOptions.hostname + ':' + validOptions.port;
  var expectedTopic = validOptions.queueName;
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);

  emitter.once('ready', function() {
    provider.subscribe();
    setTimeout(function() {
      t.ok(provider._subSock.connect.calledWith(expectedUrl));
      t.ok(provider._subSock.subscribe.calledWith(expectedTopic));
      t.end();
    }, 10);
  });
});

tap.test('Unsubscribing removes all sub socket "message" event listeners', function(t) {
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);

  emitter.once('ready', function() {
    provider._subSock.on('removeListener', function() {
      t.equal(provider._subSock.listeners('message').length, 0);
      t.ok(provider._isClosed);
      t.end();
    });

    provider.subscribe();
    setTimeout(function() {
      provider.unsubscribe();
    }, 10);
  });
});

tap.test('Unsubscribing when queue provider is "closed" is ignored', function(t) {
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);
  var removeCount = 0;

  emitter.once('ready', function() {
    provider._subSock.on('removeListener', function() {
      removeCount++;
    });

    provider.subscribe();
    setTimeout(function() {
      provider.unsubscribe();
      provider.unsubscribe();
      setTimeout(function() {
        t.equal(removeCount, 1);
        t.end();
      }, 10);
    }, 10);
  });
});

tap.test('Unsubscribing removes all sub socket "message" event listeners', function(t) {
  var emitter = new EventEmitter();
  var provider = new ZmqProvider(emitter, validOptions);

  emitter.once('ready', function() {
    provider._subSock.on('removeListener', function() {
      t.equal(provider._subSock.listeners('message').length, 0);
      t.ok(provider._isClosed);
      t.end();
    });

    provider.subscribe();
    setTimeout(function() {
      provider.unsubscribe();
    }, 10);
  });
});