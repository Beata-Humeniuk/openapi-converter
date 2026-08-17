function noNetwork() {
  throw new Error('Network access is disabled in this extension (no-network build).');
}
module.exports = noNetwork;
module.exports.default = noNetwork;
module.exports.Headers = function () {};
module.exports.Request = function () {};
module.exports.Response = function () {};
