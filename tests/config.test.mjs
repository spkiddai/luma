import test from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import { DEFAULT_PROFILE, normalizeConfig, parseConfig, validMode, validPort } from '../electron/config.mjs';

test('runtime configuration overrides imported network listeners and controller credentials', () => {
  const imported = `${DEFAULT_PROFILE}\nexternal-controller: 0.0.0.0:9090\nexternal-controller-unix: /tmp/public.sock\nexternal-controller-pipe: public\nexternal-controller-tls: 0.0.0.0:9443\nexternal-ui-url: https://example.com\nallow-lan: true\nport: 8888\nsocks-port: 8889\nredir-port: 8900\ntproxy-port: 8901\nlisteners: [{name: unsafe, port: 9091, type: http, listen: 0.0.0.0}]\ntun: {enable: true}\ndns: {enable: true, listen: '0.0.0.0:53'}\n`;
  const runtime = YAML.parse(normalizeConfig(imported, { port: 7897, controllerPort: 42000, secret: 'test-secret', mode: 'rule' }));
  assert.equal(runtime['external-controller'], '127.0.0.1:42000');
  assert.equal(runtime.secret, 'test-secret'); assert.equal(runtime['allow-lan'], false);
  assert.equal(runtime['bind-address'], '127.0.0.1'); assert.equal(runtime.tun.enable, false);
  for (const key of ['listeners','external-controller-unix','external-controller-tls','external-controller-pipe','external-ui-url','port','socks-port','redir-port','tproxy-port']) assert.equal(runtime[key], undefined);
  assert.equal(runtime.dns.listen, undefined);
});
test('configuration parsing rejects duplicate keys, primitive documents and non-config subscriptions', () => {
  for (const content of ['mode: rule\nmode: global', 'hello', '[1,2,3]', 'c3M6Ly9hYmNk', 'name: no-proxies']) assert.throws(() => parseConfig(content));
  assert.throws(() => parseConfig('x'.repeat(8 * 1024 * 1024 + 1)), /8 MB/);
  assert.deepEqual(parseConfig('proxies: []'), { proxies: [] });
});
test('ports and modes reject invalid values before OS or core operations', () => {
  for (const port of [0, 80, 65536, 7897.5, '7897', NaN]) assert.throws(() => validPort(port));
  assert.equal(validPort(7897), 7897);
  assert.throws(() => validMode('invalid')); assert.equal(validMode('global'), 'global');
});

test('LAN access follows Desk settings and keeps the controller on loopback', () => {
  const runtime = YAML.parse(normalizeConfig(DEFAULT_PROFILE, { port: 17890, controllerPort: 42000, secret: 'test', mode: 'rule', allowLan: true }));
  assert.equal(runtime['allow-lan'], true); assert.equal(runtime['bind-address'], '*');
  assert.equal(runtime['external-controller'], '127.0.0.1:42000');
  assert.ok(runtime['lan-allowed-ips'].includes('192.168.0.0/16'));
  assert.ok(!runtime['lan-allowed-ips'].includes('0.0.0.0/0'));
});

test('concurrent dialing defaults on and preserves explicit subscription settings and DNS', () => {
  const options = { port: 17890, controllerPort: 42000, secret: 'test', mode: 'rule' };
  assert.equal(YAML.parse(normalizeConfig(DEFAULT_PROFILE, options))['tcp-concurrent'], true);
  const content = `${DEFAULT_PROFILE}\ntcp-concurrent: false\ndns:\n  enable: true\n  nameserver: [https://example.com/dns-query]\n`;
  const custom = YAML.parse(normalizeConfig(content, options));
  assert.equal(custom['tcp-concurrent'], false);
  assert.deepEqual(custom.dns.nameserver, ['https://example.com/dns-query']);
});
